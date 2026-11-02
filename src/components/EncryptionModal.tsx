import { useEffect, useRef, useState } from 'react'
import { Lock, Unlock, AlertTriangle, Loader2, Info, ChevronDown, ChevronUp } from 'lucide-react'
import type { EncryptionOptions } from '../lib/cryptoUtils'
import { useT } from '../i18n/useT'
import { tf } from '../i18n/format'

const ITER_MIN  = 100_000
const ITER_MAX  = 2_000_000
const SALT_MIN  = 16
const SALT_MAX  = 32

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(v)))
}

interface EncryptionModalProps {
  mode: 'encrypt' | 'unlock' | 'remove'
  noteTitle: string
  onConfirm: (password: string, options?: EncryptionOptions) => Promise<void>
  onCancel: () => void
}

export function EncryptionModal({ mode, noteTitle, onConfirm, onCancel }: EncryptionModalProps) {
  const t = useT()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  // Advanced options (encrypt only)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [iterations, setIterations]     = useState(310_000)
  const [saltBytes, setSaltBytes]       = useState(16)
  const [hashAlg, setHashAlg]           = useState<'SHA-256' | 'SHA-512'>('SHA-256')

  const passwordRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    passwordRef.current?.focus()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  const isValid =
    mode === 'encrypt'
      ? password.length > 0 && password === confirm
      : password.length > 0

  const modeLabel = mode === 'encrypt' ? t.encryption.encryptNote : mode === 'unlock' ? t.encryption.unlockNote : t.encryption.removeEncryption

  async function handleSubmit() {
    if (!isValid || loading) return
    setError('')
    setLoading(true)
    try {
      const options: EncryptionOptions | undefined = mode === 'encrypt'
        ? { iterations, saltBytes, hashAlg }
        : undefined
      await onConfirm(password, options)
    } catch {
      setError(
        mode === 'encrypt'
          ? t.encryption.encryptError
          : t.encryption.wrongPassword
      )
      setLoading(false)
    }
  }

  const passwordMismatch = mode === 'encrypt' && confirm.length > 0 && password !== confirm

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-surface-1 border border-border rounded-lg shadow-xl w-full max-w-sm mx-4 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          {mode === 'encrypt'
            ? <Lock size={14} className="text-text flex-shrink-0" />
            : <Unlock size={14} className="text-text flex-shrink-0" />
          }
          <span className="text-sm font-mono font-semibold text-text">
            {modeLabel}
          </span>
        </div>

        <div className="px-4 py-4 flex flex-col gap-3">
          {/* Note title */}
          <p className="text-xs font-mono text-text-muted truncate">
            <span className="text-text">{noteTitle || t.common.untitled}</span>
          </p>

          {/* Warning (encrypt only) */}
          {mode === 'encrypt' && (
            <div className="flex gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/30">
              <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs font-mono text-amber-300 leading-relaxed">
                {t.encryption.encryptWarning}
              </p>
            </div>
          )}

          {/* Warning (remove encryption) */}
          {mode === 'remove' && (
            <div className="flex gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/30">
              <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs font-mono text-amber-300 leading-relaxed">
                {t.encryption.removeWarning}
              </p>
            </div>
          )}

          {/* Password field */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-mono text-text-muted">{t.encryption.password}</label>
            <input
              ref={passwordRef}
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter' && mode !== 'encrypt') handleSubmit() }}
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm font-mono text-text placeholder-text-muted outline-none focus:border-text/30 transition-colors"
              placeholder={t.encryption.enterPassword}
              autoComplete="new-password"
            />
          </div>

          {/* Confirm password (encrypt only) */}
          {mode === 'encrypt' && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-mono text-text-muted">{t.encryption.confirmPassword}</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); setError('') }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
                className={`w-full bg-surface-2 border rounded px-3 py-2 text-sm font-mono text-text placeholder-text-muted outline-none focus:border-text/30 transition-colors ${
                  passwordMismatch ? 'border-red-500/60' : 'border-border'
                }`}
                placeholder={t.encryption.confirmPassword}
                autoComplete="new-password"
              />
              {passwordMismatch && (
                <p className="text-xs font-mono text-red-400">{t.encryption.passwordsDoNotMatch}</p>
              )}
            </div>
          )}

          {/* Advanced options (encrypt only) */}
          {mode === 'encrypt' && (
            <div className="border border-border/60 rounded-md overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
              >
                <span>{t.encryption.advancedOptions}</span>
                {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>

              {showAdvanced && (
                <div className="px-3 pb-3 pt-1 flex flex-col gap-3 border-t border-border/60 bg-surface-2/30">
                  {/* Iterations */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1">
                      <label className="text-xs font-mono text-text-muted">{t.encryption.iterations}</label>
                      <span
                        title={t.encryption.iterationsInfo}
                        className="cursor-help text-text-muted/60 hover:text-text-muted transition-colors"
                      >
                        <Info size={11} />
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={iterations}
                        min={ITER_MIN}
                        max={ITER_MAX}
                        step={10_000}
                        onChange={(e) => setIterations(Number(e.target.value))}
                        onBlur={(e) => setIterations(clamp(Number(e.target.value), ITER_MIN, ITER_MAX))}
                        className="flex-1 bg-surface-2 border border-border rounded px-2 py-1.5 text-xs font-mono text-text outline-none focus:border-text/30 transition-colors"
                      />
                      <span className="text-xs font-mono text-text-muted/60 flex-shrink-0">
                        {(ITER_MIN / 1000).toFixed(0)}k – {(ITER_MAX / 1_000_000).toFixed(0)}M
                      </span>
                    </div>
                  </div>

                  {/* Salt length */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1">
                      <label className="text-xs font-mono text-text-muted">{t.encryption.saltLength}</label>
                      <span
                        title={t.encryption.saltLengthInfo}
                        className="cursor-help text-text-muted/60 hover:text-text-muted transition-colors"
                      >
                        <Info size={11} />
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={saltBytes}
                        min={SALT_MIN}
                        max={SALT_MAX}
                        onChange={(e) => setSaltBytes(Number(e.target.value))}
                        onBlur={(e) => setSaltBytes(clamp(Number(e.target.value), SALT_MIN, SALT_MAX))}
                        className="flex-1 bg-surface-2 border border-border rounded px-2 py-1.5 text-xs font-mono text-text outline-none focus:border-text/30 transition-colors"
                      />
                      <span className="text-xs font-mono text-text-muted/60 flex-shrink-0">
                        {tf(t.encryption.bytesRange, { min: SALT_MIN, max: SALT_MAX })}
                      </span>
                    </div>
                  </div>

                  {/* Hash algorithm */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1">
                      <label className="text-xs font-mono text-text-muted">{t.encryption.hashAlgorithm}</label>
                      <span
                        title={t.encryption.hashAlgorithmInfo}
                        className="cursor-help text-text-muted/60 hover:text-text-muted transition-colors"
                      >
                        <Info size={11} />
                      </span>
                    </div>
                    <select
                      value={hashAlg}
                      onChange={(e) => setHashAlg(e.target.value as 'SHA-256' | 'SHA-512')}
                      className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-xs font-mono text-text outline-none focus:border-text/30 transition-colors"
                    >
                      <option value="SHA-256">SHA-256</option>
                      <option value="SHA-512">SHA-512</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-xs font-mono text-red-400">{error}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 px-4 pb-4">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-mono text-text-muted hover:text-text border border-border hover:border-text-muted rounded transition-colors"
          >
            {t.common.cancel}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono bg-text text-surface-0 rounded hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {loading && <Loader2 size={12} className="animate-spin" />}
            {modeLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
