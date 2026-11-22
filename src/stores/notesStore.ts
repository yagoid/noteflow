import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { LinkedErrorCode, LinkedMetaPatch, LinkedNoteState, LinkedNoteWire, LinkError, Note, NoteSection, NotesArchivedEvent } from '../types'
import {
  findLinkedNoteByPath,
  inlineLinkedImages,
  isLinkedDirty,
  isLinkedNote,
  isPlainTextLinked,
  linkedDraftOf,
  linkedNoteFromWire,
  linkedTagsOf,
  mergeLinkedWire,
  plainTextAsCodeBlock,
  LINKED_SECTION_ID,
} from '../lib/linkedNotes'
import { getLinkedNormalizer, preserveUnchangedBlocks, withBlankEdges } from '../lib/linkedMarkdown'
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
import { duplicateSectionInList, patchSectionInList, stampSectionEdits } from '../lib/sectionUtils'
import { clearAgentMarkersInContent } from '../lib/agentTasks'
import { createKeyedQueue } from '../lib/keyedQueue'
import { discardPendingEdits, flushPendingEdits, hasPendingEdits } from '../lib/pendingEdits'
import { withoutArchivedNotes } from '../lib/archivedNotes'
import { hoursFromNow, TEMP_NOTE_DEFAULT_HOURS } from '../lib/dateUtils'
import { isUnsafeEncryptedSectionsWrite, rebaseNotePatch, redecryptWithSession, relockNotes, sameEncryptionBlob } from '../lib/encryptedSession'
import { keepNotesChangedDuringLoad } from '../lib/reloadGuard'
import type { ContentPlace } from '../lib/contentView'
import {
  type OpenPane,
  type PaneLayout,
  activeNoteOf,
  closePane as closePaneInLayout,
  focusOrReplace,
  getActivePane,
  openInActivePane,
  openInSplit,
  primaryPaneForNote,
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

/**
 * Runs every pending debounced editor save (lib/pendingEdits) and waits until all
 * queued note writes have reached main. For windows about to close. With `noteId`,
 * only that note's saves and writes (the version history, before a snapshot).
 */
export async function settleNoteWrites(noteId?: string): Promise<void> {
  flushPendingEdits(noteId)
  if (noteId === undefined) await noteWriteQueue.idle()
  else await noteWriteQueue.idleKey(noteId)
}

/**
 * Close button of a secondary (section / sticky) window: main destroys the window on
 * `window:close`, so the last keystrokes still waiting on an editor debounce are saved
 * first. Bounded wait, so a stuck write can't leave the window impossible to close.
 */
export async function closeWindowAfterSaving(): Promise<void> {
  await Promise.race([
    settleNoteWrites().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ])
  window.noteflow.close()
}

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

/** Alarms of every note — linked notes are plain Markdown: their 📅⏰ are text, never alarms. */
const alarmsOf = (notes: Note[]) => collectAlarms(notes.filter((n) => !n.linked))

/**
 * Serializes `next`, computes the minimal multi-file diff against `prev`
 * (note.md always; only changed section files; deletions of dropped sections)
 * and writes it through IPC. Mutates next.raw to the written note.md.
 */
/**
 * `expectNoteMd`: conditional write — main writes nothing and this returns 'changed' when
 * note.md on disk is no longer that one (see writeEncryptedUpdate).
 */
async function writeNoteToDisk(prev: Note | null, next: Note, expectNoteMd?: string): Promise<'written' | 'changed'> {
  const payload = buildNoteWritePayload(prev, next)
  if (expectNoteMd !== undefined) payload.expectNoteMd = expectNoteMd
  next.raw = payload.files[NOTE_MD] ?? next.raw
  // The IPC handler swallows FS errors into { ok:false } rather than throwing across
  // the bridge. Surface that here so callers don't silently update memory while disk
  // keeps the old (e.g. empty) note — which would resurface on the next reload.
  const res = await window.noteflow.writeNote(payload)
  if (!res.ok && res.changed && expectNoteMd !== undefined) return 'changed'
  if (!res.ok) throw new Error(res.error || 'Failed to write note to disk')
  return 'written'
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
  contentPlace: ContentPlace | null  // when set, the main area shows the content view on that place (lib/contentView.ts)
  noteViewId: string | null   // when set, the main area shows the single-note overview instead of the editor
  brainViewOpen: boolean      // when true, the main area shows the brain graph instead of the editor
  contentReturnPlace: ContentPlace | null  // place of the content view a note overview was opened from (smart back)
  notesDir: string

  // UI state
  searchQuery: string
  filterSection: string  // section name filter, or 'all'
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
  // the brain view, content view or note overview opens and the editor unmounts — so closing them
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
  /**
   * Copies a section (new id, given name) right after the original — with `content` instead of
   * the original's when given (a restored version). Null if missing or the note is locked.
   */
  duplicateSection: (noteId: string, sectionId: string, name: string, content?: string) => Promise<NoteSection | null>
  deleteNote: (id: string) => Promise<void>
  archiveNote: (id: string) => Promise<void>
  makeNotePermanent: (id: string) => Promise<void>   // drops expiresAt from a temporary note
  /** Reschedules a temporary note's auto-delete to `hours` from now. No-op on permanent notes. */
  setNoteExpiry: (id: string, hours: number) => Promise<void>
  setActiveNote: (id: string | null) => void
  /** Navigate to a specific section of a note (same note or another), closing any full-area view. */
  navigateToSection: (noteId: string, sectionId: string) => void
  /** Legacy: one pane per note id (existing panes reused). `[id]` = show only that note. */
  setOpenNoteIds: (ids: string[]) => void
  /** Opens the content view on `place` (or changes its place while open); null closes it. */
  setContentView: (place: ContentPlace | null) => void
  /** Opens the note overview; opened from the content view, its "back" returns there. */
  setNoteView: (id: string | null) => void
  setBrainView: (open: boolean) => void
  closeFullView: () => void   // smart back: returns to the content view (same place) if we came from it
  /** Opens a note — or one of its sections, in a pane of its own — alongside the current panes. */
  openNoteInSplit: (id: string, sectionId?: string) => void
  /**
   * Shows a note (on `sectionId` when given) IN the active pane, keeping the other panes of a
   * split; a pane already showing the note is focused instead. Closes any full-area view.
   * Back / forward navigation (stores/navHistoryStore.ts).
   */
  openNoteInActivePane: (id: string, sectionId?: string) => void
  closePane: (paneId: string) => void
  focusPane: (paneId: string) => void
  reorderPane: (paneId: string, targetIndex: number) => void
  /** Records the section a pane is on (NoteEditor calls it on every section change). */
  setPaneSection: (paneId: string, sectionId: string) => void
  setSearchQuery: (q: string) => void
  setFilterSection: (s: string) => void
  setFilterTag: (tag: string | null) => void
  setShowArchived: (v: boolean) => void
  clearFilters: () => void
  setCommandPaletteOpen: (v: boolean) => void
  setNewlyCreatedNoteId: (id: string | null) => void
  rememberActiveSection: (noteId: string, sectionId: string) => void
  /** Re-reads one note folder from disk. `retried` is internal (one retry after a race with a local write). */
  syncNote: (filePath: string, retried?: boolean) => Promise<void>
  // Main moved these notes to the local archive ("use only the notes from …"): they leave
  // the store and its panes. Memory only — never a delete on disk or on the remote.
  removeArchivedNotes: (event: NotesArchivedEvent) => void

  // ── Linked notes (external .md files edited in place — lib/linkedNotes.ts) ──
  /** Re-reads main's view of a linked note (by id or file path): metadata, status and — unless
   *  the note has edits of its own not on disk (then: conflict) — the file content. */
  syncLinkedNote: (idOrPath: string) => Promise<void>
  /** Links .md files (already linked ones are reused) and opens the first one. */
  linkFiles: (paths: string[]) => Promise<{ opened: Note | null; linked: number; errors: Array<{ path: string; error: LinkError }> }>
  /** Points a linked note at another file (keeps title, group, favorite…). */
  relocateLinkedNote: (id: string, newPath: string) => Promise<{ ok: boolean; error?: LinkError | 'notLinked' }>
  /** Removes a linked note from NoteFlow. The file is never touched. */
  unlinkNote: (id: string) => Promise<void>
  /** Drops a linked note's unwritten changes (no conflict): back to the file's last known content. */
  discardLinkedChanges: (id: string) => Promise<void>
  /** Ends a conflict: take the disk version, write ours over it, or write a merged text. */
  resolveLinkedConflict: (id: string, resolution: { kind: 'reload' } | { kind: 'keepMine' } | { kind: 'merged'; body: string }) => Promise<void>
  /** Opens notes main linked from the OS ("Open with NoteFlow"): the first in the active pane, a few more alongside. */
  openNotesFromSystem: (ids: string[]) => Promise<void>
  /** "Keep in NoteFlow": a transient linked note (opened from the OS) becomes permanent. No-op otherwise. */
  keepLinkedNote: (id: string) => Promise<void>
  /** The main window closed a transient linked note: unlink it if nothing is unsaved (main has the last word). */
  discardTransientNote: (id: string) => Promise<boolean>
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

/** Encrypted note built from `base` + `patch` (re-encrypted when the patch has sections), or null if not allowed. */
async function buildEncryptedUpdate(base: Note, patch: NotePatch, password: string | undefined): Promise<Note | null> {
  if (patch.sections === undefined) {
    // Non-section patches (favorited, title) always allowed for encrypted notes
    return { ...base, ...patch, updated: new Date().toISOString() }
  }
  // Section edits only allowed when session-unlocked
  if (!password) return null
  // The blob is rebuilt from patch.sections alone: without the decrypted sections in
  // memory this would wipe every section the patch doesn't carry.
  if (isUnsafeEncryptedSectionsWrite(base, patch.sections)) {
    console.warn('[notes] Refusing to write encrypted note without decrypted sections:', base.id)
    return null
  }
  const newSections = patch.sections
  const tags = extractTags(newSections.map((s: NoteSection) => s.content).join('\n'))
  const encryption = await encryptSections(newSections, password)
  return { ...base, ...patch, sections: newSections, tags, encryption, updated: new Date().toISOString() }
}

/** Tries of a conditional encrypted write before writing anyway (see writeEncryptedUpdate). */
export const ENCRYPTED_WRITE_TRIES = 3

/**
 * Writes an edit of an encrypted note made from the store copy `note`, without losing a
 * version of note.md that reached the disk since that copy was read (lib/encryptedSession:
 * a pull lands during the PBKDF2 of the save, or before the reload's decrypt finished).
 * The write is conditional on note.md still being `note.raw`; when main refuses it, the
 * edit is rebased on the disk version — the metadata the edit didn't change come from the
 * disk, the sections are merged three-way — and written again. After ENCRYPTED_WRITE_TRIES
 * refusals (note.md rewritten over and over) the last rebase is written unconditionally.
 * Null = nothing written: not allowed, or the disk version can't take this edit — no longer
 * encrypted (an editor merges its edit into it once the store is re-synced), or encrypted
 * with another password (re-encrypting with ours would undo that change and drop the other
 * device's content: the note is re-synced, and locks).
 */
async function writeEncryptedUpdate(get: StoreGet, note: Note, patch: NotePatch): Promise<{ updated: Note; rebased: boolean } | null> {
  let base = note
  let edit = patch
  for (let attempt = 1; ; attempt++) {
    const password = get().sessionPasswords[note.id]
    const updated = await buildEncryptedUpdate(base, edit, password)
    if (!updated) return null
    const expect = attempt < ENCRYPTED_WRITE_TRIES ? base.raw : undefined
    if (await writeNoteToDisk(base, updated, expect) === 'written') return { updated, rebased: base !== note }
    const fresh = await readEncryptedFromDisk(base, password)
    if (fresh === 'gone' || fresh === 'otherPassword') {
      if (fresh === 'otherPassword') console.warn('[notes] Encrypted note re-encrypted on disk with another password; edit not written:', note.id)
      void get().syncNote(note.filePath)
      return null
    }
    if (!fresh) {
      // Gone from disk (or another note there): written as before — the edit recreates it.
      console.warn('[notes] Encrypted note changed on disk and cannot be rebased; writing over it:', note.id)
      await writeNoteToDisk(base, updated)
      return { updated, rebased: base !== note }
    }
    edit = rebaseNotePatch(base, edit, fresh)
    base = fresh
  }
}

/**
 * The encrypted note now on disk, decrypted with the session password (unless its
 * ciphertext is still `base`'s). 'gone' = it's there but no longer encrypted;
 * 'otherPassword' = the session password no longer decrypts it; null = it can't be read,
 * or it's another note.
 */
async function readEncryptedFromDisk(base: Note, password: string | undefined): Promise<Note | 'gone' | 'otherPassword' | null> {
  const rec = await window.noteflow.readNoteDir(pathBasename(base.filePath))
  if (!rec) return null
  const disk = parseNoteFolder(rec.noteMd, Object.fromEntries(rec.sections.map((s) => [s.file, s.content])), rec.path)
  if (disk.id !== base.id) return null
  if (!disk.encryption) return 'gone'
  if (sameEncryptionBlob(disk.encryption, base.encryption)) return { ...disk, sections: base.sections }
  if (!password) return disk // locked: no sections in memory either way
  try {
    return { ...disk, sections: await decryptSections(disk.encryption, password) }
  } catch {
    return 'otherPassword'
  }
}

/**
 * The actual note write (NOT queued — always call it through noteWriteQueue). Reads the
 * note from the store at call time, so inside the queue it starts from the result of
 * the previous write.
 */
async function applyNoteUpdate(get: StoreGet, set: StoreSet, id: string, patch: NotePatch): Promise<void> {
  const note = get().notes.find((n) => n.id === id)
  if (!note) return
  if (note.linked) return applyLinkedUpdate(get, set, id, patch)
  // Every section write of a regular note funnels through here: stamp the per-section
  // `updated` of the sections whose content or name really changed (see note-format.md).
  if (patch.sections !== undefined) {
    patch = { ...patch, sections: stampSectionEdits(note.sections, patch.sections, new Date().toISOString()) }
  }

  let updated: Note
  let alarmsMayChange = true
  if (note.encryption) {
    const written = await writeEncryptedUpdate(get, note, patch)
    if (!written) return
    updated = written.updated
    // A metadata-only edit leaves the alarms as they were — unless it was rebased on a
    // version (pulled) with other content.
    alarmsMayChange = patch.sections !== undefined || written.rebased
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
    await writeNoteToDisk(note, updated)
  }

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
  // Every user edit of an existing note (editor, sticky, section window, overviews, menus)
  // funnels through here: log it in the per-device activity log behind Settings → General's
  // chart. Sync pulls, imports, migration and temp-note expiry never come through this path.
  window.noteflow.recordActivityEdit(id)
  if (alarmsMayChange && windowRole !== 'section') {
    window.noteflow.scheduleAlarms(alarmsOf(get().notes))
  }
  // (Safe for unlocked encrypted notes too: syncNote re-decrypts with the session password.)
  if (raced) void get().syncNote(updated.filePath)
}

// ── Linked notes (an external .md edited in place — lib/linkedNotes.ts) ─────────

/** Original block text → its rendering, across saves (lib/linkedMarkdown.ts). */
const linkedBlockCache = new Map<string, string>()

/**
 * The file body to write for `content`. Text mode writes byte for byte; the rich editor's
 * serialization keeps the original source of every block whose rendering didn't change
 * (lib/linkedMarkdown.ts), so a small edit is a small diff in the user's Git history.
 */
export function linkedBodyToWrite(note: Note & { linked: LinkedNoteState }, content: string, rawMode = !!note.sections[0]?.isRawMode): string {
  const normalize = getLinkedNormalizer()
  return rawMode || isPlainTextLinked(note) || !normalize ? content : preserveUnchangedBlocks(note.linked.diskBody, content, normalize, linkedBlockCache)
}

/**
 * What "Keep my version" (and the "Mine" side of Compare…) writes over the disk version
 * `diskBody`: like a regular save, with the disk's blank edges (they don't render: no diff
 * there). A plain-text file (not Markdown) is written exactly as the note has it.
 */
export function linkedKeepMineBody(note: Note & { linked: LinkedNoteState }, content: string, diskBody: string): string {
  if (isPlainTextLinked(note)) return content
  return withBlankEdges(linkedBodyToWrite(note, content), diskBody)
}

/**
 * Writes `content` to a linked note's file (hash-checked in main) → the note's new
 * linked state: synced, in conflict, or with the status that refused the write (the
 * content then stays unsaved in the store). Null = the note is no longer linked.
 */
async function writeLinkedContent(id: string, note: Note & { linked: LinkedNoteState }, content: string, rawMode: boolean): Promise<LinkedNoteState | null> {
  const linked = note.linked
  const res = await window.noteflow.linkedWrite(id, linkedBodyToWrite(note, content, rawMode), linked.baseHash)
  if (res.ok) {
    const { error: _error, ...rest } = linked
    return { ...rest, status: 'ok', baseHash: res.hash, diskBody: res.body, syncedContent: content }
  }
  if (res.reason === 'conflict') return { ...linked, conflict: { diskBody: res.disk.body, diskHash: res.disk.hash } }
  if (res.reason === 'notLinked') return null
  console.warn('[notes] Linked note write refused:', id, res.reason, res.error ?? '')
  if (res.reason === 'missing' || res.reason === 'readonly') return { ...linked, status: res.reason }
  // The real cause for the notice (too large, unreadable…); anything else is a failed write.
  const known: LinkedErrorCode[] = ['tooLarge', 'invalidUtf8', 'binary', 'loneCr', 'unreadable']
  const error = known.includes(res.error as LinkedErrorCode) ? res.error as LinkedErrorCode : 'writeFailed'
  return { ...linked, status: 'error', error }
}

/** The fields a write result decides (what to carry over onto a note replaced meanwhile). */
function writeOutcome(linked: LinkedNoteState): Pick<LinkedNoteState, 'status' | 'error' | 'baseHash' | 'diskBody' | 'syncedContent' | 'conflict'> {
  return { status: linked.status, error: linked.error, baseHash: linked.baseHash, diskBody: linked.diskBody, syncedContent: linked.syncedContent, conflict: linked.conflict }
}

// Last draft this window handed to main per linked note (JSON), to only send changes.
const sentLinkedDrafts = new Map<string, string>()

/**
 * Keeps main's userData draft in step with a linked note: its unwritten content while
 * it's dirty or in conflict, nothing once it's in sync (main also drops it on every
 * successful write). Survives restarts; never written to the .md by itself.
 */
function persistLinkedDraft(note: Note | undefined, mainDraft?: LinkedNoteWire['draft'] | null): void {
  if (!note?.linked) return
  const draft = linkedDraftOf(note)
  const key = JSON.stringify(draft)
  // main's view (when known): its draft may be gone (consumed by another window's write) or
  // be another window's — then ours is sent again, whatever we sent before. With two windows
  // holding unwritten edits of the same note, the last draft sent wins.
  if (mainDraft !== undefined && JSON.stringify(mainDraft ?? null) !== key) sentLinkedDrafts.delete(note.id)
  if ((sentLinkedDrafts.get(note.id) ?? 'null') === key) return
  sentLinkedDrafts.set(note.id, key)
  void window.noteflow.linkedSetDraft(note.id, draft).catch(() => sentLinkedDrafts.delete(note.id))
}

/**
 * The file of a linked note is writable again (or a restored draft is based on the disk
 * version) while the note still holds unsaved content: write it now — with the regular
 * hash check, so a file changed meanwhile turns into a conflict instead. Run in the
 * note's queue; nothing to do while an editor still has a debounced save (it will write).
 */
async function retryLinkedWrite(get: StoreGet, set: StoreSet, id: string): Promise<void> {
  const note = get().notes.find((n) => n.id === id)
  if (!isLinkedNote(note) || note.linked.status !== 'ok' || note.linked.conflict || !isLinkedDirty(note)) return
  if (hasPendingEdits(id)) return
  const content = note.sections[0].content
  const linked = await writeLinkedContent(id, note, content, !!note.sections[0].isRawMode)
  if (!linked) { dropNotes(set, new Set([id])); return }
  let updated: Note | undefined
  set((s) => ({
    notes: s.notes.map((n) => {
      if (n.id !== id || !n.linked) return n
      // Also onto a note replaced while it was written (another window's sync, a new
      // edit): its new base hash must land, or the next edit would conflict with our own
      // write (whose broadcast this window ignores). Its content stays as it is now.
      updated = n === note ? { ...n, linked } : { ...n, linked: { ...n.linked, ...writeOutcome(linked) } }
      return updated
    }),
  }))
  persistLinkedDraft(updated)
}

/**
 * The sections of a linked note ready to be copied into a REGULAR note (duplicate, save
 * as template): relative images inlined as data URIs (main reads them with the same
 * checks as the nflinked: scheme; any it can't read stays as it was). A plain-text file
 * (not Markdown) becomes one fenced code block with its language (```json …```), still in
 * text mode: as Markdown, a .json or a .py would render as mangled paragraphs.
 */
export async function linkedSectionsForCopy(note: Note): Promise<NoteSection[]> {
  if (!note.linked) return note.sections
  if (isPlainTextLinked(note)) {
    const fileName = note.linked.path.split(/[\\/]/).pop() ?? ''
    return note.sections.map((s) => ({ ...s, isRawMode: true, content: plainTextAsCodeBlock(fileName, s.content) }))
  }
  return Promise.all(note.sections.map(async (s) => ({
    ...s,
    content: await inlineLinkedImages(s.content, (src) => window.noteflow.linkedAssetDataUri(note.id, src)),
  })))
}

function withoutTransient(linked: LinkedNoteState): LinkedNoteState {
  const { transient: _transient, ...rest } = linked
  return rest
}

/** A linked note keeps exactly its one section: only content / isRawMode / aiHidden may change. */
function isLinkedSectionsPatch(current: NoteSection[], next: NoteSection[]): boolean {
  return next.length === 1 && next[0].id === LINKED_SECTION_ID && next[0].name === current[0]?.name
}

/** Removes notes from the store (and the panes showing them) — unlinked / gone linked notes. */
function dropNotes(set: StoreSet, ids: Set<string>): void {
  if (ids.size === 0) return
  set((s) => {
    if (!s.notes.some((n) => ids.has(n.id))) return {}
    const remaining = s.notes.filter((n) => !ids.has(n.id))
    const fallback = windowRole === 'section' ? null : remaining.find((n) => !n.archived)?.id ?? remaining[0]?.id ?? null
    return { notes: remaining, ...layoutState(removeNotesFromLayout(layoutOf(s), ids, fallback, newPaneId())) }
  })
}

/**
 * The write of a linked note (queued like every note write). Metadata (title alias,
 * favorite, group/folder, text mode, AI visibility) goes to main's registry; a content
 * edit is written to the file only if the file still holds the version it's based on
 * (main checks the hash) — otherwise the note enters the conflict state and keeps the
 * edit in memory. Never while read-only (missing / read-only / unreadable file) nor
 * during a conflict. Structural section changes are refused.
 */
async function applyLinkedUpdate(get: StoreGet, set: StoreSet, id: string, patch: NotePatch): Promise<void> {
  const note = get().notes.find((n) => n.id === id)
  if (!note?.linked) return
  const current = note.sections[0]
  let next = current
  if (patch.sections !== undefined) {
    if (!isLinkedSectionsPatch(note.sections, patch.sections)) {
      console.warn('[notes] A linked note has exactly one section — refusing a structural change:', id)
      return
    }
    next = patch.sections[0]
  }
  // A plain-text file (not Markdown) never leaves text mode (no Markdown editor for it).
  if (isPlainTextLinked(note) && !next.isRawMode) next = { ...next, isRawMode: true }
  const meta: LinkedMetaPatch = {}
  if (patch.title !== undefined && patch.title !== note.title) meta.title = patch.title
  if (patch.favorited !== undefined && patch.favorited !== note.favorited) meta.favorited = patch.favorited
  if ('group' in patch && patch.group !== note.group) meta.group = patch.group ?? ''
  if ('folder' in patch && patch.folder !== note.folder) meta.folder = patch.folder ?? ''
  if (!!next.isRawMode !== !!current.isRawMode) meta.isRawMode = !!next.isRawMode
  if (!!next.aiHidden !== !!current.aiHidden) meta.aiHidden = !!next.aiHidden

  let linked: LinkedNoteState = note.linked
  let section: NoteSection = { ...next }
  const contentChanged = next.content !== current.content
  if (contentChanged) {
    // Not written while in conflict, nor while the file can't be written (missing,
    // read-only, unreadable, still being checked — e.g. the last debounced save an
    // editor flushes as it remounts read-only): the edit stays in the store as
    // unsaved content (+ a draft in userData) and is written once the file is
    // writable again (syncLinkedNote → retryLinkedWrite), through the hash check.
    if (!linked.conflict && linked.status === 'ok') {
      const written = await writeLinkedContent(id, { ...note, linked }, next.content, !!next.isRawMode)
      if (!written) { dropNotes(set, new Set([id])); return }
      linked = written
    }
  } else if (meta.isRawMode === true && current.content === linked.syncedContent && linked.diskBody !== current.content) {
    // Entering text mode on a clean note shows the file's exact text (byte-for-byte editing),
    // not the rich editor's serialization of it.
    section = { ...section, content: linked.diskBody }
    linked = { ...linked, syncedContent: linked.diskBody }
  }

  if (Object.keys(meta).length > 0) {
    const wire = await window.noteflow.linkedUpdateMeta(id, meta)
    if (!wire) { dropNotes(set, new Set([id])); return }
    // Renaming / grouping / favoriting a transient note keeps it (main decides): follow it.
    if (linked.transient && !wire.transient) linked = withoutTransient(linked)
  }
  const updated: Note = {
    ...note,
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.favorited !== undefined ? { favorited: patch.favorited } : {}),
    ...('group' in patch ? { group: patch.group } : {}),
    ...('folder' in patch ? { folder: patch.folder } : {}),
    sections: [section],
    tags: linkedTagsOf(linked.path, section.content),
    linked,
    // The file's modification time is the note's "updated" (main reports it on reload).
    ...(contentChanged ? { updated: new Date().toISOString() } : {}),
  }
  if (!updated.group) delete updated.folder
  let raced = false
  set((s) => {
    const latest = s.notes.find((n) => n.id === id)
    raced = latest !== undefined && latest !== note
    return { notes: s.notes.map((n) => (n.id === id ? updated : n)) }
  })
  if (contentChanged) window.noteflow.recordActivityEdit(id)
  persistLinkedDraft(updated)
  // Another window's change landed while we wrote: re-read main's view of the note.
  if (raced) void get().syncLinkedNote(id)
}

/** Relocks notes whose session unlock no longer applies (their decryption failed). */
function dropSessionPasswords(set: StoreSet, ids: string[]): void {
  console.warn('[notes] Could not re-decrypt unlocked note(s), locking them again:', ids)
  set((s) => ({
    sessionPasswords: Object.fromEntries(Object.entries(s.sessionPasswords).filter(([id]) => !ids.includes(id))),
  }))
}

// Resolved once the first loadNotes of this window has settled (its panes are set): what
// "Open with NoteFlow" waits for, so the restored layout doesn't replace the opened file.
let resolveFirstLoad: () => void = () => undefined
const firstLoad = new Promise<void>((resolve) => { resolveFirstLoad = resolve })
export function notesFirstLoaded(): Promise<void> {
  return firstLoad
}

/**
 * Subscribes this window's store to main's `notes-archived` broadcast. Every window that
 * loads the notes binds it next to its `notes-updated` listener: the reload that follows
 * the archive can't drop the notes by itself (loadNotes ignores an empty result while the
 * store holds notes). → the unsubscribe function.
 */
export function bindArchivedNotes(): () => void {
  return window.noteflow.onNotesArchived((event) => useNotesStore.getState().removeArchivedNotes(event))
}

/** Files opened from the OS at once: the first replaces the active pane, the rest open alongside up to this many panes. */
const MAX_PANES_FROM_SYSTEM = 3

/**
 * Leaving `noteId`: delete it if it's still a blank default note (main window only).
 * Its editors' pending debounced saves are flushed first — they enqueue their writes,
 * and pruneEmptyNote, queued behind them, re-checks the note once they've landed. Without
 * this, a new note being typed into while the user clicked another pane looked empty to
 * the store and was deleted; the late save then found no note and the text was lost.
 */
function maybePruneOnLeave(get: StoreGet, noteId: string): void {
  flushPendingEdits(noteId)
  if (windowRole === 'section') return
  const note = get().notes.find((n) => n.id === noteId)
  if (note && isPrunable(note)) void get().pruneEmptyNote(noteId)
}

export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],
  activeNoteId: null,
  openPanes: [],
  activePaneId: null,
  contentPlace: null,
  noteViewId: null,
  brainViewOpen: false,
  contentReturnPlace: null,
  notesDir: '',
  searchQuery: '',
  filterSection: 'all',
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
      // Store snapshot BEFORE the reads: a local write landing while we read/decrypt is
      // newer than the disk copy we got — see keepNotesChangedDuringLoad (lib/reloadGuard).
      const notesBeforeRead = get().notes
      const [dir, allDirs, uiState, linkedWires] = await Promise.all([
        window.noteflow.getNotesDir(),
        window.noteflow.readAllNotes(),
        window.noteflow.getUiState(),
        // Linked notes (external .md files): main's registry, not the notes dir.
        window.noteflow.linkedList().catch((): LinkedNoteWire[] => []),
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
      const { notes: loaded, failed } = await redecryptWithSession(parsed, get().sessionPasswords, decryptSections)
      if (failed.length > 0) dropSessionPasswords(set, failed)

      // Safety guard: if we got 0 notes but already had notes in memory, this is
      // likely a transient FS issue (e.g. Windows returning an empty dir on OS
      // wake from sleep). Don't wipe in-memory notes — they're still on disk.
      // (When main's local archive empties the dir, its notes leave the store
      // explicitly first — removeArchivedNotes — so this guard doesn't keep them.)
      if (loaded.length === 0 && get().notes.some((n) => !n.linked)) {
        set({ isLoading: false })
        return
      }

      // Notes written in memory during the load keep that copy (never go backwards);
      // re-synced once set, so a newer disk version of them still lands. Computed right
      // before the synchronous set()s below — no await in between.
      const { notes: merged, resync } = keepNotesChangedDuringLoad(
        notesBeforeRead.filter((n) => !n.linked), get().notes.filter((n) => !n.linked), loaded,
        (inMemory, read) => noteFingerprint(inMemory) === noteFingerprint(read),
      )
      // Linked notes already in the store keep their copy (it may hold edits not on disk,
      // or a conflict) and are re-synced through the linked-note decision when main's view
      // differs; new ones come in as main describes them; unlinked ones go.
      const storeLinked = new Map(get().notes.filter(isLinkedNote).map((n) => [n.id, n]))
      const linkedResync: string[] = []
      const linkedNotes = linkedWires.map((wire) => {
        const existing = storeLinked.get(wire.id)
        if (!existing) {
          const fresh = linkedNoteFromWire(wire)
          // A restored draft (unsaved edits from before a restart): retried / judged by the sync.
          if (isLinkedDirty(fresh)) linkedResync.push(wire.id)
          return fresh
        }
        const fresh = linkedNoteFromWire(wire)
        const s0 = existing.sections[0]
        const f0 = fresh.sections[0]
        if (wire.hash !== existing.linked.baseHash || wire.status !== existing.linked.status || wire.path !== existing.linked.path
          || fresh.title !== existing.title || fresh.group !== existing.group || fresh.folder !== existing.folder
          || fresh.favorited !== existing.favorited || fresh.archived !== existing.archived
          || !!f0.isRawMode !== !!s0?.isRawMode || !!f0.aiHidden !== !!s0?.aiHidden
          || !!fresh.linked?.transient !== !!existing.linked.transient) {
          linkedResync.push(wire.id)
        }
        return existing
      })
      // Linked while the list was in flight: not in it yet, keep it.
      const listed = new Set(linkedWires.map((w) => w.id))
      const before = new Set(notesBeforeRead.map((n) => n.id))
      for (const n of storeLinked.values()) if (!listed.has(n.id) && !before.has(n.id)) linkedNotes.push(n)
      // A kept copy of a note whose session password was just dropped (`failed`) still
      // holds the plaintext: lock it like the loaded copy.
      const notes = [...relockNotes(merged, failed), ...linkedNotes]
      const resyncChanged = () => {
        for (const filePath of resync) void get().syncNote(filePath)
        for (const id of linkedResync) void get().syncLinkedNote(id)
      }

      // A section window owns its single pane (SectionWindowApp sets it); it never takes
      // the main window's persisted active note nor schedules alarms.
      if (windowRole === 'section') {
        set({ notes, isLoading: false })
        resyncChanged()
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

      resyncChanged()

      // Register alarms with main process after notes are loaded
      window.noteflow.scheduleAlarms(alarmsOf(notes))
    } catch (err) {
      console.error('Failed to load notes:', err)
      set({ isLoading: false })
    } finally {
      resolveFirstLoad()
    }
  },
  
  syncNote: async (filePath: string, retried = false) => {
    // A linked FILE (any text file): its own sync. Known by the store's linked notes (a
    // note folder path never matches one), not by extension.
    if (findLinkedNoteByPath(get().notes, filePath, window.noteflow.platform)) return get().syncLinkedNote(filePath)
    try {
      // Store snapshot BEFORE the disk read: if a local write of this note lands while we
      // read (or decrypt, PBKDF2 can take hundreds of ms), our copy may predate it and must
      // not replace it. Then re-read once — local writes reach the disk before the store.
      const notesBeforeRead = get().notes
      const retryOrSkip = () => (retried ? undefined : get().syncNote(filePath, true))
      // filePath is the absolute path of the note DIRECTORY
      const rec = await window.noteflow.readNoteDir(pathBasename(filePath))
      if (!rec) {
        // Not a note folder: maybe a file linked in another window that this one doesn't
        // have yet (main refuses linked files as folders) — main's registry knows.
        if (!retried && await window.noteflow.linkedGet(filePath).catch(() => null)) return get().syncLinkedNote(filePath)
        const targetFilename = filePath.replace(/\\/g, '/').split('/').pop()?.toLowerCase()
        if (!targetFilename) return

        set((s) => {
          const removedIds = s.notes
            .filter((n) => !n.linked && n.filePath.replace(/\\/g, '/').split('/').pop()?.toLowerCase() === targetFilename)
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
        window.noteflow.scheduleAlarms(alarmsOf(get().notes))
      }
    } catch (err) {
      console.error('Failed to sync note:', err)
    }
  },

  // See lib/archivedNotes.ts. Not a deletion: nothing is sent to main, so nothing is
  // removed from disk nor from the remote. Later writes of these notes are no-ops (every
  // write path looks the note up in the store first); a pull that brings one back adds it
  // again through the regular reload.
  removeArchivedNotes: (event) => {
    const s = get()
    const removal = withoutArchivedNotes(
      { notes: s.notes, layout: layoutOf(s), sessionPasswords: s.sessionPasswords },
      event,
      { fallbackToAnotherNote: windowRole !== 'section', newPaneId: newPaneId() },
    )
    if (!removal) return
    // Their debounced saves have nowhere to land: main refuses to recreate an archived
    // note, so they are dropped instead of flushed (no write attempt, no error).
    for (const id of removal.removed) discardPendingEdits(id)
    set({ notes: removal.notes, ...layoutState(removal.layout), sessionPasswords: removal.sessionPasswords })
    // Their alarms go with them (the main window owns alarm scheduling).
    if (windowRole === 'main') window.noteflow.scheduleAlarms(alarmsOf(removal.notes))
  },

  // Queued with the note's writes: never interleaves with a write of ours in flight, and
  // judges the note as those writes left it.
  syncLinkedNote: async (idOrPath) => {
    try {
      const first = await window.noteflow.linkedGet(idOrPath)
      if (!first) {
        // No note at that path any more: unlinked (here or in another window) — or relocated
        // to another file, then it's still linked under its id and is re-read instead.
        const gone = new Set<string>()
        for (const n of get().notes.filter((n) => n.linked && (n.id === idOrPath || n.filePath === idOrPath))) {
          if (n.id !== idOrPath && await window.noteflow.linkedGet(n.id)) void get().syncLinkedNote(n.id)
          else gone.add(n.id)
        }
        dropNotes(set, gone)
        return
      }
      await noteWriteQueue.run(first.id, async () => {
        const wire = await window.noteflow.linkedGet(first.id)
        if (!wire) { dropNotes(set, new Set([first.id])); return }
        let merged: Note | undefined
        set((s) => {
          const existing = s.notes.find((n) => n.id === wire.id)
          if (!existing) {
            merged = linkedNoteFromWire(wire)
            return { notes: [merged, ...s.notes] }
          }
          if (!isLinkedNote(existing)) return {}
          merged = mergeLinkedWire(existing, wire, hasPendingEdits(wire.id)).note
          return { notes: s.notes.map((n) => (n.id === wire.id ? merged! : n)) }
        })
        persistLinkedDraft(merged, wire.draft ?? null)
        // Writable again (or a restored draft) with unsaved content: write it now.
        await retryLinkedWrite(get, set, wire.id)
      })
    } catch (err) {
      console.error('Failed to sync linked note:', err)
    }
  },

  linkFiles: async (paths) => {
    const res = await window.noteflow.linkedLink(paths)
    const all = [...res.linked, ...res.existing]
    if (all.length > 0) {
      set((s) => {
        const known = new Set(s.notes.map((n) => n.id))
        const added = res.linked.filter((w) => !known.has(w.id)).map(linkedNoteFromWire)
        return added.length > 0 ? { notes: [...added, ...s.notes] } : {}
      })
    }
    const opened = all[0] ? get().notes.find((n) => n.id === all[0].id) ?? null : null
    if (opened) get().setActiveNote(opened.id)
    return { opened, linked: res.linked.length, errors: res.errors }
  },

  relocateLinkedNote: (id, newPath) => noteWriteQueue.run(id, async (): Promise<{ ok: boolean; error?: LinkError | 'notLinked' }> => {
    const before = get().notes.find((n) => n.id === id)
    const res = await window.noteflow.linkedRelocate(id, newPath)
    if (!res.ok) return { ok: false, error: res.error }
    // Another file now: its content replaces the note's — unless the note held changes that
    // were never written. Those are kept as a draft over the OLD base: against the new file
    // they show as a conflict, and the user picks in the banner / Compare… (never lost, never
    // written to the new file silently).
    const unsaved = isLinkedNote(before) && isLinkedDirty(before)
      ? { body: before.sections[0]?.content ?? '', baseHash: before.linked.baseHash }
      : null
    const fresh = linkedNoteFromWire(unsaved ? { ...res.note, draft: unsaved } : { ...res.note, draft: undefined })
    set((s) => ({ notes: s.notes.map((n) => (n.id === id ? fresh : n)) }))
    persistLinkedDraft(fresh, res.note.draft ?? null)
    return { ok: true }
  }),

  discardLinkedChanges: (id) => noteWriteQueue.run(id, async () => {
    const note = get().notes.find((n) => n.id === id)
    if (!isLinkedNote(note) || note.linked.conflict || !isLinkedDirty(note)) return
    // Back to the last content known from the file (the disk's, or the cache's if it's
    // missing); then main's current view is read in case the file changed meanwhile.
    // (The status a failed write left is corrected by that sync too.)
    const linked: LinkedNoteState = { ...note.linked, syncedContent: note.linked.diskBody }
    const body = note.linked.diskBody
    let updated: Note | undefined
    set((s) => ({ notes: s.notes.map((n) => (n.id === id ? (updated = { ...n, sections: [{ ...n.sections[0], content: body }], tags: linkedTagsOf(linked.path, body), linked }) : n)) }))
    persistLinkedDraft(updated)
    void get().syncLinkedNote(id)
  }),

  unlinkNote: async (id) => {
    flushPendingEdits(id)
    await noteWriteQueue.run(id, async () => {
      await window.noteflow.linkedUnlink(id)
      dropNotes(set, new Set([id]))
    })
  },

  openNotesFromSystem: async (ids) => {
    // Linked by main a moment ago: this window may not have heard of them yet.
    for (const id of ids) {
      if (!get().notes.some((n) => n.id === id)) await get().syncLinkedNote(id)
    }
    const present = ids.filter((id) => get().notes.some((n) => n.id === id))
    if (present.length === 0) return
    const [first, ...rest] = present
    const prev = get().activeNoteId
    if (prev && prev !== first) maybePruneOnLeave(get, prev)
    set((s) => {
      // The first in the active pane (a transient note there is closed → discarded), the next
      // ones alongside while there's room; the rest wait in the sidebar (marked temporary).
      let layout = openInActivePane(layoutOf(s), first, newPaneId())
      for (const id of rest) {
        if (layout.panes.length >= MAX_PANES_FROM_SYSTEM) break
        layout = openInSplit(layout, id, undefined, newPaneId())
      }
      const firstPane = primaryPaneForNote(layout, first)
      if (firstPane) layout = { panes: layout.panes, activePaneId: firstPane.paneId }
      return { ...layoutState(layout), contentPlace: null, noteViewId: null, brainViewOpen: false, contentReturnPlace: null }
    })
    saveUiState({ activeNoteId: first })
  },

  keepLinkedNote: (id) => noteWriteQueue.run(id, async () => {
    const note = get().notes.find((n) => n.id === id)
    if (!isLinkedNote(note) || !note.linked.transient) return
    const wire = await window.noteflow.linkedKeep(id)
    if (!wire) { dropNotes(set, new Set([id])); return }
    set((s) => ({ notes: s.notes.map((n) => (n.id === id && n.linked ? { ...n, linked: withoutTransient(n.linked) } : n)) }))
  }),

  discardTransientNote: (id) => {
    // An editor's pending save lands first (queued before the check below).
    flushPendingEdits(id)
    return noteWriteQueue.run(id, async () => {
      const note = get().notes.find((n) => n.id === id)
      if (!isLinkedNote(note) || !note.linked.transient || isLinkedDirty(note) || hasPendingEdits(id)) return false
      // Opened again while this waited in the queue: the user is back on it.
      if (get().openPanes.some((p) => p.noteId === id)) return false
      const { discarded } = await window.noteflow.linkedDiscardTransient(id)
      if (discarded) dropNotes(set, new Set([id]))
      return discarded
    })
  },

  resolveLinkedConflict: async (id, resolution) => {
    // The editors' pending saves land first (in memory: the note is in conflict).
    flushPendingEdits(id)
    await noteWriteQueue.run(id, async () => {
      const note = get().notes.find((n) => n.id === id)
      if (!note?.linked?.conflict) return
      const { conflict, ...rest } = note.linked
      if (resolution.kind === 'reload') {
        const linked: LinkedNoteState = { ...rest, baseHash: conflict.diskHash, diskBody: conflict.diskBody, syncedContent: conflict.diskBody }
        const sections = [{ ...note.sections[0], content: conflict.diskBody }]
        set((s) => ({ notes: s.notes.map((n) => (n.id === id ? { ...n, sections, tags: linkedTagsOf(linked.path, conflict.diskBody), linked } : n)) }))
        persistLinkedDraft(get().notes.find((n) => n.id === id))
        return
      }
      // Keep mine / merged: written over the disk version the user saw (if the file changed
      // AGAIN since, main reports a new conflict instead of overwriting it).
      const content = resolution.kind === 'merged' ? resolution.body : note.sections[0].content
      // A merged text is written as typed; "keep mine" like a regular save.
      const body = resolution.kind === 'merged'
        ? content
        : linkedKeepMineBody(note as Note & { linked: LinkedNoteState }, content, conflict.diskBody)
      const res = await window.noteflow.linkedWrite(id, body, conflict.diskHash)
      let linked: LinkedNoteState
      if (res.ok) linked = { ...rest, baseHash: res.hash, diskBody: res.body, syncedContent: content }
      else if (res.reason === 'conflict') linked = { ...rest, conflict: { diskBody: res.disk.body, diskHash: res.disk.hash } }
      else linked = { ...note.linked, status: res.reason === 'missing' ? 'missing' : res.reason === 'readonly' ? 'readonly' : 'error' }
      const sections = [{ ...note.sections[0], content }]
      set((s) => ({ notes: s.notes.map((n) => (n.id === id ? { ...n, sections, tags: linkedTagsOf(linked.path, content), linked } : n)) }))
      persistLinkedDraft(get().notes.find((n) => n.id === id))
      if (res.ok) window.noteflow.recordActivityEdit(id)
    })
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
      contentPlace: null,
      noteViewId: null,
      brainViewOpen: false,
      contentReturnPlace: null,
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
      // Every section of a brand-new note is new: stamp them with the note's own
      // creation time (overrides any `created`/`updated` carried over from a template).
      sections: sections.map((s) => ({ ...s, created: draft.created, updated: draft.created })),
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
        ? { ...layoutState(singlePane(layoutOf(s), note.id, newPaneId())), contentPlace: null, noteViewId: null, brainViewOpen: false, contentReturnPlace: null }
        : {}),
    }))
    return note
  },

  createTempNote: async () => {
    const expiresAt = hoursFromNow(TEMP_NOTE_DEFAULT_HOURS)
    const draft = { ...createEmptyNote(), expiresAt }
    const dir = get().notesDir
    const filePath = `${dir}/${noteDirname(draft.id, draft.title)}`
    const note: Note = { ...draft, filePath, raw: '' }

    await writeNoteToDisk(null, note)
    set((s) => ({
      notes: [note, ...s.notes],
      ...layoutState(singlePane(layoutOf(s), note.id, newPaneId())),
      newlyCreatedNoteId: note.id,
      contentPlace: null,
      noteViewId: null,
      brainViewOpen: false,
      contentReturnPlace: null,
    }))
    return note
  },

  duplicateNote: async (id) => {
    const source = get().notes.find((n) => n.id === id)
    if (!source) throw new Error(`Note ${id} not found`)
    // A linked note's copy is a regular note: its relative images become inline data
    // URIs (regular notes keep images inline; relative paths would point nowhere).
    const sourceSections = source.linked ? await linkedSectionsForCopy(source) : source.sections
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
      // The copies are new sections of a new note → they share its creation time
      // (also as their last edit: the original's `updated` doesn't carry over).
      // Agent tasks stay with the original: its agent.md is not copied and the copy's
      // task lines lose their 🤖 markers (a task id is unique across the notes dir).
      sections: sourceSections.map((s) => ({
        ...s, id: nanoid(8), created: now, updated: now, content: clearAgentMarkersInContent(s.content),
      })),
    }
    const dir = get().notesDir
    const filePath = `${dir}/${noteDirname(draft.id, draft.title)}`
    const note: Note = { ...draft, filePath, raw: '' }
    await writeNoteToDisk(null, note)
    set((s) => ({
      notes: [note, ...s.notes],
      ...layoutState(singlePane(layoutOf(s), note.id, newPaneId())),
      newlyCreatedNoteId: note.id,
      contentPlace: null,
      noteViewId: null,
      brainViewOpen: false,
      contentReturnPlace: null,
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
  duplicateSection: async (noteId, sectionId, name, content) => {
    let created: NoteSection | null = null
    await get().mutateSections(noteId, (sections) => {
      const result = duplicateSectionInList(sections, sectionId, { id: nanoid(8), name, created: new Date().toISOString(), content })
      if (!result) return null
      created = result.section
      return result.sections
    })
    return created
  },

  deleteNote: async (id) => {
    const note = get().notes.find((n) => n.id === id)
    if (!note) return
    // "Deleting" a linked note only unlinks it: its file is never deleted.
    if (note.linked) return get().unlinkNote(id)

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
    if (note.linked) {
      const wire = await window.noteflow.linkedUpdateMeta(id, { archived: !note.archived })
      if (!wire) { dropNotes(set, new Set([id])); return }
      // Archiving a transient note keeps it (main decides).
      set((s) => ({ notes: s.notes.map((n) => (n.id === id && n.linked
        ? { ...n, archived: wire.archived, linked: wire.transient ? n.linked : withoutTransient(n.linked) }
        : n)) }))
      return
    }

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

  // Moves a temporary note's deletion to `hours` from now — same metadata-only write as
  // makeNotePermanent (works locked/encrypted; the bumped `updated` makes the new
  // expiresAt win the per-folder conflict on the next sync pull). Never turns a regular
  // note into a temporary one.
  setNoteExpiry: (id, hours) => noteWriteQueue.run(id, async () => {
    const note = get().notes.find((n) => n.id === id)
    if (!note?.expiresAt || !(hours > 0)) return

    const updated: Note = { ...note, expiresAt: hoursFromNow(hours), updated: new Date().toISOString() }
    await writeNoteToDisk(note, updated)
    set((s) => ({ notes: s.notes.map((n) => (n.id === id ? updated : n)) }))
  }),

  setActiveNote: (id) => {
    // Before switching, auto-delete the current note if it's completely empty
    const prev = get().activeNoteId
    if (prev && prev !== id) maybePruneOnLeave(get, prev)
    set((s) => {
      // Selecting a note always returns to the editor (closes the content / note / brain views)
      const closeViews = { contentPlace: null, noteViewId: null, brainViewOpen: false, contentReturnPlace: null }
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
    // re-dispatch on the next tick: when a full-area view (content/note/brain) is
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
  // Content view, note overview and brain view are mutually exclusive full-area views:
  // opening one closes the others.
  setContentView: (place) => set({ contentPlace: place, noteViewId: null, brainViewOpen: false, contentReturnPlace: null }),
  // Opened from the content view (a section's "Note overview"), remember its place so the
  // overview's "back" returns there; switching to another note's overview keeps it.
  setNoteView: (id) => set((s) => ({
    noteViewId: id,
    contentPlace: null,
    brainViewOpen: false,
    contentReturnPlace: id ? (s.contentPlace ?? (s.noteViewId ? s.contentReturnPlace : null)) : null,
  })),
  setBrainView: (open) => set((s) => ({ brainViewOpen: open, contentPlace: open ? null : s.contentPlace, noteViewId: open ? null : s.noteViewId, contentReturnPlace: open ? null : s.contentReturnPlace })),
  closeFullView: () => {
    const back = get().contentReturnPlace
    if (back) set({ contentPlace: back, noteViewId: null, brainViewOpen: false, contentReturnPlace: null })
    else set({ contentPlace: null, noteViewId: null, brainViewOpen: false })
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
      contentPlace: null, noteViewId: null, brainViewOpen: false, contentReturnPlace: null,
    }))
    saveUiState({ activeNoteId: id, ...(section ? { activeSectionId: section } : {}) })
  },
  openNoteInActivePane: (id, sectionId) => {
    const target = get().notes.find((n) => n.id === id)
    if (!target) return
    const section = sectionId && target.sections.some((s) => s.id === sectionId) ? sectionId : undefined
    const prev = get().activeNoteId
    if (prev && prev !== id) maybePruneOnLeave(get, prev)
    // Same section dance as navigateToSection: stashed for an editor that (re)mounts or
    // switches note, re-requested on the next tick for one that only starts listening then.
    if (section) set({ pendingInitialSectionId: section })
    set((s) => ({
      ...layoutState(openInActivePane(layoutOf(s), id, newPaneId())),
      contentPlace: null, noteViewId: null, brainViewOpen: false, contentReturnPlace: null,
    }))
    saveUiState({ activeNoteId: id, ...(section ? { activeSectionId: section } : {}) })
    if (!section) return
    const request = () => window.dispatchEvent(
      new CustomEvent('noteflow:request-section', { detail: { noteId: id, sectionId: section } }),
    )
    request()
    setTimeout(request, 0)
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
  setFilterTag:         (tag) => set({ filterTag: tag }),
  setShowArchived:      (v)   => set({ showArchived: v }),
  clearFilters:         ()    => set({
    searchQuery: '',
    filterSection: 'all',
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

  // Queued like every write of the note: it runs after the writes already queued (e.g.
  // the saves maybePruneOnLeave just flushed) and judges the note as they left it.
  pruneEmptyNote: (id) => noteWriteQueue.run(id, async () => {
    if (windowRole === 'section') return  // the main window owns pruning
    const note = get().notes.find((n) => n.id === id)
    if (!note) return
    if (note.encryption) return  // never auto-delete encrypted notes
    if (note.linked) return      // a linked note is a file the user picked: never pruned
    if (!isPrunable(note)) return
    // Typed into again since the prune was queued: a save is on its way.
    if (hasPendingEdits(id)) return
    // Reopened while the prune waited in the queue: the user is back on it.
    if (get().activeNoteId === id) return
    try { await window.noteflow.deleteNote(note.filePath) } catch { /* ignore */ }
    set((s) => {
      const remaining = s.notes.filter((n) => n.id !== id)
      const fallback = remaining.find((n) => !n.archived)?.id ?? remaining[0]?.id ?? null
      return {
        notes: remaining,
        ...layoutState(removeNotesFromLayout(layoutOf(s), new Set([id]), fallback, newPaneId())),
      }
    })
  }),

  encryptNote: (id, password, options) => noteWriteQueue.run(id, async () => {
    const note = get().notes.find((n) => n.id === id)
    // Linked notes can't be encrypted: their content is a plain file of the user's project.
    if (!note || note.encryption || note.linked) return
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
