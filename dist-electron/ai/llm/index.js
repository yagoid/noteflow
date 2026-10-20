"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_LLM_CONFIG = exports.decryptSecret = exports.encryptSecret = exports.PRESETS = void 0;
exports.withActiveProvider = withActiveProvider;
exports.byoFallbackProvider = byoFallbackProvider;
exports.acceptsModel = acceptsModel;
exports.acceptsBaseUrl = acceptsBaseUrl;
exports.resolveConfig = resolveConfig;
exports.resolveConfigAsync = resolveConfigAsync;
exports.providerCapabilities = providerCapabilities;
exports.toPublic = toPublic;
exports.notConfiguredMessage = notConfiguredMessage;
exports.getProvider = getProvider;
const presets_1 = require("./presets");
const secret_1 = require("./secret");
const anthropic_1 = require("./anthropic");
const openaiCompatible_1 = require("./openaiCompatible");
// No import cycle: account.ts only pulls ./secret and leaf modules (cloudConfig, entitlements*,
// settingsFile), never this module.
const account_1 = require("../../account");
const entitlementsRetry_1 = require("../../entitlementsRetry");
var presets_2 = require("./presets");
Object.defineProperty(exports, "PRESETS", { enumerable: true, get: function () { return presets_2.PRESETS; } });
var secret_2 = require("./secret");
Object.defineProperty(exports, "encryptSecret", { enumerable: true, get: function () { return secret_2.encryptSecret; } });
Object.defineProperty(exports, "decryptSecret", { enumerable: true, get: function () { return secret_2.decryptSecret; } });
exports.DEFAULT_LLM_CONFIG = { active: 'anthropic', byPreset: {} };
/**
 * Switches the active preset, remembering the BYO provider being left behind
 * whenever the managed `noteflow` plan takes over. That memory (lastByoProvider)
 * is what a sign-out reverts to — the managed plan stops working without a
 * session, and silently dropping the user on the generic default would lose the
 * provider they had configured.
 */
function withActiveProvider(cfg, next) {
    const out = { ...cfg, active: next };
    if (next === 'noteflow' && cfg.active !== 'noteflow')
        out.lastByoProvider = cfg.active;
    return out;
}
/** Provider to fall back to when `noteflow` stops being usable: the last BYO one
 *  the user had active (if it is still a known preset), else the default. */
function byoFallbackProvider(cfg) {
    const last = cfg.lastByoProvider;
    if (last && last !== 'noteflow' && presets_1.PRESETS.some((p) => p.id === last))
        return last;
    return exports.DEFAULT_LLM_CONFIG.active;
}
function effectiveModel(cfg) {
    const preset = (0, presets_1.presetOf)(cfg.active);
    const ps = cfg.byPreset[preset.id] ?? {};
    const stored = ps.model?.trim() || '';
    // Presets with `modelMeta` (today only the managed `noteflow` plan) serve a CURATED
    // catalog that rotates: the proxy rejects anything outside it, so a model the user
    // picked months ago can silently become invalid and break every request. Fall back to
    // the first suggested model in that case. Everywhere else the model is free-form (the
    // user may type any id their provider serves), so the stored value is honoured as-is.
    if (preset.modelMeta && stored && !preset.suggestedModels.includes(stored)) {
        return preset.suggestedModels[0] || stored;
    }
    return stored || preset.suggestedModels[0] || '';
}
/**
 * Whether `model` may be PERSISTED for `presetId`. Presets with a curated catalog
 * (`modelMeta` — today only the managed plan) accept nothing outside it: storing another
 * id would leave settings.json holding a model the proxy rejects while effectiveModel
 * resolves the requests to a different one — stored and used must never diverge. BYO
 * presets accept anything (the user knows what their provider serves).
 * Compares the TRIMMED id, exactly like effectiveModel does, so both guards agree on
 * what belongs to the catalog (a padded id must not be accepted here and rewritten there).
 */
function acceptsModel(presetId, model) {
    const preset = (0, presets_1.presetOf)(presetId);
    return !preset.modelMeta || preset.suggestedModels.includes(model.trim());
}
/**
 * Whether a custom base URL may be stored/used for `presetId`. Presets with
 * `editableBaseUrl: false` are pinned to their built-in endpoint — above all the
 * managed `noteflow` one, whose credential is the user's Supabase access token:
 * honouring a stored URL there would hand that token to an arbitrary host.
 */
function acceptsBaseUrl(presetId) {
    return (0, presets_1.presetOf)(presetId).editableBaseUrl;
}
/** The endpoint requests actually go to. A non-editable preset ALWAYS resolves to its own
 *  baseUrl, whatever settings.json says (it may have been written by an older build or by hand). */
function effectiveBaseUrl(cfg) {
    const preset = (0, presets_1.presetOf)(cfg.active);
    if (!preset.editableBaseUrl)
        return preset.baseUrl;
    const ps = cfg.byPreset[preset.id] ?? {};
    return ps.baseUrl?.trim() || preset.baseUrl;
}
/** Decrypt the active preset's key and fill defaults — in-memory only, never persisted.
 *  NOTE: for the managed `noteflow` preset this leaves apiKey empty — use
 *  resolveConfigAsync wherever a provider is about to make real requests. */
function resolveConfig(cfg) {
    const preset = (0, presets_1.presetOf)(cfg.active);
    const ps = cfg.byPreset[preset.id] ?? {};
    return {
        impl: preset.impl,
        model: effectiveModel(cfg),
        baseUrl: effectiveBaseUrl(cfg),
        apiKey: ps.encryptedApiKey ? (0, secret_1.decryptSecret)(ps.encryptedApiKey) : '',
    };
}
/**
 * Like resolveConfig, but for the managed `noteflow` preset the credential is a
 * FRESH Supabase access token of the NoteFlow account session (GoTrue tokens
 * expire in ~1h, so it must be minted per request — never stored like an API
 * key). Throws a user-facing error when there is no signed-in session.
 */
async function resolveConfigAsync(cfg) {
    const resolved = resolveConfig(cfg);
    if ((0, presets_1.presetOf)(cfg.active).id !== 'noteflow')
        return resolved;
    const token = await (0, account_1.getAccessToken)();
    if (!token) {
        throw new Error('NoteFlow AI needs your NoteFlow account. Sign in from Settings → Account and try again.');
    }
    return { ...resolved, apiKey: token };
}
/** Native attachment support per preset (the app never extracts text itself). */
function providerCapabilities(preset, activeModel) {
    // PDF is only reliable on Anthropic (native document blocks). Images (vision) are model-dependent,
    // so each preset declares a default via `images`: text-only providers (DeepSeek, MiniMax, Moonshot's
    // suggested models) set it to false; vision-capable/flexible ones default to true.
    // The managed `noteflow` preset mixes vision and text-only models in one catalog, so its vision
    // flag is PER MODEL (preset.modelMeta): the active model decides. Unknown/empty model → default true.
    let images = preset.images ?? true;
    if (preset.modelMeta && activeModel) {
        images = preset.modelMeta[activeModel]?.images ?? images;
    }
    return { images, pdf: preset.impl === 'anthropic' };
}
/** Renderer-safe projection of the ACTIVE preset: no key, plus a `configured` flag the UI gates on. */
function toPublic(cfg) {
    const preset = (0, presets_1.presetOf)(cfg.active);
    const ps = cfg.byPreset[preset.id] ?? {};
    const model = effectiveModel(cfg);
    const hasKey = !!ps.encryptedApiKey;
    let configured = (!preset.needsKey || hasKey) && !!model;
    if (preset.id === 'noteflow') {
        // The managed plan needs a signed-in account AND an active 'ai' (or
        // 'bundle') subscription — otherwise the proxy answers 401/403. Entitlements
        // that were never fetched (offline boot, keychain locked…) are UNKNOWN, not
        // false: let the request through and let the proxy judge (403 if not entitled).
        configured = configured && (0, entitlementsRetry_1.isManagedAiUsable)((0, account_1.getAccountStatus)());
    }
    return {
        active: preset.id,
        model,
        baseUrl: effectiveBaseUrl(cfg),
        hasKey,
        configured,
        capabilities: providerCapabilities(preset, model),
    };
}
/** User-facing reason why toPublic().configured is false — tailored for the managed preset. */
function notConfiguredMessage(cfg) {
    if ((0, presets_1.presetOf)(cfg.active).id === 'noteflow') {
        const status = (0, account_1.getAccountStatus)();
        if (!status.signedIn)
            return 'NoteFlow AI needs your NoteFlow account — sign in from Settings → Account.';
        // Unknown entitlements never land here (isManagedAiUsable lets them through).
        if (!(0, entitlementsRetry_1.isManagedAiUsable)(status))
            return 'NoteFlow AI requires an active subscription — manage your plan in Settings → Account.';
    }
    return 'No LLM provider configured';
}
function getProvider(resolved) {
    if (resolved.impl === 'anthropic')
        return new anthropic_1.AnthropicProvider(resolved);
    return new openaiCompatible_1.OpenAiCompatibleProvider(resolved);
}
