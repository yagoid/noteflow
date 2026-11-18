import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Excalidraw, MainMenu } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import './drawing.css'
import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { Check, X } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { useLanguageStore } from '../../stores/languageStore'
import { useThemeStore } from '../../stores/themeStore'
import type { DrawingEditSession } from '../../stores/drawingEditorStore'
import { THEMES } from '../../lib/themes'
import { modKey } from '../../lib/platform'
import { serializeSceneBody } from '../../lib/drawing/drawingBlock'
import { sceneToData } from '../../lib/drawing/drawingScene'
import { ConfirmModal } from '../ConfirmModal'

// The drawing editor: Excalidraw over the whole window, with the NoteFlow language and
// theme and a trimmed UI (no scene load/save to file, no image export, no image tool, no
// library, no embeds, no AI / Mermaid dialog). Only reached through React.lazy
// (DrawingOverlayHost), so Excalidraw stays out of the initial bundle.
//
// "Done" hands back the scene ONLY if the user changed it. Excalidraw may touch a scene by
// just loading it (text re-measured once its font arrives, bound arrows re-routed), so the
// comparison baseline isn't the stored text: it is the scene as it stands at the user's
// first pointer or key action on the canvas. No action → nothing is written; an action
// that leaves the scene as it was (a click, a selection) → nothing is written either.

// Module-level: a new object on every render would make Excalidraw re-apply its options.
const UI_OPTIONS = {
  canvasActions: {
    loadScene: false,
    saveToActiveFile: false,
    saveAsImage: false,
    export: false,
    toggleTheme: false,
  },
  tools: { image: false },
} as const

// Dialogs of Excalidraw that have no place here (see closeForbiddenUi).
const FORBIDDEN_DIALOGS = new Set(['ttd', 'imageExport', 'jsonExport'])
const FORBIDDEN_TOOLS = new Set(['embeddable', 'image', 'magicframe'])

const BTN = 'flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-text-muted hover:bg-surface-3 hover:text-text'

export default function DrawingOverlay({ session }: { session: DrawingEditSession }) {
  const t = useT()
  const lang = useLanguageStore((s) => s.lang)
  const themeId = useThemeStore((s) => s.activeThemeId)
  const dark = (THEMES.find((th) => th.id === themeId)?.colorScheme ?? 'dark') === 'dark'

  const rootRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  /** Canonical lines of the scene at the user's first action (null = no action yet). */
  const baselineRef = useRef<string[] | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  // Read once: the session describes the initial scene, later renders must not reset it.
  const initialData = useMemo(() => ({
    elements: session.scene.elements,
    appState: { ...session.scene.appState, viewBackgroundColor: session.scene.appState.viewBackgroundColor ?? 'transparent' },
    files: session.scene.files,
    scrollToContent: true,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  /** The scene as the note would store it right now. */
  const currentLines = useCallback((): { lines: string[]; empty: boolean } | null => {
    const api = apiRef.current
    if (!api) return null
    const state = api.getAppState()
    // Stored app state: the background always; the grid only while it is on.
    const appState: Partial<AppState> = { viewBackgroundColor: state.viewBackgroundColor }
    if (state.gridModeEnabled) Object.assign(appState, { gridModeEnabled: true, gridSize: state.gridSize, gridStep: state.gridStep })
    const elements = api.getSceneElements()
    return { lines: serializeSceneBody(sceneToData({ elements, appState, files: api.getFiles() })), empty: elements.length === 0 }
  }, [])

  const changed = useCallback((): { lines: string[]; empty: boolean } | null => {
    const baseline = baselineRef.current
    const current = currentLines()
    if (!baseline || !current) return null
    return current.lines.join('\n') === baseline.join('\n') ? null : current
  }, [currentLines])

  const done = useCallback(() => {
    const result = changed()
    session.finish(result ? { type: 'saved', lines: result.lines, empty: result.empty } : { type: 'unchanged' })
  }, [changed, session])

  const cancel = useCallback(() => {
    if (changed()) setConfirmDiscard(true)
    else session.finish({ type: 'unchanged' })
  }, [changed, session])

  // The user's first action on the canvas fixes the baseline (capture phase: before
  // Excalidraw handles the event). The header buttons and our own dialog don't count.
  useEffect(() => {
    const mark = (e: Event) => {
      if (baselineRef.current) return
      const target = e.target instanceof Element ? e.target : null
      const onCanvas = !!target?.closest('.excalidraw')
      const key = e.type === 'keydown' && !target?.closest('[data-drawing-chrome]')
      if (!onCanvas && !key) return
      baselineRef.current = currentLines()?.lines ?? null
    }
    window.addEventListener('pointerdown', mark, true)
    window.addEventListener('keydown', mark, true)
    window.addEventListener('paste', mark, true)
    window.addEventListener('drop', mark, true)
    return () => {
      window.removeEventListener('pointerdown', mark, true)
      window.removeEventListener('keydown', mark, true)
      window.removeEventListener('paste', mark, true)
      window.removeEventListener('drop', mark, true)
    }
  }, [currentLines])

  // Ctrl+Shift+Enter = Done. Esc stays Excalidraw's (deselect, leave a tool, close its dialogs).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirmDiscard) return
      if (e.key === 'Enter' && e.shiftKey && (e.ctrlKey || e.metaKey) && !e.altKey) {
        e.preventDefault()
        e.stopPropagation()
        // Commit a text being typed first (its blur writes it into the scene).
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        window.setTimeout(done, 0)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [done, confirmDiscard])

  // Keep the focus inside the overlay: the note behind it must not get keystrokes.
  useEffect(() => {
    const focusCanvas = () => rootRef.current?.querySelector<HTMLElement>('.excalidraw-container, .excalidraw')?.focus()
    const onFocusIn = (e: FocusEvent) => {
      const overlay = rootRef.current?.closest('[data-drawing-overlay]')
      if (overlay && e.target instanceof Node && !overlay.contains(e.target)) focusCanvas()
    }
    document.addEventListener('focusin', onFocusIn)
    return () => document.removeEventListener('focusin', onFocusIn)
  }, [])

  // What can't be switched off by a prop in Excalidraw 0.18 is undone as soon as it shows
  // up in its state, whatever opened it (menu, shortcut, its command palette): the library
  // sidebar (online catalogue), the Mermaid / text-to-diagram dialog, the export dialogs,
  // and the web-embed / image / AI-frame tools. drawing.css only hides their triggers.
  const closeForbiddenUi = useCallback((state: AppState) => {
    const api = apiRef.current
    if (!api) return
    const patch: Partial<AppState> = {}
    if (state.openSidebar) patch.openSidebar = null
    if (state.openDialog && FORBIDDEN_DIALOGS.has(state.openDialog.name)) patch.openDialog = null
    if (Object.keys(patch).length > 0) api.updateScene({ appState: patch as never })
    if (FORBIDDEN_TOOLS.has(state.activeTool.type)) api.setActiveTool({ type: 'selection' })
  }, [])

  return (
    <div ref={rootRef} className="nf-drawing flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border shadow-2xl">
      <div data-drawing-chrome="" className="flex min-h-10 shrink-0 items-center gap-2 border-b border-border bg-surface-2 px-3 py-1">
        <span className="text-sm font-medium text-text">{t.drawing.title}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-text-muted" title={session.block.kind === 'mermaid' ? t.drawing.mermaidNotice : undefined}>
          {session.block.kind === 'mermaid' ? t.drawing.mermaidNotice : ''}
        </span>
        <button type="button" data-drawing-cancel="" className={BTN} onClick={cancel}>
          <X size={12} />
          {t.common.cancel}
        </button>
        <button
          type="button"
          data-drawing-done=""
          className="flex items-center gap-1 rounded bg-accent px-2 py-1 text-xs font-medium text-surface-0 hover:opacity-90"
          title={`${modKey}+Shift+Enter`}
          onClick={done}
        >
          <Check size={12} />
          {t.drawing.done}
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <Excalidraw
          excalidrawAPI={(api) => { apiRef.current = api }}
          initialData={initialData}
          langCode={lang === 'es' ? 'es-ES' : 'en'}
          theme={dark ? 'dark' : 'light'}
          UIOptions={UI_OPTIONS}
          aiEnabled={false}
          validateEmbeddable={false}
          onChange={(_elements, state) => closeForbiddenUi(state)}
          // Element hyperlinks: never a new Electron window — the same door as the links
          // of a note (main opens https in the system browser, nothing else).
          onLinkOpen={(element, event) => {
            event.preventDefault()
            if (element.link) void window.noteflow.openUrl(element.link)
          }}
          autoFocus
        >
          {/* A menu of our own: the default one links to Excalidraw's socials and plans. */}
          <MainMenu>
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.DefaultItems.Help />
          </MainMenu>
        </Excalidraw>
      </div>
      {confirmDiscard && (
        <ConfirmModal
          title={t.drawing.discardTitle}
          message={t.drawing.discardMessage}
          confirmLabel={t.drawing.discardConfirm}
          cancelLabel={t.drawing.discardKeep}
          danger
          confirmOnEnter={false}
          onConfirm={() => session.finish({ type: 'unchanged' })}
          onCancel={() => setConfirmDiscard(false)}
        />
      )}
    </div>
  )
}
