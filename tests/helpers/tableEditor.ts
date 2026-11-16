// A real TipTap editor wired like the note editor (Editor.tsx) for the table
// keyboard / clipboard tests: the schema extensions, history, the behaviour
// extensions that bind keys around tables (in Editor.tsx's order) and the same
// handlePaste editor prop. Keys go through ProseMirror's own keydown dispatch
// (handleKeyDown props, the path a real key press takes); copy / cut / paste
// are real ClipboardEvents dispatched on the editor's DOM, handled by
// ProseMirror's own clipboard code.
//
// Needs a DOM: only import this from test files with `// @vitest-environment happy-dom`.

import { expect } from 'vitest'
import { Editor, type Extensions } from '@tiptap/core'
import History from '@tiptap/extension-history'
import type { Node as PMNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { CellSelection, TableMap } from '@tiptap/pm/tables'
import { schemaExtensions } from '../../src/components/Editor/editorExtensions'
import { AutoCloseBrackets } from '../../src/components/Editor/AutoCloseBrackets'
import { ListItemMove } from '../../src/components/Editor/ListItemMove'
import { TableKeymap } from '../../src/components/Editor/TableKeymap'
import { TableClipboard, handleEditorPaste } from '../../src/components/Editor/tableClipboard'
import { htmlFromMarkdown, htmlToMarkdown } from '../../src/lib/markdownHtml'
import { load, save } from './editorPipeline'

let current: Editor | null = null

/** Destroy the editor of the last test (call from afterEach). */
export function destroyEditor(): void {
  current?.destroy()
  current = null
}

export interface EditorOptions {
  /** HTML content instead of markdown (for structures markdown can't write). */
  html?: string
  editable?: boolean
  /** Extensions before the note editor's ones (e.g. to check keymap priority). */
  first?: Extensions
}

/** A note editor on `md`, wired like Editor.tsx. */
export function makeEditor(md: string, opts: EditorOptions = {}): Editor {
  destroyEditor()
  current = new Editor({
    extensions: [
      ...(opts.first ?? []),
      ...schemaExtensions(),
      History,
      AutoCloseBrackets,
      ListItemMove,
      TableKeymap,
      TableClipboard,
    ],
    content: opts.html ?? htmlFromMarkdown(md),
    editable: opts.editable ?? true,
    editorProps: {
      handlePaste: (view, event, slice) => handleEditorPaste(view, event, slice),
    },
  })
  return current
}

export const markdown = (ed: Editor) => htmlToMarkdown(ed.getHTML()).trim()

/** The markdown survives a save → open → save cycle unchanged. */
export function expectRoundTrip(ed: Editor): void {
  const md = save(ed.state.doc)
  expect(save(load(md)), md).toBe(md)
}

/**
 * Every table is a valid markdown table: row 0 header cells, the rest body
 * cells, no spans, rectangular, no nested tables, and each column's width on
 * every cell of it (its header cell's).
 */
export function checkTables(doc: PMNode): void {
  doc.check()
  doc.descendants((n) => {
    if (n.type.name !== 'table') return true
    const map = TableMap.get(n)
    expect(map.problems ?? null).toBeNull()
    n.forEach((row, _, r) => {
      expect(row.childCount).toBe(map.width)
      row.forEach((cell, __, c) => {
        expect(cell.type.name).toBe(r === 0 ? 'tableHeader' : 'tableCell')
        expect(cell.attrs.colwidth, `width of cell (${r}, ${c})`).toEqual(n.firstChild!.child(c).attrs.colwidth)
        expect(cell.attrs.colspan).toBe(1)
        expect(cell.attrs.rowspan).toBe(1)
        cell.descendants((inner) => { expect(inner.type.name).not.toBe('table') })
      })
    })
    return false
  })
}

/** Position of the first text node containing `text`, + its length (the caret after it). */
export function textEnd(doc: PMNode, text: string): number {
  let pos = -1
  doc.descendants((node, at) => {
    if (pos < 0 && node.isText && node.text!.includes(text)) pos = at + node.text!.indexOf(text) + text.length
    return pos < 0
  })
  if (pos < 0) throw new Error(`"${text}" not found`)
  return pos
}

/** Caret right after the first occurrence of `text`. */
export function caretIn(ed: Editor, text: string): void {
  ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, textEnd(ed.state.doc, text))))
}

/** Position of the n-th table (0-based) of the document. */
export function tablePos(ed: Editor, n = 0): number {
  let found = -1
  let i = 0
  ed.state.doc.descendants((node, pos) => {
    if (found >= 0) return false
    if (node.type.name === 'table' && i++ === n) found = pos
    return node.type.name !== 'table'
  })
  if (found < 0) throw new Error(`no table ${n}`)
  return found
}

/** Position of cell (row, col) of the n-th table. */
export function cellPos(ed: Editor, row: number, col: number, n = 0): number {
  const at = tablePos(ed, n)
  const table = ed.state.doc.nodeAt(at)!
  return at + 1 + TableMap.get(table).positionAt(row, col, table)
}

/** Select cells (r1, c1) … (r2, c2) of the n-th table as a CellSelection. */
export function selectCells(ed: Editor, a: [number, number], b: [number, number], n = 0): void {
  ed.view.dispatch(ed.state.tr.setSelection(CellSelection.create(ed.state.doc, cellPos(ed, ...a, n), cellPos(ed, ...b, n))))
}

/** Caret at the start of cell (row, col) of the n-th table. */
export function caretInCell(ed: Editor, row: number, col: number, n = 0): void {
  ed.view.dispatch(ed.state.tr.setSelection(TextSelection.near(ed.state.doc.resolve(cellPos(ed, row, col, n) + 1))))
}

/** [row, col] of the cell holding the selection's head (or a CellSelection's head cell). */
export function headCell(ed: Editor): [number, number] | null {
  const sel = ed.state.selection
  const $pos = sel instanceof CellSelection ? sel.$headCell : sel.$head
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name === 'table') {
      const table = $pos.node(d)
      const cellStart = sel instanceof CellSelection ? $pos.pos : $pos.before(d + 2)
      const rect = TableMap.get(table).findCell(cellStart - $pos.start(d))
      return [rect.top, rect.left]
    }
  }
  return null
}

// ── Keys ─────────────────────────────────────────────────────────────────────

const mac = typeof navigator !== 'undefined' && /Mac|iP(hone|[oa]d)/.test(navigator.platform)

/**
 * Press `chord` ('Mod-Enter', 'Alt-Shift-Backspace', 'Tab'…) as the browser
 * reports it. Returns whether a handler took it (preventDefault). `Mod` is Ctrl
 * off macOS, Meta on it — the platform ProseMirror detects.
 */
export function press(ed: Editor, chord: string): boolean {
  const parts = chord.split('-')
  let key = parts.pop()!
  if (key === '') key = '-'
  const mods = new Set(parts)
  const shift = mods.has('Shift')
  if (key.length === 1) key = shift ? key.toUpperCase() : key.toLowerCase()
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: mods.has('Ctrl') || (mods.has('Mod') && !mac),
    metaKey: mods.has('Meta') || (mods.has('Mod') && mac),
    altKey: mods.has('Alt'),
    shiftKey: shift,
    bubbles: true,
    cancelable: true,
  })
  const { view } = ed
  return view.someProp('handleKeyDown', (f) => f(view, event)) ?? false
}

// ── Clipboard ────────────────────────────────────────────────────────────────

export interface ClipboardContent {
  text?: string
  html?: string
}

function clipboardEvent(type: 'copy' | 'cut' | 'paste', data: ClipboardContent = {}): { event: ClipboardEvent; dt: DataTransfer } {
  const dt = new DataTransfer()
  if (data.html !== undefined) dt.setData('text/html', data.html)
  if (data.text !== undefined) dt.setData('text/plain', data.text)
  return { event: new ClipboardEvent(type, { clipboardData: dt, bubbles: true, cancelable: true }), dt }
}

/** Copy (or cut) the selection; what ended up on the clipboard. */
export function copy(ed: Editor, type: 'copy' | 'cut' = 'copy'): Required<ClipboardContent> {
  const { event, dt } = clipboardEvent(type)
  ed.view.dom.dispatchEvent(event)
  return { text: dt.getData('text/plain'), html: dt.getData('text/html') }
}

/** Paste `data` at the selection. */
export function paste(ed: Editor, data: ClipboardContent): void {
  ed.view.dom.dispatchEvent(clipboardEvent('paste', data).event)
}
