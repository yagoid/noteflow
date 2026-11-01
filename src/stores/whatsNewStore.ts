import { create } from 'zustand'
import { WHATS_NEW_SLIDES } from '../components/WhatsNew/whatsNewSlides'
import { mergeSeenIds, planFullTour, planStartupTour, sanitizeSeenIds, type TourMode } from '../lib/whatsNew'

// "What's new" tour state for the MAIN window (never sticky / section windows).
// `seen` mirrors settings.json → whatsNewSeen (local to the device, via IPC).

export interface OpenTour {
  /** Unique per opening: keys the modal (a reopen always starts fresh) and guards closeTour. */
  seq: number
  slideIds: string[]
  /** Slide shown when the tour opens. */
  startIndex: number
  /** 'discover' / 'new' = startup popup; 'replay' = opened by hand (Settings, palette). */
  mode: TourMode | 'replay'
}

interface WhatsNewState {
  seen: string[]
  loaded: boolean
  /** NOTEFLOW_DISABLE_WHATS_NEW=1 — no startup popup (the tour still opens by hand). */
  autoDisabled: boolean
  tour: OpenTour | null
  load: () => Promise<void>
  markSeen: (ids: string[]) => void
  /** Startup popup: opens the unseen slides, if any. Returns whether it opened. */
  openStartupTour: () => boolean
  /** Full deck, optionally starting at one slide (Settings → Tutorial, command palette). */
  openFullTour: (startId?: string) => void
  /** Closes the tour with that `seq` — a no-op if another one was opened meanwhile. */
  closeTour: (seq: number) => void
}

let nextSeq = 1

export const useWhatsNewStore = create<WhatsNewState>((set, get) => ({
  seen: [],
  loaded: false,
  autoDisabled: false,
  tour: null,

  load: async () => {
    try {
      const res = await window.noteflow.getWhatsNewSeen()
      set({ seen: mergeSeenIds(get().seen, res.seen), autoDisabled: res.disabled, loaded: true })
    } catch {
      // Without the list we can't tell old users from new ones: stay quiet this launch.
      set({ loaded: true, autoDisabled: true })
    }
  },

  markSeen: (ids) => {
    const clean = sanitizeSeenIds(ids)
    if (clean.every((id) => get().seen.includes(id))) return
    // Optimistic: the "New" badges update at once; main answers with the stored union.
    set({ seen: mergeSeenIds(get().seen, clean) })
    window.noteflow.markWhatsNewSeen(clean)
      .then((stored) => set({ seen: mergeSeenIds(stored, get().seen) }))
      .catch(() => { /* best effort: worst case the slide shows again next launch */ })
  },

  openStartupTour: () => {
    const { loaded, autoDisabled, tour, seen } = get()
    if (!loaded || autoDisabled || tour) return false
    const plan = planStartupTour(WHATS_NEW_SLIDES, seen)
    if (!plan) return false
    set({ tour: { seq: nextSeq++, slideIds: plan.slideIds, startIndex: 0, mode: plan.mode } })
    return true
  },

  openFullTour: (startId) => {
    const plan = planFullTour(WHATS_NEW_SLIDES, startId)
    set({ tour: { seq: nextSeq++, slideIds: plan.slideIds, startIndex: plan.index, mode: 'replay' } })
  },

  closeTour: (seq) => { if (get().tour?.seq === seq) set({ tour: null }) },
}))
