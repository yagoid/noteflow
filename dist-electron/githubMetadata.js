"use strict";
// GitHub Sync: pull decision for one root metadata JSON (groups.json,
// folders.json, templates.json…). Pure — no Electron, no IO — so it is unit
// tested (tests/electron/githubMetadata.test.ts) and mirrored by the CLI's
// planGithubMetadataPull (cli/noteflow.js).
//
// GitHub has no version for metadata files: once this device has reconciled a
// file (its blob sha is in the SHA cache, SyncState.shas), a different remote
// copy simply wins (LWW — the historical rule, kept as is). The dangerous case
// is the FIRST reconcile: connecting to a repo that already holds its own
// groups/folders/templates (another device), or the first pull after
// sync-state.json was lost. Overwriting there silently dropped every local
// group/folder/template the repo didn't know (the notes kept dangling ids).
// So, with no base, the pull follows NoteFlow Cloud's first-pull rule — the
// SAME planMetadataPull, not a copy: local file backed up, id-keyed arrays
// merged (union by id, remote wins on a shared id), the other files take the
// remote. On top of that the GitHub pull must UPLOAD whatever ended on disk
// when it differs from the remote — Cloud's first-sync catch-up does that, the
// GitHub catch-up (flushPendingLocalChanges) only looks at note folders.
Object.defineProperty(exports, "__esModule", { value: true });
exports.planGithubMetadataPull = planGithubMetadataPull;
const cloudSyncLogic_1 = require("./cloudSyncLogic");
/**
 * @param reconciled whether this device has a cached (base) sha for the file —
 *   i.e. it already reconciled it with this repo. The caller only asks when the
 *   remote blob differs from that base.
 * @returns `keep` (leave the local file) or `write` (replace it with `content`,
 *   backing up the local version first when `backup`); `push` = the content
 *   left on disk differs from the remote and must be uploaded.
 */
function planGithubMetadataPull(relPath, localContent, remoteContent, opts) {
    if (opts.reconciled) {
        // Steady state: remote wins, exactly as before.
        return localContent === remoteContent
            ? { action: 'keep', push: false }
            : { action: 'write', content: remoteContent, backup: false, merged: false, push: false };
    }
    const decision = (0, cloudSyncLogic_1.planMetadataPull)(relPath, localContent, remoteContent, { pendingUpsert: false, firstPull: true });
    if (decision.action === 'keep') {
        // Identical, or the local file already contains every remote entry (the
        // union is the local file): the remote is the one missing entries.
        return { action: 'keep', push: localContent !== null && localContent !== remoteContent };
    }
    return { ...decision, push: decision.content !== remoteContent };
}
