// Linked notes in the renderer (lib/linkedNotes.ts): wire → store note, the reload
// decision when the file changed outside (apply / adopt / keep / conflict — never
// overwrite local edits silently) and image sources.
import { describe, expect, it } from 'vitest'
import {
  decideLinkedReload,
  inlineLinkedImages,
  isLinkedDirty,
  linkedDraftOf,
  isLinkedFilePath,
  isLinkedReadOnly,
  linkedImageSrc,
  linkedNoteFromWire,
  linkedPreviewOptions,
  mergeLinkedWire,
  LINKED_SECTION_ID,
} from '../../src/lib/linkedNotes'
import { linkedStatusLabel, linkedTone } from '../../src/components/LinkedNote/linkedActions'
import type { LinkedNoteState, LinkedNoteWire, Note } from '../../src/types'

const wire = (over: Partial<LinkedNoteWire> = {}): LinkedNoteWire => ({
  id: 'lnk:abc',
  path: 'C:\\p\\README.md',
  title: 'README',
  favorited: false,
  archived: false,
  isRawMode: false,
  aiHidden: false,
  created: '2026-11-01T00:00:00.000Z',
  updated: '2026-11-02T00:00:00.000Z',
  sectionName: 'README.md',
  status: 'ok',
  body: '# Doc\n\nv1 #tag',
  hash: 'h1',
  ...over,
})

type Linked = Note & { linked: LinkedNoteState }
const withContent = (note: Note, content: string): Linked =>
  ({ ...note, sections: [{ ...note.sections[0], content }] }) as Linked

describe('linkedNoteFromWire', () => {
  it('is a one-section note whose content is the file body', () => {
    const note = linkedNoteFromWire(wire({ group: 'g', folder: 'f', isRawMode: true }))
    expect(note.sections).toHaveLength(1)
    expect(note.sections[0]).toMatchObject({ id: LINKED_SECTION_ID, name: 'README.md', content: '# Doc\n\nv1 #tag', isRawMode: true })
    expect(note.tags).toEqual(['tag'])
    expect(note.filePath).toBe('C:\\p\\README.md')
    expect(note.raw).toBe('')
    expect(note.group).toBe('g')
    expect(note.folder).toBe('f')
    expect(note.linked).toMatchObject({ baseHash: 'h1', diskBody: '# Doc\n\nv1 #tag', syncedContent: '# Doc\n\nv1 #tag', status: 'ok' })
    expect(note.encryption).toBeUndefined()
    expect(note.expiresAt).toBeUndefined()
  })

  it('drops a folder without group', () => {
    expect(linkedNoteFromWire(wire({ folder: 'f' })).folder).toBeUndefined()
  })
})

describe('decideLinkedReload', () => {
  const state: LinkedNoteState = { path: '/p/a.md', status: 'ok', baseHash: 'h1', diskBody: 'v1', syncedContent: 'v1' }
  const base = { localContent: 'v1', state, pending: false, incomingHash: 'h2', incomingBody: 'v2' }

  it('applies the disk version when there is nothing local', () => {
    expect(decideLinkedReload(base)).toBe('apply')
  })
  it('never overwrites a pending edit: conflict', () => {
    expect(decideLinkedReload({ ...base, pending: true })).toBe('conflict')
  })
  it('never overwrites unsaved content: conflict', () => {
    expect(decideLinkedReload({ ...base, localContent: 'mine' })).toBe('conflict')
  })
  it('keeps the content when the disk version is the known one', () => {
    expect(decideLinkedReload({ ...base, incomingHash: 'h1', incomingBody: 'v1' })).toBe('keep')
  })
  it('keeps the content when the file is missing or unreadable', () => {
    expect(decideLinkedReload({ ...base, incomingHash: null, incomingBody: 'cached' })).toBe('keep')
  })
  it('adopts a disk version equal to what the note already shows', () => {
    expect(decideLinkedReload({ ...base, localContent: 'v2' })).toBe('adopt')
  })
  it('stays in conflict while one is open (a new disk version updates it)', () => {
    const inConflict = { ...state, conflict: { diskBody: 'v2', diskHash: 'h2' } }
    expect(decideLinkedReload({ ...base, state: inConflict, localContent: 'mine', incomingHash: 'h3', incomingBody: 'v3' })).toBe('conflict')
    expect(decideLinkedReload({ ...base, state: inConflict, localContent: 'mine', incomingHash: 'h1', incomingBody: 'v1' })).toBe('conflict')
  })
  it('a conflict ends by itself when the disk comes back to what the note shows', () => {
    const inConflict = { ...state, conflict: { diskBody: 'v2', diskHash: 'h2' } }
    expect(decideLinkedReload({ ...base, state: inConflict, localContent: 'v3', incomingHash: 'h3', incomingBody: 'v3' })).toBe('adopt')
  })
})

describe('mergeLinkedWire', () => {
  const existing = linkedNoteFromWire(wire()) as Linked

  it('applies new disk content and the metadata from main', () => {
    const { note, decision } = mergeLinkedWire(existing, wire({ body: 'v2', hash: 'h2', title: 'Alias', favorited: true }), false)
    expect(decision).toBe('apply')
    expect(note.sections[0].content).toBe('v2')
    expect(note.title).toBe('Alias')
    expect(note.favorited).toBe(true)
    expect(note.linked).toMatchObject({ baseHash: 'h2', diskBody: 'v2', syncedContent: 'v2' })
  })

  it('in a conflict keeps my content and remembers the disk version', () => {
    const dirty = withContent(existing, 'mine')
    const { note, decision } = mergeLinkedWire(dirty, wire({ body: 'v2', hash: 'h2' }), false)
    expect(decision).toBe('conflict')
    expect(note.sections[0].content).toBe('mine')
    expect(note.linked).toMatchObject({ baseHash: 'h1', conflict: { diskBody: 'v2', diskHash: 'h2' } })
  })

  it('a missing file keeps the content and becomes read-only', () => {
    const { note, decision } = mergeLinkedWire(existing, wire({ status: 'missing', hash: null, body: 'cached' }), false)
    expect(decision).toBe('keep')
    expect(note.sections[0].content).toBe('# Doc\n\nv1 #tag')
    expect(isLinkedReadOnly(note)).toBe(true)
  })

  it('metadata-only changes keep the content', () => {
    const dirty = withContent(existing, 'mine')
    const { note, decision } = mergeLinkedWire(dirty, wire({ title: 'New alias' }), true)
    expect(decision).toBe('keep')
    expect(note.title).toBe('New alias')
    expect(note.sections[0].content).toBe('mine')
  })
})

describe('paths and images', () => {
  it('a notes-updated path naming an .md is a linked file (note folders never are)', () => {
    expect(isLinkedFilePath('C:\\p\\README.md')).toBe(true)
    expect(isLinkedFilePath('/p/x.MARKDOWN')).toBe(true)
    expect(isLinkedFilePath('C:\\Users\\me\\noteflow-notes\\my-note-abc12345')).toBe(false)
    expect(isLinkedFilePath(undefined)).toBe(false)
  })

  it('serves relative images through nflinked:, leaves the rest alone', () => {
    expect(linkedImageSrc('lnk:a', 'assets/x y.png')).toBe('nflinked://n/lnk%3Aa/assets%2Fx%20y.png')
    expect(linkedImageSrc('lnk:a', '../img/z.svg')).toBe('nflinked://n/lnk%3Aa/..%2Fimg%2Fz.svg')
    for (const src of ['https://x/a.png', 'data:image/png;base64,AA', '/abs/a.png', 'C:\\a.png']) {
      expect(linkedImageSrc('lnk:a', src)).toBe(src)
    }
  })

  it('preview options only for linked notes', () => {
    expect(linkedPreviewOptions(null)).toBeUndefined()
    const opts = linkedPreviewOptions('lnk:a')
    expect(opts?.plain).toBe(true)
    expect(opts?.imageSrc('a.png')).toBe('nflinked://n/lnk%3Aa/a.png')
  })
})

describe('unsaved content (dirty) and drafts', () => {
  it('a restored draft based on the disk version starts dirty, without conflict', () => {
    const note = linkedNoteFromWire(wire({ draft: { body: 'unsaved', baseHash: 'h1' } }))
    expect(note.sections[0].content).toBe('unsaved')
    expect(note.linked).toMatchObject({ baseHash: 'h1', syncedContent: '# Doc\n\nv1 #tag' })
    expect(note.linked?.conflict).toBeUndefined()
    expect(isLinkedDirty(note)).toBe(true)
    expect(linkedDraftOf(note)).toEqual({ body: 'unsaved', baseHash: 'h1' })
  })

  it('a restored draft whose file changed since is a conflict', () => {
    const note = linkedNoteFromWire(wire({ hash: 'h2', body: 'v2', draft: { body: 'unsaved', baseHash: 'h1' } }))
    expect(note.linked?.conflict).toEqual({ diskBody: 'v2', diskHash: 'h2' })
    expect(note.sections[0].content).toBe('unsaved')
  })

  it('a draft restored while the file is still being checked waits for the read', () => {
    const note = linkedNoteFromWire(wire({ status: 'checking', hash: null, draft: { body: 'unsaved', baseHash: 'h1' } }))
    expect(note.linked).toMatchObject({ status: 'checking', baseHash: 'h1' })
    expect(note.linked?.conflict).toBeUndefined()
    expect(isLinkedReadOnly(note)).toBe(true)
    // The read lands with the same version → keep (and the store retries the write).
    expect(decideLinkedReload({ localContent: 'unsaved', state: note.linked!, pending: false, incomingHash: 'h1', incomingBody: 'v1' })).toBe('keep')
  })

  it('a clean note has no draft', () => {
    const note = linkedNoteFromWire(wire())
    expect(isLinkedDirty(note)).toBe(false)
    expect(linkedDraftOf(note)).toBeNull()
  })

  it('merging main\'s view never brings in a draft over the store content', () => {
    const existing = linkedNoteFromWire(wire()) as Linked
    const { note } = mergeLinkedWire(existing, wire({ draft: { body: 'other window', baseHash: 'h1' } }), false)
    expect(note.sections[0].content).toBe('# Doc\n\nv1 #tag')
  })

  it('never labels unsaved content as up to date', () => {
    const labels = { status: { ok: 'Up to date', missing: 'Missing', readonly: 'Read-only', error: 'Error', checking: 'Checking', conflict: 'Conflict' }, unsaved: 'Unsaved changes' }
    const state: LinkedNoteState = { path: '/p/a.md', status: 'ok', baseHash: 'h1', diskBody: 'v1', syncedContent: 'v1' }
    expect(linkedStatusLabel(labels, state, false)).toBe('Up to date')
    expect(linkedStatusLabel(labels, state, true)).toBe('Unsaved changes')
    expect(linkedStatusLabel(labels, { ...state, status: 'readonly' }, true)).toBe('Read-only · Unsaved changes')
    expect(linkedStatusLabel(labels, { ...state, conflict: { diskBody: 'x', diskHash: 'h2' } }, true)).toBe('Conflict')
    expect(linkedTone(state, true)).toBe('warn')
    expect(linkedTone(state, false)).toBe('ok')
    expect(linkedTone({ ...state, status: 'checking' }, false)).toBe('ok')
  })
})

describe('drafts that do not match the file', () => {
  it('a draft never based on a read (null base) is a conflict against a readable file, never a silent write', () => {
    const note = linkedNoteFromWire(wire({ draft: { body: 'unsaved', baseHash: null } }))
    expect(note.linked?.conflict).toEqual({ diskBody: '# Doc\n\nv1 #tag', diskHash: 'h1' })
  })

  it('unwritten edits carried over to a relocated file show as a conflict with the new file', () => {
    const relocated = wire({ path: '/p/other.md', body: 'other file', hash: 'h9' })
    const note = linkedNoteFromWire({ ...relocated, draft: { body: 'unsaved', baseHash: 'h1' } })
    expect(note.sections[0].content).toBe('unsaved')
    expect(note.linked?.conflict).toEqual({ diskBody: 'other file', diskHash: 'h9' })
    expect(isLinkedDirty(note)).toBe(true)
  })
})

describe('inlineLinkedImages (copying a linked note into a regular one)', () => {
  const fake = async (src: string) => (src.includes('missing') ? null : `data:image/png;base64,${Buffer.from(src).toString('base64')}`)

  it('inlines relative images, keeps everything else', async () => {
    const md = [
      '![logo](img/logo.png){width=120}',
      '![up](../shared/x.png)',
      '![web](https://x.com/a.png) ![inline](data:image/png;base64,AA)',
      '![gone](img/missing.png)',
      '`![code](img/logo.png)`',
    ].join('\n')
    const out = await inlineLinkedImages(md, fake)
    const lines = out.split('\n')
    expect(lines[0]).toBe(`![logo](data:image/png;base64,${Buffer.from('img/logo.png').toString('base64')}){width=120}`)
    expect(lines[1]).toBe(`![up](data:image/png;base64,${Buffer.from('../shared/x.png').toString('base64')})`)
    expect(lines[2]).toBe('![web](https://x.com/a.png) ![inline](data:image/png;base64,AA)')
    expect(lines[3]).toBe('![gone](img/missing.png)')
    expect(lines[4]).toBe('`![code](img/logo.png)`')
  })

  it('returns the text untouched when there is nothing to inline', async () => {
    expect(await inlineLinkedImages('# no images', fake)).toBe('# no images')
  })
})

describe('inlineLinkedImages — titles, duplicates and the size budget', () => {
  it('converts images with a title or <…> source, dropping the title', async () => {
    const calls: string[] = []
    const fetch = async (src: string) => { calls.push(src); return 'data:image/png;base64,AAAA' }
    const out = await inlineLinkedImages('![a](img/a.png "Title") ![b](<img/b c.png> \'T\') ![r][ref]', fetch)
    expect(out).toBe('![a](data:image/png;base64,AAAA) ![b](data:image/png;base64,AAAA) ![r][ref]')
    expect(calls).toEqual(['img/a.png', 'img/b c.png'])
  })

  it('fetches each distinct source once, one at a time', async () => {
    let running = 0
    let maxRunning = 0
    const calls: string[] = []
    const fetch = async (src: string) => {
      calls.push(src); running++; maxRunning = Math.max(maxRunning, running)
      await new Promise((r) => setTimeout(r, 5)); running--
      return 'data:image/png;base64,AAAA'
    }
    const out = await inlineLinkedImages('![x](a.png) ![y](b.png) ![z](a.png)', fetch)
    expect(calls).toEqual(['a.png', 'b.png'])
    expect(maxRunning).toBe(1)
    expect(out).toBe('![x](data:image/png;base64,AAAA) ![y](data:image/png;base64,AAAA) ![z](data:image/png;base64,AAAA)')
  })

  it('past the size budget the remaining images keep their paths', async () => {
    const big = 'data:image/png;base64,' + 'A'.repeat(4000) // 3000 bytes decoded
    const fetch = async () => big
    const out = await inlineLinkedImages('![1](a.png) ![2](b.png) ![3](c.png)', fetch, 7000)
    expect(out).toBe(`![1](${big}) ![2](${big}) ![3](c.png)`)
  })
})
