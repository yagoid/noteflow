// Shared LLM types for the chat / second-brain subsystem (Phase 3).
// Everything here runs in the MAIN process — the API key never reaches the renderer.
import type { LlmImpl } from './presets'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Per-preset stored state (each provider keeps its own key/model/baseUrl). */
export interface LlmPresetState {
  baseUrl?: string
  model?: string
  encryptedApiKey?: string
}

/** Persisted config (settings.aiLlm). Keys are stored encrypted, one per preset. */
export interface LlmConfigStored {
  active: string                                  // selected preset id
  byPreset: Record<string, LlmPresetState>
  /**
   * Last NON-managed preset that was active before switching to `noteflow`
   * (see withActiveProvider). Lets a sign-out revert the assistant to the
   * provider the user actually had, instead of the generic default.
   */
  lastByoProvider?: string
}

/** What kinds of attachments the active provider can ingest natively (no local processing). */
export interface ProviderCapabilities {
  images: boolean
  pdf: boolean
}

/** Renderer-safe view of the ACTIVE preset — never carries the key. */
export interface LlmConfigPublic {
  active: string
  model: string
  baseUrl: string
  hasKey: boolean
  configured: boolean
  capabilities: ProviderCapabilities
  /**
   * The stored lastByoProvider, only when it is a known non-managed preset
   * (byoFallbackProvider's check). Lets Settings → AI preselect the provider the
   * user had before NoteFlow AI in the "Your provider" card instead of the default.
   * MIRROR: LlmConfigPublic in src/types/index.ts.
   */
  lastByoProvider?: string
}

/** Resolved config handed to a provider (key in clear; in-memory only). */
export interface ResolvedLlmConfig {
  impl: LlmImpl
  model: string
  baseUrl: string
  apiKey: string
}

/**
 * A document/image passed to the model NATIVELY (the app never extracts text itself).
 * `data` is base64 with no `data:` prefix. Text files (.txt/.md) are NOT attachments —
 * they get inlined into the prompt text upstream.
 */
export interface Attachment {
  kind: 'pdf' | 'image'
  mediaType: string
  data: string
}

export interface ChatOptions {
  system?: string
  messages: ChatMessage[]
  signal?: AbortSignal
  maxTokens?: number
  /** Attached to the (single) user message when present. */
  attachments?: Attachment[]
}

// ── Tool calling (agentic chat) ─────────────────────────────────────────────
// Provider-agnostic shapes. Anthropic and OpenAI-compatible each map these to
// their native tool format; the agentic loop in main stays provider-neutral.

/** Declarative tool the model may call. `inputSchema` is a JSON Schema object. */
export interface ToolSchema {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/** A tool invocation the model produced. */
export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
}

/** The outcome of executing a ToolCall, fed back to the model on the next turn. */
export interface ToolResult {
  toolCallId: string
  content: string
  isError?: boolean
}

/** Internal multi-turn message model that carries tool turns across providers. */
export type AgentMessage =
  | { role: 'user'; content: string; attachments?: Attachment[] }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; results: ToolResult[] }

export interface AgentTurnOptions {
  system?: string
  messages: AgentMessage[]
  tools?: ToolSchema[]
  signal?: AbortSignal
  maxTokens?: number
}

export interface AgentTurnResult {
  /** Visible assistant text streamed this turn. */
  text: string
  /** Tools the model asked to run; empty array means the turn is final. */
  toolCalls: ToolCall[]
}

export interface LlmProvider {
  /** Stream a plain text completion (no tools). Calls onDelta per chunk. */
  chat(opts: ChatOptions, onDelta: (text: string) => void): Promise<void>
  /** Stream one agentic turn: emits text via onDelta and returns any tool calls. */
  streamTurn(opts: AgentTurnOptions, onDelta: (text: string) => void): Promise<AgentTurnResult>
  /** List model ids available to this provider (best-effort). */
  listModels(): Promise<string[]>
  /** Lightweight connectivity/credentials check. */
  test(): Promise<{ ok: boolean; error?: string }>
}
