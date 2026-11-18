// Fields that own their keystrokes (e.g. the inline rename input of an editor section tab).
// The app accelerators (Ctrl+T/W/M/F/S/G…, Ctrl+Tab) are window capture-phase listeners,
// so they see the key before the field and its stopPropagation can't hold them back:
// they check this marker instead and step aside while the user types in such a field.
export const OWN_KEYS_PROPS = { 'data-own-keys': '' } as const

// A full-window surface that owns EVERY keystroke while it is open (the drawing overlay:
// its canvas has shortcuts of its own on most of the app's accelerators). The marker above
// only covers events that come from inside the element; with the focus on <body> — after a
// blur, a click on a canvas that doesn't take focus — the accelerators would act on the app
// behind it. While at least one claim is held, ownsKeys() is true for any target.
let keyClaims = 0

/** Claim every keystroke of the window until the returned function is called. */
export function claimKeys(): () => void {
  keyClaims++
  let released = false
  return () => {
    if (released) return
    released = true
    keyClaims--
  }
}

export function ownsKeys(target: EventTarget | null): boolean {
  if (keyClaims > 0) return true
  return target instanceof Element && target.closest('[data-own-keys]') !== null
}
