# Supabase — backend de NoteFlow (fases 4.x: cuenta, IA gestionada, nube E2EE)

Instrucciones para el **operador** (el dueño del proyecto Supabase). El código cliente ya está
implementado (`electron/account.ts` + panel Account en Settings) y queda **inerte** hasta que
`electron/cloudConfig.ts` tenga la URL y la anon key reales.

## 1. Crear el proyecto

1. Entrar en [supabase.com](https://supabase.com) y crear un proyecto nuevo (plan Free vale para
   empezar; región europea recomendada).
2. Guardar la **database password** en un sitio seguro (no la necesita la app, solo el operador).

## 2. Correr la migración

Opción A — **SQL Editor** (dashboard):

1. Dashboard → SQL Editor → New query.
2. Pegar el contenido de `supabase/migrations/0001_foundation.sql` y ejecutar.

Opción B — **Supabase CLI**:

```bash
supabase link --project-ref <project-ref>
supabase db push   # aplica supabase/migrations/*.sql
```

## 3. Configurar Auth (email + OTP de 6 dígitos)

1. Dashboard → **Authentication → Sign In / Providers**: habilitar el provider **Email**.
   - "Confirm email" puede quedar en el default; el flujo OTP verifica el email por sí mismo.
2. **SMTP propio — OBLIGATORIO, no solo para producción.** Con el SMTP integrado de Supabase
   **no se pueden editar las plantillas de email** (ni asunto ni cuerpo) y la plantilla por
   defecto de "Magic Link" solo manda el enlace (`{{ .ConfirmationURL }}`), nunca el código de
   6 dígitos. Como el login de NoteFlow es **sin deep links** (el usuario teclea el código, no
   abre un enlace), sin SMTP propio el flujo de login **no funciona ni en desarrollo**.

   El proveedor es **[Resend](https://resend.com)**.

   **Verificar un dominio propio — imprescindible para tener usuarios reales.** Sin dominio
   verificado, Resend presta su `resend.dev` en modo **sandbox**: solo deja enviar a la dirección
   del titular de la cuenta. Sirve para probar el login con tu propio email, pero **cualquier otro
   destinatario recibe un rechazo**, así que el registro de usuarios no funciona hasta verificar.

   1. Resend → **Domains → Add Domain**. Usar un **subdominio** de envío
      (hoy `noteflow.yagoid.es`), no el dominio raíz: aísla la reputación de envío y deja el raíz
      libre para correo personal. La **región no se puede cambiar** después sin rehacer el
      dominio — `eu-west-1` (Ireland) para usuarios europeos.
   2. Crear en el DNS los registros que muestra Resend: un **MX** para los bounces, un **TXT** con
      el SPF y un **TXT** con la clave DKIM (más un `_dmarc` opcional). Si el proveedor de DNS
      soporta la **autorización automática** que ofrece Resend (Cloudflare entre otros), es la vía
      recomendada: evita los dos fallos típicos de hacerlo a mano — repetir el dominio en el campo
      "Name" (`send.sub.dominio.es.dominio.es`) y dejar un CNAME proxied (en Cloudflare, nube
      naranja) que hace que la verificación no pase nunca.
   3. Verificar en Resend (con Cloudflare suele tardar minutos, no horas).
   4. Resend → **API Keys** → crear una con permiso **Sending access** y restringida al dominio,
      en vez de una de acceso total.
   5. Dashboard de Supabase → Authentication → sección **SMTP Settings** ("Set up custom SMTP"):
      - Host: `smtp.resend.com`
      - Port: `465` (SSL) o `587` (TLS)
      - Username: `resend`
      - Password: la API key de Resend
      - Sender email: una dirección del dominio verificado (hoy `noreply@noteflow.yagoid.es`)
      - Sender name: `NoteFlow`
   6. Guardar y **probar con un email que no sea el del titular de la cuenta de Resend**: es el
      único test que demuestra que el sandbox ya no aplica.

   > **Cuota:** el tier gratuito de Resend son **100 correos/día y 3.000/mes**, y **cada intento
   > de login gasta uno**. Al agotarse, los OTP dejan de salir y el login se cae sin más señal que
   > un `sendFailed` — vigilar el consumo según crezca la base de usuarios.

3. Dashboard → **Authentication → Emails** → editar **DOS plantillas**: **"Confirm signup"** y
   **"Magic Link"**. Con "Confirm email" activado (el default), el primer OTP de una cuenta
   **nueva** sale por la plantilla "Confirm signup" — no por "Magic Link", que solo se usa para
   usuarios ya confirmados. Si solo se edita "Magic Link", los usuarios nuevos reciben el correo
   de confirmación con enlace en vez del código. Ahora que hay SMTP propio, el editor se
   desbloquea; poner en **ambas** el mismo cuerpo:

   ```html
   <h2>Your NoteFlow sign-in code</h2>
   <p>Enter this code in NoteFlow to sign in:</p>
   <h1>{{ .Token }}</h1>
   <p>This code expires in 1 hour. If you didn't request it, you can ignore this email.</p>
   ```

   La clave es usar `{{ .Token }}` (el código de 6 dígitos) en lugar de `{{ .ConfirmationURL }}`.
   La app llama a `POST /auth/v1/otp` con `create_user: true` y verifica con `type: 'email'`
   (acepta tanto el token de signup como el de login), así que el registro y el login comparten
   flujo y ambas plantillas deben mandar el código.

## 4. Conectar la app

1. Dashboard → **Settings → Data API**: copiar la **Project URL** y la **anon (public) key**.
2. Pegarlas en `electron/cloudConfig.ts` (`SUPABASE_URL` sin slash final, `SUPABASE_ANON_KEY`).
3. `npm run build` y listo: el panel Settings → Account pasa de "not available in this build"
   al flujo real de sign-in.

> **Nota de seguridad:** la anon key es **pública por diseño** (mismo modelo que el client ID de
> GitHub que ya va embebido para el Device Flow del sync). No da acceso a nada por sí sola: la
> seguridad la dan las **RLS policies** (cada usuario solo lee sus filas) y los JWT de Auth.
> Lo que NUNCA debe salir del dashboard es la **service role key**.

## 5. Lemon Squeezy (pagos)

Lemon Squeezy es el **Merchant of Record**: cobra, gestiona el IVA por país y notifica los cambios
de suscripción por webhook. La Edge Function `supabase/functions/billing-webhook` recibe esos
webhooks, verifica la firma HMAC y escribe en `public.subscriptions` vía la RPC
`apply_subscription_event` (migración 0002). Pasos del operador:

1. **Crear la store y los productos** en [lemonsqueezy.com](https://www.lemonsqueezy.com):
   un producto por plan (AI / Cloud / Bundle, según lo que se lance) con **variantes mensual y
   anual**. Anotar el **variant ID** de cada variante (visible en la URL o en la API de cada
   variante): harán falta para el variant map.

2. **Correr la migración 0002** (`supabase/migrations/0002_billing.sql`), igual que la 0001
   (SQL Editor o `supabase db push`). Crea el índice único `(provider, provider_ref)` y la función
   `apply_subscription_event` (solo invocable por el service role).

3. **Configurar los secretos** de la Edge Function:

   ```bash
   supabase secrets set LEMONSQUEEZY_WEBHOOK_SECRET=<signing-secret> \
     LEMONSQUEEZY_VARIANT_MAP=890123:ai,890124:cloud,890125:bundle
   ```

   El variant map mapea cada variant ID de LS a nuestro `product` (`ai` | `cloud` | `bundle`);
   deben entrar **todas** las variantes (mensual y anual). Un evento con una variante que no esté
   en el mapa se ignora (respuesta 200 + `console.warn` en los logs de la función).

   > **En producción, solo variantes de live mode.** Los webhooks de test y de live comparten
   > signing secret, así que el map es lo único que separa ambos modos: con IDs de test dentro,
   > cualquiera podría pagar el checkout de test con la tarjeta de prueba de LS y obtener una
   > entitlement real. Al pasar a live, quita los IDs de test y expira o borra las filas de test
   > que sigan `active` en `public.subscriptions`, porque sus eventos ya no se procesarán y no
   > expirarían nunca.

4. **Desplegar la función** — el flag es imprescindible, porque el webhook de LS llega **sin JWT
   de Supabase** (su autenticación es la firma HMAC):

   ```bash
   supabase functions deploy billing-webhook --no-verify-jwt
   ```

5. **Dar de alta el webhook en LS**: dashboard → **Settings → Webhooks** → Add endpoint:
   - URL: `https://<project-ref>.supabase.co/functions/v1/billing-webhook`
   - Signing secret: el mismo valor que `LEMONSQUEEZY_WEBHOOK_SECRET`
   - Eventos: suscribir los `subscription_*` (`subscription_created`, `subscription_updated`,
     `subscription_cancelled`, `subscription_resumed`, `subscription_expired`,
     `subscription_paused`, `subscription_unpaused`). Los `subscription_payment_*` y `order_*`
     pueden suscribirse o no: la función los ignora (responde 200).

> **Correlación compra ↔ usuario:** la app abre el checkout con
> `checkout[custom][user_id]=<uuid del usuario de Supabase>` (handler `account:open-checkout`,
> implementado en la fase 4.1). Las compras SIN ese dato no se pueden atribuir a ninguna cuenta:
> el webhook las loguea (`console.warn`) y **no inserta** fila nueva (solo actualizaría una
> suscripción ya existente).

## 6. NoteFlow AI (proxy LLM)

La Edge Function `supabase/functions/ai-proxy` expone un endpoint OpenAI-compatible
(`POST .../ai-proxy/chat/completions` + `GET .../ai-proxy/models`) que valida la sesión de Supabase
del usuario, comprueba el entitlement `ai`/`bundle` y la cuota mensual de tokens, y reenvía a
**OpenRouter** con la única key del servidor. El consumo se registra en `usage_events` (migración
0003) leyendo el bloque `usage` que OpenRouter añade al final del stream. La **migración 0007**
añade la **cuota ponderada** (columna `quota_tokens`): los modelos por encima de la baseline
descuentan de la cuota a razón de su multiplicador (hoy dos niveles de pago, **×2** para el
intermedio y **×6** para los avanzados; el resto ×1) en vez de 1:1. El mapa autoritativo es
`MODEL_QUOTA_MULTIPLIERS` en `functions/ai-proxy/logic.ts`. Pasos del operador:

1. **Correr las migraciones 0003 y 0007** (`supabase/migrations/0003_ai_usage.sql` y
   `0007_ai_usage_weighted.sql`), igual que las anteriores (SQL Editor o `supabase db push`). La
   0003 crea `usage_events` + la RPC `get_month_usage`; la 0007 añade la columna `quota_tokens`
   (con backfill de las filas históricas) y redefine `get_month_usage` para sumar los tokens
   ponderados. **Si ya tenías la 0003 aplicada, basta con correr la 0007.**

2. **Crear una API key en [OpenRouter](https://openrouter.ai)** (con crédito o auto-topup) y
   configurar los secretos de la función:

   ```bash
   supabase secrets set OPENROUTER_API_KEY=<sk-or-...>
   # Opcionales (defaults en el código: 3.000.000 tokens/mes y la lista curada
   # de supabase/functions/ai-proxy/logic.ts):
   supabase secrets set AI_MONTHLY_TOKENS=3000000
   supabase secrets set AI_ALLOWED_MODELS=deepseek/deepseek-v4-pro,anthropic/claude-haiku-4.5
   ```

   > Si se cambia `AI_ALLOWED_MODELS`, mantener en sync `NOTEFLOW_AI_MODELS` (y
   > `NOTEFLOW_AI_MODEL_META`) en `electron/ai/llm/presets.ts` — la lista que ve el cliente.
   > **Ojo: ampliar el catálogo solo en el servidor no sirve de nada.** El cliente trata su
   > lista como cerrada: no ofrece los modelos que no estén en ella, `acceptsModel()` se niega
   > a guardarlos y `effectiveModel()` reescribe al primero de la lista un modelo guardado que
   > ya no aparezca. O sea que **añadir o quitar modelos requiere también release de la app**;
   > al revés (recortar la lista del servidor sin tocar el cliente) deja a los usuarios con
   > modelos que el proxy rechaza con 400. `AI_ALLOWED_MODELS` es para **emergencias**
   > (retirar deprisa un modelo que se ha vuelto caro o ha desaparecido de OpenRouter), no el
   > sitio donde se gestiona el catálogo.

   > **Orden al rotar el catálogo (importa):** 1) desplegar primero la Edge Function
   > (`supabase functions deploy ai-proxy`, con el catálogo nuevo ya en `logic.ts`), 2) después
   > publicar la release de la app. Al revés, el picker ofrece modelos que el backend todavía
   > rechaza con **400**. Y si la rotación **retira** modelos hay una ventana inevitable: los
   > usuarios que aún no han actualizado y tenían seleccionado uno de los retirados reciben 400
   > hasta que actualicen — el fallback de `effectiveModel()` viaja en la app, no en el proxy,
   > así que el servidor no puede repararles la selección.

3. **Desplegar la función** — esta SÍ con verificación de JWT (el default; a diferencia del
   webhook, aquí el caller es la app con el access token del usuario):

   ```bash
   supabase functions deploy ai-proxy
   ```

   > El proxy expone además `GET .../ai-proxy/usage` (`{used, limit}` en tokens ponderados, sin
   > gate de entitlement) que alimenta la barra de consumo de la card premium en la app. Un
   > redeploy es obligatorio tras la 0007 para que el catálogo nuevo y los multiplicadores entren
   > en vigor.

4. **Checkout de Lemon Squeezy:** copiar la URL de compra de la variante del producto AI
   (dashboard de LS → producto → Share) y pegarla en `LEMONSQUEEZY_CHECKOUT_URLS.ai` de
   `electron/cloudConfig.ts`. Mientras esté vacía, el botón "Subscribe to NoteFlow AI" de
   Settings → Account queda oculto (se muestra "Subscriptions are coming soon."). La app añade
   sola el parámetro `checkout[custom][user_id]` al abrirla.

## 7. NoteFlow Cloud (nube cifrada)

La migración 0004 crea el esquema de la nube de notas: `user_keys` (la DEK del usuario, envuelta)
y `files` (blobs cifrados por archivo). El cliente lee/escribe directamente vía PostgREST + RLS.
La migración 0005 añade el **modo de cifrado dual** (modelo Obsidian Sync): modo **managed**
(default — el usuario no guarda secretos; su DEK se deposita envuelta por la clave del operador)
y modo **e2ee** (opt-in — passphrase + recovery code; el servidor solo ve ciphertext). El modo
managed lo sirve la Edge Function `cloud-keys`. Pasos del operador:

1. **Correr las migraciones 0004, 0005, 0006 y 0008** (`supabase/migrations/0004_cloud.sql`,
   `0005_cloud_managed.sql`, `0006_cloud_realtime.sql` y `0008_cloud_seq.sql`), igual que las
   anteriores (SQL Editor o `supabase db push`). La 0006 añade `files` a la publicación de
   Realtime (el cliente recibe los cambios por WebSocket). La 0008 añade `files.seq`, un número de
   cambio que asigna el servidor (trigger) y que los clientes usan como cursor del pull
   incremental en lugar de `updated_at`; es aditiva (los clientes anteriores siguen funcionando).
   ⚠️ **Orden de despliegue: aplicar la 0008 ANTES de publicar la versión de la app/CLI que la
   usa** — un cliente nuevo contra un servidor sin la columna recibe 400 en el pull (error
   visible, sin pérdida de datos).

2. **Configurar la clave del operador** para el modo managed — 32 bytes aleatorios en base64.
   Es el ÚNICO secret de esta función; quien la tenga puede descifrar las DEK de los usuarios
   managed, así que trátala como la service role key. **No rotarla a la ligera**: las DEK ya
   envueltas con la clave anterior dejarían de poder desenvolverse (los unlock managed fallarían
   con `unwrap_failed` en los logs).

   En **bash / macOS / Linux** (o Git Bash en Windows):

   ```bash
   supabase secrets set CLOUD_MANAGED_KEK=$(openssl rand -base64 32)
   ```

   En **PowerShell** (Windows no trae `openssl`; genera los 32 bytes de forma
   nativa y criptográficamente segura):

   ```powershell
   $bytes = New-Object byte[] 32
   [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
   $key = [Convert]::ToBase64String($bytes)
   supabase secrets set "CLOUD_MANAGED_KEK=$key"
   ```

   Las comillas en `"CLOUD_MANAGED_KEK=$key"` son necesarias porque el base64
   puede contener `+` `/` `=`. Verifica con `supabase secrets list` (muestra un
   digest, no el valor).

3. **Desplegar la función** — CON verificación de JWT (el default; el caller es la app con el
   access token del usuario, como el ai-proxy):

   ```bash
   supabase functions deploy cloud-keys
   ```

4. **Checkout de Lemon Squeezy (cuando se lance el plan):** copiar la URL de compra de la
   variante del producto Cloud y pegarla en `LEMONSQUEEZY_CHECKOUT_URLS.cloud` de
   `electron/cloudConfig.ts` + añadir sus variant IDs a `LEMONSQUEEZY_VARIANT_MAP` (§ 5).
   Mientras la URL esté vacía, el botón Subscribe del panel Cloud queda oculto.

La seguridad la dan las RLS policies: cada usuario solo accede a sus filas, y en `files` la
**escritura** (insert/update) exige además una suscripción `cloud`/`bundle` con
`status = 'active'` en `public.subscriptions` — la lectura y el borrado solo piden ownership,
para que un usuario con la suscripción caducada pueda seguir bajando y borrando sus datos (pero
no subiendo). En `user_keys` basta ownership en todas las operaciones (el material de claves
debe poder crearse/leerse siempre); los endpoints de `cloud-keys` tampoco exigen entitlement,
por el mismo motivo.
