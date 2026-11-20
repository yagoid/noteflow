import { useEffect, useMemo } from 'react'
import type { Editor } from '@tiptap/core'
import { AGENT_LIVE_STATES, agentIdsIn, newAgentTaskId } from '../../lib/agentTasks'
import { agentIdsInDoc } from '../../lib/agentTaskNodes'
import { buildAgentPrompt } from '../../lib/agentPrompt'
import { noteHasAgentMarkers, resolveAgentDisplayState, type AgentTone } from '../../lib/agentTaskUi'
import { useAgentTasksStore } from '../../stores/agentTasksStore'
import { useLanguageStore } from '../../stores/languageStore'
import { settleNoteWrites, useNotesStore } from '../../stores/notesStore'
import type { Messages } from '../../i18n'

// Agent tasks in the editor: what the task item NodeView, the kanban board and
// the editor shell share. The components are AgentTaskChip.tsx (the chip) and
// AgentReportPopover.tsx (the report menu); the rules, lib/agentTaskUi.ts.

/** Name of the task item extension: its storage carries the note the editor shows (`noteId`). */
const TASK_ITEM_STORAGE = 'taskItem'

interface AgentStorage {
  noteId?: string | null
  sectionId?: string | null
}

function agentStorage(editor: Editor): AgentStorage | undefined {
  return (editor.storage as Record<string, AgentStorage | undefined>)[TASK_ITEM_STORAGE]
}

/** Tells the editor's task items and boards which note — and section of it — they belong to (Editor.tsx, like the drawing node's target). */
export function setAgentNoteId(editor: Editor, noteId: string | null, sectionId: string | null = null): void {
  const storage = agentStorage(editor)
  if (!storage) return
  storage.noteId = noteId
  storage.sectionId = noteId ? sectionId : null
}

/** The note this editor shows, null when it was never told (an editor outside a note). */
export function agentNoteId(editor: Editor): string | null {
  return agentStorage(editor)?.noteId ?? null
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
 * Can the tasks of this editor's note be handed to an agent from here — the
 * hover-only "hand over" icon and "Copy prompt" of the report menu? The
 * feature's switch, and never in an ENCRYPTED note: the CLI an agent works
 * with cannot read it, so the task could never be started. (The chips of
 * tasks that already carry a marker show either way.) With the feature off
 * the notes store is not even looked at.
 */
export function useAgentSendAllowed(editor: Editor): boolean {
  const enabled = useAgentTasksEnabled()
  const encrypted = useNotesStore((s) => {
    const noteId = enabled ? agentNoteId(editor) : null
    return noteId ? !!s.notes.find((n) => n.id === noteId)?.encryption : false
  })
  return enabled && !encrypted
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
  return resolveAgentDisplayState(agentState, { hasBlock, lastSignal, settled, staleMinutes, nowMs: now })
}

/**
 * The same state to show, read from the store NOW (no subscription): for the
 * code that decides on a click, and for the queue bar, which follows the store
 * by itself.
 */
export function agentDisplayStateNow(agentId: string, agentState: string): string {
  const s = useAgentTasksStore.getState()
  const block = s.byId[agentId]
  return resolveAgentDisplayState(agentState, {
    hasBlock: block !== undefined,
    lastSignal: block?.meta.lastSignal,
    settled: s.pendingLoads === 0 && Object.keys(s.byDir).length > 0,
    staleMinutes: s.settings.staleMinutes,
    nowMs: s.now,
  })
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
export function newAgentTaskIdFor(editor: Editor, alsoTaken?: Iterable<string>): string {
  const taken = agentIdsInDoc(editor.state.doc)
  // Ids handed out for the same edit, not in the document yet (several tasks queued at once).
  for (const id of alsoTaken ?? []) taken.add(id)
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

/**
 * The prompt that hands `taskIds` (in order) — and / or `contextText` — to an
 * agent, for the note and section this editor shows, in the app's language
 * and with the "when finished" of the settings (lib/agentPrompt.ts).
 */
export function agentPromptFor(editor: Editor, taskIds: readonly string[], contextText?: string | null): string {
  const storage = agentStorage(editor)
  const note = storage?.noteId ? useNotesStore.getState().notes.find((n) => n.id === storage.noteId) : undefined
  // The section this editor was told it shows; an editor that was not told (a
  // sticky window) names the one whose text carries the first task.
  const marker = taskIds.length > 0 ? `\u{1F916}${taskIds[0]}:` : null
  const section = note?.sections.find((s) => s.id === storage?.sectionId)
    ?? (marker ? note?.sections.find((s) => s.content.includes(marker)) : undefined)
    ?? note?.sections[0]
  const { lang, dict } = useLanguageStore.getState()
  return buildAgentPrompt({
    noteTitle: note?.title.trim() || dict.common.untitled,
    sectionName: section?.name ?? '',
    taskIds,
    contextText,
    onFinish: useAgentTasksStore.getState().settings.onFinish,
    lang,
    randomByte: () => crypto.getRandomValues(new Uint8Array(1))[0],
  })
}

/** How long a copy waits for the note to be written before going ahead anyway. */
const COPY_SETTLE_MS = 3000

/**
 * Copies the prompt of agentPromptFor. With tasks, the note is WRITTEN first
 * (the editor's pending edit is flushed and its writes awaited —
 * settleNoteWrites): the marker of a task queued a moment ago is on disk by
 * the time the user pastes the prompt. Bounded: a stuck write does not keep
 * the copy from happening. False when there is nothing to copy or the
 * clipboard refuses.
 */
export async function copyAgentPrompt(editor: Editor, taskIds: readonly string[], contextText?: string | null): Promise<boolean> {
  const prompt = agentPromptFor(editor, taskIds, contextText)
  if (!prompt) return false
  const noteId = agentNoteId(editor)
  if (taskIds.length > 0 && noteId) {
    await Promise.race([
      settleNoteWrites(noteId).catch((err) => { console.error('Failed to save the note before copying the prompt:', err) }),
      new Promise((resolve) => setTimeout(resolve, COPY_SETTLE_MS)),
    ])
  }
  try {
    await navigator.clipboard.writeText(prompt)
    return true
  } catch (err) {
    console.error('Failed to copy the agent prompt:', err)
    return false
  }
}
