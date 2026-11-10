import { memo, useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { connectIdentity, useIdentityStore } from '../../stores/identityStore'
import type { SubscriptionProduct } from '../../lib/subscriptionPlans'
import { SidebarPlanMenu } from './SidebarFooterMenu'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'

// Name of the user's home folder (basename of ~), static for the whole session (preload).
const SYSTEM_USER_NAME = window.noteflow?.systemUserName ?? ''

/** First character, upper-cased (whole code point, so an emoji or astral letter isn't split). */
function initialOf(text: string | null | undefined): string {
  const first = text ? Array.from(text.trim())[0] : undefined
  return first ? first.toLocaleUpperCase() : '?'
}

/**
 * Left side of the sidebar footer, on one line: a small circle with an initial, then
 * "<home folder> · <storage>" (Local notes / GitHub · repo / NoteFlow Cloud) or, with an active
 * NoteFlow plan, "<home folder> · <Plan> ⌄" whose chevron opens a menu into Settings → Sync / AI.
 * Its own memoized component subscribed to identityStore with fine selectors, so account and
 * sync changes never re-render the Sidebar. Only the text truncates; circle and plan don't shrink.
 */
export const SidebarIdentity = memo(function SidebarIdentity({ onMenuOpenChange }: {
  /** Reports the plan menu opening/closing (the Sidebar blocks the group peek meanwhile). Stable. */
  onMenuOpenChange: (open: boolean) => void
}) {
  const t = useT()
  const email = useIdentityStore((s) => s.email)
  const plan = useIdentityStore((s) => s.plan)
  const syncBackend = useIdentityStore((s) => s.syncBackend)
  const githubRepo = useIdentityStore((s) => s.githubRepo)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => connectIdentity(), [])

  // Losing the plan closes the menu for good (adjusted during render, not in an effect), so it
  // doesn't pop back open if the plan returns.
  if (menu && !plan) setMenu(null)
  const menuOpen = menu != null && plan != null
  useEffect(() => { onMenuOpenChange(menuOpen) }, [menuOpen, onMenuOpenChange])

  // Esc or a click anywhere outside the menu / its trigger closes it. Capture phase: the ⋯
  // button stops its click's propagation, and opening that menu must close this one.
  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (target && (triggerRef.current?.contains(target) || target.closest?.('[data-plan-menu]'))) return
      setMenu(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setMenu(null) }
    }
    window.addEventListener('click', onClick, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('click', onClick, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [menuOpen])

  const planNames: Record<SubscriptionProduct, string> = {
    bundle: t.sidebar.planBundle,
    cloud: t.sidebar.planCloud,
    ai: t.sidebar.planAi,
  }
  const storage =
    syncBackend === 'cloud' ? t.sidebar.storageCloud
      : syncBackend === 'github' && githubRepo ? tf(t.sidebar.storageGithub, { repo: githubRepo })
        : t.sidebar.storageLocal
  const right = plan ? planNames[plan] : storage
  const fullLine = SYSTEM_USER_NAME ? `${SYSTEM_USER_NAME} · ${right}` : right

  return (
    // The full line goes in the TEXT's title (not the wrapper's): the plan menu renders inside
    // the wrapper and would inherit it as a tooltip.
    <div className="min-w-0 flex-1 flex items-center gap-2">
      <span
        aria-hidden
        className="shrink-0 w-[18px] h-[18px] rounded-full bg-text/20 text-text/90 flex items-center justify-center text-[10px] font-mono font-semibold leading-none select-none"
      >
        {initialOf(email ?? SYSTEM_USER_NAME)}
      </span>
      {plan ? (
        <span className="min-w-0 flex items-center text-xs font-mono text-text-muted/40">
          {SYSTEM_USER_NAME && (
            <>
              <span className="min-w-0 truncate" title={fullLine}>{SYSTEM_USER_NAME}</span>
              <span className="shrink-0 whitespace-pre" aria-hidden> · </span>
            </>
          )}
          <button
            ref={triggerRef}
            onClick={(e) => {
              if (menu) { setMenu(null); return }
              const r = e.currentTarget.getBoundingClientRect()
              setMenu({ x: r.left, y: r.top - 4 })
            }}
            title={tf(t.sidebar.planMenuButton, { plan: planNames[plan] })}
            aria-label={tf(t.sidebar.planMenuButton, { plan: planNames[plan] })}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={`shrink-0 -my-1 py-1 px-1 -ml-1 rounded flex items-center gap-0.5 transition-colors ${
              menuOpen ? 'text-text-muted bg-surface-2' : 'text-text-muted/70 hover:text-text-muted hover:bg-surface-2'
            }`}
          >
            {planNames[plan]}
            <ChevronDown size={12} aria-hidden />
          </button>
        </span>
      ) : (
        <span className="min-w-0 truncate text-xs font-mono text-text-muted/40" title={fullLine}>{fullLine}</span>
      )}
      {menu && plan && (
        <SidebarPlanMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} />
      )}
    </div>
  )
})
