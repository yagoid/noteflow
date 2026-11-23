// Pure decisions of the GitHub auto-sync loop (the timer lives in main.ts, the
// I/O in githubSync.autoPullNotes). Tested in tests/electron/githubAutoPull.test.ts.
//
// The loop ticks every 15 s while a NoteFlow window is focused and every 5 min
// otherwise. Each tick first asks GitHub for the branch head with the ETag of
// the last answer (`GET /repos/{o}/{r}/git/ref/heads/{branch}` +
// `If-None-Match`): 304 — or 200 with the same commit — means the remote has
// not moved since the last complete auto pull, so the tree is not fetched.
// A full pull still runs at least every GITHUB_FULL_PULL_MAX_AGE_MS (the old
// fixed cadence), so whatever a pull does besides applying remote changes
// (clearing syncError, temporary-note expiry, catch-up) never waits longer
// than it did before.

/** Tick interval while some NoteFlow window has the focus. */
export const GITHUB_AUTO_SYNC_FOCUSED_INTERVAL_MS = 15_000
/** Tick interval while no NoteFlow window has the focus (minimized, tray, another app). */
export const GITHUB_AUTO_SYNC_IDLE_INTERVAL_MS = 5 * 60 * 1000
/** A complete pull older than this is redone even if the head did not move. */
export const GITHUB_FULL_PULL_MAX_AGE_MS = 5 * 60 * 1000
/** Focusing the app runs a tick right away unless one started less than this ago. */
export const GITHUB_FOCUS_TICK_MIN_GAP_MS = 5_000

export function githubAutoSyncDelayMs(focused: boolean): number {
  return focused ? GITHUB_AUTO_SYNC_FOCUSED_INTERVAL_MS : GITHUB_AUTO_SYNC_IDLE_INTERVAL_MS
}

/**
 * The branch head an auto pull fully reconciled: the commit read BEFORE that
 * pull (a commit landing during the pull is newer, so the next check sees it)
 * and the ETag of that same answer.
 */
export interface SeenRemoteHead {
  /** remoteHeadKey of the connection it was read for. */
  key: string
  sha: string
  etag?: string
  /** When the complete pull that confirmed it finished (ms epoch). */
  pulledAt: number
}

/** Identity of a branch head: repo case-insensitive (like GitHub), branch exact. */
export function remoteHeadKey(owner: string, repo: string, branch: string): string {
  return `${owner}/${repo}`.toLowerCase() + '#' + branch
}

/** Answer of the head check (`error` covers network failures, 404, 409…). */
export type RemoteHeadResponse =
  | { status: 304 }
  | { status: 200; sha?: string; etag?: string }
  | { status: 'error' }

export type AutoPullPlan =
  /** Ask with this ETag; skip the pull if the head did not move. */
  | { kind: 'check'; etag?: string }
  /** Pull whatever the head says (still read first, to confirm it afterwards). */
  | { kind: 'full' }

export function planAutoPull(input: {
  seen: SeenRemoteHead | null
  key: string
  now: number
  /** The pull has work beyond remote changes (needsFullReconcile, first pull not ok yet). */
  mustReconcile: boolean
}): AutoPullPlan {
  const { seen, key, now, mustReconcile } = input
  if (!seen || seen.key !== key || mustReconcile) return { kind: 'full' }
  const age = now - seen.pulledAt
  // age < 0: the clock went back — no way to tell how old it is.
  if (age < 0 || age >= GITHUB_FULL_PULL_MAX_AGE_MS) return { kind: 'full' }
  return { kind: 'check', ...(seen.etag ? { etag: seen.etag } : {}) }
}

/**
 * Whether a `check` plan must pull after all. Only a positive "same head"
 * answer skips: 304 to the seen ETag, or 200 with the seen commit. Anything
 * else (another commit, no sha, an error) pulls — the pull reports the error.
 */
export function headChanged(seen: SeenRemoteHead, response: RemoteHeadResponse): boolean {
  if (response.status === 304) return seen.etag === undefined
  if (response.status === 200) return response.sha === undefined || response.sha !== seen.sha
  return true
}

/**
 * Whether an auto pull may confirm the head it read: a 200 with a commit, and
 * a pull that finished complete (no errors, not `incomplete` — truncated tree,
 * origin gate, transient GET failure). Otherwise the next tick pulls again.
 */
export function headToConfirm(
  response: RemoteHeadResponse,
  result: { errors: readonly string[]; incomplete?: boolean },
): { sha: string; etag?: string } | null {
  if (response.status !== 200 || response.sha === undefined) return null
  if (result.errors.length > 0 || result.incomplete === true) return null
  return { sha: response.sha, ...(response.etag ? { etag: response.etag } : {}) }
}

/** Focus tick: not while a tick runs, nor within the minimum gap of the last one. */
export function shouldRunFocusTick(now: number, lastTickStartedAt: number | null, running: boolean): boolean {
  if (running) return false
  if (lastTickStartedAt === null) return true
  const since = now - lastTickStartedAt
  return since < 0 || since >= GITHUB_FOCUS_TICK_MIN_GAP_MS
}

/**
 * Focus that did NOT run a tick (shouldRunFocusTick false, no tick running):
 * the pending timer may still be the unfocused 5-min one. Returns the delay to
 * reschedule it with — the focus tick as soon as the minimum gap allows,
 * never later than the focused cadence — or null to keep the timer, which is
 * due sooner already (`dueAt` = when it fires, null if none is armed).
 */
export function focusRescheduleDelayMs(now: number, lastTickStartedAt: number | null, dueAt: number | null): number | null {
  const sinceLast = lastTickStartedAt === null ? Infinity : now - lastTickStartedAt
  const delay = sinceLast < 0
    ? 0
    : Math.min(Math.max(0, GITHUB_FOCUS_TICK_MIN_GAP_MS - sinceLast), GITHUB_AUTO_SYNC_FOCUSED_INTERVAL_MS)
  if (dueAt !== null && dueAt - now <= delay) return null
  return delay
}
