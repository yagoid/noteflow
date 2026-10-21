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

describe('underline (++) and highlight (==) flanking', () => {
  const roundTrip = (md: string) => htmlToMarkdown(htmlFromMarkdown(md))

  const literals = [
    'C++',
    'I write C++ and then more C++ every day',
    'C++11 vs C++14 and C++/C++',
    'a++b++',
    'x = a ++ b ++ c',
    'Notepad++ and g++ -o foo++',
    'if a == b and c == d',
    'x==y and z==w',
    'a === b === c',
  ]
  for (const md of literals) {
    it(`keeps plain text as text: ${md}`, () => {
      const html = htmlFromMarkdown(md)
      expect(html).not.toContain('<u>')
      expect(html).not.toContain('<mark>')
      expect(roundTrip(md)).toBe(md)
    })
  }

  it('does not pair ++ across two code spans on one line', () => {
    const md = 'Use `i++` and `j++` in loops'
    expect(htmlFromMarkdown(md)).toBe('<p>Use <code>i++</code> and <code>j++</code> in loops</p>')
    expect(roundTrip(md)).toBe(md)
  })

  it('keeps markers inside code literal', () => {
    for (const md of ['`a*b*c`', '`i++`', '`==x==`', '`**x**` and `__y__`', 'see `[a](b)` here']) {
      expect(roundTrip(md)).toBe(md)
      expect(htmlFromMarkdown(md)).not.toMatch(/<(u|mark|em|strong|a)\b/)
    }
  })

  it('parses and round-trips real underline and highlight', () => {
    expect(htmlFromMarkdown('An ++underlined++ word')).toBe('<p>An <u>underlined</u> word</p>')
    expect(htmlFromMarkdown('A ==highlighted== word')).toBe('<p>A <mark>highlighted</mark> word</p>')
    for (const md of [
      'An ++underlined++ word and a ==highlight==.',
      '**bold ++under++ bold**',
      '++under `code`++ then `code`++u++',
      '(++x++) ==a== ++b++',
      '++Learn C++++',
      '==++both++==',
      '++C++ and Java++',
    ]) {
      expect(roundTrip(md)).toBe(md)
    }
  })

  it('still loads a mark written with a trailing space by older builds', () => {
    expect(htmlFromMarkdown('++word ++ next')).toBe('<p><u>word </u> next</p>')
    // …and writes it back with the space outside the delimiters.
    expect(roundTrip('++word ++ next')).toBe('++word++  next')
  })

  it('moves edge whitespace out of a mark and drops a mark inside a word', () => {
    expect(htmlToMarkdown('<p>a<u> b </u>c</p>')).toBe('a ++b++ c')
    expect(htmlToMarkdown('<p>foo<u>bar</u>baz</p>')).toBe('foobarbaz')
    expect(htmlToMarkdown('<p>foo<mark>bar</mark> baz</p>')).toBe('foobar baz')
    expect(htmlToMarkdown('<p>a<u> </u>x</p>')).toBe('a x')
  })

  it('drops a mark that a literal ++ inside it would close early', () => {
    // `++a++ b++` would read back as <u>a</u> b++: write the text without the mark.
    expect(htmlToMarkdown('<p><u>a++ b</u></p>')).toBe('a++ b')
  })

  it('splits a mark at a line break', () => {
    expect(htmlToMarkdown('<p><u>a<br>b</u></p>')).toBe('++a++\n++b++')
    expect(htmlFromMarkdown('++a++\n++b++')).toBe('<p><u>a</u><br><u>b</u></p>')
  })

  it('keeps marker characters in URLs out of the mark regexes', () => {
    for (const md of [
      '[init](https://x.com/__init__.py) and ![a](C++/x++.png)',
      '[code](http://x/`y`) ok',
    ]) {
      expect(roundTrip(md)).toBe(md)
    }
  })

  it('cannot be confused by placeholder characters in user text', () => {
    const md = 'odd \uE0000\uE001 text `i++` and `j++`'
    expect(roundTrip(md)).toBe(md)
  })
})

describe('multi-line task annotations round-trip (md → html → md)', () => {
  const roundTrip = (md: string) => htmlToMarkdown(htmlFromMarkdown(md))
  it('keeps a continuation-line annotation of a kind the task already has', () => {
    const md = '- [ ] Ship 📅2026-01-02\nwas 📅2025-12-20 before slip'
    expect(roundTrip(md)).toBe(md)
  })
  it('moves a recovered annotation of a new kind to the first line', () => {
    expect(roundTrip('- [ ] Ship 📅2026-01-02\nthen 🔺high')).toBe('- [ ] Ship 📅2026-01-02 🔺high\nthen')
  })
})
