import { useEffect, useRef, type ReactNode } from 'react'
import { Archive, Check, Map as MapIcon, Moon, RefreshCw, Rows3, Sparkles, Sun } from 'lucide-react'
import { ContextMenu } from '../ContextMenu'
import { useNotesStore } from '../../stores/notesStore'
import { useThemeStore } from '../../stores/themeStore'
import { useIdentityStore } from '../../stores/identityStore'
import { resolveSchemeTheme, themeScheme } from '../../lib/themeMemory'
import { useT } from '../../i18n/useT'

// Settings tabs are opened through the window events TitleBar listens to (noteflow:open-*).
const openSettingsTab = (event: 'noteflow:open-github-sync' | 'noteflow:open-ai-settings') =>
  window.dispatchEvent(new Event(event))

/**
 * Focus the first item on open; on close, hand focus back to whatever had it (the trigger)
 * unless the user already moved it elsewhere.
 */
function useMenuFocus(firstItemRef: React.RefObject<HTMLButtonElement | null>) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const menu = firstItemRef.current?.closest('[role="menu"]') ?? null
    firstItemRef.current?.focus()
    return () => {
      const current = document.activeElement
      if (current === document.body || (menu && menu.contains(current))) previous?.focus?.()
    }
  }, [firstItemRef])
}

/**
 * The sidebar footer's ⋯ menu: [Sync] · Theme (Light / Dark) · Sections (map / row) · Show
 * archived. "Sync" (→ Settings → Sync) only without an active plan: with one, the identity line's
 * plan menu already has it. Light / Dark go back to the last theme of that kind the user had
 * (themeStore.themeMemory, lib/themeMemory.ts) and the check follows the active theme's scheme.
 * Opens upwards with its bottom edge at `y` (the button's top). Mounted only while open, so its
 * store subscriptions don't re-render the Sidebar. Uses the same store actions as Settings →
 * Appearance (setTheme / setSidebarSectionsStyle).
 */
export function SidebarFooterMenu({ x, y, onClose }: { x: number; y: number; onClose: () => void }) {
  const t = useT()
  const activeScheme = useThemeStore((s) => themeScheme(s.activeThemeId))
  const themeMemory = useThemeStore((s) => s.themeMemory)
  const setTheme = useThemeStore((s) => s.setTheme)
  const sectionsStyle = useThemeStore((s) => s.sidebarSectionsStyle)
  const setSectionsStyle = useThemeStore((s) => s.setSidebarSectionsStyle)
  const showArchived = useNotesStore((s) => s.showArchived)
  const setShowArchived = useNotesStore((s) => s.setShowArchived)
  const showSync = useIdentityStore((s) => s.plan == null)
  const firstItemRef = useRef<HTMLButtonElement>(null)
  useMenuFocus(firstItemRef)

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
        {showSync && (
          <>
            <button
              ref={firstItemRef}
              role="menuitem"
              onClick={choose(() => openSettingsTab('noteflow:open-github-sync'))}
              className={ITEM_CLASS}
            >
              <RefreshCw size={12} />
              <span className="flex-1 min-w-0 truncate">{t.sidebar.menuSync}</span>
            </button>
            <div className="h-px bg-border my-1" role="separator" />
          </>
        )}
        <div role="group" aria-label={t.sidebar.menuTheme}>
          <MenuLabel>{t.sidebar.menuTheme}</MenuLabel>
          <CheckItem
            buttonRef={showSync ? undefined : firstItemRef}
            icon={<Sun size={12} />}
            label={t.sidebar.themeLight}
            checked={activeScheme === 'light'}
            onClick={choose(() => setTheme(resolveSchemeTheme('light', themeMemory.light)))}
          />
          <CheckItem
            icon={<Moon size={12} />}
            label={t.sidebar.themeDark}
            checked={activeScheme === 'dark'}
            onClick={choose(() => setTheme(resolveSchemeTheme('dark', themeMemory.dark)))}
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

/**
 * The identity line's plan menu (Sidebar/SidebarIdentity.tsx): shortcuts into Settings → Sync and
 * Settings → AI. Same placement, look and focus handling as the ⋯ menu; the owner closes it on
 * Esc / click outside (`data-plan-menu` marks its inside).
 */
export function SidebarPlanMenu({ x, y, onClose }: { x: number; y: number; onClose: () => void }) {
  const t = useT()
  const firstItemRef = useRef<HTMLButtonElement>(null)
  useMenuFocus(firstItemRef)

  const choose = (event: Parameters<typeof openSettingsTab>[0]) => () => { openSettingsTab(event); onClose() }

  return (
    <ContextMenu
      x={x}
      y={y}
      placement="above"
      className="fixed z-50 bg-surface-2 border border-border rounded-lg shadow-xl w-40"
    >
      <div role="menu" aria-label={t.sidebar.planMenuLabel} data-plan-menu className="py-1">
        <button ref={firstItemRef} role="menuitem" onClick={choose('noteflow:open-github-sync')} className={ITEM_CLASS}>
          <RefreshCw size={12} />
          <span className="flex-1 min-w-0 truncate">{t.sidebar.planMenuSync}</span>
        </button>
        <button role="menuitem" onClick={choose('noteflow:open-ai-settings')} className={ITEM_CLASS}>
          <Sparkles size={12} />
          <span className="flex-1 min-w-0 truncate">{t.sidebar.planMenuAi}</span>
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
