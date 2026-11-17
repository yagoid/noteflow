import { useEffect } from 'react'
import { startNavHistory, useNavHistoryStore } from '../stores/navHistoryStore'
import { isMac } from '../lib/platform'
import { ownsKeys } from '../lib/keyScope'

// Mouse side buttons as Chromium numbers them (MouseEvent.button).
const MOUSE_BACK = 3
const MOUSE_FORWARD = 4

/**
 * Every window: the mouse's back / forward buttons never run Chromium's own history
 * navigation (it would leave the window's hash route, e.g. `#ai-chat`, or reload nothing
 * useful). Swallowed on mousedown, mouseup and auxclick, in the capture phase.
 */
export function useSwallowMouseHistoryButtons(): void {
  useEffect(() => {
    const swallow = (e: MouseEvent) => {
      if (e.button === MOUSE_BACK || e.button === MOUSE_FORWARD) e.preventDefault()
    }
    const types = ['mousedown', 'mouseup', 'auxclick'] as const
    for (const type of types) window.addEventListener(type, swallow, true)
    return () => { for (const type of types) window.removeEventListener(type, swallow, true) }
  }, [])
}

/** Back (-1) / forward (1) for a key chord, or 0. Alt+←/→ (Windows / Linux), ⌘[ / ⌘] (macOS). */
function keyDirection(e: KeyboardEvent): -1 | 0 | 1 {
  if (e.shiftKey || e.ctrlKey) return 0
  if (isMac) {
    // ⌥←/→ is the word jump on macOS: the chord there is ⌘[ / ⌘] (Safari, Finder…).
    if (!e.metaKey) return 0
    if (e.key === '[' || (!e.altKey && e.code === 'BracketLeft')) return -1
    if (e.key === ']' || (!e.altKey && e.code === 'BracketRight')) return 1
    return 0
  }
  if (!e.altKey || e.metaKey) return 0
  if (e.key === 'ArrowLeft') return -1
  if (e.key === 'ArrowRight') return 1
  return 0
}

/**
 * Main window: records where the app goes and steps back / forward with the mouse's side
 * buttons and the keyboard (stores/navHistoryStore.ts).
 */
export function useNavHistory(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    const stop = startNavHistory()
    const { back, forward } = useNavHistoryStore.getState()
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === MOUSE_BACK) back()
      else if (e.button === MOUSE_FORWARD) forward()
    }
    // Bubble phase and only when nobody handled the chord first: inside a table Alt+←/→
    // moves the column (TableKeymap prevents the default), and a field that owns its keys
    // keeps them.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || ownsKeys(e.target)) return
      const direction = keyDirection(e)
      if (direction === 0) return
      e.preventDefault()
      if (direction < 0) back()
      else forward()
    }
    // Capture phase: a pane / drag handle that stops its mouseup must not eat the buttons.
    window.addEventListener('mouseup', onMouseUp, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      stop()
      window.removeEventListener('mouseup', onMouseUp, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [enabled])
}
