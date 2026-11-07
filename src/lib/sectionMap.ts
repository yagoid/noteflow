// Pure layout + colour logic of the editor's section map (Editor/SectionMap.tsx): the block
// of section tabs that wraps onto rows like the tabs of a filing cabinet. The row cap is
// shared with the open map of the sidebar's note row (Sidebar/NoteSectionMap.tsx). The reorder side
// and the colour helpers are shared with the note overview grid (lib/noteOverviewGrid.ts,
// lib/sectionInk.ts).
//
// The browser does the actual wrapping (one `flex-wrap` container). These helpers only
// simulate that wrapping from the tabs' natural widths, to decide how many sections fit
// in the row cap before the rest are folded into a "+N more" tab.

export type Rgb = [number, number, number]

/** Rows the map shows before folding the rest into "+N more". */
export const SECTION_MAP_MAX_ROWS = 3

// Slack (px) subtracted from the container width when simulating the wrapping: measured
// widths are fractional and the browser's layout units round differently, so the
// simulation errs on the side of "doesn't fit" (at worst one tab more is folded away,
// never a 4th row).
const FIT_SLACK = 0.5

/**
 * Rows a `flex-wrap` line-break would produce for items of these widths (CSS greedy
 * algorithm: an item goes on the current line if it fits with the gap, else it opens a
 * new one; an item wider than the container takes a line of its own).
 */
export function countRows(widths: readonly number[], containerWidth: number, gap: number): number {
  const limit = containerWidth - FIT_SLACK
  let rows = 0
  let used = 0
  for (const w of widths) {
    if (rows === 0 || used + gap + w > limit) {
      rows += 1
      used = w
    } else {
      used += gap + w
    }
  }
  return rows
}

/**
 * Indices (into the section list) of the `count` sections shown, in display order: the
 * first `count`, except that the pinned sections (the active one, the one being renamed)
 * are never hidden — a pinned section that falls among the folded ones takes the place of
 * the last unpinned visible ones (a visual move only; the data keeps its order). `count`
 * is raised to the number of pins if needed.
 */
export function visibleSectionIndices(total: number, pinned: readonly number[], count: number): number[] {
  const pins = [...new Set(pinned)].filter((i) => i >= 0 && i < total).sort((a, b) => a - b)
  const n = Math.min(total, Math.max(count, pins.length, 0))
  const head = Array.from({ length: n }, (_, i) => i)
  const missing = pins.filter((i) => i >= n)
  if (missing.length === 0) return head
  let toDrop = missing.length
  const kept: number[] = []
  for (let k = head.length - 1; k >= 0; k--) {
    if (toDrop > 0 && !pins.includes(head[k])) { toDrop--; continue }
    kept.unshift(head[k])
  }
  return [...kept, ...missing]
}

export interface SectionMapPlanInput {
  /** Natural width of each section tab, in section order (each in its current state). */
  tabWidths: readonly number[]
  /** Sections that must stay visible (see visibleSectionIndices). */
  pinned: readonly number[]
  /** Width of the "+" (add section) tab, always last. Omitted when there is none (sidebar). */
  addWidth?: number
  /** Width of the "+N more" tab (measured with the widest N it can show). */
  moreWidth: number
  containerWidth: number
  gap: number
  maxRows?: number
}

export interface SectionMapPlan {
  /** Sections shown while folded (all of them when nothing overflows). */
  visibleCount: number
  /** True when all the sections + "+" need more rows than the cap. */
  overflowing: boolean
}

/**
 * How many sections fit in the row cap. With room for everything (or no measurable
 * width yet: a pane that isn't laid out) all are shown. Otherwise the largest count whose
 * tabs + "+N more" + "+" still fit; at least the pinned ones (and at least one).
 */
export function planSectionMap(input: SectionMapPlanInput): SectionMapPlan {
  const { tabWidths, pinned, addWidth, moreWidth, containerWidth, gap } = input
  const maxRows = input.maxRows ?? SECTION_MAP_MAX_ROWS
  const total = tabWidths.length
  // No "+" tab → nothing appended (a 0-wide item would still cost a gap, maybe a row).
  const tail = addWidth === undefined ? [] : [addWidth]
  if (containerWidth <= 0 || countRows([...tabWidths, ...tail], containerWidth, gap) <= maxRows) {
    return { visibleCount: total, overflowing: false }
  }
  const minimum = Math.min(total, Math.max(1, visibleSectionIndices(total, pinned, 0).length))
  for (let count = total - 1; count > minimum; count--) {
    const widths = visibleSectionIndices(total, pinned, count).map((i) => tabWidths[i])
    if (countRows([...widths, moreWidth, ...tail], containerWidth, gap) <= maxRows) {
      return { visibleCount: count, overflowing: true }
    }
  }
  return { visibleCount: minimum, overflowing: true }
}

// ── Drag & drop reorder ────────────────────────────────────────────────────────────────

/**
 * Joint where a section dragged over `targetId` lands, as `moveSectionInList`
 * (lib/sectionUtils.ts) places it: after the target when it comes from before it in the
 * list, before the target when it comes from after it. Null when either id is missing or
 * they are the same section. Shared by the section map and the note overview grid.
 */
export function reorderDropSide(
  sections: readonly { id: string }[],
  draggedId: string,
  targetId: string,
): 'before' | 'after' | null {
  if (draggedId === targetId) return null
  const from = sections.findIndex((s) => s.id === draggedId)
  const to = sections.findIndex((s) => s.id === targetId)
  if (from === -1 || to === -1) return null
  return from < to ? 'after' : 'before'
}

// ── Colour: readable ink on the active tab's solid background ──────────────────────────

/** '122 162 247' (theme CSS var format) → [122, 162, 247]; null if it isn't a triple. */
export function parseRgbTriple(value: string): Rgb | null {
  const parts = value.trim().split(/[\s,]+/)
  if (parts.length !== 3) return null
  const rgb = parts.map(Number)
  if (rgb.some((n) => !Number.isFinite(n))) return null
  return rgb as Rgb
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = Math.max(0, Math.min(255, c)) / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG contrast ratio between two colours (1–21). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** `a` blended over `b` with weight `t` for `a` (0–1), like `color-mix(a t, b)`. */
export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [0, 1, 2].map((i) => a[i] * t + b[i] * (1 - t)) as Rgb
}

/**
 * Index of the ink with the best contrast on `background`. Ties keep the earlier
 * candidate, so list the preferred ink first.
 */
export function pickReadableInk(background: Rgb, inks: readonly Rgb[]): number {
  let best = 0
  let bestRatio = -1
  inks.forEach((ink, i) => {
    const ratio = contrastRatio(background, ink)
    if (ratio > bestRatio) { best = i; bestRatio = ratio }
  })
  return best
}
