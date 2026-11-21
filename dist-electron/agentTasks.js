"use strict";
// Agent tasks — pure logic (no fs, no Electron, no Node-only API).
//
// A checklist task ('- [ ] …') can be handed to an external AI agent through
// the CLI ('noteflow task …', cli/noteflow.js section "Agent tasks"). Two
// pieces, both synced:
//  - the STATE travels on the task's own line, as a marker written after the
//    📅/⏰/🔺 annotations:  - [ ] Fix X 📅2026-12-01 🔺high 🤖k3f9a:running
//  - the DETAIL lives in the note folder's reserved agent.md (AGENT_MD — NOT a
//    section, never listed in note.md), one block per task:
//        <!-- task:k3f9a -->
//        key: value
//        ---
//        …markdown report…
//        <!-- /task:k3f9a -->
// The LINE is the source of truth for the state; 'no-signal' is derived and
// never written. Docs: .agents/context/note-format.md "Tareas para agentes".
//
// ⚠️ MIRRORS: this file and src/lib/agentTasks.ts are the SAME text below the
// marker line (electron/ does not import from src/ and vice versa), and both
// must behave exactly like the CLI's functions of the same name. Pinned by
// tests/electron/agentTasks.test.ts (file identity + parity with the CLI).
// ── mirrored below this line ──
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_AGENT_TASK_SETTINGS = exports.AGENT_MODEL_RE = exports.AGENT_MODEL_PRESETS = exports.AGENT_TEMPLATE_MAX = exports.AGENT_RUN_PRESET_NAMES = exports.AGENT_LAUNCH_MODES = exports.AGENT_META_KEYS = exports.AGENT_MARKER_RE = exports.AGENT_STATE_RE = exports.AGENT_ID_RE = exports.AGENT_ORPHAN_TTL_MS = exports.AGENT_DISCARD_AFTER_DAYS = exports.AGENT_STALE_MINUTES = exports.AGENT_NO_SIGNAL = exports.AGENT_FINISHED_STATES = exports.AGENT_LIVE_STATES = exports.AGENT_TASK_STATES = exports.AGENT_MD = void 0;
exports.isAgentFile = isAgentFile;
exports.isAgentFilePath = isAgentFilePath;
exports.agentMarkerText = agentMarkerText;
exports.stripAgentMarkers = stripAgentMarkers;
exports.agentTaskText = agentTaskText;
exports.parseAgentTaskLine = parseAgentTaskLine;
exports.withAgentMarker = withAgentMarker;
exports.pickAgentTaskLine = pickAgentTaskLine;
exports.agentTaskLines = agentTaskLines;
exports.setAgentMarkerInContent = setAgentMarkerInContent;
exports.clearAgentMarkersInContent = clearAgentMarkersInContent;
exports.agentDisplayState = agentDisplayState;
exports.parseAgentDoc = parseAgentDoc;
exports.serializeAgentDoc = serializeAgentDoc;
exports.agentDocHasConflictMarks = agentDocHasConflictMarks;
exports.maintainAgentBlocks = maintainAgentBlocks;
exports.agentIdsIn = agentIdsIn;
exports.discardableAgentIds = discardableAgentIds;
exports.maintainAgentDoc = maintainAgentDoc;
exports.planAgentFileWrite = planAgentFileWrite;
exports.withoutAgentBlock = withoutAgentBlock;
exports.newAgentTaskId = newAgentTaskId;
exports.agentRunModel = agentRunModel;
exports.sanitizeAgentTaskSettings = sanitizeAgentTaskSettings;
exports.patchAgentTaskSettings = patchAgentTaskSettings;
exports.agentFileDeletedRemotely = agentFileDeletedRemotely;
exports.userFacingSectionFiles = userFacingSectionFiles;
/** Reserved file of a note folder: the agent-task reports. Not a section. */
exports.AGENT_MD = 'agent.md';
exports.AGENT_TASK_STATES = ['queued', 'running', 'waiting', 'review', 'done', 'failed', 'interrupted'];
exports.AGENT_LIVE_STATES = ['running', 'waiting'];
/** States of a task whose agent is through with it: their blocks may be discarded by age. */
exports.AGENT_FINISHED_STATES = ['done', 'failed'];
exports.AGENT_NO_SIGNAL = 'no-signal';
exports.AGENT_STALE_MINUTES = 90;
exports.AGENT_DISCARD_AFTER_DAYS = 30;
exports.AGENT_ORPHAN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
exports.AGENT_ID_RE = /^[a-z0-9]{5}$/;
exports.AGENT_STATE_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;
const AGENT_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
// THE marker: '🤖<id>:<state>' as its own word of a task line. Written at the
// end of the line; read anywhere in it. The state is any word: an unknown one
// (a newer client) is kept as opaque text and never overwritten.
exports.AGENT_MARKER_RE = /(^|[ \t])🤖([a-z0-9]{5}):([A-Za-z][A-Za-z0-9_-]*)(?=[ \t]|$)/u;
const AGENT_MARKER_ALL_RE = new RegExp(exports.AGENT_MARKER_RE.source, 'gu');
// The same marker in a text of several lines (LF or CRLF).
const AGENT_MARKER_LINES_RE = /(^|[ \t])🤖([a-z0-9]{5}):([A-Za-z][A-Za-z0-9_-]*)(?=[ \t\r]|$)/gmu;
const AGENT_TASK_LINE_RE = /^([ \t]*[-*+] \[([ xX])\])(?: (.*))?$/;
// Same annotations as extractDeadlineAnnotations (src/lib/markdownInline.ts).
const AGENT_ANNOTATIONS_RE = /📅\d{4}-\d{2}-\d{2}|⏰\d{2}:\d{2}|🔺(?:low|medium|high)/gu;
/** Is this file name (inside a note folder) the reserved agent-task file? */
function isAgentFile(name) {
    return name === exports.AGENT_MD;
}
/** Is this notes-dir-relative path ('<dir>/<file>') a note folder's agent.md? */
function isAgentFilePath(relPath) {
    const i = relPath.indexOf('/');
    return i > 0 && relPath.slice(i + 1) === exports.AGENT_MD;
}
/** The marker text of a task: '🤖<id>:<state>', or '' when either part is not writable. */
function agentMarkerText(id, state) {
    return id && state && exports.AGENT_ID_RE.test(id) && exports.AGENT_STATE_RE.test(state) ? `🤖${id}:${state}` : '';
}
/**
 * `text` (any number of lines) without its agent markers: each one goes with
 * the whitespace right before it, nothing else changes. For every place that
 * shows or counts the text of a note outside the editor: search, word counts,
 * snippets, notifications, the semantic index. Never for text that is saved.
 */
function stripAgentMarkers(text) {
    if (!text.includes('🤖'))
        return text;
    return text.replace(AGENT_MARKER_LINES_RE, '');
}
/** A task's text as shown to people and agents — no 🤖 marker, no 📅/⏰/🔺 annotations. */
function agentTaskText(body) {
    return String(body || '').replace(AGENT_MARKER_ALL_RE, ' ').replace(AGENT_ANNOTATIONS_RE, ' ').replace(/\s+/g, ' ').trim();
}
/** One physical line as a checklist task, or null when it isn't one. */
function parseAgentTaskLine(line) {
    const m = AGENT_TASK_LINE_RE.exec(line);
    if (!m)
        return null;
    const body = m[3] || '';
    const mk = exports.AGENT_MARKER_RE.exec(body);
    return { line, checked: m[2] !== ' ', body, text: agentTaskText(body), marker: mk ? { id: mk[2], state: mk[3] } : null };
}
/**
 * `line` (a task line) with its marker set to '🤖<id>:<state>' at the END of
 * the line — after the 📅/⏰/🔺 annotations — or removed (`state` null). Any
 * marker already there is dropped first. Not a task line → unchanged.
 */
function withAgentMarker(line, id, state) {
    const m = AGENT_TASK_LINE_RE.exec(line);
    if (!m)
        return line;
    const raw = m[3] || '';
    let body = raw.replace(AGENT_MARKER_ALL_RE, '').replace(/[ \t]+$/, '');
    if (/^🤖/u.test(raw))
        body = body.replace(/^[ \t]+/, '');
    return [m[1], body, state ? `🤖${id}:${state}` : ''].filter(Boolean).join(' ');
}
// Rank of a marker state for the sync's line merge (pickAgentTaskLine): how far
// along the task's life the state is. A task goes queued → running ⇄ waiting →
// done / failed / review; 'interrupted' is what the wrapper of a run writes
// over a running / waiting task once its agent has exited, so it is later than
// both; 'review' is a finish that still waits for the user's check, 'done' /
// 'failed' are the agent's last word. States of one rank (running vs waiting,
// done vs failed) are not ordered: the merging device's line wins.
const AGENT_STATE_RANK = new Map([
    ['queued', 0], ['running', 1], ['waiting', 1], ['interrupted', 2], ['review', 3], ['done', 4], ['failed', 4],
]);
/** A task line with a marker → what must match for two lines to be the same task: the line without its box state and its marker states. */
function agentTaskLineKey(line) {
    const m = AGENT_TASK_LINE_RE.exec(line);
    if (!m)
        return null;
    const body = m[3] || '';
    const mk = exports.AGENT_MARKER_RE.exec(body);
    if (!mk)
        return null;
    return { id: mk[2], state: mk[3], key: `${m[1].slice(0, -2)} ]${body.replace(AGENT_MARKER_ALL_RE, '$1🤖$2:')}` };
}
/**
 * Two versions of ONE line that a sync merge found changed on both sides
 * (`local`: the merging device's, `remote`: the one already synced). When they
 * are the same agent task — both task lines, a marker with the same id, the
 * same text once the box state and the marker state are left out — returns the
 * line to keep, WHOLE (its box included):
 *  - `base` (the lines the common base had in that place, when known) holds
 *    one of the two lines literally and not the other → that side did not
 *    touch the task: the OTHER line wins, whatever the states. A state may go
 *    back on purpose — `task start` restarts an interrupted / failed / review
 *    task — and the rank below must never undo that;
 *  - else (both sides changed it, or nothing is known of the base) the one
 *    whose state is further along (AGENT_STATE_RANK); the local one on a tie.
 * Returns null when they are not the same task, or when the rank has to decide
 * and one of the states is unknown to this version (never judged): the merge
 * then keeps both, as before.
 */
function pickAgentTaskLine(local, remote, base = []) {
    if (local === remote)
        return local;
    const l = agentTaskLineKey(local);
    if (!l)
        return null;
    const r = agentTaskLineKey(remote);
    if (!r || l.id !== r.id || l.key !== r.key)
        return null;
    const localUntouched = base.includes(local);
    if (localUntouched !== base.includes(remote))
        return localUntouched ? remote : local;
    if (l.state === r.state)
        return local;
    const lr = AGENT_STATE_RANK.get(l.state);
    const rr = AGENT_STATE_RANK.get(r.state);
    if (lr === undefined || rr === undefined)
        return null;
    return rr > lr ? remote : local;
}
/**
 * The checklist tasks of a section's markdown, in document order. Lines
 * inside a fenced code block are not tasks. CRLF tolerant.
 */
function agentTaskLines(content) {
    const lines = String(content || '').split('\n');
    const tasks = [];
    // The open fenced code block, CommonMark's rules: it closes on a line of
    // only the same character, at least as long; a backtick line with another
    // backtick after the run ('```x``` inline') opens nothing.
    let fence = null;
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].replace(/\r$/, '');
        if (i === 0)
            line = line.replace(/^\uFEFF/, ''); // a BOM is not part of the first line
        const f = /^[ \t]*(`{3,}|~{3,})(.*)$/.exec(line);
        if (fence) {
            if (f && f[1][0] === fence.char && f[1].length >= fence.len && !f[2].trim())
                fence = null;
            continue;
        }
        if (f && !(f[1][0] === '`' && f[2].includes('`'))) {
            fence = { char: f[1][0], len: f[1].length };
            continue;
        }
        const task = parseAgentTaskLine(line);
        if (task)
            tasks.push({ ...task, index: i });
    }
    return tasks;
}
/**
 * `content` (a section's markdown) with the marker of task `id` set to `state`
 * — or removed (`state` null) — on EVERY task line that carries that id
 * (strict reading: agentTaskLines). Each line keeps its own line ending; the
 * rest of the text is untouched. Returns the same string when nothing changed.
 */
function setAgentMarkerInContent(content, id, state) {
    const targets = new Set(agentTaskLines(content).filter((t) => t.marker?.id === id).map((t) => t.index));
    if (targets.size === 0)
        return content;
    const lines = content.split('\n');
    for (const i of targets) {
        const cr = lines[i].endsWith('\r') ? '\r' : '';
        const bom = i === 0 && lines[i].startsWith('\uFEFF') ? '\uFEFF' : '';
        const bare = lines[i].slice(bom.length, lines[i].length - cr.length);
        lines[i] = `${bom}${withAgentMarker(bare, id, state)}${cr}`;
    }
    return lines.join('\n');
}
/**
 * `content` with EVERY agent marker removed from its task lines (strict
 * reading). For a COPY of a section or note: the copy must not claim the
 * tasks of the original (a task id is unique across the notes dir).
 */
function clearAgentMarkersInContent(content) {
    if (!content.includes('🤖'))
        return content;
    let out = content;
    for (const id of new Set(agentTaskLines(content).filter((t) => t.marker).map((t) => t.marker.id))) {
        out = setAgentMarkerInContent(out, id, null);
    }
    return out;
}
/** The state to SHOW — 'no-signal' for a running / waiting task whose last signal is older than `staleMinutes` (or unknown). */
function agentDisplayState(state, lastSignal, staleMinutes, nowMs) {
    if (!exports.AGENT_LIVE_STATES.includes(state))
        return state;
    const at = Date.parse(lastSignal || '');
    return Number.isFinite(at) && nowMs - at <= staleMinutes * 60000 ? state : exports.AGENT_NO_SIGNAL;
}
// agent.md ─ parser / writer
const AGENT_BLOCK_OPEN_RE = /^<!-- task:([a-z0-9]{5}) -->[ \t]*$/;
const AGENT_BLOCK_CLOSE_RE = /^<!-- \/task:([a-z0-9]{5}) -->[ \t]*$/;
const AGENT_META_RE = /^([A-Za-z][A-Za-z0-9]*):[ \t]?(.*)$/;
const AGENT_BODY_SEPARATOR = '---';
// Written in this order (the same on every machine, so the line merge of the
// sync sees aligned headers); keys this version does not know follow, as read.
exports.AGENT_META_KEYS = [
    'title', 'section', 'state', 'createdAt', 'startedAt', 'finishedAt', 'lastSignal', 'machine', 'agent', 'cwd',
    'onFinish', 'batch', 'progress', 'question', 'failReason',
    'gitBranch', 'gitStartHead', 'gitEndHead', 'gitCommits', 'gitFilesChanged', 'orphanedAt',
];
/** Any value as the one line a header key holds. */
function agentOneLine(value) {
    return String(value ?? '').replace(/\s*[\r\n]+\s*/g, ' ').trim();
}
/**
 * agent.md → blocks. Tolerant: text outside a block is ignored, a block left
 * open ends at the next one, a repeated id keeps its first block, header lines
 * that are not 'key: value' (the ⚠️ markers of a sync conflict) are skipped
 * and a repeated key keeps its LAST value.
 */
function parseAgentDoc(text) {
    const lines = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n');
    const blocks = [];
    const seen = new Set();
    let i = 0;
    while (i < lines.length) {
        const open = AGENT_BLOCK_OPEN_RE.exec(lines[i]);
        i++;
        if (!open)
            continue;
        const inner = [];
        while (i < lines.length && !AGENT_BLOCK_OPEN_RE.test(lines[i])) {
            const close = AGENT_BLOCK_CLOSE_RE.exec(lines[i]);
            if (close && close[1] === open[1]) {
                i++;
                break;
            }
            inner.push(lines[i]);
            i++;
        }
        if (seen.has(open[1]))
            continue;
        seen.add(open[1]);
        const sep = inner.indexOf(AGENT_BODY_SEPARATOR);
        const meta = {};
        for (const line of sep < 0 ? inner : inner.slice(0, sep)) {
            const m = AGENT_META_RE.exec(line);
            if (m)
                meta[m[1]] = m[2].trim();
        }
        const body = sep < 0 ? '' : inner.slice(sep + 1).join('\n').replace(/^(?:[ \t]*\n)+/, '').replace(/\s+$/, '');
        blocks.push({ id: open[1], meta, body });
    }
    return blocks;
}
/** The inverse of parseAgentDoc ('' for no blocks). A body line that looks like a block delimiter is escaped. */
function serializeAgentDoc(blocks) {
    const parts = [];
    for (const b of blocks) {
        const keys = [...exports.AGENT_META_KEYS, ...Object.keys(b.meta).filter((k) => !exports.AGENT_META_KEYS.includes(k))];
        const lines = [`<!-- task:${b.id} -->`];
        for (const key of keys) {
            const value = b.meta[key] === undefined || b.meta[key] === null ? '' : agentOneLine(b.meta[key]);
            if (value !== '')
                lines.push(`${key}: ${value}`);
        }
        lines.push(AGENT_BODY_SEPARATOR);
        const body = String(b.body || '').replace(/\r\n?/g, '\n').replace(/\s+$/, '');
        if (body) {
            for (const line of body.split('\n')) {
                lines.push(AGENT_BLOCK_OPEN_RE.test(line) || AGENT_BLOCK_CLOSE_RE.test(line) ? `\\${line}` : line);
            }
        }
        lines.push(`<!-- /task:${b.id} -->`);
        parts.push(lines.join('\n'));
    }
    return parts.length ? parts.join('\n\n') + '\n' : '';
}
/** Does this agent.md text carry the ⚠️ markers a sync merge left in it? (They go with the next canonical write.) */
function agentDocHasConflictMarks(text) {
    return /^> ⚠/mu.test(text);
}
/**
 * Orphan bookkeeping of a note's blocks. `liveIds` = the task ids the note
 * still mentions (agentIdsIn). A block whose id is gone gets `orphanedAt` the
 * first time this sees it and is dropped once that is AGENT_ORPHAN_TTL_MS old;
 * an id that came back loses the stamp. MUTATES the blocks it keeps. Returns
 * { blocks, changed }.
 */
function maintainAgentBlocks(blocks, liveIds, nowMs) {
    const kept = [];
    let changed = false;
    for (const b of blocks) {
        if (liveIds.has(b.id)) {
            if (b.meta.orphanedAt !== undefined) {
                delete b.meta.orphanedAt;
                changed = true;
            }
            kept.push(b);
            continue;
        }
        const at = Date.parse(b.meta.orphanedAt || '');
        if (!Number.isFinite(at)) {
            b.meta.orphanedAt = new Date(nowMs).toISOString();
            changed = true;
        }
        else if (nowMs - at >= exports.AGENT_ORPHAN_TTL_MS) {
            changed = true;
            continue;
        }
        kept.push(b);
    }
    return { blocks: kept, changed };
}
/**
 * The task ids a note still MENTIONS — '🤖<id>:' anywhere in any of
 * `sections`. Conservative on purpose (it decides whether a block is an
 * orphan → deleted after a week): a marker on a line that no longer reads as
 * a task — its box removed, inside a quote or a code block — still keeps its
 * report alive.
 */
function agentIdsIn(sections) {
    const ids = new Set();
    for (const s of sections || []) {
        for (const m of String(s.content || '').matchAll(/🤖([a-z0-9]{5}):/gu))
            ids.add(m[1]);
    }
    return ids;
}
/**
 * The ids of the FINISHED blocks ('done' / 'failed', by the block's `state`)
 * older than `discardAfterDays` — measured from `finishedAt`, else
 * `lastSignal`, else `createdAt`; a block with none of them is never
 * discarded. 0 (or anything not a positive number) = never. `lineStates`
 * (id → the state on the task's LINE, which rules over the block's): a task
 * whose line says anything but done / failed is kept — it was reopened.
 *
 * Coordination (no race with the editor): main only REPORTS these ids
 * ('agent-tasks:read'); the renderer removes the marker from the task's line
 * (it owns the note's content) and THEN asks for the block's removal
 * ('agent-tasks:dismiss'). A crash in between leaves a block without a marker
 * — an orphan, dropped a week later — never a marker without its block's
 * removal being intended.
 */
function discardableAgentIds(blocks, discardAfterDays, nowMs, lineStates) {
    if (!Number.isFinite(discardAfterDays) || discardAfterDays <= 0)
        return [];
    const ttl = discardAfterDays * 24 * 60 * 60 * 1000;
    const ids = [];
    for (const b of blocks) {
        const state = lineStates?.get(b.id) ?? b.meta.state ?? '';
        if (!exports.AGENT_FINISHED_STATES.includes(state))
            continue;
        const at = [b.meta.finishedAt, b.meta.lastSignal, b.meta.createdAt].map((v) => Date.parse(v || '')).find((v) => Number.isFinite(v));
        if (at !== undefined && nowMs - at >= ttl)
            ids.push(b.id);
    }
    return ids;
}
/**
 * Orphan bookkeeping of a whole agent.md (`text`) against the note's
 * `sections` — plus `extraLiveIds`, ids the caller still holds elsewhere (an
 * editor with unsaved changes): never orphaned. `rewrite`: the file must be
 * written again — a block changed, or the text carries the ⚠️ marks of a sync
 * merge (they go with the first canonical write; nothing is rewritten just to
 * tidy a file without blocks).
 */
function maintainAgentDoc(text, sections, extraLiveIds, nowMs) {
    const live = agentIdsIn(sections);
    for (const id of extraLiveIds ?? [])
        if (typeof id === 'string' && exports.AGENT_ID_RE.test(id))
            live.add(id);
    const res = maintainAgentBlocks(parseAgentDoc(text), live, nowMs);
    return { blocks: res.blocks, rewrite: res.changed || (res.blocks.length > 0 && agentDocHasConflictMarks(text)) };
}
/** The file is written in LF; without blocks it is removed; identical content is left alone. */
function planAgentFileWrite(current, blocks) {
    const content = serializeAgentDoc(blocks);
    if (content === '')
        return current === null ? { kind: 'none' } : { kind: 'delete' };
    return current === content ? { kind: 'none' } : { kind: 'write', content };
}
/** `blocks` without the block of task `id` (the same array when it has none). */
function withoutAgentBlock(blocks, id) {
    return blocks.some((b) => b.id === id) ? blocks.filter((b) => b.id !== id) : blocks;
}
/**
 * A fresh task id: 5 chars [a-z0-9], not in `taken`. `randomByte` returns an
 * integer 0…255 (crypto in the main process; Math.random elsewhere is fine —
 * uniqueness comes from `taken`, not from the entropy).
 */
function newAgentTaskId(taken, randomByte = () => Math.floor(Math.random() * 256)) {
    let id;
    do {
        id = '';
        for (let i = 0; i < 5; i++)
            id += AGENT_ID_ALPHABET[randomByte() % AGENT_ID_ALPHABET.length];
    } while (taken.has(id));
    return id;
}
exports.AGENT_LAUNCH_MODES = ['terminal', 'claude-desktop', 'codex-app', 'custom-url'];
exports.AGENT_RUN_PRESET_NAMES = ['claude', 'codex', 'gemini', 'opencode', 'custom'];
/** Other names the CLI takes for its presets (AGENT_RUN_ALIASES in cli/noteflow.js). */
const AGENT_RUN_PRESET_ALIASES = { 'claude-code': 'claude', 'codex-cli': 'codex', 'gemini-cli': 'gemini' };
/** Longest command / link template kept. */
exports.AGENT_TEMPLATE_MAX = 2000;
exports.AGENT_MODEL_PRESETS = ['claude', 'codex', 'gemini'];
/**
 * A model name as one argument of an agent CLI (`opus`, `gpt-5-codex`,
 * `gemini-2.5-pro`, `sonnet[1m]`, `provider/model`): starts with a letter or digit, no
 * spaces, quotes, `%`, `!`, `^` nor anything a shell or a batch file acts on
 * beyond what its launcher escapes. The same rule in the CLI (AGENT_MODEL_RE).
 */
exports.AGENT_MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:/@[\]-]{0,99}$/;
exports.DEFAULT_AGENT_TASK_SETTINGS = {
    enabled: false,
    onFinish: 'check',
    staleMinutes: exports.AGENT_STALE_MINUTES,
    discardAfterDays: exports.AGENT_DISCARD_AFTER_DAYS,
    launch: 'terminal',
    agent: 'claude',
    agentCommand: '',
    agentUrl: '',
    batchMode: 'sequential',
    models: {},
};
/** The keys of how "Run" launches: only written to settings.json when a patch names them (patchAgentTaskSettings). */
const AGENT_LAUNCH_KEYS = ['launch', 'agent', 'agentCommand', 'agentUrl', 'batchMode', 'models'];
/** A plain object, or {} for anything else. */
function plainObject(value) {
    return (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
}
/** `models` as kept: only the presets' keys, each a trimmed name that passes AGENT_MODEL_RE (anything else is dropped). */
function sanitizeAgentModels(raw) {
    const s = plainObject(raw);
    const models = {};
    for (const name of exports.AGENT_MODEL_PRESETS) {
        const value = Object.prototype.hasOwnProperty.call(s, name) && typeof s[name] === 'string' ? s[name].trim() : '';
        if (exports.AGENT_MODEL_RE.test(value))
            models[name] = value;
    }
    return models;
}
/**
 * The model "Run" passes to `noteflow run`, or null: only in a terminal, with a
 * preset that takes one and has one set (a desktop app's link, a custom command
 * and OpenCode take none).
 */
function agentRunModel(settings) {
    if (settings.launch !== 'terminal')
        return null;
    const agent = exports.AGENT_MODEL_PRESETS.find((name) => name === settings.agent);
    const model = agent ? settings.models[agent] : undefined;
    return model && exports.AGENT_MODEL_RE.test(model) ? model : null;
}
/** One line, trimmed, no control characters, at most AGENT_TEMPLATE_MAX: what a template field keeps. */
function agentTemplateText(value) {
    if (typeof value !== 'string')
        return '';
    return value.replace(/\p{Cc}+/gu, ' ').trim().slice(0, exports.AGENT_TEMPLATE_MAX);
}
/**
 * Tolerant read of settings.json `agentTasks` (same rules as the CLI's
 * agentTaskSettings for the keys it shares). `agent`: the CLI also takes a
 * command or a template of its own there (written by hand); the app shows that
 * as 'custom', with the text as its command when `agentCommand` is empty.
 */
function sanitizeAgentTaskSettings(raw) {
    const s = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {});
    const stale = Number(s.staleMinutes);
    const discard = Number(s.discardAfterDays);
    const rawAgent = typeof s.agent === 'string' ? s.agent.trim() : '';
    const named = rawAgent.toLowerCase();
    const preset = AGENT_RUN_PRESET_ALIASES[named] ?? exports.AGENT_RUN_PRESET_NAMES.find((name) => name === named);
    const agentCommand = agentTemplateText(s.agentCommand);
    return {
        enabled: s.enabled === true,
        onFinish: s.onFinish === 'review' ? 'review' : 'check',
        staleMinutes: Number.isFinite(stale) && stale > 0 ? stale : exports.AGENT_STALE_MINUTES,
        discardAfterDays: s.discardAfterDays !== undefined && s.discardAfterDays !== null && Number.isFinite(discard) && discard >= 0
            ? discard
            : exports.AGENT_DISCARD_AFTER_DAYS,
        launch: exports.AGENT_LAUNCH_MODES.find((mode) => mode === s.launch) ?? 'terminal',
        agent: rawAgent === '' ? 'claude' : preset ?? 'custom',
        agentCommand: agentCommand || (rawAgent !== '' && preset === undefined ? agentTemplateText(rawAgent) : ''),
        agentUrl: agentTemplateText(s.agentUrl),
        batchMode: s.batchMode === 'parallel' ? 'parallel' : 'sequential',
        models: sanitizeAgentModels(s.models),
    };
}
/**
 * The stored `agentTasks` object after applying `patch`: the sanitized result
 * on top of whatever other keys the stored object holds (a newer build's, the
 * CLI's, the per-note `folders`) — those are never dropped. The launch keys
 * (`launch`, `agent`, `agentCommand`, `agentUrl`) are only written when the
 * patch names them: an `agent` the user set by hand for the CLI (a command of
 * its own) is not rewritten by toggling something else. Same for `batchMode`
 * (an absent one reads as 'sequential') and `models`, which a patch MERGES by
 * agent: `{ models: { claude: 'opus' } }` leaves the others' as they are, and
 * an empty name takes that agent back to its default.
 */
function patchAgentTaskSettings(stored, patch) {
    const base = (stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {});
    const p = (patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {});
    const picked = {};
    for (const key of ['enabled', 'onFinish', 'staleMinutes', 'discardAfterDays', ...AGENT_LAUNCH_KEYS])
        if (key in p)
            picked[key] = p[key];
    if ('models' in picked)
        picked.models = { ...sanitizeAgentModels(base.models), ...plainObject(picked.models) };
    const clean = sanitizeAgentTaskSettings({ ...base, ...picked });
    const next = {
        ...base,
        enabled: clean.enabled,
        onFinish: clean.onFinish,
        staleMinutes: clean.staleMinutes,
        discardAfterDays: clean.discardAfterDays,
    };
    for (const key of AGENT_LAUNCH_KEYS)
        if (key in picked)
            next[key] = clean[key];
    return next;
}
// Sync ─ rules of agent.md that every backend shares.
/**
 * A local agent.md the remote folder lacks: was it DELETED there? True only
 * when this device had reconciled it (a base) and has not changed it since
 * (`local` equals the base — same kind of value: a git blob sha, a content
 * hash). False when the remote just does not have it yet (no base) or it
 * changed here: a pull that takes the remote's folder must then KEEP it.
 */
function agentFileDeletedRemotely(base, local) {
    return base !== undefined && local !== null && local === base;
}
/**
 * Section FILENAMES to tell the user about (merged with conflict blocks, kept
 * in a partial conflict copy): never agent.md — the user never sees that
 * file, its reader resolves the ⚠️ marks by itself (parseAgentDoc) and a copy
 * note holding only it would have no sections.
 */
function userFacingSectionFiles(files) {
    return files.filter((f) => f !== exports.AGENT_MD);
}
