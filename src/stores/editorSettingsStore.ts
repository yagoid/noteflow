import { create } from 'zustand'
import type { UiSettings } from '../types'

// Editor settings are SYNCED across devices via the `editor` slice of
// ui-settings.json in the notes dir (see src/types UiSettings and
// electron/uiSettings.ts). The localStorage keys below are the LEGACY
// per-device store: still dual-written (downgrade-safe) and used as fallback +
// one-time seed when the synced file doesn't have the `editor` key yet.
const STORAGE_KEY = 'noteflow-font-size'
const DEFAULT_SIZE = 13

const FONT_FAMILY_KEY = 'noteflow-font-family'
const DEFAULT_FONT = 'inter' as const
type FontFamily = 'mono' | 'inter'

const READABLE_WIDTH_KEY = 'noteflow-readable-width'

// Floating table of contents (EditorToc). Added after the synced file existed,
// so it has no legacy localStorage key: absent from the file = default (on).
const DEFAULT_SHOW_TOC = true

function clampSize(size: number): number {
  return Math.min(24, Math.max(10, Math.round(size)))
}

/** Synced ui-settings.json contents, or {} when the bridge is missing (tests). */
function readUiSettings(): UiSettings {
  try {
    return window.noteflow?.getUiSettings?.() ?? {}
  } catch {
    return {}
  }
}

interface EditorSettingsState {
  fontSize: number
  setFontSize: (size: number) => void
  changeFontSize: (delta: number) => void
  resetFontSize: () => void
  fontFamily: FontFamily
  setFontFamily: (f: FontFamily) => void
  readableWidth: boolean
  setReadableWidth: (v: boolean) => void
  showToc: boolean
  setShowToc: (v: boolean) => void
  /**
   * Re-reads the `editor` slice of ui-settings.json and re-applies it
   * (idempotent, NEVER writes back). Called after a sync pull or when another
   * window changes the settings.
   */
  reloadUiSettings: () => void
}

// Initial values: the synced file wins field by field; fields it doesn't have
// fall back to the legacy localStorage keys. If legacy had anything the file
// lacks, seed it once so it starts syncing (mirrors themeStore.initTheme).
function readInitial(): { fontSize: number; fontFamily: FontFamily; readableWidth: boolean; showToc: boolean } {
  const ed = readUiSettings().editor ?? {}
  const legacySize = localStorage.getItem(STORAGE_KEY)
  const legacyFamily = localStorage.getItem(FONT_FAMILY_KEY) as FontFamily | null
  const legacyWidth = localStorage.getItem(READABLE_WIDTH_KEY)

  const fontSize =
    typeof ed.fontSize === 'number' ? clampSize(ed.fontSize) : parseInt(legacySize ?? String(DEFAULT_SIZE))
  const fontFamily = ed.fontFamily ?? legacyFamily ?? DEFAULT_FONT
  const readableWidth = typeof ed.readableWidth === 'boolean' ? ed.readableWidth : legacyWidth !== '0'
  const showToc = typeof ed.showToc === 'boolean' ? ed.showToc : DEFAULT_SHOW_TOC

  // Seed only values that will SURVIVE main's sanitizer (finite size, known
  // family) — an invalid legacy value would be dropped on write, the field
  // would never land in the file and the seed would re-fire on every launch.
  const seed: NonNullable<UiSettings['editor']> = {}
  if (ed.fontSize === undefined && legacySize !== null && Number.isFinite(fontSize)) seed.fontSize = fontSize
  if (ed.fontFamily === undefined && (legacyFamily === 'inter' || legacyFamily === 'mono')) seed.fontFamily = legacyFamily
  if (ed.readableWidth === undefined && legacyWidth !== null) seed.readableWidth = readableWidth
  if (Object.keys(seed).length > 0) void window.noteflow?.setUiSettings?.({ editor: seed })

  return { fontSize, fontFamily, readableWidth, showToc }
}

const initial = readInitial()

export const useEditorSettingsStore = create<EditorSettingsState>((set, get) => ({
  fontSize: initial.fontSize,

  setFontSize: (size) => {
    const clamped = clampSize(size)
    localStorage.setItem(STORAGE_KEY, String(clamped)) // legacy dual-write
    void window.noteflow?.setUiSettings?.({ editor: { fontSize: clamped } })
    set({ fontSize: clamped })
  },

  changeFontSize: (delta) => get().setFontSize(get().fontSize + delta),

  resetFontSize: () => get().setFontSize(DEFAULT_SIZE),

  fontFamily: initial.fontFamily,

  setFontFamily: (f) => {
    localStorage.setItem(FONT_FAMILY_KEY, f) // legacy dual-write
    void window.noteflow?.setUiSettings?.({ editor: { fontFamily: f } })
    set({ fontFamily: f })
  },

  readableWidth: initial.readableWidth,

  setReadableWidth: (v) => {
    localStorage.setItem(READABLE_WIDTH_KEY, v ? '1' : '0') // legacy dual-write
    void window.noteflow?.setUiSettings?.({ editor: { readableWidth: v } })
    set({ readableWidth: v })
  },

  showToc: initial.showToc,

  setShowToc: (v) => {
    void window.noteflow?.setUiSettings?.({ editor: { showToc: v } })
    set({ showToc: v })
  },

  reloadUiSettings: () => {
    // Read-only path: fields absent from the file keep the current in-memory
    // value (no legacy fallback, no seed) so a pull can never trigger a write.
    const ed = readUiSettings().editor
    if (!ed) return
    const patch: Partial<Pick<EditorSettingsState, 'fontSize' | 'fontFamily' | 'readableWidth' | 'showToc'>> = {}
    if (typeof ed.fontSize === 'number') patch.fontSize = clampSize(ed.fontSize)
    if (ed.fontFamily) patch.fontFamily = ed.fontFamily
    if (typeof ed.readableWidth === 'boolean') patch.readableWidth = ed.readableWidth
    if (typeof ed.showToc === 'boolean') patch.showToc = ed.showToc
    set(patch)
  },
}))
