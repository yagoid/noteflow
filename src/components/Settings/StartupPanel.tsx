import { useEffect, useState } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import { getTagColor } from '../../lib/tagColors'
import { useSectionTagColorsStore } from '../../stores/sectionTagColorsStore'
import { plural } from '../../i18n/format'
import { useT } from '../../i18n/useT'
import { SectionTitle } from './ui'

interface StartupSticky {
  noteId: string
  sectionId: string
}

export function StartupPanel() {
  const notes = useNotesStore((s) => s.notes)
  const sectionTagColors = useSectionTagColorsStore((s) => s.sectionTagColors)
  const t = useT()
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

  if (loading) {
    return (
      <div className="flex items-center justify-center text-text-muted text-xs font-mono py-8">
        {t.common.loading}
      </div>
    )
  }

  return (
    <div className="settings-rows space-y-6">
      {/* Open at login toggle */}
      <section className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-mono font-medium text-text">{t.settings.startup.launchOnStartup}</p>
          <p className="text-[11px] font-mono text-text-muted mt-1">
            {t.settings.startup.launchOnStartupHint}
          </p>
        </div>
        <button
          onClick={() => handleToggleLogin(!openAtLogin)}
          title={openAtLogin ? t.settings.startup.disableLaunch : t.settings.startup.enableLaunch}
          className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors ${
            openAtLogin ? 'bg-text/70' : 'bg-surface-3 border border-border'
          }`}
        >
          <span
            className={`absolute top-[2px] w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${
              openAtLogin ? 'left-[18px]' : 'left-[2px]'
            }`}
          />
        </button>
      </section>

      {/* Sticky notes section */}
      <section>
        <SectionTitle>
          {t.settings.startup.openAsSticky}
        </SectionTitle>
        {!openAtLogin && (
          <p className="text-[11px] font-mono text-text-muted/60 mb-2">
            {t.settings.startup.enableToUse}
          </p>
        )}

        <div className={`transition-opacity ${!openAtLogin ? 'opacity-40 pointer-events-none' : ''}`}>
          {visibleNotes.length === 0 ? (
            <div className="flex items-center justify-center h-16 text-text-muted text-xs font-mono">
              {t.settings.startup.noNotesAvailable}
            </div>
          ) : (
            <ul className="space-y-2">
              {visibleNotes.map((note) => {
                const hasAnyActive = note.sections.some((s) => isSectionActive(note.id, s.id))
                return (
                  <li key={note.id}>
                    <span
                      className={`text-xs font-mono transition-colors ${
                        hasAnyActive ? 'text-text' : 'text-text/50'
                      }`}
                    >
                      {note.title || t.common.untitled}
                    </span>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {note.sections.map((section) => {
                        const active = isSectionActive(note.id, section.id)
                        return (
                          <button
                            key={section.id}
                            onClick={() => toggleSection(note.id, section.id)}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded transition-all"
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

        <p className="text-[11px] font-mono text-text-muted/60 mt-3">
          {startupStickies.length > 0
            ? plural(t.settings.startup.willOpen, startupStickies.length)
            : t.settings.startup.noTabsSelected}
        </p>
      </section>
    </div>
  )
}
