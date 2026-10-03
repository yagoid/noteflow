import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { AlertTriangle, ArrowUp, Check, FileText, History, Image as ImageIcon, Loader2, Paperclip, Plus, RefreshCw, Settings, Square, Trash2, Wrench, X } from 'lucide-react'
import { useAiChatStore } from '../../stores/aiChatStore'
import { useNotesStore } from '../../stores/notesStore'
import { useSectionHoverPreview } from '../SectionPreview/hoverPreviewContext'
import { htmlFromMarkdown } from '../../lib/markdownHtml'
import { buildStarterSuggestions, splitSuggestions } from '../../lib/chatSuggestions'
import { chatActivityCue, msUntilStalled } from '../../lib/chatActivity'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'
import { Card } from './ui'
import type { ChatAttachment, ChatToolActivity } from '../../types'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// A file chip shown in the composer (removable) or on a sent user message (read-only).
function AttachmentChip({ a, onRemove }: { a: ChatAttachment; onRemove?: () => void }) {
  const t = useT()
  return (
    <div className="flex items-center gap-1.5 max-w-[160px] text-[11.5px] font-mono text-text bg-surface-0 border border-border rounded px-1.5 py-1">
      {a.kind === 'image' ? <ImageIcon size={11} className="shrink-0 text-accent" /> : <FileText size={11} className="shrink-0 text-accent" />}
      <span className="truncate flex-1">{a.name}</span>
      {onRemove
        ? <button onClick={onRemove} title={t.aiPanel.remove} className="shrink-0 text-text-muted hover:text-red transition-colors"><X size={11} /></button>
        : <span className="shrink-0 text-text-muted/50">{formatBytes(a.sizeBytes)}</span>}
    </div>
  )
}

function ToolActivityRow({ a }: { a: ChatToolActivity }) {
  const t = useT()
  // Present-continuous label shown while a tool runs (replaced by its summary once it finishes).
  const running = t.aiPanel.chat.running as Record<string, string>
  const label = a.summary || a.runningLabel || running[a.name] || a.name
  const icon =
    a.status === 'running' ? <Loader2 size={11} className="animate-spin text-text-muted" />
    : a.status === 'error' ? <AlertTriangle size={11} className="text-red-300" />
    : a.status === 'cancelled' ? <X size={11} className="text-text-muted" />
    : <Check size={11} className="text-emerald-400" />
  return (
    <div className="flex items-center gap-1.5 text-[11.5px] font-mono text-text-muted">
      {icon}
      <span className={`truncate ${a.status === 'cancelled' ? 'line-through opacity-60' : ''}`}>{label}</span>
    </div>
  )
}

// In-progress cue at the bottom of the conversation. While a turn streams there is always some
// feedback until it ends, so the cue disappearing reliably means "finished" (rules + rationale in
// lib/chatActivity): "Thinking…" while the model works without emitting text (initial think, the
// gap after a tool, generating tool-call arguments after a preamble, a mid-reply stall), pulsing
// dots while text flows, nothing when a tool row or the confirm card already carries the feedback.
// Self-subscribed with primitive selectors and its own idle timer, so the stall check never
// re-renders the message list.
function ChatActivityIndicator() {
  const t = useT()
  const streaming = useAiChatStore((s) => s.streaming)
  const awaitingModelText = useAiChatStore((s) => s.awaitingModelText)
  const lastDeltaAt = useAiChatStore((s) => s.lastDeltaAt)
  const pendingConfirm = useAiChatStore((s) => s.pendingConfirm !== null)
  const lastRole = useAiChatStore((s) => s.messages[s.messages.length - 1]?.role)
  const toolRunning = useAiChatStore((s) => s.messages[s.messages.length - 1]?.actions?.some((a) => a.status === 'running') ?? false)

  // The `lastDeltaAt` the idle timer last fired for: the stream is stalled while it's still current
  // (a new delta changes `lastDeltaAt`, which un-stalls it and re-arms the timer).
  const [stalledAt, setStalledAt] = useState<number | null>(null)
  useEffect(() => {
    if (!streaming || lastDeltaAt === null) return
    const id = setTimeout(() => setStalledAt(lastDeltaAt), msUntilStalled(lastDeltaAt, Date.now()))
    return () => clearTimeout(id)
  }, [streaming, lastDeltaAt])

  const cue = chatActivityCue({
    streaming, lastRole, awaitingModelText, toolRunning, pendingConfirm, lastDeltaAt,
    stalled: lastDeltaAt !== null && stalledAt === lastDeltaAt,
  })
  if (cue === 'none') return null
  // Both variants share the row box (h-6) so swapping between them doesn't shift the layout.
  return (
    <div role="status" className="self-start flex items-center gap-1.5 h-6 px-2.5 text-[12px] font-mono text-text-muted">
      {cue === 'thinking' ? (
        <>
          <Loader2 size={12} className="animate-spin text-accent" />
          <span className="animate-pulse">{t.aiPanel.chat.thinking}</span>
        </>
      ) : (
        <>
          {[0, 200, 400].map((delay) => (
            <span key={delay} aria-hidden className="w-1 h-1 rounded-full bg-accent animate-pulse" style={{ animationDelay: `${delay}ms` }} />
          ))}
          <span className="sr-only">{t.aiPanel.chat.responding}</span>
        </>
      )}
    </div>
  )
}

// Assistant replies arrive as Markdown (headings, code, tables, lists…). Render
// them through the same markdown→HTML pipeline the editor uses, scaled down to
// the chat panel via the `chat-md` scope (see index.css).
function MarkdownMessage({ content }: { content: string }) {
  // Hide the trailing suggestion marker/block live while streaming (the store keeps the
  // raw content until the turn finishes; suggestions become chips below the chat).
  const html = useMemo(() => htmlFromMarkdown(splitSuggestions(content).visible), [content])
  return (
    <div className="chat-md prose-editor">
      <div className="ProseMirror" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}

export function ChatView({
  onOpenNote,
  onConfigure,
}: {
  onOpenNote: (noteId: string, sectionId: string) => void
  onConfigure: () => void
}) {
  const t = useT()
  const { previewProps } = useSectionHoverPreview()
  const llmConfig = useAiChatStore((s) => s.llmConfig)
  const presets = useAiChatStore((s) => s.presets)
  const models = useAiChatStore((s) => s.models)
  const modelsLoading = useAiChatStore((s) => s.modelsLoading)
  const refreshModels = useAiChatStore((s) => s.refreshModels)
  const setLlmConfig = useAiChatStore((s) => s.setLlmConfig)
  const messages = useAiChatStore((s) => s.messages)
  const streaming = useAiChatStore((s) => s.streaming)
  const activeSources = useAiChatStore((s) => s.activeSources)
  const suggestions = useAiChatStore((s) => s.suggestions)
  const notes = useNotesStore((s) => s.notes)
  const sendMessage = useAiChatStore((s) => s.sendMessage)
  const cancel = useAiChatStore((s) => s.cancel)
  const pendingConfirm = useAiChatStore((s) => s.pendingConfirm)
  const confirmAction = useAiChatStore((s) => s.confirmAction)
  const sessions = useAiChatStore((s) => s.sessions)
  const activeSessionId = useAiChatStore((s) => s.activeSessionId)
  const newChat = useAiChatStore((s) => s.newChat)
  const openSession = useAiChatStore((s) => s.openSession)
  const deleteSession = useAiChatStore((s) => s.deleteSession)
  const draft = useAiChatStore((s) => s.draft)
  const setDraft = useAiChatStore((s) => s.setDraft)
  const pendingPrompt = useAiChatStore((s) => s.pendingPrompt)
  const pendingAttachments = useAiChatStore((s) => s.pendingAttachments)
  const pickAttachments = useAiChatStore((s) => s.pickAttachments)
  const removeAttachment = useAiChatStore((s) => s.removeAttachment)

  const [historyOpen, setHistoryOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, pendingConfirm, streaming])

  // Grow the composer with its content (capped by max-h-32), and shrink it back when cleared.
  const autosize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  useEffect(() => { autosize() }, [draft, autosize])

  // Recompute on width changes too: the panel mounts at ~zero width during the brain
  // view's open animation, where the empty placeholder wraps and scrollHeight balloons.
  // Without this the composer stays stuck tall until the first keystroke re-measures it.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    const ro = new ResizeObserver(() => autosize())
    ro.observe(el)
    return () => ro.disconnect()
  }, [autosize])

  const preset = useMemo(() => presets.find((p) => p.id === llmConfig?.active) ?? null, [presets, llmConfig?.active])
  // Same rule as the provider panel: a preset with a curated catalog (modelMeta) only offers the
  // catalog itself — main rejects any other id, so a wider /models answer would put an option in
  // the <select> that silently bounces back when picked.
  const modelOptions = useMemo(() => {
    if (preset?.modelMeta) return preset.suggestedModels
    const set = new Set<string>([...(preset?.suggestedModels ?? []), ...models])
    if (llmConfig?.model) set.add(llmConfig.model)
    return [...set]
  }, [preset, models, llmConfig?.model])

  const configured = llmConfig?.configured ?? false
  const caps = llmConfig?.capabilities
  const ft = t.aiPanel.fileTypes
  const attachHint = caps
    ? tf(t.aiPanel.chat.attachHint, {
        list: [...(caps.pdf ? [ft.pdf] : []), ...(caps.images ? [ft.images] : []), ft.textCode].join(', '),
      })
    : t.aiPanel.chat.attachHintBasic

  // A question queued from the command palette ("Ask AI") auto-sends once a provider is ready.
  // If none is configured yet it lingers until one is, then fires.
  useEffect(() => {
    if (!pendingPrompt || !configured || streaming) return
    useAiChatStore.setState({ pendingPrompt: null })
    sendMessage(pendingPrompt)
  }, [pendingPrompt, configured, streaming, sendMessage])

  // Personalized starter chips for the empty chat, randomized from the user's own note
  // and section names. Recomputed once notes are loaded (and on each view re-entry, since
  // BrainView remounts ChatView) so the chips vary; intentionally NOT re-rolled on every
  // note edit to avoid flicker — hence the notes-loaded boolean as the only dep.
  const notesLoaded = notes.length > 0
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const starterSuggestions = useMemo(() => buildStarterSuggestions(notes, t.aiPanel.chat.suggestions), [notesLoaded, t])

  // Prompt suggestions above the composer: personalized starters on an empty chat, or the
  // model's parsed next-actions once there's a conversation. Hidden while streaming.
  const shownSuggestions = streaming ? [] : messages.length === 0 ? starterSuggestions : suggestions

  const canSend = (draft.trim().length > 0 || pendingAttachments.length > 0) && !streaming
  const submit = () => {
    if (!canSend) return
    sendMessage(draft) // clears the draft + pending attachments in the store
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
  }

  if (!configured) {
    return (
      <div className="flex items-center justify-center h-full p-5">
        <Card className="flex flex-col items-center gap-3 p-6 max-w-[260px] text-center">
          <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-accent/15 text-accent">
            <Settings size={18} />
          </span>
          <p className="text-[13px] font-mono text-text-muted leading-relaxed">
            {t.aiPanel.chat.notConfigured}
          </p>
          <button onClick={onConfigure} className="px-3 py-1.5 rounded-lg bg-text text-surface-0 text-[12px] font-mono font-bold hover:opacity-90">
            {t.aiPanel.chat.configureProvider}
          </button>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      {/* Top bar: history + new chat + model picker */}
      <div className="flex-shrink-0 flex items-center gap-1.5 px-2 h-9 border-b border-text/10">
        <button
          onClick={() => setHistoryOpen((o) => !o)}
          title={t.aiPanel.chat.historyTooltip}
          className={`flex items-center justify-center w-7 h-7 rounded transition-colors ${historyOpen ? 'bg-surface-2 text-text' : 'text-text-muted hover:text-text hover:bg-surface-2'}`}
        >
          <History size={14} />
        </button>
        <button
          onClick={() => { newChat(); setHistoryOpen(false) }}
          title={t.aiPanel.chat.newChat}
          className="flex items-center justify-center w-7 h-7 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
        >
          <Plus size={15} />
        </button>
        <div className="ml-auto flex items-center gap-1 min-w-0">
          <select
            value={llmConfig?.model ?? ''}
            onChange={(e) => setLlmConfig({ model: e.target.value })}
            title={t.aiPanel.chat.modelSelectTitle}
            className="max-w-[150px] bg-surface-0 border border-border rounded px-1.5 py-1 text-[11px] font-mono text-text outline-none focus:border-text/30"
          >
            {modelOptions.length === 0 && <option value="">{t.aiPanel.chat.noModel}</option>}
            {modelOptions.map((m) => (
              // Show the model name only (drop the "provider/" prefix); the value keeps the full id.
              <option key={m} value={m}>{m.includes('/') ? m.slice(m.indexOf('/') + 1) : m}</option>
            ))}
          </select>
          <button
            onClick={() => refreshModels()}
            disabled={modelsLoading}
            title={t.aiPanel.chat.loadModelsTitle}
            className="flex items-center justify-center w-6 h-6 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={11} className={modelsLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* History overlay */}
      {historyOpen && (
        <>
          <div className="absolute inset-0 z-10" onClick={() => setHistoryOpen(false)} />
          <div className="absolute top-9 left-2 z-20 w-64 max-h-80 overflow-y-auto rounded-lg border border-border bg-surface-1 shadow-2xl py-1">
            {sessions.length === 0 && <p className="px-3 py-2 text-[12px] font-mono text-text-muted/60">{t.aiPanel.chat.noSavedChats}</p>}
            {sessions.map((s) => (
              <div
                key={s.id}
                className={`group flex items-center gap-1 px-2 py-1.5 hover:bg-text/5 cursor-pointer ${s.id === activeSessionId ? 'bg-surface-2' : ''}`}
                onClick={() => { openSession(s.id); setHistoryOpen(false) }}
              >
                <span className="flex-1 min-w-0 truncate text-[12px] font-mono text-text/80">{s.title}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteSession(s.id) }}
                  title={t.aiPanel.chat.deleteChat}
                  className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-5 h-5 rounded text-text-muted hover:text-red-300"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 flex flex-col gap-3">
        {messages.length === 0 && (
          <p className="text-[12px] font-mono text-text-muted/60 text-center mt-6">
            {t.aiPanel.chat.emptyHint}
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'self-end max-w-[85%]' : 'self-start max-w-[92%]'}>
            {m.role === 'assistant' && m.actions && m.actions.length > 0 && (
              <div className="mb-1 flex flex-col gap-0.5 px-1">
                {m.actions.map((a) => <ToolActivityRow key={a.toolCallId} a={a} />)}
              </div>
            )}
            {m.content.length > 0 && (
              m.role === 'assistant' && !m.error ? (
                <div className="px-2.5 py-1.5 rounded text-[13px] text-text/90 break-words">
                  <MarkdownMessage content={m.content} />
                </div>
              ) : (
                <div
                  className={`px-2.5 py-1.5 rounded text-[13px] font-mono whitespace-pre-wrap break-words leading-relaxed ${
                    m.role === 'user' ? 'bg-surface-2 text-text' : m.error ? 'bg-red-500/10 text-red-300 border border-red-500/30' : 'text-text/90'
                  }`}
                >
                  {m.content}
                </div>
              )
            )}
            {/* Failure that arrived mid-turn (e.g. the monthly quota ran out on a later agent
                step): the text above stays as written, the error gets its own red row. */}
            {m.errorText && (
              <div className="mt-1 px-2.5 py-1.5 rounded text-[13px] font-mono whitespace-pre-wrap break-words leading-relaxed bg-red-500/10 text-red-300 border border-red-500/30">
                {`⚠ ${m.errorText}`}
              </div>
            )}
            {m.role === 'user' && m.attachments && m.attachments.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1 justify-end">
                {m.attachments.map((a) => <AttachmentChip key={a.id} a={a} />)}
              </div>
            )}
          </div>
        ))}

        {pendingConfirm && (
          <div className="self-start max-w-[92%] w-full rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-[12.5px] font-mono text-amber-200">
              <Wrench size={12} />
              <span>{(t.aiPanel.chat.confirm as Record<string, string>)[pendingConfirm.name] ?? t.aiPanel.chat.confirm.fallback}</span>
            </div>
            {pendingConfirm.target && (
              <div className="text-[12px] font-mono text-amber-100/90 break-words pl-[18px]">
                {pendingConfirm.target}
              </div>
            )}
            <div className="flex gap-1.5">
              <button
                onClick={() => confirmAction(true)}
                className="px-2.5 py-1 rounded bg-red-500/80 text-white text-[12px] font-mono font-bold hover:bg-red-500 transition-colors"
              >
                {t.aiPanel.chat.confirmBtn}
              </button>
              <button
                onClick={() => confirmAction(false)}
                className="px-2.5 py-1 rounded bg-surface-2 text-text text-[12px] font-mono hover:bg-surface-3 transition-colors"
              >
                {t.common.cancel}
              </button>
            </div>
          </div>
        )}

        <ChatActivityIndicator />

        {activeSources.length > 0 && (
          <div className="self-start flex flex-wrap gap-1 mt-0.5">
            {activeSources.map((s) => (
              <button
                key={`${s.noteId}:${s.sectionId}`}
                {...previewProps(s.noteId, s.sectionId)}
                onClick={() => onOpenNote(s.noteId, s.sectionId)}
                className="px-2 py-0.5 rounded-md text-[11px] font-mono border-solid border border-border bg-surface-0 text-text-muted hover:text-text hover:border-accent/50 transition-colors max-w-[160px] truncate"
              >
                {s.title || t.common.untitled}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Composer — one rounded surface (attachments + input + actions), like the design's cards. */}
      <div className="flex-shrink-0 px-4 pt-2 pb-6">
        {shownSuggestions.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {shownSuggestions.map((s) => (
              <button
                key={s}
                onClick={() => sendMessage(s)}
                title={s}
                className="px-2 py-0.5 rounded-md text-[11px] font-mono border-solid border border-border bg-surface-0 text-text-muted hover:text-text hover:border-accent/50 transition-colors max-w-full truncate"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="rounded-xl border-solid border border-border bg-surface-0 p-1.5 transition-colors focus-within:border-accent/40">
          {pendingAttachments.length > 0 && (
            <div className="mb-1.5 flex flex-wrap gap-1">
              {pendingAttachments.map((a) => (
                <AttachmentChip key={a.id} a={a} onRemove={() => removeAttachment(a.id)} />
              ))}
            </div>
          )}
          <div className="flex items-end gap-1.5">
            <button
              onClick={pickAttachments}
              disabled={streaming}
              title={attachHint}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors disabled:opacity-40"
            >
              <Paperclip size={15} />
            </button>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder={t.aiPanel.chat.messagePlaceholder}
              className="flex-1 resize-none bg-transparent px-1 py-1.5 text-[13px] font-mono text-text placeholder-text-muted/40 outline-none max-h-32 overflow-y-auto"
            />
            {streaming ? (
              <button onClick={cancel} title={t.aiPanel.chat.stop} className="flex items-center justify-center w-8 h-8 rounded-lg bg-surface-2 text-text hover:bg-surface-3 transition-colors">
                <Square size={13} />
              </button>
            ) : (
              <button onClick={submit} disabled={!canSend} title={t.aiPanel.chat.send} className="flex items-center justify-center w-8 h-8 rounded-lg bg-text text-surface-0 disabled:opacity-40 hover:opacity-90 transition-opacity">
                <ArrowUp size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
