import { describe, it, expect } from 'vitest'
import { isDragEndOutsideWindow, noteOpenSectionId } from '../../src/lib/noteDragOut'

// Dragging ONE note out of the window opens it in its own window (sidebar, content view).

describe('noteOpenSectionId', () => {
  const note = { sections: [{ id: 'a' }, { id: 'b' }] }

  it('opens on the section last active in the note', () => {
    expect(noteOpenSectionId(note, 'b')).toBe('b')
  })

  it('falls back to the first section when none is remembered or it no longer exists', () => {
    expect(noteOpenSectionId(note, undefined)).toBe('a')
    expect(noteOpenSectionId(note, null)).toBe('a')
    expect(noteOpenSectionId(note, 'gone')).toBe('a')
  })

  it('has nothing to open for a note without sections', () => {
    expect(noteOpenSectionId({ sections: [] }, 'a')).toBeUndefined()
  })
})

describe('isDragEndOutsideWindow', () => {
  // A 1000×800 window at (200, 100) on screen.
  const win = { innerWidth: 1000, innerHeight: 800, screenX: 200, screenY: 100, outerWidth: 1000, outerHeight: 800 }
  const at = (clientX: number, clientY: number) => ({ clientX, clientY, screenX: clientX + 200, screenY: clientY + 100 })

  it('is inside for a release over the window', () => {
    expect(isDragEndOutsideWindow(at(500, 400), win)).toBe(false)
    expect(isDragEndOutsideWindow(at(0, 0), win)).toBe(false)
    expect(isDragEndOutsideWindow(at(999, 799), win)).toBe(false)
  })

  it('is outside past any edge', () => {
    expect(isDragEndOutsideWindow(at(-5, 400), win)).toBe(true)
    expect(isDragEndOutsideWindow(at(500, -5), win)).toBe(true)
    expect(isDragEndOutsideWindow(at(1000, 400), win)).toBe(true)
    expect(isDragEndOutsideWindow(at(500, 800), win)).toBe(true)
    expect(isDragEndOutsideWindow(at(1400, 900), win)).toBe(true)
  })

  it('treats an all-zero dragend (some platforms) as unreliable', () => {
    expect(isDragEndOutsideWindow({ clientX: 0, clientY: 0, screenX: 0, screenY: 0 }, win)).toBe(false)
  })

  it('needs the viewport and the screen tests to agree', () => {
    // Client coords say outside, screen coords say inside (or the other way round): no.
    expect(isDragEndOutsideWindow({ clientX: -50, clientY: 400, screenX: 700, screenY: 500 }, win)).toBe(false)
    expect(isDragEndOutsideWindow({ clientX: 500, clientY: 400, screenX: 50, screenY: 500 }, win)).toBe(false)
  })

  it('rejects non-finite coordinates', () => {
    expect(isDragEndOutsideWindow({ clientX: NaN, clientY: -5, screenX: 0, screenY: 0 }, win)).toBe(false)
  })
})
