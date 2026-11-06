"use strict";
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
exports.UNDOABLE_TOOLS = void 0;
exports.undoNoteId = undoNoteId;
exports.noteFingerprint = noteFingerprint;
exports.hasUndoConflict = hasUndoConflict;
exports.undoBlock = undoBlock;
exports.mergeUndo = mergeUndo;
exports.planUndo = planUndo;
exports.createUndoStore = createUndoStore;
exports.stripStaleUndo = stripStaleUndo;
// Undo of the chat agent's note edits — pure logic (snapshots, "changed since?", restore plan).
// main.ts captures a snapshot of the note BEFORE and AFTER each note-modifying tool call (keyed by
// toolCallId, in memory for this app session) and, on `ai:chat-undo`, applies the plan returned
// here through its regular write/delete primitives (broadcast + push + reindex).
const noteFormat = __importStar(require("../noteFormat"));
const tools_1 = require("./llm/tools");
/**
 * Tools whose effect on a note can be undone. Group/folder tools are not (they aren't notes), and
 * neither are delete_note / delete_section: they already ask for confirmation, and bringing back
 * what they removed would race the remote deletion they queued in the sync journal (a pending or
 * in-flight delete could later wipe the restored files remotely, then locally via pull).
 */
exports.UNDOABLE_TOOLS = new Set([
    'create_note', 'update_note', 'add_section', 'update_section', 'rename_section',
]);
/** Note id a tool call acts on: its `note_id` input, or (create_note) the id the tool reported. */
function undoNoteId(name, input, createdNoteId) {
    if (!exports.UNDOABLE_TOOLS.has(name))
        return null;
    if (name === 'create_note')
        return createdNoteId || null;
    const raw = input && typeof input === 'object' ? input.note_id : undefined;
    return typeof raw === 'string' && raw ? raw : null;
}
/**
 * What a note "is" for the undo checks (did the tool change anything? did a created note change
 * since? is there anything left to revert?): every field the user can change, but not `updated`
 * (a rewrite of identical content bumps it and must not count as a change).
 */
function noteFingerprint(note) {
    if (!note)
        return 'null';
    return JSON.stringify({
        title: note.title,
        tags: [...note.tags].sort(),
        archived: !!note.archived,
        favorited: !!note.favorited,
        group: note.group ?? null,
        folder: note.folder ?? null,
        expiresAt: note.expiresAt ?? null,
        encryption: note.encryption ?? null,
        sections: note.sections.map((s) => [s.id, s.name, s.content, !!s.isRawMode, !!s.aiHidden, s.created ?? null]),
    });
}
// ── 3-way undo ────────────────────────────────────────────────────────────────
// An undo reverts ONLY what the tool changed — base = `after` (what the AI left), theirs =
// `current` (disk now), target = `before`. Everything the tool didn't touch keeps its current
// state, so the user's later edits elsewhere in the note (other sections, sections they added,
// sections they deleted, the title…) survive. A "conflict" is a part the tool changed that was
// changed again afterwards (by the user or a later tool call): only then does the UI ask.
const sectionKey = (s) => s ? JSON.stringify([s.name, s.content, !!s.isRawMode, !!s.aiHidden, s.created ?? null]) : 'null';
/**
 * Note-level parts of a note, each compared and restored as a unit. group + folder go together
 * (a folder belongs to a group: restoring one without the other could pair a group with a folder
 * of another). The note dir is frozen at creation, so none of these moves files. Not here:
 * `encryption` is never merged (see `undoBlock` / `mergeUndo`), and `tags` are derived data — the
 * renderer recomputes them from the content on every write and the tools never set them — so
 * `mergeUndo` recomputes them from the merged sections instead.
 */
const NOTE_FIELDS = [
    { key: (n) => n.title, restore: (into, from) => { into.title = from.title; } },
    { key: (n) => String(!!n.archived), restore: (into, from) => { into.archived = from.archived; } },
    { key: (n) => String(!!n.favorited), restore: (into, from) => { into.favorited = from.favorited; } },
    {
        key: (n) => JSON.stringify([n.group ?? null, n.folder ?? null]),
        restore: (into, from) => { into.group = from.group; into.folder = from.folder; },
    },
    { key: (n) => n.expiresAt ?? '', restore: (into, from) => { into.expiresAt = from.expiresAt; } },
];
/** Sections of a note by id (an encrypted note has none readable). */
const sectionsById = (note) => new Map((note && !note.encryption ? note.sections : []).map((s) => [s.id, s]));
/** Ids of the sections the tool touched, split by what it did. */
function touchedSections(snapshot) {
    const before = sectionsById(snapshot.before);
    const after = sectionsById(snapshot.after);
    const changed = [];
    const removed = [];
    const added = [];
    for (const [id, b] of before) {
        const a = after.get(id);
        if (!a)
            removed.push(id);
        else if (sectionKey(a) !== sectionKey(b))
            changed.push(id);
    }
    for (const id of after.keys())
        if (!before.has(id))
            added.push(id);
    return { before, after, changed, removed, added };
}
/**
 * True when undoing would overwrite a change made after the tool ran to a part the tool itself
 * changed (the UI then asks before retrying with `force`). Unrelated edits elsewhere in the note
 * don't count: the undo keeps them. For a note the tool created, any change counts (undoing
 * deletes the whole note).
 */
function hasUndoConflict(snapshot, current) {
    const { before, after: afterNote } = snapshot;
    if (!before)
        return noteFingerprint(current) !== noteFingerprint(afterNote);
    if (!current)
        return true; // blocked as 'gone' by undoBlock anyway
    for (const f of NOTE_FIELDS) {
        if (f.key(before) !== f.key(afterNote) && f.key(current) !== f.key(afterNote))
            return true;
    }
    const { after, changed, removed, added } = touchedSections(snapshot);
    const now = sectionsById(current);
    // A changed section the user deleted is 'gone' (undoBlock); one the user edited is a conflict.
    for (const id of changed)
        if (now.has(id) && sectionKey(now.get(id)) !== sectionKey(after.get(id)))
            return true;
    // A section the tool removed that is back on disk was re-created by someone else.
    for (const id of removed)
        if (now.has(id))
            return true;
    // A section the tool added and the user then edited would lose that edit (deleted ones: nothing to do).
    for (const id of added)
        if (now.has(id) && sectionKey(now.get(id)) !== sectionKey(after.get(id)))
            return true;
    return false;
}
/**
 * Why an undo can't run at all, whatever the user confirms (null = it can):
 * - 'gone': it would have to re-create the note folder, or a section file the tool changed or
 *   removed, that is no longer on disk. Deleted after the edit → a remote deletion may be pending
 *   or in flight for it in the sync journal and the restored file could be wiped again (remotely,
 *   then locally via pull). A section the tool REMOVED is also absent, and its deletion was queued
 *   by the tool's own write — same race, so it stays blocked (conservative, as the original
 *   whole-note undo did; the undoable tools never remove sections anyway). Sections the tool
 *   didn't touch are never re-created, so deleting one of those afterwards doesn't block.
 * - 'encryption': the note was encrypted or decrypted after (or by) the edit — restoring would
 *   silently undo that (e.g. write a decrypted copy over an encrypted note).
 * A note the tool created is just deleted again, which never re-creates anything.
 */
function undoBlock(snapshot, current) {
    const before = snapshot.before;
    if (!before)
        return null;
    if (!current)
        return 'gone';
    const encrypted = !!current.encryption;
    if (!!before.encryption !== encrypted || !!snapshot.after.encryption !== encrypted)
        return 'encryption';
    if (!encrypted) {
        const { changed, removed } = touchedSections(snapshot);
        const onDisk = sectionsById(current);
        if ([...changed, ...removed].some((id) => !onDisk.has(id)))
            return 'gone';
    }
    return null;
}
/**
 * The note as it should be after the undo: `current` with only the tool's changes reverted.
 * Conflicting parts (see `hasUndoConflict`) are restored to `before` too — reaching here with a
 * conflict means the user confirmed. Section order is current's; a restored section missing from
 * disk (only possible when `undoBlock` was skipped) goes back after its nearest preceding
 * neighbour in `before`. Tags are recomputed from the merged content (same rule as the renderer).
 * An encrypted note (before/after/current all encrypted: the agent can't edit encrypted content,
 * only note-level fields) keeps current's ciphertext and tags untouched.
 */
function mergeUndo(snapshot, current) {
    const before = snapshot.before;
    const afterNote = snapshot.after;
    const merged = { ...current, tags: [...current.tags], sections: [] };
    for (const f of NOTE_FIELDS)
        if (f.key(before) !== f.key(afterNote))
            f.restore(merged, before);
    if (current.encryption)
        return { ...merged, sections: [...current.sections] };
    const { before: beforeById, changed, removed, added } = touchedSections(snapshot);
    const restore = new Set([...changed, ...removed]);
    const drop = new Set(added);
    const sections = current.sections
        .filter((s) => !drop.has(s.id))
        .map((s) => (restore.has(s.id) ? beforeById.get(s.id) : s));
    const beforeOrder = before.sections.map((s) => s.id);
    for (const id of beforeOrder) {
        if (!restore.has(id) || sections.some((s) => s.id === id))
            continue;
        let at = 0;
        for (let i = beforeOrder.indexOf(id) - 1; i >= 0; i--) {
            const prev = sections.findIndex((s) => s.id === beforeOrder[i]);
            if (prev >= 0) {
                at = prev + 1;
                break;
            }
        }
        sections.splice(at, 0, beforeById.get(id));
    }
    merged.sections = sections;
    merged.tags = (0, tools_1.extractTags)(sections.map((s) => s.content).join('\n'));
    return merged;
}
/**
 * How to revert the tool's edit, given what is on disk now.
 * - created by the tool → delete it (noop if it's already gone);
 * - otherwise → write the `mergeUndo` result: note.md (`updated` bumped: it is a real edit) plus
 *   only the section files that differ from disk, deleting only the section files the merge drops
 *   (the ones the tool added). Noop when the merge equals disk (nothing left to revert), and when
 *   the note is gone: there is nothing to merge onto, and re-creating it is never safe ('gone').
 * Check `undoBlock` first: this plans the write, it doesn't decide whether it's safe.
 */
function planUndo(snapshot, current) {
    if (!snapshot.before)
        return current ? { kind: 'delete', dir: snapshot.dir } : { kind: 'noop' };
    if (!current)
        return { kind: 'noop' };
    const merged = mergeUndo(snapshot, current);
    if (noteFingerprint(merged) === noteFingerprint(current))
        return { kind: 'noop' };
    const { files } = noteFormat.serializeNoteFolder(merged);
    const currentById = new Map([...sectionsById(current)].map(([id, s]) => [id, s.content]));
    const out = {};
    for (const [file, content] of Object.entries(files)) {
        if (file === noteFormat.NOTE_MD) {
            out[file] = content;
            continue;
        }
        const sectionId = file.replace(/\.md$/, '');
        if (currentById.get(sectionId) !== content)
            out[file] = content;
    }
    const keep = new Set([...sectionsById(merged).keys()]);
    const deleteFiles = [...currentById.keys()].filter((id) => !keep.has(id)).map((id) => `${id}.md`);
    return { kind: 'write', dir: snapshot.dir, files: out, deleteFiles };
}
/** In-memory snapshot store, bounded (oldest dropped first) — lives for the app session. */
function createUndoStore(limit = 200) {
    const map = new Map();
    return {
        put(snapshot) {
            map.delete(snapshot.toolCallId);
            map.set(snapshot.toolCallId, snapshot);
            while (map.size > limit) {
                const oldest = map.keys().next().value;
                if (oldest === undefined)
                    break;
                map.delete(oldest);
            }
        },
        get: (toolCallId) => map.get(toolCallId),
        has: (toolCallId) => map.has(toolCallId),
        delete: (toolCallId) => { map.delete(toolCallId); },
        get size() { return map.size; },
    };
}
/**
 * Sessions read back from ai-chats.json may carry `undo: 'available'` on activity rows whose
 * snapshot no longer exists (written before an app restart). Drop the flag so no dead "Undo"
 * button is shown. Returns the input untouched when nothing changes.
 */
function stripStaleUndo(sessions, isAvailable) {
    if (!Array.isArray(sessions))
        return sessions;
    let changed = false;
    const next = sessions.map((session) => {
        const s = session;
        if (!s || !Array.isArray(s.messages))
            return session;
        let sessionChanged = false;
        const messages = s.messages.map((message) => {
            const m = message;
            if (!m || !Array.isArray(m.actions))
                return message;
            let msgChanged = false;
            const actions = m.actions.map((action) => {
                const a = action;
                if (a && a.undo === 'available' && (typeof a.toolCallId !== 'string' || !isAvailable(a.toolCallId))) {
                    msgChanged = true;
                    const copy = { ...a };
                    delete copy.undo;
                    return copy;
                }
                return action;
            });
            if (!msgChanged)
                return message;
            sessionChanged = true;
            return { ...m, actions };
        });
        if (!sessionChanged)
            return session;
        changed = true;
        return { ...s, messages };
    });
    return (changed ? next : sessions);
}
