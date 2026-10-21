-- NoteFlow — Fase 4.0 (Billing): endurecimiento del webhook de Lemon Squeezy
--
-- Tres cambios, todos invocados SOLO por el service role:
--
--   1. apply_subscription_event (misma firma que en 0002) se redefine para
--      cerrar una carrera: la versión de 0002 hacía UPDATE y, si no tocaba
--      nada, INSERT ... ON CONFLICT DO NOTHING. Si dos eventos de una
--      suscripción NUEVA llegaban a la vez, ambos fallaban el UPDATE (la fila
--      aún no existía), uno insertaba y el otro chocaba con el conflicto y se
--      perdía EN SILENCIO aunque fuera el más reciente (p. ej. created +
--      updated casi simultáneos). Ahora, con user_id, es un único
--      INSERT ... ON CONFLICT DO UPDATE con el mismo guard de orden
--      (excluded.updated_at >= subscriptions.updated_at) → el evento más nuevo
--      gana siempre. Sin user_id se mantiene el camino de solo-UPDATE. El
--      user_id NUNCA se actualiza en conflicto (la fila pertenece a quien la
--      compró).
--
--   2. expire_subscription_ref(provider, provider_ref): la usa el webhook ante
--      un REEMBOLSO TOTAL (evento subscription_payment_refunded con la factura
--      en estado 'refunded'). Pone status='expired' y updated_at='infinity'.
--      Por qué 'infinity' y no now(): LS NO cancela la suscripción al
--      reembolsar, así que siguen llegando subscription_updated (renovaciones,
--      etc.) con un updated_at más nuevo que el reembolso, y el guard
--      `p_event_at >= updated_at` volvería a ponerla 'active'. Con 'infinity'
--      ningún evento de LS puede ganarle jamás. Nada lee updated_at fuera de
--      apply_subscription_event: el cliente (electron/account.ts) selecciona
--      solo product,status,renews_at, el ai-proxy product,status y la RLS de
--      files (0004) status/product. Un reembolso que llegue ANTES de que exista
--      la fila es un no-op (devuelve 0; los reembolsos son manuales y muy
--      posteriores a la compra). Devuelve el nº de filas afectadas.
--      ⚠️ El operador DEBE cancelar además la suscripción en Lemon Squeezy:
--      LS no la cancela al reembolsar y, con la fila bloqueada en 'infinity',
--      el cliente seguiría pagando sin acceso (el webhook lo loguea). Ojo: el
--      reembolso total de una factura ANTIGUA también expira el periodo actual.
--      Deshacer a mano (p. ej. reembolso por error, sin cancelar en LS):
--      update ... set status='active', updated_at=now() — y el siguiente
--      evento de LS la deja como corresponda.
--
--   3. expire_stale_subscriptions(): reconciliación por si se pierde un
--      subscription_expired (webhook caído, reintentos agotados). Expira las
--      filas de Lemon Squeezy 'active' cuyo renews_at (que para las canceladas
--      es el ends_at) pasó hace más de 7 días. NUNCA toca provider='manual'
--      (la fila comp del operador, renews_at null) ni filas con renews_at null.
--      NO cambia updated_at. Devuelve el nº de filas expiradas.
--      ⚠️ TIENE FALSOS POSITIVOS: renews_at solo avanza con el
--      subscription_updated de cada renovación; si se pierde esa entrega, un
--      cliente que SÍ paga conserva el renews_at viejo y se expiraría, y el
--      siguiente evento de LS (que lo repararía) puede tardar un mes — un año
--      en el plan anual — salvo que se reenvíe a mano desde el log de webhooks
--      de LS. Por eso NO se programa aquí ni se recomienda agendarla a ciegas:
--      el flujo documentado (supabase/README.md § 5, paso 6) es revisar los
--      candidatos (mismo predicado), confirmarlos en LS y expirar solo esos.
--      pg_cron queda como opción solo para quien acepte ese riesgo.

-- 1 ─────────────────────────────────────────────────────────────────────────
create or replace function public.apply_subscription_event(
  p_user_id uuid,
  p_product text,
  p_status text,
  p_renews_at timestamptz,
  p_provider text,
  p_provider_ref text,
  p_event_at timestamptz
) returns void
language plpgsql
set search_path = public
as $$
begin
  if p_user_id is null then
    -- Sin user_id no se puede atribuir una compra nueva: solo se actualiza una
    -- fila ya existente (y solo si el evento no es más viejo que el último).
    update public.subscriptions
       set product = p_product,
           status = p_status,
           renews_at = p_renews_at,
           updated_at = p_event_at
     where provider = p_provider
       and provider_ref = p_provider_ref
       and p_event_at >= updated_at;
    return;
  end if;

  insert into public.subscriptions as s
    (user_id, product, status, renews_at, provider, provider_ref, updated_at)
  values
    (p_user_id, p_product, p_status, p_renews_at, p_provider, p_provider_ref, p_event_at)
  on conflict (provider, provider_ref) do update
     set product = excluded.product,
         status = excluded.status,
         renews_at = excluded.renews_at,
         updated_at = excluded.updated_at
   where excluded.updated_at >= s.updated_at;
end;
$$;

revoke execute on function public.apply_subscription_event(uuid, text, text, timestamptz, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.apply_subscription_event(uuid, text, text, timestamptz, text, text, timestamptz)
  to service_role;

-- 2 ─────────────────────────────────────────────────────────────────────────
create or replace function public.expire_subscription_ref(
  p_provider text,
  p_provider_ref text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.subscriptions
     set status = 'expired',
         updated_at = 'infinity'
   where provider = p_provider
     and provider_ref = p_provider_ref;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.expire_subscription_ref(text, text)
  from public, anon, authenticated;
grant execute on function public.expire_subscription_ref(text, text)
  to service_role;

-- 3 ─────────────────────────────────────────────────────────────────────────
create or replace function public.expire_stale_subscriptions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.subscriptions
     set status = 'expired'
   where provider = 'lemonsqueezy'
     and status = 'active'
     and renews_at < now() - interval '7 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.expire_stale_subscriptions()
  from public, anon, authenticated;
grant execute on function public.expire_stale_subscriptions()
  to service_role;
