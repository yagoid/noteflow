// Local-only notes (the first-run welcome note) through electron/cloudSync.ts:
// with NoteFlow Cloud enabled (initial pull still pending → every edit is
// JOURNALED for the drain), a local-only note never enters the journal — no
// upsert, no delete, no deleteDir — while an ordinary note does. Electron is
// mocked; no network is reached (the push gate is closed).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { serializeNoteFolder, type DiskNote } from '../../electron/noteFormat'

const env = { userData: '' }
vi.mock('electron', () => ({
  app: { getPath: () => env.userData, getVersion: () => '0.0.0', isPackaged: false },
  safeStorage: { isEncryptionAvailable: () => false, encryptString: () => Buffer.from(''), decryptString: () => '' },
  net: { isOnline: () => true, fetch: () => Promise.reject(new Error('offline in tests')) },
  powerMonitor: { on: () => {} },
}))

const T = '2026-11-14T10:00:00.000Z'
const WELCOME = 'welcome-to-noteflow-aaaa1111'
const NORMAL = 'normal-bbbb2222'

function files(id: string, localOnly: boolean): Record<string, string> {
  const note: DiskNote = {
    id, title: id, tags: [], created: T, updated: T,
    ...(localOnly ? { localOnly: true } : {}),
    sections: [{ id: 's1', name: 'Main', content: `body of ${id}` }],
  }
  return serializeNoteFolder(note, { preserveUpdated: true }).files
}

let tmp: string
let notesDir: string
let cloud: typeof import('../../electron/cloudSync')
let lo: typeof import('../../electron/localOnlyNotes')

function writeLocal(dir: string, f: Record<string, string>) {
  fs.mkdirSync(path.join(notesDir, dir), { recursive: true })
  for (const [name, c] of Object.entries(f)) fs.writeFileSync(path.join(notesDir, dir, name), c, 'utf-8')
}
const journalKeys = (): string[] => {
  try {
    return Object.keys(JSON.parse(fs.readFileSync(path.join(env.userData, 'cloud-sync-state.json'), 'utf-8')).ops ?? {})
  } catch {
    return []
  }
}

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-localonly-cloud-'))
  env.userData = path.join(tmp, 'userData')
  notesDir = path.join(tmp, 'notes')
  fs.mkdirSync(env.userData, { recursive: true })
  fs.mkdirSync(notesDir, { recursive: true })
  fs.writeFileSync(path.join(env.userData, 'settings.json'), JSON.stringify({ cloudSync: { enabled: true } }))
  writeLocal(WELCOME, files('aaaa1111', true))
  writeLocal(NORMAL, files('bbbb2222', false))
  vi.resetModules()
  cloud = await import('../../electron/cloudSync')
  lo = await import('../../electron/localOnlyNotes')
  cloud.initCloudSync(notesDir)
  lo.primeLocalOnlyDirs(notesDir)
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('NoteFlow Cloud never journals a local-only note', () => {
  it('debounced push: the ordinary note is journaled, the local-only one is not', () => {
    const done = vi.fn()
    for (const [f, c] of Object.entries(files('aaaa1111', true))) cloud.schedulePush(`${WELCOME}/${f}`, c, undefined, done)
    for (const [f, c] of Object.entries(files('bbbb2222', false))) cloud.schedulePush(`${NORMAL}/${f}`, c)
    expect(done).toHaveBeenCalledTimes(2)
    const keys = journalKeys()
    expect(keys).toEqual(expect.arrayContaining([`${NORMAL}/note.md`, `${NORMAL}/s1.md`]))
    expect(keys.filter((k) => k.includes(WELCOME))).toEqual([])
  })

  it('batch push (imports, chat tools) drops the local-only paths', async () => {
    const res = await cloud.pushPathsNow(notesDir, [`${WELCOME}/note.md`, `${WELCOME}/s1.md`, `${NORMAL}/note.md`])
    expect(res).toEqual({ pushed: 0, errors: [] })
    const keys = journalKeys()
    expect(keys).toContain(`${NORMAL}/note.md`)
    expect(keys.filter((k) => k.includes(WELCOME))).toEqual([])
  })

  it('deleting a section of it, or the whole (already removed) note, records nothing', async () => {
    await cloud.scheduleDelete(`${WELCOME}/s1.md`)
    fs.rmSync(path.join(notesDir, WELCOME), { recursive: true, force: true })
    await cloud.scheduleDeleteDir(WELCOME)
    expect(journalKeys().filter((k) => k.includes(WELCOME))).toEqual([])
  })
})
