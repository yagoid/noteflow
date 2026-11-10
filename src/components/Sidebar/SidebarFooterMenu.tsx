import { useEffect, useRef, type ReactNode } from 'react'
import { Archive, Check, Map as MapIcon, Moon, Rows3, Sun } from 'lucide-react'
import { ContextMenu } from '../ContextMenu'
import { useNotesStore } from '../../stores/notesStore'
import { useThemeStore } from '../../stores/themeStore'
import { DEFAULT_THEME_ID, LIGHT_THEME_ID } from '../../lib/themes'
import { useT } from '../../i18n/useT'

// Quick light/dark switch: the app's own two themes (lib/themes.ts).
const DARK_THEME_ID = DEFAULT_THEME_ID

/**
 * The sidebar footer's ⋯ menu: Theme (NoteFlow Light / Dark) · Sections (map / row) · Show archived.
 * Opens upwards with its bottom edge at `y` (the button's top). Mounted only while open, so its
 * store subscriptions don't re-render the Sidebar. Uses the same store actions as Settings →
 * Appearance (setTheme / setSidebarSectionsStyle).
 */
export function SidebarFooterMenu({ x, y, onClose }: { x: number; y: number; onClose: () => void }) {
  const t = useT()
  const activeThemeId = useThemeStore((s) => s.activeThemeId)
  const setTheme = useThemeStore((s) => s.setTheme)
  const sectionsStyle = useThemeStore((s) => s.sidebarSectionsStyle)
  const setSectionsStyle = useThemeStore((s) => s.setSidebarSectionsStyle)
  const showArchived = useNotesStore((s) => s.showArchived)
  const setShowArchived = useNotesStore((s) => s.setShowArchived)
  const firstItemRef = useRef<HTMLButtonElement>(null)

  // Focus the first item on open; on close, hand focus back to whatever had it (the ⋯ button)
  // unless the user already moved it elsewhere.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const menu = firstItemRef.current?.closest('[role="menu"]') ?? null
    firstItemRef.current?.focus()
    return () => {
      const current = document.activeElement
      if (current === document.body || (menu && menu.contains(current))) previous?.focus?.()
    }
  }, [])

  const choose = (action: () => void) => () => { action(); onClose() }

  return (
    <ContextMenu
      x={x}
      y={y}
      placement="above"
      // w-52 = FOOTER_MENU_WIDTH in Sidebar.tsx (right-aligns it with the button).
      className="fixed z-50 bg-surface-2 border border-border rounded-lg shadow-xl py-1 w-52"
    >
      <div role="menu" aria-label={t.sidebar.moreOptions}>
        <div role="group" aria-label={t.sidebar.menuTheme}>
          <MenuLabel>{t.sidebar.menuTheme}</MenuLabel>
          <CheckItem
            buttonRef={firstItemRef}
            icon={<Sun size={12} />}
            label={t.sidebar.themeLight}
            checked={activeThemeId === LIGHT_THEME_ID}
            onClick={choose(() => setTheme(LIGHT_THEME_ID))}
          />
          <CheckItem
            icon={<Moon size={12} />}
            label={t.sidebar.themeDark}
            checked={activeThemeId === DARK_THEME_ID}
            onClick={choose(() => setTheme(DARK_THEME_ID))}
          />
        </div>
        <div className="h-px bg-border my-1" role="separator" />
        <div role="group" aria-label={t.sidebar.menuSections}>
          <MenuLabel>{t.sidebar.menuSections}</MenuLabel>
          <CheckItem
            icon={<MapIcon size={12} />}
            label={t.sidebar.sectionsAsMap}
            checked={sectionsStyle === 'map'}
            onClick={choose(() => setSectionsStyle('map'))}
          />
          <CheckItem
            icon={<Rows3 size={12} />}
            label={t.sidebar.sectionsAsRow}
            checked={sectionsStyle === 'row'}
            onClick={choose(() => setSectionsStyle('row'))}
          />
        </div>
        <div className="h-px bg-border my-1" role="separator" />
        <button
          role="menuitem"
          onClick={choose(() => setShowArchived(!showArchived))}
          className={ITEM_CLASS}
        >
          <Archive size={12} />
          {showArchived ? t.sidebar.hideArchived : t.sidebar.showArchived}
        </button>
      </div>
    </ContextMenu>
  )
}

const ITEM_CLASS =
  'w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text ' +
  'focus:outline-none focus-visible:bg-surface-3 flex items-center gap-2 transition-colors'

function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pt-1 pb-0.5 text-[10px] font-mono text-text-muted/50 uppercase tracking-widest" aria-hidden>
      {children}
    </div>
  )
}

function CheckItem({ icon, label, checked, onClick, buttonRef }: {
  icon: ReactNode
  label: string
  checked: boolean
  onClick: () => void
  buttonRef?: React.Ref<HTMLButtonElement>
}) {
  return (
    <button ref={buttonRef} role="menuitemradio" aria-checked={checked} onClick={onClick} className={ITEM_CLASS}>
      {icon}
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {checked && <Check size={12} className="shrink-0 text-text-muted" aria-hidden />}
    </button>
  )
}
