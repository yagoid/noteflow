import { useState, useEffect } from 'react'
import { Brain, Download, Minus, RefreshCw, Settings, Square, X } from 'lucide-react'
import { useNotesStore, settleNoteWrites } from '../stores/notesStore'
import { useT } from '../i18n/useT'
import { tf } from '../i18n/format'
import type { OriginChoiceAction } from '../types'
import { ExportImportModal } from './ExportImportModal'
import { SettingsModal } from './Settings/SettingsModal'
import { SyncStatusButton } from './SyncStatusButton'
import { OriginChoiceDialog } from './OriginChoiceDialog'
import { useActiveSyncStatus } from './useActiveSyncStatus'
import type { SettingsIntent, SettingsSection } from './Settings/SettingsModal'

export function TitleBar() {
  const t = useT()
  const brainViewOpen = useNotesStore((s) => s.brainViewOpen)
  const setBrainView = useNotesStore((s) => s.setBrainView)
  const [updateInfo, setUpdateInfo] = useState<{ latestVersion: string; downloadUrl: string } | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [installing, setInstalling] = useState(false)
  const [exportImportModal, setExportImportModal] = useState<'export' | 'import' | null>(null)
  // Note to preselect in the export panel (from "Export note…"); undefined = the active note.
  const [exportNoteId, setExportNoteId] = useState<string | undefined>(undefined)
  // Backend-tagged status of whichever sync provider is live (GitHub or NoteFlow
  // Cloud — they are mutually exclusive). The button routes to the active one.
  const { status: syncStatus, pushing, refresh: refreshSyncStatus } = useActiveSyncStatus()
  const [syncing, setSyncing] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general')
  const [settingsIntent, setSettingsIntent] = useState<SettingsIntent | undefined>(undefined)
  // Origin choice dialog (the notes dir came from another remote — see
  // OriginChoiceDialog): open while a choice is pending unless the user closed
  // it for THAT choice ("Decide later"); a new choice opens it again. Reopened
  // from the sync button or Settings → Sync (event 'noteflow:open-origin-choice').
  const [dismissedChoiceKey, setDismissedChoiceKey] = useState<string | null>(null)

  const openSettings = (section: SettingsSection, intent?: SettingsIntent) => {
    setSettingsSection(section)
    setSettingsIntent(intent)
    setSettingsOpen(true)
  }

  useEffect(() => {
    window.noteflow.checkUpdate().then((result) => {
      if (result.hasUpdate && result.latestVersion && result.downloadUrl) {
        setUpdateInfo({ latestVersion: result.latestVersion, downloadUrl: result.downloadUrl })
      }
    })
    // The sync status (and its subscriptions) lives in useActiveSyncStatus.
    const unsubProgress = window.noteflow.onUpdateProgress((percent) => setDownloadProgress(percent))
    const unsubInstalling = window.noteflow.onUpdateInstalling(() => setInstalling(true))
    return () => {
      unsubProgress()
      unsubInstalling()
    }
  }, [])

  // (syncStatus is null until the first read lands.)
  const originChoice = syncStatus?.originChoice
  const choiceKey = syncStatus && originChoice
    ? `${syncStatus.backend}|${originChoice.stale ? 'stale' : ''}|${originChoice.previous}|${originChoice.next}`
    : null
  const originDialogOpen = choiceKey !== null && dismissedChoiceKey !== choiceKey
  const reopenOriginChoice = () => setDismissedChoiceKey(null)

  useEffect(() => {
    const openOriginChoice = () => setDismissedChoiceKey(null)
    window.addEventListener('noteflow:open-origin-choice', openOriginChoice)
    return () => window.removeEventListener('noteflow:open-origin-choice', openOriginChoice)
  }, [])

  // Routed to the backend that asks (the live one: GitHub, or NoteFlow Cloud when enabled).
  const resolveOrigin = async (choice: OriginChoiceAction): Promise<{ ok: boolean; error?: string }> => {
    // Pending editor saves land first: "replace" moves the notes as they are on disk.
    if (choice !== 'cancel') {
      await Promise.race([
        settleNoteWrites().catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ])
    }
    // The key of the choice on screen: main refuses it ('not-pending') if the
    // pending choice changed meanwhile — the refreshed status then shows the new one.
    const key = originChoice?.key
    const res = syncStatus?.backend === 'cloud'
      ? await window.noteflow.resolveCloudOrigin(choice, key)
      : await window.noteflow.resolveGithubOrigin(choice, key)
    // Resolved → the refreshed status has no originChoice and the dialog closes.
    await refreshSyncStatus()
    return res
  }

  useEffect(() => {
    // Optional `detail.noteId` preselects that note instead of the active one.
    const openExport = (e: Event) => {
      const noteId = (e as CustomEvent<{ noteId?: string } | null>).detail?.noteId
      setExportNoteId(noteId)
      setExportImportModal('export')
    }
    const openImport = () => { setExportNoteId(undefined); setExportImportModal('import') }
    const openShortcuts = () => openSettings('shortcuts')
    const openGithubSync = () => openSettings('sync')
    const openStartup = () => openSettings('startup')
    const openUpdates = () => openSettings('about')
    // Emitted by surfaces with no navigation of their own (the brain's AI panel gate).
    const openAccount = () => openSettings('account')
    // The editor's AI chat sidebar / detached chat window with no provider configured.
    const openAiSettings = () => openSettings('ai')
    // Generic: any section, with an optional intent — `detail: { section, intent? }` (the
    // version history's "View NoteFlow Cloud" → Sync with the Cloud plan detail).
    const openSettingsAt = (e: Event) => {
      const detail = (e as CustomEvent<{ section?: SettingsSection; intent?: SettingsIntent } | null>).detail
      openSettings(detail?.section ?? 'general', detail?.intent)
    }
    const doSync = () => {
      setSyncing(true)
      window.noteflow.pullActiveNotes().then(() => {
        refreshSyncStatus()
        setSyncing(false)
      })
    }
    window.addEventListener('noteflow:open-export', openExport)
    window.addEventListener('noteflow:open-import', openImport)
    window.addEventListener('noteflow:open-shortcuts', openShortcuts)
    window.addEventListener('noteflow:open-github-sync', openGithubSync)
    window.addEventListener('noteflow:open-startup', openStartup)
    window.addEventListener('noteflow:check-for-update', openUpdates)
    window.addEventListener('noteflow:open-account', openAccount)
    window.addEventListener('noteflow:open-ai-settings', openAiSettings)
    window.addEventListener('noteflow:open-settings', openSettingsAt)
    window.addEventListener('noteflow:sync-notes', doSync)
    return () => {
      window.removeEventListener('noteflow:open-export', openExport)
      window.removeEventListener('noteflow:open-import', openImport)
      window.removeEventListener('noteflow:open-shortcuts', openShortcuts)
      window.removeEventListener('noteflow:open-github-sync', openGithubSync)
      window.removeEventListener('noteflow:open-startup', openStartup)
      window.removeEventListener('noteflow:check-for-update', openUpdates)
      window.removeEventListener('noteflow:open-account', openAccount)
      window.removeEventListener('noteflow:open-ai-settings', openAiSettings)
      window.removeEventListener('noteflow:open-settings', openSettingsAt)
      window.removeEventListener('noteflow:sync-notes', doSync)
    }
  }, [refreshSyncStatus])

  const handleSync = async () => {
    if (syncing) return
    setSyncing(true)
    await window.noteflow.pullActiveNotes()
    await refreshSyncStatus()
    setSyncing(false)
  }

  const handleUpdate = async () => {
    if (!updateInfo || downloading || installing) return
    setDownloading(true)
    setDownloadProgress(0)
    const result = await window.noteflow.downloadAndInstall(updateInfo.downloadUrl)
    if (!result.success) {
      window.noteflow.openUrl(updateInfo.downloadUrl)
      setInstalling(false)
    }
    setDownloading(false)
  }

  return (
    <>
    <div
      className="flex items-center h-[34px] bg-surface-0 select-none flex-shrink-0"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* App name */}
      <div className="flex items-center gap-2 px-4">
        <span className="text-xs font-mono text-text font-bold tracking-widest">NOTEFLOW</span>
        <span className="text-xs font-mono text-text-muted/30">_</span>
      </div>

      <div className="flex-1" />

      {/* Window controls */}
      <div
        className="flex items-center h-full"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {updateInfo && (
          <button
            onClick={handleUpdate}
            disabled={downloading || installing}
            className="flex items-center gap-1 px-2 h-full text-text/70 hover:text-text transition-colors disabled:opacity-60"
            title={
              installing
                ? t.titleBar.installing
                : downloading
                ? tf(t.titleBar.downloading, { progress: downloadProgress > 0 ? `${downloadProgress}%` : '' })
                : tf(t.titleBar.updateAvailable, { version: updateInfo.latestVersion })
            }
          >
            {installing ? (
              <RefreshCw size={12} className="animate-spin" />
            ) : downloading ? (
              <span className="text-[10px] font-mono">{downloadProgress > 0 ? `${downloadProgress}%` : '…'}</span>
            ) : (
              <Download size={12} />
            )}
          </button>
        )}
        {/* Brain · sync (when connected) · settings: one group, same px-2 padding
            and 13px icons on each, so the gap between the three is identical. The
            window controls keep a slightly wider gap after them. */}
        <div className="flex items-center gap-1 h-full ml-3">
        <button
          onClick={() => setBrainView(!brainViewOpen)}
          className={`flex items-center gap-1.5 px-2 h-6 my-auto rounded text-[11px] font-mono tracking-wide transition-[color,background-color,transform] duration-150 motion-safe:hover:scale-105 ${
            brainViewOpen
              ? 'bg-accent/15 text-accent'
              : 'text-text-muted hover:text-text hover:bg-surface-2'
          }`}
          title={brainViewOpen ? t.titleBar.closeBrain : t.titleBar.openBrain}
        >
          <Brain size={13} />
          <span className="leading-none">brain</span>
        </button>
        {syncStatus?.active && (
          <SyncStatusButton
            status={syncStatus}
            syncing={syncing}
            pushing={pushing}
            onSync={handleSync}
            onRefresh={refreshSyncStatus}
            onDismissConflictCopies={() => {
              // main emits sync:/cloud:status-changed → the status refreshes on its own.
              void window.noteflow.dismissConflictCopies()
            }}
            onOpenSettings={() => openSettings('sync')}
            onChooseOrigin={reopenOriginChoice}
          />
        )}
        <button
          onClick={() => openSettings('general')}
          className="px-2 h-full flex items-center justify-center text-text-muted hover:text-text transition-colors"
          title={t.titleBar.settings}
        >
          <Settings size={13} />
        </button>
        </div>
        <div className="flex h-full ml-2">
          <button
            onClick={() => window.noteflow.minimize()}
            className="w-10 h-full flex items-center justify-center text-text-muted hover:bg-surface-2 transition-colors"
            title={t.titleBar.minimize}
          >
            <Minus size={11} />
          </button>
          <button
            onClick={() => window.noteflow.maximize()}
            className="w-10 h-full flex items-center justify-center text-text-muted hover:bg-surface-2 transition-colors"
            title={t.titleBar.maximize}
          >
            <Square size={10} />
          </button>
          <button
            onClick={() => window.noteflow.close()}
            className="w-10 h-full flex items-center justify-center text-text-muted hover:bg-[#e81123] transition-colors"
            title={t.titleBar.close}
          >
            <X size={13} />
          </button>
        </div>
      </div>
    </div>

    {exportImportModal && (
      <ExportImportModal
        mode={exportImportModal}
        initialNoteId={exportNoteId}
        onClose={() => setExportImportModal(null)}
      />
    )}
    {settingsOpen && (
      <SettingsModal
        initialSection={settingsSection}
        initialIntent={settingsIntent}
        onClose={() => setSettingsOpen(false)}
        onOpenExportImport={(mode) => {
          setSettingsOpen(false)
          setExportNoteId(undefined)
          setExportImportModal(mode)
        }}
      />
    )}
    {originDialogOpen && syncStatus && originChoice && syncStatus.backend !== 'none' && (
      <OriginChoiceDialog
        backend={syncStatus.backend}
        previousLabel={originChoice.previous}
        nextLabel={originChoice.next}
        stale={originChoice.stale === true}
        disconnectsGithub={originChoice.disconnectsGithub === true}
        onResolve={resolveOrigin}
        onClose={() => setDismissedChoiceKey(choiceKey)}
      />
    )}
    </>
  )
}
