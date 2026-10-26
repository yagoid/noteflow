import { useEditor, EditorContent } from '@tiptap/react'
import type { Editor as TiptapEditor } from '@tiptap/react'
import History from '@tiptap/extension-history'
import Placeholder from '@tiptap/extension-placeholder'
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { AllSelection, NodeSelection, Selection, TextSelection } from '@tiptap/pm/state'
import { createDocument, getHTMLFromFragment } from '@tiptap/core'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { schemaExtensions } from './editorExtensions'
import { EditorToolbar } from './EditorToolbar'
import { TableContextMenu } from './TableContextMenu'
import { SearchHighlight } from './SearchHighlightExtension'
import { SlashCommands, getSlashCommands } from './SlashCommands'
import { AutoCloseBrackets } from './AutoCloseBrackets'
import { SectionLinkPicker } from './SectionLinkPicker'
import { EditorToc } from './EditorToc'
import { useTocItems } from './useEditorToc'
import { sidebarAnchorRef } from '../Sidebar/sidebarAnchor'
import { TOC_MIN_EDITOR_WIDTH, TOC_RESERVE } from '../../lib/tocUtils'
import { useEditorSettingsStore } from '../../stores/editorSettingsStore'
import { htmlFromMarkdown, htmlToMarkdown, looksLikeMarkdown } from '../../lib/markdownHtml'
import { isEditorWidgetTarget, widgetFieldHasFocus } from '../../lib/editorFocus'
import { createDebouncedSave, type SaveRun } from '../../lib/pendingEdits'
import { createContentSync, needsSave, recordSave, resolveExternalContent } from '../../lib/externalContentSync'
import { useT } from '../../i18n/useT'

/**
 * Replaces the editor's document with `doc` (external content) without emitting
 * an update (it isn't a local edit to save) nor adding it to the undo history
 * (Ctrl+Z must not silently revert the external change and save that). Only the
 * changed range is replaced, so node views outside it (a kanban board with an
 * open card field) survive and undo keeps working for edits outside it. The
 * selection is kept: positions before the change stay, after it shift by the
 * size delta, inside it go to the change's start. Doesn't take focus.
 */
function replaceDocKeepingSelection(editor: TiptapEditor, doc: ProseMirrorNode) {
  const { state } = editor
  const start = state.doc.content.findDiffStart(doc.content)
  if (start == null) return
  const diffEnd = state.doc.content.findDiffEnd(doc.content)
  let endA = diffEnd?.a ?? state.doc.content.size
  let endB = diffEnd?.b ?? doc.content.size
  // findDiffEnd can run past `start` when the change repeats nearby content.
  const overlap = start - Math.min(endA, endB)
  if (overlap > 0) { endA += overlap; endB += overlap }
  let tr = state.tr
  try {
    tr.replace(start, endA, doc.slice(start, endB))
  } catch {
    tr = state.tr
  }
  // The slice must rebuild exactly `doc`; otherwise replace it whole.
  if (!tr.doc.eq(doc)) tr = state.tr.replaceWith(0, state.doc.content.size, doc.content)
  const size = tr.doc.content.size
  const map = (pos: number) =>
    Math.max(0, Math.min(size, pos <= start ? pos : pos >= endA ? pos + endB - endA : start))
  const sel = state.selection
  let next: Selection
  if (sel instanceof AllSelection) {
    next = new AllSelection(tr.doc)
  } else if (sel instanceof NodeSelection) {
    const pos = map(sel.from)
    const node = tr.doc.nodeAt(pos)
    next = node && node.type === sel.node.type && NodeSelection.isSelectable(node)
      ? NodeSelection.create(tr.doc, pos)
      : Selection.near(tr.doc.resolve(pos))
  } else {
    next = TextSelection.between(tr.doc.resolve(map(sel.anchor)), tr.doc.resolve(map(sel.head)))
  }
  tr.setSelection(next).setMeta('addToHistory', false).setMeta('preventUpdate', true)
  editor.view.dispatch(tr)
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/** Vertical breathing room (px) kept around the caret when typing/arrowing near
 *  the edge of the scroll area. */
export interface CaretScrollGap {
  top: number
  bottom: number
}

/** Main note editor: ~4 lines below the caret at the default 13px font, a bit
 *  less above (the toolbar sits outside the scroll area). */
const DEFAULT_CARET_SCROLL_GAP: CaretScrollGap = { top: 40, bottom: 96 }

interface EditorProps {
  content: string
  onChange: (markdown: string) => void
  /** Note this content belongs to: its pending (debounced) save is registered under it,
   *  so pruning that note or closing the window can flush it first (lib/pendingEdits). */
  noteId?: string
  placeholder?: string
  readOnly?: boolean
  hideToolbar?: boolean
  fontSize?: number
  /** Whether to grab focus on mount. Disabled while a section rename is in progress
   *  so the editor doesn't steal focus from the tab-name input. */
  autoFocus?: boolean
  /** Id of the section being edited — excluded from the "Link section" picker. */
  currentSectionId?: string | null
  /** Gap kept between the caret and the top/bottom edge of the scroll area.
   *  Read once at mount. Compact windows (sticky) pass a smaller one so the two
   *  bands can't overlap in a short viewport. */
  caretScrollGap?: CaretScrollGap
  /** Show the floating table of contents (H1–H3) at the right of the editor.
   *  Off by default: only the main note editor opts in (not sticky windows). */
  showToc?: boolean
}

export interface EditorHandle {
  editor: TiptapEditor | null
  /** The element that scrolls the note vertically (wraps the ProseMirror DOM). */
  getScrollContainer: () => HTMLElement | null
}

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor({
  content,
  onChange,
  noteId = '',
  placeholder = 'Start typing...',
  readOnly = false,
  hideToolbar = false,
  fontSize,
  autoFocus = true,
  currentSectionId,
  caretScrollGap = DEFAULT_CARET_SCROLL_GAP,
  showToc = false,
}, ref) {
  // Debounced save of the content (400 ms after the last change). Registered in
  // lib/pendingEdits while pending, and flushed on unmount (section/note switch,
  // pane closed) instead of firing later from a dead editor.
  const [contentSave] = useState(createDebouncedSave)
  useEffect(() => () => contentSave.flush(), [contentSave])
  // Base + outbox of our own saves: tells their echoes from genuine external
  // updates (lib/externalContentSync). `contentRef` = the latest store content.
  const [contentSync] = useState(() => createContentSync(content))
  const contentRef = useRef(content)
  // An external update left for later because a widget field (an open kanban
  // card) had focus or an IME composition was running — see syncExternalContent.
  const deferredSyncRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Whether the editor viewport is wide enough to host the TOC next to the text
  // (narrow windows / split panes hide it rather than squeeze the text).
  const [wideEnoughForToc, setWideEnoughForToc] = useState(false)
  const { fontFamily } = useEditorSettingsStore()
  // When the "/ → Link section" command runs, open the section picker.
  const [linkPickerOpen, setLinkPickerOpen] = useState(false)

  // Keep a live ref to the message tree so the slash-command labels reflect a
  // language switch the next time the "/" menu opens (the editor isn't recreated
  // on language change, so a captured dict would go stale — read it fresh).
  const t = useT()
  const tRef = useRef(t)
  useEffect(() => { tRef.current = t }, [t])

  const editor = useEditor({
    editorProps: {
      attributes: {
        spellcheck: 'false',
      },
      // Keep a gap below (and above) the caret while typing, pressing Enter or
      // arrowing near the edge. ProseMirror's defaults (threshold 0, margin 5px)
      // scroll just enough to show the caret line, so it hugs the bottom edge and
      // the editor's bottom padding (index.css) only shows when scrolling by hand.
      // threshold === margin → once the caret enters the band, it scrolls line by
      // line keeping that gap (no jumps). Only transactions flagged with
      // scrollIntoView() use this: mouse clicks never scroll. Horizontal values
      // stay at ProseMirror's defaults.
      scrollThreshold: { top: caretScrollGap.top, bottom: caretScrollGap.bottom, left: 0, right: 0 },
      scrollMargin: { top: caretScrollGap.top, bottom: caretScrollGap.bottom, left: 5, right: 5 },
      // Pasting raw markdown source (from VS Code, a terminal, another markdown
      // editor…) renders it as real formatting — lists, tables, task lists,
      // headings — instead of literal text. ProseMirror's default would drop it
      // in verbatim (lists as dashes, tables as `| … |`) or, worse, parse the
      // syntax-highlighting HTML those editors ship into a mess of empty
      // paragraphs (the stray blank line after a heading).
      //
      // We bail to the native handler when the clipboard carries genuinely rich
      // HTML (Word, Google Docs, a rendered web page): it has semantic tags a
      // markdown re-parse of the degraded plain text would lose. Editors that
      // copy markdown source only ship styled <span>/<div> markup — none of
      // these tags — so they fall through to our converter.
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData('text/plain') ?? ''
        if (!text.trim()) return false
        // Inside a code block markdown is literal source, not formatting — a `#`
        // comment must stay `#`, not become a heading. Bail to the native handler
        // (verbatim plain-text paste) whenever any ancestor of the selection is a
        // code node. We probe `type.spec.code` instead of the node name so this
        // holds for CodeBlockWithCopy regardless of its registered name.
        const { $from } = view.state.selection
        for (let depth = $from.depth; depth >= 0; depth--) {
          if ($from.node(depth).type.spec.code) return false
        }
        const html = event.clipboardData?.getData('text/html') ?? ''
        const richHtml = /<(a|strong|em|b|i|table|img|h[1-6]|blockquote)[\s>]/i.test(html)
        if (richHtml || !looksLikeMarkdown(text)) return false
        event.preventDefault()
        const dom = new window.DOMParser().parseFromString(htmlFromMarkdown(text), 'text/html')
        const slice = ProseMirrorDOMParser.fromSchema(view.state.schema).parseSlice(dom.body)
        view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView())
        return true
      },
      // Una nota arrastrada desde la sidebar lleva nuestro payload propio
      // (`application/x-noteflow-note-id`). Soltarla sobre el editor debe abrirla
      // en un panel dividido — eso lo hace el shell (`<main>` en App.tsx) —, NO
      // pegar el id como texto. Cortamos aquí el insert por defecto de ProseMirror
      // devolviendo true (hace preventDefault); el evento sigue burbujeando y el
      // onDrop del shell abre el split como corresponde.
      handleDrop: (_view, event) => {
        const dt = (event as DragEvent).dataTransfer
        if (dt?.types.includes('application/x-noteflow-note-id')) return true
        return false
      },
    },
    extensions: [
      // Nodes, marks and attributes: the document schema, shared with the
      // md<->editor round-trip tests (editorExtensions.ts).
      ...schemaExtensions(),
      History,
      Placeholder.configure({ placeholder }),
      SearchHighlight,
      // `(` → `()` with the caret inside, IDE-style (rules in lib/autoCloseBrackets.ts).
      AutoCloseBrackets,
      SlashCommands.configure({
        onLinkSection: () => setLinkPickerOpen(true),
        getLabels: () => getSlashCommands(tRef.current),
      }),
    ],
    content: htmlFromMarkdown(content),
    editable: !readOnly,
    autofocus: autoFocus,
    onUpdate({ editor }) {
      contentSave.schedule(noteId, 400, (run) => saveContent(editor, run))
    },
  })

  // Hands the editor's markdown to the store, remembering it so its echo isn't
  // taken for an external update. This is THE "nothing changed" check (the
  // parents don't compare with the store): it compares with what we last handed
  // off, since returning to the store's text while an older save is in flight
  // (an undo, Backspace) still has to be written. An update deferred while a
  // card field had focus is folded in first: this local edit (e.g. a card
  // committed with Enter, the field still open) must not be saved over it —
  // mid-composition the doc shouldn't be touched, so a timer save waits for it;
  // a flush (unmount, window closing) can't wait: it folds it in and saves now.
  const saveContent = (ed: TiptapEditor, run: SaveRun) => {
    if (deferredSyncRef.current && !ed.isDestroyed) {
      if (ed.view.composing && run === 'timer') {
        contentSave.schedule(noteId, 400, (next) => saveContent(ed, next))
        return
      }
      syncExternalContent(ed, true)
    }
    const md = htmlToMarkdown(ed.getHTML())
    if (!needsSave(contentSync, md, contentRef.current)) return
    recordSave(contentSync, md, contentRef.current)
    onChange(md)
  }

  // Brings the editor in line with the store's content (contentRef): echoes of
  // our own saves are ignored, genuine external content is applied even while
  // focused, or three-way merged with a local edit still in flight (the merge
  // is new local content, so it's saved). `localEdit`: called from a save,
  // whose edit is no longer on the debounce. Never applied while a widget field
  // (open kanban card) has focus: replacing the board under it could lose its
  // draft — deferred until focus leaves it (or a save, above). Nor during an IME
  // composition (dead keys, accents): replacing the DOM under it breaks it —
  // deferred until it ends.
  const syncExternalContent = (ed: TiptapEditor, localEdit = false) => {
    if (ed.isDestroyed) return
    const blocked = ed.view.composing
      || widgetFieldHasFocus(document.hasFocus(), ed.view.dom, document.activeElement)
    if (!localEdit && blocked) {
      deferredSyncRef.current = true
      return
    }
    deferredSyncRef.current = false
    const incoming = contentRef.current
    const parse = (md: string) => createDocument(htmlFromMarkdown(md), ed.schema)
    let incomingDoc: ProseMirrorNode | null = null
    const parsedIncoming = () => (incomingDoc ??= parse(incoming))
    const result = resolveExternalContent(contentSync, {
      incoming,
      current: htmlToMarkdown(ed.getHTML()),
      pending: localEdit || contentSave.isPending(),
      // A different serialization of the same document isn't a change.
      isEquivalent: () => parsedIncoming().eq(ed.state.doc),
      // Merge in the editor's own serialization (the stored markdown may differ).
      normalize: (md) => htmlToMarkdown(getHTMLFromFragment(parse(md).content, ed.schema)),
    })
    if (result.kind === 'apply') {
      replaceDocKeepingSelection(ed, parsedIncoming())
    } else if (result.kind === 'merge') {
      replaceDocKeepingSelection(ed, parse(result.merged))
      if (!localEdit) contentSave.schedule(noteId, 400, (run) => saveContent(ed, run))
    }
  }
  const syncExternalContentRef = useRef(syncExternalContent)
  useEffect(() => { syncExternalContentRef.current = syncExternalContent })

  useImperativeHandle(ref, () => ({ editor, getScrollContainer: () => scrollRef.current }), [editor])

  const tocItems = useTocItems(editor, showToc)
  const tocVisible = showToc && wideEnoughForToc && tocItems.length > 0

  useEffect(() => {
    const el = scrollRef.current
    if (!showToc || !el) return
    const observer = new ResizeObserver(([entry]) => {
      setWideEnoughForToc(entry.contentRect.width >= TOC_MIN_EDITOR_WIDTH)
    })
    observer.observe(el)
    return () => observer.disconnect()
    // `editor` is a dep because the scroller only mounts once the editor exists.
  }, [showToc, editor])

  // Open links in external browser on click
  useEffect(() => {
    if (!editor) return
    const handler = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('a')
      if (!target) return
      e.preventDefault()
      const href = target.getAttribute('href')
      if (href) window.noteflow.openUrl(href)
    }
    editor.view.dom.addEventListener('click', handler)
    return () => editor.view.dom.removeEventListener('click', handler)
  }, [editor])

  // Sync external content changes (another pane/window, a sync pull, the CLI…)
  // — also while focused: skipping then left the editor stale and the next
  // keystroke saved the old text over the update. The store lags behind the
  // editor (debounced, queued saves), so its echoes of our own saves are told
  // apart from genuine updates (syncExternalContent). `content` is a string: the
  // effect only runs for a new value, and nothing relies on re-running for the
  // same one (a deferred update re-runs from the listeners below).
  useEffect(() => {
    contentRef.current = content
    if (editor) syncExternalContent(editor)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content])

  // A deferred update is retried once focus leaves the widget field — after the
  // field's own blur commit (hence the timeout) —, the window goes to the
  // background, or a composition ends (ProseMirror reads the composed text a bit
  // after compositionend, hence the longer wait; still composing → deferred again).
  useEffect(() => {
    if (!editor) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const retryAfter = (ms: number) => () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        if (deferredSyncRef.current) syncExternalContentRef.current(editor)
      }, ms)
    }
    const retry = retryAfter(0)
    const retryAfterComposition = retryAfter(50)
    const dom = editor.view.dom
    dom.addEventListener('focusout', retry)
    dom.addEventListener('compositionend', retryAfterComposition)
    window.addEventListener('blur', retry)
    return () => {
      if (timer) clearTimeout(timer)
      dom.removeEventListener('focusout', retry)
      dom.removeEventListener('compositionend', retryAfterComposition)
      window.removeEventListener('blur', retry)
    }
  }, [editor])

  const insertImageFiles = useCallback(async (files: File[]) => {
    if (!editor) return
    for (const file of files.filter(f => f.type.startsWith('image/'))) {
      const src = await fileToBase64(file)
      editor.chain().focus().setImage({ src, alt: file.name }).run()
    }
  }, [editor])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!editor) return
      // Keys typed in a NodeView widget (kanban fields) aren't editor input.
      if (isEditorWidgetTarget(e.target)) return
      // Ctrl/Cmd+Shift+B → code block
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'B') {
        e.preventDefault()
        editor.chain().focus().toggleCodeBlock().run()
        return
      }

      // Intercept Enter to ensure we don't get trapped after a horizontal rule
      // or lose focus in weird edge cases.
      if (e.key === 'Enter' && !e.shiftKey) {
        const { state } = editor
        const { selection } = state
        const { $from } = selection

        // Check if we are right after a horizontal rule
        const nodeBefore = $from.nodeBefore
        if (nodeBefore && nodeBefore.type.name === 'horizontalRule') {
          // If we are, explicitly insert a paragraph to prevent getting trapped
          e.preventDefault()
          editor.chain().insertContent('<p></p>').focus().run()
          return
        }
      }
    },
    [editor]
  )

  if (!editor) return null

  return (
    <div
      className="flex flex-col h-full"
      onKeyDown={handleKeyDown}
      onPaste={(e: React.ClipboardEvent) => {
        // Pastes into a NodeView widget (a kanban card field) are the field's:
        // inserting the image at the ProseMirror selection could replace a
        // node-selected board.
        if (isEditorWidgetTarget(e.target)) return
        const imageItems = Array.from(e.clipboardData.items).filter(i => i.type.startsWith('image/'))
        if (imageItems.length === 0) return
        e.preventDefault()
        insertImageFiles(imageItems.map(i => i.getAsFile()).filter(Boolean) as File[])
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e: React.DragEvent) => {
        const files = Array.from(e.dataTransfer.files)
        // Files dropped on a NodeView widget (kanban board) aren't inserted at
        // the ProseMirror selection; just keep the browser from opening them.
        if (isEditorWidgetTarget(e.target)) {
          if (files.length > 0) e.preventDefault()
          return
        }
        if (!files.some(f => f.type.startsWith('image/'))) return
        e.preventDefault()
        e.stopPropagation()
        insertImageFiles(files)
      }}
    >
      {!readOnly && !hideToolbar && <EditorToolbar editor={editor} />}
      {/* Positioning context for the TOC: it floats over the scroller's right
          edge without scrolling with the content. Also the floating sidebar's
          content anchor: its panel/mini-view start where the text starts. */}
      <div className="relative flex-1 min-h-0" data-sidebar-anchor ref={sidebarAnchorRef}>
        <div
          ref={scrollRef}
          // overflow-x-hidden: nothing at note level needs horizontal scroll
          // (tables and code blocks scroll internally, images are capped at
          // 100%, ProseMirror wraps long words). Without it, `overflow-y: auto`
          // makes overflow-x resolve to `auto`, so anything poking past the
          // right edge (e.g. the absolutely-positioned task actions in readable
          // mode) would add a horizontal scrollbar to the whole note.
          // editor-has-toc reserves the TOC's room on the right (index.css).
          className={`editor-scroll h-full overflow-y-auto overflow-x-hidden${tocVisible ? ' editor-has-toc' : ''}`}
          style={{
            '--prose-font-size': fontSize ? `${fontSize}px` : undefined,
            '--prose-font-family': fontFamily === 'inter'
              ? "'Inter', sans-serif"
              : "'JetBrains Mono', 'Fira Code', monospace",
            '--toc-reserve': `${TOC_RESERVE}px`,
          } as React.CSSProperties}
        >
          <EditorContent
            editor={editor}
            className="h-full prose-editor"
          />
        </div>
        {tocVisible && <EditorToc editor={editor} items={tocItems} scrollRef={scrollRef} />}
      </div>
      {!readOnly && <TableContextMenu editor={editor} />}
      {linkPickerOpen && (
        <SectionLinkPicker
          editor={editor}
          currentSectionId={currentSectionId}
          onClose={() => setLinkPickerOpen(false)}
        />
      )}
    </div>
  )
})
