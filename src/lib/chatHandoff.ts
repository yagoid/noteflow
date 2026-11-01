// Moving the chat conversation between the main window and the detached chat window — pure logic.
// A handoff can be stale: the chat window may die without handing the conversation back (main
// then returns null and the main window falls back to the copy it froze when detaching), or it
// may reload after a crash and receive again the handoff taken at detach time. In both cases the
// turns made since were already saved to ai-chats.json, and the stale copy's next `persist()`
// would overwrite them. So the saved session wins when it is newer than the handoff.
import type { ChatHandoff, ChatSession } from '../types'

/**
 * The handoff to import, given the sessions just read from disk: if its active session was saved
 * after the handoff was taken (or the handoff has no timestamp — a frozen local copy), the saved
 * messages replace the handoff's (draft, context and attachments are kept). Returns the input when
 * the handoff is current, has no saved session, or the session is gone.
 */
export function reconcileHandoff(handoff: ChatHandoff, sessions: ChatSession[]): ChatHandoff {
  if (!handoff.activeSessionId) return handoff
  const saved = sessions.find((s) => s.id === handoff.activeSessionId)
  if (!saved) return handoff
  if (handoff.takenAt && !(saved.updatedAt > handoff.takenAt)) return handoff
  return { ...handoff, messages: saved.messages.map((m) => ({ ...m })), suggestions: [] }
}
