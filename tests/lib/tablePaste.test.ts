// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { htmlIsOnlyTable, isProseMirrorHtml, isSpreadsheetHtml, isTablePicture, shouldPasteAsTsv } from '../../src/lib/tablePaste'
import { DOCS_TABLE, EXCEL, SHEETS, VSCODE_CODE, WEB_FORMATTED, WEB_TABLE, WORD_LIST } from '../helpers/clipboardFixtures'

describe('isProseMirrorHtml', () => {
  it('spots a ProseMirror copy by its data-pm-slice attribute', () => {
    expect(isProseMirrorHtml('<table data-pm-slice="1 1 -2 []"><tr><td>x</td></tr></table>')).toBe(true)
    expect(isProseMirrorHtml('<p data-pm-slice="1 1 []">x</p>')).toBe(true)
    expect(isProseMirrorHtml(SHEETS.html)).toBe(false)
    expect(isProseMirrorHtml('')).toBe(false)
  })
})

describe('htmlIsOnlyTable', () => {
  it('empty HTML counts (plain TSV text)', () => {
    expect(htmlIsOnlyTable('')).toBe(true)
    expect(htmlIsOnlyTable('  \n')).toBe(true)
  })

  it('Excel, Google Sheets and a web table: one table, styles and metadata aside', () => {
    expect(htmlIsOnlyTable(EXCEL.html)).toBe(true)
    expect(htmlIsOnlyTable(SHEETS.html)).toBe(true)
    expect(htmlIsOnlyTable(WEB_TABLE.html)).toBe(true)
  })

  it('anything with text outside the table, two tables, or no table: no', () => {
    expect(htmlIsOnlyTable('<p>see</p><table><tr><td>x</td></tr></table>')).toBe(false)
    expect(htmlIsOnlyTable('<table><tr><td>x</td></tr></table><table><tr><td>y</td></tr></table>')).toBe(false)
    expect(htmlIsOnlyTable(WORD_LIST.html)).toBe(false)
    expect(htmlIsOnlyTable(VSCODE_CODE.html)).toBe(false)
    expect(htmlIsOnlyTable('<b>x</b>')).toBe(false)
  })
})

describe('shouldPasteAsTsv', () => {
  it('spreadsheet ranges and bare TSV', () => {
    expect(shouldPasteAsTsv(EXCEL.text, EXCEL.html)).toBe(true)
    expect(shouldPasteAsTsv(SHEETS.text, SHEETS.html)).toBe(true)
    expect(shouldPasteAsTsv('a\tb\nc\td', '')).toBe(true)
  })

  it('not prose, irregular tabs, Word lists, code, CSV, markdown tables or tabular text with other HTML', () => {
    expect(shouldPasteAsTsv('Dear all,\tsee below.\nThanks', '')).toBe(false)
    expect(shouldPasteAsTsv('a\tb\tc\nd\te\nf', '')).toBe(false)
    expect(shouldPasteAsTsv(WORD_LIST.text, WORD_LIST.html)).toBe(false)
    expect(shouldPasteAsTsv(VSCODE_CODE.text, VSCODE_CODE.html)).toBe(false)
    expect(shouldPasteAsTsv('\tindented\n\tcode', '')).toBe(false)
    expect(shouldPasteAsTsv('name,qty\napples,3', '')).toBe(false)
    expect(shouldPasteAsTsv('name;qty\napples;3', '')).toBe(false)
    expect(shouldPasteAsTsv('| a | b |\n| --- | --- |\n| 1 | 2 |', '')).toBe(false)
    expect(shouldPasteAsTsv('a\tb\nc\td', '<div><span>a\tb</span></div>')).toBe(false)
    // A web table whose text isn't rectangular (merged cells) goes the HTML way.
    expect(shouldPasteAsTsv(WEB_TABLE.text, WEB_TABLE.html)).toBe(false)
  })
})

describe('isTablePicture', () => {
  it('an image next to a table (Excel / Numbers) or next to TSV text', () => {
    expect(isTablePicture(EXCEL.text, EXCEL.html)).toBe(true)
    expect(isTablePicture('', SHEETS.html)).toBe(true)
    expect(isTablePicture('a\tb\nc\td', '')).toBe(true)
  })

  it('not a lone image, nor one with ordinary text', () => {
    expect(isTablePicture('', '')).toBe(false)
    expect(isTablePicture('', '<img src="https://example.com/x.png">')).toBe(false)
    expect(isTablePicture('a caption', '<p>a caption</p><img src="x.png">')).toBe(false)
  })
})

describe('shouldPasteAsTsv: tables with links or inline formatting keep their HTML', () => {
  it('a web table or a Google Docs table with bold / a link: not TSV (its HTML keeps them)', () => {
    expect(shouldPasteAsTsv(WEB_FORMATTED.text, WEB_FORMATTED.html)).toBe(false)
    expect(shouldPasteAsTsv(DOCS_TABLE.text, DOCS_TABLE.html)).toBe(false)
    for (const tag of ['<strong>x</strong>', '<i>x</i>', '<em>x</em>', '<u>x</u>', '<s>x</s>', '<del>x</del>', '<code>x</code>', '<mark>x</mark>', '<img src="x.png">']) {
      expect(shouldPasteAsTsv('a\tb\nc\td', `<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>${tag}</td></tr></table>`), tag).toBe(false)
    }
  })

  it('Docs\' plain text (font-weight:400, text-decoration:none, the normal-weight <b> wrapper) is still TSV', () => {
    const plain = DOCS_TABLE.html.replace('font-weight:700', 'font-weight:400').replace(/<a [^>]*>(.*?)<\/a>/, '$1')
      .replace('text-decoration:underline', 'text-decoration:none')
    expect(shouldPasteAsTsv(DOCS_TABLE.text, plain)).toBe(true)
  })

  it('a plain web table is TSV (same result either way)', () => {
    expect(shouldPasteAsTsv('a\tb\nc\td', '<table><tr><th>a</th><th>b</th></tr><tr><td>c</td><td>d</td></tr></table>')).toBe(true)
  })

  it('spreadsheets: whole-cell styles don\'t count, links and rich text do', () => {
    expect(isSpreadsheetHtml(EXCEL.html)).toBe(true)
    expect(isSpreadsheetHtml(SHEETS.html)).toBe(true)
    expect(isSpreadsheetHtml(WEB_FORMATTED.html)).toBe(false)
    expect(isSpreadsheetHtml(DOCS_TABLE.html)).toBe(false)
    const boldCell = SHEETS.html.replace('vertical-align:bottom;">Pears', 'vertical-align:bottom;font-weight:bold;">Pears')
    expect(shouldPasteAsTsv(SHEETS.text, boldCell)).toBe(true)
    const linked = SHEETS.html.replace('>Pears<', '><a href="https://e.com">Pears</a><')
    expect(shouldPasteAsTsv(SHEETS.text, linked)).toBe(false)
  })
})
