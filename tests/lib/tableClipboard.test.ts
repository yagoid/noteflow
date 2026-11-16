// @vitest-environment happy-dom
//
// Copy / cut / paste around tables (src/components/Editor/tableClipboard.ts)
// on a real TipTap editor wired like the note editor (helpers/tableEditor.ts):
// real ClipboardEvents through ProseMirror's own clipboard handlers, with
// clipboard contents as Excel, Google Sheets, a browser, Word and VS Code write
// them (helpers/clipboardFixtures.ts). Each paste: the markdown it leaves (and
// its round trip), valid tables, one undo step.

import { afterEach, describe, expect, it } from 'vitest'
import { undoDepth } from '@tiptap/pm/history'
import { CellSelection } from '@tiptap/pm/tables'
import { getSchema } from '@tiptap/core'
import { Fragment, Slice } from '@tiptap/pm/model'
import { schemaExtensions } from '../../src/components/Editor/editorExtensions'
import { loneTableSlice, normalizedTable, normalizePastedSlice, tableFromRows } from '../../src/components/Editor/tableClipboard'
import { DOCS_TABLE, DOCS_TABLE_TRAILING_BR, EXCEL, SHEETS, VSCODE_CODE, WEB_FORMATTED, WEB_TABLE, WORD_LIST } from '../helpers/clipboardFixtures'
import {
  caretIn, caretInCell, checkTables, copy, destroyEditor, expectRoundTrip, headCell, makeEditor, markdown, paste,
  selectCells, type ClipboardContent,
} from '../helpers/tableEditor'

afterEach(destroyEditor)

const T = [
  '| A | B | C |',
  '| --- | :---: | --- |',
  '| a1 | b1 | c1 |',
  '| a2 | b2 | c2 |',
].join('\n')

const rowsOf = (md: string) => md.split('\n')

/** Paste `data`; expect valid tables, a round-tripping save and ONE undo back to where it was. */
function pasteChecked(ed: ReturnType<typeof makeEditor>, data: ClipboardContent): string {
  const before = markdown(ed)
  paste(ed, data)
  checkTables(ed.state.doc)
  expectRoundTrip(ed)
  const after = markdown(ed)
  expect(after).not.toBe(before)
  expect(undoDepth(ed.state)).toBe(1)
  ed.commands.undo()
  expect(markdown(ed)).toBe(before)
  ed.commands.redo()
  expect(markdown(ed)).toBe(after)
  return after
}

const hasTable = (ed: ReturnType<typeof makeEditor>) => {
  let found = false
  ed.state.doc.descendants((n) => { if (n.type.name === 'table') found = true; return !found })
  return found
}

// ── Copy / cut ───────────────────────────────────────────────────────────────

describe('copying selected cells', () => {
  it('the plain text is TSV; the HTML is still ProseMirror\'s table', () => {
    const ed = makeEditor(T)
    selectCells(ed, [1, 0], [2, 1])
    const { text, html } = copy(ed)
    expect(text).toBe('a1\tb1\na2\tb2')
    expect(html).toContain('data-pm-slice')
    expect(html).toContain('<table')
  })

  it('cells with tabs, line breaks or quotes are quoted Excel-style', () => {
    const ed = makeEditor('| A | B |\n| --- | --- |\n| say "hi" | x<br>y |')
    selectCells(ed, [0, 0], [1, 1])
    expect(copy(ed).text).toBe('A\tB\n"say ""hi"""\t"x\ny"')
  })

  it('a single cell: its text as-is, unquoted', () => {
    const ed = makeEditor('| A |\n| --- |\n| x<br>"y" |')
    selectCells(ed, [1, 0], [1, 0])
    expect(copy(ed).text).toBe('x\n"y"')
  })

  it('text selected inside a cell is copied as usual', () => {
    const ed = makeEditor(T)
    caretIn(ed, 'b1')
    ed.commands.setTextSelection({ from: ed.state.selection.from - 2, to: ed.state.selection.from })
    expect(copy(ed).text).toBe('b1')
  })

  it('cutting empties the cells (rows stay) in one undo step', () => {
    const ed = makeEditor(T)
    selectCells(ed, [1, 0], [1, 2])
    const { text } = copy(ed, 'cut')
    expect(text).toBe('a1\tb1\tc1')
    expect(rowsOf(markdown(ed)).slice(2)).toEqual(['|   |   |   |', '| a2 | b2 | c2 |'])
    checkTables(ed.state.doc)
    expect(undoDepth(ed.state)).toBe(1)
    ed.commands.undo()
    expect(markdown(ed)).toBe(T)
  })

  it('cutting a whole one-column table empties it, never deletes it', () => {
    const ed = makeEditor('| A |\n| --- |\n| x |')
    selectCells(ed, [0, 0], [1, 0])
    copy(ed, 'cut')
    expect(markdown(ed)).toBe('|   |\n| --- |\n|   |')
  })
})

// ── Pasting copied NoteFlow cells ────────────────────────────────────────────

describe('pasting cells copied in NoteFlow', () => {
  it('into a table: the cells go into the cells, formatting kept, header stays a header', () => {
    const ed = makeEditor('| A | B |\n| --- | --- |\n| **x** | y |\n| 1 | 2 |')
    selectCells(ed, [0, 0], [1, 1])
    const data = copy(ed)
    caretInCell(ed, 2, 0)
    const md = pasteChecked(ed, data)
    expect(rowsOf(md)).toEqual([
      '| A | B |', '| --- | --- |', '| **x** | y |', '| A | B |', '| **x** | y |',
    ])
    // Pasted with the cells selected (prosemirror-tables).
    expect(ed.state.selection).toBeInstanceOf(CellSelection)
  })

  it('into a cell selection: repeated to fill it', () => {
    const ed = makeEditor(T)
    selectCells(ed, [1, 0], [1, 0])
    const data = copy(ed)
    selectCells(ed, [1, 1], [2, 2])
    const md = pasteChecked(ed, data)
    expect(rowsOf(md).slice(2)).toEqual(['| a1 | a1 | a1 |', '| a2 | a1 | a1 |'])
  })

  it('outside a table: a new table whose first copied row is the header', () => {
    const ed = makeEditor(T + '\n\nafter')
    selectCells(ed, [1, 0], [2, 1])
    const data = copy(ed)
    caretIn(ed, 'after')
    const md = pasteChecked(ed, data)
    expect(md).toContain('| a1 | b1 |\n| --- | :---: |\n| a2 | b2 |')
  })

  it('copied text (no cells) pastes natively', () => {
    const ed = makeEditor('one two\n\nend')
    ed.commands.setTextSelection({ from: 1, to: 4 })
    const data = copy(ed)
    caretIn(ed, 'end')
    paste(ed, data)
    expect(markdown(ed)).toBe('one two\n\nendone')
  })
})

// ── Spreadsheets (TSV) ───────────────────────────────────────────────────────

describe('pasting a spreadsheet range', () => {
  it('Excel, outside a table: a new table, first row = header, same-cell break kept', () => {
    const ed = makeEditor('intro')
    caretIn(ed, 'intro')
    const md = pasteChecked(ed, EXCEL)
    expect(md).toBe('intro\n\n| Name | Qty | Note |\n| --- | --- | --- |\n| Apples | 3 | red<br>fresh |')
  })

  it('Google Sheets: the same, from its own HTML wrapper', () => {
    const ed = makeEditor('')
    const md = pasteChecked(ed, SHEETS)
    expect(md).toBe('| Name | Qty |\n| --- | --- |\n| Pears | 7 |')
  })

  it('TSV text alone (no HTML) too; cell text stays literal (no markdown read)', () => {
    const ed = makeEditor('')
    paste(ed, { text: 'Name\tNote\n**bold**\ta|b\n_x_\thttps://example.com' })
    checkTables(ed.state.doc)
    let marks = 0
    ed.state.doc.descendants((n) => { marks += n.marks.length; return true })
    expect(marks).toBe(0)
    const texts: string[] = []
    ed.state.doc.descendants((n) => { if (n.isText) texts.push(n.text!); return true })
    expect(texts).toEqual(['Name', 'Note', '**bold**', 'a|b', '_x_', 'https://example.com'])
  })

  it('into a table: fills from the cursor\'s cell (the first pasted row is data), growing the table', () => {
    const ed = makeEditor(T)
    caretInCell(ed, 2, 1)
    const md = pasteChecked(ed, { text: 'p\tq\tr\ns\tt\tu' })
    expect(rowsOf(md)).toEqual([
      '| A | B | C |   |',
      '| --- | :---: | --- | --- |',
      '| a1 | b1 | c1 |   |',
      '| a2 | p | q | r |',
      '|   | s | t | u |',
    ])
    // Column B keeps its alignment on the pasted cells.
    expect(ed.state.doc.nodeAt(0)!.child(3).child(1).attrs.textAlign).toBe('center')
  })

  it('into the header row: the header keeps being the header, and its alignment', () => {
    const ed = makeEditor(T)
    caretInCell(ed, 0, 1)
    const md = pasteChecked(ed, { text: 'X\tY\n1\t2' })
    expect(rowsOf(md).slice(0, 3)).toEqual(['| A | X | Y |', '| --- | :---: | --- |', '| a1 | 1 | 2 |'])
  })

  it('into a cell selection: clipped / repeated to fill it', () => {
    const ed = makeEditor(T)
    selectCells(ed, [1, 0], [2, 2])
    const md = pasteChecked(ed, { text: 'p\tq\nr\ts' })
    expect(rowsOf(md).slice(2)).toEqual(['| p | q | p |', '| r | s | r |'])
  })

  it('in a code block, the text goes in verbatim', () => {
    const ed = makeEditor('```\ncode\n```')
    caretIn(ed, 'code')
    paste(ed, { text: 'a\tb\nc\td' })
    expect(hasTable(ed)).toBe(false)
    expect(markdown(ed)).toBe('```\ncodea\tb\nc\td\n```')
  })
})

describe('text that is NOT a table', () => {
  const cases: [string, ClipboardContent][] = [
    ['prose with a stray tab', { text: 'Dear all,\tsee below.\nThanks' }],
    ['lines with irregular tabs', { text: 'a\tb\tc\nd\te\nf' }],
    ['a list copied from Word', WORD_LIST],
    ['tab-indented code from VS Code', VSCODE_CODE],
    ['CSV with commas', { text: 'name,qty\napples,3\npears,7' }],
    ['CSV with semicolons', { text: 'name;qty\napples;3\npears;7' }],
  ]
  for (const [name, data] of cases) {
    it(name, () => {
      const ed = makeEditor('start')
      caretIn(ed, 'start')
      paste(ed, data)
      expect(hasTable(ed)).toBe(false)
    })
  }

  it('a markdown pipe table still goes the markdown way', () => {
    const ed = makeEditor('')
    const md = pasteChecked(ed, { text: '| a | b |\n| --- | ---: |\n| 1 | 2 |' })
    expect(md).toBe('| a | b |\n| --- | ---: |\n| 1 | 2 |')
  })

  it('a markdown pipe table pasted into a table fills its cells (no nested table)', () => {
    const ed = makeEditor(T)
    caretInCell(ed, 2, 0)
    const md = pasteChecked(ed, { text: '| x | y |\n| --- | --- |\n| 1 | 2 |' })
    expect(rowsOf(md).slice(3)).toEqual(['| x | y | c2 |', '| 1 | 2 |   |'])
  })
})

// ── HTML tables ──────────────────────────────────────────────────────────────

describe('pasting an HTML table (normalized for markdown)', () => {
  it('a web table with merged cells, no thead, a caption and a nested table', () => {
    const ed = makeEditor('')
    const md = pasteChecked(ed, WEB_TABLE)
    expect(md).toBe([
      '| **Fruit** | Stock | Price |',
      '| --- | --- | --- |',
      '| Apple | sold out |   |',
      '|   | 5 | 1.2 |',
      '| Total | 5 | x · y |',
    ].join('\n'))
  })

  it('Excel / Sheets HTML whose text isn\'t a clean TSV still gets a header row', () => {
    const ed = makeEditor('')
    const md = pasteChecked(ed, { html: SHEETS.html, text: 'Name Qty Pears 7' })
    expect(md).toBe('| Name | Qty |\n| --- | ---: |\n| Pears | 7 |')
  })

  const blankAround = (html: string, before: string, after: string) => html.replace('<table', before + '<table').replace('</table>', '</table>' + after)
  for (const [name, data] of [
    ['a web table', WEB_FORMATTED],
    ['a Google Docs table', DOCS_TABLE],
    ['a Google Docs table + its trailing <br>', DOCS_TABLE_TRAILING_BR],
    ['a Google Docs table with <br> inside its div', { text: DOCS_TABLE.text, html: DOCS_TABLE.html.replace('</table></div>', '</table><br /></div>') }],
    ['a web table between empty paragraphs', { text: WEB_FORMATTED.text, html: blankAround(WEB_FORMATTED.html, '<p></p>', '<p><br></p>') }],
  ] as const) {
    it(`${name} with bold and a link (TSV text too): pasted from its HTML, formatting kept`, () => {
      const ed = makeEditor('intro')
      caretIn(ed, 'intro')
      const md = pasteChecked(ed, data)
      const rows = rowsOf(md)
      expect(rows.slice(2, 4)).toEqual(['| Name | Site |', '| --- | --- |'])
      expect(rows[4]).toMatch(/^\| \*\*Bold\*\* \| \[(\+\+)?link(\+\+)?\]\(https:\/\/e\.com\) \|$/)
    })

    it(`${name} pasted into a table: its cells, with their marks, fill the cells (alignment kept)`, () => {
      const ed = makeEditor(T)
      caretInCell(ed, 1, 1)
      const md = pasteChecked(ed, data)
      const rows = rowsOf(md)
      expect(rows.slice(0, 3)).toEqual(['| A | B | C |', '| --- | :---: | --- |', '| a1 | Name | Site |'])
      expect(rows[3]).toMatch(/^\| a2 \| \*\*Bold\*\* \| \[(\+\+)?link(\+\+)?\]\(https:\/\/e\.com\) \|$/)
      expect(ed.state.doc.nodeAt(0)!.child(2).child(1).attrs.textAlign).toBe('center')
    })
  }

  it('the Docs table with its trailing <br>, pasted at a body cell: fills the cells (reviewer repro)', () => {
    const ed = makeEditor('| A | B |\n| --- | --- |\n| a1 | b1 |\n| a2 | b2 |')
    caretInCell(ed, 2, 0)
    const md = pasteChecked(ed, DOCS_TABLE_TRAILING_BR)
    const rows = rowsOf(md)
    expect(rows.slice(0, 4)).toEqual(['| A | B |', '| --- | --- |', '| a1 | b1 |', '| Name | Site |'])
    expect(rows[4]).toMatch(/^\| \*\*Bold\*\* \| \[(\+\+)?link(\+\+)?\]\(https:\/\/e\.com\) \|$/)
    expect(rows).toHaveLength(5)
  })

  it('a table with real text around it, into a cell: text and table (flattened) go into the cell, nothing of the table is lost', () => {
    const ed = makeEditor('| A | B |\n| --- | --- |\n| a1 | b1 |\n| a2 | b2 |')
    caretInCell(ed, 2, 0)
    const html = DOCS_TABLE.html.replace('<table', '<p>Intro text</p><table')
    const md = pasteChecked(ed, { html, text: 'Intro text\n' + DOCS_TABLE.text })
    const rows = rowsOf(md)
    expect(rows.slice(0, 3)).toEqual(['| A | B |', '| --- | --- |', '| a1 | b1 |'])
    // Pasted before what the cell held: a2 and b2 stay.
    expect(rows[3]).toBe('| Intro text<br>Name · Site<br>Bold · link<br>a2 | b2 |')
    expect(rows).toHaveLength(4)
  })

  it('several header rows: only the first stays a header; a spanning header aligns every column it covers', () => {
    const ed = makeEditor('')
    const md = pasteChecked(ed, {
      html: '<table><thead><tr><th colspan="2" style="text-align:center">Both</th><th>C</th></tr>'
        + '<tr><th>a</th><th>b</th><th>c</th></tr></thead><tbody><tr><td>1</td><td>2</td><td>3</td></tr></tbody></table>',
      text: 'Both C a b c 1 2 3',
    })
    expect(md).toBe('| Both |   | C |\n| :---: | :---: | --- |\n| a | b | c |\n| 1 | 2 | 3 |')
  })

  it('per-cell alignments (inline styles) give way to the header cell\'s', () => {
    const ed = makeEditor('')
    paste(ed, {
      html: '<table><tr><td>N</td><td>Q</td></tr><tr><td>p</td><td style="text-align:right">7</td></tr></table>',
      text: 'N Q p 7',
    })
    checkTables(ed.state.doc)
    expect(markdown(ed)).toBe('| N | Q |\n| --- | --- |\n| p | 7 |')
    ed.state.doc.descendants((n) => {
      if (n.type.name === 'tableCell' || n.type.name === 'tableHeader') expect(n.attrs.textAlign).toBeNull()
      return true
    })
  })

  it('into a table: its cells go into the cells, no nested table', () => {
    const ed = makeEditor(T)
    caretInCell(ed, 1, 0)
    const md = pasteChecked(ed, WEB_TABLE)
    expect(rowsOf(md)).toEqual([
      '| A | B | C |',
      '| --- | :---: | --- |',
      '| **Fruit** | Stock | Price |',
      '| Apple | sold out |   |',
      '|   | 5 | 1.2 |',
      '| Total | 5 | x · y |',
    ])
  })

  it('pasting text into an older merged-cell table normalizes it; the caret stays after the text', () => {
    const html = '<table><tr><th colspan="2"><p>Head</p></th></tr><tr><td><p>ab</p></td><td><p>c</p></td></tr></table>'
    const ed = makeEditor('', { html })
    caretIn(ed, 'ab')
    paste(ed, { text: 'XY' })
    checkTables(ed.state.doc)
    expect(markdown(ed)).toBe('| Head |   |\n| --- | --- |\n| abXY | c |')
    expect(ed.state.selection.$head.parent.textContent).toBe('abXY')
    expect(ed.state.selection.$head.parentOffset).toBe(4)
    expect(undoDepth(ed.state)).toBe(1)
  })

  it('a table among other content, into a cell: flattened to text', () => {
    const ed = makeEditor(T)
    caretIn(ed, 'b1')
    paste(ed, { html: '<p>see</p><table><tr><td>x</td><td>y</td></tr></table>', text: 'see\nx y' })
    checkTables(ed.state.doc)
    expect(headCell(ed)).toEqual([1, 1])
    expect(rowsOf(markdown(ed))[2]).toBe('| a1 | b1see<br>x · y | c1 |')
  })
})

describe('normalizedTable', () => {
  const schema = getSchema(schemaExtensions())

  it('a valid NoteFlow table is left alone', () => {
    expect(normalizedTable(tableFromRows(schema, [['a', 'b'], ['1', '2']]))).toBeNull()
  })

  it('loneTableSlice: only a closed table among blank blocks is singled out', () => {
    const table = tableFromRows(schema, [['a'], ['1']])
    const p = (...inline: Parameters<typeof schema.text>[0][]) => schema.nodes.paragraph.create(null, inline.map((t) => schema.text(t)))
    const br = schema.nodes.paragraph.create(null, schema.nodes.hardBreak.create())
    const empty = schema.nodes.paragraph.create()
    const lone = loneTableSlice(new Slice(Fragment.fromArray([empty, table, br]), 1, 1))
    expect(lone.content.childCount).toBe(1)
    expect(lone.content.firstChild).toBe(table)
    expect(lone.openStart).toBe(0)
    const withText = new Slice(Fragment.fromArray([p('see'), table]), 1, 0)
    expect(loneTableSlice(withText)).toBe(withText)
    const openTable = new Slice(Fragment.fromArray([table, br]), 1, 0)
    expect(loneTableSlice(openTable)).toBe(openTable)
    const noTable = new Slice(Fragment.fromArray([empty, br]), 0, 0)
    expect(loneTableSlice(noTable)).toBe(noTable)
  })

  it('a slice of a valid table is returned as-is', () => {
    const slice = new Slice(tableFromRows(schema, [['a'], ['1']]).content, 1, 1)
    expect(normalizePastedSlice(slice)).toBe(slice)
  })
})

// ── Images ───────────────────────────────────────────────────────────────────

describe('the picture Excel adds to a copied range', () => {
  it('is skipped by the editor (isTablePicture), the table is pasted', async () => {
    const { isTablePicture } = await import('../../src/lib/tablePaste')
    expect(isTablePicture(EXCEL.text, EXCEL.html)).toBe(true)
    expect(isTablePicture('', '<img src="x.png">')).toBe(false)
    expect(isTablePicture('', '')).toBe(false)
  })
})

describe('the cursor after pasting a new table', () => {
  it('goes after the table when something follows it', () => {
    const ed = makeEditor('intro\n\nafter')
    caretIn(ed, 'intro')
    paste(ed, SHEETS)
    expect(headCell(ed)).toBeNull()
    expect(ed.state.selection.$head.parent.textContent).toBe('after')
  })

  it('else into its last cell (like any pasted table)', () => {
    const ed = makeEditor('intro')
    caretIn(ed, 'intro')
    paste(ed, SHEETS)
    expect(headCell(ed)).toEqual([1, 1])
  })
})

// ── Column widths ────────────────────────────────────────────────────────────

describe('column widths when pasting', () => {
  // A: 10 dashes; B: 12, centred; C: automatic.
  const TW = [
    '| A | B | C |',
    '| ---------- | :------------: | --- |',
    '| a1 | b1 | c1 |',
    '| a2 | b2 | c2 |',
  ].join('\n')
  const sepOf = (md: string) => rowsOf(md)[1]

  it('cells copied in NoteFlow keep their widths in a new table (the HTML carries data-nf-colw)', () => {
    const ed = makeEditor(TW + '\n\nafter')
    selectCells(ed, [1, 0], [2, 1])
    const data = copy(ed)
    expect(data.html).toContain('data-nf-colw="10"')
    caretIn(ed, 'after')
    const md = pasteChecked(ed, data)
    expect(md).toContain('| a1 | b1 |\n| ---------- | :------------: |\n| a2 | b2 |')
  })

  it('pasted into a table, cells follow their destination column\'s width', () => {
    // a1 (10 dashes) into the automatic column C, c1 (automatic) into column A.
    const ed = makeEditor(TW)
    selectCells(ed, [1, 0], [1, 0])
    const fromA = copy(ed)
    caretInCell(ed, 2, 2)
    expect(sepOf(pasteChecked(ed, fromA))).toBe('| ---------- | :------------: | --- |')
    const ed2 = makeEditor(TW)
    selectCells(ed2, [1, 2], [1, 2])
    const fromC = copy(ed2)
    caretInCell(ed2, 2, 0)
    const md = pasteChecked(ed2, fromC)
    expect(sepOf(md)).toBe('| ---------- | :------------: | --- |')
    expect(rowsOf(md)[3]).toBe('| c1 | b2 | c2 |')
  })

  it('a spreadsheet range (TSV) into a table with widths keeps them', () => {
    const ed = makeEditor(TW)
    caretInCell(ed, 2, 0)
    const md = pasteChecked(ed, { text: 'x\ty\nz\tw' })
    expect(sepOf(md)).toBe('| ---------- | :------------: | --- |')
  })

  it('markdown pasted as text never brings widths (its dashes aren\'t NoteFlow\'s)', () => {
    const ed = makeEditor('')
    expect(pasteChecked(ed, { text: '| a | b |\n| ---------- | :------: |\n| 1 | 2 |' })).toBe('| a | b |\n| --- | :---: |\n| 1 | 2 |')
  })

  it('the px colwidth of another editor\'s HTML is dropped; NoteFlow\'s data-nf-colw is kept', () => {
    const foreign = '<table><tbody><tr><th colwidth="150"><p><strong>a</strong></p></th><th colwidth="90"><p>b</p></th></tr>'
      + '<tr><td colwidth="150"><p>1</p></td><td colwidth="90"><p>2</p></td></tr></tbody></table>'
    expect(pasteChecked(makeEditor(''), { html: foreign, text: 'a\tb\n1\t2' })).toBe('| **a** | b |\n| --- | --- |\n| 1 | 2 |')
    const own = foreign.replace(/colwidth="150"/g, 'data-nf-colw="20"').replace(/colwidth="90"/g, '')
    expect(sepOf(pasteChecked(makeEditor(''), { html: own, text: 'a\tb\n1\t2' }))).toBe('| -------------------- | --- |')
  })
})

describe('normalizedTable: column widths', () => {
  const schema = getSchema(schemaExtensions())
  const cell = (type: 'tableHeader' | 'tableCell', text: string, attrs: Record<string, unknown> = {}) =>
    schema.nodes[type].create(attrs, schema.nodes.paragraph.create(null, schema.text(text)))
  const widthsOf = (table: ReturnType<typeof tableFromRows>) => {
    const out: unknown[][] = []
    table.forEach((row) => { const r: unknown[] = []; row.forEach((c) => r.push(c.attrs.colwidth)); out.push(r) })
    return out
  }

  it('every cell takes its header\'s width', () => {
    const table = schema.nodes.table.create(null, [
      schema.nodes.tableRow.create(null, [cell('tableHeader', 'a', { colwidth: [14] }), cell('tableHeader', 'b')]),
      schema.nodes.tableRow.create(null, [cell('tableCell', '1'), cell('tableCell', '2', { colwidth: [30] })]),
    ])
    expect(widthsOf(normalizedTable(table)!)).toEqual([[[14], null], [[14], null]])
  })

  it('a header spanning columns gives each column its own entry', () => {
    const table = schema.nodes.table.create(null, [
      schema.nodes.tableRow.create(null, [cell('tableHeader', 'wide', { colspan: 2, colwidth: [12, 20] })]),
      schema.nodes.tableRow.create(null, [cell('tableCell', '1'), cell('tableCell', '2')]),
    ])
    expect(widthsOf(normalizedTable(table)!)).toEqual([[[12], [20]], [[12], [20]]])
  })
})
