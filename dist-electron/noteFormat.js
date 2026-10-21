"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FORMAT_MARKER_FILE = exports.NOTE_FORMAT_VERSION = exports.NOTE_MD = void 0;
exports.listNoteDirs = listNoteDirs;
exports.readNoteDirRecord = readNoteDirRecord;
exports.splitFrontmatter = splitFrontmatter;
exports.parseNoteDir = parseNoteDir;
exports.parseLegacyNoteRaw = parseLegacyNoteRaw;
exports.serializeNoteFolder = serializeNoteFolder;
exports.newNoteId = newNoteId;
exports.noteDirname = noteDirname;
exports.extractUpdatedTimestamp = extractUpdatedTimestamp;
exports.hasFormatMarker = hasFormatMarker;
exports.writeFormatMarker = writeFormatMarker;
/**
 * noteFormat.ts — main-process knowledge of the on-disk note format v2
 * (folder-per-note). Shared by main.ts (fs IPC, expiration, migration),
 * githubSync.ts (push/pull walking) and ai/aiWorker.ts (indexing).
 *
 * Mirrors src/lib/noteUtils.ts (the renderer copy) — electron/ does not import
 * from src/. Keep both in sync when the format changes.
 *
 * Layout:
 *   <notesDir>/<slug>-<id>/note.md       frontmatter-only anchor
 *   <notesDir>/<slug>-<id>/<secId>.md    section bodies (plain markdown)
 *   <notesDir>/.noteflow-format          format version marker ("2")
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
const js_yaml_1 = __importDefault(require("js-yaml"));
exports.NOTE_MD = 'note.md';
exports.NOTE_FORMAT_VERSION = 2;
exports.FORMAT_MARKER_FILE = '.noteflow-format';
// ── Directory walking ─────────────────────────────────────────────────────────
/** Names of subdirectories of notesDir that contain a note.md. */
function listNoteDirs(notesDir) {
    let entries;
    try {
        entries = fs_1.default.readdirSync(notesDir, { withFileTypes: true });
    }
    catch {
        return [];
    }
    const dirs = [];
    for (const e of entries) {
        if (!e.isDirectory())
            continue;
        try {
            if (fs_1.default.existsSync(path_1.default.join(notesDir, e.name, exports.NOTE_MD)))
                dirs.push(e.name);
        }
        catch { /* skip unreadable dir */ }
    }
    return dirs;
}
/** Reads a note directory into the IPC record shape. Null if not a note dir. */
function readNoteDirRecord(notesDir, dir) {
    const dirPath = path_1.default.join(notesDir, dir);
    let noteMd;
    try {
        noteMd = fs_1.default.readFileSync(path_1.default.join(dirPath, exports.NOTE_MD), 'utf-8');
    }
    catch {
        return null;
    }
    const sections = [];
    try {
        for (const f of fs_1.default.readdirSync(dirPath)) {
            if (!f.endsWith('.md') || f === exports.NOTE_MD)
                continue;
            try {
                sections.push({ file: f, content: fs_1.default.readFileSync(path_1.default.join(dirPath, f), 'utf-8') });
            }
            catch { /* skip unreadable section file */ }
        }
    }
    catch {
        return null;
    }
    return { dir, path: dirPath, noteMd, sections };
}
// ── Frontmatter helpers ───────────────────────────────────────────────────────
function splitFrontmatter(raw) {
    // Strip UTF-8 BOM (external editors like Notepad may add it)
    const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    if (!normalized.startsWith('---\n')) {
        return { frontmatter: '', body: normalized };
    }
    const end = normalized.indexOf('\n---\n', 4);
    if (end === -1) {
        if (normalized.endsWith('\n---')) {
            return { frontmatter: normalized.slice(4, -4), body: '' };
        }
        return { frontmatter: '', body: normalized };
    }
    return {
        frontmatter: normalized.slice(4, end),
        body: normalized.slice(end + 5),
    };
}
function loadFrontmatter(raw) {
    const { frontmatter, body } = splitFrontmatter(raw);
    let data = {};
    if (frontmatter) {
        try {
            data = js_yaml_1.default.load(frontmatter) ?? {};
        }
        catch { /* malformed */ }
    }
    return { data, body };
}
function newId(chars) {
    return (0, crypto_1.randomBytes)(Math.ceil(chars / 2)).toString('hex').slice(0, chars);
}
// js-yaml parses unquoted ISO timestamps as Date objects — normalize back to
// the ISO string (Date.toString() would corrupt the sync conflict timestamps).
function isoString(v) {
    if (v instanceof Date)
        return v.toISOString();
    if (typeof v === 'string' && v)
        return v;
    return null;
}
function parseDiskMeta(data) {
    const note = {
        id: typeof data.id === 'string' && data.id ? data.id : newId(8),
        title: String(data.title ?? 'Untitled'),
        tags: Array.isArray(data.tags) ? data.tags : [],
        created: isoString(data.created) ?? new Date().toISOString(),
        updated: isoString(data.updated) ?? new Date().toISOString(),
    };
    if (data.archived)
        note.archived = true;
    if (data.favorited ?? data.pinned)
        note.favorited = true;
    if (typeof data.group === 'string' && data.group)
        note.group = data.group;
    if (typeof data.folder === 'string' && data.folder)
        note.folder = data.folder;
    const expiresAt = isoString(data.expiresAt);
    if (expiresAt)
        note.expiresAt = expiresAt;
    if (data.encryption && typeof data.encryption === 'object') {
        note.encryption = data.encryption;
    }
    return note;
}
// ── Parse: v2 folder ─────────────────────────────────────────────────────────
/** Parses a note directory from disk. Encrypted notes yield sections: []. */
function parseNoteDir(dirPath) {
    let noteMd;
    try {
        noteMd = fs_1.default.readFileSync(path_1.default.join(dirPath, exports.NOTE_MD), 'utf-8');
    }
    catch {
        return null;
    }
    const { data } = loadFrontmatter(noteMd);
    const meta = parseDiskMeta(data);
    if (meta.encryption)
        return { ...meta, sections: [] };
    const sections = [];
    if (Array.isArray(data.sections)) {
        for (const s of data.sections) {
            const id = String(s.id ?? newId(6));
            const file = String(s.file ?? `${id}.md`);
            let content = '';
            try {
                content = fs_1.default.readFileSync(path_1.default.join(dirPath, path_1.default.basename(file)), 'utf-8').replace(/\r\n/g, '\n');
            }
            catch { /* missing section file → empty */ }
            const section = { id, name: String(s.name ?? 'Section'), content };
            if (s.isRawMode)
                section.isRawMode = true;
            if (s.aiHidden)
                section.aiHidden = true;
            const created = isoString(s.created);
            if (created)
                section.created = created;
            sections.push(section);
        }
    }
    return { ...meta, sections };
}
// ── Parse: legacy v1 single file (for migration / old imports) ───────────────
function parseLegacyNoteRaw(raw) {
    const { data, body } = loadFrontmatter(raw);
    const meta = parseDiskMeta(data);
    if (meta.encryption)
        return { ...meta, sections: [] };
    let sections;
    if (Array.isArray(data.sections) && data.sections.length > 0) {
        sections = data.sections.map((s) => {
            const section = {
                id: String(s.id ?? newId(6)),
                name: String(s.name ?? 'Section'),
                content: String(s.content ?? ''),
            };
            if (s.isRawMode)
                section.isRawMode = true;
            if (s.aiHidden)
                section.aiHidden = true;
            return section;
        });
    }
    else if (typeof data.section_note === 'string' ||
        typeof data.section_task === 'string' ||
        typeof data.section_question === 'string') {
        sections = [
            { id: newId(6), name: 'Note', content: String(data.section_note ?? body) },
            { id: newId(6), name: 'Task', content: String(data.section_task ?? '') },
            { id: newId(6), name: 'Question', content: String(data.section_question ?? '') },
        ];
    }
    else {
        sections = [{ id: newId(6), name: 'Note', content: body }];
    }
    return { ...meta, sections };
}
// ── Serialize: v2 folder ─────────────────────────────────────────────────────
/**
 * Serializes a DiskNote to its folder file map. `preserveUpdated` keeps the
 * note's original `updated` timestamp (migration must not bump it — content
 * didn't change and a bump would defeat sync conflict resolution).
 */
function serializeNoteFolder(note, opts) {
    const updated = opts?.preserveUpdated ? note.updated : new Date().toISOString();
    const fm = {
        id: note.id,
        title: note.title,
        tags: note.tags,
        created: note.created,
        updated,
        formatVersion: exports.NOTE_FORMAT_VERSION,
    };
    if (note.encryption) {
        fm.encryption = note.encryption;
    }
    else {
        fm.sections = note.sections.map((s) => ({
            id: s.id,
            name: s.name,
            file: `${s.id}.md`,
            ...(s.isRawMode && { isRawMode: true }),
            ...(s.aiHidden && { aiHidden: true }),
            ...(s.created && { created: s.created }),
        }));
    }
    if (note.archived)
        fm.archived = true;
    if (note.favorited)
        fm.favorited = true;
    if (note.group)
        fm.group = note.group;
    if (note.folder)
        fm.folder = note.folder;
    if (note.expiresAt)
        fm.expiresAt = note.expiresAt;
    const yamlStr = js_yaml_1.default.dump(fm, { lineWidth: -1, quotingType: '"' });
    const files = { [exports.NOTE_MD]: `---\n${yamlStr}---\n` };
    const sectionFiles = [];
    if (!note.encryption) {
        for (const s of note.sections) {
            const file = `${s.id}.md`;
            files[file] = s.content;
            sectionFiles.push(file);
        }
    }
    return { files, sectionFiles };
}
// ── Misc helpers ─────────────────────────────────────────────────────────────
/** Fresh 8-char note id (same length the renderer's nanoid(8) / main's imports use). */
function newNoteId() {
    return newId(8);
}
/**
 * Directory name for a note: '<slug>-<id>' (slug frozen at creation time).
 * ⚠️ Mirror of noteDirname in src/lib/noteUtils.ts and cli/noteflow.js — keep
 * the slug rule identical in all three.
 */
function noteDirname(id, title) {
    const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 40);
    return `${slug ? `${slug}-` : ''}${id}`;
}
/** Reads the `updated:` timestamp out of a note.md (or legacy note) content. */
function extractUpdatedTimestamp(content) {
    const match = content.match(/^updated:\s*['"]?([^'"\n]+)['"]?\s*$/m);
    if (!match)
        return null;
    const parsed = Date.parse(match[1].trim());
    return Number.isFinite(parsed) ? parsed : null;
}
/** Whether the notes dir has the v2 format marker. */
function hasFormatMarker(notesDir) {
    try {
        return fs_1.default.readFileSync(path_1.default.join(notesDir, exports.FORMAT_MARKER_FILE), 'utf-8').trim() === String(exports.NOTE_FORMAT_VERSION);
    }
    catch {
        return false;
    }
}
function writeFormatMarker(notesDir) {
    fs_1.default.writeFileSync(path_1.default.join(notesDir, exports.FORMAT_MARKER_FILE), `${exports.NOTE_FORMAT_VERSION}\n`, 'utf-8');
}
