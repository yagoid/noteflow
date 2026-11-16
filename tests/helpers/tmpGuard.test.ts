// The guard the notes-dir tests rely on before any rmSync (tests/helpers/tmpGuard.ts).
import { describe, it, expect } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { assertInsideTmp } from './tmpGuard'

describe('assertInsideTmp', () => {
  const tmp = path.join(os.tmpdir(), 'noteflow-guard-abc123')

  it('returns a path inside the test temp dir', () => {
    const dir = path.join(tmp, 'home', 'noteflow-notes')
    expect(assertInsideTmp(dir, tmp)).toBe(dir)
    expect(assertInsideTmp(path.join(tmp, 'a', '..', 'notes'), tmp)).toBe(path.join(tmp, 'a', '..', 'notes'))
  })

  it('refuses the real home, the temp dir itself and anything that escapes it', () => {
    const outside = [
      path.join(os.homedir(), 'noteflow-notes'),
      path.join(os.homedir(), '.local', 'share', 'noteflow-notes'),
      tmp,
      os.tmpdir(),
      path.join(tmp, '..', 'other-test'),
      path.join(tmp, '..'),
      `${tmp}-sibling`,
      path.parse(tmp).root,
      '',
    ]
    for (const dir of outside) expect(() => assertInsideTmp(dir, tmp), dir).toThrow(/Refusing to touch/)
  })

  it('refuses a test temp dir that is unset or not under the OS temp dir', () => {
    expect(() => assertInsideTmp(path.join(os.homedir(), 'x'), os.homedir())).toThrow(/Refusing to touch/)
    expect(() => assertInsideTmp(path.join(os.tmpdir(), 'x'), os.tmpdir())).toThrow(/Refusing to touch/)
    expect(() => assertInsideTmp('notes', '')).toThrow(/Refusing to touch/)
    expect(() => assertInsideTmp('notes', undefined as unknown as string)).toThrow(/Refusing to touch/)
  })
})
