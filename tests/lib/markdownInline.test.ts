import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { inlineToHtml } from '../../src/lib/markdownInline'
import { htmlFromMarkdown, htmlToMarkdown } from '../../src/lib/markdownHtml'
import { kanbanDataToHtml, parseKanbanMarkdown, serializeKanbanMarkdown, kanbanDataFromElement } from '../../src/lib/kanban'
import { installMiniDom, miniElement } from '../helpers/miniDom'

// inlineToHtml output is rendered with innerHTML (kanban cards, previews, chat),
// so link/image URLs and alt text must not be able to close their attribute.

let uninstallDom: () => void
beforeAll(() => { uninstallDom = installMiniDom() })
afterAll(() => uninstallDom())

/** Attribute names of every tag in an HTML string (to spot injected handlers). */
const attrNames = (html: string) =>
  [...html.matchAll(/<[a-z]+((?:\s+[a-z-]+(?:="[^"]*")?)*)\s*>/gi)]
    .flatMap((m) => [...m[1].matchAll(/\s+([a-z-]+)(?:="[^"]*")?/gi)].map((a) => a[1].toLowerCase()))

describe('inlineToHtml — attribute escaping', () => {
  it('a quote in an image src/alt cannot inject attributes', () => {
    const html = inlineToHtml('![x" onload="a](x" onerror="alert(1))')
    expect(attrNames(html)).toEqual(['alt', 'src'])
    expect(html).toBe('<img alt="x&quot; onload=&quot;a" src="x&quot; onerror=&quot;alert(1">)')
  })

  it('a quote in a link href cannot inject attributes', () => {
    const html = inlineToHtml('[click](https://x" onmouseover="alert(1))')
    expect(attrNames(html)).toEqual(['href'])
    expect(html).toContain('href="https://x&quot; onmouseover=&quot;alert(1"')
  })

  it('a quote in a section-relation id cannot inject attributes', () => {
    const html = inlineToHtml('[S](noteflow://n" onclick="x/s")')
    expect(attrNames(html)).toEqual(['data-type', 'data-note-id', 'data-section-id'])
  })

  it('also in a kanban card', () => {
    const board = parseKanbanMarkdown('<!-- kanban -->\n- A\n  - [ ] ![x](x" onerror="alert(1))\n<!-- /kanban -->')!
    const html = kanbanDataToHtml(board)
    expect(html).not.toMatch(/onerror="/)
    expect(kanbanDataFromElement(miniElement(html))).toEqual(board)
    expect(serializeKanbanMarkdown(board)).toContain('![x](x" onerror="alert(1))')
  })
})

describe('inline links/images round-trip (md → html → md)', () => {
  const roundTrip = (md: string) => htmlToMarkdown(htmlFromMarkdown(md))
  const cases = [
    'See [docs](https://example.com/a?b=1&c=2) and ![logo](data:image/png;base64,AAA=){width=120}.',
    'Quote in url [q](https://x.com/"a") and alt ![say "hi"](pic.png)',
    'A relation [Spec & plan](noteflow://n1/s1) here',
    '- [ ] task with [link](http://a.b/<c>) 📅2026-01-01',
  ]
  for (const md of cases) {
    it(`is byte-identical: ${md.slice(0, 40)}`, () => {
      expect(roundTrip(md)).toBe(md)
    })
  }
})
