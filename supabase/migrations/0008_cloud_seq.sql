-- NoteFlow — Fase 4.2 (NoteFlow Cloud): cursor del pull incremental asignado por el SERVIDOR.
--
-- Problema que arregla: el pull incremental usaba como cursor el máximo
-- `updated_at` visto (`updated_at > cursor`), pero `updated_at` lo pone el
-- CLIENTE desde el `updated:` del frontmatter = hora de EDICIÓN, no de subida.
-- Cualquier fila que llega tarde al servidor (edición offline drenada del
-- journal, reintento, segundo dispositivo que sube su corpus viejo al activar
-- Cloud, reloj desfasado) queda por debajo del cursor de los demás
-- dispositivos y no les llega nunca. Además las secciones heredan el
-- `updated_at` del ancla, así que un `note.md` subido DESPUÉS que sus secciones
-- llega con un `updated_at` IGUAL al cursor y `gt` lo excluye.
--
-- Arreglo: columna `seq` = número de cambio monótono que asigna el servidor en
-- CADA insert/update (trigger), ignorando lo que mande el cliente. Los clientes
-- nuevos usan `seq > último seq reconciliado` como cursor (paginación keyset
-- `order=seq.asc&seq=gt.<n>`). `updated_at` NO cambia de significado: sigue
-- siendo la base de la resolución de conflictos (la carpeta de nota es la
-- unidad, decide el `updated:` del `note.md`); simplemente deja de ser cursor.
--
-- Orden de commit = orden de seq (por usuario). Una secuencia sola NO basta:
-- dos transacciones concurrentes del mismo usuario pueden sacar seq 10 y 11 y
-- commitear al revés; un cliente que lee justo entonces ve la 11, avanza su
-- cursor a 11 y se salta para siempre la 10 (que aún no era visible). Por eso
-- se toma, ANTES del nextval, un advisory lock de transacción por usuario
-- (`pg_advisory_xact_lock`): las escrituras de un mismo usuario se serializan
-- hasta el commit, de modo que toda seq menor de ese usuario ya está
-- commiteada (o abortada) cuando otra transacción saca una mayor — los locks se
-- liberan después de que el commit sea visible. El cursor es por usuario (RLS:
-- cada cliente solo lee sus filas), así que basta con ordenar por usuario; la
-- secuencia es global y las seq de un usuario tienen huecos (otros usuarios,
-- transacciones abortadas, el doble disparo del upsert), lo que el keyset con
-- `gt` tolera sin problema. Escrituras de usuarios distintos no se bloquean
-- entre sí.
--
-- El lock se toma en DOS sitios, con la MISMA clave
-- (`hashtextextended('noteflow.files.seq:' || user_id, 0)`; es reentrante
-- dentro de la transacción):
--   * Trigger de SENTENCIA (`files_lock_user_writes`, con `auth.uid()`): se
--     dispara antes de que la sentencia bloquee ninguna fila. Sin él hay
--     deadlock entre dos escrituras del mismo usuario (reproducido en PG16):
--     en un UPDATE (el PATCH del tombstone) Postgres bloquea la fila ANTES de
--     disparar el BEFORE UPDATE de fila, que luego espera el advisory lock;
--     mientras, un upsert del mismo usuario ya tiene el advisory lock (desde
--     su BEFORE INSERT de fila) y espera esa fila. Tomando el lock a nivel de
--     sentencia, el orden es siempre "advisory lock → filas".
--   * Trigger de FILA (`files_assign_seq`, con `new.user_id`): cubre las
--     escrituras sin JWT (service role / operador, `auth.uid()` null). Un
--     script del operador que escribiera filas de VARIOS usuarios en orden
--     distinto que otra transacción podría hacer deadlock; los clientes nunca
--     lo hacen.
--
-- Upsert de PostgREST (`INSERT ... ON CONFLICT DO UPDATE`, `Prefer:
-- resolution=merge-duplicates`): se dispara el BEFORE INSERT y, al chocar, el
-- BEFORE UPDATE; la fila queda con la seq del UPDATE (la del INSERT se pierde
-- como hueco). Correcto.
--
-- Compatibilidad: migración ADITIVA. Los clientes anteriores piden columnas
-- explícitas en `select=` (no ven `seq`) y no la mandan al escribir, así que
-- siguen funcionando con su cursor por fecha (y conservan el índice
-- `files_user_id_updated_at_idx` de la 0004); sus escrituras reciben seq igual,
-- vía trigger, y los clientes nuevos las ven. RLS y la publicación Realtime
-- (0006) no cambian.
--
-- ⚠️ Orden de despliegue: aplicar esta migración ANTES de publicar la versión
-- de la app/CLI que pide `seq` — un cliente nuevo contra un servidor sin la
-- columna recibe 400 en el pull (error visible, sin pérdida de datos).
--
-- Se ejecuta en una sola transacción (`supabase db push` o el SQL Editor): el
-- ALTER TABLE toma ACCESS EXCLUSIVE sobre `files` hasta el commit, así que
-- ninguna escritura concurrente se cuela entre el backfill y el trigger. Aun
-- así, el paso de "rezagados" de abajo cubre cualquier fila sin seq.

create sequence public.files_change_seq as bigint;

alter table public.files add column seq bigint;

-- Backfill: numera las filas existentes en orden (updated_at, path_key) — el
-- orden que mejor aproxima la historia real con los datos que hay. Los
-- clientes nuevos que vienen de la versión anterior hacen de todas formas una
-- reconciliación completa una vez (desde seq 0), así que el orden exacto del
-- backfill no afecta a la corrección.
with ordered as (
  select user_id,
         path_key,
         row_number() over (order by updated_at, path_key) as rn
    from public.files
)
update public.files f
   set seq = o.rn
  from ordered o
 where f.user_id = o.user_id
   and f.path_key = o.path_key;

-- La siguiente seq continúa tras el máximo del backfill (1 si la tabla está vacía).
select setval(
  'public.files_change_seq',
  coalesce((select max(seq) from public.files), 0) + 1,
  false
);

-- Supabase concede por defecto privilegios sobre las secuencias de `public` a
-- anon/authenticated: nadie fuera de los triggers debe poder hacer nextval/
-- setval (consumir o rebobinar el cursor de todos).
revoke all on sequence public.files_change_seq from public, anon, authenticated;

-- Trigger de fila: SIEMPRE asigna una seq nueva (ignora la que mande el
-- cliente). security definer → corre con los privilegios del owner, así que el
-- rol `authenticated` NO necesita grants sobre la secuencia; `search_path = ''`
-- + nombres totalmente cualificados para que no se pueda secuestrar la
-- resolución de nombres de una función con privilegios elevados.
create or replace function public.files_assign_seq()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Serializa las escrituras de este usuario hasta el commit (ver cabecera).
  -- ⚠️ MISMA clave que en files_lock_user_writes.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('noteflow.files.seq:' || new.user_id::text, 0)
  );
  new.seq := pg_catalog.nextval('public.files_change_seq'::regclass);
  return new;
end;
$$;

-- Es una función de trigger: nadie debe poder invocarla directamente. Quitar
-- EXECUTE no afecta al disparo del trigger (el privilegio solo se comprueba al
-- crear el trigger, y lo crea el owner).
revoke execute on function public.files_assign_seq() from public, anon, authenticated;

create trigger files_assign_seq
  before insert or update on public.files
  for each row
  execute function public.files_assign_seq();

-- Trigger de sentencia: toma el lock del usuario del JWT ANTES de que la
-- sentencia bloquee ninguna fila (evita el deadlock descrito en la cabecera).
-- Sin JWT (service role) no hace nada: lo cubre el trigger de fila.
create or replace function public.files_lock_user_writes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is not null then
    -- ⚠️ MISMA clave que en files_assign_seq.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('noteflow.files.seq:' || uid::text, 0)
    );
  end if;
  return null;
end;
$$;

revoke execute on function public.files_lock_user_writes() from public, anon, authenticated;

create trigger files_lock_user_writes
  before insert or update on public.files
  for each statement
  execute function public.files_lock_user_writes();

-- Rezagados: cualquier fila que se hubiera quedado sin seq (solo posible si
-- esto no corrió en una única transacción) la recibe ahora vía trigger.
update public.files set seq = null where seq is null;

alter table public.files alter column seq set not null;

-- La consulta caliente del pull nuevo: "filas de ESTE usuario con seq > n,
-- ordenadas por seq".
create index files_user_id_seq_idx on public.files (user_id, seq);

-- PostgREST tiene que ver la columna nueva (Supabase ya recarga la caché de
-- esquema con su event trigger de DDL; esto es solo por si acaso).
notify pgrst, 'reload schema';
