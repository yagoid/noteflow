import { create } from 'zustand'
import { isLowEndHardware } from '../lib/hardware'

// Mirrors the legacy flag BrainView already honoured: '1' forces the 2D fallback.
const FORCE_2D_KEY = 'noteflow:brain-force-2d'
// Set once the user has explicitly picked 2D/3D (either via Settings, the low-end
// prompt, or the legacy force-2D flag). Used to avoid re-nudging on weak machines.
const CHOSEN_KEY = 'noteflow:brain-3d-chosen'
// Set once the brain view has auto-opened the Local AI dialog (onboarding nudge shown once).
const LOCAL_AI_PROMPT_SEEN_KEY = 'noteflow:brain-local-ai-prompt-seen'

// Rough guess at a low-powered device. When the Electron preload exposes real
// hardware info, trust that (see isLowEndHardware). Otherwise fall back to the
// coarse renderer-only heuristic: few logical cores or little RAM. deviceMemory
// is coarse and capped by the browser (max ~8, rounded to a power of two), but
// it's good enough as a nudge to default to the lighter 2D render. Only trust
// truthy values so a 0/undefined reading from an unsupported API doesn't produce
// a false positive.
function isLowEndDevice(): boolean {
  const hw = window.noteflow?.hardware
  if (hw) return isLowEndHardware(hw)

  const cores = navigator.hardwareConcurrency
  const memory = (navigator as { deviceMemory?: number }).deviceMemory
  return (!!cores && cores <= 4) || (!!memory && memory <= 4)
}

const chosen = localStorage.getItem(CHOSEN_KEY) === '1' || localStorage.getItem(FORCE_2D_KEY) === '1'
const lowEnd = isLowEndDevice()
// Historic default: 3D unless the legacy force-2D flag is set.
const default3D = localStorage.getItem(FORCE_2D_KEY) !== '1'

interface BrainSettingsState {
  // true  → prefer the immersive 3D render (when WebGL is available)
  // false → always use the lighter 2D canvas
  prefer3D: boolean
  // Whether this machine looks low-powered (see isLowEndDevice).
  lowEnd: boolean
  // Show the one-time "we picked 2D for you" prompt offering to switch to 3D.
  showLowEndPrompt: boolean
  // Whether the brain view already auto-opened the Local AI dialog once.
  localAiPromptSeen: boolean
  setPrefer3D: (v: boolean) => void
  dismissLowEndPrompt: () => void
  markLocalAiPromptSeen: () => void
}

export const useBrainSettingsStore = create<BrainSettingsState>((set) => ({
  // On a low-end device that hasn't chosen yet, default to 2D; otherwise honour the historic default.
  prefer3D: chosen ? default3D : lowEnd ? false : default3D,
  lowEnd,
  showLowEndPrompt: lowEnd && !chosen,
  localAiPromptSeen: localStorage.getItem(LOCAL_AI_PROMPT_SEEN_KEY) === '1',

  setPrefer3D: (v) => {
    if (v) localStorage.removeItem(FORCE_2D_KEY)
    else localStorage.setItem(FORCE_2D_KEY, '1')
    localStorage.setItem(CHOSEN_KEY, '1')
    set({ prefer3D: v, showLowEndPrompt: false })
  },

  // Keep 2D and stop nudging. Persist the 2D preference (FORCE_2D_KEY) too, not just
  // the chosen flag — otherwise on the next launch default3D would recompute to true
  // and silently flip a "Keep 2D" user to 3D with no prompt to undo it.
  dismissLowEndPrompt: () => {
    localStorage.setItem(FORCE_2D_KEY, '1')
    localStorage.setItem(CHOSEN_KEY, '1')
    set({ showLowEndPrompt: false })
  },

  markLocalAiPromptSeen: () => {
    localStorage.setItem(LOCAL_AI_PROMPT_SEEN_KEY, '1')
    set({ localAiPromptSeen: true })
  },
}))
