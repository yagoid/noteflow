import { describe, it, expect } from 'vitest'
import { createCoalescedRunner, trackInFlight, waitUntil } from '../../electron/syncCycle'
import { getSyncDisplayState } from '../../src/lib/syncStatus'
import type { ActiveSyncStatus } from '../../src/types'

interface Flags {
  manual: boolean
}

const mergeFlags = (a: Flags, b: Flags): Flags => ({ manual: a.manual || b.manual })

/** A pass the test settles by hand; records the flags of every pass started. */
function controllablePass() {
  const started: Flags[] = []
  const pending: Array<{ resolve: (v: string) => void; reject: (e: unknown) => void }> = []
  const pass = (flags: Flags) =>
    new Promise<string>((resolve, reject) => {
      started.push(flags)
      pending.push({ resolve, reject })
    })
  return { pass, started, pending }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('createCoalescedRunner', () => {
  it('runs a pass right away when idle and resolves with its result', async () => {
    const { pass, started, pending } = controllablePass()
    const runner = createCoalescedRunner(pass, mergeFlags)
    const p = runner.run({ manual: false })
    expect(runner.isRunning()).toBe(true)
    expect(started).toEqual([{ manual: false }])
    pending[0].resolve('pull-1')
    await expect(p).resolves.toBe('pull-1')
    expect(runner.isRunning()).toBe(false)
  })

  it('never overlaps passes: requests made mid-pass fold into ONE queued pass', async () => {
    const { pass, started, pending } = controllablePass()
    const runner = createCoalescedRunner(pass, mergeFlags)
    const first = runner.run({ manual: false })
    const second = runner.run({ manual: false })
    const third = runner.run({ manual: false })
    expect(started).toHaveLength(1)

    pending[0].resolve('pull-1')
    await expect(first).resolves.toBe('pull-1')
    await flush()
    expect(started).toHaveLength(2) // the coalesced re-run

    pending[1].resolve('pull-2')
    // Both late callers get the pass that STARTED after their request.
    await expect(second).resolves.toBe('pull-2')
    await expect(third).resolves.toBe('pull-2')
    await flush()
    expect(started).toHaveLength(2)
    expect(runner.isRunning()).toBe(false)
  })

  it('a manual request made during an automatic pass makes the queued pass manual', async () => {
    const { pass, started, pending } = controllablePass()
    const runner = createCoalescedRunner(pass, mergeFlags)
    void runner.run({ manual: false })
    const manual = runner.run({ manual: true })
    void runner.run({ manual: false }) // a later automatic request doesn't downgrade it
    pending[0].resolve('auto')
    await flush()
    expect(started).toEqual([{ manual: false }, { manual: true }])
    pending[1].resolve('manual-pull')
    await expect(manual).resolves.toBe('manual-pull')
  })

  it('a failing pass rejects only its own callers; the queued pass still runs', async () => {
    const { pass, started, pending } = controllablePass()
    const runner = createCoalescedRunner(pass, mergeFlags)
    const first = runner.run({ manual: false })
    const second = runner.run({ manual: true })
    pending[0].reject(new Error('offline'))
    await expect(first).rejects.toThrow('offline')
    await flush()
    expect(started).toHaveLength(2)
    pending[1].resolve('ok')
    await expect(second).resolves.toBe('ok')
    expect(runner.isRunning()).toBe(false)
  })

  it('starts a fresh pass for a request made after the previous one finished', async () => {
    const { pass, started, pending } = controllablePass()
    const runner = createCoalescedRunner(pass, mergeFlags)
    const first = runner.run({ manual: false })
    pending[0].resolve('a')
    await first
    const second = runner.run({ manual: true })
    expect(started).toEqual([{ manual: false }, { manual: true }])
    pending[1].resolve('b')
    await expect(second).resolves.toBe('b')
  })
})

describe('waitUntil', () => {
  const instantSleep = () => Promise.resolve()

  it('resolves true at once when the condition already holds (no sleep)', async () => {
    let sleeps = 0
    const ok = await waitUntil(() => true, 1000, 200, async () => { sleeps++ })
    expect(ok).toBe(true)
    expect(sleeps).toBe(0)
  })

  it('polls until the condition holds', async () => {
    let checks = 0
    const ok = await waitUntil(() => ++checks >= 3, 1000, 200, instantSleep)
    expect(ok).toBe(true)
    expect(checks).toBe(3)
  })

  it('gives up with false once the timeout elapsed', async () => {
    let sleeps = 0
    const ok = await waitUntil(() => false, 1000, 200, async () => { sleeps++ })
    expect(ok).toBe(false)
    expect(sleeps).toBe(5) // 5 × 200 ms = the 1000 ms budget
  })
})

describe('trackInFlight (remote deletes in main.ts)', () => {
  /**
   * The note-deletion scenario: the backend journals the deleteDir
   * synchronously (before its first await) and drops the entry once the remote
   * delete lands — or keeps it, with an error, when it fails. `view()` is what
   * the titlebar shows when it re-reads the status at that point.
   */
  function deletion() {
    const journal = new Set<string>()
    const inFlight = new Set<string>()
    let error: string | undefined
    let settle!: (ok: boolean) => void
    const notifications: Array<'pushing' | 'idle'> = []
    const work = (dir: string) => async () => {
      journal.add(dir)
      const ok = await new Promise<boolean>((resolve) => { settle = resolve })
      if (ok) journal.delete(dir)
      else error = `Failed to delete note folder "${dir}"`
    }
    const notify = () => notifications.push(inFlight.size > 0 ? 'pushing' : 'idle')
    const view = () => {
      const status: ActiveSyncStatus = {
        backend: 'github',
        active: true,
        initialPullStatus: 'ok',
        error,
        pendingUploads: inFlight.size,
        pendingChanges: journal.size, // no push timer for a deleteDir key
      }
      return getSyncDisplayState(status, false, inFlight.size > 0)
    }
    return { journal, inFlight, work, notify, view, notifications, settle: (ok: boolean) => settle(ok) }
  }

  it('shows the delete as uploading while in flight, then synced once it lands (no "not uploaded")', async () => {
    const d = deletion()
    const done = trackInFlight(d.inFlight, 'note-a', d.work('note-a'), d.notify)
    // The renderer's refresh after notes-updated: journaled, but in flight.
    expect(d.journal.has('note-a')).toBe(true)
    expect(d.view()).toBe('uploading')
    d.settle(true)
    await done
    expect(d.notifications).toEqual(['pushing', 'idle']) // the idle re-read
    expect(d.view()).toBe('synced')
  })

  it('a failed delete settles too: the idle re-read shows the error, not a stale state', async () => {
    const d = deletion()
    const done = trackInFlight(d.inFlight, 'note-a', d.work('note-a'), d.notify)
    d.settle(false)
    await done
    expect(d.inFlight.size).toBe(0)
    expect(d.notifications).toEqual(['pushing', 'idle'])
    expect(d.view()).toBe('error')
  })

  it('leaves the set and notifies even when the work rejects, and rejects with its error', async () => {
    const inFlight = new Set<string>()
    const notifications: number[] = []
    const failing = () => Promise.reject(new Error('boom'))
    await expect(trackInFlight(inFlight, 'k', failing, () => notifications.push(inFlight.size))).rejects.toThrow('boom')
    expect(inFlight.size).toBe(0)
    expect(notifications).toEqual([1, 0])
  })

  it('tracks concurrent keys independently', async () => {
    const inFlight = new Set<string>()
    let releaseA!: () => void
    const a = trackInFlight(inFlight, 'a', () => new Promise<void>((r) => { releaseA = r }), () => {})
    const b = trackInFlight(inFlight, 'a/s1.md', () => Promise.resolve(), () => {})
    await b
    expect([...inFlight]).toEqual(['a'])
    releaseA()
    await a
    expect(inFlight.size).toBe(0)
  })
})
