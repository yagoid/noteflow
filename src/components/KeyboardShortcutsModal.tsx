import { X } from 'lucide-react'

interface ShortcutEntry {
  keys: string[]
  description: string
}

interface ShortcutSection {
  title: string
  shortcuts: ShortcutEntry[]
}

const SECTIONS: ShortcutSection[] = [
  {
    title: 'App',
    shortcuts: [
      { keys: ['Ctrl', 'Shift', 'Space'], description: 'Show / hide app (global)' },
      { keys: ['Ctrl', 'N'], description: 'New note' },
      { keys: ['Ctrl', 'Shift', 'F'], description: 'Search all notes' },
      { keys: ['Ctrl', '\''], description: 'Toggle sidebar' },
      { keys: ['Ctrl', 'Click'], description: 'Open note side by side' },
    ],
  },
  {
    title: 'Sections',
    shortcuts: [
      { keys: ['Ctrl', 'T'], description: 'New section' },
      { keys: ['Ctrl', 'W'], description: 'Delete section' },
      { keys: ['Ctrl', 'Tab'], description: 'Next section' },
      { keys: ['Ctrl', 'Shift', 'Tab'], description: 'Previous section' },
      { keys: ['Delete'], description: 'Delete selected note (when not editing)' },
    ],
  },
  {
    title: 'Sticky notes',
    shortcuts: [
      { keys: ['Ctrl', 'S'], description: 'Open current section as sticky' },
      { keys: ['Ctrl', 'G'], description: 'Open all sections as sticky' },
    ],
  },
  {
    title: 'Editor',
    shortcuts: [
      { keys: ['Ctrl', 'Z'], description: 'Undo' },
      { keys: ['Ctrl', 'Y'], description: 'Redo' },
      { keys: ['Ctrl', 'B'], description: 'Bold' },
      { keys: ['Ctrl', 'I'], description: 'Italic' },
      { keys: ['Ctrl', 'U'], description: 'Underline' },
      { keys: ['Ctrl', 'E'], description: 'Inline code' },
      { keys: ['Ctrl', 'Shift', 'B'], description: 'Code block' },
      { keys: ['Ctrl', 'F'], description: 'Find in note' },
      { keys: ['Ctrl', 'M'], description: 'Toggle Markdown / rich-text mode' },
    ],
  },
  {
    title: 'Font size',
    shortcuts: [
      { keys: ['Ctrl', '+'], description: 'Increase font size' },
      { keys: ['Ctrl', '-'], description: 'Decrease font size' },
      { keys: ['Ctrl', '0'], description: 'Reset font size' },
    ],
  },
]

interface Props {
  onClose: () => void
}

export function KeyboardShortcutsModal({ onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-surface-1 border border-border rounded-lg shadow-2xl w-[480px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-xs font-mono text-text-muted uppercase tracking-widest">Keyboard shortcuts</span>
          <button
            onClick={onClose}
            className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            <X size={13} />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-4 space-y-4">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <div className="text-[10px] font-mono text-text-muted/70 uppercase tracking-widest mb-2">
                {section.title}
              </div>
              <div className="space-y-0.5">
                {section.shortcuts.map((s) => (
                  <div key={s.description} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-surface-2 transition-colors">
                    <span className="text-xs font-mono text-text">{s.description}</span>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-4">
                      {s.keys.map((k, i) => (
                        <span key={i} className="flex items-center gap-1">
                          <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-surface-3 border border-border rounded text-text-muted">
                            {k}
                          </kbd>
                          {i < s.keys.length - 1 && (
                            <span className="text-[10px] text-text-muted/40">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
