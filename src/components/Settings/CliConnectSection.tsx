import { useEffect, useRef, useState } from 'react'
import { AlertCircle, KeyRound, Loader, MailCheck, Terminal, Unlink } from 'lucide-react'
import type { CliConnectError, CliConnectResult, CliConnectStatus } from '../../types'
import { tf } from '../../i18n/format'
import { useT } from '../../i18n/useT'
import { ConfirmModal } from '../ConfirmModal'
import { settingsButtonClass } from './ui'

type Step = 'idle' | 'sending' | 'code' | 'verifying' | 'resending' | 'connecting' | 'disconnecting'

// Settings → Sync, below the backend panel: "Connect the CLI too". Gives the
// bundled `noteflow` CLI its OWN access to the backend the app syncs with
// (electron/cliConnect.ts). Rendered by SyncPanel only while that backend is
// connected in the app; `key`ed by backend, so switching resets it.
//  - Cloud: the CLI signs in with a code emailed to the app account's address
//    (its own session — never the app's).
//  - GitHub: after a confirmation, the CLI gets a copy of the app's token.
// Its state is read from the CLI's settings, so a CLI connected from the
// terminal shows up as connected too.
export function CliConnectSection({ backend }: { backend: 'cloud' | 'github' }) {
  const t = useT()
  const tc = t.settings.sync.cli
  const [status, setStatus] = useState<CliConnectStatus | null>(null)
  // The app's email (Cloud) / owner/repo (GitHub) — the description's target.
  const [appTarget, setAppTarget] = useState<string | null>(null)
  // Cloud: the app account's keys mode — e2ee means the CLI needs the passphrase to sync.
  const [keysMode, setKeysMode] = useState<'managed' | 'e2ee' | null>(null)
  const [step, setStep] = useState<Step>('idle')
  const [code, setCode] = useState('')
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmGithub, setConfirmGithub] = useState(false)
  const codeInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    window.noteflow.cliConnectGetStatus().then((s) => { if (alive) setStatus(s) })
    if (backend === 'cloud') {
      window.noteflow.getAccountStatus().then((a) => { if (alive) setAppTarget(a.email ?? null) })
      window.noteflow.getCloudStatus().then((c) => { if (alive) setKeysMode(c.keysMode) })
    } else {
      window.noteflow.getSyncStatus().then((s) => {
        if (alive) setAppTarget(s.owner && s.repo ? `${s.owner}/${s.repo}` : null)
      })
    }
    return () => { alive = false }
  }, [backend])

  useEffect(() => {
    if (step === 'code') codeInputRef.current?.focus()
  }, [step])

  function errorText(code: CliConnectError): string {
    // On Windows the CLI's settings are the installed app's: the fix is in that
    // app, never `noteflow login` (it would replace the app's encrypted token).
    const shared = window.noteflow.platform === 'win32'
    if (code === 'noRepo') return shared ? tc.errors.noRepoShared : tc.errors.mismatch
    if (code === 'mismatch') return shared ? tc.errors.mismatchShared : tc.errors.mismatch
    return tc.errors[code]
  }

  // Applies a CLI operation's result. Returns whether it succeeded.
  function apply(result: CliConnectResult): boolean {
    if (result.ok) {
      setStatus(result.status)
      setError(null)
      return true
    }
    // The CLI's own line only adds something to the generic failures.
    const detail = result.error === 'failed' || result.error === 'network' ? result.detail : undefined
    setError({ message: errorText(result.error), detail })
    return false
  }

  async function handleSendCode(resend: boolean) {
    setStep(resend ? 'resending' : 'sending')
    setError(null)
    setNotice(null)
    const ok = apply(await window.noteflow.cliConnectCloudSendCode())
    if (ok) {
      setCode('')
      setStep('code')
      if (resend) setNotice(tc.codeResent)
    } else {
      setStep(resend ? 'code' : 'idle')
    }
  }

  async function handleVerify() {
    if (!code.trim() || step === 'verifying') return
    setStep('verifying')
    setNotice(null)
    const ok = apply(await window.noteflow.cliConnectCloudVerify(code.trim()))
    setStep(ok ? 'idle' : 'code')
    if (ok) setCode('')
  }

  async function handleGithubConnect() {
    setStep('connecting')
    setError(null)
    apply(await window.noteflow.cliConnectGithubConnect())
    setStep('idle')
  }

  async function handleDisconnect() {
    setStep('disconnecting')
    setError(null)
    setNotice(null)
    apply(await (backend === 'cloud'
      ? window.noteflow.cliConnectCloudDisconnect()
      : window.noteflow.cliConnectGithubDisconnect()))
    setStep('idle')
  }

  if (!status) return null

  const cli = backend === 'cloud' ? status.cloud : status.github
  const connectedTarget = backend === 'cloud'
    ? status.cloud.email
    : status.github.owner && status.github.repo ? `${status.github.owner}/${status.github.repo}` : undefined
  const canDisconnect = backend === 'cloud' || status.github.canDisconnect
  const busy = step !== 'idle' && step !== 'code'
  const codeStep = step === 'code' || step === 'verifying' || step === 'resending'
  const target = appTarget ?? ''
  // The app only knows ITS account's keys mode: warn when the CLI is on that
  // same account (or before it connects, as it will sign in with that email).
  const sameAccount = !status.cloud.email || !appTarget
    || status.cloud.email.toLowerCase() === appTarget.toLowerCase()
  const showE2eeNotice = backend === 'cloud' && keysMode === 'e2ee' && sameAccount

  return (
    <section className="pt-4 border-t border-border">
      <h3 className="mb-3 text-sm font-mono font-semibold text-text">{tc.title}</h3>
      <div className="space-y-3">
        <p className="text-[11px] font-mono text-text-muted leading-relaxed">
          {tf(backend === 'cloud' ? tc.descCloud : tc.descGithub, backend === 'cloud' ? { email: target } : { repo: target })}
        </p>

        {showE2eeNotice && (
          <div className="flex items-start gap-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-[11px] font-mono text-yellow-400 leading-relaxed">
            <KeyRound size={12} className="flex-shrink-0 mt-0.5" />
            <span>{tc.e2eeNotice}</span>
          </div>
        )}

        {!status.available && !cli.connected && (
          <p className="text-[11px] font-mono text-text-muted">{tc.errors.cliMissing}</p>
        )}

        {/* ── Connected (from here or from the terminal) ── */}
        {cli.connected && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Terminal size={12} className="text-green-400" />
              <span className="text-xs font-mono text-green-400">
                {tf(tc.connectedTo, { target: connectedTarget ?? '' })}
              </span>
            </div>
            {canDisconnect ? (
              <button
                onClick={handleDisconnect}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
              >
                {step === 'disconnecting' ? <Loader size={11} className="animate-spin" /> : <Unlink size={11} />}
                {tc.disconnect}
              </button>
            ) : (
              <p className="text-[11px] font-mono text-text-muted leading-relaxed">{tc.sharedWithApp}</p>
            )}
          </div>
        )}

        {/* ── Not connected: the button ── */}
        {!cli.connected && status.available && !codeStep && (
          <button
            onClick={() => (backend === 'cloud' ? handleSendCode(false) : setConfirmGithub(true))}
            disabled={busy || !appTarget}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono ${settingsButtonClass}`}
          >
            {step === 'sending' || step === 'connecting'
              ? <Loader size={11} className="animate-spin" />
              : <Terminal size={11} />}
            {tc.connect}
          </button>
        )}

        {/* ── Cloud, step 2: the emailed code ── */}
        {!cli.connected && codeStep && (
          <div className="space-y-3">
            <p className="text-[11px] font-mono text-text-muted leading-relaxed">
              {tf(tc.codeSent, { email: target })}
            </p>
            <div>
              <label
                htmlFor="cli-connect-code"
                className="block text-[11px] font-mono text-text-muted mb-1 uppercase tracking-wider"
              >
                {tc.code}
              </label>
              <input
                id="cli-connect-code"
                ref={codeInputRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value)
                  if (error) setError(null)
                  if (notice) setNotice(null)
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleVerify() }}
                placeholder="12345678"
                disabled={busy}
                aria-invalid={!!error}
                className={`w-full px-3 py-1.5 rounded-lg text-xs font-mono tracking-widest bg-surface-0 border text-text placeholder:text-text-muted/40 focus:outline-none disabled:opacity-40 transition-colors ${
                  error ? 'border-red-500/50 focus:border-red-500/70' : 'border-border focus:border-text/30'
                }`}
              />
              {!error && notice && (
                <p className="flex items-center gap-1.5 mt-1.5 text-[11px] font-mono text-text-muted">
                  <MailCheck size={12} className="shrink-0" />
                  {notice}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void handleVerify()}
                disabled={busy || !code.trim()}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono ${settingsButtonClass}`}
              >
                {step === 'verifying' ? <Loader size={11} className="animate-spin" /> : <KeyRound size={11} />}
                {tc.verify}
              </button>
              <button
                onClick={() => void handleSendCode(true)}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg text-xs font-mono text-text-muted hover:text-text transition-colors disabled:opacity-40"
              >
                {tc.resend}
              </button>
              <button
                onClick={() => {
                  setStep('idle')
                  setCode('')
                  setError(null)
                  setNotice(null)
                }}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg text-xs font-mono text-text-muted hover:text-text transition-colors disabled:opacity-40"
              >
                {t.common.cancel}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-[11px] font-mono text-red-400 leading-relaxed"
          >
            <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
            <div>
              <div>{error.message}</div>
              {error.detail && <div className="mt-1 opacity-80">{error.detail}</div>}
            </div>
          </div>
        )}
      </div>

      {confirmGithub && (
        <ConfirmModal
          title={tc.githubConfirmTitle}
          message={tf(tc.githubConfirmMessage, { repo: target })}
          confirmLabel={tc.githubConfirmAction}
          cancelLabel={t.common.cancel}
          onConfirm={() => {
            setConfirmGithub(false)
            void handleGithubConnect()
          }}
          onCancel={() => setConfirmGithub(false)}
        />
      )}
    </section>
  )
}
