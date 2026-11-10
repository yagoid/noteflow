import type { ReactNode } from 'react'

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
