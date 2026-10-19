"use strict";
// NoteFlow account backend (Supabase) — connection constants.
//
// These are filled in when the real Supabase project is created (see
// supabase/README.md for the operator steps). While empty, every account
// feature is inert: getAccountStatus() reports configured === false and the
// Settings → Account panel shows an informative placeholder.
//
// The anon key is PUBLIC by design (same model as the GitHub OAuth client ID
// embedded for the sync Device Flow): it grants nothing by itself — security
// comes from Row Level Security policies and per-user Auth JWTs.
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEMONSQUEEZY_CHECKOUT_URLS = exports.CLOUD_KEYS_URL = exports.AI_PROXY_URL = exports.SUPABASE_ANON_KEY = exports.SUPABASE_URL = void 0;
exports.isCloudConfigured = isCloudConfigured;
/** Supabase project URL, e.g. 'https://xyzcompany.supabase.co' (no trailing slash). */
exports.SUPABASE_URL = 'https://bolnhekicavuzscdjoty.supabase.co';
/** Supabase anon (public) API key. */
exports.SUPABASE_ANON_KEY = 'sb_publishable_1Ifj7iwZ7w_Xx5B2aLcDfQ_4AbBeFFx';
/** NoteFlow AI managed-LLM proxy (Edge Function ai-proxy, OpenAI-compatible). */
exports.AI_PROXY_URL = `${exports.SUPABASE_URL}/functions/v1/ai-proxy`;
/** NoteFlow Cloud managed-mode key service (Edge Function cloud-keys: setup/unlock). */
exports.CLOUD_KEYS_URL = `${exports.SUPABASE_URL}/functions/v1/cloud-keys`;
/**
 * Lemon Squeezy checkout URLs per product. Filled in once the products exist
 * in the LS store (see supabase/README.md § 6). While a URL is empty, its
 * `<product>CheckoutConfigured` flag is false and the plan card in the UI shows
 * "Coming soon" instead of the "Subscribe" button.
 */
exports.LEMONSQUEEZY_CHECKOUT_URLS = {
    ai: 'https://noteflow-app.lemonsqueezy.com/checkout/buy/d37cfca1-d828-42f7-93bb-20d747ac3ef1',
    cloud: 'https://noteflow-app.lemonsqueezy.com/checkout/buy/0010d7c7-46c5-4635-b214-0e2b378230b0',
    bundle: 'https://noteflow-app.lemonsqueezy.com/checkout/buy/4eb2e564-2c2b-4765-bfd0-a20bf3752cad',
};
/** True once the build carries a real Supabase project configuration. */
function isCloudConfigured() {
    return exports.SUPABASE_URL.length > 0 && exports.SUPABASE_ANON_KEY.length > 0;
}
