// ── Syncing an editor with external content updates ─────────────────────────
//
// Every editor mirrors one section's content from the store and writes back
// through a (usually debounced) save. A new `content` from the store is then
// either:
//   - the ECHO of one of our own saves coming back through the store write queue
//     (async — slow for encrypted notes). It can be older than what the editor
//     shows: applying it would drop the keystrokes typed since that save;
//   - or a GENUINE external update (another pane/window, a sync pull, the CLI…).
//     Ignoring it while the editor is focused let the next keystroke's save write
//     the stale text over it, silently.
// So each editor keeps an outbox of the contents it handed to the store, and
// treats anything else as external: applied as is when there's no local edit in
// flight, three-way merged with the local edit otherwise.
//
// Pure (no DOM, no TipTap): components/Editor/Editor.tsx, NoteEditor.tsx (raw
// mode) and StickyApp.tsx (raw textarea) drive it. Tests: tests/lib/externalContentSync.test.ts.

/**
 * How many unconfirmed saves an editor remembers. Every editor debounces its saves
 * (≥ 400 ms apart) and each echo comes back after one queued write, so reaching
 * this many in flight would take minutes of backlog — it only bounds entries
 * whose write never echoes (e.g. refused). An evicted entry whose echo did come
 * back would be taken for an external update and merged (duplicated text), hence
 * a bound far above anything reachable rather than a tight one.
 */
export const OUTBOX_LIMIT = 200

export interface ContentSync {
  /**
   * The last content the store confirmed for this editor (the initial content,
   * an echo, an applied or merged external update): the base of a merge.
   */
  base: string
  /** Contents handed to the store whose echo hasn't come back yet, oldest first. */
  outbox: string[]
}

/**
 * Contents are compared exactly — whitespace included: v2 section files are written
 * verbatim, so an edit that only indents the first line or adds a leading blank line
 * is a real change that must be saved. The only normalization is the one a re-read
 * from disk applies (parseNoteFolder: BOM stripped, CRLF → LF), so an echo that
 * comes back through a full reload still matches.
 */
function normalizeNewlines(s: string): string {
  return s.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
}

export function sameContent(a: string, b: string): boolean {
  return a === b || normalizeNewlines(a) === normalizeNewlines(b)
}

export function createContentSync(initial: string): ContentSync {
  return { base: initial, outbox: [] }
}

/**
 * What the store will hold once our writes in flight land: the last content
 * handed off, or the store's content when nothing is in flight. "Equal to the
 * store" is NOT "nothing to write" while saves are in flight: typing "b" then
 * Backspace returns to the store's "a" while the write of "ab" is still queued —
 * skipping the "a" write would leave "ab" in the store and on disk.
 */
export function lastHandedOff(sync: ContentSync, storeContent: string): string {
  return sync.outbox.at(-1) ?? storeContent
}

/**
 * Whether handing `content` to the store would change anything (callers skip the
 * write otherwise). Compared against lastHandedOff, not the store.
 */
export function needsSave(sync: ContentSync, content: string, storeContent: string): boolean {
  return !sameContent(content, lastHandedOff(sync, storeContent))
}

/**
 * Remembers a content the editor is handing to the store. Skipped when it's what
 * the store will hold anyway (lastHandedOff): that write changes nothing, so no
 * echo will ever come back — and a stale entry would later swallow a genuine
 * update that happens to revert to it.
 */
export function recordSave(sync: ContentSync, saved: string, storeContent: string): void {
  if (!needsSave(sync, saved, storeContent)) return
  sync.outbox.push(saved)
  if (sync.outbox.length > OUTBOX_LIMIT) sync.outbox.splice(0, sync.outbox.length - OUTBOX_LIMIT)
}

export type ExternalContentDecision =
  /** One of our saves coming back (`index` in the outbox): ignore it. */
  | { kind: 'echo'; index: number }
  /** The editor already shows it: nothing to do. */
  | { kind: 'same' }
  /** Genuine external content and no local edit in flight: show it as is. */
  | { kind: 'apply' }
  /** Genuine external content while a local edit is in flight: three-way merge. */
  | { kind: 'merge' }

export interface ExternalContentInput {
  /** The content the store has now. */
  incoming: string
  /** What the editor shows now (its own serialization). */
  current: string
  /** Whether a local edit is waiting on the save debounce. */
  pending: boolean
  /**
   * Optional deeper check for `current` vs `incoming` when the strings differ:
   * e.g. the rich editor parses `incoming` and compares documents, so a different
   * serialization of the same doc doesn't count as a change (no caret jump).
   */
  isEquivalent?: () => boolean
}

export function decideExternalContent(input: ExternalContentInput & { outbox: readonly string[] }): ExternalContentDecision {
  const { incoming, current, outbox, pending, isEquivalent } = input
  // The OLDEST match: echoes come back in order, so a content saved twice (typed
  // away and back) is most likely the first one still in flight.
  const index = outbox.findIndex((saved) => sameContent(saved, incoming))
  if (index >= 0) return { kind: 'echo', index }
  if (sameContent(current, incoming) || isEquivalent?.()) return { kind: 'same' }
  // A save of ours still on its way to the store counts as a local edit too:
  // showing the external content as is would drop it from the editor, and it
  // would then land in the store over the external one.
  return pending || outbox.length > 0 ? { kind: 'merge' } : { kind: 'apply' }
}

export type ExternalContentResolution =
  | { kind: 'echo' }
  | { kind: 'same' }
  | { kind: 'apply' }
  | { kind: 'merge'; merged: string; conflict: boolean }

/**
 * Decides what to do with `incoming` and updates `sync` accordingly:
 *   - echo  → that entry and every older one leave the outbox;
 *   - apply → only reached with an empty outbox (no save of ours in flight);
 *   - merge → `merged` = merge3(base, current, incoming), the new local content the
 *             caller shows and saves. The outbox is kept: the late echoes of our
 *             in-flight saves must still be recognised.
 * In every case the base becomes `incoming`: it's what the store holds now.
 * `normalize` maps base and incoming into the editor's serialization before
 * merging (the rich editor's markdown may differ from the stored one).
 */
export function resolveExternalContent(
  sync: ContentSync,
  input: ExternalContentInput & { normalize?: (content: string) => string },
): ExternalContentResolution {
  const decision = decideExternalContent({ ...input, outbox: sync.outbox })
  const previousBase = sync.base
  sync.base = input.incoming
  switch (decision.kind) {
    case 'echo':
      sync.outbox.splice(0, decision.index + 1)
      return { kind: 'echo' }
    case 'same':
      return { kind: 'same' }
    case 'apply':
      return { kind: 'apply' }
    case 'merge': {
      const normalize = input.normalize ?? ((content: string) => content)
      const { text, conflict } = merge3(normalize(previousBase), input.current, normalize(input.incoming))
      return { kind: 'merge', merged: text, conflict }
    }
  }
}

// ── Three-way merge (line based) ─────────────────────────────────────────────

/** A changed range: base lines [baseStart, baseEnd) became side lines [sideStart, sideEnd). */
interface Hunk {
  baseStart: number
  baseEnd: number
  sideStart: number
  sideEnd: number
}

/**
 * Above this many differing lines (Myers edit distance) the changed middle is
 * taken as one hunk: the search keeps O(D²) state.
 */
const MAX_EDIT_DISTANCE = 2000

function diffLines(a: readonly string[], b: readonly string[]): Hunk[] {
  // Edits are usually local: strip the common prefix/suffix first.
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB-- }
  if (start === endA && start === endB) return []
  const whole: Hunk[] = [{ baseStart: start, baseEnd: endA, sideStart: start, sideEnd: endB }]
  const n = endA - start
  const m = endB - start
  if (n === 0 || m === 0) return whole
  const ops = myersOps(a.slice(start, endA), b.slice(start, endB))
  if (!ops) return whole
  const hunks: Hunk[] = []
  let open: Hunk | null = null
  let i = start
  let j = start
  for (const op of ops) {
    if (op === 'match') {
      if (open) { hunks.push(open); open = null }
      i++
      j++
      continue
    }
    if (!open) open = { baseStart: i, baseEnd: i, sideStart: j, sideEnd: j }
    if (op === 'del') open.baseEnd = ++i
    else open.sideEnd = ++j
  }
  if (open) hunks.push(open)
  return hunks
}

/**
 * Shortest edit script from `a` to `b` (Myers' O(ND) diff), as one op per step;
 * null when the edit distance exceeds MAX_EDIT_DISTANCE.
 */
function myersOps(a: readonly string[], b: readonly string[]): ('match' | 'del' | 'ins')[] | null {
  const n = a.length
  const m = b.length
  const max = n + m
  const offset = max + 1
  // v[offset + k] = furthest x reached on diagonal k (y = x - k).
  const v = new Int32Array(2 * max + 3)
  // trace[d] = v[k] for k in [-d - 1, d + 1] at the start of round d (index k + d + 1).
  const trace: Int32Array[] = []
  let done = -1
  for (let d = 0; d <= max && done < 0; d++) {
    if (d > MAX_EDIT_DISTANCE) return null
    trace.push(v.slice(offset - d - 1, offset + d + 2))
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])
        ? v[offset + k + 1]
        : v[offset + k - 1] + 1
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) { x++; y++ }
      v[offset + k] = x
      if (x >= n && y >= m) { done = d; break }
    }
  }
  const ops: ('match' | 'del' | 'ins')[] = []
  let x = n
  let y = m
  for (let d = done; d >= 0; d--) {
    const row = trace[d]
    const at = (k: number) => row[k + d + 1]
    const k = x - y
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1
    const prevX = at(prevK)
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) { ops.push('match'); x--; y-- }
    if (d > 0) {
      if (x === prevX) { ops.push('ins'); y-- } else { ops.push('del'); x-- }
    }
  }
  return ops.reverse()
}

/** base[from, to) with one side's hunks (all inside that range) applied. */
function sideVersion(base: readonly string[], side: readonly string[], hunks: Hunk[], from: number, to: number): string[] {
  const out: string[] = []
  let pos = from
  for (const h of hunks) {
    out.push(...base.slice(pos, h.baseStart), ...side.slice(h.sideStart, h.sideEnd))
    pos = h.baseEnd
  }
  out.push(...base.slice(pos, to))
  return out
}

export interface MergeResult {
  text: string
  /** Both sides changed the same lines differently: both versions are kept, local first. */
  conflict: boolean
}

/**
 * Line-based three-way merge. Changes to different lines (adjacent ones too)
 * merge cleanly; the same change on both sides appears once. Overlapping
 * different changes never drop either side: the local version of the region is
 * followed by the remote one, and `conflict` is reported.
 */
export function merge3(base: string, local: string, remote: string): MergeResult {
  if (local === remote || remote === base) return { text: local, conflict: false }
  if (local === base) return { text: remote, conflict: false }
  const b = base.split('\n')
  const l = local.split('\n')
  const r = remote.split('\n')
  type SideHunk = Hunk & { side: 'local' | 'remote' }
  const hunks: SideHunk[] = [
    ...diffLines(b, l).map((h): SideHunk => ({ ...h, side: 'local' })),
    ...diffLines(b, r).map((h): SideHunk => ({ ...h, side: 'remote' })),
  ].sort((x, y) => x.baseStart - y.baseStart || x.baseEnd - y.baseEnd)

  const out: string[] = []
  let conflict = false
  let pos = 0
  let k = 0
  while (k < hunks.length) {
    const region = [hunks[k]]
    const regionStart = hunks[k].baseStart
    let regionEnd = hunks[k].baseEnd
    k++
    // A hunk joins the region when their base ranges overlap, or when both are
    // insertions at the same point. Touching ranges don't: an insertion right
    // before/after a change, or changes to adjacent lines, merge cleanly.
    while (k < hunks.length) {
      const h = hunks[k]
      const overlaps = h.baseStart < regionEnd
      const sameInsertionPoint = regionStart === regionEnd && h.baseStart === regionEnd && h.baseEnd === h.baseStart
      if (!overlaps && !sameInsertionPoint) break
      region.push(h)
      regionEnd = Math.max(regionEnd, h.baseEnd)
      k++
    }
    out.push(...b.slice(pos, regionStart))
    const localHunks = region.filter((h) => h.side === 'local')
    const remoteHunks = region.filter((h) => h.side === 'remote')
    const localLines = sideVersion(b, l, localHunks, regionStart, regionEnd)
    const remoteLines = sideVersion(b, r, remoteHunks, regionStart, regionEnd)
    if (localHunks.length === 0) out.push(...remoteLines)
    else if (remoteHunks.length === 0) out.push(...localLines)
    else if (localLines.join('\n') === remoteLines.join('\n')) out.push(...localLines)
    else {
      out.push(...localLines, ...remoteLines)
      conflict = true
    }
    pos = regionEnd
  }
  out.push(...b.slice(pos))
  return { text: out.join('\n'), conflict }
}

// ── Caret mapping for plain-text editors ─────────────────────────────────────

/**
 * Maps a caret offset in `before` to `after` when the text is replaced from
 * outside: offsets before the changed span stay, offsets after it shift by the
 * size delta, offsets inside it go to the span's start.
 */
export function mapOffsetThroughChange(before: string, after: string, offset: number): number {
  const max = Math.min(before.length, after.length)
  let prefix = 0
  while (prefix < max && before[prefix] === after[prefix]) prefix++
  let suffix = 0
  while (suffix < max - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++
  const mapped = offset <= prefix ? offset
    : offset >= before.length - suffix ? offset + after.length - before.length
    : prefix
  return Math.max(0, Math.min(after.length, mapped))
}
