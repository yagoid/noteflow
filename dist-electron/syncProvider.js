"use strict";
// SyncProvider — the common surface main.ts uses to route note/metadata writes,
// deletes and pulls to the active sync backend, extracted from what main.ts
// historically consumed from githubSync.ts.
//
// GitHub Sync and NoteFlow Cloud are MUTUALLY EXCLUSIVE *as routing targets*:
// when cloudSync is enabled it takes priority and no write ROUTED THROUGH HERE
// reaches GitHub (its connection settings are untouched). That is not the same
// as "GitHub never writes": a manual GitHub pull (`sync:pull`, Settings → Sync →
// GitHub) still runs inside githubSync and its catch-up (flushPendingLocalChanges)
// pushes note files to the repo without passing through this router — by design,
// it is what keeps the paused GitHub mirror from going stale (see sync.md).
// The Settings UI enforcement of "pick one" arrives in phase 4.2 stage 4 — until
// then getActiveSyncProvider() is the single source of truth for which backend
// receives routed writes.
//
// Both adapters are THIN: they delegate 1:1 to the module singletons without
// changing behavior. Backend-specific surface (Device Flow, remote format
// migration, cloud keys/unlock) intentionally stays OUT of the interface —
// main.ts keeps calling those modules directly through their own IPC handlers.
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
exports.cloudProvider = exports.githubProvider = void 0;
exports.getActiveSyncProvider = getActiveSyncProvider;
exports.getActiveSyncStatus = getActiveSyncStatus;
const githubSync = __importStar(require("./githubSync"));
const cloudSync = __importStar(require("./cloudSync"));
exports.githubProvider = {
    id: 'github',
    isConnected: () => githubSync.getSyncStatus().connected,
    schedulePush: (relPath, content, onStart, onComplete) => githubSync.schedulePush(relPath, content, onStart, onComplete),
    pushPathsNow: (notesDir, relPaths) => githubSync.pushPathsNow(notesDir, relPaths),
    scheduleDelete: (relPath) => githubSync.scheduleDelete(relPath),
    scheduleDeleteDir: (dir) => githubSync.scheduleDeleteDir(dir),
    pullNotes: (notesDir) => githubSync.pullNotes(notesDir),
    retrySyncJournal: (notesDir) => githubSync.retrySyncJournal(notesDir),
    hasPendingRemoteMutations: () => githubSync.hasPendingRemoteMutations(),
};
exports.cloudProvider = {
    id: 'cloud',
    // "Connected" = enabled + a signed-in account. The key session may still be
    // locked — pushes gate themselves internally and stay journaled until unlock.
    isConnected: () => {
        const s = cloudSync.getCloudSyncStatus();
        return s.enabled && s.configured && s.signedIn;
    },
    schedulePush: (relPath, content, onStart, onComplete) => cloudSync.schedulePush(relPath, content, onStart, onComplete),
    pushPathsNow: (notesDir, relPaths) => cloudSync.pushPathsNow(notesDir, relPaths),
    scheduleDelete: (relPath) => cloudSync.scheduleDelete(relPath),
    scheduleDeleteDir: (dir) => cloudSync.scheduleDeleteDir(dir),
    pullNotes: (notesDir) => cloudSync.pullNotes(notesDir),
    retrySyncJournal: (notesDir) => cloudSync.retrySyncJournal(notesDir),
    hasPendingRemoteMutations: () => cloudSync.hasPendingRemoteMutations(),
};
/** The live backend: Cloud when enabled (priority), GitHub otherwise. */
function getActiveSyncProvider() {
    return cloudSync.isCloudSyncEnabled() ? exports.cloudProvider : exports.githubProvider;
}
/** `pendingUploads` is owned by main.ts (pendingPushFiles), so the caller passes it in. */
function getActiveSyncStatus(pendingUploads) {
    if (cloudSync.isCloudSyncEnabled()) {
        const c = cloudSync.getCloudSyncStatus();
        return {
            backend: 'cloud',
            active: true,
            lastSync: c.lastSync,
            error: c.error,
            initialPullStatus: c.initialPullStatus,
            pendingUploads,
            autoSyncIntervalMs: cloudSync.CLOUD_AUTO_SYNC_INTERVAL_MS,
            cloud: { keysState: c.keysState, keysMode: c.keysMode, realtimeConnected: c.realtimeConnected },
        };
    }
    const g = githubSync.getSyncStatus();
    if (g.connected) {
        return {
            backend: 'github',
            active: true,
            lastSync: g.lastSync,
            error: g.error,
            initialPullStatus: g.initialPullStatus,
            pendingUploads,
            autoSyncIntervalMs: githubSync.GITHUB_AUTO_SYNC_INTERVAL_MS,
            github: { owner: g.owner, repo: g.repo },
        };
    }
    return { backend: 'none', active: false, initialPullStatus: 'pending', pendingUploads };
}
