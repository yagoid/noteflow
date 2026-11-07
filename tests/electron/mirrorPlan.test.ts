import { describe, it, expect } from 'vitest'
import {
  gitBlobSha,
  isMirrorDeletable,
  planMirror,
  remoteHasContent,
  type MirrorFile,
} from '../../electron/mirrorPlan'

// Same list as METADATA_FILENAMES in electron/githubSync.ts (passed in by the
// caller so this module isn't yet another copy of it).
const METADATA = [
  'groups.json',
  'folders.json',
  'section-colors.json',
  'note-order.json',
  'templates.json',
  'snippets.json',
  'ui-settings.json',
] as const

function local(path: string, content: string): MirrorFile {
  return { path, sha: gitBlobSha(content) }
}

describe('gitBlobSha', () => {
  it('matches the git blob hash of the content', () => {
    // Reference value: `printf 'hello' | git hash-object --stdin`
    expect(gitBlobSha('hello')).toBe('b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0')
    // Empty blob — the well-known e69de29 hash.
    expect(gitBlobSha('')).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391')
  })

  it('hashes BYTES, not characters (multi-byte content)', () => {
    // 'é' is 2 bytes in UTF-8: a length-based header would be wrong here.
    expect(gitBlobSha('é')).toBe(gitBlobSha('é'))
    expect(gitBlobSha('é')).not.toBe(gitBlobSha('e'))
  })
})

describe('remoteHasContent (pull catch-up filter)', () => {
  const tree = new Map([
    ['note-a/note.md', gitBlobSha('A anchor')],
    ['note-a/sec1.md', gitBlobSha('A section')],
  ])

  it('skips a file whose remote blob SHA matches the on-disk content', () => {
    expect(remoteHasContent(tree, 'note-a/sec1.md', 'A section')).toBe(true)
  })

  it('queues a file whose content differs from the remote blob', () => {
    expect(remoteHasContent(tree, 'note-a/sec1.md', 'A section (edited)')).toBe(false)
  })

  it('queues a path the remote tree does not have (new file)', () => {
    expect(remoteHasContent(tree, 'note-a/sec2.md', 'brand new')).toBe(false)
  })

  it('queues everything when the tree is empty or missing — never skip on absent data', () => {
    expect(remoteHasContent(new Map(), 'note-a/note.md', 'A anchor')).toBe(false)
    expect(remoteHasContent(undefined, 'note-a/note.md', 'A anchor')).toBe(false)
  })

  it('does not confuse paths: the SHA must belong to the same path', () => {
    // Two files with identical content: matching by SHA alone would be wrong.
    const sameContent = new Map([['note-a/sec1.md', gitBlobSha('shared')]])
    expect(remoteHasContent(sameContent, 'note-b/sec1.md', 'shared')).toBe(false)
  })
})

describe('isMirrorDeletable (deletion allowlist)', () => {
  it('allows files inside note folders and root metadata JSONs', () => {
    expect(isMirrorDeletable('my-note-abc123/note.md', METADATA)).toBe(true)
    expect(isMirrorDeletable('my-note-abc123/sec001.md', METADATA)).toBe(true)
    for (const name of METADATA) expect(isMirrorDeletable(name, METADATA)).toBe(true)
  })

  it('allows leftover v1 flat notes at the root', () => {
    expect(isMirrorDeletable('old-flat-note.md', METADATA)).toBe(true)
  })

  it('NEVER deletes README.md (NoteFlow writes it, it has no local counterpart)', () => {
    expect(isMirrorDeletable('README.md', METADATA)).toBe(false)
    expect(isMirrorDeletable('readme.md', METADATA)).toBe(false)
  })

  it('NEVER deletes the format marker or any other dotfile/dot-dir', () => {
    expect(isMirrorDeletable('.noteflow-format', METADATA)).toBe(false)
    expect(isMirrorDeletable('.gitignore', METADATA)).toBe(false)
    expect(isMirrorDeletable('.gitattributes', METADATA)).toBe(false)
    expect(isMirrorDeletable('.github/workflows/ci.yml', METADATA)).toBe(false)
    expect(isMirrorDeletable('.hidden/note.md', METADATA)).toBe(false)
    expect(isMirrorDeletable('my-note-abc123/.secret.md', METADATA)).toBe(false)
  })

  it('NEVER deletes unrelated root files or deeper nesting', () => {
    expect(isMirrorDeletable('LICENSE', METADATA)).toBe(false)
    expect(isMirrorDeletable('settings.json', METADATA)).toBe(false) // not a metadata filename
    expect(isMirrorDeletable('photo.png', METADATA)).toBe(false)
    expect(isMirrorDeletable('my-note-abc123/assets/img.png', METADATA)).toBe(false)
    expect(isMirrorDeletable('docs/deep/nested/file.md', METADATA)).toBe(false)
    expect(isMirrorDeletable('my-note-abc123/attachment.txt', METADATA)).toBe(false)
    expect(isMirrorDeletable('', METADATA)).toBe(false)
    expect(isMirrorDeletable('my-note-abc123/', METADATA)).toBe(false)
  })
})

describe('planMirror', () => {
  it('uploads what differs, skips identical blobs by SHA, deletes what is gone locally', () => {
    const localFiles = [
      local('note-a/note.md', 'A anchor'),
      local('note-a/sec1.md', 'A section (edited)'),
      local('note-b/note.md', 'B anchor'),
      local('groups.json', '[]'),
    ]
    const remoteBlobs: MirrorFile[] = [
      { path: 'note-a/note.md', sha: gitBlobSha('A anchor') },        // identical
      { path: 'note-a/sec1.md', sha: gitBlobSha('A section (old)') }, // differs
      // note-b is missing remotely → upload
      { path: 'groups.json', sha: gitBlobSha('[]') },                 // identical
      { path: 'note-gone/note.md', sha: 'x' },                        // deleted locally
      { path: 'note-gone/sec1.md', sha: 'y' },
      { path: 'note-order.json', sha: 'z' },                          // metadata gone locally
      { path: 'README.md', sha: 'r' },                                // protected
      { path: '.noteflow-format', sha: 'm' },                         // protected
    ]

    const plan = planMirror(localFiles, remoteBlobs, METADATA)

    expect(plan.unchanged).toEqual(['note-a/note.md', 'groups.json'])
    expect(plan.toUpload).toEqual(['note-a/sec1.md', 'note-b/note.md'])
    expect(plan.toDelete).toEqual([
      // The whole folder is gone locally → ONE deleteDir keyed by the dir.
      { op: 'deleteDir', key: 'note-gone', paths: ['note-gone/note.md', 'note-gone/sec1.md'] },
      { op: 'delete', key: 'note-order.json', paths: ['note-order.json'] },
    ])
  })

  it('uploads everything when the remote is empty and deletes nothing', () => {
    const localFiles = [local('note-a/note.md', 'A'), local('templates.json', '[]')]
    const plan = planMirror(localFiles, [], METADATA)
    expect(plan.toUpload).toEqual(['note-a/note.md', 'templates.json'])
    expect(plan.toDelete).toEqual([])
    expect(plan.unchanged).toEqual([])
  })

  it('is a no-op when both sides already match (nothing uploaded, nothing deleted)', () => {
    const localFiles = [local('note-a/note.md', 'A'), local('note-a/sec1.md', 'S')]
    const remoteBlobs = [
      ...localFiles,
      { path: 'README.md', sha: 'r' },
      { path: '.noteflow-format', sha: 'm' },
    ]
    const plan = planMirror(localFiles, remoteBlobs, METADATA)
    expect(plan.toUpload).toEqual([])
    expect(plan.toDelete).toEqual([])
    expect(plan.unchanged).toEqual(['note-a/note.md', 'note-a/sec1.md'])
  })

  it('journals a dropped SECTION as a file delete while its note still exists locally', () => {
    // note-a is alive locally (its anchor is there), only sec2 was removed →
    // a per-file 'delete' is correct; a 'deleteDir' would wipe the live note.
    const localFiles = [local('note-a/note.md', 'A'), local('note-a/sec1.md', 'S1')]
    const remoteBlobs = [...localFiles, { path: 'note-a/sec2.md', sha: 'old' }]
    const plan = planMirror(localFiles, remoteBlobs, METADATA)
    expect(plan.toDelete).toEqual([{ op: 'delete', key: 'note-a/sec2.md', paths: ['note-a/sec2.md'] }])
  })

  it('leaves folders WITHOUT a remote note.md anchor completely alone', () => {
    // 'docs/' is a user folder, not a note: a deleteDir keyed on it would be
    // retried by deleteRemoteDirNow, which sweeps every blob under it (images,
    // subfolders) with no allowlist. Orphan sections of 'no-anchor/' are left
    // too — accepted trade-off, the pull ignores unanchored folders as well.
    const remoteBlobs: MirrorFile[] = [
      { path: 'docs/guia.md', sha: 'a' },
      { path: 'docs/logo.png', sha: 'b' },
      { path: 'no-anchor/sec1.md', sha: 'c' },
      { path: 'real-note/note.md', sha: 'd' }, // anchored → this one IS deletable
    ]
    const plan = planMirror([], remoteBlobs, METADATA)
    expect(plan.toDelete).toEqual([
      { op: 'deleteDir', key: 'real-note', paths: ['real-note/note.md'] },
    ])
  })

  it('does not delete a section of an anchored remote folder that is gone locally as a file op', () => {
    // Anchor present remotely, folder absent locally → ONE deleteDir with both.
    const remoteBlobs: MirrorFile[] = [
      { path: 'note-gone/sec1.md', sha: 'a' },
      { path: 'note-gone/note.md', sha: 'b' },
    ]
    const plan = planMirror([], remoteBlobs, METADATA)
    expect(plan.toDelete).toEqual([
      { op: 'deleteDir', key: 'note-gone', paths: ['note-gone/sec1.md', 'note-gone/note.md'] },
    ])
  })

  it('never puts a protected path inside a deleteDir entry', () => {
    const remoteBlobs: MirrorFile[] = [
      { path: 'note-gone/note.md', sha: 'a' },
      { path: 'note-gone/image.png', sha: 'b' },   // not ours
      { path: 'note-gone/.secret.md', sha: 'c' },  // dotfile
    ]
    const plan = planMirror([], remoteBlobs, METADATA)
    expect(plan.toDelete).toEqual([
      { op: 'deleteDir', key: 'note-gone', paths: ['note-gone/note.md'] },
    ])
  })

  it('empties the repo of notes when the local dir is empty — but keeps protected paths', () => {
    const remoteBlobs: MirrorFile[] = [
      { path: 'note-a/note.md', sha: 'a' },
      { path: 'old-flat.md', sha: 'b' },
      { path: 'groups.json', sha: 'c' },
      { path: 'README.md', sha: 'r' },
      { path: '.noteflow-format', sha: 'm' },
      { path: '.github/workflows/ci.yml', sha: 'w' },
      { path: 'LICENSE', sha: 'l' },
    ]
    const plan = planMirror([], remoteBlobs, METADATA)
    expect(plan.toDelete).toEqual([
      { op: 'deleteDir', key: 'note-a', paths: ['note-a/note.md'] },
      { op: 'delete', key: 'old-flat.md', paths: ['old-flat.md'] },
      { op: 'delete', key: 'groups.json', paths: ['groups.json'] },
    ])
    expect(plan.toUpload).toEqual([])
  })
})
