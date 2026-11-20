import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { agentMarkerToMd, extractDeadlineAnnotations, inlineToHtml, taskAnnotationsToMd } from '../../src/lib/markdownInline'
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

// The agent-task marker (🤖<id>:<state>, lib/agentTasks.ts): one more annotation
// of a task line — read anywhere in it, always written last, never shown as text.
describe('agent-task marker (🤖id:state)', () => {
  const roundTrip = (md: string) => htmlToMarkdown(htmlFromMarkdown(md))

  it('is pulled out of the text with the other annotations', () => {
    expect(extractDeadlineAnnotations('Fix X 📅2026-12-01 ⏰09:30 🔺high 🤖k3f9a:running')).toEqual({
      text: 'Fix X', due: '2026-12-01', alarm: '09:30', importance: 'high', agentId: 'k3f9a', agentState: 'running',
    })
    expect(extractDeadlineAnnotations('🤖k3f9a:queued')).toMatchObject({ text: '', agentId: 'k3f9a', agentState: 'queued' })
  })

  it('is read anywhere in the line and closes the gap it leaves', () => {
    expect(extractDeadlineAnnotations('Fix 🤖k3f9a:review X #ui 📅2026-12-01')).toEqual({
      text: 'Fix X #ui', due: '2026-12-01', alarm: null, importance: null, agentId: 'k3f9a', agentState: 'review',
    })
  })

  it('a state this build does not know is kept as it is', () => {
    expect(extractDeadlineAnnotations('T 🤖k3f9a:paused-by-app')).toMatchObject({ text: 'T', agentId: 'k3f9a', agentState: 'paused-by-app' })
  })

  it('what is not a marker stays text: glued to a word, a 4-char id, upper case, punctuation after it', () => {
    for (const text of ['a🤖k3f9a:queued', 'a 🤖k3f9:queued', 'a 🤖K3F9A:queued', 'a 🤖k3f9a:queued!', 'the 🤖 emoji']) {
      expect(extractDeadlineAnnotations(text)).toMatchObject({ text, agentId: null, agentState: null })
    }
  })

  it('a task has one marker: the first is the task\'s, another on the same line is dropped (as the CLI does)', () => {
    expect(extractDeadlineAnnotations('a 🤖aaaaa:running b 🤖bbbbb:done')).toMatchObject({ text: 'a b', agentId: 'aaaaa', agentState: 'running' })
  })

  it('kinds.agent === false leaves it in the text', () => {
    expect(extractDeadlineAnnotations('T 🤖k3f9a:done 🔺low', { agent: false })).toMatchObject({
      text: 'T 🤖k3f9a:done', importance: 'low', agentId: null, agentState: null,
    })
  })

  it('is written last, after 📅 ⏰ 🔺 — and only when both parts are writable', () => {
    expect(taskAnnotationsToMd('2026-12-01', '09:30', 'high', 'k3f9a', 'running')).toBe(' 📅2026-12-01 ⏰09:30 🔺high 🤖k3f9a:running')
    expect(taskAnnotationsToMd(null, null, null, 'k3f9a', 'done')).toBe(' 🤖k3f9a:done')
    expect(taskAnnotationsToMd('2026-12-01', null, null)).toBe(' 📅2026-12-01')
    expect(agentMarkerToMd('k3f9a', null)).toBe('')
    expect(agentMarkerToMd(null, 'done')).toBe('')
    expect(agentMarkerToMd('nope', 'done')).toBe('')
    expect(agentMarkerToMd('k3f9a', 'two words')).toBe('')
  })

  it('md → html: attributes of the task item, never text', () => {
    const html = htmlFromMarkdown('- [ ] Fix X 📅2026-12-01 🤖k3f9a:running')
    expect(html).toContain('data-agent-id="k3f9a"')
    expect(html).toContain('data-agent-state="running"')
    expect(html).toContain('<p>Fix X</p>')
    expect(html).not.toContain('🤖')
    // A task without a marker renders exactly as before.
    expect(htmlFromMarkdown('- [ ] Fix X 📅2026-12-01')).not.toContain('data-agent')
  })

  it('round-trips byte for byte, in every position the serializers write', () => {
    for (const md of [
      '- [ ] Fix X 🤖k3f9a:queued',
      '- [x] Fix X 📅2026-12-01 ⏰09:30 🔺high 🤖k3f9a:done',
      '- [ ]  🤖k3f9a:queued', // a task with no text: two spaces, as with a lone 📅 (the CLI reads it the same)
      '- [ ] Parent 🤖aaaaa:running\n  - [ ] Child 🤖bbbbb:queued\n  - plain',
      '- [ ] First line 🔺low 🤖k3f9a:waiting\nsecond line',
      '> - [ ] quoted 🤖k3f9a:review',
      '- [ ] unknown state 🤖k3f9a:paused-by-app',
    ]) {
      expect(roundTrip(md), md).toBe(md)
    }
  })

  it('a marker written before the annotations (another editor) goes back to the end', () => {
    expect(roundTrip('- [ ] Fix 🤖k3f9a:review X 📅2026-12-01')).toBe('- [ ] Fix X 📅2026-12-01 🤖k3f9a:review')
    expect(roundTrip('- [ ] T 🤖k3f9a:review 📅2026-12-01')).toBe('- [ ] T 📅2026-12-01 🤖k3f9a:review')
  })

  it('a marker on a later line of the task (a soft break typed before it) is the task\'s: back to the first line', () => {
    expect(roundTrip('- [ ] Fix X\nmore text 🤖k3f9a:running')).toBe('- [ ] Fix X 🤖k3f9a:running\nmore text')
    // …unless the task already has one: then it is text the user wrote, kept where it is.
    const md = '- [ ] Fix X 🤖aaaaa:running\nsee 🤖bbbbb:done'
    expect(roundTrip(md)).toBe(md)
  })

  it('outside a task it is plain text (bullets, paragraphs, ordered items)', () => {
    for (const md of ['- bullet 🤖k3f9a:done', 'para 🤖k3f9a:done', '1. one 🤖k3f9a:done']) {
      expect(htmlFromMarkdown(md)).not.toContain('data-agent')
      expect(roundTrip(md)).toBe(md)
    }
  })

  it('plain Markdown (linked notes): text, like the other annotations', () => {
    const md = '- [ ] Fix X 📅2026-12-01 🤖k3f9a:running'
    const html = htmlFromMarkdown(md, { plain: true })
    expect(html).not.toContain('data-agent')
    expect(html).toContain('🤖k3f9a:running')
  })
})
