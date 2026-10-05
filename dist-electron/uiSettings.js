"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.UI_FONT_SIZE_MAX = exports.UI_FONT_SIZE_MIN = exports.UI_EDITOR_COLOR_KEYS = void 0;
exports.sanitizeUiSettings = sanitizeUiSettings;
exports.mergeUiSettings = mergeUiSettings;
exports.UI_EDITOR_COLOR_KEYS = [
    'h1',
    'h2',
    'h3',
    'italic',
    'inlineCode',
    'codeAccent',
];
const RGB_TRIPLET = /^\d{1,3} \d{1,3} \d{1,3}$/;
exports.UI_FONT_SIZE_MIN = 10;
exports.UI_FONT_SIZE_MAX = 24;
function isShortString(value) {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= 64;
}
function isTriplet(value) {
    return typeof value === 'string' && RGB_TRIPLET.test(value);
}
function clampFontSize(value) {
    return Math.min(exports.UI_FONT_SIZE_MAX, Math.max(exports.UI_FONT_SIZE_MIN, Math.round(value)));
}
/**
 * Validates an unknown payload (file contents or IPC patch) into a UiSettings
 * object. Invalid values and unknown keys are silently dropped; explicit nulls
 * on override keys survive (see tri-state semantics above). Never throws.
 */
function sanitizeUiSettings(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return {};
    const input = raw;
    const out = {};
    if (isShortString(input.theme))
        out.theme = input.theme;
    if (input.appFont === null)
        out.appFont = null;
    else if (isShortString(input.appFont))
        out.appFont = input.appFont;
    if (input.accent === null)
        out.accent = null;
    else if (isTriplet(input.accent))
        out.accent = input.accent;
    const colors = input.editorColors;
    if (colors && typeof colors === 'object' && !Array.isArray(colors)) {
        const cleaned = {};
        let hasAny = false;
        for (const key of exports.UI_EDITOR_COLOR_KEYS) {
            const value = colors[key];
            if (value === null) {
                cleaned[key] = null;
                hasAny = true;
            }
            else if (isTriplet(value)) {
                cleaned[key] = value;
                hasAny = true;
            }
        }
        if (hasAny)
            out.editorColors = cleaned;
    }
    const editor = input.editor;
    if (editor && typeof editor === 'object' && !Array.isArray(editor)) {
        const ed = editor;
        const cleaned = {};
        let hasAny = false;
        if (typeof ed.fontSize === 'number' && Number.isFinite(ed.fontSize)) {
            cleaned.fontSize = clampFontSize(ed.fontSize);
            hasAny = true;
        }
        if (ed.fontFamily === 'inter' || ed.fontFamily === 'mono') {
            cleaned.fontFamily = ed.fontFamily;
            hasAny = true;
        }
        if (typeof ed.readableWidth === 'boolean') {
            cleaned.readableWidth = ed.readableWidth;
            hasAny = true;
        }
        if (typeof ed.showToc === 'boolean') {
            cleaned.showToc = ed.showToc;
            hasAny = true;
        }
        if (hasAny)
            out.editor = cleaned;
    }
    return out;
}
/**
 * Merges a raw partial patch (sanitized first) over the current settings.
 * Top-level keys absent from the patch stay untouched; `editorColors` and
 * `editor` merge per key so different stores can update their own slice.
 */
function mergeUiSettings(current, patch) {
    const clean = sanitizeUiSettings(patch);
    const merged = { ...current };
    if ('theme' in clean)
        merged.theme = clean.theme;
    if ('appFont' in clean)
        merged.appFont = clean.appFont;
    if ('accent' in clean)
        merged.accent = clean.accent;
    if (clean.editorColors) {
        merged.editorColors = { ...current.editorColors, ...clean.editorColors };
    }
    if (clean.editor) {
        merged.editor = { ...current.editor, ...clean.editor };
    }
    return merged;
}
