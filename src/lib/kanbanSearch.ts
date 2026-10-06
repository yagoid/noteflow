// ── In-note search inside kanban boards ──────────────────────────────────────
//
// A board is an atom node: ProseMirror's text search (SearchHighlightExtension)
// can't see its text, so the plugin counts the board's matches with
// countKanbanMatches and the NodeView paints them with highlightHtml. Both walk
// the SAME units in the same order (column title, then its cards, column by
// column) through the same function, so the count and the highlighted spans
// can't drift apart. Matching is per text run between tags — like the editor's
// own search, which matches within single text nodes. Pure (no DOM).

import type { KanbanBoardData } from './kanban'
import { escapeHtml, inlineToHtml } from './markdownInline'

/** One searchable unit of a board, in display order. */
export interface KanbanSearchUnit {
  /** 'title' = column title, 'card' = card text. */
  kind: 'title' | 'card'
  col: number
  /** Card index (-1 for a column title). */
  idx: number
  html: string
}

export function columnTitleHtml(name: string): string {
  return escapeHtml(name)
}

export function cardTextHtml(md: string): string {
  return inlineToHtml(md)
}

export function kanbanSearchUnits(board: KanbanBoardData): KanbanSearchUnit[] {
  const units: KanbanSearchUnit[] = []
  board.columns.forEach((column, col) => {
    units.push({ kind: 'title', col, idx: -1, html: columnTitleHtml(column.name) })
    column.cards.forEach((card, idx) => units.push({ kind: 'card', col, idx, html: cardTextHtml(card.md) }))
  })
  return units
}

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|nbsp|apos);/gi, (m, e: string) => {
    const k = e.toLowerCase()
    if (k === 'amp') return '&'
    if (k === 'lt') return '<'
    if (k === 'gt') return '>'
    if (k === 'quot') return '"'
    if (k === 'apos') return "'"
    if (k === 'nbsp') return '\u00A0'
    if (k.startsWith('#x')) return String.fromCodePoint(parseInt(k.slice(2), 16))
    if (k.startsWith('#')) return String.fromCodePoint(parseInt(k.slice(1), 10))
    return m
  })
}

const encodeText = (s: string) => escapeHtml(s).replace(/\u00A0/g, '&nbsp;')

/**
 * Wrap every match of `regex` (global) in the text runs of `html` in a
 * `.nf-search-match` span; the match whose running number (starting at
 * `startIndex`) equals `activeIndex` also gets `.nf-search-match-active`.
 * Returns the new html and how many matches it found. With `regex` null the
 * html is returned untouched.
 */
export function highlightHtml(
  html: string,
  regex: RegExp | null,
  startIndex = 0,
  activeIndex = -1,
): { html: string; count: number } {
  if (!regex) return { html, count: 0 }
  let count = 0
  const parts = html.split(/(<[^>]*>)/)
  const out = parts.map((part, i) => {
    if (i % 2 === 1 || !part) return part // a tag (odd slots of the split) or empty
    const text = decodeEntities(part)
    let result = ''
    let last = 0
    regex.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = regex.exec(text)) !== null) {
      if (m[0].length === 0) { regex.lastIndex++; continue }
      const n = startIndex + count++
      const cls = n === activeIndex ? 'nf-search-match nf-search-match-active' : 'nf-search-match'
      result += `${encodeText(text.slice(last, m.index))}<span class="${cls}">${encodeText(m[0])}</span>`
      last = m.index + m[0].length
    }
    return last === 0 ? part : result + encodeText(text.slice(last))
  })
  return { html: count ? out.join('') : html, count }
}

/** Number of matches of `regex` in a board (titles + card texts). */
export function countKanbanMatches(board: KanbanBoardData, regex: RegExp | null): number {
  if (!regex) return 0
  return kanbanSearchUnits(board).reduce((n, u) => n + highlightHtml(u.html, regex).count, 0)
}
