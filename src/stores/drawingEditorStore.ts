import { create } from 'zustand'
import { drawingHtmlDataToMarkdown, type DrawingBlock, type DrawingHtmlData } from '../lib/drawing/drawingBlock'
import { appendDrawing, replaceDrawing } from '../lib/drawing/drawingReplace'
import type { ExcalidrawScene } from '../lib/drawing/drawingScene'
import { flushPendingEdits } from '../lib/pendingEdits'
import { patchSectionInList } from '../lib/sectionUtils'
import { useNotesStore } from './notesStore'

// The drawing overlay of this window (components/Drawing): one editing session at a time,
// opened by a drawing node view (components/Editor/DrawingBlockView.tsx) and answered by
// the overlay. Kept in a store because the two live in different React trees: the node
// view inside the editor, the overlay host at the root of the window.
//
// THE WORK OF A SESSION IS NEVER LOST SILENTLY. The editor that opened it is keyed by
// note + section, so anything that changes what is on screen (tray → new note, a linked
// file opened, a sync pull, the AI, an archive) unmounts the node view while the canvas
// stays open. So a session knows where its drawing lives BY IDENTITY (DrawingTarget), and
// the result is written through the notes store when the node view can't take it; if the
// block is no longer what it was — or the write fails — the user is asked (ask); a window closing with
// the canvas open flushes it like any pending edit (DrawingOverlayHost → beforeunload).

/** Where a drawing lives, without any editor: the section, and the block as it was opened. */
export interface DrawingTarget {
  noteId: string
  sectionId: string
  /** The block when the canvas opened: what must still be there for a write to be safe. */
  opened: DrawingHtmlData
  /** Which one, among identical blocks of the section (0-based). */
  ordinal: number
}

/** How a session ended. `lines` = the new fence content of an `excalidraw` block. */
export type DrawingEditResult =
  | { type: 'unchanged' }
  | { type: 'saved'; lines: string[]; empty: boolean }

export interface DrawingEditSession {
  /** The block being edited (its attributes and, for a source, the Mermaid text). */
  block: DrawingBlock
  /** What the canvas starts from: the stored scene restored, or the Mermaid source converted. */
  scene: ExcalidrawScene
  /** Null only where the editor has no note behind it. */
  target: DrawingTarget | null
  finish: (result: DrawingEditResult) => void
}

/**
 * A question about a drawing that could not simply be saved (DrawingOverlayHost shows it):
 *   'changed'      — its block was changed or removed meanwhile → insert as a new drawing / discard;
 *   'gone'         — its note or section is gone → copy the drawing / discard;
 *   'write-failed' — writing to disk failed → try again / copy the drawing;
 *   'copy-failed'  — the clipboard refused it → try again / discard.
 * `resolve(true)` = the first option.
 */
export type DrawingPromptKind = 'changed' | 'gone' | 'write-failed' | 'copy-failed'
export interface DrawingPrompt {
  kind: DrawingPromptKind
  resolve: (primary: boolean) => void
}

/** The scene of the open canvas if the user changed it (DrawingOverlay registers it). */
export type DrawingSnapshot = () => { lines: string[]; empty: boolean } | null

interface DrawingEditorState {
  /** An overlay host is mounted in this window (main and section windows; not stickies). */
  available: boolean
  session: DrawingEditSession | null
  prompt: DrawingPrompt | null
  /** A drawn scene still waiting for the user's answer to a prompt (flushed if the window closes). */
  pending: { target: DrawingTarget | null; drawn: DrawingHtmlData } | null
  snapshot: DrawingSnapshot | null
  setAvailable: (available: boolean) => void
  setSnapshot: (snapshot: DrawingSnapshot | null) => void
  /** Opens the overlay; resolves when it closes. No host or a session already open → 'unchanged'. */
  edit: (session: Omit<DrawingEditSession, 'finish'>) => Promise<DrawingEditResult>
  /** Asks the user (see DrawingPromptKind); true = the first option. No host → false. */
  ask: (kind: DrawingPromptKind) => Promise<boolean>
}

export const useDrawingEditorStore = create<DrawingEditorState>((set, get) => ({
  available: false,
  session: null,
  prompt: null,
  pending: null,
  snapshot: null,
  setAvailable: (available) => set({ available }),
  setSnapshot: (snapshot) => set({ snapshot }),
  edit: (session) => {
    if (!get().available || get().session) return Promise.resolve({ type: 'unchanged' })
    return new Promise((resolve) => {
      set({
        session: {
          ...session,
          finish: (result) => {
            set({ session: null, snapshot: null })
            resolve(result)
          },
        },
      })
    })
  },
  ask: (kind) => {
    if (!get().available) return Promise.resolve(false)
    return new Promise((resolve) => {
      set({ prompt: { kind, resolve: (primary) => { set({ prompt: null }); resolve(primary) } } })
    })
  },
}))

/**
 * Writes a drawing into its section through the notes store (no editor involved): the
 * block that is still exactly `target.opened` becomes `next` (null = removed).
 *   'saved'   — written (the open editor of that section, if any, takes it as an external change);
 *   'changed' — the section is there but the block isn't what it was: nothing written;
 *   'gone'    — no such note / section (deleted, archived, locked): nothing written.
 * The editors' pending saves of the note go first, so the section text is the latest.
 */
export async function writeDrawingToSection(target: DrawingTarget, next: DrawingHtmlData | null): Promise<'saved' | 'changed' | 'gone'> {
  flushPendingEdits(target.noteId)
  let outcome: 'saved' | 'changed' | 'gone' = 'gone'
  await useNotesStore.getState().mutateSections(target.noteId, (sections) => {
    const section = sections.find((s) => s.id === target.sectionId)
    if (!section) return null
    const content = replaceDrawing(section.content, target.opened, next, target.ordinal)
    if (content === null) { outcome = 'changed'; return null }
    outcome = 'saved'
    return patchSectionInList(sections, target.sectionId, { content })
  })
  return outcome
}

/** Adds the drawing as a new block at the end of the section it came from. */
export async function appendDrawingToSection(target: DrawingTarget, drawing: DrawingHtmlData): Promise<boolean> {
  flushPendingEdits(target.noteId)
  let done = false
  await useNotesStore.getState().mutateSections(target.noteId, (sections) => {
    const section = sections.find((s) => s.id === target.sectionId)
    if (!section) return null
    done = true
    return patchSectionInList(sections, target.sectionId, { content: appendDrawing(section.content, drawing) })
  })
  return done
}

/**
 * Saves a drawing that could not go through its live editor node, and never drops it
 * silently: into its block if that is still the one opened; if the block changed, as a new
 * drawing at the end of its section (asked); if the section is gone, copied (asked); if
 * the disk write fails, retried or copied (asked); if the clipboard fails too, the user
 * is told and decides. Only an explicit "discard" loses it.
 */
export async function saveDrawingElsewhere(target: DrawingTarget | null, drawn: DrawingHtmlData): Promise<void> {
  const store = useDrawingEditorStore.getState()
  const attempt = async <T>(fn: () => Promise<T>): Promise<T | 'failed'> => {
    try { return await fn() } catch (err) { console.error('[drawing] save failed:', err); return 'failed' }
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(drawingHtmlDataToMarkdown(drawn)); return true } catch { return false }
  }
  useDrawingEditorStore.setState({ pending: { target, drawn } })
  try {
    let step: 'write' | 'append' | 'copy' = 'write'
    for (;;) {
      if (step === 'write') {
        const outcome = target ? await attempt(() => writeDrawingToSection(target, drawn)) : 'gone'
        if (outcome === 'saved') return
        if (outcome === 'changed') { if (!(await store.ask('changed'))) return; step = 'append'; continue }
        if (outcome === 'gone') { if (!(await store.ask('gone'))) return; step = 'copy'; continue }
        if (!(await store.ask('write-failed'))) step = 'copy'
        continue
      }
      if (step === 'append') {
        const done = target ? await attempt(() => appendDrawingToSection(target, drawn)) : false
        if (done === true) return
        // The section vanished meanwhile: back to the start, which will say so.
        if (done === false) { step = 'write'; continue }
        if (!(await store.ask('write-failed'))) step = 'copy'
        continue
      }
      if (await copy()) return
      if (!(await store.ask('copy-failed'))) return
    }
  } finally {
    useDrawingEditorStore.setState({ pending: null })
  }
}

/**
 * A window is closing (or reloading) with the canvas open: hand the drawing over now, as
 * the editors do with their pending saves. Written into its block if it is still the same;
 * if the block changed meanwhile, kept as a new block rather than lost. Best effort, like
 * every write started on `beforeunload`: it may not reach the disk if the note is encrypted
 * (the write awaits the encryption first) or queued behind a write still in flight.
 */
export function flushOpenDrawing(): void {
  const { session, snapshot, prompt, pending } = useDrawingEditorStore.getState()
  // Closing while a question about a finished drawing is still open: keep it as a new block
  // of its section rather than lose it with the unanswered dialog.
  if (prompt && pending?.target) {
    void appendDrawingToSection(pending.target, pending.drawn).catch(() => undefined)
    return
  }
  const changed = session?.target ? snapshot?.() : null
  if (!session?.target || !changed || changed.empty) return
  const target = session.target
  const drawn: DrawingHtmlData = { kind: 'excalidraw', attrs: target.opened.attrs, body: changed.lines.join('\n') }
  void writeDrawingToSection(target, drawn).then((outcome) => {
    if (outcome === 'changed') return appendDrawingToSection(target, drawn)
  }).catch(() => undefined) // the window is going away: nothing to tell anyone
}
