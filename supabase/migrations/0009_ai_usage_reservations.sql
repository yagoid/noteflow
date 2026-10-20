-- NoteFlow — Fase 4.1 (NoteFlow AI): coste acotado — reservas + límite de concurrencia
--
-- Problema que arregla: el proxy (Edge Function ai-proxy) comprobaba la cuota
-- (`used >= limit`) ANTES de reenviar y solo insertaba el consumo cuando
-- terminaba el stream. Dos agujeros con dinero real:
--   (a) cientos de peticiones en paralelo con un max_tokens enorme pasaban
--       todas el check (ninguna estaba medida todavía);
--   (b) una petición que dura más que el wall clock de la Edge Function
--       (150-400 s) muere antes del chunk final de `usage` → no se mide nada.
--
-- Arreglo: RESERVA antes de reenviar. La RPC reserve_ai_usage, bajo un advisory
-- lock de transacción POR USUARIO (las peticiones paralelas de un mismo usuario
-- se serializan en el check; las de usuarios distintos no se bloquean):
--   * suma el consumo del mes (misma definición que get_month_usage — las
--     reservas pendientes INCLUIDAS) y rechaza con 'quota' si used >= p_limit;
--   * cuenta las reservas en vuelo (pending y más recientes que p_stale_minutes)
--     y rechaza con 'concurrency' si ya hay p_max_inflight;
--   * si pasa, inserta una fila `pending` cargada con la ESTIMACIÓN ponderada
--     (quota_tokens = estimate; tokens_in/out = 0) y devuelve su id.
-- Cuando llega el `usage` real, la Edge Function la LIQUIDA (PATCH: tokens
-- reales, quota_tokens real, cost_usd, generation_id, pending=false). Si el
-- upstream falla antes de generar (no factura), la libera (liquida a 0). Si no
-- llega nunca el usage (isolate matado), la reserva SE QUEDA: la estimación
-- sigue cobrada contra la cuota, pero pasado p_stale_minutes deja de contar
-- como "en vuelo" para el límite de concurrencia.
--
-- Columnas nuevas en usage_events:
--   * pending: default FALSE a propósito — durante la ventana migrar → redeploy,
--     la función VIEJA sigue insertando filas finales sin conocer la columna, y
--     deben quedar como finales (no como reservas en vuelo).
--   * cost_usd: `usage.cost` de OpenRouter (créditos ≈ USD) — monitorización de
--     gasto del operador (ver supabase/README.md § 6).
--   * generation_id: id de la generación de OpenRouter ("gen-…"), para cruzar
--     con su dashboard / endpoint /generation.
--
-- ⚠️ Orden de despliegue: aplicar esta migración ANTES de redesplegar ai-proxy
-- (la función nueva llama a reserve_ai_usage y escribe las columnas nuevas; la
-- vieja es compatible con el esquema nuevo).

alter table public.usage_events
  add column pending boolean not null default false,
  add column cost_usd numeric,
  add column generation_id text;

-- Consulta de "reservas en vuelo de ESTE usuario" (índice parcial: solo las
-- filas pending, que son pocas y de vida corta).
create index usage_events_pending_user_at_idx
  on public.usage_events (user_id, at)
  where pending;

create or replace function public.reserve_ai_usage(
  p_user_id uuid,
  p_model text,
  p_quota_tokens bigint,
  p_limit bigint,
  p_max_inflight int,
  p_stale_minutes int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used bigint;
  v_inflight int;
  v_id bigint;
begin
  -- Serializa las reservas del MISMO usuario hasta el commit: sin esto, N
  -- peticiones simultáneas leerían todas el mismo `used` y pasarían todas.
  -- Clave de 64 bits propia (prefijo distinto del lock de files.seq de la 0008).
  perform pg_advisory_xact_lock(hashtextextended('ai_usage:' || p_user_id::text, 0));

  -- Misma definición que get_month_usage (0007): reservas pendientes incluidas.
  select coalesce(sum(quota_tokens), 0)::bigint
    into v_used
    from public.usage_events
   where user_id = p_user_id
     and at >= date_trunc('month', now());

  if v_used >= p_limit then
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

  insert into public.usage_events (user_id, model, tokens_in, tokens_out, quota_tokens, pending)
  values (p_user_id, p_model, 0, 0, greatest(coalesce(p_quota_tokens, 0), 0), true)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'reason', null, 'used', v_used, 'id', v_id);
end;
$$;

-- Solo el service role (la Edge Function ai-proxy) puede invocarla — mismo
-- patrón de permisos que apply_subscription_event (0002) y get_month_usage
-- (0003/0007): PostgREST expone como RPC toda función con EXECUTE, así que hay
-- que revocar el grant implícito a PUBLIC (y por extensión anon/authenticated).
revoke execute on function public.reserve_ai_usage(uuid, text, bigint, bigint, int, int)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_usage(uuid, text, bigint, bigint, int, int)
  to service_role;
