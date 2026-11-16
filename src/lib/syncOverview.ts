// Pure helpers behind Settings → Sync while a backend is active (the status card
// and the informative sync map — src/components/Settings/SyncOverview.tsx and
// SyncMap.tsx). No React, no i18n: the components map the results to theme
// classes and dictionary strings. Tested in tests/lib/syncOverview.test.ts.

import type { ActiveSyncStatus } from '../types'
import type { SyncDisplayState } from './syncStatus'

/** Colour family of a status badge / dot (mapped to theme classes by the UI). */
export type StatusTone = 'ok' | 'warn' | 'error' | 'info' | 'neutral'

/**
 * The status card's badge: the titlebar's display state, except a Cloud with
 * no keys yet (onboarding pending), which reads "Setup needed" rather than the
 * "Locked" the titlebar shows for every key state that blocks a manual sync.
 */
export type OverviewBadge = SyncDisplayState | 'setup'

export function overviewBadge(
  state: SyncDisplayState,
  keysState: NonNullable<ActiveSyncStatus['cloud']>['keysState'] | undefined,
): OverviewBadge {
  if (state === 'locked' && keysState === 'no-keys') return 'setup'
  return state
}

export function badgeTone(badge: OverviewBadge): StatusTone {
  switch (badge) {
    case 'synced':
    case 'uploading':
      return 'ok'
    case 'syncing':
      return 'info'
    case 'error':
      return 'error'
    case 'locked':
    case 'blocked':
    case 'unsynced':
    case 'setup':
      return 'warn'
    case 'pending':
      return 'neutral'
  }
}

/**
 * Whether the provider is effectively carrying the notes: everything except the
 * states where nothing can sync until the user acts (keys locked / not set up,
 * a failed first pull, an error). Drives the map's connectors (solid accent
 * vs dashed).
 */
export function isLinkActive(badge: OverviewBadge): boolean {
  return badge !== 'locked' && badge !== 'setup' && badge !== 'blocked' && badge !== 'error'
}

/** Product name of the OS the app runs on (`process.platform`), for the map's "This computer" node. */
export function platformName(platform: string): string {
  switch (platform) {
    case 'win32': return 'Windows'
    case 'darwin': return 'macOS'
    case 'linux': return 'Linux'
    default: return platform
  }
}

/** Auto-sync cadence in whole minutes (at least 1), or null when unknown. */
export function autoSyncMinutes(intervalMs: number | undefined): number | null {
  if (intervalMs === undefined || !Number.isFinite(intervalMs) || intervalMs <= 0) return null
  return Math.max(1, Math.round(intervalMs / 60_000))
}

/** `owner/repo`, or null while either part is unknown. */
export function repoSlug(owner: string | undefined, repo: string | undefined): string | null {
  return owner && repo ? `${owner}/${repo}` : null
}

export function githubRepoUrl(owner: string, repo: string): string {
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
}

export function githubCommitsUrl(owner: string, repo: string): string {
  return `${githubRepoUrl(owner, repo)}/commits`
}

/** What the informative sync map draws — derived from the live state only. */
export interface SyncMapModel {
  provider: 'cloud' | 'github'
  badge: OverviewBadge
  /** This computer ↔ provider. */
  mainActive: boolean
  /** Provider ↔ other devices. */
  peersActive: boolean
  /** Cloud reaches the other devices in real time (else on the auto-sync loop). */
  peersRealtime: boolean
  /** Provider ↔ noteflow CLI. */
  cliActive: boolean
  /** The secondary node under "This computer": Cloud → a paused GitHub mirror (only if connected); GitHub → an inactive Cloud. */
  secondary: 'github-mirror' | 'cloud-inactive' | null
}

export function syncMapModel(input: {
  provider: 'cloud' | 'github'
  badge: OverviewBadge
  realtimeConnected: boolean
  cliConnected: boolean
  githubConnected: boolean
}): SyncMapModel {
  const mainActive = isLinkActive(input.badge)
  return {
    provider: input.provider,
    badge: input.badge,
    mainActive,
    peersActive: mainActive,
    peersRealtime: input.provider === 'cloud' && input.realtimeConnected,
    cliActive: mainActive && input.cliConnected,
    secondary:
      input.provider === 'github' ? 'cloud-inactive' : input.githubConnected ? 'github-mirror' : null,
  }
}

/**
 * The row of the overview's "Other providers": the provider that is NOT carrying
 * the notes. Under Cloud, GitHub Sync is either a connected mirror paused while
 * Cloud owns the sync loop, or simply not connected (shown anyway so its detail
 * can be browsed without turning Cloud off); under GitHub, Cloud is inactive.
 */
export type OtherProviderRow = 'github-paused' | 'github-not-connected' | 'cloud-inactive'

export function otherProviderRow(provider: 'cloud' | 'github', githubConnected: boolean): OtherProviderRow {
  if (provider === 'github') return 'cloud-inactive'
  return githubConnected ? 'github-paused' : 'github-not-connected'
}
