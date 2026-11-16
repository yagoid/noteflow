import { useEffect, useState } from 'react'
import { Check, Cloud, CloudOff, Copy, History, KeyRound, Loader, Lock, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { AccountStatus, CloudSyncStatus } from '../../types'
import { hasKnownEntitlement, isPlanUnknown } from '../../lib/subscriptionPlans'
import { useNotesStore } from '../../stores/notesStore'
import { plural, tf } from '../../i18n/format'
import { useT } from '../../i18n/useT'
import { PlanDetail, PlanUnknownNotice } from './PlanOffers'
import { GitHubPausedRow } from './GitHubSync'
import { SyncOverview } from './SyncOverview'
import { SettingsRow, StatusBadge, settingsButtonClass, settingsDangerButtonClass, settingsGhostButtonClass } from './ui'

// UI-only floor (the backend imposes no minimum); the passphrase only wraps
// the DEK so any reasonable floor works.
const MIN_PASSPHRASE_LENGTH = 8

type Busy = 'idle' | 'setup' | 'unlock' | 'pull' | 'toggle' | 'upgrade' | 'downgrade'

// Settings → Sync → NoteFlow Cloud (encrypted sync, phase 4.2). Key material
// never reaches this panel: it only exchanges the public CloudSyncStatus plus
// the recovery code, which is held in local state and discarded once confirmed.
//
// Two encryption modes (keysMode): 'managed' (standard — the default; the key
// is held server-side and unlocking is silent, so this panel NEVER asks a
// managed user for a secret) and 'e2ee' (private — passphrase + recovery code).
// Both switches live here and are explicit, confirmed operations: "switch to
// private mode" (managed → e2ee) and "switch to standard mode" (e2ee →
// managed, which invalidates the passphrase and recovery code — warned before
// confirming, never silent).
//
// While Cloud is ENABLED the panel is the sync overview (SyncOverview: status
// card + map, "Security and data", the paused GitHub mirror, Turn off); the key
// states that block syncing (onboarding, unlock) show right under the card.
// Not enabled, it is the detail: plan / sign-in, keys, Enable.
interface CloudPanelProps {
  initialBundle?: boolean
  /** GitHub Sync is connected (SyncPanel owns this state). */
  githubConnected: boolean
  /** A disconnect from the paused GitHub row. */
  onGithubConnectedChange: (connected: boolean) => void
  /** "Turn off NoteFlow Cloud" was clicked — SyncPanel keeps the user on the Cloud detail. */
  onTurnOff?: () => void
}

export function CloudPanel({ initialBundle = false, githubConnected, onGithubConnectedChange, onTurnOff }: CloudPanelProps) {
  const t = useT()
  const loadNotes = useNotesStore((s) => s.loadNotes)

  const [status, setStatus] = useState<CloudSyncStatus | null>(null)
  const [account, setAccount] = useState<AccountStatus | null>(null)
  const [busy, setBusy] = useState<Busy>('idle')
  const [error, setError] = useState<string | null>(null)
  const [pullResult, setPullResult] = useState<{ pulled: number; errors: string[] } | null>(null)
  // Bundle chosen in the plan detail. Lives here, not in PlanDetail, so the choice
  // survives the remount when the user signs in from the detail itself.
  const [offerBundle, setOfferBundle] = useState(initialBundle)

  // Onboarding (state: no-keys): which mode card is selected. Standard is the
  // default and the recommended one.
  const [setupMode, setSetupMode] = useState<'standard' | 'private'>('standard')
  // Passphrase form — shared by the private setup and the managed → e2ee upgrade.
  const [passphrase, setPassphrase] = useState('')
  const [confirmPassphrase, setConfirmPassphrase] = useState('')
  // Managed → private upgrade form visibility (state: unlocked + managed).
  const [showUpgrade, setShowUpgrade] = useState(false)
  // Private → standard downgrade confirmation visibility (state: unlocked + e2ee).
  const [showDowngrade, setShowDowngrade] = useState(false)
  // Unlock form (state: locked + e2ee)
  const [secret, setSecret] = useState('')
  // Recovery code: local component state ONLY — never persisted anywhere. It is
  // shown once after setup/upgrade and discarded when the user confirms having
  // saved it.
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    window.noteflow.getCloudStatus().then(setStatus)
    // An unlocked device never re-asks the server for the encryption mode, so
    // re-read it on open: another device may have switched it meanwhile. Main
    // broadcasts cloud:status-changed (caught below) when it did change.
    window.noteflow.cloudRefreshKeysMode()
    const unsubStatus = window.noteflow.onCloudStatusChanged(setStatus)
    // A push that fails (or lands) emits no cloud:status-changed — re-read the
    // status when the uploads settle so the pending-changes line stays current.
    const unsubPush = window.noteflow.onSyncPushState((state) => {
      if (state === 'idle') window.noteflow.getCloudStatus().then(setStatus)
    })
    return () => {
      unsubStatus()
      unsubPush()
    }
  }, [])

  useEffect(() => {
    window.noteflow.getAccountStatus().then(setAccount)
    return window.noteflow.onAccountStatusChanged(setAccount)
  }, [])

  // Managed keys unlock silently (the main process also tries at boot, on
  // sign-in and on the autosync tick) — while the locked state is visible,
  // poll so an offline boot recovers as soon as the connection is back. Only
  // e2ee mode is excluded: that unlock is user-driven via the passphrase form.
  const managedLocked =
    status !== null && status.signedIn && status.keysState === 'locked' && status.keysMode !== 'e2ee'
  useEffect(() => {
    if (!managedLocked) return
    window.noteflow.cloudAutoUnlock()
    const timer = setInterval(() => window.noteflow.cloudAutoUnlock(), 10_000)
    return () => clearInterval(timer)
  }, [managedLocked])

  function validatePassphraseForm(): boolean {
    if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
      setError(tf(t.settings.cloud.passphraseTooShort, { min: MIN_PASSPHRASE_LENGTH }))
      return false
    }
    // The unlock trims what the user types (handleUnlock) and setup/upgrade do
    // not, so a passphrase with edge whitespace would wrap the DEK under a key
    // no client can derive again. Reject it here, setup/upgrade only — never
    // on unlock, which must keep opening passphrases created before this rule.
    if (passphrase !== passphrase.trim()) {
      setError(t.settings.cloud.passphraseEdgeWhitespace)
      return false
    }
    if (passphrase !== confirmPassphrase) {
      setError(t.settings.cloud.passphraseMismatch)
      return false
    }
    return true
  }

  // Standard (managed) setup: one click, no secrets — lands directly on unlocked.
  async function handleSetupManaged() {
    setBusy('setup')
    setError(null)
    const result = await window.noteflow.cloudSetupManaged()
    setBusy('idle')
    if (!result.ok) setError(result.error ?? t.settings.cloud.setupManagedFailed)
  }

  async function handleSetup() {
    if (!validatePassphraseForm()) return
    setBusy('setup')
    setError(null)
    const result = await window.noteflow.cloudSetup(passphrase)
    setBusy('idle')
    if (result.ok && result.recoveryCode) {
      setRecoveryCode(result.recoveryCode)
      setPassphrase('')
      setConfirmPassphrase('')
    } else {
      setError(result.error ?? t.settings.cloud.setupFailed)
    }
  }

  // One-way managed → e2ee upgrade; surfaces the new recovery code ONCE via
  // the same block as the private setup.
  async function handleUpgrade() {
    if (!validatePassphraseForm()) return
    setBusy('upgrade')
    setError(null)
    const result = await window.noteflow.cloudUpgradeE2ee(passphrase)
    setBusy('idle')
    if (result.ok && result.recoveryCode) {
      setRecoveryCode(result.recoveryCode)
      setShowUpgrade(false)
      setPassphrase('')
      setConfirmPassphrase('')
    } else if (result.errorCode === 'already-e2ee') {
      // Switched to private on another device meanwhile: nothing was rewritten
      // and no recovery code exists for this attempt. The status broadcast
      // already moved the panel to the private-mode controls.
      setShowUpgrade(false)
      setPassphrase('')
      setConfirmPassphrase('')
      setError(t.settings.cloud.upgradeAlreadyPrivate)
    } else {
      setError(result.error ?? t.settings.cloud.upgradeFailed)
    }
  }

  // e2ee → managed downgrade — no secrets involved (requires being unlocked);
  // the amber notice above the confirm button carries the two warnings.
  async function handleDowngrade() {
    setBusy('downgrade')
    setError(null)
    const result = await window.noteflow.cloudDowngradeManaged()
    setBusy('idle')
    if (result.ok) {
      setShowDowngrade(false)
    } else {
      setError(result.error ?? t.settings.cloud.downgradeFailed)
    }
  }

  async function handleUnlock() {
    const trimmed = secret.trim()
    if (!trimmed) return
    setBusy('unlock')
    setError(null)
    const result = await window.noteflow.cloudUnlock(trimmed)
    setBusy('idle')
    if (result.ok) {
      setSecret('')
    } else {
      setError(result.error ?? t.settings.cloud.unlockFailed)
    }
  }

  async function handleEnable() {
    setBusy('toggle')
    setError(null)
    const result = await window.noteflow.cloudEnable()
    setBusy('idle')
    if (!result.ok) setError(result.error ?? t.settings.cloud.enableFailed)
  }

  async function handleDisable() {
    onTurnOff?.()
    setBusy('toggle')
    setError(null)
    await window.noteflow.cloudDisable()
    setBusy('idle')
  }

  async function handlePull() {
    setBusy('pull')
    setError(null)
    const result = await window.noteflow.cloudPull()
    setPullResult({ pulled: result.pulled, errors: result.errors })
    setBusy('idle')
    if (result.pulled > 0) await loadNotes()
  }

  async function handleLock() {
    setError(null)
    await window.noteflow.cloudLock()
  }

  function handleCopyRecovery() {
    if (!recoveryCode) return
    navigator.clipboard.writeText(recoveryCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // No title or intro in the detail: SyncPanel already names it (the chooser /
  // the "Other providers" row that leads here; the overview has its own status
  // card), and the pitch (encryption included) lives in the plan detail's
  // "What's included" column.

  // ── Initial status fetch ──
  if (!status || !account) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-text-muted">
          <Loader size={12} className="animate-spin" />
          <span className="text-xs font-mono">{t.common.loading}</span>
        </div>
      </div>
    )
  }

  // ── Not configured (no Supabase project in this build) ──
  if (!status.configured) {
    return (
      <div className="space-y-4">
        <p className="text-[11px] font-mono text-text-muted leading-relaxed">
          {t.settings.cloud.notAvailable}
        </p>
      </div>
    )
  }

  // ── Recovery code — shown ONCE, blocks everything else until confirmed ──
  if (recoveryCode) {
    return (
      <div className="space-y-4">
        <div className="px-4 py-3 bg-yellow-500/10 border border-yellow-500/40 rounded-xl space-y-3">
          <div className="flex items-center gap-2">
            <ShieldAlert size={13} className="text-yellow-400 flex-shrink-0" />
            <span className="text-xs font-mono font-semibold text-yellow-400">
              {t.settings.cloud.recoveryTitle}
            </span>
          </div>
          <p className="text-[11px] font-mono text-text-muted leading-relaxed">
            {t.settings.cloud.recoveryDesc}
          </p>
          <div className="flex items-center justify-center py-2">
            <span className="text-sm font-mono font-bold text-text tracking-wider select-all bg-surface-0 border border-border px-4 py-2.5 rounded-lg break-all text-center">
              {recoveryCode}
            </span>
          </div>
          <p className="text-[11px] font-mono text-red leading-relaxed">
            {t.settings.cloud.recoveryWarning}
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleCopyRecovery}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono settings-btn bg-surface-2 hover:bg-surface-3 text-text border border-text/20 transition-colors"
            >
              {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
              {copied ? t.settings.cloud.copied : t.settings.cloud.copyCode}
            </button>
            <button
              onClick={() => setRecoveryCode(null)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono ${settingsButtonClass}`}
            >
              {t.settings.cloud.recoverySaved}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Signed out ── what Cloud includes, then one plan box whose call to action is
  // the inline sign-in (also the way in for someone who already pays).
  if (!status.signedIn) {
    return <PlanDetail product="cloud" account={account} bundle={offerBundle} onBundleChange={setOfferBundle} />
  }

  const isLoading = busy !== 'idle'

  // KNOWN to have the cloud entitlement. Entitlements that were never fetched
  // (offline boot, keychain locked…) are UNKNOWN: neither the paywall (a paying
  // user must never be offered the plan again) nor the onboarding / Enable
  // button — the gate shows a neutral "couldn't verify your plan — Retry".
  const cloudEntitled = hasKnownEntitlement(account, 'cloud')
  const planUnknown = isPlanUnknown(account)

  // Entitlement gate — shared by the two places where the panel stops short of
  // Cloud: the onboarding (no keys yet: creating keys for a cloud you cannot use
  // is pointless) and the enable button (unlocked but not enabled). The same plan
  // detail in both so the offer reads identically wherever it shows up (value,
  // one plan box, the Bundle as a line — or the Bundle plan change for an AI-only
  // subscriber). Unlock, Sync now, Disable and Lock stay ungated: whoever already
  // has keys and data up there must keep being able to read and take it out after
  // lapsing. Display prices — the authoritative figure is the checkout's.
  const subscriptionGate = planUnknown ? (
    <PlanUnknownNotice />
  ) : (
    <PlanDetail product="cloud" account={account} bundle={offerBundle} onBundleChange={setOfferBundle} />
  )

  // ── Blocks shared by the overview (Cloud enabled) and the detail (not enabled) ──

  // Error (local or engine syncError — e.g. an expired subscription)
  const errorBlock = (error || status.error) && (
    <div className="px-3 py-2 bg-red/10 border border-red/30 rounded-lg text-xs font-mono text-red">
      {error ?? status.error}
    </div>
  )

  // Result of "Sync now" — not "Already up to date" while changes are still pending.
  const pullResultBlock = pullResult && (pullResult.pulled > 0 || pullResult.errors.length > 0 || status.pendingChanges === 0) && (
    <div className={`px-3 py-2 rounded-lg text-xs font-mono ${
      pullResult.errors.length > 0
        ? 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-400'
        : 'bg-green-500/10 border border-green-500/30 text-green-400'
    }`}>
      {pullResult.pulled > 0
        ? plural(t.settings.sync.pulled, pullResult.pulled)
        : pullResult.errors.length === 0 && t.settings.sync.alreadyUpToDate}
      {pullResult.errors.length > 0 && (
        <div className="mt-1 text-[11px] text-red">{pullResult.errors.join(', ')}</div>
      )}
    </div>
  )

  // ── Onboarding (no keys yet): choose the encryption mode — two cards,
  //    Standard (managed) preselected and recommended ──
  const onboarding = (
    <div className="space-y-3">
      <p className="text-[11px] font-mono text-text-muted leading-relaxed">
        {t.settings.cloud.chooseModeDesc}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setSetupMode('standard')}
          aria-pressed={setupMode === 'standard'}
          className={`text-left p-3 rounded-xl border transition-colors ${
            setupMode === 'standard' ? 'border-accent bg-accent/[0.08]' : 'border-border hover:bg-surface-2'
          }`}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <Cloud size={12} className={setupMode === 'standard' ? 'text-accent' : 'text-text-muted'} />
            <span className="text-xs font-mono font-semibold text-text">
              {t.settings.cloud.modeStandardTitle}
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-accent/15 text-accent">
              {t.settings.cloud.modeStandardBadge}
            </span>
          </div>
          <p className="text-[11px] font-mono text-text-muted mt-1.5 leading-relaxed">
            {t.settings.cloud.modeStandardDesc}
          </p>
        </button>
        <button
          type="button"
          onClick={() => setSetupMode('private')}
          aria-pressed={setupMode === 'private'}
          className={`text-left p-3 rounded-xl border transition-colors ${
            setupMode === 'private' ? 'border-accent bg-accent/[0.08]' : 'border-border hover:bg-surface-2'
          }`}
        >
          <div className="flex items-center gap-2">
            <ShieldCheck size={12} className={setupMode === 'private' ? 'text-accent' : 'text-text-muted'} />
            <span className="text-xs font-mono font-semibold text-text">
              {t.settings.cloud.modePrivateTitle}
            </span>
          </div>
          <p className="text-[11px] font-mono text-text-muted mt-1.5 leading-relaxed">
            {t.settings.cloud.modePrivateDesc}
          </p>
        </button>
      </div>

      {setupMode === 'standard' ? (
        <button
          onClick={handleSetupManaged}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono settings-btn bg-surface-2 hover:bg-surface-3 text-text border border-text/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy === 'setup' ? <Loader size={11} className="animate-spin" /> : <Cloud size={11} />}
          {t.settings.cloud.modeStandardEnable}
        </button>
      ) : (
        <>
          <p className="text-[11px] font-mono text-text-muted leading-relaxed">
            {t.settings.cloud.setupDesc}
          </p>
          <div>
            <label className="block text-[11px] font-mono text-text-muted mb-1 uppercase tracking-wider">
              {t.settings.cloud.passphrase}
            </label>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              disabled={isLoading}
              className="w-full px-3 py-1.5 rounded-lg text-xs font-mono bg-surface-0 border border-border text-text placeholder:text-text-muted/40 focus:outline-none focus:border-text/30 disabled:opacity-40"
            />
          </div>
          <div>
            <label className="block text-[11px] font-mono text-text-muted mb-1 uppercase tracking-wider">
              {t.settings.cloud.confirmPassphrase}
            </label>
            <input
              type="password"
              value={confirmPassphrase}
              onChange={(e) => setConfirmPassphrase(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSetup() }}
              disabled={isLoading}
              className="w-full px-3 py-1.5 rounded-lg text-xs font-mono bg-surface-0 border border-border text-text placeholder:text-text-muted/40 focus:outline-none focus:border-text/30 disabled:opacity-40"
            />
          </div>
          <button
            onClick={handleSetup}
            disabled={isLoading || !passphrase || !confirmPassphrase}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono settings-btn bg-surface-2 hover:bg-surface-3 text-text border border-text/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy === 'setup' ? <Loader size={11} className="animate-spin" /> : <KeyRound size={11} />}
            {t.settings.cloud.createPassphrase}
          </button>
        </>
      )}
    </div>
  )

  // ── Key states: no keys yet (onboarding, or the paywall without the
  //    entitlement — creating key material would only set up a cloud the user
  //    cannot enable; nothing is uploaded yet, so nothing to recover), locked +
  //    managed/unknown (silent auto-unlock — NEVER ask a managed user for a
  //    secret; retry polled in the effect above, unknown mode resolves to e2ee
  //    via the same probe) and locked + e2ee (passphrase or recovery code) ──
  const keysBlock =
    status.keysState === 'no-keys' ? (
      cloudEntitled ? onboarding : subscriptionGate
    ) : status.keysState === 'locked' && status.keysMode !== 'e2ee' ? (
      <div className="flex items-center gap-2 text-text-muted">
        <Loader size={12} className="animate-spin" />
        <span className="text-xs font-mono">{t.settings.cloud.unlocking}</span>
      </div>
    ) : status.keysState === 'locked' ? (
      <div className="space-y-3">
        <p className="text-[11px] font-mono text-text-muted leading-relaxed">
          {t.settings.cloud.lockedDesc}
        </p>
        <div>
          <label className="block text-[11px] font-mono text-text-muted mb-1 uppercase tracking-wider">
            {t.settings.cloud.passphraseOrRecovery}
          </label>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleUnlock() }}
            disabled={isLoading}
            className="w-full px-3 py-1.5 rounded-lg text-xs font-mono bg-surface-0 border border-border text-text placeholder:text-text-muted/40 focus:outline-none focus:border-text/30 disabled:opacity-40"
          />
        </div>
        <button
          onClick={handleUnlock}
          disabled={isLoading || !secret.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono settings-btn bg-surface-2 hover:bg-surface-3 text-text border border-text/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy === 'unlock' ? <Loader size={11} className="animate-spin" /> : <KeyRound size={11} />}
          {t.settings.cloud.unlock}
        </button>
      </div>
    ) : null

  // ── Standard → Private upgrade form (managed only) ──
  const upgradeForm = (
    <>
      <p className="text-[11px] font-mono text-text-muted leading-relaxed">
        {t.settings.cloud.upgradeDesc}
      </p>
      <div className="px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-[11px] font-mono text-yellow-400 leading-relaxed">
        {t.settings.cloud.upgradeNotice}
      </div>
      <div>
        <label className="block text-[11px] font-mono text-text-muted mb-1 uppercase tracking-wider">
          {t.settings.cloud.passphrase}
        </label>
        <input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          disabled={isLoading}
          className="w-full px-3 py-1.5 rounded-lg text-xs font-mono bg-surface-0 border border-border text-text placeholder:text-text-muted/40 focus:outline-none focus:border-text/30 disabled:opacity-40"
        />
      </div>
      <div>
        <label className="block text-[11px] font-mono text-text-muted mb-1 uppercase tracking-wider">
          {t.settings.cloud.confirmPassphrase}
        </label>
        <input
          type="password"
          value={confirmPassphrase}
          onChange={(e) => setConfirmPassphrase(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleUpgrade() }}
          disabled={isLoading}
          className="w-full px-3 py-1.5 rounded-lg text-xs font-mono bg-surface-0 border border-border text-text placeholder:text-text-muted/40 focus:outline-none focus:border-text/30 disabled:opacity-40"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleUpgrade}
          disabled={isLoading || !passphrase || !confirmPassphrase}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono settings-btn bg-surface-2 hover:bg-surface-3 text-text border border-text/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy === 'upgrade' ? <Loader size={11} className="animate-spin" /> : <ShieldCheck size={11} />}
          {t.settings.cloud.upgradeSubmit}
        </button>
        <button
          onClick={() => {
            setShowUpgrade(false)
            setPassphrase('')
            setConfirmPassphrase('')
            setError(null)
          }}
          disabled={isLoading}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono ${settingsButtonClass}`}
        >
          {t.common.cancel}
        </button>
      </div>
    </>
  )

  // ── Private → Standard downgrade confirmation (e2ee only) — explicit, never
  //    silent: standard mode weakens the privacy guarantee and invalidates the
  //    passphrase + recovery code ──
  const downgradeForm = (
    <>
      <p className="text-[11px] font-mono text-text-muted leading-relaxed">
        {t.settings.cloud.downgradeDesc}
      </p>
      <div className="px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-[11px] font-mono text-yellow-400 leading-relaxed">
        {t.settings.cloud.downgradeNotice}
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleDowngrade}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono settings-btn bg-surface-2 hover:bg-surface-3 text-text border border-text/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy === 'downgrade' ? <Loader size={11} className="animate-spin" /> : <Cloud size={11} />}
          {t.settings.cloud.downgradeSubmit}
        </button>
        <button
          onClick={() => { setShowDowngrade(false); setError(null) }}
          disabled={isLoading}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono ${settingsButtonClass}`}
        >
          {t.common.cancel}
        </button>
      </div>
    </>
  )

  const switchToPrivateButton = (
    <button
      onClick={() => { setShowUpgrade(true); setError(null) }}
      disabled={isLoading}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap ${settingsButtonClass}`}
    >
      <ShieldCheck size={11} />
      {t.settings.cloud.switchToPrivate}
    </button>
  )

  const switchToStandardButton = (
    <button
      onClick={() => { setShowDowngrade(true); setError(null) }}
      disabled={isLoading}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap ${settingsButtonClass}`}
    >
      <Cloud size={11} />
      {t.settings.cloud.switchToStandard}
    </button>
  )

  // ── Cloud enabled: the sync overview ──
  if (status.enabled) {
    const o = t.settings.sync.overview
    const unlocked = status.keysState === 'unlocked'
    // Lock only makes sense for e2ee (and for pre-dual-mode devices whose mode
    // is still unknown): a signed-in managed session re-unlocks itself
    // silently, so offering Lock there would be a no-op loop.
    const lockButton = unlocked && status.keysMode !== 'managed' && (
      <button onClick={handleLock} disabled={isLoading} className={settingsGhostButtonClass}>
        <Lock size={11} />
        {t.settings.cloud.lock}
      </button>
    )
    const encryptionRow = (unlocked || status.keysMode !== null) && (
      <SettingsRow
        icon={<ShieldCheck size={14} />}
        title={
          status.keysMode === 'e2ee' ? o.encryptionPrivateTitle
          : status.keysMode === 'managed' ? o.encryptionStandardTitle
          : o.encryptionUnknownTitle
        }
        description={
          status.keysMode === 'e2ee' ? o.encryptionPrivateDesc
          : status.keysMode === 'managed' ? o.encryptionStandardDesc
          : o.encryptionUnknownDesc
        }
        action={
          unlocked && (
            <>
              {lockButton}
              {status.keysMode === 'managed' && !showUpgrade && switchToPrivateButton}
              {status.keysMode === 'e2ee' && !showDowngrade && switchToStandardButton}
            </>
          )
        }
      >
        {unlocked && status.keysMode === 'managed' && showUpgrade ? upgradeForm
          : unlocked && status.keysMode === 'e2ee' && showDowngrade ? downgradeForm
          : null}
      </SettingsRow>
    )

    const notices = (errorBlock || pullResultBlock || keysBlock) && (
      <div className="space-y-3">
        {errorBlock}
        {pullResultBlock}
        {keysBlock}
      </div>
    )

    return (
      <SyncOverview
        provider="cloud"
        syncing={busy === 'pull'}
        canSync={unlocked && !isLoading}
        onSync={handlePull}
        githubConnected={githubConnected}
        notices={notices}
        dataTitle={o.securityTitle}
        dataRows={
          <>
            {encryptionRow}
            <SettingsRow
              icon={<History size={14} />}
              title={o.historyTitle}
              description={o.historyDesc}
              action={<StatusBadge tone="neutral">{o.included}</StatusBadge>}
            />
          </>
        }
        otherProviders={githubConnected ? <GitHubPausedRow onConnectedChange={onGithubConnectedChange} /> : undefined}
        footerText={githubConnected ? o.footerCloudGithub : o.footerCloud}
        footerAction={
          <button onClick={handleDisable} disabled={isLoading} className={settingsDangerButtonClass}>
            {busy === 'toggle' ? <Loader size={12} className="animate-spin" /> : <CloudOff size={12} />}
            {o.turnOffCloud}
          </button>
        }
      />
    )
  }

  // ── Cloud not enabled: the detail (keys, enable, mode switches) ──
  return (
    <div className="space-y-4">
      {errorBlock}

      {keysBlock}

      {/* ── Unlocked: enable + mode controls ── */}
      {status.keysState === 'unlocked' && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <CloudOff size={12} className="text-text-muted" />
            <span className="text-xs font-mono text-text-muted">{t.settings.cloud.syncDisabled}</span>
            {/* Active encryption-mode badge (null on pre-dual-mode devices until
                the next unlock backfills it — no badge is better than a wrong one) */}
            {status.keysMode !== null && (
              <span className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-md border border-border text-text-muted">
                {status.keysMode === 'e2ee' ? <ShieldCheck size={10} /> : <Cloud size={10} />}
                {status.keysMode === 'e2ee' ? t.settings.cloud.badgePrivate : t.settings.cloud.badgeStandard}
              </span>
            )}
          </div>

          {status.lastSync && (
            <p className="text-[11px] font-mono text-text-muted">
              {tf(t.settings.sync.lastSync, { time: new Date(status.lastSync).toLocaleString() })}
            </p>
          )}

          {pullResultBlock}

          {/* Mutual-exclusion heads-up shown BEFORE enabling Cloud over GitHub —
              only when enabling is actually within reach (entitlement present) */}
          {githubConnected && cloudEntitled && (
            <div className="px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-[11px] font-mono text-yellow-400 leading-relaxed">
              {t.settings.cloud.willPauseGitHub}
            </div>
          )}

          {/* Gate in front of Enable sync — it replaces the button (the other
              controls of this state stay open, see the constant above). */}
          {!cloudEntitled && (
            <div className="space-y-3">
              {!planUnknown && (
                <p className="text-[11px] font-mono text-text-muted leading-relaxed">
                  {t.settings.cloud.requiresSubscription}
                </p>
              )}
              {subscriptionGate}
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            {cloudEntitled && (
              <button
                onClick={handleEnable}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono settings-btn bg-surface-2 hover:bg-surface-3 text-text border border-text/20 transition-colors disabled:opacity-40"
              >
                {busy === 'toggle' ? <Loader size={11} className="animate-spin" /> : <Cloud size={11} />}
                {t.settings.cloud.enableSync}
              </button>
            )}
            {/* Lock: e2ee / unknown mode only (see the overview above). */}
            {status.keysMode !== 'managed' && (
              <button
                onClick={handleLock}
                disabled={isLoading}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono ${settingsButtonClass}`}
              >
                <Lock size={11} />
                {t.settings.cloud.lock}
              </button>
            )}
          </div>

          {status.keysMode === 'managed' && (
            <div className="space-y-3">{showUpgrade ? upgradeForm : switchToPrivateButton}</div>
          )}

          {status.keysMode === 'e2ee' && (
            <div className="space-y-3 pt-3 border-t border-border">{showDowngrade ? downgradeForm : switchToStandardButton}</div>
          )}
        </>
      )}
    </div>
  )
}
