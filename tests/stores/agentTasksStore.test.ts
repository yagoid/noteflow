// @vitest-environment happy-dom
// Agent tasks, live (src/stores/agentTasksStore.ts): the blocks of the watched
// notes, the clock behind 'no signal' and the maintenance — orphans + discard
// by age, in the order that cannot race the editor (marker off the line, then
// the block). `window.noteflow` is a recording fake.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setWindowRole, useNotesStore } from '../../src/stores/notesStore'
import {
  AGENT_MAINTENANCE_INTERVAL_MS,
  agentDirKey,
  resetAgentTasksStoreForTests,
  useAgentTasksStore,
} from '../../src/stores/agentTasksStore'
import { createDebouncedSave } from '../../src/lib/pendingEdits'
import type { AgentBlock, AgentTaskSettings, Note, NoteWritePayload } from '../../src/types'

const ROBOT = '\u{1F916}'
const NOTES_DIR = 'C:\\Users\\me\\notes'
const DIR = `${NOTES_DIR}\\plan-n1`
const T0 = '2026-11-01T10:00:00.000Z'

const ENABLED: AgentTaskSettings = {
  enabled: true, onFinish: 'check', staleMinutes: 90, discardAfterDays: 30, launch: 'terminal', agent: 'claude', agentCommand: '', agentUrl: '',
}

function block(id: string, state: string, extra: Record<string, string> = {}): AgentBlock {
  return { id, meta: { title: id, state, ...extra }, body: '' }
}

function makeNote(content: string): Note {
  return {
    id: 'n1', title: 'Plan', tags: [], created: T0, updated: T0, archived: false, favorited: false,
    sections: [{ id: 'a', name: 'Tasks', content }],
    raw: '', filePath: DIR,
  }
}

interface Disk {
  blocks: AgentBlock[]
  discardable: string[]
  settings: AgentTaskSettings
}

let disk: Disk
let calls: string[]
let writes: NoteWritePayload[]
let changed: ((dirPath: string) => void) | null
let settingsChanged: ((settings: AgentTaskSettings) => void) | null

function installBridge() {
  const known: Record<string, (...args: never[]) => unknown> = {
    writeNote: async (payload: NoteWritePayload) => { writes.push(payload); calls.push('writeNote'); return { ok: true } },
    recordActivityEdit: () => undefined,
    scheduleAlarms: () => undefined,
    agentTasksGetSettings: async () => disk.settings,
    agentTasksSetSettings: async (patch: Partial<AgentTaskSettings>) => {
      disk.settings = { ...disk.settings, ...patch }
      calls.push('setSettings')
      return disk.settings
    },
    agentTasksRead: async (dir: string) => {
      calls.push(`read ${agentDirKey(dir)}`)
      return { blocks: disk.blocks.map((b) => ({ ...b, meta: { ...b.meta } })), discardable: [...disk.discardable] }
    },
    agentTasksMaintain: async (dir: string, liveIds?: string[]) => {
      calls.push(`maintain ${agentDirKey(dir)} [${[...(liveIds ?? [])].sort().join(',')}]`)
      return { ok: true, changed: false, blocks: disk.blocks }
    },
    agentTasksReconcile: async (dir: string, id: string) => {
      calls.push(`reconcile ${agentDirKey(dir)} ${id}`)
      return { ok: true, changed: true }
    },
    agentTasksDismiss: async (dir: string, id: string) => {
      calls.push(`dismiss ${agentDirKey(dir)} ${id}`)
      disk.blocks = disk.blocks.filter((b) => b.id !== id)
      return { ok: true, removed: true }
    },
    onAgentTasksChanged: (cb: (dirPath: string) => void) => { changed = cb; return () => { changed = null } },
    onAgentTasksSettingsChanged: (cb: (settings: AgentTaskSettings) => void) => { settingsChanged = cb; return () => { settingsChanged = null } },
  }
  ;(window as unknown as { noteflow: unknown }).noteflow = new Proxy({}, {
    get: (_target, name: string) => (...args: never[]) => {
      if (known[name]) return known[name](...args)
      throw new Error(`unexpected window.noteflow.${name}()`)
    },
  })
}

const store = () => useAgentTasksStore.getState()
const sectionContent = () => useNotesStore.getState().notes[0].sections[0].content
/** Lets every queued promise of the store settle. */
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }

beforeEach(() => {
  disk = { blocks: [], discardable: [], settings: ENABLED }
  calls = []
  writes = []
  changed = null
  settingsChanged = null
  installBridge()
  setWindowRole('main')
  resetAgentTasksStoreForTests()
  useNotesStore.setState({ notes: [makeNote(`- [ ] Task ${ROBOT}aaaa1:running\n`)], openPanes: [], activePaneId: null, activeNoteId: null, sessionPasswords: {} })
})

afterEach(() => {
  vi.useRealTimers()
  resetAgentTasksStoreForTests()
  useNotesStore.setState({ notes: [], openPanes: [], activePaneId: null, activeNoteId: null, sessionPasswords: {} })
})

describe('agentTasksStore — settings', () => {
  it('starts off, loads once, and follows a change made in another window', async () => {
    disk.settings = { ...ENABLED, enabled: false }
    expect(store().settings.enabled).toBe(false)
    expect(store().settingsLoaded).toBe(false)
    await Promise.all([store().ensureLoaded(), store().ensureLoaded()])
    expect(store().settingsLoaded).toBe(true)
    expect(store().settings.enabled).toBe(false)

    settingsChanged?.({ ...ENABLED, onFinish: 'review' })
    expect(store().settings).toEqual({ ...ENABLED, onFinish: 'review' })
  })

  it('setSettings stores what main answers', async () => {
    await store().setSettings({ discardAfterDays: 0 })
    expect(store().settings.discardAfterDays).toBe(0)
    expect(calls).toEqual(['setSettings'])
  })
})

describe('agentTasksStore — watching a note', () => {
  it('reads the blocks when the note is opened and indexes them by task id', async () => {
    disk.blocks = [block('aaaa1', 'running', { lastSignal: T0 })]
    await store().ensureLoaded()
    const stop = store().watch(DIR, 'n1')
    await settle()
    expect(store().byId.aaaa1?.meta.lastSignal).toBe(T0)
    expect(Object.keys(store().byDir)).toEqual(['plan-n1'])
    expect(store().pendingLoads).toBe(0)

    stop()
    expect(store().byId.aaaa1).toBeUndefined()
    expect(store().byDir).toEqual({})
  })

  it('is ref-counted: two editors of one note read once and keep the blocks until both are gone', async () => {
    disk.blocks = [block('aaaa1', 'done')]
    await store().ensureLoaded()
    const stopA = store().watch(DIR, 'n1')
    const stopB = store().watch(`${NOTES_DIR}/plan-n1/`, 'n1') // the same folder, spelled differently
    await settle()
    expect(calls.filter((c) => c.startsWith('read'))).toEqual(['read plan-n1'])
    stopA()
    stopA() // idempotent
    expect(store().byId.aaaa1).toBeDefined()
    stopB()
    expect(store().byId.aaaa1).toBeUndefined()
  })

  it('refreshes on agent-tasks:changed of a watched folder, and ignores the others', async () => {
    await store().ensureLoaded()
    store().watch(DIR, 'n1')
    await settle()
    disk.blocks = [block('aaaa1', 'waiting', { question: 'Which branch?' })]
    changed?.(`${NOTES_DIR}\\other-note`)
    await settle()
    expect(store().byId.aaaa1).toBeUndefined()
    changed?.(DIR)
    await settle()
    expect(store().byId.aaaa1?.meta.question).toBe('Which branch?')
  })

  it('the minute clock only runs while a watched block is running / waiting', async () => {
    vi.useFakeTimers()
    const t0 = Date.parse('2026-11-20T12:00:00.000Z')
    vi.setSystemTime(t0)
    disk.blocks = [block('aaaa1', 'done')]
    await store().ensureLoaded()
    const stop = store().watch(DIR, 'n1')
    await settle()
    expect(vi.getTimerCount()).toBe(0)

    disk.blocks = [block('aaaa1', 'running', { lastSignal: new Date(t0).toISOString() })]
    changed?.(DIR)
    await settle()
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(3 * 60_000)
    expect(store().now).toBe(t0 + 3 * 60_000)

    stop()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('agentTasksStore — maintenance', () => {
  const OLD = '2026-09-01T10:00:00.000Z'

  it('passes the ids the note still holds, and does nothing with the feature off', async () => {
    disk.blocks = [block('aaaa1', 'running')]
    disk.settings = { ...ENABLED, enabled: false }
    await store().ensureLoaded()
    const stop = store().watch(DIR, 'n1')
    await settle()
    expect(calls).toEqual(['read plan-n1'])
    stop()

    calls = []
    await store().setSettings({ enabled: true })
    store().watch(DIR, 'n1')
    await settle()
    expect(calls).toEqual(['setSettings', 'read plan-n1', 'maintain plan-n1 [aaaa1]'])
  })

  it('does nothing for a note without reports', async () => {
    await store().ensureLoaded()
    store().watch(DIR, 'n1')
    await settle()
    expect(calls).toEqual(['read plan-n1'])
  })

  it('discard by age: the marker leaves the line (saved) BEFORE the block is removed', async () => {
    useNotesStore.setState({ notes: [makeNote(`- [x] Old 📅2026-09-01 ${ROBOT}done1:done\n- [ ] Live ${ROBOT}aaaa1:running\n`)] })
    disk.blocks = [block('done1', 'done', { finishedAt: OLD }), block('aaaa1', 'running')]
    disk.discardable = ['done1']
    await store().ensureLoaded()
    store().watch(DIR, 'n1')
    await vi.waitFor(() => expect(calls).toContain('dismiss plan-n1 done1'))

    expect(sectionContent()).toBe(`- [x] Old 📅2026-09-01\n- [ ] Live ${ROBOT}aaaa1:running\n`)
    expect(calls.indexOf('writeNote')).toBeGreaterThan(-1)
    expect(calls.indexOf('writeNote')).toBeLessThan(calls.indexOf('dismiss plan-n1 done1'))
    expect(writes).toHaveLength(1)
  })

  it('a task reopened on its line keeps its report, whatever the block says', async () => {
    useNotesStore.setState({ notes: [makeNote(`- [ ] Again ${ROBOT}done1:queued\n`)] })
    disk.blocks = [block('done1', 'done', { finishedAt: OLD })]
    disk.discardable = ['done1']
    await store().ensureLoaded()
    store().watch(DIR, 'n1')
    await settle()
    await settle()
    expect(calls).toEqual(['read plan-n1', 'maintain plan-n1 [done1]'])
    expect(writes).toEqual([])
    expect(sectionContent()).toContain(`${ROBOT}done1:queued`)
  })

  it('never runs while the note has an edit waiting on its debounce', async () => {
    disk.blocks = [block('aaaa1', 'running')]
    const pending = createDebouncedSave()
    pending.schedule('n1', 60_000, () => undefined)
    try {
      await store().ensureLoaded()
      store().watch(DIR, 'n1')
      await settle()
      expect(calls).toEqual(['read plan-n1'])
    } finally {
      pending.cancel()
    }
  })

  it('cannot loop: the refresh its own write causes does not start another round', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-11-20T12:00:00.000Z'))
    disk.blocks = [block('aaaa1', 'done')]
    await store().ensureLoaded()
    store().watch(DIR, 'n1')
    await settle()
    expect(calls.filter((c) => c.startsWith('maintain'))).toHaveLength(1)

    // main says agent.md changed (our own maintenance wrote it), several times.
    for (let i = 0; i < 3; i++) {
      changed?.(DIR)
      await settle()
    }
    expect(calls.filter((c) => c.startsWith('read'))).toHaveLength(4)
    expect(calls.filter((c) => c.startsWith('maintain'))).toHaveLength(1)

    // Once the interval has passed, a change runs it again.
    vi.setSystemTime(Date.now() + AGENT_MAINTENANCE_INTERVAL_MS)
    changed?.(DIR)
    await settle()
    expect(calls.filter((c) => c.startsWith('maintain'))).toHaveLength(2)
  })
})

describe('agentTasksStore — dismissTask', () => {
  it('removes the report once the marker is gone from the note', async () => {
    useNotesStore.setState({ notes: [makeNote('- [ ] Task\n')] })
    await store().dismissTask('n1', 'aaaa1')
    expect(calls).toEqual(['dismiss plan-n1 aaaa1'])
  })

  it('keeps the report while a line of the note still carries the id', async () => {
    await store().dismissTask('n1', 'aaaa1') // the note of beforeEach still has the marker
    expect(calls).toEqual([])
  })

  it('does nothing for a note this window does not hold', async () => {
    await store().dismissTask('nope', 'aaaa1')
    expect(calls).toEqual([])
  })
})

describe('agentTasksStore — reconcileTask', () => {
  it('asks main to mirror the line once the note is written, for a task the note still holds', async () => {
    await store().reconcileTask('n1', 'aaaa1')
    expect(calls).toEqual(['reconcile plan-n1 aaaa1'])
  })

  it('does nothing for an id the note does not carry, nor for a note this window does not hold', async () => {
    await store().reconcileTask('n1', 'zzzz9')
    await store().reconcileTask('nope', 'aaaa1')
    expect(calls).toEqual([])
  })
})

describe('agentTasksStore — a write that finds the note locked by the CLI of an agent', () => {
  function busyOnce(name: 'agentTasksReconcile' | 'agentTasksDismiss') {
    let first = true
    const bridge = window.noteflow as unknown as Record<string, (...args: unknown[]) => unknown>
    const real = bridge[name]
    ;(window as unknown as { noteflow: unknown }).noteflow = new Proxy(bridge, {
      get: (target, prop: string) => (prop !== name ? target[prop] : (...args: unknown[]) => {
        if (!first) return real(...args)
        first = false
        calls.push(`${name} busy`)
        return Promise.resolve({ ok: false, busy: true, changed: false, removed: false })
      }),
    })
  }

  it('reconcile: tried once more a moment later — the block ends up mirroring its line', async () => {
    vi.useFakeTimers()
    busyOnce('agentTasksReconcile')
    const done = store().reconcileTask('n1', 'aaaa1')
    await vi.advanceTimersByTimeAsync(2000)
    await done
    expect(calls).toEqual(['agentTasksReconcile busy', 'reconcile plan-n1 aaaa1'])
  })

  it('dismiss: the same', async () => {
    vi.useFakeTimers()
    useNotesStore.setState({ notes: [makeNote('- [ ] Task\n')] })
    busyOnce('agentTasksDismiss')
    const done = store().dismissTask('n1', 'aaaa1')
    await vi.advanceTimersByTimeAsync(2000)
    await done
    expect(calls).toEqual(['agentTasksDismiss busy', 'dismiss plan-n1 aaaa1'])
  })
})
