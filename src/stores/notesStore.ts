import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Note, NoteSection } from '../types'
import {
  NOTE_MD,
  parseNoteFolder,
  buildNoteWritePayload,
  noteFingerprint,
  createEmptyNote,
  noteDirname,
  extractTags,
  isDefaultNoteTitle,
  pathBasename,
} from '../lib/noteUtils'
import { encryptSections, decryptSections, type EncryptionOptions } from '../lib/cryptoUtils'
import { collectAlarms } from '../lib/alarmUtils'
import { getNoteSearchIndex } from '../lib/searchUtils'

/**
 * Serializes `next`, computes the minimal multi-file diff against `prev`
 * (note.md always; only changed section files; deletions of dropped sections)
 * and writes it through IPC. Mutates next.raw to the written note.md.
 */
async function writeNoteToDisk(prev: Note | null, next: Note): Promise<void> {
  const payload = buildNoteWritePayload(prev, next)
  next.raw = payload.files[NOTE_MD] ?? next.raw
  // The IPC handler swallows FS errors into { ok:false } rather than throwing across
  // the bridge. Surface that here so callers don't silently update memory while disk
  // keeps the old (e.g. empty) note — which would resurface on the next reload.
  const res = await window.noteflow.writeNote(payload)
  if (!res.ok) throw new Error(res.error || 'Failed to write note to disk')
}

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
  groupViewId: string | null  // when set, the main area shows the group overview instead of the editor
  noteViewId: string | null   // when set, the main area shows the single-note overview instead of the editor
  brainViewOpen: boolean      // when true, the main area shows the brain graph instead of the editor
  allViewOpen: boolean        // when true, the main area shows the "All content" index instead of the editor
  cameFromAllView: boolean    // true while a group/note overview was opened FROM the all-content view (smart back)
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

  // Last active section per note (in-memory). Survives editor remounts — e.g. when
  // the brain/group/note overview opens and the editor unmounts — so closing them
  // returns to the section the user was on instead of falling back to the first one.
  activeSectionByNote: Record<string, string>

  // Actions
  loadNotes: () => Promise<void>
  createNote: (opts?: { group?: string; folder?: string }) => Promise<Note>
  // Creates a note already populated with title/sections (and optional group/folder) in a
  // single disk write — no empty intermediate. Used by AI generation so the editor never
  // mounts a blank, date-titled note whose stale title draft could clobber the real one.
  createPopulatedNote: (data: { title: string; sections: NoteSection[]; group?: string; folder?: string; activate?: boolean }) => Promise<Note>
  createTempNote: () => Promise<Note>
  duplicateNote: (id: string) => Promise<Note>
  updateNote: (id: string, patch: Partial<Pick<Note, 'title' | 'sections' | 'tags' | 'favorited' | 'group' | 'folder'>>) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  archiveNote: (id: string) => Promise<void>
  setActiveNote: (id: string | null) => void
  /** Navigate to a specific section of a note (same note or another), closing any full-area view. */
  navigateToSection: (noteId: string, sectionId: string) => void
  setOpenNoteIds: (ids: string[]) => void
  setGroupView: (id: string | null) => void
  setNoteView: (id: string | null) => void
  setBrainView: (open: boolean) => void
  setAllView: (open: boolean) => void
  openGroupFromAll: (id: string) => void
  openNoteFromAll: (id: string) => void
  closeFullView: () => void   // smart back: returns to the all-content view if we came from it
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
  rememberActiveSection: (noteId: string, sectionId: string) => void
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
  groupViewId: null,
  noteViewId: null,
  brainViewOpen: false,
  allViewOpen: false,
  cameFromAllView: false,
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
  activeSectionByNote: {},

  loadNotes: async () => {
    set({ isLoading: true })
    try {
      const [dir, allDirs, uiState] = await Promise.all([
        window.noteflow.getNotesDir(),
        window.noteflow.readAllNotes(),
        window.noteflow.getUiState(),
      ])
      set({ notesDir: dir })

      const notes: Note[] = allDirs.map((rec) =>
        parseNoteFolder(
          rec.noteMd,
          Object.fromEntries(rec.sections.map((s) => [s.file, s.content])),
          rec.path,
        )
      )

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
      // filePath is the absolute path of the note DIRECTORY
      const rec = await window.noteflow.readNoteDir(pathBasename(filePath))
      if (!rec) {
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
      
      const incomingNote = parseNoteFolder(
        rec.noteMd,
        Object.fromEntries(rec.sections.map((s) => [s.file, s.content])),
        rec.path,
      )
      const existingNote = get().notes.find(n => n.id === incomingNote.id)

      if (!existingNote) {
        // New note created in another window
        set(s => ({ notes: [incomingNote, ...s.notes] }))
      } else {
        // Fingerprint compare (note.md + section bodies) to avoid unnecessary
        // updates. Encrypted notes compare note.md only — see noteFingerprint.
        if (noteFingerprint(existingNote) === noteFingerprint(incomingNote)) return

        set(s => ({
          notes: s.notes.map(n => n.id === incomingNote.id ? incomingNote : n)
        }))
      }
    } catch (err) {
      console.error('Failed to sync note:', err)
    }
  },

  // group/folder go in BEFORE the single disk write: assigning them afterwards with
  // updateNote() left a window where a full loadNotes() (notes-updated after a sync pull)
  // reloaded the note from disk without them and dropped the assignment.
  createNote: async (opts) => {
    const draft = createEmptyNote()
    const dir = get().notesDir
    const filePath = `${dir}/${noteDirname(draft.id, draft.title)}`
    const note: Note = {
      ...draft,
      ...(opts?.group ? { group: opts.group } : {}),
      ...(opts?.folder ? { folder: opts.folder } : {}),
      filePath,
      raw: '',
    }

    await writeNoteToDisk(null, note)
    set((s) => ({
      notes: [note, ...s.notes],
      activeNoteId: note.id,
      openNoteIds: [note.id],
      newlyCreatedNoteId: note.id,
      groupViewId: null,
      noteViewId: null,
      brainViewOpen: false,
      allViewOpen: false,
      cameFromAllView: false,
    }))
    return note
  },

  createPopulatedNote: async ({ title, sections, group, folder, activate = true }) => {
    const draft = createEmptyNote()
    const dir = get().notesDir
    const allContent = sections.map((s) => s.content).join('\n')
    const note: Note = {
      ...draft,
      title,
      sections,
      tags: extractTags(allContent),
      ...(group ? { group } : {}),
      ...(folder ? { folder } : {}),
      filePath: `${dir}/${noteDirname(draft.id, title)}`,
      raw: '',
    }

    await writeNoteToDisk(null, note)
    set((s) => ({
      notes: [note, ...s.notes],
      // Deliberately NOT setting newlyCreatedNoteId: we don't want the editor to auto-focus
      // and select the title field, which is what let a stale title draft overwrite this one.
      ...(activate
        ? { activeNoteId: note.id, openNoteIds: [note.id], groupViewId: null, noteViewId: null, brainViewOpen: false, allViewOpen: false, cameFromAllView: false }
        : {}),
    }))
    return note
  },

  createTempNote: async () => {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const draft = { ...createEmptyNote(), expiresAt }
    const dir = get().notesDir
    const filePath = `${dir}/${noteDirname(draft.id, draft.title)}`
    const note: Note = { ...draft, filePath, raw: '' }

    await writeNoteToDisk(null, note)
    set((s) => ({
      notes: [note, ...s.notes],
      activeNoteId: note.id,
      openNoteIds: [note.id],
      newlyCreatedNoteId: note.id,
      groupViewId: null,
      noteViewId: null,
      brainViewOpen: false,
      allViewOpen: false,
      cameFromAllView: false,
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
      favorited: false,
      sections: source.sections.map((s) => ({ ...s, id: nanoid(8) })),
    }
    const dir = get().notesDir
    const filePath = `${dir}/${noteDirname(draft.id, draft.title)}`
    const note: Note = { ...draft, filePath, raw: '' }
    await writeNoteToDisk(null, note)
    set((s) => ({
      notes: [note, ...s.notes],
      activeNoteId: note.id,
      openNoteIds: [note.id],
      newlyCreatedNoteId: note.id,
      groupViewId: null,
      noteViewId: null,
      brainViewOpen: false,
      allViewOpen: false,
      cameFromAllView: false,
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
        await writeNoteToDisk(note, updated)
        set((s) => ({ notes: s.notes.map((n) => (n.id === id ? updated : n)) }))
        window.noteflow.scheduleAlarms(collectAlarms(get().notes.map(n => n.id === id ? updated : n)))
        return
      }
      // Non-section patches (favorited, title) always allowed for encrypted notes
      const updated: Note = { ...note, ...patch, updated: new Date().toISOString() }
      await writeNoteToDisk(note, updated)
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

    await writeNoteToDisk(note, updated)
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
    await writeNoteToDisk(note, updated)
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
      // Selecting a note always returns to the editor (closes the group / note / brain / all views)
      if (!id) return { activeNoteId: null, groupViewId: null, noteViewId: null, brainViewOpen: false, allViewOpen: false, cameFromAllView: false }
      if (s.openNoteIds.includes(id)) return { activeNoteId: id, groupViewId: null, noteViewId: null, brainViewOpen: false, allViewOpen: false, cameFromAllView: false }
      return { activeNoteId: id, openNoteIds: [id], groupViewId: null, noteViewId: null, brainViewOpen: false, allViewOpen: false, cameFromAllView: false }
    })
    if (id) window.noteflow.setUiState({ activeNoteId: id })
  },
  navigateToSection: (noteId, sectionId) => {
    const target = get().notes.find((n) => n.id === noteId)
    if (!target || !target.sections.some((s) => s.id === sectionId)) return
    // Stash the requested section so the editor lands on it on (re)mount, then
    // re-dispatch on the next tick: when a full-area view (group/note/brain) is
    // open the editor is unmounted and only starts listening after setActiveNote
    // closes the view. Same mechanism used by the overviews and the brain.
    set({ pendingInitialSectionId: sectionId })
    get().setActiveNote(noteId)
    window.dispatchEvent(
      new CustomEvent('noteflow:request-section', { detail: { noteId, sectionId } }),
    )
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('noteflow:request-section', { detail: { noteId, sectionId } }),
      )
    }, 0)
  },
  // Group overview, note overview, brain view and all-content view are mutually exclusive
  // full-area views: opening one closes the others.
  setGroupView: (id) => set({ groupViewId: id, noteViewId: null, brainViewOpen: false, allViewOpen: false, cameFromAllView: false }),
  setNoteView: (id) => set({ noteViewId: id, groupViewId: null, brainViewOpen: false, allViewOpen: false, cameFromAllView: false }),
  setBrainView: (open) => set((s) => ({ brainViewOpen: open, groupViewId: open ? null : s.groupViewId, noteViewId: open ? null : s.noteViewId, allViewOpen: open ? false : s.allViewOpen, cameFromAllView: open ? false : s.cameFromAllView })),
  setAllView: (open) => set({ allViewOpen: open, groupViewId: null, noteViewId: null, brainViewOpen: false, cameFromAllView: false }),
  // Drill into a group/note FROM the all-content view: remember it so "back" returns to the index.
  openGroupFromAll: (id) => set({ groupViewId: id, allViewOpen: false, cameFromAllView: true, noteViewId: null, brainViewOpen: false }),
  openNoteFromAll: (id) => set({ noteViewId: id, allViewOpen: false, cameFromAllView: true, groupViewId: null, brainViewOpen: false }),
  closeFullView: () => {
    if (get().cameFromAllView) get().setAllView(true)
    else set({ groupViewId: null, noteViewId: null, brainViewOpen: false })
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

  rememberActiveSection: (noteId, sectionId) => set((s) =>
    s.activeSectionByNote[noteId] === sectionId
      ? {}
      : { activeSectionByNote: { ...s.activeSectionByNote, [noteId]: sectionId } }
  ),

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
    // buildNoteWritePayload deletes the plaintext section files on encrypt
    await writeNoteToDisk(note, updated)
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
    // Recreates the plaintext section files (prev had none — it was encrypted)
    await writeNoteToDisk(note, updated)
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
        const idx = getNoteSearchIndex(n)
        return (
          idx.title.includes(q) ||
          idx.sectionContents.some((c) => c.includes(q)) ||
          idx.sectionNames.some((s) => s.includes(q)) ||
          idx.tags.some((t) => t.includes(q))
        )
      })
      .sort((a, b) => {
        if (a.favorited !== b.favorited) return a.favorited ? -1 : 1
        return new Date(b.updated).getTime() - new Date(a.updated).getTime()
      })
  },

  getAllTags: () => {
    const all = get().notes.flatMap((n) => n.tags)
    return [...new Set(all)].sort()
  },
}))
