// Linked notes (external text files edited in place) — the pure half in main:
// registry sanitizing, path normalization/dedupe, the text/binary check, the
// byte-exact split/reassembly of the file (BOM, EOL, final newline, YAML
// frontmatter of Markdown files only), the fingerprint
// decisions (own echo vs external change, write vs conflict) and the assets/ helpers.
import { describe, it, expect } from 'vitest'
import {
  assembleMarkdownFile,
  canDiscardTransient,
  createLinkGrants,
  decideDiskEvent,
  decideWrite,
  decodeLinkedBytes,
  defaultLinkedTitle,
  dropTransientRecords,
  encodeMarkdown,
  hashBytes,
  hasLoneCr,
  LINK_GRANT_TTL_MS,
  isLinkedNoteId,
  isMarkdownPath,
  isPathInside,
  linkedAssetFileName,
  linkedCacheFileName,
  linkedDraftFileName,
  imageMimeOf,
  markdownImageSrcs,
  mergeLinkedOrder,
  sanitizeLinkedDraft,
  sanitizeNoteOrder,
  splitLinkedOrder,
  linkedPathKey,
  resolveLinkedAsset,
  sanitizeLinkedRegistry,
  sniffLinkedBytes,
  splitLinkedFile,
  splitMarkdownFile,
} from '../../electron/linkedNotesLogic'

const roundTrip = (text: string) => {
  const parts = splitMarkdownFile(text)
  return assembleMarkdownFile(parts, parts.body)
}

describe('splitMarkdownFile / assembleMarkdownFile (byte-exact)', () => {
  const files = [
    '',
    'a',
    'a\n',
    'a\n\n',
    '# Title\n\nText\n',
    '# Title\r\n\r\nText\r\n',
    '# Title\r\n\r\nText',
    '---\ntitle: Doc\nsidebar_position: 2\n---\n\n# Doc\n\nBody\n',
    '---\r\ntitle: Doc\r\n---\r\n# Doc\r\n',
    '---\ntitle: x\n---',
    '---\n---\nbody',
    '\n\nleading blank lines\n',
    'no final newline',
  ]
  for (const f of files) {
    it(`round-trips ${JSON.stringify(f)}`, () => {
      expect(roundTrip(f)).toBe(f)
    })
  }

  it('hides the YAML frontmatter from the editable body and keeps it verbatim on edit', () => {
    const text = '---\r\ntitle: "Mi doc"\r\ntags: [a, b]\r\n---\r\n\r\n# Doc\r\nold\r\n'
    const parts = splitMarkdownFile(text)
    expect(parts.frontmatter).toBe('---\r\ntitle: "Mi doc"\r\ntags: [a, b]\r\n---\r\n')
    expect(parts.body).toBe('\n# Doc\nold')
    expect(parts.eol).toBe('\r\n')
    expect(parts.finalNewline).toBe(true)
    expect(assembleMarkdownFile(parts, '\n# Doc\nnew')).toBe('---\r\ntitle: "Mi doc"\r\ntags: [a, b]\r\n---\r\n\r\n# Doc\r\nnew\r\n')
  })

  it('keeps a missing final newline missing', () => {
    const parts = splitMarkdownFile('a\nb')
    expect(parts.finalNewline).toBe(false)
    expect(assembleMarkdownFile(parts, 'a\nc')).toBe('a\nc')
  })

  it('a leading `---` rule that is not YAML stays in the body', () => {
    const text = '---\n\nSome text\n\n---\n\nMore\n'
    const parts = splitMarkdownFile(text)
    expect(parts.frontmatter).toBe('')
    expect(parts.body.startsWith('---')).toBe(true)
    expect(roundTrip(text)).toBe(text)
  })

  it('writes CRLF files with CRLF even when the editor hands LF', () => {
    const parts = splitMarkdownFile('a\r\nb\r\n')
    expect(assembleMarkdownFile(parts, 'a\nb\nc')).toBe('a\r\nb\r\nc\r\n')
  })

  it('uses the dominant line ending of a mixed file', () => {
    expect(splitMarkdownFile('a\r\nb\r\nc\nd\r\n').eol).toBe('\r\n')
    expect(splitMarkdownFile('a\nb\nc\r\nd\n').eol).toBe('\n')
  })
})

describe('splitLinkedFile: frontmatter only in Markdown files', () => {
  const yaml = '---\r\nname: ci\r\non: [push]\r\n---\r\njobs:\r\n  build: {}\r\n'

  it('a .yaml starting with `---` keeps its header in the editable body', () => {
    const parts = splitLinkedFile('C:\\p\\.github\\ci.yaml', yaml)
    expect(parts.frontmatter).toBe('')
    expect(parts.body).toBe('---\nname: ci\non: [push]\n---\njobs:\n  build: {}')
    expect(parts.eol).toBe('\r\n')
    // The same text in a .md: that block is frontmatter (hidden, kept verbatim).
    expect(splitLinkedFile('/p/doc.md', yaml).frontmatter).toBe('---\r\nname: ci\r\non: [push]\r\n---\r\n')
  })

  it('round-trips a non-Markdown file byte for byte (BOM + CRLF), and an edit changes only its line', () => {
    const text = '{\r\n  "a": 1,\r\n  "b": 2\r\n}\r\n'
    const bytes = encodeMarkdown(text, true)
    const decoded = decodeLinkedBytes(bytes)
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    const parts = splitLinkedFile('/p/config.json', decoded.text, decoded.bom)
    expect(encodeMarkdown(assembleMarkdownFile(parts, parts.body), decoded.bom).equals(bytes)).toBe(true)
    const edited = encodeMarkdown(assembleMarkdownFile(parts, parts.body.replace('"b": 2', '"b": 3')), decoded.bom)
    expect(edited.equals(encodeMarkdown('{\r\n  "a": 1,\r\n  "b": 3\r\n}\r\n', true))).toBe(true)
  })
})

describe('link grants (only paths the user chose can be linked)', () => {
  it('a granted path can be consumed once', () => {
    const g = createLinkGrants('linux')
    g.grant(['/p/config.json'], 1000, 0)
    expect(g.consume('/p/config.json', 10)).toBe(true)
    expect(g.consume('/p/config.json', 20)).toBe(false)
  })

  it('nothing is granted by default, nor relative / non-string paths', () => {
    const g = createLinkGrants('linux')
    expect(g.consume('/home/u/.bashrc', 0)).toBe(false)
    g.grant(['relative/a.txt', 42, '', '/ok.txt'], 1000, 0)
    expect(g.size(0)).toBe(1)
    expect(g.consume('relative/a.txt', 0)).toBe(false)
    expect(g.consume(42, 0)).toBe(false)
  })

  it('expires after its TTL (default LINK_GRANT_TTL_MS)', () => {
    const g = createLinkGrants('linux')
    g.grant(['/a.txt'], 1000, 0)
    expect(g.consume('/a.txt', 1000)).toBe(false)
    g.grant(['/b.txt'], undefined, 0)
    expect(g.consume('/b.txt', LINK_GRANT_TTL_MS - 1)).toBe(true)
    g.grant(['/c.txt'], undefined, 0)
    expect(g.size(LINK_GRANT_TTL_MS)).toBe(0)
  })

  it('keys by linkedPathKey: case/separators/.. on Windows, exact case on Linux', () => {
    const win = createLinkGrants('win32')
    win.grant(['C:\\Proj\\docs\\..\\Config.JSON'], 1000, 0)
    expect(win.consume('c:/proj/config.json', 1)).toBe(true)
    const linux = createLinkGrants('linux')
    linux.grant(['/home/u/Config.json'], 1000, 0)
    expect(linux.consume('/home/u/config.json', 1)).toBe(false)
    expect(linux.consume('/home/u/./Config.json', 1)).toBe(true)
  })
})

describe('hasLoneCr (old Mac line breaks)', () => {
  it('finds a CR not followed by LF, never in CRLF', () => {
    expect(hasLoneCr('a\rb')).toBe(true)
    expect(hasLoneCr('a\r\nb\r')).toBe(true)
    expect(hasLoneCr('a\r\nb\r\n')).toBe(false)
    expect(hasLoneCr('a\nb')).toBe(false)
  })
})

describe('decodeLinkedBytes / sniffLinkedBytes / encodeMarkdown', () => {
  it('keeps the UTF-8 BOM through decode + encode', () => {
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('# Hola ñ\n', 'utf-8')])
    const decoded = decodeLinkedBytes(bytes)
    expect(decoded).toEqual({ ok: true, text: '# Hola ñ\n', bom: true })
    if (!decoded.ok) return
    expect(encodeMarkdown(decoded.text, decoded.bom).equals(bytes)).toBe(true)
  })

  it('no BOM stays without BOM', () => {
    const bytes = Buffer.from('plain', 'utf-8')
    const decoded = decodeLinkedBytes(bytes)
    expect(decoded).toEqual({ ok: true, text: 'plain', bom: false })
    expect(encodeMarkdown('plain', false).equals(bytes)).toBe(true)
  })

  it('rejects invalid UTF-8 instead of mangling it', () => {
    expect(decodeLinkedBytes(Buffer.from([0x61, 0xff, 0xfe, 0x62]))).toEqual({ ok: false, error: 'invalidUtf8' })
  })

  it('a NUL byte anywhere makes the file binary (PNG, UTF-16, NUL deep in the file)', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])
    expect(decodeLinkedBytes(png)).toEqual({ ok: false, error: 'binary' })
    expect(decodeLinkedBytes(Buffer.from('a\u0000b', 'utf16le'))).toEqual({ ok: false, error: 'binary' })
    expect(decodeLinkedBytes(Buffer.concat([Buffer.from('x'.repeat(20000)), Buffer.from([0])]))).toEqual({ ok: false, error: 'binary' })
  })

  it('sniffs the start of a big file: NUL = binary, invalid UTF-8, a character cut at the end is fine', () => {
    expect(sniffLinkedBytes(Buffer.from('plain text\n'), true)).toBeNull()
    expect(sniffLinkedBytes(Buffer.from([0x61, 0x00, 0x62]))).toBe('binary')
    expect(sniffLinkedBytes(Buffer.from([0x61, 0xff, 0x62]))).toBe('invalidUtf8')
    const cut = Buffer.from('añ', 'utf-8').subarray(0, 2) // 'a' + the first byte of 'ñ'
    expect(sniffLinkedBytes(cut, false)).toBeNull()
    expect(sniffLinkedBytes(cut, true)).toBe('invalidUtf8')
  })

  it('hashes bytes (sha256 hex)', () => {
    expect(hashBytes(Buffer.from('a'))).toMatch(/^[0-9a-f]{64}$/)
    expect(hashBytes(Buffer.from('a'))).not.toBe(hashBytes(Buffer.from('b')))
  })
})

describe('fingerprint decisions', () => {
  it('an event whose content hash is the known one is an echo (not a time window)', () => {
    expect(decideDiskEvent('h1', 'h1')).toBe('echo')
    expect(decideDiskEvent('h1', 'h2')).toBe('external')
    expect(decideDiskEvent(null, 'h2')).toBe('external')
    expect(decideDiskEvent('h1', null)).toBe('missing')
  })

  it('only writes over the version the edit was based on', () => {
    expect(decideWrite('h1', 'h1')).toBe('write')
    expect(decideWrite('h1', 'h2')).toBe('conflict')
    expect(decideWrite(null, 'h2')).toBe('conflict')
    expect(decideWrite('h1', null)).toBe('missing')
  })
})

describe('paths', () => {
  it('recognizes markdown paths (any other linked file is plain text)', () => {
    expect(isMarkdownPath('C:\\a\\README.md')).toBe(true)
    expect(isMarkdownPath('/a/b.MARKDOWN')).toBe(true)
    expect(isMarkdownPath('/a/b.txt')).toBe(false)
    expect(isMarkdownPath('/a/md')).toBe(false)
    expect(isMarkdownPath(42)).toBe(false)
  })

  it('compares paths case-insensitively on Windows and macOS only', () => {
    expect(linkedPathKey('C:\\Proj\\README.md', 'win32')).toBe(linkedPathKey('c:\\proj\\readme.MD', 'win32'))
    expect(linkedPathKey('C:/Proj/./docs/../README.md', 'win32')).toBe(linkedPathKey('C:\\Proj\\README.md', 'win32'))
    expect(linkedPathKey('/Users/a/Doc.md', 'darwin')).toBe(linkedPathKey('/users/a/doc.md', 'darwin'))
    expect(linkedPathKey('/home/a/Doc.md', 'linux')).not.toBe(linkedPathKey('/home/a/doc.md', 'linux'))
  })

  it('isPathInside', () => {
    expect(isPathInside('C:\\notes\\a\\b.md', 'C:\\Notes', 'win32')).toBe(true)
    expect(isPathInside('C:\\notes-other\\b.md', 'C:\\notes', 'win32')).toBe(false)
    expect(isPathInside('/home/u/noteflow-notes/x.md', '/home/u/noteflow-notes', 'linux')).toBe(true)
    expect(isPathInside('/home/u/x.md', '/home/u/noteflow-notes', 'linux')).toBe(false)
  })

  it('default title = file name, without the extension only for Markdown', () => {
    expect(defaultLinkedTitle('C:\\p\\README.md', 'win32')).toBe('README')
    expect(defaultLinkedTitle('/p/guide.markdown', 'linux')).toBe('guide')
    expect(defaultLinkedTitle('C:\\p\\config.json', 'win32')).toBe('config.json')
    expect(defaultLinkedTitle('/p/.env', 'linux')).toBe('.env')
  })

  it('linked ids and their cache file names', () => {
    expect(isLinkedNoteId('lnk:abc')).toBe(true)
    expect(isLinkedNoteId('abc12345')).toBe(false)
    expect(isLinkedNoteId('lnk:')).toBe(false)
    expect(linkedCacheFileName('lnk:Ab-_9z')).toBe('Ab-_9z.md')
  })
})

describe('sanitizeLinkedRegistry', () => {
  const now = '2026-11-15T10:00:00.000Z'
  it('drops invalid entries and dedupes by id and by path (any text file type is valid)', () => {
    const reg = sanitizeLinkedRegistry({
      version: 1,
      notes: [
        { id: 'lnk:a', path: 'C:\\p\\README.md', title: 'Readme', created: '2026-01-01T00:00:00.000Z', updated: 'x', favorited: true, group: 'g1', folder: 'f1' },
        { id: 'lnk:b', path: 'c:\\P\\readme.md', title: 'dup path' },
        { id: 'lnk:a', path: 'C:\\p\\other.md' },
        { id: 'abc12345', path: 'C:\\p\\x.md' },
        { id: 'lnk:c', path: 'relative.md' },
        { id: 'lnk:d', path: 'C:\\p\\notes.txt' },
        { id: 'lnk:e', path: 'C:\\p\\e.md', folder: 'f-without-group', archived: 'yes', isRawMode: true, known: { hash: 'nothex' } },
        null,
        'junk',
      ],
    }, 'win32', now)
    expect(reg.notes.map((n) => n.id)).toEqual(['lnk:a', 'lnk:d', 'lnk:e'])
    // A title missing from an entry of a non-Markdown file keeps the extension.
    expect(reg.notes[1]).toMatchObject({ path: 'C:\\p\\notes.txt', title: 'notes.txt' })
    expect(reg.notes[0]).toMatchObject({ title: 'Readme', favorited: true, group: 'g1', folder: 'f1', created: '2026-01-01T00:00:00.000Z', updated: '2026-01-01T00:00:00.000Z' })
    const e = reg.notes[2]
    expect(e.folder).toBeUndefined()
    expect(e.archived).toBeUndefined()
    expect(e.isRawMode).toBe(true)
    expect(e.known).toBeUndefined()
    expect(e.title).toBe('e')
    expect(e.created).toBe(now)
  })

  it('a missing or broken file is an empty registry', () => {
    expect(sanitizeLinkedRegistry(null).notes).toEqual([])
    expect(sanitizeLinkedRegistry('x').notes).toEqual([])
    expect(sanitizeLinkedRegistry({ notes: 'x' }).notes).toEqual([])
  })

  it('keeps a valid fingerprint', () => {
    const hash = 'a'.repeat(64)
    const reg = sanitizeLinkedRegistry([{ id: 'lnk:a', path: '/p/a.md', known: { hash, size: 10, mtimeMs: 5 } }], 'linux')
    expect(reg.notes[0].known).toEqual({ hash, size: 10, mtimeMs: 5 })
  })
})

describe('assets', () => {
  const now = new Date(2026, 10, 15, 9, 8, 7)
  it('names a pasted image after its type and time, unique in the folder', () => {
    expect(linkedAssetFileName('image.png', 'image/png', () => false, now)).toBe('image-20261115-090807.png')
    expect(linkedAssetFileName('', 'image/jpeg', () => false, now)).toBe('image-20261115-090807.jpg')
    expect(linkedAssetFileName('Captura de pantalla (1).PNG', 'image/png', () => false, now)).toBe('captura-de-pantalla-1-20261115-090807.png')
    const taken = new Set(['image-20261115-090807.png', 'image-20261115-090807-2.png'])
    expect(linkedAssetFileName('x.png', 'image/png', (n) => taken.has(n), now)).toBe('x-20261115-090807.png')
    expect(linkedAssetFileName('image.png', 'image/png', (n) => taken.has(n), now)).toBe('image-20261115-090807-3.png')
  })

  it('resolves relative image paths against the linked file folder only', () => {
    expect(resolveLinkedAsset('/p/docs/README.md', 'assets/a.png', 'linux')).toBe('/p/docs/assets/a.png')
    expect(resolveLinkedAsset('/p/docs/README.md', './img/b.svg', 'linux')).toBe('/p/docs/img/b.svg')
    expect(resolveLinkedAsset('/p/docs/README.md', '../static/c.jpg', 'linux')).toBe('/p/static/c.jpg')
    expect(resolveLinkedAsset('/p/docs/README.md', 'my%20shot.png', 'linux')).toBe('/p/docs/my shot.png')
    expect(resolveLinkedAsset('/p/docs/README.md', 'my%20shot.png', 'linux', false)).toBe('/p/docs/my%20shot.png')
    expect(resolveLinkedAsset('C:\\p\\README.md', 'assets/a.png', 'win32')).toBe('C:\\p\\assets\\a.png')
  })

  it('never resolves URLs, absolute paths or non-images', () => {
    for (const src of ['https://x.com/a.png', 'data:image/png;base64,AA', '/etc/a.png', 'C:\\a.png', '//host/a.png', 'notes.md', 'a.exe', 'nflinked://n/x/y']) {
      expect(resolveLinkedAsset('/p/README.md', src, 'linux')).toBeNull()
    }
  })
})

describe('resolveLinkedAsset — checks the DECODED path too', () => {
  it('rejects absolute, drive, UNC, ADS and NUL paths hidden behind percent-encoding', () => {
    const bad = [
      '%2Fetc%2Fpasswd.png', '%2F%2Fhost%2Fa.png', 'C%3A%5Ca.png', 'C%3Aa.png', '%5C%5Chost%5Cshare%5Ca.png',
      '%5Ca.png', 'a.png%3Astream', 'a%00.png', 'a.png\0', 'C:a.png', 'a.png:x', 'https%3A%2F%2Fx%2Fa.png',
    ]
    for (const src of bad) {
      expect(resolveLinkedAsset('/p/docs/README.md', src, 'linux'), src).toBeNull()
      expect(resolveLinkedAsset('C:\\p\\README.md', src, 'win32'), src).toBeNull()
    }
  })

  it('allows going up from the .md folder, images only', () => {
    expect(resolveLinkedAsset('/p/docs/README.md', '..%2F..%2Fimg%2Fa.png', 'linux')).toBe('/img/a.png')
    expect(resolveLinkedAsset('/p/docs/README.md', '../secret.txt', 'linux')).toBeNull()
    expect(resolveLinkedAsset('/p/docs/README.md', 'a.png%2F..%2Fsecret.txt', 'linux')).toBeNull()
  })
})

describe('manual order: linked ids stay local', () => {
  it('splits the synced part from the local full lists', () => {
    expect(splitLinkedOrder({ ungrouped: ['a', 'lnk:x', 'b'], favorites: ['c'], 'group:g': ['lnk:y'] })).toEqual({
      synced: { ungrouped: ['a', 'b'], favorites: ['c'] },
      local: { ungrouped: ['a', 'lnk:x', 'b'], 'group:g': ['lnk:y'] },
    })
  })

  it('merges back after the regular note each linked one followed', () => {
    const local = { ungrouped: ['a', 'lnk:x', 'lnk:z', 'b', 'lnk:w'], 'group:g': ['lnk:y'] }
    expect(mergeLinkedOrder({ ungrouped: ['a', 'b'] }, local)).toEqual({ ungrouped: ['a', 'lnk:x', 'lnk:z', 'b', 'lnk:w'], 'group:g': ['lnk:y'] })
    // Another device reordered / removed regular notes and added one.
    expect(mergeLinkedOrder({ ungrouped: ['c', 'b', 'a'] }, local).ungrouped).toEqual(['c', 'b', 'lnk:w', 'a', 'lnk:x', 'lnk:z'])
    expect(mergeLinkedOrder({ ungrouped: ['b'] }, { ungrouped: ['a', 'lnk:x', 'b'] }).ungrouped).toEqual(['lnk:x', 'b'])
    // Never trusts linked ids in the synced map.
    expect(mergeLinkedOrder({ ungrouped: ['lnk:q', 'a'] }, {}).ungrouped).toEqual(['a'])
  })

  it('sanitizes order maps and keeps the registry order', () => {
    expect(sanitizeNoteOrder({ a: ['x', 'x', 3, ''], b: 'no', '': ['y'] })).toEqual({ a: ['x'] })
    expect(sanitizeLinkedRegistry({ notes: [], order: { ungrouped: ['lnk:a', 'b'] } }).order).toEqual({ ungrouped: ['lnk:a', 'b'] })
  })

  it('sanitizes drafts', () => {
    expect(sanitizeLinkedDraft({ body: 'x', baseHash: 'a'.repeat(64) })).toEqual({ body: 'x', baseHash: 'a'.repeat(64) })
    expect(sanitizeLinkedDraft({ body: 'x', baseHash: 'nope' })).toEqual({ body: 'x', baseHash: null })
    expect(sanitizeLinkedDraft({ body: 3 })).toBeNull()
    expect(linkedDraftFileName('lnk:ab')).toBe('ab.draft.json')
  })
})

describe('imageMimeOf', () => {
  it('maps image extensions only', () => {
    expect(imageMimeOf('a.PNG')).toBe('image/png')
    expect(imageMimeOf('a.jpeg')).toBe('image/jpeg')
    expect(imageMimeOf('a.jpg')).toBe('image/jpeg')
    expect(imageMimeOf('a.svg')).toBe('image/svg+xml')
    expect(imageMimeOf('a.md')).toBeNull()
  })
})

describe('markdownImageSrcs', () => {
  it('lists image sources (titles, <…> sources), not code spans nor reference images', () => {
    const md = '![a](img/a.png "T") ![b](<img/b c.png>) ![c](x.png \'t\')\n`![d](d.png)` ![e][ref] [link](l.png)'
    expect(markdownImageSrcs(md)).toEqual(['img/a.png', 'img/b c.png', 'x.png'])
  })
})

// "Open with NoteFlow": transient linked notes (closed → unlinked, never the file).
describe('transient linked notes', () => {
  it('sanitizing keeps the flag only when true; registries without it stay permanent', () => {
    const reg = sanitizeLinkedRegistry({
      notes: [
        { id: 'lnk:a', path: '/p/a.md', transient: true },
        { id: 'lnk:b', path: '/p/b.md', transient: 'yes' },
        { id: 'lnk:c', path: '/p/c.md' },
      ],
    }, 'linux')
    expect(reg.notes.map((n) => [n.id, n.transient])).toEqual([['lnk:a', true], ['lnk:b', undefined], ['lnk:c', undefined]])
    expect('transient' in reg.notes[1]).toBe(false)
  })

  it('startup drops the transient notes without a draft (and their place in the local order)', () => {
    const notes = [
      { id: 'lnk:keep', path: '/p/k.md', title: 'k', created: 'x', updated: 'x' },
      { id: 'lnk:gone', path: '/p/g.md', title: 'g', created: 'x', updated: 'x', transient: true },
      { id: 'lnk:dirty', path: '/p/d.md', title: 'd', created: 'x', updated: 'x', transient: true },
    ]
    const order = { ungrouped: ['n1', 'lnk:gone', 'lnk:keep'], 'group:g': ['n2', 'lnk:gone'] }
    const out = dropTransientRecords({ notes, order }, (id) => id === 'lnk:dirty')
    expect(out.dropped).toEqual(['lnk:gone'])
    expect(out.notes.map((n) => n.id)).toEqual(['lnk:keep', 'lnk:dirty'])
    expect(out.notes[1].transient).toBe(true) // kept, still transient
    // A local list left without any linked id isn't worth keeping.
    expect(out.order).toEqual({ ungrouped: ['n1', 'lnk:keep'] })
  })

  it('startup leaves a registry without transient notes as it was', () => {
    const reg = { notes: [{ id: 'lnk:a', path: '/p/a.md', title: 'a', created: 'x', updated: 'x' }], order: { ungrouped: ['lnk:a'] } }
    const out = dropTransientRecords(reg, () => false)
    expect(out.dropped).toEqual([])
    expect(out.notes).toBe(reg.notes)
    expect(out.order).toBe(reg.order)
  })

  it('main discards only a transient note without a draft that no other window shows', () => {
    const free = { hasDraft: false, openInOtherWindow: false }
    expect(canDiscardTransient({ transient: true }, free)).toBe(true)
    expect(canDiscardTransient({}, free)).toBe(false)
    expect(canDiscardTransient(undefined, free)).toBe(false)
    expect(canDiscardTransient({ transient: true }, { ...free, hasDraft: true })).toBe(false)
    expect(canDiscardTransient({ transient: true }, { ...free, openInOtherWindow: true })).toBe(false)
  })
})
