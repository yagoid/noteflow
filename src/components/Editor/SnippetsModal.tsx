import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowUp, CalendarClock, Plus, Star, Stamp, Trash2, X } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { useLanguageStore } from '../../stores/languageStore'
import { useSnippetsStore } from '../../stores/snippetsStore'
import { OWN_KEYS_PROPS } from '../../lib/keyScope'
import {
  dateFormatPresets,
  dateVariable,
  expandSnippet,
  formatDateToken,
  getDefaultSnippet,
  snippetPreviewLine,
  suggestionContent,
  SUGGESTION_IDS,
  type SuggestionId,
  type SuggestionLabels,
} from '../../lib/snippets'
import { settingsButtonClass } from '../Settings/ui'
import type { Messages } from '../../i18n'

// Format tokens of the legend, paired with their dictionary key.
const LEGEND: Array<[string, keyof Messages['editor']['snippets']['tokenLegend']]> = [
  ['YYYY · YY', 'year'],
  ['MMMM · MMM', 'monthName'],
  ['MM · M', 'month'],
  ['DD · D', 'day'],
  ['dddd · ddd', 'weekday'],
  ['HH · H', 'hours24'],
  ['hh · h', 'hours12'],
  ['mm · m', 'minutes'],
  ['ss · s', 'seconds'],
  ['A · a', 'ampm'],
  ['[text]', 'literal'],
]

const inputClass =
  'w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-xs font-mono text-text ' +
  'placeholder-text-muted/40 focus:outline-none focus:border-text/30'

// "Snippets" window: list (add / reorder / default / delete) + editor of the
// selected snippet with the date/time format tool and a live preview, plus the
// suggested starters. Autosaves through the store (typing debounced, flushed on
// close). Portalled to <body>, but React events still bubble through the editor
// tree — the root stops keys/paste/drop so the editor never acts on them, and
// OWN_KEYS_PROPS makes the app accelerators step aside while typing here.
export function SnippetsModal({ onClose }: { onClose: () => void }) {
  const t = useT()
  const ts = t.editor.snippets
  const lang = useLanguageStore((s) => s.lang)
  const snippets = useSnippetsStore((s) => s.snippets)
  const { addSnippet, updateSnippet, deleteSnippet, setDefault, move, flush } = useSnippetsStore.getState()

  // null / a vanished id (deleted here or by another window) → the default one.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [format, setFormat] = useState(dateFormatPresets(lang)[0])
  const [now, setNow] = useState(() => new Date())
  const contentRef = useRef<HTMLTextAreaElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  // Last caret of the content textarea, per snippet: "Insert into snippet" puts
  // the variable there (at the end if the textarea was never touched).
  const caretRef = useRef<{ id: string; start: number; end: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const selected = snippets.find((s) => s.id === selectedId) ?? getDefaultSnippet(snippets)
  const defaultId = getDefaultSnippet(snippets)?.id ?? null
  const presets = useMemo(() => dateFormatPresets(lang), [lang])

  // Live previews follow the clock.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => { rootRef.current?.focus() }, [])

  const close = () => {
    void flush()
    onClose()
  }
  const closeRef = useRef(close)
  const pendingDeleteRef = useRef(pendingDeleteId)
  useEffect(() => {
    closeRef.current = close
    pendingDeleteRef.current = pendingDeleteId
  })

  // Escape: first cancels a pending delete, then closes. Capture phase — the
  // root below stops keydown propagation.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      if (pendingDeleteRef.current !== null) setPendingDeleteId(null)
      else closeRef.current()
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [])

  const suggestionLabels: SuggestionLabels = {
    names: ts.suggestionNames,
    meeting: {
      title: ts.suggestionText.meetingTitle,
      attendees: ts.suggestionText.attendees,
      notes: ts.suggestionText.notes,
      actions: ts.suggestionText.actions,
    },
    signature: ts.suggestionText.signature,
  }

  const createSnippet = (name: string, content: string) => {
    const created = addSnippet({ name, content })
    setSelectedId(created.id)
    setPendingDeleteId(null)
    // A blank snippet starts by its name; a suggestion by its content.
    requestAnimationFrame(() => (name ? contentRef.current : nameRef.current)?.focus())
  }

  const addSuggestion = (id: SuggestionId) => {
    createSnippet(ts.suggestionNames[id], suggestionContent(id, suggestionLabels, lang))
  }

  const rememberCaret = (el: HTMLTextAreaElement) => {
    if (selected) caretRef.current = { id: selected.id, start: el.selectionStart, end: el.selectionEnd }
  }

  const insertVariable = () => {
    const el = contentRef.current
    if (!selected || !el) return
    const token = dateVariable(format)
    const caret = caretRef.current?.id === selected.id ? caretRef.current : null
    const start = Math.min(caret?.start ?? selected.content.length, selected.content.length)
    const end = Math.min(caret?.end ?? start, selected.content.length)
    const content = selected.content.slice(0, start) + token + selected.content.slice(end)
    updateSnippet(selected.id, { content })
    const caretAfter = start + token.length
    caretRef.current = { id: selected.id, start: caretAfter, end: caretAfter }
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(caretAfter, caretAfter)
    })
  }

  const expanded = selected ? expandSnippet(selected.content, now, lang) : ''

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}
      onKeyDown={(e) => e.stopPropagation()}
      onPaste={(e) => e.stopPropagation()}
      onDrop={(e) => e.stopPropagation()}
      {...OWN_KEYS_PROPS}
    >
      <div
        ref={rootRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={ts.title}
        className="bg-surface-1 border border-border rounded-lg shadow-2xl w-[min(920px,94vw)] h-[min(660px,90vh)] flex flex-col overflow-hidden outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <Stamp size={13} className="text-text flex-shrink-0" />
            <span className="text-sm font-mono font-semibold text-text">{ts.title}</span>
            <span className="text-[11px] font-mono text-text-muted/70 truncate">· {ts.autosaved}</span>
          </div>
          <button
            onClick={close}
            title={ts.close}
            aria-label={ts.close}
            className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            <X size={13} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* ── List + suggestions ─────────────────────────────────────── */}
          <div className="w-[260px] flex-shrink-0 border-r border-border flex flex-col min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto p-2">
              <div className="flex items-center justify-between pl-1.5 pb-1">
                <h3 className="text-[11px] font-mono text-text-muted/75">{ts.yourSnippets}</h3>
                <button
                  onClick={() => createSnippet('', '')}
                  title={ts.newSnippet}
                  aria-label={ts.newSnippet}
                  className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
                >
                  <Plus size={13} />
                </button>
              </div>

              {snippets.length === 0 && (
                <p className="px-1.5 py-2 text-[11px] font-mono text-text-muted/70 leading-relaxed">{ts.menuEmpty}</p>
              )}

              {snippets.map((s, i) => {
                const active = s.id === selected?.id
                const isDefault = s.id === defaultId
                if (pendingDeleteId === s.id) {
                  return (
                    <div key={s.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-red/10 text-xs font-mono">
                      <span className="flex-1 min-w-0 truncate text-text">{ts.confirmDelete}</span>
                      <button
                        onClick={() => { deleteSnippet(s.id); setPendingDeleteId(null) }}
                        className="px-1.5 py-0.5 rounded text-red hover:bg-red/15 transition-colors"
                      >
                        {ts.confirmDeleteYes}
                      </button>
                      <button
                        onClick={() => setPendingDeleteId(null)}
                        className="px-1.5 py-0.5 rounded text-text-muted hover:text-text hover:bg-surface-3 transition-colors"
                      >
                        {ts.confirmDeleteNo}
                      </button>
                    </div>
                  )
                }
                return (
                  <div
                    key={s.id}
                    className={`group flex items-center gap-1 pl-1 pr-1 py-0.5 rounded-md transition-colors ${
                      active ? 'bg-surface-3' : 'hover:bg-surface-2'
                    }`}
                  >
                    <button
                      onClick={() => setDefault(s.id)}
                      title={isDefault ? ts.isDefault : ts.makeDefault}
                      aria-label={isDefault ? ts.isDefault : ts.makeDefault}
                      aria-pressed={isDefault}
                      className={`p-1 rounded transition-colors ${
                        isDefault ? 'text-accent' : 'text-text-muted/40 hover:text-text'
                      }`}
                    >
                      <Star size={12} fill={isDefault ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      onClick={() => { setSelectedId(s.id); setPendingDeleteId(null) }}
                      className={`flex-1 min-w-0 text-left py-1 text-xs font-mono truncate ${
                        active ? 'text-text' : 'text-text/85'
                      }`}
                    >
                      {s.name.trim() || ts.untitled}
                    </button>
                    <div className={`flex items-center ${active ? '' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}`}>
                      <button
                        onClick={() => move(s.id, -1)}
                        disabled={i === 0}
                        title={ts.moveUp}
                        aria-label={ts.moveUp}
                        className="p-1 rounded text-text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ArrowUp size={11} />
                      </button>
                      <button
                        onClick={() => move(s.id, 1)}
                        disabled={i === snippets.length - 1}
                        title={ts.moveDown}
                        aria-label={ts.moveDown}
                        className="p-1 rounded text-text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ArrowDown size={11} />
                      </button>
                      <button
                        onClick={() => setPendingDeleteId(s.id)}
                        title={ts.deleteSnippet}
                        aria-label={ts.deleteSnippet}
                        className="p-1 rounded text-text-muted hover:text-red hover:bg-red/10 transition-colors"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Suggestions */}
            <div className="border-t border-border p-2 max-h-[45%] overflow-y-auto">
              <h3 className="pl-1.5 text-[11px] font-mono text-text-muted/75">{ts.suggestions}</h3>
              <p className="pl-1.5 pb-1 text-[10px] font-mono text-text-muted/60">{ts.suggestionsHint}</p>
              {SUGGESTION_IDS.map((id) => (
                <div key={id} className="flex items-center gap-2 pl-1.5 pr-1 py-1 rounded-md hover:bg-surface-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-text truncate">{ts.suggestionNames[id]}</p>
                    <p className="text-[10px] font-mono text-text-muted truncate">
                      {snippetPreviewLine(suggestionContent(id, suggestionLabels, lang), now, lang, 40)}
                    </p>
                  </div>
                  <button
                    onClick={() => addSuggestion(id)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono ${settingsButtonClass}`}
                  >
                    <Plus size={11} />
                    {ts.addSuggestion}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* ── Selected snippet ───────────────────────────────────────── */}
          <div className="flex-1 min-w-0 overflow-y-auto p-5">
            {!selected ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-2 px-6">
                <Stamp size={22} className="text-text-muted/50" />
                <p className="text-sm font-mono text-text">{snippets.length === 0 ? ts.emptyTitle : ts.selectHint}</p>
                {snippets.length === 0 && (
                  <p className="text-[11px] font-mono text-text-muted max-w-sm leading-relaxed">{ts.emptyDesc}</p>
                )}
                <button
                  onClick={() => createSnippet('', '')}
                  className={`mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono ${settingsButtonClass}`}
                >
                  <Plus size={12} />
                  {ts.newSnippet}
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-mono text-text-muted" htmlFor="snippet-name">{ts.name}</label>
                  <input
                    id="snippet-name"
                    ref={nameRef}
                    value={selected.name}
                    placeholder={ts.untitled}
                    onChange={(e) => updateSnippet(selected.id, { name: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-mono text-text-muted" htmlFor="snippet-content">{ts.content}</label>
                  <textarea
                    id="snippet-content"
                    ref={contentRef}
                    value={selected.content}
                    placeholder={ts.contentPlaceholder}
                    onChange={(e) => {
                      updateSnippet(selected.id, { content: e.target.value })
                      rememberCaret(e.currentTarget)
                    }}
                    onSelect={(e) => rememberCaret(e.currentTarget)}
                    rows={7}
                    spellCheck={false}
                    className={`${inputClass} resize-y leading-relaxed min-h-[7rem]`}
                  />
                </div>

                {/* Date / time format tool */}
                <div className="rounded-md border border-border bg-surface-2/40 p-3 space-y-2.5">
                  <div className="flex items-center gap-1.5">
                    <CalendarClock size={12} className="text-text-muted" />
                    <span className="text-[11px] font-mono font-semibold text-text uppercase tracking-widest">{ts.dateTime}</span>
                  </div>
                  <div>
                    <p className="text-[11px] font-mono text-text-muted mb-1">{ts.presets}</p>
                    <div className="flex flex-wrap gap-1">
                      {presets.map((p) => (
                        <button
                          key={p}
                          onClick={() => setFormat(p)}
                          title={formatDateToken(now, p, lang)}
                          className={`px-1.5 py-0.5 rounded border text-[11px] font-mono transition-colors ${
                            p === format
                              ? 'bg-surface-3 border-text-muted/40 text-text'
                              : 'border-border text-text-muted hover:text-text hover:bg-surface-3'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-end gap-2 flex-wrap">
                    <div className="flex-1 min-w-[180px] space-y-1">
                      <label className="block text-[11px] font-mono text-text-muted" htmlFor="snippet-format">{ts.customFormat}</label>
                      <input
                        id="snippet-format"
                        value={format}
                        placeholder={ts.customPlaceholder}
                        onChange={(e) => setFormat(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); insertVariable() } }}
                        className={inputClass}
                      />
                    </div>
                    <div className="flex-1 min-w-[160px] space-y-1">
                      <span className="block text-[11px] font-mono text-text-muted">{ts.result}</span>
                      <div className="px-2 py-1.5 rounded border border-border bg-surface-1 text-xs font-mono text-text truncate min-h-[30px]">
                        {formatDateToken(now, format, lang)}
                      </div>
                    </div>
                    <button
                      onClick={insertVariable}
                      title={dateVariable(format)}
                      className={`px-2.5 py-1.5 rounded text-xs font-mono ${settingsButtonClass}`}
                    >
                      {ts.insertVariable}
                    </button>
                  </div>
                  <p className="text-[11px] font-mono text-text-muted leading-relaxed">{ts.monthHint}</p>
                  <details className="text-[11px] font-mono text-text-muted">
                    <summary className="cursor-pointer select-none hover:text-text">{ts.tokens}</summary>
                    <div className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                      {LEGEND.map(([tokens, key]) => (
                        <div key={key} className="contents">
                          <code className="text-text">{tokens}</code>
                          <span>{ts.tokenLegend[key]}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 leading-relaxed">{ts.variablesHint}</p>
                  </details>
                </div>

                {/* Preview */}
                <div className="space-y-1.5">
                  <span className="block text-[11px] font-mono text-text-muted">{ts.preview}</span>
                  <pre className="px-3 py-2 rounded border border-border bg-surface-2/40 text-xs font-mono text-text whitespace-pre-wrap break-words min-h-[3rem]">
                    {expanded.trim() ? expanded : <span className="text-text-muted/60">{ts.previewEmpty}</span>}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
