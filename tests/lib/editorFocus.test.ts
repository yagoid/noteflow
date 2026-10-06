import { describe, it, expect } from 'vitest'
import { EDITOR_WIDGET_SELECTOR, editorOwnsFocus, isEditorWidgetTarget } from '../../src/lib/editorFocus'

const node = (inWidget: boolean) => ({
  closest: (sel: string) => (sel === EDITOR_WIDGET_SELECTOR && inWidget ? {} : null),
})

describe('editorOwnsFocus', () => {
  const inside = node(false)
  const outside = node(false)
  const viewDom = { contains: (n: unknown) => n === inside }

  it('is true when ProseMirror itself is focused', () => {
    expect(editorOwnsFocus(true, true, viewDom, null)).toBe(true)
  })
  it('is true when focus is anywhere inside the editor DOM (kanban root, card field)', () => {
    expect(editorOwnsFocus(false, true, viewDom, inside)).toBe(true)
  })
  it('is false when focus is elsewhere or nowhere', () => {
    expect(editorOwnsFocus(false, true, viewDom, outside)).toBe(false)
    expect(editorOwnsFocus(false, true, viewDom, null)).toBe(false)
  })
  it('is false when activeElement is inside the editor but the window is in the background', () => {
    // activeElement stays on the board root after the window blurs; external
    // updates (sticky window, sync pull) must still be applied then.
    expect(editorOwnsFocus(false, false, viewDom, inside)).toBe(false)
  })
})

describe('isEditorWidgetTarget', () => {
  it('detects targets inside NodeView widgets and their popups', () => {
    expect(isEditorWidgetTarget(node(true))).toBe(true)
    expect(isEditorWidgetTarget(node(false))).toBe(false)
    expect(isEditorWidgetTarget(null)).toBe(false)
    expect(isEditorWidgetTarget({})).toBe(false)
  })
})
