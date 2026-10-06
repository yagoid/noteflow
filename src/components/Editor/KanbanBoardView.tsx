import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCheck, CircleCheck, Ellipsis, ListChecks, Pencil, Plus, SquareKanban, Trash2 } from 'lucide-react'
import type { KanbanBoardData } from '../../lib/kanban'
import {
  addCard,
  addColumn,
  applyCardText,
  countCards,
  deleteCard,
  deleteColumn,
  emptyCard,
  isDoneColumn,
  moveCard,
  moveColumn,
  normalizeBoard,
  renameColumn,
  setDoneColumn,
  toggleCard,
  updateCard,
  type CardRef,
} from '../../lib/kanbanOps'
import { cardTextHtml, columnTitleHtml, highlightHtml, kanbanSearchUnits } from '../../lib/kanbanSearch'
import { buildSearchRegex } from '../../lib/searchUtils'
import { getRootZoom } from '../../stores/themeStore'
import { useT } from '../../i18n/useT'
import { plural } from '../../i18n/format'
import type { KanbanSearchSpec } from './SearchHighlightExtension'
import { DEADLINE_POPOVER_SIZE, IMPORTANCE_POPOVER_SIZE, popoverPosition } from './taskBadge'
import { DeadlinePopover, ImportancePopover } from './TaskPickers'
import { convertBoardToTaskList } from './kanbanCommands'
import { CardView, InlineEditor, KanbanMenu, type MenuItem, type PickerKind } from './KanbanParts'

// React NodeView of the in-note kanban board (node: KanbanBoard.ts). Every edit
// is a pure transform from lib/kanbanOps.ts applied to the LIVE node (read from
// the editor state, never a stale render closure) and written back with
// updateAttributes → one undoable transaction that autosaves like any edit.
//
// Event ownership: the whole `.kanban-board` is `data-kanban-interactive`, so
// the node's stopEvent hands every event inside it to React and ProseMirror
// stays out (no node drag, no selection fights). Mousedown on non-field parts
// focuses the board root (tabIndex -1) instead: that commits an open inline
// editor via blur, keeps the caret from jumping, and lets Ctrl+Z/Ctrl+Y on the
// board drive the editor history.

type Editing =
  | { kind: 'card'; col: number; idx: number }
  | { kind: 'title'; col: number }
  | { kind: 'new-card'; col: number; seq: number }
  | { kind: 'new-column'; seq: number }

type MenuState =
  | { kind: 'column'; col: number; anchor: HTMLElement }
  | { kind: 'card'; ref: CardRef; anchor: HTMLElement }

interface PickerState {
  kind: PickerKind
  ref: CardRef
  trigger: HTMLElement
  pos: { top: number; left: number }
  id: number
}

interface Ghost {
  /** Pointer offset inside the dragged element (local px). */
  dx: number
  dy: number
  width: number
  fontSize: string
  fontFamily: string
}

type DragState =
  | { kind: 'card'; from: CardRef; over: CardRef | null; lineTop: number; ghost: Ghost }
  | { kind: 'column'; from: number; over: number | null; lineLeft: number; ghost: Ghost }

interface PendingDrag {
  kind: 'card' | 'column'
  card?: CardRef
  col?: number
  el: HTMLElement
  startX: number
  startY: number
}

const DRAG_THRESHOLD = 4
const EDGE_SCROLL_ZONE = 48
const EDGE_SCROLL_SPEED = 14
const CARD_GAP = 6
const COLUMN_GAP = 10

/** A field that owns its keys and caret (not a checkbox: Ctrl+Z there is the board's). */
function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement &&
    !!target.closest('textarea, select, input:not([type="checkbox"]):not([type="radio"])')
}

function sameRef(a: CardRef | null, b: CardRef | null): boolean {
  return a === b || (!!a && !!b && a.col === b.col && a.idx === b.idx)
}

/**
 * getBoundingClientRect() px per MouseEvent client px. Under the root CSS
 * `zoom` (UI text size) Chromium versions disagree on whether client coords are
 * zoomed: patterns.md documents them in local space for the Electron build,
 * while Chromium 141 reports them in the same space as rects. Measure it (the
 * root's rect is rect space, innerWidth is client space) instead of assuming.
 */
function clientToRectScale(): number {
  const w = document.documentElement.getBoundingClientRect().width
  return w > 0 && window.innerWidth > 0 ? w / window.innerWidth : 1
}

/** Nearest ancestor that scrolls vertically (the editor's scroller). */
function verticalScroller(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node
  }
  return null
}

// ── Board ────────────────────────────────────────────────────────────────────

export function KanbanBoardView({ node, editor, getPos, updateAttributes, deleteNode, selected, decorations }: NodeViewProps) {
  const t = useT()
  const board = useMemo(() => normalizeBoard(node.attrs.board), [node.attrs.board])
  const editable = editor.isEditable

  const rootRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const columnsRef = useRef<HTMLDivElement>(null)
  const ghostRef = useRef<HTMLDivElement>(null)

  const [editing, setEditing] = useState<Editing | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [picker, setPicker] = useState<PickerState | null>(null)
  const [armDelete, setArmDelete] = useState(false)
  const [drag, setDrag] = useState<DragState | null>(null)
  const seq = useRef(0)

  // ── Writing ────────────────────────────────────────────────────────────────

  /** Apply a transform to the live board (the node as it is in the editor state now). */
  const apply = useCallback((fn: (b: KanbanBoardData) => KanbanBoardData) => {
    const pos = getPos()
    if (typeof pos !== 'number') return
    const live = editor.state.doc.nodeAt(pos)
    if (!live || live.type !== node.type) return
    const current = normalizeBoard(live.attrs.board)
    const next = fn(current)
    if (next !== current) updateAttributes({ board: next })
  }, [editor, getPos, node.type, updateAttributes])

  const focusBoard = useCallback(() => rootRef.current?.focus({ preventScroll: true }), [])

  const selectBoard = useCallback(() => {
    const pos = getPos()
    if (typeof pos !== 'number') return
    editor.commands.setNodeSelection(pos)
    editor.view.focus()
  }, [editor, getPos])

  /** Close the inline editor; back to the board unless focus already went elsewhere. */
  const finishEditing = useCallback((via: 'enter' | 'blur' | 'cancel' = 'cancel') => {
    setEditing(null)
    if (via !== 'blur') focusBoard()
  }, [focusBoard])

  // ── Search highlight (decoration from SearchHighlightExtension) ────────────

  const searchHtml = useMemo(() => {
    let spec: KanbanSearchSpec | undefined
    for (const d of decorations) {
      const s = (d.spec as { kanbanSearch?: KanbanSearchSpec } | undefined)?.kanbanSearch
      if (s) { spec = s; break }
    }
    const regex = spec ? buildSearchRegex(spec.query, { caseSensitive: spec.caseSensitive }) : null
    if (!spec || !regex) return null
    const map = new Map<string, string>()
    let n = 0
    for (const unit of kanbanSearchUnits(board)) {
      const { html, count } = highlightHtml(unit.html, regex, n, spec.active)
      n += count
      if (count) map.set(unit.kind === 'title' ? `t${unit.col}` : `c${unit.col}:${unit.idx}`, html)
    }
    return map
  }, [decorations, board])

  // ── Drag & drop (pointer events; no HTML5 DnD — ProseMirror owns drop) ─────
  //
  // Coordinates: hit-testing runs in getBoundingClientRect() space. Pointer
  // client coords are converted into it with a factor MEASURED per drag
  // (clientToRectScale), and local CSS px (ghost transform, indicator offsets)
  // are rect values divided by the root zoom — see "UI text size" in
  // patterns.md.

  const pendingRef = useRef<PendingDrag | null>(null)
  const dragRef = useRef<DragState | null>(null)
  /** Last pointer position, in rect space. */
  const pointerRef = useRef({ x: 0, y: 0 })
  const scaleRef = useRef(1)
  const frameRef = useRef<number | null>(null)
  const vScrollerRef = useRef<HTMLElement | null>(null)
  const listenersRef = useRef<(() => void) | null>(null)

  const setDragState = useCallback((next: DragState | null) => {
    dragRef.current = next
    setDrag(next)
  }, [])

  /** Where a card dropped at (x, y) (rect space) would go; null = nowhere new. */
  const hitCard = useCallback((x: number, y: number, from: CardRef): { over: CardRef | null; lineTop: number } => {
    const root = columnsRef.current
    if (!root) return { over: null, lineTop: 0 }
    const z = getRootZoom()
    const cols = Array.from(root.querySelectorAll<HTMLElement>('[data-kanban-col]'))
    let best: HTMLElement | null = null
    let bestDist = Infinity
    for (const el of cols) {
      const r = el.getBoundingClientRect()
      const d = x < r.left ? r.left - x : x > r.right ? x - r.right : 0
      if (d < bestDist) { bestDist = d; best = el }
    }
    const list = best?.querySelector<HTMLElement>('[data-kanban-cards]')
    if (!best || !list) return { over: null, lineTop: 0 }
    const col = Number(best.dataset.kanbanCol)
    const listTop = list.getBoundingClientRect().top
    const cards = Array.from(list.querySelectorAll<HTMLElement>(':scope > [data-kanban-card]'))
    let slot = cards.length
    let lineTop = 0
    let lastBottom: number | null = null
    for (const el of cards) {
      const idx = Number(el.dataset.kanbanCard)
      if (col === from.col && idx === from.idx) continue
      const r = el.getBoundingClientRect()
      if (y < (r.top + r.bottom) / 2) { slot = idx; lineTop = (r.top - listTop) / z - CARD_GAP / 2; break }
      lastBottom = r.bottom
    }
    if (slot === cards.length) lineTop = lastBottom === null ? 0 : (lastBottom - listTop) / z + CARD_GAP / 2
    // Dropping a card right where it already is: no indicator, no-op.
    if (col === from.col && (slot === from.idx || slot === from.idx + 1)) return { over: null, lineTop }
    return { over: { col, idx: slot }, lineTop }
  }, [])

  const hitColumn = useCallback((x: number, from: number): { over: number | null; lineLeft: number } => {
    const root = columnsRef.current
    if (!root) return { over: null, lineLeft: 0 }
    const z = getRootZoom()
    const rootLeft = root.getBoundingClientRect().left
    const cols = Array.from(root.querySelectorAll<HTMLElement>('[data-kanban-col]'))
    let slot = cols.length
    let lineLeft = 0
    let lastRight: number | null = null
    for (const el of cols) {
      const i = Number(el.dataset.kanbanCol)
      const r = el.getBoundingClientRect()
      if (i === from) { lastRight = r.right; continue }
      if (x < r.left + r.width / 2) { slot = i; lineLeft = (r.left - rootLeft) / z - COLUMN_GAP / 2; break }
      lastRight = r.right
    }
    if (slot === cols.length) lineLeft = ((lastRight ?? rootLeft) - rootLeft) / z + COLUMN_GAP / 2
    if (slot === from || slot === from + 1) return { over: null, lineLeft }
    return { over: slot, lineLeft }
  }, [])

  const updateTarget = useCallback(() => {
    const cur = dragRef.current
    if (!cur) return
    const { x, y } = pointerRef.current
    if (cur.kind === 'card') {
      const hit = hitCard(x, y, cur.from)
      if (!sameRef(hit.over, cur.over) || (hit.over && hit.lineTop !== cur.lineTop)) {
        setDragState({ ...cur, over: hit.over, lineTop: hit.lineTop })
      }
    } else {
      const hit = hitColumn(x, cur.from)
      if (hit.over !== cur.over || (hit.over !== null && hit.lineLeft !== cur.lineLeft)) {
        setDragState({ ...cur, over: hit.over, lineLeft: hit.lineLeft })
      }
    }
  }, [hitCard, hitColumn, setDragState])

  const positionGhost = useCallback(() => {
    const cur = dragRef.current
    const el = ghostRef.current
    if (!cur || !el) return
    // The ghost is `position: fixed` → local CSS px = rect px / root zoom.
    const z = getRootZoom()
    el.style.transform = `translate(${pointerRef.current.x / z - cur.ghost.dx}px, ${pointerRef.current.y / z - cur.ghost.dy}px)`
  }, [])

  // Per-frame loop while dragging: auto-scroll near the edges (board
  // horizontally, editor vertically), then re-hit-test (content moved).
  const startLoop = useCallback(() => {
    const loop = () => {
      if (!dragRef.current) { frameRef.current = null; return }
      const z = getRootZoom()
      const zone = EDGE_SCROLL_ZONE * z
      const { x, y } = pointerRef.current
      const sc = scrollRef.current
      if (sc) {
        const r = sc.getBoundingClientRect()
        if (x < r.left + zone) sc.scrollLeft -= EDGE_SCROLL_SPEED
        else if (x > r.right - zone) sc.scrollLeft += EDGE_SCROLL_SPEED
      }
      const vs = vScrollerRef.current
      if (vs) {
        const r = vs.getBoundingClientRect()
        if (y < r.top + zone) vs.scrollTop -= EDGE_SCROLL_SPEED
        else if (y > r.bottom - zone) vs.scrollTop += EDGE_SCROLL_SPEED
      }
      updateTarget()
      frameRef.current = requestAnimationFrame(loop)
    }
    frameRef.current = requestAnimationFrame(loop)
  }, [updateTarget])

  const endDrag = useCallback((commit: boolean) => {
    const cur = dragRef.current
    listenersRef.current?.()
    listenersRef.current = null
    pendingRef.current = null
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    document.body.classList.remove('kanban-dragging')
    if (!cur) return
    setDragState(null)
    // The click that follows the pointerup must not open a card editor.
    const swallow = (e: MouseEvent) => { e.stopPropagation(); e.preventDefault() }
    window.addEventListener('click', swallow, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
    if (!commit) return
    if (cur.kind === 'card' && cur.over) {
      const to = cur.over
      apply((b) => moveCard(b, cur.from, to))
    } else if (cur.kind === 'column' && cur.over !== null) {
      const to = cur.over
      apply((b) => moveColumn(b, cur.from, to))
    }
  }, [apply, setDragState])

  const beginDrag = useCallback((p: PendingDrag) => {
    const z = getRootZoom()
    const r = p.el.getBoundingClientRect()
    const style = getComputedStyle(p.el)
    const ghost: Ghost = {
      dx: (p.startX - r.left) / z,
      dy: (p.startY - r.top) / z,
      width: r.width / z,
      fontSize: style.getPropertyValue('--prose-font-size') || style.fontSize,
      fontFamily: style.getPropertyValue('--prose-font-family') || style.fontFamily,
    }
    vScrollerRef.current = verticalScroller(rootRef.current)
    document.body.classList.add('kanban-dragging')
    setMenu(null)
    setPicker(null)
    if (p.kind === 'card' && p.card) {
      setDragState({ kind: 'card', from: p.card, over: null, lineTop: 0, ghost })
    } else if (p.col !== undefined) {
      setDragState({ kind: 'column', from: p.col, over: null, lineLeft: 0, ghost })
    }
    startLoop()
  }, [setDragState, startLoop])

  const startPointer = useCallback((e: React.PointerEvent<HTMLElement>, pending: Omit<PendingDrag, 'startX' | 'startY'>) => {
    if (!editable || e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('button, input, textarea, a, label, span[data-type="section-relation"]')) return
    listenersRef.current?.()
    scaleRef.current = clientToRectScale()
    const k = scaleRef.current
    pendingRef.current = { ...pending, startX: e.clientX * k, startY: e.clientY * k }
    pointerRef.current = { x: e.clientX * k, y: e.clientY * k }

    const onMove = (ev: PointerEvent) => {
      pointerRef.current = { x: ev.clientX * k, y: ev.clientY * k }
      const p = pendingRef.current
      if (p && !dragRef.current) {
        const { x, y } = pointerRef.current
        if (Math.hypot(x - p.startX, y - p.startY) < DRAG_THRESHOLD * k) return
        beginDrag(p)
      }
      positionGhost()
    }
    const onUp = () => endDrag(true)
    const onCancel = () => endDrag(false)
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || !dragRef.current) return
      ev.preventDefault()
      ev.stopPropagation()
      endDrag(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey, true)
    listenersRef.current = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [editable, beginDrag, positionGhost, endDrag])

  // Place the ghost as soon as it mounts (before the next pointermove).
  useLayoutEffect(() => { if (drag) positionGhost() }, [drag, positionGhost])

  // Unmount mid-drag (note switch, external update…): drop listeners and state.
  useEffect(() => () => {
    listenersRef.current?.()
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    document.body.classList.remove('kanban-dragging')
  }, [])

  // ── Board-level handlers ───────────────────────────────────────────────────

  const onRootMouseDown = (e: React.MouseEvent) => {
    if (isTextField(e.target)) return
    // Keep ProseMirror's caret where it is and don't start a text selection;
    // move focus to the board itself (commits an inline editor on blur).
    e.preventDefault()
    focusBoard()
  }

  const onRootKeyDown = (e: React.KeyboardEvent) => {
    if (isTextField(e.target)) return
    const mod = e.ctrlKey || e.metaKey
    const key = e.key.toLowerCase()
    if (mod && key === 'z') {
      e.preventDefault()
      if (e.shiftKey) editor.commands.redo()
      else editor.commands.undo()
    } else if (mod && key === 'y') {
      e.preventDefault()
      editor.commands.redo()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      selectBoard()
    }
  }

  const openPicker = (kind: PickerState['kind'], ref: CardRef, trigger: HTMLElement) => {
    const size = kind === 'deadline' ? DEADLINE_POPOVER_SIZE : IMPORTANCE_POPOVER_SIZE
    setMenu(null)
    setPicker({ kind, ref, trigger, pos: popoverPosition(trigger, size), id: ++seq.current })
  }
  // A picker/menu that applied something hands focus back to the board (so
  // Ctrl+Z works right away); a dismissed one leaves focus where the click put it.
  const dismissPicker = useCallback(() => setPicker(null), [])
  const closePicker = useCallback(() => { setPicker(null); focusBoard() }, [focusBoard])
  const closeMenu = useCallback((reason: 'select' | 'dismiss') => {
    setMenu(null)
    if (reason === 'select') focusBoard()
  }, [focusBoard])

  // Disarm the two-step "delete board" after a moment.
  useEffect(() => {
    if (!armDelete) return
    const id = setTimeout(() => setArmDelete(false), 2500)
    return () => clearTimeout(id)
  }, [armDelete])

  const totalCards = countCards(board)
  const pickerCard = picker ? board.columns[picker.ref.col]?.cards[picker.ref.idx] : undefined

  const menuItems: MenuItem[] = []
  if (menu?.kind === 'column') {
    const col = menu.col
    const cards = board.columns[col]?.cards.length ?? 0
    const done = isDoneColumn(board, col)
    menuItems.push(
      { key: 'rename', label: t.editor.kanban.rename, icon: <Pencil size={13} />, onSelect: () => setEditing({ kind: 'title', col }) },
      {
        key: 'done',
        label: done ? t.editor.kanban.unmarkDone : t.editor.kanban.markDone,
        icon: <CheckCheck size={13} />,
        onSelect: () => apply((b) => setDoneColumn(b, done ? null : col)),
      },
      {
        key: 'delete',
        label: t.editor.kanban.deleteColumn,
        icon: <Trash2 size={13} />,
        danger: true,
        confirm: cards > 0 ? plural(t.editor.kanban.confirmDeleteColumn, cards) : undefined,
        onSelect: () => apply((b) => deleteColumn(b, col)),
      },
    )
  } else if (menu?.kind === 'card') {
    const ref = menu.ref
    menuItems.push(
      { key: 'edit', label: t.editor.kanban.editCard, icon: <Pencil size={13} />, onSelect: () => setEditing({ kind: 'card', ...ref }) },
      { key: 'delete', label: t.editor.kanban.deleteCard, icon: <Trash2 size={13} />, danger: true, onSelect: () => apply((b) => deleteCard(b, ref)) },
    )
  }

  const ghostCard = drag?.kind === 'card' ? board.columns[drag.from.col]?.cards[drag.from.idx] : undefined
  const ghostColumn = drag?.kind === 'column' ? board.columns[drag.from] : undefined

  return (
    <NodeViewWrapper className={`kanban-node${selected ? ' is-selected' : ''}`}>
      <div
        ref={rootRef}
        className="kanban-board"
        data-kanban-interactive=""
        tabIndex={-1}
        onMouseDown={onRootMouseDown}
        onKeyDown={onRootKeyDown}
      >
        <div className="kanban-header">
          <button
            type="button"
            className="kanban-handle"
            title={t.editor.kanban.selectBoard}
            onClick={selectBoard}
          >
            <SquareKanban size={13} />
            <span className="kanban-handle-label">{t.editor.kanban.label}</span>
            <span className="kanban-handle-stats">
              {plural(t.editor.kanban.columnsCount, board.columns.length)} · {plural(t.editor.kanban.cardsCount, totalCards)}
            </span>
          </button>
          {editable && (
            <div className="kanban-toolbar">
              <button
                type="button"
                className="kanban-icon-btn"
                title={t.editor.kanban.convertToTaskList}
                onClick={() => {
                  const pos = getPos()
                  if (typeof pos === 'number') convertBoardToTaskList(editor, pos, normalizeBoard(editor.state.doc.nodeAt(pos)?.attrs.board))
                }}
              >
                <ListChecks size={13} />
              </button>
              <button
                type="button"
                className={`kanban-icon-btn is-danger${armDelete ? ' is-armed' : ''}`}
                title={armDelete ? t.editor.kanban.confirmDeleteBoard : t.editor.kanban.deleteBoard}
                onClick={() => {
                  if (totalCards > 0 && !armDelete) { setArmDelete(true); return }
                  deleteNode()
                }}
              >
                <Trash2 size={13} />
                {armDelete && <span>{t.editor.kanban.confirmDeleteBoard}</span>}
              </button>
            </div>
          )}
        </div>

        <div ref={scrollRef} className="kanban-scroll">
          <div ref={columnsRef} className="kanban-columns">
            {board.columns.map((column, col) => {
              const done = isDoneColumn(board, col)
              const titleEditing = editing?.kind === 'title' && editing.col === col
              const composing = editing?.kind === 'new-card' && editing.col === col ? editing : null
              const isColumnSource = drag?.kind === 'column' && drag.from === col
              return (
                <div
                  key={col}
                  className={`kanban-column${done ? ' is-done' : ''}${isColumnSource ? ' is-drag-source' : ''}`}
                  data-kanban-col={col}
                >
                  <div
                    className="kanban-column-header"
                    title={editable ? t.editor.kanban.dragColumn : undefined}
                    onPointerDown={(e) => startPointer(e, { kind: 'column', col, el: e.currentTarget.parentElement as HTMLElement })}
                  >
                    {done
                      ? <CircleCheck size={12} className="kanban-column-marker is-done" aria-label={t.editor.kanban.doneColumn} />
                      : <span className="kanban-column-marker" />}
                    {titleEditing ? (
                      <InlineEditor
                        initial={column.name}
                        selectAll
                        placeholder={t.editor.kanban.columnPlaceholder}
                        className="kanban-input kanban-title-input"
                        onSubmit={(v, via) => { apply((b) => renameColumn(b, col, v)); finishEditing(via) }}
                        onCancel={() => finishEditing()}
                      />
                    ) : (
                      <span
                        className={`kanban-column-title${column.name ? '' : ' is-empty'}`}
                        title={done ? t.editor.kanban.doneColumn : undefined}
                        onClick={() => { if (editable && !dragRef.current) setEditing({ kind: 'title', col }) }}
                        dangerouslySetInnerHTML={{
                          __html: searchHtml?.get(`t${col}`) ?? (column.name ? columnTitleHtml(column.name) : columnTitleHtml(t.editor.kanban.untitledColumn)),
                        }}
                      />
                    )}
                    <span className="kanban-count">{column.cards.length}</span>
                    {editable && (
                      <button
                        type="button"
                        className="kanban-icon-btn kanban-column-menu-btn"
                        title={t.editor.kanban.columnOptions}
                        onClick={(e) => { setPicker(null); setMenu({ kind: 'column', col, anchor: e.currentTarget }) }}
                      >
                        <Ellipsis size={13} />
                      </button>
                    )}
                  </div>

                  <div className="kanban-cards" data-kanban-cards="">
                    {column.cards.map((card, idx) => {
                      const ref = { col, idx }
                      return (
                        <CardView
                          key={idx}
                          card={card}
                          cardRef={ref}
                          html={searchHtml?.get(`c${col}:${idx}`) ?? cardTextHtml(card.md)}
                          editable={editable}
                          editing={editing?.kind === 'card' && editing.col === col && editing.idx === idx}
                          isDragSource={drag?.kind === 'card' && drag.from.col === col && drag.from.idx === idx}
                          onToggle={() => apply((b) => toggleCard(b, ref))}
                          onStartEdit={() => { if (!dragRef.current) setEditing({ kind: 'card', col, idx }) }}
                          onSubmitText={(v, via) => { apply((b) => updateCard(b, ref, applyCardText(b.columns[col]?.cards[idx] ?? card, v))); finishEditing(via) }}
                          onCancelEdit={() => finishEditing()}
                          onOpenPicker={(kind, trigger) => openPicker(kind, ref, trigger)}
                          onOpenMenu={(anchor) => { setPicker(null); setMenu({ kind: 'card', ref, anchor }) }}
                          onPointerDown={(e) => startPointer(e, { kind: 'card', card: ref, el: e.currentTarget })}
                        />
                      )
                    })}
                    {drag?.kind === 'card' && drag.over?.col === col && (
                      <div className="kanban-drop-line" style={{ top: drag.lineTop }} />
                    )}
                  </div>

                  {editable && (composing ? (
                    <InlineEditor
                      key={composing.seq}
                      initial=""
                      placeholder={t.editor.kanban.cardPlaceholder}
                      className="kanban-input kanban-composer"
                      onSubmit={(v, via) => {
                        if (v.trim()) apply((b) => addCard(b, col, applyCardText(emptyCard(), v)))
                        // Enter on a non-empty card keeps composing (a fresh field
                        // for the next one); blur or an empty Enter closes it.
                        if (via === 'enter' && v.trim()) setEditing({ kind: 'new-card', col, seq: ++seq.current })
                        else if (via === 'blur') setEditing((cur) => (cur === composing ? null : cur))
                        else finishEditing(via)
                      }}
                      onCancel={() => finishEditing()}
                    />
                  ) : (
                    <button
                      type="button"
                      className="kanban-add-card"
                      onClick={() => setEditing({ kind: 'new-card', col, seq: ++seq.current })}
                    >
                      <Plus size={12} /> {t.editor.kanban.addCard}
                    </button>
                  ))}
                </div>
              )
            })}

            {editable && (
              <div className="kanban-add-column">
                {editing?.kind === 'new-column' ? (
                  <InlineEditor
                    key={editing.seq}
                    initial=""
                    placeholder={t.editor.kanban.columnPlaceholder}
                    className="kanban-input kanban-title-input"
                    onSubmit={(v, via) => {
                      if (v.trim()) apply((b) => addColumn(b, v))
                      finishEditing(via)
                    }}
                    onCancel={() => finishEditing()}
                  />
                ) : (
                  <button
                    type="button"
                    className="kanban-add-column-btn"
                    onClick={() => setEditing({ kind: 'new-column', seq: ++seq.current })}
                  >
                    <Plus size={12} /> {t.editor.kanban.addColumn}
                  </button>
                )}
              </div>
            )}

            {drag?.kind === 'column' && drag.over !== null && (
              <div className="kanban-column-drop-line" style={{ left: drag.lineLeft }} />
            )}
          </div>
        </div>
      </div>

      {menu && <KanbanMenu anchor={menu.anchor} items={menuItems} onClose={closeMenu} />}

      {picker?.kind === 'deadline' && pickerCard && (
        <DeadlinePopover
          key={picker.id}
          pos={picker.pos}
          trigger={picker.trigger}
          due={pickerCard.due}
          alarm={pickerCard.alarm}
          onCommit={(due, alarm) => { apply((b) => updateCard(b, picker.ref, { due, alarm })); closePicker() }}
          onClear={() => { apply((b) => updateCard(b, picker.ref, { due: null, alarm: null })); closePicker() }}
          onClose={dismissPicker}
        />
      )}
      {picker?.kind === 'importance' && pickerCard && (
        <ImportancePopover
          pos={picker.pos}
          trigger={picker.trigger}
          importance={pickerCard.importance}
          onSelect={(importance) => { apply((b) => updateCard(b, picker.ref, { importance })); closePicker() }}
          onClose={dismissPicker}
        />
      )}

      {drag && createPortal(
        <div
          ref={ghostRef}
          className={`kanban-ghost prose-editor ${drag.kind === 'card' ? 'is-card' : 'is-column'}`}
          style={{
            width: drag.ghost.width,
            '--prose-font-size': drag.ghost.fontSize,
            '--prose-font-family': drag.ghost.fontFamily,
          } as React.CSSProperties}
        >
          <div className="ProseMirror">
            {ghostCard && drag.kind === 'card' && (
              <CardView
                card={ghostCard}
                cardRef={drag.from}
                html={cardTextHtml(ghostCard.md)}
                editable={false}
                editing={false}
                ghost
              />
            )}
            {ghostColumn && (
              <div className="kanban-column is-ghost">
                <div className="kanban-column-header">
                  <span className="kanban-column-marker" />
                  <span className="kanban-column-title">{ghostColumn.name || t.editor.kanban.untitledColumn}</span>
                  <span className="kanban-count">{ghostColumn.cards.length}</span>
                </div>
                {ghostColumn.cards.slice(0, 3).map((card, idx) => (
                  <CardView
                    key={idx}
                    card={card}
                    cardRef={{ col: drag.kind === 'column' ? drag.from : 0, idx }}
                    html={cardTextHtml(card.md)}
                    editable={false}
                    editing={false}
                    ghost
                  />
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </NodeViewWrapper>
  )
}
