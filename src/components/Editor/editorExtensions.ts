import type { Extensions } from '@tiptap/core'
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

// ── The editor's document schema ─────────────────────────────────────────────
//
// Every extension that defines a node, a mark or a node attribute of the note
// editor lives here, in the order Editor.tsx registers them. Editor.tsx spreads
// schemaExtensions() and only adds behaviour-only extensions (history,
// placeholder, search, slash commands…) on top. The md↔editor round-trip tests
// (tests/lib/editorRoundTrip.test.ts) build the schema from this same list
// with getSchema(), so they can't drift from what the app parses and saves.
// Anything added here that changes the schema must round-trip through
// lib/markdownHtml.ts (see .claude/context/patterns.md).

const lowlight = createLowlight(common)

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
const AlignedTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...textAlignAttribute }
  },
})
const AlignedTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...textAlignAttribute }
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

/** The schema-defining extensions of the note editor (fresh instances per call). */
export function schemaExtensions(): Extensions {
  return [
    TopLevelDocument,
    Paragraph,
    Text,
    Bold,
    Italic,
    Underline,
    Strike,
    // `==text==` input rule → <mark>. multicolor off: a single accent-coloured
    // highlight (styled via CSS, no background) — see index.css `.ProseMirror mark`.
    Highlight,
    Code,
    CodeBlockWithCopy.configure({ lowlight }),
    Heading.configure({ levels: [1, 2, 3] }),
    // `> ` input rule → blockquote (VSCode/markdown-style citation). Round-trips
    // to markdown via markdownHtml.ts; styled in index.css `.ProseMirror blockquote`.
    Blockquote,
    BulletList,
    OrderedList,
    ListItem.extend({ content: LIST_ITEM_CONTENT }),
    TaskList,
    DeadlineTaskItem.extend({ content: LIST_ITEM_CONTENT }).configure({ nested: true }),
    Link.configure({ openOnClick: false, autolink: false }),
    ResizableImage.configure({ inline: true, allowBase64: true }),
    HorizontalRule,
    // resizable:false — column widths can't be stored in portable markdown, so
    // tables fill the available width with evenly distributed columns instead of
    // offering a resize affordance that silently resets on reload.
    Table.configure({ resizable: false, HTMLAttributes: { class: 'md-table' } }),
    TableRow,
    AlignedTableHeader,
    AlignedTableCell,
    LineBreak,
    SectionRelation,
    KanbanBoard,
  ]
}
