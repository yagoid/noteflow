import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Note, NoteSection } from '../types'
import { parseNote, serializeNote, createEmptyNote, noteFilename, extractTags, isDefaultNoteTitle } from '../lib/noteUtils'
import { encryptSections, decryptSections, type EncryptionOptions } from '../lib/cryptoUtils'
import { collectAlarms } from '../lib/alarmUtils'

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
  openNoteIds: string[]
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

  // Session-unlocked encrypted notes (in-memory only, not persisted)
  sessionPasswords: Record<string, string>

  // Used once on startup to restore the last active section
  pendingInitialSectionId: string | null

  // Actions
  loadNotes: () => Promise<void>
  createNote: () => Promise<Note>
  duplicateNote: (id: string) => Promise<Note>
  updateNote: (id: string, patch: Partial<Pick<Note, 'title' | 'sections' | 'tags' | 'pinned' | 'group'>>) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  archiveNote: (id: string) => Promise<void>
  setActiveNote: (id: string | null) => void
  setOpenNoteIds: (ids: string[]) => void
  openNoteInSplit: (id: string) => void
  closeOpenNote: (id: string) => void
  setSearchQuery: (q: string) => void
  setFilterSection: (s: string) => void
  setFilterDate: (f: 'all' | 'today' | 'week' | 'month') => void
  setFilterTag: (tag: string | null) => void
  setShowArchived: (v: boolean) => void
  clearFilters: () => void
  setCommandPaletteOpen: (v: boolean) => void
  setNewlyCreatedNoteId: (id: string | null) => void
  syncNote: (filePath: string) => Promise<void>
  pruneEmptyNote: (id: string) => Promise<void>
  encryptNote: (id: string, password: string, options?: EncryptionOptions) => Promise<void>
  unlockNote: (id: string, password: string) => Promise<void>   // temporary in-session unlock
  lockNote: (id: string) => void                                 // re-lock without removing encryption
  removeNoteEncryption: (id: string, password: string) => Promise<void>  // permanent decrypt

  // Derived helpers
  getActiveNote: () => Note | null
  getFilteredNotes: () => Note[]
  getAllTags: () => string[]
}

export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],
  activeNoteId: null,
  openNoteIds: [],
  notesDir: '',
  searchQuery: '',
  filterSection: 'all',
  filterDate: 'all',
  filterTag: null,
  showArchived: false,
  commandPaletteOpen: false,
  isLoading: false,
  newlyCreatedNoteId: null,
  sessionPasswords: {},
  pendingInitialSectionId: null,

  loadNotes: async () => {
    set({ isLoading: true })
    try {
      const [dir, allFiles, uiState] = await Promise.all([
        window.noteflow.getNotesDir(),
        window.noteflow.readAllNotes(),
        window.noteflow.getUiState(),
      ])
      set({ notesDir: dir })

      const notes: Note[] = allFiles
        .filter(({ content }) => content !== null)
        .map(({ path, content }) => parseNote(content!, path))

      // Safety guard: if we got 0 notes but already had notes in memory, this is
      // likely a transient FS issue (e.g. Windows returning an empty dir on OS
      // wake from sleep). Don't wipe in-memory notes — they're still on disk.
      if (notes.length === 0 && get().notes.length > 0) {
        set({ isLoading: false })
        return
      }

      const savedNoteId = uiState.activeNoteId
      const activeNoteId = (savedNoteId && notes.find((n) => n.id === savedNoteId))
        ? savedNoteId
        : notes[0]?.id ?? null

      set({
        notes,
        isLoading: false,
        activeNoteId,
        openNoteIds: activeNoteId ? [activeNoteId] : [],
        pendingInitialSectionId: uiState.activeSectionId ?? null,
      })

      // Register alarms with main process after notes are loaded
      window.noteflow.scheduleAlarms(collectAlarms(notes))
    } catch (err) {
      console.error('Failed to load notes:', err)
      set({ isLoading: false })
    }
  },
  
  syncNote: async (filePath: string) => {
    try {
      const raw = await window.noteflow.readNote(filePath)
      if (!raw) {
        const targetFilename = filePath.replace(/\\/g, '/').split('/').pop()?.toLowerCase()
        if (!targetFilename) return

        set((s) => {
          const removedIds = s.notes
            .filter((n) => n.filePath.replace(/\\/g, '/').split('/').pop()?.toLowerCase() === targetFilename)
            .map((n) => n.id)

          if (removedIds.length === 0) return {}

          const removedSet = new Set(removedIds)
          const remaining = s.notes.filter((n) => !removedSet.has(n.id))
          const nextActiveId =
            (s.activeNoteId && !removedSet.has(s.activeNoteId) ? s.activeNoteId : null) ??
            remaining.find((n) => !n.archived)?.id ??
            remaining[0]?.id ??
            null

          const nextOpen = s.openNoteIds
            .filter((openId) => !removedSet.has(openId))
            .filter((openId) => remaining.some((n) => n.id === openId))

          if (nextActiveId && !nextOpen.includes(nextActiveId)) nextOpen.unshift(nextActiveId)

          const nextSessionPasswords = Object.fromEntries(
            Object.entries(s.sessionPasswords).filter(([noteId]) => !removedSet.has(noteId))
          )

          return {
            notes: remaining,
            activeNoteId: nextActiveId,
            openNoteIds: nextOpen,
            sessionPasswords: nextSessionPasswords,
          }
        })
        return
      }
      
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
    set((s) => ({
      notes: [note, ...s.notes],
      activeNoteId: note.id,
      openNoteIds: [note.id],
      newlyCreatedNoteId: note.id,
    }))
    return note
  },

  duplicateNote: async (id) => {
    const source = get().notes.find((n) => n.id === id)
    if (!source) throw new Error(`Note ${id} not found`)
    const newId = nanoid(8)
    const now = new Date().toISOString()
    const draft: Omit<Note, 'filePath' | 'raw'> = {
      id: newId,
      title: source.title ? `${source.title} (copy)` : 'Untitled (copy)',
      tags: [...source.tags],
      created: now,
      updated: now,
      archived: false,
      pinned: false,
      sections: source.sections.map((s) => ({ ...s, id: nanoid(8) })),
    }
    const dir = get().notesDir
    const filename = noteFilename(draft.id, draft.title)
    const filePath = `${dir}/${filename}`
    const raw = serializeNote(draft as Note)
    const note: Note = { ...draft, filePath, raw }
    await window.noteflow.writeNote(filePath, raw)
    set((s) => ({
      notes: [note, ...s.notes],
      activeNoteId: note.id,
      openNoteIds: [note.id],
      newlyCreatedNoteId: note.id,
    }))
    return note
  },

  updateNote: async (id, patch) => {
    const note = get().notes.find((n) => n.id === id)
    if (!note) return

    if (note.encryption) {
      if (patch.sections !== undefined) {
        // Section edits only allowed when session-unlocked
        const password = get().sessionPasswords[id]
        if (!password) return
        const newSections = patch.sections
        const allContent = newSections.map((s: NoteSection) => s.content).join('\n')
        const tags = extractTags(allContent)
        const encryption = await encryptSections(newSections, password)
        const updated: Note = {
          ...note, ...patch, sections: newSections, tags, encryption,
          updated: new Date().toISOString(),
        }
        const raw = serializeNote(updated)
        updated.raw = raw
        await window.noteflow.writeNote(note.filePath, raw)
        set((s) => ({ notes: s.notes.map((n) => (n.id === id ? updated : n)) }))
        window.noteflow.scheduleAlarms(collectAlarms(get().notes.map(n => n.id === id ? updated : n)))
        return
      }
      // Non-section patches (pinned, title) always allowed for encrypted notes
      const updated: Note = { ...note, ...patch, updated: new Date().toISOString() }
      const raw = serializeNote(updated)
      updated.raw = raw
      await window.noteflow.writeNote(note.filePath, raw)
      set((s) => ({ notes: s.notes.map((n) => (n.id === id ? updated : n)) }))
      return
    }

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
    window.noteflow.scheduleAlarms(collectAlarms(get().notes.map(n => n.id === id ? updated : n)))
  },

  deleteNote: async (id) => {
    const note = get().notes.find((n) => n.id === id)
    if (!note) return

    await window.noteflow.deleteNote(note.filePath)

    set((s) => {
      const remaining = s.notes.filter((n) => n.id !== id)
      const nextActive = remaining.find((n) => !n.archived) ?? remaining[0] ?? null
      const { [id]: _, ...sessionPasswords } = s.sessionPasswords
      const nextOpen = s.openNoteIds
        .filter((openId) => openId !== id)
        .filter((openId) => remaining.some((n) => n.id === openId))
      if (nextActive?.id && !nextOpen.includes(nextActive.id)) nextOpen.unshift(nextActive.id)
      return {
        notes: remaining,
        activeNoteId: nextActive?.id ?? null,
        openNoteIds: nextOpen,
        sessionPasswords,
      }
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
        const titleIsDefault = isDefaultNoteTitle(prevNote.title)
        const isEmpty =
          titleIsDefault &&
          prevNote.sections.every((s) => !s.content.trim())
        if (isEmpty) {
          get().pruneEmptyNote(prev)
        }
      }
    }
    set((s) => {
      if (!id) return { activeNoteId: null }
      if (s.openNoteIds.includes(id)) return { activeNoteId: id }
      return { activeNoteId: id, openNoteIds: [id] }
    })
    if (id) window.noteflow.setUiState({ activeNoteId: id })
  },
  setOpenNoteIds: (ids) => {
    set((s) => {
      const existing = new Set(s.notes.map((n) => n.id))
      const unique = [...new Set(ids.filter((id) => existing.has(id)))]
      if (unique.length === 0) {
        const fallbackId =
          (s.activeNoteId && existing.has(s.activeNoteId) ? s.activeNoteId : null) ??
          s.notes.find((n) => !n.archived)?.id ??
          s.notes[0]?.id ??
          null
        return fallbackId
          ? { openNoteIds: [fallbackId], activeNoteId: fallbackId }
          : { openNoteIds: [], activeNoteId: null }
      }
      const nextActive = s.activeNoteId && unique.includes(s.activeNoteId)
        ? s.activeNoteId
        : unique[0]
      return { openNoteIds: unique, activeNoteId: nextActive }
    })
  },
  openNoteInSplit: (id) => {
    set((s) => {
      if (!s.notes.some((n) => n.id === id)) return {}
      const nextOpen = s.openNoteIds.includes(id) ? s.openNoteIds : [...s.openNoteIds, id]
      return { openNoteIds: nextOpen, activeNoteId: id }
    })
    window.noteflow.setUiState({ activeNoteId: id })
  },
  closeOpenNote: (id) => {
    set((s) => {
      const nextOpen = s.openNoteIds.filter((openId) => openId !== id)
      if (nextOpen.length === 0) {
        const fallbackId =
          s.notes.find((n) => n.id !== id && !n.archived)?.id ??
          s.notes.find((n) => n.id !== id)?.id ??
          null
        return fallbackId
          ? { openNoteIds: [fallbackId], activeNoteId: fallbackId }
          : { openNoteIds: [], activeNoteId: null }
      }

      const nextActive = s.activeNoteId === id
        ? nextOpen[nextOpen.length - 1]
        : (s.activeNoteId && nextOpen.includes(s.activeNoteId) ? s.activeNoteId : nextOpen[0])

      return { openNoteIds: nextOpen, activeNoteId: nextActive }
    })
  },
  setSearchQuery:       (q)   => set({ searchQuery: q }),
  setFilterSection:     (s)   => set({ filterSection: s }),
  setFilterDate:        (f)   => set({ filterDate: f }),
  setFilterTag:         (tag) => set({ filterTag: tag }),
  setShowArchived:      (v)   => set({ showArchived: v }),
  clearFilters:         ()    => set({
    searchQuery: '',
    filterSection: 'all',
    filterDate: 'all',
    filterTag: null,
    showArchived: false,
  }),
  setCommandPaletteOpen:(v)   => set({ commandPaletteOpen: v }),
  setNewlyCreatedNoteId:(id) => set({ newlyCreatedNoteId: id }),

  pruneEmptyNote: async (id) => {
    const note = get().notes.find((n) => n.id === id)
    if (!note) return
    if (note.encryption) return  // never auto-delete encrypted notes
    const titleIsDefault = isDefaultNoteTitle(note.title)
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
      const nextOpen = s.openNoteIds
        .filter((openId) => openId !== id)
        .filter((openId) => remaining.some((n) => n.id === openId))
      if (nextActive?.id && !nextOpen.includes(nextActive.id)) nextOpen.unshift(nextActive.id)
      return nextActive !== null
        ? { notes: remaining, activeNoteId: nextActive.id, openNoteIds: nextOpen }
        : { notes: remaining, openNoteIds: nextOpen }
    })
  },

  encryptNote: async (id, password, options) => {
    const note = get().notes.find((n) => n.id === id)
    if (!note || note.encryption) return
    const encryption = await encryptSections(note.sections, password, options)
    const updated: Note = { ...note, sections: [], encryption, updated: new Date().toISOString() }
    const raw = serializeNote(updated)
    updated.raw = raw
    await window.noteflow.writeNote(note.filePath, raw)
    set((s) => ({ notes: s.notes.map((n) => (n.id === id ? updated : n)) }))
  },

  unlockNote: async (id, password) => {
    const note = get().notes.find((n) => n.id === id)
    if (!note || !note.encryption) return
    // Throws on wrong password — caller is responsible for catching
    const sections = await decryptSections(note.encryption, password)
    // Keep encryption intact on disk; only update in-memory sections
    set((s) => ({
      notes: s.notes.map((n) => n.id === id ? { ...n, sections } : n),
      sessionPasswords: { ...s.sessionPasswords, [id]: password },
    }))
  },

  lockNote: (id) => {
    set((s) => {
      const { [id]: _, ...sessionPasswords } = s.sessionPasswords
      return {
        notes: s.notes.map((n) => n.id === id ? { ...n, sections: [] } : n),
        sessionPasswords,
      }
    })
  },

  removeNoteEncryption: async (id, password) => {
    const note = get().notes.find((n) => n.id === id)
    if (!note || !note.encryption) return
    // Throws on wrong password — caller is responsible for catching
    const sections = await decryptSections(note.encryption, password)
    const updated: Note = { ...note, sections, encryption: undefined, updated: new Date().toISOString() }
    const raw = serializeNote(updated)
    updated.raw = raw
    await window.noteflow.writeNote(note.filePath, raw)
    set((s) => {
      const { [id]: _, ...sessionPasswords } = s.sessionPasswords
      return {
        notes: s.notes.map((n) => (n.id === id ? updated : n)),
        sessionPasswords,
      }
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
