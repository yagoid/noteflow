import { useEffect, useState } from 'react'
import type { Editor as TiptapEditor } from '@tiptap/react'
import type { Node as PMNode } from '@tiptap/pm/model'
import { buildTocItems, tocSignature, type RawHeading, type TocItem } from '../../lib/tocUtils'

/** Debounce between a document change and the TOC refresh (typing stays cheap on big notes). */
const TOC_REFRESH_MS = 200

const NO_ITEMS: TocItem[] = []

/** Reads the TOC entries (H1–H3, non-empty) straight from the ProseMirror document. */
export function readTocItems(doc: PMNode): TocItem[] {
  const headings: RawHeading[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      headings.push({ level: Number(node.attrs.level), text: node.textContent, pos })
      return false
    }
    // Headings can live inside blockquotes/lists, but never inside a textblock:
    // skipping the inline content of paragraphs/code blocks keeps the walk cheap.
    return !node.isTextblock
  })
  return buildTocItems(headings)
}

/**
 * Live TOC entries of `editor`, or [] when `enabled` is false. Refreshes on any
 * doc-changing transaction (debounced) — including `setContent(…, false)` from
 * the external-sync path, which emits no `update` event — and only re-renders
 * when the headings actually changed.
 */
export function useTocItems(editor: TiptapEditor | null, enabled: boolean): TocItem[] {
  const [items, setItems] = useState<TocItem[]>(NO_ITEMS)

  useEffect(() => {
    if (!editor || !enabled) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const refresh = () => {
      timer = null
      if (editor.isDestroyed) return
      const next = readTocItems(editor.state.doc)
      setItems(prev => (tocSignature(prev) === tocSignature(next) ? prev : next))
    }
    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (!transaction.docChanged) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(refresh, TOC_REFRESH_MS)
    }
    // First read on the next tick (not synchronously in the effect body).
    timer = setTimeout(refresh, 0)
    editor.on('transaction', onTransaction)
    return () => {
      editor.off('transaction', onTransaction)
      if (timer) clearTimeout(timer)
    }
  }, [editor, enabled])

  return enabled ? items : NO_ITEMS
}
