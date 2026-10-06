import { describe, it, expect } from 'vitest'
import { parseKanbanMarkdown } from '../../src/lib/kanban'
import { countKanbanMatches, highlightHtml, kanbanSearchUnits } from '../../src/lib/kanbanSearch'
import { buildSearchRegex } from '../../src/lib/searchUtils'

const re = (q: string, caseSensitive = false) => buildSearchRegex(q, { caseSensitive })

describe('highlightHtml', () => {
  it('wraps matches in text runs and leaves tags alone', () => {
    const { html, count } = highlightHtml('a <strong>b a</strong> <a href="a">x</a>', re('a'))
    expect(count).toBe(2)
    expect(html).toBe(
      '<span class="nf-search-match">a</span> <strong>b <span class="nf-search-match">a</span></strong> <a href="a">x</a>',
    )
  })

  it('marks the active match by its running number', () => {
    const { html } = highlightHtml('aa a', re('a'), 5, 6)
    expect(html.match(/nf-search-match-active/g)).toHaveLength(1)
    expect(html.indexOf('nf-search-match-active')).toBeLessThan(html.lastIndexOf('nf-search-match"'))
  })

  it('decodes and re-encodes entities', () => {
    const { html, count } = highlightHtml('Tom &amp; Jerry &lt;3&nbsp;&nbsp;x', re('&'))
    expect(count).toBe(1)
    expect(html).toBe('Tom <span class="nf-search-match">&amp;</span> Jerry &lt;3&nbsp;&nbsp;x')
    expect(highlightHtml('a &lt;b&gt;', re('<b>')).count).toBe(1)
  })

  it('returns the input untouched without a query or a match', () => {
    expect(highlightHtml('x', null)).toEqual({ html: 'x', count: 0 })
    expect(highlightHtml('x &amp; y', re('z'))).toEqual({ html: 'x &amp; y', count: 0 })
  })

  it('honours case sensitivity', () => {
    expect(highlightHtml('Aa', re('a')).count).toBe(2)
    expect(highlightHtml('Aa', re('a', true)).count).toBe(1)
  })
})

describe('board search', () => {
  const board = parseKanbanMarkdown([
    '<!-- kanban done="Done" -->',
    '- Todo',
    '  - [ ] Write **todo** list 📅2026-01-01',
    '  - [ ] [Spec](noteflow://n1/s1) review',
    '- Done',
    '  - [x] todo done',
    '<!-- /kanban -->',
  ].join('\n'))!

  it('walks column titles then cards, column by column', () => {
    expect(kanbanSearchUnits(board).map((u) => [u.kind, u.col, u.idx])).toEqual([
      ['title', 0, -1], ['card', 0, 0], ['card', 0, 1], ['title', 1, -1], ['card', 1, 0],
    ])
  })

  it('counts matches in titles and rendered card text (not annotations or urls)', () => {
    expect(countKanbanMatches(board, re('todo'))).toBe(3)
    expect(countKanbanMatches(board, re('2026'))).toBe(0)
    expect(countKanbanMatches(board, re('spec'))).toBe(1)
    expect(countKanbanMatches(board, re('n1'))).toBe(0)
    expect(countKanbanMatches(board, null)).toBe(0)
  })

  it('count matches the highlighted spans', () => {
    const regex = re('o')
    let n = 0
    let spans = 0
    for (const u of kanbanSearchUnits(board)) {
      const { html, count } = highlightHtml(u.html, regex, n)
      n += count
      spans += (html.match(/nf-search-match/g) ?? []).length
    }
    expect(n).toBe(countKanbanMatches(board, regex))
    expect(spans).toBe(n)
  })
})
