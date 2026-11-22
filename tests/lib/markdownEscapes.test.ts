// @vitest-environment happy-dom
//
// Backslash escapes in inline markdown: what the editor shows is what is saved
// and what comes back on reopening. Text typed (or pasted from a spreadsheet)
// that would read back as syntax — `a*b c*d` as italics, `__init__` as bold, a
// backtick pair as code, `[a](b)` as a link… — is written with a backslash
// (htmlToMarkdown → writeLine), and only then: `snake_case`, `a * b`, `C++`,
// `C:\Users` are written as they are. The parser reads `\*` as `*`
// (markdownInline.ts → INLINE_ESCAPABLE). On the editor's real schema, as the
// app loads and saves a section (helpers/editorPipeline.ts).

import { describe, expect, it } from 'vitest'
import type { Node as PMNode } from '@tiptap/pm/model'
import { htmlFromMarkdown, htmlToMarkdown } from '../../src/lib/markdownHtml'
import { inlineToHtml } from '../../src/lib/markdownInline'
import { load, save, schema } from '../helpers/editorPipeline'
import { makeRng, type JMark, type JNode, type Rng } from '../helpers/docFuzz'

const SEEDS = Number(process.env.FUZZ_SEEDS ?? 3000)
const FUZZ_TIMEOUT = Math.max(120_000, SEEDS * 10)
const breathe = () => new Promise((resolve) => setTimeout(resolve, 0))

const B: JMark = { type: 'bold' }
const I: JMark = { type: 'italic' }
const U: JMark = { type: 'underline' }
const S: JMark = { type: 'strike' }
const H: JMark = { type: 'highlight' }
const C: JMark = { type: 'code' }
const L: JMark = { type: 'link', attrs: { href: 'https://example.com/a_b?c=1' } }

const text = (t: string, marks: JMark[] = []): JNode => (marks.length ? { type: 'text', text: t, marks } : { type: 'text', text: t })
const br: JNode = { type: 'hardBreak' }
const p = (...content: JNode[]): JNode => ({ type: 'paragraph', content })

function docOf(content: JNode[]): PMNode {
  const doc = schema.nodeFromJSON({ type: 'doc', content })
  doc.check()
  return doc
}

/** The markdown a document saves as; reopening it gives the same document, and saving that the same markdown. */
function roundTrip(doc: PMNode, label = ''): string {
  const md = save(doc)
  const back = load(md)
  expect(back.toJSON(), `${label}\nmarkdown: ${JSON.stringify(md)}`).toEqual(doc.toJSON())
  expect(save(back), label).toBe(md)
  return md
}

const plainText = (t: string) => roundTrip(docOf([p(text(t))]), t)

describe('text that would read back as syntax gets a backslash', () => {
  it('the QA case: a*b c*d stays text', () => {
    expect(plainText('a*b c*d')).toBe('a\\*b c\\*d')
  })

  const cases: [string, string][] = [
    ['2*3*4', '2\\*3\\*4'],
    ['*not italic*', '\\*not italic\\*'],
    ['**not bold**', '\\*\\*not bold\\*\\*'],
    ['__init__ and __main__', '\\_\\_init\\_\\_ and \\_\\_main\\_\\_'],
    ['~~not struck~~', '\\~\\~not struck\\~\\~'],
    ['a `b` c', 'a \\`b\\` c'],
    ['[a](https://x.y)', '\\[a](https://x.y)'],
    ['![a](b.png)', '!\\[a](b.png)'],
    ['++not under++', '\\++not under++'],
    ['==not highlighted==', '\\==not highlighted=='],
  ]
  for (const [t, md] of cases) {
    it(`${t} → ${md}`, () => {
      expect(plainText(t)).toBe(md)
    })
  }
})

describe('…and only where needed: readable on disk', () => {
  for (const t of [
    'snake_case and other_snake_case', 'a * b', '5*3 = 15', 'a__b', '~5 km', 'it`s', '[x] done', 'see [1]', 'Wow!',
    'C++ and Notepad++', 'a == b', 'x = 1 + 2', 'https://example.com/a_b?c=1', 'C:\\Users\\me\\notes',
    '\\\\server\\share', 'noteflow://n1/s1', 'a\\b', 'path\\', 'list: a_b, c_d',
  ]) {
    it(`written as is: ${t}`, () => {
      expect(plainText(t)).toBe(t)
    })
  }
})

describe('a backslash of the text', () => {
  it('is doubled only before an escapable character', () => {
    expect(plainText('C:\\_build')).toBe('C:\\\\_build')
    expect(plainText('regex a\\*b')).toBe('regex a\\\\*b')
    expect(plainText('a\\*b c*d')).toBe('a\\\\\\*b c\\*d')
    expect(plainText('¯\\_(ツ)_/¯')).toBe('¯\\\\_(ツ)_/¯')
  })

  it('before a code span, a link or a delimiter of the editor', () => {
    roundTrip(docOf([p(text('dir C:\\'), text('code', [C]))]))
    roundTrip(docOf([p(text('x\\'), text('link', [L]))]))
    roundTrip(docOf([p(text('x\\'), text('bold', [B]))]))
    roundTrip(docOf([p(text('x\\'), text('under', [U]), text(' y'))]))
    roundTrip(docOf([p(text('end\\', [I]))]))
  })
})

describe('text next to the editor\'s own syntax', () => {
  it('emphasis delimiters', () => {
    expect(roundTrip(docOf([p(text('a', [I]), text('*'))]))).toBe('*a**')
    roundTrip(docOf([p(text('*'), text('a', [I]))]))
    expect(roundTrip(docOf([p(text('a*', [B]))]))).toBe('**a\\***')
    roundTrip(docOf([p(text('*', [I]), text(' x'))]))
    roundTrip(docOf([p(text('a~', [S]))]))
    roundTrip(docOf([p(text('bold ', [B]), text('a*b c*d'))]))
  })

  it('code spans', () => {
    expect(roundTrip(docOf([p(text('a ` b '), text('code', [C]))]))).toBe('a \\` b `code`')
    roundTrip(docOf([p(text('`'), text('code', [C]), text('`'))]))
    // Inside code nothing is escaped.
    expect(roundTrip(docOf([p(text('a*b c*d __x__ \\', [C]))]))).toBe('`a*b c*d __x__ \\`')
  })

  it('links: a `]` in the text, a `!` before it', () => {
    expect(roundTrip(docOf([p(text('a]b', [L]))]))).toBe('[a\\]b](https://example.com/a_b?c=1)')
    expect(roundTrip(docOf([p(text('see!'), text('link', [L]))]))).toBe('see\\![link](https://example.com/a_b?c=1)')
    roundTrip(docOf([p(text('*a* and [b](c)', [L]))]))
  })

  it('section relations', () => {
    roundTrip(docOf([p(text('see '), { type: 'sectionRelation', attrs: { noteId: 'n1', sectionId: 's1', sectionName: 'a]*b*' } })]))
  })

  it('underline and highlight', () => {
    roundTrip(docOf([p(text('a++ b', [U]))]))
    roundTrip(docOf([p(text('x ++y++ z '), text('w', [H]))]))
    roundTrip(docOf([p(text('==', [H]), text(' and =='))]))
  })
})

describe('every kind of textblock', () => {
  it('a hard break splits the line: each is read on its own', () => {
    expect(roundTrip(docOf([p(text('a*b'), br, text('c*d'))]))).toBe('a*b\nc*d')
  })

  it('a heading is one line: its breaks become spaces before escaping', () => {
    const doc = docOf([{ type: 'heading', attrs: { level: 2 }, content: [text('a*b'), br, text('c*d')] }])
    const md = save(doc)
    expect(md).toBe('## a\\*b c\\*d')
    expect(load(md).toJSON()).toEqual(docOf([{ type: 'heading', attrs: { level: 2 }, content: [text('a*b c*d')] }]).toJSON())
  })

  it('task items keep their annotations', () => {
    const md = '- [ ] fix a\\*b c\\*d 📅2026-12-01 🔺high'
    expect(htmlToMarkdown(htmlFromMarkdown(md))).toBe(md)
    expect(htmlFromMarkdown(md)).toContain('<p>fix a*b c*d</p>')
  })

  it('quotes and lists', () => {
    for (const md of ['> a\\*b c\\*d', '- a\\*b c\\*d\n  - \\_\\_init\\_\\_', '1. 2\\*3\\*4']) {
      expect(htmlToMarkdown(htmlFromMarkdown(md))).toBe(md)
    }
  })
})

// The spreadsheet paste (skill noteflow-features § Tablas): a cell's text is
// pasted as is, `*` and `|` included — and must come back as is.
describe('table cells', () => {
  const cell = (type: 'tableHeader' | 'tableCell', t: string): JNode => ({
    type,
    attrs: { colspan: 1, rowspan: 1, colwidth: null, textAlign: null },
    content: [t ? p(text(t)) : { type: 'paragraph' }],
  })
  const table = (head: string[], ...rows: string[][]) => docOf([{
    type: 'table',
    content: [
      { type: 'tableRow', content: head.map((t) => cell('tableHeader', t)) },
      ...rows.map((r) => ({ type: 'tableRow', content: r.map((t) => cell('tableCell', t)) })),
    ],
  }])

  it('the QA case: *capital* | x', () => {
    const md = roundTrip(table(['Name', 'Value'], ['*capital* | x', '2*3*4']))
    expect(md.split('\n')[2]).toBe('| \\*capital\\* \\| x | 2\\*3\\*4 |')
  })

  it('backslashes, pipes and the other characters', () => {
    roundTrip(table(['a\\', '\\|'], ['C:\\_x', '__init__ | `q`'], ['[a](b)', '~~s~~ ++u++ ==h==']))
  })
})

describe('reading markdown with escapes (notes written elsewhere, older notes)', () => {
  it('\\* reads as *, and the rest as before', () => {
    expect(htmlFromMarkdown('a\\*b c\\*d')).toBe('<p>a*b c*d</p>')
    expect(htmlFromMarkdown('snake\\_case')).toBe('<p>snake_case</p>')
    expect(htmlFromMarkdown('\\[not a link](x)')).toBe('<p>[not a link](x)</p>')
    expect(htmlFromMarkdown('\\`not code\\`')).toBe('<p>`not code`</p>')
    expect(htmlFromMarkdown('a*b c*d')).toBe('<p>a<em>b c</em>d</p>')
    expect(htmlFromMarkdown('__init__')).toBe('<p><strong>init</strong></p>')
  })

  it('a backslash before anything else is text: paths, \\\\server', () => {
    for (const md of ['C:\\Users\\me', '\\\\server\\share', 'a \\ b', 'tab\\t and \\n']) {
      expect(htmlFromMarkdown(md)).toBe(`<p>${md}</p>`)
      expect(htmlToMarkdown(htmlFromMarkdown(md))).toBe(md)
    }
  })

  it('pairs of backslashes before an escapable character', () => {
    expect(inlineToHtml('\\\\*a*')).toBe('\\<em>a</em>')
    expect(inlineToHtml('\\\\\\*a*')).toBe('\\*a*')
  })

  it('code spans keep their backslashes; an escaped backtick never opens one', () => {
    expect(inlineToHtml('`C:\\` and `D:\\`')).toBe('<code>C:\\</code> and <code>D:\\</code>')
    expect(inlineToHtml('`a\\*b`')).toBe('<code>a\\*b</code>')
    expect(inlineToHtml('\\``x`')).toBe('`<code>x</code>')
  })

  it('URLs and image sources are kept exactly as written', () => {
    for (const md of ['[a](C:\\_x\\y)', '![p](C:\\_img\\*.png)', '[a\\*b\\*](https://x.y/a\\_b)']) {
      expect(htmlToMarkdown(htmlFromMarkdown(md))).toBe(md)
    }
    expect(inlineToHtml('[a](C:\\_x)')).toBe('<a href="C:\\_x">a</a>')
  })

  it('an existing note opens and saves unchanged when it needed no escapes', () => {
    for (const md of [
      'Some *italic*, **bold**, ~~struck~~, `code` and [a link](https://x.y).',
      'C++ and a == b, snake_case, 5 * 3',
      '- [ ] task with `i++` and ++under++ 📅2026-01-01',
      '| a | b |\n| --- | --- |\n| *x* | y \\| z |',
    ]) {
      expect(htmlToMarkdown(htmlFromMarkdown(md))).toBe(md)
    }
  })
})

// Random lines of text full of syntax characters, with and without marks: the
// document always comes back exactly (lossless) and the markdown is a fixpoint.
const ATOMS = [
  'w', 'snake_case', '*', '**', '_', '__', '~', '~~', '`', '[', ']', '(', ')', '](x)', '!', '+', '++',
  '=', '==', '\\', 'C:\\Users\\', '&', '<b>', '|', '2*3', 'x', '{', '}', '.', ':',
]
const MARK_SETS: JMark[][] = [[], [], [], [B], [I], [S], [U], [H], [C], [L], [B, I], [B, H], [I, U], [S, B], [B, L]]

function segment(rng: Rng, first: boolean, marks: JMark[]): string {
  // A line starts with a word: `* x`, `+ x`, `` ``` `` at the start are block syntax.
  let s = first ? 'w' : ''
  for (let n = 1 + rng.int(4); n > 0; n--) s += rng.pick(ATOMS)
  // Code can't hold a backtick (no markdown for it).
  return marks.includes(C) ? s.replace(/`/g, "'") : s
}

function genInline(rng: Rng, breaks: boolean): JNode[] {
  const out: JNode[] = []
  let lineStart = true
  for (let i = 1 + rng.int(5); i > 0; i--) {
    if (!lineStart) {
      if (breaks && rng.chance(0.2)) { out.push(br); lineStart = true } else out.push(text(' '))
    }
    const marks = rng.pick(MARK_SETS)
    out.push(text(segment(rng, lineStart, marks), marks))
    lineStart = false
  }
  // Join neighbours with the same marks, as ProseMirror does.
  return out.reduce<JNode[]>((acc, n) => {
    const last = acc[acc.length - 1]
    const key = (x: JNode) => JSON.stringify(x.marks ?? [])
    if (n.type === 'text' && last?.type === 'text' && key(last) === key(n)) acc[acc.length - 1] = { ...last, text: last.text! + n.text! }
    else acc.push(n)
    return acc
  }, [])
}

describe('fuzz: text full of syntax characters', () => {
  it(`paragraphs (${SEEDS} seeds)`, async () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const rng = makeRng(seed)
      roundTrip(docOf([p(...genInline(rng, true))]), `seed ${seed}`)
      if (seed % 25 === 0) await breathe()
    }
  }, FUZZ_TIMEOUT)

  it(`table cells (${Math.ceil(SEEDS / 4)} seeds)`, async () => {
    for (let seed = 1; seed <= Math.ceil(SEEDS / 4); seed++) {
      const rng = makeRng(seed * 7919)
      const cell = (type: string): JNode => ({
        type,
        attrs: { colspan: 1, rowspan: 1, colwidth: null, textAlign: null },
        content: [p(...genInline(rng, false))],
      })
      roundTrip(docOf([{
        type: 'table',
        content: [
          { type: 'tableRow', content: [cell('tableHeader'), cell('tableHeader')] },
          { type: 'tableRow', content: [cell('tableCell'), cell('tableCell')] },
        ],
      }]), `seed ${seed}`)
      if (seed % 25 === 0) await breathe()
    }
  }, FUZZ_TIMEOUT)
})
