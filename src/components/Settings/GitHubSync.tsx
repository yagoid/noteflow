import { useEffect, useState } from 'react'
import { BookMarked, Check, Cloud, ExternalLink, GitCommitHorizontal, Github, Info, Loader, Unlink, UploadCloud } from 'lucide-react'
import { useNotesStore } from '../../stores/notesStore'
import { plural, tf } from '../../i18n/format'
import { useT } from '../../i18n/useT'
import { githubCommitsUrl, githubRepoUrl, repoSlug } from '../../lib/syncOverview'
import { originChoiceLabels } from '../../lib/originChoiceLabels'
import { ConfirmModal } from '../ConfirmModal'
import { useActiveSyncStatus } from '../useActiveSyncStatus'
import { SyncOverview } from './SyncOverview'
import {
  SettingsRow,
  StatusBadge,
  settingsButtonClass,
  settingsDangerButtonClass,
  settingsGhostButtonClass,
} from './ui'
import { useGitHubSync, type GitHubSync } from './useGitHubSync'

type SetupStep = 'idle' | 'waiting-auth' | 'completing'

// GitHub Sync while NOT connected (the detail picked from the chooser, or what
// stays after disconnecting): repository name → device-flow authorization.
// Once connected, SyncPanel moves to the overview (GitHubOverview).
// Opened from the Cloud overview while Cloud is on (`cloudEnabled`), it is
// informative only: what GitHub Sync offers + "turn off Cloud first", with no
// way to connect — the device flow ends in an initial pull of the repo that
// could bring back notes deleted under Cloud (see .agents/context/sync.md).
// Cloud turned off meanwhile → the normal setup form, live.
export function GitHubSetup({
  cloudEnabled = false,
  onConnectedChange,
}: {
  cloudEnabled?: boolean
  onConnectedChange: (connected: boolean) => void
}) {
  const t = useT()
  const loadNotes = useNotesStore((s) => s.loadNotes)
  const [step, setStep] = useState<SetupStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [repo, setRepo] = useState('noteflow-notes')
  const [userCode, setUserCode] = useState<string | null>(null)
  const [verificationUri, setVerificationUri] = useState<string | null>(null)

  // Listen for auth completion from main process
  useEffect(() => {
    const unsub = window.noteflow.onSyncAuthComplete(async (result) => {
      if (result.ok) {
        setStep('completing')
        setUserCode(null)
        const updated = await window.noteflow.getSyncStatus()
        await loadNotes()
        setStep('idle')
        onConnectedChange(updated.connected)
      } else {
        setError(result.error ?? t.settings.sync.authFailed)
        setUserCode(null)
        setStep('idle')
      }
    })
    return unsub
  }, [loadNotes, t, onConnectedChange])

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

  const isLoading = step !== 'idle'

  if (cloudEnabled && step === 'idle' && !userCode) return <GitHubInfoWhileCloud />

  return (
    <div className="space-y-4">
      {error && (
        <div className="px-3 py-2 bg-red/10 border border-red/30 rounded-lg text-xs font-mono text-red">
          {error}
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono settings-btn bg-surface-2 hover:bg-surface-3 text-text border border-text/20 transition-colors"
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

      {/* ── Setup form ── */}
      {!userCode && step !== 'completing' && (
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono settings-btn bg-surface-2 hover:bg-surface-3 text-text border border-text/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
    </div>
  )
}

// GitHubSetup while NoteFlow Cloud is on: what GitHub Sync offers (the chooser's
// card copy) and why it can't be connected from here.
function GitHubInfoWhileCloud() {
  const t = useT()
  const sync = t.settings.sync
  return (
    <div className="space-y-4 pt-1">
      <div className="space-y-2">
        <p className="flex items-center gap-2 text-xs font-mono font-semibold text-text">
          <Github size={13} className="text-text-muted" />
          {sync.githubTitle}
        </p>
        <p className="text-[11px] font-mono text-text-muted leading-relaxed">{sync.choiceGithub.audience}</p>
        <ul className="space-y-1">
          {sync.choiceGithub.points.map((point) => (
            <li key={point} className="flex items-start gap-2 text-[11px] font-mono text-text-muted leading-relaxed">
              <Check size={11} className="mt-[3px] shrink-0 text-accent" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>
      <div role="note" className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg border border-solid border-accent/30 bg-accent/10">
        <Info size={13} className="mt-px shrink-0 text-accent" />
        <div className="space-y-1">
          <p className="text-xs font-mono font-semibold text-text">{sync.githubCloudActiveTitle}</p>
          <p className="text-[11px] font-mono text-text-muted leading-relaxed">{sync.githubCloudActiveNotice}</p>
        </div>
      </div>
    </div>
  )
}

// GitHub Sync as the live backend: the shared overview with the repository
// rows, NoteFlow Cloud as the inactive alternative and Disconnect in the footer.
export function GitHubOverview({
  onConnectedChange,
  onViewCloud,
}: {
  onConnectedChange: (connected: boolean) => void
  /** "See NoteFlow Cloud": the Cloud detail (plan / sign-in / enable), as the chooser opens it. */
  onViewCloud: () => void
}) {
  const t = useT()
  const o = t.settings.sync.overview
  const gh = useGitHubSync(onConnectedChange)
  const owner = gh.status?.owner
  const name = gh.status?.repo
  const errorText = gh.error ?? gh.status?.error

  return (
    <SyncOverview
      provider="github"
      syncing={gh.busy === 'pulling'}
      canSync={gh.busy === 'idle'}
      onSync={gh.pull}
      notices={
        (errorText || gh.pullResult) && (
          <div className="space-y-2">
            {errorText && <ErrorNotice>{errorText}</ErrorNotice>}
            {gh.pullResult && <PullResultNotice result={gh.pullResult} />}
          </div>
        )
      }
      dataTitle={o.repoDataTitle}
      dataRows={
        <>
          <SettingsRow
            icon={<BookMarked size={14} />}
            title={o.repoTitle}
            description={o.repoDesc}
            action={
              owner && name && (
                <button
                  onClick={() => window.noteflow.openUrl(githubRepoUrl(owner, name))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap ${settingsButtonClass}`}
                >
                  {o.openOnGithub}
                </button>
              )
            }
          />
          <SettingsRow
            icon={<GitCommitHorizontal size={14} />}
            title={o.gitHistoryTitle}
            description={o.gitHistoryDesc}
            action={
              owner && name && (
                <button
                  onClick={() => window.noteflow.openUrl(githubCommitsUrl(owner, name))}
                  className={settingsGhostButtonClass}
                >
                  {o.viewCommits}
                </button>
              )
            }
          />
        </>
      }
      otherProviders={
        <SettingsRow
          icon={<Cloud size={14} />}
          title={t.settings.cloud.title}
          badge={<StatusBadge tone="neutral">{t.settings.sync.badgeInactive}</StatusBadge>}
          description={o.cloudInactiveDesc}
          action={
            <button
              onClick={onViewCloud}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap ${settingsButtonClass}`}
            >
              {t.settings.sync.choiceCloud.cta}
            </button>
          }
        />
      }
      footerText={o.footerGithub}
      footerAction={
        <button onClick={() => void gh.disconnect()} disabled={gh.busy !== 'idle'} className={settingsDangerButtonClass}>
          {gh.busy === 'disconnecting' ? <Loader size={12} className="animate-spin" /> : <Unlink size={12} />}
          {o.disconnectGithub}
        </button>
      }
    />
  )
}

// GitHub Sync while NoteFlow Cloud owns the sync loop — a row of the Cloud
// overview's "Other providers": paused, config kept, with the write-only
// "Mirror to GitHub" (confirmed: it overwrites the repo) and Disconnect.
// Rendered only while GitHub is connected. While Cloud's origin choice is
// pending main refuses the mirror (the notes on disk may be another account's),
// so the button is off — same criterion and text as the overview's "Sync now".
export function GitHubPausedRow({ onConnectedChange }: { onConnectedChange: (connected: boolean) => void }) {
  const t = useT()
  const o = t.settings.sync.overview
  const gh = useGitHubSync(onConnectedChange)
  const live = useActiveSyncStatus()
  const repo = repoSlug(gh.status?.owner, gh.status?.repo) ?? ''
  const busy = gh.busy !== 'idle'
  const pausedError = gh.error ?? gh.status?.error
  const pendingChoice = live.status?.backend === 'cloud' ? live.status.originChoice : undefined
  const originPending = pendingChoice
    ? tf(t.settings.sync.originPending, originChoiceLabels(t.originChoice, 'cloud', pendingChoice))
    : null

  return (
    <>
      <SettingsRow
        icon={<Github size={14} />}
        title={t.settings.sync.githubTitle}
        badge={<StatusBadge tone="warn">{t.settings.sync.badgePaused}</StatusBadge>}
        description={tf(o.githubPausedDesc, { repo })}
        action={
          <>
            <button
              onClick={() => gh.setConfirmMirror(true)}
              disabled={busy || !!originPending}
              title={originPending ?? undefined}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap ${settingsButtonClass}`}
            >
              {gh.busy === 'mirroring' ? <Loader size={11} className="animate-spin" /> : <UploadCloud size={11} />}
              {t.settings.sync.mirror}
            </button>
            <button onClick={() => void gh.disconnect()} disabled={busy} className={settingsGhostButtonClass}>
              {gh.busy === 'disconnecting' && <Loader size={11} className="animate-spin" />}
              {t.settings.sync.disconnect}
            </button>
          </>
        }
      >
        {pausedError || gh.mirrorResult ? (
          <>
            {pausedError && <ErrorNotice>{pausedError}</ErrorNotice>}
            {gh.mirrorResult && <MirrorResultNotice gh={gh} result={gh.mirrorResult} />}
          </>
        ) : null}
      </SettingsRow>

      {gh.confirmMirror && (
        <ConfirmModal
          title={t.settings.sync.mirrorConfirmTitle}
          message={t.settings.sync.mirrorConfirmMessage}
          confirmLabel={t.settings.sync.mirrorConfirmAction}
          cancelLabel={t.common.cancel}
          danger
          onConfirm={() => {
            gh.setConfirmMirror(false)
            void gh.mirror()
          }}
          onCancel={() => gh.setConfirmMirror(false)}
        />
      )}
    </>
  )
}

// "Other providers" of the Cloud overview while GitHub Sync was never connected:
// shown anyway so its detail can be browsed without turning Cloud off.
export function GitHubNotConnectedRow({ onView }: { onView: () => void }) {
  const t = useT()
  const o = t.settings.sync.overview
  return (
    <SettingsRow
      icon={<Github size={14} />}
      title={t.settings.sync.githubTitle}
      badge={<StatusBadge tone="neutral">{t.settings.sync.notConnected}</StatusBadge>}
      description={o.githubNotConnectedDesc}
      action={
        <button
          onClick={onView}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap ${settingsButtonClass}`}
        >
          {o.viewGithub}
        </button>
      }
    />
  )
}

function ErrorNotice({ children }: { children: string }) {
  return (
    <div className="px-3 py-2 bg-red/10 border border-red/30 rounded-lg text-xs font-mono text-red break-words">
      {children}
    </div>
  )
}

function PullResultNotice({ result }: { result: { pulled: number; errors: string[] } }) {
  const t = useT()
  return (
    <div
      className={`px-3 py-2 rounded-lg text-xs font-mono ${
        result.errors.length > 0
          ? 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-400'
          : 'bg-green-500/10 border border-green-500/30 text-green-400'
      }`}
    >
      {result.pulled === 0 ? t.settings.sync.alreadyUpToDate : plural(t.settings.sync.pulled, result.pulled)}
      {result.errors.length > 0 && <div className="mt-1 text-[11px] text-red">{result.errors.join(', ')}</div>}
    </div>
  )
}

function MirrorResultNotice({ gh, result }: { gh: GitHubSync; result: NonNullable<GitHubSync['mirrorResult']> }) {
  return (
    <div
      className={`px-3 py-2 rounded-lg text-xs font-mono ${
        result.ok
          ? 'bg-green-500/10 border border-green-500/30 text-green-400'
          : 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-400'
      }`}
    >
      {gh.mirrorMessage(result)}
      {/* Our own notices — localized from codes. The raw GitHub API
          failures below stay verbatim (they aren't NoteFlow copy). */}
      {result.warnings.map((code) => (
        <div key={code} className="mt-1 text-[11px]">{gh.mirrorWarning(code)}</div>
      ))}
      {result.errors.length > 0 && <div className="mt-1 text-[11px] text-red">{result.errors.join(', ')}</div>}
    </div>
  )
}
