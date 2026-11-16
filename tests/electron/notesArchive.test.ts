// electron/notesArchive.ts — "use only the remote's notes" moves the synced
// notes out of the notes dir into a local archive, never deleting anything:
// rename, the cross-volume path (EXDEV → copy + verify + remove), a failure
// half way (everything undone), metadata kept for local-only / linked notes.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { serializeNoteFolder, type DiskNote } from '../../electron/noteFormat'
import {
  archiveSyncedNotes,
  filterMetadataForKept,
  listArchives,
  hasArchives,
  archiveFolderName,
  NotesArchiveError,
  type ArchiveFsOps,
} from '../../electron/notesArchive'
import { resetLocalOnlyMemory } from '../../electron/localOnlyNotes'

let tmp: string
let notesDir: string
let archiveRoot: string
const NOW = new Date('2026-11-16T10:20:30.000Z')

function writeNote(dir: string, note: Partial<DiskNote> & { id: string }) {
  const full: DiskNote = {
    title: note.id,
    tags: [],
    created: '2026-10-01T10:00:00.000Z',
    updated: '2026-10-01T10:00:00.000Z',
    sections: [{ id: 's1', name: 'Main', content: `body of ${note.id}` }],
    ...note,
  }
  fs.mkdirSync(path.join(notesDir, dir), { recursive: true })
  for (const [f, c] of Object.entries(serializeNoteFolder(full, { preserveUpdated: true }).files)) {
    fs.writeFileSync(path.join(notesDir, dir, f), c, 'utf-8')
  }
}
const writeRoot = (file: string, data: unknown) => fs.writeFileSync(path.join(notesDir, file), JSON.stringify(data, null, 2), 'utf-8')
const readJson = (file: string) => JSON.parse(fs.readFileSync(file, 'utf-8'))

/** Every file under `root` (relative path → content), to compare whole trees. */
function snapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (abs: string, rel: string) => {
    for (const name of fs.readdirSync(abs)) {
      const p = path.join(abs, name)
      const r = rel ? `${rel}/${name}` : name
      if (fs.statSync(p).isDirectory()) walk(p, r)
      else out[r] = fs.readFileSync(p, 'utf-8')
    }
  }
  walk(root, '')
  return out
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-archive-'))
  notesDir = path.join(tmp, 'notes')
  archiveRoot = path.join(tmp, 'userData', 'notes-archive')
  fs.mkdirSync(notesDir, { recursive: true })
  resetLocalOnlyMemory()
})
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe('archiveSyncedNotes', () => {
  it('moves the synced notes and their metadata, keeps local-only notes, copies ui-settings', () => {
    writeNote('alpha-aaaa1111', { id: 'aaaa1111' })
    writeNote('beta-bbbb2222', { id: 'bbbb2222' })
    writeNote('welcome-cccc3333', { id: 'cccc3333', localOnly: true })
    writeRoot('templates.json', [{ id: 't1', name: 'T' }])
    writeRoot('ui-settings.json', { theme: 'carbon' })
    fs.writeFileSync(path.join(notesDir, '.noteflow-format'), '2\n')
    const before = snapshot(notesDir)

    const res = archiveSyncedNotes({ notesDir, archiveRoot, label: 'github-me-notes-a', origin: { kind: 'github', owner: 'me', repo: 'notes-a' }, now: NOW })

    expect(path.basename(res.archiveDir)).toBe(archiveFolderName('github-me-notes-a', NOW))
    expect(path.basename(res.archiveDir)).toBe('github-me-notes-a-2026-11-16T10-20-30.000Z')
    expect(res.movedDirs.sort()).toEqual(['alpha-aaaa1111', 'beta-bbbb2222'])
    expect(res.movedNoteIds.sort()).toEqual(['aaaa1111', 'bbbb2222'])
    expect(res.movedFiles).toEqual(['templates.json'])
    expect(res.copiedFiles).toEqual(['ui-settings.json'])
    // Left in the notes dir: the local-only note, the device appearance, the marker.
    expect(fs.readdirSync(notesDir).sort()).toEqual(['.noteflow-format', 'ui-settings.json', 'welcome-cccc3333'])
    // Nothing lost: every moved file is in the archive, byte for byte.
    const archived = snapshot(path.join(res.archiveDir, 'notes'))
    for (const [rel, content] of Object.entries(before)) {
      if (rel.startsWith('welcome-') || rel === '.noteflow-format') continue
      expect(archived[rel]).toBe(content)
    }
    const manifest = readJson(path.join(res.archiveDir, 'manifest.json'))
    expect(manifest).toMatchObject({
      version: 1,
      label: 'github-me-notes-a',
      origin: { kind: 'github', owner: 'me', repo: 'notes-a' },
      notesDir,
      movedFiles: ['templates.json'],
      copiedFiles: ['ui-settings.json'],
      filteredFiles: [],
    })
    expect(listArchives(archiveRoot).map((a) => a.name)).toEqual([path.basename(res.archiveDir)])
    expect(hasArchives(archiveRoot)).toBe(true)
  })

  it('leaves a filtered copy of groups/folders/order/colours for the notes that stay (local-only + linked)', () => {
    writeNote('alpha-aaaa1111', { id: 'aaaa1111', group: 'g-a', sections: [{ id: 's1', name: 'Work', content: 'x' }] })
    writeNote('welcome-cccc3333', { id: 'cccc3333', localOnly: true, group: 'g-w', folder: 'f-w', sections: [{ id: 's1', name: 'Tips', content: 'y' }] })
    writeRoot('groups.json', [{ id: 'g-a', name: 'A' }, { id: 'g-w', name: 'W' }, { id: 'g-l', name: 'Linked' }, { id: 'g-f', name: 'Of linked folder' }])
    writeRoot('folders.json', [{ id: 'f-w', name: 'FW', groupId: 'g-w' }, { id: 'f-l', name: 'FL', groupId: 'g-f' }, { id: 'f-x', name: 'FX', groupId: 'g-a' }])
    writeRoot('note-order.json', { ungrouped: ['aaaa1111', 'cccc3333'], 'group:g-a': ['aaaa1111'] })
    writeRoot('section-colors.json', { work: '--accent', tips: '#ff0000' })
    const originals = Object.fromEntries(['groups.json', 'folders.json', 'note-order.json', 'section-colors.json'].map((f) => [f, fs.readFileSync(path.join(notesDir, f), 'utf-8')]))

    const res = archiveSyncedNotes({ notesDir, archiveRoot, label: 'github-x', now: NOW, keep: { groupIds: ['g-l'], folderIds: ['f-l'] } })

    expect(res.filteredFiles.sort()).toEqual(['folders.json', 'groups.json', 'note-order.json', 'section-colors.json'])
    // The originals are archived complete…
    for (const [f, content] of Object.entries(originals)) {
      expect(fs.readFileSync(path.join(res.archiveDir, 'notes', f), 'utf-8')).toBe(content)
    }
    // …and only what the remaining notes use is left behind.
    expect(readJson(path.join(notesDir, 'groups.json')).map((g: { id: string }) => g.id)).toEqual(['g-w', 'g-l', 'g-f'])
    expect(readJson(path.join(notesDir, 'folders.json')).map((f: { id: string }) => f.id)).toEqual(['f-w', 'f-l'])
    expect(readJson(path.join(notesDir, 'note-order.json'))).toEqual({ ungrouped: ['cccc3333'] })
    expect(readJson(path.join(notesDir, 'section-colors.json'))).toEqual({ tips: '#ff0000' })
  })

  it('an empty notes dir (or only local-only notes) archives nothing but still writes a manifest', () => {
    writeNote('welcome-cccc3333', { id: 'cccc3333', localOnly: true })
    const res = archiveSyncedNotes({ notesDir, archiveRoot, label: 'github-x', now: NOW })
    expect(res.movedDirs).toEqual([])
    expect(fs.existsSync(path.join(notesDir, 'welcome-cccc3333', 'note.md'))).toBe(true)
  })

  it('across volumes (EXDEV): copies, verifies, then removes the source', () => {
    writeNote('alpha-aaaa1111', { id: 'aaaa1111' })
    writeRoot('groups.json', [{ id: 'g1', name: 'G' }])
    const before = snapshot(notesDir)
    const exdev: Partial<ArchiveFsOps> = {
      rename: () => { throw Object.assign(new Error('cross-device link'), { code: 'EXDEV' }) },
    }
    const res = archiveSyncedNotes({ notesDir, archiveRoot, label: 'github-x', now: NOW, fsOps: exdev })
    expect(fs.readdirSync(notesDir)).toEqual([])
    expect(snapshot(path.join(res.archiveDir, 'notes'))).toEqual(before)
  })

  it('a failure half way (EBUSY) undoes every move: the notes dir is exactly as before, no archive left', () => {
    writeNote('alpha-aaaa1111', { id: 'aaaa1111' })
    writeNote('beta-bbbb2222', { id: 'bbbb2222' })
    writeNote('gamma-dddd4444', { id: 'dddd4444' })
    writeRoot('groups.json', [{ id: 'g1', name: 'G' }])
    const before = snapshot(notesDir)
    let renames = 0
    const flaky: Partial<ArchiveFsOps> = {
      rename: (from, to) => {
        // Forward moves: fail the third one. Moves back (rollback) go through.
        if (to.includes('notes-archive') && ++renames === 3) throw Object.assign(new Error('resource busy'), { code: 'EBUSY' })
        fs.renameSync(from, to)
      },
    }
    let caught: unknown
    try {
      archiveSyncedNotes({ notesDir, archiveRoot, label: 'github-x', now: NOW, fsOps: flaky })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(NotesArchiveError)
    expect((caught as NotesArchiveError).rolledBack).toBe(true)
    expect(snapshot(notesDir)).toEqual(before)
    expect(listArchives(archiveRoot)).toEqual([])
    expect(fs.existsSync(archiveRoot) ? fs.readdirSync(archiveRoot) : []).toEqual([])
  })

  it('a failure after a filtered metadata write restores the original file', () => {
    writeNote('alpha-aaaa1111', { id: 'aaaa1111' })
    writeNote('welcome-cccc3333', { id: 'cccc3333', localOnly: true, group: 'g-w' })
    writeRoot('groups.json', [{ id: 'g-a', name: 'A' }, { id: 'g-w', name: 'W' }])
    const before = snapshot(notesDir)
    const failManifest: Partial<ArchiveFsOps> = {
      writeFile: (file, content) => {
        if (file.endsWith('manifest.json')) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' })
        fs.writeFileSync(file, content, 'utf-8')
      },
    }
    expect(() => archiveSyncedNotes({ notesDir, archiveRoot, label: 'github-x', now: NOW, fsOps: failManifest })).toThrow(NotesArchiveError)
    expect(snapshot(notesDir)).toEqual(before)
  })

  it('EXDEV with a failing source removal puts the source back and undoes the rest', () => {
    writeNote('alpha-aaaa1111', { id: 'aaaa1111' })
    writeNote('beta-bbbb2222', { id: 'bbbb2222' })
    const before = snapshot(notesDir)
    let removals = 0
    const ops: Partial<ArchiveFsOps> = {
      rename: () => { throw Object.assign(new Error('cross-device link'), { code: 'EXDEV' }) },
      remove: (target) => {
        // The second source folder: half removed, then EPERM (an antivirus lock).
        if (target.startsWith(notesDir) && ++removals === 2) {
          const files = fs.readdirSync(target)
          fs.rmSync(path.join(target, files[0]))
          throw Object.assign(new Error('operation not permitted'), { code: 'EPERM' })
        }
        fs.rmSync(target, { recursive: true })
      },
    }
    expect(() => archiveSyncedNotes({ notesDir, archiveRoot, label: 'github-x', now: NOW, fsOps: ops })).toThrow(NotesArchiveError)
    expect(snapshot(notesDir)).toEqual(before)
  })

  it('when the undo itself fails nothing more is deleted and the error says where the notes are', () => {
    writeNote('alpha-aaaa1111', { id: 'aaaa1111' })
    writeNote('beta-bbbb2222', { id: 'bbbb2222' })
    const before = snapshot(notesDir)
    let forward = 0
    const ops: Partial<ArchiveFsOps> = {
      rename: (from, to) => {
        if (to.includes('notes-archive')) {
          if (++forward === 2) throw Object.assign(new Error('busy'), { code: 'EBUSY' })
        } else {
          throw Object.assign(new Error('locked'), { code: 'EPERM' }) // moving back fails too
        }
        fs.renameSync(from, to)
      },
    }
    let caught: NotesArchiveError | undefined
    try {
      archiveSyncedNotes({ notesDir, archiveRoot, label: 'github-x', now: NOW, fsOps: ops })
    } catch (err) {
      caught = err as NotesArchiveError
    }
    expect(caught?.rolledBack).toBe(false)
    expect(caught?.stranded.length).toBe(1)
    expect(caught?.archiveDir).toBeTruthy()
    // The note that could not go back is complete in the archive.
    // Nothing lost: the archive + the notes dir together hold every file, unchanged.
    expect({ ...snapshot(path.join(caught!.archiveDir!, 'notes')), ...snapshot(notesDir) }).toEqual(before)
    expect(fs.readdirSync(notesDir).length).toBe(1) // the other note never moved
  })

  it('a notes dir that cannot be listed moves nothing', () => {
    expect(() => archiveSyncedNotes({ notesDir: path.join(tmp, 'missing'), archiveRoot, label: 'x', now: NOW })).toThrow(NotesArchiveError)
    expect(listArchives(archiveRoot)).toEqual([])
  })

  it('two archives in the same millisecond get distinct folders; listArchives is newest first', () => {
    writeNote('alpha-aaaa1111', { id: 'aaaa1111' })
    const first = archiveSyncedNotes({ notesDir, archiveRoot, label: 'github-x', now: NOW })
    writeNote('beta-bbbb2222', { id: 'bbbb2222' })
    const second = archiveSyncedNotes({ notesDir, archiveRoot, label: 'github-x', now: NOW })
    expect(second.archiveDir).not.toBe(first.archiveDir)
    const later = archiveSyncedNotes({ notesDir, archiveRoot, label: 'github-y', now: new Date('2026-11-17T00:00:00.000Z') })
    expect(listArchives(archiveRoot)[0].dir).toBe(later.archiveDir)
  })
})

describe('filterMetadataForKept', () => {
  const kept = { noteIds: new Set(['n1']), groupIds: new Set(['g1']), folderIds: new Set(['f1']), sectionNames: new Set(['tips']) }
  it('returns null when nothing is used, the file is not understood, or it is not filterable', () => {
    expect(filterMetadataForKept('groups.json', '[{"id":"g9"}]', kept)).toBeNull()
    expect(filterMetadataForKept('groups.json', '{bad', kept)).toBeNull()
    expect(filterMetadataForKept('groups.json', '{"id":"g1"}', kept)).toBeNull()
    expect(filterMetadataForKept('templates.json', '[{"id":"g1"}]', kept)).toBeNull()
  })
  it('keeps the used entries, untouched', () => {
    expect(JSON.parse(filterMetadataForKept('groups.json', '[{"id":"g1","name":"A","color":"--accent"},{"id":"g2"}]', kept)!)).toEqual([{ id: 'g1', name: 'A', color: '--accent' }])
    expect(JSON.parse(filterMetadataForKept('note-order.json', '{"a":["n1","n2"],"b":["n3"],"c":"x"}', kept)!)).toEqual({ a: ['n1'] })
    expect(JSON.parse(filterMetadataForKept('section-colors.json', '{"Tips ":"#ff0000","work":"--accent"}', kept)!)).toEqual({ 'Tips ': '#ff0000' })
  })
})
