// Where the "send to an agent" pill goes for a text selection
// (src/lib/agentSelectionPlacement.ts): never over the selected text while
// there is room, never outside the visible part of the note.

import { describe, expect, it } from 'vitest'
import { agentSelectionPillPosition, type Box } from '../../src/lib/agentSelectionPlacement'

const AREA: Box = { top: 100, bottom: 700, left: 200, right: 1000 }
const SIZE = { width: 180, height: 28 }
/** A caret box on the line whose top is `top`, at x = `left`. */
const caret = (top: number, left: number): Box => ({ top, bottom: top + 20, left, right: left })

describe('agentSelectionPillPosition', () => {
  it('goes above the first line, from where the selection starts', () => {
    expect(agentSelectionPillPosition(caret(300, 400), caret(340, 600), SIZE, AREA)).toEqual({ top: 300 - 8 - 28, left: 400 })
  })

  it('stays inside the visible area sideways', () => {
    expect(agentSelectionPillPosition(caret(300, 950), caret(300, 990), SIZE, AREA)?.left).toBe(1000 - 6 - 180)
    expect(agentSelectionPillPosition(caret(300, 150), caret(300, 260), SIZE, AREA)?.left).toBe(206)
  })

  it('no room above (first line at the top, or scrolled past it) → below the last line, ending where the selection ends', () => {
    expect(agentSelectionPillPosition(caret(110, 400), caret(150, 600), SIZE, AREA)).toEqual({ top: 170 + 8, left: 600 - 180 })
    expect(agentSelectionPillPosition(caret(-50, 400), caret(150, 600), SIZE, AREA)).toEqual({ top: 178, left: 420 })
  })

  it('a selection that fills the visible area → the top right corner', () => {
    expect(agentSelectionPillPosition(caret(-400, 220), caret(1500, 300), SIZE, AREA)).toEqual({ top: 106, left: 1000 - 6 - 180 })
    // The last line is visible but too close to the bottom edge, the first one is above the area.
    expect(agentSelectionPillPosition(caret(-400, 220), caret(670, 300), SIZE, AREA)).toEqual({ top: 106, left: 814 })
  })

  it('a selection scrolled out of sight → nothing', () => {
    expect(agentSelectionPillPosition(caret(-300, 400), caret(60, 600), SIZE, AREA)).toBeNull()
    expect(agentSelectionPillPosition(caret(720, 400), caret(900, 600), SIZE, AREA)).toBeNull()
  })

  it('an area narrower than the pill pins it to the left margin', () => {
    const narrow: Box = { top: 0, bottom: 200, left: 0, right: 150 }
    expect(agentSelectionPillPosition(caret(80, 40), caret(80, 90), SIZE, narrow)).toEqual({ top: 80 - 8 - 28, left: 6 })
  })
})
