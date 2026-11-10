import { create } from 'zustand'
import { THEMES, DEFAULT_THEME_ID, APP_FONTS, DEFAULT_APP_FONT } from '../lib/themes'
import type { Theme } from '../lib/themes'
import { THEME_TEXT_COLOR, resolveThemeColor } from '../lib/colorUtils'
import { rememberTheme, sanitizeThemeMemory, type ThemeMemory } from '../lib/themeMemory'
import type { UiSettings } from '../types'

// Appearance is SYNCED across devices via ui-settings.json in the notes dir
// (see src/types UiSettings and electron/uiSettings.ts). The sources below are
// the LEGACY per-device stores: they are still dual-written (so downgrading the
// app loses nothing) and used as fallback + one-time seed when the synced file
// doesn't have a key yet. The UI scale is per-device on purpose and stays in
// localStorage only.
const FONT_OVERRIDE_KEY = 'noteflow-font-override'
const ACCENT_OVERRIDE_KEY = 'noteflow-accent-override'
// Legacy key name: it used to hold only the h1/h2/h3 overrides and now holds every
// editor colour. We keep the old key (instead of migrating to a new one) because the
// parser is tolerant with missing entries, so the headings already customised by
// existing users survive the upgrade with no migration step.
const EDITOR_COLORS_KEY = 'noteflow-heading-overrides'
const UI_SCALE_KEY = 'noteflow-ui-scale'
// How the sidebar note rows show their sections — per device, like the UI scale.
const SIDEBAR_SECTIONS_KEY = 'noteflow-sidebar-sections'

// "r g b" triplet shape — mirror of RGB_TRIPLET in electron/uiSettings.ts (used
// to pre-validate the migration seed so it always survives main's sanitizer).
const RGB_TRIPLET = /^\d{1,3} \d{1,3} \d{1,3}$/

/** A stored colour main's sanitizer keeps: an "r g b" triplet or the theme-text sentinel. */
function isStoredColor(value: string): boolean {
  return value === THEME_TEXT_COLOR || RGB_TRIPLET.test(value)
}

export type EditorColorKey = 'h1' | 'h2' | 'h3' | 'italic' | 'inlineCode' | 'codeAccent'
/**
 * Per-element editor colour overrides as "r g b" triplets (or THEME_TEXT_COLOR = follow the
 * theme's `--text`), or null to follow the element's own theme var.
 */
export type EditorColorOverrides = Record<EditorColorKey, string | null>

const EMPTY_EDITOR_COLORS: EditorColorOverrides = {
  h1: null,
  h2: null,
  h3: null,
  italic: null,
  inlineCode: null,
  codeAccent: null,
}

// Each editor colour falls back to a theme var when not overridden (see index.css):
// h1 → --accent, h2 → --cyan, h3 → --text, italic → --purple, inlineCode → --red,
// codeAccent → --accent. `codeAccent` paints the left border of blockquotes (the name is
// historical: it used to be shared with the code block's left border, which code blocks
// no longer have; kept as is because it's the persisted settings key).
const EDITOR_COLOR_VARS: Record<EditorColorKey, string> = {
  h1: '--heading-1',
  h2: '--heading-2',
  h3: '--heading-3',
  italic: '--em-color',
  inlineCode: '--code-inline',
  codeAccent: '--code-accent',
}

const EDITOR_COLOR_KEYS = Object.keys(EDITOR_COLOR_VARS) as EditorColorKey[]

function parseEditorColors(raw: string | null): EditorColorOverrides {
  if (!raw) return { ...EMPTY_EDITOR_COLORS }
  try {
    const parsed = JSON.parse(raw) as Partial<EditorColorOverrides>
    const overrides = { ...EMPTY_EDITOR_COLORS }
    for (const key of EDITOR_COLOR_KEYS) {
      const value = parsed[key]
      if (typeof value === 'string') overrides[key] = value
    }
    return overrides
  } catch {
    return { ...EMPTY_EDITOR_COLORS }
  }
}

/** Synced ui-settings.json contents, or {} when the bridge is missing (tests). */
function readUiSettings(): UiSettings {
  try {
    return window.noteflow?.getUiSettings?.() ?? {}
  } catch {
    return {}
  }
}

function editorColorsFromUi(colors: NonNullable<UiSettings['editorColors']>): EditorColorOverrides {
  const overrides = { ...EMPTY_EDITOR_COLORS }
  for (const key of EDITOR_COLOR_KEYS) {
    const value = colors[key]
    if (typeof value === 'string') overrides[key] = value
  }
  return overrides
}

// Takes the theme because THEME_TEXT_COLOR resolves to ITS `--text` triple: re-run on every
// theme change so a "text" colour flips with it (light ink on dark themes and vice versa).
function applyEditorColors(overrides: EditorColorOverrides, theme: Theme) {
  const root = document.documentElement
  for (const key of EDITOR_COLOR_KEYS) {
    const value = overrides[key]
    if (value) root.style.setProperty(EDITOR_COLOR_VARS[key], resolveThemeColor(value, theme.vars['--text']))
    else root.style.removeProperty(EDITOR_COLOR_VARS[key])
  }
}

// Preset UI scale steps. Small 5% increments so bumping the size never jumps
// jarringly. Applied as the native page zoom (Electron webFrame) so the whole UI
// scales proportionally while viewport, scrolling and coordinates stay consistent.
/**
 * Sections of a sidebar note row: 'map' = folded line that unfolds into the section map
 * (default); 'row' = always-visible cells in one horizontal-scroll row.
 */
export type SidebarSectionsStyle = 'map' | 'row'

function readSidebarSectionsStyle(): SidebarSectionsStyle {
  try {
    return localStorage.getItem(SIDEBAR_SECTIONS_KEY) === 'row' ? 'row' : 'map'
  } catch {
    return 'map'
  }
}

export const UI_SCALES = [0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3]
export const DEFAULT_UI_SCALE = 1.0

function nearestScale(value: number): number {
  return UI_SCALES.reduce((best, s) => (Math.abs(s - value) < Math.abs(best - value) ? s : best), UI_SCALES[0])
}

// Native zoom, NOT a CSS `zoom` on <html>: under a root CSS zoom Chromium lays the
// app out at zoom × the window height and ProseMirror / scrollIntoView end up
// scrolling outer `overflow: hidden` ancestors (whole UI shifts, editor bottom
// unreachable). Always applied — including 1.0 — so a zoom level Chromium may
// have persisted for this origin can't win. With native zoom every DOM API
// (rects, clientX/Y, innerWidth, style.left/top) shares one CSS-px space.
function applyUiScale(scale: number) {
  window.noteflow?.setUiZoom?.(scale)
}

// A theme provides a base palette + its own app font + accent. On top of that the
// user can override the app font and the accent colour independently; those layer
// over whichever theme is active and persist across theme switches until cleared.
function applyTheme(theme: Theme, fontOverride: string | null, accentOverride: string | null) {
  const root = document.documentElement
  root.setAttribute('data-theme', theme.id)
  root.style.colorScheme = theme.colorScheme
  // Hook for scheme-wide CSS overrides (index.css remaps the fixed status tones
  // — yellow/amber/green — that are too pale on light surfaces).
  root.setAttribute('data-color-scheme', theme.colorScheme)
  for (const [prop, value] of Object.entries(theme.vars)) {
    root.style.setProperty(prop, value)
  }
  // App-level font (UI chrome) — user override, else the theme's own font.
  // hasOwnProperty guard: the override can arrive via sync (ui-settings.json is
  // shape-validated only, main doesn't know the font catalog), and a key like
  // "constructor" would otherwise resolve through the prototype chain.
  const fontId = fontOverride ?? theme.font
  const font = Object.prototype.hasOwnProperty.call(APP_FONTS, fontId)
    ? APP_FONTS[fontId]
    : APP_FONTS[DEFAULT_APP_FONT]
  root.style.setProperty('--app-font-family', font.stack)
  // Accent — user override (an "r g b" triplet, or THEME_TEXT_COLOR resolved to this
  // theme's `--text` triple so `--accent` always holds a real triple), else the theme's accent.
  root.style.setProperty(
    '--accent',
    accentOverride ? resolveThemeColor(accentOverride, theme.vars['--text']) : theme.vars['--accent'],
  )
}

interface ThemeState {
  activeThemeId: string
  /** APP_FONTS key chosen by the user, or null to follow the theme's own font. */
  fontOverride: string | null
  /**
   * Accent chosen by the user: an "r g b" triplet or THEME_TEXT_COLOR (follows the active
   * theme's `--text`, resolved in applyTheme), or null to follow the theme's accent.
   */
  accentOverride: string | null
  /** Per-element editor colour overrides ("r g b" triplets or THEME_TEXT_COLOR) layered over the theme. */
  editorColors: EditorColorOverrides
  /** UI zoom factor (one of UI_SCALES). */
  uiScale: number
  /** Sections of the sidebar note rows (local to this device, localStorage). */
  sidebarSectionsStyle: SidebarSectionsStyle
  /**
   * Last dark / light theme the user had, for the footer's quick Light / Dark switch
   * (lib/themeMemory.ts). Always includes the active theme (folded in on init, reload and
   * setTheme); synced as ui-settings.json lastDarkThemeId / lastLightThemeId, written by setTheme.
   */
  themeMemory: ThemeMemory
  initTheme: () => void
  /**
   * Re-reads ui-settings.json and re-applies it (idempotent, NEVER writes back
   * — no legacy fallback/seed either, to avoid write loops). Called after a
   * sync pull or when another window changes the appearance.
   */
  reloadUiSettings: () => void
  setTheme: (id: string) => void
  setFontOverride: (id: string | null) => void
  setAccentOverride: (rgb: string | null) => void
  setEditorColor: (key: EditorColorKey, rgb: string | null) => void
  resetEditorColors: () => void
  /** Step the UI scale up (+1) or down (-1) through the preset steps. */
  changeUiScale: (direction: 1 | -1) => void
  setSidebarSectionsStyle: (style: SidebarSectionsStyle) => void
}

function currentTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

/** Theme memory of the file (keys absent from it fall back to `fallback`) plus the active theme. */
function themeMemoryFromUi(ui: UiSettings, fallback: ThemeMemory, activeId: string): ThemeMemory {
  const fromFile = sanitizeThemeMemory({
    dark: 'lastDarkThemeId' in ui ? ui.lastDarkThemeId : fallback.dark,
    light: 'lastLightThemeId' in ui ? ui.lastLightThemeId : fallback.light,
  })
  return rememberTheme(fromFile, activeId)
}

const EMPTY_THEME_MEMORY: ThemeMemory = { dark: null, light: null }

export const useThemeStore = create<ThemeState>((set, get) => ({
  activeThemeId: DEFAULT_THEME_ID,
  fontOverride: null,
  accentOverride: null,
  editorColors: { ...EMPTY_EDITOR_COLORS },
  uiScale: DEFAULT_UI_SCALE,
  sidebarSectionsStyle: readSidebarSectionsStyle(),
  themeMemory: { dark: DEFAULT_THEME_ID, light: null },

  initTheme: () => {
    // Synced ui-settings.json wins; each key ABSENT from it falls back to the
    // legacy per-device sources (settings.json theme / localStorage overrides).
    // A key present-but-null means "override explicitly cleared" and must NOT
    // fall back (see UiSettings in src/types).
    const ui = readUiSettings()
    const legacyTheme = window.noteflow.getTheme()
    const legacyFont = localStorage.getItem(FONT_OVERRIDE_KEY)
    const legacyAccent = localStorage.getItem(ACCENT_OVERRIDE_KEY)
    const legacyColorsRaw = localStorage.getItem(EDITOR_COLORS_KEY)

    const theme = currentTheme(ui.theme ?? legacyTheme ?? DEFAULT_THEME_ID)
    const fontOverride = 'appFont' in ui ? ui.appFont ?? null : legacyFont
    const accentOverride = 'accent' in ui ? ui.accent ?? null : legacyAccent
    const editorColors = ui.editorColors
      ? editorColorsFromUi(ui.editorColors)
      : parseEditorColors(legacyColorsRaw)
    const storedScale = parseFloat(localStorage.getItem(UI_SCALE_KEY) ?? '')
    const uiScale = Number.isFinite(storedScale) ? nearestScale(storedScale) : DEFAULT_UI_SCALE
    applyTheme(theme, fontOverride, accentOverride)
    applyEditorColors(editorColors, theme)
    applyUiScale(uiScale)
    const themeMemory = themeMemoryFromUi(ui, EMPTY_THEME_MEMORY, theme.id)
    set({ activeThemeId: theme.id, fontOverride, accentOverride, editorColors, uiScale, themeMemory })

    // One-time migration seed: push the legacy values the synced file doesn't
    // know about yet. Only values that will SURVIVE main's sanitizer are sent
    // (theme/font checked against the catalogs, colours against the triplet
    // shape) — otherwise an invalid legacy value would be dropped server-side,
    // the key would never land in the file and the seed would re-fire (and
    // re-push) on every launch. Once written (or synced from another device)
    // the keys exist and this never fires again.
    const seed: UiSettings = {}
    if (!('theme' in ui) && legacyTheme && THEMES.some((t) => t.id === legacyTheme)) {
      seed.theme = legacyTheme
    }
    if (!('appFont' in ui) && legacyFont && Object.prototype.hasOwnProperty.call(APP_FONTS, legacyFont)) {
      seed.appFont = legacyFont
    }
    if (!('accent' in ui) && legacyAccent && isStoredColor(legacyAccent)) {
      seed.accent = legacyAccent
    }
    if (!ui.editorColors && legacyColorsRaw) {
      const legacyColors = parseEditorColors(legacyColorsRaw)
      const valid: Partial<Record<EditorColorKey, string>> = {}
      for (const k of EDITOR_COLOR_KEYS) {
        const v = legacyColors[k]
        if (v !== null && isStoredColor(v)) valid[k] = v
      }
      if (Object.keys(valid).length > 0) seed.editorColors = valid
    }
    if (Object.keys(seed).length > 0) void window.noteflow.setUiSettings?.(seed)
  },

  reloadUiSettings: () => {
    // Read-only path: keys absent from the file keep the current in-memory
    // value (no legacy fallback, no seed) so a pull can never trigger a write.
    const ui = readUiSettings()
    const state = get()
    const theme = currentTheme(ui.theme ?? state.activeThemeId)
    const fontOverride = 'appFont' in ui ? ui.appFont ?? null : state.fontOverride
    const accentOverride = 'accent' in ui ? ui.accent ?? null : state.accentOverride
    const editorColors = ui.editorColors ? editorColorsFromUi(ui.editorColors) : state.editorColors
    applyTheme(theme, fontOverride, accentOverride)
    applyEditorColors(editorColors, theme)
    // A theme synced from another device counts as the last of its kind here too (kept in
    // memory only: this path never writes; the next setTheme persists it).
    const themeMemory = themeMemoryFromUi(ui, state.themeMemory, theme.id)
    set({ activeThemeId: theme.id, fontOverride, accentOverride, editorColors, themeMemory })
  },

  setTheme: (id) => {
    const theme = THEMES.find((t) => t.id === id)
    if (!theme) return
    const { fontOverride, accentOverride, editorColors } = get()
    applyTheme(theme, fontOverride, accentOverride)
    // Re-resolve the editor colours too: a THEME_TEXT_COLOR one follows the new `--text`.
    applyEditorColors(editorColors, theme)
    window.noteflow.setTheme(id) // legacy dual-write (settings.json)
    // The memory already holds the outgoing theme (folded in when it became active), so writing
    // both kinds also persists one that only arrived through a reload.
    const themeMemory = rememberTheme(get().themeMemory, id)
    const patch: UiSettings = { theme: id }
    if (themeMemory.dark) patch.lastDarkThemeId = themeMemory.dark
    if (themeMemory.light) patch.lastLightThemeId = themeMemory.light
    void window.noteflow.setUiSettings?.(patch)
    set({ activeThemeId: id, themeMemory })
  },

  setFontOverride: (id) => {
    if (id) localStorage.setItem(FONT_OVERRIDE_KEY, id) // legacy dual-write
    else localStorage.removeItem(FONT_OVERRIDE_KEY)
    void window.noteflow.setUiSettings?.({ appFont: id })
    applyTheme(currentTheme(get().activeThemeId), id, get().accentOverride)
    set({ fontOverride: id })
  },

  setAccentOverride: (rgb) => {
    if (rgb) localStorage.setItem(ACCENT_OVERRIDE_KEY, rgb) // legacy dual-write
    else localStorage.removeItem(ACCENT_OVERRIDE_KEY)
    void window.noteflow.setUiSettings?.({ accent: rgb })
    applyTheme(currentTheme(get().activeThemeId), get().fontOverride, rgb)
    set({ accentOverride: rgb })
  },

  setEditorColor: (key, rgb) => {
    const next: EditorColorOverrides = { ...get().editorColors, [key]: rgb }
    // Legacy dual-write; drop the key entirely once every colour follows the theme again.
    if (EDITOR_COLOR_KEYS.every((k) => next[k] === null)) localStorage.removeItem(EDITOR_COLORS_KEY)
    else localStorage.setItem(EDITOR_COLORS_KEY, JSON.stringify(next))
    void window.noteflow.setUiSettings?.({ editorColors: { [key]: rgb } })
    applyEditorColors(next, currentTheme(get().activeThemeId))
    set({ editorColors: next })
  },

  resetEditorColors: () => {
    const next = { ...EMPTY_EDITOR_COLORS }
    localStorage.removeItem(EDITOR_COLORS_KEY)
    void window.noteflow.setUiSettings?.({ editorColors: { ...EMPTY_EDITOR_COLORS } })
    applyEditorColors(next, currentTheme(get().activeThemeId))
    set({ editorColors: next })
  },

  changeUiScale: (direction) => {
    const idx = UI_SCALES.indexOf(nearestScale(get().uiScale))
    const next = UI_SCALES[Math.max(0, Math.min(UI_SCALES.length - 1, idx + direction))]
    localStorage.setItem(UI_SCALE_KEY, String(next))
    applyUiScale(next)
    set({ uiScale: next })
  },

  setSidebarSectionsStyle: (style) => {
    if (style === 'row') localStorage.setItem(SIDEBAR_SECTIONS_KEY, 'row')
    else localStorage.removeItem(SIDEBAR_SECTIONS_KEY)
    set({ sidebarSectionsStyle: style })
  },
}))
