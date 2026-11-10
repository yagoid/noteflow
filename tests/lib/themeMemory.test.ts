import { describe, it, expect } from 'vitest'
import {
  SCHEME_DEFAULT_THEME,
  rememberTheme,
  resolveSchemeTheme,
  sanitizeThemeMemory,
  themeScheme,
  type ThemeMemory,
} from '../../src/lib/themeMemory'
import { THEMES, DEFAULT_THEME_ID, LIGHT_THEME_ID } from '../../src/lib/themes'

const EMPTY: ThemeMemory = { dark: null, light: null }

describe('the real theme catalog', () => {
  it('has the defaults of each kind with the matching scheme', () => {
    expect(SCHEME_DEFAULT_THEME).toEqual({ dark: DEFAULT_THEME_ID, light: LIGHT_THEME_ID })
    expect(themeScheme(DEFAULT_THEME_ID)).toBe('dark')
    expect(themeScheme(LIGHT_THEME_ID)).toBe('light')
    expect(THEMES.some((t) => t.id === 'tokyo-night' && t.colorScheme === 'dark')).toBe(true)
    expect(THEMES.some((t) => t.id === 'parchment' && t.colorScheme === 'light')).toBe(true)
  })
})

describe('themeScheme', () => {
  it('reads the colorScheme of the theme', () => {
    expect(themeScheme('tokyo-night')).toBe('dark')
    expect(themeScheme('arctic-day')).toBe('light')
  })

  it('counts an unknown or missing id as dark (rendered as THEMES[0])', () => {
    expect(THEMES[0].colorScheme).toBe('dark')
    expect(themeScheme('deleted-theme')).toBe('dark')
    expect(themeScheme(null)).toBe('dark')
    expect(themeScheme(undefined)).toBe('dark')
  })
})

describe('resolveSchemeTheme', () => {
  it('returns the remembered theme when it exists and is of that kind', () => {
    expect(resolveSchemeTheme('dark', 'dracula')).toBe('dracula')
    expect(resolveSchemeTheme('light', 'parchment')).toBe('parchment')
  })

  it('falls back to the app theme of that kind when nothing is remembered', () => {
    expect(resolveSchemeTheme('dark', null)).toBe(DEFAULT_THEME_ID)
    expect(resolveSchemeTheme('light', undefined)).toBe(LIGHT_THEME_ID)
  })

  it('falls back when the remembered id no longer exists', () => {
    expect(resolveSchemeTheme('dark', 'removed-theme')).toBe(DEFAULT_THEME_ID)
    expect(resolveSchemeTheme('light', '')).toBe(LIGHT_THEME_ID)
  })

  it('never applies a theme of the other kind', () => {
    expect(resolveSchemeTheme('dark', 'parchment')).toBe(DEFAULT_THEME_ID)
    expect(resolveSchemeTheme('light', 'carbon')).toBe(LIGHT_THEME_ID)
  })
})

describe('rememberTheme', () => {
  it('stores the theme under its own kind and leaves the other one', () => {
    expect(rememberTheme(EMPTY, 'carbon')).toEqual({ dark: 'carbon', light: null })
    expect(rememberTheme({ dark: 'carbon', light: null }, 'arctic-day')).toEqual({ dark: 'carbon', light: 'arctic-day' })
    expect(rememberTheme({ dark: 'carbon', light: 'arctic-day' }, 'synthwave')).toEqual({
      dark: 'synthwave',
      light: 'arctic-day',
    })
  })

  it('ignores unknown ids', () => {
    const memory = { dark: 'carbon', light: 'parchment' }
    expect(rememberTheme(memory, 'removed-theme')).toBe(memory)
  })

  it('returns the same object when the theme is already remembered', () => {
    const memory = { dark: 'carbon', light: null }
    expect(rememberTheme(memory, 'carbon')).toBe(memory)
  })

  it('round-trips through resolveSchemeTheme (Dark goes back to the last dark theme)', () => {
    let memory = rememberTheme(EMPTY, 'tokyo-night')
    memory = rememberTheme(memory, LIGHT_THEME_ID)
    expect(resolveSchemeTheme('dark', memory.dark)).toBe('tokyo-night')
    expect(resolveSchemeTheme('light', memory.light)).toBe(LIGHT_THEME_ID)
  })
})

describe('sanitizeThemeMemory', () => {
  it('keeps ids of existing themes of the matching kind', () => {
    expect(sanitizeThemeMemory({ dark: 'gruvbox-dark', light: 'parchment' })).toEqual({
      dark: 'gruvbox-dark',
      light: 'parchment',
    })
  })

  it('drops unknown ids, ids of the other kind and non-strings', () => {
    expect(sanitizeThemeMemory({ dark: 'parchment', light: 'carbon' })).toEqual(EMPTY)
    expect(sanitizeThemeMemory({ dark: 'nope', light: 42 })).toEqual(EMPTY)
    expect(sanitizeThemeMemory({ dark: null })).toEqual(EMPTY)
    expect(sanitizeThemeMemory({})).toEqual(EMPTY)
  })
})
