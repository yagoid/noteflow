import { describe, it, expect } from 'vitest'
import {
  applyPendingEdits,
  dateFormatPresets,
  dateVariable,
  expandSnippet,
  formatDateToken,
  getDefaultSnippet,
  isInlineSnippet,
  moveSnippet,
  setDefaultSnippet,
  snippetPreviewLine,
  suggestionContent,
  SUGGESTION_IDS,
  type SuggestionLabels,
} from '../../src/lib/snippets'
import type { Snippet } from '../../src/types'

// Saturday 7 November 2026, 09:05:03 local time (months are 0-based in Date).
const MORNING = new Date(2026, 10, 7, 9, 5, 3)
// Sunday 1 March 2026, 23:45:59.
const NIGHT = new Date(2026, 2, 1, 23, 45, 59)
// Midnight and noon: the 12h clock edges.
const MIDNIGHT = new Date(2026, 0, 4, 0, 7, 0)
const NOON = new Date(2026, 0, 4, 12, 30, 0)

describe('formatDateToken', () => {
  it('formats numeric year/month/day tokens with padding', () => {
    expect(formatDateToken(MORNING, 'DD-MM-YYYY', 'en')).toBe('07-11-2026')
    expect(formatDateToken(MORNING, 'D/M/YY', 'en')).toBe('7/11/26')
    expect(formatDateToken(NIGHT, 'YYYY-MM-DD', 'en')).toBe('2026-03-01')
    expect(formatDateToken(NIGHT, 'D-M', 'en')).toBe('1-3')
  })

  it('pads the year to four digits and YY to two', () => {
    const early = new Date(2005, 0, 1)
    early.setFullYear(5)
    expect(formatDateToken(early, 'YYYY', 'en')).toBe('0005')
    expect(formatDateToken(new Date(2009, 0, 1), 'YY', 'en')).toBe('09')
  })

  it('formats time tokens in 24h', () => {
    expect(formatDateToken(MORNING, 'HH:mm:ss', 'en')).toBe('09:05:03')
    expect(formatDateToken(MORNING, 'H:m:s', 'en')).toBe('9:5:3')
    expect(formatDateToken(NIGHT, 'HH:mm', 'en')).toBe('23:45')
  })

  it('formats the 12h clock with AM/PM', () => {
    expect(formatDateToken(MORNING, 'hh:mm A', 'en')).toBe('09:05 AM')
    expect(formatDateToken(NIGHT, 'h:mm a', 'en')).toBe('11:45 pm')
    expect(formatDateToken(MIDNIGHT, 'hh:mm A', 'en')).toBe('12:07 AM')
    expect(formatDateToken(NOON, 'h:mm A', 'en')).toBe('12:30 PM')
  })

  it('distinguishes MM (month) from mm (minutes)', () => {
    expect(formatDateToken(MORNING, 'dddd-mm-yy', 'en')).toBe('Saturday-05-26')
    expect(formatDateToken(MORNING, 'dddd-MM-YY', 'en')).toBe('Saturday-11-26')
  })

  it('localizes day and month names (EN)', () => {
    expect(formatDateToken(MORNING, 'dddd, MMMM D, YYYY', 'en')).toBe('Saturday, November 7, 2026')
    expect(formatDateToken(MORNING, 'ddd D MMM', 'en')).toBe('Sat 7 Nov')
  })

  it('localizes day and month names (ES), lowercase as Spanish writes them', () => {
    expect(formatDateToken(MORNING, 'dddd, D [de] MMMM [de] YYYY', 'es')).toBe('sábado, 7 de noviembre de 2026')
    expect(formatDateToken(NIGHT, 'ddd DD-MM-YY', 'es')).toBe('dom 01-03-26')
    expect(formatDateToken(NIGHT, 'D MMM', 'es')).toBe('1 mar')
  })

  it('keeps [bracketed] text literal, including token letters', () => {
    expect(formatDateToken(MORNING, '[Day] D [at] HH:mm', 'en')).toBe('Day 7 at 09:05')
    expect(formatDateToken(MORNING, '[YYYY]', 'en')).toBe('YYYY')
  })

  it('copies an unclosed [ and any non-token character as is', () => {
    expect(formatDateToken(MORNING, 'D [x', 'en')).toBe('7 [x')
    expect(formatDateToken(MORNING, 'week: D!', 'en')).toBe('week: 7!')
  })

  it('accepts lowercase yyyy/yy as year aliases', () => {
    expect(formatDateToken(MORNING, 'DD-MM-yyyy', 'en')).toBe('07-11-2026')
    expect(formatDateToken(MORNING, 'yy', 'en')).toBe('26')
  })
})

describe('expandSnippet', () => {
  it('expands date/time variables with explicit formats', () => {
    expect(expandSnippet('Today: {date:DD/MM/YY}', MORNING, 'en')).toBe('Today: 07/11/26')
    expect(expandSnippet('**{time:HH:mm}**', MORNING, 'en')).toBe('**09:05**')
  })

  it('uses the default format of each variable without one', () => {
    expect(expandSnippet('{date}', MORNING, 'en')).toBe('07-11-2026')
    expect(expandSnippet('{time}', MORNING, 'en')).toBe('09:05')
    expect(expandSnippet('{datetime}', MORNING, 'en')).toBe('07-11-2026 09:05')
    expect(expandSnippet('{date:}', MORNING, 'en')).toBe('07-11-2026')
  })

  it('treats date and time as aliases of the same instant', () => {
    expect(expandSnippet('{time:DD-MM-YYYY}', MORNING, 'en')).toBe('07-11-2026')
    expect(expandSnippet('{date:HH:mm}', MORNING, 'en')).toBe('09:05')
  })

  it('expands several variables and multi-line markdown', () => {
    const content = '## {date:dddd, D [de] MMMM}\n\n- [ ] {time}\n'
    expect(expandSnippet(content, MORNING, 'es')).toBe('## sábado, 7 de noviembre\n\n- [ ] 09:05\n')
  })

  it('leaves unknown braces untouched', () => {
    expect(expandSnippet('{name} {dates} {date:x', MORNING, 'en')).toBe('{name} {dates} {date:x')
    expect(expandSnippet('const a = { b: 1 }', MORNING, 'en')).toBe('const a = { b: 1 }')
  })

  it('returns content without variables as is', () => {
    expect(expandSnippet('Plain **text**\n- item', MORNING, 'en')).toBe('Plain **text**\n- item')
    expect(expandSnippet('', MORNING, 'en')).toBe('')
  })
})

describe('dateVariable', () => {
  it('collapses the default format and strips braces', () => {
    expect(dateVariable('DD-MM-YYYY')).toBe('{date}')
    expect(dateVariable('  ')).toBe('{date}')
    expect(dateVariable('HH:mm')).toBe('{date:HH:mm}')
    expect(dateVariable('D {x}')).toBe('{date:D x}')
  })

  it('round-trips through expandSnippet', () => {
    for (const fmt of dateFormatPresets('es')) {
      expect(expandSnippet(dateVariable(fmt), MORNING, 'es')).toBe(formatDateToken(MORNING, fmt, 'es'))
    }
  })
})

describe('snippetPreviewLine', () => {
  it('shows the first non-empty expanded line, truncated', () => {
    expect(snippetPreviewLine('\n\n## {date}\nmore', MORNING, 'en')).toBe('## 07-11-2026')
    expect(snippetPreviewLine('x'.repeat(80), MORNING, 'en', 10)).toBe(`${'x'.repeat(9)}…`)
    expect(snippetPreviewLine('', MORNING, 'en')).toBe('')
  })
})

describe('isInlineSnippet', () => {
  it('is inline for one line without block syntax', () => {
    expect(isInlineSnippet('07-11-2026')).toBe(true)
    expect(isInlineSnippet('**09:05** done')).toBe(true)
    expect(isInlineSnippet('#hashtag')).toBe(true)
    expect(isInlineSnippet('07-11-2026\n')).toBe(true)
  })

  it('is a block for several lines or block syntax', () => {
    expect(isInlineSnippet('a\nb')).toBe(false)
    expect(isInlineSnippet('## Title')).toBe(false)
    expect(isInlineSnippet('- [ ] task')).toBe(false)
    expect(isInlineSnippet('1. first')).toBe(false)
    expect(isInlineSnippet('> quote')).toBe(false)
    expect(isInlineSnippet('---')).toBe(false)
    expect(isInlineSnippet('| a | b |')).toBe(false)
  })
})

describe('list operations', () => {
  const s = (id: string, isDefault?: true): Snippet => ({ id, name: id, content: '', createdAt: '', ...(isDefault ? { isDefault } : {}) })

  it('getDefaultSnippet: the flagged one, else the first, else null', () => {
    expect(getDefaultSnippet([s('a'), s('b', true)])?.id).toBe('b')
    expect(getDefaultSnippet([s('a'), s('b')])?.id).toBe('a')
    expect(getDefaultSnippet([])).toBeNull()
  })

  it('setDefaultSnippet flags only the chosen one', () => {
    const next = setDefaultSnippet([s('a', true), s('b'), s('c')], 'c')
    expect(next.map((x) => x.isDefault ?? false)).toEqual([false, false, true])
    expect('isDefault' in next[0]).toBe(false)
  })

  it('moveSnippet moves one step and ignores out-of-range moves', () => {
    const list = [s('a'), s('b'), s('c')]
    expect(moveSnippet(list, 'b', -1).map((x) => x.id)).toEqual(['b', 'a', 'c'])
    expect(moveSnippet(list, 'b', 1).map((x) => x.id)).toEqual(['a', 'c', 'b'])
    expect(moveSnippet(list, 'a', -1)).toBe(list)
    expect(moveSnippet(list, 'c', 1)).toBe(list)
    expect(moveSnippet(list, 'zz', 1)).toBe(list)
  })
})

describe('applyPendingEdits (reload merge)', () => {
  const s = (id: string, name = id, content = ''): Snippet => ({ id, name, content, createdAt: '' })

  it('keeps the disk list (order, adds, deletes) and re-applies only unwritten field edits', () => {
    // Disk: another window reordered, added "c" and deleted "b"; here "a" has unwritten typing.
    const disk = [s('c', 'C'), s('a', 'A (disk)', 'old')]
    const pending = new Map([['a', { content: 'typed here' }], ['b', { name: 'gone' }]])
    expect(applyPendingEdits(disk, pending)).toEqual([s('c', 'C'), s('a', 'A (disk)', 'typed here')])
  })

  it('returns the disk list as is without pending edits', () => {
    const disk = [s('a')]
    expect(applyPendingEdits(disk, new Map())).toBe(disk)
  })
})

describe('suggestions', () => {
  const labels: SuggestionLabels = {
    names: { today: '', dateTime: '', journal: '', meeting: '', timeDivider: '', signature: '' },
    meeting: { title: 'Reunión', attendees: 'Asistentes', notes: 'Notas', actions: 'Acciones' },
    signature: 'Tu nombre',
  }

  it('every suggestion expands without leftover variables', () => {
    for (const id of SUGGESTION_IDS) {
      const out = expandSnippet(suggestionContent(id, labels, 'es'), MORNING, 'es')
      expect(out).not.toMatch(/\{(date|time|datetime)/)
    }
  })

  it('localizes the long date and the content labels', () => {
    expect(expandSnippet(suggestionContent('journal', labels, 'es'), MORNING, 'es')).toBe('## sábado, 7 de noviembre de 2026\n\n')
    expect(suggestionContent('meeting', labels, 'es')).toContain('### Acciones')
    expect(suggestionContent('today', labels, 'en')).toBe('{date:DD-MM-YYYY}')
  })
})
