import { useEffect, useId, useRef, useState } from 'react'
import { AlertCircle, KeyRound, Loader, Mail, MailCheck, Send } from 'lucide-react'
import type { AccountErrorCode, AccountOpResult } from '../../types'
import { tf } from '../../i18n/format'
import { useT } from '../../i18n/useT'
import { useLanguageStore } from '../../stores/languageStore'
import { PRIMARY_BUTTON } from './planOffersShared'
import { settingsButtonClass } from './ui'

// Public legal pages on the website; Spanish UI links to the /es mirrors.
const LEGAL_BASE = 'https://yagoid.github.io/noteflow'

// Seconds the "Resend code" button stays disabled after a code is emailed.
// Matches GoTrue's per-email OTP rate limit (~60 s): a shorter cooldown let the
// first resend fail with `rateLimited` ("Too many attempts").
const RESEND_COOLDOWN_S = 60

type Step = 'email' | 'code'

/**
 * Passwordless NoteFlow sign-in (email → one-time code), inline wherever it is
 * needed: Settings → Account and the plan box of the NoteFlow Cloud / NoteFlow AI
 * detail — the user never has to leave the surface to sign in. All session
 * handling lives in main; on success the AccountStatus broadcast moves every
 * panel on, so this component only has to reset itself.
 */
export function SignInInline({
  primary = false,
  onStart,
}: {
  /** Accent buttons (signing in is the main action of the surface). */
  primary?: boolean
  /** Fires when a code is requested — e.g. to clear a notice of the parent. */
  onStart?: () => void
}) {
  const t = useT()
  const lang = useLanguageStore((s) => s.lang)
  const legalUrl = (page: 'terms' | 'privacy') => `${LEGAL_BASE}${lang === 'es' ? '/es' : ''}/${page}`
  const codeInputId = useId()
  const codeErrorId = `${codeInputId}-error`

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  // `error` = the email step. `codeError` = inline under the code input; the two
  // never show at once, so a failed verification is reported exactly where the
  // user is looking.
  const [error, setError] = useState<string | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [codeNotice, setCodeNotice] = useState<string | null>(null)
  const [shakeCode, setShakeCode] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const codeInputRef = useRef<HTMLInputElement>(null)

  // Resend cooldown ticker — only alive while it is counting down.
  useEffect(() => {
    if (resendCooldown <= 0) return
    const id = setTimeout(() => setResendCooldown((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [resendCooldown])

  // The shake is one-shot: clear the flag so a second wrong code nudges again.
  // A timer rather than onAnimationEnd, because under `prefers-reduced-motion`
  // the `motion-safe:` variant keeps the animation — and its end event — from
  // ever running, which would leave the flag stuck on.
  useEffect(() => {
    if (!shakeCode) return
    const id = setTimeout(() => setShakeCode(false), 400)
    return () => clearTimeout(id)
  }, [shakeCode])

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
    onStart?.()
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
      // Status arrives via onAccountStatusChanged (the parent usually unmounts
      // this form then); reset it anyway in case it stays on screen.
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

  // Accent (primary) when signing in IS the call to action of the surface (the plan
  // box of PlanDetail); the regular secondary button otherwise.
  const mainButton = primary
    ? PRIMARY_BUTTON
    : `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono ${settingsButtonClass}`

  // ── Step 1 — email ──
  if (step === 'email') {
    return (
      <div className="space-y-2.5 normal-case">
        {error && (
          <p role="alert" className="flex items-start gap-1.5 text-[11px] font-mono text-red leading-relaxed">
            <AlertCircle size={12} className="shrink-0 mt-[1px]" />
            <span>{error}</span>
          </p>
        )}
        <div>
          <label className="block text-[11px] font-mono text-text-muted mb-1 uppercase tracking-wider">
            {t.settings.account.email}
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void sendCode('initial') }}
            placeholder="you@example.com"
            disabled={busy}
            className="w-full px-3 py-1.5 rounded text-xs font-mono bg-surface-0 border border-solid border-border text-text placeholder:text-text-muted/40 focus:outline-none focus:border-text/30 disabled:opacity-40"
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <button
            type="button"
            onClick={() => void sendCode('initial')}
            disabled={busy || !email.trim()}
            className={mainButton}
          >
            {busy ? <Loader size={11} className="animate-spin" /> : <Mail size={11} />}
            {t.settings.account.sendCode}
          </button>
          <span className="text-[11px] font-mono text-text-muted/70">{t.settings.account.signInCodeHint}</span>
        </div>
        {/* Legal acceptance line — links open in the default browser via the
            existing openUrl bridge (shell.openExternal in main). */}
        <p className="text-[10px] font-mono text-text-muted/60 leading-relaxed">
          {t.settings.account.legalPrefix}
          <button
            type="button"
            onClick={() => window.noteflow.openUrl(legalUrl('terms'))}
            className="underline underline-offset-2 hover:text-text transition-colors"
          >
            {t.settings.account.legalTerms}
          </button>
          {t.settings.account.legalMiddle}
          <button
            type="button"
            onClick={() => window.noteflow.openUrl(legalUrl('privacy'))}
            className="underline underline-offset-2 hover:text-text transition-colors"
          >
            {t.settings.account.legalPrivacy}
          </button>
          {t.settings.account.legalSuffix}
        </p>
      </div>
    )
  }

  // ── Step 2 — verification code ──
  return (
    <div className="space-y-2.5 normal-case">
      <p className="text-[11px] font-mono text-text-muted leading-relaxed">
        {t.settings.account.codeSentPrefix}
        <span className="text-text">{email.trim()}</span>
        {t.settings.account.codeSentSuffix}
      </p>
      <div>
        <label htmlFor={codeInputId} className="block text-[11px] font-mono text-text-muted mb-1 uppercase tracking-wider">
          {t.settings.account.code}
        </label>
        <input
          id={codeInputId}
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
          onKeyDown={(e) => { if (e.key === 'Enter') void handleVerify() }}
          placeholder="12345678"
          disabled={busy}
          aria-invalid={!!codeError}
          aria-describedby={codeError ? codeErrorId : undefined}
          className={`w-full px-3 py-1.5 rounded text-xs font-mono tracking-widest bg-surface-0 border border-solid text-text placeholder:text-text-muted/40 focus:outline-none disabled:opacity-40 transition-colors ${
            codeError ? 'border-red/50 focus:border-red/70' : 'border-border focus:border-text/30'
          } ${shakeCode ? 'motion-safe:animate-shake' : ''}`}
        />
        {codeError && (
          <p id={codeErrorId} role="alert" className="flex items-start gap-1.5 mt-1.5 text-[11px] font-mono text-red leading-relaxed">
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
          type="button"
          onClick={() => void handleVerify()}
          disabled={busy || !code.trim()}
          className={mainButton}
        >
          {busy ? <Loader size={11} className="animate-spin" /> : <KeyRound size={11} />}
          {t.settings.account.verifyAndSignIn}
        </button>
        {/* Didn't arrive / expired: a new code without going back to the email
            step. Cooldown = the server's rate limit (RESEND_COOLDOWN_S). */}
        <button
          type="button"
          onClick={() => void sendCode('resend')}
          disabled={busy || resendCooldown > 0}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono ${settingsButtonClass}`}
        >
          <Send size={11} />
          {resendCooldown > 0
            ? tf(t.settings.account.resendCodeIn, { seconds: resendCooldown })
            : t.settings.account.resendCode}
        </button>
        <button
          type="button"
          onClick={handleUseDifferentEmail}
          disabled={busy}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono ${settingsButtonClass}`}
        >
          {t.settings.account.useDifferentEmail}
        </button>
      </div>
    </div>
  )
}
