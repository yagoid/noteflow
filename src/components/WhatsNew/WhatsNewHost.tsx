import { useEffect, useState } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import { useWhatsNewStore } from '../../stores/whatsNewStore'
import { WhatsNewTour } from './WhatsNewTour'

// Mounted once in the MAIN window (App.tsx → MainApp, never sticky / section / chat
// windows). Renders the tour whenever the store holds one, and fires the startup
// popup: after the first notes load, a short pause, and only with no other modal
// on screen (it waits for it to close, and gives up for this launch after a while).

const STARTUP_DELAY_MS = 700
const MODAL_POLL_MS = 1000
const MODAL_WAIT_MAX_MS = 2 * 60 * 1000

// Every app modal is a full-screen `fixed inset-0` overlay with a dark `bg-black/…`
// backdrop (Settings, Confirm, Encryption, Export/Import, palette, editor dialogs,
// section link picker). Transparent click-catchers (`fixed inset-0` without a
// backdrop, e.g. dropdowns) don't count.
function anotherModalOpen(): boolean {
  if (useNotesStore.getState().commandPaletteOpen) return true
  return Array.from(document.querySelectorAll<HTMLElement>('.fixed.inset-0')).some(
    (el) => /(^|\s)bg-black\//.test(el.className) && !el.closest('[data-whats-new]'),
  )
}

export function WhatsNewHost() {
  const tour = useWhatsNewStore((s) => s.tour)
  const loaded = useWhatsNewStore((s) => s.loaded)
  const [notesReady, setNotesReady] = useState(() => useNotesStore.getState().notes.length > 0)

  useEffect(() => { void useWhatsNewStore.getState().load() }, [])

  // The first loadNotes() finishing (isLoading true → false). This effect runs before
  // MainApp's own effect starts that load, so the transition is never missed.
  useEffect(() => {
    if (notesReady) return
    return useNotesStore.subscribe((s, prev) => {
      if (prev.isLoading && !s.isLoading) setNotesReady(true)
    })
  }, [notesReady])

  useEffect(() => {
    if (!notesReady || !loaded) return
    let timer: number | undefined
    let waited = 0
    let cleanupVisible = () => {}
    const attempt = () => {
      // Launched hidden (autostart → tray): wait until the window is actually shown.
      if (document.hidden) {
        const onVisible = () => {
          if (document.hidden) return
          document.removeEventListener('visibilitychange', onVisible)
          timer = window.setTimeout(attempt, STARTUP_DELAY_MS)
        }
        document.addEventListener('visibilitychange', onVisible)
        cleanupVisible = () => document.removeEventListener('visibilitychange', onVisible)
        return
      }
      if (anotherModalOpen()) {
        waited += MODAL_POLL_MS
        if (waited <= MODAL_WAIT_MAX_MS) timer = window.setTimeout(attempt, MODAL_POLL_MS)
        return
      }
      useWhatsNewStore.getState().openStartupTour()
    }
    timer = window.setTimeout(attempt, STARTUP_DELAY_MS)
    return () => {
      window.clearTimeout(timer)
      cleanupVisible()
    }
  }, [notesReady, loaded])

  if (!tour) return null
  // Keyed per opening so a new tour (e.g. a card in Settings) always starts fresh.
  return <WhatsNewTour key={tour.seq} tour={tour} />
}
