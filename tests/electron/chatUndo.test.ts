import { describe, it, expect } from 'vitest'
import {
  UNDOABLE_TOOLS,
  createUndoStore,
  hasUndoConflict,
  mergeUndo,
  noteFingerprint,
  planUndo,
  stripStaleUndo,
  undoBlock,
  undoNoteId,
  type UndoSnapshot,
} from '../../electron/ai/chatUndo'
import type { DiskNote } from '../../electron/noteFormat'

const note = (over: Partial<DiskNote> = {}): DiskNote => ({
  id: 'n1',
  title: 'Roadmap',
  tags: [],
  created: '2026-10-01T10:00:00.000Z',
  updated: '2026-10-01T10:00:00.000Z',
  sections: [
    { id: 's1', name: 'Ideas', content: 'one' },
    { id: 's2', name: 'Tasks', content: 'two' },
  ],
  ...over,
})

const snap = (before: DiskNote | null, after: DiskNote): UndoSnapshot => ({
  toolCallId: 'call-1', noteId: 'n1', dir: 'roadmap-n1', before, after,
})

describe('undoNoteId', () => {
  it('reads note_id for edits and the created id for create_note', () => {
    expect(undoNoteId('update_section', { note_id: 'n1', section_id: 's1' })).toBe('n1')
    expect(undoNoteId('create_note', { title: 'x' }, 'new1')).toBe('new1')
    expect(undoNoteId('create_note', { title: 'x' })).toBeNull()
  })

  it('ignores tools that cannot be undone and malformed input', () => {
    expect(undoNoteId('create_group', { note_id: 'n1' })).toBeNull()
    expect(undoNoteId('update_note', null)).toBeNull()
    expect(undoNoteId('update_note', { note_id: 42 })).toBeNull()
  })

  it('covers the note-modifying tools, never the deletions', () => {
    expect([...UNDOABLE_TOOLS].sort()).toEqual(
      ['add_section', 'create_note', 'rename_section', 'update_note', 'update_section'],
    )
    // A restored deletion would race the remote delete queued in the sync journal.
    expect(undoNoteId('delete_note', { note_id: 'n1' })).toBeNull()
    expect(undoNoteId('delete_section', { note_id: 'n1', section_id: 's1' })).toBeNull()
  })
})

describe('noteFingerprint', () => {
  it('ignores the updated timestamp', () => {
    expect(noteFingerprint(note())).toBe(noteFingerprint(note({ updated: '2026-11-01T00:00:00.000Z' })))
  })

  it('sees content, name, flags and placement changes', () => {
    const base = noteFingerprint(note())
    expect(noteFingerprint(note({ title: 'Other' }))).not.toBe(base)
    expect(noteFingerprint(note({ favorited: true }))).not.toBe(base)
    expect(noteFingerprint(note({ group: 'g1' }))).not.toBe(base)
    expect(noteFingerprint(note({ sections: [{ id: 's1', name: 'Ideas', content: 'one!' }, { id: 's2', name: 'Tasks', content: 'two' }] }))).not.toBe(base)
    expect(noteFingerprint(note({ sections: [{ id: 's1', name: 'Ideas', content: 'one', aiHidden: true }, { id: 's2', name: 'Tasks', content: 'two' }] }))).not.toBe(base)
    expect(noteFingerprint(null)).not.toBe(base)
  })

})

// The AI's update_section of s1: before → after.
const S1_AI = { id: 's1', name: 'Ideas', content: 'AI text' }
const S2 = { id: 's2', name: 'Tasks', content: 'two' }
const aiEditedS1 = () => note({ sections: [S1_AI, S2] })

describe('hasUndoConflict', () => {
  it('is false while disk still matches what the AI left', () => {
    const after = aiEditedS1()
    expect(hasUndoConflict(snap(note(), after), { ...after, updated: 'later' })).toBe(false)
  })

  it('ignores user edits to parts the AI did not touch', () => {
    const s = snap(note(), aiEditedS1())
    expect(hasUndoConflict(s, { ...aiEditedS1(), title: 'Renamed by the user' })).toBe(false)
    expect(hasUndoConflict(s, note({ sections: [S1_AI, { ...S2, content: 'user text' }] }))).toBe(false)
    expect(hasUndoConflict(s, note({ sections: [S1_AI, S2, { id: 's9', name: 'Mine', content: 'u' }] }))).toBe(false)
    expect(hasUndoConflict(s, note({ sections: [S1_AI] }))).toBe(false)
  })

  it('is true when the part the AI changed changed again', () => {
    const s = snap(note(), aiEditedS1())
    expect(hasUndoConflict(s, note({ sections: [{ ...S1_AI, content: 'AI text + user' }, S2] }))).toBe(true)
    expect(hasUndoConflict(s, null)).toBe(true)
    // A note-level field the AI changed and the user changed again
    const renamed = note({ title: 'AI title' })
    expect(hasUndoConflict(snap(note(), renamed), { ...renamed, title: 'User title' })).toBe(true)
    expect(hasUndoConflict(snap(note(), renamed), { ...renamed, favorited: true })).toBe(false)
    // A section the AI added and the user then edited (a deleted one leaves nothing to lose)
    const added = note({ sections: [...note().sections, { id: 's3', name: 'New', content: 'x' }] })
    expect(hasUndoConflict(snap(note(), added), note({ sections: [...note().sections, { id: 's3', name: 'New', content: 'x+' }] }))).toBe(true)
    expect(hasUndoConflict(snap(note(), added), note())).toBe(false)
  })

  it('treats any change to a created note as a conflict (undo deletes it whole)', () => {
    const after = aiEditedS1()
    expect(hasUndoConflict(snap(null, after), after)).toBe(false)
    expect(hasUndoConflict(snap(null, after), { ...after, title: 'Renamed' })).toBe(true)
    expect(hasUndoConflict(snap(null, after), null)).toBe(true)
  })
})

describe('undoBlock', () => {
  it('lets a normal edit and a created note be undone', () => {
    const after = note({ title: 'AI title' })
    expect(undoBlock(snap(note(), after), after)).toBeNull()
    expect(undoBlock(snap(null, note()), note())).toBeNull()
    expect(undoBlock(snap(null, note()), null)).toBeNull()
  })

  it('refuses to re-create a note folder deleted after the edit', () => {
    expect(undoBlock(snap(note(), note({ title: 'AI title' })), null)).toBe('gone')
  })

  it('refuses to re-create the section the AI changed once deleted after the edit', () => {
    const userDeletedS1 = note({ sections: [S2] })
    expect(undoBlock(snap(note(), aiEditedS1()), userDeletedS1)).toBe('gone')
  })

  it('does not block when the user deleted a section the AI did not touch', () => {
    const userDeletedS2 = note({ sections: [S1_AI] })
    expect(undoBlock(snap(note(), aiEditedS1()), userDeletedS2)).toBeNull()
    // Removing a section the AI added is fine (it deletes, never re-creates)
    const added = note({ sections: [...note().sections, { id: 's3', name: 'New', content: 'x' }] })
    expect(undoBlock(snap(note(), added), added)).toBeNull()
    expect(undoBlock(snap(note(), added), note())).toBeNull()
  })

  it('keeps blocking a section the tool itself removed (its remote delete is queued)', () => {
    const removedS2 = note({ sections: [{ id: 's1', name: 'Ideas', content: 'one' }] })
    expect(undoBlock(snap(note(), removedS2), removedS2)).toBe('gone')
    // The merge itself would put it back after its neighbour (only reachable bypassing undoBlock).
    const mine = { id: 's9', name: 'Mine', content: 'u' }
    expect(mergeUndo(snap(note(), removedS2), note({ sections: [mine, removedS2.sections[0]] })).sections.map((s) => s.id))
      .toEqual(['s9', 's1', 's2'])
  })

  it('refuses when the note was encrypted or decrypted after the edit', () => {
    const enc = { alg: 'aes-256-gcm+pbkdf2', salt: 'a', iv: 'b', ciphertext: 'c' }
    const after = note({ title: 'AI title' })
    expect(undoBlock(snap(note(), after), note({ title: 'AI title', encryption: enc, sections: [] }))).toBe('encryption')
    const encBefore = note({ encryption: enc, sections: [] })
    const encAfter = { ...encBefore, group: 'g1' }
    expect(undoBlock(snap(encBefore, encAfter), note({ group: 'g1' }))).toBe('encryption')
    expect(undoBlock(snap(encBefore, encAfter), encAfter)).toBeNull()
  })
})

describe('planUndo', () => {
  it('deletes a note the tool created (noop if already gone)', () => {
    expect(planUndo(snap(null, note()), note())).toEqual({ kind: 'delete', dir: 'roadmap-n1' })
    expect(planUndo(snap(null, note()), null)).toEqual({ kind: 'noop' })
  })

  it('rewrites note.md plus only the section files that differ', () => {
    const before = note()
    const current = note({ sections: [{ id: 's1', name: 'Ideas', content: 'AI text' }, { id: 's2', name: 'Tasks', content: 'two' }] })
    const plan = planUndo(snap(before, current), current)
    expect(plan.kind).toBe('write')
    if (plan.kind !== 'write') return
    expect(plan.dir).toBe('roadmap-n1')
    expect(Object.keys(plan.files).sort()).toEqual(['note.md', 's1.md'])
    expect(plan.files['s1.md']).toBe('one')
    expect(plan.files['note.md']).toContain('title: Roadmap')
    expect(plan.deleteFiles).toEqual([])
  })

  it('removes a section the tool added', () => {
    const added = note({ sections: [...note().sections, { id: 's3', name: 'New', content: 'x' }] })
    const plan = planUndo(snap(note(), added), added)
    expect(plan.kind === 'write' && plan.deleteFiles).toEqual(['s3.md'])
    expect(plan.kind === 'write' && Object.keys(plan.files)).toEqual(['note.md'])
  })

  it('keeps a user edit to another section made after the AI edit', () => {
    const s = snap(note(), aiEditedS1())
    const current = note({ sections: [S1_AI, { ...S2, content: 'user text' }] })
    expect(hasUndoConflict(s, current)).toBe(false)
    expect(undoBlock(s, current)).toBeNull()
    const plan = planUndo(s, current)
    expect(plan.kind === 'write' && Object.keys(plan.files).sort()).toEqual(['note.md', 's1.md'])
    expect(plan.kind === 'write' && plan.files['s1.md']).toBe('one')
    expect(plan.kind === 'write' && plan.deleteFiles).toEqual([])
    expect(mergeUndo(s, current).sections).toEqual([{ id: 's1', name: 'Ideas', content: 'one' }, { ...S2, content: 'user text' }])
  })

  it('keeps sections the user added afterwards, and deletions of untouched ones', () => {
    const s = snap(note(), aiEditedS1())
    const mine = { id: 's9', name: 'Mine', content: 'u' }
    const merged = mergeUndo(s, note({ sections: [mine, S1_AI] }))
    expect(merged.sections).toEqual([mine, { id: 's1', name: 'Ideas', content: 'one' }])
    const plan = planUndo(s, note({ sections: [mine, S1_AI] }))
    expect(plan.kind === 'write' && plan.deleteFiles).toEqual([])
    expect(plan.kind === 'write' && Object.keys(plan.files).sort()).toEqual(['note.md', 's1.md'])
  })

  it('forced over a conflict restores only the conflicting section', () => {
    const s = snap(note(), aiEditedS1())
    const current = note({ title: 'User title', sections: [{ ...S1_AI, content: 'AI text + user' }, { ...S2, content: 'user text' }] })
    expect(hasUndoConflict(s, current)).toBe(true)
    const merged = mergeUndo(s, current)
    expect(merged.title).toBe('User title')
    expect(merged.sections).toEqual([{ id: 's1', name: 'Ideas', content: 'one' }, { ...S2, content: 'user text' }])
  })

  it('undoes add_section by removing only that section', () => {
    const s3 = { id: 's3', name: 'New', content: 'x' }
    const s = snap(note(), note({ sections: [...note().sections, s3] }))
    const current = note({ sections: [{ id: 's1', name: 'Ideas', content: 'user' }, S2, s3] })
    const plan = planUndo(s, current)
    expect(plan.kind === 'write' && plan.deleteFiles).toEqual(['s3.md'])
    expect(plan.kind === 'write' && Object.keys(plan.files)).toEqual(['note.md'])
    expect(mergeUndo(s, current).sections.map((x) => x.content)).toEqual(['user', 'two'])
  })

  it('undoes rename_section keeping the content the user typed since', () => {
    const renamed = note({ sections: [{ id: 's1', name: 'Brainstorm', content: 'one' }, S2] })
    const s = snap(note(), renamed)
    // s2 edited since: unrelated to the rename, it survives.
    const current = note({ sections: [{ id: 's1', name: 'Brainstorm', content: 'one' }, { ...S2, content: 'later' }] })
    expect(hasUndoConflict(s, current)).toBe(false)
    expect(mergeUndo(s, current).sections).toEqual([{ id: 's1', name: 'Ideas', content: 'one' }, { ...S2, content: 'later' }])
    const plan = planUndo(s, current)
    // Section names live in note.md: the section file itself is unchanged.
    expect(plan.kind === 'write' && Object.keys(plan.files)).toEqual(['note.md'])
    expect(plan.kind === 'write' && plan.files['note.md']).toContain('name: Ideas')
  })

  it('undoes update_note per field (title, placement), keeping other user changes', () => {
    const before = note({ group: 'g1', folder: 'f1' })
    const after = { ...before, title: 'AI title' }
    const current = { ...after, tags: ['mine'], favorited: true, group: 'g2', folder: undefined, sections: [{ id: 's1', name: 'Ideas', content: 'user #mine' }, S2] }
    const s = snap(before, after)
    expect(hasUndoConflict(s, current)).toBe(false)
    const merged = mergeUndo(s, current)
    expect(merged.title).toBe('Roadmap')
    expect(merged.tags).toEqual(['mine'])
    expect(merged.favorited).toBe(true)
    expect([merged.group, merged.folder]).toEqual(['g2', undefined])
    expect(merged.sections[0].content).toBe('user #mine')
    // Group and folder go together: the AI moving the note restores both.
    const moved = { ...before, group: 'g3', folder: undefined }
    const m2 = mergeUndo(snap(before, moved), { ...moved, title: 'User title' })
    expect([m2.group, m2.folder, m2.title]).toEqual(['g1', 'f1', 'User title'])
  })

  it('recomputes tags from the merged content (they are derived, the tools never set them)', () => {
    // The AI adds #urgent to s1; the renderer then derives tags when the user edits s2.
    const after = note({ sections: [{ id: 's1', name: 'Ideas', content: 'one #urgent' }, S2] })
    const current = note({ tags: ['urgent', 'later'], sections: [{ id: 's1', name: 'Ideas', content: 'one #urgent' }, { ...S2, content: 'two #later' }] })
    const s = snap(note(), after)
    expect(hasUndoConflict(s, current)).toBe(false)
    expect(mergeUndo(s, current).tags).toEqual(['later'])
    const plan = planUndo(s, current)
    expect(plan.kind === 'write' && plan.files['note.md']).toMatch(/tags:\n\s+- later\n/)
    // Same through add_section: removing the AI's section drops its tag.
    const added = note({ sections: [...note().sections, { id: 's3', name: 'New', content: '#urgent' }] })
    expect(mergeUndo(snap(note(), added), { ...added, tags: ['urgent'] }).tags).toEqual([])
  })

  it('is a noop when there is nothing left to revert, or the note is gone', () => {
    const s3 = { id: 's3', name: 'New', content: 'x' }
    expect(planUndo(snap(note(), note({ sections: [...note().sections, s3] })), note())).toEqual({ kind: 'noop' })
    // Never re-creates a deleted note (undoBlock reports it as 'gone' first).
    expect(planUndo(snap(note(), aiEditedS1()), null)).toEqual({ kind: 'noop' })
  })

  it('restores an encrypted note from its note.md alone', () => {
    const enc = note({ encryption: { alg: 'aes-256-gcm+pbkdf2', salt: 'a', iv: 'b', ciphertext: 'c' }, sections: [] })
    const moved = { ...enc, group: 'g1' }
    const plan = planUndo(snap(enc, moved), moved)
    expect(plan.kind === 'write' && Object.keys(plan.files)).toEqual(['note.md'])
    expect(plan.kind === 'write' && plan.files['note.md']).toContain('ciphertext')
    expect(plan.kind === 'write' && plan.deleteFiles).toEqual([])
  })

  it('keeps the current ciphertext of an encrypted note re-encrypted since', () => {
    const enc = note({ encryption: { alg: 'aes-256-gcm+pbkdf2', salt: 'a', iv: 'b', ciphertext: 'old' }, sections: [] })
    const moved = { ...enc, group: 'g1' }
    const current = { ...moved, encryption: { ...enc.encryption, ciphertext: 'new' } }
    const s = snap(enc, moved)
    expect(undoBlock(s, current)).toBeNull()
    expect(hasUndoConflict(s, current)).toBe(false)
    const plan = planUndo(s, current)
    expect(plan.kind === 'write' && plan.files['note.md']).toContain('ciphertext: new')
    expect(plan.kind === 'write' && plan.files['note.md']).not.toContain('group:')
  })
})

describe('createUndoStore', () => {
  it('stores by toolCallId and drops the oldest past the limit', () => {
    const store = createUndoStore(2)
    store.put({ ...snap(null, note()), toolCallId: 'a' })
    store.put({ ...snap(null, note()), toolCallId: 'b' })
    store.put({ ...snap(null, note()), toolCallId: 'c' })
    expect(store.has('a')).toBe(false)
    expect(store.has('b') && store.has('c')).toBe(true)
    store.delete('b')
    expect(store.get('b')).toBeUndefined()
    expect(store.size).toBe(1)
  })
})

describe('stripStaleUndo', () => {
  const sessions = [{
    id: 's', title: 't', messages: [
      { id: 'm1', role: 'user', content: 'hi' },
      { id: 'm2', role: 'assistant', content: 'ok', actions: [
        { toolCallId: 'live', name: 'update_section', status: 'done', undo: 'available' },
        { toolCallId: 'dead', name: 'update_section', status: 'done', undo: 'available' },
        { toolCallId: 'past', name: 'add_section', status: 'done', undo: 'done' },
      ] },
    ],
  }]

  it('drops "available" for snapshots main no longer holds, keeps the rest', () => {
    const out = stripStaleUndo(sessions, (id) => id === 'live')
    const actions = out[0].messages[1].actions!
    expect(actions[0].undo).toBe('available')
    expect('undo' in actions[1]).toBe(false)
    expect(actions[2].undo).toBe('done')
    expect(sessions[0].messages[1].actions![1].undo).toBe('available') // input untouched
  })

  it('returns the same array when nothing changes', () => {
    expect(stripStaleUndo(sessions, () => true)).toBe(sessions)
    expect(stripStaleUndo('garbage', () => false)).toBe('garbage')
  })
})
