import { ChevronRight, Folder, type LucideProps } from 'lucide-react'
import { resolveFolderIcon } from '../../lib/folderIcons'
import type { NoteFolder } from '../../types'

interface NoteFolderHeaderProps {
  folder: NoteFolder
  noteCount: number
  collapsed: boolean
  /** Position in its group's body (unfold stagger), already capped. */
  staggerIndex: number
  onToggle: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

/**
 * Default folder icon, with a flap that opens when the folder is expanded (`.sbg-folder` in
 * index.css). Shown by FolderIcon when the folder has no custom icon, and as is by the
 * new-folder inputs.
 */
export function FolderGlyph() {
  return (
    <svg className="sbg-folder" width="14" height="13" viewBox="0 0 16 14" aria-hidden>
      <path className="sbg-folder-b" d="M1.5 3.1c0-.9.7-1.6 1.6-1.6h3.2l1.6 1.7h5c.9 0 1.6.7 1.6 1.6v6.5c0 .9-.7 1.6-1.6 1.6H3.1c-.9 0-1.6-.7-1.6-1.6z" />
      <path className="sbg-folder-f" d="M1.5 6h13v5.3c0 .9-.7 1.6-1.6 1.6H3.1c-.9 0-1.6-.7-1.6-1.6z" />
    </svg>
  )
}

/**
 * A specific folder's icon in lucide-styled lists (move-to-folder menus, group peek): its
 * custom icon (`NoteFolder.icon`, lib/folderIcons.ts), or lucide's Folder when unset / unknown.
 */
export function FolderListIcon({ icon, ...props }: { icon?: string } & LucideProps) {
  const Icon = resolveFolderIcon(icon) ?? Folder
  // eslint-disable-next-line react-hooks/static-components -- a module-level lucide icon (stable identity), not a component created here
  return <Icon {...props} />
}

/**
 * A specific folder's icon where the folder glyph is shown (sidebar, content view): its
 * custom icon at the glyph's size, or the default FolderGlyph when unset / unknown.
 * `.sbg-folder-ico` in index.css gives it the glyph's muted colour and open-note accent.
 */
export function FolderIcon({ icon }: { icon?: string }) {
  if (!resolveFolderIcon(icon)) return <FolderGlyph />
  return <FolderListIcon icon={icon} className="sbg-folder-ico" size={13} strokeWidth={2} aria-hidden />
}

/**
 * Folder header inside a group ("index with guides"): sticky under the group header,
 * folder icon, name, count and a hover/focus-only chevron. Colour (`--g`), collapsed and
 * open-note state come from the `.sbg-f` wrapper in Sidebar. Styles: `.sbg-*` in index.css.
 */
export function NoteFolderHeader({
  folder,
  noteCount,
  collapsed,
  staggerIndex,
  onToggle,
  onContextMenu,
}: NoteFolderHeaderProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={!collapsed}
      className="sbg-fh select-none"
      style={{ '--i': staggerIndex } as React.CSSProperties}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
        e.preventDefault()
        onToggle()
      }}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e) }}
    >
      <FolderIcon icon={folder.icon} />
      <span className="sbg-fname font-mono">{folder.name}</span>
      <span className="sbg-sp" />
      <span className="sbg-count font-mono">{noteCount}</span>
      <span className="sbg-chev" aria-hidden>
        <ChevronRight size={12} strokeWidth={2.6} />
      </span>
    </div>
  )
}
