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

## 3. Configurar Auth (email + OTP de 8 dígitos)

1. Dashboard → **Authentication → Sign In / Providers**: habilitar el provider **Email**.
   - "Confirm email" puede quedar en el default; el flujo OTP verifica el email por sí mismo.
2. **SMTP propio — OBLIGATORIO, no solo para producción.** Con el SMTP integrado de Supabase
   **no se pueden editar las plantillas de email** (ni asunto ni cuerpo) y la plantilla por
   defecto de "Magic Link" solo manda el enlace (`{{ .ConfirmationURL }}`), nunca el código
   numérico. Como el login de NoteFlow es **sin deep links** (el usuario teclea el código, no
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

   La clave es usar `{{ .Token }}` (el código numérico — 8 dígitos en este proyecto; la longitud es configurable en GoTrue
   y ni la app ni el CLI la fijan) en lugar de `{{ .ConfirmationURL }}`.
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

2. **Correr las migraciones 0002 y 0010** (`supabase/migrations/0002_billing.sql` y
   `0010_billing_hardening.sql`), igual que la 0001 (SQL Editor o `supabase db push`). La 0002 crea
   el índice único `(provider, provider_ref)` y la función `apply_subscription_event`. La 0010 la
   redefine (misma firma: un único `INSERT … ON CONFLICT DO UPDATE` con guard de orden, que cierra
   la carrera en la que un evento más nuevo de una suscripción recién creada se perdía) y añade
   `expire_subscription_ref` (reembolsos, ver abajo) y `expire_stale_subscriptions`
   (reconciliación, paso 6). Todas solo invocables por el service role.
   ⚠️ **Orden:** `supabase db push` **antes** de `supabase functions deploy billing-webhook
   --no-verify-jwt` — la función nueva llama a `expire_subscription_ref` ante un reembolso; sin la
   0010 ese evento respondería 500 y LS lo reintentaría hasta aplicarla.

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
   >
   > Segundo filtro (desde la 0010 / redeploy del webhook): la función **ignora todo evento con
   > `meta.test_mode: true`** (200 `{ignored: "test mode event"}`). El secreto opcional
   > `LEMONSQUEEZY_ALLOW_TEST_MODE=true` lo desactiva — **solo** para un proyecto Supabase de
   > pruebas; **nunca** en producción.

   `custom_data.user_id` se valida como UUID: un valor que no lo sea (la URL del checkout es
   pública, cualquiera puede poner cualquier cosa) se trata como ausente (camino de solo-update) y
   se loguea un `console.warn`, en vez de reventar el cast a `uuid` de la RPC con un 500 que dejaría
   a LS en bucle de reintentos.

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
     `subscription_paused`, `subscription_unpaused`, **`subscription_plan_changed`**) y
     **`subscription_payment_refunded`** (reembolsos, ver abajo). El resto de
     `subscription_payment_*` y los `order_*` pueden suscribirse o no: la función los ignora
     (responde 200).
   - ⚠️ **Pendiente del operador (2026-10):** el webhook de live se dio de alta con los 7 eventos
     originales; añadir a mano en el dashboard de LS (Settings → Webhooks → editar)
     `subscription_payment_refunded` y `subscription_plan_changed`.

6. **Reconciliación (red de seguridad) — revisión MANUAL, no automática.** Si se pierde un
   `subscription_expired` (webhook caído, reintentos agotados), la fila se quedaría `active` para
   siempre — el acceso se concede por `status`, sin mirar `renews_at`. Para detectarlo, la 0010
   trae `expire_stale_subscriptions()`: expira las filas de Lemon Squeezy `active` cuyo
   `renews_at` (que en las canceladas es el `ends_at`) pasó hace más de **7 días**, y devuelve
   cuántas tocó. **Nunca** toca `provider='manual'` (la fila comp del operador) ni filas con
   `renews_at` null, y no cambia `updated_at`.

   ⚠️ **Falsos positivos — por qué NO se agenda a ciegas:** `renews_at` solo avanza cuando llega el
   `subscription_updated` de cada renovación. Si se pierde **esa** entrega (LS reintenta poco
   tiempo), un cliente que **sí está pagando** conserva el `renews_at` viejo y la función lo
   expiraría 7 días después. No se arregla solo: el siguiente evento de LS de esa suscripción
   puede tardar **un mes** (plan mensual — un año en el anual) salvo que se reenvíe a mano. O sea
   que el predicado da **candidatos**, no certezas. Flujo recomendado (p. ej. una vez por semana):

   1. **Listar candidatos** (SQL Editor):

      ```sql
      select user_id, product, provider_ref, renews_at
        from public.subscriptions
       where provider = 'lemonsqueezy' and status = 'active'
         and renews_at < now() - interval '7 days';
      ```

   2. **Comprobar cada `provider_ref` en Lemon Squeezy** (dashboard → Subscriptions, o
      `GET /v1/subscriptions/<id>` de su API). Si LS la da por `expired`/impagada → candidato
      confirmado. Si LS la da por `active` → se perdió un evento: **no expirar**; reenviar el último
      `subscription_updated` desde el log del webhook (dashboard de LS → Settings → Webhooks →
      entregas → *Resend*) para que la fila se ponga al día.
   3. **Expirar solo los confirmados**, uno a uno:

      ```sql
      update public.subscriptions
         set status = 'expired'
       where provider = 'lemonsqueezy' and provider_ref = '<id confirmado>';
      ```

      o `select public.expire_stale_subscriptions();` **solo si todos** los candidatos del paso 1
      están confirmados.

   **Si se expiró a alguien por error:** reenviar desde el log de webhooks de LS el último
   `subscription_updated` de esa suscripción (su `updated_at` es ≥ el de la fila, que la función no
   tocó, así que el guard de orden lo deja pasar y restaura `status`/`renews_at`), o a mano:
   `update public.subscriptions set status = 'active', renews_at = '<renews_at real según LS>'
   where provider = 'lemonsqueezy' and provider_ref = '<id>';`.

   **pg_cron (opcional, solo aceptando el riesgo de falsos positivos de arriba):** si el operador
   prefiere expirar automáticamente y asumir que, de vez en cuando, un cliente que paga pierda el
   acceso hasta que alguien lo note y lo restaure, habilitar `pg_cron` (Dashboard → Database →
   Extensions) y:

   ```sql
   -- ⚠️ Expira sin revisión: puede cortar a clientes al corriente de pago (ver arriba).
   select cron.schedule('expire-stale-subscriptions', '0 4 * * *',
     $$select public.expire_stale_subscriptions()$$);
   ```

   (Comprobar con `select * from cron.job;` y el historial en `cron.job_run_details`; quitarlo con
   `select cron.unschedule('expire-stale-subscriptions');`.)

> **Reembolsos.** Lemon Squeezy **no cancela** la suscripción al reembolsar: sin hacer nada, el
> comprador reembolsado conservaría el acceso **y LS le seguiría cobrando** cada renovación. Con
> `subscription_payment_refunded` suscrito, un **reembolso total** (factura en estado `refunded`)
> llama a `expire_subscription_ref`, que pone `status='expired'` y `updated_at='infinity'`, y la
> función loguea `billing-webhook: subscription <id> expired after a full refund — CANCEL
> subscription <id> in Lemon Squeezy`. Un **reembolso parcial** (`partial_refund`) se ignora y se
> loguea (`billing-webhook: ignoring refund event (…)`): decide el operador. Un reembolso que llega
> antes de que exista la fila es un no-op (se loguea).
>
> ⚠️ **Paso OBLIGATORIO tras todo reembolso total (automático o manual): cancelar la suscripción en
> Lemon Squeezy** (dashboard → Subscriptions → la suscripción → *Cancel subscription*, o
> `DELETE /v1/subscriptions/<id>` de su API). Con la fila bloqueada en `updated_at='infinity'`
> nuestro lado ya no reacciona a nada que mande LS, así que si no se cancela allí el cliente sigue
> pagando **sin acceso** → contracargos y riesgo de consumo. Lo más limpio es cancelar en el mismo
> momento en que se emite el reembolso.
>
> ⚠️ **Reembolsar una factura ANTIGUA también expira:** el webhook no distingue qué factura se
> reembolsa; un reembolso total de cualquier factura de la suscripción la expira, aunque el periodo
> **actual** esté pagado. Reembolsar a sabiendas (si solo se quiere devolver un mes viejo y mantener
> el acceso, usar un reembolso parcial, o restaurar la fila a mano como se indica abajo).
>
> **Runbook manual** (p. ej. reembolso hecho antes de suscribir el evento, o uno parcial que se
> quiere tratar como total): 1) **cancelar la suscripción en LS** (obligatorio, ver arriba);
> 2) en el SQL Editor:
>
> ```sql
> update public.subscriptions
>    set status = 'expired', updated_at = 'infinity'
>  where provider = 'lemonsqueezy' and provider_ref = '<id de suscripción de LS>';
> ```
>
> **Por qué `'infinity'` y no `now()`:** LS sigue mandando eventos de la suscripción con un
> `updated_at` posterior al reembolso — `subscription_updated` mientras no se cancele y, al
> cancelarla, `subscription_cancelled` (que mapeamos a `active` hasta `ends_at`) — y el guard
> `p_event_at >= updated_at` de `apply_subscription_event` la volvería a poner `active`. Con `'infinity'` ningún evento de LS puede ganarle. Nada más lee
> `subscriptions.updated_at` (el cliente pide solo `product,status,renews_at`). Para **deshacerlo**
> (reembolso por error, sin haber cancelado en LS): `set status = 'active', updated_at = now()` y
> el siguiente evento de LS la deja como corresponda.

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
`MODEL_QUOTA_MULTIPLIERS` en `functions/ai-proxy/logic.ts`. La **migración 0009** acota el coste:
cada petición **reserva** antes de reenviar una estimación de su coste (RPC `reserve_ai_usage`, con
lock por usuario, cuota y un máximo de peticiones simultáneas), que se **liquida** con el `usage`
real al terminar (detalle en `.claude/context/monetization.md` § 3). Pasos del operador:

1. **Correr las migraciones 0003, 0007 y 0009** (`supabase/migrations/0003_ai_usage.sql`,
   `0007_ai_usage_weighted.sql` y `0009_ai_usage_reservations.sql`), igual que las anteriores (SQL
   Editor o `supabase db push`). La 0003 crea `usage_events` + la RPC `get_month_usage`; la 0007
   añade la columna `quota_tokens` (con backfill de las filas históricas) y redefine
   `get_month_usage` para sumar los tokens ponderados; la 0009 añade a `usage_events` las columnas
   `pending`, `cost_usd` y `generation_id` y la RPC `reserve_ai_usage`.
   ⚠️ **Orden:** `supabase db push` **antes** de `supabase functions deploy ai-proxy` — la función
   nueva llama a `reserve_ai_usage` y sin ella respondería 500 (`quota_check_failed`) a todo chat.
   Al revés no hay problema: la función vieja es compatible con el esquema de la 0009 (`pending`
   tiene default `false`, así que sus filas quedan como finales).

2. **Crear una API key en [OpenRouter](https://openrouter.ai)** (con crédito o auto-topup) y
   configurar los secretos de la función:

   ```bash
   supabase secrets set OPENROUTER_API_KEY=<sk-or-...>
   # Opcionales (defaults en el código: 3.000.000 tokens/mes y la lista curada
   # de supabase/functions/ai-proxy/logic.ts):
   supabase secrets set AI_MONTHLY_TOKENS=3000000
   supabase secrets set AI_ALLOWED_MODELS=deepseek/deepseek-v4-pro,anthropic/claude-haiku-4.5
   # Máximo de peticiones simultáneas por usuario (default 3; desde la 0009):
   supabase secrets set AI_MAX_INFLIGHT=3
   ```

   > **Crédito de OpenRouter:** con el auto top-up apagado, al quedarse sin crédito OpenRouter
   > responde 402 y **todo** el plan gestionado falla (el usuario ve un 502 genérico). La función
   > lo marca en los logs con una línea propia: buscar `OPENROUTER OUT OF CREDIT (402)` en
   > Dashboard → Edge Functions → ai-proxy → Logs.

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
   > gate de entitlement) que alimenta la barra de consumo de la card premium en la app. Cada
   > migración que cambia el contrato de la función ha ido seguida de un redeploy (la 0007 —
   > catálogo y multiplicadores — ya está aplicada y desplegada); con la 0009 es igual: primero
   > la migración, luego el deploy.

   **Monitorización de gasto (desde la 0009).** Cada fila liquidada guarda en `cost_usd` lo que
   OpenRouter cobró por la petición (`usage.cost`, en créditos ≈ USD, sin el ~5,5 % de comisión de
   compra de crédito). Las filas `pending = true` antiguas son reservas que nunca se liquidaron
   (isolate matado, sin `usage`): su estimación sigue contando para la cuota del usuario, pero no
   tienen coste real conocido. En el SQL Editor:

   ```sql
   -- Gasto por mes (y reservas sin liquidar)
   select date_trunc('month', at) as mes,
          round(sum(cost_usd), 2) as usd,
          count(*) filter (where cost_usd is null and not pending) as sin_coste,
          count(*) filter (where pending) as reservas_sin_liquidar
     from public.usage_events
    group by 1 order by 1 desc;

   -- Top usuarios del mes en curso
   select user_id, round(sum(cost_usd), 4) as usd, sum(quota_tokens) as cuota_ponderada,
          sum(tokens_in) as tokens_in, sum(tokens_out) as tokens_out, count(*) as peticiones
     from public.usage_events
    where at >= date_trunc('month', now())
    group by user_id order by usd desc nulls last limit 20;

   -- Gasto por modelo del mes en curso
   select model, round(sum(cost_usd), 4) as usd, count(*) as peticiones
     from public.usage_events
    where at >= date_trunc('month', now())
    group by model order by usd desc nulls last;
   ```

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

1. **Correr las migraciones 0004, 0005, 0006, 0008 y 0011** (`supabase/migrations/0004_cloud.sql`,
   `0005_cloud_managed.sql`, `0006_cloud_realtime.sql`, `0008_cloud_seq.sql` y
   `0011_cloud_conditional_upsert.sql`), igual que las
   anteriores (SQL Editor o `supabase db push`). La 0006 añade `files` a la publicación de
   Realtime (el cliente recibe los cambios por WebSocket). La 0008 añade `files.seq`, un número de
   cambio que asigna el servidor (trigger) y que los clientes usan como cursor del pull
   incremental en lugar de `updated_at`; es aditiva (los clientes anteriores siguen funcionando).
   ⚠️ **Orden de despliegue: aplicar la 0008 ANTES de publicar la versión de la app/CLI que la
   usa** — un cliente nuevo contra un servidor sin la columna recibe 400 en el pull (error
   visible, sin pérdida de datos).

   **Migración 0011 (`0011_cloud_conditional_upsert.sql`) — subidas condicionadas.** Crea la
   función RPC `public.cloud_upsert_file(...)` por la que los clientes suben las filas de nota:
   rechaza (devuelve `false`, no escribe) una subida cuyo `updated_at` es más viejo que la versión
   que el servidor ya tiene de esa carpeta (la fila o su ancla, tombstones incluidos), para que un
   journal drenado tarde o el catch-up del primer sync de otro dispositivo no pisen ediciones ni
   borrados más recientes. `security invoker` (rige la RLS de `files`: sin suscripción → 403 como
   hasta ahora) y toma el mismo advisory lock por usuario que la 0008. Solo depende de la 0004 y la
   0008. Es **aditiva**: los clientes anteriores siguen con su upsert directo, y un cliente nuevo
   contra un servidor sin la función cae al upsert directo (sin regresión).
   ⚠️ **Orden de despliegue: aplicar la 0011 ANTES de publicar la versión de la app/CLI que la
   usa** (si no, esos clientes siguen subiendo sin condiciones hasta que se aplique):

   ```bash
   supabase db push            # aplica la 0011 (y cualquier otra pendiente)
   supabase migration list     # comprobar que 0011 figura como aplicada en remoto
   ```

   Si el remoto ya tiene migraciones con número mayor o la 0009/0010 llegan después que la 0011,
   `supabase db push` se niega a aplicar migraciones "fuera de orden": usar
   `supabase db push --include-all`. Alternativa: pegar el fichero en el SQL Editor y registrar la
   versión con `supabase migration repair --status applied 0011`.

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
