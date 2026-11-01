import {
  AlarmClock,
  AppWindow,
  Brain,
  Cloud,
  Columns2,
  Download,
  KanbanSquare,
  LayoutTemplate,
  Link2,
  Lock,
  Palette,
  PanelsTopLeft,
  Sparkles,
  SquareTerminal,
  Wand2,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { CSSProperties } from 'react'
import type { Messages } from '../../i18n'
import { keyLabel } from '../../lib/platform'
import type { TourSlideRef } from '../../lib/whatsNew'

// ── The "What's new" deck ──────────────────────────────────────────────────────
// Array order = presentation order. To ship slides with a release, ADD entries
// (before `more`, which closes the full tour) with `since` = that release's version
// and their copy in i18n `whatsNew.slides`; users who already saw the rest get only
// the new ones on their next launch. NEVER rename an id: it is what settings.json
// → whatsNewSeen stores, and the clip capture script records
// src/assets/whats-new/<id>[.<lang>].webm by id. Full guide: patterns.md § "Tour What's new".

/** Theme colour channel of the slide: one of the theme CSS vars (works in every theme). */
export type SlideAccent = 'accent' | 'accent-2' | 'accent-3' | 'cyan' | 'purple' | 'red'

/** A shortcut chip. `id` is also the `{placeholder}` the slide body uses for it. */
export interface SlideKey {
  id: string
  /** Raw tokens resolved per platform by keyLabel ('Ctrl' → ⌘ on macOS, 'Control' → ⌃). */
  combo: string[]
}

export interface SlideExtra {
  id: keyof Messages['whatsNew']['extras']
  icon: LucideIcon
  accent: SlideAccent
}

export interface WhatsNewSlide extends TourSlideRef {
  i18nKey: keyof Messages['whatsNew']['slides']
  icon: LucideIcon
  accent: SlideAccent
  keys: SlideKey[]
  /** Only `more`: the chip grid. */
  extras?: SlideExtra[]
}

export const WHATS_NEW_SLIDES: WhatsNewSlide[] = [
  {
    id: 'sections', since: '2.2.0', i18nKey: 'sections', icon: PanelsTopLeft, accent: 'accent',
    keys: [
      { id: 'newSection', combo: ['Ctrl', 'T'] },
      { id: 'nextSection', combo: ['Control', 'Tab'] },
    ],
  },
  { id: 'brain', since: '2.2.0', i18nKey: 'brain', icon: Brain, accent: 'purple', keys: [] },
  {
    id: 'links-palette', since: '2.2.0', i18nKey: 'links-palette', icon: Link2, accent: 'cyan',
    keys: [
      { id: 'slash', combo: ['/'] },
      { id: 'palette', combo: ['Ctrl', 'P'] },
    ],
  },
  {
    id: 'quick-capture', since: '2.2.0', i18nKey: 'quick-capture', icon: Zap, accent: 'accent-3',
    keys: [
      { id: 'showApp', combo: ['Ctrl', 'Shift', 'Space'] },
      { id: 'tempNote', combo: ['Ctrl', 'Shift', 'N'] },
    ],
  },
  {
    id: 'windows', since: '2.2.0', i18nKey: 'windows', icon: AppWindow, accent: 'purple',
    keys: [{ id: 'sticky', combo: ['Ctrl', 'S'] }],
  },
  {
    id: 'kanban', since: '2.2.0', i18nKey: 'kanban', icon: KanbanSquare, accent: 'accent-2',
    keys: [{ id: 'kanban', combo: ['/kanban'] }],
  },
  { id: 'ai', since: '2.2.0', i18nKey: 'ai', icon: Sparkles, accent: 'accent', keys: [] },
  { id: 'sync', since: '2.2.0', i18nKey: 'sync', icon: Cloud, accent: 'cyan', keys: [] },
  {
    id: 'more', since: '2.2.0', i18nKey: 'more', icon: Wand2, accent: 'accent-2', keys: [],
    extras: [
      { id: 'encrypted', icon: Lock, accent: 'red' },
      { id: 'templates', icon: LayoutTemplate, accent: 'accent-3' },
      { id: 'themes', icon: Palette, accent: 'purple' },
      { id: 'alarms', icon: AlarmClock, accent: 'accent-2' },
      { id: 'split', icon: Columns2, accent: 'accent' },
      { id: 'cli', icon: SquareTerminal, accent: 'cyan' },
      { id: 'import', icon: Download, accent: 'accent-3' },
    ],
  },
]

/** Key combo of the "Split view (Ctrl+Click)" chip of `more`. */
export const SPLIT_VIEW_COMBO = ['Ctrl', 'Click']

/** Inline style that sets a colour channel var (default `--wn-c`) from the slide's theme var. */
export function accentVars(accent: SlideAccent, varName = '--wn-c'): CSSProperties {
  return { [varName]: `var(--${accent})` } as CSSProperties
}

/** "Ctrl+Shift+N" with the platform's labels (⌘ / ⌃ / ⇧ on macOS). */
export function comboText(combo: string[]): string {
  return combo.map(keyLabel).join('+')
}

/** `{ keyId: combo }` of a slide — what its `{placeholders}` resolve to. */
export function slideKeyMap(slide: WhatsNewSlide): Record<string, string[]> {
  return Object.fromEntries(slide.keys.map((k) => [k.id, k.combo]))
}
