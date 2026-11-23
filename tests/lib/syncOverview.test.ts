import { describe, it, expect } from 'vitest'
import {
  autoSyncCadence,
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

  it('keeps a pending origin choice whatever the keys state', () => {
    expect(overviewBadge('choice', undefined)).toBe('choice')
    expect(overviewBadge('choice', 'no-keys')).toBe('choice')
    expect(overviewBadge('choice', 'locked')).toBe('choice')
  })
})

describe('badgeTone', () => {
  it('maps each badge to its colour family', () => {
    const tones: Record<OverviewBadge, string> = {
      synced: 'ok',
      uploading: 'ok',
      syncing: 'info',
      error: 'error',
      choice: 'warn',
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
    for (const badge of ['choice', 'locked', 'setup', 'blocked', 'error'] as const) {
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

describe('autoSyncCadence', () => {
  it('rounds a minute or more to whole minutes', () => {
    expect(autoSyncCadence(5 * 60_000)).toEqual({ unit: 'minutes', value: 5 })
    expect(autoSyncCadence(150_000)).toEqual({ unit: 'minutes', value: 3 })
    expect(autoSyncCadence(60_000)).toEqual({ unit: 'minutes', value: 1 })
  })

  it('shows seconds under a minute (the focused GitHub cadence)', () => {
    expect(autoSyncCadence(15_000)).toEqual({ unit: 'seconds', value: 15 })
    expect(autoSyncCadence(10_000)).toEqual({ unit: 'seconds', value: 10 })
    expect(autoSyncCadence(200)).toEqual({ unit: 'seconds', value: 1 })
  })

  it('never reads "60 s": just under a minute rounds to 1 min', () => {
    expect(autoSyncCadence(59_700)).toEqual({ unit: 'minutes', value: 1 })
  })

  it('is null when unknown or invalid', () => {
    expect(autoSyncCadence(undefined)).toBeNull()
    expect(autoSyncCadence(0)).toBeNull()
    expect(autoSyncCadence(Number.NaN)).toBeNull()
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

  it('a pending origin choice dashes every link: nothing syncs until the user chooses', () => {
    for (const provider of ['cloud', 'github'] as const) {
      const m = syncMapModel({ ...base, provider, badge: 'choice' })
      expect(m.mainActive).toBe(false)
      expect(m.peersActive).toBe(false)
      expect(m.cliActive).toBe(false)
    }
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
