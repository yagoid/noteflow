// Live catch-up of note files changed on disk by another process while the app
// runs (electron/liveCatchUpLogic.ts): which watcher events count, which files
// of a folder go up, and when the CLI of this machine syncs by itself (skip).
import { describe, it, expect } from 'vitest'
import {
  LIVE_CATCH_UP_MAX_RETRIES,
  canRetryLiveCatchUp,
  cliSyncsBackend,
  githubLiveCatchUpGate,
  liveCatchUpTarget,
  selectLiveCatchUpFiles,
} from '../../electron/liveCatchUpLogic'
import { hashForBase } from '../../electron/cloudSyncLogic'
import { gitBlobSha } from '../../electron/mirrorPlan'

const b64 = (s: string) => Buffer.from(s, 'utf-8').toString('base64')

describe('liveCatchUpTarget', () => {
  it('takes the .md files directly inside a note folder', () => {
    expect(liveCatchUpTarget('my-note-abc/note.md')).toEqual({ dir: 'my-note-abc', file: 'note.md' })
    expect(liveCatchUpTarget('my-note-abc/s1.md')).toEqual({ dir: 'my-note-abc', file: 's1.md' })
    expect(liveCatchUpTarget('my-note-abc/agent.md')).toEqual({ dir: 'my-note-abc', file: 'agent.md' })
  })

  it('ignores root files, the folder itself, temp files and deeper paths', () => {
    for (const rel of [
      'groups.json',
      'README.md',
      'my-note-abc',
      'my-note-abc/.agent.md.123.ab12.tmp',
      'my-note-abc/.hidden.md',
      'my-note-abc/image.png',
      'my-note-abc/sub/x.md',
      '.noteflow-format',
      'folder.with.dot/x.md',
    ]) {
      expect(liveCatchUpTarget(rel)).toBeNull()
    }
  })
})

describe('selectLiveCatchUpFiles', () => {
  const dir = 'n-1'
  const files = [
    { relPath: `${dir}/note.md`, content: 'anchor v2' },
    { relPath: `${dir}/s1.md`, content: '- [ ] task 🤖abc:running' },
    { relPath: `${dir}/s2.md`, content: 'untouched' },
    { relPath: `${dir}/agent.md`, content: '## abc\nreport' },
  ]
  // Cloud-style bases: hashForBase of the content this device last reconciled.
  const bases: Record<string, string> = {
    [`${dir}/note.md`]: hashForBase(`${dir}/note.md`, 'anchor v2'), // same as disk
    [`${dir}/s1.md`]: hashForBase(`${dir}/s1.md`, '- [ ] task 🤖abc:queued'), // differs
    [`${dir}/s2.md`]: hashForBase(`${dir}/s2.md`, 'older'), // differs, but not seen changing
  }
  const matchesBase = (rel: string, content: string) => (bases[rel] ? hashForBase(rel, content) === bases[rel] : null)

  it('uploads a seen file that differs from its base, and a seen base-less one (new agent.md)', () => {
    const changed = new Set(files.map((f) => f.relPath).filter((r) => r !== `${dir}/s2.md`))
    expect(selectLiveCatchUpFiles(files, changed, matchesBase)).toEqual([`${dir}/s1.md`, `${dir}/agent.md`])
  })

  it('never takes a file the watcher did not see change, whatever its base', () => {
    expect(selectLiveCatchUpFiles(files, new Set([`${dir}/note.md`]), matchesBase)).toEqual([])
    expect(selectLiveCatchUpFiles(files, new Set(), matchesBase)).toEqual([])
  })

  it('skips a seen file identical to its base (a pull echo, or already synced)', () => {
    expect(selectLiveCatchUpFiles(files, new Set([`${dir}/note.md`]), matchesBase)).toEqual([])
  })

  it('works with GitHub-style bases (blob shas)', () => {
    const shas: Record<string, string> = { [`${dir}/s1.md`]: gitBlobSha('- [ ] task 🤖abc:running') }
    const gh = (rel: string, content: string) => (shas[rel] ? gitBlobSha(content) === shas[rel] : null)
    const changed = new Set([`${dir}/s1.md`, `${dir}/agent.md`])
    expect(selectLiveCatchUpFiles(files, changed, gh)).toEqual([`${dir}/agent.md`])
  })
})

describe('cliSyncsBackend', () => {
  const app = { cloudUserId: 'user-1', githubOwner: 'Me', githubRepo: 'notes' }
  const cliCloudOn = { cliCloud: { enabled: true }, cliAccount: { refreshToken: 'r', userId: 'user-1' } }

  it('unreadable or empty CLI settings → the app catches up', () => {
    expect(cliSyncsBackend(null, 'cloud', app)).toBe(false)
    expect(cliSyncsBackend({}, 'cloud', app)).toBe(false)
    expect(cliSyncsBackend({}, 'github', app)).toBe(false)
  })

  describe('Cloud', () => {
    it('CLI on Cloud (cliCloud.enabled + a session) → it syncs by itself', () => {
      expect(cliSyncsBackend(cliCloudOn, 'cloud', app)).toBe(true)
    })

    it('a session without cliCloud.enabled, or enabled without a session → not syncing', () => {
      expect(cliSyncsBackend({ cliAccount: { refreshToken: 'r' } }, 'cloud', app)).toBe(false)
      expect(cliSyncsBackend({ cliCloud: { enabled: true } }, 'cloud', app)).toBe(false)
      expect(cliSyncsBackend({ cliCloud: { enabled: true }, cliAccount: { email: 'x' } }, 'cloud', app)).toBe(false)
    })

    it('a session of another account does not count; an unknown account does', () => {
      const other = { ...cliCloudOn, cliAccount: { refreshToken: 'r', userId: 'user-2' } }
      expect(cliSyncsBackend(other, 'cloud', app)).toBe(false)
      expect(cliSyncsBackend(other, 'cloud', { ...app, cloudUserId: null })).toBe(true)
      expect(cliSyncsBackend({ ...cliCloudOn, cliAccount: { refreshToken: 'r' } }, 'cloud', app)).toBe(true)
    })
  })

  describe('GitHub', () => {
    const ghOwn = { githubSync: { enabled: true, owner: 'me', repo: 'Notes', encryptedToken: b64('ghp_token') } }

    it('the CLI with a readable token for the same repo → it syncs by itself', () => {
      expect(cliSyncsBackend(ghOwn, 'github', app)).toBe(true)
    })

    it("the app's safeStorage token (shared settings.json on Windows) is not the CLI's", () => {
      const appOnly = { githubSync: { enabled: true, owner: 'Me', repo: 'notes', encryptedToken: 'safe:AAAA' } }
      expect(cliSyncsBackend(appOnly, 'github', app)).toBe(false)
      // …unless the app gave the CLI its own copy (Settings → Sync → "Connect the CLI too").
      const withCopy = { ...appOnly, cliGithubToken: { owner: 'Me', token: b64('ghp_token') } }
      expect(cliSyncsBackend(withCopy, 'github', app)).toBe(true)
      expect(cliSyncsBackend({ ...appOnly, cliGithubToken: { owner: 'other', token: b64('t') } }, 'github', app)).toBe(false)
    })

    it('another repo, a disabled connection, or a CLI routed to Cloud → not syncing GitHub', () => {
      expect(cliSyncsBackend({ githubSync: { ...ghOwn.githubSync, repo: 'other' } }, 'github', app)).toBe(false)
      expect(cliSyncsBackend({ githubSync: { ...ghOwn.githubSync, enabled: false } }, 'github', app)).toBe(false)
      expect(cliSyncsBackend({ ...ghOwn, ...cliCloudOn }, 'github', app)).toBe(false)
      expect(cliSyncsBackend(ghOwn, 'github', { cloudUserId: 'user-1' })).toBe(false)
    })

    it('a CLI on GitHub does not sync Cloud', () => {
      expect(cliSyncsBackend(ghOwn, 'cloud', app)).toBe(false)
    })
  })
})

describe('githubLiveCatchUpGate', () => {
  it('waits for the first pull instead of dropping the change (an agent.md-only change would never go up)', () => {
    expect(githubLiveCatchUpGate('pending')).toBe('retry')
  })

  it('opens once the first pull landed, and stops polling when it failed', () => {
    expect(githubLiveCatchUpGate('ok')).toBe('open')
    expect(githubLiveCatchUpGate('failed')).toBe('skip')
  })
})

describe('canRetryLiveCatchUp', () => {
  it('re-arms a put-off pass a bounded number of times', () => {
    expect(canRetryLiveCatchUp(1)).toBe(true)
    expect(canRetryLiveCatchUp(LIVE_CATCH_UP_MAX_RETRIES)).toBe(true)
    expect(canRetryLiveCatchUp(LIVE_CATCH_UP_MAX_RETRIES + 1)).toBe(false)
  })
})
