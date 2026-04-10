import { useEffect, useState } from 'react'
import { Bookmark, Monitor, X } from 'lucide-react'
import { useNotesStore } from '../stores/notesStore'
import { getTagColor } from '../lib/tagColors'
import { useSectionTagColorsStore } from '../stores/sectionTagColorsStore'

interface StartupSticky {
  noteId: string
  sectionId: string
}

interface StartupSettingsModalProps {
  onClose: () => void
}

export function StartupSettingsModal({ onClose }: StartupSettingsModalProps) {
  const notes = useNotesStore((s) => s.notes)
  const sectionTagColors = useSectionTagColorsStore((s) => s.sectionTagColors)
  const [openAtLogin, setOpenAtLogin] = useState(false)
  const [startupStickies, setStartupStickies] = useState<StartupSticky[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      window.noteflow.getLoginItem(),
      window.noteflow.getStartupStickies(),
    ]).then(([loginItem, stickies]) => {
      setOpenAtLogin(loginItem.openAtLogin)
      setStartupStickies(stickies)
      setLoading(false)
    })
  }, [])

  const handleToggleLogin = async (enabled: boolean) => {
    setOpenAtLogin(enabled)
    await window.noteflow.setLoginItem(enabled)
  }

  const isSectionActive = (noteId: string, sectionId: string) =>
    startupStickies.some((s) => s.noteId === noteId && s.sectionId === sectionId)

  const toggleSection = async (noteId: string, sectionId: string) => {
    const next = isSectionActive(noteId, sectionId)
      ? startupStickies.filter((s) => !(s.noteId === noteId && s.sectionId === sectionId))
      : [...startupStickies, { noteId, sectionId }]
    setStartupStickies(next)
    await window.noteflow.setStartupStickies(next)
  }

  // Encrypted notes can't be opened as sticky at startup (require password)
  const visibleNotes = notes.filter((n) => !n.archived && !n.encryption)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface-1 border border-border rounded-lg shadow-2xl w-[420px] max-h-[540px] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Monitor size={13} className="text-accent" />
            <span className="text-sm font-mono font-semibold text-text">Startup settings</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            <X size={13} />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-text-muted text-xs font-mono py-8">
            Loading...
          </div>
        ) : (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Open at login toggle */}
            <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-mono font-medium text-text">Launch on system startup</p>
                <p className="text-[10px] font-mono text-text-muted mt-0.5">
                  NoteFlow starts automatically when you turn on your computer
                </p>
              </div>
              <button
                onClick={() => handleToggleLogin(!openAtLogin)}
                title={openAtLogin ? 'Disable launch on startup' : 'Enable launch on startup'}
                className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors ${
                  openAtLogin ? 'bg-accent' : 'bg-surface-3 border border-border'
                }`}
              >
                <span
                  className={`absolute top-[2px] w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${
                    openAtLogin ? 'left-[18px]' : 'left-[2px]'
                  }`}
                />
              </button>
            </div>

            {/* Sticky notes section header */}
            <div className="px-4 py-2.5 border-b border-border">
              <div className="flex items-center gap-1.5">
                <Bookmark size={11} className="text-text-muted" />
                <span className="text-[10px] font-mono font-medium text-text-muted uppercase tracking-widest">
                  Open as sticky at startup
                </span>
              </div>
              {!openAtLogin && (
                <p className="text-[10px] font-mono text-text-muted/60 mt-1">
                  Enable "Launch on system startup" to use this feature
                </p>
              )}
            </div>

            {/* Notes list */}
            <div
              className={`flex-1 overflow-y-auto transition-opacity ${
                !openAtLogin ? 'opacity-40 pointer-events-none' : ''
              }`}
            >
              {visibleNotes.length === 0 ? (
                <div className="flex items-center justify-center h-16 text-text-muted text-xs font-mono">
                  No notes available
                </div>
              ) : (
                <ul className="py-1">
                  {visibleNotes.map((note) => {
                    const hasAnyActive = note.sections.some((s) => isSectionActive(note.id, s.id))
                    return (
                      <li key={note.id} className="px-4 py-2">
                        <span
                          className={`text-xs font-mono transition-colors ${
                            hasAnyActive ? 'text-text' : 'text-text/50'
                          }`}
                        >
                          {note.title || 'Untitled'}
                        </span>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {note.sections.map((section) => {
                            const active = isSectionActive(note.id, section.id)
                            return (
                              <button
                                key={section.id}
                                onClick={() => toggleSection(note.id, section.id)}
                                className="text-[9px] font-mono px-1.5 py-0.5 rounded transition-all"
                                style={
                                  active
                                    ? { ...getTagColor(section.name, sectionTagColors), opacity: 1, outline: '1px solid currentColor' }
                                    : { ...getTagColor(section.name, sectionTagColors), opacity: 0.35 }
                                }
                              >
                                {section.name}
                              </button>
                            )
                          })}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-border">
              <p className="text-[10px] font-mono text-text-muted/60">
                {startupStickies.length > 0
                  ? `${startupStickies.length} sticky window${startupStickies.length > 1 ? 's' : ''} will open on startup`
                  : 'No tabs selected — app will start in tray'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
