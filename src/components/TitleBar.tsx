import { useState, useEffect } from 'react'
import { Check, Download, Minus, Palette, Settings, Square, X } from 'lucide-react'
import { THEMES } from '../lib/themes'
import { useThemeStore } from '../stores/themeStore'
import { useEditorSettingsStore } from '../stores/editorSettingsStore'
import { TitleBarMenu } from './TitleBarMenu'
import { ExportImportModal } from './ExportImportModal'

export function TitleBar() {
  const { activeThemeId, setTheme } = useThemeStore()
  const { fontSize, changeFontSize, resetFontSize } = useEditorSettingsStore()
  const [updateInfo, setUpdateInfo] = useState<{ latestVersion: string; downloadUrl: string } | null>(null)
  const [exportImportModal, setExportImportModal] = useState<'export' | 'import' | null>(null)

  useEffect(() => {
    window.noteflow.checkUpdate().then((result) => {
      if (result.hasUpdate && result.latestVersion && result.downloadUrl) {
        setUpdateInfo({ latestVersion: result.latestVersion, downloadUrl: result.downloadUrl })
      }
    })
  }, [])

  return (
    <>
    <div
      className="flex items-center h-8 bg-surface-0 border-b border-border select-none flex-shrink-0"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* App name */}
      <div className="flex items-center gap-2 px-4">
        <span className="text-xs font-mono text-accent font-bold tracking-widest">NOTEFLOW</span>
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
            onClick={() => window.noteflow.openUrl(updateInfo.downloadUrl)}
            className="flex items-center px-2 h-full text-accent hover:text-text transition-colors"
            title={`Update available: v${updateInfo.latestVersion}`}
          >
            <Download size={12} />
          </button>
        )}
        <TitleBarMenu
          trigger={<Settings size={12} />}
          groups={[
            {
              label: 'Notes',
              items: [
                { id: 'export', label: 'Export notes...', action: () => setExportImportModal('export') },
                { id: 'import', label: 'Import notes...', action: () => setExportImportModal('import') },
              ],
            },
            {
              label: 'Editor',
              items: [
                {
                  id: 'font-size',
                  node: (
                    <div className="flex items-center justify-between w-full">
                      <span className="text-text-muted">Font size</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => changeFontSize(-1)}
                          className="w-5 h-5 flex items-center justify-center rounded hover:bg-surface-3 text-text-muted hover:text-text transition-colors"
                          title="Decrease (Ctrl+-)"
                        >−</button>
                        <button
                          onClick={resetFontSize}
                          className="w-10 text-center rounded hover:bg-surface-3 text-text hover:text-accent transition-colors py-0.5"
                          title="Reset (Ctrl+0)"
                        >{fontSize}px</button>
                        <button
                          onClick={() => changeFontSize(1)}
                          className="w-5 h-5 flex items-center justify-center rounded hover:bg-surface-3 text-text-muted hover:text-text transition-colors"
                          title="Increase (Ctrl+=)"
                        >+</button>
                      </div>
                    </div>
                  ),
                },
              ],
            },
          ]}
        />
        <TitleBarMenu
          trigger={<Palette size={12} />}
          groups={[
            {
              label: 'Tema',
              items: THEMES.map((t) => ({
                id: t.id,
                label: t.label,
                indicator: activeThemeId === t.id
                  ? <Check size={10} className="text-accent" />
                  : undefined,
                action: () => setTheme(t.id),
              })),
            },
          ]}
        />
        <div className="flex">
          <button
            onClick={() => window.noteflow.minimize()}
            className="w-10 h-7 flex items-center justify-center text-text-muted hover:bg-surface-2 transition-colors"
            title="Minimize"
          >
            <Minus size={11} />
          </button>
          <button
            onClick={() => window.noteflow.maximize()}
            className="w-10 h-7 flex items-center justify-center text-text-muted hover:bg-surface-2 transition-colors"
            title="Maximize"
          >
            <Square size={10} />
          </button>
          <button
            onClick={() => window.noteflow.close()}
            className="w-10 h-7 flex items-center justify-center text-text-muted hover:bg-red-500 hover:text-white transition-colors"
            title="Close (hides to tray)"
          >
            <X size={11} />
          </button>
        </div>
      </div>
    </div>

    {exportImportModal && (
      <ExportImportModal
        mode={exportImportModal}
        onClose={() => setExportImportModal(null)}
      />
    )}
    </>
  )
}
