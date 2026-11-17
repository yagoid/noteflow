import { describe, it, expect } from 'vitest'
import {
  type NavCheck,
  type NavHistory,
  type NavLocation,
  emptyNavHistory,
  equalLocation,
  purgeLocations,
  pushLocation,
  sameLocation,
  stepHistory,
} from '../../src/lib/navHistory'

const note = (noteId: string, sectionId?: string): NavLocation =>
  sectionId ? { kind: 'note', noteId, sectionId } : { kind: 'note', noteId }
const overview = (noteId: string): NavLocation => ({ kind: 'overview', noteId })
const brain: NavLocation = { kind: 'brain' }
const content = (place: 'all' | 'fav' | `g:${string}`): NavLocation => ({ kind: 'content', place })

/** Compact form: entries as "kind:id/section", current one in brackets. */
const show = (h: NavHistory) =>
  h.entries.map((loc, i) => {
    const label = loc.kind === 'note' ? `${loc.noteId}${loc.sectionId ? `/${loc.sectionId}` : ''}`
      : loc.kind === 'overview' ? `ov:${loc.noteId}`
      : loc.kind === 'content' ? `cv:${loc.place}`
      : 'brain'
    return i === h.index ? `[${label}]` : label
  }).join(' ')

const build = (...locs: NavLocation[]) => locs.reduce((h, loc) => pushLocation(h, loc), emptyNavHistory())

describe('sameLocation / equalLocation', () => {
  it('a note is one place whatever its section', () => {
    expect(sameLocation(note('A', 's1'), note('A', 's2'))).toBe(true)
    expect(equalLocation(note('A', 's1'), note('A', 's2'))).toBe(false)
    expect(equalLocation(note('A', 's1'), note('A', 's1'))).toBe(true)
  })
  it('the note, its overview and other views are different places', () => {
    expect(sameLocation(note('A'), overview('A'))).toBe(false)
    expect(sameLocation(content('all'), content('fav'))).toBe(false)
    expect(sameLocation(content('g:1'), content('g:1'))).toBe(true)
    expect(sameLocation(brain, { kind: 'brain' })).toBe(true)
  })
})

describe('pushLocation', () => {
  it('appends new places and moves the index to them', () => {
    expect(show(build(note('A'), overview('A'), content('all'), brain))).toBe('A ov:A cv:all [brain]')
  })

  it('ignores the same location again (returns the same object)', () => {
    const h = build(note('A', 's1'))
    expect(pushLocation(h, note('A', 's1'))).toBe(h)
  })

  it('a section change in the same note rewrites the current entry instead of adding one', () => {
    const h = build(note('A', 's1'), note('B'), note('B', 'b2'))
    expect(show(h)).toBe('A/s1 [B/b2]')
  })

  it('a section change keeps the forward entries', () => {
    const h: NavHistory = { entries: [note('A', 's1'), note('B')], index: 0 }
    expect(show(pushLocation(h, note('A', 's2')))).toBe('[A/s2] B')
  })

  it('navigating somewhere new drops the forward part', () => {
    const h: NavHistory = { entries: [note('A'), note('B'), note('C')], index: 0 }
    expect(show(pushLocation(h, note('D')))).toBe('A [D]')
  })

  it('keeps at most `limit` entries, dropping the oldest', () => {
    let h = emptyNavHistory()
    for (let i = 0; i < 60; i++) h = pushLocation(h, note(`n${i}`))
    expect(h.entries).toHaveLength(50)
    expect(h.index).toBe(49)
    expect(h.entries[0]).toEqual(note('n10'))
    const small = build(note('A'), note('B'), note('C'))
    expect(show(pushLocation(small, note('D'), 3))).toBe('B C [D]')
  })
})

describe('purgeLocations', () => {
  const notDeleted = (deleted: string[]) => (loc: NavLocation) =>
    !(('noteId' in loc) && deleted.includes(loc.noteId))

  it('drops rejected entries and keeps the index on its entry', () => {
    const h: NavHistory = { entries: [note('A'), note('X'), note('B'), note('C')], index: 2 }
    expect(show(purgeLocations(h, notDeleted(['X'])))).toBe('A [B] C')
  })

  it('merges entries that became consecutive copies (the later one wins)', () => {
    const h: NavHistory = { entries: [note('A', 's1'), note('X'), note('A', 's2'), note('B')], index: 3 }
    expect(show(purgeLocations(h, notDeleted(['X'])))).toBe('A/s2 [B]')
  })

  it('a dropped current entry moves the index to the closest one before it', () => {
    const h: NavHistory = { entries: [note('A'), note('B'), note('X'), note('C')], index: 2 }
    expect(show(purgeLocations(h, notDeleted(['X'])))).toBe('A [B] C')
  })

  it('with nothing surviving before the current one, the closest one after becomes current', () => {
    const h: NavHistory = { entries: [note('X'), note('C'), note('D')], index: 0 }
    const purged = purgeLocations(h, notDeleted(['X']))
    expect(show(purged)).toBe('[C] D')
    // A push right after keeps the entries behind the new one (never slice(0, 0)).
    expect(show(pushLocation(purged, note('E')))).toBe('C [E]')
  })

  it('with nothing surviving at all, the history is empty (index -1)', () => {
    const h: NavHistory = { entries: [note('X'), overview('X')], index: 1 }
    expect(purgeLocations(h, notDeleted(['X']))).toEqual({ entries: [], index: -1 })
  })

  it('overviews of a deleted note go too; returns the same object when nothing changes', () => {
    const h: NavHistory = { entries: [overview('X'), brain, note('A')], index: 2 }
    expect(show(purgeLocations(h, notDeleted(['X'])))).toBe('brain [A]')
    expect(purgeLocations(h, () => true)).toBe(h)
  })
})

describe('stepHistory', () => {
  const allOk = (): NavCheck => 'ok'

  it('back and forward move the index and return the target', () => {
    const h = build(note('A', 's1'), overview('A'), content('all'))
    const back = stepHistory(h, -1, allOk)
    expect(back.location).toEqual(overview('A'))
    expect(show(back.history)).toBe('A/s1 [ov:A] cv:all')
    const back2 = stepHistory(back.history, -1, allOk)
    expect(back2.location).toEqual(note('A', 's1'))
    const fwd = stepHistory(back2.history, 1, allOk)
    expect(fwd.location).toEqual(overview('A'))
    expect(show(fwd.history)).toBe('A/s1 [ov:A] cv:all')
  })

  it('returns no location at either end', () => {
    const h = build(note('A'), note('B'))
    expect(stepHistory(h, 1, allOk).location).toBeNull()
    const start = stepHistory(h, -1, allOk).history
    expect(stepHistory(start, -1, allOk).location).toBeNull()
    expect(stepHistory(emptyNavHistory(), -1, allOk).location).toBeNull()
  })

  it('passes over skipped entries but keeps them', () => {
    const h = build(note('A'), note('Locked'), note('B'))
    const check = (loc: NavLocation): NavCheck => (loc.kind === 'note' && loc.noteId === 'Locked' ? 'skip' : 'ok')
    const back = stepHistory(h, -1, check)
    expect(back.location).toEqual(note('A'))
    expect(show(back.history)).toBe('[A] Locked B')
    const fwd = stepHistory(back.history, 1, check)
    expect(fwd.location).toEqual(note('B'))
  })

  it('purges gone entries before stepping', () => {
    const h = build(note('A'), note('Gone'), overview('Gone'), note('B'))
    const check = (loc: NavLocation): NavCheck => ('noteId' in loc && loc.noteId === 'Gone' ? 'purge' : 'ok')
    const back = stepHistory(h, -1, check)
    expect(back.location).toEqual(note('A'))
    expect(show(back.history)).toBe('[A] B')
  })

  it('with only skipped entries behind, stays put (purged history, no location)', () => {
    const h = build(note('Locked'), note('B'))
    const step = stepHistory(h, -1, (loc) => (loc.kind === 'note' && loc.noteId === 'Locked' ? 'skip' : 'ok'))
    expect(step.location).toBeNull()
    expect(show(step.history)).toBe('Locked [B]')
  })

  it('after a back, a new place truncates the forward part', () => {
    const h = build(note('A'), note('B'), note('C'))
    const back = stepHistory(h, -1, allOk).history
    expect(show(pushLocation(back, brain))).toBe('A B [brain]')
  })
})
