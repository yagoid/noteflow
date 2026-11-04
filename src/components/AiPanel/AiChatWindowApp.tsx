import { useCallback, useEffect, useRef, useState } from 'react'
import { History, Loader2, PanelRightClose, Pin, Plus, Sparkles, X } from 'lucide-react'
import { useAiChatStore } from '../../stores/aiChatStore'
import { useNotesStore } from '../../stores/notesStore'
import { useSectionTagColorsStore } from '../../stores/sectionTagColorsStore'
import { useThemeStore } from '../../stores/themeStore'
import { useEditorSettingsStore } from '../../stores/editorSettingsStore'
import { useT } from '../../i18n/useT'
import { ChatView } from './ChatView'
import { ChatContextBar } from './ChatContextBar'
import { ChatMoreMenu } from './ChatMoreMenu'
import { reconcileHandoff } from '../../lib/chatHandoff'

const drag = { WebkitAppRegion: 'drag' } as React.CSSProperties
const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

/**
 * The editor chat detached into its own window (`#ai-chat`, created by main's createChatWindow).
 * The conversation MOVED here from the main window: it is taken from main on load and handed back
 * when the window closes (its close button, "Back to the main window" or an OS close, which main
 * turns into `ai:chat-window-request-close`). A running reply is cancelled before handing back.
 *
 * Secondary window (store role 'section'): it loads the notes only for the context chips, the
 * starter suggestions and the hover previews; the context bar follows the note/section open in
 * the MAIN window, relayed by main. Opening a note or the AI settings is done by the main window.
 */
export function AiChatWindowApp() {
  const t = useT()
  const newChat = useAiChatStore((s) => s.newChat)
  const [ready, setReady] = useState(false)
  const [pinned, setPinned] = useState(false)
  const givenBackRef = useRef(false)

  const giveBack = useCallback(() => {
    if (givenBackRef.current) return
    givenBackRef.current = true
    const chat = useAiChatStore.getState()
    if (chat.streaming || chat.pendingConfirm) chat.cancel()
    window.noteflow.aiChatWindowReturn(chat.exportHandoff())
  }, [])

  useEffect(() => {
    document.title = `NoteFlow — ${t.aiPanel.sidebar.title}`
  }, [t])

  // Notes (chips, starters, previews) + live sync, like the section window.
  useEffect(() => {
    const loadAll = () => Promise.all([
      useNotesStore.getState().loadNotes(),
      useSectionTagColorsStore.getState().loadSectionTagColors(),
    ])
    void loadAll()
    const currentWindowId = typeof window.noteflow?.windowId === 'function' ? window.noteflow.windowId() : null
    return window.noteflow.onNotesUpdated((filePath, senderId) => {
      if (currentWindowId !== null && senderId === currentWindowId) return
      if (filePath) {
        void useNotesStore.getState().syncNote(filePath)
      } else {
        void loadAll()
        useThemeStore.getState().reloadUiSettings()
        useEditorSettingsStore.getState().reloadUiSettings()
      }
    })
  }, [])

  // Chat: provider config, history, stream listeners, then the conversation handed over by main.
  useEffect(() => {
    const chat = useAiChatStore.getState()
    void chat.loadConfig()
    const offListeners = chat.initListeners()
    let cancelled = false
    void (async () => {
      await chat.loadSessions()
      const { handoff, editorTarget } = await window.noteflow.aiChatWindowGetState()
      if (cancelled) return
      // After a crash reload main serves the handoff taken at detach time again: a newer saved
      // session (turns made here before the crash) wins over it (lib/chatHandoff).
      if (handoff) useAiChatStore.getState().importHandoff(reconcileHandoff(handoff, useAiChatStore.getState().sessions))
      useAiChatStore.getState().setEditorTarget(editorTarget)
      setReady(true)
    })()
    const offTarget = window.noteflow.onAiChatWindowEditorTarget((target) => useAiChatStore.getState().setEditorTarget(target))
    const offClose = window.noteflow.onAiChatWindowRequestClose(giveBack)
    // "Ask AI" from the main window's command palette.
    const offAsk = window.noteflow.onAiChatWindowAsk((prompt) => useAiChatStore.getState().askInNewChat(prompt))
    // New NoteFlow AI catalog, or an account change (main switches the active provider on
    // sign-out / subscribe): re-pull the LLM config so the chat shows what will really run.
    const reloadConfig = () => {
      if (useAiChatStore.getState().configLoaded) void useAiChatStore.getState().loadConfig()
    }
    const offPresets = window.noteflow.onAiLlmPresetsChanged(reloadConfig)
    const offAccount = window.noteflow.onAccountStatusChanged(reloadConfig)
    return () => { cancelled = true; offListeners(); offTarget(); offClose(); offAsk(); offPresets(); offAccount() }
  }, [giveBack])

  const openNote = useCallback((noteId: string, sectionId: string) => {
    window.noteflow.aiChatWindowCommand({ type: 'open-note', noteId, sectionId })
  }, [])
  const openAiSettings = useCallback(() => {
    window.noteflow.aiChatWindowCommand({ type: 'open-ai-settings' })
  }, [])

  const togglePinned = () => {
    const next = !pinned
    setPinned(next)
    window.noteflow.setAlwaysOnTop(next)
  }

  const iconBtn = 'shrink-0 flex items-center justify-center w-7 h-7 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors'
  const titleBar = (controls?: { modelPicker: React.ReactNode | null; toggleHistory: () => void; closeHistory: () => void }) => (
    <div className="flex-shrink-0 flex items-center gap-1 pl-3 pr-1 h-10 border-b border-border select-none" style={drag}>
      <Sparkles size={13} className="shrink-0 text-accent" />
      <span className="text-[12px] font-mono font-semibold text-text truncate">{t.aiPanel.sidebar.title}</span>
      <div className="ml-auto flex items-center gap-0.5 min-w-0" style={noDrag}>
        {controls?.modelPicker}
        {controls && (
          <ChatMoreMenu
            items={[
              { label: t.aiPanel.window.returnToMain, icon: <PanelRightClose size={13} />, onClick: giveBack },
              { label: t.aiPanel.chat.newChat, icon: <Plus size={13} />, onClick: () => { newChat(); controls.closeHistory() } },
              { label: t.aiPanel.sidebar.history, icon: <History size={13} />, onClick: controls.toggleHistory },
            ]}
          />
        )}
        <button
          onClick={togglePinned}
          title={pinned ? t.aiPanel.window.unpin : t.aiPanel.window.pin}
          aria-label={t.aiPanel.window.pin}
          aria-pressed={pinned}
          className={`${iconBtn} ${pinned ? 'text-accent bg-accent/10 hover:text-accent' : ''}`}
        >
          <Pin size={13} />
        </button>
        <button
          onClick={giveBack}
          title={t.common.close}
          aria-label={t.common.close}
          className="shrink-0 flex items-center justify-center w-8 h-7 rounded-lg text-text-muted hover:bg-red-500 hover:text-white transition-colors"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-screen bg-surface-1 text-text overflow-hidden">
      {ready ? (
        <div className="flex-1 min-h-0">
          <ChatView
            compact
            withContext
            autoSendPendingPrompt={false}
            onOpenNote={openNote}
            onConfigure={openAiSettings}
            contextBar={<ChatContextBar />}
            renderHeader={(c) => titleBar(c)}
          />
        </div>
      ) : (
        <>
          {titleBar()}
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={16} className="animate-spin text-text-muted" />
          </div>
        </>
      )}
    </div>
  )
}
