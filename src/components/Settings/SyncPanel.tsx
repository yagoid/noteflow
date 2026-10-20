import { useEffect, useState, type ReactNode } from 'react'
import { Cloud, CloudOff, ExternalLink, Github, Loader, Pause, RefreshCw, Unlink, UploadCloud } from 'lucide-react'
import { useNotesStore } from '../../stores/notesStore'
import { plural, tf } from '../../i18n/format'
import { useT } from '../../i18n/useT'
import { ConfirmModal } from '../ConfirmModal'
import { CloudPanel } from './CloudPanel'
import type { SettingsSection } from './SettingsModal'
import { settingsButtonClass } from './ui'

interface SyncStatus {
  enabled: boolean
  connected: boolean
  owner?: string
  repo?: string
  lastSync?: string
  error?: string
}

type Step = 'idle' | 'waiting-auth' | 'completing' | 'pulling' | 'mirroring'

type MirrorResult = Awaited<ReturnType<typeof window.noteflow.mirrorToGitHub>>

type Backend = 'cloud' | 'github'

// The Sync page: pick ONE backend — NoteFlow Cloud (encrypted, paid) or GitHub
// Sync (free) — and configure it below. The two are mutually exclusive: Cloud
// takes priority in electron/syncProvider.ts and pauses GitHub while enabled;
// here we surface that choice as a two-card selector.
export function SyncPanel({ onNavigate }: { onNavigate?: (section: SettingsSection) => void }) {
  const t = useT()
  const [cloudEnabled, setCloudEnabled] = useState(false)
  const [cloudSignedIn, setCloudSignedIn] = useState(false)
  const [githubConnected, setGithubConnected] = useState(false)
  // null until both statuses land: the selector preselects the backend that is
  // actually in use, and only then. It is resolved once — a later status change
  // (enabling Cloud, disconnecting GitHub) must never move the user off the
  // panel they are on.
  const [backend, setBackend] = useState<Backend | null>(null)

  useEffect(() => {
    Promise.all([window.noteflow.getCloudStatus(), window.noteflow.getSyncStatus()]).then(
      ([cloud, github]) => {
        setCloudEnabled(cloud.enabled)
        setCloudSignedIn(cloud.signedIn)
        setGithubConnected(github.connected)
        setBackend(cloud.enabled || !github.connected ? 'cloud' : 'github')
      },
    )
    const offCloud = window.noteflow.onCloudStatusChanged((s) => {
      setCloudEnabled(s.enabled)
      setCloudSignedIn(s.signedIn)
    })
    // Signing out turns Cloud sync off in main (electron/accountTransition.ts),
    // so both statuses move together — but listen to the account too, so the
    // badge can never claim "Active" while the session is gone.
    const offAccount = window.noteflow.onAccountStatusChanged((s) => setCloudSignedIn(s.signedIn))
    return () => {
      offCloud()
      offAccount()
    }
  }, [])

  if (backend === null) {
    return (
      <div className="flex items-center gap-2 text-text-muted">
        <Loader size={12} className="animate-spin" />
        <span className="text-xs font-mono">{t.common.loading}</span>
      </div>
    )
  }

  // GitHub keeps its config while Cloud owns the sync loop — that is "paused",
  // not "disconnected".
  const githubBadge = !githubConnected
    ? { label: t.settings.sync.notConnected, className: 'border border-border text-text-muted' }
    : cloudEnabled
      ? { label: t.settings.sync.badgePaused, className: 'bg-yellow-500/15 text-yellow-400' }
      : { label: t.settings.sync.badgeActive, className: 'bg-green-500/15 text-green-400' }

  // Cloud is only really syncing with a session behind it (the engine needs the
  // account's JWT for every request), so the badge derives from both flags — it
  // must not be able to lie even if the two ever drift apart.
  const cloudBadge = cloudEnabled && cloudSignedIn
    ? { label: t.settings.sync.badgeActive, className: 'bg-green-500/15 text-green-400' }
    : { label: t.settings.sync.badgeInactive, className: 'border border-border text-text-muted' }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-[11px] font-mono text-text-muted max-w-md leading-relaxed">
          {t.settings.sync.chooseBackendDesc}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <BackendCard
            icon={<Cloud size={12} className={backend === 'cloud' ? 'text-accent' : 'text-text-muted'} />}
            title={t.settings.cloud.title}
            desc={t.settings.sync.cloudCardDesc}
            badge={cloudBadge}
            selected={backend === 'cloud'}
            onSelect={() => setBackend('cloud')}
          />
          <BackendCard
            icon={<Github size={12} className={backend === 'github' ? 'text-accent' : 'text-text-muted'} />}
            title={t.settings.sync.githubTitle}
            desc={t.settings.sync.githubCardDesc}
            badge={githubBadge}
            selected={backend === 'github'}
            onSelect={() => setBackend('github')}
          />
        </div>
      </div>

      <section>
        {backend === 'cloud' ? (
          <CloudPanel onNavigate={onNavigate} />
        ) : (
          <div className="space-y-4">
            {/* Paused while NoteFlow Cloud owns the sync loop (config is kept). */}
            {cloudEnabled && (
              <div className="flex items-start gap-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-[11px] font-mono text-yellow-400 leading-relaxed">
                <Pause size={12} className="flex-shrink-0 mt-0.5" />
                <span>{t.settings.sync.pausedByCloud}</span>
              </div>
            )}
            <GitHubSyncSection onConnectedChange={setGithubConnected} cloudEnabled={cloudEnabled} />
          </div>
        )}
      </section>
    </div>
  )
}

function BackendCard({
  icon,
  title,
  desc,
  badge,
  selected,
  onSelect,
}: {
  icon: ReactNode
  title: string
  desc: string
  badge: { label: string; className: string }
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`text-left p-3 rounded-xl border transition-colors ${
        selected ? 'border-accent bg-accent/[0.08]' : 'border-border hover:bg-surface-2'
      }`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        {icon}
        <span className="text-xs font-mono font-semibold text-text">{title}</span>
        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${badge.className}`}>
          {badge.label}
        </span>
      </div>
      <p className="text-[11px] font-mono text-text-muted mt-1.5 leading-relaxed">{desc}</p>
    </button>
  )
}

function GitHubSyncSection({
  onConnectedChange,
  cloudEnabled,
}: {
  onConnectedChange: (connected: boolean) => void
  // Cloud owns the sync loop → GitHub is a paused write-only mirror, which is the
  // only situation where the "Mirror to GitHub" action is offered — and where
  // "Sync now" (a GitHub pull) is hidden. Main gates both too.
  cloudEnabled: boolean
}) {
  const t = useT()
  const loadNotes = useNotesStore((s) => s.loadNotes)

  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [step, setStep] = useState<Step>('idle')
  const [error, setError] = useState<string | null>(null)
  const [repo, setRepo] = useState('noteflow-notes')
  const [userCode, setUserCode] = useState<string | null>(null)
  const [verificationUri, setVerificationUri] = useState<string | null>(null)
  const [pullResult, setPullResult] = useState<{ pulled: number; errors: string[] } | null>(null)
  const [mirrorResult, setMirrorResult] = useState<MirrorResult | null>(null)
  const [confirmMirror, setConfirmMirror] = useState(false)

  useEffect(() => {
    window.noteflow.getSyncStatus().then(setStatus)
  }, [])

  // Keep the selector badge in sync: main only broadcasts sync:status-changed
  // for the initial pull, so connect/disconnect is reported from here.
  useEffect(() => {
    if (status) onConnectedChange(status.connected)
  }, [status, onConnectedChange])

  // Listen for auth completion from main process
  useEffect(() => {
    const unsub = window.noteflow.onSyncAuthComplete(async (result) => {
      if (result.ok) {
        setStep('completing')
        setUserCode(null)
        const updated = await window.noteflow.getSyncStatus()
        setStatus(updated)
        await loadNotes()
        setStep('idle')
      } else {
        setError(result.error ?? t.settings.sync.authFailed)
        setUserCode(null)
        setStep('idle')
      }
    })
    return unsub
  }, [loadNotes, t])

  // If the user closes the panel mid device-flow, cancel the pending auth.
  useEffect(() => {
    return () => {
      if (userCode) window.noteflow.cancelGitHubAuth()
    }
  }, [userCode])

  async function handleInitiate() {
    if (!repo.trim()) return
    setStep('waiting-auth')
    setError(null)
    const result = await window.noteflow.initiateGitHubAuth(repo.trim())
    if (result.ok && result.userCode && result.verificationUri) {
      setUserCode(result.userCode)
      setVerificationUri(result.verificationUri)
      window.noteflow.openUrl(result.verificationUri)
    } else {
      setError(result.error ?? t.settings.sync.failedToStart)
      setStep('idle')
    }
  }

  async function handleCancel() {
    await window.noteflow.cancelGitHubAuth()
    setUserCode(null)
    setVerificationUri(null)
    setStep('idle')
  }

  async function handlePull() {
    setStep('pulling')
    setError(null)
    setMirrorResult(null)
    const result = await window.noteflow.pullNotes()
    setStep('idle')
    if (result.error === 'cloud-enabled') {
      setError(t.settings.sync.pullCloudEnabled)
      return
    }
    setPullResult(result)
    if (result.pulled > 0) await loadNotes()
    const updated = await window.noteflow.getSyncStatus()
    setStatus(updated)
  }

  // Local → repo. Nothing on disk changes, so no loadNotes() — only the sync
  // status (lastSync / error) needs refreshing.
  async function handleMirror() {
    setStep('mirroring')
    setError(null)
    setPullResult(null)
    setMirrorResult(null)
    const result = await window.noteflow.mirrorToGitHub()
    setMirrorResult(result)
    setStep('idle')
    const updated = await window.noteflow.getSyncStatus()
    setStatus(updated)
  }

  async function handleDisconnect() {
    await window.noteflow.disconnectGitHub()
    const updated = await window.noteflow.getSyncStatus()
    setStatus(updated)
    setPullResult(null)
    setMirrorResult(null)
  }

  function mirrorMessage(result: MirrorResult): string {
    if (result.ok) {
      return result.pushed === 0 && result.deleted === 0
        ? t.settings.sync.mirrorAlreadyMirrored
        : tf(t.settings.sync.mirrorDone, { pushed: result.pushed, deleted: result.deleted })
    }
    switch (result.error) {
      case 'cloud-required': return t.settings.sync.mirrorRequiresCloud
      case 'cloud-initial-pull-pending': return t.settings.sync.mirrorCloudInitialPullPending
      case 'in-progress': return t.settings.sync.mirrorInProgress
      case 'token': return t.settings.sync.mirrorTokenError
      case 'not-connected': return t.settings.sync.notConnected
      // Per-file failures (GitHub API messages) are listed below the message.
      default: return t.settings.sync.mirrorFailed
    }
  }

  function mirrorWarning(code: MirrorResult['warnings'][number]): string {
    switch (code) {
      case 'deletions-skipped-unreadable': return t.settings.sync.mirrorDeletionsSkipped
    }
  }

  const isLoading = step !== 'idle'

  return (
    <div className="space-y-4">
      {/* Status badge */}
      {status && (
        <div className="flex items-center gap-2">
          {status.connected ? (
            <>
              <Cloud size={12} className="text-green-400" />
              <span className="text-xs font-mono text-green-400">{t.settings.sync.connected}</span>
              <span className="text-xs font-mono text-text-muted">·</span>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  window.noteflow.openUrl(`https://github.com/${status.owner}/${status.repo}`)
                }}
                className="text-xs font-mono text-text hover:underline flex items-center gap-1"
              >
                {status.owner}/{status.repo}
                <ExternalLink size={10} />
              </a>
            </>
          ) : (
            <>
              <CloudOff size={12} className="text-text-muted" />
              <span className="text-xs font-mono text-text-muted">{t.settings.sync.notConnected}</span>
            </>
          )}
        </div>
      )}

      {status?.lastSync && (
        <p className="text-[11px] font-mono text-text-muted">
          {tf(t.settings.sync.lastSync, { time: new Date(status.lastSync).toLocaleString() })}
        </p>
      )}

      {/* Error */}
      {(error || status?.error) && (
        <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-xs font-mono text-red-400">
          {error ?? status?.error}
        </div>
      )}

      {/* Pull result */}
      {pullResult && (
        <div className={`px-3 py-2 rounded-lg text-xs font-mono ${
          pullResult.errors.length > 0
            ? 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-400'
            : 'bg-green-500/10 border border-green-500/30 text-green-400'
        }`}>
          {pullResult.pulled === 0
            ? t.settings.sync.alreadyUpToDate
            : plural(t.settings.sync.pulled, pullResult.pulled)}
          {pullResult.errors.length > 0 && (
            <div className="mt-1 text-[11px] text-red-400">{pullResult.errors.join(', ')}</div>
          )}
        </div>
      )}

      {/* Mirror result */}
      {mirrorResult && (
        <div className={`px-3 py-2 rounded-lg text-xs font-mono ${
          mirrorResult.ok
            ? 'bg-green-500/10 border border-green-500/30 text-green-400'
            : 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-400'
        }`}>
          {mirrorMessage(mirrorResult)}
          {/* Our own notices — localized from codes. The raw GitHub API
              failures below stay verbatim (they aren't NoteFlow copy). */}
          {mirrorResult.warnings.map((code) => (
            <div key={code} className="mt-1 text-[11px]">{mirrorWarning(code)}</div>
          ))}
          {mirrorResult.errors.length > 0 && (
            <div className="mt-1 text-[11px] text-red-400">{mirrorResult.errors.join(', ')}</div>
          )}
        </div>
      )}

      {/* ── Waiting for user to authorize in browser ── */}
      {userCode && (
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-mono text-text-muted mb-3">
              {t.settings.sync.goToPrefix}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  window.noteflow.openUrl(verificationUri ?? 'https://github.com/login/device')
                }}
                className="text-text hover:underline"
              >
                github.com/login/device
              </a>
              {t.settings.sync.goToSuffix}
            </p>
            <div className="flex items-center justify-center py-3">
              <span className="text-2xl font-mono font-bold text-text tracking-widest bg-surface-0 border border-border px-6 py-3 rounded-lg">
                {userCode}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-text-muted">
            <Loader size={12} className="animate-spin flex-shrink-0" />
            <span className="text-[11px] font-mono">{t.settings.sync.waitingAuth}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => window.noteflow.openUrl(verificationUri ?? 'https://github.com/login/device')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-surface-2 hover:bg-surface-3 text-text border border-text/20 transition-colors"
            >
              <ExternalLink size={11} />
              {t.settings.sync.openBrowser}
            </button>
            <button
              onClick={handleCancel}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono ${settingsButtonClass}`}
            >
              {t.common.cancel}
            </button>
          </div>
        </div>
      )}

      {/* ── Completing connection ── */}
      {step === 'completing' && !userCode && (
        <div className="flex items-center gap-2 text-text-muted">
          <Loader size={12} className="animate-spin" />
          <span className="text-xs font-mono">{t.settings.sync.connecting}</span>
        </div>
      )}

      {/* ── Connected: actions ── */}
      {status?.connected && !userCode && step !== 'completing' && (
        <div className="flex gap-2">
          {/* Hidden while Cloud owns the sync loop: pulling the paused repo could
              bring back notes deleted under Cloud (main refuses it too). */}
          {!cloudEnabled && (
            <button
              onClick={handlePull}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-surface-2 hover:bg-surface-3 text-text transition-colors disabled:opacity-40"
            >
              {step === 'pulling' ? (
                <Loader size={11} className="animate-spin" />
              ) : (
                <RefreshCw size={11} />
              )}
              {t.settings.sync.syncNow}
            </button>
          )}
          {/* Only while Cloud owns the sync loop: that is when the paused repo
              goes stale (no deletions, no notes coming from other devices). */}
          {cloudEnabled && (
            <button
              onClick={() => setConfirmMirror(true)}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-surface-2 hover:bg-surface-3 text-text transition-colors disabled:opacity-40"
            >
              {step === 'mirroring' ? (
                <Loader size={11} className="animate-spin" />
              ) : (
                <UploadCloud size={11} />
              )}
              {t.settings.sync.mirror}
            </button>
          )}
          <button
            onClick={handleDisconnect}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
          >
            <Unlink size={11} />
            {t.settings.sync.disconnect}
          </button>
        </div>
      )}

      {/* ── Not connected: setup form ── */}
      {status && !status.connected && !userCode && step !== 'completing' && (
        <div className="space-y-3 pt-1">
          <p className="text-[11px] font-mono text-text-muted leading-relaxed">
            {t.settings.sync.setupDesc}
          </p>
          <div>
            <label className="block text-[11px] font-mono text-text-muted mb-1 uppercase tracking-wider">
              {t.settings.sync.repoName}
            </label>
            <input
              type="text"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="noteflow-notes"
              disabled={isLoading}
              className="w-full px-3 py-1.5 rounded-lg text-xs font-mono bg-surface-0 border border-border text-text placeholder:text-text-muted/40 focus:outline-none focus:border-text/30 disabled:opacity-40"
            />
            <p className="text-[11px] font-mono text-text-muted/60 mt-1">
              {t.settings.sync.repoHint}
            </p>
          </div>
          <button
            onClick={handleInitiate}
            disabled={isLoading || !repo.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-surface-2 hover:bg-surface-3 text-text border border-text/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {step === 'waiting-auth' && !userCode ? (
              <Loader size={11} className="animate-spin" />
            ) : (
              <Github size={11} />
            )}
            {t.settings.sync.connectWithGitHub}
          </button>
        </div>
      )}

      {/* Loading spinner for initial status fetch */}
      {!status && (
        <div className="flex items-center gap-2 text-text-muted">
          <Loader size={12} className="animate-spin" />
          <span className="text-xs font-mono">{t.common.loading}</span>
        </div>
      )}

      {confirmMirror && (
        <ConfirmModal
          title={t.settings.sync.mirrorConfirmTitle}
          message={t.settings.sync.mirrorConfirmMessage}
          confirmLabel={t.settings.sync.mirrorConfirmAction}
          cancelLabel={t.common.cancel}
          danger
          onConfirm={() => {
            setConfirmMirror(false)
            void handleMirror()
          }}
          onCancel={() => setConfirmMirror(false)}
        />
      )}
    </div>
  )
}
