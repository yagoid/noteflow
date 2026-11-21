// What main does with a note folder's agent.md (electron/agentTasksFile.ts):
// the write that every `agent-tasks:*` handler ends in, the handlers' logic
// and the purge of an encrypted note's file — against an in-memory folder that
// records what reaches the disk, the sync and the windows, in order.
import { describe, it, expect } from 'vitest'
import {
  agentDesktopSessionUrl,
  agentLineStates,
  agentSessionLink,
  dismissAgentTask,
  isNoteDirEncrypted,
  maintainAgentTasks,
  noteMdLooksEncrypted,
  planAgentSettingsUpdate,
  purgeAgentFileIfEncrypted,
  readAgentTasks,
  reconcileAgentBlock,
  takenAgentIds,
  writeAgentFile,
  type AgentNoteDeps,
} from '../../electron/agentTasksFile'
import { AGENT_ORPHAN_TTL_MS, parseAgentDoc, serializeAgentDoc, type AgentBlock } from '../../electron/agentTasks'

const ROBOT = '\u{1F916}'
const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-11-20T12:00:00.000Z')

const PLAIN_NOTE_MD = '---\nid: n1\ntitle: Note\nupdated: 2026-11-20T10:00:00.000Z\nsections:\n  - tasks.md\n---\n'
const ENCRYPTED_NOTE_MD = '---\nid: n1\ntitle: Note\nencryption:\n  salt: abc\n  iv: def\n---\n'

interface FakeNote {
  noteMd: string | null
  sections: string[]
  agent: string | null
}

function block(id: string, meta: Record<string, string> = {}, body = ''): AgentBlock {
  return { id, meta: { title: `Task ${id}`, state: 'done', ...meta }, body }
}

function fakeFolder(notes: Record<string, Partial<FakeNote>>) {
  const store: Record<string, FakeNote> = {}
  for (const [dir, n] of Object.entries(notes)) {
    store[dir] = { noteMd: PLAIN_NOTE_MD, sections: [], agent: null, ...n }
  }
  const log: string[] = []
  const deps: AgentNoteDeps = {
    readAgentText: (dir) => store[dir]?.agent ?? null,
    writeAgentText: (dir, content) => { log.push(`write ${dir}`); store[dir].agent = content },
    removeAgentFile: (dir) => { log.push(`remove ${dir}`); store[dir].agent = null },
    markInternalWrite: (rel) => { log.push(`mark ${rel}`) },
    pushFile: (rel, content) => { log.push(`push ${rel} ${content.length}`) },
    pushDelete: (rel) => { log.push(`delete ${rel}`) },
    notifyChanged: (dir) => { log.push(`changed ${dir}`) },
    readNoteMd: (dir) => store[dir]?.noteMd ?? null,
    readNote: (dir) => {
      const n = store[dir]
      if (!n || n.noteMd === null) return null
      const encrypted = noteMdLooksEncrypted(n.noteMd)
      return { sections: encrypted ? [] : n.sections.map((content) => ({ content })), encrypted }
    },
    listNoteDirs: () => Object.keys(store),
  }
  return { store, log, deps }
}

describe('noteMdLooksEncrypted', () => {
  it('is true only for a top-level encryption key of the frontmatter', () => {
    expect(noteMdLooksEncrypted(ENCRYPTED_NOTE_MD)).toBe(true)
    expect(noteMdLooksEncrypted(ENCRYPTED_NOTE_MD.replace(/\n/g, '\r\n'))).toBe(true)
    expect(noteMdLooksEncrypted(PLAIN_NOTE_MD)).toBe(false)
  })

  it('ignores the word anywhere else', () => {
    // An indented key (a value of another key), a title that mentions it, the body.
    expect(noteMdLooksEncrypted('---\nid: n1\nmeta:\n  encryption: no\n---\n')).toBe(false)
    expect(noteMdLooksEncrypted('---\nid: n1\ntitle: "encryption: notes"\n---\n')).toBe(false)
    expect(noteMdLooksEncrypted(`${PLAIN_NOTE_MD}encryption: this is body text\n`)).toBe(false)
    expect(noteMdLooksEncrypted('')).toBe(false)
    expect(noteMdLooksEncrypted('no frontmatter at all\nencryption: x\n')).toBe(false)
  })

  it('isNoteDirEncrypted reads the note.md of the folder (unreadable = not encrypted)', () => {
    const { deps } = fakeFolder({ plain: {}, locked: { noteMd: ENCRYPTED_NOTE_MD }, broken: { noteMd: null } })
    expect(isNoteDirEncrypted(deps, 'plain')).toBe(false)
    expect(isNoteDirEncrypted(deps, 'locked')).toBe(true)
    expect(isNoteDirEncrypted(deps, 'broken')).toBe(false)
    expect(isNoteDirEncrypted(deps, 'missing')).toBe(false)
  })
})

describe('writeAgentFile', () => {
  it('writes the canonical text, marks the write BEFORE the disk changes and pushes it', () => {
    const { store, log, deps } = fakeFolder({ note: {} })
    const blocks = [block('aaaa1', {}, 'Report')]
    expect(writeAgentFile(deps, 'note', blocks)).toBe(true)
    expect(store.note.agent).toBe(serializeAgentDoc(blocks))
    expect(log).toEqual([
      'mark note/agent.md',
      'write note',
      `push note/agent.md ${serializeAgentDoc(blocks).length}`,
      'changed note',
    ])
  })

  it('does nothing when the disk already holds exactly that', () => {
    const blocks = [block('aaaa1')]
    const { log, deps } = fakeFolder({ note: { agent: serializeAgentDoc(blocks) } })
    expect(writeAgentFile(deps, 'note', blocks)).toBe(false)
    expect(log).toEqual([])
  })

  it('rewrites a file that only differs in form (CRLF, text outside the blocks)', () => {
    const blocks = [block('aaaa1')]
    const messy = `stray text\r\n${serializeAgentDoc(blocks).replace(/\n/g, '\r\n')}`
    const { store, log, deps } = fakeFolder({ note: { agent: messy } })
    expect(writeAgentFile(deps, 'note', parseAgentDoc(messy))).toBe(true)
    expect(store.note.agent).toBe(serializeAgentDoc(blocks))
    expect(log[0]).toBe('mark note/agent.md')
  })

  it('removes the file with its last block and deletes it on the remote', () => {
    const { store, log, deps } = fakeFolder({ note: { agent: serializeAgentDoc([block('aaaa1')]) } })
    expect(writeAgentFile(deps, 'note', [])).toBe(true)
    expect(store.note.agent).toBeNull()
    expect(log).toEqual(['mark note/agent.md', 'remove note', 'delete note/agent.md', 'changed note'])
  })

  it('no file and no blocks: nothing to do', () => {
    const { log, deps } = fakeFolder({ note: {} })
    expect(writeAgentFile(deps, 'note', [])).toBe(false)
    expect(log).toEqual([])
  })
})

describe('purgeAgentFileIfEncrypted', () => {
  const agent = serializeAgentDoc([block('aaaa1', {}, 'Secret report')])

  it('removes the agent.md of a note whose note.md (just written) is encrypted', () => {
    // The disk still says "plain": the note.md handed in rules.
    const { store, log, deps } = fakeFolder({ note: { agent } })
    expect(purgeAgentFileIfEncrypted(deps, 'note', ENCRYPTED_NOTE_MD)).toBe(true)
    expect(store.note.agent).toBeNull()
    expect(log).toContain('delete note/agent.md')
  })

  it('without a note.md handed in, the one on disk decides', () => {
    const locked = fakeFolder({ note: { agent, noteMd: ENCRYPTED_NOTE_MD } })
    expect(purgeAgentFileIfEncrypted(locked.deps, 'note')).toBe(true)
    expect(locked.store.note.agent).toBeNull()

    const plain = fakeFolder({ note: { agent } })
    expect(purgeAgentFileIfEncrypted(plain.deps, 'note')).toBe(false)
    expect(plain.store.note.agent).toBe(agent)
    expect(plain.log).toEqual([])
  })

  it('keeps the file of a note that is not encrypted, and does nothing without a file', () => {
    const plain = fakeFolder({ note: { agent } })
    expect(purgeAgentFileIfEncrypted(plain.deps, 'note', PLAIN_NOTE_MD)).toBe(false)
    expect(plain.store.note.agent).toBe(agent)

    const none = fakeFolder({ note: { noteMd: ENCRYPTED_NOTE_MD } })
    expect(purgeAgentFileIfEncrypted(none.deps, 'note', ENCRYPTED_NOTE_MD)).toBe(false)
    expect(none.log).toEqual([])
  })
})

describe('readAgentTasks', () => {
  const old = new Date(NOW - 40 * DAY).toISOString()
  const recent = new Date(NOW - 2 * DAY).toISOString()
  const agent = serializeAgentDoc([
    block('old01', { finishedAt: old }),
    block('new01', { finishedAt: recent }),
    block('run01', { state: 'running', lastSignal: old }),
  ])

  it('returns the blocks and the finished ones older than the term', () => {
    const { log, deps } = fakeFolder({ note: { agent } })
    const res = readAgentTasks(deps, 'note', 30, NOW)
    expect(res.blocks.map((b) => b.id)).toEqual(['old01', 'new01', 'run01'])
    expect(res.discardable).toEqual(['old01'])
    expect(log).toEqual([]) // a read never writes
  })

  it('0 days = nothing is ever discardable', () => {
    const { deps } = fakeFolder({ note: { agent } })
    expect(readAgentTasks(deps, 'note', 0, NOW).discardable).toEqual([])
  })

  it('is empty without a file and for an encrypted note', () => {
    expect(readAgentTasks(fakeFolder({ note: {} }).deps, 'note', 30, NOW)).toEqual({ blocks: [], discardable: [] })
    const locked = fakeFolder({ note: { agent, noteMd: ENCRYPTED_NOTE_MD } })
    expect(readAgentTasks(locked.deps, 'note', 30, NOW)).toEqual({ blocks: [], discardable: [] })
  })
})

describe('readAgentTasks — the line rules over the block', () => {
  const old = new Date(NOW - 40 * DAY).toISOString()

  it('a task closed from the app (line done, block still review) is discardable', () => {
    const { deps } = fakeFolder({
      note: {
        sections: [`- [x] Reviewed ${ROBOT}revw1:done\n- [ ] Still open ${ROBOT}open1:review\n`],
        agent: serializeAgentDoc([
          block('revw1', { state: 'review', lastSignal: old }),
          block('open1', { state: 'review', lastSignal: old }),
        ]),
      },
    })
    expect(readAgentTasks(deps, 'note', 30, NOW).discardable).toEqual(['revw1'])
  })

  it('a task reopened on its line (block done) is not', () => {
    const { deps } = fakeFolder({
      note: {
        sections: [`- [ ] Again ${ROBOT}done1:queued\r\n`],
        agent: serializeAgentDoc([block('done1', { state: 'done', finishedAt: old })]),
      },
    })
    expect(readAgentTasks(deps, 'note', 30, NOW).discardable).toEqual([])
  })

  it('without a line for the id, the block state decides (as before)', () => {
    const { deps } = fakeFolder({
      note: { sections: ['no tasks'], agent: serializeAgentDoc([block('done1', { finishedAt: old }), block('revw1', { state: 'review', lastSignal: old })]) },
    })
    expect(readAgentTasks(deps, 'note', 30, NOW).discardable).toEqual(['done1'])
  })

  it('agentLineStates: strict task lines only; an id on two lines keeps the state that is not finished', () => {
    const states = agentLineStates([
      { content: `- [x] A ${ROBOT}dupe1:done\n\`\`\`\n- [ ] code ${ROBOT}code1:done\n\`\`\`\n- bullet ${ROBOT}bull1:done` },
      { content: `- [ ] A again ${ROBOT}dupe1:running` },
      { content: null },
    ])
    expect([...states]).toEqual([['dupe1', 'running']])
    expect(agentLineStates(undefined).size).toBe(0)
  })
})

describe('reconcileAgentBlock', () => {
  const started = '2026-11-20T10:00:00.000Z'

  it('gives the block the state of its line and stamps finishedAt when it becomes done', () => {
    const { store, log, deps } = fakeFolder({
      note: {
        sections: [`- [x] Reviewed ${ROBOT}revw1:done\n`],
        agent: serializeAgentDoc([block('revw1', { state: 'review', startedAt: started }, 'Report'), block('other', { state: 'running' })]),
      },
    })
    expect(reconcileAgentBlock(deps, 'note', 'revw1', NOW)).toEqual({ changed: true })
    const [revw, other] = parseAgentDoc(store.note.agent ?? '')
    expect(revw.meta).toMatchObject({ state: 'done', finishedAt: new Date(NOW).toISOString(), startedAt: started })
    expect(revw.body).toBe('Report')
    expect(other.meta.state).toBe('running') // nothing else is touched
    expect(log).toContain('changed note')
  })

  it('keeps a finishedAt the agent already wrote', () => {
    const finished = '2026-11-20T11:00:00.000Z'
    const { store, deps } = fakeFolder({
      note: { sections: [`- [x] T ${ROBOT}revw1:done`], agent: serializeAgentDoc([block('revw1', { state: 'review', finishedAt: finished })]) },
    })
    reconcileAgentBlock(deps, 'note', 'revw1', NOW)
    expect(parseAgentDoc(store.note.agent ?? '')[0].meta.finishedAt).toBe(finished)
  })

  it('back to the queue: the state follows, the facts of the last run stay', () => {
    const { store, deps } = fakeFolder({
      note: {
        sections: [`- [ ] T ${ROBOT}fail1:queued`],
        agent: serializeAgentDoc([block('fail1', { state: 'failed', finishedAt: started, failReason: 'Tests red' })]),
      },
    })
    expect(reconcileAgentBlock(deps, 'note', 'fail1', NOW)).toEqual({ changed: true })
    expect(parseAgentDoc(store.note.agent ?? '')[0].meta).toMatchObject({ state: 'queued', finishedAt: started, failReason: 'Tests red' })
  })

  it('the state is read from the line on disk, never taken from the caller: no line, no change', () => {
    const agent = serializeAgentDoc([block('revw1', { state: 'review' })])
    for (const note of [
      { sections: ['the line is not saved yet'], agent },
      { sections: [`- [ ] T ${ROBOT}revw1:review`], agent }, // already agree
      { sections: [`- [x] T ${ROBOT}zzzz9:done`], agent }, // another task
      { sections: [`- [x] T ${ROBOT}revw1:done`] }, // no agent.md
      { sections: [`- [x] T ${ROBOT}revw1:done`], agent, noteMd: ENCRYPTED_NOTE_MD },
      { sections: [`- [x] T ${ROBOT}revw1:done`], agent, noteMd: null },
    ]) {
      const { log, deps } = fakeFolder({ note })
      expect(reconcileAgentBlock(deps, 'note', 'revw1', NOW)).toEqual({ changed: false })
      expect(log).toEqual([])
    }
  })

  it('refuses anything that is not a task id', () => {
    const { deps } = fakeFolder({ note: {} })
    for (const bad of ['', 'REVW1', '../x', null, 7]) expect(() => reconcileAgentBlock(deps, 'note', bad, NOW)).toThrow('Invalid task id')
  })
})

describe('dismissAgentTask', () => {
  it('removes one block and keeps the rest', () => {
    const { store, log, deps } = fakeFolder({ note: { agent: serializeAgentDoc([block('aaaa1'), block('bbbb2')]) } })
    expect(dismissAgentTask(deps, 'note', 'aaaa1')).toEqual({ removed: true })
    expect(parseAgentDoc(store.note.agent ?? '').map((b) => b.id)).toEqual(['bbbb2'])
    expect(log).toContain('changed note')
  })

  it('removes the file with the last block', () => {
    const { store, log, deps } = fakeFolder({ note: { agent: serializeAgentDoc([block('aaaa1')]) } })
    expect(dismissAgentTask(deps, 'note', 'aaaa1')).toEqual({ removed: true })
    expect(store.note.agent).toBeNull()
    expect(log).toContain('delete note/agent.md')
  })

  it('an id without a block (or no file) changes nothing', () => {
    const withFile = fakeFolder({ note: { agent: serializeAgentDoc([block('aaaa1')]) } })
    expect(dismissAgentTask(withFile.deps, 'note', 'zzzz9')).toEqual({ removed: false })
    expect(withFile.log).toEqual([])
    const noFile = fakeFolder({ note: {} })
    expect(dismissAgentTask(noFile.deps, 'note', 'aaaa1')).toEqual({ removed: false })
    expect(noFile.log).toEqual([])
  })

  it('refuses anything that is not a task id', () => {
    const { log, deps } = fakeFolder({ note: { agent: serializeAgentDoc([block('aaaa1')]) } })
    for (const bad of ['', 'AAAA1', 'aaaa', '../x', null, 5, undefined]) {
      expect(() => dismissAgentTask(deps, 'note', bad)).toThrow('Invalid task id')
    }
    expect(log).toEqual([])
  })
})

describe('maintainAgentTasks', () => {
  it('stamps a block whose id no section mentions, and leaves the live ones alone', () => {
    const { store, deps } = fakeFolder({
      note: {
        sections: [`- [ ] Still here ${ROBOT}aaaa1:queued\n`],
        agent: serializeAgentDoc([block('aaaa1'), block('gone1')]),
      },
    })
    const res = maintainAgentTasks(deps, 'note', undefined, NOW)
    expect(res.changed).toBe(true)
    const byId = Object.fromEntries(parseAgentDoc(store.note.agent ?? '').map((b) => [b.id, b]))
    expect(byId.aaaa1.meta.orphanedAt).toBeUndefined()
    expect(byId.gone1.meta.orphanedAt).toBe(new Date(NOW).toISOString())
  })

  it('never orphans an id the caller still holds in memory', () => {
    const { log, deps } = fakeFolder({ note: { agent: serializeAgentDoc([block('unsav')]) } })
    const res = maintainAgentTasks(deps, 'note', ['unsav', 42, 'not an id'], NOW)
    expect(res.changed).toBe(false)
    expect(res.blocks[0].meta.orphanedAt).toBeUndefined()
    expect(log).toEqual([])
  })

  it('a second pass right after changes nothing (no loop through agent-tasks:changed)', () => {
    const { log, deps } = fakeFolder({ note: { agent: serializeAgentDoc([block('gone1')]) } })
    expect(maintainAgentTasks(deps, 'note', [], NOW).changed).toBe(true)
    const writes = log.length
    expect(maintainAgentTasks(deps, 'note', [], NOW + 60_000).changed).toBe(false)
    expect(log.length).toBe(writes)
  })

  it('drops an orphan a week later (and the file with the last one)', () => {
    const stamped = block('gone1', { orphanedAt: new Date(NOW - AGENT_ORPHAN_TTL_MS).toISOString() })
    const { store, log, deps } = fakeFolder({ note: { agent: serializeAgentDoc([stamped]) } })
    const res = maintainAgentTasks(deps, 'note', [], NOW)
    expect(res).toEqual({ changed: true, blocks: [] })
    expect(store.note.agent).toBeNull()
    expect(log).toContain('delete note/agent.md')
  })

  it('takes the stamp off an id that came back', () => {
    const stamped = block('aaaa1', { orphanedAt: new Date(NOW - DAY).toISOString() })
    const { store, deps } = fakeFolder({
      note: { sections: [`- [ ] Back ${ROBOT}aaaa1:queued`], agent: serializeAgentDoc([stamped]) },
    })
    expect(maintainAgentTasks(deps, 'note', [], NOW).changed).toBe(true)
    expect(parseAgentDoc(store.note.agent ?? '')[0].meta.orphanedAt).toBeUndefined()
  })

  it('rewrites a file that carries the marks of a sync merge', () => {
    const merged = '<!-- task:aaaa1 -->\ntitle: A\n> ⚠️ Sync conflict — version from the merging device:\n\nprogress: one\n\n> ⚠️ Already synced version:\n\nprogress: two\n\n> ⚠️ End of sync conflict\n---\n<!-- /task:aaaa1 -->\n'
    const { store, deps } = fakeFolder({ note: { sections: [`- [ ] A ${ROBOT}aaaa1:running`], agent: merged } })
    expect(maintainAgentTasks(deps, 'note', [], NOW).changed).toBe(true)
    expect(store.note.agent).not.toMatch(/⚠/u)
    expect(parseAgentDoc(store.note.agent ?? '')[0].meta.progress).toBe('two')
  })

  it('does nothing without a file, for an unreadable note or an encrypted one', () => {
    const agent = serializeAgentDoc([block('gone1')])
    for (const note of [{}, { agent, noteMd: null }, { agent, noteMd: ENCRYPTED_NOTE_MD }]) {
      const { log, deps } = fakeFolder({ note })
      expect(maintainAgentTasks(deps, 'note', [], NOW)).toEqual({ changed: false, blocks: [] })
      expect(log).toEqual([])
    }
  })
})

describe('agentSessionLink (agent-tasks:open-session)', () => {
  const SESSION = 'local_3c827525-171f-463a-92a7-3e8615c8987e'
  const HOST = 'DESKTOP-ABC'
  const folder = (meta: Record<string, string>, noteMd = PLAIN_NOTE_MD) =>
    fakeFolder({ n: { noteMd, agent: serializeAgentDoc([block('k3f9a', { state: 'waiting', machine: HOST, ...meta })]) } }).deps

  it('builds the claude:// link itself from the block on disk — for a task started on this machine', () => {
    expect(agentSessionLink(folder({ desktopSession: SESSION }), 'n', 'k3f9a', HOST))
      .toEqual({ ok: true, url: `claude://code/continue?session=${SESSION}` })
    // Hostnames ignore case.
    expect(agentSessionLink(folder({ desktopSession: SESSION }), 'n', 'k3f9a', 'desktop-abc').ok).toBe(true)
    expect(agentDesktopSessionUrl(SESSION)).toBe(`claude://code/continue?session=${SESSION}`)
  })

  it('no session: none in the block, another machine, no machine, another task, no file, an encrypted note', () => {
    const none = { ok: false, code: 'no_session' }
    expect(agentSessionLink(folder({}), 'n', 'k3f9a', HOST)).toEqual(none)
    expect(agentSessionLink(folder({ desktopSession: SESSION }), 'n', 'k3f9a', 'LAPTOP')).toEqual(none)
    expect(agentSessionLink(folder({ desktopSession: SESSION, machine: '' }), 'n', 'k3f9a', '')).toEqual(none)
    expect(agentSessionLink(folder({ desktopSession: SESSION }), 'n', 'zzzzz', HOST)).toEqual(none)
    expect(agentSessionLink(fakeFolder({ n: {} }).deps, 'n', 'k3f9a', HOST)).toEqual(none)
    expect(agentSessionLink(folder({ desktopSession: SESSION }, ENCRYPTED_NOTE_MD), 'n', 'k3f9a', HOST)).toEqual(none)
  })

  it('agent.md is outside input: an id that is not a Claude Desktop session never becomes a link', () => {
    for (const bad of [
      'last', 'local_', `local_${'a'.repeat(65)}`, 'local_x&folder=C:\\', 'local_x y', 'local_x/../y', 'local_x?q=1',
      'https://evil.example', 'remote_abc', 'LOCAL_abc', 'local_%41',
    ]) {
      expect(agentSessionLink(folder({ desktopSession: bad }), 'n', 'k3f9a', HOST), JSON.stringify(bad)).toEqual({ ok: false, code: 'no_session' })
      expect(() => agentDesktopSessionUrl(bad)).toThrow()
    }
    expect(() => agentDesktopSessionUrl('local_abc\n')).toThrow()
  })

  it('refuses anything that is not a task id', () => {
    for (const bad of [undefined, 7, '../x', 'K3F9A', 'k3f9ab']) expect(() => agentSessionLink(folder({ desktopSession: SESSION }), 'n', bad, HOST)).toThrow()
  })
})

describe('takenAgentIds', () => {
  it('gathers the markers and the blocks of every note, plus the ids handed in', () => {
    const { deps } = fakeFolder({
      one: { sections: [`- [ ] A ${ROBOT}line1:queued\n- [ ] B`, `> quoted ${ROBOT}quote:done`] },
      two: { agent: serializeAgentDoc([block('blok1')]) },
      locked: { noteMd: ENCRYPTED_NOTE_MD, sections: [`- [ ] hidden ${ROBOT}hide1:queued`] },
      broken: { noteMd: null, agent: serializeAgentDoc([block('blok2')]) },
    })
    const taken = takenAgentIds(deps, ['unsav', 7, null])
    expect([...taken].sort()).toEqual(['blok1', 'blok2', 'line1', 'quote', 'unsav'])
  })

  it('tolerates a missing list', () => {
    expect(takenAgentIds(fakeFolder({}).deps, undefined).size).toBe(0)
  })
})

describe('planAgentSettingsUpdate', () => {
  it('applies a partial patch, sanitizes it and keeps the keys it does not know', () => {
    const plan = planAgentSettingsUpdate({ onFinish: 'review', future: 1 }, { enabled: true, discardAfterDays: 0 })
    expect(plan.changed).toBe(true)
    expect(plan.settings).toEqual({ enabled: true, onFinish: 'review', staleMinutes: 90, discardAfterDays: 0, launch: 'terminal', agent: 'claude', agentCommand: '', agentUrl: '', batchMode: 'sequential', models: {}, efforts: {} })
    expect(plan.next.future).toBe(1)
  })

  it('reports no change when the stored object already says that', () => {
    const first = planAgentSettingsUpdate(undefined, { enabled: true })
    expect(first.changed).toBe(true)
    expect(planAgentSettingsUpdate(first.next, { enabled: true }).changed).toBe(false)
  })

  it('ignores junk', () => {
    const plan = planAgentSettingsUpdate(undefined, { enabled: 'yes', onFinish: 'explode', discardAfterDays: -3, other: 1 })
    expect(plan.settings).toEqual({ enabled: false, onFinish: 'check', staleMinutes: 90, discardAfterDays: 30, launch: 'terminal', agent: 'claude', agentCommand: '', agentUrl: '', batchMode: 'sequential', models: {}, efforts: {} })
    expect(plan.next.other).toBeUndefined()
  })
})
