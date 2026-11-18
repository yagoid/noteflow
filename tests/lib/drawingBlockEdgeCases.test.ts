import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { htmlFromMarkdown, htmlToMarkdown } from '../../src/lib/markdownHtml'
import {
  drawingHtmlDataToMarkdown,
  parseDrawingMarkdown,
  parseSceneBody,
  serializeDrawingMarkdown,
  type DrawingHtmlData,
} from '../../src/lib/drawing/drawingBlock'
import { installMiniDom } from '../helpers/miniDom'

// Edge cases of the drawing block found in review: each one must leave the text exactly
// as it would be read if drawing blocks didn't exist.
let uninstallDom: () => void
beforeAll(() => { uninstallDom = installMiniDom() })
afterAll(() => uninstallDom())

const F = '```'
const roundTrip = (md: string) => htmlToMarkdown(htmlFromMarkdown(md))
const countDrawings = (html: string) => (html.match(/data-type="drawing"/g) ?? []).length
const defuse = (md: string) => md.replace(/<!-- (\/?)drawing/g, '<!-- $1drawinx')
const refuse = (s: string) => s.replace(/drawinx/g, 'drawing')
const expectAsBefore = (md: string) => {
  const html = htmlFromMarkdown(md)
  expect(countDrawings(html), md).toBe(0)
  expect(html, md).toBe(refuse(htmlFromMarkdown(defuse(md))))
  expect(roundTrip(md), md).toBe(refuse(roundTrip(defuse(md))))
}

const SOURCE_BLOCK = ['<!-- drawing -->', `${F}mermaid`, 'flowchart TD', '  A --> B', F, '<!-- /drawing -->'].join('\n')
const EL = '{"id":"a","type":"rectangle","x":0,"y":0,"width":10,"height":10}'
const scene = (header: string) => ['<!-- drawing -->', `${F}excalidraw`, header, EL, F, '<!-- /drawing -->'].join('\n')

describe('scene format version', () => {
  it('reads version 2, an older one and a header without version', () => {
    for (const header of ['{"type":"excalidraw","version":2}', '{"type":"excalidraw","version":1}', '{"type":"excalidraw"}']) {
      expect(parseSceneBody([header, EL]), header).not.toBeNull()
    }
  })

  it('a later version is not a drawing for this build: the block stays text, untouched', () => {
    for (const header of ['{"type":"excalidraw","version":3}', '{"type":"excalidraw","version":2.1}', '{"type":"excalidraw","version":99,"appState":{}}']) {
      expect(parseSceneBody([header, EL]), header).toBeNull()
      expect(parseDrawingMarkdown(scene(header)), header).toBeNull()
      expectAsBefore(`before\n\n${scene(header)}\n\nafter`)
    }
    // …also as a whole pasted document.
    expect(parseSceneBody(['{"type":"excalidraw","version":3,"elements":[]}'])).toBeNull()
    expect(parseSceneBody(['{', '"type":"excalidraw",', '"version":3,', '"elements":[]', '}'])).toBeNull()
  })
})

describe('marker attributes holding -->', () => {
  it('is not an opening marker: nothing is rewritten', () => {
    for (const marker of ['<!-- drawing a="-->" -->', '<!-- drawing --> -->', '<!-- drawing x --> y="1" -->']) {
      const md = SOURCE_BLOCK.replace('<!-- drawing -->', marker)
      expect(parseDrawingMarkdown(md), marker).toBeNull()
      expectAsBefore(md)
      expectAsBefore(`text\n\n${md}\n\nmore`)
    }
  })

  it('attributes are written back as given (opaque), entities included', () => {
    const md = SOURCE_BLOCK.replace('<!-- drawing -->', '<!-- drawing a="--&gt;" b=x>y -->')
    const block = parseDrawingMarkdown(md)!
    expect(block.attrs).toBe('a="--&gt;" b=x>y')
    expect(serializeDrawingMarkdown(block)).toBe(md)
  })
})

describe('the internal slot line cannot be faked by the text', () => {
  const NUL = String.fromCharCode(0)
  it('a literal slot-looking line stays text and the drawing is not duplicated', () => {
    for (const fake of [`${NUL}drawing:0${NUL}`, `${NUL}drawing:1${NUL}`, `${NUL}drawing1:0${NUL}`]) {
      for (const md of [`${fake}\n\n${SOURCE_BLOCK}`, `${SOURCE_BLOCK}\n\n${fake}`, `${fake}\n\n${SOURCE_BLOCK}\n\n${fake}\n\n${SOURCE_BLOCK}`]) {
        const html = htmlFromMarkdown(md)
        const drawings = (md.match(/<!-- drawing -->/g) ?? []).length
        expect(countDrawings(html), JSON.stringify(md)).toBe(drawings)
        // The fake line is a paragraph of its own, exactly as without any drawing around.
        const fakeHtml = htmlFromMarkdown(fake)
        expect(html.split(fakeHtml).length - 1, JSON.stringify(md)).toBe((md.split(fake).length - 1))
        const once = roundTrip(md)
        expect((once.match(/<!-- drawing -->/g) ?? []).length).toBe(drawings)
        expect(roundTrip(once)).toBe(once)
      }
    }
  })

  it('a text with no drawing renders the same whatever slot-looking lines it holds', () => {
    const fake = `${NUL}drawing:0${NUL}`
    expect(countDrawings(htmlFromMarkdown(fake))).toBe(0)
    expect(countDrawings(htmlFromMarkdown(`a\n\n${fake}\n\nb`))).toBe(0)
  })
})

describe('a fence that is never closed before a drawing', () => {
  it('keeps the whole block as code, as it always was (4+ backtick drawing fence)', () => {
    const md = `${F}unclosed\nfoo\n<!-- drawing -->\n${F}\`mermaid\nA\n${F}\`\n<!-- /drawing -->`
    expectAsBefore(md)
    expect(htmlFromMarkdown(md)).toContain('language-unclosed')
    expectAsBefore(`intro\n\n${md}`)
  })

  it('…and with a 3-backtick drawing fence', () => {
    expectAsBefore(`${F}unclosed\nfoo\n${SOURCE_BLOCK}`)
  })

  it('after a blank line the drawing is outside that block and is read', () => {
    const md = `${F}unclosed\nfoo\n\n<!-- drawing -->\n${F}\`mermaid\nA\n${F}\`\n<!-- /drawing -->`
    expect(countDrawings(htmlFromMarkdown(md))).toBe(1)
    const once = roundTrip(md)
    expect(roundTrip(once)).toBe(once)
  })
})

describe('drawingHtmlDataToMarkdown', () => {
  it('gives the same text for the same data, cached or not, and tells different data apart', () => {
    const header = '{"type":"excalidraw","version":2}'
    const a: DrawingHtmlData = { kind: 'excalidraw', attrs: '', body: [header, EL].join('\n') }
    const b: DrawingHtmlData = { ...a, attrs: 'height="200"' }
    const c: DrawingHtmlData = { ...a, body: [header, EL.replace('"x":0', '"x":5')].join('\n') }
    const first = drawingHtmlDataToMarkdown(a)
    expect(drawingHtmlDataToMarkdown({ ...a })).toBe(first)
    expect(drawingHtmlDataToMarkdown(b)).toContain('<!-- drawing height="200" -->')
    expect(drawingHtmlDataToMarkdown(c)).toContain('"x":5')
    expect(drawingHtmlDataToMarkdown(a)).toBe(first)
    // Past the cache size the answers are still right.
    for (let i = 0; i < 60; i++) {
      const d: DrawingHtmlData = { kind: 'mermaid', attrs: '', body: `A --> B${i}` }
      expect(drawingHtmlDataToMarkdown(d)).toContain(`A --> B${i}`)
    }
    expect(drawingHtmlDataToMarkdown(a)).toBe(first)
  })
})
