import { useEffect, useState } from 'react'
import { ChevronRight, Plus, Trash2 } from 'lucide-react'
import { ContextMenu } from './ContextMenu'
import { ConfirmModal } from './ConfirmModal'
import { FolderGlyph } from './Sidebar/NoteFolderHeader'
import { MENU_CLASS, MENU_DANGER_CLASS, MENU_ITEM_CLASS } from './contextMenuStyles'
import { useNotesStore } from '../stores/notesStore'
import { useGroupsStore } from '../stores/groupsStore'
import { FOLDER_ICONS, resolveFolderIcon } from '../lib/folderIcons'
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

// A cell of the icon picker grid (7 per row fill the w-44 menu); the current icon is ringed
// like the group colour swatches. The text colour lives only in the on/off classes (muted and
// text in the same class list would let the later Tailwind rule win).
const ICON_CELL_CLASS = 'h-5 flex items-center justify-center rounded hover:bg-surface-3 hover:text-text transition-colors'
const ICON_CELL_ON_CLASS = 'bg-surface-3 text-text ring-1 ring-text/40'
const ICON_CELL_OFF_CLASS = 'text-text-muted'

/**
 * A folder's context menu, shared by the sidebar and the content view's places rail: new
 * note, rename, change icon (a toggle row that unfolds the icon grid in place; picking one
 * applies it and closes) and delete (with its confirmation, which outlives the menu — like
 * NoteContextMenu). Closes on an outside click or Escape.
 */
export function FolderContextMenu({ request, onClose, onRename }: FolderContextMenuProps) {
  const t = useT()
  const folders = useGroupsStore((s) => s.folders)
  const deleteFolder = useGroupsStore((s) => s.deleteFolder)
  const setFolderIcon = useGroupsStore((s) => s.setFolderIcon)
  const createNote = useNotesStore((s) => s.createNote)
  // The delete confirmation outlives `request` (the menu closes when it opens).
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  // The icon grid is unfolded for one opening of the menu (a new request starts folded).
  const [iconsOpenFor, setIconsOpenFor] = useState<FolderContextMenuRequest | null>(null)
  const iconsOpen = request !== null && iconsOpenFor === request

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
          <button
            onClick={(e) => { e.stopPropagation(); setIconsOpenFor(iconsOpen ? null : request) }}
            className={MENU_ITEM_CLASS}
            aria-expanded={iconsOpen}
          >
            {t.common.changeFolderIcon}
            <ChevronRight size={10} className={`ml-auto transition-transform ${iconsOpen ? 'rotate-90' : ''}`} />
          </button>
          {iconsOpen && (() => {
            const current = resolveFolderIcon(folder.icon) ? folder.icon : null
            const pick = (e: React.MouseEvent, icon: string | null) => {
              e.stopPropagation()
              if (icon !== current) void setFolderIcon(folder.id, icon)
              onClose()
            }
            return (
              <div className="fld-ico-menu px-3 pt-1 pb-2 grid grid-cols-7 gap-0.5">
                <button
                  type="button"
                  title={t.common.defaultFolderIcon}
                  aria-label={t.common.defaultFolderIcon}
                  aria-pressed={current === null}
                  onClick={(e) => pick(e, null)}
                  className={`${ICON_CELL_CLASS} ${current === null ? ICON_CELL_ON_CLASS : ICON_CELL_OFF_CLASS}`}
                >
                  <FolderGlyph />
                </button>
                {FOLDER_ICONS.map(({ key, icon: Icon }) => {
                  const label = t.common.folderIcons[key]
                  return (
                    <button
                      key={key}
                      type="button"
                      title={label}
                      aria-label={label}
                      aria-pressed={current === key}
                      onClick={(e) => pick(e, key)}
                      className={`${ICON_CELL_CLASS} ${current === key ? ICON_CELL_ON_CLASS : ICON_CELL_OFF_CLASS}`}
                    >
                      <Icon size={12} />
                    </button>
                  )
                })}
              </div>
            )
          })()}
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
