import { useRef, useState } from 'react'
import type { CSSProperties, DragEvent, MouseEvent, ReactNode, Ref } from 'react'
import { LayoutGrid, Plus, Star } from 'lucide-react'
import { FolderGlyph, FolderIcon } from '../Sidebar/NoteFolderHeader'
import { colorChannels } from '../../lib/tagColors'
import {
  ALL_PLACE, FAVORITES_PLACE, UNGROUPED_PLACE, folderPlace, groupPlace, type ContentPlace,
} from '../../lib/contentView'
import { OWN_KEYS_PROPS } from '../../lib/keyScope'
import { moveIdNextTo, type DropPosition } from '../../lib/sidebarGroups'
import { useT } from '../../i18n/useT'
import type { NoteFolder, NoteGroup } from '../../types'

/**
 * The rail's inline input: a new folder in a group (from the group's context menu), "+ Group",
 * or renaming a group / folder.
 */
export type RailEdit =
  | { kind: 'add-folder'; groupId: string }
  | { kind: 'add-group' }
  | { kind: 'rename-group'; id: string }
  | { kind: 'rename-folder'; id: string }

export interface RailGroup {
  group: NoteGroup
  count: number
  folders: { folder: NoteFolder; count: number }[]
}

interface PlacesRailProps {
  /** Measured by the view's column handles. */
  railRef: Ref<HTMLElement>
  place: ContentPlace
  groups: RailGroup[]
  allCount: number
  favoritesCount: number
  ungroupedCount: number
  /** Place under a dragged note (highlighted as the drop target). */
  dropPlace: ContentPlace | null
  onSelect: (place: ContentPlace) => void
  onDragOverPlace: (e: DragEvent, place: ContentPlace) => void
  onDragLeavePlace: (e: DragEvent, place: ContentPlace) => void
  onDropPlace: (e: DragEvent, place: ContentPlace) => void
  /** The inline input open in the rail (owned by the view: the context menus open it too). */
  edit: RailEdit | null
  onEditChange: (edit: RailEdit | null) => void
  onCreateFolder: (groupId: string, name: string) => void
  onCreateGroup: (name: string) => void
  onRenameGroup: (groupId: string, name: string) => void
  onRenameFolder: (folderId: string, name: string) => void
  /** A folder dragged onto another of its group: the group's folders in their new order. */
  onReorderFolders: (groupId: string, orderedIds: string[]) => void
  /** Right click on a group / folder: the sidebar's menus (GroupContextMenu / FolderContextMenu). */
  onGroupContextMenu: (e: MouseEvent, groupId: string) => void
  onFolderContextMenu: (e: MouseEvent, folderId: string) => void
}

/**
 * Column 1 of the content view: everything, favorites, each group (G4 tab) with its folders
 * under the group's guide (it ends on the last folder; new folders come from the group's
 * context menu, their input after the folders), "+ Group" and "Ungrouped". Groups, folders
 * and "Ungrouped" are drop targets for notes dragged from the timeline (or the sidebar);
 * groups and folders open the sidebar's context menus and rename inline here. A folder can
 * be dragged among its group's folders to reorder them (the same `order` the sidebar
 * follows). Styles: `.cv-rail*` in index.css.
 */
export function PlacesRail({
  railRef, place, groups, allCount, favoritesCount, ungroupedCount, dropPlace, onSelect,
  onDragOverPlace, onDragLeavePlace, onDropPlace, edit, onEditChange, onCreateFolder, onCreateGroup,
  onRenameGroup, onRenameFolder, onReorderFolders, onGroupContextMenu, onFolderContextMenu,
}: PlacesRailProps) {
  const t = useT()
  const closeEdit = () => onEditChange(null)

  // ── Folder reorder (drag a folder among the folders of its group) ──
  const [folderDrag, setFolderDrag] = useState<{ id: string; groupId: string } | null>(null)
  const [folderDrop, setFolderDrop] = useState<{ id: string; position: DropPosition } | null>(null)
  const endFolderDrag = () => {
    setFolderDrag(null)
    setFolderDrop(null)
  }
  const folderDragOver = (e: DragEvent, target: { id: string; groupId: string }) => {
    if (!folderDrag || folderDrag.groupId !== target.groupId) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    if (target.id === folderDrag.id) {
      setFolderDrop(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const position: DropPosition = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    setFolderDrop((prev) => (prev?.id === target.id && prev.position === position ? prev : { id: target.id, position }))
  }
  const folderDropOn = (e: DragEvent, target: { id: string; groupId: string }) => {
    if (!folderDrag) return
    e.preventDefault()
    e.stopPropagation()
    const dragged = folderDrag
    const position = folderDrop?.id === target.id ? folderDrop.position : null
    endFolderDrag()
    if (dragged.groupId !== target.groupId || !position) return
    const ids = groups.find((g) => g.group.id === target.groupId)?.folders.map((f) => f.folder.id) ?? []
    const next = moveIdNextTo(ids, dragged.id, target.id, position)
    if (next) onReorderFolders(target.groupId, next)
  }

  const item = (
    p: ContentPlace,
    content: ReactNode,
    count: number,
    opts: {
      className?: string
      color?: string
      droppable?: boolean
      title?: string
      onContextMenu?: (e: MouseEvent) => void
      /** A folder: draggable to reorder it within its group. */
      folder?: { id: string; groupId: string }
    } = {},
  ) => {
    const folder = opts.folder
    const reorderMark = folder && folderDrop?.id === folder.id ? ` is-drop-${folderDrop.position}` : ''
    return (
      <button
        key={p}
        type="button"
        className={`cv-ri${opts.className ? ` ${opts.className}` : ''}${place === p ? ' is-on' : ''}${dropPlace === p ? ' is-drop' : ''}${reorderMark}${folder && folderDrag?.id === folder.id ? ' is-dragging' : ''}`}
        style={opts.color ? ({ '--g': opts.color } as CSSProperties) : undefined}
        aria-current={place === p ? 'true' : undefined}
        title={opts.title}
        onClick={() => onSelect(p)}
        onContextMenu={opts.onContextMenu}
        {...(folder
          ? {
              draggable: true,
              onDragStart: (e: DragEvent) => {
                e.dataTransfer.setData('application/x-noteflow-folder-id', folder.id)
                e.dataTransfer.effectAllowed = 'move'
                setFolderDrag(folder)
              },
              onDragEnd: endFolderDrag,
            }
          : {})}
        {...(opts.droppable
          ? {
              // While a folder is dragged the places aren't note drop targets: only its siblings take it.
              onDragOver: (e: DragEvent) => {
                if (folderDrag) { if (folder) folderDragOver(e, folder); return }
                onDragOverPlace(e, p)
              },
              onDragLeave: (e: DragEvent) => {
                if (folderDrag) {
                  const next = e.relatedTarget as Node | null
                  if (folder && !(next && e.currentTarget.contains(next))) {
                    setFolderDrop((prev) => (prev?.id === folder.id ? null : prev))
                  }
                  return
                }
                onDragLeavePlace(e, p)
              },
              onDrop: (e: DragEvent) => {
                if (folderDrag) { if (folder) folderDropOn(e, folder); return }
                onDropPlace(e, p)
              },
            }
          : {})}
      >
        {content}
        <span className="cv-count">{count}</span>
      </button>
    )
  }

  return (
    <nav ref={railRef} className="cv-rail cv-col" aria-label={t.contentView.placesLabel}>
      {item(ALL_PLACE, <><LayoutGrid size={14} strokeWidth={2} className="cv-ri-ico" aria-hidden /><span className="cv-ri-name">{t.contentView.all}</span></>, allCount)}
      {item(
        FAVORITES_PLACE,
        <><Star size={12} strokeWidth={2.4} className="cv-ri-star" aria-hidden /><span className="cv-ri-name">{t.contentView.favorites}</span></>,
        favoritesCount,
      )}

      <div className="cv-rail-lab">{t.contentView.placesLabel}</div>

      {groups.map(({ group, count, folders }) => {
        const addingFolder = edit?.kind === 'add-folder' && edit.groupId === group.id
        return (
          // The group and its folders; the guide (`.cv-rg.has-kids::before`) runs down to the
          // last folder or the new-folder input.
          <div
            key={group.id}
            className={`cv-rg${group.archived ? ' is-archived' : ''}${folders.length > 0 || addingFolder ? ' has-kids' : ''}`}
            style={{ '--g': colorChannels(group.color) } as CSSProperties}
          >
            {edit?.kind === 'rename-group' && edit.id === group.id ? (
              <InlineName
                key={`rename-${group.id}`}
                icon={<i className="sbg-tab" aria-hidden />}
                initialValue={group.name}
                placeholder={t.common.groupNamePlaceholder}
                onCommit={(name) => { closeEdit(); if (name !== group.name) onRenameGroup(group.id, name) }}
                onCancel={closeEdit}
              />
            ) : (
              item(
                groupPlace(group.id),
                <><i className="sbg-tab" aria-hidden /><span className="cv-ri-name">{group.name}</span></>,
                count,
                {
                  droppable: true,
                  title: group.archived ? t.contentView.archivedGroup : undefined,
                  onContextMenu: (e) => onGroupContextMenu(e, group.id),
                },
              )
            )}
            {folders.map(({ folder, count: folderCount }) =>
              edit?.kind === 'rename-folder' && edit.id === folder.id ? (
                <InlineName
                  key={`rename-${folder.id}`}
                  className="is-folder"
                  icon={<FolderIcon icon={folder.icon} />}
                  initialValue={folder.name}
                  placeholder={t.common.folderNamePlaceholder}
                  onCommit={(name) => { closeEdit(); if (name !== folder.name) onRenameFolder(folder.id, name) }}
                  onCancel={closeEdit}
                />
              ) : (
                item(
                  folderPlace(folder.id),
                  <><FolderIcon icon={folder.icon} /><span className="cv-ri-name">{folder.name}</span></>,
                  folderCount,
                  {
                    className: 'is-folder',
                    droppable: true,
                    onContextMenu: (e) => onFolderContextMenu(e, folder.id),
                    folder: { id: folder.id, groupId: group.id },
                  },
                )
              ),
            )}
            {addingFolder && (
              <InlineName
                className="is-folder"
                icon={<FolderGlyph />}
                placeholder={t.common.folderNamePlaceholder}
                onCommit={(name) => { closeEdit(); onCreateFolder(group.id, name) }}
                onCancel={closeEdit}
              />
            )}
          </div>
        )
      })}

      {edit?.kind === 'add-group' ? (
        <InlineName
          icon={<i className="sbg-tab cv-tab-new" aria-hidden />}
          placeholder={t.common.groupNamePlaceholder}
          onCommit={(name) => { closeEdit(); onCreateGroup(name) }}
          onCancel={closeEdit}
        />
      ) : (
        <button
          type="button"
          className="cv-ri cv-add"
          title={t.contentView.addGroupTooltip}
          onClick={() => onEditChange({ kind: 'add-group' })}
        >
          <Plus size={12} strokeWidth={2.4} className="cv-add-ico" aria-hidden />
          <span className="cv-ri-name">{t.contentView.addGroup}</span>
        </button>
      )}

      {item(
        UNGROUPED_PLACE,
        <><i className="sbg-tab" aria-hidden /><span className="cv-ri-name">{t.contentView.ungrouped}</span></>,
        ungroupedCount,
        { className: 'is-ungrouped', color: 'var(--text-muted)', droppable: true },
      )}
    </nav>
  )
}

interface InlineNameProps {
  className?: string
  icon: ReactNode
  /** Renaming: the current name, selected on focus. */
  initialValue?: string
  placeholder: string
  onCommit: (name: string) => void
  onCancel: () => void
}

/**
 * A new folder / "+ Group" (or a rename) as an input: Enter (or blur with text) commits, Esc
 * or an empty blur cancels.
 */
function InlineName({ className, icon, initialValue = '', placeholder, onCommit, onCancel }: InlineNameProps) {
  const [value, setValue] = useState(initialValue)
  // Enter unmounts the input; a late blur must not commit a second time.
  const doneRef = useRef(false)
  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    const name = value.trim()
    if (name) onCommit(name)
    else onCancel()
  }
  return (
    <div className={`cv-ri cv-ri-input${className ? ` ${className}` : ''}`}>
      {icon}
      <input
        autoFocus
        {...OWN_KEYS_PROPS}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onFocus={initialValue ? (e) => e.currentTarget.select() : undefined}
        onChange={(e) => setValue(e.target.value)}
        onBlur={finish}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); finish() }
          if (e.key === 'Escape') {
            // Not on to the view: its Escape would close the preview / the view.
            e.preventDefault()
            e.stopPropagation()
            doneRef.current = true
            onCancel()
          }
        }}
      />
    </div>
  )
}
