import { keyLabel } from '../../lib/platform'
import { useT } from '../../i18n/useT'
import { SectionTitle } from './ui'
import type { Messages } from '../../i18n'

interface ShortcutEntry {
  keys: string[]
  description: string
}

interface ShortcutSection {
  title: string
  shortcuts: ShortcutEntry[]
}

// Built from the dictionary at render time so the list re-localises on language
// change. Key combos stay literal (never translated).
function buildSections(t: Messages): ShortcutSection[] {
  const s = t.settings.shortcuts
  return [
    {
      title: s.appSection,
      shortcuts: [
        { keys: ['Ctrl', 'Shift', 'Space'], description: s.showHideApp },
        { keys: ['Ctrl', 'P'], description: s.commandPalette },
        { keys: ['Ctrl', 'N'], description: s.newNote },
        { keys: ['Ctrl', 'Shift', 'N'], description: s.newTempNote },
        { keys: ['Ctrl', 'Shift', 'F'], description: s.searchAllNotes },
        { keys: ['Ctrl', '\''], description: s.toggleSidebar },
        { keys: ['Ctrl', 'Click'], description: s.openSideBySide },
      ],
    },
    {
      title: s.sectionsSection,
      shortcuts: [
        { keys: ['Ctrl', 'T'], description: s.newSectionShortcut },
        { keys: ['Ctrl', 'W'], description: s.deleteSectionShortcut },
        { keys: ['Control', 'Tab'], description: s.nextSection },
        { keys: ['Control', 'Shift', 'Tab'], description: s.prevSection },
        { keys: ['Ctrl', 'A'], description: s.selectAllSections },
        { keys: ['Delete'], description: s.deleteSelectedNote },
      ],
    },
    {
      title: s.stickySection,
      shortcuts: [
        { keys: ['Ctrl', 'S'], description: s.openSectionSticky },
        { keys: ['Ctrl', 'G'], description: s.openAllSticky },
      ],
    },
    {
      title: s.editorSection,
      shortcuts: [
        { keys: ['Ctrl', 'Z'], description: s.undo },
        { keys: ['Ctrl', 'Y'], description: s.redo },
        { keys: ['Ctrl', 'B'], description: s.bold },
        { keys: ['Ctrl', 'I'], description: s.italic },
        { keys: ['Ctrl', 'U'], description: s.underline },
        { keys: ['Ctrl', 'E'], description: s.inlineCode },
        { keys: ['Ctrl', 'Shift', 'B'], description: s.codeBlock },
        { keys: ['Ctrl', 'F'], description: s.findInNote },
        { keys: ['Ctrl', 'M'], description: s.toggleMarkdown },
      ],
    },
    {
      title: s.fontSizeSection,
      shortcuts: [
        { keys: ['Ctrl', '+'], description: s.increaseFontSize },
        { keys: ['Ctrl', '-'], description: s.decreaseFontSize },
        { keys: ['Ctrl', '0'], description: s.resetFontSize },
      ],
    },
  ]
}

export function ShortcutsPanel() {
  const t = useT()
  const sections = buildSections(t)

  return (
    <div className="settings-rows space-y-6">
      {sections.map((section) => (
        <section key={section.title}>
          <SectionTitle>{section.title}</SectionTitle>
          <div className="space-y-0.5">
            {section.shortcuts.map((s) => (
              <div key={s.description} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-surface-2 transition-colors">
                <span className="text-xs font-mono text-text">{s.description}</span>
                <div className="flex items-center gap-1 flex-shrink-0 ml-4">
                  {s.keys.map((k, i) => (
                    <span key={i} className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 text-[11px] font-mono bg-surface-3 border border-border rounded text-text-muted">
                        {keyLabel(k)}
                      </kbd>
                      {i < s.keys.length - 1 && (
                        <span className="text-[11px] text-text-muted/40">+</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
