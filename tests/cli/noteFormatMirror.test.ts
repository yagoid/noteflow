// The CLI's hand-rolled note.md parser/serializer (cli/noteflow.js) is the third
// mirror of the v2 format. These checks pin the optional per-section `created`
// across the CLI and the renderer's js-yaml implementation (src/lib/noteUtils.ts).
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { parseNoteFolder, serializeNoteFolder, NOTE_MD } from '../../src/lib/noteUtils'
import type { Note } from '../../src/types'

const require = createRequire(import.meta.url)
const cli = require('../../cli/noteflow.js')

type CliSection = { id: string; name: string; file?: string; isRawMode?: boolean; aiHidden?: boolean; created?: string }
type CliNote = { id: string; title: string; tags: string[]; created: string; updated: string; sections: CliSection[] }

const splitFrontmatter = cli.splitFrontmatter as (raw: string) => { frontmatter: string; body: string }
const parseNoteYaml = cli.parseNoteYaml as (yaml: string) => CliNote
const serializeNoteMd = cli.serializeNoteMd as (note: CliNote, opts?: { preserveUpdated?: boolean }) => string

const NOTE_CREATED = '2026-01-01T00:00:00.000Z'
const SECTION_CREATED = '2026-02-03T04:05:06.000Z'

describe('CLI note.md mirror — per-section created', () => {
  it('writes created only for sections that have it and parses it back', () => {
    const noteMd = serializeNoteMd({
      id: 'n1', title: 'T', tags: [], created: NOTE_CREATED, updated: NOTE_CREATED,
      sections: [
        { id: 'a', name: 'Note', isRawMode: true },
        { id: 'b', name: 'Later', created: SECTION_CREATED },
      ],
    }, { preserveUpdated: true })
    expect(noteMd).toContain(`    created: "${SECTION_CREATED}"`)
    expect(noteMd.match(/created:/g)).toHaveLength(2)

    const parsed = parseNoteYaml(splitFrontmatter(noteMd).frontmatter)
    expect(parsed.sections[0].created).toBeUndefined()
    expect(parsed.sections[1].created).toBe(SECTION_CREATED)
  })

  it('a CLI-written note.md is read by the renderer parser with created intact', () => {
    const noteMd = serializeNoteMd({
      id: 'n1', title: 'T', tags: [], created: NOTE_CREATED, updated: NOTE_CREATED,
      sections: [{ id: 'a', name: 'Note' }, { id: 'b', name: 'Later', isRawMode: true, created: SECTION_CREATED }],
    }, { preserveUpdated: true })
    const parsed = parseNoteFolder(noteMd, { 'a.md': '', 'b.md': '' }, '/notes/n1')
    expect(parsed.sections[0]).not.toHaveProperty('created')
    expect(parsed.sections[1].created).toBe(SECTION_CREATED)
    expect(parsed.sections[1].isRawMode).toBe(true)
  })

  it('a renderer-written note.md survives a CLI parse → serialize round-trip', () => {
    const note: Note = {
      id: 'n2', title: 'T', tags: [], created: NOTE_CREATED, updated: NOTE_CREATED,
      archived: false, favorited: false, raw: '', filePath: '/notes/n2',
      sections: [
        { id: 'a', name: 'Note', content: '' },
        { id: 'b', name: 'Later', content: '', aiHidden: true, created: SECTION_CREATED },
      ],
    }
    const appMd = serializeNoteFolder(note).files[NOTE_MD]
    const cliNote = parseNoteYaml(splitFrontmatter(appMd).frontmatter)
    const cliMd = serializeNoteMd(cliNote, { preserveUpdated: true })
    const reparsed = parseNoteFolder(cliMd, { 'a.md': '', 'b.md': '' }, '/notes/n2')
    expect(reparsed.sections[0]).not.toHaveProperty('created')
    expect(reparsed.sections[1].created).toBe(SECTION_CREATED)
    expect(reparsed.sections[1].aiHidden).toBe(true)
  })
})
