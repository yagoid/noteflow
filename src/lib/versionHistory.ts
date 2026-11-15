// ── Version history of a section (NoteFlow Cloud) — pure logic ──────────────
//
// What the history panel (components/VersionHistory) shows and decides, kept out
// of the component so it can be tested: grouping by local day, the reason tag,
// the line diff against the current text with folded context, sizes, the name
// of a version restored as a new section, which state the panel is in, and which
// message explains a failed snapshot of the current text. No React, no DOM, no
// IPC. Tests: tests/lib/versionHistory.test.ts.

import { format, startOfDay, subDays, type Locale } from 'date-fns'
import type {
  CloudVersionMeta,
  CloudVersionReason,
  CloudVersionsErrorCode,
  CloudVersionsSnapshotErrorCode,
  CloudVersionsSnapshotResult,
} from '../types'
import { tf } from '../i18n/format'
import { diffSequencesWithStatus, sameContent } from './externalContentSync'
import { isPlanUnknown, type PlanAccountView } from './subscriptionPlans'

// ── Timeline ──────────────────────────────────────────────────────────────────

export interface VersionDayGroup {
  /** yyyy-MM-dd of the local day (React key). */
  key: string
  day: 'today' | 'yesterday' | 'date'
  /** Start of that local day. */
  date: Date
  versions: CloudVersionMeta[]
}

/**
 * Groups versions by the LOCAL day of `editedAt`, keeping their order (newest
 * first, as listed): one group per day, in the order each day first appears.
 * `now` decides what is "today" / "yesterday".
 */
export function groupVersionsByDay(versions: readonly CloudVersionMeta[], now: Date = new Date()): VersionDayGroup[] {
  const today = startOfDay(now).getTime()
  const yesterday = startOfDay(subDays(now, 1)).getTime()
  const groups = new Map<string, VersionDayGroup>()
  for (const version of versions) {
    const date = startOfDay(new Date(version.editedAt))
    const key = format(date, 'yyyy-MM-dd')
    let group = groups.get(key)
    if (!group) {
      const t = date.getTime()
      group = { key, day: t === today ? 'today' : t === yesterday ? 'yesterday' : 'date', date, versions: [] }
      groups.set(key, group)
    }
    group.versions.push(version)
  }
  return [...groups.values()]
}

const TAGGED_REASONS: readonly string[] = ['shrink', 'delete', 'manual']

/**
 * The discreet tag of a version: only the known non-routine reasons carry one —
 * 'edit' and anything unknown (main already reads those as 'edit') show none.
 */
export function versionReasonTag(reason: CloudVersionReason | string): Exclude<CloudVersionReason, 'edit'> | null {
  return TAGGED_REASONS.includes(reason) ? (reason as Exclude<CloudVersionReason, 'edit'>) : null
}

const byteFormatters = new Map<string, Intl.NumberFormat>()

/** Bytes for the UI: "820 B", "1.2 KB" / "1,2 KB", "3.4 MB". */
export function formatByteSize(bytes: number, lang: 'en' | 'es'): string {
  const n = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
  if (n < 1024) return `${Math.round(n)} B`
  let fmt = byteFormatters.get(lang)
  if (!fmt) {
    fmt = new Intl.NumberFormat(lang === 'es' ? 'es-ES' : 'en-US', { maximumFractionDigits: 1 })
    byteFormatters.set(lang, fmt)
  }
  const kb = n / 1024
  if (kb < 1024) return `${fmt.format(kb)} KB`
  return `${fmt.format(kb / 1024)} MB`
}

/** A version with no text (e.g. the one kept before deleting an empty section): nothing to restore. */
export function isEmptyVersion(content: string): boolean {
  return content.trim().length === 0
}

/**
 * Name of a version restored as a new section: the template with `{name}` and
 * `{date}` = `editedAt` in `dateFormat` (date-fns, localized with `locale`).
 * en: "Plan (version from Nov 14, 13:50)", es: "Plan (versión del 14 nov 13:50)".
 */
export function restoredSectionName(
  name: string,
  editedAt: string,
  opts: { template: string; dateFormat: string; locale?: Locale },
): string {
  const date = format(new Date(editedAt), opts.dateFormat, opts.locale ? { locale: opts.locale } : undefined)
  return tf(opts.template, { name, date })
}

// ── Diff ──────────────────────────────────────────────────────────────────────

export type VersionDiffRow =
  /** A line both texts share (context around a change). */
  | { kind: 'same'; text: string }
  /** A line only the version has: restoring brings it back (green). */
  | { kind: 'version'; text: string }
  /** A line only the current text has (added since): restoring removes it (red). */
  | { kind: 'current'; text: string }
  /** `count` unchanged lines folded away. */
  | { kind: 'gap'; count: number }

export interface VersionDiff {
  rows: VersionDiffRow[]
  /** Same text (line endings aside). */
  identical: boolean
  /** The line diff gave up (too many changes): show a preview instead. */
  truncated: boolean
}

/** Lines of unchanged context kept around each change. */
export const DIFF_CONTEXT_LINES = 3

const BOM = String.fromCharCode(0xfeff)
const splitLines = (text: string) => (text.startsWith(BOM) ? text.slice(1) : text).replace(/\r\n/g, '\n').split('\n')

/**
 * Line diff of a version against the current text: each change shows the
 * version's lines first, then the current ones; unchanged lines further than
 * `context` from any change fold into gaps (a lone folded line is shown instead —
 * a gap of 1 hides nothing).
 */
export function buildVersionDiff(version: string, current: string, context = DIFF_CONTEXT_LINES): VersionDiff {
  const a = splitLines(version)
  const b = splitLines(current)
  const { hunks, truncated } = diffSequencesWithStatus(a, b)
  if (hunks.length === 0) return { rows: [], identical: true, truncated: false }

  // Full sequence first, then fold. `near` = within `context` of a changed row.
  const full: Array<Exclude<VersionDiffRow, { kind: 'gap' }>> = []
  let i = 0
  for (const h of [...hunks, { aStart: a.length, aEnd: a.length, bStart: b.length, bEnd: b.length }]) {
    while (i < h.aStart) full.push({ kind: 'same', text: a[i++] })
    for (let k = h.aStart; k < h.aEnd; k++) full.push({ kind: 'version', text: a[k] })
    for (let k = h.bStart; k < h.bEnd; k++) full.push({ kind: 'current', text: b[k] })
    i = h.aEnd
  }
  const near = new Array<boolean>(full.length).fill(false)
  full.forEach((row, idx) => {
    if (row.kind === 'same') return
    for (let k = Math.max(0, idx - context); k <= Math.min(full.length - 1, idx + context); k++) near[k] = true
  })

  const rows: VersionDiffRow[] = []
  let hidden: string[] = []
  const flush = () => {
    if (hidden.length === 1) rows.push({ kind: 'same', text: hidden[0] })
    else if (hidden.length > 1) rows.push({ kind: 'gap', count: hidden.length })
    hidden = []
  }
  full.forEach((row, idx) => {
    if (row.kind === 'same' && !near[idx]) {
      hidden.push(row.text)
      return
    }
    flush()
    rows.push(row)
  })
  flush()
  return { rows, identical: false, truncated }
}

// ── Panel state ───────────────────────────────────────────────────────────────

export type VersionListState =
  | { status: 'loading' }
  | { status: 'ok'; count: number }
  | { status: 'error'; code: CloudVersionsErrorCode }

export type HistoryPanelState =
  | 'loading'
  /** No usable Cloud (signed out, or known not to own Cloud): what the history is + "View NoteFlow Cloud". */
  | 'offer'
  /** Signed in but the plan is unknown and the history couldn't be read: neutral notice, never an offer. */
  | 'plan-unknown'
  | 'locked'
  | 'unreachable'
  | 'unavailable'
  | 'unsupported'
  | 'error'
  | 'empty'
  | 'list'

/**
 * Which state the panel shows, from the account (null = not loaded yet) and the
 * list request. A known "no Cloud" account never lists (offer). Unknown
 * entitlements still try to list — a paying user reads the history fine — and a
 * failure that could mean "no plan" then shows the neutral notice, never an offer.
 */
export function decideHistoryPanelState(account: PlanAccountView | null, list: VersionListState): HistoryPanelState {
  if (!account) return 'loading'
  if (!account.signedIn) return 'offer'
  if (account.entitlementsKnown && !account.entitlements.cloud) return 'offer'
  if (list.status === 'loading') return 'loading'
  if (list.status === 'ok') return list.count === 0 ? 'empty' : 'list'
  switch (list.code) {
    case 'not-signed-in':
      return isPlanUnknown(account) ? 'plan-unknown' : 'offer'
    case 'locked':
    case 'session-locked':
      return 'locked'
    case 'unreachable':
      return 'unreachable'
    case 'unavailable':
      return 'unavailable'
    case 'unsupported-note':
      return 'unsupported'
    case 'unknown':
      return isPlanUnknown(account) ? 'plan-unknown' : 'error'
    default:
      return 'error'
  }
}

/** Should the panel list versions at all (offer states never hit the server)? */
export function shouldListVersions(account: PlanAccountView | null): boolean {
  return !!account && account.signedIn && !(account.entitlementsKnown && !account.entitlements.cloud)
}

// ── Restore after a snapshot ──────────────────────────────────────────────────

export type RestoreAfterSnapshot =
  /** The history holds the text about to be replaced: replace it now. */
  | { kind: 'replace' }
  /** The section changed while the snapshot ran: flush + snapshot once more. */
  | { kind: 'recapture' }
  /** Not safe to replace silently: ask (restore as new section / replace anyway). */
  | { kind: 'confirm'; reason: SnapshotFailureKey }

/**
 * What a "Restore this version" does once a snapshot of the current text came
 * back. `captured` = the section's text (store) when the snapshot was asked for;
 * `current` = its text now, right before replacing it. A change in between (another
 * window, the CLI, the agent, a sync pull) was NOT captured: one more snapshot
 * (attempt 1), then — still moving — ask instead of replacing it silently.
 */
export function planRestoreAfterSnapshot(input: {
  snapshot: CloudVersionsSnapshotResult
  captured: string
  current: string
  attempt: number
}): RestoreAfterSnapshot {
  if (!input.snapshot.ok) return { kind: 'confirm', reason: snapshotFailureKey(input.snapshot.errorCode) }
  if (sameContent(input.captured, input.current)) return { kind: 'replace' }
  return input.attempt < 2 ? { kind: 'recapture' } : { kind: 'confirm', reason: 'syncPending' }
}

// ── Snapshot failure ──────────────────────────────────────────────────────────

export type SnapshotFailureKey =
  | 'syncOff'
  | 'syncPending'
  | 'noSubscription'
  | 'unreachable'
  | 'locked'
  | 'unavailable'
  | 'signedOut'
  | 'unsupported'
  | 'generic'

/** The message explaining why the current text couldn't be kept before a restore. */
export function snapshotFailureKey(code: CloudVersionsSnapshotErrorCode): SnapshotFailureKey {
  switch (code) {
    case 'sync-off':
      return 'syncOff'
    case 'sync-pending':
      return 'syncPending'
    case 'no-subscription':
      return 'noSubscription'
    case 'unreachable':
      return 'unreachable'
    case 'locked':
    case 'session-locked':
      return 'locked'
    case 'unavailable':
      return 'unavailable'
    case 'not-signed-in':
      return 'signedOut'
    case 'unsupported-note':
      return 'unsupported'
    default:
      return 'generic'
  }
}
