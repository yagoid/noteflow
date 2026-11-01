import { describe, it, expect } from 'vitest'
import {
  MAX_SEEN_IDS,
  mediaFileName,
  mergeSeenIds,
  pendingSlideIds,
  planFullTour,
  planStartupTour,
  resolveSlideMedia,
  sanitizeSeenIds,
  stepIndex,
  type TourSlideRef,
} from '../../src/lib/whatsNew'
import * as mainSide from '../../electron/whatsNewSeen'
import { WHATS_NEW_SLIDES } from '../../src/components/WhatsNew/whatsNewSlides'
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

describe('planStartupTour', () => {
  it('fresh install: the whole deck, in "discover" mode', () => {
    expect(planStartupTour(DECK, undefined)).toEqual({ slideIds: ['sections', 'kanban', 'brain', 'more'], mode: 'discover' })
    expect(planStartupTour(DECK, [])).toEqual({ slideIds: ['sections', 'kanban', 'brain', 'more'], mode: 'discover' })
  })

  it('after an update: only the slides added since, in "new" mode', () => {
    const seen = ['sections', 'kanban', 'more']
    expect(planStartupTour(DECK, seen)).toEqual({ slideIds: ['brain'], mode: 'new' })
  })

  it('a half-seen first tour resumes where it stopped (still "new": something was seen)', () => {
    expect(planStartupTour(DECK, ['sections'])).toEqual({ slideIds: ['kanban', 'brain', 'more'], mode: 'new' })
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
      'sections', 'brain', 'links-palette', 'quick-capture', 'windows', 'kanban', 'ai', 'sync', 'more',
    ])
    expect(sanitizeSeenIds(WHATS_NEW_SLIDES.map((s) => s.id))).toHaveLength(WHATS_NEW_SLIDES.length)
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
