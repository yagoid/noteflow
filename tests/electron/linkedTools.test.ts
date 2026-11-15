// The chat agent's tools on linked notes (electron/ai/llm/tools.ts → ctx.linked): a linked
// file that isn't Markdown is described to the model as plain text (so it keeps the file's
// format when it edits it with update_section), and a Markdown one as Markdown.
import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { executeTool, type LinkedToolApi, type ToolContext } from '../../electron/ai/llm/tools'
import type { DiskNote } from '../../electron/noteFormat'

const linkedNote = (id: string, file: string, content: string): DiskNote => ({
  id,
  title: file,
  tags: [],
  created: '2026-11-01T00:00:00.000Z',
  updated: '2026-11-01T00:00:00.000Z',
  sections: [{ id: 'body', name: file, content }],
})

const tmpDirs: string[] = []
afterEach(() => { for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }) })

function context(notes: DiskNote[], writes: Array<{ id: string; content: string }>): ToolContext {
  const linked: LinkedToolApi = {
    list: () => notes,
    get: (id) => notes.find((n) => n.id === id) ?? null,
    writeBody: async (id, content) => { writes.push({ id, content }); return { ok: true } },
    updateMeta: () => {},
    unlink: () => {},
  }
  const notesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-linked-tools-'))
  tmpDirs.push(notesDir)
  return {
    notesDir,
    writeNote: () => {},
    deleteNoteDir: () => {},
    readGroups: () => [],
    writeGroups: () => {},
    readFolders: () => [],
    writeFolders: () => {},
    linked,
  }
}

describe('agent tools on linked notes', () => {
  const json = linkedNote('lnk:json', 'config.json', '{\n  "port": 8080\n}')
  const md = linkedNote('lnk:md', 'README.md', '# Project')

  it('lists and reads a non-Markdown linked file as plain text, a .md as Markdown', async () => {
    const ctx = context([json, md], [])
    const list = await executeTool('list_notes', {}, ctx)
    expect(list.content).toContain('config.json [id=lnk:json] (linked plain-text file, single section)')
    expect(list.content).toContain('README.md [id=lnk:md] (linked Markdown file, single section)')

    const readJson = await executeTool('get_note', { note_id: 'lnk:json' }, ctx)
    expect(readJson.content).toContain('plain-text file (config.json), NOT Markdown')
    expect(readJson.content).toContain('"port": 8080')
    const readMd = await executeTool('get_note', { note_id: 'lnk:md' }, ctx)
    expect(readMd.content).toContain('an external Markdown file')
    expect(readMd.content).not.toContain('plain-text')
  })

  it('update_section writes the plain-text file content as given', async () => {
    const writes: Array<{ id: string; content: string }> = []
    const ctx = context([json], writes)
    const res = await executeTool('update_section', { note_id: 'lnk:json', section_id: 'body', content: '{\n  "port": 8081\n}' }, ctx)
    expect(res.isError).toBeFalsy()
    expect(writes).toEqual([{ id: 'lnk:json', content: '{\n  "port": 8081\n}' }])
  })
})
