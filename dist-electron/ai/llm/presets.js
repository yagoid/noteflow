"use strict";
// Catalog of LLM provider presets. Two underlying implementations cover everything:
//   - 'anthropic'  → official SDK (Claude)
//   - 'openai'     → OpenAI-compatible /chat/completions + /models (OpenAI, DeepSeek, MiniMax,
//                    OpenRouter, Ollama, and any custom server)
// Each preset stores its OWN baseUrl / model / key (see LlmConfigStored.byPreset), so switching
// providers never mixes credentials. Base URLs are editable so users can point at regional
// endpoints (e.g. MiniMax China) or self-hosted gateways.
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRESET_BY_ID = exports.PRESETS = exports.NOTEFLOW_AI_MODEL_META = exports.NOTEFLOW_AI_MODELS = void 0;
exports.presetOf = presetOf;
const cloudConfig_1 = require("../../cloudConfig");
/**
 * BACKUP catalog of the managed NoteFlow AI plan (OpenRouter model ids). The live
 * catalog is served by the proxy (GET /models, from the Supabase table
 * public.ai_models) and cached in settings.json — see ./managedCatalog.ts. These
 * constants are only used until a valid catalog has been downloaded once (fresh
 * install, never signed in, or a proxy too old to send the metadata), so they
 * must stay a sensible default: they mirror the seed of migration 0013 and the
 * proxy's FALLBACK_MODEL_CATALOG (tests/supabase/ai-catalog-mirror.test.ts).
 * Adding a model does NOT happen here — it is a row in the table.
 * All are tool-calling capable (the chat is agentic) and accept images (see
 * NOTEFLOW_AI_MODEL_META). The first entry is the de-facto default model for the
 * preset (suggestedModels[0]) — the recommended one.
 */
exports.NOTEFLOW_AI_MODELS = [
    'deepseek/deepseek-v4.1-flash-1017',
    'openai/gpt-5.6-luna',
    'anthropic/claude-haiku-5.5',
    'xiaomi/mimo-v2.6-pro',
    'openai/gpt-5.6-sol',
];
/**
 * Per-model metadata of the BACKUP catalog above (same role: only used until the
 * proxy's catalog has been cached — see ./managedCatalog.ts):
 *   - costIndex: relative cost of a typical message (what the proxy's
 *     modelsListBody computes for the same catalog — the mirror test checks it).
 *   - images: native vision support.
 *   - recommended: the picker's highlighted model.
 * The effective catalog (cached or this one) reaches the renderer through the
 * preset's `modelMeta` field so the model picker can flag cost, and is used by
 * providerCapabilities (llm/index.ts) to gate image attachments per model.
 */
exports.NOTEFLOW_AI_MODEL_META = {
    'deepseek/deepseek-v4.1-flash-1017': { costIndex: 1, images: true, recommended: true },
    'openai/gpt-5.6-luna': { costIndex: 2, images: true, recommended: false },
    'anthropic/claude-haiku-5.5': { costIndex: 1, images: true, recommended: false },
    'xiaomi/mimo-v2.6-pro': { costIndex: 2, images: true, recommended: false },
    'openai/gpt-5.6-sol': { costIndex: 29, images: true, recommended: false },
};
exports.PRESETS = [
    // NoteFlow AI: the managed plan (subscription). The "key" is a fresh Supabase access token of
    // the signed-in NoteFlow account, resolved per request in resolveConfigAsync (llm/index.ts).
    { id: 'noteflow', label: 'NoteFlow AI', impl: 'openai', baseUrl: cloudConfig_1.AI_PROXY_URL, needsKey: false, editableBaseUrl: false, suggestedModels: exports.NOTEFLOW_AI_MODELS, modelMeta: exports.NOTEFLOW_AI_MODEL_META },
    { id: 'anthropic', label: 'Anthropic (Claude)', impl: 'anthropic', baseUrl: '', needsKey: true, editableBaseUrl: false, suggestedModels: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5'] },
    { id: 'openai', label: 'OpenAI', impl: 'openai', baseUrl: 'https://api.openai.com/v1', needsKey: true, editableBaseUrl: true, suggestedModels: ['gpt-4o', 'gpt-4o-mini'] },
    { id: 'deepseek', label: 'DeepSeek', impl: 'openai', baseUrl: 'https://api.deepseek.com/v1', needsKey: true, editableBaseUrl: true, suggestedModels: ['deepseek-chat', 'deepseek-reasoner'], images: false },
    { id: 'minimax', label: 'MiniMax', impl: 'openai', baseUrl: 'https://api.minimax.io/v1', needsKey: true, editableBaseUrl: true, suggestedModels: ['MiniMax-Text-01'], images: false },
    { id: 'moonshot', label: 'Moonshot (Kimi)', impl: 'openai', baseUrl: 'https://api.moonshot.ai/v1', needsKey: true, editableBaseUrl: true, suggestedModels: ['kimi-k2-0711-preview', 'moonshot-v1-8k'], images: false },
    { id: 'openrouter', label: 'OpenRouter', impl: 'openai', baseUrl: 'https://openrouter.ai/api/v1', needsKey: true, editableBaseUrl: true, suggestedModels: [] },
    { id: 'opencode', label: 'OpenCode Zen', impl: 'openai', baseUrl: 'https://opencode.ai/zen/go/v1', needsKey: true, editableBaseUrl: true, suggestedModels: [] },
    { id: 'ollama', label: 'Ollama (local)', impl: 'openai', baseUrl: 'http://localhost:11434/v1', needsKey: false, editableBaseUrl: true, suggestedModels: [] },
    { id: 'custom', label: 'Custom (OpenAI-compatible)', impl: 'openai', baseUrl: '', needsKey: false, editableBaseUrl: true, suggestedModels: [] },
];
exports.PRESET_BY_ID = Object.fromEntries(exports.PRESETS.map((p) => [p.id, p]));
function presetOf(id) {
    // Unknown/corrupted ids fall back to Anthropic (the historical default and
    // DEFAULT_LLM_CONFIG.active) — deliberately NOT PRESETS[0], which is now the
    // managed NoteFlow AI preset and must never hijack existing users' configs.
    return exports.PRESET_BY_ID[id] ?? exports.PRESET_BY_ID['anthropic'];
}
