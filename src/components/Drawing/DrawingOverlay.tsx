import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Excalidraw, MainMenu, serializeAsJSON } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import './drawing.css'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { X } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'
import { useLanguageStore } from '../../stores/languageStore'
import { useThemeStore } from '../../stores/themeStore'
import { THEMES } from '../../lib/themes'
import { MERMAID_SAMPLE, mermaidToScene, sceneToSvg, type DrawingScene } from '../../lib/drawing/drawingScene'
import type { DrawingOpenRequest } from './drawingEvents'

// Spike overlay of the drawing block: Excalidraw with the NoteFlow language and theme, a
// trimmed UI (no scene load/save to file, no image export, no image tool, no online
// library, no AI) and a close that hands the scene back as Excalidraw JSON. This module is
// only reached through React.lazy (DrawingOverlayHost), so Excalidraw stays out of the
// initial bundle. The two header probes (SVG export, Mermaid sample) are spike tooling.

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

const BTN = 'rounded border border-border px-2 py-1 text-xs text-text-muted hover:bg-surface-3 hover:text-text disabled:opacity-50'

function formatBytes(n: number): string {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} kB`
}

interface Props {
  request: DrawingOpenRequest
  /** Receives the scene serialized as Excalidraw JSON (`serializeAsJSON`, type "local"). */
  onClose: (sceneJson: string) => void
}

export default function DrawingOverlay({ request, onClose }: Props) {
  const t = useT()
  const lang = useLanguageStore((s) => s.lang)
  const themeId = useThemeStore((s) => s.activeThemeId)
  const dark = (THEMES.find((th) => th.id === themeId)?.colorScheme ?? 'dark') === 'dark'

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [svgPreview, setSvgPreview] = useState<string | null>(null)

  // Read once: the request describes the initial scene, later renders must not reset it.
  const initialData = useMemo(() => ({
    elements: request.scene?.elements ?? [],
    appState: { ...request.scene?.appState, viewBackgroundColor: 'transparent' },
    files: request.scene?.files ?? {},
    scrollToContent: true,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  const currentScene = useCallback((): DrawingScene | null => {
    const a = apiRef.current
    if (!a) return null
    return { elements: a.getSceneElements(), appState: a.getAppState(), files: a.getFiles() }
  }, [])

  const loadMermaid = useCallback(async (source: string) => {
    const a = apiRef.current
    if (!a) return
    setBusy(true)
    try {
      const { elements, files } = await mermaidToScene(source)
      a.addFiles(Object.values(files))
      a.updateScene({ elements: [...a.getSceneElements(), ...elements] })
      a.scrollToContent(elements, { fitToContent: true })
      const images = elements.filter((el) => el.type === 'image').length
      setStatus(tf(t.drawing.mermaidResult, { count: elements.length, images }))
    } catch (err) {
      setStatus(tf(t.drawing.failed, { error: err instanceof Error ? err.message : String(err) }))
    } finally {
      setBusy(false)
    }
  }, [t])

  // Initial Mermaid source of the request, once the canvas is up.
  const mermaidLoaded = useRef(false)
  useEffect(() => {
    if (!api || !request.mermaid || mermaidLoaded.current) return
    mermaidLoaded.current = true
    void loadMermaid(request.mermaid)
  }, [api, request.mermaid, loadMermaid])

  const exportSvg = async () => {
    const scene = currentScene()
    if (!scene) return
    setBusy(true)
    try {
      const started = performance.now()
      const svg = await sceneToSvg(scene, { dark, skipInliningFonts: request.svgWithoutFonts })
      const ms = Math.round(performance.now() - started)
      const embedded = (svg.match(/url\(data:font/g) ?? []).length
      setSvgPreview(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
      setStatus(tf(t.drawing.svgResult, { size: formatBytes(svg.length), embedded, ms }))
    } catch (err) {
      setStatus(tf(t.drawing.failed, { error: err instanceof Error ? err.message : String(err) }))
    } finally {
      setBusy(false)
    }
  }

  const close = () => {
    const scene = currentScene()
    onClose(scene ? serializeAsJSON(scene.elements, scene.appState, scene.files, 'local') : '')
  }

  return (
    <div className="nf-drawing flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border shadow-2xl">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-surface-2 px-3">
        <span className="text-sm font-medium text-text">{t.drawing.title}</span>
        <span data-drawing-status="" className="min-w-0 flex-1 truncate text-xs text-text-muted">{status}</span>
        {svgPreview && (
          <img data-drawing-svg="" src={svgPreview} alt={t.drawing.svgPreviewAlt} className="h-8 max-w-[120px] rounded border border-border" />
        )}
        <button type="button" className={BTN} disabled={busy || !api} onClick={() => void loadMermaid(MERMAID_SAMPLE)}>
          {t.drawing.mermaidSample}
        </button>
        <button type="button" className={BTN} disabled={busy || !api} onClick={() => void exportSvg()}>
          {t.drawing.exportSvg}
        </button>
        <button
          type="button"
          data-drawing-close=""
          className="flex items-center gap-1 rounded bg-accent px-2 py-1 text-xs font-medium text-surface-0 hover:opacity-90"
          onClick={close}
        >
          <X size={12} />
          {t.drawing.done}
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <Excalidraw
          excalidrawAPI={(a) => { apiRef.current = a; setApi(a) }}
          initialData={initialData}
          langCode={lang === 'es' ? 'es-ES' : 'en'}
          theme={dark ? 'dark' : 'light'}
          UIOptions={UI_OPTIONS}
          aiEnabled={false}
          autoFocus
        >
          {/* A menu of our own: the default one links to Excalidraw's socials and plans. */}
          <MainMenu>
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.DefaultItems.Help />
          </MainMenu>
        </Excalidraw>
      </div>
    </div>
  )
}
