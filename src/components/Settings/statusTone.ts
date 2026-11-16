import type { StatusTone } from '../../lib/syncOverview'

// Theme classes of each status tone (src/lib/syncOverview.ts). Green / yellow /
// red as the Settings panels already use them; info and neutral are tokens.
// Non-component module (React Fast Refresh: component files only export components).

/** Filled pill of StatusBadge (ui.tsx). */
export const TONE_BADGE: Record<StatusTone, string> = {
  ok: 'bg-green-500/15 text-green-400',
  warn: 'bg-yellow-500/15 text-yellow-400',
  error: 'bg-red/15 text-red',
  info: 'bg-accent/15 text-accent',
  neutral: 'border border-solid border-border text-text-muted',
}

/** Text colour of a status dot / label (dots use bg-current). */
export const TONE_TEXT: Record<StatusTone, string> = {
  ok: 'text-green-400',
  warn: 'text-yellow-400',
  error: 'text-red',
  info: 'text-accent',
  neutral: 'text-text-muted',
}
