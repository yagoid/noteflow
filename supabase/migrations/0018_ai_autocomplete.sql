-- NoteFlow — Fase 4.1 (NoteFlow AI): autocompletado con IA en el editor
--
-- La Edge Function ai-proxy gana la ruta POST …/autocomplete: el cliente manda solo el
-- texto alrededor del cursor y el servidor construye la petición entera (prompt, modelo
-- —Haiku—, max_tokens, razonamiento desactivado). Cada sugerencia cuesta ≈ $0,0001
-- (~660 tokens de entrada, 20-40 de salida), y un usuario que escribe genera cientos
-- al día. Dos decisiones de esta migración salen de ahí:
--
--   1. TABLA AGREGADA, no una fila por sugerencia. `usage_events` (0003) guarda una
--      fila por petición de chat; hacer lo mismo aquí llenaría los 500 MB del plan
--      gratis de Supabase. `ai_autocomplete_daily` tiene UNA fila por usuario y día
--      (UTC) con contadores que se van sumando (RPC record_autocomplete_cost).
--
--   2. SIN RESERVA ni fila `pending`. El chat reserva antes de reenviar (0009/0013)
--      porque una petición puede costar céntimos o dólares y hay que acotar el exceso.
--      Aquí la petición más cara posible (contexto recortado en el servidor a ~2.000
--      caracteres + 48 tokens de salida) cuesta ≤ ~$0,0002, así que basta con una
--      COMPROBACIÓN previa de lo ya gastado (RPC get_autocomplete_budget) y sumar el
--      coste real al terminar. El exceso posible sobre el techo es el de las peticiones
--      que estén en vuelo en el momento de alcanzarlo (unas pocas × $0,0002). A cambio:
--        * ninguna sugerencia ocupa hueco de AI_MAX_INFLIGHT (las filas `pending` son lo
--          que cuenta la concurrencia del chat) ni puede dar 429
--          too_many_concurrent_requests a un chat;
--        * no se toma el advisory lock por usuario de reserve_ai_cost, así que teclear
--          no serializa ni retrasa las peticiones de chat;
--        * una petición = una lectura + un upsert, sin PATCH de liquidación.
--
-- Presupuesto:
--   * El gasto de autocompletado CUENTA en el presupuesto mensual total: get_month_cost
--     y reserve_ai_cost (0013) se redefinen aquí —MISMA firma, mismos permisos— para
--     sumar también `ai_autocomplete_daily.cost_usd` del mes en curso.
--   * Además el autocompletado tiene un TECHO propio: una fracción del presupuesto
--     (`AI_AUTOCOMPLETE_SHARE` de la Edge Function, default 0,3 = 30 %). Es un techo, no
--     una reserva: el chat puede gastar el 100 %. La decisión (¿queda presupuesto total?,
--     ¿queda techo de autocompletado?) la toma la Edge Function con los dos números que
--     devuelve get_autocomplete_budget (función pura decideAutocompleteQuota de
--     supabase/functions/ai-proxy/logic.ts): así la regla vive en un solo sitio, testeado.
--
-- Mes en curso: `usage_events` se filtra por `at >= date_trunc('month', now())` (como en
-- la 0013); la tabla diaria por `day >= date_trunc('month', now() at time zone 'utc')`.
-- Las dos ventanas coinciden porque la BD de Supabase corre en UTC.
--
-- ⚠️ Orden de despliegue: aplicar esta migración ANTES de redesplegar ai-proxy.
--   * Aplicarla sola NO rompe el proxy desplegado: get_month_cost y reserve_ai_cost
--     conservan firma, tipo de retorno y forma del resultado, y con la tabla vacía
--     devuelven lo mismo que antes.
--   * La función nueva sin la migración respondería 500 (quota_check_failed) a
--     POST /autocomplete; el chat seguiría funcionando, y GET /usage también (sin el
--     campo `autocomplete`: cae a get_month_cost).
--   * Redesplegar también delete-account DESPUÉS de la migración: borra las filas de
--     ai_autocomplete_daily, y contra una BD sin la tabla respondería 500.
--
-- Re-ejecución: las funciones (`create or replace`), la policy (`drop … if exists`) y los
-- grants dejan el mismo estado si se vuelven a correr. El `create table` no es
-- re-ejecutable (como en el resto de migraciones).

-- ── Consumo agregado por usuario y día ───────────────────────────────────────

create table public.ai_autocomplete_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Día UTC del consumo.
  day date not null,
  -- Sugerencias servidas (las que llegaron a generar en el upstream).
  requests integer not null default 0,
  tokens_in bigint not null default 0,
  tokens_out bigint not null default 0,
  -- Coste real en USD (usage.cost de OpenRouter; si no vino, tokens × precio de lista).
  cost_usd numeric not null default 0,
  -- La consulta caliente —"lo de ESTE usuario desde principio de mes"— la sirve la PK.
  primary key (user_id, day)
);

alter table public.ai_autocomplete_daily enable row level security;

-- Única policy: cada usuario LEE su propio consumo (mismo criterio que usage_events en
-- la 0003). Sin policies de escritura a propósito — solo el service role (que salta
-- RLS), a través de record_autocomplete_cost, escribe.
drop policy if exists "Users can read own autocomplete usage" on public.ai_autocomplete_daily;
create policy "Users can read own autocomplete usage"
  on public.ai_autocomplete_daily
  for select
  using (auth.uid() = user_id);

-- ── Registro del coste de una sugerencia ─────────────────────────────────────

-- Suma una sugerencia a la fila del día (UTC) del usuario, creándola si no existe.
-- El upsert es atómico: dos sugerencias simultáneas suman las dos.
create or replace function public.record_autocomplete_cost(
  p_user_id uuid,
  p_tokens_in bigint,
  p_tokens_out bigint,
  p_cost_usd numeric
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.ai_autocomplete_daily as d (user_id, day, requests, tokens_in, tokens_out, cost_usd)
  values (
    p_user_id,
    (now() at time zone 'utc')::date,
    1,
    greatest(coalesce(p_tokens_in, 0), 0),
    greatest(coalesce(p_tokens_out, 0), 0),
    greatest(coalesce(p_cost_usd, 0), 0)
  )
  on conflict (user_id, day) do update set
    requests   = d.requests + 1,
    tokens_in  = d.tokens_in + excluded.tokens_in,
    tokens_out = d.tokens_out + excluded.tokens_out,
    cost_usd   = d.cost_usd + excluded.cost_usd;
$$;

revoke execute on function public.record_autocomplete_cost(uuid, bigint, bigint, numeric)
  from public, anon, authenticated;
grant execute on function public.record_autocomplete_cost(uuid, bigint, bigint, numeric)
  to service_role;

-- ── Presupuesto total: el autocompletado también cuenta ──────────────────────

-- USD consumidos por el usuario en el mes natural en curso: chat (reservas pendientes
-- incluidas, como en la 0013) + autocompletado. Misma firma que en la 0013.
create or replace function public.get_month_cost(p_user_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select (
    coalesce((
      select sum(coalesce(quota_usd, cost_usd, 0))
        from public.usage_events
       where user_id = p_user_id
         and at >= date_trunc('month', now())
    ), 0)
    + coalesce((
      select sum(cost_usd)
        from public.ai_autocomplete_daily
       where user_id = p_user_id
         and day >= date_trunc('month', now() at time zone 'utc')::date
    ), 0)
  )::numeric;
$$;

revoke execute on function public.get_month_cost(uuid)
  from public, anon, authenticated;
grant execute on function public.get_month_cost(uuid)
  to service_role;

-- Reserva del chat (0013), idéntica salvo en `v_used`, que ahora suma también el
-- autocompletado del mes (misma definición que get_month_cost). Misma firma.
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

  -- Misma definición que get_month_cost: reservas pendientes y autocompletado incluidos.
  select (
      coalesce((
        select sum(coalesce(quota_usd, cost_usd, 0))
          from public.usage_events
         where user_id = p_user_id
           and at >= date_trunc('month', now())
      ), 0)
      + coalesce((
        select sum(cost_usd)
          from public.ai_autocomplete_daily
         where user_id = p_user_id
           and day >= date_trunc('month', now() at time zone 'utc')::date
      ), 0)
    )::numeric
    into v_used;

  -- Sin tolerancia: hace falta que la estimación ENTERA quepa en lo que queda.
  if v_used >= p_limit_usd
     or v_used + greatest(coalesce(p_estimate_usd, 0), 0) > p_limit_usd then
    return jsonb_build_object('ok', false, 'reason', 'quota', 'used', v_used, 'id', null);
  end if;

  -- Solo las reservas del chat: el autocompletado no tiene filas `pending`.
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

-- ── Comprobación previa del autocompletado (sin reserva) ─────────────────────

-- Los dos números con los que la Edge Function decide si sirve una sugerencia, y los
-- que muestra GET /usage:
--   used              = get_month_cost: TODO lo gastado en el mes (chat + autocompletado)
--   autocomplete_used = solo el autocompletado del mes (ya incluido en `used`)
-- Solo lee: ni lock ni fila `pending` (ver la cabecera).
create or replace function public.get_autocomplete_budget(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'used', public.get_month_cost(p_user_id),
    'autocomplete_used', coalesce((
      select sum(cost_usd)
        from public.ai_autocomplete_daily
       where user_id = p_user_id
         and day >= date_trunc('month', now() at time zone 'utc')::date
    ), 0)
  );
$$;

revoke execute on function public.get_autocomplete_budget(uuid)
  from public, anon, authenticated;
grant execute on function public.get_autocomplete_budget(uuid)
  to service_role;
