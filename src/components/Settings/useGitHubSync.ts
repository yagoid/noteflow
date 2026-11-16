import { useEffect, useState } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import { tf } from '../../i18n/format'
import { useT } from '../../i18n/useT'

export type GitHubSyncStatus = Awaited<ReturnType<typeof window.noteflow.getSyncStatus>>
export type MirrorResult = Awaited<ReturnType<typeof window.noteflow.mirrorToGitHub>>

type Busy = 'idle' | 'pulling' | 'mirroring' | 'disconnecting'

// State + actions of a CONNECTED GitHub Sync in Settings → Sync: its status,
// "Sync now" (a GitHub pull — only while GitHub is the live backend),
// "Mirror to GitHub" (only while NoteFlow Cloud owns the sync loop; main gates
// both too) and Disconnect. Used by the GitHub overview and by the paused
// GitHub row of the Cloud overview. The device-flow setup lives in GitHubSetup.
// `onConnectedChange` reports a disconnect to SyncPanel: main only broadcasts
// sync:status-changed for the initial pull, not on connect/disconnect.
export function useGitHubSync(onConnectedChange: (connected: boolean) => void) {
  const t = useT()
  const loadNotes = useNotesStore((s) => s.loadNotes)
  const [status, setStatus] = useState<GitHubSyncStatus | null>(null)
  const [busy, setBusy] = useState<Busy>('idle')
  const [error, setError] = useState<string | null>(null)
  const [pullResult, setPullResult] = useState<{ pulled: number; errors: string[] } | null>(null)
  const [mirrorResult, setMirrorResult] = useState<MirrorResult | null>(null)
  const [confirmMirror, setConfirmMirror] = useState(false)

  useEffect(() => {
    window.noteflow.getSyncStatus().then(setStatus)
  }, [])

  async function pull() {
    setBusy('pulling')
    setError(null)
    setMirrorResult(null)
    const result = await window.noteflow.pullNotes()
    setBusy('idle')
    if (result.error === 'cloud-enabled') {
      setError(t.settings.sync.pullCloudEnabled)
      return
    }
    setPullResult(result)
    if (result.pulled > 0) await loadNotes()
    setStatus(await window.noteflow.getSyncStatus())
  }

  // Local → repo. Nothing on disk changes, so no loadNotes() — only the sync
  // status (lastSync / error) needs refreshing.
  async function mirror() {
    setBusy('mirroring')
    setError(null)
    setPullResult(null)
    setMirrorResult(null)
    const result = await window.noteflow.mirrorToGitHub()
    setMirrorResult(result)
    setBusy('idle')
    setStatus(await window.noteflow.getSyncStatus())
  }

  async function disconnect() {
    setBusy('disconnecting')
    await window.noteflow.disconnectGitHub()
    const updated = await window.noteflow.getSyncStatus()
    setStatus(updated)
    setPullResult(null)
    setMirrorResult(null)
    setBusy('idle')
    onConnectedChange(updated.connected)
  }

  function mirrorMessage(result: MirrorResult): string {
    if (result.ok) {
      return result.pushed === 0 && result.deleted === 0
        ? t.settings.sync.mirrorAlreadyMirrored
        : tf(t.settings.sync.mirrorDone, { pushed: result.pushed, deleted: result.deleted })
    }
    switch (result.error) {
      case 'cloud-required': return t.settings.sync.mirrorRequiresCloud
      case 'cloud-initial-pull-pending': return t.settings.sync.mirrorCloudInitialPullPending
      case 'in-progress': return t.settings.sync.mirrorInProgress
      case 'token': return t.settings.sync.mirrorTokenError
      case 'not-connected': return t.settings.sync.notConnected
      // Per-file failures (GitHub API messages) are listed below the message.
      default: return t.settings.sync.mirrorFailed
    }
  }

  function mirrorWarning(code: MirrorResult['warnings'][number]): string {
    switch (code) {
      case 'deletions-skipped-unreadable': return t.settings.sync.mirrorDeletionsSkipped
    }
  }

  return {
    status,
    busy,
    error,
    pullResult,
    mirrorResult,
    confirmMirror,
    setConfirmMirror,
    pull,
    mirror,
    disconnect,
    mirrorMessage,
    mirrorWarning,
  }
}

export type GitHubSync = ReturnType<typeof useGitHubSync>
