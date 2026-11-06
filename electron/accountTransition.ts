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
// switches that surface on. Losing an entitlement never switches anything off.

import { Entitlements } from './entitlements'

/**
 * Pending activation of the paid surfaces, persisted in settings.json →
 * `accountRestore`. Written on sign-out (what that session had switched on) and
 * on sign-in while the entitlements are still unknown (both halves requested,
 * i.e. "switch on whatever turns out to be paid"). NEVER carries tokens or
 * secrets: an email (the identity it applies to) and two booleans.
 */
export interface AccountRestoreRecord {
  identity: string
  cloudEnabled: boolean
  aiManaged: boolean
}

/** The pieces of the public account status this decision depends on. */
export interface AccountObservation {
  signedIn: boolean
  /** Email of the session (null while signed out). */
  identity: string | null
  entitlements: Entitlements
  /**
   * True once entitlements have been fetched from the server for this session
   * (or restored from account.ts's on-disk cache for the same user — the public
   * AccountStatus.entitlementsKnown). Without a cache they arrive ASYNC
   * (initAccount defers the refresh 5 s and retries with backoff; verifyOtp
   * brings them inline), so a pending activation must not be evaluated against
   * the NO_ENTITLEMENTS placeholder — it waits (persisted as the record), and the
   * record is re-evaluated on every status change while the identity keeps
   * matching.
   */
  entitlementsKnown: boolean
}

/** Local (app-side) state the plan reads and may change. */
export interface AccountLocalState {
  cloudEnabled: boolean
  /** True when settings.aiLlm.active === 'noteflow' (the managed plan). */
  aiManaged: boolean
  /** Provider to revert to when the managed plan stops being usable (last BYO, else the default). */
  aiFallbackProvider: string
  restore: AccountRestoreRecord | null
}

export interface AccountTransitionPlan {
  disableCloud: boolean
  /**
   * Wipe the whole key session: the DEK + its safeStorage cache AND the learned
   * state (remoteKeysKnown, the persisted keysMode) — see
   * cloudKeys.resetCloudKeysSession. All of it is scoped to the account that is
   * leaving; inheriting any of it poisons the next account on this machine.
   */
  resetKeys: boolean
  enableCloud: boolean
  /** Preset id to write into settings.aiLlm.active, or null to leave it alone. */
  setAiProvider: string | null
  /** undefined = leave the record as it is; null = delete it; a record = persist it. */
  restore?: AccountRestoreRecord | null
}

const NO_OP: AccountTransitionPlan = {
  disableCloud: false,
  resetKeys: false,
  enableCloud: false,
  setAiProvider: null,
}

/** Emails are compared case-insensitively (GoTrue normalizes, we don't rely on it). */
function sameIdentity(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** Runtime-safe read of settings.accountRestore (hand-editable JSON on disk). */
export function parseAccountRestore(raw: unknown): AccountRestoreRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.identity !== 'string' || !o.identity) return null
  return {
    identity: o.identity,
    cloudEnabled: o.cloudEnabled === true,
    aiManaged: o.aiManaged === true,
  }
}

/** The two surfaces the restore record can act on. */
export type RestoreSurface = 'cloud' | 'ai'

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
export function clearRestoreSurface(
  record: AccountRestoreRecord | null,
  signedIn: boolean,
  surface: RestoreSurface
): AccountRestoreRecord | null | undefined {
  if (!record || !signedIn) return undefined
  const next: AccountRestoreRecord = {
    ...record,
    cloudEnabled: surface === 'cloud' ? false : record.cloudEnabled,
    aiManaged: surface === 'ai' ? false : record.aiManaged,
  }
  if (next.cloudEnabled === record.cloudEnabled && next.aiManaged === record.aiManaged) return undefined
  return next.cloudEnabled || next.aiManaged ? next : null
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
export function planAccountTransition(
  previous: { signedIn: boolean; identity: string | null },
  current: AccountObservation,
  local: AccountLocalState
): AccountTransitionPlan {
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
    }
  }

  // ── Signed out (steady state) ───────────────────────────────────────────────
  // A pending record simply waits here for the next sign-in.
  if (!current.signedIn) return NO_OP

  // ── Sign-in (real edge in this process — never a session restored at boot) ─
  // Switch on whatever the account pays for. This supersedes any older record:
  // the same account's sign-out snapshot (a fresh sign-in is the moment to turn
  // the paid features on, whatever was on before) or another account's (which
  // must never leak into this one).
  const signingIn = !previous.signedIn
  let record: AccountRestoreRecord | null
  if (signingIn) {
    // No identity to tie the pending activation to: nothing to do, and no
    // stale record left behind.
    if (!current.identity) return local.restore ? { ...NO_OP, restore: null } : NO_OP
    record = { identity: current.identity, cloudEnabled: true, aiManaged: true }
  } else {
    // ── Signed in (stable): consume a pending record, if any ──────────────────
    record = local.restore
    if (!record) return NO_OP

    // A different account: clean slate — a new user must not inherit what the
    // previous one had switched on.
    if (!sameIdentity(record.identity, current.identity)) return { ...NO_OP, restore: null }

    // Nothing left to switch on (both halves were decided by hand meanwhile,
    // or the record asks for nothing) — done.
    if (!record.cloudEnabled && !record.aiManaged) return { ...NO_OP, restore: null }
  }

  // Entitlements not fetched yet: keep the record and wait for the next status
  // change — evaluating against the placeholder would silently drop it. On the
  // sign-in edge the record is new, so it has to be persisted now.
  if (!current.entitlementsKnown) return signingIn ? { ...NO_OP, restore: record } : NO_OP

  return {
    disableCloud: false,
    resetKeys: false,
    // Each half is switched on only if its entitlement is alive (and it is not
    // already on); without it the feature is simply offered by the UI.
    enableCloud: record.cloudEnabled && current.entitlements.cloud && !local.cloudEnabled,
    setAiProvider: record.aiManaged && current.entitlements.ai && !local.aiManaged ? 'noteflow' : null,
    restore: null, // consumed
  }
}

// ── Auto-activation on subscribe (while signed in) ───────────────────────────

/** The entitlements that auto-activate their surface: 'ai' → managed provider, 'cloud' → Cloud sync. */
export const ENTITLEMENT_KEYS = ['ai', 'cloud'] as const
export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number]

/**
 * Per-identity memory of each entitlement for the auto-activation on subscribe.
 * A null value = no FRESH observation yet of that entitlement for this identity.
 */
export interface EntitlementBaseline {
  identity: string | null
  ai: boolean | null
  cloud: boolean | null
}

export const NO_ENTITLEMENT_BASELINE: EntitlementBaseline = { identity: null, ai: null, cloud: null }

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
 * It never asks to switch anything OFF: losing an entitlement just makes the UI
 * offer the feature again.
 */
export function stepEntitlementBaseline(
  prev: EntitlementBaseline,
  obs: { identity: string | null; entitlements: Entitlements; fresh: boolean }
): { next: EntitlementBaseline; activate: Record<EntitlementKey, boolean> } {
  const none: Record<EntitlementKey, boolean> = { ai: false, cloud: false }
  if (obs.identity !== prev.identity) {
    const seeded = obs.identity !== null && obs.fresh
    return {
      next: {
        identity: obs.identity,
        ai: seeded ? obs.entitlements.ai : null,
        cloud: seeded ? obs.entitlements.cloud : null,
      },
      activate: none,
    }
  }
  if (obs.identity === null || !obs.fresh) return { next: prev, activate: none }
  const activate = { ...none }
  for (const key of ENTITLEMENT_KEYS) activate[key] = prev[key] === false && obs.entitlements[key]
  return {
    next: { identity: obs.identity, ai: obs.entitlements.ai, cloud: obs.entitlements.cloud },
    activate,
  }
}
