import type { Note } from '../types'

/**
 * Undo/redo history kept per section (`noteId/sectionId`) outside React, so it
 * survives the editor being unmounted: a section/note switch (the TipTap Editor
 * is keyed by section) or leaving for another view (content, brain, overview…).
 * Each section keeps its own history — never a global one that jumps between them.
 *
 * Holds plaintext of the sections it covers, so entries of a note that is gone,
 * locked or encrypted are dropped (`pruneUndoHistory`, `isUndoHistoryKeepable`).
 * Bounded LRU: the least recently used sections lose their history first.
 */
export const UNDO_HISTORY_LIMIT = 30

export interface UndoHistoryCache<T> {
  /** The entry of a section (refreshes its recency). */
  get(noteId: string, sectionId: string): T | undefined
  /** The entry of a section, removed from the cache (a mounted editor owns it now). */
  take(noteId: string, sectionId: string): T | undefined
  set(noteId: string, sectionId: string, value: T): void
  delete(noteId: string, sectionId: string): void
  /** Drops every entry `keep` rejects. */
  prune(keep: (noteId: string, sectionId: string) => boolean): void
  readonly size: number
}

export function createUndoHistoryCache<T>(limit = UNDO_HISTORY_LIMIT): UndoHistoryCache<T> {
  // Map iteration order = insertion order: the first entry is the least recently used.
  const entries = new Map<string, { noteId: string; sectionId: string; value: T }>()
  const keyOf = (noteId: string, sectionId: string) => `${noteId}/${sectionId}`
  return {
    get(noteId, sectionId) {
      const key = keyOf(noteId, sectionId)
      const entry = entries.get(key)
      if (!entry) return undefined
      entries.delete(key)
      entries.set(key, entry)
      return entry.value
    },
    take(noteId, sectionId) {
      const key = keyOf(noteId, sectionId)
      const entry = entries.get(key)
      entries.delete(key)
      return entry?.value
    },
    set(noteId, sectionId, value) {
      const key = keyOf(noteId, sectionId)
      entries.delete(key)
      entries.set(key, { noteId, sectionId, value })
      while (entries.size > limit) {
        const oldest = entries.keys().next().value
        if (oldest === undefined) break
        entries.delete(oldest)
      }
    },
    delete(noteId, sectionId) {
      entries.delete(keyOf(noteId, sectionId))
    },
    prune(keep) {
      for (const [key, entry] of entries) {
        if (!keep(entry.noteId, entry.sectionId)) entries.delete(key)
      }
    },
    get size() {
      return entries.size
    },
  }
}

/** Whether a section may keep (or store) undo history: its note and the section still
 *  exist, and the note isn't encrypted-and-locked (the history is plaintext). */
export function isUndoHistoryKeepable(
  note: Pick<Note, 'id' | 'encryption' | 'sections'> | undefined,
  sessionPasswords: Record<string, string>,
  sectionId: string,
): boolean {
  if (!note) return false
  if (note.encryption && !sessionPasswords[note.id]) return false
  return note.sections.some((s) => s.id === sectionId)
}

/** Drops the entries of deleted notes/sections and of locked (or just encrypted) notes. */
export function pruneUndoHistory(
  cache: UndoHistoryCache<unknown>,
  notes: Pick<Note, 'id' | 'encryption' | 'sections'>[],
  sessionPasswords: Record<string, string>,
): void {
  if (cache.size === 0) return
  const byId = new Map(notes.map((n) => [n.id, n]))
  cache.prune((noteId, sectionId) => isUndoHistoryKeepable(byId.get(noteId), sessionPasswords, sectionId))
}

// ── Text mode (raw textarea) ────────────────────────────────────────────────

/** Undo/redo of a section's text-mode buffer. `content` = the buffer the stacks end at:
 *  they only apply while the buffer still holds it (an external update in between
 *  would otherwise be silently reverted by Ctrl+Z, and that saved). */
export interface RawUndoHistory {
  undo: string[]
  redo: string[]
  /** When the last undo level was pushed: edits closer than RAW_UNDO_GROUP_MS share it. */
  lastPush: number
  content: string
}

export const RAW_UNDO_DEPTH = 100
export const RAW_UNDO_GROUP_MS = 500

/** Whether `history` is the one of a text-mode buffer holding `buffer`. A section's
 *  history is shared live by every pane showing it, so an update that replaces one
 *  pane's buffer only invalidates the history if it was that buffer's: the other
 *  pane's own edit, reaching this pane as an external update, must not drop it. */
export function isRawHistoryOf(history: RawUndoHistory | undefined, buffer: string): boolean {
  return history !== undefined && history.content === buffer
}

/** Records a local edit `prev` → `next`. History recorded on another buffer is discarded. */
export function recordRawEdit(
  history: RawUndoHistory | undefined,
  prev: string,
  next: string,
  now: number,
): RawUndoHistory {
  const base: RawUndoHistory = history && history.content === prev
    ? history
    : { undo: [], redo: [], lastPush: 0, content: prev }
  if (now - base.lastPush <= RAW_UNDO_GROUP_MS) return { ...base, content: next }
  return { undo: [...base.undo, prev].slice(-RAW_UNDO_DEPTH), redo: [], lastPush: now, content: next }
}

/** Ctrl+Z on `current`: the buffer to show and the history after it, or null (nothing
 *  to undo, or the history doesn't belong to this buffer). */
export function undoRaw(
  history: RawUndoHistory | undefined,
  current: string,
): { content: string; history: RawUndoHistory } | null {
  if (!history || history.content !== current || history.undo.length === 0) return null
  const content = history.undo[history.undo.length - 1]
  // lastPush reset: the next edit opens its own undo level (and drops the redo stack).
  return {
    content,
    history: { undo: history.undo.slice(0, -1), redo: [...history.redo, current], lastPush: 0, content },
  }
}

/** Ctrl+Shift+Z / Ctrl+Y on `current` (see undoRaw). */
export function redoRaw(
  history: RawUndoHistory | undefined,
  current: string,
): { content: string; history: RawUndoHistory } | null {
  if (!history || history.content !== current || history.redo.length === 0) return null
  const content = history.redo[history.redo.length - 1]
  return {
    content,
    history: { undo: [...history.undo, current], redo: history.redo.slice(0, -1), lastPush: 0, content },
  }
}
