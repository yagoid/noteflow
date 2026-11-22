import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useT } from '../i18n/useT'

interface ConfirmModalProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  /**
   * Enter confirms from anywhere in the window (default). Pass false for
   * irreversible actions: Enter then only activates the focused button (native
   * behaviour; Cancel has focus on open), so neither an Enter meant for Cancel
   * nor the autorepeat of the Enter that opened the modal can confirm.
   */
  confirmOnEnter?: boolean
  /** Information only: a single button (confirm). Escape / outside click still close it. */
  hideCancel?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger       = false,
  confirmOnEnter = true,
  hideCancel = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const t = useT()
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Focus Cancel on open. With confirmOnEnter (the default) Enter still confirms
  // globally whatever has focus; only confirmOnEnter={false} makes Enter act on
  // the focused button instead.
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  // Keyboard: Escape → cancel, Enter → confirm (unless confirmOnEnter is false)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      if (e.key === 'Enter' && confirmOnEnter) { e.preventDefault(); onConfirm() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel, onConfirm, confirmOnEnter])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-80 bg-surface-1 border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-3 border-b border-border">
          {danger && <AlertTriangle size={15} className="text-red flex-shrink-0" />}
          <span className="text-sm font-mono font-semibold text-text">{title}</span>
        </div>

        {/* Body */}
        <div className="px-4 py-3">
          <p className="text-xs font-mono text-text-muted leading-relaxed whitespace-pre-line break-words">{message}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-4 pb-4">
          {!hideCancel && <button
            ref={cancelRef}
            onClick={onCancel}
            className="px-3 py-1.5 rounded text-xs font-mono text-text-muted
                       border border-border hover:border-text/25 hover:text-text
                       transition-colors focus:outline-none focus:border-text/30"
          >
            {cancelLabel ?? t.common.cancel}
          </button>}
          <button
            onClick={onConfirm}
            className={`px-3 py-1.5 rounded text-xs font-mono transition-colors focus:outline-none
              ${danger
                ? 'bg-red/15 text-red border border-red/30 hover:bg-red/25 focus:border-red/60'
                : 'bg-surface-2 text-text border border-text/20 hover:bg-surface-3 focus:border-text/30'
              }`}
          >
            {confirmLabel ?? t.common.confirm}
          </button>
        </div>
      </div>
    </div>
  )
}
