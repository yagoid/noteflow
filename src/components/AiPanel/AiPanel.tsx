import { useEffect, useState, type ReactNode } from 'react'
import { ExternalLink, Link2, MessageSquare, PanelLeftClose, Settings, Sparkles } from 'lucide-react'
import { useAiChatStore, type PanelTab } from '../../stores/aiChatStore'
import { useNotesStore } from '../../stores/notesStore'
import { useGroupsStore } from '../../stores/groupsStore'
import { ChatView } from './ChatView'
import { RelatedView } from './RelatedView'
import { LlmConfigView } from './LlmConfigView'
import { ProfileFlow, ProfileSummary, findAiProfileNote } from './ProfileFlow'
import { useT } from '../../i18n/useT'
import { Card } from './ui'

type Tab = PanelTab

export function AiPanel({ onOpenNote, onCollapse }: { onOpenNote: (noteId: string, sectionId: string) => void; onCollapse?: () => void }) {
  const loadConfig = useAiChatStore((s) => s.loadConfig)
  const loadSessions = useAiChatStore((s) => s.loadSessions)
  const llmConfig = useAiChatStore((s) => s.llmConfig)
  const chatDetached = useAiChatStore((s) => s.detached)
  const configLoaded = useAiChatStore((s) => s.configLoaded)
  const panelTab = useAiChatStore((s) => s.panelTab)
  const t = useT()

  // Notes + groups are synced across machines; the local settings flag is not. So we treat the
  // synced profile note (a note in the "AI generated" group) as the source of truth, and only
  // fall back to the local flag for the "skipped" state or legacy notes that predate the group.
  const notes = useNotesStore((s) => s.notes)
  const notesLoading = useNotesStore((s) => s.isLoading)
  const groups = useGroupsStore((s) => s.groups)
  const syncedProfileNote = findAiProfileNote(groups, notes)

  const [tab, setTab] = useState<Tab>('chat')
  const [profileDone, setProfileDone] = useState<boolean | null>(null) // null = unknown
  const [profileNoteId, setProfileNoteId] = useState<string | null>(null)
  const [profileEditing, setProfileEditing] = useState(false) // "Start over" reopened the wizard
  const [autoRouted, setAutoRouted] = useState(false)

  // The chat's stream listeners are set up once for the whole window (App), not here: the same
  // conversation also runs in the editor's chat sidebar.
  useEffect(() => {
    void loadConfig()
    void loadSessions()
  }, [loadConfig, loadSessions])

  // Resolve profile status once notes have loaded, so opening the Profile tab doesn't flash the
  // wizard on a machine that already has a synced profile.
  useEffect(() => {
    if (notesLoading) return
    if (syncedProfileNote) {
      setProfileDone(true)
      setProfileNoteId(syncedProfileNote.id)
      return
    }
    // No synced profile note → fall back to the local flag (covers "Not now" and legacy notes).
    window.noteflow.aiProfileGetStatus()
      .then((s) => { setProfileDone(!!s.completedAt); setProfileNoteId((prev) => prev ?? s.noteId) })
      .catch(() => setProfileDone(true))
  }, [notesLoading, syncedProfileNote?.id])

  // First-time routing once the LLM config is known: with no provider configured we land on
  // settings (onboarding); otherwise we stay on chat. The profile wizard is never auto-opened —
  // the user reaches it by clicking the "Profile" tab (or from the command palette).
  useEffect(() => {
    if (autoRouted || !configLoaded) return
    setAutoRouted(true)
    if (!llmConfig?.configured) setTab('settings')
  }, [autoRouted, configLoaded, llmConfig?.configured])

  // Explicit routing from the command palette wins over the first-time auto-routing above.
  useEffect(() => {
    if (!panelTab) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTab(panelTab)
    setAutoRouted(true)
    useAiChatStore.setState({ panelTab: null })
  }, [panelTab])

  const TABS: { id: Tab; icon: ReactNode; label: string }[] = [
    { id: 'chat', icon: <MessageSquare size={13} />, label: t.aiPanel.tabs.chat },
    { id: 'related', icon: <Link2 size={13} />, label: t.aiPanel.tabs.related },
    { id: 'profile', icon: <Sparkles size={13} />, label: t.aiPanel.tabs.profile },
  ]

  return (
    <div className="flex flex-col h-full min-h-0 border-r border-border" style={{ background: 'rgb(var(--bg-1))' }}>
      {/* Tab bar */}
      <div className="flex-shrink-0 flex items-center gap-1 px-2 h-9 border-b border-border">
        {TABS.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[12px] font-mono transition-colors ${
              tab === item.id ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text hover:bg-surface-2'
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
        <button
          onClick={() => setTab('settings')}
          title={t.aiPanel.providerTooltip}
          className={`ml-auto flex items-center justify-center w-7 h-7 rounded-lg transition-colors ${
            tab === 'settings' ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text hover:bg-surface-2'
          }`}
        >
          <Settings size={13} />
        </button>
        {onCollapse && (
          <button
            onClick={onCollapse}
            title={t.aiPanel.collapse}
            className="flex items-center justify-center w-7 h-7 rounded text-text-muted hover:text-text transition-colors"
          >
            <PanelLeftClose size={13} />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0">
        {tab === 'chat' && (chatDetached ? (
          // The conversation lives in the detached chat window: only one window may own it.
          <div className="flex items-center justify-center h-full p-5">
            <Card className="flex flex-col items-center gap-3 p-6 max-w-[260px] text-center">
              <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-accent/15 text-accent">
                <ExternalLink size={18} />
              </span>
              <p className="text-[13px] font-mono text-text-muted leading-relaxed">{t.aiPanel.window.detachedHint}</p>
              <div className="flex flex-wrap justify-center gap-1.5">
                <button
                  onClick={() => window.noteflow.aiChatWindowFocus()}
                  className="px-3 py-1.5 rounded-lg bg-text text-surface-0 text-[12px] font-mono font-bold hover:opacity-90"
                >
                  {t.aiPanel.window.showWindow}
                </button>
                <button
                  onClick={() => window.noteflow.aiChatWindowRecall()}
                  className="px-3 py-1.5 rounded-lg bg-surface-2 text-text text-[12px] font-mono hover:bg-surface-3 transition-colors"
                >
                  {t.aiPanel.window.bringBack}
                </button>
              </div>
            </Card>
          </div>
        ) : (
          <ChatView onOpenNote={onOpenNote} onConfigure={() => setTab('settings')} />
        ))}
        {tab === 'related' && <RelatedView onOpenNote={onOpenNote} />}
        {tab === 'profile' && (
          profileDone && profileNoteId && !profileEditing ? (
            <ProfileSummary
              noteId={profileNoteId}
              onOpenNote={onOpenNote}
              onStartOver={() => setProfileEditing(true)}
            />
          ) : (
            <ProfileFlow
              existingNoteId={profileNoteId}
              onDone={(noteId) => {
                setProfileDone(true)
                setProfileNoteId(noteId)
                setProfileEditing(false)
                setTab('chat')
              }}
            />
          )
        )}
        {tab === 'settings' && <LlmConfigView />}
      </div>
    </div>
  )
}
