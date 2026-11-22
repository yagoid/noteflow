import { mergeAttributes, type Extensions } from '@tiptap/core'
import type { DOMOutputSpec } from '@tiptap/pm/model'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Bold from '@tiptap/extension-bold'
import Italic from '@tiptap/extension-italic'
import Underline from '@tiptap/extension-underline'
import Strike from '@tiptap/extension-strike'
import Highlight from '@tiptap/extension-highlight'
import Code from '@tiptap/extension-code'
import Heading from '@tiptap/extension-heading'
import Blockquote from '@tiptap/extension-blockquote'
import BulletList from '@tiptap/extension-bullet-list'
import OrderedList from '@tiptap/extension-ordered-list'
import ListItem from '@tiptap/extension-list-item'
import TaskList from '@tiptap/extension-task-list'
import Link from '@tiptap/extension-link'
import HardBreak from '@tiptap/extension-hard-break'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import { common, createLowlight } from 'lowlight'
import { CodeBlockWithCopy } from './CodeBlockWithCopy'
import { DeadlineTaskItem } from './DeadlineTaskItem'
import { ResizableImage } from './ResizableImage'
import { SectionRelation } from './SectionRelation'
import { KanbanBoard } from './KanbanBoard'
import { DrawingBlock } from './DrawingBlock'
import { COLUMN_WIDTH_ATTR, COLUMN_WIDTH_VAR, widthFromAttr, widthOfColwidth } from '../../lib/tableWidth'
import { withLanguageDetection } from '../../lib/codeLanguage'

// ── The editor's document schema ─────────────────────────────────────────────
//
// Every extension that defines a node, a mark or a node attribute of the note
// editor lives here, in the order Editor.tsx registers them. Editor.tsx spreads
// schemaExtensions() and only adds behaviour-only extensions (history,
// placeholder, search, slash commands…) on top. The md↔editor round-trip tests
// (tests/lib/editorRoundTrip.test.ts) build the schema from this same list
// with getSchema(), so they can't drift from what the app parses and saves.
// Anything added here that changes the schema must round-trip through
// lib/markdownHtml.ts (see .agents/context/patterns.md).

// Code blocks without a language are highlighted with the detected one (or left
// as plain text when unsure), see lib/codeLanguage.ts. Display only: the note
// keeps its bare fence.
const lowlight = withLanguageDetection(createLowlight(common))

// Kanban boards (KanbanBoard.ts) are in their own `topBlock` group, accepted only
// here: a board nested in a list, quote or table cell would be lost by the
// markdown serializer, so the schema keeps boards at the top level.
const TopLevelDocument = Document.extend({ content: '(block | topBlock)+' })

// Per-cell text alignment, serialized to/from `style="text-align:…"`. This is the
// exact attribute htmlToMarkdown reads from header cells to emit markdown's
// per-column `:---:` separators, so column alignment round-trips through .md.
const textAlignAttribute = {
  textAlign: {
    default: null as 'left' | 'center' | 'right' | null,
    parseHTML: (el: HTMLElement) =>
      (el.style.textAlign as 'left' | 'center' | 'right') || null,
    renderHTML: (attrs: { textAlign?: string | null }) =>
      attrs.textAlign ? { style: `text-align:${attrs.textAlign}` } : {},
  },
}
// Column width (lib/tableWidth.ts): prosemirror-tables' `colwidth` array with
// NoteFlow's meaning — `[n]` = n dashes of the markdown separator (n × 0.5em),
// not px — and the same on every cell of a column (htmlToMarkdown reads the
// header cell's). Its HTML is our own `data-nf-colw="n"` + `--nf-colw: n` (the
// value index.css § Tables sizes the cell from): the `colwidth="…"` px of other
// ProseMirror editors is no longer read, so a pasted table only keeps widths
// copied from NoteFlow. Off in the plain schema (linked notes): never read nor
// written, the separators stay `---`.
const columnWidthAttribute = (enabled: boolean) => ({
  colwidth: {
    default: null as number[] | null,
    parseHTML: (el: HTMLElement) => {
      const width = enabled ? widthFromAttr(el.getAttribute(COLUMN_WIDTH_ATTR)) : null
      return width === null ? null : [width]
    },
    renderHTML: (attrs: { colwidth?: unknown }) => {
      const width = enabled ? widthOfColwidth(attrs.colwidth) : null
      return width === null ? {} : { [COLUMN_WIDTH_ATTR]: String(width), style: `${COLUMN_WIDTH_VAR}:${width}` }
    },
  },
})
const alignedTableCell = (widths: boolean) => TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...columnWidthAttribute(widths), ...textAlignAttribute }
  },
})
const alignedTableHeader = (widths: boolean) => TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...columnWidthAttribute(widths), ...textAlignAttribute }
  },
})

// TipTap's Table.renderHTML sizes the <table> and its <col>s from `colwidth` in
// px (`style="width: Npx"` once every column has one): with NoteFlow's widths
// (dashes) that would break the layout — the <table> is the scroll box, sized
// to its content (index.css § Tables). It's rendered as TipTap renders a table
// without widths, whatever the widths: `min-width` of cellMinWidth per column
// on the <table> and each <col> (the cells size themselves from --nf-colw).
const NoteTable = Table.extend({
  renderHTML({ node, HTMLAttributes }) {
    const min = this.options.cellMinWidth
    let columns = 0
    node.firstChild?.forEach((cell) => { columns += Number(cell.attrs.colspan) || 1 })
    const cols: DOMOutputSpec[] = Array.from({ length: columns }, () => ['col', { style: `min-width: ${min}px` }])
    return [
      'table',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { style: `min-width: ${columns * min}px` }),
      ['colgroup', {}, ...cols],
      ['tbody', 0],
    ]
  },
})

// What a list item can hold: what markdown lists can write back (listElToMd).
// Its text (one or more paragraphs; extra ones are saved as line breaks of the
// first) and then nested lists. TipTap's default, `paragraph block*`, let a
// code block, heading, quote, table or rule live in an item (pasted HTML,
// slash commands), which the serializer dropped on save, and let Backspace at
// the start of the item after one with sub-items append its text AFTER the
// sub-list, which came back above it on reload. With this content ProseMirror
// fits such blocks outside the list, and that Backspace nests the item under
// the previous one (after its sub-items) instead.
const LIST_ITEM_CONTENT = 'paragraph+ list*'

// A markdown heading is one line (htmlToMarkdown writes a hard break in one as
// a space), so Shift+Enter / Mod+Enter in a heading splits it like Enter
// instead of inserting a break that wouldn't survive the save.
const LineBreak = HardBreak.extend({
  addKeyboardShortcuts() {
    const insert = () => (this.editor.isActive('heading')
      ? this.editor.commands.splitBlock()
      : this.editor.commands.setHardBreak())
    return { 'Mod-Enter': insert, 'Shift-Enter': insert }
  },
})

// Ctrl/Cmd+Shift+B is NoteFlow's code block shortcut (toolbar tooltip, Settings →
// Shortcuts). TipTap's Blockquote binds the same chord (`Mod-Shift-b`) to
// toggleBlockquote, so it's dropped there and bound on the code block instead,
// next to TipTap's own `Mod-Alt-c`. One keymap entry, one command: a separate
// handler for the chord ran on top of the blockquote one and wrapped the new code
// block in a quote. Quotes still come from the toolbar button and the `> ` rule.
const CodeBlock = CodeBlockWithCopy.extend({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      'Mod-Shift-b': () => this.editor.commands.toggleCodeBlock(),
    }
  },
})
const Quote = Blockquote.extend({
  addKeyboardShortcuts() {
    return {}
  },
})

export interface SchemaOptions {
  /**
   * Plain Markdown for linked notes (an external .md edited in place,
   * lib/linkedNotes.ts): no NoteFlow-only syntax — no underline (`++`) nor
   * highlight (`==`) marks (their toolbar buttons, shortcuts and input rules go
   * with them), no kanban boards, no section relations, and task items without
   * deadline / alarm / importance pickers. Pair it with
   * htmlFromMarkdown(md, { plain: true }), which reads that syntax as text.
   */
  plain?: boolean
  /** Display URL of an image src (linked notes: relative `assets/…` paths). The doc keeps the src. */
  imageSrc?: ((src: string) => string) | null
}

/** The schema-defining extensions of the note editor (fresh instances per call). */
export function schemaExtensions(opts: SchemaOptions = {}): Extensions {
  const plain = !!opts.plain
  return [
    // No topBlock group without kanban boards.
    plain ? Document : TopLevelDocument,
    Paragraph,
    Text,
    Bold,
    Italic,
    ...(plain ? [] : [Underline]),
    Strike,
    // `==text==` input rule → <mark>. multicolor off: a single accent-coloured
    // highlight (styled via CSS, no background) — see index.css `.ProseMirror mark`.
    ...(plain ? [] : [Highlight]),
    Code,
    CodeBlock.configure({ lowlight }),
    Heading.configure({ levels: [1, 2, 3] }),
    // `> ` input rule → blockquote (VSCode/markdown-style citation). Round-trips
    // to markdown via markdownHtml.ts; styled in index.css `.ProseMirror blockquote`.
    Quote,
    BulletList,
    OrderedList,
    ListItem.extend({ content: LIST_ITEM_CONTENT }),
    TaskList,
    DeadlineTaskItem.extend({ content: LIST_ITEM_CONTENT }).configure({ nested: true, plain }),
    // Plain Markdown (an external file) keeps links of any scheme (`vscode://`, `obsidian://`,
    // a NoteFlow relation link…): TipTap's default allowlist would drop the URL and leave only
    // the text on the next save. Script-like schemes stay out; clicks never navigate (Editor.tsx
    // hands them to openUrl, which only opens https).
    plain
      ? Link.configure({ openOnClick: false, autolink: false, isAllowedUri: (url) => !/^\s*(javascript|vbscript|data):/i.test(url) })
      : Link.configure({ openOnClick: false, autolink: false }),
    ResizableImage.configure({ inline: true, allowBase64: true, displaySrc: opts.imageSrc ?? null }),
    HorizontalRule,
    // resizable:false — no prosemirror-tables column resizing (its px widths and
    // TableView wrapper): columns fit their content unless the user gives one a
    // width, from the table controls (TableControls.tsx resize strips →
    // tableOps.setColumnWidth), saved as the separator's dash count (see
    // columnWidthAttribute above and lib/tableWidth.ts).
    NoteTable.configure({ resizable: false, HTMLAttributes: { class: 'md-table' } }),
    TableRow,
    alignedTableHeader(!plain),
    alignedTableCell(!plain),
    LineBreak,
    ...(plain ? [] : [SectionRelation, KanbanBoard, DrawingBlock]),
  ]
}
