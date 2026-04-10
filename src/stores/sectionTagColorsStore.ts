import { create } from 'zustand'
import { normalizeTagColorKey, TAG_COLOR_VARS } from '../lib/tagColors'
import type { GroupColor } from '../types'

const ALLOWED_COLORS = new Set<GroupColor>(TAG_COLOR_VARS)

export type SectionTagColorMap = Record<string, GroupColor>

function sanitizeSectionTagColors(raw: unknown): SectionTagColorMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

  const next: SectionTagColorMap = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const normalizedKey = normalizeTagColorKey(key)
    if (!normalizedKey || typeof value !== 'string') continue
    if (!ALLOWED_COLORS.has(value as GroupColor)) continue
    next[normalizedKey] = value as GroupColor
  }
  return next
}

interface SectionTagColorsState {
  sectionTagColors: SectionTagColorMap
  loadSectionTagColors: () => Promise<void>
  setSectionTagColor: (sectionName: string, color: GroupColor) => Promise<void>
  clearSectionTagColor: (sectionName: string) => Promise<void>
}

export const useSectionTagColorsStore = create<SectionTagColorsState>((set, get) => ({
  sectionTagColors: {},

  loadSectionTagColors: async () => {
    const raw = await window.noteflow.getSectionTagColors()
    set({ sectionTagColors: sanitizeSectionTagColors(raw) })
  },

  setSectionTagColor: async (sectionName, color) => {
    const key = normalizeTagColorKey(sectionName)
    if (!key || !ALLOWED_COLORS.has(color)) return

    const next = { ...get().sectionTagColors, [key]: color }
    set({ sectionTagColors: next })
    await window.noteflow.setSectionTagColors(next)
  },

  clearSectionTagColor: async (sectionName) => {
    const key = normalizeTagColorKey(sectionName)
    if (!key) return

    const current = get().sectionTagColors
    if (!(key in current)) return

    const next = { ...current }
    delete next[key]
    set({ sectionTagColors: next })
    await window.noteflow.setSectionTagColors(next)
  },
}))
