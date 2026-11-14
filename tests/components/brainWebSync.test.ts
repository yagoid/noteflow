import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
// The same transformation docs/scripts/build-brain.mjs applies (plain JS, shared on purpose).
import { COPIES, lf, toWebCopy } from '../../docs/scripts/brain-sync.mjs'

// The website (docs/) draws this same 3D brain. Its pure logic — mesh, layout, scene data, look,
// shaders — is a generated copy of src/components/Brain/ in docs/src/brain/, bundled into
// docs/public/brain/. Changing one of these modules without regenerating leaves the web on the
// old brain, so this fails until the copies are refreshed.

const ROOT = join(__dirname, '..', '..')
const APP = join(ROOT, 'src', 'components', 'Brain')
const WEB = join(ROOT, 'docs', 'src', 'brain')
const FIX = 'the web copy of the brain is out of date with the app: run `npm --prefix docs run brain` (and bump the ?v= in docs/public/brain/nf-load.js)'

describe('web copy of the brain modules (docs/src/brain)', () => {
  for (const [from, to] of Object.entries(COPIES as Record<string, string>)) {
    it(`docs/src/brain/${to} matches src/components/Brain/${from}`, () => {
      const expected = toWebCopy(from, readFileSync(join(APP, from), 'utf8')) as string
      let actual = ''
      try { actual = lf(readFileSync(join(WEB, to), 'utf8')) as string } catch { /* missing: reported below */ }
      expect(actual === expected, FIX).toBe(true)
    })
  }

  it('refuses modules that would not stay pure', () => {
    expect(() => toWebCopy('x.ts', "import { a } from 'three'\n")).toThrow(/package import/)
    expect(() => toWebCopy('x.ts', 'const m = await import("./brainMesh")\n')).toThrow(/dynamic import/)
    expect(() => toWebCopy('x.ts', "const m = require('./brainMesh')\n")).toThrow(/require/)
    expect(toWebCopy('x.ts', 'import type { BrainMesh } from "./brainMesh"\n')).toContain('from "./mesh"')
  })
})
