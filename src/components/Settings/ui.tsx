import type { ReactNode } from 'react'
import type { StatusTone } from '../../lib/syncOverview'
import { TONE_BADGE } from './statusTone'

// Shared building blocks for the Settings panels. Everything here is expressed in
// theme tokens only (surface-*, border, text, text-muted) so it holds up across the
// 14 themes — never hardcode a colour in a panel.

// Body of a SECONDARY settings button (the default one). Callers keep their own
// size/padding/rounded and add this for the pressable surface: fill + border +
// hover. Before this existed, half the panels shipped "ghost" buttons that were
// just text and did not read as clickable.
// Primary (accent) and destructive (red) buttons keep their own colours.
export const settingsButtonClass =
  'settings-btn bg-surface-2 border border-border text-text hover:bg-surface-3 hover:border-text-muted/40 ' +
  'transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

// Same button, one surface up: for buttons that sit ON a surface-2 card (e.g. the
// template rows), where a surface-2 fill would melt into its background.
export const settingsRaisedButtonClass =
  'settings-btn bg-surface-3 border border-border text-text hover:border-text-muted/60 ' +
  'transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

interface SectionTitleProps {
  children: ReactNode
  /** Optional right-hand slot for section-level actions (e.g. "Theme default"). */
  action?: ReactNode
}

// Heading of a subsection inside a Settings panel: sentence case, readable colour +
// weight, one step below the panel's own `text-sm` title. Never draw a rule under
// it — sections are separated by dividers *before* their title, which the panel
// gets by wrapping its `<section>`s in `.settings-rows` (see index.css).
export function SectionTitle({ children, action }: SectionTitleProps) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <div className="flex items-center gap-1.5 min-w-0">
        <h3 className="text-xs font-mono font-semibold text-text truncate">
          {children}
        </h3>
      </div>
      {action}
    </div>
  )
}

// ── Lists of rows (Settings → Sync and any panel with a list of facts/actions) ──

/** Small status pill ("Synced", "Paused", "Included"…), optionally with a leading dot. */
export function StatusBadge({ tone, dot = false, children }: { tone: StatusTone; dot?: boolean; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-[5px] flex-shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded-md text-[10px] font-mono ${TONE_BADGE[tone]}`}
    >
      {dot && <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />}
      {children}
    </span>
  )
}

/** A titled list section: 12px heading (+ an optional muted summary on its right, e.g.
 *  Settings → AI's "Answers with <model>") + a bordered list of SettingsRow. */
export function SettingsListSection({ title, summary, children }: { title: string; summary?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3 min-w-0">
        <h3 className="text-xs font-mono font-semibold text-text flex-shrink-0">{title}</h3>
        {summary && <span className="text-[11px] font-mono text-text-muted truncate">{summary}</span>}
      </div>
      <div className="rounded-[10px] border border-solid border-border bg-surface-2/25 divide-y divide-border">
        {children}
      </div>
    </section>
  )
}

interface SettingsRowProps {
  icon: ReactNode
  title: ReactNode
  /** Optional badge right after the title. */
  badge?: ReactNode
  description?: ReactNode
  /** Right-hand actions (buttons, a badge). */
  action?: ReactNode
  /** Expanded content under the row (an in-progress flow, results, errors). */
  children?: ReactNode
}

/** One row of a SettingsListSection: icon box, title (+ badge), description and actions. */
export function SettingsRow({ icon, title, badge, description, action, children }: SettingsRowProps) {
  return (
    <div className="px-3.5 py-3">
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-surface-2 text-text/80 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-mono font-semibold text-text truncate">{title}</span>
            {badge}
          </div>
          {description && (
            <div className="text-[11px] font-mono text-text-muted leading-normal">{description}</div>
          )}
        </div>
        {action && <div className="flex items-center gap-2 flex-shrink-0">{action}</div>}
      </div>
      {children && <div className="mt-3 pl-10 space-y-3">{children}</div>}
    </div>
  )
}

/** On/off switch of a settings row (Local AI, CLI skill…). `title` doubles as the accessible name. */
export function SettingsToggle({ on, title, onToggle }: { on: boolean; title: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={title}
      onClick={onToggle}
      title={title}
      className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors ${
        on ? 'bg-text/70' : 'bg-surface-3 border border-border'
      }`}
    >
      <span
        className={`absolute top-[2px] w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${
          on ? 'left-[18px]' : 'left-[2px]'
        }`}
      />
    </button>
  )
}

// Ghost (text-only) button of a row, and the destructive variant (red on hover/always).
export const settingsGhostButtonClass =
  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-text-muted hover:text-text hover:bg-surface-2 ' +
  'transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap'

export const settingsDangerButtonClass =
  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-red hover:bg-red/10 ' +
  'transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap'
