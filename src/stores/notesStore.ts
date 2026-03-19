import { create } from 'zustand'
import type { Note, NoteSection } from '../types'
import { parseNote, serializeNote, createEmptyNote, noteFilename, extractTags } from '../lib/noteUtils'

/** Normalize a string: lowercase + strip diacritical marks (accents) */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

interface NotesState {
  notes: Note[]
  activeNoteId: string | null
  notesDir: string

  // UI state
  searchQuery: string
  filterSection: string  // section name filter, or 'all'
  filterDate: 'all' | 'today' | 'week' | 'month'
  filterTag: string | null
  showArchived: boolean
  commandPaletteOpen: boolean
  isLoading: boolean
  newlyCreatedNoteId: string | null

  // Actions
  loadNotes: () => Promise<void>
  createNote: () => Promise<Note>
  updateNote: (id: string, patch: Partial<Pick<Note, 'title' | 'sections' | 'tags' | 'pinned'>>) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  archiveNote: (id: string) => Promise<void>
  setActiveNote: (id: string | null) => void
  setSearchQuery: (q: string) => void
  setFilterSection: (s: string) => void
  setFilterDate: (f: 'all' | 'today' | 'week' | 'month') => void
  setFilterTag: (tag: string | null) => void
  setShowArchived: (v: boolean) => void
  setCommandPaletteOpen: (v: boolean) => void
  setNewlyCreatedNoteId: (id: string | null) => void
  syncNote: (filePath: string) => Promise<void>
  pruneEmptyNote: (id: string) => Promise<void>

  // Derived helpers
  getActiveNote: () => Note | null
  getFilteredNotes: () => Note[]
  getAllTags: () => string[]
}

export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],
  activeNoteId: null,
  notesDir: '',
  searchQuery: '',
  filterSection: 'all',
  filterDate: 'all',
  filterTag: null,
  showArchived: false,
  commandPaletteOpen: false,
  isLoading: false,
  newlyCreatedNoteId: null,

  loadNotes: async () => {
    set({ isLoading: true })
    try {
      const dir = await window.noteflow.getNotesDir()
      set({ notesDir: dir })

      const allFiles = await window.noteflow.readAllNotes()
      const notes: Note[] = allFiles
        .filter(({ content }) => content !== null)
        .map(({ path, content }) => parseNote(content!, path))

      set({ notes, isLoading: false })

      if (notes.length > 0 && !get().activeNoteId) {
        set({ activeNoteId: notes[0].id })
      }
    } catch (err) {
      console.error('Failed to load notes:', err)
      set({ isLoading: false })
    }
  },
  
  syncNote: async (filePath: string) => {
    try {
      const raw = await window.noteflow.readNote(filePath)
      if (!raw) return
      
      const incomingNote = parseNote(raw, filePath)
      const existingNote = get().notes.find(n => n.id === incomingNote.id)
      
      if (!existingNote) {
        // New note created in another window
        set(s => ({ notes: [incomingNote, ...s.notes] }))
      } else {
        // Compare raw content to avoid unnecessary updates
        if (existingNote.raw === incomingNote.raw) return
        
        set(s => ({
          notes: s.notes.map(n => n.id === incomingNote.id ? incomingNote : n)
        }))
      }
    } catch (err) {
      console.error('Failed to sync note:', err)
    }
  },

  createNote: async () => {
    const draft = createEmptyNote()
    const dir = get().notesDir
    const filename = noteFilename(draft.id, draft.title)
    const filePath = `${dir}/${filename}`
    const raw = serializeNote(draft)
    const note: Note = { ...draft, filePath, raw }

    await window.noteflow.writeNote(filePath, raw)
    set((s) => ({ notes: [note, ...s.notes], activeNoteId: note.id, newlyCreatedNoteId: note.id }))
    return note
  },

  updateNote: async (id, patch) => {
    const note = get().notes.find((n) => n.id === id)
    if (!note) return

    const newSections = patch.sections ?? note.sections
    const allContent = newSections.map((s: NoteSection) => s.content).join('\n')
    // Tags are derived purely from current content — this ensures deleted #tags
    // are removed automatically. Manual patch.tags are ignored for auto-tags.
    const tags = extractTags(allContent)

    const updated: Note = {
      ...note,
      ...patch,
      sections: newSections,
      tags,
      updated: new Date().toISOString(),
    }

    const raw = serializeNote(updated)
    updated.raw = raw

    await window.noteflow.writeNote(note.filePath, raw)
    set((s) => ({ notes: s.notes.map((n) => (n.id === id ? updated : n)) }))
  },

  deleteNote: async (id) => {
    const note = get().notes.find((n) => n.id === id)
    if (!note) return

    await window.noteflow.deleteNote(note.filePath)

    set((s) => {
      const remaining = s.notes.filter((n) => n.id !== id)
      const nextActive = remaining.find((n) => !n.archived) ?? remaining[0] ?? null
      return { notes: remaining, activeNoteId: nextActive?.id ?? null }
    })
  },

  archiveNote: async (id) => {
    const note = get().notes.find((n) => n.id === id)
    if (!note) return

    const updated: Note = { ...note, archived: !note.archived, updated: new Date().toISOString() }
    const raw = serializeNote(updated)
    updated.raw = raw

    await window.noteflow.writeNote(note.filePath, raw)
    set((s) => ({ notes: s.notes.map((n) => (n.id === id ? updated : n)) }))
  },

  setActiveNote: (id) => {
    // Before switching, auto-delete the current note if it's completely empty
    const prev = get().activeNoteId
    if (prev && prev !== id) {
      const prevNote = get().notes.find((n) => n.id === prev)
      if (prevNote) {
        const titleIsDefault = !prevNote.title.trim() || prevNote.title.trim() === 'Untitled'
        const isEmpty =
          titleIsDefault &&
          prevNote.sections.every((s) => !s.content.trim())
        if (isEmpty) {
          get().pruneEmptyNote(prev)
        }
      }
    }
    set({ activeNoteId: id })
  },
  setSearchQuery:       (q)   => set({ searchQuery: q }),
  setFilterSection:     (s)   => set({ filterSection: s }),
  setFilterDate:        (f)   => set({ filterDate: f }),
  setFilterTag:         (tag) => set({ filterTag: tag }),
  setShowArchived:      (v)   => set({ showArchived: v }),
  setCommandPaletteOpen:(v)   => set({ commandPaletteOpen: v }),
  setNewlyCreatedNoteId:(id) => set({ newlyCreatedNoteId: id }),

  pruneEmptyNote: async (id) => {
    const note = get().notes.find((n) => n.id === id)
    if (!note) return
    const titleIsDefault = !note.title.trim() || note.title.trim() === 'Untitled'
    const isEmpty =
      titleIsDefault &&
      note.sections.every((s) => !s.content.trim())
    if (!isEmpty) return
    try { await window.noteflow.deleteNote(note.filePath) } catch { /* ignore */ }
    set((s) => {
      const remaining = s.notes.filter((n) => n.id !== id)
      const nextActive = s.activeNoteId === id
        ? (remaining.find((n) => !n.archived) ?? remaining[0] ?? null)
        : null
      return nextActive !== null
        ? { notes: remaining, activeNoteId: nextActive.id }
        : { notes: remaining }
    })
  },

  getActiveNote: () => {
    const { notes, activeNoteId } = get()
    return notes.find((n) => n.id === activeNoteId) ?? null
  },

  getFilteredNotes: () => {
    const { notes, searchQuery, filterSection, filterTag, showArchived } = get()
    return notes
      .filter((n) => showArchived || !n.archived)
      .filter((n) => {
        if (filterSection === 'all') return true
        return n.sections.some(
          (s) => s.name.toLowerCase() === filterSection.toLowerCase() && s.content.trim().length > 0
        )
      })
      .filter((n) => !filterTag || n.tags.includes(filterTag))
      .filter((n) => {
        if (!searchQuery.trim()) return true
        const q = normalize(searchQuery)
        return (
          normalize(n.title).includes(q) ||
          n.sections.some((s) => normalize(s.content).includes(q) || normalize(s.name).includes(q)) ||
          n.tags.some((t) => normalize(t).includes(q))
        )
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return new Date(b.updated).getTime() - new Date(a.updated).getTime()
      })
  },

  getAllTags: () => {
    const all = get().notes.flatMap((n) => n.tags)
    return [...new Set(all)].sort()
  },
}))
