// @vitest-environment happy-dom
//
// Linked notes (external .md files): the plain-Markdown pipeline (NoteFlow's own
// syntax stays text) and the preservation of the user's source for the blocks an
// edit didn't touch (lib/linkedMarkdown.ts). Runs on the REAL plain schema
// (schemaExtensions({ plain: true })) with the same load/save as Editor.tsx.

import { describe, expect, it } from 'vitest'
import { createDocument, getHTMLFromFragment, getSchema } from '@tiptap/core'
import { schemaExtensions } from '../../src/components/Editor/editorExtensions'
import { htmlFromMarkdown, htmlToMarkdown } from '../../src/lib/markdownHtml'
import { joinTopBlocks, preserveUnchangedBlocks, splitTopBlocks, withBlankEdges } from '../../src/lib/linkedMarkdown'

const plainSchema = getSchema(schemaExtensions({ plain: true }))
const load = (md: string) => createDocument(htmlFromMarkdown(md, { plain: true }), plainSchema)
const save = (doc: ReturnType<typeof load>) => htmlToMarkdown(getHTMLFromFragment(doc.content, plainSchema), { plain: true })
const normalize = (md: string) => save(load(md))

describe('plain Markdown (linked notes): NoteFlow-only syntax stays text', () => {
  it('has no underline, highlight, kanban or section relation in the schema', () => {
    expect(plainSchema.marks.underline).toBeUndefined()
    expect(plainSchema.marks.highlight).toBeUndefined()
    expect(plainSchema.nodes.kanbanBoard).toBeUndefined()
    expect(plainSchema.nodes.sectionRelation).toBeUndefined()
    expect(plainSchema.nodes.taskItem).toBeDefined()
  })

  const literal = [
    'C++ and ++underline++ and ==highlight== stay as typed',
    '- [ ] Ship it 📅2026-01-02 ⏰09:30 🔺high',
    'See [the doc](noteflow://abc12345/sec001) here',
    '<!-- kanban done="Done" -->\n- Todo\n  - [ ] a\n- Done\n<!-- /kanban -->',
  ]
  for (const md of literal) {
    it(`round-trips ${JSON.stringify(md.slice(0, 40))} without changes`, () => {
      expect(normalize(md)).toBe(md)
    })
  }

  it('escapes what plain Markdown reads as syntax, but not ++/== (text there)', () => {
    const doc = createDocument('<p>a*b c*d ++x++ ==y==</p>', plainSchema)
    expect(save(doc)).toBe('a\\*b c\\*d ++x++ ==y==')
    expect(load(save(doc)).toJSON()).toEqual(doc.toJSON())
  })

  it('does not read ++/== as marks in the HTML', () => {
    const html = htmlFromMarkdown('a ++b++ ==c==', { plain: true })
    expect(html).not.toContain('<u>')
    expect(html).not.toContain('<mark>')
  })

  it('does not take task annotations as attributes', () => {
    const html = htmlFromMarkdown('- [ ] Ship 📅2026-01-02', { plain: true })
    expect(html).not.toContain('data-due')
    expect(html).toContain('📅2026-01-02')
  })

  it('the regular (non-plain) parse is unchanged', () => {
    expect(htmlFromMarkdown('a ++b++')).toContain('<u>b</u>')
    expect(htmlFromMarkdown('- [ ] Ship 📅2026-01-02')).toContain('data-due="2026-01-02"')
  })

  it('maps image sources only when asked (previews)', () => {
    const html = htmlFromMarkdown('![x](assets/a b.png)', { plain: true, imageSrc: (s) => `nflinked://n/id/${encodeURIComponent(s)}` })
    expect(html).toContain('src="nflinked://n/id/assets%2Fa%20b.png"')
    expect(htmlFromMarkdown('![x](assets/a.png)', { plain: true })).toContain('src="assets/a.png"')
  })
})

describe('splitTopBlocks / joinTopBlocks', () => {
  const samples = [
    '', 'a', 'a\n', '\n\na\n\nb\n\n\nc\n', '```js\nx\n\n\ny\n```\n\nafter', '# T\n\n- a\n- b\n\n  \n\nend',
  ]
  for (const md of samples) {
    it(`is lossless for ${JSON.stringify(md)}`, () => {
      expect(joinTopBlocks(splitTopBlocks(md))).toBe(md)
    })
  }

  it('never splits a fenced code block on its blank lines', () => {
    const { blocks } = splitTopBlocks('intro\n\n```\na\n\nb\n```\n\nend')
    expect(blocks).toEqual(['intro', '```\na\n\nb\n```', 'end'])
  })
})

describe('preserveUnchangedBlocks', () => {
  const original = [
    'Intro with __bold__ and *em*',
    '',
    '* one',
    '* two',
    '',
    'Setext title',
    '============',
    '',
    'Last paragraph',
  ].join('\n')

  it('returns the original untouched when the document did not change', () => {
    expect(preserveUnchangedBlocks(original, normalize(original), normalize)).toBe(original)
  })

  it('rewrites only the edited block, keeping the source of the others', () => {
    const edited = normalize(original).replace('Last paragraph', 'Last paragraph, edited')
    const out = preserveUnchangedBlocks(original, edited, normalize)
    expect(out).toBe(original.replace('Last paragraph', 'Last paragraph, edited'))
    expect(normalize(out)).toBe(edited)
  })

  it('keeps original blocks around an inserted one', () => {
    const edited = normalize(original).replace('Last paragraph', 'New block\n\nLast paragraph')
    const out = preserveUnchangedBlocks(original, edited, normalize)
    expect(out).toContain('Intro with __bold__ and *em*')
    expect(out).toContain('* one\n* two')
    expect(out).toContain('New block')
    expect(normalize(out)).toBe(edited)
  })

  it('a deleted block disappears and its neighbours keep their source', () => {
    const edited = normalize(original).replace('- one\n- two\n\n', '')
    const out = preserveUnchangedBlocks(original, edited, normalize)
    expect(out).not.toContain('one')
    expect(out).toContain('Intro with __bold__ and *em*')
    expect(normalize(out)).toBe(edited)
  })

  it('falls back to the editor text when the result would not render the same', () => {
    // A normalizer that disagrees with itself on the joined text: nothing can be proven equal.
    let calls = 0
    const flaky = (md: string) => (++calls > 0 && md.includes('\n\n') ? `${md}!` : md)
    expect(preserveUnchangedBlocks('a\n\nb', 'a\n\nc', flaky)).toBe('a\n\nc')
  })

  it('memoizes block renderings across saves', () => {
    const cache = new Map<string, string>()
    let n = 0
    const counting = (md: string) => { n++; return normalize(md) }
    const edited = normalize(original).replace('Last paragraph', 'X')
    preserveUnchangedBlocks(original, edited, counting, cache)
    const first = n
    preserveUnchangedBlocks(original, edited, counting, cache)
    expect(n - first).toBeLessThan(first)
  })
})

describe('preserveUnchangedBlocks — blank edges never change', () => {
  it('keeps the blank line after the frontmatter when the FIRST block changes', () => {
    const original = '\n# Title\n\nIntro text\n\n* a\n* b'
    const edited = normalize(original).replace('# Title', '# Title!')
    const out = preserveUnchangedBlocks(original, edited, normalize)
    expect(out).toBe('\n# Title!\n\nIntro text\n\n* a\n* b')
  })

  it('keeps several trailing blank lines when the LAST block changes', () => {
    const original = '# T\n\nlast line\n\n\n'
    const edited = normalize(original).replace('last line', 'last line edited')
    expect(preserveUnchangedBlocks(original, edited, normalize)).toBe('# T\n\nlast line edited\n\n\n')
  })

  it('keeps the edges even when the editor text has to be written as is', () => {
    const flaky = (md: string) => (md.includes('\n\n') ? `${md}!` : md)
    expect(preserveUnchangedBlocks('\n\na\n\nb\n', 'a\n\nc', flaky)).toBe('\n\na\n\nc\n')
  })

  it('withBlankEdges puts the disk edges on a text (the Compare "mine" / merged start)', () => {
    expect(withBlankEdges('# T\n\nx', '\n# Old\n\ny\n\n')).toBe('\n# T\n\nx\n\n')
    expect(withBlankEdges('', '\nx')).toBe('')
  })
})

describe('preserveUnchangedBlocks — lists keep their markers and unchanged items', () => {
  const cases: Array<[string, string, string, string]> = [
    ['* bullets', '* one\n* two\n* three', 'two', 'two X'],
    ['+ bullets', '+ one\n+ two\n+ three', 'three', 'three X'],
    ['nested *', '* one\n  * child a\n  * child b\n* two', 'child b', 'child b X'],
    ['task list *', '* [ ] todo a\n* [x] done b\n* [ ] todo c', 'todo c', 'todo c X'],
  ]
  for (const [label, list, from, to] of cases) {
    it(`only the edited item changes (${label})`, () => {
      const original = `Intro\n\n${list}\n\nOutro`
      const edited = normalize(original).replace(from, to)
      const out = preserveUnchangedBlocks(original, edited, normalize)
      expect(out).toBe(original.replace(from, to))
      expect(normalize(out)).toBe(edited)
    })
  }

  it('a new item takes the original bullet', () => {
    const original = '* one\n* two'
    const edited = normalize(original) + '\n- three'
    const out = preserveUnchangedBlocks(original, edited, normalize)
    expect(out).toBe('* one\n* two\n* three')
    expect(normalize(out)).toBe(edited)
  })
})

describe('preserveUnchangedBlocks — new list items take their siblings\' indentation', () => {
  it('a new child goes in the column of the original children (`*   ` style)', () => {
    const original = 'Intro\n\n*   foo\n    *   bar\n\nOutro'
    // (NoteFlow reads the extra spaces after `*` as text: the editor writes `-   bar`.)
    const edited = normalize(original).replace(/(- {3}bar)/, '$1\n  - baz')
    expect(edited).toContain('  - baz')
    const out = preserveUnchangedBlocks(original, edited, normalize)
    expect(out).toBe('Intro\n\n*   foo\n    *   bar\n    * baz\n\nOutro')
    expect(normalize(out)).toBe(edited)
  })

  it('a new child under an ordered item keeps the 3-space indentation', () => {
    const original = '1. foo\n   - bar'
    const edited = normalize(original).replace(/(- bar)/, '$1\n  - baz')
    const out = preserveUnchangedBlocks(original, edited, normalize)
    expect(out).toBe('1. foo\n   - bar\n   - baz')
    expect(normalize(out)).toBe(edited)
  })

  it('an edited nested task item keeps its original indentation and bullet', () => {
    const original = '+ parent\n    + [ ] child task\n    + [x] other'
    const edited = normalize(original).replace('child task', 'child task!')
    const out = preserveUnchangedBlocks(original, edited, normalize)
    expect(out).toBe('+ parent\n    + [ ] child task!\n    + [x] other')
    expect(normalize(out)).toBe(edited)
  })
})
