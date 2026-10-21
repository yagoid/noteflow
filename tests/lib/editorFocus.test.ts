import { describe, it, expect } from 'vitest'
import { EDITOR_WIDGET_SELECTOR, isEditorWidgetTarget, widgetFieldHasFocus } from '../../src/lib/editorFocus'

const node = (inWidget: boolean, tagName = 'DIV') => ({
  tagName,
  closest: (sel: string) => (sel === EDITOR_WIDGET_SELECTOR && inWidget ? {} : null),
})

describe('widgetFieldHasFocus', () => {
  const cardField = node(true, 'TEXTAREA')
  const boardRoot = node(true, 'DIV')
  const proseMirrorText = node(false, 'P')
  const outsideField = node(true, 'TEXTAREA')
  const viewDom = { contains: (n: unknown) => n === cardField || n === boardRoot || n === proseMirrorText }

  it('is true for a text field of a NodeView widget inside the editor (open kanban card)', () => {
    expect(widgetFieldHasFocus(true, viewDom, cardField)).toBe(true)
    expect(widgetFieldHasFocus(true, viewDom, { ...node(true, 'input') })).toBe(false) // not inside viewDom
  })
  it('is false on the board root itself, a card checkbox and ProseMirror text (no draft to protect)', () => {
    const checkbox = { ...node(true, 'INPUT'), type: 'checkbox' }
    const dom = { contains: (n: unknown) => n === checkbox || viewDom.contains(n) }
    expect(widgetFieldHasFocus(true, dom, checkbox)).toBe(false)
    expect(widgetFieldHasFocus(true, viewDom, boardRoot)).toBe(false)
    expect(widgetFieldHasFocus(true, viewDom, proseMirrorText)).toBe(false)
  })
  it('is false when focus is elsewhere or nowhere', () => {
    expect(widgetFieldHasFocus(true, viewDom, outsideField)).toBe(false)
    expect(widgetFieldHasFocus(true, viewDom, null)).toBe(false)
  })
  it('is false when the window is in the background', () => {
    // activeElement stays on the card field after the window blurs; that blur
    // commits the field, so external updates must be applied then.
    expect(widgetFieldHasFocus(false, viewDom, cardField)).toBe(false)
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
