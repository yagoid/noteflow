// Pure helpers for the editor's floating table of contents (EditorToc.tsx).
// No DOM / TipTap imports so they can be unit-tested (tests/lib/tocUtils.test.ts).

/** A heading as read from the ProseMirror document. */
export interface RawHeading {
  level: number
  text: string
  /** Document position of the heading node (resolves to its DOM via view.nodeDOM). */
  pos: number
}

export interface TocItem {
  level: 1 | 2 | 3
  text: string
  pos: number
  /** Indent step, relative to the shallowest level present (0 = outermost). */
  depth: number
}

/**
 * Builds the TOC entries from the document's headings: keeps H1–H3 only, drops
 * empty/whitespace-only headings and collapses inner whitespace. Indentation is
 * relative to the shallowest level present, so a section that only uses H2/H3
 * starts flush instead of with an empty H1 indent step.
 */
export function buildTocItems(headings: readonly RawHeading[]): TocItem[] {
  const kept = headings
    .filter(h => h.level >= 1 && h.level <= 3)
    .map(h => ({ level: h.level as 1 | 2 | 3, text: h.text.replace(/\s+/g, ' ').trim(), pos: h.pos }))
    .filter(h => h.text.length > 0)
  if (kept.length === 0) return []
  const minLevel = Math.min(...kept.map(h => h.level))
  return kept.map(h => ({ ...h, depth: h.level - minLevel }))
}

/** Cheap identity of a TOC (used to skip re-renders when an edit didn't touch headings). */
export function tocSignature(items: readonly TocItem[]): string {
  return items.map(i => `${i.level}:${i.pos}:${i.text}`).join('\n')
}

/**
 * Index of the heading the reader is "in": the last one whose top edge has
 * scrolled above `threshold` px from the top of the viewport. When the scroller
 * is at the very bottom, the last heading that is visible wins instead — the
 * trailing headings of a short final block can never reach the threshold.
 * Returns -1 when the reader is still above the first heading.
 *
 * @param tops heading top edges relative to the scroll viewport's top (px), in document order.
 */
export function pickActiveHeading(
  tops: readonly number[],
  opts: { threshold: number; atBottom: boolean; viewportHeight: number },
): number {
  if (opts.atBottom) {
    for (let i = tops.length - 1; i >= 0; i--) {
      if (tops[i] < opts.viewportHeight) return i
    }
  }
  let active = -1
  for (let i = 0; i < tops.length; i++) {
    if (tops[i] <= opts.threshold) active = i
    else break
  }
  return active
}

/**
 * Indices of the entries that get a dash in the collapsed indicator. Up to `max`
 * every entry gets one; past that the deepest levels are dropped first (H3,
 * then H2) and, if the outermost level alone still doesn't fit, it is sampled
 * evenly — so a huge outline never turns into a full-height column of dashes.
 */
export function pickIndicatorDashes(items: readonly TocItem[], max: number): number[] {
  const all = items.map((_, i) => i)
  if (items.length <= max) return all
  const maxDepth = Math.max(...items.map(i => i.depth))
  for (let depth = maxDepth - 1; depth >= 0; depth--) {
    const kept = all.filter(i => items[i].depth <= depth)
    if (kept.length <= max) return kept
  }
  const outer = all.filter(i => items[i].depth === 0)
  if (max <= 1) return outer.slice(0, Math.max(0, max))
  const step = (outer.length - 1) / (max - 1)
  return Array.from({ length: max }, (_, k) => outer[Math.round(k * step)])
}

/**
 * The dash that stands for the active entry: the active index itself when it
 * has a dash, else the closest dash before it (its "ancestor" in the outline).
 * -1 when nothing is active or no dash precedes it.
 */
export function activeDashIndex(dashes: readonly number[], active: number): number {
  if (active < 0) return -1
  let found = -1
  for (const index of dashes) {
    if (index <= active) found = index
    else break
  }
  return found
}

/** Max dashes in the collapsed indicator (see pickIndicatorDashes). */
export const TOC_MAX_DASHES = 40

/** Vertical gap (px) between indicator dashes — tighter for long outlines. */
export function tocDashGap(count: number): number {
  return count > 20 ? 4 : 7
}

/** Width (px) of the expanded panel (overlays the text while hovered/focused). */
export const TOC_PANEL_WIDTH = 272

/** Distance (px) from the indicator/panel to the editor's right edge (clears the 6px scrollbar). */
export const TOC_RIGHT_OFFSET = 10

/**
 * Right padding (px) the editor keeps while the TOC is shown: only the collapsed
 * indicator lives there at rest (offset + widest dash + a gap to the text).
 * Exposed to CSS as `--toc-reserve` (index.css `.editor-has-toc`).
 */
export const TOC_RESERVE = 44

/**
 * Below this editor width the TOC is hidden (very narrow split panes): the
 * expanded panel would cover almost all of the text.
 */
export const TOC_MIN_EDITOR_WIDTH = 420
