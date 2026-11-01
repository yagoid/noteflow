import { describe, it, expect } from 'vitest'
import { reconcileHandoff } from '../../src/lib/chatHandoff'
import type { ChatHandoff, ChatSession } from '../../src/types'

const handoff = (over: Partial<ChatHandoff> = {}): ChatHandoff => ({
  messages: [{ id: 'u1', role: 'user', content: 'old question' }],
  activeSessionId: 's1',
  draft: 'typing…',
  context: { allNotes: false, items: [{ kind: 'note', noteId: 'n1' }] },
  contextPinned: true,
  suggestions: ['Do more'],
  pendingAttachments: [],
  takenAt: '2026-11-01T10:00:00.000Z',
  ...over,
})

const session = (updatedAt: string): ChatSession => ({
  id: 's1', title: 't', createdAt: '2026-11-01T09:00:00.000Z', updatedAt,
  messages: [
    { id: 'u1', role: 'user', content: 'old question' },
    { id: 'a1', role: 'assistant', content: 'answer given in the window' },
  ],
})

describe('reconcileHandoff', () => {
  it('keeps a current handoff (saved session older than it)', () => {
    const h = handoff()
    expect(reconcileHandoff(h, [session('2026-11-01T09:59:00.000Z')])).toBe(h)
  })

  it('takes the saved turns when the session was saved after the handoff (crash reload)', () => {
    const out = reconcileHandoff(handoff(), [session('2026-11-01T10:05:00.000Z')])
    expect(out.messages).toHaveLength(2)
    expect(out.messages[1].content).toBe('answer given in the window')
    expect(out.suggestions).toEqual([])
    // the rest of the local state stays
    expect(out.draft).toBe('typing…')
    expect(out.context.items).toEqual([{ kind: 'note', noteId: 'n1' }])
  })

  it('always prefers the saved session over a frozen copy without timestamp (window never answered)', () => {
    const out = reconcileHandoff(handoff({ takenAt: undefined }), [session('2026-11-01T08:00:00.000Z')])
    expect(out.messages).toHaveLength(2)
  })

  it('keeps the handoff with no active session or when the session is gone', () => {
    const fresh = handoff({ activeSessionId: null })
    expect(reconcileHandoff(fresh, [session('2026-11-02T00:00:00.000Z')])).toBe(fresh)
    const h = handoff({ takenAt: undefined })
    expect(reconcileHandoff(h, [])).toBe(h)
  })
})
