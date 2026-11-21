import { describe, it, expect } from 'vitest'
import {
  AUTOCOMPLETE_MIN_PREVIOUS_CHARS, AUTOCOMPLETE_PAUSE_MS,
  autocompleteNoteContext, autocompleteUsagePercent, canRequestCompletion, endsSentence, hasEnoughContext, remainingSuggestion,
} from '../../src/lib/aiAutocomplete'

describe('autocompleteNoteContext', () => {
  const sections = [
    { id: 'a', name: 'Ideas' },
    { id: 'b', name: 'Presupuesto' },
    { id: 'c', name: 'Diario', aiHidden: true },
    { id: 'd', name: 'Tareas', aiHidden: false },
  ]

  it('gives the title, the active section and the names of the others, in note order', () => {
    expect(autocompleteNoteContext('Viaje a Japón', sections, 'b')).toEqual({
      title: 'Viaje a Japón',
      section: 'Presupuesto',
      sections: ['Ideas', 'Tareas'],
    })
  })

  it('never gives the name of a section hidden from the AI', () => {
    for (const active of ['a', 'b', 'd']) {
      const context = autocompleteNoteContext('T', sections, active)
      expect(context.sections).not.toContain('Diario')
      expect(context.section).not.toBe('Diario')
    }
    // Not even as the section being written (autocomplete does not run there anyway).
    expect(autocompleteNoteContext('T', sections, 'c')).toEqual({
      title: 'T',
      section: '',
      sections: ['Ideas', 'Presupuesto', 'Tareas'],
    })
    // A hidden section that shares its name with a visible one: the visible one is listed once.
    const twins = [{ id: '1', name: 'Notas', aiHidden: true }, { id: '2', name: 'Notas' }, { id: '3', name: 'Hoy' }]
    expect(autocompleteNoteContext('T', twins, '3').sections).toEqual(['Notas'])
  })

  it('leaves out blank names, repeated ones and the active section’s own name', () => {
    const messy = [
      { id: '1', name: ' Hoy ' },
      { id: '2', name: '   ' },
      { id: '3', name: 'Hoy' },
      { id: '4', name: 'Mañana' },
      { id: '5', name: 'Mañana' },
      { id: '6', name: '' },
    ]
    expect(autocompleteNoteContext('  Semana  ', messy, '1')).toEqual({
      title: 'Semana',
      section: 'Hoy',
      sections: ['Mañana'],
    })
  })

  it('an unknown or missing active section sends no section name', () => {
    expect(autocompleteNoteContext('T', sections, null)).toEqual({ title: 'T', section: '', sections: ['Ideas', 'Presupuesto', 'Tareas'] })
    expect(autocompleteNoteContext('T', sections, 'zz').section).toBe('')
    expect(autocompleteNoteContext('', [], undefined)).toEqual({ title: '', section: '', sections: [] })
  })
})

describe('canRequestCompletion', () => {
  const now = 1_000_000
  const open = { enabled: true, available: true, blockedUntil: 0 }

  it('needs the switch on and a usable plan', () => {
    expect(canRequestCompletion(open, now)).toBe(true)
    expect(canRequestCompletion({ ...open, enabled: false }, now)).toBe(false)
    expect(canRequestCompletion({ ...open, available: false }, now)).toBe(false)
  })

  it('respects the block main asked for', () => {
    expect(canRequestCompletion({ ...open, blockedUntil: now + 1 }, now)).toBe(false)
    expect(canRequestCompletion({ ...open, blockedUntil: now }, now)).toBe(true)
    expect(canRequestCompletion({ ...open, blockedUntil: Infinity }, now)).toBe(false)
  })

  it('pauses ~400 ms before asking', () => {
    expect(AUTOCOMPLETE_PAUSE_MS).toBe(400)
  })
})

describe('hasEnoughContext', () => {
  it(`needs ${AUTOCOMPLETE_MIN_PREVIOUS_CHARS} characters, not counting outer whitespace`, () => {
    expect(hasEnoughContext('a'.repeat(AUTOCOMPLETE_MIN_PREVIOUS_CHARS))).toBe(true)
    expect(hasEnoughContext('a'.repeat(AUTOCOMPLETE_MIN_PREVIOUS_CHARS - 1))).toBe(false)
    expect(hasEnoughContext(`   ${'a'.repeat(AUTOCOMPLETE_MIN_PREVIOUS_CHARS - 1)}\n\n`)).toBe(false)
    expect(hasEnoughContext('')).toBe(false)
  })
})

describe('endsSentence', () => {
  it('a period, an ellipsis, "?" or "!" at the end — with or without a space after — ends it', () => {
    for (const text of ['Fui al cine.', 'Fui al cine. ', 'Fui al cine.  ', '¿Vienes?', '¡Qué bien!', 'Y entonces…', 'Y entonces...',
      'Dijo "vale."', 'Dijo "vale." ', '(ver la nota.)', 'Ir al paso 3.']) {
      expect(endsSentence(text), text).toBe(true)
    }
  })

  it('anything else does not', () => {
    for (const text of ['Fui al cine', 'Fui al cine ', 'Comprar:', 'Comprar: ', 'pan, ', 'La versión 3.5', 'Hola. Luego', '']) {
      expect(endsSentence(text), text).toBe(false)
    }
  })
})

describe('remainingSuggestion', () => {
  it('typing what the suggestion starts with keeps the rest', () => {
    expect(remainingSuggestion(' al dentista', ' ')).toBe('al dentista')
    expect(remainingSuggestion(' al dentista', ' al d')).toBe('entista')
  })

  it('anything else, or typing all of it, drops it', () => {
    expect(remainingSuggestion(' al dentista', 'x')).toBeNull()
    expect(remainingSuggestion(' al dentista', ' Al')).toBeNull()
    expect(remainingSuggestion(' al dentista', ' al dentista')).toBeNull()
    expect(remainingSuggestion(' al dentista', ' al dentista y')).toBeNull()
    expect(remainingSuggestion(' al dentista', '')).toBeNull()
  })
})

describe('autocompleteUsagePercent', () => {
  it('floors, and reaches 100 only when used up', () => {
    expect(autocompleteUsagePercent({ used: 0, limit: 900 })).toBe(0)
    expect(autocompleteUsagePercent({ used: 450, limit: 900 })).toBe(50)
    expect(autocompleteUsagePercent({ used: 899, limit: 900 })).toBe(99)
    expect(autocompleteUsagePercent({ used: 900, limit: 900 })).toBe(100)
    expect(autocompleteUsagePercent({ used: 1200, limit: 900 })).toBe(100)
    expect(autocompleteUsagePercent({ used: 5, limit: 0 })).toBe(0)
  })
})
