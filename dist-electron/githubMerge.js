"use strict";
// GitHub Sync: per-file MERGE of a note folder on the pull's conflict path
// (QA B3) — the GitHub counterpart of the Cloud three-way pull. Instead of the
// remote version winning the folder and the local one going to a conflict
// copy, each file is reconciled against its base (the git blob sha this device
// last reconciled, SyncState.shas): a section both sides changed is merged
// line by line (mergeSectionText — diff3 with the base blob's content, fetched
// by sha from GitHub, else a two-way union; overlapping edits keep both
// versions between ⚠️ markers) and note.md's frontmatter with mergeAnchors.
// Pure: it adapts the git-sha view to Cloud's planThreeWayDir (synthetic seqs:
// 1 = "still the base", 2 = "moved") so both backends share ONE planner.
Object.defineProperty(exports, "__esModule", { value: true });
exports.planGithubDirMerge = planGithubDirMerge;
const cloudSyncLogic_1 = require("./cloudSyncLogic");
const noteFormat_1 = require("./noteFormat");
/**
 * The merge plan of a conflicting GitHub note folder, or null when it can't
 * be merged — the anchor is missing on a side, encrypted or unreadable (both
 * changed), or a section is not mergeable: the caller then keeps the
 * historical path (remote folder wholesale + conflict copy of the local one).
 */
function planGithubDirMerge(o) {
    const anchorRel = `${o.dir}/${noteFormat_1.NOTE_MD}`;
    const prefix = `${o.dir}/`;
    const files = o.files.filter((f) => f.path.startsWith(prefix) && f.path.endsWith('.md'));
    const anchor = files.find((f) => f.path === anchorRel);
    if (!anchor || anchor.local === null || anchor.remote === null)
        return null;
    // A section deleted on GitHub that this device edited since its base: the
    // deletion wins in the note, the local text goes to a copy (planner sees it as gone here too).
    const deletedRemotely = files.filter((f) => f.path !== anchorRel && f.base !== undefined && f.remote === null && f.local !== null && f.localSha !== f.base);
    const goneHere = new Set(deletedRemotely.map((f) => f.path));
    const local = {};
    const bases = {};
    const baseText = new Map();
    const remote = [];
    for (const f of files) {
        const localContent = goneHere.has(f.path) ? null : f.local;
        if (localContent !== null)
            local[f.path] = localContent;
        if (f.base !== undefined) {
            let hash = cloudSyncLogic_1.UNKNOWN_BASE_HASH;
            if (typeof f.baseContent === 'string') {
                hash = (0, cloudSyncLogic_1.hashForBase)(f.path, f.baseContent);
                baseText.set(f.path, f.baseContent);
            }
            else if (f.local !== null && f.localSha === f.base) {
                hash = (0, cloudSyncLogic_1.hashForBase)(f.path, f.local);
            }
            else if (f.remote !== null && f.remote.sha === f.base) {
                hash = (0, cloudSyncLogic_1.hashForBase)(f.path, f.remote.content);
            }
            bases[f.path] = { seq: 1, hash };
        }
        else {
            bases[f.path] = { seq: 1, hash: cloudSyncLogic_1.UNKNOWN_BASE_HASH };
        }
        if (f.remote !== null) {
            const atBase = f.base !== undefined && f.remote.sha === f.base;
            remote.push({ relPath: f.path, seq: atBase ? 1 : 2, content: f.remote.content, updatedAtMs: 0 });
        }
        else if (f.base !== undefined) {
            remote.push({ relPath: f.path, seq: 2, content: null, updatedAtMs: 0 }); // deleted on GitHub
        }
    }
    const plan = (0, cloudSyncLogic_1.planThreeWayDir)({
        dir: o.dir,
        local,
        remote,
        bases,
        pendingUpserts: new Set(),
        staleUpserts: new Set(),
        copiedUpserts: new Set(),
        pendingDeletes: new Set(),
        baseContent: (rel, hash) => {
            const text = baseText.get(rel);
            return text !== undefined && (0, cloudSyncLogic_1.hashForBase)(rel, text) === hash ? text : null;
        },
        conflictLabels: o.labels,
        nowIso: o.nowIso,
    });
    if (plan.copyWhole || plan.copySections.length > 0)
        return null;
    const final = {};
    for (const f of files)
        if (f.local !== null)
            final[f.path] = f.local;
    const removes = [...plan.removes, ...deletedRemotely.map((f) => f.path)];
    for (const rel of removes)
        delete final[rel];
    for (const w of plan.writes)
        final[w.relPath] = w.content;
    return {
        writes: plan.writes,
        removes,
        copySections: deletedRemotely.map((f) => f.path.slice(prefix.length)),
        conflictMarkerSections: plan.conflictMarkerSections,
        final,
    };
}
