import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, ArrowLeft, Check, Cloud, CloudOff, ExternalLink, FolderOpen, Github, HardDrive, Loader, Pause, RefreshCw, Unlink, UploadCloud } from 'lucide-react'
import type { AccountStatus } from '../../types'
import { useNotesStore } from '../../stores/notesStore'
import { plural, tf } from '../../i18n/format'
import { useT } from '../../i18n/useT'
import { ConfirmModal } from '../ConfirmModal'
import { CliConnectSection } from './CliConnectSection'
import { CloudPanel } from './CloudPanel'
import { PlanTag } from './PlanOffers'
import { useOfferTag } from './planOffersShared'
import { hasKnownEntitlement } from '../../lib/subscriptionPlans'
import type { SettingsIntent } from './SettingsModal'
import { settingsButtonClass } from './ui'

interface SyncStatus {
  enabled: boolean
  connected: boolean
  owner?: string
  repo?: string
  lastSync?: string
  error?: string
  // The notes dir came from another remote: nothing syncs until the user chooses.
  originChoice?: { previous: { owner: string; repo: string }; next: { owner: string; repo: string } }
}

type Step = 'idle' | 'waiting-auth' | 'completing' | 'pulling' | 'mirroring'

type MirrorResult = Awaited<ReturnType<typeof window.noteflow.mirrorToGitHub>>

type Backend = 'cloud' | 'github'
// 'choose' = the first-run chooser: no backend in use and none picked yet.
type View = Backend | 'choose'

// The Sync page: ONE backend — NoteFlow Cloud (encrypted, paid) or GitHub Sync
// (free). The two are mutually exclusive: Cloud takes priority in
// electron/syncProvider.ts and pauses GitHub while enabled.
// - Nothing in use yet → a chooser: both options side by side at the same level
//   (value first, the price only as a tag; nothing preselected), and from it the
//   detail of the one picked, with a link back.
// - A backend in use → the two-card selector with status badges, preselecting the
//   one in use, and the panel of the selected one below.
export function SyncPanel({ intent }: { intent?: SettingsIntent }) {
  const t = useT()
  const [cloudEnabled, setCloudEnabled] = useState(false)
  const [cloudSignedIn, setCloudSignedIn] = useState(false)
  const [githubConnected, setGithubConnected] = useState(false)
  const [account, setAccount] = useState<AccountStatus | null>(null)
  // null until both statuses land: the view is resolved once, from what is actually
  // in use — a later status change (enabling Cloud, disconnecting GitHub) must never
  // move the user off the panel they are on. Whether the page shows the first-run
  // chooser or the backend selector, on the other hand, follows the LIVE state: once
  // something syncs (connected from the chooser itself), "← Sync options" lands on
  // the selector, never on "Only on this device".
  const [view, setView] = useState<View | null>(null)
  // Settings → Account's "View" on NoteFlow Cloud / the Bundle lands on the Cloud detail.
  const offer = intent?.offer
  const [openCloudDetail] = useState(offer === 'cloud' || offer === 'bundle')

  useEffect(() => {
    Promise.all([window.noteflow.getCloudStatus(), window.noteflow.getSyncStatus()]).then(
      ([cloud, github]) => {
        setCloudEnabled(cloud.enabled)
        setCloudSignedIn(cloud.signedIn)
        setGithubConnected(github.connected)
        setView(cloud.enabled || openCloudDetail ? 'cloud' : github.connected ? 'github' : 'choose')
      },
    )
    const offCloud = window.noteflow.onCloudStatusChanged((s) => {
      setCloudEnabled(s.enabled)
      setCloudSignedIn(s.signedIn)
    })
    // Signing out turns Cloud sync off in main (electron/accountTransition.ts),
    // so both statuses move together — but listen to the account too, so the
    // badge can never claim "Active" while the session is gone. The full status
    // also feeds the price tag of the chooser.
    void window.noteflow.getAccountStatus().then(setAccount)
    const offAccount = window.noteflow.onAccountStatusChanged((s) => {
      setAccount(s)
      setCloudSignedIn(s.signedIn)
    })
    return () => {
      offCloud()
      offAccount()
    }
  }, [openCloudDetail])

  if (view === null) {
    return (
      <div className="flex items-center gap-2 text-text-muted">
        <Loader size={12} className="animate-spin" />
        <span className="text-xs font-mono">{t.common.loading}</span>
      </div>
    )
  }

  const backendInUse = cloudEnabled || githubConnected

  // ── First run: nothing in use yet ──
  if (!backendInUse && view === 'choose') {
    return <SyncChooser account={account} onPick={setView} />
  }
  const backend: Backend = view === 'choose' ? 'cloud' : view

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
      {backendInUse ? (
        <div className="space-y-3">
          <p className="text-[11px] font-mono text-text-muted leading-relaxed">
            {t.settings.sync.chooseBackendDesc}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <BackendCard
              icon={<Cloud size={12} className={backend === 'cloud' ? 'text-accent' : 'text-text-muted'} />}
              title={t.settings.cloud.title}
              desc={account && hasKnownEntitlement(account, 'cloud') ? t.settings.sync.cloudCardDescOwned : t.settings.sync.cloudCardDesc}
              badge={cloudBadge}
              selected={backend === 'cloud'}
              onSelect={() => setView('cloud')}
            />
            <BackendCard
              icon={<Github size={12} className={backend === 'github' ? 'text-accent' : 'text-text-muted'} />}
              title={t.settings.sync.githubTitle}
              desc={t.settings.sync.githubCardDesc}
              badge={githubBadge}
              selected={backend === 'github'}
              onSelect={() => setView('github')}
            />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setView('choose')}
          className="flex items-center gap-1.5 text-[11px] font-mono text-text-muted hover:text-text transition-colors"
        >
          <ArrowLeft size={11} />
          {t.settings.sync.backToOptions}
        </button>
      )}

      <section>
        {backend === 'cloud' ? (
          <CloudPanel initialBundle={offer === 'bundle'} />
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

      {/* "Connect the CLI too" — only for the selected backend, and only while
          the app itself is connected to it (Cloud: active with a session). */}
      {(backend === 'cloud' ? cloudEnabled && cloudSignedIn : githubConnected) && (
        <CliConnectSection key={backend} backend={backend} />
      )}
    </div>
  )
}

// First-run chooser: NoteFlow Cloud and GitHub Sync as two equal cards — who each
// one is for, three points of value, a discreet price tag and its own button.
function SyncChooser({ account, onPick }: { account: AccountStatus | null; onPick: (view: Backend) => void }) {
  const t = useT()
  const cloudTag = useOfferTag(account, 'cloud')
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="flex items-center gap-2 text-xs font-mono text-text-muted">
          <HardDrive size={12} className="shrink-0" />
          {t.settings.sync.localOnly}
        </p>
        <p className="text-[11px] font-mono text-text-muted/80 leading-relaxed">{t.settings.sync.chooseIntro}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <ChoiceCard
          icon={<Cloud size={13} className="text-text-muted" />}
          title={t.settings.cloud.title}
          tag={cloudTag}
          audience={t.settings.sync.choiceCloud.audience}
          points={t.settings.sync.choiceCloud.points}
          cta={t.settings.sync.choiceCloud.cta}
          onPick={() => onPick('cloud')}
        />
        <ChoiceCard
          icon={<Github size={13} className="text-text-muted" />}
          title={t.settings.sync.githubTitle}
          tag={t.settings.plans.free}
          audience={t.settings.sync.choiceGithub.audience}
          points={t.settings.sync.choiceGithub.points}
          cta={t.settings.sync.choiceGithub.cta}
          onPick={() => onPick('github')}
        />
      </div>
      {/* Returning subscribers: the Cloud detail carries the inline sign-in. */}
      {account?.configured && !account.signedIn && (
        <p className="text-[11px] font-mono text-text-muted/80">
          {t.settings.sync.haveCloud}{' '}
          <button
            type="button"
            onClick={() => onPick('cloud')}
            className="underline underline-offset-2 text-text-muted hover:text-text transition-colors"
          >
            {t.settings.account.signIn}
          </button>
        </p>
      )}
    </div>
  )
}

function ChoiceCard({
  icon,
  title,
  tag,
  audience,
  points,
  cta,
  onPick,
}: {
  icon: ReactNode
  title: string
  tag: string | null
  audience: string
  points: readonly string[]
  cta: string
  onPick: () => void
}) {
  return (
    <div className="flex flex-col gap-3 p-3.5 rounded-xl border border-solid border-border bg-surface-0">
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          {icon}
          <span className="text-xs font-mono font-semibold text-text">{title}</span>
          {tag && <PlanTag>{tag}</PlanTag>}
        </div>
        <p className="text-[11px] font-mono text-text-muted leading-relaxed">{audience}</p>
      </div>
      <ul className="space-y-1">
        {points.map((point) => (
          <li key={point} className="flex items-start gap-2 text-[11px] font-mono text-text-muted leading-relaxed">
            <Check size={11} className="mt-[3px] shrink-0 text-accent" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onPick}
        className={`mt-auto self-start px-3 py-1.5 rounded-lg text-xs font-mono ${settingsButtonClass}`}
      >
        {cta}
      </button>
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
  // Local copies made by "Use only the notes from …" exist (userData/notes-archive).
  const [hasArchives, setHasArchives] = useState(false)

  useEffect(() => {
    const refresh = () => {
      window.noteflow.getSyncStatus().then(setStatus)
      window.noteflow.getNotesArchiveStatus().then((s) => setHasArchives(s.hasArchives)).catch(() => undefined)
    }
    refresh()
    // Origin choice made (or pending) elsewhere — the titlebar dialog, a restart.
    return window.noteflow.onSyncStatusChanged(refresh)
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
    if (result.error === 'origin-choice-pending') {
      setError(t.settings.sync.pullOriginPending)
      setStatus(await window.noteflow.getSyncStatus())
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
      case 'origin-choice-pending': return t.settings.sync.mirrorOriginPending
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

      {/* The notes dir came from another remote: paused until the user chooses
          (the dialog lives in the titlebar — it also opens on its own). */}
      {status?.originChoice && (
        <div className="flex items-start gap-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-[11px] font-mono text-yellow-400 leading-relaxed">
          <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1.5">
            <p>
              {tf(t.settings.sync.originPending, {
                previous: `${status.originChoice.previous.owner}/${status.originChoice.previous.repo}`,
                next: `${status.originChoice.next.owner}/${status.originChoice.next.repo}`,
              })}
            </p>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('noteflow:open-origin-choice'))}
              className="px-2 py-0.5 rounded border border-yellow-500/40 hover:bg-yellow-500/20 transition-colors"
            >
              {t.settings.sync.originChoose}
            </button>
          </div>
        </div>
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

      {/* ── Connected: actions ── */}
      {status?.connected && !userCode && step !== 'completing' && (
        <div className="flex gap-2">
          {/* Hidden while Cloud owns the sync loop: pulling the paused repo could
              bring back notes deleted under Cloud (main refuses it too). */}
          {!cloudEnabled && !status.originChoice && (
            <button
              onClick={handlePull}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono settings-btn bg-surface-2 hover:bg-surface-3 text-text transition-colors disabled:opacity-40"
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono settings-btn bg-surface-2 hover:bg-surface-3 text-text transition-colors disabled:opacity-40"
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

      {/* Local copies of notes set aside by "Use only the notes from …" */}
      {hasArchives && (
        <div className="flex items-center gap-3 pt-1">
          <p className="flex-1 text-[11px] font-mono text-text-muted leading-relaxed">{t.settings.sync.archivesDesc}</p>
          <button
            type="button"
            onClick={() => void window.noteflow.openNotesArchive()}
            className="flex items-center gap-1.5 flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-mono settings-btn bg-surface-2 hover:bg-surface-3 text-text transition-colors"
          >
            <FolderOpen size={11} />
            {t.settings.sync.openArchives}
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
