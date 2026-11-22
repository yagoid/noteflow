import { describe, expect, it } from 'vitest'
import { fitMermaidLabels, fitMermaidPictures, labelMaxWidth, mermaidPictureSize, normalizeMermaidLabel, normalizeMermaidSkeletonTexts } from '../../src/lib/drawing/mermaidLabels'

describe('normalizeMermaidLabel', () => {
  it('turns every <br> spelling into a real line break', () => {
    expect(normalizeMermaidLabel('Login<br>Check')).toBe('Login\nCheck')
    expect(normalizeMermaidLabel('a<br/>b<br />c<BR>d<br  />e')).toBe('a\nb\nc\nd\ne')
  })

  it('decodes the common HTML entities', () => {
    expect(normalizeMermaidLabel('R&amp;D &lt;core&gt; &quot;x&quot; it&#39;s&nbsp;ok')).toBe('R&D <core> "x" it\'s ok')
    expect(normalizeMermaidLabel('&apos;q&apos; &#x2665; &#9829;')).toBe("'q' ♥ ♥")
  })

  it('decodes in one pass and leaves unknown or invalid entities as written', () => {
    expect(normalizeMermaidLabel('&amp;lt;')).toBe('&lt;')
    expect(normalizeMermaidLabel('&foo; &#0; &#x110000; & alone')).toBe('&foo; &#0; &#x110000; & alone')
  })

  it('leaves other text and tags alone', () => {
    expect(normalizeMermaidLabel('a < b > c')).toBe('a < b > c')
    expect(normalizeMermaidLabel('<brand> <b>x</b>')).toBe('<brand> <b>x</b>')
    expect(normalizeMermaidLabel('plain "quoted" label')).toBe('plain "quoted" label')
  })
})

describe('normalizeMermaidSkeletonTexts', () => {
  it('normalizes text elements and the labels of shapes and arrows, without mutating', () => {
    const input = [
      { type: 'rectangle', id: 'A', label: { text: 'One<br>Two', fontSize: 16 } },
      { type: 'arrow', id: 'e', label: { text: 'yes &amp; no' } },
      { type: 'text', id: 't', text: 'Title<br/>Sub' },
      { type: 'rectangle', id: 'B', label: { text: 'unchanged' } },
      { type: 'line', id: 'l' },
    ]
    const snapshot = JSON.parse(JSON.stringify(input))
    const out = normalizeMermaidSkeletonTexts(input)
    expect(out[0]).toEqual({ type: 'rectangle', id: 'A', label: { text: 'One\nTwo', fontSize: 16 } })
    expect(out[1].label?.text).toBe('yes & no')
    expect(out[2].text).toBe('Title\nSub')
    expect(out[3]).toBe(input[3])
    expect(out[4]).toBe(input[4])
    expect(input).toEqual(snapshot)
  })
})

describe('fitMermaidLabels', () => {
  // 10 px per character at 20 px: the width scales with the size, like a real font.
  const measure = (text: string, fontSize: number) => text.length * fontSize / 2

  it('uses the room Excalidraw gives a label in each shape', () => {
    expect(labelMaxWidth('rectangle', 100)).toBe(90)
    expect(labelMaxWidth('diamond', 100)).toBe(40)
    expect(labelMaxWidth('ellipse', 100)).toBe(61)
  })

  it('leaves labels whose longest word fits, arrows and shapes without text as they were', () => {
    const input = [
      { type: 'rectangle', x: 0, width: 200, label: { text: 'Fits in here', fontSize: 20 } },
      { type: 'arrow', width: 10, label: { text: 'averyveryverylongword', fontSize: 20 } },
      { type: 'diamond', width: 50 },
    ]
    const out = fitMermaidLabels(input, measure)
    out.forEach((el, i) => expect(el).toBe(input[i]))
  })

  it('makes the font smaller so a long word is not broken', () => {
    // "Decision" = 80 px (+1) at 20 px; a 150 px diamond has 65 px for it.
    const [el] = fitMermaidLabels([{ type: 'diamond', x: 10, width: 150, label: { text: 'Decision', fontSize: 20 } }], measure)
    expect(el.label.fontSize).toBe(16)
    expect(el.width).toBe(150)
    expect(el.x).toBe(10)
  })

  it('then grows the shape around its centre, never under 3/4 of the font', () => {
    const input = { type: 'rectangle', x: 100, width: 60, label: { text: 'Authorization', fontSize: 20 }, height: 40 }
    const [el] = fitMermaidLabels([input], measure)
    expect(el.label.fontSize).toBe(15)
    // 13 chars × 7.5 px + 1 px (scaled) fit in width − 10.
    expect(labelMaxWidth('rectangle', el.width)).toBeGreaterThanOrEqual(13 * 7.5)
    expect(el.x + el.width / 2).toBeCloseTo(100 + 60 / 2)
    expect(input.width).toBe(60) // not mutated
  })

  it('takes the default size for a label without one', () => {
    const [el] = fitMermaidLabels([{ type: 'rectangle', width: 50, label: { text: 'Overflowing' } }], measure)
    expect(el).toMatchObject({ label: { fontSize: 15 } })
  })
})

describe('mermaidPictureSize / fitMermaidPictures', () => {
  const svgURL = (svg: string) => `data:image/svg+xml;base64,${btoa(svg)}`
  const pie = svgURL('<svg aria-roledescription="pie" width="300" height="200" viewBox="0 0 662.5 450" xmlns="http://www.w3.org/2000/svg"><g/></svg>')

  it('reads the size an SVG was drawn at from its viewBox', () => {
    expect(mermaidPictureSize(pie)).toEqual({ width: 662.5, height: 450 })
    expect(mermaidPictureSize(svgURL('<svg width="10"></svg>'))).toBeNull()
    expect(mermaidPictureSize('data:image/png;base64,AAAA')).toBeNull()
    expect(mermaidPictureSize('data:image/svg+xml;base64,@@@')).toBeNull()
  })

  it('shows a picture measured smaller than that at its drawn size; others as they were', () => {
    const files = { f: { dataURL: pie } }
    const small = { type: 'image', fileId: 'f', x: 0, y: 0, width: 300, height: 200 }
    const big = { type: 'image', fileId: 'f', x: 0, y: 0, width: 800, height: 543 }
    const [a, b] = fitMermaidPictures([small, big], files)
    expect(a).toEqual({ ...small, width: 662.5, height: 450 })
    expect(b).toBe(big)
    expect(fitMermaidPictures([{ type: 'image', fileId: 'missing', width: 1, height: 1 }], files)[0].width).toBe(1)
  })
})
