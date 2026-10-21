import { useEffect, useRef, useState } from 'react'
import { AlertCircle, KeyRound, Loader, Lock, LogOut, Mail, MailCheck, RefreshCw, Send, UserCircle } from 'lucide-react'
import type { AccountErrorCode, AccountOpResult, AccountStatus } from '../../types'
import type { SubscriptionProduct } from '../../lib/subscriptionPlans'
import { tf } from '../../i18n/format'
import { useT } from '../../i18n/useT'
import { useLanguageStore } from '../../stores/languageStore'
import { PlanOffers } from './PlanOffers'
import { settingsButtonClass } from './ui'

// Public legal pages on the website; Spanish UI links to the /es mirrors.
const LEGAL_BASE = 'https://yagoid.github.io/noteflow'

type Step = 'email' | 'code'

// Seconds the "Resend code" button stays disabled after a code is emailed —
// enough to stop accidental double-sends without getting in the way (GoTrue
// rate-limits on its side too, which would surface as `rateLimited`).
const RESEND_COOLDOWN_S = 30

// Settings → Account: NoteFlow account (Supabase email + OTP) and plan badges.
// All session/token handling lives in the main process — this panel only ever
// sees the public AccountStatus.
export function AccountPanel() {
  const t = useT()
  const lang = useLanguageStore((s) => s.lang)
  const legalUrl = (page: 'terms' | 'privacy') =>
    `${LEGAL_BASE}${lang === 'es' ? '/es' : ''}/${page}`
  const [status, setStatus] = useState<AccountStatus | null>(null)
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  // `error` = the box at the top (email step, refresh, checkout, sign out).
  // `codeError` = inline under the code input; the two never show at once, so a
  // failed verification is reported exactly where the user is looking.
  const [error, setError] = useState<string | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [codeNotice, setCodeNotice] = useState<string | null>(null)
  const [shakeCode, setShakeCode] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const codeInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    window.noteflow.getAccountStatus().then(setStatus)
    return window.noteflow.onAccountStatusChanged(setStatus)
  }, [])

  // Resend cooldown ticker — only alive while it is counting down.
  useEffect(() => {
    if (resendCooldown <= 0) return
    const id = setTimeout(() => setResendCooldown((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [resendCooldown])

  /** Localized reason for a failed account op, falling back to main's English string. */
  function describeError(result: AccountOpResult, fallback: string): string {
    const messages: Record<AccountErrorCode, string> = t.settings.account.errors
    if (result.errorCode && messages[result.errorCode]) return messages[result.errorCode]
    return result.error ?? fallback
  }

  // Deferred to the next frame: the input is `disabled` while busy, and React
  // hasn't re-enabled it yet when this runs right after `setBusy(false)`.
  function focusCodeInput(select: boolean) {
    requestAnimationFrame(() => {
      codeInputRef.current?.focus()
      if (select) codeInputRef.current?.select()
    })
  }

  // The shake is one-shot: clear the flag so a second wrong code nudges again.
  // A timer rather than onAnimationEnd, because under `prefers-reduced-motion`
  // the `motion-safe:` variant keeps the animation — and its end event — from
  // ever running, which would leave the flag stuck on.
  useEffect(() => {
    if (!shakeCode) return
    const id = setTimeout(() => setShakeCode(false), 400)
    return () => clearTimeout(id)
  }, [shakeCode])

  /** Marks the code input as rejected: red border, a nudge, and ready to retype. */
  function rejectCode(message: string) {
    setCodeError(message)
    setCodeNotice(null)
    setShakeCode(true)
    // Select what's there so the next keystroke replaces the wrong code.
    focusCodeInput(true)
  }

  // Emails a code. From the email step this advances to the code step; from the
  // code step ("Resend code") it stays put and reports inline.
  async function sendCode(mode: 'initial' | 'resend') {
    const trimmed = email.trim()
    if (!trimmed) return
    setBusy(true)
    setError(null)
    setCodeError(null)
    setCodeNotice(null)
    const result = await window.noteflow.accountRequestOtp(trimmed)
    setBusy(false)
    if (result.ok) {
      setStep('code')
      setCode('')
      setResendCooldown(RESEND_COOLDOWN_S)
      if (mode === 'resend') {
        setCodeNotice(t.settings.account.codeResent)
        focusCodeInput(false)
      }
      return
    }
    const message = describeError(result, t.settings.account.couldNotSendCode)
    if (mode === 'resend') rejectCode(message)
    else setError(message)
  }

  function handleSendCode() {
    return sendCode('initial')
  }

  async function handleVerify() {
    const trimmed = code.trim()
    if (!trimmed) return
    setBusy(true)
    setError(null)
    setCodeError(null)
    setCodeNotice(null)
    const result = await window.noteflow.accountVerifyOtp(email.trim(), trimmed)
    setBusy(false)
    if (result.ok) {
      // Status arrives via onAccountStatusChanged; reset the form for next time.
      setStep('email')
      setCode('')
      setEmail('')
      setResendCooldown(0)
    } else {
      rejectCode(describeError(result, t.settings.account.couldNotVerify))
    }
  }

  function handleUseDifferentEmail() {
    setStep('email')
    setCode('')
    setError(null)
    setCodeError(null)
    setCodeNotice(null)
    setResendCooldown(0)
  }

  async function handleRefresh() {
    setBusy(true)
    setError(null)
    const result = await window.noteflow.accountRefreshEntitlements()
    setBusy(false)
    // A locked keychain is already explained by its own notice above the badges.
    if (!result.ok && result.errorCode !== 'sessionLocked') {
      setError(describeError(result, t.settings.account.couldNotRefresh))
    }
  }

  async function handleSubscribe(product: SubscriptionProduct) {
    setError(null)
    const result = await window.noteflow.accountOpenCheckout(product)
    if (!result.ok) setError(describeError(result, t.settings.account.couldNotOpenCheckout))
  }

  async function handleSignOut() {
    setBusy(true)
    setError(null)
    await window.noteflow.accountSignOut()
    setBusy(false)
    setStep('email')
    setEmail('')
    setCode('')
    setCodeError(null)
    setCodeNotice(null)
    setResendCooldown(0)
  }

  // ── Initial status fetch ──
  if (!status) {
    return (
      <div className="flex items-center gap-2 text-text-muted">
        <Loader size={12} className="animate-spin" />
        <span className="text-xs font-mono">{t.common.loading}</span>
      </div>
    )
  }

  // ── Not configured (no Supabase project in this build) ──
  if (!status.configured) {
    return (
      <p className="text-[11px] font-mono text-text-muted leading-relaxed">
        {t.settings.account.notAvailable}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {/* Error box — everything except the code step, which reports inline
          under its own input (see below) so the two never say the same thing. */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 px-3 py-2 bg-red/10 border border-red/30 rounded text-xs font-mono text-red leading-relaxed"
        >
          <AlertCircle size={13} className="shrink-0 mt-[1px]" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Signed in ── */}
      {status.signedIn && (
        <>
          <div className="flex items-center gap-2">
            <UserCircle size={13} className="text-green-400" />
            <span className="text-xs font-mono text-text">{status.email}</span>
          </div>

          {/* Keychain locked: the session is still there (NOT signed out) but its
              token can't be decrypted right now. Main retries on its own; Retry
              forces it, Sign out (below) is the way out if it never unlocks. */}
          {status.sessionLocked && (
            <div
              role="status"
              className="flex items-start gap-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-xs font-mono text-yellow-400 leading-relaxed"
            >
              <Lock size={13} className="shrink-0 mt-[1px]" />
              <span>{t.settings.account.sessionLocked}</span>
            </div>
          )}

          {/* Unknown (never fetched) is its own state — not "inactive". */}
          <div className="space-y-2">
            <PlanBadge
              name="NoteFlow AI"
              state={!status.entitlementsKnown ? 'unknown' : status.entitlements.ai ? 'active' : 'inactive'}
            />
            <PlanBadge
              name="NoteFlow Cloud"
              state={!status.entitlementsKnown ? 'unknown' : status.entitlements.cloud ? 'active' : 'inactive'}
            />
          </div>

          {status.entitlementsFetchedAt && (
            <p className="text-[11px] font-mono text-text-muted/60">
              {tf(t.settings.account.lastChecked, { time: new Date(status.entitlementsFetchedAt).toLocaleString() })}
            </p>
          )}

          {/* Subscription plans — each plan shows only while its entitlement is
              KNOWN to be missing (Bundle needs both missing, to avoid double
              billing). A plan without a checkout URL in this build shows "Coming
              soon". While the plan is unknown the badges above already say so and
              Refresh below retries, so no extra notice here. */}
          <PlanOffers
            products={['bundle', 'ai', 'cloud']}
            account={status}
            busy={busy}
            showUnknownNotice={false}
            onSubscribe={handleSubscribe}
          />

          <div className="flex gap-2">
            <button
              onClick={handleRefresh}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono bg-surface-2 hover:bg-surface-3 text-text transition-colors disabled:opacity-40"
            >
              {busy ? <Loader size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              {t.settings.account.refresh}
            </button>
            <button
              onClick={handleSignOut}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono text-text-muted hover:text-red hover:bg-red/10 transition-colors disabled:opacity-40"
            >
              <LogOut size={11} />
              {t.settings.account.signOut}
            </button>
          </div>
        </>
      )}

      {/* ── Signed out: step 1 — email ── */}
      {!status.signedIn && step === 'email' && (
        <div className="space-y-3 pt-1">
          <p className="text-[11px] font-mono text-text-muted leading-relaxed">
            {t.settings.account.signInDesc}
          </p>
          <div>
            <label className="block text-[11px] font-mono text-text-muted mb-1 uppercase tracking-wider">
              {t.settings.account.email}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSendCode() }}
              placeholder="you@example.com"
              disabled={busy}
              className="w-full px-3 py-1.5 rounded text-xs font-mono bg-surface-0 border border-border text-text placeholder:text-text-muted/40 focus:outline-none focus:border-text/30 disabled:opacity-40"
            />
          </div>
          <button
            onClick={handleSendCode}
            disabled={busy || !email.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono bg-surface-2 hover:bg-surface-3 text-text border border-text/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? <Loader size={11} className="animate-spin" /> : <Mail size={11} />}
            {t.settings.account.sendCode}
          </button>
          {/* Legal acceptance line — links open in the default browser via the
              existing openUrl bridge (shell.openExternal in main). */}
          <p className="text-[10px] font-mono text-text-muted/60 leading-relaxed">
            {t.settings.account.legalPrefix}
            <button
              onClick={() => window.noteflow.openUrl(legalUrl('terms'))}
              className="underline underline-offset-2 hover:text-text transition-colors"
            >
              {t.settings.account.legalTerms}
            </button>
            {t.settings.account.legalMiddle}
            <button
              onClick={() => window.noteflow.openUrl(legalUrl('privacy'))}
              className="underline underline-offset-2 hover:text-text transition-colors"
            >
              {t.settings.account.legalPrivacy}
            </button>
            {t.settings.account.legalSuffix}
          </p>
        </div>
      )}

      {/* ── Signed out: step 2 — verification code ── */}
      {!status.signedIn && step === 'code' && (
        <div className="space-y-3 pt-1">
          <p className="text-[11px] font-mono text-text-muted leading-relaxed">
            {t.settings.account.codeSentPrefix}
            <span className="text-text">{email.trim()}</span>
            {t.settings.account.codeSentSuffix}
          </p>
          <div>
            <label
              htmlFor="account-code"
              className="block text-[11px] font-mono text-text-muted mb-1 uppercase tracking-wider"
            >
              {t.settings.account.code}
            </label>
            <input
              id="account-code"
              ref={codeInputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value)
                // Typing means "let me try again" — clear the rejection.
                if (codeError) setCodeError(null)
                if (codeNotice) setCodeNotice(null)
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleVerify() }}
              placeholder="123456"
              disabled={busy}
              aria-invalid={!!codeError}
              aria-describedby={codeError ? 'account-code-error' : undefined}
              className={`w-full px-3 py-1.5 rounded text-xs font-mono tracking-widest bg-surface-0 border text-text placeholder:text-text-muted/40 focus:outline-none disabled:opacity-40 transition-colors ${
                codeError ? 'border-red/50 focus:border-red/70' : 'border-border focus:border-text/30'
              } ${shakeCode ? 'motion-safe:animate-shake' : ''}`}
            />
            {codeError && (
              <p
                id="account-code-error"
                role="alert"
                className="flex items-start gap-1.5 mt-1.5 text-[11px] font-mono text-red leading-relaxed"
              >
                <AlertCircle size={12} className="shrink-0 mt-[1px]" />
                <span>{codeError}</span>
              </p>
            )}
            {!codeError && codeNotice && (
              <p className="flex items-center gap-1.5 mt-1.5 text-[11px] font-mono text-text-muted">
                <MailCheck size={12} className="shrink-0" />
                {codeNotice}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleVerify}
              disabled={busy || !code.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono bg-surface-2 hover:bg-surface-3 text-text border border-text/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? <Loader size={11} className="animate-spin" /> : <KeyRound size={11} />}
              {t.settings.account.verifyAndSignIn}
            </button>
            {/* Didn't arrive / expired: a new code without going back to the
                email step. Short cooldown so it can't be spammed. */}
            <button
              onClick={() => sendCode('resend')}
              disabled={busy || resendCooldown > 0}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono ${settingsButtonClass}`}
            >
              <Send size={11} />
              {resendCooldown > 0
                ? tf(t.settings.account.resendCodeIn, { seconds: resendCooldown })
                : t.settings.account.resendCode}
            </button>
            <button
              onClick={handleUseDifferentEmail}
              disabled={busy}
              className={`px-3 py-1.5 rounded text-xs font-mono ${settingsButtonClass}`}
            >
              {t.settings.account.useDifferentEmail}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function PlanBadge({ name, state }: { name: string; state: 'active' | 'inactive' | 'unknown' }) {
  const t = useT()
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded bg-surface-0 border border-border">
      <span className="text-xs font-mono text-text">{name}</span>
      {state === 'active' ? (
        <span className="text-[11px] font-mono text-green-400 bg-green-500/10 border border-green-500/30 rounded px-2 py-0.5">
          {t.settings.account.active}
        </span>
      ) : state === 'unknown' ? (
        <span className="text-[11px] font-mono text-text-muted/70 border border-border rounded px-2 py-0.5">
          {t.settings.account.planUnknownBadge}
        </span>
      ) : (
        <span className="text-[11px] font-mono text-text-muted/60">—</span>
      )}
    </div>
  )
}
