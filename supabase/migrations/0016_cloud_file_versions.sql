-- NoteFlow — Fase 4.2 (NoteFlow Cloud): historial de versiones de los ficheros,
-- capturado en el SERVIDOR.
--
-- Feature: poder recuperar una versión anterior de una nota/sección (una edición
-- que pisó otra, un borrado, un vaciado accidental) sin depender de que algún
-- dispositivo conserve la copia. Hasta ahora `files` solo guarda la ÚLTIMA
-- versión de cada fichero: cada subida sustituye el blob anterior y lo pierde.
--
-- Arreglo: tabla `public.file_versions` + trigger `AFTER UPDATE` sobre
-- `public.files` que copia la fila ANTERIOR (`old`) cuando cambia
-- `content_ct`. Se captura en el servidor (y no en los clientes) para que
-- valga para TODOS los clientes —escritorio, CLI, móvil, versiones antiguas—
-- sin que tengan que hacer nada; los clientes solo LEEN el historial.
--
-- Cuándo se guarda una versión (`reason`):
--   * 'edit'   — edición normal: como mucho UNA por fichero cada 10 minutos
--                (una ráfaga de autoguardados deja una sola versión: el
--                contenido de antes de la ráfaga; el de después lo captura la
--                siguiente edición pasada la ventana).
--   * 'delete' — SIEMPRE antes de un borrado (tombstone `deleted = true`),
--                aunque haya otra versión dentro de la ventana.
--   * 'shrink' — SIEMPRE antes de una reducción grande: el contenido nuevo
--                ocupa menos de la mitad del anterior Y la diferencia es de al
--                menos 1 KiB (vaciados/recortes accidentales). Las reducciones
--                pequeñas cuentan como 'edit'.
--
-- Límites (por fichero = `(user_id, path_key)`; se podan las más antiguas):
--   * retención: 30 días — `public.file_versions_retention()`;
--   * máximo 100 versiones;
--   * máximo 20 MB (suma de `size`); la versión MÁS RECIENTE se conserva
--     SIEMPRE, aunque ella sola pase de 20 MB.
-- La retención es una función de configuración porque la usan DOS sitios —la
-- política RLS (no se ve lo caducado) y la purga (`purge_file_versions`)— y así
-- no pueden divergir; cambiarla = `create or replace function` en una migración
-- nueva. Los otros límites (ventana de 10 min, 100 versiones, 20 MB y el umbral
-- de 1 KiB del 'shrink') solo los usa el trigger: son constantes con nombre en
-- el `declare` de `files_capture_version()`; cambiarlos = recrear esa función.
-- Bajar un límite no poda de golpe lo existente: se aplica en la siguiente
-- versión de cada fichero (poda) o en la siguiente purga (retención).
--
-- La retención la aplica la RLS al LEER; borrar físicamente lo caducado es
-- trabajo de `public.purge_file_versions()` (service role), que esta migración
-- NO programa: el operador puede programarla con pg_cron (supabase/README.md
-- § 7). Sin purga, lo caducado no se ve pero ocupa espacio.
--
-- Interacción con lo existente:
--   * Triggers BEFORE de la 0008: cuando corre este AFTER, el advisory lock por
--     usuario (`files_lock_user_writes` de sentencia / `files_assign_seq` de
--     fila, clave `hashtextextended('noteflow.files.seq:' || user_id, 0)`) ya
--     está tomado y dura hasta el commit. La comprobación de la ventana de 10
--     min y la poda quedan así serializadas por usuario: sin carreras (dos
--     subidas del mismo fichero no pueden meter dos versiones 'edit' en la
--     misma ventana) y sin deadlocks nuevos entre escrituras de un usuario —
--     este trigger no toma locks adicionales y el orden sigue siendo "advisory
--     lock → filas de files → filas de file_versions". `old.seq` es la seq que
--     tenía la fila sustituida (el BEFORE solo cambia `new.seq`): ordena las
--     versiones de forma fiable.
--     La purga NO toma el advisory lock (borra de todos los usuarios). Si
--     coincide con la poda de una subida sobre filas caducadas del mismo
--     fichero, las dos se pueden bloquear mutuamente; Postgres lo detecta y
--     aborta una (si es la subida, el cliente la reintenta como cualquier
--     error transitorio). Muy improbable: la purga corre una vez al día.
--   * RPC `cloud_upsert_file` (0011) / `cloud_upsert_file_v2` (0014): son
--     `security invoker` y el usuario no tiene política de insert en
--     `file_versions`; el trigger es `security definer` (corre como el owner de
--     la tabla, al que no le aplica la RLS —no está en FORCE—), así que inserta
--     igual.
--   * Upsert directo de PostgREST (`INSERT ... ON CONFLICT DO UPDATE`): al
--     chocar dispara el AFTER UPDATE de fila con la fila anterior en `old` →
--     captura. Un INSERT sin conflicto (fichero nuevo) no dispara nada.
--   * PATCH de tombstone (`deleted = true, content_ct = ''`, como hacen
--     escritorio y CLI) → versión 'delete' siempre (ignora la ventana).
--   * Resurrección de un tombstone (`old.deleted = true`, `old.content_ct =
--     ''`): la condición `WHEN` lo excluye — no hay contenido que guardar.
--   * DELETE físico (usuario sin suscripción, limpieza) y `delete-account` /
--     cascada desde `auth.users` (service role): no son UPDATE, no generan
--     versiones; y `file_versions` también cae por `on delete cascade`
--     (`delete-account` la borra además explícitamente, justo después de
--     `files`).
--   * Cambios que no tocan `content_ct` (solo `updated_at`, `key_ct`,
--     `path_ct`): no generan versión.
--   * e2ee: las versiones son los mismos blobs opacos (`content_ct`, `key_ct`,
--     `path_ct` tal cual estaban); el servidor no descifra ni lee nada.
--   * Realtime (0006): `file_versions` NO se añade a la publicación; los
--     clientes leen el historial bajo demanda.
--
-- Acceso: RLS de SOLO LECTURA, por dueño y dentro de la retención. Ninguna
-- política de insert/update/delete y sin grants de escritura: el cliente nunca
-- inserta, modifica ni borra versiones (solo el trigger, la purga y las
-- cascadas).
--
-- Compatibilidad: migración ADITIVA. Puede aplicarse ANTES de publicar ningún
-- cliente: el historial empieza a acumularse en cuanto se aplica. Un servidor
-- sin la migración responde 404 `PGRST205` a la lectura de `file_versions` y
-- los clientes lo tratan como "historial no disponible".
--
-- Coste: como mucho una escritura extra cada 10 min por fichero (más los
-- 'delete'/'shrink') y una consulta por índice en cada UPDATE que cambia el
-- contenido.

-- Retención del historial. ⚠️ La usan la política RLS de select y
-- `purge_file_versions()`: cambiarla aquí (create or replace en una migración
-- nueva) cambia las dos a la vez.
create or replace function public.file_versions_retention()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '30 days'
$$;

-- La política RLS la evalúa el rol que consulta: `authenticated` necesita
-- EXECUTE (anon no tiene ni SELECT sobre la tabla).
revoke execute on function public.file_versions_retention() from public, anon;
grant execute on function public.file_versions_retention() to authenticated, service_role;

-- Una fila por versión sustituida de un fichero de `files`. Las columnas
-- cifradas son copia literal de la fila anterior.
create table public.file_versions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  path_key text not null,          -- el de la fila de files
  path_ct text not null,
  content_ct text not null,        -- contenido ANTERIOR (cifrado)
  key_ct text not null,
  updated_at timestamptz not null, -- updated_at de la fila sustituida = hora de edición de ese contenido
  seq bigint not null,             -- seq (0008) de la fila sustituida; orden fiable de versiones
  size integer not null,           -- octet_length(content_ct)
  reason text not null check (reason in ('edit', 'delete', 'shrink')),
  created_at timestamptz not null default now()  -- cuándo fue sustituida
);

-- Lista del historial de un fichero (cliente) y poda (trigger).
create index file_versions_user_path_seq_idx
  on public.file_versions (user_id, path_key, seq desc);

-- Purga por retención.
create index file_versions_created_at_idx on public.file_versions (created_at);

alter table public.file_versions enable row level security;

-- Única política: cada usuario LEE sus versiones no caducadas. No hay
-- políticas de insert/update/delete a propósito (ver cabecera).
create policy "Users can read own recent file versions"
  on public.file_versions
  for select
  to authenticated
  using (
    auth.uid() = user_id
    and created_at > now() - public.file_versions_retention()
  );

-- Supabase concede por defecto privilegios sobre las tablas y secuencias de
-- `public` a anon/authenticated (ver 0008): solo dejamos SELECT a authenticated.
revoke all on table public.file_versions from public, anon, authenticated;
grant select on table public.file_versions to authenticated;
revoke all on sequence public.file_versions_id_seq from public, anon, authenticated;

-- Trigger de fila AFTER UPDATE: guarda la fila anterior (ver cabecera).
-- security definer → corre como el owner de `file_versions` (la RLS no le
-- aplica), así que el usuario no necesita permisos de escritura sobre ella;
-- `search_path = ''` + nombres totalmente cualificados para que no se pueda
-- secuestrar la resolución de nombres de una función con privilegios elevados.
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
  -- Máximo de versiones guardadas por fichero (se podan las más antiguas).
  max_versions constant integer := 100;
  -- Máximo de bytes (suma de `size`) por fichero; la versión más reciente se
  -- conserva siempre, aunque ella sola lo supere.
  max_bytes constant bigint := 20 * 1024 * 1024;
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

  insert into public.file_versions
    (user_id, path_key, path_ct, content_ct, key_ct, updated_at, seq, size, reason)
  values
    (old.user_id, old.path_key, old.path_ct, old.content_ct, old.key_ct,
     old.updated_at, old.seq, old_size, v_reason);

  -- Poda de este fichero, de más nueva a más vieja (seq desc, id desc): fuera
  -- todo lo que pase de max_versions y, salvo la más reciente, todo lo que
  -- haga que la suma acumulada de bytes pase de max_bytes.
  delete from public.file_versions v
   using (
     select fv.id,
            pg_catalog.row_number() over w as rn,
            pg_catalog.sum(fv.size) over (w rows between unbounded preceding and current row) as cum_bytes
       from public.file_versions fv
      where fv.user_id = old.user_id
        and fv.path_key = old.path_key
     window w as (order by fv.seq desc, fv.id desc)
   ) ranked
   where v.id = ranked.id
     and (ranked.rn > max_versions
          or (ranked.rn > 1 and ranked.cum_bytes > max_bytes));

  return null;
end;
$$;

-- Función de trigger: nadie debe poder invocarla directamente (quitar EXECUTE
-- no afecta al disparo del trigger, como en la 0008).
revoke execute on function public.files_capture_version() from public, anon, authenticated;

create trigger files_capture_version
  after update on public.files
  for each row
  when (old.deleted = false and old.content_ct <> '' and old.content_ct is distinct from new.content_ct)
  execute function public.files_capture_version();

-- Purga de lo caducado (retención). Devuelve cuántas versiones borró. Solo
-- service role (pg_cron / operador); la migración no la programa.
create or replace function public.purge_file_versions()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count bigint;
begin
  delete from public.file_versions
   where created_at < pg_catalog.now() - public.file_versions_retention();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.purge_file_versions() from public, anon, authenticated;
grant execute on function public.purge_file_versions() to service_role;

-- PostgREST tiene que ver la tabla nueva (Supabase ya recarga la caché de
-- esquema con su event trigger de DDL; esto es solo por si acaso).
notify pgrst, 'reload schema';
