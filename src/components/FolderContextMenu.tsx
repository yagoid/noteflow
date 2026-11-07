import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { ContextMenu } from './ContextMenu'
import { ConfirmModal } from './ConfirmModal'
import { MENU_CLASS, MENU_DANGER_CLASS, MENU_ITEM_CLASS } from './contextMenuStyles'
import { useNotesStore } from '../stores/notesStore'
import { useGroupsStore } from '../stores/groupsStore'
import { useT } from '../i18n/useT'
import { tf } from '../i18n/format'

export interface FolderContextMenuRequest {
  x: number
  y: number
  folderId: string
}

interface FolderContextMenuProps {
  request: FolderContextMenuRequest | null
  onClose: () => void
  /** "Rename folder": each caller renames inline in its own list. */
  onRename: (folderId: string) => void
}

/**
 * A folder's context menu, shared by the sidebar and the content view's places rail: new
 * note, rename and delete (with its confirmation, which outlives the menu — like
 * NoteContextMenu). Closes on an outside click or Escape.
 */
export function FolderContextMenu({ request, onClose, onRename }: FolderContextMenuProps) {
  const t = useT()
  const folders = useGroupsStore((s) => s.folders)
  const deleteFolder = useGroupsStore((s) => s.deleteFolder)
  const createNote = useNotesStore((s) => s.createNote)
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

  const folder = request ? folders.find((f) => f.id === request.folderId) : undefined
  const deleting = confirmDeleteId ? folders.find((f) => f.id === confirmDeleteId) : undefined

  return (
    <>
      {request && folder && (
        <ContextMenu x={request.x} y={request.y} className={MENU_CLASS}>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); void createNote({ group: folder.groupId, folder: folder.id }) }}
            className={MENU_ITEM_CLASS}
          >
            <Plus size={12} />
            {t.common.newNote}
          </button>
          <div className="h-px bg-border my-1" />
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); onRename(folder.id) }}
            className={MENU_ITEM_CLASS}
          >
            {t.common.renameFolder}
          </button>
          <div className="h-px bg-border my-1" />
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClose()
              setConfirmDeleteId(folder.id)
            }}
            className={MENU_DANGER_CLASS}
          >
            <Trash2 size={12} />
            {t.common.deleteFolder}
          </button>
        </ContextMenu>
      )}

      {deleting && (
        <ConfirmModal
          title={t.common.deleteFolder}
          message={tf(t.common.deleteFolderMessage, { name: deleting.name })}
          confirmLabel={t.common.delete}
          danger
          onConfirm={() => { setConfirmDeleteId(null); void deleteFolder(deleting.id) }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </>
  )
}
