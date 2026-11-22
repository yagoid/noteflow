import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { htmlFromMarkdown, htmlToMarkdown, looksLikeMarkdown } from '../../src/lib/markdownHtml'
import {
  drawingFromHtmlData,
  drawingHtmlDataFromElement,
  countDrawingMatches,
  drawingText,
  drawingToHtml,
  parseDrawingMarkdown,
  parseSceneBody,
  serializeDrawingMarkdown,
  serializeSceneBody,
  type DrawingBlock,
  type DrawingElement,
  type DrawingSceneData,
} from '../../src/lib/drawing/drawingBlock'
import { getKanbanAttr, setKanbanAttr } from '../../src/lib/kanban'
import { mergeSectionText, DEFAULT_SECTION_CONFLICT_LABELS as L } from '../../electron/cloudSyncLogic'
import { installMiniDom, miniElement } from '../helpers/miniDom'

// htmlToMarkdown needs DOMParser; the vitest env is node-only, so these tests
// install a minimal DOM that understands htmlFromMarkdown's own output.
let uninstallDom: () => void
beforeAll(() => { uninstallDom = installMiniDom() })
afterAll(() => uninstallDom())

const F = '```'
const roundTrip = (md: string) => htmlToMarkdown(htmlFromMarkdown(md))

/** md → html → md lands on `expected` and stays there over several cycles. */
function expectStable(md: string, expected = md) {
  let cur = md
  for (let i = 0; i < 4; i++) {
    cur = roundTrip(cur)
    expect(cur).toBe(expected)
  }
}

const countDrawings = (html: string) => (html.match(/data-type="drawing"/g) ?? []).length

// Same markdown with the markers defused: what the region rendered as before
// drawings existed. A rejected block must render — and save — exactly like this.
const defuse = (md: string) => md.replace(/<!-- (\/?)drawing/g, '<!-- $1drawinx')
const refuse = (s: string) => s.replace(/drawinx/g, 'drawing')
const expectAsBefore = (md: string) => {
  const html = htmlFromMarkdown(md)
  expect(countDrawings(html), md).toBe(0)
  expect(html, md).toBe(refuse(htmlFromMarkdown(defuse(md))))
  expect(roundTrip(md), md).toBe(refuse(roundTrip(defuse(md))))
}

const MERMAID = ['flowchart TD', '  A[Idea] --> B{Worth it?}', '  B -- Yes --> C(Write the note)'].join('\n')
const SOURCE_BLOCK = ['<!-- drawing -->', `${F}mermaid`, MERMAID, F, '<!-- /drawing -->'].join('\n')

const HEADER = '{"type":"excalidraw","version":2,"appState":{"viewBackgroundColor":"transparent"}}'
const EL_A = '{"id":"a","type":"rectangle","x":10,"y":20,"width":120,"height":60,"angle":0,"boundElements":[{"id":"ta","type":"text"},{"id":"ar","type":"arrow"}],"seed":1}'
const EL_TA = '{"id":"ta","type":"text","x":20,"y":30,"width":40,"height":20,"containerId":"a","fontFamily":5,"text":"Idea"}'
const EL_B = '{"id":"b","type":"ellipse","x":300,"y":20,"width":120,"height":60,"boundElements":[{"id":"tb","type":"text"},{"id":"ar","type":"arrow"}],"seed":2}'
const EL_TB = '{"id":"tb","type":"text","x":310,"y":30,"width":40,"height":20,"containerId":"b","fontFamily":5,"text":"Done"}'
const EL_AR = '{"id":"ar","type":"arrow","x":130,"y":50,"width":170,"height":0,"endArrowhead":"arrow","endBinding":{"elementId":"b","focus":0,"gap":4},"points":[[0,0],[170,0]],"startArrowhead":null,"startBinding":{"elementId":"a","focus":0,"gap":4}}'
const EL_NOTE = '{"id":"n","type":"text","x":0,"y":200,"width":90,"height":20,"containerId":null,"fontFamily":5,"text":"A loose note"}'
const SCENE_LINES = [HEADER, EL_A, EL_TA, EL_B, EL_TB, EL_AR, EL_NOTE]
const sceneBlock = (lines: string[], attrs = '') =>
  [`<!-- drawing${attrs ? ` ${attrs}` : ''} -->`, `${F}excalidraw`, ...lines, F, '<!-- /drawing -->'].join('\n')
const SCENE_BLOCK = sceneBlock(SCENE_LINES)

describe('parseDrawingMarkdown / serializeDrawingMarkdown — source (Mermaid)', () => {
  it('parses the fence content verbatim and serializes it back byte for byte', () => {
    const block = parseDrawingMarkdown(SOURCE_BLOCK)
    expect(block).toEqual({ kind: 'mermaid', attrs: '', source: MERMAID })
    expect(serializeDrawingMarkdown(block!)).toBe(SOURCE_BLOCK)
  })

  it('is the whole text or nothing: content after the closing marker is not part of a block', () => {
    expect(parseDrawingMarkdown(`${SOURCE_BLOCK}
tail`)).toBeNull()
    expect(parseDrawingMarkdown(`head
${SOURCE_BLOCK}`)).toBeNull()
  })

  it('keeps the marker attributes opaque (a future height included)', () => {
    const md = SOURCE_BLOCK.replace('<!-- drawing -->', '<!--   drawing  height="320" foo=bar x="a &quot;b&quot;"  -->')
    const block = parseDrawingMarkdown(md)!
    expect(block.attrs).toBe('height="320" foo=bar x="a &quot;b&quot;"')
    expect(getKanbanAttr(block.attrs, 'height')).toBe('320')
    expect(serializeDrawingMarkdown(block)).toBe(SOURCE_BLOCK.replace('<!-- drawing -->', '<!-- drawing height="320" foo=bar x="a &quot;b&quot;" -->'))
    const taller = { ...block, attrs: setKanbanAttr(block.attrs, 'height', '480') }
    expect(parseDrawingMarkdown(serializeDrawingMarkdown(taller))!.attrs).toBe('height="480" foo=bar x="a &quot;b&quot;"')
  })

  it('tolerates blank lines around the fence, CRLF and surrounding blank lines', () => {
    const loose = ['', '<!-- drawing -->', '', `${F}mermaid`, MERMAID, F, '', '', '<!-- /drawing -->', ''].join('\n')
    expect(parseDrawingMarkdown(loose)).toEqual(parseDrawingMarkdown(SOURCE_BLOCK))
    expect(parseDrawingMarkdown(SOURCE_BLOCK.replace(/\n/g, '\r\n'))).toEqual(parseDrawingMarkdown(SOURCE_BLOCK))
  })

  it('keeps blank lines and odd content of the source', () => {
    for (const source of ['', 'a', 'a\n\nb', '  indented\n\ttab', 'a\n', '%% <!-- /drawing -->', '<!-- drawing -->']) {
      const block: DrawingBlock = { kind: 'mermaid', attrs: '', source }
      const md = serializeDrawingMarkdown(block)
      expect(parseDrawingMarkdown(md), JSON.stringify(source)).toEqual(block)
      expect(serializeDrawingMarkdown(parseDrawingMarkdown(md)!)).toBe(md)
    }
  })

  it('uses a longer fence when the source has backtick-only lines', () => {
    const source = `flowchart TD\n${F}\n  A --> B\n  ${F}${F}\n\`\`\`\`\`  \nend`
    const md = serializeDrawingMarkdown({ kind: 'mermaid', attrs: '', source })
    expect(md.split('\n')[1]).toBe('```````mermaid')
    expect(parseDrawingMarkdown(md)).toEqual({ kind: 'mermaid', attrs: '', source })
    expectStable(`before\n\n${md}\n\nafter`)
    expect(countDrawings(htmlFromMarkdown(md))).toBe(1)
  })

  it('rejects what is not exactly marker + one known fence + marker', () => {
    const cases: Record<string, string[]> = {
      'no closing marker': ['<!-- drawing -->', `${F}mermaid`, 'a', F],
      'no fence': ['<!-- drawing -->', 'flowchart TD', '<!-- /drawing -->'],
      'unclosed fence': ['<!-- drawing -->', `${F}mermaid`, 'a', '<!-- /drawing -->'],
      'unknown fence language': ['<!-- drawing -->', `${F}plantuml`, 'a', F, '<!-- /drawing -->'],
      'bare fence': ['<!-- drawing -->', F, 'a', F, '<!-- /drawing -->'],
      'text before the fence': ['<!-- drawing -->', 'note', `${F}mermaid`, 'a', F, '<!-- /drawing -->'],
      'text after the fence': ['<!-- drawing -->', `${F}mermaid`, 'a', F, 'note', '<!-- /drawing -->'],
      'two fences': ['<!-- drawing -->', `${F}mermaid`, 'a', F, `${F}mermaid`, 'b', F, '<!-- /drawing -->'],
      'indented marker': [' <!-- drawing -->', `${F}mermaid`, 'a', F, '<!-- /drawing -->'],
      'indented fence': ['<!-- drawing -->', ` ${F}mermaid`, 'a', F, '<!-- /drawing -->'],
      'a sync conflict in the source': ['<!-- drawing -->', `${F}mermaid`, `> ${L.local}`, '', 'A --> B', '', `> ${L.remote}`, '', 'A --> C', '', `> ${L.end}`, F, '<!-- /drawing -->'],
    }
    for (const [name, lines] of Object.entries(cases)) {
      expect(parseDrawingMarkdown(lines.join('\n')), name).toBeNull()
      expectAsBefore(lines.join('\n'))
      expectAsBefore(`before\n\n${lines.join('\n')}\n\nafter`)
    }
  })
})

describe('scene (Excalidraw) body', () => {
  it('parses header, elements in order and files', () => {
    const file = '{"file":{"id":"f1","mimeType":"image/png","created":5,"dataURL":"data:image/png;base64,AAAA"}}'
    const img = '{"id":"i","type":"image","x":0,"y":0,"width":10,"height":10,"fileId":"f1"}'
    const scene = parseSceneBody([HEADER, EL_A, '', img, file])!
    expect(scene.appState).toEqual({ viewBackgroundColor: 'transparent' })
    expect(scene.elements.map((e) => e.id)).toEqual(['a', 'i'])
    expect(scene.files.f1).toEqual({ id: 'f1', mimeType: 'image/png', dataURL: 'data:image/png;base64,AAAA', created: 5 })
    expect(serializeSceneBody(scene)).toEqual([HEADER, EL_A, img, file])
  })

  it('is canonical: key order, float noise, deleted elements, volatile fields, unused files, session state', () => {
    const messy: DrawingSceneData = {
      appState: { zoom: { value: 2 }, viewBackgroundColor: '#fff', gridSize: 20, selectedElementIds: { a: true }, gridStep: null },
      elements: [
        {
          versionNonce: 99, version: 7, updated: 1700000000000, isDeleted: false, seed: 12345,
          type: 'rectangle', height: 60.000000001, width: 119.99999, y: 20.005, x: 10.123456, id: 'a',
          angle: 0.123456789, roundness: { value: 0.33333333, type: 3 }, groupIds: [], opacity: 100,
        },
        { id: 'gone', type: 'ellipse', x: 0, y: 0, width: 1, height: 1, isDeleted: true },
        { id: 'l', type: 'line', x: 0, y: 0, width: 5, height: 5, points: [[0, 0], [1.23456, -0.001], [5, 5.555]], pressures: [0.123456, 1] },
        { id: 'i', type: 'image', x: 0, y: 0, width: 1, height: 1, fileId: 'used' },
      ],
      files: {
        unused: { id: 'unused', mimeType: 'image/png', dataURL: 'data:x' },
        used: { lastRetrieved: 123, dataURL: 'data:y', created: 1, mimeType: 'image/png', id: 'used' },
      },
    }
    const lines = serializeSceneBody(messy)
    expect(lines).toEqual([
      '{"type":"excalidraw","version":2,"appState":{"gridSize":20,"viewBackgroundColor":"#fff"}}',
      '{"id":"a","type":"rectangle","x":10.12,"y":20.01,"width":120,"height":60,"angle":0.1235,"groupIds":[],"opacity":100,"roundness":{"type":3,"value":0.3333},"seed":12345}',
      '{"id":"l","type":"line","x":0,"y":0,"width":5,"height":5,"points":[[0,0],[1.23,0],[5,5.56]],"pressures":[0.1235,1]}',
      '{"id":"i","type":"image","x":0,"y":0,"width":1,"height":1,"fileId":"used"}',
      '{"file":{"id":"used","mimeType":"image/png","created":1,"dataURL":"data:y"}}',
    ])
    // Same bytes again from what was written, and from the same scene with shuffled keys.
    expect(serializeSceneBody(parseSceneBody(lines)!)).toEqual(lines)
    const shuffled: DrawingSceneData = {
      ...messy,
      elements: messy.elements.map((el) => Object.fromEntries(Object.entries(el).reverse()) as DrawingElement),
    }
    expect(serializeSceneBody(shuffled)).toEqual(lines)
  })

  it('writes boundElements: null as [] (what Excalidraw turns it into on load)', () => {
    const el = (boundElements: unknown): DrawingElement => ({ id: 'a', type: 'text', x: 0, y: 0, width: 1, height: 1, boundElements })
    const line = (boundElements: unknown) => serializeSceneBody({ appState: {}, elements: [el(boundElements)], files: {} })[1]
    expect(line(null)).toBe(line([]))
    expect(line(null)).toContain('"boundElements":[]')
  })

  it('omits an empty appState and accepts a header without one', () => {
    expect(serializeSceneBody({ appState: {}, elements: [], files: {} })).toEqual(['{"type":"excalidraw","version":2}'])
    expect(parseSceneBody(['{"type":"excalidraw"}'])).toEqual({ appState: {}, elements: [], files: {} })
  })

  it('accepts a whole Excalidraw document pasted in the fence and rewrites it line by line', () => {
    const doc = {
      type: 'excalidraw', version: 2, source: 'https://excalidraw.com',
      elements: [JSON.parse(EL_A), JSON.parse(EL_TA)],
      appState: { viewBackgroundColor: 'transparent', gridSize: null },
      files: {},
    }
    for (const text of [JSON.stringify(doc), JSON.stringify(doc, null, 2)]) {
      const md = sceneBlock(text.split('\n'))
      const block = parseDrawingMarkdown(md)
      expect(block?.kind).toBe('excalidraw')
      expect(serializeDrawingMarkdown(block!)).toBe(sceneBlock([HEADER, EL_A, EL_TA]))
      expectStable(md, sceneBlock([HEADER, EL_A, EL_TA]))
    }
  })

  it('rejects anything that is not a scene', () => {
    const cases: Record<string, string[]> = {
      'empty': [],
      'no header': [EL_A],
      'header of another type': ['{"type":"excalidraw-library","version":2}', EL_A],
      'header that is not an object': ['[]', EL_A],
      'appState that is not an object': ['{"type":"excalidraw","appState":3}'],
      'broken JSON': [HEADER, EL_A.slice(0, -1)],
      'a line that is not an object': [HEADER, '"text"'],
      'element without id': [HEADER, '{"type":"rectangle","x":0}'],
      'element without type': [HEADER, '{"id":"a","x":0}'],
      'duplicated id': [HEADER, EL_A, EL_A],
      'unknown line': [HEADER, '{"library":[]}'],
      'file without dataURL': [HEADER, '{"file":{"id":"f","mimeType":"image/png"}}'],
      'duplicated file': [HEADER, '{"file":{"id":"f","mimeType":"a","dataURL":"b"}}', '{"file":{"id":"f","mimeType":"a","dataURL":"c"}}'],
      'two documents': ['{"type":"excalidraw","elements":[]}', EL_A],
      'conflict markers': [HEADER, `> ${L.local}`, '', EL_A, '', `> ${L.remote}`, '', EL_B, '', `> ${L.end}`],
      'git conflict markers': [HEADER, '<<<<<<< HEAD', EL_A, '=======', EL_B, '>>>>>>> other'],
    }
    for (const [name, lines] of Object.entries(cases)) {
      expect(parseSceneBody(lines), name).toBeNull()
      const md = sceneBlock(lines)
      expect(parseDrawingMarkdown(md), name).toBeNull()
      expectAsBefore(md)
      expectAsBefore(`- item\n\n${md}\n\nafter`)
    }
  })
})

describe('drawing ↔ HTML', () => {
  it('carries the block in data-* attributes and reads it back', () => {
    for (const md of [SOURCE_BLOCK, SCENE_BLOCK, sceneBlock(SCENE_LINES, 'height="320" x="a &amp; b"')]) {
      const block = parseDrawingMarkdown(md)!
      const html = drawingToHtml(block)
      expect(html).toMatch(/^<div data-type="drawing" data-kind="(mermaid|excalidraw)" data-attrs="/)
      const back = drawingFromHtmlData(drawingHtmlDataFromElement(miniElement(html)))
      expect(back).toEqual(block)
    }
  })

  it('escapes whatever the source holds', () => {
    const source = 'A["<b>&amp; \'q\' </div>"] --> B\n\tC -->|"x"| D'
    const md = serializeDrawingMarkdown({ kind: 'mermaid', attrs: 'a="<>"', source })
    expect(htmlFromMarkdown(md)).not.toContain('<b>')
    expectStable(md)
  })
})

describe('htmlFromMarkdown / htmlToMarkdown with drawings', () => {
  it('round-trips both variants byte for byte', () => {
    expect(countDrawings(htmlFromMarkdown(SOURCE_BLOCK))).toBe(1)
    expect(countDrawings(htmlFromMarkdown(SCENE_BLOCK))).toBe(1)
    expectStable(SOURCE_BLOCK)
    expectStable(SCENE_BLOCK)
    expectStable(`# Title\n\n${SOURCE_BLOCK}\n\ntext\n\n${SCENE_BLOCK}`)
  })

  it('reads a drawing that ends the text with a newline (a section file as stored)', () => {
    const NL = String.fromCharCode(10)
    const CR = String.fromCharCode(13)
    for (const block of [SOURCE_BLOCK, SCENE_BLOCK]) {
      for (const md of [block + NL, ['text', '', block, ''].join(NL), block + NL + NL, block + CR + NL]) {
        const html = htmlFromMarkdown(md)
        expect(countDrawings(html), JSON.stringify(md)).toBe(1)
        expect(html).not.toContain('drawing:0')
        expect(roundTrip(md)).toBe(md.split(CR).join('').trim())
      }
    }
  })

  it('does not split the drawing into comment / code / comment', () => {
    const html = htmlFromMarkdown(SOURCE_BLOCK)
    expect(html).not.toContain('language-mermaid')
    expect(html).not.toContain('&lt;!-- drawing')
    expect(html.startsWith('<div data-type="drawing"')).toBe(true)
  })

  it('normalizes loose spacing, CRLF and CR', () => {
    const loose = ['<!-- drawing -->', '', `${F}mermaid`, MERMAID, F, '', '<!-- /drawing -->'].join('\n')
    expectStable(loose, SOURCE_BLOCK)
    expectStable(SOURCE_BLOCK.replace(/\n/g, '\r\n'), SOURCE_BLOCK)
    expectStable(SCENE_BLOCK.replace(/\n/g, '\r\n'), SCENE_BLOCK)
    expectStable(`a\r\n\r\n${SCENE_BLOCK.replace(/\n/g, '\r\n')}\r\n\r\nb`, `a\n\n${SCENE_BLOCK}\n\nb`)
  })

  it('lives between any other blocks', () => {
    const board = '<!-- kanban -->\n- Todo\n  - [ ] card\n<!-- /kanban -->'
    const blocks = [
      '- one\n- two',
      '- [ ] task 📅2026-01-01',
      '| a | b |\n| --- | --- |\n| 1 | 2 |',
      board,
      `${F}js\nconst a = 1\n\nconst b = 2\n${F}`,
      '> quote',
      '# Heading',
      '---',
      'paragraph',
    ]
    for (const block of blocks) {
      for (const drawing of [SOURCE_BLOCK, SCENE_BLOCK]) {
        const md = `${block}\n\n${drawing}\n\n${block === '- one\n- two' ? 'text' : block}`
        expect(countDrawings(htmlFromMarkdown(md)), md).toBe(1)
        expectStable(md)
      }
    }
  })

  it('takes a block boundary when glued to its neighbours', () => {
    expectStable(`text\n${SOURCE_BLOCK}\nmore`, `text\n\n${SOURCE_BLOCK}\n\nmore`)
    expectStable(`- item\n${SCENE_BLOCK}\n- other`, `- item\n\n${SCENE_BLOCK}\n\n- other`)
    // A real code block glued right after is still its own block.
    expectStable(`${SOURCE_BLOCK}\n${F}js\nx\n${F}`, `${SOURCE_BLOCK}\n\n${F}js\nx\n${F}`)
  })

  it('keeps two drawings in a row apart, glued or not, whatever their fence length', () => {
    const long = serializeDrawingMarkdown({ kind: 'mermaid', attrs: '', source: `a\n${F}\nb` })
    for (const [a, b] of [[SOURCE_BLOCK, SCENE_BLOCK], [SCENE_BLOCK, SOURCE_BLOCK], [long, SOURCE_BLOCK], [long, long], [SOURCE_BLOCK, long]]) {
      for (const sep of ['\n', '\n\n', '\n\n\n\n']) {
        const md = `${a}${sep}${b}`
        expect(countDrawings(htmlFromMarkdown(md)), md).toBe(2)
        const once = roundTrip(md)
        expect(once).toContain(a)
        expect(once).toContain(b)
        expectStable(once)
      }
    }
    expectStable(`${SOURCE_BLOCK}\n\n${SCENE_BLOCK}`)
  })

  it('is not a drawing inside a code block: the markers are code', () => {
    const md = `${F}md\n${SOURCE_BLOCK.replace(/```/g, '~~~')}\n${F}`
    expect(countDrawings(htmlFromMarkdown(md))).toBe(0)
    expectStable(md)
    // The whole block quoted in a longer run of text that is one code block.
    const doc = `${F}\n<!-- drawing -->\n${F}mermaid\nA\n${F}\n<!-- /drawing -->\n${F}`
    expectAsBefore(doc)
    // Glued under a code block, it belongs to that block's region as before.
    expectAsBefore(`${F}js\nx\n${F}\n${SOURCE_BLOCK}`)
  })

  it('is not a drawing inside a quote nor in a kanban board', () => {
    const quoted = SOURCE_BLOCK.split('\n').map((l) => `> ${l}`).join('\n')
    expectAsBefore(quoted)
    const html = htmlFromMarkdown(`<!-- kanban -->\n- Todo\n${SOURCE_BLOCK}\n<!-- /kanban -->`)
    expect(html).not.toContain('data-type="kanban"')
  })

  it('leaves the drawing as text when an unpaired fence is glued after it', () => {
    expectAsBefore(`${SOURCE_BLOCK}\n${F}js\nnever closed`)
  })

  it('stays text in plain mode (linked notes)', () => {
    for (const md of [SOURCE_BLOCK, SCENE_BLOCK]) {
      const html = htmlFromMarkdown(md, { plain: true })
      expect(countDrawings(html)).toBe(0)
      expect(html).toBe(refuse(htmlFromMarkdown(defuse(md), { plain: true })))
    }
  })

  it('is read where column widths are not (pasted markdown, AI chat), like boards', () => {
    expect(countDrawings(htmlFromMarkdown(SOURCE_BLOCK, { columnWidths: false }))).toBe(1)
    expect(looksLikeMarkdown(SOURCE_BLOCK)).toBe(true)
  })

  it('does not touch a section without drawings', () => {
    const md = [
      '# Title', '', 'text <!-- not a drawing -->', '', '<!-- drawingboard -->', '', `${F}mermaid`, 'flowchart TD', F, '',
      `${F}excalidraw`, HEADER, F, '', '- [ ] task',
    ].join('\n')
    expect(countDrawings(htmlFromMarkdown(md))).toBe(0)
    expectStable(md)
  })
})

describe('drawingText', () => {
  it('is the Mermaid text of a source', () => {
    expect(drawingText(parseDrawingMarkdown(SOURCE_BLOCK)!)).toBe(MERMAID)
  })

  it('lists the labels of a scene and the connections of its arrows', () => {
    expect(drawingText(parseDrawingMarkdown(SCENE_BLOCK)!)).toBe(['Idea', 'Done', 'A loose note', 'Idea → Done'].join('\n'))
  })

  it('reads arrow direction, labels and text endpoints, and skips what has no name', () => {
    const el = (o: Record<string, unknown>) => ({ x: 0, y: 0, width: 1, height: 1, ...o }) as DrawingElement
    const bind = (id: string) => ({ elementId: id, focus: 0, gap: 1 })
    const scene: DrawingSceneData = {
      appState: {},
      files: {},
      elements: [
        el({ id: 'a', type: 'rectangle' }),
        el({ id: 'ta', type: 'text', containerId: 'a', text: 'Multi\nline', originalText: 'Multi line' }),
        el({ id: 't', type: 'text', text: '  Free   text ' }),
        el({ id: 'empty', type: 'diamond' }),
        el({ id: 'x', type: 'text', text: 'Removed', isDeleted: true }),
        el({ id: 'r1', type: 'arrow', startBinding: bind('a'), endBinding: bind('t'), endArrowhead: 'arrow' }),
        el({ id: 'r1l', type: 'text', containerId: 'r1', text: 'calls' }),
        el({ id: 'r2', type: 'arrow', startBinding: bind('a'), endBinding: bind('t'), startArrowhead: 'arrow', endArrowhead: null }),
        el({ id: 'r3', type: 'arrow', startBinding: bind('a'), endBinding: bind('t'), startArrowhead: 'dot', endArrowhead: 'dot' }),
        el({ id: 'r4', type: 'line', startBinding: bind('a'), endBinding: bind('t') }),
        el({ id: 'r5', type: 'arrow', startBinding: bind('a'), endBinding: bind('empty'), endArrowhead: 'arrow' }),
        el({ id: 'r6', type: 'arrow', startBinding: null, endBinding: bind('t'), endArrowhead: 'arrow' }),
        el({ id: 'r7', type: 'arrow', startBinding: bind('x'), endBinding: bind('t'), endArrowhead: 'arrow' }),
      ],
    }
    expect(drawingText({ kind: 'excalidraw', attrs: '', scene }).split('\n')).toEqual([
      'Multi line', 'Free text', 'calls',
      'Multi line → Free text: calls', 'Free text → Multi line', 'Multi line ↔ Free text', 'Multi line — Free text',
    ])
  })
})

describe('countDrawingMatches (Ctrl+F)', () => {
  const scene = parseDrawingMarkdown(SCENE_BLOCK)!
  it('counts each label once, not again in the connections that repeat it', () => {
    expect(countDrawingMatches(scene, /Idea/gi)).toBe(1)
    expect(countDrawingMatches(scene, /o/gi)).toBe((['Idea', 'Done', 'A loose note'].join('\n').match(/o/gi) ?? []).length)
  })
  it('still finds a query that only a connection has', () => {
    expect(countDrawingMatches(scene, /Idea → Done/g)).toBe(1)
    expect(countDrawingMatches(scene, /→/g)).toBe(1)
    expect(countDrawingMatches(scene, /nothing/g)).toBe(0)
  })
  it('counts in the source of a Mermaid diagram', () => {
    const source = parseDrawingMarkdown(SOURCE_BLOCK)!
    expect(countDrawingMatches(source, /x/g)).toBe((MERMAID.match(/x/g) ?? []).length)
  })
})

// A section with a drawing edited on two devices, through the line merge the
// sync engines use (mergeSectionText). One element per line is what lets it
// work per element; when it can't, the conflict block lands inside the fence,
// the block stops being a drawing and both versions stay in the note as text.
describe('line merge of a section with a scene (mergeSectionText)', () => {
  const section = (lines: string[]) => `# Plan\n\n${sceneBlock(lines)}\n\n- [ ] ship it\n`
  const move = (line: string, x: number) => line.replace(/"x":\d+/, `"x":${x}`)
  const base = section(SCENE_LINES)

  it('merges edits of different elements cleanly, and the result is a valid drawing', () => {
    // Local moves the first shape; remote edits the loose note and adds an element.
    const added = '{"id":"z","type":"diamond","x":500,"y":500,"width":10,"height":10}'
    const local = section([HEADER, move(EL_A, 99), EL_TA, EL_B, EL_TB, EL_AR, EL_NOTE])
    const remote = section([HEADER, EL_A, EL_TA, EL_B, EL_TB, EL_AR, EL_NOTE.replace('A loose note', 'Edited'), added])
    const merged = mergeSectionText(base, local, remote)
    expect(merged.conflicts).toBe(0)
    expect(merged.content).toBe(section([HEADER, move(EL_A, 99), EL_TA, EL_B, EL_TB, EL_AR, EL_NOTE.replace('A loose note', 'Edited'), added]))
    expect(countDrawings(htmlFromMarkdown(merged.content))).toBe(1)
    expect(`${roundTrip(merged.content)}\n`).toBe(merged.content)
  })

  it('keeps the elements both sides added at the end (remote first)', () => {
    const one = '{"id":"l1","type":"diamond","x":1,"y":1,"width":10,"height":10}'
    const two = '{"id":"r1","type":"diamond","x":2,"y":2,"width":10,"height":10}'
    const merged = mergeSectionText(base, section([...SCENE_LINES, one]), section([...SCENE_LINES, two]))
    expect(merged.conflicts).toBe(0)
    expect(merged.content).toBe(section([...SCENE_LINES, two, one]))
    expect(countDrawings(htmlFromMarkdown(merged.content))).toBe(1)
  })

  it('the same element edited on both sides: the block becomes text, with both versions intact', () => {
    const local = section([HEADER, move(EL_A, 111), EL_TA, EL_B, EL_TB, EL_AR, EL_NOTE])
    const remote = section([HEADER, move(EL_A, 222), EL_TA, EL_B, EL_TB, EL_AR, EL_NOTE])
    const merged = mergeSectionText(base, local, remote)
    expect(merged.conflicts).toBe(1)
    expect(merged.content).toContain(move(EL_A, 111))
    expect(merged.content).toContain(move(EL_A, 222))
    expect(merged.content).toContain(`> ${L.local}`)

    // Not a drawing any more: rendered and saved as the plain markdown it is.
    const md = merged.content.replace(/\n$/, '')
    expectAsBefore(md)
    const html = htmlFromMarkdown(md)
    expect(html).toContain('language-excalidraw')
    // Saving keeps every line of both versions, and it is stable.
    const saved = roundTrip(md)
    for (const line of [HEADER, move(EL_A, 111), move(EL_A, 222), EL_TA, EL_B, EL_TB, EL_AR, EL_NOTE, `> ${L.local}`, `> ${L.remote}`, `> ${L.end}`]) {
      expect(saved.split('\n'), line).toContain(line)
    }
    expectStable(saved)

    // Resolving it by hand (deleting the markers and one version) brings the drawing back.
    const resolved = saved.split('\n').filter((l) => !l.startsWith('> ') && l !== move(EL_A, 222)).join('\n')
    expect(countDrawings(htmlFromMarkdown(resolved))).toBe(1)
    expect(roundTrip(resolved)).toBe(section([HEADER, move(EL_A, 111), EL_TA, EL_B, EL_TB, EL_AR, EL_NOTE]).replace(/\n$/, ''))
  })

  it('adjacent elements edited on different sides also conflict (a known limit of the line merge)', () => {
    const local = section([HEADER, move(EL_A, 111), EL_TA, EL_B, EL_TB, EL_AR, EL_NOTE])
    const remote = section([HEADER, EL_A, move(EL_TA, 333), EL_B, EL_TB, EL_AR, EL_NOTE])
    const merged = mergeSectionText(base, local, remote)
    expect(merged.conflicts).toBe(1)
    expectAsBefore(merged.content.replace(/\n$/, ''))
    expect(merged.content).toContain(move(EL_A, 111))
    expect(merged.content).toContain(move(EL_TA, 333))
  })

  it('a Mermaid source edited on both sides at the same line is not read as a diagram', () => {
    const src = (line: string) => `intro\n\n<!-- drawing -->\n${F}mermaid\nflowchart TD\n  ${line}\n${F}\n<!-- /drawing -->\n`
    const merged = mergeSectionText(src('A --> B'), src('A --> C'), src('A --> D'))
    expect(merged.conflicts).toBe(1)
    const md = merged.content.replace(/\n$/, '')
    expectAsBefore(md)
    expect(roundTrip(md)).toContain('A --> C')
    expect(roundTrip(md)).toContain('A --> D')
  })
})

// Randomized round-trip: sections built from ordinary blocks and drawings, glued
// to their neighbours with random separators; whatever the input, the first
// save must be a fixed point and keep every drawing intact.
describe('drawing round-trip fuzz', () => {
  // Deterministic PRNG (mulberry32) so failures are reproducible.
  function rng(seed: number) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  const BLOCKS = [
    'Plain paragraph',
    'Two line\nparagraph',
    '- one\n- two',
    '- [ ] task 📅2026-01-01\n- [x] done',
    '| a | b |\n| --- | --- |\n| 1 | 2 |',
    `${F}js\nconst a = 1\n\nconst b = 2\n${F}`,
    '<!-- kanban done="Done" -->\n- Todo\n  - [ ] card\n- Done\n<!-- /kanban -->',
    '# Heading',
    '> quote',
  ]
  const SOURCE_LINES = ['flowchart TD', '  A[<b>x</b>] --> B{"q & a"}', '', F, `  ${F}`, '````', '%% <!-- /drawing -->', '\tC -.-> D', 'ñandú → ☃', '> not a quote', '- not a list', '| a | b |']
  const TEXTS = ['Idea', 'R&D', '"quoted"', '<tag>', 'ñandú', 'two\nlines', '', '```', 'a\\b', 'tab\there', ' sep']
  const TYPES = ['rectangle', 'ellipse', 'diamond', 'text', 'arrow', 'line', 'freedraw']

  const isList = (b: string) => b.startsWith('- ')
  function randomBlock(r: () => number, prev: string | undefined): string {
    for (;;) {
      const b = BLOCKS[Math.floor(r() * BLOCKS.length)]
      if (!(prev && isList(prev) && isList(b))) return b
    }
  }

  function randomDrawing(r: () => number): DrawingBlock {
    const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]
    const num = () => (r() < 0.3 ? Math.floor(r() * 2000) - 1000 : (r() - 0.5) * 2000)
    const attrs = pick(['', 'height="320"', 'x="a b" y=z'])
    if (r() < 0.5) {
      const source = Array.from({ length: Math.floor(r() * 6) }, () => pick(SOURCE_LINES)).join('\n')
      return { kind: 'mermaid', attrs, source }
    }
    const elements: DrawingElement[] = Array.from({ length: Math.floor(r() * 6) }, (_, i) => {
      const type = pick(TYPES)
      const el: DrawingElement = {
        id: `el${i}`, type, x: num(), y: num(), width: Math.abs(num()), height: Math.abs(num()), angle: r() * 6.28,
        seed: Math.floor(r() * 2 ** 31), version: Math.floor(r() * 50), versionNonce: Math.floor(r() * 2 ** 31),
        updated: 1700000000000 + Math.floor(r() * 1e6), isDeleted: r() < 0.15, groupIds: r() < 0.3 ? ['g1'] : [],
        strokeColor: pick(['#1e1e1e', 'transparent']), roundness: r() < 0.5 ? { type: 3 } : null,
      }
      if (type === 'text') Object.assign(el, { text: pick(TEXTS), fontSize: 20 + r(), lineHeight: 1.25, containerId: null })
      if (type === 'arrow' || type === 'line' || type === 'freedraw') {
        el.points = Array.from({ length: 2 + Math.floor(r() * 3) }, () => [num(), num()])
        if (type === 'arrow') el.startBinding = r() < 0.5 ? { elementId: 'el0', focus: r() - 0.5, gap: r() * 10, fixedPoint: [r(), r()] } : null
        if (type === 'freedraw') el.pressures = [r(), r()]
      }
      return el
    })
    const appState: Record<string, unknown> = r() < 0.5 ? {} : { viewBackgroundColor: pick(['transparent', '#ffffff']), gridSize: 20, zoom: { value: r() } }
    return { kind: 'excalidraw', attrs, scene: { appState, elements, files: {} } }
  }

  it('serialization is a fixed point of parse → serialize', () => {
    const r = rng(1)
    for (let n = 0; n < 400; n++) {
      const md = serializeDrawingMarkdown(randomDrawing(r))
      const block = parseDrawingMarkdown(md)
      expect(block, md).not.toBeNull()
      expect(serializeDrawingMarkdown(block!), md).toBe(md)
      expect(serializeDrawingMarkdown(parseDrawingMarkdown(md.replace(/\n/g, '\r\n'))!), md).toBe(md)
      for (const line of md.split('\n').slice(2, -2)) {
        if (block!.kind === 'excalidraw') expect(() => JSON.parse(line), line).not.toThrow()
      }
    }
  })

  it('round-trips random sections', () => {
    const r = rng(42)
    for (let n = 0; n < 300; n++) {
      const drawings: string[] = []
      let md = ''
      let prev: string | undefined
      let prevIsDrawing = false
      const parts = 1 + Math.floor(r() * 5)
      for (let p = 0; p < parts; p++) {
        const isDrawing = r() < 0.5
        const block = isDrawing ? serializeDrawingMarkdown(randomDrawing(r)) : randomBlock(r, prev)
        if (isDrawing) drawings.push(block)
        // Next to a drawing: glued (\n), separated (\n\n) or with empty paragraphs.
        // An odd run (\n\n\n) is only tried BEFORE a drawing, and a drawing is not
        // glued right after a fence (it would belong to that code block): the
        // same limits as the kanban fuzz, pre-existing and unrelated to drawings.
        const sep = isDrawing
          ? ['\n', '\n\n', '\n\n\n', '\n\n\n\n'][Math.floor(r() * 4) + (prev?.startsWith(F) ? 1 : 0)] ?? '\n\n'
          : prevIsDrawing ? ['\n', '\n\n', '\n\n\n\n'][Math.floor(r() * 3)] : '\n\n'
        md += (p === 0 ? '' : sep) + block
        prev = block
        prevIsDrawing = isDrawing
      }

      expect(countDrawings(htmlFromMarkdown(md)), md).toBe(drawings.length)
      const once = roundTrip(md)
      for (const d of drawings) expect(once, md).toContain(d)
      expect(roundTrip(once), md).toBe(once)
    }
  })

  it('round-trips random canonical sections exactly', () => {
    const r = rng(7)
    for (let n = 0; n < 300; n++) {
      const parts: string[] = []
      const count = 1 + Math.floor(r() * 5)
      for (let p = 0; p < count; p++) {
        parts.push(r() < 0.5 ? serializeDrawingMarkdown(randomDrawing(r)) : randomBlock(r, parts[p - 1]))
      }
      const md = parts.join('\n\n')
      expect(roundTrip(md), md).toBe(md)
    }
  })

  it('renders random broken drawings exactly as before, and saving loses no line', () => {
    const r = rng(99)
    const BAD = ['loose text', '{"id":"dup"', '> ⚠️ Sync conflict — version already synced:', '<<<<<<< HEAD', '[1,2]', 'null', '{"x":1}']
    for (let n = 0; n < 300; n++) {
      let drawing = randomDrawing(r)
      while (drawing.kind !== 'excalidraw') drawing = randomDrawing(r)
      const lines = serializeDrawingMarkdown(drawing).split('\n')
      const bad = BAD[Math.floor(r() * BAD.length)]
      // Somewhere after the header line, inside the fence.
      lines.splice(3 + Math.floor(r() * (lines.length - 4)), 0, bad)
      const block = lines.join('\n')
      const md = `before\n\n${block}\n\nafter`
      expect(parseDrawingMarkdown(block), block).toBeNull()
      expectAsBefore(md)
      const once = roundTrip(md)
      for (const line of lines) expect(once.split('\n'), `${line}\n---\n${md}`).toContain(line)
      expect(roundTrip(once), md).toBe(once)
    }
  })
})
