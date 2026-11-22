import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import type { Editor } from '@tiptap/core'
import { AGENT_LIVE_STATES, agentIdsIn, newAgentTaskId } from '../../lib/agentTasks'
import { agentIdsInDoc } from '../../lib/agentTaskNodes'
import { buildAgentPrompt } from '../../lib/agentPrompt'
import { agentNamedKey, agentRunAgentKey, agentRunErrorKey, agentRunFailureOutcome, agentRunVisible, type AgentRunOutcome } from '../../lib/agentRun'
import { agentCheckByLine, agentCheckEffect, noteHasAgentMarkers, resolveAgentDisplayState, type AgentCheckEffect, type AgentCheckRule, type AgentTone } from '../../lib/agentTaskUi'
import { useAgentTasksStore } from '../../stores/agentTasksStore'
import { useLanguageStore } from '../../stores/languageStore'
import { settleNoteWrites, useNotesStore } from '../../stores/notesStore'
import type { Messages } from '../../i18n'
import { tf } from '../../i18n/format'

// Agent tasks in the editor: what the task item NodeView, the kanban board and
// the editor shell share. The components are AgentTaskChip.tsx (the chip) and
// AgentReportPopover.tsx (the report menu); the rules, lib/agentTaskUi.ts.

/** Name of the task item extension: its storage carries the note the editor shows (`noteId`). */
const TASK_ITEM_STORAGE = 'taskItem'

interface AgentStorage {
  noteId?: string | null
  sectionId?: string | null
  /** The note is encrypted (even unlocked): nothing of it can be handed to an agent. */
  encrypted?: boolean
  /** The task views of this editor that follow `encrypted` (useAgentSendAllowed). */
  listeners?: Set<() => void>
}

function agentStorage(editor: Editor): AgentStorage | undefined {
  return (editor.storage as Record<string, AgentStorage | undefined>)[TASK_ITEM_STORAGE]
}

/**
 * Tells the editor's task items and boards which note — and section of it —
 * they belong to, and whether that note is encrypted (Editor.tsx, like the
 * drawing node's target). The editor resolves the note ONCE; its tasks read it
 * from here instead of searching the notes store each.
 */
export function setAgentNoteId(editor: Editor, noteId: string | null, sectionId: string | null = null, encrypted = false): void {
  const storage = agentStorage(editor)
  if (!storage) return
  storage.noteId = noteId
  storage.sectionId = noteId ? sectionId : null
  const next = noteId ? encrypted : false
  if ((storage.encrypted ?? false) === next) return
  storage.encrypted = next
  storage.listeners?.forEach((listener) => listener())
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
 * tasks that already carry a marker show either way.) Whether the note is
 * encrypted is resolved once per EDITOR (Editor.tsx → setAgentNoteId) and read
 * here from the editor's storage: a task never searches the notes store, and
 * does not re-render when some other note changes.
 */
export function useAgentSendAllowed(editor: Editor): boolean {
  const enabled = useAgentTasksEnabled()
  const encrypted = useAgentEditorEncrypted(editor)
  return enabled && !encrypted
}

/**
 * Is the note this editor shows encrypted (even unlocked)? Read from the
 * editor's storage (setAgentNoteId), so a task re-renders only when THAT
 * changes. An encrypted note keeps no agent reports (main deletes its
 * agent.md): its tasks show the state on their line as it is — no "no
 * signal" deduced from a block that can never be there — and the report says
 * why it is empty.
 */
export function useAgentEditorEncrypted(editor: Editor): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const storage = agentStorage(editor)
    if (!storage) return () => undefined
    const listeners = (storage.listeners ??= new Set())
    listeners.add(onChange)
    return () => { listeners.delete(onChange) }
  }, [editor])
  return useSyncExternalStore(subscribe, () => agentStorage(editor)?.encrypted === true)
}

/**
 * Is the note `noteId` encrypted? One lookup per editor (Editor.tsx hands the
 * answer to setAgentNoteId) — with the feature off too: the tasks of an
 * encrypted note that already carry a marker still show (useAgentEditorEncrypted).
 */
export function useAgentNoteEncrypted(noteId: string | undefined, plain: boolean): boolean {
  return useNotesStore((s) => (!plain && noteId ? !!s.notes.find((n) => n.id === noteId)?.encryption : false))
}

/** The same, read now (before the editor's first render). */
export function agentNoteEncryptedNow(noteId: string | null | undefined): boolean {
  return noteId ? !!useNotesStore.getState().notes.find((n) => n.id === noteId)?.encryption : false
}

/**
 * The state to SHOW for a task's marker (null without one): the line's, or
 * 'no-signal' for a running / waiting task whose block has been silent for too
 * long — or has no block here once the note's reports are loaded. In an
 * ENCRYPTED note (`encrypted`), always the line's: it keeps no blocks, so
 * a missing one says nothing about the agent.
 */
export function useAgentDisplayState(agentId: string | null | undefined, agentState: string | null | undefined, encrypted = false): string | null {
  const id = agentId ?? ''
  const live = !encrypted && !!id && !!agentState && AGENT_LIVE_STATES.includes(agentState)
  // Only a live task depends on the block and on the clock: the rest never re-render with them.
  const lastSignal = useAgentTasksStore((s) => (live ? s.byId[id]?.meta.lastSignal ?? null : null))
  const hasBlock = useAgentTasksStore((s) => (live ? s.byId[id] !== undefined : false))
  const staleMinutes = useAgentTasksStore((s) => s.settings.staleMinutes)
  const now = useAgentTasksStore((s) => (live ? s.now : 0))
  const settled = useAgentTasksStore((s) => (live ? s.pendingLoads === 0 && Object.keys(s.byDir).length > 0 : true))
  if (!agentId || !agentState) return null
  if (encrypted) return agentState
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

/** What ticking the box of the task with this marker does NOW (agentCheckEffect of the state shown: a silent running task is "no signal"). */
export function agentCheckEffectNow(agentId: string | null | undefined, agentState: string | null | undefined): AgentCheckEffect {
  return agentId && agentState ? agentCheckEffect(agentDisplayStateNow(agentId, agentState)) : 'keep'
}

/**
 * The rule of the box for the tasks of THIS editor, read when it is applied:
 * agentCheckEffectNow — or, in an ENCRYPTED note, the state on the line as it
 * is (agentCheckByLine): that is the state its chip, box and report show
 * (useAgentDisplayState with `encrypted`), so ticking never closes a task
 * whose own box refuses to tick, depending on the reports of other notes.
 */
export function agentCheckRuleOf(editor: Editor): AgentCheckRule {
  return (agentId, agentState) => (agentStorage(editor)?.encrypted === true ? agentCheckByLine(agentId, agentState) : agentCheckEffectNow(agentId, agentState))
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
 * and with the "when finished" and "several tasks" of the settings
 * (lib/agentPrompt.ts).
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
    batchMode: useAgentTasksStore.getState().settings.batchMode,
    lang,
    randomByte: () => crypto.getRandomValues(new Uint8Array(1))[0],
  })
}

// "Run" ─ launch an agent on the tasks (lib/agentRun.ts; main: electron/agentRunIo.ts).

/** Is "Run" offered next to "Copy prompt"? (Not in a terminal where this build cannot open one with the CLI, nor on Windows without Node.js.) */
export function useAgentRunVisible(): boolean {
  const launch = useAgentTasksStore((s) => s.settings.launch)
  const agent = useAgentTasksStore((s) => s.settings.agent)
  const terminal = useAgentTasksStore((s) => s.runTerminal)
  const node = useAgentTasksStore((s) => s.runNode)
  return agentRunVisible({ launch, agent }, terminal, node)
}

/** The name of the agent "Run" launches with the current settings ("Claude Code", "Claude Desktop"…). */
export function agentRunAgentName(t: Messages): string {
  return t.editor.agentTask.run.agents[agentRunAgentKey(useAgentTasksStore.getState().settings)]
}

/**
 * The name of the agent a task is handed to, as chosen in Settings → AI → Agent tasks → Run with
 * ("Claude Code", "Claude Desktop"…); null for a custom command or link, and while `active` is false
 * (then nothing is read: a task that shows no hint does not follow the setting).
 */
export function useAgentHandName(t: Messages, active: boolean): string | null {
  const key = useAgentTasksStore((s) => (active ? agentNamedKey(s.settings) : null))
  return key ? t.editor.agentTask.run.agents[key] : null
}

/** The tooltip of a "Run" button: what it opens, with which agent. */
export function agentRunHint(t: Messages): string {
  const { launch } = useAgentTasksStore.getState().settings
  const run = t.editor.agentTask.run
  return tf(launch === 'terminal' ? run.hintTerminal : run.hintApp, { agent: agentRunAgentName(t) })
}

/** How long a run waits for the note to be written: the CLI reads the tasks from disk. */
const RUN_SETTLE_MS = 10_000
/** Set once the "press Enter in the app" hint has been shown after opening a desktop app. */
const ENTER_HINT_SEEN_KEY = 'noteflow.agentRun.enterHintSeen'

/**
 * The first step of every "Run", BEFORE any task is queued or moved: main
 * checks everything that can be known already ('agent-run:preflight') — the
 * feature on, the note's project folder (asked for with the native dialog when
 * it has none or it is gone), a custom command / link approved by the user in
 * main's own dialog, and, for a terminal, the agent installed.
 * Null = go ahead. Otherwise what to report, and NOTHING else may happen:
 * `canceled` when the user closed a dialog, an error with its code when the
 * run cannot start.
 * It first waits for the settings being written: a model typed in the Run menu
 * is saved as that menu closes — the press on Run closes it — and main reads
 * the run's settings from settings.json.
 */
export async function prepareAgentRun(editor: Editor): Promise<AgentRunOutcome | null> {
  const noteId = agentNoteId(editor)
  if (!noteId) return { kind: 'error', code: 'invalid_request' }
  await useAgentTasksStore.getState().settingsSettled()
  try {
    const res = await window.noteflow.agentRunPreflight(noteId)
    if (res.ok) {
      useAgentTasksStore.getState().setFolder(noteId, res.folder)
      return null
    }
    if (res.code !== 'canceled') console.warn('The agent cannot be run:', res.code, res.detail ?? '')
    if (res.code === 'disabled') await useAgentTasksStore.getState().reloadSettings()
    return agentRunFailureOutcome(res)
  } catch (err) {
    console.error('Failed to prepare the run:', err)
    return { kind: 'error', code: 'failed' }
  }
}

/**
 * Launches the agent of the settings on `taskIds` (in order) — and / or on
 * `contextText` — in the note's project folder (prepareAgentRun first).
 *   - Terminal: main validates the run with the CLI and opens a terminal on
 *     `noteflow run`. With tasks it gets the ids and the context; without, the
 *     text-only prompt.
 *   - Desktop app: main opens its link with the SAME prompt "Copy prompt" gives.
 * With tasks the note is written first (the CLI and the agent read them from
 * disk). Never throws: a failure is an outcome with its code.
 */
export async function runAgentTasks(editor: Editor, taskIds: readonly string[], contextText?: string | null): Promise<AgentRunOutcome> {
  const noteId = agentNoteId(editor)
  if (!noteId) return { kind: 'error', code: 'invalid_request' }
  const { launch } = useAgentTasksStore.getState().settings
  try {
    if (taskIds.length > 0) {
      await Promise.race([
        settleNoteWrites(noteId).catch((err) => { console.error('Failed to save the note before running the agent:', err) }),
        new Promise((resolve) => setTimeout(resolve, RUN_SETTLE_MS)),
      ])
    }
    const failed = (res: { code: string; agent?: string; detail?: string }): AgentRunOutcome => {
      if (res.code !== 'canceled') console.warn('Could not run the agent:', res.code, res.detail ?? '')
      if (res.code === 'disabled') void useAgentTasksStore.getState().reloadSettings()
      return agentRunFailureOutcome(res)
    }
    if (launch === 'terminal') {
      const res = await window.noteflow.agentRunTerminal(taskIds.length > 0
        ? { noteId, ids: [...taskIds], context: contextText ?? null }
        : { noteId, ids: [], prompt: agentPromptFor(editor, [], contextText) })
      return res.ok ? { kind: 'terminal' } : failed(res)
    }
    const res = await window.noteflow.agentRunOpenApp({ noteId, prompt: agentPromptFor(editor, taskIds, contextText) })
    return res.ok ? { kind: 'app', promptCopied: res.promptCopied } : failed(res)
  } catch (err) {
    console.error('Failed to run the agent:', err)
    return { kind: 'error', code: 'failed' }
  }
}

/**
 * What to tell the user after a run, null when there is nothing to say (the
 * folder dialog was cancelled). `ok` reads as done; `warn` is a failure — or
 * a prompt that had to be copied instead of sent. The first time a desktop app
 * opens, the text adds that the prompt is waiting there for Enter.
 */
export function agentRunFeedback(t: Messages, outcome: AgentRunOutcome): { text: string; tone: 'ok' | 'warn' } | null {
  const run = t.editor.agentTask.run
  const agent = agentRunAgentName(t)
  if (outcome.kind === 'canceled') return null
  if (outcome.kind === 'terminal') return { text: run.openingTerminal, tone: 'ok' }
  if (outcome.kind === 'app') {
    if (outcome.promptCopied) return { text: tf(run.promptCopiedPaste, { agent }), tone: 'warn' }
    let first = false
    try {
      first = localStorage.getItem(ENTER_HINT_SEEN_KEY) === null
      if (first) localStorage.setItem(ENTER_HINT_SEEN_KEY, '1')
    } catch {
      first = false // no storage: the tooltip of the button says it anyway
    }
    return { text: tf(first ? run.openedAppFirst : run.openedApp, { agent }), tone: 'ok' }
  }
  // "Not found": the agent the CLI looked for, by its name when it is one of ours.
  const agents = run.agents as Record<string, string | undefined>
  const missing = outcome.agent ? agents[outcome.agent] ?? outcome.agent : agent
  const text = tf(run.errors[agentRunErrorKey(outcome.code)], { agent: missing })
  // The launch failed after this click had queued tasks: they stay queued — say so.
  return { text: outcome.queued ? `${text}. ${run.tasksStayQueued}` : text, tone: 'warn' }
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
