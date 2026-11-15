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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * aiWorker.ts — runs inside an Electron utilityProcess (Node).
 *
 * Owns the heavy, CPU-bound work so the main process event loop stays responsive:
 *  - EmbeddingProvider: local embeddings via Transformers.js (onnxruntime-node).
 *    Model is downloaded on first use to `cacheDir` (deferred — no installer bloat).
 *  - SqliteIndex: better-sqlite3 + sqlite-vec (vectors) + FTS5 (keyword), hybrid
 *    retrieval fused with Reciprocal Rank Fusion (RRF). Persisted in userData.
 *  - extractSections: minimal frontmatter/sections parser (mirrors src/lib/noteUtils.ts).
 *    Encrypted notes are skipped — no plaintext ever enters the index.
 *
 * The index is a derived artifact: deleting the DB and reindexing rebuilds it from the .md.
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const sqliteVec = __importStar(require("sqlite-vec"));
const protocol_1 = require("./protocol");
const noteFormat_1 = require("../noteFormat");
// Transformers.js is ESM-only. A plain dynamic import() would be down-levelled to
// require() by tsc (module: CommonJS) and crash. This Function wrapper preserves a
// real runtime dynamic import.
const dynamicImport = new Function('s', 'return import(s)');
const EMBED_MAX_CHARS = 2000; // ~512 tokens; the embedding models ignore anything past this
const parentPort = process.parentPort;
function send(msg) {
    parentPort.postMessage(msg);
}
function emitState(state) {
    send({ type: 'state', payload: state });
}
function emitProgress(p) {
    send({ type: 'progress', payload: p });
}
// ── Helpers ─────────────────────────────────────────────────────────────────
// FNV-1a 32-bit — cheap, stable content hash to skip re-embedding unchanged sections.
function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16);
}
function toSnippet(text, max = 160) {
    const oneLine = text.replace(/\s+/g, ' ').trim();
    return oneLine.length > max ? oneLine.slice(0, max - 1) + '…' : oneLine;
}
// Build a safe FTS5 MATCH query from arbitrary text: distinct word tokens, quoted,
// OR-joined. Quoting neutralises FTS5 operator syntax so user text can't break it.
function buildFtsQuery(text, maxTerms = 24) {
    const tokens = (text.toLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) ?? []);
    const seen = new Set();
    const out = [];
    for (const t of tokens) {
        if (seen.has(t))
            continue;
        seen.add(t);
        out.push(`"${t}"`);
        if (out.length >= maxTerms)
            break;
    }
    return out.join(' OR ');
}
function floatBuf(v) {
    return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}
// sqlite-vec ships its vector engine as a native library (vec0.dll/.dylib/.so) loaded through
// SQLite's loadExtension — a raw OS call that cannot read from inside the packed app.asar. When the
// app is packaged, asarUnpack extracts sqlite-vec* to app.asar.unpacked, so the path sqlite-vec
// resolves (which points into app.asar) must be rewritten to that unpacked copy. In dev there is no
// asar, so the replace is a harmless no-op.
function loadVecExtension(db) {
    const resolved = sqliteVec.getLoadablePath();
    const unpacked = resolved.replace(`app.asar${path_1.default.sep}`, `app.asar.unpacked${path_1.default.sep}`);
    db.loadExtension(unpacked);
}
/** Reads a note directory from disk. Null when note.md is missing (deleted). */
function readNoteFolder(dirPath) {
    const disk = (0, noteFormat_1.parseNoteDir)(dirPath);
    if (!disk)
        return null;
    return {
        noteId: disk.id || null,
        title: disk.title,
        encrypted: !!disk.encryption,
        sections: disk.sections.map((s) => ({ id: s.id, name: s.name, content: s.content, aiHidden: s.aiHidden })),
    };
}
// ── Embedding provider ──────────────────────────────────────────────────────
class EmbeddingProvider {
    constructor() {
        this.extractor = null;
        this.isE5 = false;
        this._dim = 0;
    }
    /** Output embedding dimension, detected at init (so any model works). */
    get dim() { return this._dim; }
    /** Whether the heavy embedding model is loaded in memory. */
    get ready() { return this.extractor !== null; }
    async init(modelId, cacheDir) {
        const transformers = await dynamicImport('@huggingface/transformers');
        const { pipeline, env } = transformers;
        env.cacheDir = cacheDir;
        env.allowRemoteModels = true;
        env.allowLocalModels = true;
        this.isE5 = /e5/i.test(modelId); // e5 models need "passage:"/"query:" prefixes
        emitState('downloading-model'); // best-effort: first run downloads, later runs hit cache
        // Report aggregate download progress so the first run shows a real %, not a frozen spinner.
        // Transformers.js fetches several files (config, tokenizer, ONNX weights); we sum bytes across
        // every file seen and emit one combined figure. Cached runs fire no 'progress' events → no-op.
        const fileBytes = new Map();
        const progress_callback = (info) => {
            if (info?.status !== 'progress' || !info.file || typeof info.loaded !== 'number' || typeof info.total !== 'number')
                return;
            fileBytes.set(info.file, { loaded: info.loaded, total: info.total });
            let loaded = 0, total = 0;
            for (const f of fileBytes.values()) {
                loaded += f.loaded;
                total += f.total;
            }
            if (total > 0)
                emitProgress({ done: loaded, total, phase: 'downloading' });
        };
        try {
            this.extractor = await pipeline('feature-extraction', modelId, { dtype: 'q8', progress_callback });
        }
        catch {
            this.extractor = await pipeline('feature-extraction', modelId, { progress_callback }); // model may lack a q8 build
        }
        // Probe the real output dimension so the vector index sizes its column correctly.
        const probe = await this.embed(['x'], 'passage');
        this._dim = probe[0].length;
        emitState('idle');
    }
    prefix(text, kind) {
        return this.isE5 ? `${kind}: ${text}` : text;
    }
    /** Free the model's ONNX session(s) and native memory. Vectors already live in SQLite, so the
     *  index keeps serving graph/related afterwards — only the heavy ~500 MB of weights is released. */
    async unload() {
        const ex = this.extractor;
        this.extractor = null;
        this._dim = 0;
        if (!ex)
            return;
        try {
            if (typeof ex.dispose === 'function')
                await ex.dispose();
            else if (ex.model && typeof ex.model.dispose === 'function')
                await ex.model.dispose();
        }
        catch { /* best effort — the reference is already dropped for GC */ }
    }
    async embed(texts, kind) {
        if (!this.extractor)
            throw new Error('Embedding model not initialised');
        // Cap length: these models only attend to ~512 tokens, and long inputs are O(n²) slow.
        const input = texts.map((t) => this.prefix(t.slice(0, EMBED_MAX_CHARS), kind));
        const out = await this.extractor(input, { pooling: 'mean', normalize: true });
        const list = out.tolist();
        return list.map((arr) => Float32Array.from(arr));
    }
}
class SqliteIndex {
    constructor(dbPath) {
        // Cached per-section (chunk) vectors + global mean for "related"; invalidated on any write.
        this.chunkCache = null;
        fs_1.default.mkdirSync(path_1.default.dirname(dbPath), { recursive: true });
        this.db = new better_sqlite3_1.default(dbPath);
        this.db.pragma('journal_mode = WAL');
        loadVecExtension(this.db);
    }
    getMeta(key) {
        const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
        return row?.value ?? null;
    }
    setMeta(key, value) {
        this.db.prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
    }
    /** Ensure schema for (modelId, dim). Returns true when a full reindex is needed
     *  (fresh DB, or model/dim/schema changed → existing vectors are invalid). */
    ensure(modelId, dim) {
        // Stable tables (never need a destructive migration).
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS notes (note_id TEXT PRIMARY KEY, file_path TEXT, title TEXT);
      CREATE INDEX IF NOT EXISTS idx_notes_path ON notes(file_path);
    `);
        const vecExists = this.db.prepare("SELECT name FROM sqlite_master WHERE name = 'vec_chunks'").get();
        const matches = vecExists &&
            this.getMeta('modelId') === modelId &&
            this.getMeta('dim') === String(dim) &&
            this.getMeta('schemaVersion') === String(protocol_1.SCHEMA_VERSION);
        if (matches)
            return false;
        // Fresh or mismatched → (re)build the data tables from scratch (the index is derived).
        // Dropping chunks/fts lets a schema bump add columns (e.g. section_name).
        this.db.exec(`
      DROP TABLE IF EXISTS vec_chunks;
      DROP TABLE IF EXISTS fts_chunks;
      DROP TABLE IF EXISTS chunks;
      DELETE FROM notes;
      CREATE TABLE chunks (
        chunk_id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id TEXT NOT NULL,
        section_id TEXT NOT NULL,
        section_name TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        text TEXT NOT NULL
      );
      CREATE INDEX idx_chunks_note ON chunks(note_id);
      CREATE VIRTUAL TABLE fts_chunks USING fts5(text);
    `);
        this.db.exec(`CREATE VIRTUAL TABLE vec_chunks USING vec0(chunk_id INTEGER PRIMARY KEY, embedding float[${dim}])`);
        this.setMeta('modelId', modelId);
        this.setMeta('dim', String(dim));
        this.setMeta('schemaVersion', String(protocol_1.SCHEMA_VERSION));
        this.chunkCache = null;
        return true;
    }
    isEmpty() {
        const row = this.db.prepare('SELECT COUNT(*) AS n FROM chunks').get();
        return row.n === 0;
    }
    tableExists(name) {
        return !!this.db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?").get(name);
    }
    /** True when the index holds servable vectors — graph/related work WITHOUT loading the model. */
    isServable() {
        if (!this.tableExists('vec_chunks') || !this.tableExists('chunks'))
            return false;
        const row = this.db.prepare('SELECT COUNT(*) AS n FROM chunks').get();
        return row.n > 0;
    }
    /** True when the stored vectors match the active model + schema (otherwise they're stale). */
    metaMatches(modelId) {
        if (!this.tableExists('meta'))
            return false;
        return this.getMeta('modelId') === modelId && this.getMeta('schemaVersion') === String(protocol_1.SCHEMA_VERSION);
    }
    getNoteSections(noteId) {
        const rows = this.db.prepare('SELECT section_id, content_hash, chunk_id FROM chunks WHERE note_id = ?').all(noteId);
        const map = new Map();
        for (const r of rows)
            map.set(r.section_id, r);
        return map;
    }
    /** Apply an incremental note update in one transaction. */
    applyNoteUpdate(noteId, filePath, title, deleteChunkIds, inserts) {
        const tx = this.db.transaction(() => {
            this.db.prepare('INSERT INTO notes(note_id, file_path, title) VALUES(?, ?, ?) ' +
                'ON CONFLICT(note_id) DO UPDATE SET file_path = excluded.file_path, title = excluded.title').run(noteId, path_1.default.resolve(filePath), title);
            const delChunk = this.db.prepare('DELETE FROM chunks WHERE chunk_id = ?');
            const delVec = this.db.prepare('DELETE FROM vec_chunks WHERE chunk_id = ?');
            const delFts = this.db.prepare('DELETE FROM fts_chunks WHERE rowid = ?');
            // vec0 requires integer (BigInt) primary keys for both inserts and deletes.
            for (const id of deleteChunkIds) {
                delChunk.run(id);
                delVec.run(BigInt(id));
                delFts.run(id);
            }
            const insChunk = this.db.prepare('INSERT INTO chunks(note_id, section_id, section_name, content_hash, text) VALUES(?, ?, ?, ?, ?)');
            const insVec = this.db.prepare('INSERT INTO vec_chunks(chunk_id, embedding) VALUES(?, ?)');
            const insFts = this.db.prepare('INSERT INTO fts_chunks(rowid, text) VALUES(?, ?)');
            for (const ins of inserts) {
                const info = insChunk.run(noteId, ins.sectionId, ins.sectionName, ins.hash, ins.text);
                const chunkId = Number(info.lastInsertRowid);
                insVec.run(BigInt(chunkId), floatBuf(ins.embedding));
                insFts.run(chunkId, ins.text);
            }
        });
        tx();
        this.chunkCache = null;
    }
    /** Bulk insert pre-embedded chunks (used by reindex, batched across notes). */
    bulkInsert(rows) {
        const tx = this.db.transaction(() => {
            const upNote = this.db.prepare('INSERT INTO notes(note_id, file_path, title) VALUES(?, ?, ?) ' +
                'ON CONFLICT(note_id) DO UPDATE SET file_path = excluded.file_path, title = excluded.title');
            const insChunk = this.db.prepare('INSERT INTO chunks(note_id, section_id, section_name, content_hash, text) VALUES(?, ?, ?, ?, ?)');
            const insVec = this.db.prepare('INSERT INTO vec_chunks(chunk_id, embedding) VALUES(?, ?)');
            const insFts = this.db.prepare('INSERT INTO fts_chunks(rowid, text) VALUES(?, ?)');
            const seenNotes = new Set();
            for (const r of rows) {
                if (!seenNotes.has(r.noteId)) {
                    upNote.run(r.noteId, path_1.default.resolve(r.filePath), r.title);
                    seenNotes.add(r.noteId);
                }
                const info = insChunk.run(r.noteId, r.sectionId, r.sectionName, r.hash, r.text);
                const chunkId = Number(info.lastInsertRowid);
                insVec.run(BigInt(chunkId), floatBuf(r.embedding));
                insFts.run(chunkId, r.text);
            }
        });
        tx();
        this.chunkCache = null;
    }
    removeNote(noteId) {
        const rows = this.db.prepare('SELECT chunk_id FROM chunks WHERE note_id = ?').all(noteId);
        const tx = this.db.transaction(() => {
            const delChunk = this.db.prepare('DELETE FROM chunks WHERE chunk_id = ?');
            const delVec = this.db.prepare('DELETE FROM vec_chunks WHERE chunk_id = ?');
            const delFts = this.db.prepare('DELETE FROM fts_chunks WHERE rowid = ?');
            for (const r of rows) {
                delChunk.run(r.chunk_id);
                delVec.run(BigInt(r.chunk_id));
                delFts.run(r.chunk_id);
            }
            this.db.prepare('DELETE FROM notes WHERE note_id = ?').run(noteId);
        });
        tx();
        this.chunkCache = null;
    }
    removeNoteByFilePath(filePath) {
        const row = this.db.prepare('SELECT note_id FROM notes WHERE file_path = ?')
            .get(path_1.default.resolve(filePath));
        if (row)
            this.removeNote(row.note_id);
    }
    clearAll() {
        this.db.exec('DELETE FROM chunks; DELETE FROM vec_chunks; DELETE FROM fts_chunks; DELETE FROM notes;');
        this.chunkCache = null;
    }
    chunkMetaFor(chunkIds) {
        const map = new Map();
        if (chunkIds.length === 0)
            return map;
        const placeholders = chunkIds.map(() => '?').join(',');
        const rows = this.db.prepare(`SELECT chunk_id, note_id, section_id, text FROM chunks WHERE chunk_id IN (${placeholders})`).all(...chunkIds);
        for (const r of rows)
            map.set(r.chunk_id, r);
        return map;
    }
    /** Vector KNN: returns chunk_ids ranked best-first, merged across query vectors. */
    vecRank(queryVecs, k) {
        const best = new Map(); // chunk_id -> min distance
        const stmt = this.db.prepare('SELECT chunk_id, distance FROM vec_chunks WHERE embedding MATCH ? ORDER BY distance LIMIT ?');
        for (const v of queryVecs) {
            const rows = stmt.all(floatBuf(v), k);
            for (const r of rows) {
                const prev = best.get(r.chunk_id);
                if (prev === undefined || r.distance < prev)
                    best.set(r.chunk_id, r.distance);
            }
        }
        return [...best.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
    }
    /** FTS5 BM25: returns chunk_ids ranked best-first. */
    ftsRank(queryText, k) {
        const q = buildFtsQuery(queryText);
        if (!q)
            return [];
        try {
            const rows = this.db.prepare('SELECT rowid AS chunk_id FROM fts_chunks WHERE fts_chunks MATCH ? ORDER BY rank LIMIT ?').all(q, k);
            return rows.map((r) => r.chunk_id);
        }
        catch {
            return [];
        }
    }
    /** Hybrid retrieval: vector + FTS ranks fused with RRF, aggregated to note level. */
    hybrid(queryVecs, queryText, k, excludeNoteId) {
        const pool = Math.max(k * 6, 30);
        const vecIds = this.vecRank(queryVecs, pool);
        const ftsIds = this.ftsRank(queryText, pool);
        const meta = this.chunkMetaFor([...new Set([...vecIds, ...ftsIds])]);
        const RRF_K = 60;
        // Aggregate to note level, keeping the best (first-ranked) chunk per note per list.
        const noteScore = new Map();
        const noteBestChunk = new Map();
        const fuse = (ids) => {
            const seenNotes = new Set();
            ids.forEach((chunkId, rank) => {
                const m = meta.get(chunkId);
                if (!m || m.note_id === excludeNoteId)
                    return;
                if (seenNotes.has(m.note_id))
                    return; // only best chunk of this note in this list
                seenNotes.add(m.note_id);
                noteScore.set(m.note_id, (noteScore.get(m.note_id) ?? 0) + 1 / (RRF_K + rank));
                if (!noteBestChunk.has(m.note_id))
                    noteBestChunk.set(m.note_id, m);
            });
        };
        fuse(vecIds);
        fuse(ftsIds);
        return [...noteScore.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, k)
            .map(([noteId, score]) => {
            const m = noteBestChunk.get(noteId);
            return { noteId, sectionId: m.section_id, score, snippet: toSnippet(m.text) };
        });
    }
    /** All section (chunk) vectors + their global mean. Cached; invalidated on writes. */
    getChunkCache() {
        if (this.chunkCache)
            return this.chunkCache;
        const rows = this.db.prepare('SELECT v.chunk_id AS chunk_id, c.note_id AS note_id, c.section_id AS section_id, v.embedding AS embedding ' +
            'FROM vec_chunks v JOIN chunks c ON c.chunk_id = v.chunk_id').all();
        const items = [];
        let dim = 0;
        let mean = new Float32Array(0);
        for (const r of rows) {
            const vec = new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength / 4).slice();
            if (dim === 0) {
                dim = vec.length;
                mean = new Float32Array(dim);
            }
            items.push({ chunkId: r.chunk_id, noteId: r.note_id, sectionId: r.section_id, vec });
            for (let i = 0; i < dim; i++)
                mean[i] += vec[i];
        }
        if (items.length > 0)
            for (let i = 0; i < dim; i++)
                mean[i] /= items.length;
        this.chunkCache = { items, mean };
        return this.chunkCache;
    }
    chunkDisplay(chunkId) {
        const r = this.db.prepare('SELECT c.note_id, c.section_id, c.section_name, c.text, n.title ' +
            'FROM chunks c LEFT JOIN notes n ON n.note_id = c.note_id WHERE c.chunk_id = ?').get(chunkId);
        return {
            noteId: r?.note_id ?? '',
            title: r?.title ?? '',
            sectionId: r?.section_id ?? '',
            sectionName: r?.section_name ?? '',
            snippet: r ? toSnippet(r.text) : '',
        };
    }
    /**
     * Related notes for a specific SECTION. Uses that section's vector (centered by the
     * global mean to counter embedding anisotropy) and finds the nearest sections in OTHER
     * notes, keeping the single best-matching section per note. Only genuinely topical
     * neighbours score above `minScore`. Falls back to the note's centroid if the section
     * has no indexed content.
     */
    relatedBySection(noteId, sectionId, k, minScore = 0.03) {
        const { items, mean } = this.getChunkCache();
        if (items.length === 0)
            return [];
        const dim = items[0].vec.length;
        let query = items.find((it) => it.noteId === noteId && it.sectionId === sectionId)?.vec;
        if (!query) {
            const own = items.filter((it) => it.noteId === noteId);
            if (own.length === 0)
                return [];
            const c = new Float32Array(dim);
            for (const it of own)
                for (let i = 0; i < dim; i++)
                    c[i] += it.vec[i];
            for (let i = 0; i < dim; i++)
                c[i] /= own.length;
            query = c;
        }
        const center = (v) => {
            const out = new Float32Array(dim);
            let norm = 0;
            for (let i = 0; i < dim; i++) {
                out[i] = v[i] - mean[i];
                norm += out[i] * out[i];
            }
            norm = Math.sqrt(norm) || 1;
            for (let i = 0; i < dim; i++)
                out[i] /= norm;
            return out;
        };
        const qc = center(query);
        // Other notes: keep the single best-scoring section per note.
        // Same note: keep each sibling section individually (distinct navigable tabs).
        const bestByNote = new Map();
        const siblings = [];
        for (const it of items) {
            if (it.noteId === noteId && it.sectionId === sectionId)
                continue; // skip the active section itself
            const vc = center(it.vec);
            let dot = 0;
            for (let i = 0; i < dim; i++)
                dot += qc[i] * vc[i];
            if (it.noteId === noteId) {
                siblings.push({ chunkId: it.chunkId, score: dot });
            }
            else {
                const prev = bestByNote.get(it.noteId);
                if (!prev || dot > prev.score)
                    bestByNote.set(it.noteId, { chunkId: it.chunkId, score: dot });
            }
        }
        return [...siblings, ...bestByNote.values()]
            .filter((b) => b.score > minScore)
            .sort((a, b) => b.score - a.score)
            .slice(0, k)
            .map((b) => ({ ...this.chunkDisplay(b.chunkId), score: b.score }));
    }
    /**
     * Note-to-note content edges for the brain graph. Builds one centroid per note from its
     * section vectors, centers each by the global mean and normalises (same anisotropy fix as
     * relatedBySection), then computes cosine over all note pairs. Keeps edges above minScore,
     * pruned to the top `maxPerNote` per note (kept if either endpoint ranks it) to avoid a
     * hairball. Returns an undirected edge list (a < b) — the renderer adds the structure layer.
     */
    contentEdges(minScore = 0.05, maxPerNote = 6) {
        const { items, mean } = this.getChunkCache();
        if (items.length === 0)
            return [];
        const dim = items[0].vec.length;
        // Centroid per note (averaged section vectors).
        const sums = new Map();
        for (const it of items) {
            let acc = sums.get(it.noteId);
            if (!acc) {
                acc = { vec: new Float32Array(dim), count: 0 };
                sums.set(it.noteId, acc);
            }
            for (let i = 0; i < dim; i++)
                acc.vec[i] += it.vec[i];
            acc.count++;
        }
        // Center by global mean + L2-normalise the centroid.
        const noteIds = [];
        const centroids = [];
        for (const [noteId, acc] of sums) {
            const c = new Float32Array(dim);
            let norm = 0;
            for (let i = 0; i < dim; i++) {
                const v = acc.vec[i] / acc.count - mean[i];
                c[i] = v;
                norm += v * v;
            }
            norm = Math.sqrt(norm) || 1;
            for (let i = 0; i < dim; i++)
                c[i] /= norm;
            noteIds.push(noteId);
            centroids.push(c);
        }
        // All pairs cosine (centroids are already normalised → cosine = dot).
        const n = noteIds.length;
        const candByNote = new Map();
        const push = (i, j, score) => {
            const arr = candByNote.get(i) ?? [];
            arr.push({ j, score });
            candByNote.set(i, arr);
        };
        for (let i = 0; i < n; i++) {
            const ci = centroids[i];
            for (let j = i + 1; j < n; j++) {
                const cj = centroids[j];
                let dot = 0;
                for (let d = 0; d < dim; d++)
                    dot += ci[d] * cj[d];
                if (dot > minScore) {
                    push(i, j, dot);
                    push(j, i, dot);
                }
            }
        }
        // Keep an edge if it's within either endpoint's top `maxPerNote`.
        const keep = new Set();
        for (const [i, arr] of candByNote) {
            arr.sort((a, b) => b.score - a.score);
            for (const { j } of arr.slice(0, maxPerNote)) {
                const lo = Math.min(i, j), hi = Math.max(i, j);
                keep.add(`${lo}|${hi}`);
            }
        }
        const edges = [];
        for (const key of keep) {
            const [lo, hi] = key.split('|').map(Number);
            const ci = centroids[lo], cj = centroids[hi];
            let dot = 0;
            for (let d = 0; d < dim; d++)
                dot += ci[d] * cj[d];
            edges.push({ a: noteIds[lo], b: noteIds[hi], score: dot });
        }
        return edges;
    }
}
// ── Orchestration ───────────────────────────────────────────────────────────
const provider = new EmbeddingProvider();
let index = null;
let currentModelId = '';
let currentCacheDir = '';
// Once the model has finished its embedding work, hold it this long with no further embed activity
// before releasing it back to dormant (~70 MB). A short grace avoids reload thrash if the user
// reindexes twice in a row or keeps editing right after — kept tight so the heavy ~1 GB of weights
// drops back quickly after a one-off chat query (the main process kills the whole worker later).
const MODEL_IDLE_UNLOAD_MS = 10000;
let unloadTimer = null;
function cancelModelUnload() {
    if (unloadTimer) {
        clearTimeout(unloadTimer);
        unloadTimer = null;
    }
}
// (Re)arm the release timer. Called after every embed task; reset each time so the model only drops
// once embedding has been idle for the full window. Graph/related never call this (they don't load it).
function scheduleModelUnload() {
    cancelModelUnload();
    unloadTimer = setTimeout(() => {
        unloadTimer = null;
        if (!provider.ready)
            return;
        void provider.unload().then(() => {
            emitState('idle'); // index still servable from disk; just no model resident now
        });
    }, MODEL_IDLE_UNLOAD_MS);
}
// Lazily load the heavy embedding model the first time text must be turned into vectors
// (reindex / index-note / search / explicit activate). Graph & related never call this — they
// read the stored vectors. Returns whether a full reindex is needed (model/schema/dim changed).
async function ensureModelLoaded() {
    if (!index)
        throw new Error('Index not initialised');
    cancelModelUnload(); // about to use the model — don't let a pending release fire mid-task
    if (!provider.ready)
        await provider.init(currentModelId, currentCacheDir);
    // Now the real embedding dim is known → size/verify the schema; reindex if it changed or is empty.
    return index.ensure(currentModelId, provider.dim) || index.isEmpty();
}
// Strip base64 data URIs (embedded images) — huge, zero semantic value, and catastrophically
// slow to embed/tokenize if left in (a single pasted image can take tens of seconds).
function stripNoise(text) {
    return text.replace(/data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, '[image]');
}
function chunkTextFor(s) {
    return stripNoise(`${s.name}\n${s.content}`).trim();
}
// A section is "empty" when its body is blank after stripping noise (base64 images, etc.).
// Such a section carries no semantic signal — only the (often default) section name — so it must
// NOT be embedded: otherwise every blank note would cluster together by sharing the name "Note".
function hasIndexableContent(s) {
    return stripNoise(s.content).trim().length > 0;
}
async function handleIndexNote(dirPath, data) {
    if (!index)
        throw new Error('Index not initialised');
    // Dormant (model not loaded): don't auto-load it just to index an edit. The next explicit
    // reindex picks up the change. This keeps note saves from waking the heavy model.
    if (!provider.ready)
        return { ok: true, skipped: true };
    // `data`: a linked note (external .md) handed over as data; `dirPath` is then its index key.
    const parsed = data ?? readNoteFolder(dirPath);
    if (!parsed || !parsed.noteId || parsed.encrypted) {
        index.removeNoteByFilePath(dirPath);
        return { ok: true, skipped: true };
    }
    const desired = parsed.sections
        .filter((s) => !s.aiHidden) // sections hidden from the AI never enter the index
        .filter(hasIndexableContent) // empty sections carry no semantic signal → never relate them
        .map((s) => ({ sectionId: s.id, sectionName: s.name, text: chunkTextFor(s) }))
        .filter((d) => d.text.length > 0)
        .map((d) => ({ ...d, hash: fnv1a(d.text) }));
    const existing = index.getNoteSections(parsed.noteId);
    const desiredIds = new Set(desired.map((d) => d.sectionId));
    const deleteChunkIds = [];
    const toEmbed = [];
    for (const d of desired) {
        const ex = existing.get(d.sectionId);
        if (ex && ex.content_hash === d.hash)
            continue; // unchanged → keep existing chunk
        if (ex)
            deleteChunkIds.push(ex.chunk_id); // changed → replace
        toEmbed.push(d);
    }
    for (const [sectionId, ex] of existing) {
        if (!desiredIds.has(sectionId))
            deleteChunkIds.push(ex.chunk_id); // removed section
    }
    const embeddings = toEmbed.length > 0 ? await provider.embed(toEmbed.map((d) => d.text), 'passage') : [];
    const inserts = toEmbed.map((d, i) => ({
        sectionId: d.sectionId, sectionName: d.sectionName, hash: d.hash, text: d.text, embedding: embeddings[i],
    }));
    index.applyNoteUpdate(parsed.noteId, dirPath, parsed.title, deleteChunkIds, inserts);
    return { ok: true };
}
const REINDEX_BATCH = 16; // embed many sections per inference call → much better CPU throughput
async function handleReindexAll(notesDir, extra = []) {
    if (!index)
        throw new Error('Index not initialised');
    await ensureModelLoaded(); // reindex needs to embed text → load the model now
    emitState('indexing');
    index.clearAll();
    const rows = [];
    const sources = [
        ...(0, noteFormat_1.listNoteDirs)(notesDir).map((dir) => {
            const dirPath = path_1.default.join(notesDir, dir);
            return { dirPath, parsed: readNoteFolder(dirPath) };
        }),
        ...extra.map((d) => ({ dirPath: d.key, parsed: d.note })),
    ];
    for (const { dirPath, parsed } of sources) {
        if (!parsed || !parsed.noteId || parsed.encrypted)
            continue;
        for (const s of parsed.sections) {
            if (s.aiHidden)
                continue; // sections hidden from the AI never enter the index
            if (!hasIndexableContent(s))
                continue; // empty sections carry no semantic signal → never relate them
            const text = chunkTextFor(s);
            if (!text)
                continue;
            rows.push({ noteId: parsed.noteId, filePath: dirPath, title: parsed.title, sectionId: s.id, sectionName: s.name, text, hash: fnv1a(text) });
        }
    }
    // 2) Embed in batches and write incrementally (progress is per-section → smooth bar).
    let done = 0;
    emitProgress({ done, total: rows.length, phase: 'indexing' });
    for (let i = 0; i < rows.length; i += REINDEX_BATCH) {
        const batch = rows.slice(i, i + REINDEX_BATCH);
        const embs = await provider.embed(batch.map((r) => r.text), 'passage');
        index.bulkInsert(batch.map((r, j) => ({ ...r, embedding: embs[j] })));
        done += batch.length;
        emitProgress({ done, total: rows.length, phase: 'indexing' });
    }
    emitState('idle');
    return { ok: true, indexed: rows.length };
}
async function handleSearch(query, k) {
    if (!index)
        throw new Error('Index not initialised');
    await ensureModelLoaded(); // search must embed the query → load the model now
    const [qvec] = await provider.embed([query], 'query');
    return index.hybrid([qvec], query, k);
}
async function handleRelated(noteId, sectionId, k) {
    if (!index)
        throw new Error('Index not initialised');
    if (!index.isServable())
        return []; // no stored vectors yet → nothing to relate (no model needed)
    return index.relatedBySection(noteId, sectionId, k);
}
function handleGraph(minScore, maxPerNote) {
    if (!index)
        throw new Error('Index not initialised');
    if (!index.isServable())
        return []; // served straight from stored vectors; model not required
    return index.contentEdges(minScore, maxPerNote);
}
// ── Message loop ────────────────────────────────────────────────────────────
parentPort.on('message', async (e) => {
    const req = e.data;
    try {
        switch (req.type) {
            case 'init': {
                currentModelId = req.payload.modelId;
                currentCacheDir = req.payload.cacheDir;
                index = new SqliteIndex(req.payload.dbPath);
                // Light start: open the DB only — the model loads lazily (reindex/search/activate). When the
                // stored vectors match the active model, graph & related are servable right now without it.
                const indexReady = index.isServable() && index.metaMatches(currentModelId);
                send({ type: 'result', id: req.id, payload: { ok: true, indexReady } });
                break;
            }
            case 'load-model': {
                // Explicit activation (reactivate / model swap): load the model and report if a reindex
                // is needed because the stored vectors are stale or missing.
                const needsReindex = await ensureModelLoaded();
                send({ type: 'result', id: req.id, payload: { ok: true, needsReindex } });
                scheduleModelUnload(); // if no reindex follows, release the model after the grace window
                break;
            }
            case 'index-note': {
                const r = await handleIndexNote(req.payload.dirPath);
                send({ type: 'result', id: req.id, payload: r });
                if (!r.skipped)
                    scheduleModelUnload(); // keep the model alive while edits keep arriving
                break;
            }
            case 'index-note-data': {
                const r = await handleIndexNote(req.payload.key, req.payload.note);
                send({ type: 'result', id: req.id, payload: r });
                if (!r.skipped)
                    scheduleModelUnload();
                break;
            }
            case 'remove-note': {
                index?.removeNoteByFilePath(req.payload.dirPath);
                send({ type: 'result', id: req.id, payload: { ok: true } });
                break;
            }
            case 'reindex-all': {
                const r = await handleReindexAll(req.payload.notesDir, req.payload.extra);
                send({ type: 'result', id: req.id, payload: r });
                scheduleModelUnload(); // work done + persisted → release the model back to dormant
                break;
            }
            case 'search': {
                const r = await handleSearch(req.payload.query, req.payload.k);
                send({ type: 'result', id: req.id, payload: r });
                scheduleModelUnload();
                break;
            }
            case 'related': {
                const r = await handleRelated(req.payload.noteId, req.payload.sectionId, req.payload.k);
                send({ type: 'result', id: req.id, payload: r });
                break;
            }
            case 'graph': {
                const r = handleGraph(req.payload.minScore, req.payload.maxPerNote);
                send({ type: 'result', id: req.id, payload: r });
                break;
            }
        }
    }
    catch (err) {
        const id = req.id ?? -1;
        emitState('idle');
        scheduleModelUnload(); // don't leave the model resident after a failed embed task
        send({ type: 'error', id, error: String(err?.stack ?? err) });
    }
});
// Signal the parent that the worker module has loaded and the message loop is ready.
send({ type: 'state', payload: 'idle' });
void currentModelId;
