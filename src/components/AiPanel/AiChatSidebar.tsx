import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { ExternalLink, History, Plus, Sparkles } from 'lucide-react'
import { useAiChatStore } from '../../stores/aiChatStore'
import { useNotesStore } from '../../stores/notesStore'
import { useT } from '../../i18n/useT'
import { ChatView } from './ChatView'
import { ChatContextBar } from './ChatContextBar'
import { AI_CHAT_ANCHOR_ATTR, onAiChatAnchorChange } from './aiChatAnchor'

const WIDTH_KEY = 'noteflow-ai-chat-width'
const WIDTH_MIN = 300
const WIDTH_MAX = 640
const WIDTH_DEFAULT = 380
// Gap kept between the sidebar and the edges of the content row.
const EDGE = 12
// Fold/unfold slide: same duration and easing as the notes sidebar's dock/undock (SidebarShell's
// DOCK_TRANSITION_MS, `ease`). Transform instead of width: this panel floats over the editor, and
// squeezing its width would re-wrap the whole conversation on every frame. Like the notes sidebar,
// it doesn't special-case prefers-reduced-motion.
const SLIDE_MS = 220
// Extra distance so the shadow is out of view too when folded.
const SLIDE_OUT_EXTRA = 32
// Header icon buttons (history · new chat · detach); colors are added per button.
const ICON_BTN = 'shrink-0 flex items-center justify-center w-7 h-7 rounded-lg transition-colors'

function readStoredWidth(): number {
  try {
    const n = Number(localStorage.getItem(WIDTH_KEY))
    return Number.isFinite(n) && n >= WIDTH_MIN && n <= WIDTH_MAX ? n : WIDTH_DEFAULT
  } catch {
    return WIDTH_DEFAULT
  }
}

interface Box { top: number; right: number; containerWidth: number }

/**
 * The AI chat as a floating panel over the right side of the editor (main window). Opened and
 * folded ONLY by the chat button on the note title row (`aiChatAnchor`), folded on every start,
 * and shown only in the editor view while that button is on screen — the conversation itself
 * lives in aiChatStore, so hiding the panel (or switching notes) never touches it. Shares the
 * history and the active thread with the brain's chat (same store, same ChatView).
 */
export function AiChatSidebar({ containerRef, active }: { containerRef: RefObject<HTMLElement | null>; active: boolean }) {
  const t = useT()
  const open = useAiChatStore((s) => s.sidebarOpen)
  const detached = useAiChatStore((s) => s.detached)
  const busy = useAiChatStore((s) => s.streaming || s.pendingConfirm !== null)
  const newChat = useAiChatStore((s) => s.newChat)
  const detachChat = useAiChatStore((s) => s.detachChat)
  const shown = open && !detached && active

  // Fold/unfold animation. `closing` keeps the panel mounted while it slides out; `entered` flips
  // one painted frame after mount so the slide-in starts from the folded position. Both reset
  // while rendering when `shown` flips (derived-state pattern), so a quick re-open mid-slide just
  // reverses it without unmounting (no flash).
  const [prevShown, setPrevShown] = useState(shown)
  const [closing, setClosing] = useState(false)
  const [entered, setEntered] = useState(false)
  if (prevShown !== shown) {
    setPrevShown(shown)
    setClosing(!shown)
    if (!shown) setEntered(false)
  }

  const [width, setWidth] = useState(readStoredWidth)
  const [box, setBox] = useState<Box | null>(null)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const widthRef = useRef(width)
  useEffect(() => { widthRef.current = width }, [width])

  // Hang below the chat button of the rightmost pane (a full-height strip flush with the pane's right
  // edge, so its bottom is the header's), aligned with its right edge but never closer than EDGE.
  const measure = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const anchors = container.querySelectorAll<HTMLElement>(`[${AI_CHAT_ANCHOR_ATTR}]`)
    const anchor = anchors[anchors.length - 1]
    const a = anchor?.getBoundingClientRect()
    if (!a || a.width === 0) { setBox(null); return }
    const c = container.getBoundingClientRect()
    const next: Box = {
      top: Math.round(a.bottom - c.top + 6),
      right: Math.max(EDGE, Math.round(c.right - a.right)),
      containerWidth: Math.round(c.width),
    }
    setBox((prev) => prev && prev.top === next.top && prev.right === next.right && prev.containerWidth === next.containerWidth ? prev : next)
  }, [containerRef])

  useEffect(() => {
    if (!shown) return
    let raf = 0
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure) }
    schedule()
    const container = containerRef.current
    const ro = new ResizeObserver(schedule)
    if (container) ro.observe(container)
    const offAnchor = onAiChatAnchorChange(schedule)
    window.addEventListener('resize', schedule)
    // The title row can also move without any resize (a banner shown above it in the editor,
    // the split's horizontal scroll): a cheap periodic re-measure of one rect covers those.
    const timer = setInterval(schedule, 500)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      offAnchor()
      window.removeEventListener('resize', schedule)
      clearInterval(timer)
    }
  }, [shown, measure, containerRef])

  // Unmount once the slide-out is over (a timer: transitionend may never fire if it's interrupted).
  useEffect(() => {
    if (!closing) return
    const id = setTimeout(() => setClosing(false), SLIDE_MS + 30)
    return () => clearTimeout(id)
  }, [closing])

  // Slide in once the folded frame (with a measured position) has been painted.
  const hasBox = box !== null
  useEffect(() => {
    if (!shown || !hasBox || entered) return
    let inner = 0
    const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(() => setEntered(true)) })
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner) }
  }, [shown, hasBox, entered])

  // Width drag on the left edge.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const max = Math.min(WIDTH_MAX, (box?.containerWidth ?? WIDTH_MAX + 2 * EDGE) - 2 * EDGE)
      setWidth(Math.max(WIDTH_MIN, Math.min(max, drag.startWidth + (drag.startX - e.clientX))))
    }
    const onUp = () => {
      if (!dragRef.current) return
      dragRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      try { localStorage.setItem(WIDTH_KEY, String(widthRef.current)) } catch { /* storage unavailable */ }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [box?.containerWidth])

  const openNote = useCallback((noteId: string, sectionId: string) => {
    useNotesStore.getState().navigateToSection(noteId, sectionId)
  }, [])

  const openAiSettings = useCallback(() => {
    window.dispatchEvent(new CustomEvent('noteflow:open-ai-settings'))
  }, [])

  // While sliding out the position stays frozen: the measuring loop above only runs while shown, and
  // it measures the BUTTON (never transformed), so the slide doesn't feed back into the position.
  if ((!shown && !closing) || !box) return null

  const maxWidth = Math.max(WIDTH_MIN, Math.min(WIDTH_MAX, box.containerWidth - 2 * EDGE))
  return (
    <aside
      aria-label={t.aiPanel.sidebar.title}
      className="absolute z-30 flex flex-col rounded-xl border border-border bg-surface-1 shadow-2xl overflow-hidden"
      style={{
        top: box.top, right: box.right, bottom: EDGE, width: Math.min(width, maxWidth),
        // `none` (not translateX(0)) once in: a transformed ancestor would become the containing
        // block of `position: fixed` descendants.
        transform: entered ? 'none' : `translateX(calc(100% + ${box.right + SLIDE_OUT_EXTRA}px))`,
        transition: `transform ${SLIDE_MS}ms ease`,
        pointerEvents: shown ? undefined : 'none',
      }}
      aria-hidden={shown ? undefined : true}
    >
      <div
        onMouseDown={(e) => {
          e.preventDefault()
          dragRef.current = { startX: e.clientX, startWidth: Math.min(width, maxWidth) }
          document.body.style.cursor = 'col-resize'
          document.body.style.userSelect = 'none'
        }}
        title={t.aiPanel.sidebar.resize}
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-text/20 active:bg-text/35 transition-colors z-40"
      />
      <ChatView
        compact
        withContext
        autoSendPendingPrompt={false}
        showSuggestions={false}
        onOpenNote={openNote}
        onConfigure={openAiSettings}
        contextBar={<ChatContextBar />}
        renderHeader={(c) => (
          <div className="flex-shrink-0 flex items-center gap-1 pl-3 pr-1.5 h-10 border-b border-border">
            <Sparkles size={13} className="shrink-0 text-accent" />
            <div className="ml-auto flex items-center gap-0.5 min-w-0">
              {c.modelPicker}
              <button
                onClick={c.toggleHistory}
                title={t.aiPanel.sidebar.history}
                aria-label={t.aiPanel.sidebar.history}
                aria-pressed={c.historyOpen}
                className={`${ICON_BTN} ${c.historyOpen ? 'bg-surface-2 text-text' : 'text-text-muted hover:text-text hover:bg-surface-2'}`}
              >
                <History size={15} />
              </button>
              <button
                onClick={() => { newChat(); c.closeHistory() }}
                title={t.aiPanel.chat.newChat}
                aria-label={t.aiPanel.chat.newChat}
                className={`${ICON_BTN} text-text-muted hover:text-text hover:bg-surface-2`}
              >
                <Plus size={15} />
              </button>
              <button
                onClick={() => void detachChat()}
                disabled={busy}
                title={busy ? t.aiPanel.sidebar.detachBusy : t.aiPanel.sidebar.detach}
                aria-label={t.aiPanel.sidebar.detach}
                className={`${ICON_BTN} text-text-muted hover:text-text hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-text-muted disabled:hover:bg-transparent`}
              >
                <ExternalLink size={15} />
              </button>
            </div>
          </div>
        )}
      />
    </aside>
  )
}
