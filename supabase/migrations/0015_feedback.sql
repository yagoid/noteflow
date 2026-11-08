-- NoteFlow — Feedback in-app (Ajustes → Acerca de → "Send feedback")
--
-- Buzón de reportes de bugs / sugerencias que la app de escritorio envía
-- directamente vía PostgREST (electron/feedback.ts). El operador los lee desde
-- el dashboard de Supabase (Table Editor o SQL Editor, que usan el service
-- role) — ver supabase/README.md § 8.
--
-- Columnas:
--   * kind: 'bug' | 'suggestion' | 'other' (selector del formulario).
--   * message: el texto del usuario, ya recortado por el cliente; 1..5000
--     caracteres (mismo límite que FEEDBACK_MESSAGE_MAX en
--     electron/feedbackLogic.ts).
--   * contact: email OPCIONAL para que el operador pueda responder (≤ 254, el
--     máximo de una dirección de correo). Validación laxa en el cliente.
--   * app_version / platform / os_version / locale: diagnóstico que el main
--     añade SOLO si el usuario marca "Include app and system version" (si no,
--     null). Con tope de longitud para que un cliente manipulado no pueda meter
--     texto arbitrario largo por ahí.
--   * user_id: auth.uid() del que envía si tenía sesión iniciada (lo pone el
--     DEFAULT, el cliente no lo manda); null si es anónimo. `on delete set null`:
--     borrar la cuenta no borra el feedback, solo lo desvincula.
--
-- Acceso: RLS activada con UNA sola policy, de INSERT, para anon y
-- authenticated. No hay policies de SELECT/UPDATE/DELETE a propósito: ningún
-- cliente puede leer ni tocar el buzón (ni siquiera sus propios envíos); solo el
-- service role (que salta RLS) lo lee. Por eso el cliente inserta con
-- `Prefer: return=minimal` (sin RETURNING, que exigiría SELECT).
-- Grants mínimos: se revoca todo y se concede INSERT solo sobre las columnas
-- que manda el cliente — id, created_at y user_id los fijan sus defaults (un
-- cliente no puede falsear la fecha ni el autor).
--
-- Anti-abuso: la anon key es pública, así que cualquiera puede insertar. Los
-- checks de longitud acotan el tamaño de cada fila; no hay rate limiting (si
-- algún día llega spam, añadir un trigger con límite por ventana de tiempo o
-- mover el envío a una Edge Function).
--
-- Orden de despliegue: aplicar ANTES de publicar la versión de la app que trae
-- el formulario (sin la tabla, PostgREST responde 404 y la app muestra "no se
-- pudo enviar", sin más efectos).

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('bug', 'suggestion', 'other')),
  -- btrim con el juego de blancos explícito: el btrim por defecto solo quita
  -- espacios, y un mensaje de solo saltos de línea no debe contar como texto.
  message text not null check (
    char_length(message) <= 5000
    and char_length(btrim(message, E' \t\r\n')) >= 1
  ),
  contact text check (contact is null or char_length(contact) <= 254),
  app_version text check (app_version is null or char_length(app_version) <= 64),
  platform text check (platform is null or char_length(platform) <= 64),
  os_version text check (os_version is null or char_length(os_version) <= 128),
  locale text check (locale is null or char_length(locale) <= 64),
  user_id uuid default auth.uid() references auth.users(id) on delete set null
);

-- El dashboard los lista del más reciente al más antiguo.
create index feedback_created_at_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;

-- Única policy: cualquiera (con o sin sesión) puede ENVIAR feedback. Si hay
-- sesión, la fila solo puede llevar su propio user_id (el default ya lo pone;
-- la policy impide atribuírselo a otro usuario).
create policy "Anyone can send feedback"
  on public.feedback
  for insert
  to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

revoke all on table public.feedback from public, anon, authenticated;
grant insert (kind, message, contact, app_version, platform, os_version, locale)
  on table public.feedback
  to anon, authenticated;
