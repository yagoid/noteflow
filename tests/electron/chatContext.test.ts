import { describe, it, expect } from 'vitest'
import {
  buildContextBlocks,
  describeOpenNote,
  sanitizeContextRequest,
} from '../../electron/ai/chatContext'
import { restoreStrippedImages } from '../../electron/ai/llm/tools'
import type { DiskNote } from '../../electron/noteFormat'

const IMG = 'data:image/png;base64,iVBORw0KGgo='
const IMG2 = 'data:image/jpeg;base64,/9j/4AAQ='

const notes: Record<string, DiskNote> = {
  n1: {
    id: 'n1', title: 'Roadmap', tags: [], created: 'c', updated: 'u',
    sections: [
      { id: 's1', name: 'Ideas', content: `Plan ![shot](${IMG})` },
      { id: 's2', name: 'Secret', content: 'hidden text', aiHidden: true },
      { id: 's3', name: 'Tasks', content: 'do it' },
    ],
  },
  enc: { id: 'enc', title: 'Vault', tags: [], created: 'c', updated: 'u', encryption: { ciphertext: 'x' }, sections: [] },
  big: { id: 'big', title: '', tags: [], created: 'c', updated: 'u', sections: [{ id: 'b1', name: 'Long', content: 'x'.repeat(500) }] },
}
const read = (id: string) => notes[id] ?? null

describe('sanitizeContextRequest', () => {
  it('keeps valid items, drops malformed ones and duplicates', () => {
    const req = sanitizeContextRequest({
      allNotes: true,
      items: [
        { kind: 'section', noteId: 'n1', sectionId: 's1' },
        { kind: 'section', noteId: 'n1', sectionId: 's1' },
        { kind: 'note', noteId: 'n1' },
        { kind: 'section', noteId: 'n1' },
        { kind: 'weird', noteId: 'n1' },
        null,
      ],
      openNote: { noteId: 'n1', sectionId: 's3' },
    })
    expect(req).toEqual({
      allNotes: true,
      items: [{ kind: 'section', noteId: 'n1', sectionId: 's1' }, { kind: 'note', noteId: 'n1' }],
      openNote: { noteId: 'n1', sectionId: 's3' },
    })
  })

  it('treats anything but true as allNotes off, and garbage as no context', () => {
    expect(sanitizeContextRequest({ allNotes: 'yes', items: 'nope' })).toEqual({ allNotes: false, items: [] })
    expect(sanitizeContextRequest(null)).toBeNull()
    expect(sanitizeContextRequest('x')).toBeNull()
  })
})

describe('buildContextBlocks', () => {
  it('sends a section with its ids, images stripped', () => {
    const { blocks, included } = buildContextBlocks([{ kind: 'section', noteId: 'n1', sectionId: 's1' }], read)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toContain('[section_id=s1]')
    expect(blocks[0]).toContain('[note_id=n1]')
    expect(blocks[0]).toContain('![shot]([image])')
    expect(blocks[0]).not.toContain('base64')
    expect(included).toEqual([{ noteId: 'n1', sectionId: 's1' }])
  })

  it('never sends AI-hidden sections or encrypted notes', () => {
    const { blocks } = buildContextBlocks([
      { kind: 'section', noteId: 'n1', sectionId: 's2' },
      { kind: 'note', noteId: 'enc' },
      { kind: 'section', noteId: 'missing', sectionId: 'x' },
    ], read)
    expect(blocks).toEqual([])
    const whole = buildContextBlocks([{ kind: 'note', noteId: 'n1' }], read).blocks.join('\n')
    expect(whole).toContain('Ideas')
    expect(whole).toContain('Tasks')
    expect(whole).not.toContain('hidden text')
    expect(whole).not.toContain('Secret')
  })

  it('sends a whole note once even if one of its sections is also listed', () => {
    const { blocks, included } = buildContextBlocks([
      { kind: 'section', noteId: 'n1', sectionId: 's1' },
      { kind: 'note', noteId: 'n1' },
    ], read)
    expect(blocks).toHaveLength(1)
    expect(included).toEqual([{ noteId: 'n1' }])
  })

  it('caps each item and the total, marking the cut', () => {
    const { blocks } = buildContextBlocks([{ kind: 'section', noteId: 'big', sectionId: 'b1' }], read, { itemMax: 100 })
    expect(blocks[0]).toContain('x'.repeat(100))
    expect(blocks[0]).not.toContain('x'.repeat(101))
    expect(blocks[0]).toContain('truncated')
    expect(blocks[0]).toContain('"Untitled"')

    const total = buildContextBlocks([
      { kind: 'section', noteId: 'big', sectionId: 'b1' },
      { kind: 'section', noteId: 'n1', sectionId: 's3' },
    ], read, { totalMax: 200 })
    expect(total.blocks).toHaveLength(1)
  })
})

describe('describeOpenNote', () => {
  it('names the open note and section with their ids', () => {
    const line = describeOpenNote({ noteId: 'n1', sectionId: 's3' }, read)!
    expect(line).toContain('"Roadmap" [note_id=n1]')
    expect(line).toContain('"Tasks" [section_id=s3]')
  })

  it('never names an AI-hidden section nor reads an encrypted note', () => {
    const hidden = describeOpenNote({ noteId: 'n1', sectionId: 's2' }, read)!
    expect(hidden).not.toContain('Secret')
    expect(hidden).toContain('[note_id=n1]')
    expect(describeOpenNote({ noteId: 'enc' }, read)).toContain('encrypted')
    expect(describeOpenNote({ noteId: 'missing' }, read)).toBeNull()
    expect(describeOpenNote(undefined, read)).toBeNull()
  })
})

describe('restoreStrippedImages (update_section)', () => {
  it('puts the original images back in order', () => {
    const original = `a ![one](${IMG}) b ![two](${IMG2})`
    expect(restoreStrippedImages(original, 'new ![one]([image]) and ![two]([image])'))
      .toBe(`new ![one](${IMG}) and ![two](${IMG2})`)
  })

  it('drops placeholders it has no image for (no broken images saved)', () => {
    expect(restoreStrippedImages(`![a](${IMG})`, '![a]([image]) ![b]([image])')).toBe(`![a](${IMG}) `)
    expect(restoreStrippedImages('plain', 'text ![x]([image])')).toBe('text ')
    expect(restoreStrippedImages('plain', 'no images here')).toBe('no images here')
  })
})
