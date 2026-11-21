import { describe, it, expect } from 'vitest'
import {
  AUTOCOMPLETE_BEFORE_CHARS, AUTOCOMPLETE_MAX_SECTIONS, AUTOCOMPLETE_MAX_WORDS, AUTOCOMPLETE_NO_PLAN_BACKOFF_MS,
  AUTOCOMPLETE_QUOTA_BACKOFF_MS, AUTOCOMPLETE_SECTION_CHARS, AUTOCOMPLETE_SECTION_NAME_CHARS,
  AUTOCOMPLETE_TITLE_CHARS, AUTOCOMPLETE_TRANSIENT_BACKOFF_MS, AutocompleteRequestError,
  autocompleteBackoffMs, blockedUntilAfterAccountChange, blockedUntilAfterFailure, cleanSuggestion,
  completeText, finishesLastWord, firstSentence, naturalEnd, noteContextFields, parseAutocompleteUsage, sliceEnd, sliceStart,
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

describe('cleanSuggestion — reply marker ("+" glued, "_" new word)', () => {
  const partial = (before: string, raw: string) => cleanSuggestion(before, raw, null, { partial: true })

  it('"+" glues the reply to the half-typed word', () => {
    expect(cleanSuggestion('Mañana voy al dentis', '+ta por la tarde', 'stop')).toBe('ta por la tarde')
    expect(cleanSuggestion('Mañana voy al dentis', '+ ta por la tarde', 'stop')).toBe('ta por la tarde')
    expect(cleanSuggestion('Mañana voy al dentis', '  +ta por la tarde', 'stop')).toBe('ta por la tarde')
    // No evidence in the text is needed (unlike the unmarked fallback), not even for one letter.
    expect(cleanSuggestion('We should probably resched', '+ule the meeting', 'stop')).toBe('ule the meeting')
    expect(cleanSuggestion('Vamos a l', '+a playa mañana', 'stop')).toBe('a playa mañana')
  })

  it('"_" starts a new word: one space, whether or not the model sent one after the marker', () => {
    expect(cleanSuggestion('Mañana voy', '_al dentista', 'stop')).toBe(' al dentista')
    expect(cleanSuggestion('Mañana voy', '_ al dentista', 'stop')).toBe(' al dentista')
    expect(cleanSuggestion('Hay que revisar', '_ el orden', 'stop')).toBe(' el orden')
    // Even when the joined word is known from the text (the fallback would have joined).
    expect(cleanSuggestion('Ir al dentista. Mañana voy al dentis', '_ta por la tarde', 'stop')).toBe(' ta por la tarde')
  })

  it('"_" puts no space before closing punctuation', () => {
    expect(cleanSuggestion('Compré pan', '_, leche y huevos', 'stop')).toBe(', leche y huevos')
    expect(cleanSuggestion('Compré pan', '_ ; luego fui a casa', 'stop')).toBe('; luego fui a casa')
    // (a period ends the suggestion: never a second sentence)
    expect(cleanSuggestion('Compré pan', '_ . Luego fui a casa', 'stop')).toBe('.')
  })

  it('adds no space when the text already ends with one, a line break, or is empty', () => {
    expect(cleanSuggestion('Mañana voy ', '_al dentista', 'stop')).toBe('al dentista')
    expect(cleanSuggestion('Mañana voy ', '_ al dentista', 'stop')).toBe('al dentista')
    expect(cleanSuggestion('Mañana voy ', '+al dentista', 'stop')).toBe('al dentista')
    expect(cleanSuggestion('Lista de hoy:\n', '_comprar pan', 'stop')).toBe('comprar pan')
    expect(cleanSuggestion('', '_Hola', 'stop')).toBe('Hola')
  })

  it('"+" with nothing to glue to (the text does not end in a letter or digit) is a new word', () => {
    expect(cleanSuggestion('Hola.', '+Luego nos vemos', 'stop')).toBe(' Luego nos vemos')
    expect(cleanSuggestion('Compré pan,', '+ leche y huevos', 'stop')).toBe(' leche y huevos')
    expect(cleanSuggestion('Compré pan', '+, leche y huevos', 'stop')).toBe(', leche y huevos')
    expect(cleanSuggestion('Hola. ', '+Luego nos vemos', 'stop')).toBe('Luego nos vemos')
    // Digits and accented letters are a word to glue to.
    expect(cleanSuggestion('Quedamos en 202', '+6 para cenar', 'stop')).toBe('6 para cenar')
    expect(cleanSuggestion('Fui a la reunió', '+n de ayer', 'stop')).toBe('n de ayer')
  })

  it('"_": an echo is only dropped when it stops at a word boundary', () => {
    expect(cleanSuggestion('Compré la', '_lavadora nueva ayer', 'stop')).toBe(' lavadora nueva ayer')
    expect(cleanSuggestion('Hola.', '+Hola.mente no es eco', 'stop')).toBe(' Hola.mente no es eco')
    // A real echo still goes: followed by a space, punctuation or nothing.
    expect(cleanSuggestion('Compré la', '_la lavadora nueva', 'stop')).toBe(' lavadora nueva')
    expect(cleanSuggestion('Compré la', '_Compré la, y luego', 'stop')).toBe(', y luego')
    expect(cleanSuggestion('Compré la', '_la', 'stop')).toBe('')
    // "+" keeps cutting inside the word: that is what finishing it means.
    expect(cleanSuggestion('Compré la', '+lavadora nueva', 'stop')).toBe('vadora nueva')
    // Streaming: "_la" may still be an echo, "_lavadora …" no longer is.
    expect(cleanSuggestion('Compré la', '_la', null, { partial: true })).toBe('')
    expect(cleanSuggestion('Compré la', '_lavadora nueva ay', null, { partial: true })).toBe(' lavadora nueva')
  })

  it('without a marker the old spacing rules still apply (older proxy)', () => {
    expect(cleanSuggestion('Mañana voy', 'al dentista', 'stop')).toBe(' al dentista')
    expect(cleanSuggestion('Ir al dentista. Mañana voy al dentis', ' ta por la tarde', 'stop')).toBe('ta por la tarde')
    expect(cleanSuggestion('Mañana voy al dentis', 'ta por la tarde', 'stop')).toBe(' ta por la tarde')
  })

  it('a marker alone is an empty suggestion', () => {
    expect(cleanSuggestion('Mañana voy', '+', 'stop')).toBe('')
    expect(cleanSuggestion('Mañana voy', '_', 'stop')).toBe('')
    expect(cleanSuggestion('Mañana voy', ' _  ', 'stop')).toBe('')
    expect(cleanSuggestion('Mañana voy', '_\ny luego', 'stop')).toBe('')
  })

  it('only the first character is a marker: later "+" and "_" are text', () => {
    expect(cleanSuggestion('El total es', '_2 + 2 y snake_case', 'stop')).toBe(' 2 + 2 y snake_case')
    expect(cleanSuggestion('El total es', '+_x', 'stop')).toBe('_x')
    expect(cleanSuggestion('El total es', 'a + b_c', 'stop')).toBe(' a + b_c')
  })

  it('the rest of the cleaning is unchanged: echo, first line, token cap, word cap', () => {
    expect(cleanSuggestion('Notas\nMañana voy al', '_voy al dentista', 'stop')).toBe(' dentista')
    expect(cleanSuggestion('Hay que comprar toma', '+tomates y cebollas', 'stop')).toBe('tes y cebollas')
    expect(cleanSuggestion('Mañana voy', '_al dentista\ny luego al cine', 'stop')).toBe(' al dentista')
    expect(cleanSuggestion('Mañana voy', '_al dentista por la tar', 'length')).toBe(' al dentista por la')
    const many = Array.from({ length: AUTOCOMPLETE_MAX_WORDS + 3 }, (_, i) => `w${i + 1}`)
    expect(cleanSuggestion('Lista', `_${many.join(' ')}`, 'stop')).toBe(` ${many.slice(0, AUTOCOMPLETE_MAX_WORDS).join(' ')}`)
  })

  it('partial: nothing until the marker is known and a whole word follows it', () => {
    expect(partial('Mañana voy', ' ')).toBe('')
    expect(partial('Mañana voy', '_')).toBe('')
    expect(partial('Mañana voy', '_ ')).toBe('')
    expect(partial('Mañana voy', '+')).toBe('')
    expect(partial('Mañana voy', '_al')).toBe('')
    expect(partial('Mañana voy', '_al den')).toBe(' al')
    expect(partial('Mañana voy', '_ al dentista por')).toBe(' al dentista')
    expect(partial('We should probably resched', '+ule the mee')).toBe('ule the')
  })
})

describe('cleanSuggestion — middle of a word (no marker: fallback heuristic)', () => {
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

  const words = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `w${from + i}`).join(' ')

  it('keeps a long sentence whole (well past the old 12-word cap)', () => {
    const sentence = ' y después pasaremos por la tienda del barrio a comprar el pan, la leche y unas cuantas cosas más para la cena de esta noche.'
    expect(cleanSuggestion('Mañana iremos al parque', sentence, 'stop')).toBe(sentence)
  })

  it(`caps at ${AUTOCOMPLETE_MAX_WORDS} words`, () => {
    expect(AUTOCOMPLETE_MAX_WORDS).toBe(40)
    const out = cleanSuggestion('Lista', ` ${words(1, AUTOCOMPLETE_MAX_WORDS + 5)}`, 'stop')
    expect(out).toBe(` ${words(1, AUTOCOMPLETE_MAX_WORDS)}`)
  })

  it('over the cap, prefers the last clause boundary inside it (after at least 4 words)', () => {
    const out = cleanSuggestion('Lista', ` ${words(1, 20)}, ${words(21, AUTOCOMPLETE_MAX_WORDS + 5)}`, 'stop')
    expect(out).toBe(` ${words(1, 20)},`)
    const early = cleanSuggestion('Lista', ` w1, ${words(2, AUTOCOMPLETE_MAX_WORDS + 5)}`, 'stop')
    expect(early).toBe(` w1, ${words(2, AUTOCOMPLETE_MAX_WORDS)}`)
  })

  it('a reply cut by the token cap ends at its last clause boundary, not mid-clause', () => {
    expect(cleanSuggestion('Mañana voy', ' al dentista por la tarde, y luego iré a compr', 'length'))
      .toBe(' al dentista por la tarde,')
    // Too few words before the boundary: the whole-word cut stays.
    expect(cleanSuggestion('Mañana voy', ' al dentista, y luego iré a compr', 'length')).toBe(' al dentista, y luego iré a')
    // A reply that ended on its own is never cut back to a comma.
    expect(cleanSuggestion('Mañana voy', ' al dentista por la tarde, y luego iré a comprar', 'stop'))
      .toBe(' al dentista por la tarde, y luego iré a comprar')
  })
})

describe('cleanSuggestion — one sentence at most', () => {
  it('stops at the end of the sentence it completes', () => {
    expect(cleanSuggestion('Hoy he quedado con Ana', ' para comer. Luego iremos al cine.', 'stop')).toBe(' para comer.')
    expect(cleanSuggestion('Ana viene', ' a comer? Seguro que sí', 'stop')).toBe(' a comer?')
    expect(cleanSuggestion('Ana viene', ' a comer! Seguro que sí', 'stop')).toBe(' a comer!')
    expect(cleanSuggestion('Ana viene', ' a comer… Ya veremos', 'stop')).toBe(' a comer…')
    expect(cleanSuggestion('Ana viene', ' a comer... Ya veremos', 'stop')).toBe(' a comer...')
    expect(cleanSuggestion('Ana dijo', ' "mañana voy." Y se fue', 'stop')).toBe(' "mañana voy."')
  })

  it('does not cut at abbreviations or decimals', () => {
    expect(cleanSuggestion('Traer frutas', ', p. ej. manzanas y peras', 'stop')).toBe(', p. ej. manzanas y peras')
    expect(cleanSuggestion('Hablar con el', ' Sr. García mañana', 'stop')).toBe(' Sr. García mañana')
    expect(cleanSuggestion('La versión', ' 3.5 sale el lunes', 'stop')).toBe(' 3.5 sale el lunes')
    // …but a number does end a sentence.
    expect(cleanSuggestion('Ir al paso', ' 3. Después, el 4', 'stop')).toBe(' 3.')
  })

  it('a lone period ends the sentence only before a capital or an opening mark, never after a form of address', () => {
    // Abbreviations of 3+ letters followed by lowercase or digits.
    expect(cleanSuggestion('Compraremos fruta', ', verdura, etc. para la semana', 'stop')).toBe(', verdura, etc. para la semana')
    expect(cleanSuggestion('Mira la', ' pág. 12 del manual', 'stop')).toBe(' pág. 12 del manual')
    expect(cleanSuggestion('Tardamos', ' aprox. tres horas en llegar', 'stop')).toBe(' aprox. tres horas en llegar')
    // Forms of address followed by a capitalised name.
    expect(cleanSuggestion('Hablar con la', ' Sra. García mañana', 'stop')).toBe(' Sra. García mañana')
    expect(cleanSuggestion('Cita con el', ' Dr. Pérez el lunes', 'stop')).toBe(' Dr. Pérez el lunes')
    // A closing quote after the period, then a capital: the sentence ended.
    expect(cleanSuggestion('Ana dijo', ' «mañana voy.» Luego se fue', 'stop')).toBe(' «mañana voy.»')
    expect(cleanSuggestion('Ana dijo', ' “mañana voy.” Luego se fue', 'stop')).toBe(' “mañana voy.”')
    // Opening marks start a new sentence too.
    expect(cleanSuggestion('Fuimos al cine', ' con Ana. ¿Qué tal estuvo?', 'stop')).toBe(' con Ana.')
  })

  it('naturalEnd does not stop at an abbreviation either', () => {
    expect(naturalEnd('compraremos fruta, verdura, legumbres, etc. para la semana que')).toBe('compraremos fruta, verdura, legumbres,')
    expect(naturalEnd('uno dos tres cuatro. Cinco seis')).toBe('uno dos tres cuatro.')
  })

  it('a period right at the start is judged by the word the user left', () => {
    expect(cleanSuggestion('Mañana voy al dentista', '. Luego al cine', 'stop')).toBe('.')
    expect(cleanSuggestion('Hablar con el Sr', '. García', 'stop')).toBe('. García')
  })

  it('cuts the streamed text the same way', () => {
    const partial = (before: string, raw: string) => cleanSuggestion(before, raw, null, { partial: true })
    expect(partial('Hoy he quedado con Ana', ' para comer. Luego')).toBe(' para comer.')
    expect(partial('Hoy he quedado con Ana', ' para comer. Luego iremos')).toBe(' para comer.')
  })

  it('firstSentence and naturalEnd on their own', () => {
    expect(firstSentence('x', 'uno. Dos')).toBe('uno.')
    expect(firstSentence('x', 'uno. dos')).toBe('uno. dos')
    expect(firstSentence('x', 'uno.')).toBe('uno.')
    expect(firstSentence('x', 'sin final')).toBe('sin final')
    expect(naturalEnd('uno dos tres cuatro, cinco seis')).toBe('uno dos tres cuatro,')
    expect(naturalEnd('uno dos, tres cuatro cinco')).toBe('uno dos, tres cuatro cinco')
    expect(naturalEnd('sin puntuación ninguna')).toBe('sin puntuación ninguna')
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

describe('noteContextFields (title / section / sections of the request body)', () => {
  it('keeps trimmed strings and leaves out what is missing', () => {
    expect(noteContextFields(' Viaje ', ' Hoy ', [' Ideas ', 'Tareas'])).toEqual({
      title: 'Viaje', section: 'Hoy', sections: ['Ideas', 'Tareas'],
    })
    expect(noteContextFields('Viaje', '', [])).toEqual({ title: 'Viaje' })
    expect(noteContextFields(undefined, undefined, undefined)).toEqual({})
  })

  it('ignores values of the wrong type (they come over IPC)', () => {
    expect(noteContextFields(42, { name: 'x' }, 'Ideas')).toEqual({})
    expect(noteContextFields(null, ['a'], [1, null, 'Ideas', {}, '  '])).toEqual({ sections: ['Ideas'] })
  })

  it('a cut never leaves half a surrogate pair', () => {
    const fields = noteContextFields(
      't'.repeat(AUTOCOMPLETE_TITLE_CHARS - 1) + '😀x',
      's'.repeat(AUTOCOMPLETE_SECTION_CHARS - 1) + '😀x',
      ['n'.repeat(AUTOCOMPLETE_SECTION_NAME_CHARS - 1) + '😀x', 'n'.repeat(AUTOCOMPLETE_SECTION_NAME_CHARS - 2) + '😀x'],
    )
    expect(fields.title).toBe('t'.repeat(AUTOCOMPLETE_TITLE_CHARS - 1))
    expect(fields.section).toBe('s'.repeat(AUTOCOMPLETE_SECTION_CHARS - 1))
    // The second name fits its whole emoji right at the edge.
    expect(fields.sections).toEqual([
      'n'.repeat(AUTOCOMPLETE_SECTION_NAME_CHARS - 1),
      'n'.repeat(AUTOCOMPLETE_SECTION_NAME_CHARS - 2) + '😀',
    ])
    expect(sliceStart('ab😀', 3)).toBe('ab')
    expect(sliceStart('ab😀', 4)).toBe('ab😀')
    expect(sliceEnd('😀ab', 3)).toBe('ab')
    expect(sliceEnd('😀ab', 4)).toBe('😀ab')
    expect(sliceEnd('ab', 10)).toBe('ab')
  })

  it('caps every name and the number of sections', () => {
    const fields = noteContextFields('t'.repeat(500), 's'.repeat(500), Array.from({ length: 50 }, (_, i) => `${i}-${'n'.repeat(200)}`))
    expect(fields.title).toHaveLength(AUTOCOMPLETE_TITLE_CHARS)
    expect(fields.section).toHaveLength(AUTOCOMPLETE_SECTION_CHARS)
    expect(fields.sections).toHaveLength(AUTOCOMPLETE_MAX_SECTIONS)
    expect(fields.sections!.every((n) => n.length === AUTOCOMPLETE_SECTION_NAME_CHARS)).toBe(true)
    // The worst-case body stays far below the proxy's 32 KiB limit, even in a 3-byte script.
    const worst = noteContextFields('語'.repeat(500), '語'.repeat(500), Array.from({ length: 50 }, (_, i) => `${i}${'語'.repeat(200)}`))
    const body = JSON.stringify({ before: '語'.repeat(AUTOCOMPLETE_BEFORE_CHARS), after: '語'.repeat(200), ...worst })
    expect(new TextEncoder().encode(body).length).toBeLessThan(16 * 1024)
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

  it('never sends half a surrogate pair at the cut of before / after', async () => {
    let sent = ''
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      sent = String(init.body)
      return sse([delta('_hola', 'stop'), '[DONE]'])
    }) as unknown as typeof fetch
    await completeText({
      baseUrl: 'https://p', token: 't',
      before: 'z😀' + 'a'.repeat(AUTOCOMPLETE_BEFORE_CHARS - 1),
      after: 'b'.repeat(199) + '😀z',
      signal: new AbortController().signal, fetchImpl,
    })
    expect(JSON.parse(sent)).toEqual({ before: 'a'.repeat(AUTOCOMPLETE_BEFORE_CHARS - 1), after: 'b'.repeat(199) })
  })

  it('sends the note context (title, section, other sections) next to the text', async () => {
    let sent = ''
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      sent = String(init.body)
      return sse([delta('_hola', 'stop'), '[DONE]'])
    }) as unknown as typeof fetch
    await completeText({
      baseUrl: 'https://p', token: 't', before: 'Texto de prueba', after: '',
      title: 'Viaje a Japón', section: 'Presupuesto', sections: ['Ideas', 'Tareas'],
      signal: new AbortController().signal, fetchImpl,
    })
    expect(JSON.parse(sent)).toEqual({
      before: 'Texto de prueba', title: 'Viaje a Japón', section: 'Presupuesto', sections: ['Ideas', 'Tareas'],
    })
  })

  it('a note context with nothing usable sends the same body as before', async () => {
    let sent = ''
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      sent = String(init.body)
      return sse([delta('_hola', 'stop'), '[DONE]'])
    }) as unknown as typeof fetch
    await completeText({
      baseUrl: 'https://p', token: 't', before: 'Texto de prueba', after: 'fin',
      title: '  ', section: 7, sections: [null, ''],
      signal: new AbortController().signal, fetchImpl,
    })
    expect(JSON.parse(sent)).toEqual({ before: 'Texto de prueba', after: 'fin' })
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
