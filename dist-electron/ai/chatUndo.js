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
exports.isModifiedSinceEdit = isModifiedSinceEdit;
exports.undoBlock = undoBlock;
exports.planUndo = planUndo;
exports.createUndoStore = createUndoStore;
exports.stripStaleUndo = stripStaleUndo;
// Undo of the chat agent's note edits — pure logic (snapshots, "changed since?", restore plan).
// main.ts captures a snapshot of the note BEFORE and AFTER each note-modifying tool call (keyed by
// toolCallId, in memory for this app session) and, on `ai:chat-undo`, applies the plan returned
// here through its regular write/delete primitives (broadcast + push + reindex).
const noteFormat = __importStar(require("../noteFormat"));
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
 * What a note "is" for the undo check: every field the user can change, but not `updated` (a
 * rewrite of identical content bumps it and must not count as a change).
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
/** True when the note no longer matches what the AI's edit left on disk (someone edited it since). */
function isModifiedSinceEdit(snapshot, current) {
    return noteFingerprint(current) !== noteFingerprint(snapshot.after);
}
/**
 * Why an undo can't run at all, whatever the user confirms (null = it can):
 * - 'gone': it would re-create the note folder or a section file that is no longer on disk —
 *   deleted after the AI's edit, so a remote deletion may be pending or in flight for it in the
 *   sync journal and the restored files could be wiped again (remotely, then locally via pull);
 * - 'encryption': the note was encrypted or decrypted after the edit — restoring the snapshot
 *   would silently undo that (e.g. write a decrypted copy over an encrypted note).
 * A note the tool created is just deleted again, which never re-creates anything.
 */
function undoBlock(snapshot, current) {
    const before = snapshot.before;
    if (!before)
        return null;
    if (!current)
        return 'gone';
    if (!!before.encryption !== !!current.encryption)
        return 'encryption';
    if (!before.encryption) {
        const onDisk = new Set(current.sections.map((s) => s.id));
        if (before.sections.some((s) => !onDisk.has(s.id)))
            return 'gone';
    }
    return null;
}
/**
 * How to put the note back as it was before the tool ran, given what is on disk now.
 * - created by the tool → delete it (noop if it's already gone);
 * - otherwise → rewrite it from the "before" snapshot: note.md plus only the section files that
 *   differ from disk, deleting section files the snapshot doesn't have.
 * Check `undoBlock` first: this plans the write, it doesn't decide whether it's safe.
 */
function planUndo(snapshot, current) {
    if (!snapshot.before)
        return current ? { kind: 'delete', dir: snapshot.dir } : { kind: 'noop' };
    const { files } = noteFormat.serializeNoteFolder(snapshot.before);
    const currentById = new Map((current?.encryption ? [] : current?.sections ?? []).map((s) => [s.id, s.content]));
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
    const keep = new Set(snapshot.before.encryption ? [] : snapshot.before.sections.map((s) => s.id));
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
