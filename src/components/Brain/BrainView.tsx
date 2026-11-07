import { Fragment, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Brain, Loader2, PanelLeftOpen, RefreshCw, Sparkles, X } from 'lucide-react'
import { useAiStore } from '../../stores/aiStore'
import { useAiChatStore } from '../../stores/aiChatStore'
import { useNotesStore } from '../../stores/notesStore'
import { useBrainSettingsStore } from '../../stores/brainSettingsStore'
import { groupPlace } from '../../lib/contentView'
import { useT } from '../../i18n/useT'
import { plural, tf } from '../../i18n/format'
import { useBrainGraph } from './useBrainGraph'
import { BrainCanvas } from './BrainCanvas'
import { AiPanel } from '../AiPanel/AiPanel'
import { BrainNodePreview, type PinnedPreview } from './BrainNodePreview'

// Three.js (and the whole 3D scene) only enters its own chunk when the brain opens.
const BrainScene = lazy(() => import('./BrainScene'))

const SPLIT_KEY = 'noteflow:brain-split-width' // left (AI panel) width as a %

// Wraps each `term` found in `text` with the accent-emphasis span, so dialog bodies
// stay whole, translatable strings while still highlighting a couple of key phrases.
function highlightTerms(text: string, terms: string[]): ReactNode {
  let parts: ReactNode[] = [text]
  terms.forEach((term, ti) => {
    parts = parts.flatMap((part, pi) => {
      if (typeof part !== 'string') return [part]
      const out: ReactNode[] = []
      part.split(term).forEach((seg, i) => {
        if (i > 0) out.push(<span key={`t${ti}-${pi}-${i}`} className="text-text">{term}</span>)
        if (seg) out.push(seg)
      })
      return out
    })
  })
  return parts.map((p, i) => <Fragment key={i}>{p}</Fragment>)
}

function detectWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

export function BrainView({ onClose }: { onClose: () => void }) {
  const t = useT()
  const enabled = useAiStore((s) => s.enabled)
  const indexState = useAiStore((s) => s.indexState)
  const stale = useAiStore((s) => s.stale)
  const progress = useAiStore((s) => s.progress)
  const fetchGraphEdges = useAiStore((s) => s.fetchGraphEdges)
  const setEnabled = useAiStore((s) => s.setEnabled)
  const reindexAll = useAiStore((s) => s.reindexAll)

  const activeSources = useAiChatStore((s) => s.activeSources)
  const streaming = useAiChatStore((s) => s.streaming)
  const highlightedNoteIds = useMemo(() => new Set(activeSources.map((s) => s.noteId)), [activeSources])

  const setActiveNote = useNotesStore((s) => s.setActiveNote)
  const setOpenNoteIds = useNotesStore((s) => s.setOpenNoteIds)
  const setContentView = useNotesStore((s) => s.setContentView)

  // Clicking a note/section node pins a preview card next to it; clicking the card
  // navigates to that section. (Canvas nodes are drawn, not DOM, so the handlers
  // report the click position back to us.)
  const [pinned, setPinned] = useState<PinnedPreview | null>(null)
  const onNodeActivate = useCallback(
    (noteId: string, sectionId: string | undefined, x: number, y: number) =>
      setPinned({ noteId, sectionId, x, y }),
    [],
  )

  const model = useBrainGraph()
  const [enabling, setEnabling] = useState(false)
  const [enableError, setEnableError] = useState<string | null>(null)
  // The Local AI button always opens this dialog; its content depends on whether
  // AI is currently on (offer to disable) or off (offer to enable). Auto-opens on
  // entry when AI is off, as an onboarding nudge.
  const [showDialog, setShowDialog] = useState(() => !enabled)
  // WebGL support is fixed for the session; the 3D/2D preference is live (Settings → Appearance).
  const [webglSupported] = useState(detectWebGL)
  const prefer3D = useBrainSettingsStore((s) => s.prefer3D)
  const lowEnd = useBrainSettingsStore((s) => s.lowEnd)
  const showLowEndPrompt = useBrainSettingsStore((s) => s.showLowEndPrompt)
  const setPrefer3D = useBrainSettingsStore((s) => s.setPrefer3D)
  const dismissLowEndPrompt = useBrainSettingsStore((s) => s.dismissLowEndPrompt)
  const use3D = webglSupported && prefer3D
  // Offer 3D once on weak machines (where we defaulted to 2D). Requires WebGL —
  // no point offering 3D it can't render. The Local AI dialog takes priority, so
  // this only shows after that one is closed.
  const showLowEndDialog = lowEnd && showLowEndPrompt && webglSupported && !showDialog

  // The AI panel can be collapsed to give the brain the full width (combined with
  // hiding the notes sidebar this yields a fullscreen brain). Resets on each entry.
  const [aiCollapsed, setAiCollapsed] = useState(false)

  // ── Resizable split (AI panel | brain) ──
  const containerRef = useRef<HTMLDivElement>(null)
  const [splitPct, setSplitPct] = useState(() => {
    const saved = Number(localStorage.getItem(SPLIT_KEY))
    return saved >= 25 && saved <= 75 ? saved : 42
  })
  const [dragging, setDragging] = useState(false)
  // Track the container's pixel width so the AI panel can animate its collapse with a
  // fixed-width inner (like the sidebar) instead of squishing its content.
  const [containerWidth, setContainerWidth] = useState(0)
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    setContainerWidth(el.getBoundingClientRect().width)
    const ro = new ResizeObserver((entries) => setContainerWidth(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const panelPx = Math.round((containerWidth * splitPct) / 100)
  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const pct = Math.max(25, Math.min(75, ((e.clientX - rect.left) / rect.width) * 100))
      setSplitPct(pct)
    }
    const onUp = () => { setDragging(false); localStorage.setItem(SPLIT_KEY, String(Math.round(splitPct))) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragging, splitPct])

  useEffect(() => {
    if (enabled) void fetchGraphEdges()
  }, [enabled, fetchGraphEdges])

  // Navigate to a clicked note's section (mirrors the old behaviour): stash the target so the editor
  // — which mounts once the brain view closes — opens on the right section, and re-assert it on the
  // next macrotask for StrictMode's double mount.
  const openNote = useCallback((noteId: string, sectionId?: string) => {
    if (sectionId) useNotesStore.setState({ pendingInitialSectionId: sectionId })
    setOpenNoteIds([noteId])
    setActiveNote(noteId) // also closes the brain view
    if (sectionId) {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('noteflow:request-section', { detail: { noteId, sectionId } }))
      }, 0)
    }
  }, [setOpenNoteIds, setActiveNote])

  const openGroup = useCallback((groupId: string) => setContentView(groupPlace(groupId)), [setContentView])

  const enableAi = async () => {
    setEnabling(true)
    setEnableError(null)
    try {
      await setEnabled(true)
      setShowDialog(false)
    } catch (err) {
      setEnableError(String((err as Error)?.message ?? err))
    } finally {
      setEnabling(false)
    }
  }

  const disableAi = () => {
    setEnabled(false)
    setShowDialog(false)
  }

  const indexing = indexState !== 'idle'
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden flex" style={{ background: 'rgb(var(--bg-editor))' }}>
      {/* ── Left: AI panel (animated collapse, mirrors the sidebar) ──── */}
      <div
        style={{ width: aiCollapsed ? 0 : panelPx, transition: dragging ? 'none' : 'width 220ms ease' }}
        className="flex-shrink-0 h-full overflow-hidden"
      >
        <div style={{ width: panelPx, height: '100%' }}>
          <AiPanel onOpenNote={openNote} onCollapse={() => setAiCollapsed(true)} />
        </div>
      </div>

      {/* Divider — only while the panel is open */}
      {!aiCollapsed && (
        <div
          onMouseDown={() => setDragging(true)}
          className="w-1 flex-shrink-0 cursor-col-resize hover:bg-text/30 active:bg-text/50 transition-colors z-10"
          title={t.brain.dragResize}
        />
      )}

      {/* Re-open the collapsed AI panel — discreet slim bar */}
      {aiCollapsed && (
        <button
          onClick={() => setAiCollapsed(false)}
          title={t.brain.showAiPanel}
          className="flex-shrink-0 flex items-center justify-center w-6 h-full
                     text-text-muted/40 hover:text-text-muted hover:bg-surface-2
                     border-r border-border transition-colors"
        >
          <PanelLeftOpen size={14} />
        </button>
      )}

      {/* ── Right: brain canvas ────────────────────────────────────── */}
      <div className="flex-1 relative min-h-0 min-w-0 overflow-hidden">
        {use3D ? (
          <Suspense
            fallback={
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 size={20} className="animate-spin text-text-muted/60" />
              </div>
            }
          >
            <BrainScene model={model} showContentEdges={enabled} onOpenNote={openNote} onOpenGroup={openGroup} highlightedNoteIds={highlightedNoteIds} thinking={streaming} onNodeActivate={onNodeActivate} />
          </Suspense>
        ) : (
          <BrainCanvas model={model} showContentEdges={enabled} onOpenNote={openNote} onOpenGroup={openGroup} highlightedNoteIds={highlightedNoteIds} onNodeActivate={onNodeActivate} />
        )}

        {pinned && (
          <BrainNodePreview
            pinned={pinned}
            onOpen={(noteId, sectionId) => { setPinned(null); openNote(noteId, sectionId) }}
            onDismiss={() => setPinned(null)}
          />
        )}

        {/* Header */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-2.5 pointer-events-none">
          <div className="flex items-center gap-2 text-text/80">
            <Brain size={15} />
            <span className="text-xs font-mono tracking-wide">{t.brain.title}</span>
            <span className="text-[11px] font-mono text-text-muted/60">{plural(t.brain.nodesCount, model.nodes.length)}</span>
          </div>
          <div className="flex items-center gap-1.5 pointer-events-auto">
            <button
              onClick={() => setShowDialog(true)}
              disabled={enabling}
              title={enabled ? t.brain.localAiEnabled : t.brain.localAiDisabled}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono border transition-colors disabled:opacity-60 ${
                enabled || enabling ? 'border-text/30 text-text bg-surface-2' : 'border-border text-text-muted hover:text-text'
              }`}
            >
              {enabling ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              <span>{t.brain.localAi}</span>
              <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full transition-colors ${enabled ? 'bg-emerald-400' : 'bg-text-muted/40'}`} />
            </button>
            {enabled && (
              <button
                onClick={() => reindexAll()}
                disabled={indexing}
                title={indexing ? t.brain.indexingInProgress : stale ? t.brain.reindexStale : t.brain.reindexAll}
                className="relative flex items-center justify-center w-7 h-7 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw size={12} className={indexing ? 'animate-spin' : ''} />
                {/* Stale dot: notes changed but the index hasn't caught up yet. */}
                {stale && !indexing && (
                  <span className="pointer-events-none absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400" />
                )}
              </button>
            )}
            <button
              onClick={onClose}
              title={t.brain.close}
              className="flex items-center justify-center w-7 h-7 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Empty state */}
        {model.nodes.length === 0 && !indexing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-xs font-mono text-text-muted/70">{t.brain.emptyNotes}</p>
          </div>
        )}

        {/* Download / indexing progress pill */}
        {(enabling || indexing) && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-1 border border-border shadow-lg">
            <Loader2 size={12} className="animate-spin text-text" />
            <span className="text-[11px] font-mono text-text-muted">
              {indexState === 'downloading-model'
                ? (pct != null ? tf(t.brain.downloadingModelPct, { pct }) : t.brain.downloadingModel)
                : indexState === 'indexing'
                  ? (pct != null ? tf(t.brain.indexingPct, { pct }) : t.brain.indexing)
                  : t.brain.starting}
            </span>
          </div>
        )}

        {/* Activate / deactivate dialog — always shown via the Local AI button */}
        {showDialog && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
            <div className="w-[380px] max-w-[85%] rounded-lg border border-border bg-surface-1 p-5 shadow-2xl">
              <div className="flex items-center gap-2 mb-2 text-text">
                <Sparkles size={16} />
                <h2 className="text-sm font-mono font-bold tracking-wide">{enabled ? t.brain.disableTitle : t.brain.enableTitle}</h2>
              </div>
              <p className="text-[12px] leading-relaxed text-text-muted font-mono mb-4">
                {highlightTerms(enabled ? t.brain.disableBody : t.brain.enableBody, [t.brain.contentConnections])}
              </p>
              {enableError && (
                <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2">
                  <p className="text-[10px] font-mono font-bold text-red-400 mb-1">{t.brain.activationFailed}</p>
                  <pre className="text-[10px] font-mono text-red-300/90 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">{enableError}</pre>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDialog(false)}
                  className="flex-1 flex items-center justify-center px-3 py-2 rounded border border-border text-text-muted text-xs font-mono hover:text-text hover:border-text/30 transition-colors"
                >
                  {t.common.cancel}
                </button>
                {enabled ? (
                  <button
                    onClick={disableAi}
                    className="flex-1 flex items-center justify-center px-3 py-2 rounded bg-text text-surface-0 text-xs font-mono font-bold hover:opacity-90 transition-opacity"
                  >
                    {t.brain.disableTitle}
                  </button>
                ) : (
                  <button
                    onClick={enableAi}
                    disabled={enabling}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded bg-text text-surface-0 text-xs font-mono font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
                  >
                    {enabling ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                    {enabling ? t.brain.enabling : t.brain.enableTitle}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* One-time nudge on low-powered devices: we defaulted to 2D, offer 3D */}
        {showLowEndDialog && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
            <div className="w-[380px] max-w-[85%] rounded-lg border border-border bg-surface-1 p-5 shadow-2xl">
              <div className="flex items-center gap-2 mb-2 text-text">
                <Brain size={16} />
                <h2 className="text-sm font-mono font-bold tracking-wide">{t.brain.lowEndTitle}</h2>
              </div>
              <p className="text-[12px] leading-relaxed text-text-muted font-mono mb-4">
                {highlightTerms(t.brain.lowEndBody, [t.brain.view2d, t.brain.view3d])}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={dismissLowEndPrompt}
                  className="flex-1 flex items-center justify-center px-3 py-2 rounded border border-border text-text-muted text-xs font-mono hover:text-text hover:border-text/30 transition-colors"
                >
                  {t.brain.keep2d}
                </button>
                <button
                  onClick={() => setPrefer3D(true)}
                  className="flex-1 flex items-center justify-center px-3 py-2 rounded bg-text text-surface-0 text-xs font-mono font-bold hover:opacity-90 transition-opacity"
                >
                  {t.brain.use3d}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
