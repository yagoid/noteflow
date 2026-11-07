"use strict";
// Pure sanitizer of snippets.json (editor snippets, notes dir, synced). Runs on
// every read and write in main (snippets:get / snippets:set): the file can come
// from another device through a pull, so the renderer never sees a malformed
// list. Format: a plain JSON array of { id, name, content, createdAt, isDefault? }
// in display order — the same "array of objects with a string id" shape as
// templates.json, so NoteFlow Cloud merges it by id (CLOUD_MERGEABLE_METADATA).
// Unknown keys of an item are preserved (forward compatibility with newer
// clients). Covered by tests/electron/snippetsFile.test.ts. Renderer side:
// src/lib/snippets.ts.
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeSnippets = sanitizeSnippets;
const MAX_ID = 64;
const MAX_NAME = 200;
const MAX_CONTENT = 100000;
const MAX_ITEMS = 500;
/**
 * Normalizes a parsed snippets.json: drops non-object items and items without a
 * non-empty string id, keeps the first of duplicated ids, coerces name/content
 * to (bounded) strings, fills a missing createdAt with `nowIso`, and leaves
 * `isDefault: true` on the first flagged item only (two devices can each flag
 * one before a merge). Anything that isn't an array → [].
 */
function sanitizeSnippets(raw, nowIso) {
    if (!Array.isArray(raw))
        return [];
    const seen = new Set();
    const out = [];
    let hasDefault = false;
    for (const item of raw) {
        if (out.length >= MAX_ITEMS)
            break;
        if (!item || typeof item !== 'object' || Array.isArray(item))
            continue;
        const rec = item;
        const id = typeof rec.id === 'string' ? rec.id.trim() : '';
        if (!id || id.length > MAX_ID || seen.has(id))
            continue;
        seen.add(id);
        const { isDefault, ...rest } = rec;
        const next = {
            ...rest,
            id,
            name: typeof rec.name === 'string' ? rec.name.slice(0, MAX_NAME) : '',
            content: typeof rec.content === 'string' ? rec.content.slice(0, MAX_CONTENT) : '',
            createdAt: typeof rec.createdAt === 'string' && rec.createdAt ? rec.createdAt : nowIso,
        };
        if (isDefault === true && !hasDefault) {
            next.isDefault = true;
            hasDefault = true;
        }
        out.push(next);
    }
    return out;
}
