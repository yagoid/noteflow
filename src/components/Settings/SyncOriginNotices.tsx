import { useEffect, useState } from 'react'
import { AlertTriangle, FolderOpen } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { SettingsRow, settingsButtonClass } from './ui'

// Settings → Sync pieces of the "notes dir origin" (electron/syncOrigin.ts): the
// notice of a pending origin choice and the access to the local copies that
// "Use only the notes from …" sets aside (userData/notes-archive).

// The notes on this device came from another remote: paused until the user
// chooses. The dialog lives in the titlebar (TitleBar.tsx — it also opens on
// its own); the button reopens it. Shown by the sync overview of the live
// backend, right under its status card.
export function OriginPendingNotice({ text }: { text: string }) {
  const t = useT()
  return (
    <div
      role="status"
      className="flex items-start gap-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-[11px] font-mono text-yellow-400 leading-relaxed"
    >
      <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
      <div className="flex-1 space-y-1.5">
        <p>{text}</p>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('noteflow:open-origin-choice'))}
          className="px-2 py-0.5 rounded border border-yellow-500/40 hover:bg-yellow-500/20 transition-colors"
        >
          {t.settings.sync.originChoose}
        </button>
      </div>
    </div>
  )
}

// Whether there is at least one local copy. Re-read when either backend's
// status changes: a choice made elsewhere (the titlebar dialog) may have just
// created one.
function useHasNotesArchives(): boolean {
  const [hasArchives, setHasArchives] = useState(false)
  useEffect(() => {
    let alive = true
    const refresh = () => {
      window.noteflow.getNotesArchiveStatus()
        .then((s) => { if (alive) setHasArchives(s.hasArchives) })
        .catch(() => undefined)
    }
    refresh()
    const offSync = window.noteflow.onSyncStatusChanged(refresh)
    const offCloud = window.noteflow.onCloudStatusChanged(refresh)
    return () => {
      alive = false
      offSync()
      offCloud()
    }
  }, [])
  return hasArchives
}

// "Local copies" as a row of the sync overview's data list — only once there is one.
export function LocalCopiesRow() {
  const t = useT()
  const hasArchives = useHasNotesArchives()
  if (!hasArchives) return null
  return (
    <SettingsRow
      icon={<FolderOpen size={14} />}
      title={t.settings.sync.archivesTitle}
      description={t.settings.sync.archivesDesc}
      action={
        <button
          type="button"
          onClick={() => void window.noteflow.openNotesArchive()}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap ${settingsButtonClass}`}
        >
          {t.settings.sync.openArchives}
        </button>
      }
    />
  )
}

// The same access where there is no overview (the chooser, a backend's detail):
// the copies outlive the connection that made them.
export function LocalCopies() {
  const t = useT()
  const hasArchives = useHasNotesArchives()
  if (!hasArchives) return null
  return (
    <div className="flex items-center gap-3">
      <p className="flex-1 text-[11px] font-mono text-text-muted leading-relaxed">{t.settings.sync.archivesDesc}</p>
      <button
        type="button"
        onClick={() => void window.noteflow.openNotesArchive()}
        className={`flex items-center gap-1.5 flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-mono ${settingsButtonClass}`}
      >
        <FolderOpen size={11} />
        {t.settings.sync.openArchives}
      </button>
    </div>
  )
}
