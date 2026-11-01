// Explicit chat context (editor sidebar / detached chat window) — pure logic.
// The user picks notes/sections to share with the chat; main reads them from disk and this module
// turns them into system-prompt blocks: never encrypted notes or AI-hidden sections, base64 images
// stripped, capped per item and in total, each block tagged with the note/section ids so the model
// can edit them with the tools without looking them up first.
import type { DiskNote } from '../noteFormat'

export type ChatContextItem =
  | { kind: 'section'; noteId: string; sectionId: string }
  | { kind: 'note'; noteId: string }

export interface ChatContextRequest {
  allNotes: boolean
  items: ChatContextItem[]
  openNote?: { noteId: string; sectionId?: string }
}

export const CONTEXT_ITEM_MAX_CHARS = 12_000
export const CONTEXT_TOTAL_MAX_CHARS = 40_000
export const CONTEXT_MAX_ITEMS = 30

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 128

/** Validates the renderer's context payload. Anything malformed → null (= no explicit context). */
export function sanitizeContextRequest(raw: unknown): ChatContextRequest | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const items: ChatContextItem[] = []
  const seen = new Set<string>()
  for (const it of Array.isArray(r.items) ? r.items : []) {
    if (!it || typeof it !== 'object') continue
    const i = it as Record<string, unknown>
    let item: ChatContextItem | null = null
    if (i.kind === 'section' && isId(i.noteId) && isId(i.sectionId)) item = { kind: 'section', noteId: i.noteId, sectionId: i.sectionId }
    else if (i.kind === 'note' && isId(i.noteId)) item = { kind: 'note', noteId: i.noteId }
    if (!item) continue
    const key = item.kind === 'section' ? `s:${item.noteId}:${item.sectionId}` : `n:${item.noteId}`
    if (seen.has(key)) continue
    seen.add(key)
    items.push(item)
    if (items.length >= CONTEXT_MAX_ITEMS) break
  }
  const out: ChatContextRequest = { allNotes: r.allNotes === true, items }
  const open = r.openNote as Record<string, unknown> | undefined
  if (open && typeof open === 'object' && isId(open.noteId)) {
    out.openNote = { noteId: open.noteId, ...(isId(open.sectionId) ? { sectionId: open.sectionId } : {}) }
  }
  return out
}

export function stripBase64(text: string): string {
  return text.replace(/data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, '[image]')
}

const TRUNCATED_MARK = '\n[…truncated — this section is longer than shown: do not rewrite it whole with update_section]'

function clip(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, Math.max(0, max)) + TRUNCATED_MARK
}

const titleOf = (note: DiskNote) => note.title?.trim() || 'Untitled'

/**
 * System-prompt blocks for the explicit context items. `readNote` resolves a note id from disk
 * (null when missing). A note item sends every visible section; a whole note that is also listed
 * by section is sent once (the note block already includes the section).
 */
export function buildContextBlocks(
  items: ChatContextItem[],
  readNote: (noteId: string) => DiskNote | null,
  opts: { itemMax?: number; totalMax?: number } = {},
): { blocks: string[]; included: Array<{ noteId: string; sectionId?: string }> } {
  const itemMax = opts.itemMax ?? CONTEXT_ITEM_MAX_CHARS
  let budget = opts.totalMax ?? CONTEXT_TOTAL_MAX_CHARS
  const wholeNotes = new Set(items.filter((i) => i.kind === 'note').map((i) => i.noteId))
  const cache = new Map<string, DiskNote | null>()
  const load = (id: string) => {
    if (!cache.has(id)) cache.set(id, readNote(id))
    return cache.get(id) ?? null
  }
  const blocks: string[] = []
  const included: Array<{ noteId: string; sectionId?: string }> = []

  for (const item of items) {
    if (budget <= 0) break
    if (item.kind === 'section' && wholeNotes.has(item.noteId)) continue
    const note = load(item.noteId)
    if (!note || note.encryption) continue
    const visible = note.sections.filter((s) => !s.aiHidden)
    if (item.kind === 'section') {
      const section = visible.find((s) => s.id === item.sectionId)
      if (!section) continue
      const head = `### Section "${section.name}" [section_id=${section.id}] of note "${titleOf(note)}" [note_id=${note.id}]`
      const body = clip(stripBase64(section.content).trim(), Math.min(itemMax, budget)) || '(empty section)'
      const block = `${head}\n${body}`
      blocks.push(block)
      budget -= block.length
      included.push({ noteId: note.id, sectionId: section.id })
    } else {
      if (visible.length === 0) continue
      let itemBudget = Math.min(itemMax, budget)
      const parts: string[] = [`### Note "${titleOf(note)}" [note_id=${note.id}] — whole note`]
      for (const section of visible) {
        if (itemBudget <= 0) { parts.push('[…more sections not shown — call get_note to read them]'); break }
        const body = clip(stripBase64(section.content).trim(), itemBudget) || '(empty section)'
        const part = `#### Section "${section.name}" [section_id=${section.id}]\n${body}`
        parts.push(part)
        itemBudget -= part.length
      }
      const block = parts.join('\n\n')
      blocks.push(block)
      budget -= block.length
      included.push({ noteId: note.id })
    }
  }
  return { blocks, included }
}

/**
 * One line telling the model what the user has open in the editor right now (title + ids), so
 * "this note" / "this section" work even when it isn't in the context. Never names an AI-hidden
 * section and never reads an encrypted note's content.
 */
export function describeOpenNote(open: ChatContextRequest['openNote'], readNote: (noteId: string) => DiskNote | null): string | null {
  if (!open) return null
  const note = readNote(open.noteId)
  if (!note) return null
  if (note.encryption) {
    return `The user currently has the encrypted note "${titleOf(note)}" [note_id=${note.id}] open in the editor. Its content is not readable or editable by you.`
  }
  const section = note.sections.find((s) => s.id === open.sectionId && !s.aiHidden)
  return section
    ? `The user currently has note "${titleOf(note)}" [note_id=${note.id}] open in the editor, on section "${section.name}" [section_id=${section.id}]. "This note" / "this section" refer to them.`
    : `The user currently has note "${titleOf(note)}" [note_id=${note.id}] open in the editor. "This note" refers to it.`
}
