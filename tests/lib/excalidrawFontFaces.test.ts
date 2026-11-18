import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { EXCALIDRAW_FONT_FACES } from '../../src/lib/drawing/excalidrawFontFaces'

// src/lib/drawing/excalidrawFontFaces.ts is generated from the Excalidraw package
// (scripts/gen-excalidraw-font-faces.cjs). The preview of a drawing registers these
// faces itself, so the table must match the installed version and the files the build
// self-hosts (vite.config.ts → noteflow:excalidraw-fonts).
const require = createRequire(import.meta.url)
const ROOT = path.resolve(__dirname, '..', '..')
const FONTS = path.join(ROOT, 'node_modules', '@excalidraw', 'excalidraw', 'dist', 'prod', 'fonts')

describe('excalidrawFontFaces (generated)', () => {
  it('is what the generator gives for the installed Excalidraw', () => {
    const { generate, OUT } = require('../../scripts/gen-excalidraw-font-faces.cjs') as { generate: () => string; OUT: string }
    const committed = fs.readFileSync(OUT, 'utf8').split(/\r?\n/).join('\n')
    expect(committed, 'run: node scripts/gen-excalidraw-font-faces.cjs').toBe(generate())
  })

  it('points at files the build ships, and at every canvas font it ships', () => {
    for (const face of EXCALIDRAW_FONT_FACES) {
      expect(fs.existsSync(path.join(FONTS, face.file)), face.file).toBe(true)
      expect(face.file.startsWith('Xiaolai/')).toBe(false)
    }
    // Shipped = every family folder but Xiaolai (CJK) — and Assistant, the font of
    // Excalidraw's own UI, which its stylesheet declares.
    const shipped = fs.readdirSync(FONTS)
      .filter((family) => family !== 'Xiaolai' && family !== 'Assistant')
      .flatMap((family) => fs.readdirSync(path.join(FONTS, family)).filter((f) => f.endsWith('.woff2')).map((f) => `${family}/${f}`))
    expect([...EXCALIDRAW_FONT_FACES.map((f) => f.file)].sort()).toEqual(shipped.sort())
  })

  it('covers the families a scene can use', () => {
    const families = new Set(EXCALIDRAW_FONT_FACES.map((f) => f.family))
    for (const family of ['Excalifont', 'Virgil', 'Cascadia', 'Nunito', 'Lilita One', 'Comic Shanns', 'Liberation Sans']) {
      expect(families.has(family), family).toBe(true)
    }
  })
})
