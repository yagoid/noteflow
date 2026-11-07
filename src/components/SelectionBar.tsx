import { useEffect, useState } from 'react'
import { X, Folder, Star, StarOff, Trash2, FolderInput, ChevronRight, FolderMinus, Archive } from 'lucide-react'
import { colorChannels } from '../lib/tagColors'
import { useT } from '../i18n/useT'
import { tf } from '../i18n/format'
import type { NoteGroup, NoteFolder } from '../types'

interface SelectionBarProps {
  count: number
  allFavorited: boolean
  allArchived: boolean
  groups: NoteGroup[]
  /** The group the view stands on (marked in the group picker; enables "Move to folder"). */
  currentGroupId: string | null
  /** Folders of `currentGroupId` for the folder picker (omitted → no folder picker). */
  currentGroupFolders?: NoteFolder[]
  onFavorite: () => void
  onArchive: () => void
  onMoveToGroup: (groupId: string | undefined) => void
  onMoveToFolder?: (folderId: string | undefined) => void
  onDelete: () => void
  onClear: () => void
}

/**
 * Floating bar of batch actions over a multi-selection of notes (content view): favorite,
 * archive, move to a group (or to a folder of the current group) and delete. The host keeps
 * the selection and performs the actions; the delete confirmation is the host's too.
 */
export function SelectionBar({
  count,
  allFavorited,
  allArchived,
  groups,
  currentGroupId,
  currentGroupFolders,
  onFavorite,
  onArchive,
  onMoveToGroup,
  onMoveToFolder,
  onDelete,
  onClear,
}: SelectionBarProps) {
  const t = useT()
  const [picker, setPicker] = useState<'group' | 'folder' | null>(null)
  const folderPicker = Boolean(currentGroupId && currentGroupFolders && onMoveToFolder)

  // Close the open picker on outside click.
  useEffect(() => {
    if (!picker) return
    const close = () => setPicker(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [picker])

  const btn =
    'flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-mono text-text-muted hover:text-text hover:bg-text/10 transition-colors'

  return (
    <div
      className="pointer-events-auto relative flex items-center gap-1 rounded-lg border border-border bg-surface-2/95 backdrop-blur px-2 py-1.5 shadow-xl"
      role="toolbar"
      aria-label={t.overview.selectionActions}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="px-2 text-[11px] font-mono text-text whitespace-nowrap">
        {tf(t.overview.selectedCount, { count })}
      </span>
      <div className="w-px h-5 bg-border mx-0.5" />

      <button onClick={onFavorite} className={btn} title={allFavorited ? t.common.removeFromFavorites : t.common.addToFavorites}>
        {allFavorited ? <StarOff size={13} /> : <Star size={13} />}
        {allFavorited ? t.overview.unfavorite : t.overview.favorite}
      </button>

      <button onClick={onArchive} className={btn} title={allArchived ? t.common.unarchive : t.common.archive}>
        <Archive size={13} />
        {allArchived ? t.common.unarchive : t.common.archive}
      </button>

      {/* Move to group */}
      <div className="relative">
        <button
          onClick={(e) => { e.stopPropagation(); setPicker((p) => (p === 'group' ? null : 'group')) }}
          className={btn}
          title={t.common.moveToGroup}
        >
          <FolderInput size={13} />
          {t.common.moveToGroup}
          <ChevronRight size={10} className="rotate-90 opacity-60" />
        </button>
        {picker === 'group' && (
          <div className="absolute bottom-full left-0 mb-1.5 w-44 max-h-64 overflow-y-auto bg-surface-2 border border-border rounded shadow-xl py-1 animate-in fade-in zoom-in duration-100">
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => { onMoveToGroup(g.id) }}
                className={`w-full text-left px-3 py-1.5 text-xs font-mono flex items-center gap-2 transition-colors hover:bg-surface-3 hover:text-text ${g.id === currentGroupId ? 'text-text' : 'text-text-muted'}`}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: `rgb(${colorChannels(g.color)})` }} />
                <span className="truncate">{g.name}</span>
              </button>
            ))}
            <div className="h-px bg-border my-1" />
            <button
              onClick={() => { onMoveToGroup(undefined) }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text-muted hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
            >
              <FolderMinus size={12} />
              {t.overview.noGroup}
            </button>
          </div>
        )}
      </div>

      {/* Move to folder (within the current group) */}
      {folderPicker && (
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setPicker((p) => (p === 'folder' ? null : 'folder')) }}
            className={btn}
            title={t.overview.moveToFolderTooltip}
          >
            <Folder size={13} />
            {t.common.moveToFolder}
            <ChevronRight size={10} className="rotate-90 opacity-60" />
          </button>
          {picker === 'folder' && (
            <div className="absolute bottom-full left-0 mb-1.5 w-44 max-h-64 overflow-y-auto bg-surface-2 border border-border rounded shadow-xl py-1 animate-in fade-in zoom-in duration-100">
              <button
                onClick={() => { onMoveToFolder?.(undefined) }}
                className="w-full text-left px-3 py-1.5 text-xs font-mono text-text-muted hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
              >
                <FolderMinus size={12} />
                {t.common.groupRoot}
              </button>
              {currentGroupFolders?.map((f) => (
                <button
                  key={f.id}
                  onClick={() => { onMoveToFolder?.(f.id) }}
                  className="w-full text-left px-3 py-1.5 text-xs font-mono text-text-muted hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
                >
                  <Folder size={12} className="flex-shrink-0" />
                  <span className="truncate">{f.name}</span>
                </button>
              ))}
              {currentGroupFolders?.length === 0 && (
                <div className="px-3 py-1.5 text-[10px] font-mono text-text-muted/60">{t.common.noFoldersYet}</div>
              )}
            </div>
          )}
        </div>
      )}

      <button
        onClick={onDelete}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-mono text-red/75 hover:text-red hover:bg-red/10 transition-colors"
        title={t.overview.deleteSelected}
      >
        <Trash2 size={13} />
        {t.common.delete}
      </button>

      <div className="w-px h-5 bg-border mx-0.5" />
      <button
        onClick={onClear}
        className="flex items-center justify-center w-7 h-7 rounded text-text-muted hover:text-text hover:bg-text/10 transition-colors"
        title={t.overview.clearSelection}
      >
        <X size={14} />
      </button>
    </div>
  )
}
