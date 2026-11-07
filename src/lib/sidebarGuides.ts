// Pure geometry and helpers for the sidebar's groups and folders ("index with guides").
// The DOM side lives in components/Sidebar/GroupGuides.tsx; the styles
// in the `.sbg-*` block at the end of index.css (the numbers here must match it).

/** Unfold/fold of a group or folder body (grid-template-rows), in ms. */
export const SIDEBAR_FOLD_MS = 360
/** How long a body keeps `overflow: hidden` after a fold/unfold starts (fold + margin). */
export const SIDEBAR_FOLD_SETTLE_MS = SIDEBAR_FOLD_MS + 80
/** Cursor glide when the open note changes, in ms. */
export const GUIDE_CURSOR_MS = 450
/** A collapsed group/folder under a dragged note opens by itself after this long. */
export const DROP_SPRING_OPEN_MS = 650
/** Stagger index cap: rows past it enter together (30 ms per step). */
export const STAGGER_CAP = 10

/** x of the cursor (left edge, 3 px wide) on the group guide and on a folder guide. */
export const CURSOR_LEFT_GROUP = 8.5
export const CURSOR_LEFT_FOLDER = 28.5
/** The cursor is the row's height minus this inset at each end. */
export const CURSOR_INSET = 7
const CURSOR_MIN_HEIGHT = 4

export interface CursorBox {
  top: number
  height: number
  left: number
}

/** Where the cursor sits beside a row `rowTop`/`rowHeight` px into the group body. */
export function guideCursorBox(rowTop: number, rowHeight: number, inFolder: boolean): CursorBox {
  return {
    top: rowTop + CURSOR_INSET,
    height: Math.max(CURSOR_MIN_HEIGHT, rowHeight - CURSOR_INSET * 2),
    left: inFolder ? CURSOR_LEFT_FOLDER : CURSOR_LEFT_GROUP,
  }
}

/** The bits of an element that `offsetTopWithin` walks (structural, so it's testable). */
export interface OffsetNode {
  offsetTop: number
  offsetParent: OffsetNode | Element | null
}

/**
 * Top of `el` relative to `ancestor` through the offsetParent chain. Layout values, not
 * getBoundingClientRect: rows may be mid-FLIP (transformed) and the cursor must aim at
 * where they land. Null when `ancestor` isn't on the chain (it must be positioned).
 */
export function offsetTopWithin(el: OffsetNode | null, ancestor: unknown): number | null {
  let y = 0
  let node: OffsetNode | null = el
  while (node && node !== ancestor) {
    y += node.offsetTop
    node = node.offsetParent as OffsetNode | null
  }
  return node === ancestor && node != null ? y : null
}

/** Ids present in exactly one of the two sets (what a collapse toggle changed). */
export function toggledIds(prev: ReadonlySet<string>, next: ReadonlySet<string>): string[] {
  if (prev === next) return []
  const out: string[] = []
  for (const id of next) if (!prev.has(id)) out.push(id)
  for (const id of prev) if (!next.has(id)) out.push(id)
  return out
}

/** Stagger step of the i-th element of a group/folder body (capped). */
export function staggerStep(i: number): number {
  return Math.max(0, Math.min(STAGGER_CAP, Math.floor(i)))
}

/**
 * Whether dropping a note on a group/folder would move it — i.e. it isn't already
 * there — so the "Drop in …" slot is worth showing. `folderId` undefined = group root.
 */
export function dropChangesPlace(
  note: { group?: string; folder?: string } | null | undefined,
  groupId: string,
  folderId: string | undefined,
): boolean {
  if (!note) return true
  return note.group !== groupId || (note.folder || undefined) !== (folderId || undefined)
}
