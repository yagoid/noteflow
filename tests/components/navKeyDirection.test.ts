// @vitest-environment happy-dom
// The back / forward key chords (components/useNavHistory.ts), also what the editor pane
// lets through to window instead of keeping it (Editor/NoteEditor.tsx onKeyDown).
import { describe, it, expect } from 'vitest'
import { navKeyDirection } from '../../src/components/useNavHistory'

const key = (k: string, mods: Partial<Record<'alt' | 'ctrl' | 'meta' | 'shift', boolean>> = {}, code = '') => ({
  key: k,
  code,
  altKey: !!mods.alt,
  ctrlKey: !!mods.ctrl,
  metaKey: !!mods.meta,
  shiftKey: !!mods.shift,
})

describe('navKeyDirection — Windows / Linux', () => {
  it('Alt+← is back, Alt+→ is forward', () => {
    expect(navKeyDirection(key('ArrowLeft', { alt: true }), false)).toBe(-1)
    expect(navKeyDirection(key('ArrowRight', { alt: true }), false)).toBe(1)
  })

  it('no chord without Alt, or with Shift / Ctrl / Meta (selection, word jump, AltGr…)', () => {
    expect(navKeyDirection(key('ArrowLeft'), false)).toBe(0)
    expect(navKeyDirection(key('ArrowLeft', { alt: true, shift: true }), false)).toBe(0)
    expect(navKeyDirection(key('ArrowLeft', { alt: true, ctrl: true }), false)).toBe(0)
    expect(navKeyDirection(key('ArrowRight', { alt: true, meta: true }), false)).toBe(0)
    expect(navKeyDirection(key('ArrowUp', { alt: true }), false)).toBe(0)
    expect(navKeyDirection(key('Escape'), false)).toBe(0)
  })
})

describe('navKeyDirection — macOS', () => {
  it('⌘[ is back, ⌘] is forward (by key or by physical code)', () => {
    expect(navKeyDirection(key('[', { meta: true }), true)).toBe(-1)
    expect(navKeyDirection(key(']', { meta: true }), true)).toBe(1)
    expect(navKeyDirection(key('´', { meta: true }, 'BracketLeft'), true)).toBe(-1)
    expect(navKeyDirection(key('+', { meta: true }, 'BracketRight'), true)).toBe(1)
  })

  it('⌥←/→ is the word jump there, not navigation', () => {
    expect(navKeyDirection(key('ArrowLeft', { alt: true }), true)).toBe(0)
    expect(navKeyDirection(key('[', {}), true)).toBe(0)
  })
})
