# NoteFlow — Monetización (Fase 4): cuenta, IA gestionada, nube E2EE

> **Estado: Fases 4.0 y 4.1 DESPLEGADAS Y OPERATIVAS** — no solo implementadas en código: producto
> real en Lemon Squeezy (variantes mensual/anual), Edge Functions desplegadas (`billing-webhook` +
> `ai-proxy`), webhook dado de alta, migraciones 0001-0003 corridas, y el flujo probado
> **end-to-end** (alta de cuenta, checkout, entitlement aplicada, chat vía el preset `noteflow`)
> — primero en modo test. **Live mode activado (2026-10-19):** store verificada, los tres productos
> copiados a live ("Copy to Live Mode"), webhook de live dado de alta y URLs de checkout de live en
> `cloudConfig.ts` (detalle en § 3, "Billing en live mode"). Cuenta NoteFlow en la app + entitlements + esquema SQL + panel Settings → Account
> (ver "Fase 4.0 — implementación" abajo) y la **IA gestionada**: `usage_events` + `get_month_usage`
> + preset `noteflow` en el cliente + botón de suscripción en Settings → Account + auto-activación
> del preset al suscribirse + sección dedicada en `LlmConfigView` (ver § 3, "implementación"). El
> **proyecto Supabase real está conectado** (`electron/cloudConfig.ts`).
> Decisiones tomadas con el usuario (2026-07): backend **Supabase**, pagos por **Merchant of
> Record = Lemon Squeezy**, nube con **cifrado dual managed/e2ee** (modelo Obsidian: managed por
> defecto, E2EE estricto opt-in — decisión revisada, antes "E2EE total"; ver § 4), IA gestionada
> con **OpenRouter** como único upstream. Las opciones gratuitas actuales (IA local/API propia,
> GitHub Sync) **se mantienen**.

## Visión de producto

Dos áreas de suscripción (mensual/anual), pensadas para el usuario que "no quiere comerse la cabeza":

1. **NoteFlow AI** — LLM gestionado por NoteFlow: sin Ollama, sin comprar API keys de terceros.
   Se suma a las opciones gratuitas existentes (local / key propia), no las sustituye.
2. **NoteFlow Cloud** — nube de notas superior al GitHub Sync gratuito: sync en tiempo real
   (push por websocket, no pull cada 5 min), sin fricción de push/pull, más rápido y fiable.
   Futuro no-foco: historial de versiones y compartir notas entre usuarios en tiempo real.

**Precios (decididos 2026-07, EUR** — publicados en la app (Settings → Account) y en `/pricing` de la web):

| Plan | Mensual | Anual |
|---|---|---|
| NoteFlow AI | €5.99 | €49.99 |
| NoteFlow Cloud | €3.99 | €39.99 |
| NoteFlow Bundle (AI + Cloud) | €7.99 | €79.99 |

El **Bundle** es el tercer producto (resuelve la vieja duda "un paquete vs dos planes": hay ambos):
una fila `product='bundle'` activa las dos entitlements (`electron/entitlements.ts` ya lo soporta).
Las cifras de display viven en `src/lib/subscriptionPlans.ts` (la autoritativa es siempre la del
checkout de Lemon Squeezy — mantener en sync con las variantes de LS y con la web). Los **tres
productos existen en LS** y sus tres URLs están pobladas en `LEMONSQUEEZY_CHECKOUT_URLS`
(`electron/cloudConfig.ts`), así que los tres planes ofrecen botón Subscribe. Ese es el único
interruptor: una URL vacía deja `<product>CheckoutConfigured` en `false` y esa card pasa a mostrar
"Coming soon" en vez del botón.

## 1. Backend: Supabase (veredicto y caveats)

**Sí a Supabase** como backend único: Auth + Postgres/RLS + Realtime + Edge Functions + Storage en
un solo proyecto, y es Postgres debajo → portable/self-hosteable si un día hay que salir.
Cada pieza cubre una necesidad concreta:

| Necesidad | Pieza Supabase |
|---|---|
| Cuenta NoteFlow | Auth (email + OTP) |
| Entitlements, archivos de notas cifrados, metering de tokens | Postgres + RLS |
| Sync en tiempo real (lo que le falta al GitHub Sync) | Realtime |
| Proxy LLM con streaming SSE | Edge Functions (Deno) |
| Blobs grandes / adjuntos (futuro) | Storage |

**Caveats conocidos (revisar al implementar):**
- **Coste:** Pro ~25 $/mes cuando haya usuarios reales + egress. Las notas con **imágenes base64
  embebidas** engordan filas y egress → considerar cap de tamaño por archivo o mover blobs grandes
  a Storage.
- **Realtime:** `postgres_changes` escala regular con muchos suscriptores; si crece, migrar a
  canales **broadcast** por usuario (el cliente emite tras cada upsert).
- **Edge Functions:** wall-clock ~400 s y CPU baja — suficiente para el proxy (I/O-bound), pero
  chats muy largos podrían rozar el límite; si molesta, mover SOLO el proxy a Cloudflare Workers.
- **Tokens de Auth expiran ~1 h** → el preset LLM gestionado debe pedir un access token fresco por
  request (nunca guardar el JWT como si fuera una API key estática).

**Alternativas descartadas:** VPS propio + Node + Postgres (más control, demasiada operación para
un dev solo); Cloudflare Workers para todo (fragmenta la infra: auth y DB seguirían haciendo falta).

## 2. Cuenta NoteFlow + entitlements + pagos (MoR)

- **Auth:** Supabase Auth con **email + OTP de 6 dígitos** (sin deep links; misma UX de "código"
  que el Device Flow de GitHub ya establecido en la app). La sesión vive en el **proceso main**,
  espejo del patrón `githubSync`: refresh token cifrado con `safeStorage` en `settings.json`
  (sección `account`), **nunca cruza al renderer** — el renderer solo ve estado público
  (`{email, signedIn, entitlements}`).
- **Entitlements agnósticos al proveedor de pago:**
  `subscriptions(user_id, product 'ai'|'cloud'|'bundle', status, renews_at, provider, provider_ref)`
  poblada exclusivamente por los **webhooks del MoR** (Edge Function `billing-webhook`, valida
  firma). El cliente lee sus filas vía RLS (`user_id = auth.uid()`). Cambiar de proveedor de pago
  no toca el cliente.
- **Merchant of Record: Lemon Squeezy** (decidido 2026-07; ~5% + 0,50 por transacción). Razón:
  como vendedor particular/autónomo en España, el MoR es el vendedor legal y gestiona el **IVA por
  país de la UE** (con Stripe directo tocaría OSS/VIES y declarar IVA por país). El checkout se
  abre en el navegador vía el IPC `account:open-checkout` (main construye la URL con
  `checkout[custom][user_id]=<uuid>` — la correlación del webhook — y la abre con
  `shell.openExternal`; el userId nunca cruza al renderer). Implementado en la fase 4.1.
- **Webhook de billing (implementado):** Edge Function `supabase/functions/billing-webhook`
  (Deno, cero dependencias) — verifica la firma HMAC-SHA256 de la cabecera `X-Signature` contra el
  body crudo (secret en `LEMONSQUEEZY_WEBHOOK_SECRET`; comparación constant-time vía
  `crypto.subtle.verify`), traduce el variant ID de LS a nuestro `product` con el env
  `LEMONSQUEEZY_VARIANT_MAP` (`"890123:ai,890124:cloud,..."`), mapea estados
  (`on_trial|active|cancelled → 'active'` — la suscripción cancelada sigue pagada hasta `ends_at`,
  coherente con el comentario de `electron/entitlements.ts`; `past_due|unpaid|paused →
  'past_due'`; `expired → 'expired'`) y aplica el evento con la RPC idempotente
  `apply_subscription_event` (migración 0002: upsert por índice único `(provider, provider_ref)` +
  guard `p_event_at >= updated_at` contra entregas fuera de orden; sin `user_id` en custom_data
  solo actualiza, nunca inserta). Eventos no procesables (variante desconocida, `data.type` ≠
  `subscriptions`, payload malformado) → 200 `{ignored}` para no entrar en el bucle de reintentos
  de LS. La lógica pura vive en `logic.ts` (agnóstica de Deno) y está testeada en
  `tests/supabase/billing-webhook.test.ts`. Deploy con `--no-verify-jwt` (LS no manda JWT).

## 3. NoteFlow AI — IA gestionada (IMPLEMENTADA, fase 4.1)

**Principio: el cliente ya sabe hablar con esto.** La capa LLM soporta proveedores
OpenAI-compatible con `baseUrl` propio (`electron/ai/llm/presets.ts`), así que el plan gestionado
es **un preset más**, no una implementación nueva.

- **Servidor — Edge Function `supabase/functions/ai-proxy`** (Deno, cero dependencias; lógica pura
  en `logic.ts`, testeada en `tests/supabase/ai-proxy.test.ts`) exponiendo `POST
  .../ai-proxy/chat/completions` + `GET .../ai-proxy/models` OpenAI-compatible. Pipeline por
  request: resuelve el access token del caller a `user_id` vía `/auth/v1/user` (401 si inválido) →
  entitlement `ai`/`bundle` activo consultando `subscriptions` con el service role (403 con error
  OpenAI-shaped si no) → cuota mensual vía RPC `get_month_usage` (429 si superada; cabeceras
  `X-NoteFlow-Tokens-Used`/`X-NoteFlow-Tokens-Limit` en las respuestas) → allowlist de modelos
  (400 si fuera) → forward a **OpenRouter** con la key del servidor inyectando `usage:
  {include: true}` (extensión que añade el bloque `usage` al último chunk SSE) y **eliminando del
  body los campos de enrutado/coste de OpenRouter** (`models`, `route`, `provider`, `plugins` —
  la allowlist solo valida `model` y esos campos permitirían ejecutar modelos caros fuera de la
  lista o comprar features extra con la key del operador; ver `buildUpstreamBody`). El stream se
  devuelve en **passthrough** mientras un `tee()` lo escanea (`createSseUsageScanner`) y al acabar
  inserta la fila en `usage_events` (migración 0003: tabla + RPC `get_month_usage`, solo service
  role escribe/invoca; **migración 0007** añade la columna `quota_tokens` — ver "Cuota ponderada")
  — registro **best-effort**, un fallo no rompe la respuesta. Se despliega **con verify JWT**
  (default; a diferencia del webhook). Env: `OPENROUTER_API_KEY` (secreto), `AI_MONTHLY_TOKENS`
  (default 3M, ahora en **tokens ponderados**) y `AI_ALLOWED_MODELS` (default: lista curada en
  `logic.ts`).
- **Cuota ponderada por modelo (migración 0007):** el catálogo mezcla modelos baratos y
  "avanzados" (más caros), así que la cuota mensual ya no cuenta tokens reales sino **tokens
  ponderados**. Cada modelo tiene un multiplicador (`MODEL_QUOTA_MULTIPLIERS` en
  `ai-proxy/logic.ts`: solo los ≠×1; lo que no esté es ×1) y lo que descuenta de la cuota es
  `computeQuotaTokens = round((tokens_in+tokens_out) * multiplicador)`. Hoy hay tres niveles:
  **estándar ×1**, **intermedio ×2** y **avanzados ×6** (nada asume un conjunto fijo de valores —
  `quotaMultiplierFor` acepta cualquier número finito positivo, así que añadir un nivel es una
  entrada más en el mapa). `tokens_in`/`tokens_out` siguen guardándose sin ponderar (coste real del
  operador); lo ponderado va a la columna nueva `usage_events.quota_tokens`, que es lo que
  `get_month_usage` suma (0007 la redefine + backfill de filas históricas = tokens reales, todas
  eran ×1). El multiplicador se refleja en el cliente (`NOTEFLOW_AI_MODEL_META` en `presets.ts`)
  para etiquetar el coste en el selector de modelos — **mantener en sync** con el mapa del proxy.
- **Endpoint `GET .../ai-proxy/usage`:** devuelve `{used, limit}` (tokens ponderados del mes +
  cuota) tras resolver el token a `user_id`, **sin gate de entitlement** (ver el consumo es
  inocuo y sigue siendo útil tras caducar la suscripción). Lo consume el IPC `ai:llm-usage`
  (main pide un access token fresco; devuelve `null` ante cualquier fallo — la UI solo oculta la
  barra) que alimenta la barra de consumo de la **sección NoteFlow AI** de `LlmConfigView`.
- **Upstream OpenRouter:** una key, cientos de modelos, cambiar el catálogo sin tocar infra
  (sobrecoste ~5%, asumido). Lista curada actual (todos tool-calling; **text-only los dos DeepSeek
  y `xiaomi/mimo-v2.5-pro`** — o sea **tres de los cinco ×1**; el resto acepta imágenes) —
  **estándar ×1:** `deepseek/deepseek-v4-pro`, `deepseek/deepseek-v4-flash`,
  `xiaomi/mimo-v2.5-pro`, `openai/gpt-5.6-luna`, `anthropic/claude-haiku-4.5`;
  **intermedio ×2:** `x-ai/grok-4.5`; **avanzados ×6:** `moonshotai/kimi-k3`. El **orden importa**:
  el primero (`deepseek/deepseek-v4-pro`) es el modelo por defecto de facto (`suggestedModels[0]`)
  y, al ser **text-only**, el plan gestionado arranca **sin adjuntar imágenes** hasta que el
  usuario elija otro modelo (lo capa `providerCapabilities`, ver `.claude/context/ai.md`).
  **Duplicada a propósito** en `DEFAULT_ALLOWED_MODELS` (`ai-proxy/logic.ts`) y
  `NOTEFLOW_AI_MODELS` (`presets.ts`): mantener en sync — lo fija el test
  `tests/supabase/ai-catalog-mirror.test.ts`. La visión por-modelo la refina
  `providerCapabilities(preset, activeModel)` para el preset `noteflow` (DeepSeek y MiMo →
  `images:false`). **Orden de despliegue de una rotación:** primero la Edge Function, después la
  release de la app (detalle y por qué en `supabase/README.md` § 6).
- **El catálogo rota** (entran y salen modelos), así que el modelo guardado por el usuario puede
  quedar obsoleto y el proxy rechazaría **todas** sus peticiones. `effectiveModel()`
  (`electron/ai/llm/index.ts`) protege ese caso: en los presets con catálogo curado (los que
  tienen `modelMeta` — hoy solo `noteflow`), si el modelo guardado no está en `suggestedModels`
  se usa `suggestedModels[0]`. En los presets BYO el modelo es libre y **no** se toca.
- **Cliente:** preset `noteflow` **primero** en `presets.ts` (`impl: 'openai'`, `baseUrl` =
  `AI_PROXY_URL` de `cloudConfig.ts`, `needsKey: false`, `editableBaseUrl: false`).
  ⚠️ `presetOf()` con id desconocido cae **explícitamente en `anthropic`** (ya no en `PRESETS[0]`)
  y `DEFAULT_LLM_CONFIG.active` sigue siendo `'anthropic'` — usuarios existentes no cambian.
  La credencial es un **access token fresco** por request: `resolveConfigAsync()` en
  `llm/index.ts` (llama a `account.getAccessToken()`; lanza error accionable sin sesión) — main
  la usa en chat/list-models/test/profile-generate; `resolveConfig` síncrona queda para el resto.
  `toPublic().configured` para este preset exige sesión + entitlement `ai`, y
  `notConfiguredMessage()` da el motivo exacto ("sign in" vs "requires subscription").
  Capabilities: imágenes **según el modelo activo** (`modelMeta`; los text-only las desactivan);
  PDF no (anthropic-only).
- **UI:** `LlmConfigView` presenta las dos fuentes del asistente como **opciones excluyentes** —
  selector de dos cards (**NoteFlow AI** vs **proveedor propio / IA local**, ambas siempre visibles,
  con badge Activo/Inactivo) y debajo solo la sección de la elegida. El preset **NoteFlow AI no
  aparece en el `<select>` de proveedores** (se filtra por id). Su sección: barra de consumo mensual +
  botón "Use NoteFlow AI" (`changeProvider('noteflow')`) **solo con entitlement `ai`**; sin sesión o
  sin entitlement, en su lugar el aviso ámbar (`noteflowSignIn`/`noteflowNeedsSubscription`) que
  remite a Ajustes → Cuenta — también cuando la suscripción caduca teniéndolo activo (sigue viendo el
  motivo y puede pasarse a BYO con la otra card). Detalle del selector, del estado de vista `mode` y
  de por qué los campos BYO se ocultan hasta activar el proveedor: `.claude/context/ai.md` § LLM.
  `LlmConfigView` refresca la config al cambiar el estado de cuenta (`onAccountStatusChanged`).
- **Bloque de planes (`src/components/Settings/PlanOffers.tsx`):** componente **compartido** por los
  cuatro sitios donde un gate puede acabar en compra, para que precio, reglas de visibilidad y copy
  no se separen entre superficies:
  1. **Ajustes → Cuenta** (`AccountPanel`, con sesión): `['bundle', 'ai', 'cloud']`.
  2. **Ajustes → IA** y 3. **panel de IA del Cerebro** (`LlmConfigView`, mismo componente en ambas):
     `['ai', 'bundle']` dentro del gate.
  4. **Ajustes → Sincronización → NoteFlow Cloud** (`CloudPanel`): `['cloud', 'bundle']`, tanto en el
     estado sin sesión como en el gate de entitlement (que cubre setup y enable — ver § 4, "Gating").
  Reglas: si `!account.configured` (build sin Supabase) no pinta nada — no se anuncian precios de algo
  que no se puede comprar. Un plan solo aparece mientras falte su entitlement, y **Bundle exige que
  falten AMBAS** (para no facilitar doble facturación); si no queda ninguno, no renderiza. Nombre y
  precio salen de `src/lib/subscriptionPlans.ts` (`SUBSCRIPTION_PRICES`, display-only) y el Bundle
  lleva badge "Best value". **La card entera es el call-to-action** (`<button>` cuando es clickable,
  para foco + teclado; el CTA de dentro es un `<span>` porque un button no puede anidar otro button).
  Con sesión y checkout configurado, clicar la card dispara `onSubscribe(product)` → IPC
  `account:open-checkout` (`'ai' | 'cloud' | 'bundle'`; main construye la URL con
  `checkout%5Bcustom%5D%5Buser_id%5D=<uuid>` y la abre con `shell.openExternal`; el userId
  **no cruza al renderer**). URL vacía = card inerte con nota "Coming soon". Sin sesión, clicar la card
  dispara `onGoToAccount` (lleva a Ajustes → Cuenta), y debajo se muestra la línea "sign in to
  subscribe". Ese acceso a Cuenta lo resuelve `onNavigate('account')` donde existe (paneles de Ajustes)
  y, desde el panel del Cerebro —que no tiene navegación propia—, el evento `window`
  **`noteflow:open-account`**, escuchado en `TitleBar` junto al resto de `noteflow:open-*`.
- **Auto-activación al suscribirse:** `electron/main.ts` (junto a `account.onStatusChanged`)
  detecta la transición real `entitlements.ai` `false→true` **dentro de la misma sesión de
  cuenta del proceso en curso** y cambia `settings.aiLlm.active` a `'noteflow'` automáticamente
  (si no lo era ya) antes de emitir `account:status-changed`, para que el renderer recargue ya
  con el proveedor correcto.
  **Matiz importante:** `entitlements` no se persiste (arranca en `NO_ENTITLEMENTS` en cada boot;
  ver "implementación" abajo) — para no forzar el cambio en cada arranque de un usuario ya
  suscrito, se fija una **baseline por identidad** (`aiEntitlementBaseline` + `aiEntitlementIdentity`
  = el email de la sesión, o `null` en signed-out) en la PRIMERA observación de cada identidad
  (boot con sesión persistida, justo tras `verifyOtp`, o tras un `signOut`) sin disparar nada;
  solo una transición posterior **para la misma identidad** en el mismo proceso (p. ej. "Subscribe"
  en el navegador → volver → "Refresh" en Settings → Account) dispara el auto-switch. **La
  identidad se re-arma en cada cambio de `signedIn`/email** — necesario porque la UI permite
  sign-out + sign-in sin reiniciar la app: sin este reset, una cuenta B que YA tenía la
  entitlement antes de este proceso (y se loguea después de que la cuenta A, sin entitlement,
  cierre sesión) heredaría la baseline `false` de A y se auto-switchearía indebidamente al
  reflejar por primera vez su propia entitlement `true`. Nunca se auto-switchea al revés (perder
  la entitlement **no** cambia de proveedor: la suscripción caducada sigue viéndose con su motivo
  en la UI y el usuario decide).
- **Al cerrar sesión, el asistente vuelve a BYO/local:** sin sesión el preset `noteflow` está roto
  (el proxy responde 401), así que el sign-out revierte `settings.aiLlm.active` al **último
  proveedor NO-`noteflow`** que el usuario tuviera activo — persistido en
  `settings.aiLlm.lastByoProvider` por `withActiveProvider()` (`ai/llm/index.ts`) en los DOS sitios
  que activan el plan gestionado (el auto-switch de `main.ts` y el `ai:llm-set-config` de la UI) —
  o a `DEFAULT_LLM_CONFIG.active` (`'anthropic'`) si no hay tal dato (`byoFallbackProvider()`). Las
  keys BYO no se tocan (viven en `byPreset`), así que volver es inmediato. Al volver a iniciar
  sesión **la misma** cuenta, si la entitlement `ai` sigue viva se re-activa `noteflow`
  automáticamente (registro `accountRestore` — ver § 4 "Cerrar sesión", donde está el mecanismo
  completo; es un camino **aparte** del auto-switch por entitlement de arriba, e idempotente).
- **Pendiente del operador (cuota ponderada):** correr la **migración 0007** (`supabase db push`)
  y **redesplegar `ai-proxy`** (`supabase functions deploy ai-proxy`) para que el nuevo catálogo,
  los multiplicadores y el endpoint `/usage` entren en vigor. Sin redeploy, el proxy sigue
  sirviendo el catálogo viejo y `get_month_usage` (si 0007 no se corrió) sumaría una columna
  inexistente.
- **Billing en live mode (hecho 2026-10-19):** productos copiados de test a live con "Copy to Live
  Mode" (los variant IDs **cambian** entre modos). IDs de variante:

  | Producto | Live mensual / anual | Test mensual / anual |
  |---|---|---|
  | `ai` (LS: "NoteFlow IA") | 2268405 / 2268404 | 1892927 / 1892907 |
  | `cloud` | 2268416 / 2268417 | 1901112 / 1901138 |
  | `bundle` | 2268409 / 2268410 | 1901146 / 1901150 |

  Cada producto tiene además una variante `Default` en estado `pending` que no se vende y no va en
  el map. `LEMONSQUEEZY_VARIANT_MAP` lleva **solo los IDs de live**. Test y live comparten
  signing secret, así que el map es el **único filtro** entre ambos modos. Si incluyera los de
  test, cualquiera podría completar el checkout de test con la tarjeta de prueba de LS y obtener
  una entitlement real gratis: las URLs de test están en el historial público de
  `electron/cloudConfig.ts` en GitHub, aunque ninguna release publicada las llevó. Los eventos de
  test que sigan llegando se ignoran (200 `{ignored: unknown variant}`, verificado reenviando una
  entrega de test).
  - **Filas de test huérfanas:** el acceso se concede por `status='active'` sin mirar `renews_at`
    (`computeEntitlements`, el check de `ai-proxy`, la RLS de `files`). Como sus eventos ya se
    ignoran, una fila de test `active` **nunca expira sola**. El webhook no guarda `test_mode`:
    se identifican por `provider_ref` o porque se crearon antes del 2026-10-19. Al hacer el
    cambio solo había dos filas, ambas del operador: `ai` 2332140 (ya `expired`) y bundle
    `provider_ref=2370478`, que se **expiró** el 2026-10-19.
  - **Cuenta del operador (comp permanente):** fila `provider='manual'`,
    `provider_ref='operator-comp'`, `product='bundle'`, `status='active'`, `renews_at=null`,
    insertada a mano por SQL. Da AI + Cloud sin pagar y el webhook nunca la toca (otro
    `provider`). Es el patrón para regalar acceso: una fila `manual` por usuario.
  - **Volver a probar en test:** añadir sus IDs al map reabre el agujero. Hay que mantener esa
    ventana lo más corta posible y, al retirar los IDs, expirar o borrar las filas que se hayan
    creado durante ella (si no, quedan activas para siempre).

  El webhook de live apunta al mismo endpoint, con los
  mismos 7 eventos `subscription_*` y el **mismo signing secret** que el de test. Las URLs de
  checkout (`cloudConfig.ts`) son `/checkout/buy/<slug>` de la **variante Monthly** de cada
  producto, no el slug del producto. **Precios con IVA incluido** (decidido 2026-10-19): la store
  tiene activado "tax-inclusive pricing", así que el cliente paga exactamente la cifra publicada
  y el neto baja según el IVA del país. La web (`/pricing`, `/terms`) lo indica (LSSI art.
  10.1.f); la nota "IVA incluido" en la app (Settings → Account, `PlanOffers.tsx`) está
  **pendiente**. Ver `supabase/README.md` §§ 5-6 para repetir el proceso en
  otro proyecto.
- **Privacidad (documentar en UI/landing):** el índice RAG sigue siendo 100% local; lo que viaja
  al proxy es lo mismo que viajaría a cualquier proveedor con key propia (pregunta + chunks
  recuperados). Las secciones `aiHidden` y las notas cifradas ya quedan fuera del índice y por
  tanto nunca salen. La IA gestionada NO pasa por la nube de notas (subsistemas independientes).

## 4. NoteFlow Cloud — nube de notas cifrada (managed | e2ee)

**Decisión (2026-07, revisada): modelo Obsidian Sync — dos modos de cifrado a elegir.** El modo
**estándar "managed"** es el DEFAULT (cero secretos que guardar; el operador custodia la clave y
técnicamente podría leer las notas — se comunica con honestidad en la UI) y el modo **privado
"e2ee"** es opt-in (E2EE estricto con passphrase + recovery: el servidor solo ve ciphertext, ni
el operador puede leer). La decisión original "E2EE total" se relajó porque obligar a todo
usuario a custodiar una passphrase es hostil para el usuario medio; el E2EE queda como feature
diferencial de privacidad, no como peaje.

> **Estado: tramos 1, 2, 3 y 4 implementados + modo dual managed/e2ee.** Tramo 1 (fundación):
> migración `supabase/migrations/0004_cloud.sql` (`user_keys` + `files` + RLS) y
> `electron/cloudCrypto.ts` (capa criptográfica pura, testeada en
> `tests/electron/cloudCrypto.test.ts`). Tramo 2 (motor de sync): `electron/cloudKeys.ts`
> (sesión de claves), `electron/cloudSync.ts` + `electron/cloudSyncLogic.ts` (motor, lógica pura
> testeada en `tests/electron/cloudSync.test.ts`), interfaz `SyncProvider`
> (`electron/syncProvider.ts`) y los IPC `cloud:*`. Tramo 3 (Realtime): migración
> `0006_cloud_realtime.sql` + `electron/cloudRealtime.ts`/`cloudRealtimeLogic.ts` (ver
> "Tiempo real" abajo). Tramo 4 (UI): onboarding con elección de modo
> + panel en Settings → Sync + enforcement visual de la exclusión mutua con GitHub Sync (ver
> "Settings UI" abajo). Modo dual: migración `0005_cloud_managed.sql` + Edge Function
> `cloud-keys` + rama managed en `cloudKeys.ts` (ver "Modos de cifrado" abajo).
> **Migración 0006 aplicada al proyecto real (2026-07-12)** y smoke E2E verificado: edición
> local → push → evento `postgres_changes` → pull reactivo en segundos (vs. tick de 5 min).
> De paso se saneó el tracking remoto de migraciones (`supabase migration repair` de 0001-0005,
> que se habían aplicado por SQL Editor): a partir de ahora `supabase db push` funciona directo.
> **Cursor por `seq` (migración `0008_cloud_seq.sql`):** el pull incremental ya no usa
> `updated_at` como cursor sino un número de cambio asignado por el servidor (ver "Modelo de datos"
> y "Pull incremental" abajo) — **pendiente del operador: aplicarla al proyecto real**
> (`supabase db push`). ⚠️ **Orden de despliegue: aplicar la 0008 ANTES de publicar la
> versión de la app/CLI que la usa** — un cliente nuevo contra un servidor sin la columna recibe 400
> en el pull (error visible, sin pérdida de datos); la 0008 es aditiva y los clientes viejos siguen
> funcionando con ella.
> La suscripción manual de pruebas de Cloud que hubo aquí ya no existe (comprobado 2026-10-19).
> ⚠️ La única fila `provider='manual'` es la **comp permanente del operador**
> (`provider_ref='operator-comp'`, ver § 3 "Cuenta del operador"): **no borrar** filas
> `manual` en bloque.

### Modos de cifrado (managed | e2ee)

- **`managed` (estándar, DEFAULT):** la DEK se genera igual en el cliente, pero se deposita en
  el servidor envuelta por la **KEK del operador** (secret `CLOUD_MANAGED_KEK`, 32 bytes base64,
  solo conocida por la Edge Function `supabase/functions/cloud-keys`; lógica pura en `logic.ts`
  testeada en `tests/supabase/cloud-keys.test.ts`). El usuario no guarda NINGÚN secreto: con
  sesión iniciada el unlock es silencioso y automático. Trade-off honesto (copy de la UI): las
  notas van cifradas en tránsito y en reposo, pero NoteFlow **técnicamente podría** leerlas.
  - `POST cloud-keys/setup` `{dek}` → envuelve e inserta la fila `user_keys` con `mode='managed'`
    (409 si ya hay fila, mismo contrato que el setup e2ee). `POST cloud-keys/unlock` → devuelve
    `{dek}` al dueño de la sesión (404 sin fila; 409 si la fila es e2ee).
    `POST cloud-keys/downgrade` `{dek}` → cambio e2ee → managed (ver bullet de abajo): envuelve
    la DEK que envía el cliente con la KEK del operador y reescribe la fila (404 sin fila; 409
    `already_managed` si ya es managed). **Sin gating por entitlement** (las claves siempre se
    pueden crear/leer, espejo de la RLS de `user_keys`). Se despliega CON verify JWT (default).
  - **Auto-unlock** (`autoUnlockManaged`, single-flight, nunca lanza): se intenta en el boot,
    al pasar a signed-in, desde el tick del autosync y desde la UI (IPC `cloud:auto-unlock`,
    polling de 10 s del panel mientras esté `locked`+managed). **Requisito duro: un usuario
    managed con sesión iniciada jamás ve una pantalla de unlock** (offline → `locked` con
    reintento silencioso). Cache local de la DEK: con `safeStorage` si está disponible; si no,
    simplemente NO se cachea (managed puede re-pedir la DEK al servidor en cada boot).
- **`e2ee` (privado, opt-in):** el flujo original passphrase + recovery code (secciones
  siguientes). El servidor nunca ve la DEK; perder passphrase + recovery = datos irrecuperables.
- **Esquema (migración `0005_cloud_managed.sql`):** columnas de passphrase/recovery de
  `user_keys` pasan a NULLABLE + `mode text not null default 'e2ee'` (default e2ee para que las
  filas preexistentes queden correctas sin backfill) + `dek_managed_ct` (DEK envuelta por la KEK
  del operador, mismo formato de blob sellado) + CHECK `user_keys_mode_coherent` (managed exige
  `dek_managed_ct`; e2ee exige el juego completo passphrase+recovery). RLS sin cambios;
  `dek_managed_ct` lo escribe solo el service role **por convención** (un write directo del
  cliente es inocuo: no conoce la KEK del operador).
- **Upgrade managed → e2ee** (`upgradeCloudKeysToE2ee`, IPC `cloud:upgrade-e2ee`, botón
  "Switch to private mode" del panel): requiere `unlocked`; envuelve la DEK vigente con la nueva
  passphrase + recovery code nuevo y hace PATCH de la fila (`mode='e2ee'`, `dek_managed_ct=NULL`)
  — lo permite la RLS de ownership. La **DEK no cambia** (no se recifra el corpus): las notas ya
  subidas pudieron ser técnicamente accesibles durante el modo managed — se avisa en la UI, no se
  resuelve (rotar la DEK cambiaría todos los `path_key` HMAC → re-upload completo, fuera de
  alcance).
- **Downgrade e2ee → managed** (`downgradeCloudKeysToManaged`, IPC `cloud:downgrade-managed`,
  botón "Switch to standard mode" del panel; decisión de producto 2026-07 — antes no existía
  para no debilitar el cifrado en silencio, ahora existe pero **explícito y confirmado, nunca
  silencioso**): requiere `unlocked` (el cliente envía su DEK vigente a
  `POST cloud-keys/downgrade`, misma confianza que el setup managed); la Edge Function la
  envuelve con la KEK del operador y reescribe la fila vía service role (`mode='managed'`,
  `dek_managed_ct` puesto, y **todas las columnas passphrase/recovery a NULL** — la passphrase y
  el recovery code **dejan de funcionar**, intencionado; el CHECK `user_keys_mode_coherent` de
  la 0005 ya permite ese estado). La DEK tampoco cambia. La UI (CloudPanel) despliega una
  confirmación con un aviso ámbar que lleva las dos advertencias: NoteFlow pasa a poder leer
  técnicamente las notas (incluidas las ya subidas) y los secretos actuales quedan invalidados.
- El estado público (`CloudSyncStatus`) lleva `keysMode: 'managed' | 'e2ee' | null` (null = sin
  fila o aún desconocido); persiste en `settings.cloudSync.keysMode` como cache de arranque.
- **Pendiente del operador (downgrade):** **redesplegar la Edge Function `cloud-keys`**
  (`supabase functions deploy cloud-keys`) para que la ruta `/downgrade` exista en producción;
  sin redeploy el botón del panel devuelve 404 (`not_found`). No hace falta migración nueva.

### Jerarquía de claves (implementada en `electron/cloudCrypto.ts`)
- **Master key (DEK)** aleatoria de 256 bits, generada en cliente al activar la nube.
- **KEK** derivada de una **passphrase** del usuario (PBKDF2-SHA256, 310.000 iteraciones por
  defecto — mismos parámetros que `src/lib/cryptoUtils.ts`, el cifrado por nota; módulo propio
  en `electron/` porque `tsconfig.electron.json` no puede importar de `src/`) que **envuelve**
  la DEK.
- **Recovery code** aleatorio mostrado UNA vez, que también envuelve la DEK (segunda vía de
  acceso). Formato: 6 grupos de 5 chars (`XXXXX-XXXXX-...`), alfabeto de 32 chars sin ambiguos
  (sin 0/O/1/I) → 150 bits de entropía; el input del usuario se normaliza (mayúsculas, sin
  separadores). Perder passphrase + recovery = **datos irrecuperables** — avisar explícitamente
  en UI.
- Las DEK envueltas se guardan en el servidor (tabla `user_keys` de la migración 0004: una fila
  por usuario con `dek_pass_ct`/`pass_salt`/`pass_iterations` + `dek_recovery_ct`/`recovery_salt`/
  `recovery_iterations`) — el servidor nunca ve la DEK. RLS: solo ownership (select/insert/
  update/delete con `auth.uid() = user_id`); las claves deben poder crearse/leerse siempre,
  también sin suscripción activa.
- **Clave por nota desde el día 1**, envuelta por la master key: habilita compartir (re-envolver
  la clave de esa nota para el destinatario) y rotación sin recifrar todo el corpus.
- **Formato de blob sellado** (todas las columnas `*_ct`): `base64url(iv de 12 bytes || AES-256-
  GCM ciphertext+tag)` — IV aleatorio por operación, viaja con el ciphertext.

### Modelo de datos (migraciones `0004_cloud.sql` + `0008_cloud_seq.sql`)
```
files(user_id, path_key, path_ct, content_ct, key_ct, updated_at, deleted, seq,
      PRIMARY KEY (user_id, path_key))
+ índice (user_id, seq) para el pull incremental (0008)
+ índice (user_id, updated_at) de la 0004 (lo siguen usando los clientes anteriores)
```
- `path_key = HMAC-SHA256(subclave de la DEK, relPath)` en base64url — identificador opaco y
  determinista; no filtra títulos/slugs (el relPath actual contiene el título de la nota). La
  subclave HMAC se deriva de la DEK con HKDF (info `'noteflow-cloud-path'`) para no reutilizar
  la DEK cruda en dos usos.
- `path_ct` = relPath cifrado con la clave de la nota (para reconstruir el árbol en un
  dispositivo nuevo).
- `content_ct` = contenido AES-256-GCM (IV aleatorio por escritura).
- `key_ct` = **clave de la nota envuelta por la DEK, duplicada en cada fila**: las filas de una
  misma carpeta de nota comparten la misma clave de nota, pero cada fila lleva su propia copia
  envuelta — la tabla queda auto-contenida (una fila basta para descifrarse) y permite
  re-envolver por nota para compartir/rotar en el futuro.
- `updated_at` **en claro** (solo filtra timing): lo pone el cliente desde el frontmatter y es la
  base de la resolución de conflictos con la **carpeta como unidad** (misma regla que el pull del
  GitHub Sync). **No sirve como cursor** del pull incremental: es la hora de EDICIÓN, no la de
  subida — una fila que llega tarde al servidor (edición offline drenada del journal, reintento,
  segundo dispositivo que sube su corpus viejo al activar Cloud, reloj desfasado) quedaba por debajo
  del cursor de los demás dispositivos y no les llegaba nunca; y como las secciones heredan el
  `updated_at` del ancla, un `note.md` subido después que sus secciones llegaba con un `updated_at`
  IGUAL al cursor y `gt` lo excluía.
- `seq` (0008) = **número de cambio asignado por el servidor**: un trigger `BEFORE INSERT OR UPDATE`
  (`files_assign_seq`, `security definer` + `search_path = ''`, así `authenticated` no necesita
  grants sobre la secuencia `files_change_seq`) le pone SIEMPRE `nextval` e ignora lo que mande el
  cliente. En un upsert de PostgREST se disparan el BEFORE INSERT y el BEFORE UPDATE; la fila queda
  con la seq del UPDATE (huecos: normales). **Orden de commit = orden de seq por usuario:** una
  secuencia sola no lo garantiza (dos transacciones concurrentes pueden commitear al revés y un
  lector que ve la 11 se saltaría la 10 aún no visible), así que antes del `nextval` se toma un
  `pg_advisory_xact_lock` por usuario (`hashtextextended('noteflow.files.seq:' || user_id, 0)`):
  las escrituras de un mismo usuario se serializan hasta el commit; las de usuarios distintos no se
  bloquean. Basta con orden por usuario porque el cursor lo es (RLS). El lock se toma en **dos**
  triggers con la **misma clave** (es reentrante en la transacción):
  - **De sentencia** (`files_lock_user_writes`, `BEFORE INSERT OR UPDATE … FOR EACH STATEMENT`, con
    `auth.uid()` si no es null): se coge **antes de bloquear ninguna fila**. Sin él había
    **deadlock** entre dos escrituras del mismo usuario (reproducido en PG16): en el `PATCH` del
    tombstone Postgres bloquea la fila *antes* de disparar el BEFORE UPDATE de fila, que luego espera
    el advisory lock; mientras, un upsert del mismo usuario ya tiene el lock (desde su BEFORE INSERT
    de fila) y espera esa fila.
  - **De fila** (`files_assign_seq`, con `new.user_id`): cubre escrituras sin JWT (service role).
  Las dos funciones son `security definer` + `search_path = ''` con `EXECUTE` revocado a
  public/anon/authenticated, y la secuencia tiene `revoke all … from public, anon, authenticated`
  (Supabase concede por defecto privilegios sobre las secuencias de `public`; nadie debe poder hacer
  `nextval`/`setval` sobre el cursor). Backfill de la 0008: filas existentes numeradas por
  `(updated_at, path_key)`. Verificado en un Postgres 16 local: upsert, `seq` del cliente ignorada,
  RLS intacta, un segundo escritor del mismo usuario espera al commit del primero y saca una seq
  mayor, y el caso PATCH-tombstone frente a upsert concurrente del mismo usuario ya no hace deadlock
  (sin el trigger de sentencia se reproduce). La 0008 es **aditiva**: los clientes viejos piden
  columnas explícitas y no mandan `seq`, siguen con su cursor por fecha y sus escrituras reciben seq
  igual.
- **RLS con gating por entitlement:** `select` y `delete` solo piden ownership (un usuario cuya
  suscripción caduca sigue pudiendo bajar y borrar sus datos), pero `insert` y `update` exigen
  además fila en `subscriptions` con product `cloud`/`bundle` y `status = 'active'`. Ojo: el
  tombstone (`deleted = true` vía update) también queda gateado — sin suscripción, propagar
  borrados es vía `DELETE` físico.

### Sesión de claves (`electron/cloudKeys.ts`, tramo 2 — implementada)
- `setupCloudKeys(passphrase)`: genera DEK + recovery code, envuelve la DEK con ambas KEKs, sube
  la fila `user_keys` (rechaza si ya existe una — rotación de claves será un flujo explícito
  futuro) y **devuelve el recovery code UNA vez** (jamás se persiste ni se loguea).
- `unlockCloudKeys(secret)`: baja `user_keys` e intenta desenvolver **como passphrase primero**;
  si falla y el input tiene la forma exacta de un recovery code (30 chars normalizados,
  `looksLikeRecoveryCode` en `cloudCrypto.ts` — validado ANTES de derivar, para dar error claro),
  lo intenta como recovery. `lockCloudKeys()` descarta la DEK; estado
  `unlocked | locked | no-keys` (`no-keys` = confirmado que la cuenta no tiene fila `user_keys`).
- **La DEK vive SOLO en memoria del main** — nunca cruza al renderer ni toca disco en claro.
  **Cache de conveniencia (decisión):** la DEK se persiste cifrada con `safeStorage` en
  `settings.cloudSync.encryptedDek` para no pedir la passphrase en cada arranque
  (`initCloudKeys()` la restaura en el boot) — **SOLO si `safeStorage.isEncryptionAvailable()`**;
  jamás con el fallback base64 que se usa para tokens (una master key en base64 en disco anularía
  el E2EE). `lockCloudKeys()` borra también la cache.
- Helper `supabaseRest()` exportado (PostgREST con token fresco por request vía
  `account.getAccessToken()`) — lo reutiliza `cloudSync.ts`.

### Sync engine (`electron/cloudSync.ts` + lógica pura en `cloudSyncLogic.ts`, tramo 2 — implementado)
- Mismo modelo "archivo por ruta relativa" y **misma regla de conflicto** que el GitHub Sync
  (la carpeta de nota es la unidad; decide el `updated:` del `note.md`). `main.ts` enruta por la
  interfaz **`SyncProvider`** (`electron/syncProvider.ts`, ver `sync.md`); **mutuamente
  excluyentes**: si `cloudSync.enabled`, Cloud tiene prioridad y el loop de GitHub se salta
  (enforcement en Settings UI = tramo 4).
- **Sin cola de mutaciones:** Postgres soporta upserts concurrentes — el invariante de
  serialización del GitHub Sync es un workaround de la Contents API que aquí no aplica. Upserts
  directos (`POST /rest/v1/files?on_conflict=user_id,path_key` +
  `Prefer: resolution=merge-duplicates`) con **un** reintento ante error de red/5xx.
- **`updated_at` por fila (decisión):** `note.md` → su propio `updated:` del frontmatter; los
  `.md` de sección → el `updated:` del **ancla de su carpeta** (leído de disco al pushear — así
  todas las filas de una versión de la nota llevan el mismo sello, que es lo que permite a la regla
  de secciones sueltas reconocer "misma versión"); los json de metadatos de raíz → momento de
  escritura. Fallback: momento de escritura. Ojo: los tombstones (`PATCH deleted=true`) ponen
  `updated_at = ahora`.
- **Clave de nota por carpeta:** cache en memoria `dir → noteKey`, sembrada por los pulls y
  poblada bajo demanda (GET del `key_ct` del ancla remota y unwrap; si la nota es nueva, clave
  fresca). Los metadatos de raíz usan clave propia por fila.
- **Deletes = tombstones (decisión):** `PATCH deleted=true, content_ct=''` (el `path_ct`/`key_ct`
  se conservan) para que otros dispositivos se enteren en su pull incremental — **no hay borrado
  por ausencia** (el pull incremental no ve filas "que faltan"). El borrado local aplica la regla
  de seguridad de siempre (`updated <= lastSync`) **más el guard del journal** (abajo). Sin
  entitlement, RLS bloquea el UPDATE → fallback a `DELETE` físico (la fila desaparece sin
  notificar a otros dispositivos — asumido: sin suscripción tampoco pueden pushear). Ojo: el
  tombstone lleva `updated_at = ahora` (hora del borrado), no el `updated` de la nota.
  - **Borrar una nota entera** (`scheduleDeleteDir` → `deleteRemoteDirNow`) necesita las filas de
    la carpeta, pero `path_key` es opaco: `listRemotePaths` lista **todas** las filas vivas
    (`select=path_key,path_ct,key_ct,seq&deleted=eq.false`), descifra rutas y filtra por `<dir>/`.
    El listado va **paginado por keyset sobre `seq`** (`collectSeqPages`, puro en
    `cloudSyncLogic.ts`, el mismo bucle que el pull; espejo en el CLI): antes era un único GET y
    PostgREST lo corta a **1.000 filas** (max-rows de Supabase) → si las filas de la nota quedaban
    fuera, no se tombstoneaba nada, el `deleteDir` se daba por completado y la nota **resucitaba**
    en los demás dispositivos (reproducido en vivo). Cualquier página que falle lanza → el
    `deleteDir` sigue en el journal y se reintenta; nunca se borra a medias dando el journal por
    bueno.
  - **Guard del journal (borrado remoto vs edición local sin subir):** si llega el tombstone del
    **ancla** y hay algún `upsert` pendiente bajo `<dir>/` (`shouldDeletionRuleSkipDir`, el mismo
    guard que la regla de borrado del pull de GitHub), **no** se borra la carpeta. Sin él se perdían
    ediciones (reproducido en vivo): B edita N y su subida falla (queda en el journal); B sube otra
    nota M y `lastSync` pasa por encima del `updated` de N; A borra N; el pull de B ve
    `updated(N) <= lastSync` → `rmSync`, y el reintento del journal **descarta** el upsert porque el
    fichero ya no existe. Lo mismo dentro del debounce de 5 s (el upsert se apunta en el journal al
    **armar** el timer). Además se **resucita la nota a propósito**: `requeueDirForUpload` re-encola
    **todos** los `.md` de la carpeta (debounce + journal, como el catch-up), no solo el pendiente —
    si solo se re-subiera el fichero pendiente, el resto de secciones seguiría tombstoneado y los
    demás dispositivos recibirían un ancla sin sus secciones (el editor las recrearía vacías). Gana
    la edición local, que es lo que promete `shouldApplyRemoteDeletion` ("newer local edits win").
    El tombstone de una **sección suelta** se salta igual si hay un upsert pendiente de **ese**
    fichero (`hasPendingUpsert`, `syncState.ts`): su `updated_at` es la hora del borrado, así que
    `shouldApplyRemoteSection` lo dejaría pasar siempre.
- **Pull incremental por `seq` (0008):** `GET files?select=…,seq&order=seq.asc&seq=gt.<n>&limit=1000`
  con **paginación keyset** (siguiente página desde la última `seq` vista, hasta una página corta) —
  no por offset/`Range`, que se desplaza si se escriben filas a mitad del pull. **Dos marcas
  (decisión):** `pullSeq` = watermark de la máxima `seq` reconciliada y `lastSync` = hora de pared
  del último pull (regla de borrado + UI). Tres modos (`planPullQuery`, puro):
  - `pullSeq` definido → incremental `seq > pullSeq`, **con** tombstones.
  - sin `pullSeq` pero con `pullCursor` (legado, cursor por `updated_at` de versiones anteriores) o
    `lastSync` → **reconciliación completa una vez** desde seq 0 **con** tombstones: recupera lo que
    el cursor viejo se saltó (las reglas de conflicto deciden qué se aplica).
  - sin nada (primer sync) → completa con `deleted=eq.false` (sin `lastSync` no hay nada local que un
    tombstone pueda borrar con seguridad).
  El nuevo watermark es `nextPullSeq(pullSeq, rows)` = máxima `seq` de **todas** las filas traídas
  (también las indescifrables o con ruta insegura: nunca van a volverse aplicables; esperar por ellas
  las re-bajaría siempre), empezando en 0. Tras el primer pull por seq se borra `pullCursor` de los
  ajustes. Las rutas descifradas se sanean (`isSafeCloudRelPath`) antes de tocar disco. Las propias
  escrituras vuelven en el siguiente pull (tienen seq nueva): son no-ops porque el ancla no es más
  nueva y las secciones idénticas no se reescriben.
  ⚠️ **Pendiente:** el cursor avanza aunque una carpeta falle al aplicarse (error de disco) — esa
  fila no se reintenta en este dispositivo. (El listado de borrados ya pagina, ver "Deletes".)
- ⚠️ **Problema conocido (pendiente, también en GitHub): las subidas pisan sin condiciones.** El
  upsert (`merge-duplicates`) escribe aunque el servidor tenga una versión más nueva (o un tombstone)
  que este dispositivo nunca vio: una subida del journal drenada tarde, o el **catch-up del primer
  sync de un segundo dispositivo** (sube su corpus entero), puede pisar una edición o un borrado más
  recientes de otro dispositivo — en la prueba en vivo, el corpus inicial de B resucitó 2 s después
  una nota que A acababa de borrar. Arreglo previsto: **subida condicionada** (comparar con la versión
  remota que se vio por última vez) en los dos backends.
- **Regla de secciones sueltas (pull por carpeta, necesaria con el cursor por seq):** un ancla y sus
  secciones son subidas independientes y pueden caer en pulls distintos (en cualquier orden).
  - El grupo trae el ancla y `shouldApplyRemoteDir` (remota más nueva, o carpeta local inexistente)
    → se escribe el ancla + todas las filas del grupo (como siempre) **+ las secciones que el ancla
    lista, no vienen en el grupo y NO existen en el disco local**: `listAnchorSectionFiles` (puro, `cloudSyncLogic.ts`; espejo en
    el CLI) saca `sections[].file` del frontmatter (fallback `<id>.md`, `[]` si la nota está
    cifrada, solo nombres `.md` planos), y `fetchRemoteRows` las pide en **una** petición
    `path_key=in.(…)` con `CLOUD_PULL_COLUMNS`, las descifra y valida (ruta descifrada = la pedida
    + `isSafeCloudRelPath`; respeta `shouldPullSkipFile`). Se piden **antes** de escribir nada: un
    ancla en disco sin sus ficheros de sección hace que el editor los recree vacíos en la siguiente
    edición y los suba por encima de los buenos. Se escriben las que no son tombstone; una sección
    listada que el servidor aún no tiene (subida pendiente en el origen) se deja como esté y llega
    después por la regla de secciones sueltas (su seq será mayor). Cubre el caso "secciones de una
    nota NUEVA en un pull anterior a su ancla" (ese pull las salta porque `fetchRemoteAnchor` aún no
    encuentra ancla). **Fallo de esa petición (HTTP/red) → aborta el pull entero** (`PullAbortError`
    en la app, error marcado `abortPull` en el CLI; el catch por carpeta lo re-lanza) **sin
    persistir `pullSeq` ni `lastSync`**: el pull es idempotente y el siguiente reintenta desde el
    mismo watermark (avanzarlo perdería esa versión remota en este dispositivo). Las filas que sí
    llegan pero no descifran o no casan con la ruta pedida son errores por carpeta (permanentes) y
    no abortan. **Coste:** una petición extra solo cuando un ancla aplicada lista secciones que
    faltan en disco — no en cada edición: el renderer solo sube las secciones que cambian
    (`src/lib/noteUtils.ts`), y las que ya están en local o están al día o les llega su propia fila
    con seq mayor (regla de secciones sueltas). **Caso límite aceptado:** una sección local
    desfasada en un conflicto en el que el local era estrictamente más nuevo cuando llegó la fila
    remota de esa sección (no se aplicó) y luego llega un ancla remota aún más nueva que no la
    re-sube: se queda la local — rige "la más reciente gana" (LWW) por carpeta, como antes.
  - El ancla del grupo es un **tombstone** → regla de borrado de siempre (`updated <= lastSync`),
    salvo upsert pendiente bajo la carpeta (guard del journal + resurrección, ver "Deletes").
  - El ancla no se aplica (ausente del grupo, o no más nueva) y la carpeta local **existe** → cada
    fila de sección del grupo se aplica **individualmente** si `shouldApplyRemoteSection(sección,
    local)` = `updatedAtMs >= localUpdatedMs` (la sección heredó el `updated` de su versión: `>=`
    cubre "misma versión, la sección llegó después"; con ediciones locales propias el `updated` local
    es estrictamente mayor y se respeta). Un tombstone de sección con esa condición → unlink, salvo
    que haya un upsert pendiente de ese fichero (`hasPendingUpsert`). Respeta los guards del journal
    (`shouldPullSkipDir`/`shouldPullSkipFile`). Antes este caso descartaba el
    grupo entero y el contenido de sección se perdía en silencio.
  - Carpeta local inexistente y grupo sin ancla → `fetchRemoteAnchor`; si existe y no está borrada,
    se aplica como ancla nueva (rama de arriba, con la recogida de secciones listadas); si no, se
    salta — las secciones se recuperarán cuando llegue el ancla.
- **Journal (decisión):** reutiliza las transiciones puras de `electron/syncState.ts` pero
  persiste en su PROPIO `userData/cloud-sync-state.json` (los dos backends no deben reproducirse
  ops mutuamente); el sha-cache no aplica (el pull incremental ya evita trabajo). Pushes con
  claves bloqueadas o offline quedan journaled y drenan tras unlock/reconexión
  (`retrySyncJournal`, mismo contrato que GitHub). Un 403 de RLS (suscripción caducada) se mapea
  a `syncError` accionable y **pausa** el drain de escrituras mientras la entitlement local
  también diga "no cloud" (sin bucle de reintentos).
- Gate de push hasta el primer pull OK (`initialPullStatus`, como GitHub) +
  `flushPendingLocalChanges`: en la PRIMERA sincronización (sin `lastSync` previo) esto sube el
  corpus local entero, metadatos incluidos.
- `disableCloudSync()` conserva `lastSync`/`pullSeq`/journal (re-habilitar retoma incremental
  y los deletes pendientes no se pierden); las claves no se tocan (lock es acción aparte).
- **Tiempo real (tramo 3, implementado):** `electron/cloudRealtime.ts` abre un **WebSocket puro**
  (el `WebSocket` global de Node 22 — sin `@supabase/supabase-js` ni `ws`) contra Supabase
  Realtime (protocolo Phoenix, vsn=1.0.0) y se une a un canal con `postgres_changes` sobre
  `public.files` filtrado `user_id=eq.<uid>` (migración `0006_cloud_realtime.sql` añade la tabla
  a la publicación `supabase_realtime`; sin `replica identity full` — `user_id` está en la PK).
  **El payload del evento NO se aplica en caliente** (es ciphertext): es solo una **señal** que
  `main.ts` debouncea (1,5 s — un push ajeno llega como ráfaga de filas) y convierte en un ciclo
  de sync normal (`runCloudSyncCycle`, single-flight con marca dirty: auto-unlock managed →
  `retrySyncJournal` → skip si hay mutaciones en vuelo → `pullNotes`). Detalles: heartbeat cada
  25 s (ack perdido = reconectar), token JWT fresco en cada reconexión + push `access_token`
  cada 45 min (expiran ~1 h), backoff exponencial con jitter (1 s → cap 60 s, reset al unirse),
  silencioso offline. Lógica pura (frames/clasificación/backoff) en `cloudRealtimeLogic.ts`,
  testeada en `tests/electron/cloudRealtime.test.ts`. **Ciclo de vida:** corre solo con Cloud
  enabled + sesión + claves unlocked — `syncCloudRealtimeState()` en `main.ts` reconcilia en
  cada transición (choke points: `emitCloudStatusChanged` y `handleAccountStatusChanged`; el
  sign-out lo para). El loop periódico queda como **red de seguridad** cada 5 min
  (`CLOUD_AUTO_SYNC_INTERVAL_MS`: cubre WS caído y drena el journal offline). El estado público
  expone `realtimeConnected` (informativo: icono de rayo del pie de la tarjeta de estado del botón
  de sync de la titlebar; unirse/caerse del canal **no emite evento** — la UI lo lee al refrescar).

### Cerrar sesión (sign-out) — implementado

**Principio: sin sesión, la app vuelve a su estado gratuito/local.** Lo de pago se presenta como
oferta, no como posesión rota — pero **no se destruye ni configuración ni datos**. La decisión
(qué apagar/restaurar dados el status previo, el nuevo y el registro) es una **función pura**,
`electron/accountTransition.ts` (`planAccountTransition`, testeada en
`tests/electron/accountTransition.test.ts`); `main.ts` la ejecuta en **cada**
`account:status-changed` (`handleAccountStatusChanged` → `applyAccountTransition`) y aplica el plan.

- **En la transición real `signedIn` true→false** (sign-out explícito **y** refresh token revocado,
  que ya hace `clearSession()` + `notifyStatusChanged()`):
  - **Cloud:** `disableCloudSync()` (`enabled = false`, conserva `lastSync`/`pullSeq`/journal) →
    libera la exclusión mutua y GitHub Sync se reanuda solo si estaba conectado.
  - **Claves:** `resetCloudKeysSession()` (`cloudKeys.ts`) — **borra toda la sesión de claves**: la
    DEK de memoria + la cache `settings.cloudSync.encryptedDek` **y** el estado aprendido
    (`remoteKeysKnown` y `keysMode`, incluido el `keysMode` **persistido**). Cerrar sesión significa
    "esta máquina ya no puede descifrar mis notas". Los tres son **estado de la cuenta que se va**, no
    del dispositivo: heredarlos envenena a la siguiente cuenta que entre en esa máquina — con la DEK
    (`autoUnlockManaged` corta en `if (dek) return false`) leería notas ajenas; con `keysMode='e2ee'`
    heredado, una cuenta managed quedaría **atascada para siempre** en un formulario de passphrase
    (`doAutoUnlockManaged` corta en `keysMode === 'e2ee'` y `unlockCloudKeys` responde "this account
    uses standard encryption") **y reiniciar no lo cura** porque está en disco; con
    `remoteKeysKnown === false` heredado vería el formulario de setup y se comería un 409. Todo se
    re-aprende en el primer auto-unlock de la cuenta nueva.
  - **IA:** si el activo era `noteflow`, vuelve al proveedor BYO/local (ver § 3, "Al cerrar sesión").
  - **Memoria de restauración:** `settings.json` → `accountRestore` =
    `{identity: <email de la sesión que se cierra>, cloudEnabled, aiManaged}`. **Nunca** tokens ni
    secretos: un email y dos booleanos (`parseAccountRestore` lo valida al leerlo).
- **Al volver a iniciar sesión:** si hay registro y la **identidad coincide** (case-insensitive), se
  restaura lo que estaba **condicionado a la entitlement viva** (`cloudEnabled && entitlements.cloud`
  → `enableCloudSync()`; `aiManaged && entitlements.ai` → `aiLlm.active = 'noteflow'`) y el registro
  se **consume**. Si la identidad NO coincide (otra cuenta) el registro se borra sin aplicar nada
  (arranque limpio). ⚠️ Las entitlements llegan **asíncronas** (`initAccount` difiere el refresh 5 s;
  `verifyOtp` las trae al vuelo), así que el registro **se evalúa en cada cambio de status** mientras
  la identidad coincida y solo se consume cuando ya se conocen (`entitlementsFetchedAt`) — evaluar
  contra el placeholder `NO_ENTITLEMENTS` lo tiraría a la basura. Si la entitlement caducó, no se
  restaura nada: la feature simplemente se vuelve a ofrecer.
  - **El pull inicial NO se lanza desde la restauración:** en ese instante la DEK es `null` por
    construcción (el sign-out la soltó), así que un `pullNotes()` inmediato solo dejaría
    `syncError = "Cloud keys are locked"`. Se habilita + `startCloudAutoSync()` y se dispara
    `runCloudSyncCycle()`, que hace el orden correcto: auto-unlock managed → drenar journal → pull.
  - **Corte anti-sorpresa (`clearRestoreSurface`):** una acción **explícita** del usuario logueado
    sobre una de las dos superficies gana sobre el registro y borra **esa mitad** (IPC `cloud:enable`
    / `cloud:disable` → mitad Cloud; `ai:llm-set-config` con `active` → mitad IA). Sin este corte, un
    usuario que entra con el fetch de entitlements caído (el de `verifyOtp` es best-effort y
    `entitlementsFetchedAt` solo vive en memoria), decide dejar Cloud apagado, y ve cómo un
    `refreshEntitlements` posterior (o el diferido de 5 s del siguiente arranque) se lo re-enciende
    por detrás. Por mitades y no todo-o-nada: tocar el asistente no debe tirar la restauración de
    Cloud que sigue esperando a que lleguen las entitlements.
- **UI:** el badge de la tarjeta Cloud (`SyncPanel.tsx`) se deriva de `enabled && signedIn` — con lo
  anterior ese caso ya no debería darse, pero el badge no puede mentir. No hizo falta copy nuevo: los
  estados existentes (`t.settings.cloud.signInFirst`, aviso ámbar `noteflowSignIn` de `LlmConfigView`)
  ya cubren el "sin sesión".

### Settings UI (tramo 4 — implementado)
- **Ubicación:** la página **Settings → Sync** (`SyncPanel.tsx`) empieza por un **selector de
  backend de dos tarjetas** (NoteFlow Cloud / GitHub Sync, patrón visual de las cards de modo de
  cifrado: `aria-pressed` + `border-accent bg-accent/[0.08]`), cada una con un **badge de estado**
  derivado del estado real (Active / Paused / Inactive / Not connected). Debajo se renderiza SOLO
  el panel del backend seleccionado: `src/components/Settings/CloudPanel.tsx` o el componente
  interno `GitHubSyncSection` de `SyncPanel.tsx`. La preselección resuelve **una sola vez** cuando
  llegan ambos status (Cloud enabled → Cloud; si no, GitHub conectado → GitHub; si ninguno →
  Cloud) y nunca vuelve a pisar la elección del usuario. `CloudPanel` no repite su título (lo dice
  la tarjeta): solo su párrafo `desc`. Textos vía i18n `t.settings.cloud.*` +
  `t.settings.sync.*` (`chooseBackendDesc`, `cloudCardDesc`, `githubTitle`, `githubCardDesc`,
  `badgeActive`/`badgePaused`/`badgeInactive`, `pausedByCloud`).
- **El panel renderiza según `keysState` + cuenta:** sin sesión → "sign in en Settings → Account";
  `no-keys` **sin entitlement `cloud`** → el bloque de planes (ver "Gating" abajo), sin onboarding;
  `no-keys` **con entitlement** → onboarding de elección de modo (dos cards, Estándar/managed
  preseleccionada) → botón directo `cloudSetupManaged`, o formulario de passphrase (input +
  confirmación, mínimo 8 chars) → `cloudSetup` → el **recovery code se muestra UNA vez** en un
  bloque ámbar que oculta el resto del panel hasta pulsar "I have saved my recovery code" (vive solo
  en estado local del componente, con botón Copy y aviso rojo de irrecuperabilidad); `locked` → un
  único input acepta passphrase O recovery (el backend distingue) → `cloudUnlock`; `unlocked` →
  badge enabled/disabled + Last sync + `syncError` (rojo, accionable) + botones Enable/Disable,
  Sync now (`cloudPull`, resultado tipo GitHub) y Lock.
- **Gating (decisión):** en la UI se gatean por entitlement `cloud` **el setup/onboarding** (estado
  `no-keys`) y **Enable sync** (estado `unlocked` + disabled). En ambos casos se muestra el MISMO
  bloque (constante `subscriptionGate` de `CloudPanel.tsx`, para que no se separen): mensaje
  "requires subscription" + el compartido `PlanOffers` con Cloud (y Bundle si falta también la
  entitlement `ai`); un plan sin URL en `LEMONSQUEEZY_CHECKOUT_URLS` se queda en "Coming soon". El
  estado sin sesión del panel muestra ese mismo bloque de planes (precios + acceso a Ajustes →
  Cuenta) en vez de solo el "sign in first". El setup se gatea porque **crear claves para una nube
  que no se puede activar no tiene sentido**, y no compromete la recuperación de datos: quien no
  tiene claves tampoco tiene nada subido. **Unlock/Sync now/Disable/Lock NO se gatean** (RLS solo
  bloquea escrituras; un suscriptor caducado tiene que poder desbloquear y bajarse sus datos), y los
  switches de modo managed↔e2ee tampoco. ⚠️ Matiz preexistente (no es del gate): **Sync now solo se
  renderiza con `status.enabled`**, así que un caducado que pulse Disable pierde el pull manual y no
  puede reactivar (el botón Enable sí está gateado) — el camino de salida de datos existe mientras
  no desactive. Ojo: este gating es **solo de la UI del renderer** — los
  IPC `cloud:setup*` y la Edge Function `cloud-keys` siguen sin gate por entitlement (espejo de la
  RLS de `user_keys`). El IPC `account:open-checkout` acepta `'ai' | 'cloud' | 'bundle'` y
  `AccountStatus` expone `aiCheckoutConfigured` / `cloudCheckoutConfigured` /
  `bundleCheckoutConfigured`.
- **Exclusión mutua (visual):** el selector de dos tarjetas ya la comunica (solo un backend
  activo; badge "Paused" en GitHub mientras Cloud esté enabled). Además, dentro del panel de
  GitHub sigue el aviso ámbar "paused while NoteFlow Cloud is enabled" (la config se conserva) y,
  a la inversa, con GitHub conectado, Cloud desbloqueado pero no habilitado **y entitlement
  `cloud`** (o sea, justo cuando activar Cloud está al alcance), aviso de que activar Cloud pausará
  GitHub. El routing real sigue siendo `syncProvider.ts` — la UI solo lo comunica.
- **Reactividad:** `CloudPanel` se suscribe a `onCloudStatusChanged` + `onAccountStatusChanged`;
  `SyncPanel` a `onCloudStatusChanged` (badges + aviso de pausa). El estado *connected* de GitHub
  lo sube `GitHubSyncSection` al padre vía callback: `sync:status-changed` solo se emite para el
  initial pull (`githubSync.onStatusChanged`), no en connect/disconnect.

### Cliente CLI (headless) — implementado

`cli/noteflow.js` incluye su propio cliente Cloud (grupo `noteflow cloud
login|logout|status|setup|push|pull`), sin dependencias (webcrypto + `fetch` de Node ≥18):

- **Sesión propia:** `settings.cliAccount = {email, userId, refreshToken}` (base64 plano, mismo
  trade-off que el token de GitHub del CLI; `chmod 0600` best-effort en POSIX). **Nunca comparte
  `settings.account`** con la app: GoTrue rota el refresh token en cada uso y compartir sesión los
  deslogearía mutuamente. El token rotado se persiste **antes** de usar el access token; un 400/401
  del refresh borra `cliAccount` ("Session expired"). Un access token por invocación (proceso
  one-shot, sin single-flight).
- **Estado propio:** `settings.cliCloud = {enabled, pullSeq, lastSync, userId, pendingUpserts}` (más un
  `pullCursor` legado hasta el primer pull por seq) — cursor/lastSync del CLI, independientes de
  `settings.cloudSync` (cada cliente reconcilia por su cuenta). `userId` es el **dueño** de ese
  cursor y sobrevive al `logout` (que borra `cliAccount` pero conserva cursor/lastSync/userId): un
  re-login con la **misma** cuenta retoma incremental; con **otra** cuenta `cliCloudForUser`
  descarta `pullSeq`/`pullCursor`/`lastSync`/`pendingUpserts` → el siguiente pull es completo (un watermark ajeno
  saltaría, por `seq > pullSeq`, todas las filas de la cuenta nueva por debajo de él). Se aplica en `cloud login` (antes del pull automático) y al inicio de todo pull/reconcile
  Cloud (`bindCliCloudToAccount`).
  - **Dueño desconocido** (estado de antes de guardar `userId`): en `cloud login` se toma como dueño
    el `userId` de la sesión anterior si seguía abierta (re-login sin logout) → reinicia solo si es
    otra cuenta. Si no hay sesión anterior (o en un pull con sesión ya activa) se **adopta** la
    cuenta actual **sin** reiniciar. Motivo: reiniciar no es gratis — sin ningún estado el pull filtra
    `deleted=eq.false`, pierde los tombstones antiguos (las notas borradas en otro sitio se quedan en
    disco) y el siguiente push las **resucita** en remoto (upsert `merge-duplicates` con
    `deleted=false`). Adoptar solo falla para quien cambió de cuenta antes de esta regla, y el coste
    es esconder notas antiguas (intactas en remoto), no destruir datos. Nada más queda ligado a la cuenta en disco: la DEK, las claves por
  nota y el access token viven solo en memoria del proceso. ⚠️ La app de escritorio **no** hace
  este reinicio: `disableCloudSync` conserva `cloudSync.pullSeq`/`lastSync` y el journal sin
  dueño, así que entrar en la app con otra cuenta reutiliza el cursor anterior (pendiente).
- **DEK por invocación, jamás cacheada en disco** (ni la passphrase): managed → `cloud-keys/unlock`
  en cada run; e2ee → passphrase de `NOTEFLOW_CLOUD_PASSPHRASE` o prompt interactivo con eco oculto
  (un input de 30 chars normalizados del alfabeto se trata como recovery code). En e2ee la máquina
  no debe custodiar la clave — ese es el contrato del modo privado en una caja headless.
- **`cloud setup` = solo managed** (deposita la DEK en la Edge Function; 409 si ya hay claves); el
  setup e2ee (recovery code una vez) es exclusivo de la app de escritorio.
- **Crypto y mapeo = puertos 1:1 de `cloudCrypto.ts`/`cloudSyncLogic.ts`** (params idénticos;
  espejo `CLOUD_METADATA_FILES` con los **6** json de raíz — el `METADATA_FILES` de GitHub del CLI
  tiene 5, sin `templates.json`). Interop verificada por round-trip contra los módulos compilados
  de `dist-electron/`. Cuando se importa como módulo (`require`), el CLI exporta esas funciones
  puras para tests.
- **Prioridad Cloud sobre GitHub** (espejo de `syncProvider.ts`): con `cliCloud.enabled` + sesión,
  `noteflow push/pull/status` y el sync automático por comando (`syncPushNoteFiles`, borrados)
  van a Cloud y NO tocan GitHub. Borrados = tombstones `PATCH deleted=true` con fallback a `DELETE`
  físico en 403; un 403 en un upsert corta el push completo con el mensaje de suscripción. El
  listado de `noteflow delete` (`cloudListRemotePaths`) pagina por keyset igual que la app
  (`collectSeqPages`, paridad en `tests/cli/cloudInterop.test.ts`).
- **Journal mínimo (`cliCloud.pendingUpserts`):** el CLI no tiene cola de reintentos (cada subida
  es síncrona dentro del comando), pero sí recuerda las subidas **fallidas**: `syncPushNoteFiles`,
  `cloud push` y la re-subida del pull añaden los relPaths que no llegaron al servidor y los quitan
  cuando suben bien (`nextPendingUpserts`, puro). Hace falta porque el hueco B existe igual: la
  siguiente subida OK de **otra** nota mueve `lastSync` por encima de la edición fallida (y eso se
  mantiene: no avanzar `lastSync` reabriría el bug de resurrección que ese bump evita). En el pull:
  - tombstone del **ancla** con alguna subida pendiente bajo `<dir>/` (`pendingUnderDir`, espejo de
    `shouldDeletionRuleSkipDir`) → la nota **no** se borra y, tras guardar el cursor, se re-sube la
    carpeta entera (resurrección intencionada, como la app); si la re-subida falla, se informa
    ("Run 'noteflow push' to retry") y sigue pendiente. **Toda la carpeta se marca pendiente en la
    MISMA escritura que avanza `pullSeq`** (sobre la lista leída en ese momento, no la del inicio del
    pull, para no perder fallos que registre otro proceso del CLI): si la re-subida se interrumpe
    (Ctrl-C, cuelgue), el tombstone ya no vuelve a llegar y solo ese registro mantiene la carpeta
    protegida y hace que `noteflow push` la re-suba entera — espejo de `requeueDirForUpload` de la
    app, que la apunta en el journal antes de guardar `pullSeq`;
  - tombstone de una **sección suelta** pendiente (`isPendingUpsert`, espejo de `hasPendingUpsert`) →
    se salta;
  - al empezar se descartan las entradas cuyo fichero local ya no existe (no protegen nada).
  `noteflow push` es el reintento (sube todo y limpia lo que llega). Se borra al cambiar de cuenta
  (`cliCloudForUser`, como `pullSeq`). Paridad con los guards de la app en
  `tests/cli/syncState.test.ts`.
- **Gate de pull inicial:** sin `pullSeq`, `pullCursor` ni `lastSync` (nunca reconciliado), el
  primer push ejecuta antes un pull automático ("First Cloud reconcile…") — un disco viejo no machaca
  un remoto más nuevo. Pull incremental idéntico al de la app (keyset por `seq` con los mismos tres
  modos de `planPullQuery`, ancla decide, regla de secciones sueltas, regla de borrado
  `updated <= lastSync` + los guards de `pendingUpserts`, ver "Journal mínimo" —,
  watermark = `nextPullSeq`); paridad fijada en `tests/cli/cloudInterop.test.ts`.
  `noteflow cloud status --json` expone `pullSeq` (y `pullCursor`, legado, `null` tras el primer pull
  por seq).
- **Pull tras `cloud login`:** solo con claves **managed** (la DEK se desbloquea sin prompt) el login
  encadena un `cmdCloudPull()` best-effort — un fallo se reporta (`Run 'noteflow pull' to retry`)
  sin invalidar la sesión ya guardada; `--no-pull` lo omite. Con **e2ee** o sin claves no hay pull
  (pediría la passphrase en mitad del login).

### Futuro (no-foco, solo dejar la puerta abierta)
- **Historial de versiones:** tabla `file_versions` (insert del cliente en cada push; blobs
  cifrados, retención N días/versiones). Con E2EE no hay diffs server-side — versiones opacas.
- **Compartir notas:** re-envolver la clave de la nota para otro usuario + RLS (por eso
  clave-por-nota desde el inicio).
- **Acceso web:** requeriría crypto client-side en el navegador; posible pero lejos del roadmap.

## 5. Roadmap por fases

| Fase | Contenido |
|---|---|
| **4.0 Fundación** | ✅ **Desplegada y operativa** (cuenta en la app, AccountPanel, esquema `subscriptions` + RLS, proyecto Supabase real conectado, webhook `billing-webhook` de Lemon Squeezy con productos/variantes reales dados de alta) |
| **4.1 IA gestionada** | ✅ **Desplegada y operativa** (Edge Function `ai-proxy` en producción + migración 0003 + preset `noteflow` + cuotas/metering + botón de suscripción + auto-activación del preset al suscribirse + **selector excluyente de fuente del asistente** en `LlmConfigView` (NoteFlow AI vs proveedor propio/IA local) — ver § 3). Probada end-to-end. **Ampliación (código listo, pendiente de correr 0007 + redeploy):** catálogo con modelos avanzados + chinos, **cuota ponderada** (`quota_tokens`, multiplicadores ×1/×2/×6 — ver § 3), endpoint `/usage` + **barra de consumo en la UI** (la sección NoteFlow AI ya la muestra vía IPC `ai:llm-usage`) |
| **4.2 Nube cifrada** | 🔨 **En curso — tramos 1, 2, 3 y 4 hechos + modo dual managed/e2ee:** fundación criptográfica (`cloudCrypto.ts` + tests) + esquema de servidor (migraciones 0004-0006) + **motor de sync** (`cloudKeys.ts`, `cloudSync.ts`/`cloudSyncLogic.ts` con tests, interfaz `SyncProvider`, IPC `cloud:*`) + **Realtime** (`cloudRealtime.ts`/`cloudRealtimeLogic.ts` con tests: push por WS + loop de seguridad 5 min) + **modos managed/e2ee** (Edge Function `cloud-keys`, default managed sin secretos, E2EE opt-in, upgrade one-way) + **Settings UI** (`CloudPanel.tsx`: onboarding con elección de modo, unlock, enable/disable/pull/lock, switch a modo privado, enforcement visual de la exclusión con GitHub Sync). **Desplegado (2026-07-12):** migraciones 0004-0006 aplicadas en el proyecto real, secret `CLOUD_MANAGED_KEK` puesto, Edge Function `cloud-keys` ACTIVE (verify JWT) y **smoke E2E del realtime verificado** (edición → evento → pull reactivo en segundos). El producto Cloud (y el Bundle) ya existen en Lemon Squeezy y sus checkout URLs (de live desde 2026-10-19) están pobladas en `cloudConfig.ts` → los planes ofrecen botón Subscribe (ver § 3, "Billing en live mode") |
| **4.3 Futuro** | Historial de versiones, compartir notas, ¿acceso web? |

## 6. Fase 4.0 — implementación (parte cliente/repo)

**Sin dependencias nuevas:** nada de `@supabase/supabase-js` — GoTrue (Auth) y PostgREST son REST
puro vía `fetch` desde el proceso main.

- **`supabase/migrations/0001_foundation.sql`** — tabla `public.subscriptions` (`product`
  `'ai'|'cloud'|'bundle'`, `status` `'active'|'past_due'|'canceled'|'expired'`, `provider`,
  `provider_ref`, `renews_at`) + índice por `user_id` + RLS con **una única policy `select`**
  (`auth.uid() = user_id`). Sin policies de escritura: solo el service role (webhook del MoR,
  fase 4.1+) escribirá.
- **`supabase/README.md`** — pasos del operador: crear proyecto → correr migración → habilitar
  provider Email + SMTP propio y editar **DOS plantillas** — **"Confirm signup"** (usuarios
  nuevos) y **"Magic Link"** (existentes) — para enviar `{{ .Token }}` (por defecto mandan
  enlace, no código; con solo "Magic Link" editada, los usuarios nuevos reciben el enlace de
  confirmación en vez del código) → copiar URL + anon key a `cloudConfig.ts`.
- **`electron/cloudConfig.ts`** — `SUPABASE_URL` / `SUPABASE_ANON_KEY` (ya con los valores del
  proyecto real) + `isCloudConfigured()`. La anon key es pública por diseño (como el client ID de
  GitHub); la seguridad la da RLS.
- **`electron/account.ts`** — capa de sesión, espejo estructural de `githubSync.ts`:
  - Persistencia en `settings.json` sección `account` = `{email, userId, encryptedRefreshToken}`;
    el refresh token se cifra reutilizando `encryptSecret/decryptSecret` de
    `electron/ai/llm/secret.ts` (safeStorage + fallback base64). El **access token vive solo en
    memoria** con su expiry.
  - `requestOtp` (`POST /auth/v1/otp`, `create_user: true`), `verifyOtp`
    (`POST /auth/v1/verify`, `type:'email'`; guarda sesión + primer fetch de entitlements),
    `getAccessToken` (refresca si expira en <60 s vía `/auth/v1/token?grant_type=refresh_token`;
    **GoTrue rota el refresh token → se persiste siempre el nuevo**, con single-flight para evitar
    carreras; 400/401 = revocado → limpia sesión y notifica), `signOut` (logout best-effort +
    limpiar), `refreshEntitlements` (`GET /rest/v1/subscriptions` con RLS), `getAccountStatus`
    (estado público, **nunca** tokens), `onStatusChanged`, `initAccount` (al arrancar, si hay
    sesión: refresh de entitlements diferido 5 s, no bloquea el boot).
- **`electron/entitlements.ts`** — `computeEntitlements(rows)` pura: producto activo si hay fila
  con ese product (o `bundle`) y `status === 'active'`. Vive en `electron/` (no `src/lib/`) porque
  `tsconfig.electron.json` (`rootDir: 'electron'`) no puede importar de `src/` y el renderer solo
  ve los booleanos derivados. Testeada en `tests/electron/entitlements.test.ts`.
- **IPC** — handlers `account:get-status` / `account:request-otp` / `account:verify-otp` /
  `account:sign-out` / `account:refresh-entitlements`; evento `account:status-changed` (broadcast
  del status público a todas las ventanas, patrón `sync:status-changed`). Bridge en `preload.ts`
  (`getAccountStatus`, `accountRequestOtp`, `accountVerifyOtp`, `accountSignOut`,
  `accountRefreshEntitlements`, `onAccountStatusChanged`) y tipos `AccountStatus` /
  `AccountEntitlements` en `src/types/index.ts`.
- **Errores tipados (`AccountErrorCode`)** — `AccountOpResult` lleva, además del `error` en inglés
  (fallback para logs), un **`errorCode`** de una unión cerrada (`notConfigured`, `invalidEmail`,
  `emptyCode`, `invalidCode`, `rateLimited`, `network`, `unexpectedResponse`, `sendFailed`,
  `verifyFailed`, `notSignedIn`, `refreshFailed`, `checkoutUnavailable`, `checkoutInvalidUrl`) para
  que el renderer pinte el mensaje **en el idioma de la app** en vez del string crudo de GoTrue.
  La unión está **triplicada** (main `electron/account.ts` → renderer `src/types/index.ts` → una
  clave por código en `settings.account.errors` de los dicts EN/ES) y el espejo lo fija el test
  `tests/electron/accountErrorCodes.test.ts`. **No hay `expiredCode`:** GoTrue responde a un código
  equivocado y a uno caducado con el mismo payload (`error_code: otp_expired` / "Token has expired
  or is invalid"), así que `invalidCode` cubre ambos y la UI ofrece reenviar.
- **UI** — `src/components/Settings/AccountPanel.tsx` (sección "Account" en `SettingsModal`,
  textos vía i18n `t.settings.account.*`): no configurado → placeholder informativo; signed out →
  email → código de 6 dígitos; signed in → email + badges de plan + el bloque compartido
  `PlanOffers` con los **planes y sus precios** (Bundle/AI/Cloud — ver § 3 "UI" y § visión
  "Precios") + Refresh + Sign out.
  **Dos superficies de error, nunca a la vez:** la caja roja de arriba (`error`) para el paso de
  email, refresh y checkout (`handleSignOut` ignora el resultado de `accountSignOut()`: no pinta
  error, solo lo limpia); e **inline bajo el input del código** (`codeError`) para el
  paso de verificación — icono `AlertCircle`, borde rojo + `animate-shake` en el input,
  `aria-invalid` + `aria-describedby`/`role="alert"`, contenido seleccionado al fallar (retecleo
  directo) y limpieza del error al escribir. Ese paso incluye **"Resend code"**
  (`sendCode('resend')`, misma llamada `accountRequestOtp` sin volver al paso de email) con
  cooldown local de 30 s — el rate-limit real lo pone GoTrue y llega como `rateLimited`.
