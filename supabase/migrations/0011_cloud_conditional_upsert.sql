-- NoteFlow — Fase 4.2 (NoteFlow Cloud): subida CONDICIONADA de las filas de nota.
--
-- Problema que arregla: el cliente subía cada fichero con un upsert ciego
-- (`POST files?on_conflict=user_id,path_key` + `merge-duplicates`), así que
-- escribía aunque el servidor tuviera ya una versión MÁS NUEVA de la nota (o
-- su tombstone) que ese dispositivo nunca vio. Una subida del journal drenada
-- tarde, o el catch-up del primer sync de un segundo dispositivo (sube su
-- corpus entero), pisaba ediciones y borrados más recientes de otro
-- dispositivo — en la prueba en vivo, el corpus inicial de B resucitó 2 s
-- después una nota que A acababa de borrar.
--
-- Arreglo: RPC `public.cloud_upsert_file(...)` que los clientes usan para las
-- filas de nota ('<dir>/note.md' y sus secciones '<dir>/<sec>.md'). Compara el
-- `updated_at` que se sube con el más nuevo que ya hay en el servidor para la
-- carpeta — la propia fila y, para una sección, la fila del ancla
-- (`p_anchor_key`) — INCLUIDOS los tombstones (su `updated_at` es la hora del
-- borrado). Si el servidor tiene algo estrictamente más nuevo devuelve `false`
-- y no escribe nada ("stale": el cliente deja la subida pendiente y su
-- siguiente pull trae la versión nueva). Los empates se aceptan: re-subir la
-- misma versión es idempotente (reintentos, el propio dispositivo). Si no,
-- hace el mismo upsert de siempre (con `deleted = false`) y devuelve `true`.
--
-- Lo que NO pasa por aquí (el cliente sigue usando el upsert de PostgREST):
--   * los json de metadatos de raíz (groups.json, folders.json, ...): no
--     tienen versión, su `updated_at` es "ahora";
--   * las subidas FORZADAS: resurrección intencionada de una nota que llegó
--     como tombstone mientras el dispositivo tenía una edición sin subir (el
--     tombstone es más nuevo por diseño; una subida condicionada se rechazaría).
--
-- Atomicidad: lo primero es tomar el MISMO advisory lock por usuario que los
-- triggers de la 0008 (`hashtextextended('noteflow.files.seq:' || user_id, 0)`,
-- reentrante dentro de la transacción). Así la comprobación y la escritura son
-- atómicas frente a cualquier otra escritura del mismo usuario (otra subida,
-- el PATCH de un tombstone), y el orden "advisory lock → filas" es el mismo que
-- en la 0008 (sin deadlocks). Escrituras de usuarios distintos no se bloquean.
--
-- `security invoker` A PROPÓSITO: la función corre con los permisos del que
-- llama, así que aplican las políticas RLS de `files` de la 0004 (ownership +
-- entitlement cloud activa para insert/update). Una violación de RLS sigue
-- saliendo como 42501 → HTTP 403 en PostgREST, igual que con el upsert directo
-- (el cliente la mapea al error de suscripción). `search_path = ''` + nombres
-- totalmente cualificados por higiene.
--
-- Dependencias: solo la tabla `files` (0004) y su columna/triggers de `seq`
-- (0008 — el upsert de aquí dispara esos triggers y recibe seq igual). No
-- depende de nada de la 0009 ni de la 0010.
--
-- Compatibilidad: migración ADITIVA. Los clientes anteriores siguen con su
-- upsert directo. Los clientes nuevos, si el servidor aún no tiene la función
-- (404 / PGRST202), caen al upsert directo (sin regresión respecto a hoy).
-- ⚠️ Orden de despliegue: aplicar esta migración ANTES de publicar la versión
-- de la app/CLI que la usa (si no, esos clientes siguen subiendo sin
-- condiciones hasta que se aplique).

create or replace function public.cloud_upsert_file(
  p_path_key text,
  p_path_ct text,
  p_content_ct text,
  p_key_ct text,
  p_updated_at timestamptz,
  p_anchor_key text default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  newest timestamptz;
begin
  if uid is null then
    raise exception 'cloud_upsert_file requires an authenticated user'
      using errcode = '42501';
  end if;

  -- Serializa contra las demás escrituras de este usuario hasta el commit.
  -- ⚠️ MISMA clave que files_assign_seq / files_lock_user_writes (0008).
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('noteflow.files.seq:' || uid::text, 0)
  );

  -- Versión más nueva de la carpeta en el servidor: esta fila y (para una
  -- sección) su ancla, tombstones incluidos.
  select pg_catalog.max(f.updated_at)
    into newest
    from public.files f
   where f.user_id = uid
     and (f.path_key = p_path_key
          or (p_anchor_key is not null and f.path_key = p_anchor_key));

  -- Estrictamente más nueva → rechazada (los empates pasan: idempotente).
  if newest is not null and newest > p_updated_at then
    return false;
  end if;

  insert into public.files (user_id, path_key, path_ct, content_ct, key_ct, updated_at, deleted)
  values (uid, p_path_key, p_path_ct, p_content_ct, p_key_ct, p_updated_at, false)
  on conflict (user_id, path_key) do update
    set path_ct = excluded.path_ct,
        content_ct = excluded.content_ct,
        key_ct = excluded.key_ct,
        updated_at = excluded.updated_at,
        deleted = false;

  return true;
end;
$$;

-- Solo usuarios autenticados (anon no tiene filas; public = todo el mundo).
revoke execute on function public.cloud_upsert_file(text, text, text, text, timestamptz, text) from public, anon;
grant execute on function public.cloud_upsert_file(text, text, text, text, timestamptz, text) to authenticated;

-- PostgREST tiene que ver la función nueva (Supabase ya recarga la caché de
-- esquema con su event trigger de DDL; esto es solo por si acaso).
notify pgrst, 'reload schema';
