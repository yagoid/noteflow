import { useEffect, useState } from 'react'
import {
  Database,
  Globe,
  GraduationCap,
  Info,
  Keyboard,
  LayoutTemplate,
  Monitor,
  Palette,
  Pencil,
  RefreshCw,
  Settings,
  Sparkles,
  UserCircle,
  X,
} from 'lucide-react'
import { useT } from '../../i18n/useT'
import { GeneralPanel } from './GeneralPanel'
import { AccountPanel } from './AccountPanel'
import { AppearancePanel } from './AppearancePanel'
import { EditorPanel } from './EditorPanel'
import { StartupPanel } from './StartupPanel'
import { SyncPanel } from './SyncPanel'
import { DataPanel } from './DataPanel'
import { ShortcutsPanel } from './ShortcutsPanel'
import { AboutPanel } from './AboutPanel'
import { AiPanel } from './AiPanel'
import { TemplatesPanel } from './TemplatesPanel'
import { TutorialPanel } from './TutorialPanel'

export type SettingsSection =
  | 'general'
  | 'ai'
  | 'sync'
  | 'account'
  | 'appearance'
  | 'editor'
  | 'templates'
  | 'data'
  | 'startup'
  | 'shortcuts'
  | 'tutorial'
  | 'about'

interface NavEntry {
  id: SettingsSection
  icon: React.ComponentType<{ size?: number; className?: string }>
}

type NavGroupId = 'preferences' | 'services' | 'notes' | 'help'

interface NavGroup {
  id: NavGroupId
  entries: NavEntry[]
}

// Icon + order only; labels (section and group titles) come from the dictionary
// (keyed by id) so the nav switches language live. Groups render as a small
// title plus a gap; the first entry of the first group is the default
// section (see `initialSection`).
const NAV: NavGroup[] = [
  {
    id: 'preferences',
    entries: [
      { id: 'general', icon: Globe },
      { id: 'appearance', icon: Palette },
      { id: 'editor', icon: Pencil },
    ],
  },
  {
    id: 'services',
    entries: [
      { id: 'sync', icon: RefreshCw },
      { id: 'ai', icon: Sparkles },
      { id: 'account', icon: UserCircle },
    ],
  },
  {
    id: 'notes',
    entries: [
      { id: 'data', icon: Database },
      { id: 'startup', icon: Monitor },
      { id: 'templates', icon: LayoutTemplate },
    ],
  },
  {
    id: 'help',
    entries: [
      { id: 'tutorial', icon: GraduationCap },
      { id: 'shortcuts', icon: Keyboard },
      { id: 'about', icon: Info },
    ],
  },
]

interface SettingsModalProps {
  initialSection?: SettingsSection
  onClose: () => void
  onOpenExportImport: (mode: 'export' | 'import') => void
}

export function SettingsModal({ initialSection = 'general', onClose, onOpenExportImport }: SettingsModalProps) {
  const [section, setSection] = useState<SettingsSection>(initialSection)
  const t = useT()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const activeLabel = t.settings.nav[section]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-surface-1 border border-border rounded-lg shadow-2xl w-[min(1040px,94vw)] h-[min(760px,92vh)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Settings size={13} className="text-text" />
            <span className="text-sm font-mono font-semibold text-text">{t.settings.title}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            <X size={13} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* ── Nav ──────────────────────────────────────────────────────── */}
          <nav className="w-[200px] flex-shrink-0 border-r border-border p-2 overflow-y-auto">
            {NAV.map((group, gi) => (
              <div key={group.id} className={gi > 0 ? 'mt-4' : undefined}>
                <h3 className="pl-1.5 pr-2.5 pb-1 text-[11px] font-mono text-text-muted/75 truncate">
                  {t.settings.navGroups[group.id]}
                </h3>
                {group.entries.map((entry) => {
                  const Icon = entry.icon
                  const active = entry.id === section
                  return (
                    <button
                      key={entry.id}
                      onClick={() => setSection(entry.id)}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-mono text-left transition-colors ${
                        active
                          ? 'bg-surface-3 text-text'
                          : 'text-text/85 hover:text-text hover:bg-surface-2'
                      }`}
                    >
                      <Icon size={13} className="flex-shrink-0" />
                      <span className="truncate">{t.settings.nav[entry.id]}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>

          {/* ── Content ──────────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 flex flex-col">
            {/* Title of the section being viewed: the top of the hierarchy inside the
                window (subsection headers below use the smaller SectionTitle). */}
            <div className="px-5 pt-4 pb-3">
              <h2 className="text-sm font-mono font-semibold text-text">{activeLabel}</h2>
            </div>
            {/* Opaque background (the window's own colour): lets Chromium scroll this on the
                compositor on standard-DPI screens instead of repainting it on every scroll frame. */}
            <div className="settings-content flex-1 overflow-y-auto px-5 py-5 bg-surface-1">
              {section === 'general' && <GeneralPanel onClose={onClose} />}
              {section === 'ai' && <AiPanel onNavigate={setSection} />}
              {section === 'sync' && <SyncPanel onNavigate={setSection} />}
              {section === 'account' && <AccountPanel />}
              {section === 'appearance' && <AppearancePanel />}
              {section === 'editor' && <EditorPanel />}
              {section === 'templates' && <TemplatesPanel onClose={onClose} />}
              {section === 'data' && <DataPanel onOpenExportImport={onOpenExportImport} />}
              {section === 'startup' && <StartupPanel />}
              {section === 'shortcuts' && <ShortcutsPanel />}
              {section === 'tutorial' && <TutorialPanel />}
              {section === 'about' && <AboutPanel />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
