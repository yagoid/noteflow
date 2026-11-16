import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Loader, X } from 'lucide-react'
import { useT } from '../i18n/useT'
import { tf } from '../i18n/format'
import type { OriginChoiceAction } from '../types'
import { originChoiceLabels } from '../lib/originChoiceLabels'

export interface OriginChoiceDialogProps {
  /** Which sync backend asks — its labels, and Cloud's "cancel" (Cloud off, not a disconnect). */
  backend: 'github' | 'cloud'
  /** The remote the notes on this device came from (GitHub: 'owner/repo'; Cloud: email). '' = unknown. */
  previousLabel: string
  /** The remote just connected (Cloud: the signed-in account's email). */
  nextLabel: string
  /** The notes came from the OTHER sync ("use only the notes from …" there): another intro. */
  stale?: boolean
  /** Cloud: "use only the account's notes" also disconnects GitHub Sync — said in that option. */
  disconnectsGithub?: boolean
  /**
   * Applies the choice. `error: 'archive-failed'` = the local notes could not be
   * set aside: nothing was downloaded and the choice stays pending.
   */
  onResolve: (choice: OriginChoiceAction) => Promise<{ ok: boolean; error?: string }>
  /** Closes without choosing ("Decide later"): nothing syncs meanwhile. */
  onClose: () => void
  /** External busy flag (the dialog also tracks its own request). */
  busy?: boolean
}

const OPTIONS: OriginChoiceAction[] = ['merge', 'replace', 'cancel']

/**
 * The notes dir came from another remote than the one just connected (see
 * electron/syncOrigin.ts): merge, use only the remote's notes (the local ones
 * move to a copy on this computer — never deleted) or cancel (GitHub:
 * disconnect; NoteFlow Cloud: Cloud off on this device, still signed in).
 * Shared by GitHub Sync and NoteFlow Cloud. Nothing is preselected and
 * nothing destructive has the focus: the user picks an option, then Continue.
 * Escape / "Decide later" only close the dialog.
 */
export function OriginChoiceDialog({
  backend,
  previousLabel,
  nextLabel,
  stale = false,
  disconnectsGithub = false,
  onResolve,
  onClose,
  busy: externalBusy,
}: OriginChoiceDialogProps) {
  const t = useT()
  const m = t.originChoice
  const [selected, setSelected] = useState<OriginChoiceAction | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = running || externalBusy === true
  const dialogRef = useRef<HTMLDivElement>(null)

  // Focus the dialog itself (not an option) so neither Enter nor Space can pick anything.
  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  // Escape closes this dialog only — captured on window so the Settings modal
  // underneath (which also closes on Escape) doesn't close with it.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      if (!busy) onClose()
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [busy, onClose])

  const backendLabel = backend === 'cloud' ? m.backendCloud : m.backendGithub
  const labels = originChoiceLabels(m, backend, { previous: previousLabel, next: nextLabel, stale })
  const vars = { previous: labels.previous, next: labels.next }
  const replaceDesc = tf(m.replaceDesc, vars)
  const optionText: Record<OriginChoiceAction, { title: string; desc: string }> = {
    merge: { title: m.merge, desc: tf(m.mergeDesc, vars) },
    replace: {
      title: tf(m.replace, vars),
      desc: backend === 'cloud' && disconnectsGithub ? `${replaceDesc} ${m.replaceDisconnectsGithub}` : replaceDesc,
    },
    cancel: { title: m.cancel, desc: backend === 'cloud' ? m.cancelDescCloud : tf(m.cancelDesc, vars) },
  }

  const apply = async () => {
    if (!selected || busy) return
    setRunning(true)
    setError(null)
    try {
      const res = await onResolve(selected)
      if (!res.ok) setError(res.error === 'archive-failed' ? m.archiveFailed : m.failed)
    } catch {
      setError(m.failed)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => { if (!busy) onClose() }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={m.title}
        className="w-[26rem] max-w-[calc(100vw-2rem)] bg-surface-1 border border-border rounded-lg shadow-2xl overflow-hidden focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-3 border-b border-border">
          <span className="flex-1 text-sm font-mono font-semibold text-text">{m.title}</span>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            title={m.later}
            aria-label={m.later}
            className="text-text-muted hover:text-text transition-colors disabled:opacity-40"
          >
            <X size={13} />
          </button>
        </div>

        <div className="px-4 py-3 space-y-3">
          <p className="text-xs font-mono text-text-muted leading-relaxed">{stale ? tf(m.introStale, vars) : m.intro}</p>

          {/* Previous → new remote */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-solid border-border bg-surface-0 text-[11px] font-mono">
            <div className="min-w-0 flex-1">
              <div className="text-text-muted">{m.previousLabel}</div>
              <div className="text-text truncate" title={labels.previous}>{labels.previous}</div>
            </div>
            <ArrowRight size={12} className="flex-shrink-0 text-text-muted" />
            <div className="min-w-0 flex-1">
              <div className="text-text-muted">{m.nextLabel}</div>
              <div className="text-text truncate" title={labels.next}>{labels.next}</div>
            </div>
          </div>
          <p className="text-[10px] font-mono text-text-muted/70 -mt-1.5">{backendLabel}</p>

          {/* The three options — none preselected */}
          <div role="radiogroup" aria-label={m.title} className="space-y-1.5">
            {OPTIONS.map((option) => {
              const isSelected = selected === option
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={busy}
                  onClick={() => { setSelected(option); setError(null) }}
                  className={`w-full text-left px-3 py-2 rounded-lg border border-solid transition-colors disabled:opacity-60 focus:outline-none focus-visible:border-text/40 ${
                    isSelected ? 'border-accent bg-accent/[0.08]' : 'border-border hover:bg-surface-2'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={`w-2.5 h-2.5 rounded-full border border-solid flex-shrink-0 ${
                        isSelected ? 'border-accent bg-accent' : 'border-text-muted'
                      }`}
                    />
                    <span className="text-xs font-mono font-semibold text-text break-words">{optionText[option].title}</span>
                  </div>
                  <p className="mt-1 pl-[18px] text-[11px] font-mono text-text-muted leading-relaxed">{optionText[option].desc}</p>
                </button>
              )
            })}
          </div>

          {error && (
            <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-[11px] font-mono text-red-400 leading-relaxed">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 pb-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 rounded text-xs font-mono text-text-muted border border-border hover:border-text/25 hover:text-text transition-colors disabled:opacity-40 focus:outline-none focus:border-text/30"
          >
            {m.later}
          </button>
          <button
            type="button"
            onClick={() => void apply()}
            disabled={!selected || busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono bg-surface-2 text-text border border-text/20 hover:bg-surface-3 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:border-text/30"
          >
            {busy && <Loader size={11} className="animate-spin" />}
            {busy ? m.working : m.continue}
          </button>
        </div>
      </div>
    </div>
  )
}
