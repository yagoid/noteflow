// Agent tasks — what main does with a note folder's agent.md (the `agent-tasks:*`
// IPC handlers and the purge of an encrypted note's file), with the disk, the
// sync and the windows INJECTED: main.ts supplies the real ones, the tests
// (tests/electron/agentTasksFile.test.ts) an in-memory folder. The block /
// marker logic itself is agentTasks.ts.
// Docs: .agents/context/note-format.md "Tareas para agentes".

import * as agentTasks from './agentTasks'
import { splitFrontmatter } from './noteFormat'

/** What writing a note folder's agent.md needs from the outside. `dir` = the note folder's name. */
export interface AgentFileDeps {
  /** agent.md's text, null when the folder has none. */
  readAgentText(dir: string): string | null
  writeAgentText(dir: string, content: string): void
  removeAgentFile(dir: string): void
  /** Called BEFORE the disk changes: the watcher must not take the write for an external one. */
  markInternalWrite(relPath: string): void
  /** Carries the new content / the removal to the active sync. */
  pushFile(relPath: string, content: string): void
  pushDelete(relPath: string): void
  /** Tells the windows that the folder's agent.md changed. */
  notifyChanged(dir: string): void
}

/** Plus what reading the note itself needs. */
export interface AgentNoteDeps extends AgentFileDeps {
  /** The folder's note.md, null when unreadable. */
  readNoteMd(dir: string): string | null
  /** The note as parsed from disk (its sections' markdown), null when unreadable. */
  readNote(dir: string): { sections: ReadonlyArray<{ content?: string | null }>; encrypted: boolean } | null
  /** Every note folder of the notes dir. */
  listNoteDirs(): string[]
}

/** Top-level `encryption:` key in a note.md: the note is encrypted. */
export function noteMdLooksEncrypted(noteMd: string): boolean {
  return /^encryption:/m.test(splitFrontmatter(noteMd).frontmatter)
}

/** Is the note folder `dir` encrypted, going by its note.md on disk? (Unreadable → no.) */
export function isNoteDirEncrypted(deps: Pick<AgentNoteDeps, 'readNoteMd'>, dir: string): boolean {
  const noteMd = deps.readNoteMd(dir)
  return noteMd !== null && noteMdLooksEncrypted(noteMd)
}

/**
 * Leaves a note folder's agent.md holding exactly `blocks` (the file is
 * removed when none is left) and carries the change to the sync like any other
 * file of the note: uploaded, or deleted on the remote — the backends only
 * delete an agent.md there while it is still the version this device last saw
 * (another machine's reports are never erased blind). No-op when the disk
 * already holds that. Returns whether the disk changed.
 */
export function writeAgentFile(deps: AgentFileDeps, dir: string, blocks: readonly agentTasks.AgentBlock[]): boolean {
  const rel = `${dir}/${agentTasks.AGENT_MD}`
  const plan = agentTasks.planAgentFileWrite(deps.readAgentText(dir), blocks)
  if (plan.kind === 'none') return false
  deps.markInternalWrite(rel)
  if (plan.kind === 'delete') {
    deps.removeAgentFile(dir)
    deps.pushDelete(rel)
  } else {
    deps.writeAgentText(dir, plan.content)
    deps.pushFile(rel, plan.content)
  }
  deps.notifyChanged(dir)
  return true
}

/**
 * An encrypted note keeps no agent.md: its reports (task titles, cwd, machine,
 * the reports themselves) are plain text and must not sit — nor keep syncing —
 * next to a note whose content is ciphertext. Removed here when the note is
 * encrypted (on the save that sets the password, and again whenever a pull
 * brings the file back). The reports are lost: agent tasks do not apply to
 * encrypted notes. `noteMd`: the note.md just written, when the caller has it
 * (otherwise the one on disk decides).
 */
export function purgeAgentFileIfEncrypted(deps: AgentNoteDeps, dir: string, noteMd?: string): boolean {
  const hasFile = deps.readAgentText(dir) !== null
  // Nothing on disk and nothing kept in memory: nothing to purge (note.md is not even read).
  if (!hasFile && !hasDismissedAgentBlocks(dir)) return false
  if (!(noteMd !== undefined ? noteMdLooksEncrypted(noteMd) : isNoteDirEncrypted(deps, dir))) return false
  // The reports discarded from this note go too — also when the discard of its
  // last task had already removed the file: they are plain text as well.
  forgetDismissedAgentBlocks(dir)
  return hasFile ? writeAgentFile(deps, dir, []) : false
}

/**
 * id → the state on the task's LINE, over every section of a note (strict
 * reading: agentTaskLines). An id on several lines (a sync merge can leave
 * that) keeps a state that is NOT finished if any line has one. Same rule as
 * the renderer's agentLineStates (src/lib/agentTaskUi.ts).
 */
export function agentLineStates(sections: ReadonlyArray<{ content?: string | null }> | null | undefined): Map<string, string> {
  const states = new Map<string, string>()
  for (const s of sections || []) {
    const content = s.content || ''
    if (!content.includes('🤖')) continue
    for (const task of agentTasks.agentTaskLines(content)) {
      if (!task.marker) continue
      const known = states.get(task.marker.id)
      if (known === undefined || agentTasks.AGENT_FINISHED_STATES.includes(known)) states.set(task.marker.id, task.marker.state)
    }
  }
  return states
}

export interface AgentTasksReadResult {
  blocks: agentTasks.AgentBlock[]
  /**
   * Ids of the finished blocks older than `discardAfterDays`. "Finished" is
   * judged by the task's LINE on disk when the note has one for the id (the
   * line rules: a task closed from the app is done there while its block may
   * still say 'review'), else by the block's own state.
   */
  discardable: string[]
}

/** 'agent-tasks:read'. An encrypted note has no agent tasks (and its agent.md, if any, is on its way out). */
export function readAgentTasks(deps: AgentNoteDeps, dir: string, discardAfterDays: number, nowMs: number): AgentTasksReadResult {
  if (isNoteDirEncrypted(deps, dir)) return { blocks: [], discardable: [] }
  const text = deps.readAgentText(dir)
  const blocks = text === null ? [] : agentTasks.parseAgentDoc(text)
  if (blocks.length === 0) return { blocks, discardable: [] }
  const lineStates = agentLineStates(deps.readNote(dir)?.sections)
  return { blocks, discardable: agentTasks.discardableAgentIds(blocks, discardAfterDays, nowMs, lineStates) }
}

/**
 * The blocks the app discarded lately ('agent-tasks:dismiss'), by note folder +
 * id, kept in memory for as long as this process runs (the newest
 * DISMISSED_KEEP). A discard removes the task's marker from its line first; an
 * undo in the editor brings the marker back, and the reconcile that follows
 * brings the block back from here — a Ctrl+Z never loses a report.
 */
const DISMISSED_KEEP = 200
const dismissedBlocks = new Map<string, agentTasks.AgentBlock>()

function dismissedKey(dir: string, id: string): string {
  return `${dir}/${id}`
}

/** Does main keep a discarded block of note folder `dir`? */
export function hasDismissedAgentBlocks(dir: string): boolean {
  for (const key of dismissedBlocks.keys()) if (key.startsWith(`${dir}/`)) return true
  return false
}

/** Forgets the discarded blocks kept for `dir` (every note without one): the note became encrypted, or a test starts over. */
export function forgetDismissedAgentBlocks(dir?: string): void {
  if (dir === undefined) {
    dismissedBlocks.clear()
    return
  }
  for (const key of [...dismissedBlocks.keys()]) if (key.startsWith(`${dir}/`)) dismissedBlocks.delete(key)
}

/**
 * 'agent-tasks:reconcile': makes the block of task `id` mirror its LINE on
 * disk — the app changed the line's state (mark as done, back to the queue,
 * ticking a task, an undo / redo in the editor) and saved it. The state is
 * READ here, never taken from the caller: whatever the line says by now is
 * what the block gets. A block that becomes done / failed without a
 * `finishedAt` gets one (the discard by age counts from it). Nothing else of
 * the block is touched — a task sent back to the queue keeps the facts of its
 * last run until an agent starts it again.
 * Without a block, the one the app discarded for this id comes back (an undo
 * returned the marker its discard had removed), with the line's state and
 * without `orphanedAt`. No-op without a block to update or bring back,
 * without a line for the id, when the two already agree, or for an
 * unreadable / encrypted note. Throws on an id that is not one.
 */
export function reconcileAgentBlock(deps: AgentNoteDeps, dir: string, id: unknown, nowMs: number): { changed: boolean } {
  if (typeof id !== 'string' || !agentTasks.AGENT_ID_RE.test(id)) throw new Error('Invalid task id')
  const key = dismissedKey(dir, id)
  const text = deps.readAgentText(dir)
  const blocks = text === null ? [] : agentTasks.parseAgentDoc(text)
  const found = blocks.find((b) => b.id === id)
  // A block on disk (an agent may have started the task again) wins over the one kept.
  if (found) dismissedBlocks.delete(key)
  const kept = found ? undefined : dismissedBlocks.get(key)
  if (!found && !kept) return { changed: false }
  const note = deps.readNote(dir)
  if (!note || note.encrypted) return { changed: false }
  const state = agentLineStates(note.sections).get(id)
  if (state === undefined) return { changed: false }
  let block: agentTasks.AgentBlock
  if (found) {
    if (found.meta.state === state) return { changed: false }
    block = found
  } else if (kept) {
    const meta = { ...kept.meta }
    delete meta.orphanedAt
    block = { id, meta, body: kept.body }
    blocks.push(block)
    dismissedBlocks.delete(key)
  } else {
    return { changed: false }
  }
  block.meta.state = state
  if (agentTasks.AGENT_FINISHED_STATES.includes(state) && !Number.isFinite(Date.parse(block.meta.finishedAt || ''))) {
    block.meta.finishedAt = new Date(nowMs).toISOString()
  }
  return { changed: writeAgentFile(deps, dir, blocks) }
}

/**
 * 'agent-tasks:dismiss': removes ONE block (and the file with its last one).
 * Never touches a section: the renderer removes the 🤖 marker from the task's
 * line BEFORE asking for this. The removed block is kept in memory
 * (dismissedBlocks): an undo that brings the marker back brings it back too
 * (reconcileAgentBlock). Throws on an id that is not one.
 */
export function dismissAgentTask(deps: AgentFileDeps, dir: string, id: unknown): { removed: boolean } {
  if (typeof id !== 'string' || !agentTasks.AGENT_ID_RE.test(id)) throw new Error('Invalid task id')
  const text = deps.readAgentText(dir)
  const blocks = text === null ? [] : agentTasks.parseAgentDoc(text)
  const next = agentTasks.withoutAgentBlock(blocks, id)
  if (next === blocks) return { removed: false }
  const removed = blocks.find((b) => b.id === id)
  writeAgentFile(deps, dir, next)
  if (removed) {
    const key = dismissedKey(dir, id)
    dismissedBlocks.delete(key)
    dismissedBlocks.set(key, removed)
    if (dismissedBlocks.size > DISMISSED_KEEP) dismissedBlocks.delete(dismissedBlocks.keys().next().value as string)
  }
  return { removed: true }
}

/**
 * 'agent-tasks:maintain': orphan bookkeeping of a note's blocks (same
 * conservative rule as the CLI's maintainAgentFile): a block whose id no
 * section mentions any more is stamped `orphanedAt` and removed a week later;
 * an id that came back loses the stamp. The sections are read from DISK;
 * `liveIds` adds the ids the caller still holds in memory (an editor with
 * unsaved changes) — they are never orphaned. Also rewrites a file that
 * carries the ⚠️ marks of a sync merge. Nothing happens to a note without an
 * agent.md, unreadable or encrypted.
 */
export function maintainAgentTasks(
  deps: AgentNoteDeps,
  dir: string,
  liveIds: unknown,
  nowMs: number,
): { changed: boolean; blocks: agentTasks.AgentBlock[] } {
  const text = deps.readAgentText(dir)
  if (text === null) return { changed: false, blocks: [] }
  const note = deps.readNote(dir)
  if (!note || note.encrypted) return { changed: false, blocks: [] }
  const res = agentTasks.maintainAgentDoc(text, note.sections, Array.isArray(liveIds) ? liveIds : null, nowMs)
  const changed = res.rewrite ? writeAgentFile(deps, dir, res.blocks) : false
  return { changed, blocks: res.blocks }
}

/** The link that opens a Claude Desktop session (Claude Desktop checks the id with the same rule). */
export function agentDesktopSessionUrl(session: string): string {
  if (!agentTasks.AGENT_DESKTOP_SESSION_RE.test(session)) throw new Error('Invalid Claude Desktop session id')
  return `claude://code/continue?session=${encodeURIComponent(session)}`
}

export type AgentSessionLink = { ok: true; url: string } | { ok: false; code: 'no_session' }

/**
 * 'agent-tasks:open-session': the link to the Claude Desktop session task `id`
 * was started from. Everything is read HERE, from the note folder's agent.md on
 * disk — the page only names the note and the task, never an id or a link
 * (agent.md comes from disk and from the sync: what it says is checked like any
 * outside input). 'no_session' unless the block has a valid `desktopSession`
 * and was started on this machine (`host`; agentDesktopSessionHere), or for an
 * unreadable / encrypted note. Throws on an id that is not one.
 */
export function agentSessionLink(deps: AgentNoteDeps, dir: string, id: unknown, host: string): AgentSessionLink {
  if (typeof id !== 'string' || !agentTasks.AGENT_ID_RE.test(id)) throw new Error('Invalid task id')
  if (isNoteDirEncrypted(deps, dir)) return { ok: false, code: 'no_session' }
  const text = deps.readAgentText(dir)
  const block = text === null ? undefined : agentTasks.parseAgentDoc(text).find((b) => b.id === id)
  const session = agentTasks.agentDesktopSessionHere(block?.meta, host)
  return session ? { ok: true, url: agentDesktopSessionUrl(session) } : { ok: false, code: 'no_session' }
}

/**
 * The ids a new task id must not repeat: every marker and every block of every
 * readable note of the notes dir, plus `alsoTaken` (ids the renderer holds in
 * unsaved content).
 */
export function takenAgentIds(deps: AgentNoteDeps, alsoTaken: unknown): Set<string> {
  const taken = new Set<string>()
  if (Array.isArray(alsoTaken)) for (const id of alsoTaken) if (typeof id === 'string') taken.add(id)
  for (const dir of deps.listNoteDirs()) {
    const note = deps.readNote(dir)
    if (note) for (const id of agentTasks.agentIdsIn(note.sections)) taken.add(id)
    const text = deps.readAgentText(dir)
    if (text !== null) for (const block of agentTasks.parseAgentDoc(text)) taken.add(block.id)
  }
  return taken
}

/**
 * 'agent-tasks:set-settings': the `agentTasks` object to store after `patch`
 * (unknown keys kept), the sanitized settings to answer with, and whether the
 * stored object changes at all (no write, no broadcast when it doesn't).
 */
export function planAgentSettingsUpdate(
  stored: unknown,
  patch: unknown,
): { next: Record<string, unknown>; settings: agentTasks.AgentTaskSettings; changed: boolean } {
  const next = agentTasks.patchAgentTaskSettings(stored, patch)
  return {
    next,
    settings: agentTasks.sanitizeAgentTaskSettings(next),
    changed: JSON.stringify(next) !== JSON.stringify(stored),
  }
}
