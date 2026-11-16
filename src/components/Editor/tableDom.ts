// DOM side of the table controls (TableControls.tsx, TableMenu.tsx,
// TableContextMenu.tsx, TableButton.tsx): which document position a rendered
// <table> is, and its measured geometry for src/lib/tableControls.ts.
//
// No div.tableWrapper (index.css § Tables): the <table> is the horizontal
// scroll box and its <tbody> holds every row, header included — rows and
// columns are measured on the cells and the <tbody>, not on the <table>.

import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import { boxOf, type TableGeometry } from '../../lib/tableControls'

const isTableNode = (node: PMNode) => (node.type.spec as { tableRole?: string }).tableRole === 'table'

/**
 * Position right before the table node rendered as `table` (the `tablePos` of
 * tableOps), or null if it's no longer in the editor. Resolved again for every
 * action: the document may have changed since the controls were drawn.
 */
export function tablePosOfDom(view: EditorView, table: HTMLTableElement): number | null {
  if (!table.isConnected || !view.dom.contains(table)) return null
  try {
    const $pos = view.state.doc.resolve(view.posAtDOM(table, 0))
    for (let d = $pos.depth; d > 0; d--) {
      if (isTableNode($pos.node(d)) && view.nodeDOM($pos.before(d)) === table) return $pos.before(d)
    }
    if ($pos.nodeAfter && isTableNode($pos.nodeAfter) && view.nodeDOM($pos.pos) === table) return $pos.pos
  } catch {
    // posAtDOM can throw on a node mid-update: fall back to a scan.
  }
  let found: number | null = null
  view.state.doc.descendants((node, pos) => {
    if (found !== null) return false
    if (isTableNode(node) && view.nodeDOM(pos) === table) found = pos
    return found === null
  })
  return found
}

/** The <table> element of the table node at `pos`. */
export function tableDomAt(view: EditorView, pos: number): HTMLTableElement | null {
  const dom = view.nodeDOM(pos)
  return dom instanceof HTMLTableElement ? dom : null
}

/** A table's geometry (client px): rows' box, scroll box, column and row extents. Null for an empty table. */
export function measureTable(table: HTMLTableElement): TableGeometry | null {
  const tbody = table.tBodies[0]
  if (!tbody) return null
  const rows = Array.from(tbody.rows)
  const head = rows[0] ? Array.from(rows[0].cells) : []
  if (!head.length) return null
  const view = boxOf(table.getBoundingClientRect())
  // The room below the table that is the table's own: its bottom margin (index.css
  // reserves one big enough for the "+" bar in the editable editor), never past the
  // next block's top (margins collapse, or a negative one could pull it up).
  const next = table.nextElementSibling
  const marginBottom = parseFloat(getComputedStyle(table).marginBottom) || 0
  const roomBottom = Math.min(view.bottom + marginBottom, next ? next.getBoundingClientRect().top : Infinity)
  return {
    body: boxOf(tbody.getBoundingClientRect()),
    view,
    roomBottom: Math.max(view.bottom, roomBottom),
    cols: head.map((c) => { const r = c.getBoundingClientRect(); return { start: r.left, end: r.right } }),
    rows: rows.map((tr) => { const r = tr.getBoundingClientRect(); return { start: r.top, end: r.bottom } }),
  }
}

/** Row (0 = header) and column of a rendered cell. */
export function cellIndexOf(cell: HTMLTableCellElement): { row: number; col: number } | null {
  const tr = cell.parentElement
  if (!(tr instanceof HTMLTableRowElement)) return null
  return { row: tr.sectionRowIndex, col: cell.cellIndex }
}
