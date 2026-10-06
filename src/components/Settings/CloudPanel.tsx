import { useEffect, useState } from 'react'
import { Check, Cloud, CloudOff, Copy, KeyRound, Loader, Lock, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { AccountStatus, CloudSyncStatus } from '../../types'
import type { SubscriptionProduct } from '../../lib/subscriptionPlans'
import { useNotesStore } from '../../stores/notesStore'
import { plural, tf } from '../../i18n/format'
import { useT } from '../../i18n/useT'
import type { SettingsSection } from './SettingsModal'
import { PlanOffers } from './PlanOffers'
import { settingsButtonClass } from './ui'

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
export function CloudPanel({ onNavigate }: { onNavigate?: (section: SettingsSection) => void }) {
  const t = useT()
  const loadNotes = useNotesStore((s) => s.loadNotes)

  const [status, setStatus] = useState<CloudSyncStatus | null>(null)
  const [account, setAccount] = useState<AccountStatus | null>(null)
  const [githubConnected, setGithubConnected] = useState(false)
  const [busy, setBusy] = useState<Busy>('idle')
  const [error, setError] = useState<string | null>(null)
  const [pullResult, setPullResult] = useState<{ pulled: number; errors: string[] } | null>(null)

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
    return window.noteflow.onCloudStatusChanged(setStatus)
  }, [])

  useEffect(() => {
    window.noteflow.getAccountStatus().then(setAccount)
    return window.noteflow.onAccountStatusChanged(setAccount)
  }, [])

  // GitHub Sync state, only to warn about the mutual exclusion before enabling.
  useEffect(() => {
    window.noteflow.getSyncStatus().then((s) => setGithubConnected(s.connected))
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

  async function handleSubscribe(product: SubscriptionProduct) {
    setError(null)
    const result = await window.noteflow.accountOpenCheckout(product)
    if (!result.ok) setError(result.error ?? t.settings.account.couldNotOpenCheckout)
  }

  function handleCopyRecovery() {
    if (!recoveryCode) return
    navigator.clipboard.writeText(recoveryCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // No title here: the backend selector card in SyncPanel already names the
  // panel (t.settings.cloud.title), so this is just the one-paragraph intro.
  const header = (
    <p className="text-[11px] font-mono text-text-muted max-w-md leading-relaxed">
      {t.settings.cloud.desc}
    </p>
  )

  // ── Initial status fetch ──
  if (!status || !account) {
    return (
      <div className="space-y-4">
        {header}
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
        {header}
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
        {header}
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
          <p className="text-[11px] font-mono text-red-400 leading-relaxed">
            {t.settings.cloud.recoveryWarning}
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleCopyRecovery}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-surface-2 hover:bg-surface-3 text-text border border-text/20 transition-colors"
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

  // ── Signed out ──
  if (!status.signedIn) {
    return (
      <div className="space-y-4">
        {header}
        <div className="space-y-2">
          <p className="text-[11px] font-mono text-text-muted leading-relaxed">
            {t.settings.cloud.signInFirst}
            <span className="ml-1.5 align-middle inline-block text-[10px] font-mono px-1.5 py-0.5 rounded-md border border-border text-text-muted">
              {t.settings.cloud.paidLabel}
            </span>
          </p>
          {/* What Cloud costs, before asking for a sign-in (the Bundle joins in
              while the AI plan is missing too). Carries its own way into Account;
              the sign-in hint is off because signInFirst above already says it. */}
          <PlanOffers
            products={['cloud', 'bundle']}
            account={account}
            showSignInHint={false}
            onGoToAccount={onNavigate ? () => onNavigate('account') : undefined}
          />
        </div>
      </div>
    )
  }

  const isLoading = busy !== 'idle'

  // Entitlement gate — shared by the two places where the panel stops short of
  // Cloud: the onboarding (no keys yet: creating keys for a cloud you cannot use
  // is pointless) and the enable button (unlocked but not enabled). Same copy and
  // same offers in both so the paywall reads identically wherever it shows up.
  // Unlock, Sync now, Disable and Lock stay ungated: whoever already has keys and
  // data up there must keep being able to read and take it out after lapsing.
  // Cloud, plus the Bundle while the AI plan is missing too. Display prices —
  // the authoritative figure is the checkout's.
  const subscriptionGate = (
    <div className="space-y-2">
      <p className="text-[11px] font-mono text-text-muted leading-relaxed">
        {t.settings.cloud.requiresSubscription}
      </p>
      <PlanOffers
        products={['cloud', 'bundle']}
        account={account}
        busy={isLoading}
        onSubscribe={handleSubscribe}
      />
    </div>
  )

  return (
    <div className="space-y-4">
      {header}

      {/* Error (local or engine syncError — e.g. an expired subscription) */}
      {(error || status.error) && (
        <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-xs font-mono text-red-400">
          {error ?? status.error}
        </div>
      )}

      {/* ── No keys yet + no entitlement: the paywall replaces the onboarding.
             Creating key material here would only set up a cloud the user
             cannot enable; nothing is uploaded yet, so nothing to recover ── */}
      {status.keysState === 'no-keys' && !account.entitlements.cloud && subscriptionGate}

      {/* ── Onboarding (no keys yet): choose the encryption mode — two cards,
             Standard (managed) preselected and recommended ── */}
      {status.keysState === 'no-keys' && account.entitlements.cloud && (
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-surface-2 hover:bg-surface-3 text-text border border-text/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-surface-2 hover:bg-surface-3 text-text border border-text/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy === 'setup' ? <Loader size={11} className="animate-spin" /> : <KeyRound size={11} />}
                {t.settings.cloud.createPassphrase}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Locked + managed (or unknown) mode: silent auto-unlock in progress —
             NEVER ask a managed user for a secret (retry polled in the effect
             above; unknown mode resolves to e2ee via the same probe) ── */}
      {status.keysState === 'locked' && status.keysMode !== 'e2ee' && (
        <div className="flex items-center gap-2 text-text-muted">
          <Loader size={12} className="animate-spin" />
          <span className="text-xs font-mono">{t.settings.cloud.unlocking}</span>
        </div>
      )}

      {/* ── Locked + e2ee: unlock with passphrase or recovery code ── */}
      {status.keysState === 'locked' && status.keysMode === 'e2ee' && (
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-surface-2 hover:bg-surface-3 text-text border border-text/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy === 'unlock' ? <Loader size={11} className="animate-spin" /> : <KeyRound size={11} />}
            {t.settings.cloud.unlock}
          </button>
        </div>
      )}

      {/* ── Unlocked: sync controls ── */}
      {status.keysState === 'unlocked' && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            {status.enabled ? (
              <>
                <Cloud size={12} className="text-green-400" />
                <span className="text-xs font-mono text-green-400">{t.settings.cloud.syncEnabled}</span>
              </>
            ) : (
              <>
                <CloudOff size={12} className="text-text-muted" />
                <span className="text-xs font-mono text-text-muted">{t.settings.cloud.syncDisabled}</span>
              </>
            )}
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

          {/* Mutual-exclusion heads-up shown BEFORE enabling Cloud over GitHub —
              only when enabling is actually within reach (entitlement present) */}
          {!status.enabled && githubConnected && account.entitlements.cloud && (
            <div className="px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-[11px] font-mono text-yellow-400 leading-relaxed">
              {t.settings.cloud.willPauseGitHub}
            </div>
          )}

          {/* Gate in front of Enable sync — it replaces the button (the other
              controls of this state stay open, see the constant above). */}
          {!status.enabled && !account.entitlements.cloud && subscriptionGate}

          <div className="flex gap-2 flex-wrap">
            {status.enabled ? (
              <>
                <button
                  onClick={handlePull}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-surface-2 hover:bg-surface-3 text-text transition-colors disabled:opacity-40"
                >
                  {busy === 'pull' ? <Loader size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                  {t.settings.sync.syncNow}
                </button>
                <button
                  onClick={handleDisable}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                >
                  <CloudOff size={11} />
                  {t.settings.cloud.disableSync}
                </button>
              </>
            ) : (
              account.entitlements.cloud && (
                <button
                  onClick={handleEnable}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-surface-2 hover:bg-surface-3 text-text border border-text/20 transition-colors disabled:opacity-40"
                >
                  {busy === 'toggle' ? <Loader size={11} className="animate-spin" /> : <Cloud size={11} />}
                  {t.settings.cloud.enableSync}
                </button>
              )
            )}
            {/* Lock only makes sense for e2ee (and for pre-dual-mode devices whose
                mode is still unknown): a signed-in managed session re-unlocks
                itself silently, so offering Lock there would be a no-op loop. */}
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

          {/* ── Standard → Private upgrade (managed only) ── */}
          {status.keysMode === 'managed' && (
            <div className="space-y-3 pt-3 border-t border-border">
              {!showUpgrade ? (
                <button
                  onClick={() => { setShowUpgrade(true); setError(null) }}
                  disabled={isLoading}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono ${settingsButtonClass}`}
                >
                  <ShieldCheck size={11} />
                  {t.settings.cloud.switchToPrivate}
                </button>
              ) : (
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
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-surface-2 hover:bg-surface-3 text-text border border-text/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
              )}
            </div>
          )}

          {/* ── Private → Standard downgrade (e2ee only) — explicit confirmation,
                 never silent: standard mode weakens the privacy guarantee and
                 invalidates the passphrase + recovery code ── */}
          {status.keysMode === 'e2ee' && (
            <div className="space-y-3 pt-3 border-t border-border">
              {!showDowngrade ? (
                <button
                  onClick={() => { setShowDowngrade(true); setError(null) }}
                  disabled={isLoading}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono ${settingsButtonClass}`}
                >
                  <Cloud size={11} />
                  {t.settings.cloud.switchToStandard}
                </button>
              ) : (
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
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-surface-2 hover:bg-surface-3 text-text border border-text/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
