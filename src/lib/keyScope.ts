// Fields that own their keystrokes (e.g. the section name in the editor's tab strip).
// The app accelerators (Ctrl+T/W/M/F/S/G…, Ctrl+Tab) are window capture-phase listeners,
// so they see the key before the field and its stopPropagation can't hold them back:
// they check this marker instead and step aside while the user types in such a field.
export const OWN_KEYS_PROPS = { 'data-own-keys': '' } as const

export function ownsKeys(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-own-keys]') !== null
}
