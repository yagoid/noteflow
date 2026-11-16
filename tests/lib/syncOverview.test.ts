import { describe, it, expect } from 'vitest'
import {
  autoSyncMinutes,
  badgeTone,
  githubCommitsUrl,
  githubRepoUrl,
  isLinkActive,
  otherProviderRow,
  overviewBadge,
  platformName,
  repoSlug,
  syncMapModel,
  type OverviewBadge,
} from '../../src/lib/syncOverview'

describe('overviewBadge', () => {
  it('reads "setup" for a Cloud with no keys yet', () => {
    expect(overviewBadge('locked', 'no-keys')).toBe('setup')
  })

  it('keeps "locked" for keys that exist but are not unlocked', () => {
    expect(overviewBadge('locked', 'locked')).toBe('locked')
  })

  it('passes every other state through (GitHub has no keys state)', () => {
    expect(overviewBadge('synced', undefined)).toBe('synced')
    expect(overviewBadge('syncing', 'no-keys')).toBe('syncing')
    expect(overviewBadge('error', 'unlocked')).toBe('error')
  })
})

describe('badgeTone', () => {
  it('maps each badge to its colour family', () => {
    const tones: Record<OverviewBadge, string> = {
      synced: 'ok',
      uploading: 'ok',
      syncing: 'info',
      error: 'error',
      locked: 'warn',
      blocked: 'warn',
      unsynced: 'warn',
      setup: 'warn',
      pending: 'neutral',
    }
    for (const [badge, tone] of Object.entries(tones)) {
      expect(badgeTone(badge as OverviewBadge)).toBe(tone)
    }
  })
})

describe('isLinkActive', () => {
  it('is inactive only while nothing can sync until the user acts', () => {
    for (const badge of ['locked', 'setup', 'blocked', 'error'] as const) {
      expect(isLinkActive(badge)).toBe(false)
    }
    for (const badge of ['synced', 'uploading', 'syncing', 'pending', 'unsynced'] as const) {
      expect(isLinkActive(badge)).toBe(true)
    }
  })
})

describe('platformName', () => {
  it('names the three desktop platforms', () => {
    expect(platformName('win32')).toBe('Windows')
    expect(platformName('darwin')).toBe('macOS')
    expect(platformName('linux')).toBe('Linux')
  })

  it('falls back to the raw value', () => {
    expect(platformName('freebsd')).toBe('freebsd')
  })
})

describe('autoSyncMinutes', () => {
  it('rounds the interval to whole minutes', () => {
    expect(autoSyncMinutes(5 * 60_000)).toBe(5)
    expect(autoSyncMinutes(150_000)).toBe(3)
  })

  it('never reads less than a minute', () => {
    expect(autoSyncMinutes(10_000)).toBe(1)
  })

  it('is null when unknown or invalid', () => {
    expect(autoSyncMinutes(undefined)).toBeNull()
    expect(autoSyncMinutes(0)).toBeNull()
    expect(autoSyncMinutes(Number.NaN)).toBeNull()
  })
})

describe('repo helpers', () => {
  it('joins owner/repo only when both are known', () => {
    expect(repoSlug('me', 'notes')).toBe('me/notes')
    expect(repoSlug('me', undefined)).toBeNull()
    expect(repoSlug(undefined, 'notes')).toBeNull()
  })

  it('builds the repository and commits URLs', () => {
    expect(githubRepoUrl('me', 'noteflow-notes')).toBe('https://github.com/me/noteflow-notes')
    expect(githubCommitsUrl('me', 'noteflow-notes')).toBe('https://github.com/me/noteflow-notes/commits')
  })
})

describe('syncMapModel', () => {
  const base = { realtimeConnected: true, cliConnected: true, githubConnected: false }

  it('Cloud synced: every link active, peers in real time, no mirror without GitHub', () => {
    expect(syncMapModel({ ...base, provider: 'cloud', badge: 'synced' })).toEqual({
      provider: 'cloud',
      badge: 'synced',
      mainActive: true,
      peersActive: true,
      peersRealtime: true,
      cliActive: true,
      secondary: null,
    })
  })

  it('Cloud with GitHub connected draws the paused mirror', () => {
    expect(syncMapModel({ ...base, provider: 'cloud', badge: 'synced', githubConnected: true }).secondary).toBe(
      'github-mirror',
    )
  })

  it('Cloud without Realtime reaches the peers on the auto-sync loop', () => {
    expect(syncMapModel({ ...base, provider: 'cloud', badge: 'synced', realtimeConnected: false }).peersRealtime).toBe(false)
  })

  it('a locked provider dashes every link, CLI included', () => {
    const m = syncMapModel({ ...base, provider: 'cloud', badge: 'locked' })
    expect(m.mainActive).toBe(false)
    expect(m.peersActive).toBe(false)
    expect(m.cliActive).toBe(false)
  })

  it('an unconnected CLI dashes only its own link', () => {
    const m = syncMapModel({ ...base, provider: 'github', badge: 'synced', cliConnected: false })
    expect(m.mainActive).toBe(true)
    expect(m.cliActive).toBe(false)
  })

  it('GitHub never syncs in real time and always shows the inactive Cloud', () => {
    const m = syncMapModel({ ...base, provider: 'github', badge: 'synced', githubConnected: true })
    expect(m.peersRealtime).toBe(false)
    expect(m.secondary).toBe('cloud-inactive')
  })
})

describe('otherProviderRow', () => {
  it('under Cloud, shows GitHub paused when connected and not connected otherwise', () => {
    expect(otherProviderRow('cloud', true)).toBe('github-paused')
    expect(otherProviderRow('cloud', false)).toBe('github-not-connected')
  })

  it('under GitHub, always shows the inactive Cloud', () => {
    expect(otherProviderRow('github', true)).toBe('cloud-inactive')
    expect(otherProviderRow('github', false)).toBe('cloud-inactive')
  })
})
