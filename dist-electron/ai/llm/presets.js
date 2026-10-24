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
 * must stay a sensible default: they mirror the seed of migration 0012 and the
 * proxy's FALLBACK_MODEL_CATALOG (tests/supabase/ai-catalog-mirror.test.ts).
 * Adding a model does NOT happen here — it is a row in the table.
 * All are tool-calling capable (the chat is agentic); the two DeepSeek models and
 * Xiaomi MiMo are text-only, the rest accept images (see NOTEFLOW_AI_MODEL_META).
 * The first entry is the de-facto default model for the preset (suggestedModels[0])
 * — today a text-only one, so a fresh managed setup starts WITHOUT image support
 * until the user picks another model (providerCapabilities gates the attach UI).
 */
exports.NOTEFLOW_AI_MODELS = [
    // Standard models (×1 quota).
    'deepseek/deepseek-v4-pro',
    'deepseek/deepseek-v4-flash',
    'xiaomi/mimo-v2.5-pro',
    'openai/gpt-5.6-luna',
    'anthropic/claude-haiku-4.5',
    // Mid-tier (×2 quota).
    'x-ai/grok-4.5',
    // Advanced models (×6 quota).
    'moonshotai/kimi-k3',
];
/**
 * Per-model metadata of the BACKUP catalog above (same role: only used until the
 * proxy's catalog has been cached — see ./managedCatalog.ts):
 *   - quotaMultiplier: what a real token costs against the monthly quota.
 *   - images: native vision support (the two DeepSeek models and Xiaomi MiMo
 *     are text-only — three of the five ×1 models).
 * The effective catalog (cached or this one) reaches the renderer through the
 * preset's `modelMeta` field so the model picker can flag quota cost, and is used
 * by providerCapabilities (llm/index.ts) to gate image attachments per model.
 */
exports.NOTEFLOW_AI_MODEL_META = {
    'deepseek/deepseek-v4-pro': { quotaMultiplier: 1, images: false },
    'deepseek/deepseek-v4-flash': { quotaMultiplier: 1, images: false },
    'xiaomi/mimo-v2.5-pro': { quotaMultiplier: 1, images: false },
    'openai/gpt-5.6-luna': { quotaMultiplier: 1, images: true },
    'anthropic/claude-haiku-4.5': { quotaMultiplier: 1, images: true },
    'x-ai/grok-4.5': { quotaMultiplier: 2, images: true },
    'moonshotai/kimi-k3': { quotaMultiplier: 6, images: true },
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
