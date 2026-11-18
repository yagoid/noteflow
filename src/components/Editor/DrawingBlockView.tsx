import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, PenTool, Workflow } from 'lucide-react'
import { getKanbanAttr, setKanbanAttr } from '../../lib/kanban'
import {
  drawingFromHtmlData,
  drawingText,
  type DrawingHtmlData,
} from '../../lib/drawing/drawingBlock'
import { cachedDrawingPreview, drawingPreview, type DrawingPreview } from '../../lib/drawing/drawingPreview'
import { blockToScene, sceneHasImages } from '../../lib/drawing/drawingScene'
import { THEMES } from '../../lib/themes'
import { tf } from '../../i18n/format'
import { useT } from '../../i18n/useT'
import { useDrawingEditorStore } from '../../stores/drawingEditorStore'
import { getWindowRole } from '../../stores/notesStore'
import { useThemeStore } from '../../stores/themeStore'
import { DRAWING_EDIT_EVENT, DRAWING_NODE_NAME, consumeOpenOnInsert } from './drawingCommands'

// React NodeView of the in-note drawing block (node: DrawingBlock.ts). It shows a static
// preview — an inline SVG made by Excalidraw's exporter (lib/drawing/drawingPreview.ts) —
// and opens the drawing overlay to edit. Excalidraw is a large lazy chunk: it is only
// asked for once the block scrolls into view, and never in a sticky window; until then,
// and whenever the preview can't be made, the block shows what it says as text.
//
// The node keeps the block as { kind, attrs, body } (the fence content). Every change is
// ONE updateAttributes / deleteNode on the live node → one undoable transaction that
// autosaves like any edit. Closing the overlay without changes writes nothing.

const DEFAULT_MAX_HEIGHT = 360
const MIN_HEIGHT = 80
const MAX_HEIGHT = 1600

type PreviewState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; preview: DrawingPreview }
  | { status: 'error'; message: string }

/** The intrinsic size Excalidraw gives its exported `<svg width height>`. */
function svgSize(svg: string): { width: number; height: number } | null {
  const tag = svg.slice(0, svg.indexOf('>') + 1)
  const width = Number(tag.match(/\swidth="([\d.]+)"/)?.[1])
  const height = Number(tag.match(/\sheight="([\d.]+)"/)?.[1])
  return width > 0 && height > 0 ? { width, height } : null
}

function storedHeight(attrs: string): number | null {
  const n = Number(getKanbanAttr(attrs, 'height'))
  return Number.isFinite(n) && n >= MIN_HEIGHT ? Math.min(Math.round(n), MAX_HEIGHT) : null
}

export function DrawingBlockView({ node, editor, getPos, selected, updateAttributes, deleteNode }: NodeViewProps) {
  const t = useT()
  const data = node.attrs.drawing as DrawingHtmlData
  const block = useMemo(() => drawingFromHtmlData(data), [data])
  const text = useMemo(() => (block ? drawingText(block) : data.body), [block, data.body])

  const themeId = useThemeStore((s) => s.activeThemeId)
  const dark = (THEMES.find((th) => th.id === themeId)?.colorScheme ?? 'dark') === 'dark'
  // Stickies never load Excalidraw: they show the text of the drawing.
  const canPreview = getWindowRole() !== 'sticky'
  const canEdit = useDrawingEditorStore((s) => s.available) && editor.isEditable

  const rootRef = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)
  const [state, setState] = useState<PreviewState>({ status: 'idle' })
  const [notice, setNotice] = useState('')
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const busyRef = useRef(false)

  // Ask for the preview only once the block is (nearly) on screen.
  useEffect(() => {
    const el = rootRef.current
    if (!el || !canPreview || seen) return
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setSeen(true)
    }, { rootMargin: '200px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [canPreview, seen])

  useEffect(() => {
    if (!canPreview || !block) return
    // Already made for this content (undo, another pane, a section switch): no flash.
    if (!seen && !cachedDrawingPreview(data, dark)) return
    let alive = true
    setState((s) => (s.status === 'ready' ? s : { status: 'loading' }))
    drawingPreview(data, dark).then(
      (preview) => { if (alive) setState({ status: 'ready', preview }) },
      (err: unknown) => { if (alive) setState({ status: 'error', message: err instanceof Error ? err.message : String(err) }) },
    )
    return () => { alive = false }
  }, [canPreview, block, seen, data, dark])

  /** The live node (never a stale closure): null if it is gone or no longer a drawing. */
  const liveData = useCallback((): DrawingHtmlData | null => {
    const pos = getPos()
    const live = typeof pos === 'number' ? editor.state.doc.nodeAt(pos) : null
    return live?.type.name === DRAWING_NODE_NAME ? live.attrs.drawing as DrawingHtmlData : null
  }, [editor, getPos])

  const edit = useCallback(async () => {
    if (busyRef.current || !canEdit || !block) return
    busyRef.current = true
    setNotice('')
    try {
      let scene
      try {
        scene = await blockToScene(block)
      } catch (err) {
        setNotice(tf(t.drawing.previewError, { error: err instanceof Error ? err.message : String(err) }))
        return
      }
      // A Mermaid type drawn as one picture: nothing to edit as shapes, and storing the
      // picture would put a huge line in the note. It stays a source block.
      if (block.kind === 'mermaid' && sceneHasImages(scene)) {
        setNotice(t.drawing.mermaidImageOnly)
        return
      }
      const result = await useDrawingEditorStore.getState().edit({ block, scene, isNew: scene.elements.length === 0 })
      const live = liveData()
      if (!live) return
      const wasEmpty = block.kind === 'excalidraw' && block.scene.elements.length === 0
      if (result.type === 'saved' && !result.empty) {
        updateAttributes({ drawing: { kind: 'excalidraw', attrs: live.attrs, body: result.lines.join('\n') } satisfies DrawingHtmlData })
      } else if (result.type === 'saved' || wasEmpty) {
        // Nothing drawn: an empty block has no reason to stay in the note.
        deleteNode()
      }
      editor.commands.focus()
    } finally {
      busyRef.current = false
    }
  }, [block, canEdit, deleteNode, editor, liveData, t, updateAttributes])

  // Enter on the selected node (DrawingBlock.ts keymap) and the insert command reach the
  // view through a DOM event on its wrapper.
  const editRef = useRef(edit)
  useEffect(() => { editRef.current = edit }, [edit])
  useEffect(() => {
    // (TipTap's node view DOM is the `.react-renderer` around the wrapper: nodeDOM() returns it.)
    const el = rootRef.current?.closest('.react-renderer') ?? rootRef.current?.closest('.drawing-node')
    if (!el) return
    const onEdit = () => { void editRef.current() }
    el.addEventListener(DRAWING_EDIT_EVENT, onEdit)
    return () => el.removeEventListener(DRAWING_EDIT_EVENT, onEdit)
  }, [])
  // Just inserted by the slash command: straight to the canvas.
  useEffect(() => {
    if (consumeOpenOnInsert()) void editRef.current()
  }, [])

  // ── Height: the marker's `height` attribute, or the drawing's own up to a cap ──
  const preview = state.status === 'ready' ? state.preview : null
  const natural = preview && !preview.empty ? svgSize(preview.svg) : null
  const height = dragHeight ?? storedHeight(data.attrs) ?? (natural ? Math.min(natural.height, DEFAULT_MAX_HEIGHT) : null)

  const onResizeStart = (e: React.PointerEvent) => {
    if (!editor.isEditable || height === null) return
    e.preventDefault()
    e.stopPropagation()
    const startY = e.clientY
    const startHeight = height
    let last = startHeight
    const onMove = (ev: PointerEvent) => {
      last = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(startHeight + ev.clientY - startY)))
      setDragHeight(last)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setDragHeight(null)
      const live = liveData()
      if (live && last !== startHeight) updateAttributes({ drawing: { ...live, attrs: setKanbanAttr(live.attrs, 'height', String(last)) } })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const Icon = data.kind === 'mermaid' ? Workflow : PenTool
  const label = data.kind === 'mermaid' ? t.drawing.mermaidLabel : t.drawing.label
  const message = notice
    || (state.status === 'error' ? tf(t.drawing.previewError, { error: state.message }) : '')
    || (preview?.asImage && canEdit ? t.drawing.mermaidImageHint : '')

  return (
    <NodeViewWrapper className={`drawing-node${selected ? ' is-selected' : ''}`} data-drawing-kind={data.kind}>
      <div ref={rootRef} className="drawing-card" onDoubleClick={() => { void edit() }}>
        <div className="drawing-header" contentEditable={false}>
          <Icon size={12} />
          <span className="drawing-label">{label}</span>
          {canEdit && block && (
            <button
              type="button"
              className="drawing-edit"
              data-drawing-interactive=""
              title={preview?.asImage ? t.drawing.mermaidImageOnly : t.drawing.editHint}
              onClick={() => { void edit() }}
            >
              <Pencil size={11} />
              {t.drawing.edit}
            </button>
          )}
        </div>
        {preview && !preview.empty ? (
          <div
            className="drawing-preview"
            style={height ? { height } : undefined}
            // Excalidraw's own SVG export of the scene (links and scripts stripped in sceneToSvg).
            dangerouslySetInnerHTML={{ __html: preview.svg }}
          />
        ) : (
          <pre className="drawing-fallback" data-status={state.status}>
            <code>{text || (state.status === 'loading' ? t.drawing.loading : t.drawing.empty)}</code>
          </pre>
        )}
        {message && <div className="drawing-message" contentEditable={false}>{message}</div>}
        {preview && !preview.empty && editor.isEditable && (
          <div
            className="drawing-resize"
            data-drawing-interactive=""
            title={t.drawing.resize}
            onPointerDown={onResizeStart}
          />
        )}
      </div>
    </NodeViewWrapper>
  )
}
