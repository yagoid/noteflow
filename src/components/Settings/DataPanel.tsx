import { useEffect, useState } from 'react'
import { Download, FolderOpen, Upload } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { SectionTitle, settingsButtonClass } from './ui'

interface DataPanelProps {
  onOpenExportImport: (mode: 'export' | 'import') => void
}

export function DataPanel({ onOpenExportImport }: DataPanelProps) {
  const [notesDir, setNotesDir] = useState<string>('')
  const t = useT()

  useEffect(() => {
    window.noteflow.getNotesDir().then(setNotesDir)
  }, [])

  return (
    <div className="settings-rows space-y-6">
      {/* Export / Import */}
      <section>
        <SectionTitle>{t.settings.data.backup}</SectionTitle>
        <div className="flex flex-col items-start gap-2">
          <button
            onClick={() => onOpenExportImport('export')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono text-left ${settingsButtonClass}`}
          >
            <Download size={13} className="text-text-muted flex-shrink-0" />
            <span className="flex-1">{t.settings.data.exportNotes}</span>
          </button>
          <button
            onClick={() => onOpenExportImport('import')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono text-left ${settingsButtonClass}`}
          >
            <Upload size={13} className="text-text-muted flex-shrink-0" />
            <span className="flex-1">{t.settings.data.importNotes}</span>
          </button>
        </div>
      </section>

      {/* Notes location */}
      <section>
        <SectionTitle>{t.settings.data.notesLocation}</SectionTitle>
        <p className="text-[11px] font-mono text-text-muted break-all mb-2">{notesDir || '…'}</p>
        <button
          onClick={() => window.noteflow.openNotesFolder()}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono text-left ${settingsButtonClass}`}
        >
          <FolderOpen size={13} className="text-text-muted flex-shrink-0" />
          <span className="flex-1">{t.settings.data.openNotesFolder}</span>
        </button>
      </section>
    </div>
  )
}
