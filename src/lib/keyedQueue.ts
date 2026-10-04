/**
 * Per-key serial task queue: tasks with the same key run one after another, in call
 * order; different keys run independently. A failing task rejects ITS caller only —
 * the chain keeps going.
 *
 * The notes store runs every write of a note through it (keyed by note id) so each
 * write reads the store AFTER the previous one has landed. Without it, two writes
 * issued close together (two split panes editing different sections of one note)
 * would both start from the same snapshot and the last to finish would drop the
 * other's change.
 */
export function createKeyedQueue() {
  const tails = new Map<string, Promise<unknown>>()
  return {
    run<T>(key: string, task: () => Promise<T>): Promise<T> {
      const prev = tails.get(key) ?? Promise.resolve()
      const result = prev.then(task, task)
      // The stored tail never rejects, so a failure can't poison later tasks nor
      // surface as an unhandled rejection from the chain itself.
      const tail = result.then(() => undefined, () => undefined)
      tails.set(key, tail)
      void tail.then(() => { if (tails.get(key) === tail) tails.delete(key) })
      return result
    },
    /** Number of keys with queued/running work (for tests). */
    size(): number {
      return tails.size
    },
  }
}
