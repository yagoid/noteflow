import { describe, it, expect } from 'vitest'
import {
  MAX_SEEN_IDS,
  mediaFileName,
  mergeSeenIds,
  pendingSlideIds,
  planFullTour,
  planStartupTour,
  recapVersion,
  resolveSlideMedia,
  sanitizeSeenIds,
  stepIndex,
  type TourSlideRef,
} from '../../src/lib/whatsNew'
import * as mainSide from '../../electron/whatsNewSeen'
import { EXTRAS_KEYS, WHATS_NEW_SLIDES } from '../../src/components/WhatsNew/whatsNewSlides'
import { en } from '../../src/i18n/en'
import { es } from '../../src/i18n/es'

const DECK: TourSlideRef[] = [
  { id: 'sections', since: '2.2.0' },
  { id: 'kanban', since: '2.2.0' },
  { id: 'brain', since: '2.2.0' },
  { id: 'more', since: '2.2.0' },
]

describe('sanitizeSeenIds', () => {
  it('returns [] for anything that is not an array', () => {
    for (const raw of [undefined, null, 'sections', 42, { sections: true }]) {
      expect(sanitizeSeenIds(raw)).toEqual([])
    }
  })

  it('keeps valid ids trimmed, deduped, in first-seen order', () => {
    expect(sanitizeSeenIds([' kanban ', 'sections', 'kanban', 'links-palette'])).toEqual(['kanban', 'sections', 'links-palette'])
  })

  it('drops non-strings and malformed ids', () => {
    expect(sanitizeSeenIds(['ok', 1, null, '', 'Has Caps', '-lead', 'a/b', 'x'.repeat(65), 'quick-capture'])).toEqual(['ok', 'quick-capture'])
  })

  it('caps the list', () => {
    const many = Array.from({ length: MAX_SEEN_IDS + 50 }, (_, i) => `s${i}`)
    expect(sanitizeSeenIds(many)).toHaveLength(MAX_SEEN_IDS)
  })

  it('applies the same rules as the main-process copy (electron/whatsNewSeen.ts)', () => {
    const raw = [' a ', 'a', 'B', 2, 'links-palette', '', 'x'.repeat(64), 'x'.repeat(65)]
    expect(mainSide.sanitizeSeenIds(raw)).toEqual(sanitizeSeenIds(raw))
    expect(mainSide.MAX_SEEN_IDS).toBe(MAX_SEEN_IDS)
    expect(mainSide.mergeSeenIds(['a'], ['b', 'a'])).toEqual(mergeSeenIds(['a'], ['b', 'a']))
  })
})

describe('mergeSeenIds', () => {
  it('is a union that keeps the stored order first', () => {
    expect(mergeSeenIds(['kanban', 'sections'], ['brain', 'kanban'])).toEqual(['kanban', 'sections', 'brain'])
  })

  it('survives a corrupted stored value', () => {
    expect(mergeSeenIds('garbage', ['brain'])).toEqual(['brain'])
    expect(mergeSeenIds(['brain'], undefined)).toEqual(['brain'])
  })
})

describe('pendingSlideIds', () => {
  it('lists the unseen slides in deck order', () => {
    expect(pendingSlideIds(DECK, ['kanban', 'unknown'])).toEqual(['sections', 'brain', 'more'])
  })
})

// A deck with release recaps, like the real one: 2.3 slides + their recap before `more`.
const RECAP_DECK: TourSlideRef[] = [
  { id: 'sections', since: '2.2.0' },
  { id: 'kanban', since: '2.2.0' },
  { id: 'drawings', since: '2.3.0' },
  { id: 'release-2-3-0', since: '2.3.0', release: true },
  { id: 'more', since: '2.2.0' },
]

describe('planStartupTour', () => {
  it('fresh install: the whole deck, in "discover" mode', () => {
    const plan = { slideIds: ['sections', 'kanban', 'brain', 'more'], mode: 'discover', skippedIds: [] }
    expect(planStartupTour(DECK, undefined)).toEqual(plan)
    expect(planStartupTour(DECK, [])).toEqual(plan)
  })

  it('after an update: only the slides added since, in "new" mode', () => {
    const seen = ['sections', 'kanban', 'more']
    expect(planStartupTour(DECK, seen)).toEqual({ slideIds: ['brain'], mode: 'new', skippedIds: [] })
  })

  it('a half-seen first tour resumes where it stopped (still "new": something was seen)', () => {
    expect(planStartupTour(DECK, ['sections'])).toEqual({ slideIds: ['kanban', 'brain', 'more'], mode: 'new', skippedIds: [] })
  })

  it('fresh install: release recaps are left out of the tour but listed to be marked seen', () => {
    expect(planStartupTour(RECAP_DECK, [])).toEqual({
      slideIds: ['sections', 'kanban', 'drawings', 'more'],
      mode: 'discover',
      skippedIds: ['release-2-3-0'],
    })
  })

  it('after an update: the release recap closes the batch of that version', () => {
    expect(planStartupTour(RECAP_DECK, ['sections', 'kanban', 'more'])).toEqual({
      slideIds: ['drawings', 'release-2-3-0'],
      mode: 'new',
      skippedIds: [],
    })
  })

  it('a recap already marked seen (skipped on a first run) never comes back on its own', () => {
    expect(planStartupTour(RECAP_DECK, ['release-2-3-0', 'sections', 'kanban', 'drawings', 'more'])).toBeNull()
  })

  it('a deck with nothing but unseen recaps never opens an empty tour', () => {
    expect(planStartupTour([{ id: 'release-2-3-0', since: '2.3.0', release: true }], [])).toBeNull()
  })

  it('ids of slides that no longer exist still mean "not a new user"', () => {
    expect(planStartupTour(DECK, ['retired-slide'])?.mode).toBe('new')
  })

  it('nothing pending → null', () => {
    expect(planStartupTour(DECK, ['more', 'brain', 'kanban', 'sections'])).toBeNull()
    expect(planStartupTour([], [])).toBeNull()
  })
})

describe('planFullTour', () => {
  it('starts at the requested slide, or at the first one', () => {
    expect(planFullTour(DECK, 'brain')).toEqual({ slideIds: ['sections', 'kanban', 'brain', 'more'], index: 2 })
    expect(planFullTour(DECK).index).toBe(0)
    expect(planFullTour(DECK, 'nope').index).toBe(0)
  })

  it('leaves the release recaps out', () => {
    expect(planFullTour(RECAP_DECK)).toEqual({ slideIds: ['sections', 'kanban', 'drawings', 'more'], index: 0 })
    expect(planFullTour(RECAP_DECK, 'more')).toEqual({ slideIds: ['sections', 'kanban', 'drawings', 'more'], index: 3 })
  })

  it('a recap asked for by id opens alone', () => {
    expect(planFullTour(RECAP_DECK, 'release-2-3-0')).toEqual({ slideIds: ['release-2-3-0'], index: 0 })
  })
})

describe('recapVersion', () => {
  const recap = (id: string, since: string): TourSlideRef => ({ id, since, release: true })

  it('is the version of a tour made of release recaps only', () => {
    expect(recapVersion([recap('release-2-3-0', '2.3.0')])).toBe('2.3.0')
  })

  it('is null for any other tour', () => {
    expect(recapVersion(DECK)).toBeNull()
    expect(recapVersion([...DECK, recap('release-2-3-0', '2.3.0')])).toBeNull()
    expect(recapVersion([])).toBeNull()
  })
})

describe('stepIndex', () => {
  it('moves and clamps without wrapping', () => {
    expect(stepIndex(0, 1, 4)).toBe(1)
    expect(stepIndex(3, 1, 4)).toBe(3)
    expect(stepIndex(0, -1, 4)).toBe(0)
    expect(stepIndex(9, 0, 4)).toBe(3)
    expect(stepIndex(2, 1, 0)).toBe(0)
  })
})

describe('resolveSlideMedia', () => {
  const files = {
    'sections.es.webm': '/a/sections.es.webm',
    'sections.webm': '/a/sections.webm',
    'sections.png': '/a/sections.png',
    'kanban.en.webm': '/a/kanban.en.webm',
    'kanban.es.png': '/a/kanban.es.png',
  }

  it('prefers the file for the UI language', () => {
    expect(resolveSlideMedia('sections', 'es', files)).toEqual({ video: '/a/sections.es.webm', poster: '/a/sections.png' })
  })

  it('falls back to the language-neutral file', () => {
    expect(resolveSlideMedia('sections', 'en', files)).toEqual({ video: '/a/sections.webm', poster: '/a/sections.png' })
  })

  it('a clip in another language only is not used', () => {
    expect(resolveSlideMedia('kanban', 'es', files)).toEqual({ video: null, poster: '/a/kanban.es.png' })
  })

  it('nothing bundled → nulls (animated fallback)', () => {
    expect(resolveSlideMedia('brain', 'en', files)).toEqual({ video: null, poster: null })
  })

  it('does not confuse ids that prefix each other', () => {
    expect(resolveSlideMedia('section', 'es', files)).toEqual({ video: null, poster: null })
  })
})

describe('mediaFileName', () => {
  it('takes the last path segment', () => {
    expect(mediaFileName('../../assets/whats-new/ai.es.webm')).toBe('ai.es.webm')
    expect(mediaFileName('C:\\x\\sync.png')).toBe('sync.png')
  })
})

describe('the deck (whatsNewSlides.ts)', () => {
  it('keeps the fixed ids (stored in settings.json and used by the clip capture script)', () => {
    expect(WHATS_NEW_SLIDES.map((s) => s.id)).toEqual([
      'sections', 'brain', 'links-palette', 'quick-capture', 'windows', 'kanban', 'ai', 'agents', 'sync',
      'section-map', 'snippets', 'agent-tasks', 'linked-files', 'drawings', 'release-2-3-0', 'more',
    ])
    expect(sanitizeSeenIds(WHATS_NEW_SLIDES.map((s) => s.id))).toHaveLength(WHATS_NEW_SLIDES.length)
  })

  it('release recaps: named release-X-Y-Z after their version, with chips, never the last slide', () => {
    const recaps = WHATS_NEW_SLIDES.filter((s) => s.release)
    expect(recaps.length).toBeGreaterThan(0)
    for (const recap of recaps) {
      expect(recap.id).toBe(`release-${recap.since.replace(/\./g, '-')}`)
      expect(recap.extras?.length ?? 0, recap.id).toBeGreaterThan(0)
    }
    expect(WHATS_NEW_SLIDES[WHATS_NEW_SLIDES.length - 1].release).toBeFalsy()
  })

  it('a chip appears on one slide only', () => {
    const ids = WHATS_NEW_SLIDES.flatMap((s) => (s.extras ?? []).map((e) => e.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every chip has its label and unfold text, with only the EXTRAS_KEYS placeholders', () => {
    const extras = WHATS_NEW_SLIDES.flatMap((s) => s.extras ?? [])
    expect(extras.length).toBeGreaterThan(0)
    const allowed = Object.keys(EXTRAS_KEYS)
    for (const extra of extras) {
      for (const dict of [en, es]) {
        const label = dict.whatsNew.extras[extra.id]
        const info = dict.whatsNew.extrasInfo[extra.id]
        expect(label.trim(), extra.id).not.toBe('')
        expect(info.trim(), extra.id).not.toBe('')
        for (const text of [label, info]) {
          for (const m of text.matchAll(/\{(\w+)\}/g)) expect(allowed, `${extra.id}: {${m[1]}}`).toContain(m[1])
        }
      }
    }
  })

  it('every {placeholder} of a slide body is one of its shortcut ids', () => {
    for (const slide of WHATS_NEW_SLIDES) {
      const keyIds = new Set(slide.keys.map((k) => k.id))
      for (const dict of [en, es]) {
        const body = dict.whatsNew.slides[slide.i18nKey].body
        for (const m of body.matchAll(/\{(\w+)\}/g)) expect(keyIds, `${slide.id}: {${m[1]}}`).toContain(m[1])
      }
    }
  })
})
