import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { TableMap } from '@tiptap/pm/tables'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { COLUMN_WIDTH_LIVE_ATTR, COLUMN_WIDTH_LIVE_VAR } from '../../lib/tableWidth'

/** A column being resized: its table (the position before the node), index and width so far (dashes). */
export interface ColumnResizePreview {
  tablePos: number
  col: number
  width: number
}

export const columnResizeKey = new PluginKey<ColumnResizePreview | null>('tableColumnResize')

/** The live width of a column resize in progress, if any. */
export const columnResizePreview = (state: EditorState): ColumnResizePreview | null => columnResizeKey.getState(state) ?? null

/**
 * Show / drop the live width of a column being resized (TableControls.tsx): a
 * transaction with only this plugin's meta — the document doesn't change, so
 * nothing is saved and nothing goes to the undo history. The width is committed
 * on release by one setColumnWidth transaction.
 */
export function setColumnResizePreview(view: EditorView, preview: ColumnResizePreview | null): void {
  view.dispatch(view.state.tr.setMeta(columnResizeKey, preview).setMeta('addToHistory', false))
}

/**
 * The live width of a column while its resize strip is dragged: node
 * decorations put `data-nf-colw-live` / `--nf-colw-live` on every cell of that
 * column (index.css § Tables sizes them from it, over their own width). Their
 * own names, not `data-nf-colw`: when a decoration goes away ProseMirror
 * removes the attributes and style properties it set, which would strip a
 * cell's real width from the DOM after a cancelled drag. Behaviour only
 * (registered in Editor.tsx, not in the schema): nothing reaches the markdown.
 * The preview follows its table through document changes; it's dropped if the
 * table goes.
 */
export const TableColumnResize = Extension.create({
  name: 'tableColumnResize',

  addProseMirrorPlugins() {
    return [
      new Plugin<ColumnResizePreview | null>({
        key: columnResizeKey,
        state: {
          init: () => null,
          apply(tr, value) {
            const meta = tr.getMeta(columnResizeKey) as ColumnResizePreview | null | undefined
            if (meta !== undefined) return meta
            if (!value || !tr.docChanged) return value
            const mapped = tr.mapping.mapResult(value.tablePos, 1)
            return mapped.deleted ? null : { ...value, tablePos: mapped.pos }
          },
        },
        props: {
          decorations(state) {
            const preview = columnResizeKey.getState(state)
            if (!preview) return null
            const table = state.doc.nodeAt(preview.tablePos)
            if (!table || (table.type.spec as { tableRole?: string }).tableRole !== 'table') return null
            const map = TableMap.get(table)
            if (preview.col < 0 || preview.col >= map.width) return null
            const attrs = { [COLUMN_WIDTH_LIVE_ATTR]: String(preview.width), style: `${COLUMN_WIDTH_LIVE_VAR}: ${preview.width}` }
            const seen = new Set<number>()
            const decorations: Decoration[] = []
            for (let row = 0; row < map.height; row++) {
              const offset = map.map[row * map.width + preview.col]
              if (seen.has(offset)) continue
              seen.add(offset)
              const pos = preview.tablePos + 1 + offset
              decorations.push(Decoration.node(pos, pos + table.nodeAt(offset)!.nodeSize, attrs))
            }
            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})
