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
import { duplicateSectionInList, patchSectionInList } from '../lib/sectionUtils'
import { createKeyedQueue } from '../lib/keyedQueue'
import { isUnsafeEncryptedSectionsWrite, redecryptWithSession } from '../lib/encryptedSession'
import {
  type OpenPane,
  type PaneLayout,
  activeNoteOf,
  closePane as closePaneInLayout,
  focusOrReplace,
  getActivePane,
  openInSplit,
  panesForNoteIds,
  removeNotesFromLayout,
  reorderPane as reorderPaneInLayout,
  setPaneSection as setPaneSectionInLayout,
  singlePane,
} from '../lib/paneUtils'

export type { OpenPane } from '../lib/paneUtils'

/**
 * Which kind of window this renderer is. The main window owns the singleton work
 * (alarm scheduling on load, persisted UI state, pruning empty notes); a section window
 * (`#section-window`, see SectionWindowApp) is just another editor of the same notes and
 * must not touch any of it. Stickies keep their historical behavior. Set once, before
 * the first render, by App.
 */
export type WindowRole = 'main' | 'sticky' | 'section'
let windowRole: WindowRole = 'main'
export function setWindowRole(role: WindowRole): void { windowRole = role }
export function getWindowRole(): WindowRole { return windowRole }

/** Persists the main window's UI state (active note/section). No-op in secondary windows. */
export function saveUiState(patch: { activeNoteId?: string; activeSectionId?: string }): void {
  if (windowRole === 'section') return
  void window.noteflow.setUiState(patch)
}

// Every write of a note goes through this queue (keyed by note id) — see keyedQueue.ts.
const noteWriteQueue = createKeyedQueue()

const newPaneId = () => nanoid(8)

/** Store slice for a pane layout: the layout plus the derived activeNoteId. */
function layoutState(layout: PaneLayout): Pick<NotesState, 'openPanes' | 'activePaneId' | 'activeNoteId'> {
  return { openPanes: layout.panes, activePaneId: layout.activePaneId, activeNoteId: activeNoteOf(layout) }
}

function layoutOf(s: NotesState): PaneLayout {
  return { panes: s.openPanes, activePaneId: s.activePaneId }
}

function isPrunable(note: Note): boolean {
  return isDefaultNoteTitle(note.title) && note.sections.every((s) => !s.content.trim())
}

const alarmSignature = (note: Note) => JSON.stringify(collectAlarms([note]))

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
  activeNoteId: string | null   // = note of the active pane (kept in sync by every layout change)
  openPanes: OpenPane[]          // split view: one entry per editor pane (same note may repeat)
  activePaneId: string | null
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
  /**
   * Rewrites a note's sections from the LATEST store state (queued after any in-flight
   * write of the note). `fn` returns the new list, or null for "nothing to do". Use it
   * for structural edits (add/delete/reorder) instead of updateNote({sections}) built
   * from a render snapshot, which could drop another editor's concurrent edit.
   */
  mutateSections: (noteId: string, fn: (sections: NoteSection[]) => NoteSection[] | null) => Promise<void>
  /** Patches ONE section (content, name, isRawMode, aiHidden…) on the latest state. No-op if it was deleted. */
  updateSection: (noteId: string, sectionId: string, patch: Partial<Omit<NoteSection, 'id'>>) => Promise<void>
  /** Copies a section (new id, given name) right after the original. Null if missing or the note is locked. */
  duplicateSection: (noteId: string, sectionId: string, name: string) => Promise<NoteSection | null>
  deleteNote: (id: string) => Promise<void>
  archiveNote: (id: string) => Promise<void>
  makeNotePermanent: (id: string) => Promise<void>   // drops expiresAt from a temporary note
  setActiveNote: (id: string | null) => void
  /** Navigate to a specific section of a note (same note or another), closing any full-area view. */
  navigateToSection: (noteId: string, sectionId: string) => void
  /** Legacy: one pane per note id (existing panes reused). `[id]` = show only that note. */
  setOpenNoteIds: (ids: string[]) => void
  setGroupView: (id: string | null) => void
  setNoteView: (id: string | null) => void
  setBrainView: (open: boolean) => void
  setAllView: (open: boolean) => void
  openGroupFromAll: (id: string) => void
  openNoteFromAll: (id: string) => void
  closeFullView: () => void   // smart back: returns to the all-content view if we came from it
  /** Opens a note — or one of its sections, in a pane of its own — alongside the current panes. */
  openNoteInSplit: (id: string, sectionId?: string) => void
  closePane: (paneId: string) => void
  focusPane: (paneId: string) => void
  reorderPane: (paneId: string, targetIndex: number) => void
  /** Records the section a pane is on (NoteEditor calls it on every section change). */
  setPaneSection: (paneId: string, sectionId: string) => void
  setSearchQuery: (q: string) => void
  setFilterSection: (s: string) => void
  setFilterDate: (f: 'all' | 'today' | 'week' | 'month') => void
  setFilterTag: (tag: string | null) => void
  setShowArchived: (v: boolean) => void
  clearFilters: () => void
  setCommandPaletteOpen: (v: boolean) => void
  setNewlyCreatedNoteId: (id: string | null) => void
  rememberActiveSection: (noteId: string, sectionId: string) => void
  /** Re-reads one note folder from disk. `retried` is internal (one retry after a race with a local write). */
  syncNote: (filePath: string, retried?: boolean) => Promise<void>
  pruneEmptyNote: (id: string) => Promise<void>
  encryptNote: (id: string, password: string, options?: EncryptionOptions) => Promise<void>
  unlockNote: (id: string, password: string) => Promise<void>   // temporary in-session unlock
  lockNote: (id: string) => void                                 // re-lock without removing encryption
  removeNoteEncryption: (id: string, password: string) => Promise<void>  // permanent decrypt

  // Derived helpers
  getActiveNote: () => Note | null
  /** Note + section of the active pane (falls back to the remembered / first section). */
  getActiveSectionTarget: () => { noteId: string; sectionId: string } | null
  getFilteredNotes: () => Note[]
  getAllTags: () => string[]
}

type StoreGet = () => NotesState
type StoreSet = (fn: (s: NotesState) => Partial<NotesState>) => void
type NotePatch = Parameters<NotesState['updateNote']>[1]

/**
 * The actual note write (NOT queued — always call it through noteWriteQueue). Reads the
 * note from the store at call time, so inside the queue it starts from the result of
 * the previous write.
 */
async function applyNoteUpdate(get: StoreGet, set: StoreSet, id: string, patch: NotePatch): Promise<void> {
  const note = get().notes.find((n) => n.id === id)
  if (!note) return

  let updated: Note
  let alarmsMayChange = true
  if (note.encryption) {
    if (patch.sections !== undefined) {
      // Section edits only allowed when session-unlocked
      const password = get().sessionPasswords[id]
      if (!password) return
      // The blob is rebuilt from patch.sections alone: without the decrypted sections in
      // memory this would wipe every section the patch doesn't carry.
      if (isUnsafeEncryptedSectionsWrite(note, patch.sections)) {
        console.warn('[notes] Refusing to write encrypted note without decrypted sections:', id)
        return
      }
      const newSections = patch.sections
      const allContent = newSections.map((s: NoteSection) => s.content).join('\n')
      const tags = extractTags(allContent)
      const encryption = await encryptSections(newSections, password)
      updated = {
        ...note, ...patch, sections: newSections, tags, encryption,
        updated: new Date().toISOString(),
      }
    } else {
      // Non-section patches (favorited, title) always allowed for encrypted notes
      updated = { ...note, ...patch, updated: new Date().toISOString() }
      alarmsMayChange = false
    }
  } else {
    const newSections = patch.sections ?? note.sections
    const allContent = newSections.map((s: NoteSection) => s.content).join('\n')
    // Tags are derived purely from current content — this ensures deleted #tags
    // are removed automatically. Manual patch.tags are ignored for auto-tags.
    const tags = extractTags(allContent)
    updated = {
      ...note,
      ...patch,
      sections: newSections,
      tags,
      updated: new Date().toISOString(),
    }
  }

  await writeNoteToDisk(note, updated)
  // While the write was in flight the note may have been replaced in the store by a
  // syncNote (another window — a section window or sticky — wrote ANOTHER section of
  // it). Our `updated` was built from the older copy and would hide that change in
  // memory. The disk holds both (sections are separate files), so re-read it.
  let raced = false
  set((s) => {
    const current = s.notes.find((n) => n.id === id)
    raced = current !== undefined && current !== note
    return { notes: s.notes.map((n) => (n.id === id ? updated : n)) }
  })
  if (alarmsMayChange && windowRole !== 'section') {
    window.noteflow.scheduleAlarms(collectAlarms(get().notes))
  }
  // (Safe for unlocked encrypted notes too: syncNote re-decrypts with the session password.)
  if (raced) void get().syncNote(updated.filePath)
}

/** Relocks notes whose session unlock no longer applies (their decryption failed). */
function dropSessionPasswords(set: StoreSet, ids: string[]): void {
  console.warn('[notes] Could not re-decrypt unlocked note(s), locking them again:', ids)
  set((s) => ({
    sessionPasswords: Object.fromEntries(Object.entries(s.sessionPasswords).filter(([id]) => !ids.includes(id))),
  }))
}

/** Leaving `noteId`: delete it if it's still a blank default note (main window only). */
function maybePruneOnLeave(get: StoreGet, noteId: string): void {
  if (windowRole === 'section') return
  const note = get().notes.find((n) => n.id === noteId)
  if (note && isPrunable(note)) void get().pruneEmptyNote(noteId)
}

export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],
  activeNoteId: null,
  openPanes: [],
  activePaneId: null,
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

      const parsed: Note[] = allDirs.map((rec) =>
        parseNoteFolder(
          rec.noteMd,
          Object.fromEntries(rec.sections.map((s) => [s.file, s.content])),
          rec.path,
        )
      )
      // Encrypted notes unlocked in this session come back from disk locked (sections: []):
      // decrypt them again, or relock the ones that no longer decrypt (see encryptedSession.ts).
      const { notes, failed } = await redecryptWithSession(parsed, get().sessionPasswords, decryptSections)
      if (failed.length > 0) dropSessionPasswords(set, failed)

      // Safety guard: if we got 0 notes but already had notes in memory, this is
      // likely a transient FS issue (e.g. Windows returning an empty dir on OS
      // wake from sleep). Don't wipe in-memory notes — they're still on disk.
      if (notes.length === 0 && get().notes.length > 0) {
        set({ isLoading: false })
        return
      }

      // A section window owns its single pane (SectionWindowApp sets it); it never takes
      // the main window's persisted active note nor schedules alarms.
      if (windowRole === 'section') {
        set({ notes, isLoading: false })
        return
      }

      const existingIds = new Set(notes.map((n) => n.id))
      const current = layoutOf(get())
      if (current.panes.length > 0) {
        // Full reload (sync pull, another window…) with panes already open: keep the
        // layout — collapsing the split here would remount every editor — and only drop
        // panes whose note is gone.
        const removed = new Set(current.panes.map((p) => p.noteId).filter((id) => !existingIds.has(id)))
        const fallback = notes.find((n) => !n.archived)?.id ?? notes[0]?.id ?? null
        const layout = removed.size > 0 ? removeNotesFromLayout(current, removed, fallback, newPaneId()) : current
        set({ notes, isLoading: false, ...layoutState(layout) })
      } else {
        const savedNoteId = uiState.activeNoteId
        const activeNoteId = (savedNoteId && existingIds.has(savedNoteId))
          ? savedNoteId
          : notes[0]?.id ?? null
        const paneId = newPaneId()
        const panes: OpenPane[] = activeNoteId
          ? [{ paneId, noteId: activeNoteId, ...(uiState.activeSectionId ? { sectionId: uiState.activeSectionId } : {}) }]
          : []

        set({
          notes,
          isLoading: false,
          ...layoutState({ panes, activePaneId: activeNoteId ? paneId : null }),
          pendingInitialSectionId: uiState.activeSectionId ?? null,
        })
      }

      // Register alarms with main process after notes are loaded
      window.noteflow.scheduleAlarms(collectAlarms(notes))
    } catch (err) {
      console.error('Failed to load notes:', err)
      set({ isLoading: false })
    }
  },
  
  syncNote: async (filePath: string, retried = false) => {
    try {
      // Store snapshot BEFORE the disk read: if a local write of this note lands while we
      // read (or decrypt, PBKDF2 can take hundreds of ms), our copy may predate it and must
      // not replace it. Then re-read once — local writes reach the disk before the store.
      const notesBeforeRead = get().notes
      const retryOrSkip = () => (retried ? undefined : get().syncNote(filePath, true))
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
          // A section window never falls back to another note: its pane just empties
          // and it shows the "note not found" state.
          const fallback = windowRole === 'section'
            ? null
            : remaining.find((n) => !n.archived)?.id ?? remaining[0]?.id ?? null
          const layout = removeNotesFromLayout(layoutOf(s), removedSet, fallback, newPaneId())

          const nextSessionPasswords = Object.fromEntries(
            Object.entries(s.sessionPasswords).filter(([noteId]) => !removedSet.has(noteId))
          )

          return {
            notes: remaining,
            ...layoutState(layout),
            sessionPasswords: nextSessionPasswords,
          }
        })
        return
      }
      
      const parsedNote = parseNoteFolder(
        rec.noteMd,
        Object.fromEntries(rec.sections.map((s) => [s.file, s.content])),
        rec.path,
      )
      const existingNote = get().notes.find(n => n.id === parsedNote.id)
      if (existingNote !== notesBeforeRead.find(n => n.id === parsedNote.id)) return await retryOrSkip()
      let incomingNote = parsedNote

      if (!existingNote) {
        // New note created in another window
        set(s => ({ notes: [incomingNote, ...s.notes] }))
      } else {
        // Fingerprint compare (note.md + section bodies) to avoid unnecessary
        // updates. Encrypted notes compare note.md only — see noteFingerprint.
        if (noteFingerprint(existingNote) === noteFingerprint(parsedNote)) return

        // Unlocked in this session → keep it unlocked with the NEW content (the parse
        // is locked, sections: []); relock if it no longer decrypts.
        const { notes: [decrypted], failed } = await redecryptWithSession([parsedNote], get().sessionPasswords, decryptSections)
        if (failed.length > 0) dropSessionPasswords(set, failed)
        incomingNote = decrypted

        // Same guard after the decrypt await: only replace the copy we compared against.
        let stale = false
        set(s => {
          stale = s.notes.find(n => n.id === incomingNote.id) !== existingNote
          return stale ? {} : { notes: s.notes.map(n => n.id === incomingNote.id ? incomingNote : n) }
        })
        if (stale) return await retryOrSkip()
      }

      // The main window owns alarm scheduling. Section windows never schedule, so when a
      // note edited elsewhere gains/loses a deadline, re-register the full set from here
      // (only when that note's alarms actually changed — this runs on every remote write).
      if (windowRole === 'main' && (!existingNote || alarmSignature(existingNote) !== alarmSignature(incomingNote))) {
        window.noteflow.scheduleAlarms(collectAlarms(get().notes))
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
      ...layoutState(singlePane(layoutOf(s), note.id, newPaneId())),
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
        ? { ...layoutState(singlePane(layoutOf(s), note.id, newPaneId())), groupViewId: null, noteViewId: null, brainViewOpen: false, allViewOpen: false, cameFromAllView: false }
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
      ...layoutState(singlePane(layoutOf(s), note.id, newPaneId())),
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
      // Same group/folder as the original, in the single write (see createNote)
      ...(source.group ? { group: source.group } : {}),
      ...(source.folder ? { folder: source.folder } : {}),
      sections: source.sections.map((s) => ({ ...s, id: nanoid(8) })),
    }
    const dir = get().notesDir
    const filePath = `${dir}/${noteDirname(draft.id, draft.title)}`
    const note: Note = { ...draft, filePath, raw: '' }
    await writeNoteToDisk(null, note)
    set((s) => ({
      notes: [note, ...s.notes],
      ...layoutState(singlePane(layoutOf(s), note.id, newPaneId())),
      newlyCreatedNoteId: note.id,
      groupViewId: null,
      noteViewId: null,
      brainViewOpen: false,
      allViewOpen: false,
      cameFromAllView: false,
    }))
    return note
  },

  updateNote: (id, patch) => noteWriteQueue.run(id, () => applyNoteUpdate(get, set, id, patch)),

  mutateSections: (noteId, fn) => noteWriteQueue.run(noteId, async () => {
    const note = get().notes.find((n) => n.id === noteId)
    if (!note) return
    // A locked note has no decrypted sections to rewrite.
    if (note.encryption && !get().sessionPasswords[noteId]) return
    if (note.encryption && note.sections.length === 0) {
      console.warn('[notes] Refusing to edit sections of an encrypted note that is not decrypted:', noteId)
      return
    }
    const next = fn(note.sections)
    if (!next) return
    await applyNoteUpdate(get, set, noteId, { sections: next })
  }),

  updateSection: (noteId, sectionId, patch) =>
    get().mutateSections(noteId, (sections) => patchSectionInList(sections, sectionId, patch)),

  // Persists through the same queued write as updateNote, so encryption, tags and the
  // v2 per-section file diff (one new <id>.md + note.md for the order) are handled in
  // one place — and the copy is taken from the latest state, not a stale snapshot.
  duplicateSection: async (noteId, sectionId, name) => {
    let created: NoteSection | null = null
    await get().mutateSections(noteId, (sections) => {
      const result = duplicateSectionInList(sections, sectionId, { id: nanoid(8), name })
      if (!result) return null
      created = result.section
      return result.sections
    })
    return created
  },

  deleteNote: async (id) => {
    const note = get().notes.find((n) => n.id === id)
    if (!note) return

    await window.noteflow.deleteNote(note.filePath)

    set((s) => {
      const remaining = s.notes.filter((n) => n.id !== id)
      const fallback = windowRole === 'section'
        ? null
        : remaining.find((n) => !n.archived)?.id ?? remaining[0]?.id ?? null
      const { [id]: _, ...sessionPasswords } = s.sessionPasswords
      // Other panes stay open; only when none is left does the fallback note take over.
      const layout = removeNotesFromLayout(layoutOf(s), new Set([id]), fallback, newPaneId())
      return {
        notes: remaining,
        ...layoutState(layout),
        sessionPasswords,
      }
    })
  },

  archiveNote: (id) => noteWriteQueue.run(id, async () => {
    const note = get().notes.find((n) => n.id === id)
    if (!note) return

    const updated: Note = { ...note, archived: !note.archived, updated: new Date().toISOString() }
    await writeNoteToDisk(note, updated)
    set((s) => ({ notes: s.notes.map((n) => (n.id === id ? updated : n)) }))
  }),

  // Turns a temporary note into a regular one. The key is destructured OUT (not set to
  // undefined) so no later `{ ...note }` spread can carry it back; the serializers omit a
  // missing expiresAt, so note.md loses the line main's checkExpiredNotes() matches on.
  // Metadata-only write: works for encrypted notes too, even while locked. Bumping
  // `updated` makes this version win the per-folder conflict on the next sync pull.
  makeNotePermanent: (id) => noteWriteQueue.run(id, async () => {
    const note = get().notes.find((n) => n.id === id)
    if (!note?.expiresAt) return

    const { expiresAt: _expiresAt, ...rest } = note
    const updated: Note = { ...rest, updated: new Date().toISOString() }
    await writeNoteToDisk(note, updated)
    set((s) => ({ notes: s.notes.map((n) => (n.id === id ? updated : n)) }))
  }),

  setActiveNote: (id) => {
    // Before switching, auto-delete the current note if it's completely empty
    const prev = get().activeNoteId
    if (prev && prev !== id) maybePruneOnLeave(get, prev)
    set((s) => {
      // Selecting a note always returns to the editor (closes the group / note / brain / all views)
      const closeViews = { groupViewId: null, noteViewId: null, brainViewOpen: false, allViewOpen: false, cameFromAllView: false }
      if (!id) return { activeNoteId: null, ...closeViews }
      // Already in a pane → focus it (split kept); otherwise collapse to a single pane.
      return { ...layoutState(focusOrReplace(layoutOf(s), id, newPaneId())), ...closeViews }
    })
    if (id) saveUiState({ activeNoteId: id })
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
          ? layoutState(singlePane(layoutOf(s), fallbackId, newPaneId()))
          : layoutState({ panes: [], activePaneId: null })
      }
      return layoutState(panesForNoteIds(layoutOf(s), unique, newPaneId))
    })
  },
  openNoteInSplit: (id, sectionId) => {
    const target = get().notes.find((n) => n.id === id)
    if (!target) return
    const section = sectionId && target.sections.some((s) => s.id === sectionId) ? sectionId : undefined
    set((s) => ({
      ...layoutState(openInSplit(layoutOf(s), id, section, newPaneId())),
      // The new pane must be visible: leave any full-area view.
      groupViewId: null, noteViewId: null, brainViewOpen: false, allViewOpen: false, cameFromAllView: false,
    }))
    saveUiState({ activeNoteId: id, ...(section ? { activeSectionId: section } : {}) })
  },
  closePane: (paneId) => {
    set((s) => {
      const layout = closePaneInLayout(layoutOf(s), paneId)
      if (layout.panes.length > 0) return layoutState(layout)
      const closedNoteId = s.openPanes.find((p) => p.paneId === paneId)?.noteId
      const fallbackId =
        s.notes.find((n) => n.id !== closedNoteId && !n.archived)?.id ??
        s.notes.find((n) => n.id !== closedNoteId)?.id ??
        null
      return fallbackId
        ? layoutState(singlePane(layout, fallbackId, newPaneId()))
        : layoutState(layout)
    })
  },
  focusPane: (paneId) => {
    const s = get()
    const pane = s.openPanes.find((p) => p.paneId === paneId)
    if (!pane || s.activePaneId === paneId) return
    const prev = s.activeNoteId
    if (prev && prev !== pane.noteId) maybePruneOnLeave(get, prev)
    set((st) => layoutState({ panes: st.openPanes, activePaneId: paneId }))
    saveUiState({ activeNoteId: pane.noteId })
  },
  reorderPane: (paneId, targetIndex) => {
    set((s) => {
      const panes = reorderPaneInLayout(s.openPanes, paneId, targetIndex)
      return panes === s.openPanes ? {} : { openPanes: panes }
    })
  },
  setPaneSection: (paneId, sectionId) => {
    set((s) => {
      const layout = setPaneSectionInLayout(layoutOf(s), paneId, sectionId)
      return layout.panes === s.openPanes ? {} : { openPanes: layout.panes }
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
    if (windowRole === 'section') return  // the main window owns pruning
    const note = get().notes.find((n) => n.id === id)
    if (!note) return
    if (note.encryption) return  // never auto-delete encrypted notes
    if (!isPrunable(note)) return
    try { await window.noteflow.deleteNote(note.filePath) } catch { /* ignore */ }
    set((s) => {
      const remaining = s.notes.filter((n) => n.id !== id)
      const fallback = remaining.find((n) => !n.archived)?.id ?? remaining[0]?.id ?? null
      return {
        notes: remaining,
        ...layoutState(removeNotesFromLayout(layoutOf(s), new Set([id]), fallback, newPaneId())),
      }
    })
  },

  encryptNote: (id, password, options) => noteWriteQueue.run(id, async () => {
    const note = get().notes.find((n) => n.id === id)
    if (!note || note.encryption) return
    const encryption = await encryptSections(note.sections, password, options)
    const updated: Note = { ...note, sections: [], encryption, updated: new Date().toISOString() }
    // buildNoteWritePayload deletes the plaintext section files on encrypt
    await writeNoteToDisk(note, updated)
    set((s) => ({ notes: s.notes.map((n) => (n.id === id ? updated : n)) }))
  }),

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

  getActiveSectionTarget: () => {
    const s = get()
    const pane = getActivePane(layoutOf(s))
    const noteId = pane?.noteId ?? s.activeNoteId
    const note = noteId ? s.notes.find((n) => n.id === noteId) : undefined
    if (!note) return null
    const candidates = [pane?.sectionId, s.activeSectionByNote[note.id], note.sections[0]?.id]
    const sectionId = candidates.find((id) => id && note.sections.some((sec) => sec.id === id))
    return sectionId ? { noteId: note.id, sectionId } : null
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
