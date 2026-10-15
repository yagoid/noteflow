import { useEffect, useRef, useState } from 'react'
import { ChevronDown, TimerOff } from 'lucide-react'
import { useNotesStore } from '../../stores/notesStore'
import { TEMP_NOTE_EXPIRY_HOURS } from '../../lib/dateUtils'
import { useT } from '../../i18n/useT'
import { plural, tf } from '../../i18n/format'

/**
 * Discreet chevron after the "Deletes …" line of a temporary note. Opens a mini menu to
 * reschedule the auto-delete (relative to now) or make the note permanent. Both actions
 * are metadata-only store writes (note.md only); the menu itself renders only while the
 * note is unlocked, since the editor shows the lock screen otherwise.
 */
export function TempNoteExpiryMenu({ noteId }: { noteId: string }) {
  const t = useT()
  const setNoteExpiry = useNotesStore((s) => s.setNoteExpiry)
  const makeNotePermanent = useNotesStore((s) => s.makeNotePermanent)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)

  // Dismiss on outside click / Escape. Both listen in the capture phase: the note editor
  // stops keydown propagation and some of its areas stop mousedown, so bubbling
  // listeners could miss them.
  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  return (
    <span ref={rootRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title={t.editor.expiry.options}
        aria-label={t.editor.expiry.options}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center rounded transition-colors
          ${open ? 'text-accent' : 'text-accent/50 hover:text-accent'}`}
      >
        <ChevronDown size={11} strokeWidth={2.5} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1 bg-surface-1 border border-border rounded shadow-lg z-50 py-1 min-w-[180px]"
        >
          <div className="px-3 pt-1 text-[10px] font-mono text-text-muted uppercase tracking-wider">
            {t.editor.expiry.deleteIn}
          </div>
          <div className="px-2 py-1.5 flex items-center gap-1">
            {TEMP_NOTE_EXPIRY_HOURS.map((hours) => (
              <button
                key={hours}
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); void setNoteExpiry(noteId, hours) }}
                title={plural(t.editor.expiry.deleteInHours, hours)}
                aria-label={plural(t.editor.expiry.deleteInHours, hours)}
                className="px-1.5 py-0.5 rounded text-xs whitespace-nowrap font-mono text-text-muted hover:text-text hover:bg-surface-3 transition-colors"
              >
                {tf(t.editor.expiry.hoursShort, { count: hours })}
              </button>
            ))}
          </div>
          <div className="h-px bg-border my-1" />
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); void makeNotePermanent(noteId) }}
            title={t.editor.expiry.makePermanentHint}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-text-muted hover:text-text hover:bg-surface-3 transition-colors text-left"
          >
            <TimerOff size={13} />
            {t.editor.expiry.makePermanent}
          </button>
        </div>
      )}
    </span>
  )
}
