import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { splitSuggestions } from '../lib/chatSuggestions'
import type { LlmConfigPublic, LlmPreset, ChatMessage, ChatSource, ChatSession, ChatToolActivity, ChatPendingConfirm, ChatAttachment } from '../types'

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
  sendMessage: (text: string) => void
  cancel: () => void
  confirmAction: (approved: boolean) => void

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
  openAiPanel: (tab: PanelTab, prompt?: string) => void

  initListeners: () => () => void
}

export const useAiChatStore = create<AiChatState>((set, get) => ({
  llmConfig: null,
  presets: [],
  configLoaded: false,
  models: [],
  modelsLoading: false,

  loadConfig: async () => {
    try {
      const [cfg, presets] = await Promise.all([window.noteflow.aiLlmGetConfig(), window.noteflow.aiLlmPresets()])
      set({ llmConfig: cfg, presets, configLoaded: true })
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

  sendMessage: (text) => {
    const trimmed = text.trim()
    const atts = get().pendingAttachments
    if ((!trimmed && atts.length === 0) || get().streaming) return
    const requestId = nanoid()
    const userTurn: ChatTurn = { id: nanoid(), role: 'user', content: trimmed, ...(atts.length ? { attachments: atts } : {}) }
    const assistantTurn: ChatTurn = { id: nanoid(), role: 'assistant', content: '' }
    const history = get().messages
    set({
      messages: [...history, userTurn, assistantTurn],
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
    window.noteflow.aiChat(requestId, payload).catch((err) => console.error('aiChat failed:', err))
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
    set({ messages: [], activeSources: [], activeSessionId: null, pendingConfirm: null, pendingAttachments: [], suggestions: [], awaitingModelText: false })
  },

  openSession: (id) => {
    if (get().streaming) get().cancel()
    const s = get().sessions.find((x) => x.id === id)
    if (!s) return
    set({ messages: s.messages.map((m) => ({ ...m })), activeSessionId: id, activeSources: [], suggestions: [], awaitingModelText: false })
  },

  deleteSession: (id) => {
    const sessions = get().sessions.filter((s) => s.id !== id)
    set({ sessions, ...(get().activeSessionId === id ? { messages: [], activeSessionId: null, activeSources: [] } : {}) })
    void window.noteflow.aiChatsSave(sessions)
  },

  // ── AI panel routing ──
  panelTab: null,
  pendingPrompt: null,

  profileDraft: EMPTY_PROFILE_DRAFT,
  setProfileDraft: (updater) => set((s) => ({ profileDraft: updater(s.profileDraft) })),
  resetProfileDraft: () => set({ profileDraft: EMPTY_PROFILE_DRAFT }),

  openAiPanel: (tab, prompt) => {
    const trimmed = prompt?.trim()
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
        actions.map((a) => a.toolCallId === p.toolCallId ? { ...a, status: p.status, summary: p.summary } : a))
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
}))
