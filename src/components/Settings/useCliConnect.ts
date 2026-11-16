import { useEffect, useState } from 'react'
import type { CliConnectError, CliConnectResult, CliConnectStatus } from '../../types'
import { useT } from '../../i18n/useT'

export type CliConnectStep = 'idle' | 'sending' | 'code' | 'verifying' | 'resending' | 'connecting' | 'disconnecting'

// State + actions of "Connect the CLI too" (Settings → Sync): gives the bundled
// `noteflow` CLI its OWN access to the backend the app syncs with
// (electron/cliConnect.ts). Used by the sync overview, which shows it as a row
// (CliConnectRow) and reads `connected` for the sync map. Mount it only while
// that backend is connected in the app; `key` the owner by backend so switching
// resets it.
//  - Cloud: the CLI signs in with a code emailed to the app account's address
//    (its own session — never the app's).
//  - GitHub: after a confirmation, the CLI gets a copy of the app's token.
// Its state is read from the CLI's settings, so a CLI connected from the
// terminal shows up as connected too.
// Microsoft Store build: it ships no CLI (`isStore`), so the row only explains
// that — never the connected state of a CLI from a direct install sharing settings.json.
export function useCliConnect(backend: 'cloud' | 'github') {
  const t = useT()
  const tc = t.settings.sync.cli
  const [status, setStatus] = useState<CliConnectStatus | null>(null)
  // null until known: nothing renders before, so the Store build never flashes the controls.
  const [isStore, setIsStore] = useState<boolean | null>(null)
  // The app's email (Cloud) / owner/repo (GitHub) — the description's target.
  const [appTarget, setAppTarget] = useState<string | null>(null)
  // Cloud: the app account's keys mode — e2ee means the CLI needs the passphrase to sync.
  const [keysMode, setKeysMode] = useState<'managed' | 'e2ee' | null>(null)
  const [step, setStep] = useState<CliConnectStep>('idle')
  const [code, setCode] = useState('')
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmGithub, setConfirmGithub] = useState(false)

  useEffect(() => {
    let alive = true
    window.noteflow.cliConnectGetStatus().then((s) => { if (alive) setStatus(s) })
    window.noteflow.getDistribution().then((d) => { if (alive) setIsStore(d === 'store') })
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

  async function sendCode(resend: boolean) {
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

  async function verify() {
    if (!code.trim() || step === 'verifying') return
    setStep('verifying')
    setNotice(null)
    const ok = apply(await window.noteflow.cliConnectCloudVerify(code.trim()))
    setStep(ok ? 'idle' : 'code')
    if (ok) setCode('')
  }

  async function githubConnect() {
    setStep('connecting')
    setError(null)
    apply(await window.noteflow.cliConnectGithubConnect())
    setStep('idle')
  }

  async function disconnect() {
    setStep('disconnecting')
    setError(null)
    setNotice(null)
    apply(await (backend === 'cloud'
      ? window.noteflow.cliConnectCloudDisconnect()
      : window.noteflow.cliConnectGithubDisconnect()))
    setStep('idle')
  }

  function cancelCode() {
    setStep('idle')
    setCode('')
    setError(null)
    setNotice(null)
  }

  function editCode(value: string) {
    setCode(value)
    if (error) setError(null)
    if (notice) setNotice(null)
  }

  const connected = !isStore && !!status && (backend === 'cloud' ? status.cloud.connected : status.github.connected)

  return {
    backend,
    status,
    isStore,
    appTarget,
    keysMode,
    step,
    code,
    error,
    notice,
    confirmGithub,
    /** The CLI holds its own access to this backend (false on the Store build and while loading). */
    connected,
    setConfirmGithub,
    sendCode,
    verify,
    githubConnect,
    disconnect,
    cancelCode,
    editCode,
  }
}

export type CliConnect = ReturnType<typeof useCliConnect>
