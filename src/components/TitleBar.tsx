import { useState, useEffect } from 'react'
import { Brain, Cloud, CloudOff, Download, Minus, RefreshCw, Settings, Square, X } from 'lucide-react'
import { useNotesStore } from '../stores/notesStore'
import { useT } from '../i18n/useT'
import { tf } from '../i18n/format'
import type { ActiveSyncStatus } from '../types'
import { ExportImportModal } from './ExportImportModal'
import { SettingsModal } from './Settings/SettingsModal'
import type { SettingsSection } from './Settings/SettingsModal'

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
  const [syncStatus, setSyncStatus] = useState<ActiveSyncStatus>({ backend: 'none', active: false, initialPullStatus: 'pending' })
  const [syncing, setSyncing] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general')

  const refreshSyncStatus = () => window.noteflow.getActiveSyncStatus().then(setSyncStatus)

  const openSettings = (section: SettingsSection) => {
    setSettingsSection(section)
    setSettingsOpen(true)
  }

  useEffect(() => {
    window.noteflow.checkUpdate().then((result) => {
      if (result.hasUpdate && result.latestVersion && result.downloadUrl) {
        setUpdateInfo({ latestVersion: result.latestVersion, downloadUrl: result.downloadUrl })
      }
    })
    refreshSyncStatus()
    const unsubProgress = window.noteflow.onUpdateProgress((percent) => setDownloadProgress(percent))
    const unsubInstalling = window.noteflow.onUpdateInstalling(() => setInstalling(true))
    const unsubNotes = window.noteflow.onNotesUpdated(() => refreshSyncStatus())
    const unsubPush = window.noteflow.onSyncPushState((state) => {
      setPushing(state === 'pushing')
      if (state === 'idle') refreshSyncStatus()
    })
    const unsubStatus = window.noteflow.onSyncStatusChanged(() => refreshSyncStatus())
    // Cloud emits its own status-changed event (enable/disable, unlock, pull) —
    // refresh from the same unified getter so the button tracks the live backend.
    const unsubCloud = window.noteflow.onCloudStatusChanged(() => refreshSyncStatus())
    return () => {
      unsubProgress()
      unsubInstalling()
      unsubNotes()
      unsubPush()
      unsubStatus()
      unsubCloud()
    }
  }, [])

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
    window.addEventListener('noteflow:sync-notes', doSync)
    return () => {
      window.removeEventListener('noteflow:open-export', openExport)
      window.removeEventListener('noteflow:open-import', openImport)
      window.removeEventListener('noteflow:open-shortcuts', openShortcuts)
      window.removeEventListener('noteflow:open-github-sync', openGithubSync)
      window.removeEventListener('noteflow:open-startup', openStartup)
      window.removeEventListener('noteflow:check-for-update', openUpdates)
      window.removeEventListener('noteflow:open-account', openAccount)
      window.removeEventListener('noteflow:sync-notes', doSync)
    }
  }, [])

  function formatLastSync(iso?: string) {
    if (!iso) return t.titleBar.never
    const d = new Date(iso)
    const now = new Date()
    const sameDay = d.toDateString() === now.toDateString()
    const hhmm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return sameDay ? hhmm : `${d.toLocaleDateString([], { day: '2-digit', month: '2-digit' })} ${hhmm}`
  }

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

  // Cloud keys not in memory (locked / no-keys) — a manual pull can't run until
  // the user unlocks in Settings; treated like a blocked initial pull.
  const cloudLocked = syncStatus.backend === 'cloud' && syncStatus.cloud?.keysState !== 'unlocked'
  const syncBlocked = syncStatus.initialPullStatus === 'failed' || cloudLocked

  const syncTooltip = syncing
    ? t.titleBar.syncing
    : pushing
    ? t.titleBar.uploading
    : cloudLocked
    ? t.titleBar.cloudLocked
    : syncStatus.initialPullStatus === 'failed'
    ? `${t.titleBar.syncBlocked}${syncStatus.error ? `\n${syncStatus.error}` : ''}\n${t.titleBar.clickToRetry}`
    : syncStatus.error
    ? tf(t.titleBar.syncError, { error: syncStatus.error })
    : syncStatus.backend === 'cloud'
    ? tf(t.titleBar.cloudIdle, { time: formatLastSync(syncStatus.lastSync) })
    : tf(t.titleBar.syncIdle, { owner: syncStatus.github?.owner ?? '', repo: syncStatus.github?.repo ?? '', time: formatLastSync(syncStatus.lastSync) })

  return (
    <>
    <div
      className="flex items-center h-8 bg-surface-0 border-b border-border select-none flex-shrink-0"
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
        <button
          onClick={() => setBrainView(!brainViewOpen)}
          className={`flex items-center gap-1.5 px-2.5 h-5 my-auto mr-5 rounded border border-solid text-[10px] font-mono tracking-wide transition-colors ${
            brainViewOpen
              ? 'border-accent/60 bg-accent/15 text-accent'
              : 'border-text-muted/60 text-text-muted hover:text-text hover:border-text-muted hover:bg-surface-2'
          }`}
          title={brainViewOpen ? t.titleBar.closeBrain : t.titleBar.openBrain}
        >
          <Brain size={12} />
          <span>brain</span>
        </button>
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
        {syncStatus.active && (
          <button
            onClick={handleSync}
            disabled={syncing || pushing}
            className="flex items-center gap-1 px-2 h-full text-text-muted hover:text-text transition-colors disabled:opacity-60"
            title={syncTooltip}
          >
            {syncing ? (
              <RefreshCw size={12} className="animate-spin text-text" />
            ) : pushing ? (
              <Cloud size={12} className="animate-pulse text-green-400" />
            ) : syncBlocked ? (
              <CloudOff size={12} className="text-amber-400" />
            ) : syncStatus.error ? (
              <Cloud size={12} className="text-amber-400" />
            ) : (
              <Cloud size={12} className="text-green-400" />
            )}
          </button>
        )}
        <button
          onClick={() => openSettings('general')}
          className="w-10 h-7 flex items-center justify-center text-text-muted hover:bg-surface-2 transition-colors"
          title={t.titleBar.settings}
        >
          <Settings size={12} />
        </button>
        <div className="flex">
          <button
            onClick={() => window.noteflow.minimize()}
            className="w-10 h-7 flex items-center justify-center text-text-muted hover:bg-surface-2 transition-colors"
            title={t.titleBar.minimize}
          >
            <Minus size={11} />
          </button>
          <button
            onClick={() => window.noteflow.maximize()}
            className="w-10 h-7 flex items-center justify-center text-text-muted hover:bg-surface-2 transition-colors"
            title={t.titleBar.maximize}
          >
            <Square size={10} />
          </button>
          <button
            onClick={() => window.noteflow.close()}
            className="w-10 h-7 flex items-center justify-center text-text-muted hover:bg-red-500 hover:text-white transition-colors"
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
        onClose={() => setSettingsOpen(false)}
        onOpenExportImport={(mode) => {
          setSettingsOpen(false)
          setExportNoteId(undefined)
          setExportImportModal(mode)
        }}
      />
    )}
    </>
  )
}
