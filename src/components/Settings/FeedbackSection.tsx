import { useState } from 'react'
import { AlertCircle, Check, Loader, Send } from 'lucide-react'
import { tf } from '../../i18n/format'
import { useT } from '../../i18n/useT'
import { useLanguageStore } from '../../stores/languageStore'
import type { FeedbackKind, FeedbackSendResult } from '../../types'
import { SectionTitle } from './ui'

// "Send feedback" form of Settings → About. Main validates the payload again,
// adds the diagnostics itself and inserts it into public.feedback (Supabase) —
// signed in or not (electron/feedback.ts). These limits mirror
// electron/feedbackLogic.ts and supabase/migrations/0015_feedback.sql.
const MESSAGE_MAX = 5000
const CONTACT_MAX = 254
const KINDS: FeedbackKind[] = ['bug', 'suggestion', 'other']

// Feedback section of the website's privacy policy (same base as AccountPanel's legal links).
const PRIVACY_FEEDBACK_URL = (lang: string) =>
  `https://yagoid.github.io/noteflow${lang === 'es' ? '/es' : ''}/privacy#feedback`

// Same lax check as isPlausibleEmail() in electron/feedbackLogic.ts.
const isPlausibleEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

type SendState =
  | { phase: 'idle' }
  | { phase: 'sending' }
  | { phase: 'sent' }
  | { phase: 'error'; reason: Extract<FeedbackSendResult, { ok: false }>['reason'] }

const inputClass =
  'w-full px-3 py-1.5 rounded text-xs font-mono bg-surface-0 border text-text placeholder:text-text-muted/40 ' +
  'focus:outline-none disabled:opacity-40 transition-colors'

export function FeedbackSection() {
  const t = useT()
  const f = t.settings.about.feedback
  const lang = useLanguageStore((s) => s.lang)
  const [kind, setKind] = useState<FeedbackKind>('bug')
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')
  // Real opt-in: diagnostics are only sent if the user ticks the box.
  const [includeDiagnostics, setIncludeDiagnostics] = useState(false)
  const [state, setState] = useState<SendState>({ phase: 'idle' })

  const sending = state.phase === 'sending'
  const trimmedContact = contact.trim()
  const contactInvalid = trimmedContact.length > 0 && !isPlausibleEmail(trimmedContact)
  const canSend = !sending && message.trim().length > 0 && !contactInvalid

  // Editing after a result clears it: "Thanks" / the error belong to the last attempt.
  const touch = () => {
    if (state.phase === 'sent' || state.phase === 'error') setState({ phase: 'idle' })
  }

  const handleSend = async () => {
    if (!canSend) return
    setState({ phase: 'sending' })
    let result: FeedbackSendResult
    try {
      result = await window.noteflow.sendFeedback({
        kind,
        message,
        contact: trimmedContact || undefined,
        includeDiagnostics,
      })
    } catch {
      result = { ok: false, reason: 'network' }
    }
    if (result.ok) {
      setKind('bug')
      setMessage('')
      setContact('')
      setIncludeDiagnostics(false)
      setState({ phase: 'sent' })
    } else {
      setState({ phase: 'error', reason: result.reason })
    }
  }

  const errorText =
    state.phase !== 'error'
      ? null
      : state.reason === 'network'
      ? f.errorNetwork
      : state.reason === 'invalid'
      ? f.errorInvalid
      : f.errorServer

  return (
    <section className="settings-row-break">
      <SectionTitle>
        {f.title}
      </SectionTitle>
      <div className="space-y-3">
        <p className="text-[11px] font-mono text-text-muted leading-relaxed">{f.intro}</p>

        {/* Type — same segmented control as the language picker (General) */}
        <div className="flex items-center justify-between gap-4">
          <span className="text-[11px] font-mono text-text-muted uppercase tracking-wider">{f.kindLabel}</span>
          <div
            role="radiogroup"
            aria-label={f.kindLabel}
            className="flex items-center gap-0.5 text-[11px] font-mono p-0.5 rounded-md border border-border bg-surface-2 flex-shrink-0"
          >
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                disabled={sending}
                onClick={() => { setKind(k); touch() }}
                className={`px-2 py-1 rounded transition-colors disabled:opacity-40 ${
                  kind === k ? 'bg-surface-1 text-text' : 'text-text-muted hover:text-text'
                }`}
              >
                {f.kinds[k]}
              </button>
            ))}
          </div>
        </div>

        {/* Message */}
        <div>
          <label
            htmlFor="feedback-message"
            className="block text-[11px] font-mono text-text-muted mb-1 uppercase tracking-wider"
          >
            {f.messageLabel}
          </label>
          <textarea
            id="feedback-message"
            value={message}
            onChange={(e) => { setMessage(e.target.value); touch() }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                void handleSend()
              }
            }}
            placeholder={f.placeholders[kind]}
            maxLength={MESSAGE_MAX}
            rows={5}
            disabled={sending}
            className={`${inputClass} resize-y min-h-[84px] leading-relaxed border-border focus:border-text/30`}
          />
          <p
            className={`text-[10px] font-mono text-right tabular-nums mt-0.5 ${
              message.length >= MESSAGE_MAX ? 'text-red' : 'text-text-muted/60'
            }`}
          >
            {tf(f.charCount, { count: message.length, max: MESSAGE_MAX })}
          </p>
        </div>

        {/* Optional contact email */}
        <div>
          <label
            htmlFor="feedback-contact"
            className="block text-[11px] font-mono text-text-muted mb-1 uppercase tracking-wider"
          >
            {f.contactLabel}
          </label>
          <input
            id="feedback-contact"
            type="email"
            value={contact}
            onChange={(e) => { setContact(e.target.value); touch() }}
            placeholder={f.contactPlaceholder}
            maxLength={CONTACT_MAX}
            disabled={sending}
            aria-invalid={contactInvalid}
            aria-describedby="feedback-contact-hint"
            className={`${inputClass} ${contactInvalid ? 'border-red/60 focus:border-red' : 'border-border focus:border-text/30'}`}
          />
          <p
            id="feedback-contact-hint"
            className={`text-[11px] font-mono mt-1 ${contactInvalid ? 'text-red' : 'text-text-muted/70'}`}
          >
            {contactInvalid ? f.contactInvalid : f.contactHint}
          </p>
        </div>

        {/* Diagnostics opt-in (unchecked by default) + what it includes */}
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={includeDiagnostics}
            onChange={(e) => { setIncludeDiagnostics(e.target.checked); touch() }}
            disabled={sending}
            className="w-3 h-3 mt-[3px] accent-accent flex-shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
          />
          <span>
            <span className="block text-xs font-mono text-text">{f.includeDiagnostics}</span>
            <span className="block text-[11px] font-mono text-text-muted mt-0.5">{f.diagnosticsDetail}</span>
          </span>
        </label>

        <p className="text-[10px] font-mono text-text-muted/60 leading-relaxed">
          {f.privacy}{' '}
          <button
            type="button"
            onClick={() => window.noteflow.openUrl(PRIVACY_FEEDBACK_URL(lang))}
            className="underline underline-offset-2 hover:text-text transition-colors"
          >
            {f.privacyLink}
          </button>
        </p>

        {/* Send + result */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!canSend}
            className="flex items-center gap-2 px-3 py-2 rounded-md border border-accent/60 bg-accent/[0.1] text-xs font-mono text-accent hover:bg-accent/[0.18] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sending ? <Loader size={13} className="animate-spin" /> : <Send size={13} />}
            {sending ? f.sending : f.send}
          </button>
          {state.phase === 'sent' && (
            <p role="status" className="flex items-center gap-1.5 text-[11px] font-mono text-green-400">
              <Check size={13} className="flex-shrink-0" />
              {f.sent}
            </p>
          )}
        </div>
        {errorText && (
          <div
            role="alert"
            className="flex items-start gap-2 px-3 py-2 bg-red/10 border border-red/30 rounded text-xs font-mono text-red leading-relaxed"
          >
            <AlertCircle size={13} className="shrink-0 mt-[1px]" />
            <span>{errorText}</span>
          </div>
        )}
      </div>
    </section>
  )
}
