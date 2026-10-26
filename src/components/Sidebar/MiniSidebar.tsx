import { memo, useMemo } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import { colorChannels } from '../../lib/tagColors'
import {
  miniActiveRowIndex,
  miniSidebarCapacity,
  miniSidebarWindow,
  MINI_INDENT,
  MINI_ITEM_LEFT,
  MINI_ITEM_WIDTH,
  MINI_ROW_HEIGHT,
  MINI_ROW_PITCH,
  type MiniSidebarRow,
} from '../../lib/miniSidebar'
import type { GroupColor } from '../../types'

interface MiniSidebarProps {
  rows: readonly MiniSidebarRow[]
  /** Height (px) available for the rows. */
  height: number
}

const rgb = (color: GroupColor, alpha?: number) =>
  alpha == null ? `rgb(${colorChannels(color)})` : `rgb(${colorChannels(color)} / ${alpha})`

/**
 * Text-free miniature of the sidebar list, drawn while the sidebar floats: one
 * fixed-size row per real list row (notes = rectangles with their first section
 * colours, groups = pills, folders = outlined squares, headers = hairlines).
 * Only the rows that fit are rendered — a window centred on the active note
 * when the list is longer (lib/miniSidebar.ts). Purely visual (aria-hidden):
 * the strip around it opens the real panel.
 */
export const MiniSidebar = memo(function MiniSidebar({ rows, height }: MiniSidebarProps) {
  const activeNoteId = useNotesStore((s) => s.noteViewId ?? s.activeNoteId)
  const capacity = miniSidebarCapacity(height)
  const focusIndex = useMemo(() => miniActiveRowIndex(rows, activeNoteId), [rows, activeNoteId])
  const { start, end } = miniSidebarWindow(rows.length, capacity, focusIndex)

  const visible: React.ReactElement[] = []
  for (let i = start; i < end; i++) {
    const row = rows[i]
    const top = (i - start) * MINI_ROW_PITCH
    visible.push(<MiniRow key={row.key} row={row} top={top} active={row.kind === 'note' && row.noteId === activeNoteId} />)
  }
  return <>{visible}</>
})

const MiniRow = memo(function MiniRow({ row, top, active }: { row: MiniSidebarRow; top: number; active: boolean }) {
  const slot: React.CSSProperties = { position: 'absolute', top, height: MINI_ROW_HEIGHT, left: MINI_ITEM_LEFT }
  // Group guide line: a 1px segment per row spanning the gap below it, so the
  // rows of an expanded group read as one block (like the sidebar's guide).
  const guide = row.kind === 'note' ? row.guide : row.kind === 'folder' ? row.guide : null
  const guideEl = guide && (
    <span
      className="absolute"
      style={{ left: 0, top: MINI_ROW_HEIGHT - MINI_ROW_PITCH, width: 1, height: MINI_ROW_PITCH, background: rgb(guide, 0.45) }}
    />
  )

  switch (row.kind) {
    case 'separator':
      return (
        <span style={{ ...slot, width: MINI_ITEM_WIDTH, display: 'flex', alignItems: 'center' }}>
          <span className="block w-full" style={{ height: 1, background: 'rgb(var(--text-muted) / 0.35)' }} />
        </span>
      )
    case 'group':
      return (
        <span style={{ ...slot, width: MINI_ITEM_WIDTH, display: 'flex', alignItems: 'center', opacity: row.archived ? 0.5 : 1 }}>
          <span
            className="block rounded-full"
            style={{ width: row.collapsed ? 6 : 8, height: 3, background: rgb(row.color) }}
          />
        </span>
      )
    case 'folder': {
      const indent = MINI_INDENT
      return (
        <span style={{ ...slot, width: MINI_ITEM_WIDTH, paddingLeft: indent, display: 'flex', alignItems: 'center' }}>
          {guideEl}
          <span
            className="block rounded-[1px]"
            style={{
              width: 4,
              height: 4,
              border: `1px solid ${rgb(row.color, 0.9)}`,
              background: row.collapsed ? rgb(row.color, 0.35) : 'transparent',
            }}
          />
        </span>
      )
    }
    case 'note': {
      const indent = row.depth * MINI_INDENT
      return (
        <span style={{ ...slot, width: MINI_ITEM_WIDTH, paddingLeft: indent }}>
          {guideEl}
          <span
            className="flex items-center h-full overflow-hidden rounded-[1px]"
            style={{
              width: MINI_ITEM_WIDTH - indent,
              gap: 1,
              paddingLeft: 1,
              background: active ? 'rgb(var(--text) / 0.55)' : 'rgb(var(--text) / 0.16)',
              boxShadow: active ? '0 0 0 1px rgb(var(--text) / 0.35)' : undefined,
            }}
          >
            {row.colors.map((color, i) => (
              <span key={i} className="block flex-shrink-0" style={{ width: 2, height: 3, background: rgb(color) }} />
            ))}
          </span>
        </span>
      )
    }
  }
})
