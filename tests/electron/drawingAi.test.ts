import { describe, it, expect } from 'vitest'
import { DRAWING_HOWTO, extractTags, restoreStrippedImages } from '../../electron/ai/llm/tools'
import { stripBase64 } from '../../electron/ai/chatContext'
import { parseDrawingMarkdown } from '../../src/lib/drawing/drawingBlock'
import { htmlFromMarkdown } from '../../src/lib/markdownHtml'

// Drawing blocks and the AI: what a model reads of a section (chat context, get_note) and
// what update_section writes back. A scene is never shown as JSON: one `[drawing #n: …]`
// line, which the write turns back into the original block.

const F = '```'
const IMG = `data:image/png;base64,${'A'.repeat(64)}`
const INNER = `data:image/png;base64,${'B'.repeat(64)}`
const HEADER = '{"type":"excalidraw","version":2,"appState":{"viewBackgroundColor":"transparent"}}'
const SCENE = ['<!-- drawing height="300" -->', `${F}excalidraw`, HEADER,
  '{"id":"a","type":"rectangle","x":10,"y":20,"width":120,"height":60,"seed":424242,"strokeColor":"#e03131","boundElements":[{"id":"t","type":"text"}]}',
  '{"id":"t","type":"text","x":20,"y":30,"width":40,"height":20,"containerId":"a","text":"Billing service"}',
  '{"id":"i","type":"image","x":0,"y":0,"width":10,"height":10,"fileId":"f1"}',
  `{"file":{"id":"f1","mimeType":"image/png","created":1,"dataURL":"${INNER}"}}`,
  F, '<!-- /drawing -->'].join('\n')
const MERMAID = ['<!-- drawing -->', `${F}mermaid`, 'flowchart TD', '  A[Start] --> B[End]', F, '<!-- /drawing -->'].join('\n')
const SECTION = `Intro with ![shot](${IMG})\n\n${SCENE}\n\n${MERMAID}\n\nOutro`

describe('what the model reads (stripBase64)', () => {
  const seen = stripBase64(SECTION)

  it('a scene is one marker line with its labels; no JSON, no base64', () => {
    expect(seen).toBe(`Intro with ![shot]([image])\n\n[drawing #1: Billing service]\n\n${MERMAID}\n\nOutro`)
    for (const noise of ['424242', 'rectangle', 'excalidraw', 'e03131', 'base64', 'BBBB', 'AAAA']) expect(seen).not.toContain(noise)
  })

  it('a Mermaid drawing is shown as the text it is', () => {
    expect(seen).toContain(MERMAID)
  })

  it('tags of a note ignore everything inside drawings (mirror of the renderer)', () => {
    expect(extractTags(`#real ${SECTION} #other`)).toEqual(['real', 'other'])
  })
})

describe('what update_section writes (restoreStrippedImages)', () => {
  const seen = stripBase64(SECTION)

  it('returning the text untouched restores the section byte for byte', () => {
    expect(restoreStrippedImages(SECTION, seen)).toBe(SECTION)
  })

  it('edits around the drawing keep the original block — attributes, scene and its inner image', () => {
    const rewritten = seen.replace('Intro with', 'A new intro with').replace('Outro', 'A new outro\n\n- [ ] follow up')
    const out = restoreStrippedImages(SECTION, rewritten)
    expect(out).toBe(SECTION.replace('Intro with', 'A new intro with').replace('Outro', 'A new outro\n\n- [ ] follow up'))
    expect(out).toContain(SCENE)
    expect(out).toContain(`![shot](${IMG})`)
    const html = htmlFromMarkdown(out)
    expect((html.match(/data-type="drawing"/g) ?? []).length).toBe(2)
  })

  it('the outer image is matched to the outer placeholder, not to the picture inside the scene', () => {
    // Model moved the image below the drawing.
    const moved = `[drawing #1: Billing service]\n\n![shot]([image])`
    expect(restoreStrippedImages(SECTION, moved)).toBe(`${SCENE}\n\n![shot](${IMG})`)
  })

  it('the model can rewrite or add a Mermaid drawing, and it is a valid block', () => {
    const next = seen.replace('A[Start] --> B[End]', 'A[Start] --> B[Middle] --> C[End]')
    const out = restoreStrippedImages(SECTION, next)
    expect(out).toContain('B[Middle]')
    const added = restoreStrippedImages('Just text', `Just text\n\n<!-- drawing -->\n${F}mermaid\nsequenceDiagram\n  A->>B: hi\n${F}\n<!-- /drawing -->`)
    expect(parseDrawingMarkdown(added.split('\n\n')[1])).toEqual({ kind: 'mermaid', attrs: '', source: 'sequenceDiagram\n  A->>B: hi' })
  })

  it('a scene whose marker the model leaves out is NOT deleted: it is kept at the end of the section', () => {
    const out = restoreStrippedImages(SECTION, 'Rewritten from scratch')
    expect(out).toBe(`Rewritten from scratch\n\n${SCENE}`)
    // …while an image it leaves out is gone, as before.
    expect(out).not.toContain(IMG)
  })

  it('a marker put in a list item or mid-sentence still restores the drawing as its own block', () => {
    const out = restoreStrippedImages(SECTION, '- step one\n- [drawing #1: Billing service]\n- step two')
    expect(out).toBe(`- step one\n\n${SCENE}\n\n- step two`)
    expect((htmlFromMarkdown(out).match(/data-type="drawing"/g) ?? []).length).toBe(1)
  })

  it('a made-up marker is left as text and a repeated one never duplicates the drawing', () => {
    expect(restoreStrippedImages(SECTION, 'a\n[drawing #2: invented]\n[drawing #1]\n[drawing #1]\nb')).toBe(`a\n[drawing #2: invented]\n\n${SCENE}\n\nb`)
  })

  it('a note without drawings keeps a line that merely looks like a marker', () => {
    expect(restoreStrippedImages('no drawings', 'x\n[drawing #1: my own text]\ny')).toBe('x\n[drawing #1: my own text]\ny')
  })

  it('the dataURL inside an INVALID drawing block does not take the slot of the next image', () => {
    const broken = SCENE.replace('"type":"excalidraw"', '"type":"other"')
    const section = `${broken}\n\n![after](${IMG})`
    const seen = stripBase64(section)
    expect(seen).toContain('![after]([image])')
    const out = restoreStrippedImages(section, 'New text\n\n![after]([image])')
    expect(out).toBe(`New text\n\n![after](${IMG})`)
    expect(out).not.toContain(INNER)
  })
})

describe('instructions to the model', () => {
  it('describe a block the app actually reads as a drawing', () => {
    expect(DRAWING_HOWTO).toContain('<!-- drawing -->')
    expect(DRAWING_HOWTO).toContain('<!-- /drawing -->')
    expect(DRAWING_HOWTO).toContain('mermaid')
    expect(DRAWING_HOWTO).toMatch(/cannot change nor delete/)
    const example = `Text\n\n<!-- drawing -->\n${F}mermaid\nflowchart LR\n  A --> B\n${F}\n<!-- /drawing -->\n\nMore`
    expect(htmlFromMarkdown(example)).toContain('data-kind="mermaid"')
  })
})
