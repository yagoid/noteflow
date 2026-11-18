// Writing a drawing back into a section's MARKDOWN, by identity: the block is found by
// what it was when the canvas opened (variant, attributes, fence content), not by a live
// editor node — the editor that opened it may be gone (another note or section on screen,
// a window closing) or may hold a different block at that place (a sync pull, the AI).
// Pure; the store side is stores/drawingEditorStore.ts.
import {
  drawingBodyLines,
  drawingHtmlDataToMarkdown,
  type DrawingBlock,
  type DrawingHtmlData,
} from './drawingBlock'
import { mapDrawingBlocks } from './drawingCollapse'

// Identity is the variant and the content. The marker attributes (width, height) are not
// part of it: resized meanwhile from another window, it is still the same drawing — and
// what is written keeps the attributes the block has NOW.
const sameBlock = (block: DrawingBlock, data: DrawingHtmlData) =>
  block.kind === data.kind && drawingBodyLines(block).join('\n') === data.body

/** How many drawing blocks of `md` are `opened` (same variant and content). */
export function countDrawing(md: string, opened: DrawingHtmlData): number {
  let count = 0
  mapDrawingBlocks(md, (block) => { if (sameBlock(block, opened)) count++; return null })
  return count
}

/**
 * `md` with the block that is still `opened` replaced by `next` (null = removed) — with
 * the attributes that block has now, not the ones of `next` —,
 * or null when there is no such block any more — it was changed or deleted meanwhile, and
 * nothing may be written over whatever is there now. With several identical blocks,
 * `ordinal` (0-based, among the identical ones) says which; past the last, the last.
 */
export function replaceDrawing(md: string, opened: DrawingHtmlData, next: DrawingHtmlData | null, ordinal = 0): string | null {
  const total = countDrawing(md, opened)
  if (total === 0) return null
  const target = Math.min(Math.max(0, ordinal), total - 1)
  let seen = -1
  return mapDrawingBlocks(md, (block) => {
    if (!sameBlock(block, opened)) return null
    seen++
    if (seen !== target) return null
    return next ? drawingHtmlDataToMarkdown({ ...next, attrs: block.attrs }).split('\n') : []
  })
}

/** `md` with the drawing added as a new block at its end. */
export function appendDrawing(md: string, drawing: DrawingHtmlData): string {
  const block = drawingHtmlDataToMarkdown(drawing)
  const body = md.replace(/\s+$/, '')
  return body ? `${body}\n\n${block}` : block
}
