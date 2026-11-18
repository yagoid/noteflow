import { describe, it, expect } from 'vitest'
import * as renderer from '../../src/lib/drawing/drawingCollapse'
import * as main from '../../electron/drawingText'
import { serializeDrawingMarkdown, type DrawingBlock, type DrawingElement } from '../../src/lib/drawing/drawingBlock'

// Drawing blocks as text (search, counts, tags, what the AI sees), in its two
// implementations: src/lib/drawing/drawingCollapse.ts (renderer) and its mirror
// electron/drawingText.ts (main process + AI worker). Every behaviour test runs on both,
// and a fuzz compares them on random documents.

const F = '```'
const HEADER = '{"type":"excalidraw","version":2,"appState":{"viewBackgroundColor":"transparent"}}'
const EL_A = '{"id":"a","type":"rectangle","x":10,"y":20,"width":120,"height":60,"seed":12345,"strokeColor":"#e03131","boundElements":[{"id":"ta","type":"text"}]}'
const EL_TA = '{"id":"ta","type":"text","x":20,"y":30,"width":40,"height":20,"containerId":"a","text":"Idea #notatag"}'
const EL_B = '{"id":"b","type":"ellipse","x":300,"y":20,"width":120,"height":60,"backgroundColor":"#ffc9c9"}'
const EL_TB = '{"id":"tb","type":"text","x":310,"y":30,"width":40,"height":20,"containerId":"b","text":"Done"}'
const EL_AR = '{"id":"ar","type":"arrow","x":130,"y":50,"width":170,"height":0,"endArrowhead":"arrow","startArrowhead":null,"startBinding":{"elementId":"a"},"endBinding":{"elementId":"b"}}'
const scene = (lines: string[], attrs = '') => [`<!-- drawing${attrs ? ` ${attrs}` : ''} -->`, `${F}excalidraw`, HEADER, ...lines, F, '<!-- /drawing -->'].join('\n')
const SCENE = scene([EL_A, EL_TA, EL_B, EL_TB, EL_AR])
const MERMAID = ['<!-- drawing -->', `${F}mermaid`, 'flowchart TD', '  A[Start] --> B', F, '<!-- /drawing -->'].join('\n')
const SUMMARY = 'Idea #notatag · Done ; Idea #notatag → Done'

for (const [name, impl] of [['renderer (drawingCollapse.ts)', renderer], ['main (electron/drawingText.ts)', main]] as const) {
  describe(`collapseDrawings — ${name}`, () => {
    it("'text': a scene is one line with what it says; nothing of its JSON is left", () => {
      const out = impl.collapseDrawings(`Intro\n\n${SCENE}\n\nOutro`, 'text')
      expect(out).toBe(`Intro\n\n${SUMMARY}\n\nOutro`)
      for (const noise of ['seed', '12345', 'rectangle', 'excalidraw', '#e03131', 'drawing', 'boundElements']) expect(out).not.toContain(noise)
    })

    it("'marker': a numbered line per scene, in order", () => {
      const out = impl.collapseDrawings(`${SCENE}\n\ntext\n\n${scene([EL_B])}\n\n${scene([EL_B, EL_TB])}`, 'marker')
      expect(out).toBe(`[drawing #1: ${SUMMARY}]\n\ntext\n\n[drawing #2]\n\n[drawing #3: Done]`)
    })

    it('leaves Mermaid source blocks, ordinary code and everything else as they are', () => {
      const md = `# T\n\n${MERMAID}\n\n${F}excalidraw\n${HEADER}\n${F}\n\n- [ ] task #tag\n`
      expect(impl.collapseDrawings(md, 'text')).toBe(md)
      expect(impl.collapseDrawings(md, 'marker')).toBe(md)
      expect(impl.collapseDrawings('no drawings here', 'text')).toBe('no drawings here')
    })

    it('an empty scene disappears from the text and keeps its marker', () => {
      expect(impl.collapseDrawings(`a\n\n${scene([])}\n\nb`, 'text')).toBe('a\n\n\nb')
      expect(impl.collapseDrawings(`a\n\n${scene([])}\n\nb`, 'marker')).toBe('a\n\n[drawing #1]\n\nb')
    })

    it('does not touch an invalid block, one inside a code fence or one in a quote', () => {
      const broken = scene([EL_A.slice(0, -1)])
      const conflict = scene(['> ⚠️ Sync conflict — version already synced:', '', EL_A])
      const fenced = `${F}md\n${SCENE.replace(/```/g, '~~~')}\n${F}`
      const inCode = `${F}\n${MERMAID}`
      const quoted = SCENE.split('\n').map((l) => `> ${l}`).join('\n')
      for (const md of [broken, conflict, fenced, inCode, quoted]) {
        expect(impl.collapseDrawings(md, 'text'), md).toBe(md)
        expect(impl.collapseDrawings(md, 'marker'), md).toBe(md)
        expect(impl.stripDrawings(md), md).toBe(md)
      }
    })

    it('keeps CRLF line endings of the rest of the text', () => {
      const md = `Intro\r\n\r\n${SCENE.replace(/\n/g, '\r\n')}\r\n\r\nOutro\r\n`
      expect(impl.collapseDrawings(md, 'marker')).toBe(`Intro\r\n\r\n[drawing #1: ${SUMMARY}]\r\n\r\nOutro\r\n`)
    })
  })

  describe(`stripDrawings — ${name}`, () => {
    it('removes both variants whole: no colour, id or label can pass for a #tag', () => {
      const out = impl.stripDrawings(`#real tag\n\n${SCENE}\n\n${MERMAID.replace('A[Start]', 'A[Start]:::x style A fill:#f9f')}\n\nend #other`)
      expect(out).toBe('#real tag\n\n\n\nend #other')
    })
  })

  describe(`restoreCollapsedDrawings — ${name}`, () => {
    const second = scene([EL_B, EL_TB], 'height="300"')
    const original = `Intro\n\n${SCENE}\n\nMiddle\n\n${second}\n\nEnd`
    const seen = impl.collapseDrawings(original, 'marker')

    it('is the inverse of the marker view when the model returns it untouched', () => {
      expect(impl.restoreCollapsedDrawings(original, seen)).toBe(original)
    })

    it('puts each scene back by its number, whatever the model did around or to the summary', () => {
      const rewritten = `New intro\n\n[drawing #2: whatever the model wrote]\n\nMoved\n\n  [drawing #1]  \n\nNew end`
      expect(impl.restoreCollapsedDrawings(original, rewritten)).toBe(`New intro\n\n${second}\n\nMoved\n\n${SCENE}\n\nNew end`)
    })

    it('a scene the model leaves out is removed; unknown or repeated markers are dropped', () => {
      expect(impl.restoreCollapsedDrawings(original, 'Only text now')).toBe('Only text now')
      expect(impl.restoreCollapsedDrawings(original, `a\n[drawing #1]\n[drawing #1]\n[drawing #9: x]\nb`)).toBe(`a\n${SCENE}\nb`)
    })

    it('a marker inside a sentence is not a marker; Mermaid blocks pass through as the model wrote them', () => {
      const next = `See [drawing #1: Idea] above\n\n${MERMAID.replace('A[Start]', 'A[Changed]')}`
      expect(impl.restoreCollapsedDrawings(original, next)).toBe(next)
    })

    it('never invents a drawing in a text that had none', () => {
      expect(impl.restoreCollapsedDrawings('plain', 'x\n[drawing #1: a]\ny')).toBe('x\ny')
    })
  })
}

describe('renderer and main give the same output (parity fuzz)', () => {
  function rng(seed: number) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }
  const TEXTS = ['Idea', 'R&D', '"q"', 'two\nlines', '', '#hash', 'a → b', '  spaced  ', 'ñ']
  const BLOCKS = ['Paragraph #tag', '- [ ] task', `${F}js\ncode\n\nmore\n${F}`, `${F}unclosed`, '> quote', '| a |\n| --- |\n| 1 |', '[drawing #1: fake]', '<!-- drawing -->', '<!-- /drawing -->', `${F}excalidraw\n${HEADER}\n${F}`]

  function randomDrawing(r: () => number): string {
    const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]
    if (r() < 0.3) return serializeDrawingMarkdown({ kind: 'mermaid', attrs: '', source: pick(['flowchart TD\n  A --> B', '', `x\n${F}\ny`, '#f9f fill']) })
    const n = Math.floor(r() * 6)
    const elements: DrawingElement[] = Array.from({ length: n }, (_, i) => {
      const type = pick(['rectangle', 'text', 'arrow', 'line', 'ellipse'])
      const el: DrawingElement = { id: `e${i}`, type, x: i, y: i, width: 10, height: 10, isDeleted: r() < 0.1 }
      if (type === 'text') Object.assign(el, { text: pick(TEXTS), containerId: r() < 0.5 ? `e${Math.floor(r() * n)}` : null, ...(r() < 0.3 ? { originalText: pick(TEXTS) } : {}) })
      if (type === 'arrow' || type === 'line') {
        Object.assign(el, {
          startBinding: r() < 0.7 ? { elementId: `e${Math.floor(r() * (n + 1))}` } : null,
          endBinding: r() < 0.7 ? { elementId: `e${Math.floor(r() * (n + 1))}` } : null,
          startArrowhead: r() < 0.3 ? 'arrow' : null,
          endArrowhead: r() < 0.6 ? 'arrow' : null,
        })
      }
      return el
    })
    const block: DrawingBlock = { kind: 'excalidraw', attrs: pick(['', 'height="200"']), scene: { appState: {}, elements, files: {} } }
    let md = serializeDrawingMarkdown(block)
    // Sometimes broken: both sides must agree it is not a drawing.
    if (r() < 0.15) md = md.replace('"type":"excalidraw"', pick(['"type":"other"', '"type":"excalidraw","version":3', '"type":"excalidraw"}x']))
    if (r() < 0.1) md = md.replace('\n<!-- /drawing -->', '')
    return md
  }

  it('on random documents, in every mode, and through restore', () => {
    const r = rng(2026)
    for (let n = 0; n < 600; n++) {
      const parts: string[] = []
      const count = 1 + Math.floor(r() * 6)
      for (let p = 0; p < count; p++) parts.push(r() < 0.5 ? randomDrawing(r) : BLOCKS[Math.floor(r() * BLOCKS.length)])
      let md = parts.join(['\n', '\n\n', '\n\n\n'][Math.floor(r() * 3)])
      if (r() < 0.2) md = md.replace(/\n/g, '\r\n')
      for (const mode of ['text', 'marker'] as const) {
        expect(main.collapseDrawings(md, mode), md).toBe(renderer.collapseDrawings(md, mode))
      }
      expect(main.stripDrawings(md), md).toBe(renderer.stripDrawings(md))
      const seen = renderer.collapseDrawings(md, 'marker')
      expect(main.restoreCollapsedDrawings(md, seen), md).toBe(renderer.restoreCollapsedDrawings(md, seen))
      const shuffled = seen.split('\n').reverse().join('\n')
      expect(main.restoreCollapsedDrawings(md, shuffled), md).toBe(renderer.restoreCollapsedDrawings(md, shuffled))
    }
  })
})
