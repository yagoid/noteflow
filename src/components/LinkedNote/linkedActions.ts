// Entry points of "Link file…" (new-note menu, command palette, drop): they
// all go through LinkedNotesHost (mounted once in the main window), which owns the file
// picker, the first-link notice and the error report.

import type { LinkedNoteState } from '../../types'

export const LINK_FILE_EVENT = 'noteflow:link-file'

/** Tone of a linked note's state (sidebar icon, header). Quiet when all is well (or just being checked). */
export function linkedTone(linked: LinkedNoteState, dirty = false): 'ok' | 'warn' | 'error' {
  if (linked.conflict) return 'warn'
  // Readable, only kept read-only (old Mac line breaks in a plain-text file): not an error.
  if (linked.status === 'error' && linked.error === 'loneCr') return 'warn'
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
  // A lone-CR plain-text file is readable: it's "read-only", not "cannot read".
  const status = linked.status === 'error' && linked.error === 'loneCr' ? 'readonly' : linked.status
  return dirty ? `${labels.status[status]} · ${labels.unsaved}` : labels.status[status]
}

export const LINKED_TONE_CLASS = { ok: 'text-text-muted/70', warn: 'text-amber-400', error: 'text-red/80' } as const

/** Opens the file picker (no `paths`) or links the given file paths (a drop). */
export function requestLinkFile(paths?: string[]): void {
  window.dispatchEvent(new CustomEvent(LINK_FILE_EVENT, { detail: { paths } }))
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

/**
 * The files of a drop to link, as absolute paths: every file but images (those go into
 * the editor). Main decides whether each is text — a binary one comes back as an error.
 */
export function linkablePathsOfDrop(dt: DataTransfer | null): string[] {
  if (!dt) return []
  return Array.from(dt.files)
    .filter((f) => !f.type.startsWith('image/'))
    .map((f) => window.noteflow.getPathForFile(f))
    .filter((p) => !!p)
}
