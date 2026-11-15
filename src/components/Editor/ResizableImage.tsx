import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import Image, { type ImageOptions } from '@tiptap/extension-image'
import { useState, useRef, useCallback } from 'react'
import type { CSSProperties } from 'react'

const MIN_WIDTH = 50
/** The scroller's scrollbar (`::-webkit-scrollbar` in index.css), also left out by the CSS cap. */
const SCROLLBAR_WIDTH = 6

/**
 * Where an image can grow. In the Readable width a sized image right inside a top-level
 * paragraph may "break out" of the reading column (index.css, `.nf-image.is-sized`, same
 * `p > .node-image > .nf-image` structure): it stays left-aligned while it fits the column
 * and, past it, grows centred on the column up to the editor's full content width, minus
 * the scrollbar as the CSS cap does. Elsewhere it's capped by its paragraph.
 */
function resizeBounds(wrapper: HTMLElement) {
  const para = wrapper.closest('p')
  const pm = wrapper.closest('.ProseMirror')
  if (!para) return null
  const paraRect = para.getBoundingClientRect()
  const container = wrapper.closest('.editor-readable')
  const breakout = !!pm && !!container && para.parentElement === pm
    && wrapper.parentElement?.parentElement === para
  let max = para.clientWidth
  if (breakout && pm && container) {
    // The CSS cap's own terms: 100cqw (the .editor-readable container, scrollbar included)
    // minus the ProseMirror paddings and the scrollbar.
    const style = getComputedStyle(pm)
    const cap = container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - SCROLLBAR_WIDTH
    max = Math.max(max, cap)
  }
  return { breakout, colLeft: paraRect.left, colWidth: para.clientWidth, max }
}

function ResizableImageView({ node, updateAttributes, selected, extension }: NodeViewProps) {
  const [resizing, setResizing] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  // Linked notes: a relative `assets/x.png` is shown from the file's folder; the doc keeps the src.
  const displaySrc = (extension.options as { displaySrc?: ((src: string) => string) | null }).displaySrc
  const src: string = node.attrs.src ?? ''

  const width: number | null = node.attrs.width ?? null

  const onHandleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const img = imgRef.current
      const wrapper = img?.parentElement
      if (!img || !wrapper) return

      setResizing(true)
      const startX = e.clientX
      const startRect = img.getBoundingClientRect()
      const bounds = resizeBounds(wrapper)

      const onMouseMove = (e: MouseEvent) => {
        const dx = e.clientX - startX
        let next = startRect.width + dx
        if (bounds?.breakout) {
          // Keep the handle under the cursor: left-anchored while the image fits the
          // column, centred on it (each side grows half) once it breaks out.
          const right = startRect.right + dx
          const centred = 2 * (right - (bounds.colLeft + bounds.colWidth / 2))
          next = centred > bounds.colWidth ? centred : right - Math.max(startRect.left, bounds.colLeft)
        }
        if (bounds) next = Math.min(next, bounds.max)
        updateAttributes({ width: Math.round(Math.max(MIN_WIDTH, next)) })
      }

      const onMouseUp = () => {
        setResizing(false)
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [updateAttributes],
  )

  return (
    <NodeViewWrapper
      as="span"
      className={`group nf-image${width != null ? ' is-sized' : ''}`}
      style={{
        display: 'inline-block',
        position: 'relative',
        lineHeight: 0,
        verticalAlign: 'bottom',
        // Only the vertical margins inline: the Readable breakout sets margin-left in CSS.
        marginTop: '0.25rem',
        marginBottom: '0.25rem',
        outline: selected ? '2px solid rgb(var(--text) / 0.5)' : 'none',
        outlineOffset: '2px',
        borderRadius: '4px',
        cursor: resizing ? 'nwse-resize' : undefined,
        userSelect: 'none',
        ...(width != null ? { '--img-w': `${width}px` } as CSSProperties : null),
      }}
    >
      <img
        ref={imgRef}
        src={displaySrc ? displaySrc(src) : src}
        alt={node.attrs.alt ?? ''}
        draggable={false}
        style={{
          display: 'block',
          width: width != null ? `${width}px` : undefined,
          maxWidth: '100%',
          height: 'auto',
          borderRadius: '4px',
          margin: 0,
        }}
      />
      {/* Resize handle */}
      <span
        contentEditable="false"
        onMouseDown={onHandleMouseDown}
        className="resize-handle group-hover:opacity-100"
      />
    </NodeViewWrapper>
  )
}

export const ResizableImage = Image.extend<ImageOptions & { displaySrc: ((src: string) => string) | null }>({
  addOptions() {
    return { ...this.parent?.(), displaySrc: null } as ImageOptions & { displaySrc: ((src: string) => string) | null }
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => {
          const w = el.getAttribute('width')
          return w ? parseInt(w, 10) : null
        },
        renderHTML: (attrs) => (attrs.width != null ? { width: attrs.width } : {}),
      },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView, { as: 'span' })
  },
})
