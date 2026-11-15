// ── Forced restore of a section's content (version history) ─────────────────
//
// Restoring an old version writes it through the normal store path
// (updateSection), so it lands on disk and the sync engine uploads it like any
// edit. But an open editor would treat that store update as an EXTERNAL change
// (lib/externalContentSync): applied without an undo step, or three-way merged
// with a local edit still in flight — a restore must replace the text exactly,
// never merge, and Ctrl+Z must take it back.
//
// So, right before its write, the version history panel MARKS the restore here:
// (note, section, content). An editor of that section whose incoming store
// content matches a mark it hasn't applied yet takes it as a forced
// replacement: it drops its pending save and its outbox, takes the content as
// the new base, and applies it as ONE undoable step without saving it back
// (components/Editor/Editor.tsx, NoteEditor.tsx text mode). Every editor of the
// section applies a mark at most once (per-editor token), and a mark expires a
// few seconds after its write landed: a later, unrelated update that happens to
// bring back the same text is an ordinary external update again.
//
// Window-local by design (module state): other windows (sticky / section
// windows) get the restore as a normal external update through the notes
// reload. Pure — no React, no DOM. Tests: tests/lib/sectionRestore.test.ts.

import { sameContent } from './externalContentSync'

export interface ForcedRestore {
  noteId: string
  sectionId: string
  content: string
  /** Unique per mark: an editor remembers the last token it applied. */
  token: number
}

/** How long a mark outlives its write (the editors see it in their next render). */
export const FORCED_RESTORE_TTL_MS = 10_000

const marks = new Map<string, ForcedRestore>()
const timers = new Map<number, ReturnType<typeof setTimeout>>()
let nextToken = 1

const keyOf = (noteId: string, sectionId: string) => `${noteId}/${sectionId}`

/** Marks the restore of `content` into a section (replaces an older mark of it). Returns its token. */
export function markForcedRestore(noteId: string, sectionId: string, content: string): number {
  const token = nextToken++
  const previous = marks.get(keyOf(noteId, sectionId))
  if (previous) clearForcedRestore(previous.token)
  marks.set(keyOf(noteId, sectionId), { noteId, sectionId, content, token })
  return token
}

/** Drops the mark `token` (if still the current one of its section). */
export function clearForcedRestore(token: number): void {
  const timer = timers.get(token)
  if (timer) clearTimeout(timer)
  timers.delete(token)
  for (const [key, mark] of marks) {
    if (mark.token === token) marks.delete(key)
  }
}

/** Expires the mark `token` after `ttlMs` (call it once its write has landed). */
export function expireForcedRestore(token: number, ttlMs = FORCED_RESTORE_TTL_MS): void {
  const existing = timers.get(token)
  if (existing) clearTimeout(existing)
  timers.set(token, setTimeout(() => clearForcedRestore(token), ttlMs))
}

/**
 * The mark an editor of (noteId, sectionId) must apply as a forced replacement
 * of `incoming`: the section's current mark when its content is `incoming` and
 * the editor hasn't applied it yet (`appliedToken`); null otherwise.
 */
export function pendingForcedRestore(
  noteId: string,
  sectionId: string | null | undefined,
  incoming: string,
  appliedToken: number | null,
): ForcedRestore | null {
  if (!sectionId) return null
  const mark = marks.get(keyOf(noteId, sectionId))
  if (!mark || mark.token === appliedToken) return null
  return sameContent(mark.content, incoming) ? mark : null
}
