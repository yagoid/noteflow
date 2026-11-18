import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { appendDrawing, countDrawing, replaceDrawing } from '../../src/lib/drawing/drawingReplace'
import { drawingHtmlDataFromElement, parseSceneBody, type DrawingHtmlData } from '../../src/lib/drawing/drawingBlock'
import { htmlFromMarkdown, htmlToMarkdown } from '../../src/lib/markdownHtml'
import { installMiniDom, miniElement } from '../helpers/miniDom'

// Saving a drawing by IDENTITY, without an editor: the canvas may outlive the editor that
// opened it (another note on screen, a window closing), and the block may have changed
// under it (sync, the AI). A write only ever lands on the block that was opened.
let uninstallDom: () => void
beforeAll(() => { uninstallDom = installMiniDom() })
afterAll(() => uninstallDom())

const F = '```'
const HEADER = '{"type":"excalidraw","version":2,"appState":{"viewBackgroundColor":"transparent"}}'
const el = (id: string, x: number) => `{"id":"${id}","type":"rectangle","x":${x},"y":0,"width":10,"height":10}`
const scene = (lines: string[], attrs = '') => [`<!-- drawing${attrs ? ` ${attrs}` : ''} -->`, `${F}excalidraw`, HEADER, ...lines, F, '<!-- /drawing -->'].join('\n')
const data = (lines: string[], attrs = ''): DrawingHtmlData => ({ kind: 'excalidraw', attrs, body: [HEADER, ...lines].join('\n') })
const MERMAID = ['<!-- drawing -->', `${F}mermaid`, 'flowchart TD', '  A --> B', F, '<!-- /drawing -->'].join('\n')
const mermaidData: DrawingHtmlData = { kind: 'mermaid', attrs: '', body: 'flowchart TD\n  A --> B' }

/** The data the editor node of the n-th drawing of `md` holds (what a session opens with). */
const opened = (md: string, n = 0): DrawingHtmlData => {
  const html = htmlFromMarkdown(md)
  const divs = html.match(/<div data-type="drawing"[\s\S]*?<\/pre><\/div>/g) ?? []
  return drawingHtmlDataFromElement(miniElement(divs[n]))
}

describe('replaceDrawing', () => {
  const A = scene([el('a', 1)])
  const B = scene([el('b', 2)], 'height="200"')
  const md = `Intro\n\n${A}\n\nMiddle\n\n${B}\n\nEnd\n`

  it('replaces exactly the block that was opened, leaving the rest byte for byte', () => {
    const next = data([el('a', 1), el('new', 9)])
    expect(replaceDrawing(md, opened(md, 0), next)).toBe(`Intro\n\n${scene([el('a', 1), el('new', 9)])}\n\nMiddle\n\n${B}\n\nEnd\n`)
    const nextB = data([el('b', 5)], 'height="200"')
    expect(replaceDrawing(md, opened(md, 1), nextB)).toBe(`Intro\n\n${A}\n\nMiddle\n\n${scene([el('b', 5)], 'height="200"')}\n\nEnd\n`)
  })

  it('what the editor would save and what this writes are the same text', () => {
    const next = data([el('a', 1), el('new', 9)])
    const viaStore = replaceDrawing(md, opened(md, 0), next)!
    expect(htmlToMarkdown(htmlFromMarkdown(viaStore))).toBe(viaStore.trim())
  })

  it('refuses when the opened block is no longer there (changed or removed meanwhile)', () => {
    const o = opened(md, 0)
    const next = data([el('mine', 3)])
    expect(replaceDrawing(md.replace(el('a', 1), el('a', 77)), o, next)).toBeNull() // edited remotely
    expect(replaceDrawing(`Intro\n\nMiddle\n\n${B}`, o, next)).toBeNull()           // deleted
    expect(replaceDrawing('', o, next)).toBeNull()
  })

  it('a block only resized meanwhile is still the same drawing: written, with the size it has now', () => {
    const resized = md.replace('<!-- drawing -->', '<!-- drawing width="900" height="90" -->')
    const out = replaceDrawing(resized, opened(md, 0), data([el('a', 1), el('mine', 3)]))!
    expect(out).toContain(scene([el('a', 1), el('mine', 3)], 'width="900" height="90"'))
    expect(out).not.toContain('<!-- drawing -->')
    expect(countDrawing(resized, opened(md, 0))).toBe(1)
  })

  it('is not fooled by another drawing taking its place in the document', () => {
    // A new drawing inserted above: the opened one is still found, the new one untouched.
    const above = scene([el('other', 4)])
    const shifted = `${above}\n\n${md}`
    const out = replaceDrawing(shifted, opened(md, 0), data([el('a', 50)]))!
    expect(out).toContain(above)
    expect(out).toContain(scene([el('a', 50)]))
    expect(out).not.toContain(el('a', 1))
  })

  it('among identical blocks, the ordinal says which', () => {
    const twice = `${A}\n\ntext\n\n${A}`
    const o = opened(twice, 0)
    expect(countDrawing(twice, o)).toBe(2)
    const next = data([el('z', 0)])
    expect(replaceDrawing(twice, o, next, 0)).toBe(`${scene([el('z', 0)])}\n\ntext\n\n${A}`)
    expect(replaceDrawing(twice, o, next, 1)).toBe(`${A}\n\ntext\n\n${scene([el('z', 0)])}`)
    expect(replaceDrawing(twice, o, next, 7)).toBe(`${A}\n\ntext\n\n${scene([el('z', 0)])}`)
  })

  it('turns a Mermaid source into a scene, and removes a block', () => {
    const src = `a\n\n${MERMAID}\n\nb`
    expect(opened(src)).toEqual(mermaidData)
    expect(replaceDrawing(src, mermaidData, data([el('m', 1)]))).toBe(`a\n\n${scene([el('m', 1)])}\n\nb`)
    expect(replaceDrawing(src, mermaidData, null)).toBe('a\n\n\nb')
  })

  it('matches a block written loosely on disk by its canonical content', () => {
    const loose = ['<!-- drawing -->', '', `${F}excalidraw`, HEADER, '', '{"type":"rectangle","id":"a","y":0,"x":1,"height":10,"width":10}', F, '<!-- /drawing -->'].join('\n')
    expect(replaceDrawing(loose, opened(loose), data([el('a', 2)]))).toBe(scene([el('a', 2)]))
  })

  it('never touches a block inside a code fence or an invalid one', () => {
    const o = opened(A)
    expect(replaceDrawing(`${F}md\n${A.replace(/```/g, '~~~')}\n${F}`, o, data([]))).toBeNull()
    expect(replaceDrawing(A.replace('"type":"excalidraw"', '"type":"x"'), o, data([]))).toBeNull()
  })
})

describe('appendDrawing', () => {
  it('adds the drawing as a new block at the end of the section', () => {
    const d = data([el('n', 1)])
    expect(appendDrawing('Text\n\n- item\n', d)).toBe(`Text\n\n- item\n\n${scene([el('n', 1)])}`)
    expect(appendDrawing('', d)).toBe(scene([el('n', 1)]))
    expect(appendDrawing('   \n', d)).toBe(scene([el('n', 1)]))
    const out = appendDrawing(`Text\n\n${scene([el('old', 1)])}`, d)
    expect((htmlFromMarkdown(out).match(/data-type="drawing"/g) ?? []).length).toBe(2)
  })
})

describe('scene files', () => {
  it('a file whose dataURL is not a data: URL makes the block invalid (never a link to fetch)', () => {
    const file = (url: string) => `{"file":{"id":"f","mimeType":"image/png","dataURL":"${url}"}}`
    expect(parseSceneBody([HEADER, file('data:image/png;base64,AAAA')])).not.toBeNull()
    for (const url of ['https://example.com/x.png', 'file:///C:/x.png', 'javascript:alert(1)', '']) {
      expect(parseSceneBody([HEADER, file(url)]), url).toBeNull()
    }
    expect(parseSceneBody([JSON.stringify({ type: 'excalidraw', elements: [], files: { f: { mimeType: 'image/png', dataURL: 'https://example.com/x.png' } } })])).toBeNull()
  })
})
