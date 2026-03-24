import { app, safeStorage } from 'electron'
import fs from 'fs'
import path from 'path'
import https from 'https'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GitHubSyncSettings {
  enabled: boolean
  encryptedToken?: string  // base64-encoded encrypted PAT
  owner?: string
  repo?: string
  lastSync?: string
}

export interface SyncStatus {
  enabled: boolean
  connected: boolean
  owner?: string
  repo?: string
  lastSync?: string
  error?: string
}

// ── Settings helpers ──────────────────────────────────────────────────────────

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

function readSettings(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(getSettingsPath(), 'utf-8'))
  } catch {
    return {}
  }
}

function writeSettings(data: Record<string, unknown>): void {
  fs.writeFileSync(getSettingsPath(), JSON.stringify(data), 'utf-8')
}

// ── Token encryption ──────────────────────────────────────────────────────────

function encryptToken(token: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(token).toString('base64')
  }
  // Fallback: base64 only (less secure, but avoids blocking the feature)
  return Buffer.from(token).toString('base64')
}

function decryptToken(encrypted: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  }
  return Buffer.from(encrypted, 'base64').toString('utf-8')
}

const GITHUB_CLIENT_ID = 'Ov23liut9QOJ2pJFF0KR'

// ── GitHub REST API (raw https, no external deps) ─────────────────────────────

async function githubRequest(
  token: string,
  method: string,
  endpoint: string,
  body?: unknown
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined
    const req = https.request(
      {
        hostname: 'api.github.com',
        path: endpoint,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'NoteFlow-App',
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : {}),
        },
      },
      (res) => {
        let raw = ''
        res.on('data', (chunk) => (raw += chunk))
        res.on('end', () => {
          if (res.statusCode === 204) return resolve(null)
          try {
            const json = JSON.parse(raw)
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(json.message ?? `HTTP ${res.statusCode}`))
            } else {
              resolve(json)
            }
          } catch {
            reject(new Error(`HTTP ${res.statusCode}: unparseable response`))
          }
        })
      }
    )
    req.on('error', reject)
    req.setTimeout(15000, () => {
      req.destroy()
      reject(new Error('GitHub API request timed out'))
    })
    if (payload) req.write(payload)
    req.end()
  })
}

// Auth requests go to github.com (not api.github.com) with form-encoded body
async function githubAuthPost(path: string, params: Record<string, string>): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const payload = new URLSearchParams(params).toString()
    const req = https.request(
      {
        hostname: 'github.com',
        path,
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(payload),
          'User-Agent': 'NoteFlow-App',
        },
      },
      (res) => {
        let raw = ''
        res.on('data', (chunk) => (raw += chunk))
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw) as Record<string, string>)
          } catch {
            reject(new Error(`Auth request failed: ${raw}`))
          }
        })
      }
    )
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Auth request timed out')) })
    req.write(payload)
    req.end()
  })
}

// ── GitHub API operations ─────────────────────────────────────────────────────

async function validateToken(token: string): Promise<string> {
  const user = (await githubRequest(token, 'GET', '/user')) as { login: string }
  return user.login
}

async function ensureRepo(token: string, owner: string, repo: string): Promise<void> {
  try {
    await githubRequest(token, 'GET', `/repos/${owner}/${repo}`)
  } catch {
    await githubRequest(token, 'POST', '/user/repos', {
      name: repo,
      private: true,
      description: 'NoteFlow notes — auto-synced',
      auto_init: true,
    })
    // Brief pause for GitHub to initialize the repo
    await new Promise((r) => setTimeout(r, 1500))
  }
}

interface RemoteFile {
  name: string
  path: string
  sha: string
  type: string
}

async function listRemoteNotes(token: string, owner: string, repo: string): Promise<RemoteFile[]> {
  try {
    const files = (await githubRequest(
      token,
      'GET',
      `/repos/${owner}/${repo}/contents/`
    )) as RemoteFile[]
    return Array.isArray(files) ? files.filter((f) => f.type === 'file' && f.name.endsWith('.md')) : []
  } catch {
    return []
  }
}

async function getRemoteFile(
  token: string,
  owner: string,
  repo: string,
  filename: string
): Promise<{ content: string; sha: string } | null> {
  try {
    const file = (await githubRequest(
      token,
      'GET',
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(filename)}`
    )) as { content: string; sha: string }
    const content = Buffer.from(file.content.replace(/\n/g, ''), 'base64').toString('utf-8')
    return { content, sha: file.sha }
  } catch {
    return null
  }
}

async function upsertRemoteFile(
  token: string,
  owner: string,
  repo: string,
  filename: string,
  content: string
): Promise<void> {
  let sha: string | undefined
  try {
    const existing = (await githubRequest(
      token,
      'GET',
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(filename)}`
    )) as { sha: string }
    sha = existing.sha
  } catch {
    // File doesn't exist yet — will be created
  }

  const label = filename.replace(/\.md$/, '').replace(/^[^-]+-[^-]+-/, '')
  await githubRequest(
    token,
    'PUT',
    `/repos/${owner}/${repo}/contents/${encodeURIComponent(filename)}`,
    {
      message: sha ? `update: ${label}` : `add: ${label}`,
      content: Buffer.from(content).toString('base64'),
      ...(sha ? { sha } : {}),
    }
  )
}

async function removeRemoteFile(
  token: string,
  owner: string,
  repo: string,
  filename: string
): Promise<void> {
  try {
    const existing = (await githubRequest(
      token,
      'GET',
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(filename)}`
    )) as { sha: string }
    await githubRequest(
      token,
      'DELETE',
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(filename)}`,
      { message: `delete: ${filename}`, sha: existing.sha }
    )
  } catch {
    // File doesn't exist remotely — nothing to do
  }
}

// ── Module state ──────────────────────────────────────────────────────────────

let syncSettings: GitHubSyncSettings | null = null
let syncError: string | undefined

// Pending push timers per filename (debounce)
const pushTimers = new Map<string, ReturnType<typeof setTimeout>>()

// In-progress Device Flow
interface DeviceFlowState {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresAt: number
  interval: number
  pendingRepo: string
  pollTimer?: ReturnType<typeof setTimeout>
}
let deviceFlow: DeviceFlowState | null = null

// ── Public API ────────────────────────────────────────────────────────────────

export function loadSyncSettings(): GitHubSyncSettings {
  const settings = readSettings()
  syncSettings = (settings.githubSync as GitHubSyncSettings) ?? { enabled: false }
  return syncSettings
}

export function getSyncStatus(): SyncStatus {
  const s = syncSettings ?? loadSyncSettings()
  return {
    enabled: s.enabled,
    connected: !!(s.encryptedToken && s.owner && s.repo),
    owner: s.owner,
    repo: s.repo,
    lastSync: s.lastSync,
    error: syncError,
  }
}

// Starts Device Flow. Returns the user_code to display + verification URL to open.
// onComplete is called when auth succeeds or fails (from background polling).
export async function initiateDeviceFlow(
  repo: string,
  notesDir: string,
  onComplete: (result: { ok: boolean; owner?: string; repo?: string; error?: string }) => void
): Promise<{ ok: boolean; userCode?: string; verificationUri?: string; error?: string }> {
  // Cancel any existing flow
  cancelDeviceFlow()

  try {
    const data = await githubAuthPost('/login/device/code', {
      client_id: GITHUB_CLIENT_ID,
      scope: 'repo',
    })

    if (data.error) {
      return { ok: false, error: data.error_description ?? data.error }
    }

    deviceFlow = {
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      expiresAt: Date.now() + parseInt(data.expires_in) * 1000,
      interval: parseInt(data.interval) || 5,
      pendingRepo: repo,
    }

    // Start polling in background
    schedulePoll(notesDir, onComplete)

    return {
      ok: true,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    return { ok: false, error }
  }
}

function schedulePoll(
  notesDir: string,
  onComplete: (result: { ok: boolean; owner?: string; repo?: string; error?: string }) => void
): void {
  if (!deviceFlow) return

  const intervalMs = deviceFlow.interval * 1000

  deviceFlow.pollTimer = setTimeout(async () => {
    if (!deviceFlow) return

    if (Date.now() > deviceFlow.expiresAt) {
      deviceFlow = null
      onComplete({ ok: false, error: 'Authorization code expired. Please try again.' })
      return
    }

    try {
      const data = await githubAuthPost('/login/oauth/access_token', {
        client_id: GITHUB_CLIENT_ID,
        device_code: deviceFlow.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      })

      if (data.access_token) {
        // Auth complete — finalize connection
        const token = data.access_token
        const repo = deviceFlow.pendingRepo
        deviceFlow = null

        try {
          const owner = await validateToken(token)
          await ensureRepo(token, owner, repo)

          syncSettings = {
            enabled: true,
            encryptedToken: encryptToken(token),
            owner,
            repo,
          }
          syncError = undefined

          const settings = readSettings()
          settings.githubSync = syncSettings
          writeSettings(settings)

          await pullNotes(notesDir)
          onComplete({ ok: true, owner, repo })
        } catch (err: unknown) {
          const error = err instanceof Error ? err.message : String(err)
          syncError = error
          onComplete({ ok: false, error })
        }
      } else if (data.error === 'authorization_pending') {
        // Still waiting — keep polling
        schedulePoll(notesDir, onComplete)
      } else if (data.error === 'slow_down') {
        // Increase interval as requested
        deviceFlow.interval += 5
        schedulePoll(notesDir, onComplete)
      } else {
        // access_denied or other terminal error
        const error = data.error_description ?? data.error ?? 'Authorization failed'
        deviceFlow = null
        onComplete({ ok: false, error })
      }
    } catch (err: unknown) {
      // Network error — retry
      schedulePoll(notesDir, onComplete)
    }
  }, intervalMs)
}

export function cancelDeviceFlow(): void {
  if (deviceFlow?.pollTimer) clearTimeout(deviceFlow.pollTimer)
  deviceFlow = null
}

export function disconnectGitHub(): void {
  // Cancel any pending pushes
  pushTimers.forEach((t) => clearTimeout(t))
  pushTimers.clear()

  syncSettings = { enabled: false }
  syncError = undefined

  const settings = readSettings()
  delete settings.githubSync
  writeSettings(settings)
}

export async function pullNotes(notesDir: string): Promise<{ pulled: number; errors: string[] }> {
  const s = syncSettings ?? loadSyncSettings()
  if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo) {
    return { pulled: 0, errors: [] }
  }

  const token = decryptToken(s.encryptedToken)
  let pulled = 0
  const errors: string[] = []

  try {
    const remoteFiles = await listRemoteNotes(token, s.owner, s.repo)

    for (const file of remoteFiles) {
      try {
        const remote = await getRemoteFile(token, s.owner, s.repo, file.name)
        if (!remote) continue

        const localPath = path.join(notesDir, file.name)

        if (fs.existsSync(localPath)) {
          const localContent = fs.readFileSync(localPath, 'utf-8')
          const localUpdated = extractUpdatedTimestamp(localContent)
          const remoteUpdated = extractUpdatedTimestamp(remote.content)

          // Skip if local is newer or equal
          if (localUpdated && remoteUpdated && remoteUpdated <= localUpdated) continue
        }

        fs.writeFileSync(localPath, remote.content, 'utf-8')
        pulled++
      } catch (err) {
        errors.push(`${file.name}: ${String(err)}`)
      }
    }

    syncSettings = { ...s, lastSync: new Date().toISOString() }
    const settings = readSettings()
    settings.githubSync = syncSettings
    writeSettings(settings)
    syncError = undefined
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    syncError = msg
    errors.push(msg)
  }

  return { pulled, errors }
}

export function schedulePush(filePath: string, content: string): void {
  const s = syncSettings ?? loadSyncSettings()
  if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo) return

  const filename = path.basename(filePath)

  // Debounce: reset timer if already queued for this file
  const existing = pushTimers.get(filename)
  if (existing) clearTimeout(existing)

  const timer = setTimeout(async () => {
    pushTimers.delete(filename)
    try {
      const token = decryptToken(s.encryptedToken!)
      await upsertRemoteFile(token, s.owner!, s.repo!, filename, content)
      syncSettings = { ...s, lastSync: new Date().toISOString() }
      const settings = readSettings()
      settings.githubSync = syncSettings
      writeSettings(settings)
      syncError = undefined
    } catch (err: unknown) {
      syncError = err instanceof Error ? err.message : String(err)
      console.error('[GitHubSync] push failed:', syncError)
    }
  }, 3000) // 3s debounce — avoids spamming API while typing

  pushTimers.set(filename, timer)
}

export async function scheduleDelete(filePath: string): Promise<void> {
  const s = syncSettings ?? loadSyncSettings()
  if (!s.enabled || !s.encryptedToken || !s.owner || !s.repo) return

  const filename = path.basename(filePath)

  // Cancel any pending push for this file before deleting
  const existing = pushTimers.get(filename)
  if (existing) {
    clearTimeout(existing)
    pushTimers.delete(filename)
  }

  try {
    const token = decryptToken(s.encryptedToken)
    await removeRemoteFile(token, s.owner, s.repo, filename)
  } catch (err: unknown) {
    console.error('[GitHubSync] delete failed:', String(err))
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractUpdatedTimestamp(content: string): string | null {
  const match = content.match(/^updated:\s*['"]?([^'">\n]+)['"]?\s*$/m)
  return match ? match[1].trim() : null
}
