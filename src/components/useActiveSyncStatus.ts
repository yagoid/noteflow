import { useCallback, useEffect, useRef, useState } from 'react'
import type { ActiveSyncStatus } from '../types'

/**
 * Live, backend-tagged status of whichever sync provider is active (GitHub or
 * NoteFlow Cloud — mutually exclusive, see electron/syncProvider.ts), plus
 * whether uploads are in flight. Shared by the titlebar sync button
 * (TitleBar.tsx) and Settings → Sync (Settings/SyncOverview.tsx).
 *
 * `status` is null until the first read lands. Re-read on every event that can
 * move it: notes updated, push state, GitHub's and Cloud's status-changed.
 * Realtime joins/drops emit no event, so callers that show them pass `pollMs`
 * to also re-read on a tick (which also advances `now`, for relative times).
 */
export function useActiveSyncStatus(pollMs?: number) {
  const [status, setStatus] = useState<ActiveSyncStatus | null>(null)
  const [pushing, setPushing] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  // Latest 'sync:push-state' received — see the onSyncPushState handler.
  const pushStateRef = useRef<'pushing' | 'idle'>('idle')

  const refresh = useCallback(() => window.noteflow.getActiveSyncStatus().then(setStatus), [])

  useEffect(() => {
    refresh()
    const unsubNotes = window.noteflow.onNotesUpdated(() => refresh())
    const unsubPush = window.noteflow.onSyncPushState((state) => {
      pushStateRef.current = state
      if (state === 'pushing') setPushing(true)
      // Refresh on every transition (not just 'idle') so the pending-uploads
      // count tracks files as they start and finish. 'idle' is applied together
      // with the fresh status: dropping `pushing` first would show the previous
      // status — whose journal still counts the upload or delete that just
      // landed — as "not uploaded" for a moment. The ref keeps a 'pushing' that
      // arrived meanwhile from being overwritten.
      window.noteflow.getActiveSyncStatus().then((next) => {
        setStatus(next)
        setPushing(pushStateRef.current === 'pushing')
      })
    })
    const unsubStatus = window.noteflow.onSyncStatusChanged(() => refresh())
    // Cloud emits its own status-changed event (enable/disable, unlock, pull) —
    // refresh from the same unified getter so the UI tracks the live backend.
    const unsubCloud = window.noteflow.onCloudStatusChanged(() => refresh())
    return () => {
      unsubNotes()
      unsubPush()
      unsubStatus()
      unsubCloud()
    }
  }, [refresh])

  useEffect(() => {
    if (!pollMs) return
    const tick = window.setInterval(() => {
      setNow(Date.now())
      refresh()
    }, pollMs)
    return () => window.clearInterval(tick)
  }, [pollMs, refresh])

  return { status, pushing, now, refresh }
}
