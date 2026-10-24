-- NoteFlow — Fase 4.1 (NoteFlow AI): catálogo de modelos en base de datos
--
-- Hasta ahora el catálogo del plan gestionado (qué modelos sirve, su
-- multiplicador de cuota y si aceptan imágenes) estaba hardcodeado en DOS
-- sitios — la Edge Function ai-proxy (logic.ts) y la app de escritorio
-- (electron/ai/llm/presets.ts) —, así que añadir un modelo exigía redeploy Y
-- release de la app. Desde esta migración la fuente de verdad es esta tabla:
--   * ai-proxy la lee con el service role (caché en memoria de ~60 s) y de ella
--     salen la allowlist de /chat/completions, el multiplicador con el que se
--     reserva y liquida la cuota, y el cuerpo de GET /models (ids + metadatos);
--   * la app descarga GET /models, lo cachea en sus ajustes locales y muestra
--     esos modelos en el selector.
-- Añadir un modelo = insertar una fila (ver supabase/README.md § 6). Retirarlo =
-- `enabled = false` (mejor que borrar: queda el histórico de su configuración).
-- Las constantes de logic.ts / presets.ts se quedan como RESPALDO (tabla
-- ilegible o sin filas habilitadas) y deben coincidir con el seed de abajo.
--
-- Columnas:
--   * id: id de modelo de OpenRouter (p. ej. 'anthropic/claude-haiku-4.5').
--     DEBE soportar tool calling (el chat de NoteFlow es agéntico).
--   * quota_multiplier: lo que cuesta un token real contra la cuota mensual
--     (1 = estándar). numeric para admitir niveles no enteros (p. ej. 1.5).
--   * images: visión nativa (la app solo ofrece adjuntar imágenes si es true).
--   * enabled: solo las filas habilitadas se sirven.
--   * sort_order: orden del selector; el PRIMER modelo es el que usa por
--     defecto quien activa NoteFlow AI sin elegir. Seed en pasos de 10 para poder
--     intercalar modelos sin renumerar.
--
-- Acceso: RLS activada SIN políticas → anon/authenticated no leen nada (además
-- se revocan sus grants, defensa en profundidad). Solo la Edge Function la lee
-- con el service role (que salta RLS), igual que subscriptions/usage_events.
--
-- Orden de despliegue: indiferente. La función actual no conoce la tabla, y la
-- nueva sirve el catálogo de respaldo mientras la tabla no exista. Lo natural:
-- aplicar esta migración y después redesplegar ai-proxy.

create table public.ai_models (
  id text primary key check (length(btrim(id)) > 0),
  -- Sin default a propósito: cada insert DEBE declarar coste y visión (un olvido
  -- no puede dejar un modelo caro a ×1 ni ofrecer imágenes a uno de solo texto).
  quota_multiplier numeric not null check (quota_multiplier > 0),
  images boolean not null,
  enabled boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

alter table public.ai_models enable row level security;

revoke all on table public.ai_models from public, anon, authenticated;

-- Seed: el catálogo vigente, mismo orden, multiplicadores y visión que
-- FALLBACK_MODEL_CATALOG (supabase/functions/ai-proxy/logic.ts) y
-- NOTEFLOW_AI_MODELS / NOTEFLOW_AI_MODEL_META (electron/ai/llm/presets.ts) —
-- tests/supabase/ai-catalog-mirror.test.ts lo comprueba. `on conflict do
-- nothing`: re-ejecutar la migración no pisa cambios hechos a mano.
insert into public.ai_models (id, quota_multiplier, images, enabled, sort_order) values
  -- Estándar (×1). Los dos DeepSeek y MiMo son solo texto.
  ('deepseek/deepseek-v4-pro',   1, false, true, 10),
  ('deepseek/deepseek-v4-flash', 1, false, true, 20),
  ('xiaomi/mimo-v2.5-pro',       1, false, true, 30),
  ('openai/gpt-5.6-luna',        1, true,  true, 40),
  ('anthropic/claude-haiku-4.5', 1, true,  true, 50),
  -- Intermedio (×2).
  ('x-ai/grok-4.5',              2, true,  true, 60),
  -- Avanzados (×6).
  ('moonshotai/kimi-k3',         6, true,  true, 70)
on conflict (id) do nothing;
