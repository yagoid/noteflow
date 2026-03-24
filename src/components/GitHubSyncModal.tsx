import { useEffect, useRef, useState } from 'react'
import { Cloud, CloudOff, ExternalLink, Github, Loader, RefreshCw, Unlink, X } from 'lucide-react'
import { useNotesStore } from '../stores/notesStore'

interface SyncStatus {
  enabled: boolean
  connected: boolean
  owner?: string
  repo?: string
  lastSync?: string
  error?: string
}

interface Props {
  onClose: () => void
}

type Step = 'idle' | 'waiting-auth' | 'completing' | 'pulling'

export function GitHubSyncModal({ onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const loadNotes = useNotesStore((s) => s.loadNotes)

  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [step, setStep] = useState<Step>('idle')
  const [error, setError] = useState<string | null>(null)
  const [repo, setRepo] = useState('noteflow-notes')
  const [userCode, setUserCode] = useState<string | null>(null)
  const [verificationUri, setVerificationUri] = useState<string | null>(null)
  const [pullResult, setPullResult] = useState<{ pulled: number; errors: string[] } | null>(null)

  useEffect(() => {
    window.noteflow.getSyncStatus().then(setStatus)
  }, [])

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
        setError(result.error ?? 'Authorization failed')
        setUserCode(null)
        setStep('idle')
      }
    })
    return unsub
  }, [loadNotes])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [userCode])

  function handleClose() {
    if (userCode) {
      window.noteflow.cancelGitHubAuth()
    }
    onClose()
  }

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
      setError(result.error ?? 'Failed to start authorization')
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
    const result = await window.noteflow.pullNotes()
    setPullResult(result)
    setStep('idle')
    if (result.pulled > 0) await loadNotes()
    const updated = await window.noteflow.getSyncStatus()
    setStatus(updated)
  }

  async function handleDisconnect() {
    await window.noteflow.disconnectGitHub()
    const updated = await window.noteflow.getSyncStatus()
    setStatus(updated)
    setPullResult(null)
  }

  const isLoading = step !== 'idle'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        ref={containerRef}
        className="w-[480px] flex flex-col bg-surface-1 border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-border">
          <Github size={13} className="text-accent flex-shrink-0" />
          <span className="text-xs font-mono text-text font-medium flex-1">GitHub Sync</span>
          <button onClick={handleClose} className="text-text-muted hover:text-text transition-colors">
            <X size={13} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Status badge */}
          {status && (
            <div className="flex items-center gap-2">
              {status.connected ? (
                <>
                  <Cloud size={12} className="text-green-400" />
                  <span className="text-xs font-mono text-green-400">Connected</span>
                  <span className="text-xs font-mono text-text-muted">·</span>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      window.noteflow.openUrl(`https://github.com/${status.owner}/${status.repo}`)
                    }}
                    className="text-xs font-mono text-accent hover:underline flex items-center gap-1"
                  >
                    {status.owner}/{status.repo}
                    <ExternalLink size={10} />
                  </a>
                </>
              ) : (
                <>
                  <CloudOff size={12} className="text-text-muted" />
                  <span className="text-xs font-mono text-text-muted">Not connected</span>
                </>
              )}
            </div>
          )}

          {status?.lastSync && (
            <p className="text-[11px] font-mono text-text-muted">
              Last sync: {new Date(status.lastSync).toLocaleString()}
            </p>
          )}

          {/* Error */}
          {(error || status?.error) && (
            <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-xs font-mono text-red-400">
              {error ?? status?.error}
            </div>
          )}

          {/* Pull result */}
          {pullResult && (
            <div className={`px-3 py-2 rounded text-xs font-mono ${
              pullResult.errors.length > 0
                ? 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-400'
                : 'bg-green-500/10 border border-green-500/30 text-green-400'
            }`}>
              {pullResult.pulled === 0
                ? 'Already up to date'
                : `Pulled ${pullResult.pulled} note${pullResult.pulled !== 1 ? 's' : ''}`}
              {pullResult.errors.length > 0 && (
                <div className="mt-1 text-[10px] text-red-400">{pullResult.errors.join(', ')}</div>
              )}
            </div>
          )}

          {/* ── Waiting for user to authorize in browser ── */}
          {userCode && (
            <div className="space-y-4">
              <div>
                <p className="text-[11px] font-mono text-text-muted mb-3">
                  Go to{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      window.noteflow.openUrl(verificationUri ?? 'https://github.com/login/device')
                    }}
                    className="text-accent hover:underline"
                  >
                    github.com/login/device
                  </a>{' '}
                  and enter this code:
                </p>
                <div className="flex items-center justify-center py-3">
                  <span className="text-2xl font-mono font-bold text-text tracking-widest bg-surface-0 border border-border px-6 py-3 rounded-lg">
                    {userCode}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-text-muted">
                <Loader size={12} className="animate-spin flex-shrink-0" />
                <span className="text-[11px] font-mono">Waiting for authorization...</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => window.noteflow.openUrl(verificationUri ?? 'https://github.com/login/device')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30 transition-colors"
                >
                  <ExternalLink size={11} />
                  Open browser
                </button>
                <button
                  onClick={handleCancel}
                  className="px-3 py-1.5 rounded text-xs font-mono text-text-muted hover:text-text transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Completing connection ── */}
          {step === 'completing' && !userCode && (
            <div className="flex items-center gap-2 text-text-muted">
              <Loader size={12} className="animate-spin" />
              <span className="text-xs font-mono">Connecting...</span>
            </div>
          )}

          {/* ── Connected: actions ── */}
          {status?.connected && !userCode && step !== 'completing' && (
            <div className="flex gap-2">
              <button
                onClick={handlePull}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono bg-surface-2 hover:bg-surface-3 text-text transition-colors disabled:opacity-40"
              >
                {step === 'pulling' ? (
                  <Loader size={11} className="animate-spin" />
                ) : (
                  <RefreshCw size={11} />
                )}
                Sync now
              </button>
              <button
                onClick={handleDisconnect}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
              >
                <Unlink size={11} />
                Disconnect
              </button>
            </div>
          )}

          {/* ── Not connected: setup form ── */}
          {status && !status.connected && !userCode && step !== 'completing' && (
            <div className="space-y-3 pt-1">
              <p className="text-[11px] font-mono text-text-muted leading-relaxed">
                Sync notes across machines via a private GitHub repository.
                The repo will be created automatically if it doesn&apos;t exist.
              </p>
              <div>
                <label className="block text-[10px] font-mono text-text-muted mb-1 uppercase tracking-wider">
                  Repository name
                </label>
                <input
                  type="text"
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  placeholder="noteflow-notes"
                  disabled={isLoading}
                  className="w-full px-3 py-1.5 rounded text-xs font-mono bg-surface-0 border border-border text-text placeholder:text-text-muted/40 focus:outline-none focus:border-accent/50 disabled:opacity-40"
                />
              </div>
              <button
                onClick={handleInitiate}
                disabled={isLoading || !repo.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {step === 'waiting-auth' && !userCode ? (
                  <Loader size={11} className="animate-spin" />
                ) : (
                  <Github size={11} />
                )}
                Connect with GitHub
              </button>
            </div>
          )}

          {/* Loading spinner for initial status fetch */}
          {!status && (
            <div className="flex items-center gap-2 text-text-muted">
              <Loader size={12} className="animate-spin" />
              <span className="text-xs font-mono">Loading...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
