// ── Notes main moved to the local archive ────────────────────────────────────
//
// "Use only the notes from …" (a notes dir that came from another remote — see
// electron/notesArchive.ts) MOVES every note that would sync out of the notes
// dir. Main then tells every window which ones (`notes-archived`), and each
// window takes them out of its store with this — memory only: nothing here
// deletes a note from disk nor from a remote.
//
// A full reload can't do it: `loadNotes` deliberately ignores an EMPTY result
// while the store has notes (a transient empty readdir on Windows), and an
// emptied notes dir is exactly what the archive leaves when the new remote has
// nothing to pull yet.
//
// Pure (no store, no IPC); tests in tests/lib/archivedNotes.test.ts.

import type { NotesArchivedEvent } from '../types'
import { type PaneLayout, removeNotesFromLayout } from './paneUtils'
import { pathBasename } from './noteUtils'

/** Minimal shape of a store note. */
interface ArchivableNote {
  id: string
  /** Absolute path of the note folder (of the file, for a linked note). */
  filePath: string
  archived?: boolean
  /** Present iff the note is a linked external file — never archived. */
  linked?: unknown
}

/**
 * Ids of the store's notes that the event archived: matched by id, or by the
 * name of their folder (case-insensitively, like `syncNote`) when main could
 * not read the id. A linked note lives outside the notes dir and is never
 * archived, whatever the event says.
 */
export function archivedNoteIds(notes: readonly ArchivableNote[], event: NotesArchivedEvent): Set<string> {
  const ids = new Set(event.noteIds)
  const dirs = new Set(event.dirs.map((d) => d.toLowerCase()))
  const out = new Set<string>()
  for (const n of notes) {
    if (n.linked) continue
    if (ids.has(n.id) || dirs.has(pathBasename(n.filePath).toLowerCase())) out.add(n.id)
  }
  return out
}

export interface ArchivedNotesRemoval<T> {
  /** Ids taken out of the store. */
  removed: Set<string>
  notes: T[]
  layout: PaneLayout
  sessionPasswords: Record<string, string>
}

/**
 * The store's state without the archived notes, or null when none of them is
 * in it. Panes showing an archived note close; the other panes stay as they
 * are (the active one moves to the next surviving pane). With no pane left,
 * `fallbackToAnotherNote` opens the first note that stays — a non-archived one
 * first, the same rule as deleting a note — and without one (or in a secondary
 * window, which never jumps to another note) the layout is left empty.
 * Session unlocks of the removed notes are dropped. Notes that stay keep their
 * object identity and order.
 */
export function withoutArchivedNotes<T extends ArchivableNote>(
  state: { notes: readonly T[]; layout: PaneLayout; sessionPasswords: Record<string, string> },
  event: NotesArchivedEvent,
  opts: { fallbackToAnotherNote: boolean; newPaneId: string },
): ArchivedNotesRemoval<T> | null {
  const removed = archivedNoteIds(state.notes, event)
  if (removed.size === 0) return null
  const notes = state.notes.filter((n) => !removed.has(n.id))
  const fallback = opts.fallbackToAnotherNote
    ? notes.find((n) => !n.archived)?.id ?? notes[0]?.id ?? null
    : null
  return {
    removed,
    notes,
    layout: removeNotesFromLayout(state.layout, removed, fallback, opts.newPaneId),
    sessionPasswords: Object.fromEntries(Object.entries(state.sessionPasswords).filter(([id]) => !removed.has(id))),
  }
}
