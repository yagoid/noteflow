// First-run welcome note (electron/welcomeNote.ts): when it is created, and what
// it looks like on disk — local-only, in the UI language, with the platform's
// shortcut labels, readable by the renderer.
import { describe, it, expect } from 'vitest'
import {
  planWelcomeNote,
  isSyncConfigured,
  buildWelcomeNote,
  shortcutKeys,
} from '../../electron/welcomeNote'
import { serializeNoteFolder, NOTE_MD } from '../../electron/noteFormat'
import { isLocalOnlyNoteMd } from '../../electron/localOnlyNotes'
import { parseNoteFolder, extractTags } from '../../src/lib/noteUtils'

const NOW = '2026-11-14T10:00:00.000Z'

function counterIds() {
  let n = 0
  return (chars: number) => String(++n).padStart(chars, '0')
}

describe('planWelcomeNote', () => {
  const fresh = { alreadySeeded: false, settingsExisted: false, hasNotes: false, syncConfigured: false }

  it('creates only on a real first run (no settings.json, no notes, no sync)', () => {
    expect(planWelcomeNote(fresh)).toBe('create')
  })

  it('an existing install updating never gets it, even if its notes dir reads empty', () => {
    // settings.json exists but predates the key: a transient empty readdir at
    // Windows boot must not be mistaken for a first run.
    expect(planWelcomeNote({ ...fresh, settingsExisted: true })).toBe('mark-only')
  })

  it('records the decision without creating when there are notes or sync', () => {
    expect(planWelcomeNote({ ...fresh, hasNotes: true })).toBe('mark-only')
    expect(planWelcomeNote({ ...fresh, syncConfigured: true })).toBe('mark-only')
  })

  it('never again once decided (the user deleted it, or emptied the notes dir)', () => {
    expect(planWelcomeNote({ ...fresh, alreadySeeded: true })).toBe('skip')
    expect(planWelcomeNote({ alreadySeeded: true, settingsExisted: true, hasNotes: true, syncConfigured: true })).toBe('skip')
  })
})

describe('isSyncConfigured', () => {
  it('true only with an enabled GitHub Sync or NoteFlow Cloud', () => {
    expect(isSyncConfigured({})).toBe(false)
    expect(isSyncConfigured({ githubSync: { enabled: false } })).toBe(false)
    expect(isSyncConfigured({ cloudSync: null })).toBe(false)
    expect(isSyncConfigured({ githubSync: { enabled: true, owner: 'me', repo: 'notes' } })).toBe(true)
    expect(isSyncConfigured({ cloudSync: { enabled: true } })).toBe(true)
  })
})

describe('buildWelcomeNote', () => {
  it('is local-only, in markdown mode, with every section stamped with the note creation time', () => {
    const note = buildWelcomeNote('en', 'win32', NOW, counterIds())
    expect(note.localOnly).toBe(true)
    expect(note.title).toBe('Welcome to NoteFlow')
    expect(note.created).toBe(NOW)
    expect(note.updated).toBe(NOW)
    expect(note.sections.length).toBeGreaterThanOrEqual(5)
    for (const s of note.sections) {
      expect(s.created).toBe(NOW)
      expect(s.isRawMode).toBeUndefined()
      expect(s.content.trim()).not.toBe('')
    }
    expect(new Set(note.sections.map((s) => s.id)).size).toBe(note.sections.length)
    // Never tagged by accident: no `#word` in the text.
    for (const s of note.sections) expect(extractTags(s.content)).toEqual([])
  })

  it('follows the UI language, with the same structure in English and Spanish', () => {
    const en = buildWelcomeNote('en', 'win32', NOW, counterIds())
    const es = buildWelcomeNote('es', 'win32', NOW, counterIds())
    expect(es.title).toBe('Bienvenida a NoteFlow')
    expect(es.sections.map((s) => s.name)).not.toEqual(en.sections.map((s) => s.name))
    expect(es.sections.length).toBe(en.sections.length)
    expect(es.sections[0].content).toContain('nunca se sincroniza')
    expect(en.sections[0].content).toContain('never synced')
  })

  it('uses the platform shortcut labels', () => {
    expect(shortcutKeys('darwin')).toEqual({ mod: '⌘', shift: '⇧', control: '⌃' })
    expect(shortcutKeys('linux')).toEqual({ mod: 'Ctrl', shift: 'Shift', control: 'Ctrl' })
    const mac = buildWelcomeNote('en', 'darwin', NOW, counterIds()).sections.map((s) => s.content).join('\n')
    const win = buildWelcomeNote('en', 'win32', NOW, counterIds()).sections.map((s) => s.content).join('\n')
    expect(mac).toContain('**⌘+N**')
    expect(mac).toContain('**⌃+Tab**') // section cycling binds the literal Control on macOS
    expect(mac).not.toContain('Ctrl')
    expect(win).toContain('**Ctrl+N**')
    expect(win).not.toContain('⌘')
  })

  it('serializes to a local-only anchor the renderer reads back intact', () => {
    const note = buildWelcomeNote('es', 'linux', NOW, counterIds())
    const { files } = serializeNoteFolder(note, { preserveUpdated: true })
    expect(isLocalOnlyNoteMd(files[NOTE_MD])).toBe(true)
    const sectionFiles = Object.fromEntries(Object.entries(files).filter(([f]) => f !== NOTE_MD))
    const parsed = parseNoteFolder(files[NOTE_MD], sectionFiles, '/notes/bienvenida-a-noteflow-00000007')
    expect(parsed.localOnly).toBe(true)
    expect(parsed.updated).toBe(NOW)
    expect(parsed.sections.map((s) => s.content)).toEqual(note.sections.map((s) => s.content))
    expect(parsed.sections.every((s) => !s.isRawMode)).toBe(true)
  })
})
