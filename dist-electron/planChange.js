"use strict";
// Pure helpers for the "Upgrade to Bundle" plan change (no electron imports,
// so vitest can load it). Covered by tests/electron/planChange.test.ts. The
// networked part lives in account.ts (upgradeToBundle → Edge Function
// billing-change-plan, supabase/functions/billing-change-plan/logic.ts).
Object.defineProperty(exports, "__esModule", { value: true });
exports.planChangeOutcome = planChangeOutcome;
// billing-change-plan error codes → what the user can do about it.
const NOT_ELIGIBLE = new Set(['no_subscription', 'already_entitled', 'multiple_subscriptions', 'unsupported_plan']);
/**
 * Reads a billing-change-plan answer. Success is ONLY a 200 whose body says
 * `ok: true` (a gateway 404 before the function is deployed, or any other
 * shape, is a failure). Failures keep the server's `error.code` for logs.
 */
function planChangeOutcome(status, json) {
    const body = json && typeof json === 'object' ? json : null;
    if (status === 200 && body?.ok === true)
        return { ok: true, changed: body.changed !== false };
    const error = body?.error;
    const serverCode = typeof error?.code === 'string' ? error.code : 'unknown';
    if (serverCode === 'subscription_not_active') {
        return { ok: false, errorCode: 'planChangeSubscriptionInactive', serverCode };
    }
    if (NOT_ELIGIBLE.has(serverCode))
        return { ok: false, errorCode: 'planChangeNotEligible', serverCode };
    return { ok: false, errorCode: 'planChangeUnavailable', serverCode };
}
