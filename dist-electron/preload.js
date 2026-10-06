"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const api = {
    // Identification
    windowId: () => electron_1.ipcRenderer.sendSync('window:get-id'),
    // Platform — lets the renderer adapt shortcut labels (⌘ vs Ctrl), etc.
    platform: process.platform,
    // Real hardware info from the Node side (os module). Read synchronously from the
    // main process at preload load so the renderer can access it without async IPC: the
    // Brain store needs it at import time to decide 2D vs 3D. It must come from main
    // because the preload runs sandboxed (Electron 35 default) and node:os is not
    // available there. The browser's navigator.hardwareConcurrency (logical threads)
    // and navigator.deviceMemory (coarse, power-of-two, capped ~8) are too blunt to spot
    // low-power laptop chips; os.cpus() exposes the CPU model (with base clock) and
    // os.totalmem() the real RAM.
    hardware: electron_1.ipcRenderer.sendSync('app:get-hardware'),
    // File system (folder-per-note: one dir per note, one .md per section)
    readAllNotes: () => electron_1.ipcRenderer.invoke('fs:read-all-notes'),
    readNoteDir: (dir) => electron_1.ipcRenderer.invoke('fs:read-note-dir', dir),
    writeNote: (payload) => electron_1.ipcRenderer.invoke('fs:write-note', payload),
    deleteNote: (dir) => electron_1.ipcRenderer.invoke('fs:delete-note', dir),
    getNotesDir: () => electron_1.ipcRenderer.invoke('fs:notes-dir'),
    openNotesFolder: () => electron_1.ipcRenderer.invoke('app:open-notes-folder'),
    chooseNotesDir: () => electron_1.ipcRenderer.invoke('app:choose-notes-dir'),
    // Settings
    getTheme: () => electron_1.ipcRenderer.sendSync('settings:get-theme'),
    setTheme: (id) => electron_1.ipcRenderer.send('settings:set-theme', id),
    // Synced UI settings (ui-settings.json). Sync read on purpose: initTheme()
    // needs it before the first paint to avoid a theme flash.
    getUiSettings: () => electron_1.ipcRenderer.sendSync('ui-settings:get'),
    // Partial patch — main merges it over what is on disk (see ui-settings:set).
    setUiSettings: (patch) => electron_1.ipcRenderer.invoke('ui-settings:set', patch),
    getLanguage: () => electron_1.ipcRenderer.sendSync('settings:get-language'),
    setLanguage: (setting) => electron_1.ipcRenderer.send('settings:set-language', setting),
    onLanguageChanged: (callback) => {
        const wrapper = (_event, setting) => callback(setting);
        electron_1.ipcRenderer.on('language-changed', wrapper);
        return () => electron_1.ipcRenderer.removeListener('language-changed', wrapper);
    },
    getLoginItem: () => electron_1.ipcRenderer.invoke('app:get-login-item'),
    setLoginItem: (enabled) => electron_1.ipcRenderer.invoke('app:set-login-item', enabled),
    getSkillSync: () => electron_1.ipcRenderer.invoke('app:get-skill-sync'),
    setSkillSync: (enabled) => electron_1.ipcRenderer.invoke('app:set-skill-sync', enabled),
    getStartupStickies: () => electron_1.ipcRenderer.invoke('settings:get-startup-stickies'),
    setStartupStickies: (stickies) => electron_1.ipcRenderer.invoke('settings:set-startup-stickies', stickies),
    getUiState: () => electron_1.ipcRenderer.invoke('settings:get-ui-state'),
    setUiState: (patch) => electron_1.ipcRenderer.invoke('settings:set-ui-state', patch),
    getGroups: () => electron_1.ipcRenderer.invoke('groups:get'),
    setGroups: (groups) => electron_1.ipcRenderer.invoke('groups:set', groups),
    getFolders: () => electron_1.ipcRenderer.invoke('folders:get'),
    setFolders: (folders) => electron_1.ipcRenderer.invoke('folders:set', folders),
    getSectionTagColors: () => electron_1.ipcRenderer.invoke('section-colors:get'),
    setSectionTagColors: (colors) => electron_1.ipcRenderer.invoke('section-colors:set', colors),
    getNoteOrder: () => electron_1.ipcRenderer.invoke('note-order:get'),
    setNoteOrder: (order) => electron_1.ipcRenderer.invoke('note-order:set', order),
    getTemplates: () => electron_1.ipcRenderer.invoke('templates:get'),
    setTemplates: (templates) => electron_1.ipcRenderer.invoke('templates:set', templates),
    // Window controls
    openSticky: (noteId, sectionId) => electron_1.ipcRenderer.send('window:open-sticky', noteId, sectionId),
    // Editor-only window for one section (focuses an existing window already on it).
    openSectionWindow: (noteId, sectionId) => electron_1.ipcRenderer.send('window:open-section-window', noteId, sectionId),
    // A section window reports the section it's on, so re-opening it focuses this window.
    setSectionWindowTarget: (noteId, sectionId) => electron_1.ipcRenderer.send('window:section-window-target', noteId, sectionId),
    minimize: () => electron_1.ipcRenderer.send('window:minimize'),
    maximize: () => electron_1.ipcRenderer.send('window:maximize'),
    close: () => electron_1.ipcRenderer.send('window:close'),
    setSize: (w, h, minW, minH) => electron_1.ipcRenderer.send('window:set-size', w, h, minW, minH),
    setAlwaysOnTop: (flag) => electron_1.ipcRenderer.send('window:set-always-on-top', flag),
    foldToCorner: (w, h) => electron_1.ipcRenderer.send('window:fold-to-corner', w, h),
    unfold: () => electron_1.ipcRenderer.send('window:unfold'),
    // Updates
    getAppVersion: () => electron_1.ipcRenderer.invoke('app:get-version'),
    checkUpdate: () => electron_1.ipcRenderer.invoke('app:check-update'),
    openUrl: (url) => electron_1.ipcRenderer.invoke('app:open-url', url),
    downloadAndInstall: (url) => electron_1.ipcRenderer.invoke('app:download-and-install', url),
    onUpdateProgress: (callback) => {
        const wrapper = (_event, percent) => callback(percent);
        electron_1.ipcRenderer.on('update:download-progress', wrapper);
        return () => electron_1.ipcRenderer.removeListener('update:download-progress', wrapper);
    },
    onUpdateInstalling: (callback) => {
        const wrapper = () => callback();
        electron_1.ipcRenderer.on('update:installing', wrapper);
        return () => electron_1.ipcRenderer.removeListener('update:installing', wrapper);
    },
    // Export / Import — .noteflow entries are v2 folder bundles { dir, files };
    // .md/.txt exports remain plain { filename, content } files.
    exportNotes: (entries, format, hint) => electron_1.ipcRenderer.invoke('notes:export', entries, format, hint),
    parseImportFile: () => electron_1.ipcRenderer.invoke('notes:parse-import-file'),
    parseExternalImport: (source) => electron_1.ipcRenderer.invoke('notes:parse-external-import', source),
    writeImportedNotes: (entries) => electron_1.ipcRenderer.invoke('notes:write-imported', entries),
    // GitHub Sync
    getSyncStatus: () => electron_1.ipcRenderer.invoke('sync:get-status'),
    // Backend-tagged status of the LIVE sync provider (Cloud when enabled, else
    // GitHub, else 'none') — drives the titlebar sync button and its status card.
    getActiveSyncStatus: () => electron_1.ipcRenderer.invoke('sync:get-active-status'),
    initiateGitHubAuth: (repo) => electron_1.ipcRenderer.invoke('sync:initiate', repo),
    cancelGitHubAuth: () => electron_1.ipcRenderer.invoke('sync:cancel-auth'),
    disconnectGitHub: () => electron_1.ipcRenderer.invoke('sync:disconnect'),
    pullNotes: () => electron_1.ipcRenderer.invoke('sync:pull'),
    // Mirror local → repo (only available while NoteFlow Cloud is enabled; main
    // rejects it otherwise with error: 'cloud-required').
    mirrorToGitHub: () => electron_1.ipcRenderer.invoke('sync:mirror-to-github'),
    // Manual pull routed to the LIVE backend (Cloud when enabled, else GitHub).
    pullActiveNotes: () => electron_1.ipcRenderer.invoke('sync:pull-active'),
    onSyncAuthComplete: (cb) => {
        const wrapper = (_event, result) => cb(result);
        electron_1.ipcRenderer.on('sync-auth-complete', wrapper);
        return () => electron_1.ipcRenderer.removeListener('sync-auth-complete', wrapper);
    },
    onSyncPushState: (cb) => {
        const wrapper = (_event, state) => cb(state);
        electron_1.ipcRenderer.on('sync:push-state', wrapper);
        return () => electron_1.ipcRenderer.removeListener('sync:push-state', wrapper);
    },
    onSyncStatusChanged: (cb) => {
        const wrapper = () => cb();
        electron_1.ipcRenderer.on('sync:status-changed', wrapper);
        return () => electron_1.ipcRenderer.removeListener('sync:status-changed', wrapper);
    },
    // NoteFlow account (Supabase Auth + entitlements) — public status only,
    // tokens never cross this bridge.
    getAccountStatus: () => electron_1.ipcRenderer.invoke('account:get-status'),
    // Failures carry a machine-readable `errorCode` (see AccountErrorCode in
    // electron/account.ts) so the renderer can localize them; `error` is the
    // English fallback.
    accountRequestOtp: (email) => electron_1.ipcRenderer.invoke('account:request-otp', email),
    accountVerifyOtp: (email, code) => electron_1.ipcRenderer.invoke('account:verify-otp', email, code),
    accountSignOut: () => electron_1.ipcRenderer.invoke('account:sign-out'),
    accountRefreshEntitlements: () => electron_1.ipcRenderer.invoke('account:refresh-entitlements'),
    // Opens the subscription checkout in the browser; the URL (with the user id)
    // is built in main so the id never crosses the bridge.
    accountOpenCheckout: (product) => electron_1.ipcRenderer.invoke('account:open-checkout', product),
    onAccountStatusChanged: (cb) => {
        const wrapper = (_event, status) => cb(status);
        electron_1.ipcRenderer.on('account:status-changed', wrapper);
        return () => electron_1.ipcRenderer.removeListener('account:status-changed', wrapper);
    },
    // NoteFlow Cloud (encrypted sync) — public status only; key material NEVER
    // crosses this bridge. The recovery code returned by cloudSetup /
    // cloudUpgradeE2ee is shown once and never persisted anywhere.
    getCloudStatus: () => electron_1.ipcRenderer.invoke('cloud:get-status'),
    cloudSetup: (passphrase) => electron_1.ipcRenderer.invoke('cloud:setup', passphrase),
    // Managed (standard) mode setup — no passphrase, no recovery code.
    cloudSetupManaged: () => electron_1.ipcRenderer.invoke('cloud:setup-managed'),
    // Managed → e2ee upgrade; returns the new recovery code ONCE.
    cloudUpgradeE2ee: (passphrase) => electron_1.ipcRenderer.invoke('cloud:upgrade-e2ee', passphrase),
    // e2ee → managed downgrade (explicit, UI-confirmed; passphrase + recovery
    // code stop working). Requires the keys to be unlocked.
    cloudDowngradeManaged: () => electron_1.ipcRenderer.invoke('cloud:downgrade-managed'),
    cloudUnlock: (secret) => electron_1.ipcRenderer.invoke('cloud:unlock', secret),
    // Silent managed unlock retry (the panel polls it while "Unlocking…" shows).
    cloudAutoUnlock: () => electron_1.ipcRenderer.invoke('cloud:auto-unlock'),
    cloudLock: () => electron_1.ipcRenderer.invoke('cloud:lock'),
    cloudEnable: () => electron_1.ipcRenderer.invoke('cloud:enable'),
    cloudDisable: () => electron_1.ipcRenderer.invoke('cloud:disable'),
    cloudPull: () => electron_1.ipcRenderer.invoke('cloud:pull'),
    onCloudStatusChanged: (cb) => {
        const wrapper = (_event, status) => cb(status);
        electron_1.ipcRenderer.on('cloud:status-changed', wrapper);
        return () => electron_1.ipcRenderer.removeListener('cloud:status-changed', wrapper);
    },
    // Alarms
    scheduleAlarms: (alarms) => electron_1.ipcRenderer.send('alarms:schedule', alarms),
    // AI / Semantic index
    getAiSettings: () => electron_1.ipcRenderer.invoke('ai:get-settings'),
    setAiSettings: (patch) => electron_1.ipcRenderer.invoke('ai:set-settings', patch),
    aiRelated: (noteId, sectionId, k) => electron_1.ipcRenderer.invoke('ai:related', noteId, sectionId, k),
    aiSearch: (query, k) => electron_1.ipcRenderer.invoke('ai:search', query, k),
    aiGraph: () => electron_1.ipcRenderer.invoke('ai:graph'),
    aiReindexAll: () => electron_1.ipcRenderer.invoke('ai:reindex-all'),
    onAiReindexProgress: (cb) => {
        const wrapper = (_event, progress) => cb(progress);
        electron_1.ipcRenderer.on('ai:reindex-progress', wrapper);
        return () => electron_1.ipcRenderer.removeListener('ai:reindex-progress', wrapper);
    },
    onAiIndexState: (cb) => {
        const wrapper = (_event, state) => cb(state);
        electron_1.ipcRenderer.on('ai:index-state', wrapper);
        return () => electron_1.ipcRenderer.removeListener('ai:index-state', wrapper);
    },
    aiGetStale: () => electron_1.ipcRenderer.invoke('ai:get-stale'),
    onAiIndexStale: (cb) => {
        const wrapper = (_event, info) => cb(info);
        electron_1.ipcRenderer.on('ai:index-stale', wrapper);
        return () => electron_1.ipcRenderer.removeListener('ai:index-stale', wrapper);
    },
    // AI / LLM provider (chat + second brain)
    aiLlmGetConfig: () => electron_1.ipcRenderer.invoke('ai:llm-get-config'),
    aiLlmPresets: () => electron_1.ipcRenderer.invoke('ai:llm-presets'),
    aiLlmSetConfig: (patch) => electron_1.ipcRenderer.invoke('ai:llm-set-config', patch),
    aiLlmListModels: () => electron_1.ipcRenderer.invoke('ai:llm-list-models'),
    aiLlmTest: () => electron_1.ipcRenderer.invoke('ai:llm-test'),
    // NoteFlow AI managed plan: monthly consumption (weighted quota tokens).
    // Null on any failure — the UI just hides the usage bar.
    aiLlmUsage: () => electron_1.ipcRenderer.invoke('ai:llm-usage'),
    aiChatsLoad: () => electron_1.ipcRenderer.invoke('ai:chats-load'),
    aiChatsSave: (sessions) => electron_1.ipcRenderer.invoke('ai:chats-save', sessions),
    aiChat: (requestId, messages) => electron_1.ipcRenderer.invoke('ai:chat', { requestId, messages }),
    aiChatPickFiles: () => electron_1.ipcRenderer.invoke('ai:chat-pick-files'),
    aiChatRemoveFile: (id) => electron_1.ipcRenderer.invoke('ai:chat-remove-file', id),
    aiChatCancel: (requestId) => electron_1.ipcRenderer.send('ai:chat-cancel', requestId),
    aiChatConfirm: (toolCallId, approved) => electron_1.ipcRenderer.send('ai:chat-confirm', { toolCallId, approved }),
    onAiChatToolCall: (cb) => {
        const wrapper = (_event, p) => cb(p);
        electron_1.ipcRenderer.on('ai:chat-tool-call', wrapper);
        return () => electron_1.ipcRenderer.removeListener('ai:chat-tool-call', wrapper);
    },
    onAiChatToolResult: (cb) => {
        const wrapper = (_event, p) => cb(p);
        electron_1.ipcRenderer.on('ai:chat-tool-result', wrapper);
        return () => electron_1.ipcRenderer.removeListener('ai:chat-tool-result', wrapper);
    },
    onAiChatConfirmRequest: (cb) => {
        const wrapper = (_event, p) => cb(p);
        electron_1.ipcRenderer.on('ai:chat-confirm-request', wrapper);
        return () => electron_1.ipcRenderer.removeListener('ai:chat-confirm-request', wrapper);
    },
    onAiChatDelta: (cb) => {
        const wrapper = (_event, p) => cb(p);
        electron_1.ipcRenderer.on('ai:chat-delta', wrapper);
        return () => electron_1.ipcRenderer.removeListener('ai:chat-delta', wrapper);
    },
    onAiChatSources: (cb) => {
        const wrapper = (_event, p) => cb(p);
        electron_1.ipcRenderer.on('ai:chat-sources', wrapper);
        return () => electron_1.ipcRenderer.removeListener('ai:chat-sources', wrapper);
    },
    onAiChatDone: (cb) => {
        const wrapper = (_event, p) => cb(p);
        electron_1.ipcRenderer.on('ai:chat-done', wrapper);
        return () => electron_1.ipcRenderer.removeListener('ai:chat-done', wrapper);
    },
    onAiChatError: (cb) => {
        const wrapper = (_event, p) => cb(p);
        electron_1.ipcRenderer.on('ai:chat-error', wrapper);
        return () => electron_1.ipcRenderer.removeListener('ai:chat-error', wrapper);
    },
    aiProfilePickFiles: () => electron_1.ipcRenderer.invoke('ai:profile-pick-files'),
    aiProfileRemoveFile: (id) => electron_1.ipcRenderer.invoke('ai:profile-remove-file', id),
    aiProfileGenerate: (req) => electron_1.ipcRenderer.invoke('ai:profile-generate', req),
    aiProfileGetStatus: () => electron_1.ipcRenderer.invoke('ai:profile-get-status'),
    aiProfileSetCompleted: (noteId) => electron_1.ipcRenderer.invoke('ai:profile-set-completed', noteId),
    // Events from main → renderer
    onNewNote: (cb) => {
        electron_1.ipcRenderer.on('new-note', cb);
        return () => electron_1.ipcRenderer.removeListener('new-note', cb);
    },
    onNotesUpdated: (cb) => {
        const wrapper = (_event, path, senderId) => cb(path, senderId);
        electron_1.ipcRenderer.on('notes-updated', wrapper);
        return () => electron_1.ipcRenderer.removeListener('notes-updated', wrapper);
    },
};
electron_1.contextBridge.exposeInMainWorld('noteflow', api);
