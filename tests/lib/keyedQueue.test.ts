import { describe, it, expect } from 'vitest'
import { createKeyedQueue } from '../../src/lib/keyedQueue'

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('createKeyedQueue', () => {
  it('runs tasks of the same key one after another, in call order', async () => {
    const q = createKeyedQueue()
    const log: string[] = []
    let releaseFirst!: () => void
    const first = q.run('note', () => new Promise<void>((resolve) => {
      log.push('first:start')
      releaseFirst = () => { log.push('first:end'); resolve() }
    }))
    const second = q.run('note', async () => { log.push('second') })
    await tick()
    expect(log).toEqual(['first:start'])
    releaseFirst()
    await Promise.all([first, second])
    expect(log).toEqual(['first:start', 'first:end', 'second'])
  })

  it('each task sees the state left by the previous one (no stale snapshot)', async () => {
    const q = createKeyedQueue()
    let store = ['a0', 'b0']
    const write = (index: number, value: string) => q.run('note', async () => {
      const snapshot = [...store]       // read at run time, not at call time
      await tick()                       // simulated disk write
      snapshot[index] = value
      store = snapshot
    })
    await Promise.all([write(0, 'a1'), write(1, 'b1')])
    expect(store).toEqual(['a1', 'b1'])
  })

  it('keeps different keys independent', async () => {
    const q = createKeyedQueue()
    const log: string[] = []
    let release!: () => void
    const blocked = q.run('x', () => new Promise<void>((resolve) => { release = resolve }))
    await q.run('y', async () => { log.push('y') })
    expect(log).toEqual(['y'])
    release()
    await blocked
  })

  it('a failing task rejects its caller only; the chain continues and cleans up', async () => {
    const q = createKeyedQueue()
    const failed = q.run('note', async () => { throw new Error('disk full') })
    const next = q.run('note', async () => 'ok')
    await expect(failed).rejects.toThrow('disk full')
    await expect(next).resolves.toBe('ok')
    await tick()
    expect(q.size()).toBe(0)
  })
})
