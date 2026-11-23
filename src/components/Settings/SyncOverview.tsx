import type { ReactNode } from 'react'
import { Cloud, ExternalLink, Github, Loader, RefreshCw } from 'lucide-react'
import { plural, tf } from '../../i18n/format'
import { useT } from '../../i18n/useT'
import { originChoiceLabels } from '../../lib/originChoiceLabels'
import { getSyncDisplayState, pendingChangeCount } from '../../lib/syncStatus'
import {
  autoSyncCadence,
  badgeTone,
  githubRepoUrl,
  overviewBadge,
  repoSlug,
  syncMapModel,
  type OverviewBadge,
} from '../../lib/syncOverview'
import { formatSyncAge, syncStateLabel } from '../syncStatusText'
import { useActiveSyncStatus } from '../useActiveSyncStatus'
import { CliConnectRow } from './CliConnectRow'
import { PRIMARY_BUTTON } from './planOffersShared'
import { SyncMap } from './SyncMap'
import { LocalCopiesRow, OriginPendingNotice } from './SyncOriginNotices'
import { SettingsListSection, StatusBadge } from './ui'
import { useCliConnect } from './useCliConnect'

// While the status card is on screen, re-read the live status this often:
// Realtime joins/drops emit no event, and "x min ago" has to move.
const STATUS_POLL_MS = 30_000

interface SyncOverviewProps {
  provider: 'cloud' | 'github'
  /** A manual sync started from this panel is running. */
  syncing: boolean
  /** "Sync now" is available (e.g. Cloud keys unlocked). */
  canSync: boolean
  onSync: () => Promise<unknown>
  /** Cloud: GitHub Sync is connected (paused) — drawn as the dashed mirror node. */
  githubConnected?: boolean
  /** Under the status card: errors, results, unlock / onboarding of the provider. */
  notices?: ReactNode
  /** Title of the data list ("Security and data" / "Repository and data"). */
  dataTitle: string
  /** Rows of the data list, before the CLI row. */
  dataRows: ReactNode
  /** Rows of "Other providers" (the section is hidden without them). */
  otherProviders?: ReactNode
  footerText: string
  /** Destructive action of the footer (turn off / disconnect). */
  footerAction: ReactNode
}

/**
 * Settings → Sync while a backend is active (NoteFlow Cloud enabled, or GitHub
 * Sync connected): the status card (provider, live badge, one line of facts,
 * "Sync now" and the informative sync map), the provider's data list ending in
 * the local copies (once there is one) and the CLI row, "Other providers" and a
 * footer with the reassurance + the destructive action. The provider panels
 * (CloudPanel / GitHubOverview) own the actions and fill the slots; this shell
 * reads the live status (the same one as the titlebar button) and the CLI state.
 * While the live backend's origin choice is pending (the notes on this device
 * came from another remote — electron/syncOrigin.ts) nothing syncs: the badge
 * reads "Action needed", "Sync now" is off and a notice right under the card
 * reopens the choice (OriginChoiceDialog, mounted by the titlebar).
 */
export function SyncOverview({
  provider,
  syncing,
  canSync,
  onSync,
  githubConnected = false,
  notices,
  dataTitle,
  dataRows,
  otherProviders,
  footerText,
  footerAction,
}: SyncOverviewProps) {
  const t = useT()
  const o = t.settings.sync.overview
  const s = t.titleBar.sync
  const live = useActiveSyncStatus(STATUS_POLL_MS)
  const cli = useCliConnect(provider)

  // The live status can lag behind the panel for a moment (e.g. right after
  // turning Cloud off): only trust it while it describes this provider.
  const status = live.status?.backend === provider ? live.status : null
  const badge: OverviewBadge | null = status
    ? overviewBadge(getSyncDisplayState(status, syncing, live.pushing), status.cloud?.keysState)
    : null
  const badgeLabel = badge === null ? '' : badge === 'setup' ? o.badgeSetup : syncStateLabel(badge, s)
  const cadenceValue = autoSyncCadence(status?.autoSyncIntervalMs)
  const cadence =
    cadenceValue === null
      ? null
      : cadenceValue.unit === 'seconds'
        ? tf(o.everySeconds, { seconds: cadenceValue.value })
        : tf(o.everyMinutes, { minutes: cadenceValue.value })
  const repo = repoSlug(status?.github?.owner, status?.github?.repo)
  const lastSync = status?.lastSync ? tf(o.lastSyncAgo, { time: formatSyncAge(status.lastSync, live.now, s) }) : o.neverSynced
  // Labels of the pending origin choice ('' from main = unknown → a generic text).
  const originChoice = status?.originChoice ? originChoiceLabels(t.originChoice, provider, status.originChoice) : null

  let facts: ReactNode = t.common.loading
  if (status && provider === 'cloud') {
    const pending = pendingChangeCount(status)
    facts = [
      lastSync,
      status.cloud?.realtimeConnected ? o.realtimeOn : o.realtimeOff,
      pending > 0 ? plural(o.pendingChanges, pending) : o.noPendingChanges,
    ].join(' · ')
  } else if (status) {
    const { owner, repo: name } = status.github ?? {}
    facts = (
      <>
        {owner && name && (
          <>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault()
                window.noteflow.openUrl(githubRepoUrl(owner, name))
              }}
              title={tf(o.openRepo, { repo: repo ?? '' })}
              className="inline-flex items-center gap-1 text-text hover:underline"
            >
              {repo}
              <ExternalLink size={10} />
            </a>
            {' · '}
          </>
        )}
        {cadence !== null && `${cadence} · `}
        {lastSync}
      </>
    )
  }

  async function handleSync() {
    await onSync()
    void live.refresh()
  }

  const isCloud = provider === 'cloud'

  return (
    <div className="flex-1 flex flex-col gap-5">
      {/* ── Status card + map ── */}
      <section className="flex flex-col gap-3 p-4 rounded-xl border border-solid border-border bg-surface-0">
        <div className="flex items-center gap-3.5">
          <div
            className={`w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0 ${
              isCloud ? 'bg-accent/[0.12] text-accent' : 'bg-text/[0.08] text-text'
            }`}
          >
            {isCloud ? <Cloud size={20} /> : <Github size={20} />}
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[13px] font-mono font-semibold text-text truncate">
                {isCloud ? t.settings.cloud.title : t.settings.sync.githubTitle}
              </span>
              {badge && (
                <StatusBadge tone={badgeTone(badge)} dot>
                  {badgeLabel}
                </StatusBadge>
              )}
            </div>
            <div className="text-[11px] font-mono text-text-muted leading-normal">{facts}</div>
          </div>
          <button onClick={() => void handleSync()} disabled={syncing || !canSync || !!originChoice} className={`${PRIMARY_BUTTON} flex-shrink-0 whitespace-nowrap`}>
            {syncing ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {t.settings.sync.syncNow}
          </button>
        </div>

        {badge ? (
          <SyncMap
            model={syncMapModel({
              provider,
              badge,
              realtimeConnected: status?.cloud?.realtimeConnected === true,
              cliConnected: cli.connected,
              githubConnected,
            })}
            statusLabel={badgeLabel}
            repo={repo}
            cadence={cadence}
            cli={cli.isStore ? 'unavailable' : cli.connected ? 'connected' : 'off'}
          />
        ) : (
          // Same footprint while the first status read lands, so nothing jumps.
          <div className="h-[136px] rounded-[10px] border border-solid border-border" />
        )}
      </section>

      {originChoice && <OriginPendingNotice text={tf(t.settings.sync.originPending, originChoice)} />}

      {notices}

      <SettingsListSection title={dataTitle}>
        {dataRows}
        <LocalCopiesRow />
        <CliConnectRow cli={cli} />
      </SettingsListSection>

      {otherProviders && <SettingsListSection title={o.otherProvidersTitle}>{otherProviders}</SettingsListSection>}

      {/* ── Footer: reassurance + the destructive action ── */}
      <div className="mt-auto pt-3 border-t border-solid border-border flex items-center justify-between gap-3">
        <span className="text-[11px] font-mono text-text-muted leading-normal">{footerText}</span>
        {footerAction}
      </div>
    </div>
  )
}
