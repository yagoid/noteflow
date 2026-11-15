-- NoteFlow — Fase 4.2 (NoteFlow Cloud): captura EXPLÍCITA de la versión actual
-- de un fichero (`cloud_snapshot_file`), para restaurar sin perder nada.
--
-- Problema que arregla: "restaurar una versión" del historial (0016) es, para
-- el servidor, una edición normal. Por la ventana de 10 minutos del trigger
-- `files_capture_version`, si ya hay una versión de ese fichero dentro de la
-- ventana, la restauración NO guarda el contenido que el usuario tenía justo
-- antes de restaurar: se perdería sin remedio.
--
-- Arreglo: RPC `public.cloud_snapshot_file(p_path_key)` que el cliente llama
-- ANTES de restaurar. Copia la fila VIVA actual de ese fichero a
-- `file_versions` con `reason = 'manual'` (su `seq` y su `updated_at` tal
-- cual) y aplica la misma poda que el trigger. Devuelve `true` si hay fila viva
-- (también si esa versión ya estaba guardada: es idempotente) y `false` si no
-- existe o es un tombstone.
--
-- Cambios de esquema:
--   * `reason` admite además 'manual' (se recrea el check).
--   * Índice ÚNICO `(user_id, path_key, seq)`: una versión por cada contenido
--     sustituido. Hoy no puede haber duplicados: cada sustitución de una fila
--     de `files` pasa por el BEFORE de la 0008 (`files_assign_seq`), que le
--     asigna una seq NUEVA, así que el `old.seq` de dos capturas distintas del
--     trigger nunca coincide. Con la captura manual sí podría coincidir (la
--     RPC guarda la seq actual, y el trigger guardará esa misma seq cuando la
--     fila se sustituya): el índice único lo impide y tanto el trigger como la
--     RPC insertan con `on conflict (user_id, path_key, seq) do nothing`. Por
--     si acaso, antes de crearlo se eliminan duplicados conservando el `id`
--     menor.
--   * Se elimina `file_versions_user_path_seq_idx` (0016), `(user_id,
--     path_key, seq desc)`: el índice único cubre exactamente las mismas
--     consultas (la lista del cliente `order by seq desc` y la poda se sirven
--     recorriendo el B-tree hacia atrás; la columna `desc` no aporta nada en
--     un índice de una sola dirección de orden), y mantener los dos solo
--     duplica escrituras y espacio.
--   * La poda sale a `public.file_versions_prune(user_id, path_key)`, que usan
--     el trigger y la RPC. `max_versions` (100) y `max_bytes` (20 MB) viven
--     SOLO ahí; `edit_window` (10 min) y `shrink_min_bytes` (1 KiB) siguen en
--     el trigger. Cambiar un límite = recrear la función que lo contiene. La
--     retención (`file_versions_retention()`, 0016) no cambia.
--   * `files_capture_version()` se recrea con la misma lógica de la 0016; solo
--     cambia el `on conflict do nothing` y la llamada a la poda. El trigger en
--     sí no se toca.
--
-- Interacción captura manual ↔ trigger:
--   * Cuando la fila capturada se sustituya después, el trigger intentará
--     guardar la misma `(path_key, seq)` y será un no-op: por la ventana de 10
--     min si es un 'edit', o por el índice único si es un 'delete'/'shrink'
--     (que ignoran la ventana). Nunca hay versiones duplicadas; en ese caso la
--     versión queda como 'manual' y no como 'delete'/'shrink' (el contenido es
--     el mismo).
--   * La captura manual abre la ventana de 10 min igual que cualquier otra
--     versión: la restauración que viene justo después no genera otra versión
--     'edit' (el contenido previo ya está guardado como 'manual').
--
-- Locks (0008): la RPC toma el MISMO advisory lock por usuario
-- (`hashtextextended('noteflow.files.seq:' || user_id, 0)`, reentrante) ANTES
-- de leer la fila, así que la lectura, el insert y la poda están serializados
-- con las demás escrituras de ese usuario (y con la poda del trigger). No
-- escribe en `files`: solo toma el advisory lock, sin locks de fila, y el orden
-- sigue siendo "advisory lock → filas de file_versions" (sin deadlocks nuevos).
--
-- Seguridad: `security definer` (tiene que escribir en `file_versions`, donde
-- el cliente no tiene grants ni políticas de escritura), así que NO le aplica
-- la RLS y lo comprueba todo a mano: exige `auth.uid()` (si no, 42501), exige
-- la MISMA entitlement que la política de insert de `files` de la 0004
-- (suscripción 'cloud'/'bundle' con `status = 'active'`; si no, 42501 → HTTP
-- 403, como una subida sin suscripción) y solo lee la fila de `auth.uid()`
-- (nunca la de otro usuario: con el path_key de otro devuelve `false`).
-- `search_path = ''` + nombres totalmente cualificados. EXECUTE solo para
-- `authenticated`: ni anon ni service_role (sin JWT, `auth.uid()` es null y
-- fallaría con 42501 igualmente).
--
-- Contrato con los clientes: `POST /rest/v1/rpc/cloud_snapshot_file` con
-- `{"p_path_key":"<k>"}` → `true`/`false`. Sin suscripción → 403 (42501). En un
-- servidor sin la 0017 → 404 `PGRST202`: el cliente lo trata como "no
-- disponible" y degrada (restaura sin captura previa).
--
-- Compatibilidad: migración ADITIVA (los clientes que no llaman a la RPC no
-- notan nada). Requiere la 0016. ⚠️ Orden de despliegue: aplicarla ANTES de
-- publicar el cliente que usa `cloud_snapshot_file`.
-- Se ejecuta en una sola transacción: el ALTER TABLE (recrear el check, que
-- revalida las filas) y el índice único bloquean `file_versions` —y por tanto
-- las subidas que capturan versión— hasta el commit; con el tamaño de la tabla
-- es cuestión de instantes.

-- 1 ─ 'manual' como motivo válido ─────────────────────────────────────────────
alter table public.file_versions
  drop constraint file_versions_reason_check,
  add constraint file_versions_reason_check
    check (reason in ('edit', 'delete', 'shrink', 'manual'));

-- 2 ─ Una versión por (fichero, seq) ──────────────────────────────────────────
-- Dedupe defensivo (ver cabecera: hoy no debería borrar nada).
delete from public.file_versions a
 using public.file_versions b
 where a.user_id = b.user_id
   and a.path_key = b.path_key
   and a.seq = b.seq
   and a.id > b.id;

create unique index file_versions_user_path_seq_key
  on public.file_versions (user_id, path_key, seq);

-- Redundante con el único (ver cabecera).
drop index if exists public.file_versions_user_path_seq_idx;

-- 3 ─ Poda compartida ─────────────────────────────────────────────────────────
-- Poda las versiones de UN fichero, de más nueva a más vieja (seq desc, id
-- desc): fuera todo lo que pase de max_versions y, salvo la más reciente, todo
-- lo que haga que la suma acumulada de bytes pase de max_bytes. Interna: la
-- llaman el trigger y la RPC (security definer del mismo owner).
create or replace function public.file_versions_prune(p_user_id uuid, p_path_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Máximo de versiones guardadas por fichero (se podan las más antiguas).
  max_versions constant integer := 100;
  -- Máximo de bytes (suma de `size`) por fichero; la versión más reciente se
  -- conserva siempre, aunque ella sola lo supere.
  max_bytes constant bigint := 20 * 1024 * 1024;
begin
  delete from public.file_versions v
   using (
     select fv.id,
            pg_catalog.row_number() over w as rn,
            pg_catalog.sum(fv.size) over (w rows between unbounded preceding and current row) as cum_bytes
       from public.file_versions fv
      where fv.user_id = p_user_id
        and fv.path_key = p_path_key
     window w as (order by fv.seq desc, fv.id desc)
   ) ranked
   where v.id = ranked.id
     and (ranked.rn > max_versions
          or (ranked.rn > 1 and ranked.cum_bytes > max_bytes));
end;
$$;

-- Nadie la invoca directamente (Supabase concede EXECUTE por defecto a los
-- tres roles): el trigger y la RPC corren como su owner.
revoke execute on function public.file_versions_prune(uuid, text) from public, anon, authenticated, service_role;

-- 4 ─ Trigger de captura: misma lógica que la 0016 ───────────────────────────
create or replace function public.files_capture_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Ventana de agrupación: como mucho UNA versión 'edit' por fichero en este
  -- intervalo ('delete' y 'shrink' la ignoran).
  edit_window constant interval := interval '10 minutes';
  -- Reducción mínima (en bytes) para que un recorte a menos de la mitad cuente
  -- como 'shrink'.
  shrink_min_bytes constant integer := 1024;
  old_size integer := pg_catalog.octet_length(old.content_ct);
  new_size integer := pg_catalog.octet_length(new.content_ct);
  v_reason text;
begin
  if new.deleted then
    v_reason := 'delete';
  elsif new_size < old_size / 2 and old_size - new_size >= shrink_min_bytes then
    v_reason := 'shrink';
  else
    v_reason := 'edit';
  end if;

  -- Edición normal con otra versión de este fichero dentro de la ventana: nada.
  if v_reason = 'edit' and exists (
    select 1
      from public.file_versions v
     where v.user_id = old.user_id
       and v.path_key = old.path_key
       and v.created_at > pg_catalog.now() - edit_window
  ) then
    return null;
  end if;

  -- Ya capturada (p. ej. por cloud_snapshot_file) → no-op (ver cabecera).
  insert into public.file_versions
    (user_id, path_key, path_ct, content_ct, key_ct, updated_at, seq, size, reason)
  values
    (old.user_id, old.path_key, old.path_ct, old.content_ct, old.key_ct,
     old.updated_at, old.seq, old_size, v_reason)
  on conflict (user_id, path_key, seq) do nothing;

  perform public.file_versions_prune(old.user_id, old.path_key);

  return null;
end;
$$;

revoke execute on function public.files_capture_version() from public, anon, authenticated;

-- 5 ─ Captura explícita (RPC) ─────────────────────────────────────────────────
create or replace function public.cloud_snapshot_file(p_path_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cur public.files%rowtype;
begin
  if uid is null then
    raise exception 'cloud_snapshot_file requires an authenticated user'
      using errcode = '42501';
  end if;

  -- Misma entitlement que la política de insert de `files` (0004): al ser
  -- security definer, aquí no aplica la RLS.
  if not exists (
    select 1 from public.subscriptions s
     where s.user_id = uid
       and s.product in ('cloud', 'bundle')
       and s.status = 'active'
  ) then
    raise exception 'cloud_snapshot_file requires an active cloud subscription'
      using errcode = '42501';
  end if;

  -- Serializa contra las demás escrituras de este usuario hasta el commit.
  -- ⚠️ MISMA clave que files_assign_seq / files_lock_user_writes (0008).
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('noteflow.files.seq:' || uid::text, 0)
  );

  -- Solo la fila VIVA de ESTE usuario.
  select f.*
    into cur
    from public.files f
   where f.user_id = uid
     and f.path_key = p_path_key
     and f.deleted = false
     and f.content_ct <> '';
  if not found then
    return false;
  end if;

  insert into public.file_versions
    (user_id, path_key, path_ct, content_ct, key_ct, updated_at, seq, size, reason)
  values
    (cur.user_id, cur.path_key, cur.path_ct, cur.content_ct, cur.key_ct,
     cur.updated_at, cur.seq, pg_catalog.octet_length(cur.content_ct), 'manual')
  on conflict (user_id, path_key, seq) do nothing;

  perform public.file_versions_prune(uid, p_path_key);

  return true;
end;
$$;

-- Solo usuarios autenticados (ver cabecera: ni anon ni service_role).
revoke execute on function public.cloud_snapshot_file(text) from public, anon, service_role;
grant execute on function public.cloud_snapshot_file(text) to authenticated;

-- PostgREST tiene que ver la función nueva (Supabase ya recarga la caché de
-- esquema con su event trigger de DDL; esto es solo por si acaso).
notify pgrst, 'reload schema';
