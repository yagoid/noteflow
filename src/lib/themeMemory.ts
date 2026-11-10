import { THEMES, DEFAULT_THEME_ID, LIGHT_THEME_ID, type Theme } from './themes'

// The sidebar footer's quick Light / Dark switch (Sidebar/SidebarFooterMenu.tsx) goes back to the
// LAST theme of each kind the user had, not to a fixed pair. themeStore keeps that memory
// (synced in ui-settings.json as lastDarkThemeId / lastLightThemeId) and folds every active theme
// into it through rememberTheme; this module is the pure part. The theme catalog is static
// (lib/themes.ts, no user themes), so a remembered id that is no longer in it (a theme removed
// in a later version, a hand-edited file) just falls back to the app's own theme of that kind.

export type ColorScheme = Theme['colorScheme']

/** Last theme id the user had of each kind (null = none remembered yet). */
export interface ThemeMemory {
  dark: string | null
  light: string | null
}

/** The app's own theme of each kind: the fallback when nothing valid is remembered. */
export const SCHEME_DEFAULT_THEME: Record<ColorScheme, string> = {
  dark: DEFAULT_THEME_ID,
  light: LIGHT_THEME_ID,
}

/**
 * Scheme of a theme id. An unknown id counts as dark: themeStore renders it as THEMES[0]
 * (NoteFlow Dark) too.
 */
export function themeScheme(id: string | null | undefined, themes: readonly Theme[] = THEMES): ColorScheme {
  return themes.find((t) => t.id === id)?.colorScheme ?? 'dark'
}

/**
 * Theme to apply for "Light" / "Dark": the remembered one when it still exists and is of that
 * kind, else the app's own theme of that kind.
 */
export function resolveSchemeTheme(
  scheme: ColorScheme,
  remembered: string | null | undefined,
  themes: readonly Theme[] = THEMES,
): string {
  const theme = themes.find((t) => t.id === remembered)
  return theme && theme.colorScheme === scheme ? theme.id : SCHEME_DEFAULT_THEME[scheme]
}

/**
 * Memory after `id` became the active theme: it becomes the last theme of its kind. Unknown ids
 * leave the memory as is. Returns the same object when nothing changes.
 */
export function rememberTheme(memory: ThemeMemory, id: string, themes: readonly Theme[] = THEMES): ThemeMemory {
  const theme = themes.find((t) => t.id === id)
  if (!theme || memory[theme.colorScheme] === id) return memory
  return { ...memory, [theme.colorScheme]: id }
}

/**
 * Memory read from storage: only ids of an existing theme of the matching kind survive (a light
 * id under `dark` is dropped, so the shown memory never lies about its kind).
 */
export function sanitizeThemeMemory(
  raw: { dark?: unknown; light?: unknown },
  themes: readonly Theme[] = THEMES,
): ThemeMemory {
  const pick = (scheme: ColorScheme, value: unknown): string | null =>
    typeof value === 'string' && themes.some((t) => t.id === value && t.colorScheme === scheme) ? value : null
  return { dark: pick('dark', raw.dark), light: pick('light', raw.light) }
}
