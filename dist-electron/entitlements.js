"use strict";
// Pure entitlement derivation from the `subscriptions` rows the client can read
// via RLS. Lives in electron/ (not src/lib/) because only the main process needs
// it — tsconfig.electron.json (rootDir: 'electron') cannot import renderer code,
// and the renderer only ever sees the derived {ai, cloud} booleans in the public
// account status. Covered by tests/electron/entitlements.test.ts.
Object.defineProperty(exports, "__esModule", { value: true });
exports.NO_ENTITLEMENTS = exports.BILLING_PROVIDER = void 0;
exports.computeEntitlements = computeEntitlements;
exports.hasBillingSubscription = hasBillingSubscription;
/** `subscriptions.provider` of rows written by the Lemon Squeezy webhook. */
exports.BILLING_PROVIDER = 'lemonsqueezy';
exports.NO_ENTITLEMENTS = { ai: false, cloud: false };
/**
 * A product is entitled when some row carries that product (or 'bundle') with
 * status 'active'. Any other status (past_due, canceled, expired) grants nothing
 * — grace periods, if ever wanted, are a server-side decision (the webhook keeps
 * status 'active' during them), not a client one.
 */
function computeEntitlements(rows) {
    let ai = false;
    let cloud = false;
    for (const row of rows ?? []) {
        if (!row || row.status !== 'active')
            continue;
        if (row.product === 'ai' || row.product === 'bundle')
            ai = true;
        if (row.product === 'cloud' || row.product === 'bundle')
            cloud = true;
    }
    return { ai, cloud };
}
/**
 * Does the account have (or had) a subscription billed through Lemon Squeezy —
 * one the customer portal can manage (cancel, change plan, card, invoices)?
 * Any status counts: past_due needs the card updated, and a canceled/expired
 * one still has its invoices there. `provider='manual'` rows (comps granted by
 * the operator) have nothing to manage and never count.
 */
function hasBillingSubscription(rows) {
    return (rows ?? []).some((row) => !!row && row.provider === exports.BILLING_PROVIDER);
}
