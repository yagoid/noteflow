// Linked notes — the IO half in main (electron/linkedNotes.ts) on real temp files:
// linking (validation, dedupe), writing only over the known version (conflict
// otherwise), byte-exact preservation of what the editor doesn't edit, the
// missing / back states, unlinking never touching the file, and assets/.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import * as linked from '../../electron/linkedNotes'
import { linkedCacheFileName } from '../../electron/linkedNotesLogic'

let root: string
let userData: string
let notesDir: string
let project: string
let broadcasts: Array<{ filePath: string; senderId?: number }>

function init() {
  return linked.init({
    userDataDir: userData,
    notesDir,
    broadcast: (filePath, senderId) => broadcasts.push({ filePath, senderId }),
  })
}

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-linked-'))
  userData = path.join(root, 'userData')
  notesDir = path.join(root, 'noteflow-notes')
  project = path.join(root, 'project')
  fs.mkdirSync(userData, { recursive: true })
  fs.mkdirSync(notesDir, { recursive: true })
  fs.mkdirSync(project, { recursive: true })
  broadcasts = []
  await init()
})

afterEach(() => {
  linked.__test.setDirProbe(async (dir) => { try { return fs.statSync(dir).isDirectory() } catch { return false } })
  fs.rmSync(root, { recursive: true, force: true })
})

const write = (name: string, content: string | Buffer) => {
  const p = path.join(project, name)
  fs.writeFileSync(p, content)
  return p
}

// As the user would: main grants the picked / dropped paths, then the renderer links them.
const link = (paths: string[]) => { linked.grantLinkPaths(paths); return linked.link(paths) }
const relocate = (id: string, p: string) => { linked.grantLinkPaths([p]); return linked.relocate(id, p) }

describe('linkedNotes (IO)', () => {
  it('links a file once, validates the path and persists the registry outside the notes dir', async () => {
    const readme = write('README.md', '# Project\n')
    const first = await link([readme, path.join(project, 'nope.md'), 'relative/x.txt', path.join(notesDir, 'a.md')])
    expect(first.linked).toHaveLength(1)
    expect(first.linked[0]).toMatchObject({ title: 'README', body: '# Project', status: 'ok', sectionName: 'README.md' })
    expect(first.errors.map((e) => e.error).sort()).toEqual(['insideNotesDir', 'notFound', 'invalidPath'].sort())

    fs.writeFileSync(path.join(notesDir, 'inside.md'), 'x')
    expect((await link([path.join(notesDir, 'inside.md')])).errors[0].error).toBe('insideNotesDir')

    const again = await link([readme])
    expect(again.linked).toHaveLength(0)
    expect(again.existing[0].id).toBe(first.linked[0].id)

    expect(fs.existsSync(path.join(userData, 'linked-notes.json'))).toBe(true)
    expect(fs.readdirSync(notesDir)).toEqual(['inside.md'])
    // Survives a restart.
    await init()
    expect(linked.list().map((n) => n.id)).toEqual([first.linked[0].id])
  })

  it('writes only over the known version, preserving frontmatter, BOM and CRLF', async () => {
    const original = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('---\r\ntitle: Doc\r\n---\r\n# Doc\r\nold\r\n', 'utf-8'),
    ])
    const file = write('doc.md', original)
    const [note] = (await link([file])).linked
    expect(note.body).toBe('# Doc\nold')

    const res = await linked.writeBody(note.id, '# Doc\nnew', note.hash, 7)
    expect(res.ok).toBe(true)
    const bytes = fs.readFileSync(file)
    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]))
    expect(bytes.subarray(3).toString('utf-8')).toBe('---\r\ntitle: Doc\r\n---\r\n# Doc\r\nnew\r\n')
    expect(broadcasts.at(-1)).toEqual({ filePath: note.path, senderId: 7 })
    // No temp file left behind.
    expect(fs.readdirSync(project)).toEqual(['doc.md'])

    // Writing the same body again changes nothing on disk.
    const mtime = fs.statSync(file).mtimeMs
    const same = await linked.writeBody(note.id, '# Doc\nnew', res.ok ? res.hash : null)
    expect(same.ok).toBe(true)
    expect(fs.statSync(file).mtimeMs).toBe(mtime)
  })

  it('reports a conflict instead of overwriting a file changed outside', async () => {
    const file = write('a.md', 'v1\n')
    const [note] = (await link([file])).linked
    fs.writeFileSync(file, 'v2 from outside\n')
    const res = await linked.writeBody(note.id, 'mine', note.hash)
    expect(res).toEqual({ ok: false, reason: 'conflict', disk: { body: 'v2 from outside', hash: expect.any(String) } })
    expect(fs.readFileSync(file, 'utf-8')).toBe('v2 from outside\n')
    // Writing over the version the user has now seen is allowed ("keep mine").
    if (res.ok || res.reason !== 'conflict') return
    expect((await linked.writeBody(note.id, 'mine', res.disk.hash)).ok).toBe(true)
    expect(fs.readFileSync(file, 'utf-8')).toBe('mine\n')
  })

  it('missing → read-only with the cached content, back when the file returns', async () => {
    const file = write('m.md', 'cached body\n')
    const [note] = (await link([file])).linked
    fs.rmSync(file)
    await linked.recheck()
    expect(linked.get(note.id)).toMatchObject({ status: 'missing', body: 'cached body', hash: null })
    expect(await linked.writeBody(note.id, 'x', note.hash)).toEqual({ ok: false, reason: 'missing' })
    // Restart without the file: the cache keeps it visible.
    await init()
    expect(linked.get(note.id)).toMatchObject({ status: 'missing', body: 'cached body' })
    fs.writeFileSync(file, 'cached body\n')
    await linked.recheck()
    expect(linked.get(note.id)).toMatchObject({ status: 'ok', body: 'cached body' })
  })

  it('a file that turns invalid UTF-8 / binary opens read-only and is never rewritten', async () => {
    const file = write('bin.md', 'text\n')
    const [note] = (await link([file])).linked
    for (const [bytes, error] of [[Buffer.from([0x61, 0xff, 0x62]), 'invalidUtf8'], [Buffer.from([0x61, 0x00, 0x62]), 'binary']] as const) {
      fs.writeFileSync(file, bytes)
      await linked.recheck()
      expect(linked.get(note.id)).toMatchObject({ status: 'error', error, body: 'text' })
      expect(await linked.writeBody(note.id, 'x', null)).toMatchObject({ ok: false, reason: 'error' })
      expect(fs.readFileSync(file)).toEqual(bytes)
    }
  })

  it('only links paths the user chose (granted), each once', async () => {
    const config = write('config.json', '{}\n')
    const bashrc = write('.bashrc', 'alias ls=ls\n')
    // A renderer asking for a path nobody granted (Markdown or not) gets nothing.
    expect(await linked.link([bashrc, path.join(project, 'README.md')])).toMatchObject({
      linked: [], errors: [{ path: bashrc, error: 'notGranted' }, { path: path.join(project, 'README.md'), error: 'notGranted' }],
    })
    expect(fs.readdirSync(userData)).not.toContain('linked-notes.json')
    // Granted (another case/separator form of the same path still matches on Windows/macOS).
    linked.grantLinkPaths([process.platform === 'win32' ? config.toUpperCase() : config])
    const first = await linked.link([config])
    expect(first.linked).toHaveLength(1)
    // Single use: unlinked and asked again without a new grant → refused.
    linked.unlink(first.linked[0].id)
    expect((await linked.link([config])).errors).toEqual([{ path: config, error: 'notGranted' }])
    // Relocate too.
    const [note] = (await link([write('a.txt', 'a\n')])).linked
    expect(await linked.relocate(note.id, bashrc)).toEqual({ ok: false, error: 'notGranted' })
    expect(linked.get(note.id)?.path).toBe(path.join(project, 'a.txt'))
  })

  it('a plain-text file with old Mac line breaks (lone CR) opens read-only and is never rewritten; Markdown is not affected', async () => {
    const mac = write('old.txt', 'one\rtwo\r')
    const [note] = (await link([mac])).linked
    expect(note).toMatchObject({ status: 'error', error: 'loneCr', body: 'one\rtwo\r', hash: expect.any(String) })
    expect(await linked.writeBody(note.id, 'one\ntwo', note.hash)).toEqual({ ok: false, reason: 'error', error: 'loneCr' })
    expect(fs.readFileSync(mac, 'utf-8')).toBe('one\rtwo\r')
    // CRLF is not a lone CR.
    expect((await link([write('win.txt', 'a\r\nb\r\n')])).linked[0]).toMatchObject({ status: 'ok' })
    // A Markdown file keeps its behavior (documented limitation).
    expect((await link([write('mac.md', 'one\rtwo\r')])).linked[0]).toMatchObject({ status: 'ok' })
  })

  it('links any text file, refuses binary and non-UTF-8 files', async () => {
    const png = write('logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]))
    const fake = write('fake.txt', Buffer.concat([Buffer.from('looks like text'), Buffer.from([0]), Buffer.from('then not')]))
    const latin1 = write('latin1.txt', Buffer.from([0x63, 0x61, 0x66, 0xe9])) // "café" in Latin-1
    const json = write('config.json', '{ "a": 1 }\n')
    const res = await link([png, fake, latin1, json])
    expect(res.errors).toEqual([
      { path: png, error: 'binary' },
      { path: fake, error: 'binary' },
      { path: latin1, error: 'invalidUtf8' },
    ])
    expect(res.linked).toHaveLength(1)
    // Title keeps the extension; plain text is always in text mode (even if the registry says no).
    expect(res.linked[0]).toMatchObject({ title: 'config.json', sectionName: 'config.json', body: '{ "a": 1 }', status: 'ok', isRawMode: true })
    expect(linked.updateMeta(res.linked[0].id, { isRawMode: false })?.isRawMode).toBe(true)
  })

  it('a big text file links (read-only, too large); a big binary one is refused from its first bytes', async () => {
    const bigText = write('big.log', 'line of a log\n'.repeat(200_000)) // ~2.8 MB
    const bigBin = write('big.bin', Buffer.concat([Buffer.from([0]), Buffer.alloc(3 * 1024 * 1024, 0x41)]))
    const res = await link([bigText, bigBin])
    expect(res.errors).toEqual([{ path: bigBin, error: 'binary' }])
    expect(res.linked[0]).toMatchObject({ title: 'big.log', status: 'error', error: 'tooLarge' })
  })

  it('a non-Markdown file has no frontmatter: a .yaml keeps its `---` header, byte-exact with BOM + CRLF', async () => {
    const original = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('---\r\nname: ci\r\n---\r\nsteps:\r\n  - run: test\r\n', 'utf-8'),
    ])
    const file = write('ci.yaml', original)
    const [note] = (await link([file])).linked
    expect(note.body).toBe('---\nname: ci\n---\nsteps:\n  - run: test')
    const res = await linked.writeBody(note.id, note.body.replace('run: test', 'run: build'), note.hash)
    expect(res.ok).toBe(true)
    expect(fs.readFileSync(file).equals(Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('---\r\nname: ci\r\n---\r\nsteps:\r\n  - run: build\r\n', 'utf-8'),
    ]))).toBe(true)
  })

  it('a non-Markdown file takes no images (assets/, nflinked:, data URIs)', async () => {
    fs.mkdirSync(path.join(project, 'img'), { recursive: true })
    fs.writeFileSync(path.join(project, 'img', 'logo.png'), Buffer.from([1, 2, 3]))
    const file = write('notes.txt', '![logo](img/logo.png)\n')
    const [note] = (await link([file])).linked
    expect(await linked.saveAsset(note.id, 'shot.png', 'image/png', new Uint8Array([1, 2, 3]))).toEqual({ ok: false, error: 'notMarkdown' })
    expect(fs.existsSync(path.join(project, 'assets'))).toBe(false)
    expect(await linked.resolveAsset(note.id, 'img/logo.png')).toBeNull()
    expect(await linked.assetDataUri(note.id, 'img/logo.png')).toBeNull()
  })

  it('unlink drops the note and its cache, never the file; the note-folder guard refuses .md', async () => {
    const file = write('keep.md', 'keep me\n')
    const [note] = (await link([file])).linked
    expect(linked.isLinkedPath(file)).toBe(true)
    expect(linked.unlink(note.id)).toBe(true)
    expect(fs.readFileSync(file, 'utf-8')).toBe('keep me\n')
    expect(linked.get(note.id)).toBeNull()
    expect(linked.isLinkedPath(file)).toBe(false)
    expect(fs.readdirSync(path.join(userData, 'linked-notes-cache'))).toEqual([])
  })

  it('metadata stays local (title alias never renames the file)', async () => {
    const file = write('t.md', 'x\n')
    const [note] = (await link([file])).linked
    const updated = linked.updateMeta(note.id, { title: 'My alias', group: 'g1', folder: 'f1', favorited: true })
    expect(updated).toMatchObject({ title: 'My alias', group: 'g1', folder: 'f1', favorited: true })
    expect(fs.existsSync(file)).toBe(true)
    expect(fs.readFileSync(file, 'utf-8')).toBe('x\n')
    expect(linked.updateMeta(note.id, { group: '' })?.folder).toBeUndefined()
  })

  it('relocate keeps the note (id, alias) and points it at the new file', async () => {
    const a = write('a.md', 'A\n')
    const b = write('b.md', 'B\n')
    const [note] = (await link([a])).linked
    linked.updateMeta(note.id, { title: 'Alias' })
    const res = await relocate(note.id, b)
    expect(res.ok && res.note).toMatchObject({ id: note.id, title: 'Alias', body: 'B', path: b })
    const [other] = (await link([a])).linked
    expect(await relocate(note.id, a)).toEqual({ ok: false, error: 'alreadyLinked' })
    expect(other.id).not.toBe(note.id)
  })

  it('copies images to assets/ next to the file and serves only relative images', async () => {
    const file = write('img.md', 'x\n')
    const [note] = (await link([file])).linked
    const saved = await linked.saveAsset(note.id, 'shot.png', 'image/png', new Uint8Array([1, 2, 3]))
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    expect(saved.relPath).toMatch(/^assets\/shot-\d{8}-\d{6}\.png$/)
    expect(fs.readFileSync(path.join(project, saved.relPath))).toEqual(Buffer.from([1, 2, 3]))
    expect(await linked.resolveAsset(note.id, saved.relPath)).toBe(path.join(project, saved.relPath))
    expect(await linked.resolveAsset(note.id, 'img.md')).toBeNull()
    expect(await linked.resolveAsset(note.id, 'assets/missing.png')).toBeNull()
    expect(await linked.saveAsset(note.id, 'a.txt', 'text/plain', new Uint8Array([1]))).toEqual({ ok: false, error: 'notImage' })
  })

  it('never serves an absolute / encoded-absolute / UNC / drive path, but allows ../ to an image', async () => {
    fs.mkdirSync(path.join(root, 'img'))
    fs.writeFileSync(path.join(root, 'img', 'up.png'), Buffer.from([1]))
    const file = write('esc.md', 'x\n')
    const [note] = (await link([file])).linked
    expect(await linked.resolveAsset(note.id, '../img/up.png')).toBe(path.join(root, 'img', 'up.png'))
    const outside = path.join(root, 'img', 'up.png')
    for (const src of [outside, encodeURIComponent(outside), '%2Fetc%2Fa.png', 'C%3A%5Ca.png', '%5C%5Chost%5Cshare%5Ca.png', 'a%00.png', 'up.png:stream']) {
      expect(await linked.resolveAsset(note.id, src)).toBeNull()
    }
  })

  it('starts as checking from the cache without waiting for the files, then reads them', async () => {
    const file = write('c.md', 'from disk\n')
    const [note] = (await link([file])).linked
    fs.writeFileSync(file, 'changed while closed\n')
    const pending = init()
    expect(linked.get(note.id)).toMatchObject({ status: 'checking', body: 'from disk', hash: null })
    await pending
    expect(linked.get(note.id)).toMatchObject({ status: 'ok', body: 'changed while closed' })
  })

  it('keeps a draft of unwritten edits across restarts until a write lands', async () => {
    const file = write('d.md', 'v1\n')
    const [note] = (await link([file])).linked
    linked.setDraft(note.id, { body: 'unsaved', baseHash: note.hash })
    await init()
    expect(linked.get(note.id)?.draft).toEqual({ body: 'unsaved', baseHash: note.hash })
    // The draft is never written by itself; a hash-checked write clears it.
    expect(fs.readFileSync(file, 'utf-8')).toBe('v1\n')
    expect((await linked.writeBody(note.id, 'unsaved', note.hash)).ok).toBe(true)
    expect(linked.get(note.id)?.draft).toBeUndefined()
    await init()
    expect(linked.get(note.id)?.draft).toBeUndefined()
    linked.setDraft(note.id, { body: 'again', baseHash: null })
    linked.setDraft(note.id, null)
    await init()
    expect(linked.get(note.id)?.draft).toBeUndefined()
  })

  it('keeps linked ids out of note-order.json and merges them back locally', async () => {
    const file = write('o.md', 'x\n')
    const [note] = (await link([file])).linked
    const synced = linked.splitNoteOrder({ ungrouped: ['a', note.id, 'b'], 'group:g': ['c'] })
    expect(synced).toEqual({ ungrouped: ['a', 'b'], 'group:g': ['c'] })
    // Another device reordered the regular notes: the linked one stays after 'a'.
    expect(linked.mergeNoteOrder({ ungrouped: ['b', 'a'], 'group:g': ['c'] })).toEqual({ ungrouped: ['b', 'a', note.id], 'group:g': ['c'] })
    await init()
    expect(linked.mergeNoteOrder(synced).ungrouped).toEqual(['a', note.id, 'b'])
    // Ids an earlier build wrote to the synced file move to the local order.
    expect(linked.adoptLinkedIdsFromSynced({ favorites: [note.id, 'z'] })).toEqual({ favorites: ['z'] })
    expect(linked.mergeNoteOrder({ favorites: ['z'] }).favorites).toEqual([note.id, 'z'])
    expect(linked.adoptLinkedIdsFromSynced({ favorites: ['z'] })).toBeNull()
    linked.unlink(note.id)
    expect(linked.mergeNoteOrder({ ungrouped: ['a', 'b'] }).ungrouped).toEqual(['a', 'b'])
  })

  it('keeps a draft when another write lands, consumes it only when its own content is written', async () => {
    const file = write('k.md', 'v1' + String.fromCharCode(10))
    const [note] = (await link([file])).linked
    linked.setDraft(note.id, { body: 'mine', baseHash: note.hash })
    // The agent / another window writes something else: the draft stays.
    const other = await linked.writeBody(note.id, 'theirs', note.hash)
    expect(other.ok).toBe(true)
    expect(linked.get(note.id)?.draft).toEqual({ body: 'mine', baseHash: note.hash })
    await init()
    expect(linked.get(note.id)?.draft?.body).toBe('mine')
    if (!other.ok) return
    expect((await linked.writeBody(note.id, 'mine', other.hash)).ok).toBe(true)
    expect(linked.get(note.id)?.draft).toBeUndefined()
  })

  it('relocating keeps the draft of unwritten edits (it will show as a conflict)', async () => {
    const a = write('ra.md', 'A' + String.fromCharCode(10))
    const b = write('rb.md', 'B' + String.fromCharCode(10))
    const [note] = (await link([a])).linked
    linked.setDraft(note.id, { body: 'unsaved', baseHash: note.hash })
    const res = await relocate(note.id, b)
    expect(res.ok && res.note.draft).toEqual({ body: 'unsaved', baseHash: note.hash })
    expect(res.ok && res.note.hash).not.toBe(note.hash)
  })

  it('unlinking with a write queued never recreates the cache nor touches the file', async () => {
    const file = write('u.md', 'v1' + String.fromCharCode(10))
    const [note] = (await link([file])).linked
    const pending = linked.writeBody(note.id, 'late', note.hash)
    linked.unlink(note.id)
    expect(await pending).toEqual({ ok: false, reason: 'notLinked' })
    expect(fs.readdirSync(path.join(userData, 'linked-notes-cache'))).toEqual([])
    expect(fs.readFileSync(file, 'utf-8')).toBe('v1' + String.fromCharCode(10))
  })

  it('watches the folder of a missing file: it reappearing at the same path is seen without a recheck', async () => {
    const file = write('back.md', 'v1' + String.fromCharCode(10))
    const [note] = (await link([file])).linked
    fs.rmSync(file)
    await init() // starts with the file missing
    expect(linked.get(note.id)?.status).toBe('missing')
    fs.writeFileSync(file, 'back again' + String.fromCharCode(10))
    const deadline = Date.now() + 5000
    while (linked.get(note.id)?.status !== 'ok' && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50))
    expect(linked.get(note.id)).toMatchObject({ status: 'ok', body: 'back again' })
  })

  it('serves relative images as data URIs for copies, with the same checks as nflinked:', async () => {
    fs.mkdirSync(path.join(project, 'img'))
    fs.writeFileSync(path.join(project, 'img', 'logo.png'), Buffer.from([1, 2, 3]))
    fs.writeFileSync(path.join(project, 'notes.txt'), 'secret')
    const file = write('dup.md', '![logo](img/logo.png)')
    const [note] = (await link([file])).linked
    expect(await linked.assetDataUri(note.id, 'img/logo.png')).toBe('data:image/png;base64,' + Buffer.from([1, 2, 3]).toString('base64'))
    for (const src of ['notes.txt', path.join(project, 'img', 'logo.png'), 'img/none.png', '%2Fimg%2Flogo.png']) {
      expect(await linked.assetDataUri(note.id, src)).toBeNull()
    }
    expect(await linked.assetDataUri('lnk:unknown', 'img/logo.png')).toBeNull()
  })

  it('only serves images the note really references (no reading other images of the drive)', async () => {
    fs.mkdirSync(path.join(root, 'elsewhere'))
    fs.writeFileSync(path.join(root, 'elsewhere', 'secret.png'), Buffer.from([9]))
    fs.mkdirSync(path.join(project, 'img'))
    fs.writeFileSync(path.join(project, 'img', 'a b.png'), Buffer.from([1]))
    const file = write('ref.md', '![t](<img/a b.png> "Title")\n`![c](../elsewhere/secret.png)`')
    const [note] = (await link([file])).linked
    expect(await linked.assetDataUri(note.id, 'img/a b.png')).toBe('data:image/png;base64,' + Buffer.from([1]).toString('base64'))
    // Exists and resolves, but the note doesn't show it (only inside a code span).
    expect(await linked.assetDataUri(note.id, '../elsewhere/secret.png')).toBeNull()
  })

  it('rewatch: known folders right away, and an older slow call never undoes a newer one', async () => {
    const a = write('wa.md', 'A\n')
    const otherDir = path.join(root, 'other')
    fs.mkdirSync(otherDir)
    const b = path.join(otherDir, 'wb.md')
    fs.writeFileSync(b, 'B\n')
    const [noteA] = (await link([a])).linked
    const [noteB] = (await link([b])).linked
    fs.rmSync(b)
    linked.__test.setDirProbe(async () => false)
    await linked.recheck()
    expect(linked.get(noteB.id)?.status).toBe('missing')
    expect(linked.__test.watchedDirs()).not.toContain(otherDir)
    // A slow probe of the missing file's folder…
    let release: (v: boolean) => void = () => {}
    linked.__test.setDirProbe((dir) => (dir === otherDir ? new Promise<boolean>((r) => { release = r }) : Promise.resolve(true)))
    const slow = linked.__test.rewatch()
    // …doesn't hold back the folders already known to exist.
    expect(linked.__test.watchedDirs()).toContain(project)
    // Meanwhile the note is unlinked and a newer rewatch runs.
    linked.__test.setDirProbe(async () => true)
    linked.unlink(noteB.id)
    await linked.__test.rewatch()
    release(true)
    await slow
    expect(linked.__test.watchedDirs()).not.toContain(otherDir)
    expect(linked.__test.watchedDirs()).toContain(project)
    expect(linked.get(noteA.id)?.status).toBe('ok')
  })
})

// "Open with NoteFlow": main links the files the OS opened as TRANSIENT notes (closed →
// unlinked; the file is never touched).
describe('transient linked notes (IO)', () => {
  const openWith = (paths: string[]) => { linked.grantLinkPaths(paths); return linked.link(paths, undefined, { transient: true }) }
  const reindexed: string[] = []
  const removed: string[] = []
  const initTracking = () => linked.init({
    userDataDir: userData,
    notesDir,
    broadcast: (filePath, senderId) => broadcasts.push({ filePath, senderId }),
    onIndexChange: (id) => reindexed.push(id),
    onRemoved: (id) => removed.push(id),
  })
  beforeEach(async () => {
    reindexed.length = 0
    removed.length = 0
    await initTracking()
  })

  it('links new files as transient and reuses an already linked one as it is', async () => {
    const a = write('a.md', '# A\n')
    const b = write('b.txt', 'b\n')
    const [permanent] = (await link([b])).linked
    const res = await openWith([a, b])
    expect(res.linked).toHaveLength(1)
    expect(res.linked[0]).toMatchObject({ path: a, transient: true })
    expect(res.existing.map((w) => [w.id, w.transient])).toEqual([[permanent.id, undefined]])
    // Not indexed while transient (the permanent one was).
    expect(reindexed).toEqual([permanent.id])
    expect(linked.aiNotes().map((n) => n.note.noteId)).toEqual([permanent.id])
    expect(linked.aiNote(res.linked[0].id)).toBeNull()
    // The registry keeps the flag; the file is untouched.
    const reg = JSON.parse(fs.readFileSync(path.join(userData, 'linked-notes.json'), 'utf-8'))
    expect(reg.notes.find((n: { id: string }) => n.id === res.linked[0].id).transient).toBe(true)
    expect(fs.readFileSync(a, 'utf-8')).toBe('# A\n')
  })

  it('startup drops the transient notes without a draft and keeps one with unsaved edits', async () => {
    const a = write('a.md', 'x\n')
    const b = write('b.md', 'y\n')
    const [ta] = (await openWith([a])).linked
    const [tb] = (await openWith([b])).linked
    linked.setDraft(tb.id, { body: 'edited', baseHash: tb.hash })
    await initTracking()
    expect(linked.list().map((n) => n.id)).toEqual([tb.id])
    expect(linked.get(tb.id)).toMatchObject({ transient: true, draft: { body: 'edited' } })
    expect(fs.existsSync(path.join(userData, 'linked-notes-cache', linkedCacheFileName(ta.id)))).toBe(false)
    expect(JSON.parse(fs.readFileSync(path.join(userData, 'linked-notes.json'), 'utf-8')).notes.map((n: { id: string }) => n.id)).toEqual([tb.id])
    expect(fs.readFileSync(a, 'utf-8')).toBe('x\n')
    expect(fs.readFileSync(b, 'utf-8')).toBe('y\n')
  })

  it('a registry written without the flag keeps every note at startup', async () => {
    fs.writeFileSync(path.join(userData, 'linked-notes.json'), JSON.stringify({ version: 1, notes: [{ id: 'lnk:old', path: write('old.md', 'o\n'), title: 'old' }] }))
    await initTracking()
    expect(linked.list().map((n) => [n.id, n.transient])).toEqual([['lnk:old', undefined]])
  })

  it('"Keep in NoteFlow" makes it permanent: survives a restart and is indexed', async () => {
    const [t] = (await openWith([write('a.md', 'x\n')])).linked
    expect(linked.keep(t.id)?.transient).toBeUndefined()
    expect(linked.isTransient(t.id)).toBe(false)
    expect(reindexed).toEqual([t.id])
    await initTracking()
    expect(linked.list().map((n) => n.id)).toEqual([t.id])
    expect(linked.keep('lnk:nope')).toBeNull()
  })

  it('organizing it (rename, group, favorite, archive) keeps it; text mode and "Hide from AI" do not', async () => {
    const [a, b, c, d, e] = (await openWith(['a.md', 'b.md', 'c.md', 'd.md', 'e.md'].map((n) => write(n, `${n}\n`)))).linked
    expect(linked.updateMeta(a.id, { isRawMode: true })?.transient).toBe(true)
    expect(linked.updateMeta(a.id, { aiHidden: true })?.transient).toBe(true)
    expect(linked.updateMeta(a.id, { title: 'a' })?.transient).toBe(true) // same title: nothing done
    expect(linked.updateMeta(a.id, { title: 'Renamed' })?.transient).toBeUndefined()
    expect(linked.updateMeta(b.id, { group: 'g1' })?.transient).toBeUndefined()
    expect(linked.updateMeta(c.id, { favorited: true })?.transient).toBeUndefined()
    expect(linked.updateMeta(d.id, { archived: true })?.transient).toBeUndefined()
    expect(linked.isTransient(e.id)).toBe(true)
    // Kept → indexed now.
    expect(reindexed.sort()).toEqual([a.id, b.id, c.id, d.id].sort())
  })

  it('discards only a transient note without a draft that no other window shows; never the file', async () => {
    const file = write('a.md', 'x\n')
    const [t] = (await openWith([file])).linked
    const [kept] = (await link([write('k.md', 'k\n')])).linked
    expect(await linked.discardTransient(kept.id, () => false)).toBe(false)
    expect(await linked.discardTransient(t.id, () => true)).toBe(false) // shown in a sticky
    linked.setDraft(t.id, { body: 'unsaved', baseHash: t.hash })
    expect(await linked.discardTransient(t.id, () => false)).toBe(false) // unwritten edits
    linked.setDraft(t.id, null)
    expect(await linked.discardTransient(t.id, () => false)).toBe(true)
    expect(linked.get(t.id)).toBeNull()
    expect(await linked.discardTransient(t.id, () => false)).toBe(false)
    expect(fs.readFileSync(file, 'utf-8')).toBe('x\n')
    // Never indexed: nothing to remove from the index.
    expect(removed).toEqual([])
  })

  it('a transient note takes no place in the manual order', async () => {
    const [t] = (await openWith([write('a.md', 'x\n')])).linked
    const [kept] = (await link([write('k.md', 'k\n')])).linked
    linked.splitNoteOrder({ ungrouped: ['n1', t.id, kept.id] })
    expect(linked.mergeNoteOrder({ ungrouped: ['n1'] })).toEqual({ ungrouped: ['n1', kept.id] })
    linked.keep(t.id)
    linked.splitNoteOrder({ ungrouped: ['n1', t.id, kept.id] })
    expect(linked.mergeNoteOrder({ ungrouped: ['n1'] })).toEqual({ ungrouped: ['n1', t.id, kept.id] })
  })
})
