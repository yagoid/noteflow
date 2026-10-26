import { memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Ref, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Folder, Lock, Search, Timer } from 'lucide-react'
import { useNotesStore } from '../../stores/notesStore'
import { colorChannels } from '../../lib/tagColors'
import { parseSearchQuery } from '../../lib/searchUtils'
import {
  filterGroupPeekEntries,
  flattenGroupPeekEntries,
  groupPeekPosition,
  moveGroupPeekSelection,
} from '../../lib/groupPeek'
import { SectionTabsRow } from './SectionTabsRow'
import { formatExpiry, formatNoteDate, renderHighlightedText } from './rowText'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'
import type { SidebarItem } from './useSidebarGroups'
import type { TagColorMap } from '../../lib/tagColors'
import type { GroupColor, Note } from '../../types'

/** Hover time on a collapsed group's header before the peek opens (≈ the section preview's). */
const OPEN_DELAY = 400
/** Grace period to cross the gap between header and peek before it closes. */
const CLOSE_DELAY = 250
const PEEK_WIDTH = 248
/** List height cap ≈ five notes with their section chips; it scrolls past that. */
const LIST_MAX_HEIGHT = 212
/** First-paint height guess, before the panel is measured (it's hidden until then). */
const ESTIMATED_HEIGHT = 280

/** Why the peek closed — decides where focus goes afterwards. */
type CloseReason =
  | 'leave'     // pointer left header + peek (not anchored)
  | 'escape'    // Escape in the search box
  | 'outside'   // pointer down outside the peek
  | 'navigate'  // a note / section was opened (from the peek or anywhere)
  | 'dismiss'   // sidebar scroll, window blur / resize, drag start

/** Imperative API the group headers drive (through stable handlers in Sidebar). */
export interface GroupPeekController {
  /** Pointer entered (or moves over) the header of a group. */
  headerHover: (groupId: string, el: HTMLElement) => void
  /** Pointer left the header. */
  headerLeave: () => void
}

/** The sidebar's own row behaviour (Sidebar.tsx `rowHandlers`), reused so clicks mean the same. */
export interface GroupPeekHandlers {
  click: (e: React.MouseEvent | React.KeyboardEvent, note: Note) => void
  sectionClick: (e: React.MouseEvent, note: Note, sectionId: string) => void
}

interface GroupPeekProps {
  controllerRef: Ref<GroupPeekController>
  /** The sidebar's derived list (already filtered by search / tag / archived). */
  items: SidebarItem[]
  collapsedGroupIds: Set<string>
  /** Something else owns the sidebar right now (drag, context menu, modal, inline rename…). */
  blocked: boolean
  /** Highlighted note — `noteViewId ?? activeNoteId`, as in the sidebar. */
  activeNoteId: string | null
  sectionTagColors: TagColorMap
  handlers: GroupPeekHandlers
  /** Root of the Sidebar: the peek docks to its right edge. */
  sidebarRef: RefObject<HTMLElement | null>
}

interface OpenPeek {
  groupId: string
  anchorTop: number
  sidebarRight: number
}

type GroupItem = Extract<SidebarItem, { kind: 'group' }>

function findGroupItem(items: SidebarItem[], groupId: string): GroupItem | null {
  for (const item of items) if (item.kind === 'group' && item.group.id === groupId) return item
  return null
}

/**
 * Peek of a collapsed group: hovering its header pops, to the right of the sidebar,
 * a small window listing the group's notes (folders flattened) with a search box
 * that takes focus. The open/close state lives here, not in Sidebar, so pointer
 * moves never re-render the list. Portaled to <body>: the floating sidebar's panel
 * can be transformed (it would become the containing block of a `fixed` child);
 * React events still bubble through the React tree, so the floating panel counts
 * hover/focus in the peek as its own and stays open meanwhile.
 */
export function GroupPeek({
  controllerRef,
  items,
  collapsedGroupIds,
  blocked,
  activeNoteId,
  sectionTagColors,
  handlers,
  sidebarRef,
}: GroupPeekProps) {
  const [open, setOpen] = useState<OpenPeek | null>(null)

  const openRef = useRef<OpenPeek | null>(null)
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Header currently under the pointer. */
  const hoverRef = useRef<{ groupId: string; el: HTMLElement } | null>(null)
  /** Header that must not reopen the peek until the pointer leaves it (after a close / click). */
  const suppressRef = useRef<string | null>(null)
  /** The user typed (or navigated with the arrows) in the search box: only an explicit close ends it. */
  const anchoredRef = useRef(false)
  /** Element that had focus before the peek took it — given back on close. */
  const prevFocusRef = useRef<HTMLElement | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const liveRef = useRef({ items, collapsedGroupIds, blocked, sidebarRef })

  useLayoutEffect(() => {
    liveRef.current = { items, collapsedGroupIds, blocked, sidebarRef }
    openRef.current = open
  })

  const engine = useMemo(() => {
    const clearOpenTimer = () => {
      if (openTimerRef.current) clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }
    const clearCloseTimer = () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }

    const restoreFocus = (prev: HTMLElement | null) => {
      if (prev?.isConnected) prev.focus({ preventScroll: true })
    }

    const close = (reason: CloseReason) => {
      clearCloseTimer()
      if (!openRef.current) return
      // Pointer still on a header (Escape, window blur…): don't re-pop until it leaves.
      // A 'leave' close keeps a pending open of the header now hovered (moving the
      // pointer from one collapsed group to the next switches the peek).
      if (reason !== 'leave') {
        clearOpenTimer()
        if (hoverRef.current) suppressRef.current = hoverRef.current.groupId
      }
      const panel = panelRef.current
      const active = document.activeElement
      const hadFocus = !!panel && active instanceof HTMLElement && panel.contains(active)
      const prev = prevFocusRef.current
      prevFocusRef.current = null
      openRef.current = null
      anchoredRef.current = false
      setOpen(null)
      if (!hadFocus) return
      // Blur while still mounted: Chromium fires no blur for a removed element, and
      // the floating sidebar would keep counting it as focus inside.
      active.blur()
      if (reason === 'navigate') return
      if (reason === 'outside') {
        // Let the click land first; only give focus back if it didn't take it.
        setTimeout(() => {
          const now = document.activeElement
          if (!now || now === document.body) restoreFocus(prev)
        }, 0)
        return
      }
      restoreFocus(prev)
    }

    const openPeek = (groupId: string, el: HTMLElement) => {
      const live = liveRef.current
      if (live.blocked || !el.isConnected || !document.hasFocus()) return
      if (!live.collapsedGroupIds.has(groupId)) return
      const item = findGroupItem(live.items, groupId)
      if (!item || item.visibleCount === 0) return
      const sidebar = live.sidebarRef.current
      const headerRect = el.getBoundingClientRect()
      const sidebarRight = sidebar ? sidebar.getBoundingClientRect().right : headerRect.right
      // Switching groups keeps the focus that was there before the first peek.
      if (!openRef.current) {
        const active = document.activeElement
        prevFocusRef.current = active instanceof HTMLElement && active !== document.body ? active : null
      }
      clearCloseTimer()
      anchoredRef.current = false
      const next = { groupId, anchorTop: headerRect.top, sidebarRight }
      openRef.current = next
      setOpen(next)
    }

    const scheduleClose = () => {
      clearCloseTimer()
      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null
        close('leave')
      }, CLOSE_DELAY)
    }

    const headerHover = (groupId: string, el: HTMLElement) => {
      const prevHover = hoverRef.current
      hoverRef.current = { groupId, el }
      if (prevHover?.groupId !== groupId) clearOpenTimer()
      if (suppressRef.current === groupId) return
      const current = openRef.current
      if (current?.groupId === groupId) { clearCloseTimer(); return }
      // Typing in a peek pins it: other headers don't take over.
      if (current && anchoredRef.current) return
      if (openTimerRef.current || !liveRef.current.collapsedGroupIds.has(groupId)) return
      openTimerRef.current = setTimeout(() => {
        openTimerRef.current = null
        const hover = hoverRef.current
        if (hover?.groupId === groupId) openPeek(groupId, hover.el)
      }, OPEN_DELAY)
    }

    const headerLeave = () => {
      hoverRef.current = null
      suppressRef.current = null
      clearOpenTimer()
      if (openRef.current && !anchoredRef.current) scheduleClose()
    }

    return {
      close,
      headerHover,
      headerLeave,
      clearOpenTimer,
      panelEnter: clearCloseTimer,
      panelLeave: () => { if (!anchoredRef.current) scheduleClose() },
      anchor: () => { anchoredRef.current = true; clearCloseTimer() },
      // Safety net when the panel unmounts without close() (group expanded or emptied
      // elsewhere): don't leave focus on a removed input.
      detach: (el: HTMLElement, groupId: string) => {
        const active = document.activeElement
        if (!(active instanceof HTMLElement) || !el.contains(active)) return
        active.blur()
        // Switching to another group: its panel takes the focus next; keep the
        // pre-peek element so closing that one still restores it.
        if (openRef.current && openRef.current.groupId !== groupId) return
        const prev = prevFocusRef.current
        prevFocusRef.current = null
        restoreFocus(prev)
      },
    }
  }, [])

  useImperativeHandle(controllerRef, () => ({
    headerHover: engine.headerHover,
    headerLeave: engine.headerLeave,
  }), [engine])

  // ── Global dismissals ─────────────────────────────────────────────────────
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      engine.clearOpenTimer()
      // A click on the hovered header (e.g. to expand it) mustn't re-pop the peek.
      if (hoverRef.current) suppressRef.current = hoverRef.current.groupId
      if (!openRef.current) return
      if (e.target instanceof Node && panelRef.current?.contains(e.target)) return
      engine.close('outside')
    }
    // Typing elsewhere (editor) with the pointer resting on a header: don't pop the
    // peek and steal the focus mid-sentence. A pointer move over the header re-arms it.
    const onKeyDown = () => engine.clearOpenTimer()
    const onScroll = (e: Event) => {
      if (!openRef.current) return
      const target = e.target
      if (target instanceof Node && liveRef.current.sidebarRef.current?.contains(target)) engine.close('dismiss')
    }
    const dismiss = () => engine.close('dismiss')
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('dragstart', dismiss, true)
    window.addEventListener('blur', dismiss)
    window.addEventListener('resize', dismiss)
    // Navigating anywhere (sidebar, palette, shortcuts…) closes it too.
    const unsubscribe = useNotesStore.subscribe((s, prev) => {
      if (
        s.activeNoteId !== prev.activeNoteId ||
        s.noteViewId !== prev.noteViewId ||
        s.groupViewId !== prev.groupViewId ||
        s.brainViewOpen !== prev.brainViewOpen ||
        s.allViewOpen !== prev.allViewOpen
      ) engine.close('navigate')
    })
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('dragstart', dismiss, true)
      window.removeEventListener('blur', dismiss)
      window.removeEventListener('resize', dismiss)
      unsubscribe()
      engine.clearOpenTimer()
      engine.close('dismiss')
    }
  }, [engine])

  const item = open ? findGroupItem(items, open.groupId) : null
  const valid = !!open && !!item && !blocked && collapsedGroupIds.has(open.groupId) && item.visibleCount > 0
  // The group was expanded, emptied or the sidebar got busy while open: drop it
  // (adjusting state during render; the panel's unmount releases the focus).
  if (open && !valid) setOpen(null)

  if (!open || !item || !valid) return null
  return (
    <GroupPeekPanel
      key={open.groupId}
      item={item}
      anchorTop={open.anchorTop}
      sidebarRight={open.sidebarRight}
      activeNoteId={activeNoteId}
      sectionTagColors={sectionTagColors}
      handlers={handlers}
      panelRef={panelRef}
      onClose={engine.close}
      onAnchor={engine.anchor}
      onPointerEnter={engine.panelEnter}
      onPointerLeave={engine.panelLeave}
      onDetach={engine.detach}
    />
  )
}

interface GroupPeekPanelProps {
  item: GroupItem
  anchorTop: number
  sidebarRight: number
  activeNoteId: string | null
  sectionTagColors: TagColorMap
  handlers: GroupPeekHandlers
  panelRef: RefObject<HTMLDivElement | null>
  onClose: (reason: CloseReason) => void
  onAnchor: () => void
  onPointerEnter: () => void
  onPointerLeave: () => void
  onDetach: (el: HTMLElement, groupId: string) => void
}

function GroupPeekPanel({
  item,
  anchorTop,
  sidebarRight,
  activeNoteId,
  sectionTagColors,
  handlers,
  panelRef,
  onClose,
  onAnchor,
  onPointerEnter,
  onPointerLeave,
  onDetach,
}: GroupPeekPanelProps) {
  const t = useT()
  const group = item.group
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [pos, setPos] = useState(() => groupPeekPosition(
    { top: anchorTop, sidebarRight },
    { width: PEEK_WIDTH, height: ESTIMATED_HEIGHT },
    { width: window.innerWidth, height: window.innerHeight },
  ))
  const [ready, setReady] = useState(false)

  const entries = useMemo(() => flattenGroupPeekEntries(item), [item])
  const filtered = useMemo(() => filterGroupPeekEntries(entries, query), [entries, query])
  const { sectionFilter, textQuery } = useMemo(() => parseSearchQuery(query), [query])
  const selectedIndex = filtered.length === 0 ? -1 : Math.min(selected, filtered.length - 1)

  // Measured once, unfiltered (the tallest it gets — filtering only removes rows),
  // so the panel doesn't jump while typing. Hidden until then: no first-frame flash.
  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el) return
    setPos(groupPeekPosition(
      { top: anchorTop, sidebarRight },
      { width: el.offsetWidth, height: el.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    ))
    setReady(true)
    inputRef.current?.focus({ preventScroll: true })
    return () => onDetach(el, group.id)
  }, [panelRef, anchorTop, sidebarRight, onDetach, group.id])

  // Keep the keyboard selection in view (only the list scrolls — no ancestors).
  useEffect(() => {
    const list = listRef.current
    if (!list || selectedIndex < 0) return
    const row = list.querySelector<HTMLElement>(`[data-peek-index="${selectedIndex}"]`)
    if (!row) return
    if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop - 4
    else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight + 4
    }
  }, [selectedIndex])

  const openNote = useCallback((e: React.MouseEvent | React.KeyboardEvent, note: Note) => {
    handlers.click(e, note)
    onClose('navigate')
  }, [handlers, onClose])

  const openSection = useCallback((e: React.MouseEvent, note: Note, sectionId: string) => {
    handlers.sectionClick(e, note, sectionId)
    onClose('navigate')
  }, [handlers, onClose])

  // Escape from anywhere in the peek (search box, a Tab-focused chip…).
  const handlePanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    // Only the peek closes: not the floating sidebar, nor an overview's window-level Escape.
    e.stopPropagation()
    onClose('escape')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      onAnchor()
      setSelected(moveGroupPeekSelection(selectedIndex, e.key === 'ArrowDown' ? 1 : -1, filtered.length))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const entry = filtered[selectedIndex]
      if (entry) openNote(e, entry.note)
    }
  }

  const accent = colorChannels(group.color)
  const total = entries.length

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={tf(t.sidebar.peekLabel, { group: group.name })}
      className="fixed z-50 flex flex-col overflow-hidden rounded-lg border border-border bg-surface-1 shadow-xl animate-group-peek-in"
      style={{
        left: pos.left,
        top: pos.top,
        width: PEEK_WIDTH,
        visibility: ready ? 'visible' : 'hidden',
        '--peek-accent': accent,
      } as React.CSSProperties}
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
      onKeyDown={handlePanelKeyDown}
    >
      {/* Thin group-color accent on the left edge, like the group overview */}
      <div className="absolute left-0 top-0 bottom-0 w-[2px] pointer-events-none" style={{ background: `rgb(${accent} / 0.55)` }} />

      <div className="flex items-center gap-1.5 pl-3 pr-2.5 pt-2 pb-1">
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: `rgb(${accent})` }} />
        <span className="min-w-0 flex-1 truncate text-[10px] font-mono uppercase tracking-wider text-text-muted">
          {group.name}
        </span>
        <span className="flex-shrink-0 text-[10px] font-mono text-text-muted/60">
          {filtered.length === total ? total : `${filtered.length}/${total}`}
        </span>
      </div>

      <div className="pl-2.5 pr-2 pb-1.5">
        <div className="relative">
          <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            spellCheck={false}
            autoComplete="off"
            placeholder={tf(t.sidebar.peekSearchPlaceholder, { group: group.name })}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelected(0)
              onAnchor()
            }}
            onKeyDown={handleKeyDown}
            className="w-full pl-6 pr-2 py-1 bg-surface-2 border border-border rounded text-[11px]
                       font-mono text-text placeholder-text-muted/40 outline-none caret-text
                       transition-colors focus:[border-color:rgb(var(--peek-accent)/0.55)]"
          />
        </div>
      </div>

      <ul
        ref={listRef}
        className="flex flex-col gap-px overflow-y-auto notes-list-scroll pl-2 pr-1.5 pb-1.5"
        style={{ maxHeight: LIST_MAX_HEIGHT }}
      >
        {filtered.length === 0 ? (
          <li className="px-2 py-2 text-[11px] font-mono text-text-muted/50">{t.sidebar.peekNoMatches}</li>
        ) : (
          filtered.map((entry, index) => (
            <PeekRow
              key={entry.note.id}
              note={entry.note}
              folderName={entry.folder?.name ?? null}
              index={index}
              groupColor={group.color}
              isActive={entry.note.id === activeNoteId}
              isSelected={index === selectedIndex}
              textQuery={textQuery}
              sectionFilter={sectionFilter}
              sectionTagColors={sectionTagColors}
              onOpenNote={openNote}
              onOpenSection={openSection}
            />
          ))
        )}
      </ul>
    </div>,
    document.body,
  )
}

interface PeekRowProps {
  note: Note
  folderName: string | null
  index: number
  groupColor: GroupColor
  isActive: boolean
  isSelected: boolean
  textQuery: string
  sectionFilter: string | null
  sectionTagColors: TagColorMap
  onOpenNote: (e: React.MouseEvent | React.KeyboardEvent, note: Note) => void
  onOpenSection: (e: React.MouseEvent, note: Note, sectionId: string) => void
}

const suppressContextMenu = (e: React.MouseEvent) => e.preventDefault()

// One note of the peek: a smaller sidebar row (title + date, section chips below).
const PeekRow = memo(function PeekRow({
  note,
  folderName,
  index,
  groupColor,
  isActive,
  isSelected,
  textQuery,
  sectionFilter,
  sectionTagColors,
  onOpenNote,
  onOpenSection,
}: PeekRowProps) {
  const t = useT()
  return (
    <li>
      <button
        type="button"
        data-peek-index={index}
        onClick={(e) => onOpenNote(e, note)}
        onContextMenu={suppressContextMenu}
        className={`relative block w-full text-left px-2 py-1 rounded-md transition-colors
          ${!isActive ? 'hover:bg-surface-3' : ''}
          ${isSelected ? 'ring-1 ring-inset ring-text/20' : ''}`}
        style={{
          ...(isActive ? { background: `rgb(${colorChannels(groupColor)} / 0.14)` } : {}),
          ...(isSelected && !isActive ? { background: 'rgb(var(--text) / 0.06)' } : {}),
        }}
        title={t.sidebar.openSideBySide}
      >
        <div className="flex items-center gap-1 min-w-0">
          {note.encryption && <Lock size={8} className="text-amber-400 flex-shrink-0" />}
          {note.expiresAt && <span title={formatExpiry(note.expiresAt, t)} className="flex-shrink-0 flex items-center"><Timer size={8} className="text-text-muted/60" /></span>}
          <span className={`min-w-0 flex-1 truncate text-[11.5px] font-mono font-medium
            ${isActive ? 'text-text' : 'text-text/80'}`}>
            {renderHighlightedText(note.title || t.common.untitled, textQuery)}
          </span>
          {folderName && (
            <span className="flex items-center gap-0.5 min-w-0 max-w-[40%] flex-shrink-0 text-[9.5px] font-mono text-text-muted/55">
              <Folder size={8} className="flex-shrink-0" style={{ color: `rgb(${colorChannels(groupColor)} / 0.7)` }} />
              <span className="truncate">{folderName}</span>
            </span>
          )}
          <span className="flex-shrink-0 ml-0.5 text-[10px] font-mono text-text-muted/50">
            {formatNoteDate(note.updated, t)}
          </span>
        </div>
        <SectionTabsRow
          compact
          noteId={note.id}
          sections={note.sections}
          searchQuery={textQuery}
          sectionFilter={sectionFilter}
          sectionTagColors={sectionTagColors}
          onSectionClick={(sectionId, e) => onOpenSection(e, note, sectionId)}
          onSectionContextMenu={suppressContextMenu}
          renderHighlightedText={renderHighlightedText}
          dimmed={!isActive}
        />
      </button>
    </li>
  )
})
