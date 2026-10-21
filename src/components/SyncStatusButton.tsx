import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock, Cloud, CloudOff, Github, Lock, RefreshCw, Settings, Zap } from 'lucide-react'
import { useT } from '../i18n/useT'
import { plural, tf } from '../i18n/format'
import { formatDate } from '../i18n/formatDate'
import type { Messages } from '../i18n'
import type { ActiveSyncStatus } from '../types'
import {
  getSyncDisplayState,
  relativeAge,
  syncChartBars,
  SYNC_CHART_MAX_BARS,
  type SyncDisplayState,
} from '../lib/syncStatus'

// Hover delay before the status card opens — short, but enough that sweeping the
// cursor along the titlebar towards the window controls doesn't flash it.
const OPEN_DELAY = 450
// Grace period on leave, so the cursor can cross the gap between the button and
// the card without it closing.
const CLOSE_DELAY = 150
const CARD_WIDTH = 208
// Gap (px) between the bottom of the titlebar button and the card.
const GAP = 4
// Keep the card this far from the viewport edges when clamping.
const VIEWPORT_MARGIN = 8
// While the card is open, re-render "x min ago" (and re-read the status) this often.
const TICK_MS = 30_000
// Activity chart geometry (px). The chart spans the card's inner width
// (CARD_WIDTH minus the px-3 padding on both sides) with one slot per possible
// bar, filled from the right so the newest sync always sits at the right edge.
const CHART_WIDTH = CARD_WIDTH - 24
const CHART_HEIGHT = 36
const BAR_MIN_HEIGHT = 3
const BAR_GAP = 2
// Per-bar stagger of the grow-in animation when the card opens.
const BAR_STAGGER_MS = 12

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
  /** Clears the "kept as conflict copies" notice (either backend). */
  onDismissConflictCopies: () => void
}

// How many conflict-copy titles the card lists before "+N more".
const CONFLICT_TITLES_SHOWN = 3

/** What a click on the titlebar button does in each state (null while one is running). */
function clickHint(state: SyncDisplayState, s: SyncMessages): string | null {
  if (state === 'locked') return s.unlockHint
  if (state === 'blocked') return s.clickToRetry
  if (state === 'syncing' || state === 'uploading') return null
  return s.clickToSync
}

/**
 * The titlebar sync button plus its hover status card. The button shows the
 * live state as an icon and runs a manual sync on click (what the click does
 * goes in its aria-label); hovering it opens a small floating card (portal,
 * fixed under the button, right-aligned) with the backend, a status pill, two
 * data rows and a mini bar chart of this session's sync activity. The card
 * stays open across a click so the user watches the sync run and land
 * ("Synced · just now").
 */
export function SyncStatusButton({
  status,
  syncing,
  pushing,
  onSync,
  onRefresh,
  onOpenSettings,
  onDismissConflictCopies,
}: SyncStatusButtonProps) {
  const t = useT()
  const s = t.titleBar.sync
  const state = getSyncDisplayState(status, syncing, pushing)
  const backendName = status.backend === 'cloud' ? s.backendCloud : s.backendGithub
  const ariaVars = { backend: backendName, status: stateLabel(state, s) }
  const hint = clickHint(state, s)
  const conflictCount = status.conflictCopies?.count ?? 0
  const baseAriaLabel = hint ? tf(s.ariaLabelWithHint, { ...ariaVars, hint }) : tf(s.ariaLabel, ariaVars)
  const ariaLabel = conflictCount > 0 ? `${baseAriaLabel}. ${plural(s.conflictCopiesAria, conflictCount)}` : baseAriaLabel

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
          className="relative flex items-center gap-1 px-2 h-full text-text-muted hover:text-text transition-colors disabled:opacity-60"
          aria-label={ariaLabel}
        >
          {/* Attention dot: the card has a conflict-copies notice to read. */}
          {conflictCount > 0 && (
            <span aria-hidden className="absolute top-1.5 right-1 w-1.5 h-1.5 rounded-full bg-amber-400" />
          )}
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
              onDismissConflictCopies={onDismissConflictCopies}
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
  onDismissConflictCopies: () => void
}

// The card body — pure presentation of the status snapshot.
function SyncStatusCard({ status, state, backendName, now, onOpenSettings, onDismissConflictCopies }: SyncStatusCardProps) {
  const t = useT()
  const s = t.titleBar.sync
  const pill = PILL_STYLE[state]
  const isCloud = status.backend === 'cloud'
  // GitHub shows the repo name (owner/repo in the tooltip); Cloud its product name.
  const repoName = isCloud ? undefined : status.github?.repo
  const title = repoName || backendName
  const titleTooltip = repoName && status.github?.owner ? `${status.github.owner}/${repoName}` : title

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

  // Footer icon tooltips (title + aria-label carry the same text).
  const encryptionTip = tf(s.encryptionTooltip, {
    mode:
      status.cloud?.keysMode === 'managed' ? s.encryptionStandard
      : status.cloud?.keysMode === 'e2ee' ? s.encryptionPrivate
      : '—',
  })
  const realtimeOn = status.cloud?.realtimeConnected === true
  const conflicts = status.conflictCopies
  const realtimeTip = tf(s.realtimeTooltip, { state: realtimeOn ? s.realtimeConnected : s.realtimeDisconnected })
  const autoSyncTip =
    status.autoSyncIntervalMs !== undefined
      ? tf(s.autoSyncEvery, { minutes: Math.round(status.autoSyncIntervalMs / 60_000) })
      : null

  return (
    <>
      {/* Header — backend + live status pill, always a single row */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-solid border-border bg-surface-2/50">
        {isCloud ? (
          <Cloud size={13} className="text-text-muted flex-shrink-0" />
        ) : (
          <Github size={13} className="text-text-muted flex-shrink-0" />
        )}
        <span className="min-w-0 flex-1 text-[11px] font-semibold truncate" title={titleTooltip}>
          {title}
        </span>
        <span
          className={`flex items-center gap-1 flex-shrink-0 px-1.5 py-0.5 rounded-full border border-solid border-border bg-surface-0 ${pill.text}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${pill.dot}`} />
          {stateLabel(state, s)}
        </span>
      </div>

      {/* Data rows */}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-3 pt-2">
        <dt className="text-text-muted whitespace-nowrap">{s.lastSync}</dt>
        <dd className="text-right min-w-0 truncate" title={status.lastSync ? exactTime(status.lastSync) : undefined}>
          {status.lastSync ? relative(status.lastSync) : s.never}
        </dd>

        <dt className="text-text-muted whitespace-nowrap">{s.pendingUploads}</dt>
        <dd className="text-right min-w-0 truncate">
          {status.pendingUploads > 0 ? plural(s.files, status.pendingUploads) : s.pendingNone}
        </dd>
      </dl>

      <SyncActivityChart status={status} exactTime={exactTime} />

      {/* Conflict copies (either backend): local edits kept as new notes */}
      {conflicts && conflicts.count > 0 && (
        <div
          className="mx-3 mb-2 px-2 py-1.5 rounded border border-solid border-amber-400/30 bg-amber-400/10
                     text-amber-400 leading-snug break-words"
        >
          <div>{plural(s.conflictCopiesNotice, conflicts.count)}</div>
          <ul className="mt-1 text-text select-text">
            {conflicts.titles.slice(-CONFLICT_TITLES_SHOWN).map((title, i) => (
              <li key={`${i}-${title}`} className="truncate" title={title}>
                {title}
              </li>
            ))}
          </ul>
          {conflicts.count > CONFLICT_TITLES_SHOWN && (
            <div className="opacity-90">{tf(s.conflictCopiesMore, { count: conflicts.count - CONFLICT_TITLES_SHOWN })}</div>
          )}
          <div className="flex justify-end mt-1">
            <button
              onClick={onDismissConflictCopies}
              className="px-1.5 py-0.5 rounded border border-solid border-amber-400/40 hover:bg-amber-400/20 transition-colors"
            >
              {s.conflictCopiesDismiss}
            </button>
          </div>
        </div>
      )}

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

      {/* Footer — backend facts as tooltip icons + a shortcut to the settings */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-t border-solid border-border bg-surface-2/30 text-text-muted">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isCloud && (
            <>
              <span role="img" title={encryptionTip} aria-label={encryptionTip}>
                <Lock size={11} />
              </span>
              <span
                role="img"
                title={realtimeTip}
                aria-label={realtimeTip}
                className={realtimeOn ? 'text-green-400' : undefined}
              >
                <Zap size={11} />
              </span>
            </>
          )}
          {autoSyncTip && (
            <span role="img" title={autoSyncTip} aria-label={autoSyncTip}>
              <Clock size={11} />
            </span>
          )}
        </div>
        <button
          onClick={onOpenSettings}
          title={s.openSettings}
          aria-label={s.openSettings}
          className="flex items-center flex-shrink-0 hover:text-text transition-colors"
        >
          <Settings size={11} />
        </button>
      </div>
    </>
  )
}

interface SyncActivityChartProps {
  status: ActiveSyncStatus
  exactTime: (iso: string) => string
}

// Mini bar chart of this session's syncs (main keeps them in memory only — see
// electron/syncHistory.ts): one bar per entry, newest on the right, height
// relative to the busiest one, green if it went well and amber if it failed.
// "X files today" is main's running day total (status.filesToday), not a sum of
// the bars: 24 entries with the 5-min heartbeat only span ~2 h.
// The bars grow in on open (skipped under prefers-reduced-motion).
function SyncActivityChart({ status, exactTime }: SyncActivityChartProps) {
  const t = useT()
  const s = t.titleBar.sync
  const bars = syncChartBars(status.history, CHART_HEIGHT, BAR_MIN_HEIGHT)
  const slot = CHART_WIDTH / SYNC_CHART_MAX_BARS
  const firstSlot = SYNC_CHART_MAX_BARS - bars.length

  return (
    <div className="px-3 py-2">
      <div className="relative">
        <svg
          width={CHART_WIDTH}
          height={CHART_HEIGHT}
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="block"
          role="img"
          aria-label={s.chartLabel}
        >
          {bars.length === 0 ? (
            <line
              x1={0}
              x2={CHART_WIDTH}
              y1={CHART_HEIGHT - 0.5}
              y2={CHART_HEIGHT - 0.5}
              className="stroke-border"
              strokeDasharray="3 3"
            />
          ) : (
            bars.map(({ entry, height }, i) => (
              <rect
                key={entry.at}
                x={(firstSlot + i) * slot + BAR_GAP / 2}
                y={CHART_HEIGHT - height}
                width={slot - BAR_GAP}
                height={height}
                rx={1}
                className={`${entry.ok ? 'fill-green-400' : 'fill-amber-400'} origin-bottom motion-safe:animate-bar-grow`}
                style={{ transformBox: 'fill-box', animationDelay: `${i * BAR_STAGGER_MS}ms` }}
              >
                <title>
                  {tf(entry.ok ? s.barTitle : s.barTitleFailed, {
                    time: exactTime(entry.at),
                    files: plural(s.files, entry.files),
                  })}
                </title>
              </rect>
            ))
          )}
        </svg>
        {bars.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-text-muted">{s.noActivity}</div>
        )}
      </div>
      {bars.length > 0 && (
        <div className="flex items-center justify-between gap-2 mt-1 text-text-muted">
          <span className="truncate">{plural(s.lastSyncs, bars.length)}</span>
          <span className="truncate">{plural(s.filesToday, status.filesToday ?? 0)}</span>
        </div>
      )}
    </div>
  )
}
