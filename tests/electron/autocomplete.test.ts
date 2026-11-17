import { describe, it, expect } from 'vitest'
import {
  AUTOCOMPLETE_BEFORE_CHARS, AUTOCOMPLETE_MAX_WORDS, AUTOCOMPLETE_NO_PLAN_BACKOFF_MS,
  AUTOCOMPLETE_QUOTA_BACKOFF_MS, AUTOCOMPLETE_TRANSIENT_BACKOFF_MS, AutocompleteRequestError,
  autocompleteBackoffMs, blockedUntilAfterAccountChange, blockedUntilAfterFailure, cleanSuggestion,
  completeText, finishesLastWord, parseAutocompleteUsage,
} from '../../electron/ai/autocomplete'

describe('cleanSuggestion — spacing', () => {
  it('adds the space the model left out after a whole word', () => {
    expect(cleanSuggestion('Mañana voy', 'al dentista', 'stop')).toBe(' al dentista')
  })

  it("keeps a single space when the model sent its own", () => {
    expect(cleanSuggestion('Mañana voy', ' al dentista', 'stop')).toBe(' al dentista')
    expect(cleanSuggestion('Mañana voy', '   al dentista', 'stop')).toBe(' al dentista')
  })

  it('adds no space when the text already ends with one, or is empty', () => {
    expect(cleanSuggestion('Mañana voy ', ' al dentista', 'stop')).toBe('al dentista')
    expect(cleanSuggestion('', ' Hola', 'stop')).toBe('Hola')
  })

  it('never puts a space before closing punctuation', () => {
    expect(cleanSuggestion('Compré pan', ', leche y huevos', 'stop')).toBe(', leche y huevos')
    expect(cleanSuggestion('Compré pan', ' , leche y huevos', 'stop')).toBe(', leche y huevos')
  })

  it('adds a space after punctuation', () => {
    expect(cleanSuggestion('Compré pan,', 'leche y huevos', 'stop')).toBe(' leche y huevos')
  })

  it('follows the model after an opening bracket', () => {
    expect(cleanSuggestion('La reunión (', 'la del martes)', 'stop')).toBe('la del martes)')
  })
})

describe('cleanSuggestion — middle of a word', () => {
  const note = 'Llamar al dentista para pedir cita.\nMañana voy al dentis'

  it('joins when the finished word already appears in the text (even if the model sent a space)', () => {
    expect(cleanSuggestion(note, ' ta por la tarde', 'stop')).toBe('ta por la tarde')
    expect(cleanSuggestion(note, 'ta por la tarde', 'stop')).toBe('ta por la tarde')
  })

  it('does not join without that evidence (the common case: a new word)', () => {
    expect(cleanSuggestion('Mañana voy al dentis', ' ta por la tarde', 'stop')).toBe(' ta por la tarde')
    expect(cleanSuggestion('Llamar al dentista. Mañana voy al dentista', 's de siempre', 'stop')).toBe(' s de siempre')
  })

  it('finishesLastWord: needs the joined word known and the fragment unknown', () => {
    expect(finishesLastWord('el dentista dijo que el dentis', 'ta')).toBe(true)
    // The fragment is itself a word of the text: the user finished it.
    expect(finishesLastWord('para la parada, ir para', 'da')).toBe(false)
    // One-letter fragments are words (a, y, o…): never joined.
    expect(finishesLastWord('ya lo sé y', 'a')).toBe(false)
    // A capitalised reply starts a new word.
    expect(finishesLastWord('NoteFlow es rápido. Note', 'Flow')).toBe(false)
    expect(finishesLastWord('texto sin letras al final ', 'ta')).toBe(false)
    expect(finishesLastWord('el dentista dijo que el dentis', '')).toBe(false)
  })

  it('compares without case', () => {
    expect(cleanSuggestion('Dentista: llamar. Ir al Dentis', 'ta mañana', 'stop')).toBe('ta mañana')
  })
})

describe('cleanSuggestion — echo, first line, marker', () => {
  it('drops an echo of the end of the line', () => {
    expect(cleanSuggestion('Notas\nMañana voy al', 'voy al dentista', 'stop')).toBe(' dentista')
    expect(cleanSuggestion('Mañana voy al ', 'Mañana voy al dentista', 'stop')).toBe('dentista')
  })

  it('an echo that finishes a half-typed word joins it', () => {
    expect(cleanSuggestion('Mañana voy al dentis', 'dentista por la tarde', 'stop')).toBe('ta por la tarde')
  })

  it('keeps only the first line', () => {
    expect(cleanSuggestion('Mañana voy', ' al dentista\ny luego al cine', 'stop')).toBe(' al dentista')
    expect(cleanSuggestion('Mañana voy', '\n al dentista', 'stop')).toBe(' al dentista')
  })

  it('strips the cursor marker and returns nothing for an empty reply', () => {
    expect(cleanSuggestion('Mañana voy ', '<CURSOR/>al dentista', 'stop')).toBe('al dentista')
    expect(cleanSuggestion('Mañana voy', '', 'stop')).toBe('')
    expect(cleanSuggestion('Mañana voy', '  \n ', 'stop')).toBe('')
    expect(cleanSuggestion('Mañana voy al', 'voy al', 'stop')).toBe('')
  })
})

describe('cleanSuggestion — length', () => {
  it('trims a reply cut by the token cap back to its last whole word', () => {
    expect(cleanSuggestion('Mañana voy', ' al dentista por la tar', 'length')).toBe(' al dentista por la')
    expect(cleanSuggestion('Mañana voy', ' al dentista por la tar', 'stop')).toBe(' al dentista por la tar')
    // …unless the cut fell right after a word.
    expect(cleanSuggestion('Mañana voy', ' al dentista ', 'length')).toBe(' al dentista')
  })

  it(`caps at ${AUTOCOMPLETE_MAX_WORDS} words`, () => {
    const out = cleanSuggestion('Lista', ' uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce', 'stop')
    expect(out).toBe(' uno dos tres cuatro cinco seis siete ocho nueve diez once doce')
  })

  it('prefers the last clause boundary inside the cap (after at least 4 words)', () => {
    const out = cleanSuggestion('Lista', ' uno dos tres cuatro cinco, seis siete ocho nueve diez once doce trece', 'stop')
    expect(out).toBe(' uno dos tres cuatro cinco,')
    const early = cleanSuggestion('Lista', ' uno, dos tres cuatro cinco seis siete ocho nueve diez once doce trece', 'stop')
    expect(early).toBe(' uno, dos tres cuatro cinco seis siete ocho nueve diez once doce')
  })
})

describe('cleanSuggestion — partial (streaming)', () => {
  const partial = (before: string, raw: string) => cleanSuggestion(before, raw, null, { partial: true })

  it('holds the last word back until the next one starts', () => {
    expect(partial('Mañana voy', ' al')).toBe('')
    expect(partial('Mañana voy', ' al den')).toBe(' al')
    expect(partial('Mañana voy', ' al dentista ')).toBe(' al dentista')
    expect(partial('Mañana voy', ' al dentista por')).toBe(' al dentista')
  })

  it('shows the whole first line once a line break closes it', () => {
    expect(partial('Mañana voy', ' al dentista\n')).toBe(' al dentista')
    expect(partial('Mañana voy', ' al dentista\ny luego')).toBe(' al dentista')
  })

  it('shows nothing while the reply may still be an echo of the line', () => {
    expect(partial('Mañana voy al', 'voy')).toBe('')
    expect(partial('Mañana voy al', 'voy al')).toBe('')
    expect(partial('Mañana voy al', 'voy al dentista por')).toBe(' dentista')
  })

  it('grows towards the final text', () => {
    const before = 'Hoy he quedado con Ana'
    const chunks = [' para', ' comer', ' en', ' el', ' centro', '.']
    let raw = ''
    const seen: string[] = []
    for (const chunk of chunks) {
      raw += chunk
      const text = partial(before, raw)
      if (text && text !== seen[seen.length - 1]) seen.push(text)
    }
    const final = cleanSuggestion(before, raw, 'stop')
    expect(final).toBe(' para comer en el centro.')
    for (const text of seen) expect(final.startsWith(text)).toBe(true)
    expect(seen[seen.length - 1]).toBe(' para comer en el')
  })

  it('applies the mid-word rule to partial text too', () => {
    expect(partial('Ir al dentista. Mañana voy al dentis', ' ta por la')).toBe('ta por')
  })
})

describe('backoff after a failed request', () => {
  it('quota 429s pause for 30 minutes', () => {
    expect(AUTOCOMPLETE_QUOTA_BACKOFF_MS).toBe(30 * 60_000)
    expect(autocompleteBackoffMs(429, 'autocomplete_quota_exceeded')).toBe(AUTOCOMPLETE_QUOTA_BACKOFF_MS)
    expect(autocompleteBackoffMs(429, 'monthly_quota_exceeded')).toBe(AUTOCOMPLETE_QUOTA_BACKOFF_MS)
    expect(autocompleteBackoffMs(429, '')).toBe(AUTOCOMPLETE_TRANSIENT_BACKOFF_MS)
  })

  it('a proxy without the route is not asked again in the session', () => {
    expect(autocompleteBackoffMs(404, '')).toBe(Infinity)
    expect(autocompleteBackoffMs(405, '')).toBe(Infinity)
  })

  it('other failures', () => {
    expect(autocompleteBackoffMs(403, 'subscription_inactive')).toBe(AUTOCOMPLETE_NO_PLAN_BACKOFF_MS)
    expect(autocompleteBackoffMs(401, '')).toBe(0)
    expect(autocompleteBackoffMs(400, 'invalid_request')).toBe(0)
    expect(autocompleteBackoffMs(413, 'request_too_large')).toBe(0)
    expect(autocompleteBackoffMs(502, 'upstream_error')).toBe(AUTOCOMPLETE_TRANSIENT_BACKOFF_MS)
    expect(autocompleteBackoffMs(0, '')).toBe(AUTOCOMPLETE_TRANSIENT_BACKOFF_MS)
  })

  it('blockedUntilAfterFailure never shortens a longer block', () => {
    const now = 1_000_000
    expect(blockedUntilAfterFailure(0, 429, 'monthly_quota_exceeded', now)).toBe(now + AUTOCOMPLETE_QUOTA_BACKOFF_MS)
    expect(blockedUntilAfterFailure(0, 401, '', now)).toBe(0)
    expect(blockedUntilAfterFailure(now + AUTOCOMPLETE_QUOTA_BACKOFF_MS, 502, 'upstream_error', now))
      .toBe(now + AUTOCOMPLETE_QUOTA_BACKOFF_MS)
    expect(blockedUntilAfterFailure(now + 5, 404, '', now)).toBe(Infinity)
    expect(blockedUntilAfterFailure(Infinity, 429, 'monthly_quota_exceeded', now)).toBe(Infinity)
  })

  it('an account change drops a timed block but not a missing route', () => {
    expect(blockedUntilAfterAccountChange(123_456)).toBe(0)
    expect(blockedUntilAfterAccountChange(0)).toBe(0)
    expect(blockedUntilAfterAccountChange(Infinity)).toBe(Infinity)
  })
})

describe('parseAutocompleteUsage', () => {
  it('reads {used, limit}', () => {
    expect(parseAutocompleteUsage({ used: 10, limit: 900_000 })).toEqual({ used: 10, limit: 900_000 })
    expect(parseAutocompleteUsage({ used: 0, limit: 1, extra: true })).toEqual({ used: 0, limit: 1 })
  })

  it('absent or malformed → unknown', () => {
    expect(parseAutocompleteUsage(undefined)).toBeNull()
    expect(parseAutocompleteUsage(null)).toBeNull()
    expect(parseAutocompleteUsage('x')).toBeNull()
    expect(parseAutocompleteUsage({ used: '1', limit: 2 })).toBeNull()
    expect(parseAutocompleteUsage({ used: 1 })).toBeNull()
    expect(parseAutocompleteUsage({ used: 1, limit: 0 })).toBeNull()
    expect(parseAutocompleteUsage({ used: -1, limit: 5 })).toBeNull()
    expect(parseAutocompleteUsage({ used: NaN, limit: 5 })).toBeNull()
  })
})

describe('completeText', () => {
  const sse = (frames: string[]): Response =>
    new Response(frames.map((f) => `data: ${f}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } })
  const delta = (content: string, finish: string | null = null) =>
    JSON.stringify({ object: 'chat.completion.chunk', choices: [{ delta: { content }, finish_reason: finish }] })

  it('posts only the text around the caret to /autocomplete and streams the cleaned text', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const partials: string[] = []
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return sse([delta(' al'), delta(' dentista'), delta(' hoy', 'stop'), '[DONE]'])
    }) as unknown as typeof fetch
    const text = await completeText({
      baseUrl: 'https://proxy.example/ai-proxy/',
      token: 'tok',
      before: 'x'.repeat(AUTOCOMPLETE_BEFORE_CHARS) + ' Mañana voy',
      after: 'resto',
      signal: new AbortController().signal,
      onPartial: (p) => partials.push(p),
      fetchImpl,
    })
    expect(text).toBe(' al dentista hoy')
    expect(partials).toEqual([' al', ' al dentista'])
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://proxy.example/ai-proxy/autocomplete')
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer tok')
    const body = JSON.parse(String(calls[0].init.body)) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['after', 'before'])
    expect((body.before as string).length).toBe(AUTOCOMPLETE_BEFORE_CHARS)
    expect((body.before as string).endsWith(' Mañana voy')).toBe(true)
    expect(body.after).toBe('resto')
  })

  it('omits an empty `after`', async () => {
    let sent = ''
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      sent = String(init.body)
      return sse([delta(' hola', 'stop'), '[DONE]'])
    }) as unknown as typeof fetch
    await completeText({ baseUrl: 'https://p', token: 't', before: 'Texto de prueba', after: '', signal: new AbortController().signal, fetchImpl })
    expect(JSON.parse(sent)).toEqual({ before: 'Texto de prueba' })
  })

  it('throws the status and the error code of a rejected request', async () => {
    const fetchImpl = (async () => new Response(
      JSON.stringify({ error: { code: 'autocomplete_quota_exceeded', message: 'x' } }), { status: 429 },
    )) as unknown as typeof fetch
    const err = await completeText({
      baseUrl: 'https://p', token: 't', before: 'Texto de prueba', after: '', signal: new AbortController().signal, fetchImpl,
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AutocompleteRequestError)
    expect((err as AutocompleteRequestError).status).toBe(429)
    expect((err as AutocompleteRequestError).code).toBe('autocomplete_quota_exceeded')
  })

  it('a 404 without a JSON body (a proxy without the route) still carries the status', async () => {
    const fetchImpl = (async () => new Response('Not found', { status: 404 })) as unknown as typeof fetch
    const err = await completeText({
      baseUrl: 'https://p', token: 't', before: 'Texto de prueba', after: '', signal: new AbortController().signal, fetchImpl,
    }).catch((e: unknown) => e)
    expect((err as AutocompleteRequestError).status).toBe(404)
    expect((err as AutocompleteRequestError).code).toBe('')
  })

  it('an error frame in the stream throws', async () => {
    const fetchImpl = (async () => sse([delta(' al'), JSON.stringify({ error: { code: 'upstream_error' } })])) as unknown as typeof fetch
    const err = await completeText({
      baseUrl: 'https://p', token: 't', before: 'Texto de prueba', after: '', signal: new AbortController().signal, fetchImpl,
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AutocompleteRequestError)
    expect((err as AutocompleteRequestError).code).toBe('upstream_error')
  })
})
