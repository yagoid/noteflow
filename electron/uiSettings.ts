// Pure sanitize/merge logic for ui-settings.json — the root-level file of the
// notes dir that syncs appearance (theme, app font, accent, editor colours) and
// editor settings (font size/family, readable width, floating TOC) across devices. Lives in
// electron/ but imports nothing from Electron (same pure-module pattern as
// syncState.ts / cloudSyncLogic.ts). Covered by tests/electron/uiSettings.test.ts.
//
// MIRRORED in noteflow-mobile (src/core/uiSettings.ts). Its sanitizer also drops
// unknown keys and the mobile re-sanitizes the file before every write, so a
// field added here and not ported there is erased whenever the phone saves its
// appearance (e.g. an accent change). Port every new field to the mirror.
//
// Tri-state semantics for override keys (appFont, accent, editorColors.*):
//   - key ABSENT   → never written on any device; readers fall back to their
//     legacy local sources (localStorage / settings.json) and may seed the file.
//   - key === null → the user explicitly cleared the override ("follow the
//     theme"); readers must NOT fall back to legacy values. Nulls are therefore
//     kept in the stored JSON on purpose.
//   - key === "r g b" / string → the override value.
// `theme` and the `editor` fields always hold concrete values, so null is not
// accepted for them (invalid values are silently dropped, like
// sanitizeSectionColors does).
//
// `ui-settings:set` receives a PARTIAL patch that main merges over what is on
// disk (shallow per top-level key; per-key for editorColors/editor), so the two
// renderer stores that own different slices (themeStore → appearance,
// editorSettingsStore → editor) never clobber each other.

export type UiEditorColorKey = 'h1' | 'h2' | 'h3' | 'italic' | 'inlineCode' | 'codeAccent'

export const UI_EDITOR_COLOR_KEYS: readonly UiEditorColorKey[] = [
  'h1',
  'h2',
  'h3',
  'italic',
  'inlineCode',
  'codeAccent',
]

export interface UiSettings {
  /** Theme id (validated by shape only — main knows nothing of the theme catalog). */
  theme?: string
  /** APP_FONTS key override, or null to follow the theme's own font. */
  appFont?: string | null
  /** Accent as an "r g b" triplet, or null to follow the theme. */
  accent?: string | null
  /** Per-element editor colour overrides ("r g b" triplets, null = follow theme). */
  editorColors?: Partial<Record<UiEditorColorKey, string | null>>
  editor?: {
    /** Editor font size in px, integer clamped to 10–24. */
    fontSize?: number
    fontFamily?: 'inter' | 'mono'
    readableWidth?: boolean
    /** Floating table of contents in the note editor (absent = shown). */
    showToc?: boolean
  }
}

const RGB_TRIPLET = /^\d{1,3} \d{1,3} \d{1,3}$/

export const UI_FONT_SIZE_MIN = 10
export const UI_FONT_SIZE_MAX = 24

function isShortString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 64
}

function isTriplet(value: unknown): value is string {
  return typeof value === 'string' && RGB_TRIPLET.test(value)
}

function clampFontSize(value: number): number {
  return Math.min(UI_FONT_SIZE_MAX, Math.max(UI_FONT_SIZE_MIN, Math.round(value)))
}

/**
 * Validates an unknown payload (file contents or IPC patch) into a UiSettings
 * object. Invalid values and unknown keys are silently dropped; explicit nulls
 * on override keys survive (see tri-state semantics above). Never throws.
 */
export function sanitizeUiSettings(raw: unknown): UiSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const input = raw as Record<string, unknown>
  const out: UiSettings = {}

  if (isShortString(input.theme)) out.theme = input.theme

  if (input.appFont === null) out.appFont = null
  else if (isShortString(input.appFont)) out.appFont = input.appFont

  if (input.accent === null) out.accent = null
  else if (isTriplet(input.accent)) out.accent = input.accent

  const colors = input.editorColors
  if (colors && typeof colors === 'object' && !Array.isArray(colors)) {
    const cleaned: Partial<Record<UiEditorColorKey, string | null>> = {}
    let hasAny = false
    for (const key of UI_EDITOR_COLOR_KEYS) {
      const value = (colors as Record<string, unknown>)[key]
      if (value === null) {
        cleaned[key] = null
        hasAny = true
      } else if (isTriplet(value)) {
        cleaned[key] = value
        hasAny = true
      }
    }
    if (hasAny) out.editorColors = cleaned
  }

  const editor = input.editor
  if (editor && typeof editor === 'object' && !Array.isArray(editor)) {
    const ed = editor as Record<string, unknown>
    const cleaned: NonNullable<UiSettings['editor']> = {}
    let hasAny = false
    if (typeof ed.fontSize === 'number' && Number.isFinite(ed.fontSize)) {
      cleaned.fontSize = clampFontSize(ed.fontSize)
      hasAny = true
    }
    if (ed.fontFamily === 'inter' || ed.fontFamily === 'mono') {
      cleaned.fontFamily = ed.fontFamily
      hasAny = true
    }
    if (typeof ed.readableWidth === 'boolean') {
      cleaned.readableWidth = ed.readableWidth
      hasAny = true
    }
    if (typeof ed.showToc === 'boolean') {
      cleaned.showToc = ed.showToc
      hasAny = true
    }
    if (hasAny) out.editor = cleaned
  }

  return out
}

/**
 * Merges a raw partial patch (sanitized first) over the current settings.
 * Top-level keys absent from the patch stay untouched; `editorColors` and
 * `editor` merge per key so different stores can update their own slice.
 */
export function mergeUiSettings(current: UiSettings, patch: unknown): UiSettings {
  const clean = sanitizeUiSettings(patch)
  const merged: UiSettings = { ...current }

  if ('theme' in clean) merged.theme = clean.theme
  if ('appFont' in clean) merged.appFont = clean.appFont
  if ('accent' in clean) merged.accent = clean.accent
  if (clean.editorColors) {
    merged.editorColors = { ...current.editorColors, ...clean.editorColors }
  }
  if (clean.editor) {
    merged.editor = { ...current.editor, ...clean.editor }
  }

  return merged
}
