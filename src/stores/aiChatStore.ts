import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { splitSuggestions } from '../lib/chatSuggestions'
import {
  EMPTY_CONTEXT, contextAfterTargetChange, contextPayload, defaultContext, removeContextItem, sameEditorTarget, setAllNotes,
  toggleContextItem,
} from '../lib/chatContext'
import type {
  LlmConfigPublic, LlmPreset, ChatMessage, ChatSource, ChatSession, ChatToolActivity, ChatPendingConfirm, ChatAttachment,
  ChatContextItem, ChatContextState, ChatEditorTarget, ChatHandoff, ChatUndoResult,
} from '../types'

export interface ChatTurn {
  id: string
  role: 'user' | 'assistant'
  content: string
  error?: boolean      // the whole turn IS the error (nothing was written before it failed)
  errorText?: string   // failure that landed AFTER some text — shown next to the partial answer
  actions?: ChatToolActivity[]
  attachments?: ChatAttachment[]
}

/** Tabs of the AI panel — shared so the command palette can route to one. */
export type PanelTab = 'chat' | 'related' | 'profile' | 'settings'

export interface ProfilePickedFile { id: string; name: string; kind: 'pdf' | 'image' | 'text'; sizeBytes: number }

/**
 * The profile wizard's in-progress answers. Lifted out of ProfileFlow's local state so they
 * survive the component unmounting when the user switches tabs (e.g. hops to Settings to fix the
 * provider after a failed generate, then comes back). Session-scoped on purpose: the attached
 * files' bytes live in main's cache, which is itself cleared on app restart.
 */
export interface ProfileDraft {
  values: Record<string, string | string[]>
  files: ProfilePickedFile[]
  urls: string[]
  urlInput: string
}

const EMPTY_PROFILE_DRAFT: ProfileDraft = { values: {}, files: [], urls: [], urlInput: '' }

interface LlmConfigPatch {
  active?: string
  model?: string
  baseUrl?: string
  apiKey?: string
  clearKey?: boolean
}

interface AiChatState {
  // ── LLM provider config ──
  llmConfig: LlmConfigPublic | null
  presets: LlmPreset[]
  configLoaded: boolean
  models: string[] // fetched models for the active provider (merged with suggested in the UI)
  modelsLoading: boolean
  loadConfig: () => Promise<void>
  setLlmConfig: (patch: LlmConfigPatch) => Promise<LlmConfigPublic>
  refreshModels: () => Promise<{ ok: boolean; error?: string }>
  testConnection: () => Promise<{ ok: boolean; error?: string }>

  // ── Chat ──
  draft: string // composer text, kept here so it survives ChatView unmount/remount
  setDraft: (text: string) => void
  pendingAttachments: ChatAttachment[] // files picked for the next message (bytes live in main)
  pickAttachments: () => Promise<void>
  removeAttachment: (id: string) => void
  messages: ChatTurn[]
  streaming: boolean
  // True while the model is working but not currently emitting text and no tool is running —
  // i.e. the initial think AND the gaps between agent steps (e.g. composing the final answer
  // after a tool ran). Drives the "Thinking…" row so a mid-turn pause never reads as "done".
  awaitingModelText: boolean
  // Timestamp (ms) of the last text delta of the current turn, null until the first one. ChatView's
  // activity cue uses it to notice a stalled stream (e.g. the model generating tool-call arguments
  // after a preamble) and fall back to "Thinking…" — so the reply never looks finished while it isn't.
  lastDeltaAt: number | null
  currentRequestId: string | null
  activeSources: ChatSource[]
  pendingConfirm: ChatPendingConfirm | null
  suggestions: string[] // next-action prompts parsed from the last assistant reply
  // withContext: the editor sidebar / chat window send their context bar (explicit notes/sections,
  // RAG only with "all notes"); the brain chat sends none → RAG over every note, as always.
  sendMessage: (text: string, opts?: { withContext?: boolean }) => void
  cancel: () => void
  confirmAction: (approved: boolean) => void
  // Undo a note edit of the agent (snapshot in main). Marks the activity row 'done' on success.
  undoToolCall: (toolCallId: string, force?: boolean) => Promise<ChatUndoResult>

  // ── Context bar (editor sidebar / chat window — lib/chatContext) ──
  context: ChatContextState
  // False while the context is the untouched default of a chat with no messages: then it follows
  // the open section (lib/chatContext.contextAfterTargetChange). Touching the bar or sending the
  // first message pins it; new chat / opening a session unpins it again.
  contextPinned: boolean
  editorTarget: ChatEditorTarget | null // note/section open in the main window's active pane
  setEditorTarget: (target: ChatEditorTarget | null) => void
  toggleContextItem: (item: ChatContextItem) => void
  removeContextItem: (item: ChatContextItem) => void
  setAllNotes: (on: boolean) => void

  // ── Editor sidebar / detached window (main window) ──
  sidebarOpen: boolean // folded by default on every start (not persisted)
  setSidebarOpen: (open: boolean) => void
  detached: boolean    // the conversation lives in the detached chat window right now
  setDetached: (detached: boolean) => void
  exportHandoff: () => ChatHandoff
  importHandoff: (handoff: ChatHandoff) => void
  // Move the conversation to the detached chat window (not while a reply streams or waits for a confirmation).
  detachChat: () => Promise<void>

  // ── Sessions (history) ──
  sessions: ChatSession[]
  activeSessionId: string | null
  loadSessions: () => Promise<void>
  newChat: () => void
  openSession: (id: string) => void
  deleteSession: (id: string) => void

  // ── Profile wizard draft (session-scoped; survives tab switches, not app restart) ──
  profileDraft: ProfileDraft
  setProfileDraft: (updater: (prev: ProfileDraft) => ProfileDraft) => void
  resetProfileDraft: () => void

  // ── AI panel routing (driven by the command palette) ──
  panelTab: PanelTab | null      // requested initial tab — consumed by AiPanel
  pendingPrompt: string | null   // a question to auto-send once chat is ready — consumed by ChatView
  // With a prompt while the chat is detached, the prompt goes to the chat window instead.
  openAiPanel: (tab: PanelTab, prompt?: string) => void
  // Detached chat window: "Ask AI" from the main window's palette → new chat asking `prompt`.
  askInNewChat: (prompt: string) => void

  initListeners: () => () => void
}

export const useAiChatStore = create<AiChatState>((set, get) => {
  // Persist the current conversation into the sessions list (create or update).
  const persist = () => {
    const msgs = get().messages
    if (msgs.length === 0) return
    const now = new Date().toISOString()
    const title = (msgs.find((m) => m.role === 'user')?.content ?? 'Chat').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Chat'
    let id = get().activeSessionId
    let sessions = get().sessions.slice()
    if (!id) {
      id = nanoid()
      sessions = [{ id, title, createdAt: now, updatedAt: now, messages: msgs }, ...sessions]
      set({ activeSessionId: id })
    } else {
      const sid = id
      sessions = sessions.map((s) => (s.id === sid ? { ...s, updatedAt: now, messages: msgs } : s))
    }
    set({ sessions })
    void window.noteflow.aiChatsSave(sessions)
  }

  // A fresh conversation's context: the section open now, following it until pinned.
  const freshContext = () => ({ context: defaultContext(get().editorTarget), contextPinned: false })

  return {
  llmConfig: null,
  presets: [],
  configLoaded: false,
  models: [],
  modelsLoading: false,

  loadConfig: async () => {
    try {
      const [cfg, presets] = await Promise.all([window.noteflow.aiLlmGetConfig(), window.noteflow.aiLlmPresets()])
      // Main may have switched the active provider on its own (sign-out falls back to the BYO
      // one, subscribing activates NoteFlow AI): the loaded model list belonged to the old one.
      const prev = get().llmConfig
      const switched = !!prev && prev.active !== cfg.active
      set({ llmConfig: cfg, presets, configLoaded: true, ...(switched ? { models: [] } : {}) })
    } catch (err) {
      console.error('Failed to load LLM config:', err)
      set({ configLoaded: true })
    }
  },

  setLlmConfig: async (patch) => {
    const switching = patch.active !== undefined && patch.active !== get().llmConfig?.active
    const cfg = await window.noteflow.aiLlmSetConfig(patch)
    set({ llmConfig: cfg, ...(switching ? { models: [] } : {}) })
    // Saving an API key (or switching to a configured provider) — load the provider's
    // models automatically so the user doesn't have to hit the refresh button.
    if ((patch.apiKey || switching) && cfg.configured) void get().refreshModels()
    return cfg
  },

  refreshModels: async () => {
    set({ modelsLoading: true })
    const res = await window.noteflow.aiLlmListModels()
    set({ modelsLoading: false, models: res.ok ? res.models : [] })
    return { ok: res.ok, error: res.error }
  },

  testConnection: () => window.noteflow.aiLlmTest(),

  // ── Chat ──
  draft: '',
  setDraft: (text) => set({ draft: text }),
  pendingAttachments: [],

  pickAttachments: async () => {
    const res = await window.noteflow.aiChatPickFiles()
    if (!res.ok || !res.files) return
    set((s) => {
      const seen = new Set(s.pendingAttachments.map((a) => a.id))
      return { pendingAttachments: [...s.pendingAttachments, ...res.files!.filter((f) => !seen.has(f.id))] }
    })
  },

  removeAttachment: (id) => {
    void window.noteflow.aiChatRemoveFile(id)
    set((s) => ({ pendingAttachments: s.pendingAttachments.filter((a) => a.id !== id) }))
  },

  messages: [],
  streaming: false,
  awaitingModelText: false,
  lastDeltaAt: null,
  currentRequestId: null,
  activeSources: [],
  pendingConfirm: null,
  suggestions: [],

  sendMessage: (text, opts) => {
    const trimmed = text.trim()
    const atts = get().pendingAttachments
    if ((!trimmed && atts.length === 0) || get().streaming) return
    const requestId = nanoid()
    const userTurn: ChatTurn = { id: nanoid(), role: 'user', content: trimmed, ...(atts.length ? { attachments: atts } : {}) }
    const assistantTurn: ChatTurn = { id: nanoid(), role: 'assistant', content: '' }
    const history = get().messages
    set({
      messages: [...history, userTurn, assistantTurn],
      contextPinned: true, // the first message freezes the context (no more following the open section)
      streaming: true,
      awaitingModelText: true,
      lastDeltaAt: null,
      currentRequestId: requestId,
      activeSources: [],
      suggestions: [],
      draft: '',
      pendingAttachments: [],
    })
    // Re-send every turn's attachment ids so follow-up questions keep their files in context.
    const payload: ChatMessage[] = [...history, userTurn].map((m) => ({
      role: m.role, content: m.content, ...(m.attachments?.length ? { attachmentIds: m.attachments.map((a) => a.id) } : {}),
    }))
    const context = opts?.withContext ? contextPayload(get().context, get().editorTarget) : undefined
    window.noteflow.aiChat(requestId, payload, context).catch((err) => console.error('aiChat failed:', err))
  },

  cancel: () => {
    const id = get().currentRequestId
    if (id) window.noteflow.aiChatCancel(id)
    set({ streaming: false, awaitingModelText: false, currentRequestId: null, pendingConfirm: null })
  },

  confirmAction: (approved) => {
    const pc = get().pendingConfirm
    if (!pc) return
    window.noteflow.aiChatConfirm(pc.toolCallId, approved)
    set({ pendingConfirm: null })
  },

  undoToolCall: async (toolCallId, force) => {
    let res: ChatUndoResult
    try {
      res = await window.noteflow.aiChatUndo(toolCallId, force)
    } catch (err) {
      res = { ok: false, reason: 'error', error: err instanceof Error ? err.message : String(err) }
    }
    // 'unavailable' = main no longer holds the snapshot; 'conflict' / 'encryption' = it can never
    // run (see chatUndo.undoBlock in main): drop the button instead of failing again.
    if (res.ok || res.reason === 'unavailable' || res.reason === 'conflict' || res.reason === 'encryption') {
      const undo: ChatToolActivity['undo'] = res.ok ? 'done' : undefined
      set((s) => ({
        messages: s.messages.map((m) => !m.actions?.some((a) => a.toolCallId === toolCallId) ? m : {
          ...m,
          actions: m.actions.map((a) => {
            if (a.toolCallId !== toolCallId) return a
            const next = { ...a }
            if (undo) next.undo = undo
            else delete next.undo
            return next
          }),
        }),
      }))
      persist()
    }
    return res
  },

  // ── Context bar ──
  context: EMPTY_CONTEXT,
  contextPinned: false,
  editorTarget: null,

  setEditorTarget: (target) => {
    if (sameEditorTarget(get().editorTarget, target)) return
    const s = get()
    set({ editorTarget: target, context: contextAfterTargetChange(s.context, s.contextPinned, s.messages.length, target) })
  },
  toggleContextItem: (item) => set((s) => ({ context: toggleContextItem(s.context, item), contextPinned: true })),
  removeContextItem: (item) => set((s) => ({ context: removeContextItem(s.context, item), contextPinned: true })),
  setAllNotes: (on) => set((s) => ({ context: setAllNotes(s.context, on), contextPinned: true })),

  // ── Editor sidebar / detached window ──
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  detached: false,
  setDetached: (detached) => set({ detached }),

  exportHandoff: () => {
    const s = get()
    return {
      messages: s.messages, activeSessionId: s.activeSessionId, draft: s.draft, context: s.context,
      contextPinned: s.contextPinned, suggestions: s.suggestions, pendingAttachments: s.pendingAttachments,
      takenAt: new Date().toISOString(),
    }
  },

  detachChat: async () => {
    const s = get()
    if (s.streaming || s.pendingConfirm || s.detached) return
    const res = await window.noteflow.aiChatWindowOpen(s.exportHandoff())
    if (res.ok) set({ detached: true, sidebarOpen: false })
  },

  importHandoff: (h) => {
    set({
      messages: Array.isArray(h.messages) ? h.messages.map((m) => ({ ...m })) : [],
      activeSessionId: typeof h.activeSessionId === 'string' ? h.activeSessionId : null,
      draft: typeof h.draft === 'string' ? h.draft : '',
      context: h.context && Array.isArray(h.context.items) ? { allNotes: !!h.context.allNotes, items: h.context.items } : EMPTY_CONTEXT,
      contextPinned: !!h.contextPinned,
      suggestions: Array.isArray(h.suggestions) ? h.suggestions : [],
      pendingAttachments: Array.isArray(h.pendingAttachments) ? h.pendingAttachments : [],
      streaming: false, awaitingModelText: false, lastDeltaAt: null, currentRequestId: null, pendingConfirm: null, activeSources: [],
    })
  },

  // ── Sessions ──
  sessions: [],
  activeSessionId: null,

  loadSessions: async () => {
    try {
      const sessions = await window.noteflow.aiChatsLoad()
      set({ sessions })
    } catch (err) {
      console.error('Failed to load chat history:', err)
    }
  },

  newChat: () => {
    if (get().streaming) get().cancel()
    for (const a of get().pendingAttachments) void window.noteflow.aiChatRemoveFile(a.id)
    set({ messages: [], activeSources: [], activeSessionId: null, pendingConfirm: null, pendingAttachments: [], suggestions: [], awaitingModelText: false, ...freshContext() })
  },

  openSession: (id) => {
    if (get().streaming) get().cancel()
    const s = get().sessions.find((x) => x.id === id)
    if (!s) return
    set({ messages: s.messages.map((m) => ({ ...m })), activeSessionId: id, activeSources: [], suggestions: [], awaitingModelText: false, ...freshContext() })
  },

  deleteSession: (id) => {
    const sessions = get().sessions.filter((s) => s.id !== id)
    set({ sessions, ...(get().activeSessionId === id ? { messages: [], activeSessionId: null, activeSources: [], ...freshContext() } : {}) })
    void window.noteflow.aiChatsSave(sessions)
  },

  askInNewChat: (prompt) => {
    get().newChat()
    // Same reach as the brain's "Ask AI" (semantic search over every note), visible in the bar.
    set((s) => ({ context: setAllNotes(s.context, true), contextPinned: true }))
    if (get().llmConfig?.configured) get().sendMessage(prompt, { withContext: true })
    else set({ draft: prompt })
  },

  // ── AI panel routing ──
  panelTab: null,
  pendingPrompt: null,

  profileDraft: EMPTY_PROFILE_DRAFT,
  setProfileDraft: (updater) => set((s) => ({ profileDraft: updater(s.profileDraft) })),
  resetProfileDraft: () => set({ profileDraft: EMPTY_PROFILE_DRAFT }),

  openAiPanel: (tab, prompt) => {
    const trimmed = prompt?.trim()
    // The conversation lives in the detached chat window: ask there (it starts a new chat).
    if (trimmed && get().detached) {
      window.noteflow.aiChatWindowAsk(trimmed)
      return
    }
    if (trimmed) {
      // Land the question in a clean conversation so it isn't tacked onto an old thread.
      get().newChat()
      set({ panelTab: 'chat', pendingPrompt: trimmed })
    } else {
      set({ panelTab: tab })
    }
  },

  initListeners: () => {
    const appendToAssistant = (delta: string) => {
      set((s) => {
        const msgs = s.messages.slice()
        const last = msgs[msgs.length - 1]
        if (last && last.role === 'assistant') msgs[msgs.length - 1] = { ...last, content: last.content + delta }
        return { messages: msgs, lastDeltaAt: Date.now() }
      })
    }

    // Mutate the actions array on the latest assistant turn.
    const updateActions = (fn: (actions: ChatToolActivity[]) => ChatToolActivity[]) => {
      set((s) => {
        const msgs = s.messages.slice()
        const last = msgs[msgs.length - 1]
        if (last && last.role === 'assistant') msgs[msgs.length - 1] = { ...last, actions: fn(last.actions ?? []) }
        return { messages: msgs }
      })
    }

    const offDelta = window.noteflow.onAiChatDelta((p) => {
      if (p.requestId !== get().currentRequestId) return
      // Text is now flowing for this step — swap "Thinking…" for the subtle streaming cue.
      if (get().awaitingModelText) set({ awaitingModelText: false })
      appendToAssistant(p.delta)
    })
    const offSources = window.noteflow.onAiChatSources((p) => {
      if (p.requestId !== get().currentRequestId) return
      set({ activeSources: p.sources })
    })
    const offToolCall = window.noteflow.onAiChatToolCall((p) => {
      if (p.requestId !== get().currentRequestId) return
      // A tool is running now: its activity row carries the feedback, so hide "Thinking…".
      set({ awaitingModelText: false })
      updateActions((actions) =>
        actions.some((a) => a.toolCallId === p.toolCallId)
          ? actions
          : [...actions, { toolCallId: p.toolCallId, name: p.name, status: 'running', runningLabel: p.label }])
    })
    const offToolResult = window.noteflow.onAiChatToolResult((p) => {
      if (p.requestId !== get().currentRequestId) return
      // Tool finished; the model is about to think again (e.g. compose the final answer). Re-arm
      // "Thinking…" so the inter-step gap doesn't read as a finished reply. The `toolRunning`
      // rule in chatActivityCue (lib/chatActivity.ts) keeps it hidden if another tool in the
      // same step is still going.
      set({ awaitingModelText: true })
      updateActions((actions) =>
        actions.map((a) => a.toolCallId === p.toolCallId
          ? { ...a, status: p.status, summary: p.summary, ...(p.undoable ? { undo: 'available' as const } : {}) }
          : a))
    })
    const offConfirm = window.noteflow.onAiChatConfirmRequest((p) => {
      if (p.requestId !== get().currentRequestId) return
      set({ pendingConfirm: p })
    })
    const offDone = window.noteflow.onAiChatDone((p) => {
      if (p.requestId !== get().currentRequestId) return
      // Pull the trailing suggestion block out of the final assistant turn: strip it from
      // the stored content (so saved history stays clean) and surface it as chips.
      let suggestions: string[] = []
      set((s) => {
        const msgs = s.messages.slice()
        const last = msgs[msgs.length - 1]
        if (last && last.role === 'assistant' && !last.error) {
          const split = splitSuggestions(last.content)
          suggestions = split.suggestions
          if (split.visible !== last.content) msgs[msgs.length - 1] = { ...last, content: split.visible }
        }
        return { messages: msgs, streaming: false, awaitingModelText: false, currentRequestId: null, pendingConfirm: null, suggestions }
      })
      persist()
    })
    const offError = window.noteflow.onAiChatError((p) => {
      if (p.requestId !== get().currentRequestId) return
      set((s) => {
        const msgs = s.messages.slice()
        const last = msgs[msgs.length - 1]
        // The agent loop makes one request per step, so a failure (the monthly quota running
        // out, a gateway hiccup…) often lands after the model already wrote some text. Never
        // drop it: keep the partial answer rendered as Markdown and hang the error off the turn.
        if (last && last.role === 'assistant') {
          msgs[msgs.length - 1] = last.content
            ? { ...last, errorText: p.error }
            : { ...last, content: `⚠ ${p.error}`, error: true }
        }
        return { messages: msgs, streaming: false, awaitingModelText: false, currentRequestId: null, pendingConfirm: null, suggestions: [] }
      })
      persist()
    })

    return () => { offDelta(); offSources(); offToolCall(); offToolResult(); offConfirm(); offDone(); offError() }
  },
  }
})
