// @vitest-environment happy-dom
//
// The md ↔ editor round trip, on the editor's REAL schema (editorExtensions.ts,
// the list Editor.tsx registers) and the same pipeline as the app
// (helpers/editorPipeline.ts): load = htmlFromMarkdown → ProseMirror parse,
// save = getHTML → htmlToMarkdown. Guards the "blank line / break that comes
// back after reopening the note" family of bugs:
//
//  (a) LOSSLESS: any document the editor can hold comes back from save + load
//      exactly as it was (doc.eq) — e.g. the user deletes a phantom line, it
//      must stay deleted.
//  (b) STABLE: any markdown (hand-written, LLM, other editors, old builds)
//      reaches a fixpoint: nothing grows or moves on every save + reopen.
//  (c) Canonical sections (what NoteFlow writes) are byte-identical.
//
// Documents the markdown format can't tell apart from another one are skipped
// by name (ambiguity() in helpers/docFuzz.ts, documented in
// .claude/context/patterns.md), never by weakening an assertion. Every random
// case is reproducible from its seed. `FUZZ_SEEDS=50000 npx vitest run
// tests/lib/editorRoundTrip.test.ts` digs deeper locally.

import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { schemaExtensions } from '../../src/components/Editor/editorExtensions'
import { htmlFromMarkdown, htmlToMarkdown } from '../../src/lib/markdownHtml'
import { load, save, schema } from '../helpers/editorPipeline'
import {
  LIST_TYPES, ambiguity, genDoc, genMarkdown, list, listItem, makeRng, paragraph,
  type JNode, type ListType,
} from '../helpers/docFuzz'
import * as FIXTURES from '../helpers/roundTripFixtures'

const SEEDS = Number(process.env.FUZZ_SEEDS ?? 4000)
const MD_SEEDS = Math.ceil(SEEDS / 2)

// happy-dom keeps every parsed document alive until its pending tasks run: a
// long synchronous loop runs out of memory unless it yields now and then.
const breathe = () => new Promise((resolve) => setTimeout(resolve, 0))

const t = (text: string): JNode => ({ type: 'text', text })
const br: JNode = { type: 'hardBreak' }
const brs = (n: number): JNode[] => Array.from({ length: n }, () => br)
const p = (...content: JNode[]) => paragraph(content)

function docOf(content: JNode[]): PMNode {
  const doc = schema.nodeFromJSON({ type: 'doc', content })
  doc.check()
  return doc
}

/** save → load gives the same document back, and the markdown is a fixpoint. */
function expectLossless(doc: PMNode, label: string): void {
  const md = save(doc)
  const back = load(md)
  expect(back.toJSON(), `${label}\nmarkdown: ${JSON.stringify(md)}`).toEqual(doc.toJSON())
  expect(save(back), label).toBe(md)
}

/**
 * The letters and digits of `before` missing from `after` (as multisets: the
 * serializer may move a task's 📅 date to the end of its line). Block syntax
 * that saving may rewrite is ignored: list markers and their numbering (`10.`
 * → `1.`), task checkboxes, quote `>`s and indentation.
 */
function lostText(before: string, after: string): string {
  const chars = (md: string) => md.replace(/\r/g, '').split('\n')
    .map((l) => l.replace(/^[\s>]*/, '').replace(/^(?:\d+[.)]|[-*+])(?=\s|$)/, '').replace(/^\s*\[[ x]\]/, ''))
    .join('\n').match(/[\p{L}\p{N}]/gu) ?? []
  const left = new Map<string, number>()
  for (const c of chars(after)) left.set(c, (left.get(c) ?? 0) + 1)
  let lost = ''
  for (const c of chars(before)) {
    const n = left.get(c) ?? 0
    if (n > 0) left.set(c, n - 1)
    else lost += c
  }
  return lost
}

function hasBreak(node: PMNode): boolean {
  let found = false
  node.descendants((n) => { if (n.type.name === 'hardBreak') found = true })
  return found
}

describe('editor schema', () => {
  it('is built from the extensions Editor.tsx registers', () => {
    for (const name of ['kanbanBoard', 'sectionRelation', 'taskItem', 'codeBlock', 'table', 'image']) {
      expect(schema.nodes[name], name).toBeDefined()
    }
    expect(schema.topNodeType.spec.content).toBe('(block | topBlock)+')
  })

  it('lets list items hold only what markdown lists can write: text, then nested lists', () => {
    expect(schema.nodes.listItem.spec.content).toBe('paragraph+ list*')
    expect(schema.nodes.taskItem.spec.content).toBe('paragraph+ list*')
  })
})

describe('reported bug: phantom blank line between list kinds', () => {
  it('reads a task, a bullet and a task as three lists, with no hard break', () => {
    const doc = load(FIXTURES.REPORTED_SECTION)
    expect(Array.from({ length: doc.childCount }, (_, i) => doc.child(i).type.name))
      .toEqual(['heading', 'taskList', 'bulletList', 'taskList'])
    expect(hasBreak(doc)).toBe(false)
  })

  it('writes it back byte for byte', () => {
    expect(save(load(FIXTURES.REPORTED_SECTION))).toBe(FIXTURES.REPORTED_SECTION)
  })

  it('keeps a hard break the item really has, and its absence', () => {
    const bullet = list('bulletList', [listItem('bulletList', p(t('B42.')))])
    for (const trailing of [0, 1]) {
      const task = list('taskList', [listItem('taskList', p(t('5.9.3'), ...brs(trailing)))])
      expectLossless(docOf([task, bullet, list('taskList', [listItem('taskList', p(t('5.4.3')))])]), `task with ${trailing} break(s)`)
    }
  })
})

describe('no text is lost', () => {
  // A list block starting with an empty marker (`- `) or a first item whose
  // text starts with a hard break: the lines after it used to be dropped.
  const cases: [string, string][] = [
    ['first bullet starting with a break', '- \nimportant text\n- second'],
    ['empty first bullet with a child', '- \n  - child text'],
    ['bullet starting with a break after a paragraph', 'intro\n\n- \nimportant text'],
    ['empty marker under a glued heading', '# Title\n- \nsome text that matters'],
    ['empty marker in a quote', '> - \n> some text that matters'],
    ['tab after the marker', '-\tafter a tab\n1.\tnumbered'],
    ['empty first bullet after another kind', '- [ ] task\n\n- \nbullet text'],
  ]
  for (const [name, md] of cases) {
    it(name, () => {
      const once = save(load(md))
      expect(lostText(md, once), once).toBe('')
      expect(save(load(once))).toBe(once)
    })
  }

  it('the editor\'s own first bullet starting with a break round-trips exactly', () => {
    const bullet = (...content: JNode[]) => listItem('bulletList', p(...content))
    expectLossless(docOf([list('bulletList', [bullet(br, t('important text')), bullet(t('second'))])]), 'first item <br>text')
    expectLossless(docOf([p(t('intro')), list('bulletList', [bullet(br, t('important text'))])]), 'after a paragraph')
    expectLossless(docOf([list('bulletList', [listItem('bulletList', p(), [list('bulletList', [bullet(t('child'))])])])]), 'empty with a child')
  })

  it('keeps a kanban marker inside a quote as quoted text', () => {
    const md = '> <!-- kanban -->\n> - Todo\n>   - [ ] card\n> <!-- /kanban -->'
    const doc = load(md)
    expect(doc.childCount).toBe(1)
    expect(doc.child(0).type.name).toBe('blockquote')
    expect(save(doc)).toBe(md)
  })
})

describe('headings are one line', () => {
  it('a heading with hard breaks (start, middle, end) survives with its text, the breaks as spaces', () => {
    const rng = makeRng(7)
    for (let i = 0; i < 300; i++) {
      const level = 1 + rng.int(3)
      const parts = [t('alpha'), t(' '), { type: 'text', text: 'beta', marks: [{ type: 'highlight' }] } as JNode, t(' gamma')]
      const content: JNode[] = []
      if (rng.chance(0.5)) content.push(...brs(1 + rng.int(2)))
      parts.forEach((part, k) => {
        content.push(part)
        if (k < parts.length - 1 && rng.chance(0.3)) content.push(...brs(1 + rng.int(2)))
      })
      if (rng.chance(0.5)) content.push(...brs(1 + rng.int(2)))
      const doc = docOf([p(t('before')), { type: 'heading', attrs: { level }, content }, p(t('after'))])
      const back = load(save(doc))
      const label = JSON.stringify(save(doc))
      expect(back.childCount, label).toBe(3)
      expect(back.child(1).type.name, label).toBe('heading')
      expect(back.child(1).attrs.level, label).toBe(level)
      expect(back.child(1).textContent.replace(/\s+/g, ' ').trim(), label).toBe('alpha beta gamma')
      expect(hasBreak(back.child(1)), label).toBe(false)
      expect(save(back), label).toBe(save(doc))
    }
  })

  it('the reported case: a break at the start of a highlighted heading', () => {
    const heading = { type: 'heading', attrs: { level: 3 }, content: [br, { type: 'text', text: 'Pruebas FAT a verificar', marks: [{ type: 'highlight' }] }] }
    expect(save(docOf([heading as JNode]))).toBe('### ==Pruebas FAT a verificar==')
  })

  it('an empty heading is saved as an empty paragraph, not a literal `###`', () => {
    const doc = docOf([p(t('a')), { type: 'heading', attrs: { level: 3 } }, p(t('b'))])
    expect(load(save(doc)).toJSON()).toEqual(docOf([p(t('a')), p(), p(t('b'))]).toJSON())
  })
})

describe('canonical sections are byte-identical', () => {
  for (const [name, md] of Object.entries(FIXTURES)) {
    it(name, () => {
      const once = save(load(md))
      expect(once).toBe(md)
      expect(save(load(once))).toBe(md)
    })
  }
})

// Small fixed blocks for the exhaustive adjacency checks.
type Kind = 'paragraph' | 'emptyParagraph' | 'heading' | 'hr' | 'code' | 'quote' | 'table' | 'kanban' | ListType
const KINDS: Kind[] = ['paragraph', 'emptyParagraph', 'heading', 'hr', 'code', 'quote', 'table', 'kanban', ...LIST_TYPES]

function block(kind: Kind, nestedLast = false): JNode {
  switch (kind) {
    case 'paragraph': return p(t('para'))
    case 'emptyParagraph': return p()
    case 'heading': return { type: 'heading', attrs: { level: 2 }, content: [t('Title')] }
    case 'hr': return { type: 'horizontalRule' }
    case 'code': return { type: 'codeBlock', attrs: { language: 'js' }, content: [t('x = 1\n\ny = 2')] }
    case 'quote': return { type: 'blockquote', content: [p(t('quote'))] }
    case 'table': {
      const cell = (type: string, text: string) => ({ type, attrs: { colspan: 1, rowspan: 1, colwidth: null, textAlign: null }, content: [p(t(text))] })
      return { type: 'table', content: [
        { type: 'tableRow', content: [cell('tableHeader', 'h1'), cell('tableHeader', 'h2')] },
        { type: 'tableRow', content: [cell('tableCell', 'a'), cell('tableCell', 'b')] },
      ] }
    }
    case 'kanban': return load('<!-- kanban -->\n- Todo\n  - [ ] card\n<!-- /kanban -->').child(0).toJSON() as JNode
    default: {
      const sub = nestedLast ? [list(kind === 'taskList' ? 'bulletList' : 'taskList', [listItem(kind === 'taskList' ? 'bulletList' : 'taskList', p(t('sub')))])] : []
      return list(kind, [listItem(kind, p(t('one'))), listItem(kind, p(t('two')), sub)])
    }
  }
}

/** Append `n` hard breaks to the last line of a paragraph or list (its deepest last item). */
function withTrailingBreaks(node: JNode, n: number): JNode {
  if (n === 0) return node
  const copy: JNode = JSON.parse(JSON.stringify(node))
  let at = copy
  for (;;) {
    if (at.type === 'paragraph') { at.content = [...(at.content ?? []), ...brs(n)]; return copy }
    if (!LIST_TYPES.includes(at.type as ListType)) return copy
    const item = at.content![at.content!.length - 1]
    const last = item.content![item.content!.length - 1]
    at = LIST_TYPES.includes(last.type as ListType) ? last : item.content![0]
  }
}

describe('lossless: documents the editor can hold', () => {
  it('every pair of top-level block kinds, in both orders, with 0-2 breaks between them', () => {
    let checked = 0
    for (const a of KINDS) {
      for (const b of KINDS) {
        for (const nested of [false, true]) {
          for (const trailing of [0, 1, 2]) {
            const doc = docOf([p(t('start')), withTrailingBreaks(block(a, nested), trailing), block(b, nested), p(t('end'))])
            if (ambiguity(doc)) continue
            expectLossless(doc, `${a}${nested ? ' (nested last)' : ''} + ${trailing} break(s) → ${b}`)
            checked++
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(300)
  })

  it('nested lists of every pair of kinds, with 0-3 breaks after the first one', () => {
    let checked = 0
    for (const outer of LIST_TYPES) {
      for (const k1 of LIST_TYPES) {
        for (const k2 of LIST_TYPES) {
          for (let breaks = 0; breaks <= 3; breaks++) {
            const children = [
              list(k1, [listItem(k1, p(t('a'), ...brs(breaks)))]),
              list(k2, [listItem(k2, p(t('b')), [list(k1, [listItem(k1, p(t('deep')))])])]),
            ]
            const doc = docOf([list(outer, [
              listItem(outer, p(t('parent')), children),
              listItem(outer, p(t('next'))),
            ])])
            if (ambiguity(doc)) continue
            expectLossless(doc, `${outer} > [${k1} + ${breaks} break(s), ${k2}]`)
            checked++
          }
        }
      }
    }
    // Every pair of DIFFERENT kinds (two same-kind lists in a row are ambiguous),
    // whatever the breaks: nested lists are told apart by their indentation.
    expect(checked).toBe(LIST_TYPES.length * 6 * 4)
  })

  it(`${SEEDS} random documents`, async () => {
    let checked = 0
    let mixedNeighbours = 0
    for (let seed = 1; seed <= SEEDS; seed++) {
      if (seed % 25 === 0) await breathe()
      const doc = docOf(genDoc(makeRng(seed)).content!)
      if (ambiguity(doc)) continue
      expectLossless(doc, `seed ${seed}`)
      checked++
      for (let i = 0; i + 1 < doc.childCount; i++) {
        const [x, y] = [doc.child(i).type.name, doc.child(i + 1).type.name]
        if (x !== y && LIST_TYPES.includes(x as ListType) && LIST_TYPES.includes(y as ListType)) mixedNeighbours++
      }
    }
    // The generator must keep producing checkable documents (and the case of
    // the reported bug), or this test silently tests nothing.
    expect(checked).toBeGreaterThan(SEEDS * 0.3)
    expect(mixedNeighbours).toBeGreaterThan(SEEDS * 0.03)
  }, 120_000)
})

describe('stable: any markdown', () => {
  it(`${MD_SEEDS} random markdown texts reach a fixpoint; the unambiguous ones in one save`, async () => {
    let strict = 0
    for (let seed = 1; seed <= MD_SEEDS; seed++) {
      if (seed % 25 === 0) await breathe()
      const md0 = genMarkdown(makeRng(seed))
      const label = `seed ${seed}: ${JSON.stringify(md0)}`
      const d0 = load(md0)
      const md1 = save(d0)
      const d1 = load(md1)
      const md2 = save(d1)
      // Nothing grows or moves forever: by the second save it's a fixpoint.
      expect(save(load(md2)), label).toBe(md2)
      // …and no text is lost on the way (a fixpoint can be empty: '' is one).
      expect(lostText(md0, md2), label).toBe('')
      if (ambiguity(d0)) continue
      // A document that isn't ambiguous is the canonical reading of its markdown.
      expect(md2, label).toBe(md1)
      expect(d1.toJSON(), label).toEqual(d0.toJSON())
      strict++
    }
    expect(strict).toBeGreaterThan(MD_SEEDS * 0.2)
  }, 120_000)
})

// Editing commands on a real editor instance: they mustn't build documents the
// markdown can't hold (that the save would drop or reorder).
describe('editing in the real editor', () => {
  function editor(md: string): Editor {
    return new Editor({ extensions: schemaExtensions(), content: htmlFromMarkdown(md) })
  }
  function caretAt(ed: Editor, text: string, offset = 0) {
    let pos = -1
    ed.state.doc.descendants((n, at) => { if (pos < 0 && n.isText && n.text!.startsWith(text)) pos = at + offset })
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, pos)))
  }
  function type(ed: Editor, chars: string) {
    for (const ch of chars) {
      // What the view does on a keypress: input rules first, else plain text.
      const { from, to } = ed.state.selection
      const insert = () => ed.state.tr.insertText(ch, from, to)
      if (!ed.view.someProp('handleTextInput', (f) => f(ed.view, from, to, ch, insert))) ed.view.dispatch(insert())
    }
  }
  const saved = (ed: Editor) => htmlToMarkdown(ed.getHTML())

  it('Backspace at the start of the item after one with sub-items keeps it below them', () => {
    const ed = editor('- a\n  - x\n- b')
    caretAt(ed, 'b')
    ed.commands.keyboardShortcut('Backspace')
    expect(saved(ed)).toBe('- a\n  - x\n  - b')
    expect(save(load(saved(ed)))).toBe(saved(ed))
    ed.destroy()
  })

  it('Backspace into a plain item still joins it as a second line', () => {
    const ed = editor('- a\n- b')
    caretAt(ed, 'b')
    ed.commands.keyboardShortcut('Backspace')
    expect(saved(ed)).toBe('- a\nb')
    ed.destroy()
  })

  it('block input rules in an item\'s second line keep the text', () => {
    for (const rule of ['> ', '``` ', '# ', '---']) {
      const ed = editor('- a\n- b')
      caretAt(ed, 'b')
      ed.commands.keyboardShortcut('Backspace')
      type(ed, rule)
      expect(saved(ed), rule).toContain('a')
      expect(saved(ed).includes('b') || rule === '---', rule).toBe(true)
      ed.destroy()
    }
  })

  it('a pasted list item holding a code block keeps the code, after the list', () => {
    const ed = new Editor({
      extensions: schemaExtensions(),
      content: '<ul><li><p>a</p><pre><code>x</code></pre></li><li><p>b</p></li></ul>',
    })
    expect(saved(ed)).toBe('- a\n\n```\nx\n```\n\n- b')
    ed.destroy()
  })

  it('Shift+Enter in a heading splits it instead of inserting a break', () => {
    const ed = editor('### ==Pruebas FAT a verificar==')
    caretAt(ed, 'Pruebas FAT', 7)
    ed.commands.keyboardShortcut('Shift-Enter')
    expect(hasBreak(ed.state.doc)).toBe(false)
    const back = load(saved(ed))
    expect(back.childCount).toBe(2)
    expect([0, 1].map((i) => [back.child(i).type.name, back.child(i).textContent.trim()]))
      .toEqual([['heading', 'Pruebas'], ['heading', 'FAT a verificar']])
    ed.destroy()
    // Elsewhere it's still a line break.
    const para = editor('ab')
    caretAt(para, 'ab', 1)
    para.commands.keyboardShortcut('Shift-Enter')
    expect(saved(para)).toBe('a\nb')
    para.destroy()
  })

  it('Enter in a table cell: the two lines are saved apart, not glued', () => {
    const ed = editor('| h1 | h2 |\n| --- | --- |\n| ab | c |')
    caretAt(ed, 'ab', 1)
    ed.commands.keyboardShortcut('Enter')
    expect(saved(ed)).toBe('| h1 | h2 |\n| --- | --- |\n| a<br>b | c |')
    ed.destroy()
  })
})
