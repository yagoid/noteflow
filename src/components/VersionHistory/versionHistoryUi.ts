// Shared class strings of the version history panel (theme tokens only).

/** Monospace stack of text-mode sections and of the diff. */
export const MONO_STACK = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace"

export const SECONDARY_BUTTON =
  'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono bg-surface-2 border border-border text-text ' +
  'hover:bg-surface-3 hover:border-text-muted/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

/** Accent-tinted, like the plan surfaces' primary button (Settings/planOffersShared). */
export const PRIMARY_BUTTON =
  'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono bg-accent/15 hover:bg-accent/25 text-accent ' +
  'border border-accent/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

export const DANGER_BUTTON =
  'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono text-red/85 border border-red/35 ' +
  'hover:bg-red/10 hover:text-red transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
