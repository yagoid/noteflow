import {
  AlarmClock,
  AppWindow,
  ArrowLeftRight,
  Bot,
  Brain,
  ChartBarIncreasing,
  Cloud,
  Columns2,
  Download,
  FileSymlink,
  Gift,
  GripVertical,
  History,
  KanbanSquare,
  LayoutTemplate,
  Link2,
  ListEnd,
  ListTodo,
  Lock,
  Palette,
  PenTool,
  PanelsTopLeft,
  Rows3,
  Sparkles,
  SquareArrowOutUpRight,
  SquareTerminal,
  Stamp,
  Table2,
  TextCursorInput,
  Wand2,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { CSSProperties } from 'react'
import type { Messages } from '../../i18n'
import { isMac, keyLabel } from '../../lib/platform'
import type { TourSlideRef } from '../../lib/whatsNew'

// ── The "What's new" deck ──────────────────────────────────────────────────────
// Array order = presentation order. To ship slides with a release, ADD entries
// (before `more`, which closes the full tour) with `since` = that release's version
// and their copy in i18n `whatsNew.slides`; users who already saw the rest get only
// the new ones on their next launch. What has no slide (or clip) of its own goes in
// that version's release recap: a `release-X-Y-Z` entry with `release: true`, placed
// after that version's slides, whose `extras` chips list the smaller changes (copy in
// `whatsNew.extras` + `whatsNew.extrasInfo`). Recaps only show to users updating
// (never in the first-run or the full tour). NEVER rename an id: it is what
// settings.json → whatsNewSeen stores, and the clip capture script records
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
  /** `more` and the release recaps: the chip grid. */
  extras?: SlideExtra[]
  /** A question answered right on the slide: a big switch that turns the feature on (AskSwitch.tsx). */
  ask?: 'agentTasks'
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
      { id: 'tempNote', combo: ['Ctrl', 'Shift', 'N'] },
      { id: 'showApp', combo: ['Ctrl', 'Shift', 'Space'] },
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
  { id: 'agents', since: '2.2.0', i18nKey: 'agents', icon: Bot, accent: 'accent-3', keys: [] },
  { id: 'sync', since: '2.2.0', i18nKey: 'sync', icon: Cloud, accent: 'cyan', keys: [] },
  { id: 'section-map', since: '2.2.0', i18nKey: 'section-map', icon: Rows3, accent: 'cyan', keys: [] },
  { id: 'snippets', since: '2.2.0', i18nKey: 'snippets', icon: Stamp, accent: 'accent-3', keys: [] },
  { id: 'agent-tasks', since: '2.3.0', i18nKey: 'agent-tasks', icon: ListTodo, accent: 'purple', keys: [], ask: 'agentTasks' },
  { id: 'linked-files', since: '2.3.0', i18nKey: 'linked-files', icon: FileSymlink, accent: 'cyan', keys: [] },
  { id: 'drawings', since: '2.3.0', i18nKey: 'drawings', icon: PenTool, accent: 'accent', keys: [] },
  {
    id: 'release-2-3-0', since: '2.3.0', release: true, i18nKey: 'release-2-3-0', icon: Gift, accent: 'accent-3', keys: [],
    extras: [
      { id: 'tables', icon: Table2, accent: 'accent-2' },
      { id: 'versionHistory', icon: History, accent: 'cyan' },
      { id: 'autocomplete', icon: TextCursorInput, accent: 'purple' },
      { id: 'navHistory', icon: ArrowLeftRight, accent: 'accent' },
      { id: 'dragOut', icon: SquareArrowOutUpRight, accent: 'purple' },
      { id: 'taskDrag', icon: GripVertical, accent: 'accent-2' },
      { id: 'checkedToBottom', icon: ListEnd, accent: 'accent-3' },
      { id: 'taskProgress', icon: ChartBarIncreasing, accent: 'cyan' },
    ],
  },
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

/** Back / forward through the visited places (useNavHistory.ts): ⌘[ / ⌘] on macOS, Alt+←/→ elsewhere. */
export const NAV_HISTORY_COMBO = isMac ? ['Cmd', '[ / ]'] : ['Alt', '←/→']

/**
 * What the `{placeholders}` of the chips resolve to, in their labels (`whatsNew.extras`)
 * and their unfold texts (`whatsNew.extrasInfo`). A chip copy may only use these ids.
 */
export const EXTRAS_KEYS: Record<string, string[]> = {
  split: SPLIT_VIEW_COMBO,
  nav: NAV_HISTORY_COMBO,
}

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
