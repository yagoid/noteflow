import { create } from 'zustand'
import { THEMES, DEFAULT_THEME_ID } from '../lib/themes'
import type { Theme } from '../lib/themes'

const STORAGE_KEY = 'noteflow-theme'

function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.setAttribute('data-theme', theme.id)
  root.style.colorScheme = theme.colorScheme
  for (const [prop, value] of Object.entries(theme.vars)) {
    root.style.setProperty(prop, value)
  }
}

interface ThemeState {
  activeThemeId: string
  initTheme: () => void
  setTheme: (id: string) => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  activeThemeId: DEFAULT_THEME_ID,

  initTheme: () => {
    const saved = localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME_ID
    const theme = THEMES.find((t) => t.id === saved) ?? THEMES[0]
    applyTheme(theme)
    set({ activeThemeId: theme.id })
  },

  setTheme: (id: string) => {
    const theme = THEMES.find((t) => t.id === id)
    if (!theme) return
    applyTheme(theme)
    localStorage.setItem(STORAGE_KEY, id)
    set({ activeThemeId: id })
  },
}))
