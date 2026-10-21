// ── Full reload vs. local writes landing meanwhile ───────────────────────────
//
// `loadNotes` reads every note from disk (IPC round trip, then PBKDF2 re-decrypt
// of the unlocked encrypted ones) and replaces the store's notes. A local write
// that lands in the store during that window is newer than what was read: setting
// the loaded copy would take the store BACKWARDS — and the editors, which already
// consumed that write as the echo of their own save, would then apply (or merge
// into a duplicated line) the old text. `syncNote` has the same guard per note.
// Tests: tests/lib/reloadGuard.test.ts.

/** Minimal shape: notes are compared by identity (every store write is a new object). */
interface ReloadableNote {
  id: string
  filePath: string
}

export interface ReloadMerge<T> {
  /** The notes to set: the loaded ones, except those changed in memory during the load. */
  notes: T[]
  /** Paths to re-sync (`syncNote`) so a disk version newer than the kept copy still lands. */
  resync: string[]
}

/**
 * `before` = the store's notes when the load started, `current` = now, `loaded` =
 * what the load read. A note whose store object changed during the load keeps its
 * in-memory copy (or stays deleted, if it was deleted meanwhile); one created
 * during the load is kept too. Other notes — including ones the load adds or
 * drops because the disk changed — come from the load, as before.
 * `isSame(inMemory, loaded)`: a changed copy equal to the loaded one (e.g. another
 * overlapping reload replaced every object with the same content) takes the
 * loaded one without a re-sync — no IPC read per note.
 */
export function keepNotesChangedDuringLoad<T extends ReloadableNote>(
  before: readonly T[],
  current: readonly T[],
  loaded: readonly T[],
  isSame: (inMemory: T, loaded: T) => boolean = () => false,
): ReloadMerge<T> {
  const beforeById = new Map(before.map((n) => [n.id, n]))
  const currentById = new Map(current.map((n) => [n.id, n]))
  const loadedIds = new Set(loaded.map((n) => n.id))
  const notes: T[] = []
  const resync: string[] = []
  // Created during the load (not there before, not read): first, as createNote prepends.
  for (const n of current) {
    if (!beforeById.has(n.id) && !loadedIds.has(n.id)) {
      notes.push(n)
      resync.push(n.filePath)
    }
  }
  for (const n of loaded) {
    const now = currentById.get(n.id)
    if (beforeById.get(n.id) === now || (now && isSame(now, n))) {
      notes.push(n)
      continue
    }
    if (now) notes.push(now)
    resync.push(now?.filePath ?? n.filePath)
  }
  return { notes, resync }
}
