import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { Selection } from '@tiptap/pm/state'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, PenTool, Workflow } from 'lucide-react'
import {
  drawingFromHtmlData,
  drawingText,
  type DrawingHtmlData,
} from '../../lib/drawing/drawingBlock'
import { cachedDrawingPreview, drawingPreview, type DrawingPreview } from '../../lib/drawing/drawingPreview'
import { blockToScene, sceneHasImages } from '../../lib/drawing/drawingScene'
import {
  DRAWING_DEFAULT_MAX_HEIGHT, DRAWING_MAX_HEIGHT, DRAWING_MIN_HEIGHT,
  drawingWidthFromDrag, storedDrawingHeight, storedDrawingWidth, withDrawingSize,
} from '../../lib/drawing/drawingSize'
import { THEMES } from '../../lib/themes'
import { tf } from '../../i18n/format'
import { useT } from '../../i18n/useT'
import {
  saveDrawingElsewhere, useDrawingEditorStore, writeDrawingToSection, type DrawingTarget,
} from '../../stores/drawingEditorStore'
import { getWindowRole } from '../../stores/notesStore'
import { useThemeStore } from '../../stores/themeStore'
import { DRAWING_EDIT_EVENT, DRAWING_NODE_NAME, caretBesideDrawing, consumeOpenOnInsert } from './drawingCommands'

// React NodeView of the in-note drawing block (node: DrawingBlock.ts). It shows a static
// preview — an inline SVG made by Excalidraw's exporter (lib/drawing/drawingPreview.ts) —
// and opens the drawing overlay to edit. Excalidraw is a large lazy chunk: it is only
// asked for once the block scrolls into view, and never in a sticky window; until then,
// and whenever the preview can't be made, the block shows what it says as text.
//
// The node keeps the block as { kind, attrs, body } (the fence content). Every change is
// ONE updateAttributes / deleteNode on the live node → one undoable transaction that
// autosaves like any edit. Closing the overlay without changes writes nothing.

/** The scrollbar of the editor's scroller (`::-webkit-scrollbar` in index.css): left out by the CSS cap. */
const SCROLLBAR_WIDTH = 6

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

/**
 * Where the card can grow (the same terms as the CSS, `.drawing-card.is-sized`): in the
 * Readable width it may break out of the reading column, centred on it, up to the
 * editor's content width — 100cqw of the `.editor-readable` container minus the
 * ProseMirror paddings and the scrollbar; elsewhere it is capped by its own column.
 */
function widthBounds(card: HTMLElement): { column: { left: number; width: number }; max: number } | null {
  const wrapper = card.parentElement
  if (!wrapper) return null
  const rect = wrapper.getBoundingClientRect()
  const column = { left: rect.left, width: rect.width }
  const pm = card.closest('.ProseMirror')
  const container = card.closest('.editor-readable')
  if (!pm || !container) return { column, max: column.width }
  const style = getComputedStyle(pm)
  const cap = container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - SCROLLBAR_WIDTH
  return { column, max: Math.max(column.width, cap) }
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
  const livePos = useCallback((): number | null => {
    if (editor.isDestroyed) return null
    try {
      const pos = getPos()
      return typeof pos === 'number' && editor.state.doc.nodeAt(pos)?.type.name === DRAWING_NODE_NAME ? pos : null
    } catch {
      return null // the node view is gone
    }
  }, [editor, getPos])
  const liveData = useCallback((): DrawingHtmlData | null => {
    const pos = livePos()
    return pos === null ? null : editor.state.doc.nodeAt(pos)!.attrs.drawing as DrawingHtmlData
  }, [editor, livePos])

  /**
   * Which one this is among the identical drawing blocks of the document (0-based). Only
   * the document's direct children are looked at: a drawing can't be nested — the node is
   * in the `topBlock` group, which only the document accepts (editorExtensions.ts →
   * TopLevelDocument), and markdownHtml reads drawings at the top level only.
   */
  const ordinalOf = useCallback((): number => {
    const pos = livePos()
    let ordinal = 0
    if (pos === null) return 0
    editor.state.doc.forEach((node, offset) => {
      if (offset >= pos || node.type.name !== DRAWING_NODE_NAME) return
      const d = node.attrs.drawing as DrawingHtmlData
      if (d.kind === data.kind && d.body === data.body) ordinal++
    })
    return ordinal
  }, [data, editor, livePos])

  const edit = useCallback(async (insertedNow = false) => {
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
      const store = useDrawingEditorStore.getState()
      // Where this drawing lives, by identity (the node view may not outlive the canvas).
      const home = (editor.storage as Record<string, { target?: { noteId: string; sectionId: string | null } } | undefined>)[DRAWING_NODE_NAME]?.target
      const target: DrawingTarget | null = home?.noteId && home.sectionId
        ? { noteId: home.noteId, sectionId: home.sectionId, opened: data, ordinal: ordinalOf() }
        : null
      const result = await store.edit({ block, scene, target })

      // The node as it is NOW, and only if it is still the block that was opened: a sync
      // pull, the AI or another window may have replaced it (ProseMirror can even reuse this
      // node view for another drawing), and the editor itself may be gone (another note or
      // section on screen). Nothing is ever written over a block that isn't the opened one.
      const pos = livePos()
      const live = pos === null ? null : editor.state.doc.nodeAt(pos)!.attrs.drawing as DrawingHtmlData
      // (Its attributes may differ — resized from another window meanwhile: still the same
      // drawing, and the attributes it has now are the ones kept.)
      const same = !!live && live.kind === data.kind && live.body === data.body

      if (result.type === 'unchanged') {
        // Nothing drawn in a block inserted for this session: it has no reason to stay.
        if (insertedNow && same) deleteNode()
        if (same) editor.commands.focus()
        return
      }
      const drawn: DrawingHtmlData | null = result.empty ? null : { kind: 'excalidraw', attrs: live && same ? live.attrs : data.attrs, body: result.lines.join('\n') }
      if (same) {
        // One transaction on the live node: undoable with Ctrl+Z, autosaved like any edit.
        if (drawn) updateAttributes({ drawing: drawn })
        else deleteNode()
        // A drawing just inserted: on to the text below it, not left selected (the next
        // keystroke belongs to the note).
        const at = drawn && insertedNow ? livePos() : null
        if (at !== null) {
          const { tr } = editor.state
          const after = at + tr.doc.nodeAt(at)!.nodeSize
          const next = tr.doc.nodeAt(after)
          // Into the paragraph below (made if the drawing ends the section); before any other
          // kind of block, just the nearest caret position — nothing is added to the note.
          if (!next || next.type.name === 'paragraph') caretBesideDrawing(tr, at, 'after')
          else tr.setSelection(Selection.near(tr.doc.resolve(after), 1))
          editor.view.dispatch(tr.scrollIntoView())
        }
        editor.commands.focus()
        return
      }
      // Not through this editor: into the section itself, if the block is still there —
      // and if it isn't, or the write fails, the user is asked (never dropped silently).
      if (drawn) await saveDrawingElsewhere(target, drawn)
      else if (target) await writeDrawingToSection(target, null).catch(() => undefined) // emptied: nothing to lose
    } finally {
      busyRef.current = false
    }
  }, [block, canEdit, data, deleteNode, editor, livePos, ordinalOf, t, updateAttributes])

  // Ctrl/Cmd+Enter on the selected node (DrawingBlock.ts keymap) and the insert command reach the
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
    if (consumeOpenOnInsert()) void editRef.current(true)
  }, [])

  // ── Size: the marker's `width` / `height` attributes (lib/drawing/drawingSize.ts) ──
  // No width = the reading column. No height = the drawing's own height (capped) when it
  // has no width either; with a width, the height follows the drawing's proportions, so a
  // wider card shows a bigger drawing. A drag only changes local state: ONE transaction
  // when the pointer is released (one Ctrl+Z), and the SVG is never regenerated.
  const preview = state.status === 'ready' ? state.preview : null
  const natural = preview && !preview.empty ? svgSize(preview.svg) : null
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const width = dragWidth ?? storedDrawingWidth(data.attrs)
  const fixedHeight = dragHeight ?? storedDrawingHeight(data.attrs)
  const previewStyle: React.CSSProperties | undefined = fixedHeight
    ? { height: fixedHeight }
    : !natural
      ? undefined
      : width
        ? { aspectRatio: `${natural.width} / ${natural.height}`, maxHeight: DRAWING_MAX_HEIGHT }
        : { height: Math.min(natural.height, DRAWING_DEFAULT_MAX_HEIGHT) }

  /** Drags of the handles: pointer captured on the window until release. */
  const drag = (e: React.PointerEvent, onMove: (ev: PointerEvent) => void, onEnd: () => void) => {
    e.preventDefault()
    e.stopPropagation()
    // pointercancel too (a touch taken over by the system, the window losing the pointer):
    // the drag ends there instead of following the pointer forever.
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      onEnd()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }
  const commitSize = (key: 'width' | 'height', px: number | null) => {
    const live = liveData()
    if (live) updateAttributes({ drawing: { ...live, attrs: withDrawingSize(live.attrs, key, px) } })
  }

  const onResizeStart = (e: React.PointerEvent) => {
    const el = rootRef.current?.querySelector<HTMLElement>('.drawing-preview')
    if (!editor.isEditable || !el) return
    const startY = e.clientY
    const startHeight = Math.round(el.getBoundingClientRect().height)
    let last = startHeight
    drag(e, (ev) => {
      last = Math.max(DRAWING_MIN_HEIGHT, Math.min(DRAWING_MAX_HEIGHT, Math.round(startHeight + ev.clientY - startY)))
      setDragHeight(last)
    }, () => {
      setDragHeight(null)
      if (last !== startHeight) commitSize('height', last)
    })
  }

  const onWidthStart = (side: 'left' | 'right') => (e: React.PointerEvent) => {
    const card = rootRef.current
    const bounds = card ? widthBounds(card) : null
    if (!editor.isEditable || !card || !bounds) return
    const rect = card.getBoundingClientRect()
    const start = { left: rect.left, right: rect.right }
    const startX = e.clientX
    let last: number | null = null
    drag(e, (ev) => {
      last = drawingWidthFromDrag({ side, dx: ev.clientX - startX, start, column: bounds.column, max: bounds.max })
      setDragWidth(last)
    }, () => {
      setDragWidth(null)
      if (last !== null && last !== storedDrawingWidth(data.attrs)) commitSize('width', last)
    })
  }
  /** Double click on a side handle: back to the width of the column. */
  const resetWidth = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (storedDrawingWidth(data.attrs) !== null) commitSize('width', null)
  }

  const Icon = data.kind === 'mermaid' ? Workflow : PenTool
  const label = data.kind === 'mermaid' ? t.drawing.mermaidLabel : t.drawing.label
  const message = notice
    || (state.status === 'error' ? tf(t.drawing.previewError, { error: state.message }) : '')
    || (preview?.asImage && canEdit ? t.drawing.mermaidImageHint : '')

  return (
    <NodeViewWrapper className={`drawing-node${selected ? ' is-selected' : ''}`} data-drawing-kind={data.kind}>
      <div
        ref={rootRef}
        className={`drawing-card${width ? ' is-sized' : ''}${dragWidth !== null || dragHeight !== null ? ' is-resizing' : ''}`}
        style={width ? { '--drawing-w': `${width}px` } as React.CSSProperties : undefined}
        onDoubleClick={() => { void edit() }}
      >
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
            style={previewStyle}
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
          <>
            <div
              className="drawing-resize"
              data-drawing-interactive=""
              title={t.drawing.resize}
              onPointerDown={onResizeStart}
            />
            {(['left', 'right'] as const).map((side) => (
              <div
                key={side}
                className={`drawing-resize-x drawing-resize-${side}`}
                data-drawing-interactive=""
                title={t.drawing.resizeWidth}
                onPointerDown={onWidthStart(side)}
                onDoubleClick={resetWidth}
              />
            ))}
          </>
        )}
      </div>
    </NodeViewWrapper>
  )
}
