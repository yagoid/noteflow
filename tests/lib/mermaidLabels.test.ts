import { describe, expect, it } from 'vitest'
import { normalizeMermaidLabel, normalizeMermaidSkeletonTexts } from '../../src/lib/drawing/mermaidLabels'

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
