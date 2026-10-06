import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Cloud, CloudOff, Github, RefreshCw, Settings } from 'lucide-react'
import { useT } from '../i18n/useT'
import { plural, tf } from '../i18n/format'
import { formatDate } from '../i18n/formatDate'
import type { Messages } from '../i18n'
import type { ActiveSyncStatus } from '../types'
import { getSyncDisplayState, relativeAge, type SyncDisplayState } from '../lib/syncStatus'

// Hover delay before the status card opens — short, but enough that sweeping the
// cursor along the titlebar towards the window controls doesn't flash it.
const OPEN_DELAY = 450
// Grace period on leave, so the cursor can cross the gap between the button and
// the card without it closing.
const CLOSE_DELAY = 150
const CARD_WIDTH = 236
// Gap (px) between the bottom of the titlebar button and the card.
const GAP = 4
// Keep the card this far from the viewport edges when clamping.
const VIEWPORT_MARGIN = 8
// While the card is open, re-render "x min ago" (and re-read the status) this often.
const TICK_MS = 30_000

type SyncMessages = Messages['titleBar']['sync']

// Pill colours per state. Green/amber match the cloud icon colours in the
// titlebar; the rest are theme tokens.
const PILL_STYLE: Record<SyncDisplayState, { dot: string; text: string }> = {
  synced: { dot: 'bg-green-400', text: 'text-green-400' },
  uploading: { dot: 'bg-green-400 animate-pulse', text: 'text-green-400' },
  syncing: { dot: 'bg-accent animate-pulse', text: 'text-accent' },
  error: { dot: 'bg-amber-400', text: 'text-amber-400' },
  locked: { dot: 'bg-amber-400', text: 'text-amber-400' },
  blocked: { dot: 'bg-amber-400', text: 'text-amber-400' },
  pending: { dot: 'bg-text-muted', text: 'text-text-muted' },
}

function stateLabel(state: SyncDisplayState, s: SyncMessages): string {
  switch (state) {
    case 'syncing': return s.statusSyncing
    case 'uploading': return s.statusUploading
    case 'locked': return s.statusLocked
    case 'blocked': return s.statusBlocked
    case 'error': return s.statusError
    case 'pending': return s.statusPending
    case 'synced': return s.statusSynced
  }
}

interface SyncStatusButtonProps {
  status: ActiveSyncStatus
  syncing: boolean
  pushing: boolean
  /** Manual sync (pull on the active backend). */
  onSync: () => void
  /** Re-reads the status from main — called when the card opens and on every tick. */
  onRefresh: () => void
  /** Opens Settings → Sync (GitHub and the NoteFlow Cloud panel both live there). */
  onOpenSettings: () => void
}

/**
 * The titlebar sync button plus its hover status card. The button shows the
 * live state as an icon and runs a manual sync on click; hovering it opens a
 * small floating card (portal, fixed under the button, right-aligned) with the
 * backend, a status pill and a few data rows. The card stays open across a
 * click so the user watches the sync run and land ("Synced · just now").
 */
export function SyncStatusButton({ status, syncing, pushing, onSync, onRefresh, onOpenSettings }: SyncStatusButtonProps) {
  const t = useT()
  const s = t.titleBar.sync
  const state = getSyncDisplayState(status, syncing, pushing)
  const backendName = status.backend === 'cloud' ? s.backendCloud : s.backendGithub

  const wrapperRef = useRef<HTMLDivElement>(null)
  const openTimer = useRef<number | null>(null)
  const closeTimer = useRef<number | null>(null)
  // Card position (null = closed) and the "now" used for relative times.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [now, setNow] = useState(() => Date.now())

  // The parent passes a fresh onRefresh each render — keep the latest in a ref so
  // the open/tick effect below doesn't re-run (and re-fetch) on every render.
  const onRefreshRef = useRef(onRefresh)
  useEffect(() => {
    onRefreshRef.current = onRefresh
  })

  const clearTimers = useCallback(() => {
    if (openTimer.current !== null) window.clearTimeout(openTimer.current)
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    openTimer.current = null
    closeTimer.current = null
  }, [])

  const close = useCallback(() => {
    clearTimers()
    setPos(null)
  }, [clearTimers])

  const scheduleOpen = () => {
    clearTimers()
    if (pos) return
    openTimer.current = window.setTimeout(() => {
      openTimer.current = null
      const el = wrapperRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      // Right-aligned with the button (it sits near the window's right edge),
      // clamped so it never leaves the viewport.
      const left = Math.max(
        VIEWPORT_MARGIN,
        Math.min(r.right - CARD_WIDTH, window.innerWidth - CARD_WIDTH - VIEWPORT_MARGIN),
      )
      setNow(Date.now())
      setPos({ left, top: r.bottom + GAP })
    }, OPEN_DELAY)
  }

  const scheduleClose = () => {
    clearTimers()
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null
      setPos(null)
    }, CLOSE_DELAY)
  }

  const cancelClose = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    closeTimer.current = null
  }

  const isOpen = pos !== null
  // While open: fresh status on open (Realtime joins/drops emit no event), then a
  // slow tick for the relative times. A window blur or resize closes the card —
  // the cursor may leave without a mouseleave, and the anchor may have moved.
  useEffect(() => {
    if (!isOpen) return
    onRefreshRef.current()
    const tick = window.setInterval(() => {
      setNow(Date.now())
      onRefreshRef.current()
    }, TICK_MS)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    return () => {
      window.clearInterval(tick)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
    }
  }, [isOpen, close])

  useEffect(() => clearTimers, [clearTimers])

  return (
    <>
      {/* Hover handlers live on a wrapper: a disabled button (syncing/uploading)
          doesn't reliably fire mouse events itself. */}
      <div ref={wrapperRef} className="flex h-full" onMouseEnter={scheduleOpen} onMouseLeave={scheduleClose}>
        <button
          onClick={onSync}
          disabled={syncing || pushing}
          className="flex items-center gap-1 px-2 h-full text-text-muted hover:text-text transition-colors disabled:opacity-60"
          aria-label={tf(s.ariaLabel, { backend: backendName, status: stateLabel(state, s) })}
        >
          {state === 'syncing' ? (
            <RefreshCw size={12} className="animate-spin text-text" />
          ) : state === 'uploading' ? (
            <Cloud size={12} className="animate-pulse text-green-400" />
          ) : state === 'locked' || state === 'blocked' ? (
            <CloudOff size={12} className="text-amber-400" />
          ) : state === 'error' ? (
            <Cloud size={12} className="text-amber-400" />
          ) : (
            <Cloud size={12} className="text-green-400" />
          )}
        </button>
      </div>

      {pos &&
        createPortal(
          <div
            className="fixed z-[45] rounded-md border border-solid border-border bg-surface-1 shadow-lg
                       overflow-hidden font-mono text-[10px] text-text select-none"
            style={{ width: CARD_WIDTH, left: pos.left, top: pos.top, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          >
            <SyncStatusCard
              status={status}
              state={state}
              backendName={backendName}
              now={now}
              onOpenSettings={() => {
                close()
                onOpenSettings()
              }}
            />
          </div>,
          document.body,
        )}
    </>
  )
}

interface SyncStatusCardProps {
  status: ActiveSyncStatus
  state: SyncDisplayState
  backendName: string
  now: number
  onOpenSettings: () => void
}

// The card body — pure presentation of the status snapshot.
function SyncStatusCard({ status, state, backendName, now, onOpenSettings }: SyncStatusCardProps) {
  const t = useT()
  const s = t.titleBar.sync
  const pill = PILL_STYLE[state]
  const isCloud = status.backend === 'cloud'
  const repo = status.github?.owner && status.github?.repo ? `${status.github.owner}/${status.github.repo}` : null

  const relative = (iso: string) => {
    const age = relativeAge(iso, now)
    switch (age.unit) {
      case 'now': return s.justNow
      case 'minutes': return tf(s.minutesAgo, { count: age.count })
      case 'hours': return tf(s.hoursAgo, { count: age.count })
      case 'days': return plural(s.daysAgo, age.count)
    }
  }
  const exactTime = (iso: string) => {
    const d = new Date(iso)
    const sameDay = d.toDateString() === new Date(now).toDateString()
    return formatDate(d, sameDay ? 'HH:mm' : 'MMM d, HH:mm')
  }

  const hint =
    state === 'locked' ? s.unlockHint
    : state === 'blocked' ? s.clickToRetry
    : state === 'syncing' || state === 'uploading' ? null
    : s.clickToSync

  return (
    <>
      {/* Header — backend + live status pill */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-solid border-border bg-surface-2/50">
        {isCloud ? (
          <Cloud size={13} className="text-text-muted flex-shrink-0" />
        ) : (
          <Github size={13} className="text-text-muted flex-shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold truncate">{backendName}</div>
          {repo && <div className="text-text-muted truncate">{repo}</div>}
        </div>
        <span
          className={`flex items-center gap-1 flex-shrink-0 px-1.5 py-0.5 rounded-full border border-solid border-border bg-surface-0 ${pill.text}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${pill.dot}`} />
          {stateLabel(state, s)}
        </span>
      </div>

      {/* Data rows */}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-3 py-2">
        <dt className="text-text-muted whitespace-nowrap">{s.lastSync}</dt>
        <dd className="text-right min-w-0">
          {status.lastSync ? (
            <>
              <div>{relative(status.lastSync)}</div>
              <div className="text-[9px] text-text-muted">{exactTime(status.lastSync)}</div>
            </>
          ) : (
            s.never
          )}
        </dd>

        <dt className="text-text-muted whitespace-nowrap">{s.pendingUploads}</dt>
        <dd className="text-right min-w-0">
          {status.pendingUploads > 0 ? plural(s.pendingFiles, status.pendingUploads) : s.pendingNone}
        </dd>

        {isCloud && (
          <>
            <dt className="text-text-muted whitespace-nowrap">{s.encryption}</dt>
            <dd className="text-right min-w-0">
              {status.cloud?.keysMode === 'managed'
                ? s.encryptionStandard
                : status.cloud?.keysMode === 'e2ee'
                ? s.encryptionPrivate
                : '—'}
            </dd>

            <dt className="text-text-muted whitespace-nowrap">{s.realtime}</dt>
            <dd className={`text-right min-w-0 ${status.cloud?.realtimeConnected ? 'text-green-400' : 'text-text-muted'}`}>
              {status.cloud?.realtimeConnected ? s.realtimeConnected : s.realtimeDisconnected}
            </dd>
          </>
        )}

        {status.autoSyncIntervalMs !== undefined && (
          <>
            <dt className="text-text-muted whitespace-nowrap">{s.autoSync}</dt>
            <dd className="text-right min-w-0">
              {tf(s.autoSyncEvery, { minutes: Math.round(status.autoSyncIntervalMs / 60_000) })}
            </dd>
          </>
        )}
      </dl>

      {/* Error / blocked notice */}
      {(state === 'blocked' || status.error) && (
        <div
          className="mx-3 mb-2 px-2 py-1.5 rounded border border-solid border-amber-400/30 bg-amber-400/10
                     text-amber-400 leading-snug break-words"
          title={status.error}
        >
          {state === 'blocked' && <div>{s.blockedNotice}</div>}
          {status.error && <div className="line-clamp-3 opacity-90 select-text">{status.error}</div>}
        </div>
      )}

      {/* Footer — what a click does + a shortcut to the settings */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-t border-solid border-border bg-surface-2/30 text-text-muted">
        <span className="min-w-0 flex-1 leading-snug">{hint}</span>
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1 flex-shrink-0 hover:text-text transition-colors"
        >
          <Settings size={10} />
          {s.openSettings}
        </button>
      </div>
    </>
  )
}
