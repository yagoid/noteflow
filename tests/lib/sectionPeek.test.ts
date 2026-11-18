import { describe, it, expect } from 'vitest'
import {
  aimTriangle,
  pointInTriangle,
  scrollMovesRows,
  sectionPeekSideSpan,
  sectionPeekSideTop,
  AIM_TRIANGLE_PAD,
  SECTION_PEEK_GAP,
  SECTION_PEEK_MARGIN,
  SECTION_PEEK_MIN_WIDTH,
  SECTION_PEEK_WIDTH,
} from '../../src/lib/sectionPeek'

const viewport = { width: 1200, height: 800 }

describe('sectionPeekSideSpan', () => {
  it('sits right of the list at full width', () => {
    expect(sectionPeekSideSpan(280, viewport.width)).toEqual({ left: 280 + SECTION_PEEK_GAP, width: SECTION_PEEK_WIDTH })
  })

  it('narrows to the room left in the window', () => {
    const surfaceRight = viewport.width - SECTION_PEEK_MARGIN - SECTION_PEEK_GAP - 250
    expect(sectionPeekSideSpan(surfaceRight, viewport.width)?.width).toBe(250)
  })

  it('keeps the minimum width and gives up below it (the caller opens it over the line)', () => {
    const edge = viewport.width - SECTION_PEEK_MARGIN - SECTION_PEEK_GAP - SECTION_PEEK_MIN_WIDTH
    expect(sectionPeekSideSpan(edge, viewport.width)?.width).toBe(SECTION_PEEK_MIN_WIDTH)
    expect(sectionPeekSideSpan(edge + 1, viewport.width)).toBeNull()
  })
})

describe('sectionPeekSideTop', () => {
  it('is level with the row (2px above)', () => {
    expect(sectionPeekSideTop(200, 90, viewport.height)).toBe(198)
  })

  it('is pushed up when it would overflow the bottom', () => {
    expect(sectionPeekSideTop(760, 90, viewport.height)).toBe(viewport.height - SECTION_PEEK_MARGIN - 90)
  })

  it('never goes above the top margin', () => {
    expect(sectionPeekSideTop(100, 900, viewport.height)).toBe(SECTION_PEEK_MARGIN)
    expect(sectionPeekSideTop(-30, 60, viewport.height)).toBe(SECTION_PEEK_MARGIN)
  })
})

describe('aim triangle', () => {
  const panel = { left: 300, top: 100, bottom: 200 }
  const tri = aimTriangle({ x: 150, y: 260 }, panel)

  it('reaches past the panel edge by the pad', () => {
    expect(tri[1]).toEqual({ x: 300, y: 100 - AIM_TRIANGLE_PAD })
    expect(tri[2]).toEqual({ x: 300, y: 200 + AIM_TRIANGLE_PAD })
  })

  it('holds a path heading for the panel', () => {
    expect(pointInTriangle({ x: 220, y: 210 }, tri)).toBe(true)
    expect(pointInTriangle({ x: 299, y: 150 }, tri)).toBe(true)
  })

  it('rejects moves away from the panel', () => {
    expect(pointInTriangle({ x: 150, y: 300 }, tri)).toBe(false)
    expect(pointInTriangle({ x: 160, y: 120 }, tri)).toBe(false)
    expect(pointInTriangle({ x: 320, y: 150 }, tri)).toBe(false)
  })

  it('counts the apex and the edges as inside, in either winding', () => {
    expect(pointInTriangle({ x: 150, y: 260 }, tri)).toBe(true)
    expect(pointInTriangle({ x: 300, y: 150 }, [tri[0], tri[2], tri[1]])).toBe(true)
  })
})

describe('scrollMovesRows', () => {
  // A scroller as a set of the rows it contains.
  const box = (...inside: string[]) => ({ contains: (row: string) => inside.includes(row) })

  it('dismisses when the list holding the pending or open row scrolls', () => {
    expect(scrollMovesRows(box('a', 'b'), ['a', null])).toBe(true)
    expect(scrollMovesRows(box('a', 'b'), [undefined, 'b'])).toBe(true)
  })

  it('ignores scrolls elsewhere (the AI chat, the editor)', () => {
    expect(scrollMovesRows(box('chat-line'), ['a', 'b'])).toBe(false)
  })

  it('treats a page scroll as moving every row', () => {
    expect(scrollMovesRows('document', ['a', null])).toBe(true)
  })

  it('does nothing with no pending or open row', () => {
    expect(scrollMovesRows('document', [null, undefined])).toBe(false)
    expect(scrollMovesRows(box('a'), [])).toBe(false)
  })
})
