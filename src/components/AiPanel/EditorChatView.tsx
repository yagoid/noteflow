import type { ReactNode } from 'react'
import { ChatView, type ChatHeaderControls } from './ChatView'
import { ChatContextBar } from './ChatContextBar'

/**
 * The editor chat: the same conversation in the editor sidebar (AiChatSidebar) and in the detached
 * window (AiChatWindowApp). Single place for what sets it apart from the brain chat: compact, the
 * context bar + context in the payload, no "Ask AI" auto-send (the brain consumes `pendingPrompt`)
 * and no prompt chips (starters / follow-ups — the brain keeps them).
 */
export function EditorChatView({
  onOpenNote,
  onConfigure,
  renderHeader,
}: {
  onOpenNote: (noteId: string, sectionId: string) => void
  onConfigure: () => void
  renderHeader: (controls: ChatHeaderControls) => ReactNode
}) {
  return (
    <ChatView
      compact
      withContext
      autoSendPendingPrompt={false}
      showSuggestions={false}
      onOpenNote={onOpenNote}
      onConfigure={onConfigure}
      contextBar={<ChatContextBar />}
      renderHeader={renderHeader}
    />
  )
}
