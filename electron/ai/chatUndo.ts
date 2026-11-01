// Undo of the chat agent's note edits — pure logic (snapshots, "changed since?", restore plan).
// main.ts captures a snapshot of the note BEFORE and AFTER each note-modifying tool call (keyed by
// toolCallId, in memory for this app session) and, on `ai:chat-undo`, applies the plan returned
// here through its regular write/delete primitives (broadcast + push + reindex).
import * as noteFormat from '../noteFormat'
import type { DiskNote } from '../noteFormat'

/**
 * Tools whose effect on a note can be undone. Group/folder tools are not (they aren't notes), and
 * neither are delete_note / delete_section: they already ask for confirmation, and bringing back
 * what they removed would race the remote deletion they queued in the sync journal (a pending or
 * in-flight delete could later wipe the restored files remotely, then locally via pull).
 */
export const UNDOABLE_TOOLS = new Set([
  'create_note', 'update_note', 'add_section', 'update_section', 'rename_section',
])

export interface UndoSnapshot {
  toolCallId: string
  noteId: string
  /** Note directory name (frozen at creation), so a deleted note is restored where it was. */
  dir: string
  /** The note before the tool ran; null when the tool created it. */
  before: DiskNote | null
  /** The note right after the tool ran. */
  after: DiskNote | null
}

/** Note id a tool call acts on: its `note_id` input, or (create_note) the id the tool reported. */
export function undoNoteId(name: string, input: unknown, createdNoteId?: string): string | null {
  if (!UNDOABLE_TOOLS.has(name)) return null
  if (name === 'create_note') return createdNoteId || null
  const raw = input && typeof input === 'object' ? (input as Record<string, unknown>).note_id : undefined
  return typeof raw === 'string' && raw ? raw : null
}

/**
 * What a note "is" for the undo check: every field the user can change, but not `updated` (a
 * rewrite of identical content bumps it and must not count as a change).
 */
export function noteFingerprint(note: DiskNote | null): string {
  if (!note) return 'null'
  return JSON.stringify({
    title: note.title,
    tags: [...note.tags].sort(),
    archived: !!note.archived,
    favorited: !!note.favorited,
    group: note.group ?? null,
    folder: note.folder ?? null,
    expiresAt: note.expiresAt ?? null,
    encryption: note.encryption ?? null,
    sections: note.sections.map((s) => [s.id, s.name, s.content, !!s.isRawMode, !!s.aiHidden, s.created ?? null]),
  })
}

/** True when the note no longer matches what the AI's edit left on disk (someone edited it since). */
export function isModifiedSinceEdit(snapshot: UndoSnapshot, current: DiskNote | null): boolean {
  return noteFingerprint(current) !== noteFingerprint(snapshot.after)
}

/**
 * Why an undo can't run at all, whatever the user confirms (null = it can):
 * - 'gone': it would re-create the note folder or a section file that is no longer on disk —
 *   deleted after the AI's edit, so a remote deletion may be pending or in flight for it in the
 *   sync journal and the restored files could be wiped again (remotely, then locally via pull);
 * - 'encryption': the note was encrypted or decrypted after the edit — restoring the snapshot
 *   would silently undo that (e.g. write a decrypted copy over an encrypted note).
 * A note the tool created is just deleted again, which never re-creates anything.
 */
export function undoBlock(snapshot: UndoSnapshot, current: DiskNote | null): 'gone' | 'encryption' | null {
  const before = snapshot.before
  if (!before) return null
  if (!current) return 'gone'
  if (!!before.encryption !== !!current.encryption) return 'encryption'
  if (!before.encryption) {
    const onDisk = new Set(current.sections.map((s) => s.id))
    if (before.sections.some((s) => !onDisk.has(s.id))) return 'gone'
  }
  return null
}

export type UndoPlan =
  | { kind: 'write'; dir: string; files: Record<string, string>; deleteFiles: string[] }
  | { kind: 'delete'; dir: string }
  | { kind: 'noop' }

/**
 * How to put the note back as it was before the tool ran, given what is on disk now.
 * - created by the tool → delete it (noop if it's already gone);
 * - otherwise → rewrite it from the "before" snapshot: note.md plus only the section files that
 *   differ from disk, deleting section files the snapshot doesn't have.
 * Check `undoBlock` first: this plans the write, it doesn't decide whether it's safe.
 */
export function planUndo(snapshot: UndoSnapshot, current: DiskNote | null): UndoPlan {
  if (!snapshot.before) return current ? { kind: 'delete', dir: snapshot.dir } : { kind: 'noop' }
  const { files } = noteFormat.serializeNoteFolder(snapshot.before)
  const currentById = new Map((current?.encryption ? [] : current?.sections ?? []).map((s) => [s.id, s.content]))
  const out: Record<string, string> = {}
  for (const [file, content] of Object.entries(files)) {
    if (file === noteFormat.NOTE_MD) { out[file] = content; continue }
    const sectionId = file.replace(/\.md$/, '')
    if (currentById.get(sectionId) !== content) out[file] = content
  }
  const keep = new Set(snapshot.before.encryption ? [] : snapshot.before.sections.map((s) => s.id))
  const deleteFiles = [...currentById.keys()].filter((id) => !keep.has(id)).map((id) => `${id}.md`)
  return { kind: 'write', dir: snapshot.dir, files: out, deleteFiles }
}

/** In-memory snapshot store, bounded (oldest dropped first) — lives for the app session. */
export function createUndoStore(limit = 200) {
  const map = new Map<string, UndoSnapshot>()
  return {
    put(snapshot: UndoSnapshot): void {
      map.delete(snapshot.toolCallId)
      map.set(snapshot.toolCallId, snapshot)
      while (map.size > limit) {
        const oldest = map.keys().next().value
        if (oldest === undefined) break
        map.delete(oldest)
      }
    },
    get: (toolCallId: string): UndoSnapshot | undefined => map.get(toolCallId),
    has: (toolCallId: string): boolean => map.has(toolCallId),
    delete: (toolCallId: string): void => { map.delete(toolCallId) },
    get size(): number { return map.size },
  }
}

/**
 * Sessions read back from ai-chats.json may carry `undo: 'available'` on activity rows whose
 * snapshot no longer exists (written before an app restart). Drop the flag so no dead "Undo"
 * button is shown. Returns the input untouched when nothing changes.
 */
export function stripStaleUndo<T>(sessions: T, isAvailable: (toolCallId: string) => boolean): T {
  if (!Array.isArray(sessions)) return sessions
  let changed = false
  const next = sessions.map((session: unknown) => {
    const s = session as { messages?: unknown }
    if (!s || !Array.isArray(s.messages)) return session
    let sessionChanged = false
    const messages = s.messages.map((message: unknown) => {
      const m = message as { actions?: unknown }
      if (!m || !Array.isArray(m.actions)) return message
      let msgChanged = false
      const actions = m.actions.map((action: unknown) => {
        const a = action as { toolCallId?: unknown; undo?: unknown }
        if (a && a.undo === 'available' && (typeof a.toolCallId !== 'string' || !isAvailable(a.toolCallId))) {
          msgChanged = true
          const copy = { ...(a as Record<string, unknown>) }
          delete copy.undo
          return copy
        }
        return action
      })
      if (!msgChanged) return message
      sessionChanged = true
      return { ...(m as Record<string, unknown>), actions }
    })
    if (!sessionChanged) return session
    changed = true
    return { ...(s as Record<string, unknown>), messages }
  })
  return (changed ? next : sessions) as T
}
