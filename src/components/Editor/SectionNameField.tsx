import { useEffect, useRef, useState } from 'react'
import { OWN_KEYS_PROPS } from '../../lib/keyScope'

interface SectionNameFieldProps {
  /** Current name of the section (store). */
  name: string
  /** Whether the strip that holds the field is open (it stays mounted while collapsing). */
  open: boolean
  /** Locked encrypted note: the name can't be changed. */
  readOnly: boolean
  /** aria-label / tooltip. */
  label: string
  /**
   * Persists a new, non-empty, trimmed name (only called when it differs). Resolves, once the
   * write has settled, with the name the section actually has (undefined if it is gone).
   */
  onCommit: (name: string) => Promise<string | undefined>
  /** Closes the strip (Enter, or Escape with nothing to discard). */
  onClose: () => void
}

/**
 * Editable section name in the tab strip (right-click on a tab). Mount it with a key per
 * note + section: the draft starts from that section's name, follows outside renames (sync,
 * another pane) only while the field isn't focused, and is committed on Enter, on blur and
 * when the strip closes or the field unmounts — never empty, never an unchanged name.
 */
export function SectionNameField({ name, open, readOnly, label, onCommit, onClose }: SectionNameFieldProps) {
  const [draft, setDraft] = useState(name)
  const [focused, setFocused] = useState(false)
  // The name the draft was last aligned with: an outside rename while not editing replaces
  // the draft (adjusted during render rather than in an effect).
  const [syncedName, setSyncedName] = useState(name)
  if (!focused && syncedName !== name) {
    setSyncedName(name)
    setDraft(name)
  }

  const inputRef = useRef<HTMLInputElement>(null)
  const latest = useRef({ draft, name, focused, onCommit })
  useEffect(() => { latest.current = { draft, name, focused, onCommit } })

  // A repeated commit of the same name (blur, then unmount, before the store catches up) is
  // harmless: updateSection is queued per note and patchSectionInList skips no-op patches.
  // The draft keeps the new name while the write is in flight (no flash of the old one) and
  // then realigns with what the section really has — so a failed write doesn't leave the
  // field showing a name the store never got.
  const commit = () => {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === name) { setDraft(name); return }
    setDraft(trimmed)
    setSyncedName(name)
    void onCommit(trimmed).then((actual) => {
      if (actual === undefined || latest.current.focused) return
      setDraft(actual)
      setSyncedName(actual)
    })
  }

  // Unmount (another section / note in the strip) can remove the node while it is focused,
  // and a detached input gets no blur — flush the draft from the latest values instead.
  useEffect(() => () => {
    const { draft: d, name: n, onCommit: commitName } = latest.current
    const trimmed = d.trim()
    if (trimmed && trimmed !== n) void commitName(trimmed)
  }, [])

  // Strip closed from elsewhere (X, outside click, switching section): blurring commits.
  useEffect(() => {
    if (!open && document.activeElement === inputRef.current) inputRef.current?.blur()
  }, [open])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Keep keys away from the editor/app listeners (the window capture-phase accelerators
    // skip this field through OWN_KEYS_PROPS).
    e.stopPropagation()
    if (e.key === 'Enter') {
      e.preventDefault()
      inputRef.current?.blur()
      onClose()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      // First Escape discards the draft; with nothing to discard it closes the strip.
      if (draft !== name) setDraft(name)
      else { inputRef.current?.blur(); onClose() }
    }
  }

  return (
    <input
      ref={inputRef}
      {...OWN_KEYS_PROPS}
      type="text"
      value={draft}
      readOnly={readOnly}
      tabIndex={open ? 0 : -1}
      aria-label={label}
      title={readOnly ? undefined : label}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => { commit(); setFocused(false) }}
      onKeyDown={handleKeyDown}
      className={`flex-1 min-w-0 bg-transparent outline-none border-b border-transparent py-0.5
        text-[10px] font-mono tracking-wider text-text-muted/70 transition-colors
        ${focused ? 'normal-case' : 'uppercase'}
        ${readOnly
          ? 'cursor-default'
          : 'cursor-text hover:border-border hover:text-text-muted focus:border-text/30 focus:text-text'}`}
    />
  )
}
