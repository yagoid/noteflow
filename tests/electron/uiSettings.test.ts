import { describe, it, expect } from 'vitest'
import { sanitizeUiSettings, mergeUiSettings, THEME_TEXT_COLOR as MAIN_THEME_TEXT_COLOR, type UiSettings } from '../../electron/uiSettings'
import { THEME_TEXT_COLOR } from '../../src/lib/colorUtils'

describe('sanitizeUiSettings (tolerant validation)', () => {
  it('degrades to {} for garbage input, never throws', () => {
    expect(sanitizeUiSettings(null)).toEqual({})
    expect(sanitizeUiSettings(undefined)).toEqual({})
    expect(sanitizeUiSettings(42)).toEqual({})
    expect(sanitizeUiSettings('carbon')).toEqual({})
    expect(sanitizeUiSettings([])).toEqual({})
    expect(sanitizeUiSettings({})).toEqual({})
  })

  it('accepts the full valid shape', () => {
    const input: UiSettings = {
      theme: 'carbon',
      lastDarkThemeId: 'carbon',
      lastLightThemeId: 'parchment',
      appFont: 'inter',
      accent: '129 140 248',
      editorColors: { h1: '255 0 0', h2: null },
      editor: { fontSize: 15, fontFamily: 'mono', readableWidth: false, showToc: false },
    }
    expect(sanitizeUiSettings(input)).toEqual(input)
  })

  it('drops invalid theme/appFont values (shape check only)', () => {
    expect(sanitizeUiSettings({ theme: '' })).toEqual({})
    expect(sanitizeUiSettings({ theme: '   ' })).toEqual({})
    expect(sanitizeUiSettings({ theme: 'x'.repeat(65) })).toEqual({})
    expect(sanitizeUiSettings({ theme: null })).toEqual({}) // theme can never be null
    expect(sanitizeUiSettings({ theme: 7 })).toEqual({})
    expect(sanitizeUiSettings({ appFont: 42 })).toEqual({})
  })

  it('validates lastDarkThemeId / lastLightThemeId by shape only, like theme (never null)', () => {
    expect(sanitizeUiSettings({ lastDarkThemeId: 'not-in-catalog' })).toEqual({ lastDarkThemeId: 'not-in-catalog' })
    expect(sanitizeUiSettings({ lastDarkThemeId: '', lastLightThemeId: '  ' })).toEqual({})
    expect(sanitizeUiSettings({ lastDarkThemeId: null, lastLightThemeId: null })).toEqual({})
    expect(sanitizeUiSettings({ lastLightThemeId: 7 })).toEqual({})
    expect(sanitizeUiSettings({ lastLightThemeId: 'x'.repeat(65) })).toEqual({})
  })

  it('keeps explicit nulls on override keys (cleared ≠ absent)', () => {
    expect(sanitizeUiSettings({ appFont: null })).toEqual({ appFont: null })
    expect(sanitizeUiSettings({ accent: null })).toEqual({ accent: null })
    expect(sanitizeUiSettings({ editorColors: { italic: null } })).toEqual({
      editorColors: { italic: null },
    })
  })

  it('rejects malformed rgb triplets', () => {
    expect(sanitizeUiSettings({ accent: 'rgb(1,2,3)' })).toEqual({})
    expect(sanitizeUiSettings({ accent: '1 2' })).toEqual({})
    expect(sanitizeUiSettings({ accent: '1 2 3 4' })).toEqual({})
    expect(sanitizeUiSettings({ accent: '1234 2 3' })).toEqual({})
    expect(sanitizeUiSettings({ accent: ' 1 2 3' })).toEqual({})
    expect(sanitizeUiSettings({ editorColors: { h1: '#ff0000' } })).toEqual({})
  })

  it('accepts the "text" sentinel (follow the theme text colour) on accent and editor colours', () => {
    // main's copy of the sentinel must match the renderer's (main can't import from src/).
    expect(MAIN_THEME_TEXT_COLOR).toBe(THEME_TEXT_COLOR)
    expect(sanitizeUiSettings({ accent: 'text' })).toEqual({ accent: 'text' })
    expect(sanitizeUiSettings({ editorColors: { h1: 'text', h2: '1 2 3' } })).toEqual({
      editorColors: { h1: 'text', h2: '1 2 3' },
    })
    // Only the exact sentinel: other words / casing / padding are still dropped.
    expect(sanitizeUiSettings({ accent: 'Text' })).toEqual({})
    expect(sanitizeUiSettings({ accent: ' text' })).toEqual({})
    expect(sanitizeUiSettings({ accent: '--text' })).toEqual({})
    expect(sanitizeUiSettings({ editorColors: { h1: 'accent' } })).toEqual({})
    // Not a value for the editor fields.
    expect(sanitizeUiSettings({ editor: { fontFamily: 'text' } })).toEqual({})
  })

  it('merges the "text" sentinel like any other override', () => {
    const current: UiSettings = { accent: '1 2 3', editorColors: { h1: '9 9 9' } }
    expect(mergeUiSettings(current, { accent: 'text' }).accent).toBe('text')
    expect(mergeUiSettings(current, { editorColors: { h2: 'text' } }).editorColors).toEqual({ h1: '9 9 9', h2: 'text' })
  })

  it('clamps and rounds fontSize to an integer in 10–24', () => {
    expect(sanitizeUiSettings({ editor: { fontSize: 5 } })).toEqual({ editor: { fontSize: 10 } })
    expect(sanitizeUiSettings({ editor: { fontSize: 99 } })).toEqual({ editor: { fontSize: 24 } })
    expect(sanitizeUiSettings({ editor: { fontSize: 13.6 } })).toEqual({ editor: { fontSize: 14 } })
    expect(sanitizeUiSettings({ editor: { fontSize: NaN } })).toEqual({})
    expect(sanitizeUiSettings({ editor: { fontSize: '13' } })).toEqual({})
  })

  it('drops invalid editor fields but keeps the valid siblings', () => {
    expect(
      sanitizeUiSettings({ editor: { fontFamily: 'comic-sans', readableWidth: true } })
    ).toEqual({ editor: { readableWidth: true } })
    expect(sanitizeUiSettings({ editor: { readableWidth: 'yes' } })).toEqual({})
    expect(sanitizeUiSettings({ editor: { showToc: 1 } })).toEqual({})
    expect(sanitizeUiSettings({ editor: { showToc: 'no', fontSize: 14 } })).toEqual({ editor: { fontSize: 14 } })
  })

  it('discards unknown keys everywhere', () => {
    expect(
      sanitizeUiSettings({
        theme: 'carbon',
        uiScale: 1.2,
        editorColors: { h1: '1 2 3', h9: '4 5 6' },
        editor: { fontSize: 13, tabSize: 2 },
        anything: { nested: true },
      })
    ).toEqual({
      theme: 'carbon',
      editorColors: { h1: '1 2 3' },
      editor: { fontSize: 13 },
    })
  })
})

describe('mergeUiSettings (partial patch over the file)', () => {
  const current: UiSettings = {
    theme: 'carbon',
    accent: '1 2 3',
    editorColors: { h1: '9 9 9', h2: '8 8 8' },
    editor: { fontSize: 13, fontFamily: 'inter', readableWidth: true },
  }

  it('leaves untouched the top-level keys absent from the patch', () => {
    expect(mergeUiSettings(current, { theme: 'paper' })).toEqual({ ...current, theme: 'paper' })
  })

  it('merges the last dark / light theme ids with the theme and keeps them on unrelated patches', () => {
    const withMemory = mergeUiSettings(current, { theme: 'paper', lastDarkThemeId: 'carbon', lastLightThemeId: 'paper' })
    expect(withMemory).toEqual({ ...current, theme: 'paper', lastDarkThemeId: 'carbon', lastLightThemeId: 'paper' })
    expect(mergeUiSettings(withMemory, { accent: null })).toMatchObject({ lastDarkThemeId: 'carbon', lastLightThemeId: 'paper' })
    expect(mergeUiSettings(withMemory, { lastDarkThemeId: null })).toEqual(withMemory)
  })

  it('merges editorColors and editor per key (stores own different slices)', () => {
    expect(mergeUiSettings(current, { editorColors: { h1: '0 0 0' } }).editorColors).toEqual({
      h1: '0 0 0',
      h2: '8 8 8',
    })
    expect(mergeUiSettings(current, { editor: { fontSize: 20 } }).editor).toEqual({
      fontSize: 20,
      fontFamily: 'inter',
      readableWidth: true,
    })
    expect(mergeUiSettings(current, { editor: { showToc: false } }).editor).toEqual({
      fontSize: 13,
      fontFamily: 'inter',
      readableWidth: true,
      showToc: false,
    })
  })

  it('applies explicit nulls (clearing an override survives the merge)', () => {
    expect(mergeUiSettings(current, { accent: null }).accent).toBeNull()
    expect(mergeUiSettings(current, { editorColors: { h2: null } }).editorColors).toEqual({
      h1: '9 9 9',
      h2: null,
    })
  })

  it('ignores invalid patch values without touching the current ones', () => {
    expect(mergeUiSettings(current, { theme: '', accent: 'nope', editor: { fontSize: 'x' } })).toEqual(current)
    expect(mergeUiSettings(current, 'garbage')).toEqual(current)
    expect(mergeUiSettings(current, null)).toEqual(current)
  })

  it('builds the file from scratch when nothing was written yet', () => {
    expect(mergeUiSettings({}, { editor: { readableWidth: false } })).toEqual({
      editor: { readableWidth: false },
    })
  })
})
