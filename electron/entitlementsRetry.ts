// Pure pieces of the entitlements lifecycle that account.ts wires to timers,
// powerMonitor and net: the retry schedule, which failures are worth retrying,
// the persisted "last known entitlements" cache and the known/unknown rule the
// consumers apply. No electron imports — covered by
// tests/electron/entitlementsRetry.test.ts.
//
// Why this exists: entitlements used to be fetched ONCE at boot. A single
// transient failure (offline boot, keychain still locked, a 5xx) left them at
// NO_ENTITLEMENTS for the whole session, so a paying user saw Subscribe cards
// (double-billing risk) and the managed AI refused to run. Now:
//   - "never fetched" is UNKNOWN (entitlementsKnown=false), never "not entitled";
//   - transient failures are retried with backoff (+ on resume / back online);
//   - the last good answer is cached on disk so a restart is known from t=0.

import type { Entitlements } from './entitlements'

/**
 * Backoff between entitlement fetch attempts: quick at first (the usual cause
 * is a boot racing the network), then settling at a 10-minute cap so a machine
 * that stays offline doesn't hammer anything.
 */
export const ENTITLEMENTS_RETRY_DELAYS_MS: readonly number[] = [
  5_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000,
]

/** ±20% jitter: many clients coming back online at once must not sync up. */
const JITTER = 0.2

/**
 * Delay before retry number `attempt` (0-based). Past the end of the table it
 * stays at the cap. `random` is injectable for tests (defaults to Math.random).
 */
export function entitlementsRetryDelayMs(attempt: number, random: () => number = Math.random): number {
  const table = ENTITLEMENTS_RETRY_DELAYS_MS
  const idx = Math.min(Math.max(0, Math.floor(attempt)), table.length - 1)
  const base = table[idx]
  const factor = 1 - JITTER + 2 * JITTER * Math.min(1, Math.max(0, random()))
  return Math.round(base * factor)
}

/**
 * Should a failed entitlements fetch be retried later? Only TRANSIENT causes:
 * the network, a server/PostgREST error, or a session whose refresh token can't
 * be decrypted right now (keychain locked). Not retried: a build without a
 * Supabase project and a genuinely absent session — nothing will change by
 * waiting. Takes the AccountErrorCode as a plain string to stay import-free.
 */
export function isRetryableEntitlementsFailure(errorCode: string | undefined): boolean {
  return errorCode === 'network' || errorCode === 'refreshFailed' || errorCode === 'sessionLocked'
}

/**
 * Last successfully fetched entitlements, persisted in settings.json →
 * `account.entitlementsCache`. Not secret (two booleans), tagged with the user
 * it belongs to so a stale cache can never leak into a different account.
 */
export interface EntitlementsCache {
  userId: string
  ai: boolean
  cloud: boolean
  fetchedAt: string // ISO
}

/**
 * Runtime-safe read of the persisted cache (hand-editable JSON on disk). Returns
 * null unless it is well-formed AND belongs to `userId` (the stored session's).
 */
export function parseEntitlementsCache(
  raw: unknown,
  userId: string | undefined | null
): { entitlements: Entitlements; fetchedAt: string } | null {
  if (!userId || !raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.userId !== userId) return null
  if (typeof o.ai !== 'boolean' || typeof o.cloud !== 'boolean') return null
  if (typeof o.fetchedAt !== 'string' || Number.isNaN(Date.parse(o.fetchedAt))) return null
  return { entitlements: { ai: o.ai, cloud: o.cloud }, fetchedAt: o.fetchedAt }
}

/** The bits of the public AccountStatus the known/unknown rule looks at. */
export interface EntitlementsView {
  signedIn: boolean
  entitlements: Entitlements
  entitlementsKnown: boolean
}

/**
 * May the managed NoteFlow AI preset be used? Signed in AND (entitled, or not
 * known yet). Unknown is NOT "not entitled": the proxy is the real judge (it
 * answers 403 without an active plan), so refusing locally on an unknown would
 * lock a paying user out every time the boot fetch fails.
 */
export function isManagedAiUsable(status: EntitlementsView): boolean {
  return status.signedIn && (status.entitlements.ai || !status.entitlementsKnown)
}
