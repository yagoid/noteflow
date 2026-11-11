// Pure helpers behind the NoteFlow Cloud sync cycle of main.ts (no Electron
// imports — tested in tests/electron/syncCycle.test.ts).

/**
 * Single-flight runner with coalescing. `run(flags)` starts a pass right away
 * when idle; while a pass is running it queues ONE more pass to run after it
 * (every request made meanwhile folds into that same pass, their flags merged
 * with `mergeFlags`). Each caller's promise settles with the result of the
 * pass that covers its request — one that STARTED after the request — so a
 * manual "Sync now" clicked mid-cycle waits for a fresh pull + journal drain
 * instead of returning the result of the cycle already under way. Passes
 * never overlap. A pass that throws rejects only its own callers; a queued
 * pass still runs.
 */
export interface CoalescedRunner<F, T> {
  run(flags: F): Promise<T>
  isRunning(): boolean
}

interface Waiter<T> {
  resolve: (value: T) => void
  reject: (err: unknown) => void
}

interface QueuedPass<F, T> {
  flags: F
  waiters: Waiter<T>[]
}

export function createCoalescedRunner<F, T>(
  pass: (flags: F) => Promise<T>,
  mergeFlags: (queued: F, incoming: F) => F,
): CoalescedRunner<F, T> {
  let running = false
  let queued: QueuedPass<F, T> | null = null

  async function loop(first: QueuedPass<F, T>): Promise<void> {
    running = true
    let current: QueuedPass<F, T> | null = first
    try {
      while (current) {
        const { flags, waiters } = current
        try {
          const result = await pass(flags)
          for (const w of waiters) w.resolve(result)
        } catch (err) {
          for (const w of waiters) w.reject(err)
        }
        current = queued
        queued = null
      }
    } finally {
      running = false
    }
  }

  return {
    run(flags: F): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const waiter: Waiter<T> = { resolve, reject }
        if (!running) {
          void loop({ flags, waiters: [waiter] })
          return
        }
        if (queued) {
          queued.flags = mergeFlags(queued.flags, flags)
          queued.waiters.push(waiter)
        } else {
          queued = { flags, waiters: [waiter] }
        }
      })
    },
    isRunning: () => running,
  }
}

/**
 * Resolves true as soon as `done()` holds (checked right away, then every
 * `intervalMs`), or false once `timeoutMs` elapsed without it. Used by the
 * manual Cloud sync to let uploads already in flight land before it pulls
 * (an automatic cycle just stands down instead).
 */
export async function waitUntil(
  done: () => boolean,
  timeoutMs: number,
  intervalMs = 200,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<boolean> {
  let waited = 0
  while (!done()) {
    if (waited >= timeoutMs) return false
    await sleep(intervalMs)
    waited += intervalMs
  }
  return true
}

/**
 * Runs `work` (a remote mutation) as "in flight": `key` sits in `inFlight`
 * from the call until the work settles — success or failure — and `notify`
 * fires on both transitions. main.ts wraps the remote deletes with it (note
 * folders, dropped section files): they show as "uploading" while they run,
 * and the status is re-read when they land, so a deletion neither flashes nor
 * leaves behind a stale "not uploaded" (its journal entry exists only while it
 * is in flight, or after it failed). Rejects with the work's error.
 */
export async function trackInFlight(
  inFlight: Set<string>,
  key: string,
  work: () => Promise<unknown>,
  notify: () => void,
): Promise<void> {
  inFlight.add(key)
  notify()
  try {
    await work()
  } finally {
    inFlight.delete(key)
    notify()
  }
}
