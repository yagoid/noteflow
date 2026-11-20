import { useEffect, useMemo } from 'react'
import type { Editor } from '@tiptap/core'
import { AGENT_LIVE_STATES, AGENT_NO_SIGNAL, agentDisplayState, agentIdsIn, newAgentTaskId } from '../../lib/agentTasks'
import { agentIdsInDoc } from '../../lib/agentTaskNodes'
import { noteHasAgentMarkers, type AgentTone } from '../../lib/agentTaskUi'
import { useAgentTasksStore } from '../../stores/agentTasksStore'
import { useNotesStore } from '../../stores/notesStore'
import type { Messages } from '../../i18n'

// Agent tasks in the editor: what the task item NodeView, the kanban board and
// the editor shell share. The components are AgentTaskChip.tsx (the chip) and
// AgentReportPopover.tsx (the report menu); the rules, lib/agentTaskUi.ts.

/** Name of the task item extension: its storage carries the note the editor shows (`noteId`). */
const TASK_ITEM_STORAGE = 'taskItem'

/** Tells the editor's task items and boards which note they belong to (Editor.tsx, like the drawing node's target). */
export function setAgentNoteId(editor: Editor, noteId: string | null): void {
  const storage = (editor.storage as Record<string, { noteId?: string | null } | undefined>)[TASK_ITEM_STORAGE]
  if (storage) storage.noteId = noteId
}

/** The note this editor shows, null when it was never told (an editor outside a note). */
export function agentNoteId(editor: Editor): string | null {
  return (editor.storage as Record<string, { noteId?: string | null } | undefined>)[TASK_ITEM_STORAGE]?.noteId ?? null
}

/**
 * Keeps the reports of the note an editor shows loaded and live
 * (agentTasksStore.watch) — only for a regular, unencrypted note that carries
 * some 🤖 marker or with the feature on. With the feature off and no marker
 * anywhere in the note, this does nothing beyond reading the setting once.
 */
export function useAgentTasksWatch(noteId: string | undefined, plain: boolean): void {
  const ensureLoaded = useAgentTasksStore((s) => s.ensureLoaded)
  const watch = useAgentTasksStore((s) => s.watch)
  const enabled = useAgentTasksStore((s) => s.settings.enabled)
  const dirPath = useNotesStore((s) => {
    const note = !plain && noteId ? s.notes.find((n) => n.id === noteId) : undefined
    return note && !note.linked && !note.encryption ? note.filePath : null
  })
  // The selector only hands over the note's `sections` array (the same object
  // until the note itself is written): its text is scanned when THAT changes,
  // not on every change of the notes store.
  const sections = useNotesStore((s) => (!plain && noteId ? s.notes.find((n) => n.id === noteId)?.sections : undefined))
  const hasMarkers = useMemo(() => noteHasAgentMarkers(sections), [sections])

  useEffect(() => { void ensureLoaded() }, [ensureLoaded])

  useEffect(() => {
    if (!noteId || !dirPath || !(enabled || hasMarkers)) return
    return watch(dirPath, noteId)
  }, [noteId, dirPath, enabled, hasMarkers, watch])
}

/** Whether the "hand to an agent" affordance shows on tasks without a marker: the feature's switch. */
export function useAgentTasksEnabled(): boolean {
  return useAgentTasksStore((s) => s.settings.enabled)
}

/**
 * The state to SHOW for a task's marker (null without one): the line's, or
 * 'no-signal' for a running / waiting task whose block has been silent for too
 * long — or has no block here once the note's reports are loaded.
 */
export function useAgentDisplayState(agentId: string | null | undefined, agentState: string | null | undefined): string | null {
  const id = agentId ?? ''
  const live = !!id && !!agentState && AGENT_LIVE_STATES.includes(agentState)
  // Only a live task depends on the block and on the clock: the rest never re-render with them.
  const lastSignal = useAgentTasksStore((s) => (live ? s.byId[id]?.meta.lastSignal ?? null : null))
  const hasBlock = useAgentTasksStore((s) => (live ? s.byId[id] !== undefined : false))
  const staleMinutes = useAgentTasksStore((s) => s.settings.staleMinutes)
  const now = useAgentTasksStore((s) => (live ? s.now : 0))
  const settled = useAgentTasksStore((s) => (live ? s.pendingLoads === 0 && Object.keys(s.byDir).length > 0 : true))
  if (!agentId || !agentState) return null
  if (!live) return agentState
  if (!hasBlock) return settled ? AGENT_NO_SIGNAL : agentState
  return agentDisplayState(agentState, lastSignal ?? undefined, staleMinutes, now)
}

/** The chip's text for a tone. */
export function agentStateLabel(t: Messages, tone: AgentTone): string {
  const s = t.editor.agentTask.states
  return tone === 'no-signal' ? s.noSignal : s[tone]
}

/**
 * A fresh id for a task of this editor's document, made HERE — no round trip
 * to main, which would read and parse every note of the notes dir on each
 * click. Guarantee: different from every id this window knows —
 *   - the document itself (its last edits may not be saved yet), task items
 *     and kanban cards;
 *   - the markers of every note the notes store holds (all the readable notes
 *     of the notes dir; a section without a 🤖 is skipped unread);
 *   - the blocks of the reports loaded in this window.
 * NOT checked: the markers inside encrypted notes that are locked (nobody can
 * read them — the CLI does not count them either) and the blocks of an
 * agent.md of a note that is not open and whose line is gone (an orphan on its
 * way out). An id is 5 of 36 characters, so one drawn at random matches a
 * given unknown id once in 60 million; the CLI reports an id it finds twice.
 */
export function newAgentTaskIdFor(editor: Editor): string {
  const taken = agentIdsInDoc(editor.state.doc)
  for (const note of useNotesStore.getState().notes) {
    for (const section of note.sections) {
      if (section.content.includes('🤖')) for (const id of agentIdsIn([section])) taken.add(id)
    }
  }
  for (const id of Object.keys(useAgentTasksStore.getState().byId)) taken.add(id)
  const bytes = new Uint8Array(1)
  return newAgentTaskId(taken, () => crypto.getRandomValues(bytes)[0])
}

/** After the app changed the state of a task's line: its block takes that state once the edit is saved (agentTasksStore.reconcileTask). */
export function reconcileAgentReport(editor: Editor, id: string): void {
  const noteId = agentNoteId(editor)
  if (!noteId) return
  void useAgentTasksStore.getState().reconcileTask(noteId, id).catch((err) => {
    console.error('Failed to update the agent report:', err)
  })
}

/** Removes the report of a task of this editor's note, once its marker is gone from the note (agentTasksStore.dismissTask). */
export function dismissAgentReport(editor: Editor, id: string): void {
  const noteId = agentNoteId(editor)
  if (!noteId) return
  void useAgentTasksStore.getState().dismissTask(noteId, id).catch((err) => {
    console.error('Failed to discard the agent report:', err)
  })
}
