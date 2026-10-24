-- NoteFlow — Fase 4.1 (NoteFlow AI): cuota mensual por COSTE REAL en USD + catálogo nuevo
--
-- Hasta ahora la cuota mensual contaba tokens PONDERADOS (0007: tokens reales ×
-- multiplicador del modelo, 3M al mes). El multiplicador era una aproximación del
-- precio que se desalineaba en cuanto cambiaban los precios del catálogo: con los
-- precios de OpenRouter, agotar 3M tokens con Haiku a ×1 costaba más que el neto de
-- una suscripción, y Kimi a ×6 dejaba ~33 mensajes al mes sin motivo. Desde esta
-- migración la cuota es un PRESUPUESTO de coste real por usuario y mes (en USD,
-- `AI_MONTHLY_BUDGET_USD` de la Edge Function, default 2): cada petición descuenta lo
-- que OpenRouter cobró por ella (`usage.cost`, que ya incluye tokens de razonamiento
-- y descuentos de caché). Un modelo caro, simplemente, gasta el presupuesto antes.
--
-- usage_events:
--   * quota_usd (nueva): lo que la fila carga contra la cuota — la ESTIMACIÓN mientras
--     la reserva está `pending`, el coste real al liquidar (usage.cost; si no viene,
--     tokens reales × precio de lista del catálogo), 0 al liberar.
--   * La cuota del mes = sum(coalesce(quota_usd, cost_usd, 0)) del mes. Sin backfill:
--     las filas anteriores (y las que siga escribiendo la función vieja en la ventana
--     migrar → redeploy) cuentan por su cost_usd, que la 0009 ya guarda; las reservas
--     pendientes de la función vieja (sin quota_usd ni cost_usd) cuentan 0.
--   * quota_tokens (0007) queda como dato informativo: la función nueva guarda ahí los
--     tokens reales sin ponderar (in + out) y 0 en la reserva.
--
-- RPC nuevas (solo service role, como las de 0007/0009):
--   * reserve_ai_cost: clon de reserve_ai_usage (0009) sobre la suma en USD — mismo
--     advisory lock por usuario (MISMA clave, así que en la ventana de despliegue las
--     reservas de la función vieja y de la nueva se serializan entre sí) y mismo
--     límite de concurrencia. SIN tolerancia: rechaza con 'quota' si ya no queda nada
--     (used >= límite) o si la estimación de la petición no cabe en lo que queda
--     (used + estimación > límite) — el presupuesto solo puede excederse cuando la
--     estimación se queda corta frente al coste real. Inserta la fila `pending` con
--     quota_usd = estimación.
--   * get_month_cost: USD consumidos en el mes en curso (reservas incluidas), para
--     GET /usage. La Edge Function lo devuelve escalado a unidades legacy (límite
--     3.000.000) para no romper los builds internos/QA de main anteriores al catálogo
--     en BD (b74fad0), que pintan "X / 3M tokens"; ninguna release pública los trae.
--   reserve_ai_usage y get_month_usage NO se borran: la función vieja las sigue
--   llamando entre que se aplica esta migración y se redespliega ai-proxy.
--
-- ai_models (0012) — columnas nuevas:
--   * price_in_usd / price_out_usd: precio de LISTA de OpenRouter en USD por 1M tokens
--     de entrada / salida. Solo sirven para ESTIMAR la reserva (y como coste de
--     respaldo si OpenRouter no informa usage.cost); lo cobrado es usage.cost.
--     Nullable en SQL, pero el proxy IGNORA una fila habilitada sin precio.
--   * reasoning_effort: esfuerzo de razonamiento que el proxy INYECTA en la petición
--     (`reasoning: {effort}`); null = no se envía (default del modelo). El cliente no
--     puede pedir razonamiento (el proxy descarta su campo `reasoning`).
--   * recommended: destacado en el selector de la app y modelo de referencia del
--     índice de coste relativo (cost_index) que sirve GET /models.
--   * replaced_by: sucesor de un modelo RETIRADO. El proxy reescribe las peticiones al
--     id retirado hacia su sucesor (siguiendo cadenas cortas, sin ciclos), así que ni
--     los builds internos/QA de main anteriores a b74fad0 (catálogo hardcodeado,
--     deepseek-v4-pro por defecto) ni un cliente con la caché de catálogo antigua
--     reciben 400 model_not_allowed tras la rotación.
--   * quota_multiplier queda OBSOLETO para la función nueva (no lo lee). Sigue NOT
--     NULL sin default, y el catálogo de abajo lo siembra con valores REALISTAS (el
--     cost_index: deepseek 1, luna 2, haiku 1, mimo 2, sol 30) para que la función
--     VIEJA — que sí lo usa para su cuota ponderada — no cobre sol a ×1 durante la
--     ventana migrar → redeploy ni tras un rollback de ai-proxy.
--
-- ⚠️ Orden de despliegue: aplicar esta migración y redesplegar ai-proxy JUSTO después.
--   * La función nueva llama a reserve_ai_cost y lee las columnas nuevas: sin la
--     migración respondería 500 (quota_check_failed) a todo chat.
--   * La función vieja es compatible con el esquema nuevo, pero en la ventana entre
--     ambos pasos sirve el catálogo nuevo SIN alias (no conoce replaced_by): quien pida
--     un modelo retirado (los builds internos/QA anteriores a b74fad0 por defecto)
--     recibe 400 model_not_allowed desde que la caché de catálogo de la función vieja
--     (60 s) recoge la tabla nueva hasta el redeploy; y cobra con quota_multiplier
--     (por eso se siembra realista). Por eso los dos pasos van seguidos.
--
-- Re-ejecución: como en 0009/0012, los `add column` / `add constraint` / `create
-- function` sin `or replace`… NO son re-ejecutables (fallan si ya existen); solo el
-- INSERT del catálogo (upsert) y el UPDATE de retirados dejan el mismo estado si se
-- vuelven a correr sueltos.
--   * AI_MONTHLY_BUDGET_USD es opcional (default 2). AI_MONTHLY_TOKENS deja de usarse.

-- ── usage_events: cargo en USD ───────────────────────────────────────────────

alter table public.usage_events
  add column quota_usd numeric;

-- USD consumidos por el usuario en el mes natural en curso (reservas pendientes
-- incluidas). Misma ventana temporal que get_month_usage (0003/0007).
create or replace function public.get_month_cost(p_user_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(coalesce(quota_usd, cost_usd, 0)), 0)::numeric
    from public.usage_events
   where user_id = p_user_id
     and at >= date_trunc('month', now());
$$;

revoke execute on function public.get_month_cost(uuid)
  from public, anon, authenticated;
grant execute on function public.get_month_cost(uuid)
  to service_role;

create or replace function public.reserve_ai_cost(
  p_user_id uuid,
  p_model text,
  p_estimate_usd numeric,
  p_limit_usd numeric,
  p_max_inflight int,
  p_stale_minutes int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used numeric;
  v_inflight int;
  v_id bigint;
begin
  -- Misma clave que reserve_ai_usage (0009): las reservas del MISMO usuario se
  -- serializan hasta el commit, también entre la función vieja y la nueva.
  perform pg_advisory_xact_lock(hashtextextended('ai_usage:' || p_user_id::text, 0));

  -- Misma definición que get_month_cost: reservas pendientes incluidas.
  select coalesce(sum(coalesce(quota_usd, cost_usd, 0)), 0)::numeric
    into v_used
    from public.usage_events
   where user_id = p_user_id
     and at >= date_trunc('month', now());

  -- Sin tolerancia: hace falta que la estimación ENTERA quepa en lo que queda.
  if v_used >= p_limit_usd
     or v_used + greatest(coalesce(p_estimate_usd, 0), 0) > p_limit_usd then
    return jsonb_build_object('ok', false, 'reason', 'quota', 'used', v_used, 'id', null);
  end if;

  select count(*)
    into v_inflight
    from public.usage_events
   where user_id = p_user_id
     and pending
     and at > now() - make_interval(mins => p_stale_minutes);

  if v_inflight >= p_max_inflight then
    return jsonb_build_object('ok', false, 'reason', 'concurrency', 'used', v_used, 'id', null);
  end if;

  insert into public.usage_events (user_id, model, tokens_in, tokens_out, quota_tokens, quota_usd, pending)
  values (p_user_id, p_model, 0, 0, 0, greatest(coalesce(p_estimate_usd, 0), 0), true)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'reason', null, 'used', v_used, 'id', v_id);
end;
$$;

revoke execute on function public.reserve_ai_cost(uuid, text, numeric, numeric, int, int)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_cost(uuid, text, numeric, numeric, int, int)
  to service_role;

-- ── ai_models: precios, razonamiento, recomendado y sucesor ──────────────────

alter table public.ai_models
  add column price_in_usd numeric check (price_in_usd >= 0),
  add column price_out_usd numeric check (price_out_usd >= 0),
  add column reasoning_effort text
    check (reasoning_effort in ('none', 'minimal', 'low', 'medium', 'high')),
  add column recommended boolean not null default false,
  add column replaced_by text references public.ai_models(id),
  add constraint ai_models_replaced_by_not_self check (replaced_by is null or replaced_by <> id);

-- Catálogo nuevo: mismo orden, precios, esfuerzo, visión y recomendado que
-- FALLBACK_MODEL_CATALOG (supabase/functions/ai-proxy/logic.ts) y
-- NOTEFLOW_AI_MODELS / NOTEFLOW_AI_MODEL_META (electron/ai/llm/presets.ts) —
-- tests/supabase/ai-catalog-mirror.test.ts lo comprueba. Precios de lista de
-- OpenRouter (USD / 1M tokens) consultados el 2026-10-24. El PRIMERO es el modelo
-- por defecto. `on conflict do update` (y no `do nothing` como en la 0012): gpt-5.6-luna
-- ya existía y necesita sus precios y su nueva posición; re-ejecutar este INSERT deja
-- el mismo estado. quota_multiplier (obsoleto para la función nueva) = el cost_index
-- del modelo, para que la función VIEJA cobre algo realista (ver cabecera).
insert into public.ai_models
  (id, quota_multiplier, images, enabled, sort_order, price_in_usd, price_out_usd, reasoning_effort, recommended)
values
  -- Recomendado. Tarifa punta ×2 entre semana (01-04 y 06-10 UTC): aquí el precio
  -- base; lo cobrado de verdad lo da usage.cost.
  ('deepseek/deepseek-v4.1-flash-1017',  1, true, true, 10, 0.15,  0.60,  null,  true),
  ('openai/gpt-5.6-luna',                2, true, true, 20, 0.20,  1.20,  null,  false),
  ('anthropic/claude-haiku-5.5',         1, true, true, 30, 0.10,  0.50,  null,  false),
  ('xiaomi/mimo-v2.6-pro',               2, true, true, 40, 0.435, 0.87,  null,  false),
  -- El más listo y, con diferencia, el más caro: gasta la asignación mucho antes.
  ('openai/gpt-5.6-sol',                30, true, true, 50, 4.00,  20.00, 'low', false)
on conflict (id) do update set
  quota_multiplier = excluded.quota_multiplier,
  images           = excluded.images,
  enabled          = excluded.enabled,
  sort_order       = excluded.sort_order,
  price_in_usd     = excluded.price_in_usd,
  price_out_usd    = excluded.price_out_usd,
  reasoning_effort = excluded.reasoning_effort,
  recommended      = excluded.recommended;

-- Retirados, con sucesor (el proxy reescribe sus peticiones). Mismos pares que
-- FALLBACK_MODEL_ALIASES (logic.ts) — también lo comprueba el test de espejo.
update public.ai_models as m
   set enabled = false,
       replaced_by = v.successor
  from (values
    ('deepseek/deepseek-v4-pro',   'deepseek/deepseek-v4.1-flash-1017'),
    ('deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4.1-flash-1017'),
    ('xiaomi/mimo-v2.5-pro',       'xiaomi/mimo-v2.6-pro'),
    ('anthropic/claude-haiku-4.5', 'anthropic/claude-haiku-5.5'),
    -- Grok sale del catálogo: a $2/$6 por 1M daba ~50-75 mensajes al mes.
    ('x-ai/grok-4.5',              'openai/gpt-5.6-sol'),
    ('moonshotai/kimi-k3',         'openai/gpt-5.6-sol')
  ) as v(id, successor)
 where m.id = v.id;
