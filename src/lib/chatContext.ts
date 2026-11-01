// Context of the editor's chat sidebar / detached chat window — pure logic.
// The context is an accumulating set of items (a section, or a whole note) plus an "all notes"
// flag (semantic search over every note). The bar's "Current section" / "Current note" buttons
// add or remove the item for what the editor shows right now; items added earlier stay as chips
// when the user moves to another note. Encrypted notes and AI-hidden sections can't be added.
import type { ChatContextItem, ChatContextPayload, ChatContextState, ChatEditorTarget } from '../types'

export const EMPTY_CONTEXT: ChatContextState = { allNotes: false, items: [] }

export function contextItemKey(item: ChatContextItem): string {
  return item.kind === 'section' ? `section:${item.noteId}:${item.sectionId}` : `note:${item.noteId}`
}

export function hasContextItem(ctx: ChatContextState, item: ChatContextItem): boolean {
  const key = contextItemKey(item)
  return ctx.items.some((i) => contextItemKey(i) === key)
}

export function removeContextItem(ctx: ChatContextState, item: ChatContextItem): ChatContextState {
  const key = contextItemKey(item)
  const items = ctx.items.filter((i) => contextItemKey(i) !== key)
  return items.length === ctx.items.length ? ctx : { ...ctx, items }
}

/** Adds the item, or removes it if it's already in the context. */
export function toggleContextItem(ctx: ChatContextState, item: ChatContextItem): ChatContextState {
  return hasContextItem(ctx, item) ? removeContextItem(ctx, item) : { ...ctx, items: [...ctx.items, item] }
}

export function setAllNotes(ctx: ChatContextState, allNotes: boolean): ChatContextState {
  return ctx.allNotes === allNotes ? ctx : { ...ctx, allNotes }
}

/** Why the editor's current section/note can't be added (null = it can). */
export type ContextBlock = 'no-note' | 'no-section' | 'encrypted' | 'ai-hidden'

export function sectionBlock(target: ChatEditorTarget | null): ContextBlock | null {
  if (!target) return 'no-note'
  if (target.encrypted) return 'encrypted'
  if (!target.sectionId) return 'no-section'
  if (target.sectionAiHidden) return 'ai-hidden'
  return null
}

export function noteBlock(target: ChatEditorTarget | null): ContextBlock | null {
  if (!target) return 'no-note'
  if (target.encrypted) return 'encrypted'
  return null
}

/** The item for the section open in the editor, or null when it can't be added. */
export function currentSectionItem(target: ChatEditorTarget | null): ChatContextItem | null {
  if (sectionBlock(target) || !target?.sectionId) return null
  return { kind: 'section', noteId: target.noteId, sectionId: target.sectionId }
}

/** The item for the whole note open in the editor, or null when it can't be added. */
export function currentNoteItem(target: ChatEditorTarget | null): ChatContextItem | null {
  if (noteBlock(target) || !target) return null
  return { kind: 'note', noteId: target.noteId }
}

/** Context of a new chat: the section open in the editor (nothing if none can be added). */
export function defaultContext(target: ChatEditorTarget | null): ChatContextState {
  const item = currentSectionItem(target)
  return item ? { allNotes: false, items: [item] } : EMPTY_CONTEXT
}

/**
 * The context after the editor moves to `target`. While the chat is still a blank slate — no
 * messages and the user hasn't touched the context (`pinned` false) — the default "current
 * section" FOLLOWS the open section. Once the user adds/removes/toggles something or sends the
 * first message (`pinned`), it is frozen and only changes through the bar (accumulating set).
 */
export function contextAfterTargetChange(
  ctx: ChatContextState,
  pinned: boolean,
  messageCount: number,
  target: ChatEditorTarget | null,
): ChatContextState {
  return pinned || messageCount > 0 ? ctx : defaultContext(target)
}

/** The `ai:chat` payload: the context plus what the editor shows right now. */
export function contextPayload(ctx: ChatContextState, target: ChatEditorTarget | null): ChatContextPayload {
  return {
    allNotes: ctx.allNotes,
    items: ctx.items,
    ...(target ? { openNote: { noteId: target.noteId, ...(target.sectionId ? { sectionId: target.sectionId } : {}) } } : {}),
  }
}

/** Same target, field by field (the main window recomputes it on every store change). */
export function sameEditorTarget(a: ChatEditorTarget | null, b: ChatEditorTarget | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.noteId === b.noteId && a.noteTitle === b.noteTitle && a.sectionId === b.sectionId &&
    a.sectionName === b.sectionName && a.encrypted === b.encrypted && a.sectionAiHidden === b.sectionAiHidden
}
