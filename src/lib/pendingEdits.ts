// ── Pending (debounced) editor saves ────────────────────────────────────────
//
// The editors debounce their writes (rich text 400 ms, raw 600 ms, title 300 ms).
// While a debounce is pending the store still holds the old text, so anything
// that acts on the store in that window could lose the keystrokes:
//   - pruning a new note that still looks empty (focusing another split pane or
//     picking another note from the sidebar while typing) deleted it, and the
//     late save then found no note to write to;
//   - closing a section/sticky window dropped the last keystrokes.
// Every pending save registers here so those paths can flush it first.

// `flush` is the owning slot's flush: it unregisters the entry and stops its timer.
type Entry = { noteId: string; flush: () => void }

const pending = new Set<Entry>()

export interface DebouncedSave {
  /**
   * (Re)starts the debounce. `noteId` and everything `save` writes must be
   * captured NOW, at schedule time — not read when it fires, when the editor may
   * already show another note. `target` identifies what the save writes (default:
   * the note): a pending save for ANOTHER target is run first, not replaced — the
   * field may have moved to another note/section before its debounce fired.
   */
  schedule(noteId: string, delayMs: number, save: () => void, target?: string): void
  /** Runs the pending save immediately (no-op when nothing is pending). */
  flush(): void
  /** Drops the pending save without running it (the caller writes the same data itself). */
  cancel(): void
}

/** One debounced save slot (one per editor field), registered while it's pending. */
export function createDebouncedSave(): DebouncedSave {
  let timer: ReturnType<typeof setTimeout> | null = null
  let entry: Entry | null = null
  let save: (() => void) | null = null
  let pendingTarget: string | null = null
  const clear = () => {
    if (timer) clearTimeout(timer)
    if (entry) pending.delete(entry)
    timer = null
    entry = null
    save = null
    pendingTarget = null
  }
  const flush = () => {
    const run = save
    clear()
    run?.()
  }
  return {
    schedule(noteId, delayMs, nextSave, target = noteId) {
      if (pendingTarget !== null && pendingTarget !== target) flush()
      else clear()
      save = nextSave
      pendingTarget = target
      entry = { noteId, flush }
      pending.add(entry)
      timer = setTimeout(flush, delayMs)
    },
    flush,
    cancel: clear,
  }
}

/** Runs now every pending save of `noteId` (of every note when omitted). */
export function flushPendingEdits(noteId?: string): void {
  for (const entry of [...pending]) {
    if (noteId === undefined || entry.noteId === noteId) entry.flush()
  }
}

/** Whether some editor still has a save of `noteId` waiting on its debounce. */
export function hasPendingEdits(noteId: string): boolean {
  for (const entry of pending) if (entry.noteId === noteId) return true
  return false
}
