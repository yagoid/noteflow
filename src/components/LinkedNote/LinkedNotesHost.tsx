import { useCallback, useEffect, useRef, useState } from 'react'
import { FileSymlink } from 'lucide-react'
import { useNotesStore } from '../../stores/notesStore'
import { ConfirmModal } from '../ConfirmModal'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'
import type { LinkError } from '../../types'
import { isLinkedDirty } from '../../lib/linkedNotes'
import { LINK_FILE_EVENT, dragHasFiles, fileNameOf, linkablePathsOfDrop } from './linkedActions'

// Shown once per device: what linking means (edited in place, local only).
const NOTICE_SEEN_KEY = 'noteflow-linked-notice-seen'

/**
 * Main window only. Owns "Link file…": the file picker, the first-link notice, the
 * report of files that couldn't be linked (binary, not UTF-8…), and dropping files from
 * the OS anywhere on the window (captured before the editor / sidebar see the drop: a
 * dropped file is linked, never inserted as text). Images keep dropping into the editor.
 * Also re-checks the linked files when the window gets focus (read-only / missing / back).
 */
export function LinkedNotesHost() {
  const t = useT()
  const linkFiles = useNotesStore((s) => s.linkFiles)
  const [pendingFirst, setPendingFirst] = useState<{ paths?: string[] } | null>(null)
  const [errors, setErrors] = useState<Array<{ path: string; error: LinkError }> | null>(null)
  const [dropActive, setDropActive] = useState(false)

  const run = useCallback(async (paths?: string[]) => {
    const list = paths ?? await window.noteflow.linkedPickFiles({ multi: true })
    if (list.length === 0) return
    const res = await linkFiles(list)
    if (res.errors.length > 0) setErrors(res.errors)
  }, [linkFiles])

  const start = useCallback((paths?: string[]) => {
    if (!localStorage.getItem(NOTICE_SEEN_KEY)) { setPendingFirst({ paths }); return }
    void run(paths)
  }, [run])
  const startRef = useRef(start)
  useEffect(() => { startRef.current = start })

  useEffect(() => {
    const onRequest = (e: Event) => startRef.current((e as CustomEvent<{ paths?: string[] }>).detail?.paths)
    window.addEventListener(LINK_FILE_EVENT, onRequest)
    return () => window.removeEventListener(LINK_FILE_EVENT, onRequest)
  }, [])

  // Drops from the OS, in the capture phase (before ProseMirror and the sidebar's handlers).
  useEffect(() => {
    // Image-only drags stay with the editor (it inserts them).
    const onlyImages = (dt: DataTransfer | null) => !!dt && Array.from(dt.items).every((i) => i.kind !== 'file' || i.type.startsWith('image/'))
    // dragover repeats while the drag hovers the window: when it stops (left, Esc) the
    // overlay goes — a cancelled drag from the OS fires no event of its own here.
    let idle: ReturnType<typeof setTimeout> | null = null
    const hideSoon = () => {
      if (idle) clearTimeout(idle)
      idle = setTimeout(() => setDropActive(false), 350)
    }
    const onDragOver = (e: DragEvent) => {
      if (!dragHasFiles(e.dataTransfer) || onlyImages(e.dataTransfer)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'link'
      setDropActive(true)
      hideSoon()
    }
    const onDragLeave = (e: DragEvent) => {
      if (!e.relatedTarget) setDropActive(false)
    }
    const onDrop = (e: DragEvent) => {
      if (idle) clearTimeout(idle)
      setDropActive(false)
      if (!dragHasFiles(e.dataTransfer)) return
      const paths = linkablePathsOfDrop(e.dataTransfer)
      if (paths.length > 0) {
        e.preventDefault()
        e.stopPropagation()
        startRef.current(paths)
        return
      }
      // Other non-image files: swallow the drop, or the window would navigate to the file.
      if (!onlyImages(e.dataTransfer)) { e.preventDefault(); e.stopPropagation() }
    }
    window.addEventListener('dragover', onDragOver, true)
    window.addEventListener('dragleave', onDragLeave, true)
    window.addEventListener('drop', onDrop, true)
    return () => {
      if (idle) clearTimeout(idle)
      window.removeEventListener('dragover', onDragOver, true)
      window.removeEventListener('dragleave', onDragLeave, true)
      window.removeEventListener('drop', onDrop, true)
    }
  }, [])

  // Back to the window: the files may have become read-only, writable again, moved back…
  useEffect(() => {
    const onFocus = () => {
      if (!useNotesStore.getState().notes.some((n) => n.linked)) return
      void window.noteflow.linkedRecheck().then(() => {
        // Notes with unsaved content re-sync even if main saw no change (a write that
        // failed without changing the file's state): that retries the write.
        const store = useNotesStore.getState()
        for (const n of store.notes) if (isLinkedDirty(n) && !n.linked?.conflict) void store.syncLinkedNote(n.id)
      }).catch(() => undefined)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  return (
    <>
      {dropActive && (
        <div className="fixed inset-2 z-[60] pointer-events-none rounded-lg border-2 border-dashed border-text/40 bg-text/[0.04] flex items-center justify-center">
          <span className="px-3 py-1.5 rounded border border-text/20 bg-surface-1/95 text-xs font-mono text-text flex items-center gap-2">
            <FileSymlink size={13} />
            {t.linked.dropToLink}
          </span>
        </div>
      )}
      {pendingFirst && (
        <ConfirmModal
          title={t.linked.firstLinkTitle}
          message={t.linked.firstLinkMessage}
          confirmLabel={t.linked.firstLinkConfirm}
          onConfirm={() => {
            localStorage.setItem(NOTICE_SEEN_KEY, '1')
            const { paths } = pendingFirst
            setPendingFirst(null)
            void run(paths)
          }}
          onCancel={() => setPendingFirst(null)}
        />
      )}
      {errors && (
        <ConfirmModal
          title={t.linked.linkErrorsTitle}
          message={errors.map((e) => tf(t.linked.linkErrorLine, { file: fileNameOf(e.path) || e.path, reason: t.linked.linkError[e.error] })).join('\n')}
          confirmLabel={t.linked.ok}
          hideCancel
          onConfirm={() => setErrors(null)}
          onCancel={() => setErrors(null)}
        />
      )}
    </>
  )
}
