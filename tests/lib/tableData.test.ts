// @vitest-environment happy-dom
//
// Pure table-data helpers (src/lib/tableData.ts). happy-dom only because the
// markdown copy is checked against the editor's real load pipeline.

import { describe, expect, it } from 'vitest'
import { EditorState } from '@tiptap/pm/state'
import {
  cellsToMarkdown, cellsToTsv, detectDelimiter, isNumericColumn, looksLikeTabularText,
  formatCellNumber, parseCellNumber, parseDelimited, sortOrder, summarizeCells,
} from '../../src/lib/tableData'
import { containsMarkdownTable } from '../../src/lib/markdownHtml'
import { getTableData } from '../../src/components/Editor/tableOps'
import { load } from '../helpers/editorPipeline'

describe('parseCellNumber', () => {
  it.each([
    ['42', 42], ['-3.5', -3.5], ['3,5', 3.5], ['+7', 7], ['−2', -2], ['.5', 0.5], [',5', 0.5],
    ['-.25', -0.25], [' 12 ', 12], ['0,123', 0.123], ['1234,567', 1234.567], ['1.234', 1.234],
    ['007', 7], ['0', 0],
  ])('%j → %d', (text, value) => {
    expect(parseCellNumber(text)).toBe(value)
  })

  it.each([
    '', ' ', '-', '+', '.', '5.', '1,234', '-12,500', '999,000', '1,2,3', '1.2.3', '1 000',
    '1,234.5', '1e5', '12%', '$5', 'abc', '3 apples', '--1', 'Infinity', 'NaN', '0x10',
  ])('%j is not a number', (text) => {
    expect(parseCellNumber(text)).toBeNull()
  })

  it('isNumericColumn: every non-empty cell is a number, and there is one', () => {
    expect(isNumericColumn(['1', '', ' 2,5 '])).toBe(true)
    expect(isNumericColumn(['', ' '])).toBe(false)
    expect(isNumericColumn([])).toBe(false)
    expect(isNumericColumn(['1', 'x'])).toBe(false)
    expect(isNumericColumn(['1', '1,234'])).toBe(false)
  })
})

describe('sortOrder', () => {
  const pick = (values: string[], order: number[]) => order.map((i) => values[i])

  it('numeric column: by value, empties last in both directions', () => {
    const v = ['10', '', '-2,5', '3', '0.5']
    expect(pick(v, sortOrder(v, 'asc'))).toEqual(['-2,5', '0.5', '3', '10', ''])
    expect(pick(v, sortOrder(v, 'desc'))).toEqual(['10', '3', '0.5', '-2,5', ''])
  })

  it('text column: locale collation, natural numbers, case-insensitive', () => {
    const v = ['item 10', 'Banana', 'item 2', 'apple', 'Éclair', 'eclair']
    expect(pick(v, sortOrder(v, 'asc', 'en'))).toEqual(['apple', 'Banana', 'eclair', 'Éclair', 'item 2', 'item 10'])
  })

  it('one non-number makes the whole column text', () => {
    const v = ['10', 'x', '9']
    expect(pick(v, sortOrder(v, 'asc', 'en'))).toEqual(['9', '10', 'x'])
  })

  it('stable in both directions: ties keep their original order (desc is not reverse)', () => {
    const v = ['b', 'A', 'a', 'B', '', 'a']
    expect(sortOrder(v, 'asc', 'en')).toEqual([1, 2, 5, 0, 3, 4])
    expect(sortOrder(v, 'desc', 'en')).toEqual([0, 3, 1, 2, 5, 4])
    const n = ['1', '2', '1,0', '2.0', '']
    expect(sortOrder(n, 'asc')).toEqual([0, 2, 1, 3, 4])
    expect(sortOrder(n, 'desc')).toEqual([1, 3, 0, 2, 4])
  })

  it('empty and single inputs', () => {
    expect(sortOrder([], 'asc')).toEqual([])
    expect(sortOrder(['x'], 'desc')).toEqual([0])
    expect(sortOrder(['', ' '], 'desc')).toEqual([0, 1])
  })
})

describe('summarizeCells', () => {
  it('counts, sum, average, min and max of the numeric cells', () => {
    expect(summarizeCells([['1', '2,5'], ['x', ''], ['-0.5']])).toEqual({
      count: 5, filled: 4, numeric: 3, sum: 3, average: 1, min: -0.5, max: 2.5, decimals: 1,
    })
  })

  it('rounds the sum to the inputs\' decimals', () => {
    expect(summarizeCells([['0.1', '0.2']]).sum).toBe(0.3)
    expect(summarizeCells([['0,1'], ['0,2'], ['-0,3']]).sum).toBe(0)
    expect(summarizeCells([['3,50'], ['1']]).decimals).toBe(2)
  })

  it('no numbers → null sum, average, min and max', () => {
    const none = { sum: null, average: null, min: null, max: null, decimals: 0 }
    expect(summarizeCells([['a', ''], ['1,234']])).toEqual({ count: 3, filled: 2, numeric: 0, ...none })
    expect(summarizeCells([])).toEqual({ count: 0, filled: 0, numeric: 0, ...none })
    expect(summarizeCells([['7']])).toEqual({ count: 1, filled: 1, numeric: 1, sum: 7, average: 7, min: 7, max: 7, decimals: 0 })
    expect(summarizeCells([['-0'], ['x']])).toMatchObject({ min: 0, max: 0 })
  })
})

describe('formatCellNumber', () => {
  it('English: point decimal, comma grouping', () => {
    expect(formatCellNumber(1234.5, 'en', 2)).toBe('1,234.50')
    expect(formatCellNumber(12345, 'en', 0)).toBe('12,345')
    expect(formatCellNumber(7, 'en', 1)).toBe('7.0')
    expect(formatCellNumber(10 / 3, 'en', 2, 0)).toBe('3.33')
    expect(formatCellNumber(7.5, 'en', 2, 0)).toBe('7.5')
    expect(formatCellNumber(-2.25, 'en', 2)).toBe('-2.25')
  })

  it('Spanish: comma decimal, point grouping from 5 digits (es-ES leaves 4-digit numbers ungrouped)', () => {
    expect(formatCellNumber(1234.5, 'es', 2)).toBe('1234,50')
    expect(formatCellNumber(12345, 'es', 0)).toBe('12.345')
    expect(formatCellNumber(1234567.25, 'es', 2)).toBe('1.234.567,25')
    expect(formatCellNumber(10 / 3, 'es', 2, 0)).toBe('3,33')
    expect(formatCellNumber(7.5, 'es', 2, 0)).toBe('7,5')
  })

  it('never "-0"; out-of-range decimals clamped', () => {
    expect(formatCellNumber(-0.001, 'en', 2, 0)).toBe('0')
    expect(formatCellNumber(-0.001, 'es', 2)).toBe('0,00')
    expect(formatCellNumber(1.5, 'en', -1)).toBe('2')
  })
})

describe('cellsToMarkdown', () => {
  /** What the editor reads back from the markdown (cell texts). */
  const readBack = (md: string) => getTableData(EditorState.create({ doc: load(md) }), { tablePos: 0 })

  it('writes a pipe table the editor reads back', () => {
    const rows = [['Name', 'Qty'], ['a|b', 'x\ny'], ['', ' 3 ']]
    const md = cellsToMarkdown(rows, ['left', 'right'])
    expect(md).toBe('| Name | Qty |\n| :--- | ---: |\n| a\\|b | x<br>y |\n|   | 3 |')
    expect(containsMarkdownTable(md)).toBe(true)
    expect(readBack(md)).toEqual({ rows: [['Name', 'Qty'], ['a|b', 'x\ny'], ['', '3']], aligns: ['left', 'right'] })
  })

  it('pads ragged rows, defaults aligns, CRLF breaks', () => {
    const md = cellsToMarkdown([['a', 'b', 'c'], ['1'], ['x\r\ny', '', 'z']], ['center'])
    expect(md).toBe('| a | b | c |\n| :---: | --- | --- |\n| 1 |   |   |\n| x<br>y |   | z |')
    expect(readBack(md)?.rows).toEqual([['a', 'b', 'c'], ['1', '', ''], ['x\ny', '', 'z']])
  })

  it('header only, empty header cells', () => {
    const md = cellsToMarkdown([['', '']])
    expect(md).toBe('|   |   |\n| --- | --- |')
    expect(readBack(md)?.rows).toEqual([['', '']])
  })

  it('no cells → empty string; one column is a table the editor reads back', () => {
    expect(cellsToMarkdown([])).toBe('')
    expect(cellsToMarkdown([[]])).toBe('')
    const md = cellsToMarkdown([['a'], ['b']])
    expect(md).toBe('| a |\n| --- |\n| b |')
    expect(containsMarkdownTable(md)).toBe(true)
    expect(readBack(md)?.rows).toEqual([['a'], ['b']])
  })
})

describe('cellsToTsv / parseDelimited', () => {
  it('quotes cells with tabs, breaks or quotes, Excel-style', () => {
    const rows = [['a', 'b\tc', 'say "hi"'], ['multi\nline', '', 'x\r\ny']]
    const tsv = cellsToTsv(rows)
    expect(tsv).toBe('a\t"b\tc"\t"say ""hi"""\n"multi\nline"\t\t"x\ny"')
    expect(parseDelimited(tsv, '\t')).toEqual([['a', 'b\tc', 'say "hi"'], ['multi\nline', '', 'x\ny']])
  })

  it('pads ragged rows when copying; empty input', () => {
    expect(cellsToTsv([['a', 'b'], ['c']])).toBe('a\tb\nc\t')
    expect(cellsToTsv([])).toBe('')
  })

  it('parses TSV with CRLF and a trailing newline', () => {
    expect(parseDelimited('a\tb\r\nc\td\r\n')).toEqual([['a', 'b'], ['c', 'd']])
    expect(parseDelimited('a\tb\rc\td')).toEqual([['a', 'b'], ['c', 'd']])
    expect(parseDelimited('a\tb\n\n\n')).toEqual([['a', 'b']])
  })

  it('keeps blank rows in the middle and empty trailing cells; pads ragged rows', () => {
    expect(parseDelimited('a\tb\n\nc\td', '\t')).toEqual([['a', 'b'], ['', ''], ['c', 'd']])
    expect(parseDelimited('a\t\n\t\n', '\t')).toEqual([['a', ''], ['', '']])
    expect(parseDelimited('a\tb\tc\nd', '\t')).toEqual([['a', 'b', 'c'], ['d', '', '']])
  })

  it('quoted fields: delimiters, CRLF breaks and doubled quotes inside', () => {
    expect(parseDelimited('"a,b",c\r\n"line1\r\nline2","q""q"', ',')).toEqual([['a,b', 'c'], ['line1\nline2', 'q"q']])
    expect(parseDelimited('"",x', ',')).toEqual([['', 'x']])
  })

  it('lenient with malformed quotes', () => {
    // Text after the closing quote stays in the field.
    expect(parseDelimited('"a"b\tc', '\t')).toEqual([['ab', 'c']])
    // A quote in the middle of a field is literal.
    expect(parseDelimited('5" screen\tx', '\t')).toEqual([['5" screen', 'x']])
    // An opening quote that never closes is a literal quote.
    expect(parseDelimited('"abc\tdef\nghi\tjkl', '\t')).toEqual([['"abc', 'def'], ['ghi', 'jkl']])
  })

  it('empty text → no rows', () => {
    expect(parseDelimited('')).toEqual([])
    expect(parseDelimited('\n')).toEqual([])
  })

  it('a single cell', () => {
    expect(parseDelimited('x')).toEqual([['x']])
  })

  it('detects the delimiter from the first record', () => {
    expect(detectDelimiter('a\tb,c\nd')).toBe('\t')
    expect(detectDelimiter('a;b;c\n1,5;2,5;3')).toBe(';')
    expect(detectDelimiter('a,b\n1;2')).toBe(',')
    expect(detectDelimiter('"x\ty",b\n1\t2')).toBe(',')
    expect(detectDelimiter('plain')).toBe(',')
    expect(parseDelimited('a;b\n1,5;2')).toEqual([['a', 'b'], ['1,5', '2']])
  })

  it('counts delimiters with the parser\'s quote rules (a quote only opens a field)', () => {
    const text = 'TV 55"\tSony\nTV 40\tLG'
    expect(detectDelimiter(text)).toBe('\t')
    expect(parseDelimited(text)).toEqual([['TV 55"', 'Sony'], ['TV 40', 'LG']])
    expect(looksLikeTabularText(text)).toBe(true)
    expect(detectDelimiter('12" pizza;9;x\n10" pizza;7;y')).toBe(';')
  })
})

describe('looksLikeTabularText', () => {
  it.each([
    ['spreadsheet range', 'Name\tQty\tPrice\nApple\t3\t1,20\nPear\t\t0,80\n'],
    ['CRLF, two columns', 'a\tb\r\nc\td'],
    ['key / value lines', 'Name:\tJohn\nAge:\t30'],
    ['quoted multi-line cell', 'a\t"x\ny"\nb\tc'],
    ['numbered column with a header', '#\tTask\n1.\tWrite\n2.\tShip'],
  ])('%s → table', (_, text) => {
    expect(looksLikeTabularText(text)).toBe(true)
  })

  it.each([
    ['no tabs', 'a b\nc d'],
    ['one line', 'a\tb\tc'],
    ['prose with a stray tab', 'First paragraph with\ta tab.\n\nSecond paragraph without one.'],
    ['tab-indented code', 'function f() {\n\treturn 1\n}'],
    ['indented block, uniform depth', '\tfoo()\n\tbar()'],
    ['ragged rows', 'a\tb\nc\td\te'],
    ['a pipe table', '| a\t| b |\n| --- | --- |\n| 1 | 2 |'],
    ['CSV', 'a,b\nc,d'],
    ['an empty column', 'a\t\tb\nc\t\td'],
    ['numbered list from Word', '1.\tFirst item\n2.\tSecond item'],
    ['bulleted list from Word', '•\tApples\n•\tPears'],
    ['lettered list', 'a)\tx\nb)\ty'],
    ['roman list', 'i.\tx\nii.\ty\niv.\tz'],
    ['dash list', '-\tx\n–\ty'],
    ['empty', ''],
  ])('%s → not a table', (_, text) => {
    expect(looksLikeTabularText(text)).toBe(false)
  })
})
