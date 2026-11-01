import { describe, it, expect } from 'vitest'
import {
  EMPTY_CONTEXT,
  contextAfterTargetChange,
  contextPayload,
  currentNoteItem,
  currentSectionItem,
  defaultContext,
  hasContextItem,
  noteBlock,
  removeContextItem,
  sameEditorTarget,
  sectionBlock,
  setAllNotes,
  toggleContextItem,
} from '../../src/lib/chatContext'
import type { ChatEditorTarget } from '../../src/types'

const target = (over: Partial<ChatEditorTarget> = {}): ChatEditorTarget => ({
  noteId: 'n1', noteTitle: 'Roadmap', sectionId: 's1', sectionName: 'Ideas', encrypted: false, sectionAiHidden: false, ...over,
})

describe('current section / note items', () => {
  it('offers the open section and note', () => {
    expect(currentSectionItem(target())).toEqual({ kind: 'section', noteId: 'n1', sectionId: 's1' })
    expect(currentNoteItem(target())).toEqual({ kind: 'note', noteId: 'n1' })
  })

  it('blocks encrypted notes, AI-hidden sections and no note', () => {
    expect(sectionBlock(null)).toBe('no-note')
    expect(noteBlock(null)).toBe('no-note')
    expect(sectionBlock(target({ encrypted: true }))).toBe('encrypted')
    expect(noteBlock(target({ encrypted: true }))).toBe('encrypted')
    expect(sectionBlock(target({ sectionAiHidden: true }))).toBe('ai-hidden')
    expect(noteBlock(target({ sectionAiHidden: true }))).toBeNull() // the note sends its visible sections
    expect(sectionBlock(target({ sectionId: undefined }))).toBe('no-section')
    expect(currentSectionItem(target({ sectionAiHidden: true }))).toBeNull()
    expect(currentNoteItem(target({ encrypted: true }))).toBeNull()
  })
})

describe('context set', () => {
  it('toggles items in and out, accumulating across notes', () => {
    const a = { kind: 'section', noteId: 'n1', sectionId: 's1' } as const
    const b = { kind: 'note', noteId: 'n2' } as const
    let ctx = toggleContextItem(EMPTY_CONTEXT, a)
    ctx = toggleContextItem(ctx, b)
    expect(ctx.items).toEqual([a, b])
    expect(hasContextItem(ctx, { kind: 'section', noteId: 'n1', sectionId: 's1' })).toBe(true)
    ctx = toggleContextItem(ctx, a)
    expect(ctx.items).toEqual([b])
    expect(removeContextItem(ctx, a)).toBe(ctx) // not there → same object
    expect(removeContextItem(ctx, b).items).toEqual([])
  })

  it('flips "all notes" independently of the items', () => {
    const ctx = setAllNotes(EMPTY_CONTEXT, true)
    expect(ctx).toEqual({ allNotes: true, items: [] })
    expect(setAllNotes(ctx, true)).toBe(ctx)
  })

  it('defaults a new chat to the open section (or nothing)', () => {
    expect(defaultContext(target())).toEqual({ allNotes: false, items: [{ kind: 'section', noteId: 'n1', sectionId: 's1' }] })
    expect(defaultContext(null)).toBe(EMPTY_CONTEXT)
    expect(defaultContext(target({ encrypted: true }))).toBe(EMPTY_CONTEXT)
    expect(defaultContext(target({ sectionAiHidden: true }))).toBe(EMPTY_CONTEXT)
  })
})

describe('contextAfterTargetChange', () => {
  const restored = target({ noteId: 'n1', sectionId: 's1' })
  const other = target({ noteId: 'n2', noteTitle: 'Huerto', sectionId: 's9', sectionName: 'Plantas' })

  it('follows the open section while the chat is blank and untouched', () => {
    const seeded = defaultContext(restored) // e.g. the note restored at app start
    expect(contextAfterTargetChange(seeded, false, 0, other)).toEqual(defaultContext(other))
    expect(contextAfterTargetChange(seeded, false, 0, null)).toBe(EMPTY_CONTEXT)
    expect(contextAfterTargetChange(seeded, false, 0, target({ encrypted: true }))).toBe(EMPTY_CONTEXT)
  })

  it('freezes once the user touched the bar (accumulating from then on)', () => {
    const touched = toggleContextItem(defaultContext(restored), { kind: 'note', noteId: 'n3' })
    expect(contextAfterTargetChange(touched, true, 0, other)).toBe(touched)
  })

  it('freezes once the chat has messages', () => {
    const ctx = defaultContext(restored)
    expect(contextAfterTargetChange(ctx, false, 2, other)).toBe(ctx)
  })
})

describe('contextPayload', () => {
  it('adds what the editor shows now', () => {
    const ctx = { allNotes: true, items: [{ kind: 'note' as const, noteId: 'n2' }] }
    expect(contextPayload(ctx, target())).toEqual({ ...ctx, openNote: { noteId: 'n1', sectionId: 's1' } })
    expect(contextPayload(ctx, target({ sectionId: undefined }))).toEqual({ ...ctx, openNote: { noteId: 'n1' } })
    expect(contextPayload(ctx, null)).toEqual(ctx)
  })
})

describe('sameEditorTarget', () => {
  it('compares field by field', () => {
    expect(sameEditorTarget(target(), target())).toBe(true)
    expect(sameEditorTarget(null, null)).toBe(true)
    expect(sameEditorTarget(target(), null)).toBe(false)
    expect(sameEditorTarget(target(), target({ sectionName: 'Renamed' }))).toBe(false)
    expect(sameEditorTarget(target(), target({ sectionAiHidden: true }))).toBe(false)
  })
})
