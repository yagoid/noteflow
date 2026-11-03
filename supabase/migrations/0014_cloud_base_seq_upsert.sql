-- NoteFlow — Fase 4.2 (NoteFlow Cloud): subida condicionada por la VERSIÓN
-- BASE del fichero (seq), no por la hora de edición.
--
-- Problema que arregla (reproducido en producción, se perdieron ediciones): la
-- 0011 decide comparando `updated_at` (la hora de EDICIÓN que pone el cliente)
-- con el más nuevo de la carpeta. No sabe sobre qué versión se hizo la edición
-- local. Un portátil que edita una sección SIN conexión después de que otro
-- dispositivo haya subido cambios en OTRAS secciones de la misma nota tiene un
-- `updated` más nuevo → la 0011 acepta sus subidas y pisa en todas partes la
-- versión remota que ese portátil nunca vio.
--
-- Arreglo: RPC `public.cloud_upsert_file_v2(...)`. Cada dispositivo recuerda,
-- por fichero, su BASE: la `seq` (0008) de la fila del servidor que reconcilió
-- por última vez. La subida lleva esa seq en `p_base_seq` y solo escribe si la
-- fila actual de `p_path_key` (TOMBSTONE INCLUIDO) sigue en esa seq — o si no
-- existe. Si alguien la cambió desde entonces devuelve NULL sin escribir
-- ("stale": el cliente deja la subida pendiente y su pull hace la fusión de
-- tres vías). Si escribe devuelve la `seq` que le asignó el trigger de la 0008
-- (la nueva base del cliente).
--
-- `p_base_seq` NULL (el cliente no conoce la base: estado heredado de
-- versiones anteriores, fichero nuevo, copia de conflicto) → la MISMA regla de
-- la 0011 (`updated_at` de la fila y, para una sección, del ancla
-- `p_anchor_key`, tombstones incluidos; los empates pasan) — así el cliente
-- nuevo no necesita llamar a las dos funciones.
--
-- Lo que NO pasa por aquí: los json de metadatos de raíz y las subidas
-- FORZADAS (siguen con el upsert directo de PostgREST, como con la 0011).
--
-- Atomicidad: lo primero es tomar el MISMO advisory lock por usuario que los
-- triggers de la 0008 y la RPC de la 0011
-- (`hashtextextended('noteflow.files.seq:' || user_id, 0)`, reentrante dentro
-- de la transacción): la comprobación de la seq y la escritura son atómicas
-- frente a cualquier otra escritura del mismo usuario, y el orden "advisory
-- lock → filas" es el de siempre (sin deadlocks).
--
-- `security invoker` A PROPÓSITO (como la 0011): aplican las políticas RLS de
-- `files` de la 0004 (ownership + entitlement cloud activa para
-- insert/update). Una violación de RLS sale como 42501 → HTTP 403 (el cliente
-- la mapea al error de suscripción). `search_path = ''` + nombres totalmente
-- cualificados por higiene.
--
-- Dependencias: la tabla `files` (0004) y su columna/triggers de `seq` (0008).
-- No toca la 0011: los clientes anteriores y el CLI la siguen usando.
--
-- Compatibilidad: migración ADITIVA. Los clientes nuevos, si el servidor aún
-- no tiene esta función (404 / PGRST202), caen a `cloud_upsert_file` (0011)
-- el resto de la sesión (sin regresión respecto a hoy).
-- ⚠️ Orden de despliegue: aplicar esta migración ANTES de publicar la versión
-- de la app que la usa.

create or replace function public.cloud_upsert_file_v2(
  p_path_key text,
  p_path_ct text,
  p_content_ct text,
  p_key_ct text,
  p_updated_at timestamptz,
  p_base_seq bigint default null,
  p_anchor_key text default null
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  current_seq bigint;
  found_row boolean;
  newest timestamptz;
  new_seq bigint;
begin
  if uid is null then
    raise exception 'cloud_upsert_file_v2 requires an authenticated user'
      using errcode = '42501';
  end if;

  -- Serializa contra las demás escrituras de este usuario hasta el commit.
  -- ⚠️ MISMA clave que files_assign_seq / files_lock_user_writes (0008) y
  -- cloud_upsert_file (0011).
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('noteflow.files.seq:' || uid::text, 0)
  );

  if p_base_seq is not null then
    -- Base conocida: la fila (tombstone incluido) tiene que seguir en esa seq.
    select f.seq
      into current_seq
      from public.files f
     where f.user_id = uid
       and f.path_key = p_path_key;
    found_row := found;
    if found_row and current_seq is distinct from p_base_seq then
      return null;
    end if;
  else
    -- Base desconocida: regla de la 0011 (la versión más nueva de la carpeta
    -- en el servidor — esta fila y, para una sección, su ancla — tombstones
    -- incluidos; estrictamente más nueva → rechazada, los empates pasan).
    select pg_catalog.max(f.updated_at)
      into newest
      from public.files f
     where f.user_id = uid
       and (f.path_key = p_path_key
            or (p_anchor_key is not null and f.path_key = p_anchor_key));
    if newest is not null and newest > p_updated_at then
      return null;
    end if;
  end if;

  insert into public.files (user_id, path_key, path_ct, content_ct, key_ct, updated_at, deleted)
  values (uid, p_path_key, p_path_ct, p_content_ct, p_key_ct, p_updated_at, false)
  on conflict (user_id, path_key) do update
    set path_ct = excluded.path_ct,
        content_ct = excluded.content_ct,
        key_ct = excluded.key_ct,
        updated_at = excluded.updated_at,
        deleted = false
  returning seq into new_seq;

  -- La seq que le puso el trigger BEFORE de la 0008 (la del UPDATE en un upsert).
  return new_seq;
end;
$$;

-- Solo usuarios autenticados (anon no tiene filas; public = todo el mundo).
revoke execute on function public.cloud_upsert_file_v2(text, text, text, text, timestamptz, bigint, text) from public, anon;
grant execute on function public.cloud_upsert_file_v2(text, text, text, text, timestamptz, bigint, text) to authenticated;

-- PostgREST tiene que ver la función nueva (Supabase ya recarga la caché de
-- esquema con su event trigger de DDL; esto es solo por si acaso).
notify pgrst, 'reload schema';
