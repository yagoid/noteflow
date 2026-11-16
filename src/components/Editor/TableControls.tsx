import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'
import { Lock, Plus } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'
import {
  HOVER_GUTTER, columnDropTarget, handleAnchor, columnHandleSpan, columnName, contains, gapPosition, hotLines, hoverZone,
  nearEdges, plusBars, rowDropTarget, rowHandleSpan, rowName, visibleBody, type Box, type DropTarget,
  type TableGeometry,
} from '../../lib/tableControls'
import {
  findTablePos, focusCell, getCellSelectionRect, getTableData, getTableInfo, runTableCommand, selectColumn, selectRow,
} from './tableOps'
import { measureTable, tableDomAt, tablePosOfDom } from './tableDom'
import { runTableAction, type TableMenuState } from './tableMenus'
import { TableMenu } from './TableMenu'
import {
  DRAG_THRESHOLD, EDGE_SCROLL_SPEED, EDGE_SCROLL_ZONE, edgeScrollVertical, swallowNextClick, verticalScroller,
} from './pointerDrag'

type LineKind = 'column' | 'row'

/** What the overlay draws, measured in client px (converted to overlay px when rendering). */
interface Layout {
  table: HTMLTableElement
  geo: TableGeometry
  /** The scroller's visible box (the overlay clips to it). */
  clip: Box
  /** How far right the "+" column bar may reach: the editor's right padding, cut at `clip`. */
  rightLimit: number
  /** Its offset inside the positioned container the overlay lives in. */
  offset: { x: number; y: number }
  /** The pointer is over this table (or its gutters): hot handles and "+" bars may show. */
  hovered: boolean
  hot: { row: number | null; col: number | null }
  near: { right: boolean; bottom: boolean }
  /** The whole column / row the selection covers (a CellSelection of that line). The accent line
   *  itself is decided at render: an open handle menu or a drag wins over it. */
  selCol: number | null
  selRow: number | null
}

interface Press {
  kind: LineKind
  index: number
  table: HTMLTableElement
  el: HTMLElement
  x: number
  y: number
  dragging: boolean
  /** The header row's handle moved past the threshold: it doesn't drag, and the release opens nothing. */
  blocked: boolean
}

interface Drag extends DropTarget {
  kind: LineKind
  from: number
  table: HTMLTableElement
  label: string
}

const sameLayout = (a: Layout | null, b: Layout | null) =>
  a === b || (!!a && !!b && a.table === b.table && JSON.stringify({ ...a, table: 0 }) === JSON.stringify({ ...b, table: 0 }))

/** Ghost label: long cell texts are cut. */
const shorten = (s: string) => (s.length > 34 ? `${s.slice(0, 33)}…` : s)

/** A "+" bar (lib/tableControls.ts plusBars): only in room that is the table's own; its icon fits its thickness. */
function PlusBar({ kind, box, origin, label, shown, onAdd, onWheel }: {
  kind: LineKind
  box: Box
  origin: { x: number; y: number }
  label: string
  shown: boolean
  onAdd: () => void
  onWheel: (e: React.WheelEvent) => void
}) {
  const width = box.right - box.left
  const height = box.bottom - box.top
  const icon = Math.max(6, Math.min(14, (kind === 'column' ? width : height) - 2))
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      title={label}
      className={`nf-table-plus nf-table-plus-${kind === 'column' ? 'col' : 'row'}${shown ? ' is-shown' : ''}`}
      style={{ left: box.left - origin.x, top: box.top - origin.y, width, height }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onAdd}
      onWheel={onWheel}
    >
      <Plus size={icon} aria-hidden />
    </button>
  )
}

const GripH = () => (
  <svg width="12" height="7" viewBox="0 0 12 7" fill="currentColor" aria-hidden>
    <circle cx="2" cy="1.6" r="1.1" /><circle cx="6" cy="1.6" r="1.1" /><circle cx="10" cy="1.6" r="1.1" />
    <circle cx="2" cy="5.4" r="1.1" /><circle cx="6" cy="5.4" r="1.1" /><circle cx="10" cy="5.4" r="1.1" />
  </svg>
)
const GripV = () => (
  <svg width="7" height="12" viewBox="0 0 7 12" fill="currentColor" aria-hidden>
    <circle cx="1.6" cy="2" r="1.1" /><circle cx="1.6" cy="6" r="1.1" /><circle cx="1.6" cy="10" r="1.1" />
    <circle cx="5.4" cy="2" r="1.1" /><circle cx="5.4" cy="6" r="1.1" /><circle cx="5.4" cy="10" r="1.1" />
  </svg>
)

/**
 * Controls drawn over the editor's tables (one layer for the whole editor, on
 * the table under the pointer — gutters included — or else the one holding the
 * selection): a handle on each column's top edge and each row's left edge
 * (the hovered cell's two show; click = select the line + its menu, drag =
 * reorder), and "+" bars on the right / bottom edge that append a column /
 * row. The document and its schema are untouched: no NodeView, no class on
 * ProseMirror's DOM (it would re-read it) — the drag's source dimming and the
 * header's no-drop stripes are overlay boxes too. Geometry and decisions:
 * src/lib/tableControls.ts. Mounted only for an editable editor.
 */
export function TableControls({ editor, scrollRef }: { editor: Editor; scrollRef: RefObject<HTMLDivElement | null> }) {
  const t = useT()
  const [layout, setLayout] = useState<Layout | null>(null)
  const [menu, setMenuState] = useState<TableMenuState | null>(null)
  const [drag, setDragState] = useState<Drag | null>(null)
  const menuRef = useRef(menu)
  const dragRef = useRef(drag)
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  const pressRef = useRef<Press | null>(null)
  const frameRef = useRef<number | null>(null)
  const loopRef = useRef<number | null>(null)
  const detachRef = useRef<(() => void) | null>(null)
  const ghostRef = useRef<HTMLDivElement>(null)

  const setDrag = useCallback((next: Drag | null) => {
    dragRef.current = next
    setDragState(next)
  }, [])

  // ── Layout ────────────────────────────────────────────────────────────────

  const compute = useCallback((): Layout | null => {
    const scroller = scrollRef.current
    const container = scroller?.parentElement
    if (!scroller || !container || editor.isDestroyed || !editor.isEditable) return null
    const view = editor.view
    const sr = scroller.getBoundingClientRect()
    const cr = container.getBoundingClientRect()
    const clip: Box = {
      left: sr.left + scroller.clientLeft,
      top: sr.top + scroller.clientTop,
      right: sr.left + scroller.clientLeft + scroller.clientWidth,
      bottom: sr.top + scroller.clientTop + scroller.clientHeight,
    }
    const p = pointerRef.current

    // The table under the pointer (gutters included), innermost last.
    let hovered: HTMLTableElement | null = null
    let hoveredGeo: TableGeometry | null = null
    if (p && contains(clip, p.x, p.y)) {
      for (const el of Array.from(view.dom.querySelectorAll('table'))) {
        const r = el.getBoundingClientRect()
        const near = p.x >= r.left - HOVER_GUTTER.left && p.x <= r.right + HOVER_GUTTER.right
          && p.y >= r.top - HOVER_GUTTER.top && p.y <= r.bottom + HOVER_GUTTER.bottom
        if (!near) continue
        const g = measureTable(el)
        if (g && contains(hoverZone(g), p.x, p.y)) { hovered = el; hoveredGeo = g }
      }
    }

    // A drag or an open handle menu keeps its table; else the hovered one; else the selection's.
    const handleMenu = menuRef.current
    let table = dragRef.current?.table ?? handleMenu?.table ?? hovered
    if (!table) {
      const pos = findTablePos(editor.state)
      table = pos === null ? null : tableDomAt(view, pos)
    }
    if (!table) return null
    const tablePos = tablePosOfDom(view, table)
    if (tablePos === null || !getTableInfo(editor.state, { tablePos })) return null
    const geo = table === hovered && hoveredGeo ? hoveredGeo : measureTable(table)
    if (!geo) return null

    const isHovered = table === hovered && !!p
    const rect = getCellSelectionRect(editor.state, { tablePos })
    const h = geo.rows.length
    const w = geo.cols.length
    const selCol = rect && rect.right - rect.left === 1 && rect.top === 0 && rect.bottom === h ? rect.left : null
    const selRow = rect && rect.bottom - rect.top === 1 && rect.left === 0 && rect.right === w ? rect.top : null
    return {
      table,
      geo,
      clip,
      rightLimit: Math.min(clip.right, view.dom.getBoundingClientRect().right),
      offset: { x: clip.left - cr.left, y: clip.top - cr.top },
      hovered: isHovered,
      hot: isHovered ? hotLines(geo, p!.x, p!.y) : { row: null, col: null },
      near: isHovered ? nearEdges(geo, p!.x, p!.y) : { right: false, bottom: false },
      selCol,
      selRow,
    }
  }, [editor, scrollRef])

  const schedule = useCallback(() => {
    if (frameRef.current !== null) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      const next = compute()
      setLayout((prev) => (sameLayout(prev, next) ? prev : next))
    })
  }, [compute])

  // Re-measure on pointer moves, any scroll inside (the editor, a table's own
  // horizontal scroll: capture), size changes and every editor transaction.
  useEffect(() => {
    const scroller = scrollRef.current
    const container = scroller?.parentElement
    if (!scroller || !container) return
    const onMove = (e: PointerEvent) => { pointerRef.current = { x: e.clientX, y: e.clientY }; schedule() }
    const onLeave = () => {
      if (pressRef.current) return
      pointerRef.current = null
      schedule()
    }
    container.addEventListener('pointermove', onMove)
    container.addEventListener('pointerleave', onLeave)
    container.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    editor.on('transaction', schedule)
    const ro = new ResizeObserver(schedule)
    ro.observe(scroller)
    ro.observe(editor.view.dom)
    schedule()
    return () => {
      container.removeEventListener('pointermove', onMove)
      container.removeEventListener('pointerleave', onLeave)
      container.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      editor.off('transaction', schedule)
      ro.disconnect()
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [editor, scrollRef, schedule])

  /** Open / close the handle menu. The ref is what compute() reads (it picks the
   *  active table), so it changes now, not in a later effect, and a re-layout follows. */
  const setMenu = useCallback((next: TableMenuState | null) => {
    menuRef.current = next
    setMenuState(next)
    schedule()
  }, [schedule])

  useEffect(() => { schedule() }, [drag, schedule])

  // ── Selecting a line / its menu ─────────────────────────────────────────

  /** Select a whole column / row. Selection only — and without scrolling to it (a tall column's head cell may be far below the handle). */
  const selectLine = useCallback((kind: LineKind, index: number, table: HTMLTableElement) => {
    const tablePos = tablePosOfDom(editor.view, table)
    if (tablePos === null) return
    const cmd = kind === 'column' ? selectColumn(index, { tablePos }) : selectRow(index, { tablePos })
    runTableCommand(editor, (state, dispatch) =>
      cmd(state, dispatch && ((tr) => dispatch(state.tr.setSelection(tr.selection)))))
  }, [editor])

  const closeMenu = useCallback(() => setMenu(null), [setMenu])

  const toggleMenu = useCallback((press: Press) => {
    const key = `${press.kind}:${press.index}`
    const open = menuRef.current
    if (open && open.key === key && open.table === press.table) { setMenu(null); return }
    selectLine(press.kind, press.index, press.table)
    const geo = measureTable(press.table)
    setMenu({
      key,
      table: press.table,
      spec: { kind: press.kind, index: press.index },
      // The handle's computed grown rect, not its live DOM rect (which may be mid-grow).
      anchor: (geo && handleAnchor(geo, press.kind, press.index)) ?? press.el.getBoundingClientRect(),
      placement: press.kind === 'column' ? 'below' : 'right',
      owner: press.el,
    })
  }, [selectLine, setMenu])

  // ── Dragging a handle ───────────────────────────────────────────────────

  const positionGhost = useCallback(() => {
    const el = ghostRef.current
    const p = pointerRef.current
    if (el && p) el.style.transform = `translate(${p.x + 14}px, ${p.y + 12}px)`
  }, [])

  const endDrag = useCallback((commit: boolean) => {
    detachRef.current?.()
    detachRef.current = null
    pressRef.current = null
    if (loopRef.current !== null) cancelAnimationFrame(loopRef.current)
    loopRef.current = null
    document.body.classList.remove('nf-table-grabbing')
    const cur = dragRef.current
    if (!cur) return
    setDrag(null)
    // The click that follows the pointerup must not reach what's under it.
    swallowNextClick()
    if (!commit || cur.to === null) return
    // The line was selected when the drag began: the selection follows it to its new place.
    runTableAction(editor, cur.table, cur.kind === 'column'
      ? { type: 'moveColumn', from: cur.from, to: cur.to }
      : { type: 'moveRow', from: cur.from, to: cur.to })
  }, [editor, setDrag])

  const beginDrag = useCallback((press: Press) => {
    const tablePos = tablePosOfDom(editor.view, press.table)
    const data = tablePos === null ? null : getTableData(editor.state, { tablePos })
    if (!data) return false
    press.dragging = true
    setMenu(null)
    selectLine(press.kind, press.index, press.table)
    const m = t.editor.table
    const label = shorten(press.kind === 'column' ? columnName(data, press.index, m) : rowName(data, press.index, m))
    document.body.classList.add('nf-table-grabbing')
    setDrag({ kind: press.kind, from: press.index, table: press.table, label, gap: null, to: null, blocked: false })

    // Per frame: auto-scroll near the edges (the table horizontally — it is its
    // own scroll box —, the editor vertically), then hit-test again.
    const vScroller = verticalScroller(press.table)
    const loop = () => {
      const cur = dragRef.current
      const p = pointerRef.current
      if (!cur || !p) { loopRef.current = null; return }
      if (cur.kind === 'column') {
        const r = cur.table.getBoundingClientRect()
        if (p.x < r.left + EDGE_SCROLL_ZONE) cur.table.scrollLeft -= EDGE_SCROLL_SPEED
        else if (p.x > r.right - EDGE_SCROLL_ZONE) cur.table.scrollLeft += EDGE_SCROLL_SPEED
      }
      edgeScrollVertical(vScroller, p.y)
      const geo = measureTable(cur.table)
      if (geo) {
        const next = cur.kind === 'column' ? columnDropTarget(geo.cols, cur.from, p.x) : rowDropTarget(geo.rows, cur.from, p.y)
        if (next.gap !== cur.gap || next.to !== cur.to || next.blocked !== cur.blocked) setDrag({ ...cur, ...next })
      }
      loopRef.current = requestAnimationFrame(loop)
    }
    loopRef.current = requestAnimationFrame(loop)
    return true
  }, [editor, selectLine, setDrag, setMenu, t])

  const onHandlePointerDown = (e: React.PointerEvent<HTMLElement>, kind: LineKind, index: number) => {
    if (e.button !== 0 || !layout || pressRef.current) return
    const press: Press = {
      kind, index, table: layout.table, el: e.currentTarget, x: e.clientX, y: e.clientY, dragging: false, blocked: false,
    }
    pressRef.current = press
    pointerRef.current = { x: e.clientX, y: e.clientY }

    const onMove = (ev: PointerEvent) => {
      pointerRef.current = { x: ev.clientX, y: ev.clientY }
      if (!press.dragging) {
        if (press.blocked || Math.hypot(ev.clientX - press.x, ev.clientY - press.y) < DRAG_THRESHOLD) return
        // The header row is fixed: its handle only opens its menu.
        if (press.kind === 'row' && press.index === 0) { press.blocked = true; return }
        if (!beginDrag(press)) { press.blocked = true; return }
      }
      positionGhost()
    }
    const onUp = () => {
      if (press.dragging) { endDrag(true); return }
      detachRef.current?.()
      detachRef.current = null
      pressRef.current = null
      if (!press.blocked) toggleMenu(press)
    }
    const onCancel = () => endDrag(false)
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || !press.dragging) return
      ev.preventDefault()
      ev.stopPropagation()
      endDrag(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey, true)
    detachRef.current = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey, true)
    }
  }

  // Place the ghost as soon as it mounts (before the next pointermove).
  useLayoutEffect(() => { if (drag) positionGhost() }, [drag, positionGhost])

  // Unmount mid-drag (note switch, external update…): drop listeners and state.
  useEffect(() => () => {
    detachRef.current?.()
    if (loopRef.current !== null) cancelAnimationFrame(loopRef.current)
    document.body.classList.remove('nf-table-grabbing')
  }, [])

  // ── "+" bars ─────────────────────────────────────────────────────────────

  /** Append a column / row and put the cursor in its first cell (that is a selection: still one undo step). */
  const append = (kind: LineKind) => {
    if (!layout) return
    const table = layout.table
    const tablePos = tablePosOfDom(editor.view, table)
    const info = tablePos === null ? null : getTableInfo(editor.state, { tablePos })
    if (!info || tablePos === null) return
    const ok = runTableAction(editor, table, kind === 'column'
      ? { type: 'insertColumn', index: info.columns }
      : { type: 'insertRow', index: info.rows })
    if (ok) runTableCommand(editor, kind === 'column' ? focusCell(0, info.columns, { tablePos }) : focusCell(info.rows, 0, { tablePos }))
  }

  // Wheel over the overlay's buttons still scrolls the editor (they sit outside the scroller).
  const forwardWheel = (e: React.WheelEvent) => scrollRef.current?.scrollBy({ left: e.deltaX, top: e.deltaY })

  // ── Render ──────────────────────────────────────────────────────────────

  const menuEl = menu && <TableMenu key={menu.key} editor={editor} menu={menu} onClose={closeMenu} />
  if (!layout) return menuEl

  const { geo, clip, offset } = layout
  const ox = clip.left
  const oy = clip.top
  const vis = visibleBody(geo)
  const bars = plusBars(geo, layout.rightLimit)
  const m = t.editor.table
  const dragging = drag !== null && drag.table === layout.table
  // The accent line: the dragged one, else the one whose menu is open, else a whole line the
  // selection covers. Read from state here, so it follows a menu / drag in the same render.
  const lineMenu = menu && menu.table === layout.table && menu.spec.kind !== 'cell' ? menu.spec : null
  const active = dragging ? { kind: drag.kind, index: drag.from } : lineMenu
  const onCol = active ? (active.kind === 'column' ? active.index : null) : layout.selCol
  const onRow = active ? (active.kind === 'row' ? active.index : null) : layout.selRow
  const shownCol = (i: number) => (!dragging && layout.hot.col === i) || onCol === i
  const shownRow = (i: number) => (!dragging && layout.hot.row === i) || onRow === i

  let dropLine: React.CSSProperties | null = null
  let source: React.CSSProperties | null = null
  if (dragging) {
    if (drag.kind === 'column') {
      const c = geo.cols[drag.from]
      if (c) {
        const left = Math.max(c.start, geo.view.left)
        const right = Math.min(c.end, geo.view.right)
        if (right > left) source = { left: left - ox, top: vis.top - oy, width: right - left, height: vis.bottom - vis.top }
      }
      if (drag.gap !== null) {
        const x = gapPosition(geo.cols, drag.gap)
        if (x >= geo.view.left - 2 && x <= geo.view.right + 2) {
          dropLine = { left: x - 1.5 - ox, top: vis.top - 7 - oy, width: 3, height: vis.bottom - vis.top + 14 }
        }
      }
    } else {
      const r = geo.rows[drag.from]
      if (r) source = { left: vis.left - ox, top: r.start - oy, width: vis.right - vis.left, height: r.end - r.start }
      if (drag.gap !== null) {
        const y = gapPosition(geo.rows, drag.gap)
        dropLine = { left: vis.left - 7 - ox, top: y - 1.5 - oy, width: vis.right - vis.left + 14, height: 3 }
      }
    }
  }
  const header = geo.rows[0]

  return (
    <>
      <div
        className={`nf-table-controls${dragging ? ' is-dragging' : ''}`}
        style={{ left: offset.x, top: offset.y, width: clip.right - clip.left, height: clip.bottom - clip.top }}
      >
        {source && <div className="nf-table-drag-source" style={source} />}
        {dragging && drag.blocked && header && (
          <div className="nf-table-no-drop" style={{ left: vis.left - ox, top: header.start - oy, width: vis.right - vis.left, height: header.end - header.start }} />
        )}
        {geo.cols.map((_, i) => {
          const span = columnHandleSpan(geo, i)
          if (!span) return null
          const on = onCol === i
          return (
            <button
              key={`c${i}`}
              type="button"
              tabIndex={-1}
              data-col={i}
              aria-label={tf(m.columnHandle, { n: i + 1 })}
              className={`nf-table-handle nf-table-handle-col${shownCol(i) ? ' is-hot' : ''}${on ? ' is-on' : ''}`}
              style={{ left: span.start - ox, width: span.end - span.start, '--edge': `${vis.top - oy}px` } as React.CSSProperties}
              onPointerDown={(e) => onHandlePointerDown(e, 'column', i)}
              onMouseDown={(e) => e.preventDefault()}
              onWheel={forwardWheel}
            >
              <GripH />
            </button>
          )
        })}
        {geo.rows.map((_, i) => {
          const span = rowHandleSpan(geo, i)
          if (!span) return null
          const isHeader = i === 0
          const label = isHeader ? m.headerHandle : tf(m.rowHandle, { n: i })
          return (
            <button
              key={`r${i}`}
              type="button"
              tabIndex={-1}
              data-row={i}
              aria-label={label}
              className={`nf-table-handle nf-table-handle-row${isHeader ? ' is-header' : ''}${shownRow(i) ? ' is-hot' : ''}${onRow === i ? ' is-on' : ''}`}
              style={{ top: span.start - oy, height: span.end - span.start, '--edge': `${vis.left - ox}px` } as React.CSSProperties}
              onPointerDown={(e) => onHandlePointerDown(e, 'row', i)}
              onMouseDown={(e) => e.preventDefault()}
              onWheel={forwardWheel}
            >
              {isHeader ? <Lock size={9} strokeWidth={2.5} aria-hidden /> : <GripV />}
            </button>
          )
        })}
        {bars.column && (
          <PlusBar
            kind="column"
            box={bars.column}
            origin={{ x: ox, y: oy }}
            label={m.addColumn}
            shown={layout.near.right && !dragging}
            onAdd={() => append('column')}
            onWheel={forwardWheel}
          />
        )}
        {bars.row && (
          <PlusBar
            kind="row"
            box={bars.row}
            origin={{ x: ox, y: oy }}
            label={m.addRow}
            shown={layout.near.bottom && !dragging}
            onAdd={() => append('row')}
            onWheel={forwardWheel}
          />
        )}
        {dropLine && <div className="nf-table-drop-line" style={dropLine} />}
      </div>
      {drag && createPortal(
        <div ref={ghostRef} className={`nf-table-ghost${drag.blocked ? ' is-blocked' : ''}`} aria-hidden>
          <span className="nf-table-ghost-icon">{drag.kind === 'column' ? <GripH /> : <GripV />}</span>
          <span className="nf-table-ghost-label">{drag.label}</span>
          <span className="nf-table-ghost-note">{m.headerFixed}</span>
        </div>,
        document.body,
      )}
      {menuEl}
    </>
  )
}
