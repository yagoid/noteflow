// Readable ink for text laid on a SOLID section colour: the active tab of the editor's
// section map (Editor/SectionMap.tsx) and the header of the open section in the note
// overview (NoteOverview/NoteOverview.tsx). Reads the live theme CSS vars, so callers
// re-run it when the theme or its accent changes (subscribe to themeStore). The colour
// maths live in src/lib/sectionMap.ts and are tested in tests/lib/sectionMap.test.ts.

import type { GroupColor } from '../types'
import { isCustomColor } from './tagColors'
import { hexToRgbChannels } from './colorUtils'
import { mixRgb, parseRgbTriple, pickReadableInk, type Rgb } from './sectionMap'

/**
 * Share of the section colour in the solid background of a section hidden from the AI
 * (the rest is `--bg-editor`). Matches the `color-mix(… 72%, …)` rules in index.css
 * (`.section-map-tab.is-ai-hidden.is-active`, `.note-grid-cell.is-open.is-ai-hidden`).
 */
export const SECTION_AI_HIDDEN_MIX = 0.72

/**
 * Text colour on a solid `color` background: the theme's `--bg-0` (dark ink in dark
 * themes) or `--text`, whichever contrasts more (ties → `--bg-0`). Theme colours are read
 * from the live CSS vars (themeStore applies them before updating its state, so they're
 * current when a theme change re-renders the caller). Returns a CSS colour.
 */
export function resolveSectionInk(color: GroupColor, aiHidden: boolean): string {
  const fallback = 'rgb(var(--bg-0))'
  if (typeof document === 'undefined') return fallback
  const css = getComputedStyle(document.documentElement)
  const themeRgb = (name: string) => parseRgbTriple(css.getPropertyValue(name))
  let background: Rgb | null = isCustomColor(color) ? hexToRgbChannels(color) : themeRgb(color)
  const bgInk = themeRgb('--bg-0')
  const textInk = themeRgb('--text')
  if (!background || !bgInk || !textInk) return fallback
  if (aiHidden) {
    const editor = themeRgb('--bg-editor')
    if (editor) background = mixRgb(background, editor, SECTION_AI_HIDDEN_MIX)
  }
  return pickReadableInk(background, [bgInk, textInk]) === 0 ? fallback : 'rgb(var(--text))'
}
