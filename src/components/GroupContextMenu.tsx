import { useEffect, useState } from 'react'
import { Archive, ArchiveRestore, FolderPlus, LayoutGrid, Plus, Trash2 } from 'lucide-react'
import { ContextMenu } from './ContextMenu'
import { ConfirmModal } from './ConfirmModal'
import { CustomColorSwatch } from './CustomColorSwatch'
import { MENU_CLASS, MENU_DANGER_CLASS, MENU_ITEM_CLASS } from './contextMenuStyles'
import { useNotesStore } from '../stores/notesStore'
import { useGroupsStore } from '../stores/groupsStore'
import { colorChannels, TAG_COLOR_VARS } from '../lib/tagColors'
import { useT } from '../i18n/useT'
import { tf } from '../i18n/format'
import type { GroupColor } from '../types'

export interface GroupContextMenuRequest {
  x: number
  y: number
  groupId: string
}

interface GroupContextMenuProps {
  request: GroupContextMenuRequest | null
  onClose: () => void
  /** "View group" (the sidebar). Left out where the content view already shows the group (its rail). */
  onOpenGroupView?: (groupId: string) => void
  /** "New folder": each caller opens its own inline name input. */
  onNewFolder: (groupId: string) => void
  /** "Rename group": each caller renames inline in its own list. */
  onRename: (groupId: string) => void
}

const GROUP_COLORS: GroupColor[] = [...TAG_COLOR_VARS]

/**
 * A group's context menu, shared by the sidebar and the content view's places rail: view
 * group (sidebar only), new note / folder, rename, colour (presets + custom), archive and
 * delete (with its confirmation, which outlives the menu — like NoteContextMenu). Closes on
 * an outside click or Escape.
 */
export function GroupContextMenu({ request, onClose, onOpenGroupView, onNewFolder, onRename }: GroupContextMenuProps) {
  const t = useT()
  const groups = useGroupsStore((s) => s.groups)
  const setGroupColor = useGroupsStore((s) => s.setGroupColor)
  const toggleGroupArchived = useGroupsStore((s) => s.toggleGroupArchived)
  const deleteGroup = useGroupsStore((s) => s.deleteGroup)
  const createNote = useNotesStore((s) => s.createNote)
  const updateNote = useNotesStore((s) => s.updateNote)
  // The delete confirmation outlives `request` (the menu closes when it opens).
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  useEffect(() => {
    if (!request) return
    const close = () => onClose()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('click', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [request, onClose])

  const group = request ? groups.find((g) => g.id === request.groupId) : undefined
  const deleting = confirmDeleteId ? groups.find((g) => g.id === confirmDeleteId) : undefined

  return (
    <>
      {request && group && (
        <ContextMenu x={request.x} y={request.y} className={MENU_CLASS}>
          {onOpenGroupView && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onOpenGroupView(group.id); onClose() }}
                className={MENU_ITEM_CLASS}
              >
                <LayoutGrid size={12} />
                {t.sidebar.viewGroup}
              </button>
              <div className="h-px bg-border my-1" />
            </>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); void createNote({ group: group.id }) }}
            className={MENU_ITEM_CLASS}
          >
            <Plus size={12} />
            {t.common.newNote}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); onNewFolder(group.id) }}
            className={MENU_ITEM_CLASS}
          >
            <FolderPlus size={12} />
            {t.common.newFolder}
          </button>
          <div className="h-px bg-border my-1" />
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); onRename(group.id) }}
            className={MENU_ITEM_CLASS}
          >
            {t.common.renameGroup}
          </button>

          {/* Color picker */}
          <div className="px-3 py-2">
            <div className="flex gap-1">
              {GROUP_COLORS.map((color) => (
                <button
                  key={color}
                  title={color.replace('--', '')}
                  onClick={(e) => {
                    e.stopPropagation()
                    void setGroupColor(group.id, color)
                    onClose()
                  }}
                  className={`w-4 h-4 rounded-full transition-transform hover:scale-110 ${group.color === color ? 'ring-1 ring-white/50 ring-offset-1 ring-offset-surface-2' : ''}`}
                  style={{ background: `rgb(${colorChannels(color)})` }}
                />
              ))}
              <CustomColorSwatch
                value={group.color}
                onPick={(c) => { void setGroupColor(group.id, c) }}
              />
            </div>
          </div>

          <div className="h-px bg-border my-1" />
          <button
            onClick={(e) => {
              e.stopPropagation()
              void toggleGroupArchived(group.id)
              onClose()
            }}
            className={MENU_ITEM_CLASS}
          >
            {group.archived ? <ArchiveRestore size={12} /> : <Archive size={12} />}
            {group.archived ? t.common.unarchiveGroup : t.sidebar.archiveGroup}
          </button>

          <div className="h-px bg-border my-1" />
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClose()
              setConfirmDeleteId(group.id)
            }}
            className={MENU_DANGER_CLASS}
          >
            <Trash2 size={12} />
            {t.sidebar.deleteGroup}
          </button>
        </ContextMenu>
      )}

      {deleting && (
        <ConfirmModal
          title={t.sidebar.deleteGroup}
          message={tf(t.sidebar.deleteGroupMessage, { name: deleting.name })}
          confirmLabel={t.common.delete}
          danger
          onConfirm={async () => {
            setConfirmDeleteId(null)
            // Clear the group field from every note in this group
            const affected = useNotesStore.getState().notes.filter((n) => n.group === deleting.id)
            for (const n of affected) {
              await updateNote(n.id, { group: undefined })
            }
            void deleteGroup(deleting.id)
          }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </>
  )
}
