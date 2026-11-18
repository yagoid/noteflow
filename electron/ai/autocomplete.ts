// Inline AI autocomplete (ghost text in the editor) through the managed NoteFlow AI
// proxy: one short streamed request per suggestion to POST <ai-proxy>/autocomplete.
// The SERVER owns the prompt, the model and max_tokens; the client only sends the plain
// text around the caret plus what the note is about (its title, the name of the section
// being written and the names of its other sections) and cleans what comes back. No
// electron imports — the pure pieces (cleanSuggestion, noteContextFields, the backoff
// rules) are covered by tests/electron/autocomplete.test.ts. Wired to IPC in main.ts
// (`ai:complete`).

/** Context sent with each request (characters of plain text around the caret). */
export const AUTOCOMPLETE_BEFORE_CHARS = 1500
export const AUTOCOMPLETE_AFTER_CHARS = 200

/** Caps of the note context, the same the proxy applies (it sanitizes the names again). */
export const AUTOCOMPLETE_TITLE_CHARS = 200
export const AUTOCOMPLETE_SECTION_CHARS = 120
export const AUTOCOMPLETE_MAX_SECTIONS = 30
export const AUTOCOMPLETE_SECTION_NAME_CHARS = 80

/** What the note is about, as it travels in the request body (every field optional). */
export interface AutocompleteNoteFields {
  title?: string
  section?: string
  sections?: string[]
}

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff

/** The first `max` UTF-16 code units of `text`, never ending in half a surrogate pair. */
export function sliceStart(text: string, max: number): string {
  const cut = text.slice(0, max)
  return isHighSurrogate(cut.charCodeAt(cut.length - 1)) ? cut.slice(0, -1) : cut
}

/** The last `max` UTF-16 code units of `text`, never starting in half a surrogate pair. */
export function sliceEnd(text: string, max: number): string {
  const cut = text.slice(-max)
  return isLowSurrogate(cut.charCodeAt(0)) ? cut.slice(1) : cut
}

/**
 * The `title` / `section` / `sections` fields of the request body out of untrusted values
 * (they come over IPC): only strings, trimmed and capped — a request must stay far below
 * the proxy's body limit however long the names are —, blank ones left out. A field with
 * nothing in it is absent, so a note without any of it sends the same body as before.
 */
export function noteContextFields(title: unknown, section: unknown, sections: unknown): AutocompleteNoteFields {
  const name = (value: unknown, max: number) => (typeof value === 'string' ? sliceStart(value.trim(), max) : '')
  const fields: AutocompleteNoteFields = {}
  const t = name(title, AUTOCOMPLETE_TITLE_CHARS)
  if (t) fields.title = t
  const s = name(section, AUTOCOMPLETE_SECTION_CHARS)
  if (s) fields.section = s
  if (Array.isArray(sections)) {
    const names: string[] = []
    for (const item of sections) {
      if (names.length >= AUTOCOMPLETE_MAX_SECTIONS) break
      const n = name(item, AUTOCOMPLETE_SECTION_NAME_CHARS)
      if (n) names.push(n)
    }
    if (names.length > 0) fields.sections = names
  }
  return fields
}

/** Max words shown. Longer replies are cut at the last clause boundary inside the cap. */
export const AUTOCOMPLETE_MAX_WORDS = 12

const WORD_END = /[\p{L}\p{N},;:.!?)\]"”»]$/u
const WORD_START = /^[\p{L}\p{N}¿¡(["“«]/u
const CLOSING_PUNCTUATION = /^[,;:.!?)\]”»…]/u
const TRAILING_LETTERS = /[\p{L}\p{M}]+$/u
const LEADING_LETTERS = /^[\p{L}\p{M}]+/u
const WORD_CHAR_END = /[\p{L}\p{M}\p{N}]$/u
const WORD_CHAR_START = /^[\p{L}\p{M}\p{N}]/u

/**
 * The reply's first character, set by the proxy's prompt: "+" = the reply finishes the word
 * the caret was left in (glued, no space), "_" = the reply starts a new word. The model
 * sometimes puts a space after it ("_ el orden"). A "+" when the text does not end in a
 * letter or digit is read as "_". Known limit: a reply WITHOUT a marker that really starts
 * with "+" or "_" loses that character.
 */
const REPLY_MARKER = /^([+_])\s*/

/**
 * Fallback for a reply WITHOUT the marker (an older proxy, a model that skips it): was the
 * caret left in the MIDDLE of a word that `head` (the reply's first word) finishes?
 *
 * The model's own leading space can't be trusted either way: it sometimes sends " ta mañana"
 * after "dentis" (a space too many) and sometimes "al dentista" after "voy" (a space too few),
 * and nothing in the reply tells the two apart. So the default is the common case — the user
 * paused after a whole word, the reply is a new word — and a join only happens on evidence
 * from the user's own text: the joined word (`dentis` + `ta`) already appears earlier as a
 * whole word while the fragment alone (`dentis`) never does. Single-letter fragments are
 * never joined (a / y / o / e / I are words), and neither is a capitalised reply.
 */
export function finishesLastWord(before: string, head: string): boolean {
  const fragment = TRAILING_LETTERS.exec(before)?.[0] ?? ''
  if (fragment.length < 2 || !head || head !== head.toLowerCase()) return false
  const known = new Set(
    (before.slice(0, before.length - fragment.length).toLowerCase().match(/[\p{L}\p{M}]+/gu) ?? [])
  )
  const f = fragment.toLowerCase()
  return !known.has(f) && known.has(f + head)
}

/**
 * Turns the model's raw reply into the text to insert at the caret: first line only,
 * echo of the text before the cursor removed (longest suffix of the current line that
 * starts at a word boundary and prefixes the reply), spacing fixed (the reply's leading
 * marker — see REPLY_MARKER — decides it; without one, see finishesLastWord), a reply cut
 * by the token cap trimmed back to its last whole word, and at most
 * AUTOCOMPLETE_MAX_WORDS words.
 *
 * With `partial` (the reply is still streaming) it returns only what is already safe to
 * show: the last word is held back until the next one starts (it may be half a token),
 * nothing is shown while the reply could still turn out to be an echo of the line, nor
 * before the marker has some text after it.
 */
export function cleanSuggestion(
  before: string,
  raw: string,
  finishReason: string | null,
  opts: { partial?: boolean } = {}
): string {
  let text = raw.replace(/<CURSOR\/>/g, '').replace(/^\s*\n/, '')
  const nl = text.indexOf('\n')
  const lineDone = nl >= 0
  if (lineDone) text = text.slice(0, nl)
  // The last word may be incomplete: the stream is still open, or the token cap cut it.
  const openEnd = !lineDone && !/\s$/.test(text) && (opts.partial === true || finishReason === 'length')
  text = text.trimEnd()
  if (!text.trim()) return ''

  const endsWithSpace = before === '' || /\s$/.test(before)
  const line = before.slice(before.lastIndexOf('\n') + 1).trimEnd()
  const unmarked = text.trimStart()
  // Only the reply's first non-blank character can be the marker; a marker alone is empty.
  const sent = (REPLY_MARKER.exec(unmarked)?.[1] ?? null) as '+' | '_' | null
  // "+" needs a word to be glued to: after punctuation ("Hola." + "+Luego") it is a new word.
  const marker = sent === '+' && !WORD_CHAR_END.test(before) ? '_' : sent
  const reply = sent ? unmarked.replace(REPLY_MARKER, '') : unmarked
  if (!reply) return ''
  const modelSpace = text !== unmarked
  let rest: string | null = null
  for (let i = 0; i < line.length; i++) {
    if (i > 0 && !/\s/.test(line[i - 1])) continue
    if (/\s/.test(line[i])) continue
    const suffix = line.slice(i)
    if (reply.startsWith(suffix)) {
      const after = reply.slice(suffix.length)
      // A new word that merely starts like the line's last one is not an echo
      // ("Compré la" + "_lavadora"): with "_" the echo must stop at a word boundary.
      if (marker === '_' && WORD_CHAR_START.test(after)) continue
      rest = after
      break
    }
    // Still streaming and everything so far repeats the line: wait for more.
    if (opts.partial && !lineDone && suffix.startsWith(reply)) return ''
  }
  let out: string
  if (rest !== null) {
    out = endsWithSpace ? rest.trimStart() : rest
  } else if (endsWithSpace) {
    out = reply
  } else if (marker === '+' || CLOSING_PUNCTUATION.test(reply)) {
    out = reply // glued to the half-typed word; "hola" + ", que tal": never a space before closing punctuation
  } else if (marker === '_') {
    out = ` ${reply}`
  } else if (WORD_END.test(before) && WORD_START.test(reply)) {
    out = finishesLastWord(before, LEADING_LETTERS.exec(reply)?.[0] ?? '') ? reply : ` ${reply}`
  } else {
    out = modelSpace ? ` ${reply}` : reply
  }
  if (openEnd) {
    const cut = out.search(/\s+\S*$/)
    if (cut > 0) out = out.slice(0, cut)
    else if (opts.partial) return '' // a single, possibly unfinished word
  }
  out = shorten(out.trimEnd())
  return out.trim() ? out : ''
}

function shorten(text: string): string {
  const words = text.match(/\s*\S+/g) ?? []
  if (words.length <= AUTOCOMPLETE_MAX_WORDS) return text
  const capped = words.slice(0, AUTOCOMPLETE_MAX_WORDS).join('')
  // Prefer ending on punctuation (after at least 4 words) over a hard word cut.
  let best = -1
  for (const hit of capped.matchAll(/[,;:.!?](?=\s|$)/g)) best = hit.index + 1
  return best > 0 && capped.slice(0, best).trim().split(/\s+/).length >= 4 ? capped.slice(0, best) : capped
}

// ── Backoff after a failed request ─────────────────────────────────────────────

/** After a quota 429 (autocomplete ceiling or the whole monthly allowance): no requests for a while. */
export const AUTOCOMPLETE_QUOTA_BACKOFF_MS = 30 * 60_000
/** No plan (403): wait, unless the account changes first (main resets the gate then). */
export const AUTOCOMPLETE_NO_PLAN_BACKOFF_MS = 10 * 60_000
/** Transient trouble (network, 5xx, a rate-limit 429): a short breather, not one failure per typing pause. */
export const AUTOCOMPLETE_TRANSIENT_BACKOFF_MS = 60_000

/**
 * How long to stop asking after a rejected request, in ms. `status` 0 = the request never
 * got an answer (network). Infinity = not again in this app session (a proxy without the
 * route answers 404/405). 0 = no pause: a 401 (the caller drops the token; the next request
 * mints a fresh one) and the request-specific 400/413.
 */
export function autocompleteBackoffMs(status: number, code: string): number {
  if (status === 404 || status === 405) return Infinity
  if (status === 429) {
    return code === 'autocomplete_quota_exceeded' || code === 'monthly_quota_exceeded'
      ? AUTOCOMPLETE_QUOTA_BACKOFF_MS
      : AUTOCOMPLETE_TRANSIENT_BACKOFF_MS
  }
  if (status === 403) return AUTOCOMPLETE_NO_PLAN_BACKOFF_MS
  if (status === 401 || status === 400 || status === 413) return 0
  return AUTOCOMPLETE_TRANSIENT_BACKOFF_MS
}

/** Next `blockedUntil` (epoch ms, Infinity = session) after a failure at `now`. Never shortens a longer block. */
export function blockedUntilAfterFailure(blockedUntil: number, status: number, code: string, now: number): number {
  const backoff = autocompleteBackoffMs(status, code)
  return backoff > 0 ? Math.max(blockedUntil, now + backoff) : blockedUntil
}

/**
 * The account changed (another user, a plan that arrived or lapsed): timed blocks belonged
 * to the previous state and are dropped; a missing route stays missing for the session.
 */
export function blockedUntilAfterAccountChange(blockedUntil: number): number {
  return blockedUntil === Infinity ? Infinity : 0
}

/**
 * The `autocomplete` field of the proxy's GET /usage body ({used, limit}), or null when it
 * is absent (an older proxy) or malformed — "unknown", never an error.
 */
export function parseAutocompleteUsage(raw: unknown): { used: number; limit: number } | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.used !== 'number' || typeof o.limit !== 'number') return null
  if (!Number.isFinite(o.used) || !Number.isFinite(o.limit) || o.used < 0 || o.limit <= 0) return null
  return { used: o.used, limit: o.limit }
}

// ── The request ────────────────────────────────────────────────────────────────

/** A request the proxy rejected (or, with status 0, a failure mid-stream / on the network). */
export class AutocompleteRequestError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(`HTTP ${status}${code ? ` ${code}` : ''}`)
    this.name = 'AutocompleteRequestError'
  }
}

/**
 * One streamed completion. `onPartial` receives the cleaned text that is safe to show so
 * far, each time it changes; the promise resolves with the final cleaned suggestion ('' =
 * nothing worth showing). Throws AutocompleteRequestError on a rejected request and the
 * fetch's own error on abort / network failure.
 */
export async function completeText(opts: {
  baseUrl: string
  token: string
  before: string
  after: string
  /** What the note is about (untrusted: see noteContextFields). Never from content the AI must not see. */
  title?: unknown
  section?: unknown
  sections?: unknown
  signal: AbortSignal
  onPartial?: (text: string) => void
  fetchImpl?: typeof fetch
}): Promise<string> {
  // The renderer already cut both to these lengths: an orphan half of a surrogate pair at
  // the outer edge (an emoji right at the cut) is dropped here either way.
  const before = sliceEnd(opts.before, AUTOCOMPLETE_BEFORE_CHARS)
  const after = sliceStart(opts.after, AUTOCOMPLETE_AFTER_CHARS)
  const about = noteContextFields(opts.title, opts.section, opts.sections)
  const res = await (opts.fetchImpl ?? fetch)(`${opts.baseUrl.replace(/\/+$/, '')}/autocomplete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.token}` },
    body: JSON.stringify({ before, ...(after ? { after } : {}), ...about }),
    signal: opts.signal,
  })
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '')
    let code = ''
    try { code = String((JSON.parse(detail) as { error?: { code?: unknown } }).error?.code ?? '') } catch { /* not JSON */ }
    throw new AutocompleteRequestError(res.status, code)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let raw = ''
  let shown = ''
  let finishReason: string | null = null
  let finished = false
  try {
    while (!finished) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') { finished = true; break }
        let json: {
          error?: { code?: unknown }
          choices?: Array<{ finish_reason?: string | null; delta?: { content?: string } }>
        }
        try { json = JSON.parse(data) } catch { continue }
        if (json.error) throw new AutocompleteRequestError(0, String(json.error.code ?? 'stream_error'))
        const choice = json.choices?.[0]
        if (!choice) continue
        if (choice.finish_reason) finishReason = choice.finish_reason
        if (choice.delta?.content) {
          raw += choice.delta.content
          if (opts.onPartial) {
            const partial = cleanSuggestion(before, raw, null, { partial: true })
            if (partial && partial !== shown) { shown = partial; opts.onPartial(partial) }
          }
        }
      }
    }
  } catch (err) {
    void reader.cancel().catch(() => {})
    throw err
  }
  if (finished) void reader.cancel().catch(() => {})
  return cleanSuggestion(before, raw, finishReason)
}
