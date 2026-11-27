// Stand-in for src/stores/themeStore: BrainScene only reads `activeThemeId` to know when to re-read the palette.
import { useSyncExternalStore } from 'react'
let state = { activeThemeId: 'noteflow-dark' }
const subs = new Set()
export const setThemeId = (id) => { state = { activeThemeId: id }; subs.forEach((f) => f()) }
export function useThemeStore(sel) {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => sel(state))
}
