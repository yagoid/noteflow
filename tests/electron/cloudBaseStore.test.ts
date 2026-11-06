// Content-addressed store of the Cloud section base contents
// (electron/cloudBaseStore.ts) — what feeds the diff3 of mergeSectionText.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { writeBaseBlob, readBaseBlob, pruneBaseBlobs, clearBaseBlobs } from '../../electron/cloudBaseStore'
import { hashForBase } from '../../electron/cloudSyncLogic'

let dir: string
beforeEach(() => {
  dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-bases-')), 'cloud-base-content')
})
afterEach(() => {
  fs.rmSync(path.dirname(dir), { recursive: true, force: true })
})

describe('cloudBaseStore', () => {
  it('stores a section content under its base hash and reads it back (CRLF and unicode kept byte for byte)', () => {
    const content = 'línea 1\r\n- [ ] ✅ dos\n'
    writeBaseBlob(dir, content)
    const hash = hashForBase('n-1/a.md', content)
    expect(fs.readdirSync(dir)).toEqual([hash])
    expect(readBaseBlob(dir, hash)).toBe(content)
    writeBaseBlob(dir, content) // idempotent
    expect(fs.readdirSync(dir)).toEqual([hash])
  })

  it('unknown / sentinel / corrupt hashes read as null', () => {
    expect(readBaseBlob(dir, 'a'.repeat(64))).toBeNull()
    expect(readBaseBlob(dir, '')).toBeNull()
    expect(readBaseBlob(dir, 'unknown')).toBeNull()
    expect(readBaseBlob(dir, '../settings.json')).toBeNull()
    writeBaseBlob(dir, 'x')
    const hash = hashForBase('n-1/a.md', 'x')
    fs.writeFileSync(path.join(dir, hash), 'tampered')
    expect(readBaseBlob(dir, hash)).toBeNull()
  })

  it('prune keeps only the referenced hashes; clear drops the store; both tolerate a missing dir', () => {
    expect(pruneBaseBlobs(dir, new Set())).toBe(0)
    for (const c of ['a', 'b', 'c']) writeBaseBlob(dir, c)
    fs.writeFileSync(path.join(dir, 'stray.tmp'), '')
    const keep = new Set([hashForBase('n-1/a.md', 'b')])
    expect(pruneBaseBlobs(dir, keep)).toBe(3)
    expect(fs.readdirSync(dir)).toEqual([...keep])
    clearBaseBlobs(dir)
    expect(fs.existsSync(dir)).toBe(false)
    clearBaseBlobs(dir)
  })
})
