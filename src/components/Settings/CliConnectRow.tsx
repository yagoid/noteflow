import { useEffect, useRef, type ReactNode } from 'react'
import { AlertCircle, KeyRound, Loader, MailCheck, Terminal, Unlink } from 'lucide-react'
import { tf } from '../../i18n/format'
import { useT } from '../../i18n/useT'
import { ConfirmModal } from '../ConfirmModal'
import { SettingsRow, StatusBadge, settingsButtonClass, settingsGhostButtonClass } from './ui'
import type { CliConnect } from './useCliConnect'

// "noteflow CLI" row of Settings → Sync's data list (state + actions in
// useCliConnect). Compact while idle — badge Connected / Not connected, one line
// and the Connect / Disconnect button — and it unfolds under the same row while
// a flow is in progress: the emailed code (Cloud), the e2ee notice, errors. The
// GitHub token copy is confirmed in a modal first. While the backend's origin
// choice is pending, Connect is disabled with the reason under the row.
export function CliConnectRow({ cli }: { cli: CliConnect }) {
  const t = useT()
  const tc = t.settings.sync.cli
  const codeInputRef = useRef<HTMLInputElement>(null)
  const { backend, status, isStore, appTarget, step, code, error, notice } = cli

  useEffect(() => {
    if (step === 'code') codeInputRef.current?.focus()
  }, [step])

  const icon = <Terminal size={14} />

  if (isStore) {
    return <SettingsRow icon={icon} title={tc.title} description={tc.storeUnavailable} />
  }
  if (isStore === null || !status) {
    return <SettingsRow icon={icon} title={tc.title} description={t.common.loading} />
  }

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
  const showE2eeNotice = backend === 'cloud' && cli.keysMode === 'e2ee' && sameAccount

  let description: string
  let action: ReactNode = null
  if (cli.connected) {
    const connectedLine = tf(tc.connectedTo, { target: connectedTarget ?? '' })
    description = canDisconnect ? connectedLine : `${connectedLine} ${tc.sharedWithApp}`
    if (canDisconnect) {
      action = (
        <button onClick={() => void cli.disconnect()} disabled={busy} className={settingsGhostButtonClass}>
          {step === 'disconnecting' ? <Loader size={11} className="animate-spin" /> : <Unlink size={11} />}
          {tc.disconnect}
        </button>
      )
    }
  } else if (!status.available) {
    description = tc.errors.cliMissing
  } else {
    description = tf(backend === 'cloud' ? tc.descCloud : tc.descGithub, backend === 'cloud' ? { email: target } : { repo: target })
    if (!codeStep) {
      action = (
        <button
          onClick={() => (backend === 'cloud' ? void cli.sendCode(false) : cli.setConfirmGithub(true))}
          disabled={busy || !appTarget || cli.originPending}
          title={cli.originPending ? tc.originPending : undefined}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap ${settingsButtonClass}`}
        >
          {step === 'sending' || step === 'connecting'
            ? <Loader size={11} className="animate-spin" />
            : <Terminal size={11} />}
          {tc.connect}
        </button>
      )
    }
  }

  // The Connect button is off while the backend's origin choice is pending: say why under the row.
  const showOriginPending = !cli.connected && status.available && !codeStep && cli.originPending
  const expanded = showOriginPending || showE2eeNotice || (!cli.connected && codeStep) || !!error

  return (
    <>
      <SettingsRow
        icon={icon}
        title={tc.title}
        badge={
          <StatusBadge tone={cli.connected ? 'ok' : 'neutral'} dot={cli.connected}>
            {cli.connected ? t.settings.sync.connected : t.settings.sync.notConnected}
          </StatusBadge>
        }
        description={description}
        action={action}
      >
        {expanded ? (
          <>
            {showOriginPending && (
              <p className="text-[11px] font-mono text-text-muted leading-relaxed">{tc.originPending}</p>
            )}

            {showE2eeNotice && (
              <div className="flex items-start gap-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-[11px] font-mono text-yellow-400 leading-relaxed">
                <KeyRound size={12} className="flex-shrink-0 mt-0.5" />
                <span>{tc.e2eeNotice}</span>
              </div>
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
                    onChange={(e) => cli.editCode(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void cli.verify() }}
                    placeholder="12345678"
                    disabled={busy}
                    aria-invalid={!!error}
                    className={`w-full px-3 py-1.5 rounded-lg text-xs font-mono tracking-widest bg-surface-0 border text-text placeholder:text-text-muted/40 focus:outline-none disabled:opacity-40 transition-colors ${
                      error ? 'border-red/50 focus:border-red/70' : 'border-border focus:border-text/30'
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
                    onClick={() => void cli.verify()}
                    disabled={busy || !code.trim()}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono ${settingsButtonClass}`}
                  >
                    {step === 'verifying' ? <Loader size={11} className="animate-spin" /> : <KeyRound size={11} />}
                    {tc.verify}
                  </button>
                  <button onClick={() => void cli.sendCode(true)} disabled={busy} className={settingsGhostButtonClass}>
                    {tc.resend}
                  </button>
                  <button onClick={cli.cancelCode} disabled={busy} className={settingsGhostButtonClass}>
                    {t.common.cancel}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 px-3 py-2 bg-red/10 border border-red/30 rounded-lg text-[11px] font-mono text-red leading-relaxed"
              >
                <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
                <div>
                  <div>{error.message}</div>
                  {error.detail && <div className="mt-1 opacity-80">{error.detail}</div>}
                </div>
              </div>
            )}
          </>
        ) : null}
      </SettingsRow>

      {cli.confirmGithub && (
        <ConfirmModal
          title={tc.githubConfirmTitle}
          message={tf(tc.githubConfirmMessage, { repo: target })}
          confirmLabel={tc.githubConfirmAction}
          cancelLabel={t.common.cancel}
          onConfirm={() => {
            cli.setConfirmGithub(false)
            void cli.githubConnect()
          }}
          onCancel={() => cli.setConfirmGithub(false)}
        />
      )}
    </>
  )
}
