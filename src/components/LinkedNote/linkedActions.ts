// Entry points of "Link Markdown file…" (new-note menu, command palette, drop): they
// all go through LinkedNotesHost (mounted once in the main window), which owns the file
// picker, the first-link notice and the error report.

import type { LinkedNoteState } from '../../types'

export const LINK_MARKDOWN_EVENT = 'noteflow:link-markdown'

/** Tone of a linked note's state (sidebar icon, header). Quiet when all is well (or just being checked). */
export function linkedTone(linked: LinkedNoteState, dirty = false): 'ok' | 'warn' | 'error' {
  if (linked.conflict) return 'warn'
  if (linked.status === 'missing' || linked.status === 'error') return 'error'
  if (linked.status === 'readonly' || dirty) return 'warn'
  return 'ok'
}

/**
 * The state label: conflict, else the file status — and never "Up to date" while
 * the note holds changes that aren't in the file.
 */
export function linkedStatusLabel(
  labels: { status: Record<LinkedNoteState['status'] | 'conflict', string>; unsaved: string },
  linked: LinkedNoteState,
  dirty: boolean,
): string {
  if (linked.conflict) return labels.status.conflict
  if (linked.status === 'ok') return dirty ? labels.unsaved : labels.status.ok
  return dirty ? `${labels.status[linked.status]} · ${labels.unsaved}` : labels.status[linked.status]
}

export const LINKED_TONE_CLASS = { ok: 'text-text-muted/70', warn: 'text-amber-400', error: 'text-red/80' } as const

/** Opens the file picker (no `paths`) or links the given .md paths (a drop). */
export function requestLinkMarkdown(paths?: string[]): void {
  window.dispatchEvent(new CustomEvent(LINK_MARKDOWN_EVENT, { detail: { paths } }))
}

/** `…/folder/file.md` — the end of a long path, which is what tells files apart. */
export function shortenPath(p: string, keep = 2): string {
  const parts = p.split(/[\\/]+/).filter(Boolean)
  if (parts.length <= keep + 1) return p
  const sep = p.includes('\\') ? '\\' : '/'
  return `…${sep}${parts.slice(-keep).join(sep)}`
}

export function fileNameOf(p: string): string {
  return p.split(/[\\/]+/).pop() ?? p
}

/** Whether a drag carries files from the OS (not one of our own drags). */
export function dragHasFiles(dt: DataTransfer | null): boolean {
  return !!dt && Array.from(dt.types).includes('Files')
}

/** The .md / .markdown files of a drop, as absolute paths. */
export function markdownPathsOfDrop(dt: DataTransfer | null): string[] {
  if (!dt) return []
  return Array.from(dt.files)
    .filter((f) => /\.(md|markdown)$/i.test(f.name))
    .map((f) => window.noteflow.getPathForFile(f))
    .filter((p) => !!p)
}
