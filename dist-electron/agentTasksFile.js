"use strict";
// Agent tasks — what main does with a note folder's agent.md (the `agent-tasks:*`
// IPC handlers and the purge of an encrypted note's file), with the disk, the
// sync and the windows INJECTED: main.ts supplies the real ones, the tests
// (tests/electron/agentTasksFile.test.ts) an in-memory folder. The block /
// marker logic itself is agentTasks.ts.
// Docs: .agents/context/note-format.md "Tareas para agentes".
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.noteMdLooksEncrypted = noteMdLooksEncrypted;
exports.isNoteDirEncrypted = isNoteDirEncrypted;
exports.writeAgentFile = writeAgentFile;
exports.purgeAgentFileIfEncrypted = purgeAgentFileIfEncrypted;
exports.agentLineStates = agentLineStates;
exports.readAgentTasks = readAgentTasks;
exports.reconcileAgentBlock = reconcileAgentBlock;
exports.dismissAgentTask = dismissAgentTask;
exports.maintainAgentTasks = maintainAgentTasks;
exports.takenAgentIds = takenAgentIds;
exports.planAgentSettingsUpdate = planAgentSettingsUpdate;
const agentTasks = __importStar(require("./agentTasks"));
const noteFormat_1 = require("./noteFormat");
/** Top-level `encryption:` key in a note.md: the note is encrypted. */
function noteMdLooksEncrypted(noteMd) {
    return /^encryption:/m.test((0, noteFormat_1.splitFrontmatter)(noteMd).frontmatter);
}
/** Is the note folder `dir` encrypted, going by its note.md on disk? (Unreadable → no.) */
function isNoteDirEncrypted(deps, dir) {
    const noteMd = deps.readNoteMd(dir);
    return noteMd !== null && noteMdLooksEncrypted(noteMd);
}
/**
 * Leaves a note folder's agent.md holding exactly `blocks` (the file is
 * removed when none is left) and carries the change to the sync like any other
 * file of the note: uploaded, or deleted on the remote — the backends only
 * delete an agent.md there while it is still the version this device last saw
 * (another machine's reports are never erased blind). No-op when the disk
 * already holds that. Returns whether the disk changed.
 */
function writeAgentFile(deps, dir, blocks) {
    const rel = `${dir}/${agentTasks.AGENT_MD}`;
    const plan = agentTasks.planAgentFileWrite(deps.readAgentText(dir), blocks);
    if (plan.kind === 'none')
        return false;
    deps.markInternalWrite(rel);
    if (plan.kind === 'delete') {
        deps.removeAgentFile(dir);
        deps.pushDelete(rel);
    }
    else {
        deps.writeAgentText(dir, plan.content);
        deps.pushFile(rel, plan.content);
    }
    deps.notifyChanged(dir);
    return true;
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
function purgeAgentFileIfEncrypted(deps, dir, noteMd) {
    if (deps.readAgentText(dir) === null)
        return false;
    if (!(noteMd !== undefined ? noteMdLooksEncrypted(noteMd) : isNoteDirEncrypted(deps, dir)))
        return false;
    return writeAgentFile(deps, dir, []);
}
/**
 * id → the state on the task's LINE, over every section of a note (strict
 * reading: agentTaskLines). An id on several lines (a sync merge can leave
 * that) keeps a state that is NOT finished if any line has one. Same rule as
 * the renderer's agentLineStates (src/lib/agentTaskUi.ts).
 */
function agentLineStates(sections) {
    const states = new Map();
    for (const s of sections || []) {
        const content = s.content || '';
        if (!content.includes('🤖'))
            continue;
        for (const task of agentTasks.agentTaskLines(content)) {
            if (!task.marker)
                continue;
            const known = states.get(task.marker.id);
            if (known === undefined || agentTasks.AGENT_FINISHED_STATES.includes(known))
                states.set(task.marker.id, task.marker.state);
        }
    }
    return states;
}
/** 'agent-tasks:read'. An encrypted note has no agent tasks (and its agent.md, if any, is on its way out). */
function readAgentTasks(deps, dir, discardAfterDays, nowMs) {
    if (isNoteDirEncrypted(deps, dir))
        return { blocks: [], discardable: [] };
    const text = deps.readAgentText(dir);
    const blocks = text === null ? [] : agentTasks.parseAgentDoc(text);
    if (blocks.length === 0)
        return { blocks, discardable: [] };
    const lineStates = agentLineStates(deps.readNote(dir)?.sections);
    return { blocks, discardable: agentTasks.discardableAgentIds(blocks, discardAfterDays, nowMs, lineStates) };
}
/**
 * 'agent-tasks:reconcile': makes the block of task `id` mirror its LINE on
 * disk — the app changed the line's state (mark as done, back to the queue,
 * ticking a task left to review) and saved it. The state is READ here, never
 * taken from the caller: whatever the line says by now is what the block gets.
 * A block that becomes done / failed without a `finishedAt` gets one (the
 * discard by age counts from it). Nothing else of the block is touched — a
 * task sent back to the queue keeps the facts of its last run until an agent
 * starts it again. No-op without a block, without a line for the id, when the
 * two already agree, or for an unreadable / encrypted note. Throws on an id
 * that is not one.
 */
function reconcileAgentBlock(deps, dir, id, nowMs) {
    if (typeof id !== 'string' || !agentTasks.AGENT_ID_RE.test(id))
        throw new Error('Invalid task id');
    const text = deps.readAgentText(dir);
    if (text === null)
        return { changed: false };
    const blocks = agentTasks.parseAgentDoc(text);
    const block = blocks.find((b) => b.id === id);
    if (!block)
        return { changed: false };
    const note = deps.readNote(dir);
    if (!note || note.encrypted)
        return { changed: false };
    const state = agentLineStates(note.sections).get(id);
    if (state === undefined || block.meta.state === state)
        return { changed: false };
    block.meta.state = state;
    if (agentTasks.AGENT_FINISHED_STATES.includes(state) && !Number.isFinite(Date.parse(block.meta.finishedAt || ''))) {
        block.meta.finishedAt = new Date(nowMs).toISOString();
    }
    return { changed: writeAgentFile(deps, dir, blocks) };
}
/**
 * 'agent-tasks:dismiss': removes ONE block (and the file with its last one).
 * Never touches a section: the renderer removes the 🤖 marker from the task's
 * line BEFORE asking for this. Throws on an id that is not one.
 */
function dismissAgentTask(deps, dir, id) {
    if (typeof id !== 'string' || !agentTasks.AGENT_ID_RE.test(id))
        throw new Error('Invalid task id');
    const text = deps.readAgentText(dir);
    const blocks = text === null ? [] : agentTasks.parseAgentDoc(text);
    const next = agentTasks.withoutAgentBlock(blocks, id);
    if (next === blocks)
        return { removed: false };
    writeAgentFile(deps, dir, next);
    return { removed: true };
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
function maintainAgentTasks(deps, dir, liveIds, nowMs) {
    const text = deps.readAgentText(dir);
    if (text === null)
        return { changed: false, blocks: [] };
    const note = deps.readNote(dir);
    if (!note || note.encrypted)
        return { changed: false, blocks: [] };
    const res = agentTasks.maintainAgentDoc(text, note.sections, Array.isArray(liveIds) ? liveIds : null, nowMs);
    const changed = res.rewrite ? writeAgentFile(deps, dir, res.blocks) : false;
    return { changed, blocks: res.blocks };
}
/**
 * The ids a new task id must not repeat: every marker and every block of every
 * readable note of the notes dir, plus `alsoTaken` (ids the renderer holds in
 * unsaved content).
 */
function takenAgentIds(deps, alsoTaken) {
    const taken = new Set();
    if (Array.isArray(alsoTaken))
        for (const id of alsoTaken)
            if (typeof id === 'string')
                taken.add(id);
    for (const dir of deps.listNoteDirs()) {
        const note = deps.readNote(dir);
        if (note)
            for (const id of agentTasks.agentIdsIn(note.sections))
                taken.add(id);
        const text = deps.readAgentText(dir);
        if (text !== null)
            for (const block of agentTasks.parseAgentDoc(text))
                taken.add(block.id);
    }
    return taken;
}
/**
 * 'agent-tasks:set-settings': the `agentTasks` object to store after `patch`
 * (unknown keys kept), the sanitized settings to answer with, and whether the
 * stored object changes at all (no write, no broadcast when it doesn't).
 */
function planAgentSettingsUpdate(stored, patch) {
    const next = agentTasks.patchAgentTaskSettings(stored, patch);
    return {
        next,
        settings: agentTasks.sanitizeAgentTaskSettings(next),
        changed: JSON.stringify(next) !== JSON.stringify(stored),
    };
}
