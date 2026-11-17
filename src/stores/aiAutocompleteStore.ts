import { create } from 'zustand'
import type { AiAutocompleteStatus } from '../types'

// Inline AI autocomplete (ghost text in the editor): the local switch, whether the account's
// NoteFlow AI plan is usable, and main's "don't ask before…" answer. The switch lives in the
// LOCAL settings (settings.json → aiAutocomplete, a per-device privacy choice); main owns it
// and pushes every change (`ai:autocomplete-changed`: the toggle in Settings → AI, from any
// window, and account/plan changes), so turning it on or off applies to the open editors at
// once. Loaded lazily by the first editor in the window (AiGhostText) or by Settings → AI.

interface AiAutocompleteState extends AiAutocompleteStatus {
  loaded: boolean
  /** No requests before this (epoch ms; Infinity = not in this session). Set from main's answers. */
  blockedUntil: number

  /** First call loads + subscribes to main's changes; later calls are no-ops. */
  ensureLoaded: () => Promise<void>
  setEnabled: (enabled: boolean) => Promise<void>
  blockUntil: (retryAt: number) => void
}

let loadPromise: Promise<void> | null = null

export const useAiAutocompleteStore = create<AiAutocompleteState>((set) => ({
  loaded: false,
  enabled: false,
  available: false,
  blockedUntil: 0,

  ensureLoaded: () => {
    if (loadPromise) return loadPromise
    // A change means a new switch / account state: main is the judge of any block again
    // (it answers at once, with a fresh retryAt, if the block still stands).
    window.noteflow.onAiAutocompleteChanged((status) => set({ ...status, loaded: true, blockedUntil: 0 }))
    loadPromise = window.noteflow.aiAutocompleteGet()
      .then((status) => set({ ...status, loaded: true }))
      .catch((err) => {
        console.error('Failed to load the AI autocomplete setting:', err)
        set({ loaded: true })
      })
    return loadPromise
  },

  setEnabled: async (enabled) => {
    const status = await window.noteflow.aiAutocompleteSet(enabled)
    set({ ...status, loaded: true, blockedUntil: 0 })
  },

  blockUntil: (retryAt) => set({ blockedUntil: retryAt }),
}))
