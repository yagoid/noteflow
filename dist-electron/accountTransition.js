"use strict";
// Pure decision logic for what the app does with the PAID subsystems (NoteFlow
// Cloud + managed NoteFlow AI) when the account session appears or disappears.
// Lives in electron/ (not src/lib/) for the same reason as entitlements.ts:
// tsconfig.electron.json (rootDir: 'electron') cannot import renderer code, and
// only the main process owns this state. Covered by
// tests/electron/accountTransition.test.ts; main.ts applies the returned plan.
//
// Principle: signed out, the app falls back to its free/local state — the paid
// bits are an OFFER, never a broken possession — but NOTHING is destroyed:
// neither notes nor configuration. So on sign-out we turn Cloud sync OFF (which
// releases the mutual exclusion and lets GitHub Sync resume), we DROP the DEK
// (this machine must no longer be able to decrypt the user's notes, and a second
// account signing in here must never inherit the first one's key) and we revert
// the assistant to a BYO/local provider. What was on is remembered — WITHOUT any
// secret — in a small `accountRestore` record so signing back in with the SAME
// identity puts it all back, provided the entitlement is still alive.
Object.defineProperty(exports, "__esModule", { value: true });
exports.NO_AI_BASELINE = void 0;
exports.parseAccountRestore = parseAccountRestore;
exports.clearRestoreSurface = clearRestoreSurface;
exports.planAccountTransition = planAccountTransition;
exports.stepAiEntitlementBaseline = stepAiEntitlementBaseline;
const NO_OP = {
    disableCloud: false,
    resetKeys: false,
    enableCloud: false,
    setAiProvider: null,
};
/** Emails are compared case-insensitively (GoTrue normalizes, we don't rely on it). */
function sameIdentity(a, b) {
    if (!a || !b)
        return false;
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}
/** Runtime-safe read of settings.accountRestore (hand-editable JSON on disk). */
function parseAccountRestore(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const o = raw;
    if (typeof o.identity !== 'string' || !o.identity)
        return null;
    return {
        identity: o.identity,
        cloudEnabled: o.cloudEnabled === true,
        aiManaged: o.aiManaged === true,
    };
}
/**
 * A pending record is re-evaluated on every status change (entitlements arrive
 * async), which means it could otherwise sit there for boots on end and one day
 * overrule the user: if the entitlements fetch fails (verifyOtp's is
 * best-effort; until one succeeds they stay unknown), a user who signs
 * in and DELIBERATELY leaves Cloud off — or picks a BYO provider — would see it
 * flipped back on behind their back by a later refreshEntitlements.
 *
 * So an explicit user action on a surface, while signed in, WINS: it drops that
 * half of the record (Cloud enable/disable, or changing the active LLM
 * provider). Per-half rather than all-or-nothing, so touching the assistant
 * doesn't silently forfeit the Cloud restore that is still waiting for the
 * entitlements to land. Signed out, the record is untouched — it exists exactly
 * to describe the state of the session that left.
 *
 * Returns undefined when nothing changes, null to delete the record, or the
 * narrowed record to persist.
 */
function clearRestoreSurface(record, signedIn, surface) {
    if (!record || !signedIn)
        return undefined;
    const next = {
        ...record,
        cloudEnabled: surface === 'cloud' ? false : record.cloudEnabled,
        aiManaged: surface === 'ai' ? false : record.aiManaged,
    };
    if (next.cloudEnabled === record.cloudEnabled && next.aiManaged === record.aiManaged)
        return undefined;
    return next.cloudEnabled || next.aiManaged ? next : null;
}
/**
 * Decides what to do given the PREVIOUS observation of the account, the CURRENT
 * one and the local state. Idempotent by construction: it only acts on the real
 * signed-in→signed-out edge, or while a pending restore record matches the
 * signed-in identity — every other status change (an entitlements refresh, say)
 * is a no-op, so it can safely run on every `account:status-changed`.
 */
function planAccountTransition(previous, current, local) {
    // ── Sign-out (explicit, or a revoked refresh token clearing the session) ────
    if (previous.signedIn && !current.signedIn) {
        return {
            disableCloud: local.cloudEnabled,
            // Always: "signed out" must mean "this machine can no longer decrypt my
            // notes" — and it stops a different account from inheriting the key state.
            resetKeys: true,
            enableCloud: false,
            setAiProvider: local.aiManaged ? local.aiFallbackProvider : null,
            // With no known identity there is nothing to match on the way back in —
            // drop any stale record instead of writing an unmatchable one.
            restore: previous.identity
                ? {
                    identity: previous.identity,
                    cloudEnabled: local.cloudEnabled,
                    aiManaged: local.aiManaged,
                }
                : null,
        };
    }
    // ── Signed out (steady state) ───────────────────────────────────────────────
    // A pending record simply waits here for the next sign-in.
    if (!current.signedIn)
        return NO_OP;
    // ── Signed in: consume the restore record, if any ───────────────────────────
    const record = local.restore;
    if (!record)
        return NO_OP;
    // A different account: clean slate — a new user must not inherit what the
    // previous one had switched on.
    if (!sameIdentity(record.identity, current.identity))
        return { ...NO_OP, restore: null };
    // Nothing to put back (the user had neither paid feature on) — done.
    if (!record.cloudEnabled && !record.aiManaged)
        return { ...NO_OP, restore: null };
    // Entitlements not fetched yet: keep the record and wait for the next status
    // change — restoring against the placeholder would silently drop the record.
    if (!current.entitlementsKnown)
        return NO_OP;
    return {
        disableCloud: false,
        resetKeys: false,
        // Each half is restored only if its entitlement is still alive; if it is
        // gone, the feature is simply offered again by the UI (it is not "broken").
        enableCloud: record.cloudEnabled && current.entitlements.cloud && !local.cloudEnabled,
        setAiProvider: record.aiManaged && current.entitlements.ai && !local.aiManaged ? 'noteflow' : null,
        restore: null, // consumed
    };
}
exports.NO_AI_BASELINE = { identity: null, baseline: null };
/**
 * Steps the baseline with a new observation and says whether to auto-activate
 * the managed provider. Only a REAL false→true flip seen for the SAME identity
 * triggers it (the user subscribes while the app runs and hits Refresh):
 *  - an identity change (boot, sign-in, account switch, sign-out) only
 *    establishes a fresh baseline — a naive false→true on the first read would
 *    force-switch an already-subscribed user on every launch, even one who
 *    deliberately kept a BYO-key provider;
 *  - `fresh` must be false for anything not fetched in THIS run (unknown, or
 *    the on-disk cache): it never sets nor moves the baseline, so unknown→true
 *    and cached-false→true are NOT transitions.
 */
function stepAiEntitlementBaseline(prev, obs) {
    if (obs.identity !== prev.identity) {
        return {
            next: { identity: obs.identity, baseline: obs.identity !== null && obs.fresh ? obs.ai : null },
            autoSwitch: false,
        };
    }
    if (obs.identity === null || !obs.fresh)
        return { next: prev, autoSwitch: false };
    return {
        next: { identity: obs.identity, baseline: obs.ai },
        autoSwitch: prev.baseline === false && obs.ai,
    };
}
