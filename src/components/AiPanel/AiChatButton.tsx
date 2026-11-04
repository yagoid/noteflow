import { BotMessageSquare } from 'lucide-react'
import { useAiChatStore } from '../../stores/aiChatStore'
import { useT } from '../../i18n/useT'
import { AI_CHAT_ANCHOR_ATTR, aiChatAnchorRef } from './aiChatAnchor'

/**
 * Chat button at the right end of the note's header (rightmost pane only). Opens/folds the
 * floating chat sidebar — the only way to fold it — or, while the chat lives in its own window,
 * brings that window to the front. It is also the sidebar's position anchor (the sidebar hangs
 * right below it). A 44 px wide, square-cornered strip: `className` places it in its header and
 * gives it that header's full height (see NoteEditor).
 */
export function AiChatButton({ className = '' }: { className?: string }) {
  const t = useT()
  const open = useAiChatStore((s) => s.sidebarOpen)
  const detached = useAiChatStore((s) => s.detached)
  const pressed = open || detached
  const label = detached ? t.aiPanel.sidebar.showWindow : open ? t.aiPanel.sidebar.close : t.aiPanel.sidebar.open
  return (
    <button
      ref={aiChatAnchorRef}
      {...{ [AI_CHAT_ANCHOR_ATTR]: '' }}
      onClick={() => {
        if (detached) window.noteflow.aiChatWindowFocus()
        else useAiChatStore.getState().setSidebarOpen(!open)
      }}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      className={`flex-shrink-0 flex items-center justify-center w-11 transition-colors ${
        pressed ? 'text-text bg-surface-3' : 'text-text-muted hover:text-text hover:bg-surface-3'
      } ${className}`}
    >
      <BotMessageSquare size={18} strokeWidth={1.25} />
    </button>
  )
}
