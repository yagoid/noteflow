// The chat agent's tools and the per-section `updated` (note-format.md "`updated` por
// sección"): update_section / rename_section stamp the section they really change, and
// only that one; add_section / create_note give new sections updated = created.
import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { executeTool, withSectionEdit, type ToolContext } from '../../electron/ai/llm/tools'
import { serializeNoteFolder, NOTE_MD, type DiskNote } from '../../electron/noteFormat'
import { parseNoteFolder } from '../../src/lib/noteUtils'

const T0 = '2026-11-01T00:00:00.000Z'
const STAMP = '2026-11-02T00:00:00.000Z'
const DIR = 'plan-abc12345'

const tmpDirs: string[] = []
afterEach(() => { for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }) })

/** A notes dir holding one note, and the note.md of every write the tools make. */
function context(): { ctx: ToolContext; written: string[] } {
  const notesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-tools-updated-'))
  tmpDirs.push(notesDir)
  const note: DiskNote = {
    id: 'abc12345', title: 'Plan', tags: [], created: T0, updated: T0,
    sections: [
      { id: 'sa', name: 'Alpha', content: 'one', created: T0, updated: STAMP },
      { id: 'sb', name: 'Beta', content: 'two' },
    ],
  }
  fs.mkdirSync(path.join(notesDir, DIR))
  for (const [name, content] of Object.entries(serializeNoteFolder(note, { preserveUpdated: true }).files)) {
    fs.writeFileSync(path.join(notesDir, DIR, name), content)
  }
  const written: string[] = []
  const ctx: ToolContext = {
    notesDir,
    writeNote: ({ files }) => { written.push(files[NOTE_MD]) },
    deleteNoteDir: () => {},
    readGroups: () => [],
    writeGroups: () => {},
    readFolders: () => [],
    writeFolders: () => {},
  }
  return { ctx, written }
}

const sectionsOf = (noteMd: string) => parseNoteFolder(noteMd, {}, '/x').sections

describe('agent tools — per-section updated', () => {
  it('update_section stamps the edited section only; the same content does not', async () => {
    const { ctx, written } = context()
    await executeTool('update_section', { note_id: 'abc12345', section_id: 'sb', content: 'two!' }, ctx)
    const [alpha, beta] = sectionsOf(written[0])
    expect(alpha.updated).toBe(STAMP)
    expect(Date.parse(beta.updated!)).toBeGreaterThan(Date.parse(STAMP))

    await executeTool('update_section', { note_id: 'abc12345', section_id: 'sa', content: 'one' }, ctx)
    expect(sectionsOf(written[1])[0].updated).toBe(STAMP)
  })

  it('rename_section stamps it', async () => {
    const { ctx, written } = context()
    await executeTool('rename_section', { note_id: 'abc12345', section_id: 'sa', name: 'First' }, ctx)
    expect(sectionsOf(written[0])[0].updated).not.toBe(STAMP)
  })

  it('add_section and create_note: new sections are born with updated = created', async () => {
    const { ctx, written } = context()
    await executeTool('add_section', { note_id: 'abc12345', name: 'Gamma', content: 'x' }, ctx)
    const gamma = sectionsOf(written[0])[2]
    expect(gamma.updated).toBe(gamma.created)
    await executeTool('create_note', { title: 'New', sections: [{ name: 'A', content: 'a' }] }, ctx)
    const [only] = sectionsOf(written[1])
    expect(only.updated).toBe(only.created)
  })

  it('withSectionEdit is pure and only stamps a real change', () => {
    const s = { id: 'a', name: 'A', content: 'x', updated: STAMP }
    expect(withSectionEdit(s, { content: 'x' })).toEqual(s)
    expect(withSectionEdit(s, { name: 'B' }).updated).not.toBe(STAMP)
    expect(s.updated).toBe(STAMP)
  })
})
