import { useCallback, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from 'react'

// When the hint card of a task's empty button shows (TaskHint.tsx): a moment
// after the pointer rests on the button, at once when the keyboard focuses it.
// It goes on leaving, on a press, on Escape, on a scroll (the card is fixed and
// would stay behind) and while `suppressed` (the button's menu is open).

/** How long the pointer rests on the button before the card shows. */
const HINT_DELAY_MS = 150

export interface TaskHintTriggerProps {
  onPointerEnter: (e: PointerEvent<HTMLElement>) => void
  onPointerLeave: () => void
  onPointerDown: () => void
  onFocus: (e: FocusEvent<HTMLElement>) => void
  onBlur: () => void
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void
}

export function useTaskHint(suppressed: boolean): { anchor: HTMLElement | null; triggerProps: TaskHintTriggerProps } {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const cancel = useCallback(() => {
    window.clearTimeout(timer.current)
    timer.current = undefined
  }, [])
  const hide = useCallback(() => {
    cancel()
    setAnchor(null)
  }, [cancel])

  useEffect(() => cancel, [cancel])

  const shown = suppressed ? null : anchor
  useEffect(() => {
    if (!shown) return
    const win = shown.ownerDocument.defaultView ?? window
    // Capture: the note editor stops the keydown's propagation (TaskPickers.tsx does the same).
    // Escape only hides the card: whatever else it does goes on.
    const onKeyDown = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') hide() }
    win.addEventListener('keydown', onKeyDown, true)
    win.addEventListener('scroll', hide, true)
    win.addEventListener('blur', hide)
    return () => {
      win.removeEventListener('keydown', onKeyDown, true)
      win.removeEventListener('scroll', hide, true)
      win.removeEventListener('blur', hide)
    }
  }, [shown, hide])

  const triggerProps: TaskHintTriggerProps = {
    onPointerEnter: (e) => {
      if (e.pointerType === 'touch') return
      const el = e.currentTarget
      cancel()
      timer.current = window.setTimeout(() => setAnchor(el), HINT_DELAY_MS)
    },
    onPointerLeave: hide,
    onPointerDown: hide,
    onFocus: (e) => {
      if (!e.currentTarget.matches(':focus-visible')) return
      cancel()
      setAnchor(e.currentTarget)
    },
    onBlur: hide,
    // Enter / Space press the button: the card goes like with a click.
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') hide() },
  }

  return { anchor: shown, triggerProps }
}
