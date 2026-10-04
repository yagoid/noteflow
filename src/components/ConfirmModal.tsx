import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useT } from '../i18n/useT'

interface ConfirmModalProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger       = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const t = useT()
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Focus cancel by default so Enter doesn't accidentally confirm
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  // Keyboard: Escape → cancel, Enter → confirm
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      if (e.key === 'Enter')  { e.preventDefault(); onConfirm() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel, onConfirm])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-80 bg-surface-1 border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-3 border-b border-border">
          {danger && <AlertTriangle size={15} className="text-red-400 flex-shrink-0" />}
          <span className="text-sm font-mono font-semibold text-text">{title}</span>
        </div>

        {/* Body */}
        <div className="px-4 py-3">
          <p className="text-xs font-mono text-text-muted leading-relaxed">{message}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-4 pb-4">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="px-3 py-1.5 rounded text-xs font-mono text-text-muted
                       border border-border hover:border-text/25 hover:text-text
                       transition-colors focus:outline-none focus:border-text/30"
          >
            {cancelLabel ?? t.common.cancel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-3 py-1.5 rounded text-xs font-mono transition-colors focus:outline-none
              ${danger
                ? 'bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 focus:border-red-500/60'
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
