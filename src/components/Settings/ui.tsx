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
  'bg-surface-2 border border-border text-text hover:bg-surface-3 hover:border-text-muted/40 ' +
  'transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

// Same button, one surface up: for buttons that sit ON a surface-2 card (e.g. the
// template rows), where a surface-2 fill would melt into its background.
export const settingsRaisedButtonClass =
  'bg-surface-3 border border-border text-text hover:border-text-muted/60 ' +
  'transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

interface SectionTitleProps {
  children: ReactNode
  /** Optional leading icon, rendered before the label. */
  icon?: ReactNode
  /** Optional right-hand slot for section-level actions (e.g. "Theme default"). */
  action?: ReactNode
  /** Draw the full-width rule under the title (default). Off in panels that separate
   *  sections with `.settings-rows` dividers *between* them (General-style). */
  underline?: boolean
}

// Heading of a subsection inside a Settings panel. Readable colour + weight, and a
// full-width rule underneath that anchors it as a header instead of floating over
// the content (the previous `text-text-muted/70` label was nearly invisible).
export function SectionTitle({ children, icon, action, underline = true }: SectionTitleProps) {
  return (
    <div
      className={`flex items-center justify-between gap-2 mb-3 ${underline ? 'pb-1.5 border-b border-border' : ''}`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        {icon}
        <h3 className="text-[11px] font-mono font-semibold text-text uppercase tracking-widest truncate">
          {children}
        </h3>
      </div>
      {action}
    </div>
  )
}
