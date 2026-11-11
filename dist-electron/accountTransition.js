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
// secret — in a small `accountRestore` record.
//
// Signing IN (the real signed-out → signed-in edge in this process) switches on
// whatever the account has PAID for: Cloud with the 'cloud' entitlement, the
// managed assistant with the 'ai' one (bundle = both). That covers a first
// sign-in and a new device, and supersedes any record a previous session left
// behind (same account or another). A session restored from disk at boot is NOT
// a sign-in, so a user who turned Cloud off is not overruled on every launch.
//
// While signed in, buying a plan is the other activation point: a REAL
// false→true flip of an entitlement for the same identity (stepEntitlementBaseline)
// switches that surface on. The opposite is symmetrical but stricter: once the
// app CONFIRMS that an entitlement is gone (a fresh server answer, never the
// unknown placeholder nor the on-disk cache), the surface it paid for is switched
// off exactly as on sign-out — Cloud disabled (journal kept, GitHub Sync resumes),
// the assistant back to the last BYO provider (planEntitlementSurfaces).
Object.defineProperty(exports, "__esModule", { value: true });
exports.NO_ENTITLEMENT_BASELINE = exports.ENTITLEMENT_KEYS = void 0;
exports.parseAccountRestore = parseAccountRestore;
exports.clearRestoreSurface = clearRestoreSurface;
exports.planAccountTransition = planAccountTransition;
exports.stepEntitlementBaseline = stepEntitlementBaseline;
exports.planEntitlementSurfaces = planEntitlementSurfaces;
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
 * signed-in→signed-out edge, on the real signed-out→signed-in edge, or while a
 * pending record matches the signed-in identity — every other status change
 * (an entitlements refresh on a stable session, say) is a no-op, so it can
 * safely run on every `account:status-changed`.
 *
 * On sign-in the effective record is "both halves requested" for the new
 * identity (it replaces any older record); from there the usual rules apply:
 * wait for the entitlements, then switch on each half whose entitlement is
 * alive and is not already on, and consume the record.
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
    // ── Sign-in (real edge in this process — never a session restored at boot) ─
    // Switch on whatever the account pays for. This supersedes any older record:
    // the same account's sign-out snapshot (a fresh sign-in is the moment to turn
    // the paid features on, whatever was on before) or another account's (which
    // must never leak into this one).
    const signingIn = !previous.signedIn;
    let record;
    if (signingIn) {
        // No identity to tie the pending activation to: nothing to do, and no
        // stale record left behind.
        if (!current.identity)
            return local.restore ? { ...NO_OP, restore: null } : NO_OP;
        record = { identity: current.identity, cloudEnabled: true, aiManaged: true };
    }
    else {
        // ── Signed in (stable): consume a pending record, if any ──────────────────
        record = local.restore;
        if (!record)
            return NO_OP;
        // A different account: clean slate — a new user must not inherit what the
        // previous one had switched on.
        if (!sameIdentity(record.identity, current.identity))
            return { ...NO_OP, restore: null };
        // Nothing left to switch on (both halves were decided by hand meanwhile,
        // or the record asks for nothing) — done.
        if (!record.cloudEnabled && !record.aiManaged)
            return { ...NO_OP, restore: null };
    }
    // Entitlements not fetched yet: keep the record and wait for the next status
    // change — evaluating against the placeholder would silently drop it. On the
    // sign-in edge the record is new, so it has to be persisted now.
    if (!current.entitlementsKnown)
        return signingIn ? { ...NO_OP, restore: record } : NO_OP;
    return {
        disableCloud: false,
        resetKeys: false,
        // Each half is switched on only if its entitlement is alive (and it is not
        // already on); without it the feature is simply offered by the UI.
        enableCloud: record.cloudEnabled && current.entitlements.cloud && !local.cloudEnabled,
        setAiProvider: record.aiManaged && current.entitlements.ai && !local.aiManaged ? 'noteflow' : null,
        restore: null, // consumed
    };
}
// ── Auto-activation on subscribe (while signed in) ───────────────────────────
/** The entitlements that auto-activate their surface: 'ai' → managed provider, 'cloud' → Cloud sync. */
exports.ENTITLEMENT_KEYS = ['ai', 'cloud'];
exports.NO_ENTITLEMENT_BASELINE = { identity: null, ai: null, cloud: null };
/**
 * Steps the baseline with a new observation and says which surfaces to
 * auto-activate (bundle = both). Only a REAL false→true flip seen for the SAME
 * identity triggers it (the user subscribes while the app runs and hits Refresh):
 *  - an identity change (boot, sign-in, account switch, sign-out) only
 *    establishes a fresh baseline — a naive false→true on the first read would
 *    force-switch an already-subscribed user on every launch, even one who
 *    deliberately kept a BYO-key provider or Cloud off. Activation on sign-in is
 *    planAccountTransition's job;
 *  - `fresh` must be false for anything not fetched in THIS run (unknown, or
 *    the on-disk cache): it never sets nor moves the baseline, so unknown→true
 *    and cached-false→true are NOT transitions.
 * It never asks to switch anything OFF — that is planEntitlementSurfaces' job,
 * which composes this step with the confirmed-loss rule.
 */
function stepEntitlementBaseline(prev, obs) {
    const none = { ai: false, cloud: false };
    if (obs.identity !== prev.identity) {
        const seeded = obs.identity !== null && obs.fresh;
        return {
            next: {
                identity: obs.identity,
                ai: seeded ? obs.entitlements.ai : null,
                cloud: seeded ? obs.entitlements.cloud : null,
            },
            activate: none,
        };
    }
    if (obs.identity === null || !obs.fresh)
        return { next: prev, activate: none };
    const activate = { ...none };
    for (const key of exports.ENTITLEMENT_KEYS)
        activate[key] = prev[key] === false && obs.entitlements[key];
    return {
        next: { identity: obs.identity, ai: obs.entitlements.ai, cloud: obs.entitlements.cloud },
        activate,
    };
}
/**
 * What an account status change means for the paid surfaces WHILE SIGNED IN
 * (sign-in / sign-out edges are planAccountTransition's): steps the baseline
 * (stepEntitlementBaseline — a real false→true for the same identity switches
 * the surface on) and applies the confirmed-loss rule:
 *
 *  - a FRESH observation (fetched from the server in this run) that says an
 *    entitlement is missing while its surface is on switches it OFF, like a
 *    sign-out does: `cloud` → Cloud disabled; `ai` → the assistant back to the
 *    BYO fallback. Bundle = both; each half only for its own entitlement.
 *    It is a state check, not an edge, so it also covers a subscription that
 *    lapsed while the app was closed (boot with Cloud/AI on, first fetch says
 *    false) — and is idempotent (already off → nothing).
 *  - unknown entitlements and the on-disk cache are NEVER enough to switch
 *    anything off: a failed fetch or a stale cache must not tear down a paid
 *    feature. (A failed fetch keeps the last known answer — account.ts never
 *    turns a failure into "no entitlements".)
 *
 * The two directions never collide: switching on needs the entitlement true,
 * switching off needs it false, in the same observation.
 */
function planEntitlementSurfaces(prev, obs, local) {
    const step = stepEntitlementBaseline(prev, obs);
    const confirmed = obs.identity !== null && obs.fresh;
    const lostCloud = confirmed && !obs.entitlements.cloud && local.cloudEnabled;
    const lostAi = confirmed && !obs.entitlements.ai && local.aiManaged;
    return {
        next: step.next,
        enableCloud: step.activate.cloud && !local.cloudEnabled,
        disableCloud: lostCloud,
        setAiProvider: step.activate.ai && !local.aiManaged ? 'noteflow' : lostAi ? local.aiFallbackProvider : null,
    };
}
