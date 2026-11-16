// @vitest-environment happy-dom
//
// Column widths of tables (lib/tableWidth.ts; format in .agents/context/
// note-format.md "Tablas: ancho de columna"): the separator's dash count,
// through the editor's real load / save pipeline (helpers/editorPipeline.ts).
// The read side alone (htmlFromMarkdown) is also in markdownHtml.test.ts.

import { describe, expect, it } from 'vitest'
import { createDocument, getHTMLFromFragment, getSchema } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { schemaExtensions } from '../../src/components/Editor/editorExtensions'
import { htmlFromMarkdown, htmlToMarkdown } from '../../src/lib/markdownHtml'
import {
  clampColumnWidth, minWidthForHeader, pxFromWidth, widthFromAttr, widthFromDashes, widthFromPx, widthOfColwidth,
} from '../../src/lib/tableWidth'
import { load, save, schema } from '../helpers/editorPipeline'
import * as FIXTURES from '../helpers/roundTripFixtures'

/** The `colwidth` of every cell, row by row, of the first table of `doc`. */
function colwidths(doc: PMNode): (number[] | null)[][] {
  let out: (number[] | null)[][] = []
  doc.descendants((node) => {
    if (node.type.name !== 'table' || out.length) return !out.length
    out = []
    node.forEach((row) => {
      const cells: (number[] | null)[] = []
      row.forEach((cell) => cells.push(cell.attrs.colwidth as number[] | null))
      out.push(cells)
    })
    return false
  })
  return out
}

/** save(load(md)) twice: the first save, and that it's a fixpoint. */
function saved(md: string): string {
  const once = save(load(md))
  expect(save(load(once)), once).toBe(once)
  return once
}

describe('tableWidth helpers', () => {
  it('widthFromDashes: 3-9 automatic, 10-80 as is, more → 80', () => {
    expect([0, 3, 4, 5, 6, 9].map(widthFromDashes)).toEqual([null, null, null, null, null, null])
    expect([10, 11, 24, 80].map(widthFromDashes)).toEqual([10, 11, 24, 80])
    expect([81, 200].map(widthFromDashes)).toEqual([80, 80])
  })

  it('clampColumnWidth: rounds, clamps to 10…80, rejects non-numbers', () => {
    expect([1, 6, 9.4, 10, 12.5, 79.6, 300].map(clampColumnWidth)).toEqual([10, 10, 10, 10, 13, 80, 80])
    expect(clampColumnWidth(Number.NaN)).toBeNull()
    expect(clampColumnWidth(Infinity)).toBeNull()
  })

  it('widthOfColwidth reads only a NoteFlow width', () => {
    expect(widthOfColwidth([12])).toBe(12)
    expect(widthOfColwidth(null)).toBeNull()
    expect(widthOfColwidth([120, 80])).toBeNull()
    expect(widthOfColwidth([9])).toBeNull()
    expect(widthOfColwidth([81])).toBeNull()
    expect(widthOfColwidth([12.5])).toBeNull()
  })

  it('widthFromAttr: digits only, read like dashes', () => {
    expect(['12', ' 10 ', '9', '200', '', 'x', '12px', null].map(widthFromAttr)).toEqual([12, 10, null, 80, null, null, null, null])
  })

  it('minWidthForHeader: the header\'s longest word rounded up to dashes, never under 10 nor over 80', () => {
    // 15px font: 7.5px a dash.
    expect(minWidthForHeader(0, 15)).toBe(10)
    expect(minWidthForHeader(60, 15)).toBe(10)
    expect(minWidthForHeader(75, 15)).toBe(10)
    expect(minWidthForHeader(75.5, 15)).toBe(11)
    expect(minWidthForHeader(150, 15)).toBe(20)
    expect(minWidthForHeader(5000, 15)).toBe(80)
  })
})

describe('notes without widths are saved byte for byte as before', () => {
  // Every canonical section (helpers/roundTripFixtures.ts: a real work note with
  // tables, one-column tables…) keeps its separators.
  for (const [name, md] of Object.entries(FIXTURES)) {
    it(name, () => { expect(save(load(md))).toBe(md) })
  }

  it('tables with alignments, one column, in a quote, with an escaped pipe and an empty header', () => {
    const cases = [
      '| a | b | c |\n| :--- | :---: | ---: |\n| 1 |   | x \\| y |',
      '| H |\n| :---: |\n| a |',
      '> | H | I |\n> | --- | ---: |\n> | a | b |',
      '|   |   |\n| --- | --- |\n| a | b |',
      'before\n\n| Tarea | Estado |\n| --- | --- |\n| Revisar | ok |\n\nafter',
    ]
    for (const md of cases) expect(save(load(md)), md).toBe(md)
  })

  it('separators NoteFlow didn\'t write (compact, aligned) are rewritten `---` as they always were', () => {
    expect(saved('| a | b |\n|------------|-----|\n| 1 | 2 |')).toBe('| a | b |\n| --- | --- |\n| 1 | 2 |')
    expect(saved('| Name   | Notes  |\n| ------ | :----: |\n| a      | b      |')).toBe('| Name | Notes |\n| --- | :---: |\n| a | b |')
  })

  it('the HTML of a table is unchanged: no width style on the <table> or its <col>s', () => {
    // (The DOM serializer may end a style with `;`.)
    const html = getHTMLFromFragment(load('| a | b |\n| --- | --- |').content, schema).replace(/;"/g, '"')
    expect(html).toBe('<table class="md-table" style="min-width: 50px"><colgroup><col style="min-width: 25px"><col style="min-width: 25px"></colgroup>'
      + '<tbody><tr><th colspan="1" rowspan="1"><p>a</p></th><th colspan="1" rowspan="1"><p>b</p></th></tr></tbody></table>')
  })
})

describe('notes with widths', () => {
  it('save → reopen → save is identical (alignment + width, automatic columns, one column, in a quote)', () => {
    const cases = [
      '| Product | Price | Notes |\n| ------------------------ | ----------: | --- |\n| Lamp | 12 | x |',
      '| Task |\n| :--------------: |\n| a |',
      '| a | b |\n| :----------: | ---------- |\n| 1 | 2 |',
      '> | H | I |\n> | ---------- | --- |\n> | a | b |',
      `| a | b |\n| ${'-'.repeat(80)} | ${'-'.repeat(10)} |`,
    ]
    for (const md of cases) {
      expect(save(load(md)), md).toBe(md)
      expect(save(load(save(load(md)))), md).toBe(md)
    }
  })

  it('every cell of a column carries its header\'s width', () => {
    expect(colwidths(load('| a | b |\n| ---------- | --- |\n| 1 | 2 |\n| 3 | 4 |'))).toEqual([[[10], null], [[10], null], [[10], null]])
  })

  it('clamps on reading: 4-9 dashes → `---`, 10 kept, 200 → 80', () => {
    expect(saved('| a | b |\n| ---- | --------- |\n| 1 | 2 |')).toBe('| a | b |\n| --- | --- |\n| 1 | 2 |')
    expect(saved('| a | b |\n| :------: | ------ |\n| 1 | 2 |')).toBe('| a | b |\n| :---: | --- |\n| 1 | 2 |')
    expect(saved('| a | b |\n| ---------- | --- |\n| 1 | 2 |')).toBe('| a | b |\n| ---------- | --- |\n| 1 | 2 |')
    expect(saved(`| a | b |\n| ${'-'.repeat(200)} | :---: |`)).toBe(`| a | b |\n| ${'-'.repeat(80)} | :---: |`)
  })

  it('the writer never lines a table with widths up with its header: +1 dash on the last width (−1 at 80), stable', () => {
    // `| abcdefghij |` over `| ---------- |` would read as a formatter's table and lose its width.
    const one = load('| abcdefghij | xyz |\n| ----------- | --- |')
    const doc = schema.nodeFromJSON({
      type: 'doc',
      content: [{ type: 'table', content: [{ type: 'tableRow', content: [
        { type: 'tableHeader', attrs: { colwidth: [10] }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'abcdefghij' }] }] },
        { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'xyz' }] }] },
      ] }] }],
    })
    expect(save(doc)).toBe('| abcdefghij | xyz |\n| ----------- | --- |')
    expect(colwidths(load(save(doc)))).toEqual([[[11], null]])
    expect(save(one)).toBe('| abcdefghij | xyz |\n| ----------- | --- |')
    // At 80 it takes one off.
    const long = 'x'.repeat(80)
    const at80 = schema.nodeFromJSON({
      type: 'doc',
      content: [{ type: 'table', content: [{ type: 'tableRow', content: [
        { type: 'tableHeader', attrs: { colwidth: [80] }, content: [{ type: 'paragraph', content: [{ type: 'text', text: long }] }] },
      ] }] }],
    })
    expect(save(at80)).toBe(`| ${long} |\n| ${'-'.repeat(79)} |`)
    expect(saved(save(at80))).toBe(save(at80))
    // Not lined up (another column differs): written as is.
    const notAligned = schema.nodeFromJSON({
      type: 'doc',
      content: [{ type: 'table', content: [{ type: 'tableRow', content: [
        { type: 'tableHeader', attrs: { colwidth: [10] }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'abcdefghij' }] }] },
        { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'xy' }] }] },
      ] }] }],
    })
    expect(save(notAligned)).toBe('| abcdefghij | xy |\n| ---------- | --- |')
  })

  it('the cells\' HTML carries the width; the <table> stays as without widths', () => {
    const html = getHTMLFromFragment(load('| a | b |\n| :----------: | --- |\n| 1 | 2 |').content, schema).replace(/;"/g, '"')
    expect(html).toContain('<table class="md-table" style="min-width: 50px"><colgroup><col style="min-width: 25px"><col style="min-width: 25px"></colgroup>')
    expect(html).toContain('<th colspan="1" rowspan="1" data-nf-colw="10" style="--nf-colw: 10; text-align: center">')
    expect(html).toContain('<td colspan="1" rowspan="1" data-nf-colw="10" style="--nf-colw: 10; text-align: center">')
    expect(html).not.toMatch(/[^-]width: \d+px/)
    expect(html).not.toContain('colwidth')
  })
})

describe('HTML: widths only from NoteFlow', () => {
  const parse = (html: string) => createDocument(html, schema)

  it('reads data-nf-colw (clamped), never the px colwidth of another editor', () => {
    expect(colwidths(parse('<table><tr><th data-nf-colw="12">a</th><th colwidth="120">b</th></tr><tr><td data-nf-colw="12">1</td><td colwidth="120">2</td></tr></table>')))
      .toEqual([[[12], null], [[12], null]])
    expect(colwidths(parse('<table><tr><th data-nf-colw="4">a</th><th data-nf-colw="300">b</th></tr></table>'))).toEqual([[null, [80]]])
  })
})

describe('contexts that ignore widths', () => {
  const plainSchema = getSchema(schemaExtensions({ plain: true }))
  const plainLoad = (md: string) => createDocument(htmlFromMarkdown(md, { plain: true }), plainSchema)
  const plainSave = (doc: PMNode) => htmlToMarkdown(getHTMLFromFragment(doc.content, plainSchema))

  it('plain (a linked note): no widths read, the separator written `---`, as before', () => {
    const md = '| a | b |\n| ---------- | :--------: |\n| 1 | 2 |'
    expect(colwidths(plainLoad(md))).toEqual([[null, null], [null, null]])
    expect(plainSave(plainLoad(md))).toBe('| a | b |\n| --- | :---: |\n| 1 | 2 |')
    // Not even from NoteFlow HTML pasted into it.
    const fromHtml = createDocument('<table><tr><th data-nf-colw="12">a</th></tr></table>', plainSchema)
    expect(colwidths(fromHtml)).toEqual([[null]])
    expect(getHTMLFromFragment(fromHtml.content, plainSchema)).not.toContain('nf-colw')
  })

  it('markdown read with columnWidths: false (pasted as text, the chat) has no widths', () => {
    const md = '| a | b |\n| ---------- | --- |\n| 1 | 2 |'
    expect(colwidths(createDocument(htmlFromMarkdown(md, { columnWidths: false }), schema))).toEqual([[null, null], [null, null]])
  })
})

describe('px ↔ dashes (the resize drag)', () => {
  it('a dash is half the font size; snapped to whole dashes and clamped', () => {
    expect(pxFromWidth(24, 15)).toBe(180)
    expect(widthFromPx(180, 15)).toBe(24)
    expect(widthFromPx(183.7, 15)).toBe(24)
    expect(widthFromPx(184, 15)).toBe(25)
    expect(widthFromPx(10, 15)).toBe(10)
    expect(widthFromPx(5000, 15)).toBe(80)
    // The same width at the overview cards' 10px is 5px a dash.
    expect(pxFromWidth(20, 10)).toBe(100)
  })
})
