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

    it('a scene the model leaves out is KEPT: appended at the end of the section', () => {
      expect(impl.restoreCollapsedDrawings(original, 'Only text now')).toBe(`Only text now\n\n${SCENE}\n\n${second}`)
      expect(impl.restoreCollapsedDrawings(original, `Kept one\n\n[drawing #2]\n\nEnd\n`)).toBe(`Kept one\n\n${second}\n\nEnd\n\n${SCENE}`)
      expect(impl.restoreCollapsedDrawings(original, '')).toBe(`${SCENE}\n\n${second}`)
    })

    it('a repeated marker of the same scene is dropped; a number with no scene is left as the text it is', () => {
      const out = impl.restoreCollapsedDrawings(original, `a\n[drawing #1]\n[drawing #1]\n[drawing #9: mine]\n[drawing #2]\nb`)
      expect(out).toBe(`a\n\n${SCENE}\n\n[drawing #9: mine]\n\n${second}\n\nb`)
    })

    it('a marker inside a list item, a quote or a sentence still brings its drawing back, as a block of its own', () => {
      expect(impl.restoreCollapsedDrawings(original, `- first\n- [drawing #1: Idea]\n- last\n\n[drawing #2]`))
        .toBe(`- first\n\n${SCENE}\n\n- last\n\n${second}`)
      expect(impl.restoreCollapsedDrawings(original, `> [drawing #1]\n\n  [drawing #2]  `)).toBe(`${SCENE}\n\n${second}`)
      expect(impl.restoreCollapsedDrawings(original, `See [drawing #1: Idea] above and [drawing #2].`))
        .toBe(`See above and .\n\n${SCENE}\n\n${second}`)
    })

    it('a marker in a table row or a kanban board never splits it: the drawing goes right after', () => {
      const table = '| Step | Picture |\n| --- | --- |\n| one | [drawing #1: Idea] |\n| two | - |'
      expect(impl.restoreCollapsedDrawings(original, `${table}\n\nAfter\n\n[drawing #2]`))
        .toBe(`| Step | Picture |\n| --- | --- |\n| one | |\n| two | - |\n\n${SCENE}\n\nAfter\n\n${second}`)
      // The table ends the text.
      expect(impl.restoreCollapsedDrawings(original, `${table}\n[drawing #2]`.replace('\n[drawing #2]', '')))
        .toBe(`| Step | Picture |\n| --- | --- |\n| one | |\n| two | - |\n\n${SCENE}\n\n${second}`)
      const board = '<!-- kanban done="Done" -->\n- Todo\n  - [ ] review [drawing #1]\n- Done\n<!-- /kanban -->'
      expect(impl.restoreCollapsedDrawings(original, `${board}\n\n[drawing #2]`))
        .toBe(`<!-- kanban done="Done" -->\n- Todo\n  - [ ] review\n- Done\n<!-- /kanban -->\n\n${SCENE}\n\n${second}`)
    })

    it('a fence the model never closed does not swallow the drawings it left out', () => {
      const out = impl.restoreCollapsedDrawings(original, `Text\n\n${F}js\nconst a = 1`)
      expect(out).toBe(`Text\n\n${F}js\nconst a = 1\n${F}\n\n${SCENE}\n\n${second}`)
      // Nothing left out: the text is not touched.
      const kept = `[drawing #1]\n\n[drawing #2]\n\n${F}js\nopen`
      expect(impl.restoreCollapsedDrawings(original, kept)).toBe(`${SCENE}\n\n${second}\n\n${F}js\nopen`)
    })

    it('reads the marker however the model wrote it: case, spacing, escaped brackets', () => {
      for (const marker of ['[Drawing #1]', '[DRAWING #1: Idea]', '[drawing  #1]', '[drawing#1]', '[ drawing # 1 : x ]', '\\[drawing #1\\]', '\\[drawing #1: Idea · Done\\]']) {
        expect(impl.restoreCollapsedDrawings(original, `a\n\n${marker}\n\n[drawing #2]\n\nb`), marker).toBe(`a\n\n${SCENE}\n\n${second}\n\nb`)
      }
    })

    it('leaves no debris where a marker was: heading marks, list bullets, doubled spaces', () => {
      expect(impl.restoreCollapsedDrawings(original, '## [drawing #1: Idea]\n\n1. [drawing #2]\n\nend')).toBe(`${SCENE}\n\n${second}\n\nend`)
      expect(impl.restoreCollapsedDrawings(original, '## Diagram [drawing #1] here\n\n[drawing #2]')).toBe(`## Diagram here\n\n${SCENE}\n\n${second}`)
      expect(impl.restoreCollapsedDrawings(original, '  - nested [drawing #1]   item\n\n[drawing #2]')).toBe(`  - nested item\n\n${SCENE}\n\n${second}`)
    })

    it('only the gap of the marker is tidied: the rest of the line keeps its spacing, inline code included', () => {
      expect(impl.restoreCollapsedDrawings(original, 'Run `a  b`  then [drawing #1] see   `x   y`\n\n[drawing #2]'))
        .toBe(`Run \`a  b\`  then see   \`x   y\`\n\n${SCENE}\n\n${second}`)
      expect(impl.restoreCollapsedDrawings(original, 'col  one    col two [drawing #1]\n\n[drawing #2]'))
        .toBe(`col  one    col two\n\n${SCENE}\n\n${second}`)
    })

    it('a marker-looking text the section already had is the user\'s: it stays, and the drawings are still kept', () => {
      const own = `See [Drawing #1] of the spec\n\n${SCENE}\n\nAnd \\[drawing #2\\] too\n\n${second}`
      const view = impl.collapseDrawings(own, 'marker')
      // Untouched by the model: exactly what it was.
      expect(impl.restoreCollapsedDrawings(own, view)).toBe(own)
      // The model drops the real markers: the literals are not taken for them.
      expect(impl.restoreCollapsedDrawings(own, 'See [Drawing #1] of the spec\n\nAnd \\[drawing #2\\] too'))
        .toBe(`See [Drawing #1] of the spec\n\nAnd \\[drawing #2\\] too\n\n${SCENE}\n\n${second}`)
      // Another spelling of the same number, not in the original, is a marker as always.
      expect(impl.restoreCollapsedDrawings(own, 'See [Drawing #1] of the spec\n\n[drawing #1]\n\n[drawing #2]'))
        .toBe(`See [Drawing #1] of the spec\n\n${SCENE}\n\n${second}`)
    })

    it('a marker inside a code fence of the new text is not consumed there: the drawing is kept at the end', () => {
      const next = `Doc\n\n${F}\n[drawing #1: example]\n${F}\n\n[drawing #2]`
      expect(impl.restoreCollapsedDrawings(original, next)).toBe(`Doc\n\n${F}\n[drawing #1: example]\n${F}\n\n${second}\n\n${SCENE}`)
    })

    it('a text whose original has no scene is returned untouched, marker-looking lines included', () => {
      for (const next of ['x\n[drawing #1: a]\ny', '- [drawing #2]', '[drawing #1]']) {
        expect(impl.restoreCollapsedDrawings('plain', next)).toBe(next)
        expect(impl.restoreCollapsedDrawings(MERMAID, next)).toBe(next)
      }
    })

    it('Mermaid blocks pass through as the model wrote them', () => {
      const next = `[drawing #1]\n\n[drawing #2]\n\n${MERMAID.replace('A[Start]', 'A[Changed]')}`
      expect(impl.restoreCollapsedDrawings(original, next)).toBe(`${SCENE}\n\n${second}\n\n${MERMAID.replace('A[Start]', 'A[Changed]')}`)
    })

    it('a label with brackets gives a marker that still comes back whole', () => {
      const bracket = scene(['{"id":"t","type":"text","x":0,"y":0,"width":1,"height":1,"containerId":null,"text":"arr[0] = [x]"}'])
      const seenB = impl.collapseDrawings(`a\n\n${bracket}\n\nb`, 'marker')
      expect(seenB).toBe('a\n\n[drawing #1: arr(0) = (x)]\n\nb')
      expect(impl.restoreCollapsedDrawings(`a\n\n${bracket}\n\nb`, seenB)).toBe(`a\n\n${bracket}\n\nb`)
    })

    it('writes the line endings of the new text (CRLF)', () => {
      const crlf = (s: string) => s.replace(/\n/g, '\r\n')
      expect(impl.restoreCollapsedDrawings(original, crlf('Intro\n\n[drawing #1]\n\nEnd\n'))).toBe(crlf(`Intro\n\n${SCENE}\n\nEnd\n\n${second}`))
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
    const withImage = r() < 0.2
    if (withImage) elements.push({ id: 'img', type: 'image', x: 0, y: 0, width: 5, height: 5, fileId: 'f1' })
    const files = withImage ? { f1: { id: 'f1', mimeType: 'image/png', dataURL: pick(['data:image/png;base64,AAAA', 'https://example.com/x.png']) } } : {}
    const block: DrawingBlock = { kind: 'excalidraw', attrs: pick(['', 'height="200"']), scene: { appState: {}, elements, files } }
    let md = serializeDrawingMarkdown(block)
    const lines = md.split('\n')
    const shape = r()
    if (shape < 0.12) {
      // A whole Excalidraw document in the fence (one line, or pretty-printed).
      const doc = { type: 'excalidraw', version: pick([2, 2, 3]), elements: elements.filter((e) => !e.isDeleted), appState: {}, files }
      md = [lines[0], lines[1], ...JSON.stringify(doc, null, pick([0, 2])).split('\n'), lines[lines.length - 2], lines[lines.length - 1]].join('\n')
    } else if (shape < 0.22) {
      // A fence of four or more backticks.
      const ticks = '`'.repeat(4 + Math.floor(r() * 2))
      md = [lines[0], `${ticks}excalidraw`, ...lines.slice(2, -2), ticks, lines[lines.length - 1]].join('\n')
    } else if (shape < 0.3 && lines.length > 5) {
      // A duplicated element line (same id twice): not a scene.
      md = [...lines.slice(0, 4), lines[3], ...lines.slice(4)].join('\n')
    }
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
      // Markers in the shapes and places a model may put them.
      const wild = seen.split('\n').map((l) => {
        if (!/^\[drawing #\d+/.test(l)) return l
        const pickOne = r()
        if (pickOne < 0.15) return `- ${l}`
        if (pickOne < 0.3) return `| a | ${l} |`
        if (pickOne < 0.4) return `## ${l.replace('[drawing', '[Drawing ')}`
        if (pickOne < 0.5) return l.replace('[', '\\[').replace(/\]$/, '\\]')
        if (pickOne < 0.6) return `${F}\n${l}`
        if (pickOne < 0.7) return `<!-- kanban -->\n- Todo\n  - [ ] ${l}\n<!-- /kanban -->`
        return l
      }).join('\n')
      expect(main.restoreCollapsedDrawings(md, wild), md).toBe(renderer.restoreCollapsedDrawings(md, wild))
      const shuffled = seen.split('\n').reverse().join('\n')
      expect(main.restoreCollapsedDrawings(md, shuffled), md).toBe(renderer.restoreCollapsedDrawings(md, shuffled))
    }
  })
})
