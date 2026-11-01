import { describe, it, expect } from 'vitest'
import {
  UNDOABLE_TOOLS,
  createUndoStore,
  isModifiedSinceEdit,
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

const snap = (before: DiskNote | null, after: DiskNote | null): UndoSnapshot => ({
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

describe('noteFingerprint / isModifiedSinceEdit', () => {
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

  it('reports a change only when disk no longer matches what the AI left', () => {
    const after = note({ sections: [{ id: 's1', name: 'Ideas', content: 'AI text' }, { id: 's2', name: 'Tasks', content: 'two' }] })
    const s = snap(note(), after)
    expect(isModifiedSinceEdit(s, { ...after, updated: 'later' })).toBe(false)
    expect(isModifiedSinceEdit(s, { ...after, title: 'Renamed by the user' })).toBe(true)
    expect(isModifiedSinceEdit(s, null)).toBe(true)
    // A created note that is still untouched / was deleted meanwhile
    expect(isModifiedSinceEdit(snap(null, after), after)).toBe(false)
    expect(isModifiedSinceEdit(snap(note(), null), null)).toBe(false)
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

  it('refuses to re-create a section file deleted after the edit', () => {
    const after = note({ sections: [{ id: 's1', name: 'Ideas', content: 'AI text' }, { id: 's2', name: 'Tasks', content: 'two' }] })
    const userDeletedS2 = note({ sections: [{ id: 's1', name: 'Ideas', content: 'AI text' }] })
    expect(undoBlock(snap(note(), after), userDeletedS2)).toBe('gone')
    // Removing a section the AI added is fine (it deletes, never re-creates)
    const added = note({ sections: [...note().sections, { id: 's3', name: 'New', content: 'x' }] })
    expect(undoBlock(snap(note(), added), added)).toBeNull()
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

  it('restores an encrypted note from its note.md alone', () => {
    const enc = note({ encryption: { alg: 'aes-256-gcm+pbkdf2', salt: 'a', iv: 'b', ciphertext: 'c' }, sections: [] })
    const moved = { ...enc, group: 'g1' }
    const plan = planUndo(snap(enc, moved), moved)
    expect(plan.kind === 'write' && Object.keys(plan.files)).toEqual(['note.md'])
    expect(plan.kind === 'write' && plan.files['note.md']).toContain('ciphertext')
    expect(plan.kind === 'write' && plan.deleteFiles).toEqual([])
  })
})

describe('createUndoStore', () => {
  it('stores by toolCallId and drops the oldest past the limit', () => {
    const store = createUndoStore(2)
    store.put({ ...snap(null, null), toolCallId: 'a' })
    store.put({ ...snap(null, null), toolCallId: 'b' })
    store.put({ ...snap(null, null), toolCallId: 'c' })
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
