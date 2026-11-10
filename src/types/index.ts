// A single section inside a note (user-defined, ordered)
export interface NoteSection {
  id: string       // nanoid — stable key for React
  name: string     // display label, user-editable
  content: string  // markdown body
  isRawMode?: boolean
  aiHidden?: boolean  // when true, the AI never sees this section (index, chat, tools)
  created?: string    // ISO 8601 — set when the section is created; absent on older sections (UI falls back to note.created)
}

// Legacy fixed type kept only for default section creation
export type NoteType = 'note' | 'task' | 'question'

export interface NoteEncryption {
  alg: 'aes-256-gcm+pbkdf2'
  salt: string        // base64url — PBKDF2 salt (length = saltBytes used at encrypt time)
  iv: string          // base64url, 12 bytes — AES-GCM nonce
  ciphertext: string  // base64url — ciphertext + 16-byte GCM tag
  iterations?: number               // PBKDF2 rounds; omitted when default (310_000)
  hashAlg?: 'SHA-256' | 'SHA-512'  // PBKDF2 hash; omitted when default ('SHA-256')
}

// ── Groups ────────────────────────────────────────────────────────────────────

// The theme palette: same CSS var names as TAG_COLOR_VARS in tagColors.ts
export type ThemeColorVar =
  '--accent' | '--accent-2' | '--red' | '--cyan' |
  '--purple' | '--text' | '--orange' | '--pink'

// A free colour chosen by the user, normalized to lowercase '#rrggbb'
export type CustomColor = `#${string}`

// Colour of a group or of a section tag: a theme var or a free hex
export type GroupColor = ThemeColorVar | CustomColor

export interface NoteGroup {
  id: string        // nanoid(8)
  name: string      // user-visible label
  color: GroupColor // theme CSS var or '#rrggbb' → rgb(colorChannels(color)) — see lib/tagColors.ts
  order: number     // sort order ascending
  archived?: boolean // present iff group is archived (hidden unless "Show archived")
}

// A reusable note template (predefined title + sections). Stored in templates.json (synced).
export interface NoteTemplate {
  id: string               // nanoid(8)
  name: string             // template display label (shown in Settings)
  title: string            // default title for notes created from it
  sections: NoteSection[]  // section name + content; ids regenerated on instantiation
  createdAt: string        // ISO timestamp
}

// A reusable editor snippet inserted from the toolbar ("Snippets" button). Stored in
// snippets.json (synced) as a plain array in display order — mergeable by id like
// templates.json. Variables in `content` ({date:FORMAT}…) expand on insert (lib/snippets.ts).
export interface Snippet {
  id: string          // nanoid(8)
  name: string        // label in the toolbar dropdown / modal list
  content: string     // markdown with date/time variables
  createdAt: string   // ISO timestamp
  isDefault?: true    // the toolbar's main-click snippet (fallback: the first one)
}

// A subfolder inside a group (single nesting level: group → folder → note)
export interface NoteFolder {
  id: string        // nanoid(8)
  name: string      // user-visible label
  groupId: string   // parent NoteGroup id
  order: number     // sort order ascending within the group
  /** Key from the curated folder icon set (`FOLDER_ICONS` in lib/folderIcons.ts). Absent =
   *  the default folder glyph; an unknown key (newer client) falls back to it too. */
  icon?: string
}

export interface NoteMeta {
  id: string
  title: string
  tags: string[]
  created: string
  updated: string
  archived: boolean
  favorited: boolean
  group?: string       // groupId — undefined = ungrouped
  folder?: string      // folderId — undefined = at group root (requires group)
  encryption?: NoteEncryption  // present iff note is encrypted
  expiresAt?: string   // ISO timestamp — present only on temporary notes
}

export interface Note extends NoteMeta {
  sections: NoteSection[]  // ordered, user-defined content areas
  raw: string              // content of note.md (frontmatter anchor)
  filePath: string         // absolute path of the note DIRECTORY
}

// On-disk folder record as returned by fs:read-all-notes / fs:read-note-dir
export interface NoteDirRecord {
  dir: string     // directory name ('<slug>-<id>')
  path: string    // absolute path of the note directory
  noteMd: string  // content of note.md
  sections: { file: string; content: string }[]  // sibling section files
}

// Multi-file write of a note directory (computed by buildNoteWritePayload)
export interface NoteWritePayload {
  dir: string                     // directory name (single path segment)
  files: Record<string, string>   // relative filename → content (includes note.md)
  deleteFiles: string[]           // relative filenames to remove (dropped sections)
}

// ── Export / Import ───────────────────────────────────────────────────────────

// v2: a note travels as its folder bundle (note.md + section files)
export interface NoteflowExportEntry {
  dir: string
  files: Record<string, string>
}

export interface NoteflowExportFile {
  version: 2
  exported: string   // ISO 8601
  app: 'noteflow'
  notes: NoteflowExportEntry[]
}

// Plain single-file export entry (.md / .txt formats)
export interface PlainExportEntry {
  filename: string
  content: string
}

export type ImportConflictStrategy = 'skip' | 'overwrite' | 'keep-both'

export interface ImportPreviewEntry {
  dir: string
  files: Record<string, string>
  parsedTitle: string
  parsedId: string
  conflict: 'none' | 'id' | 'dir'
  strategy: ImportConflictStrategy
  relPath?: string[]   // source folder segments (external imports) → group/folder
}

// Importing from other note apps. The main process emits this normalized
// intermediate; the renderer converts it to v2 bundles (see ExportImportModal).
export type ImportSource = 'md-folder' | 'notion' | 'keep'

export interface ExternalNote {
  title: string
  format: 'html' | 'md'
  body: string
  tags?: string[]
  created?: string
  archived?: boolean
  favorited?: boolean
  relPath: string[]
}

// ── AI / Semantic index ───────────────────────────────────────────────────────

export interface AiSettings {
  enabled: boolean
  modelId: string
  lastIndexedModelId?: string | null
  chunking: 'section'
}

// A note surfaced as semantically related to the active section (powers the panel)
export interface RelatedNote {
  noteId: string
  title: string
  sectionId: string    // matching section in the related note (click navigates here)
  sectionName: string  // its tab label
  score: number
  snippet: string
}

// A single chunk-level hit from a semantic/hybrid search
export interface SemanticHit {
  noteId: string
  sectionId: string
  score: number
  snippet: string
}

// A content (semantic) edge between two notes — powers the brain graph's content layer
export interface GraphEdge {
  a: string   // noteId
  b: string   // noteId
  score: number
}

export type IndexState = 'idle' | 'indexing' | 'downloading-model'

export interface IndexProgress {
  done: number
  total: number
  phase: string
}

// Whether the index is behind the notes — owned by main (see aiIndex.ts), not derived from
// IndexState: 'idle' also fires on worker boot and model unload, which index nothing.
export interface IndexStaleInfo {
  stale: boolean
  count: number
}

// ── AI / LLM provider (chat + second brain) ─────────────────────────────────────

// A provider preset (catalog entry) — the renderer renders the picker from these
export interface LlmPreset {
  id: string
  label: string
  impl: 'anthropic' | 'openai'
  baseUrl: string
  needsKey: boolean
  editableBaseUrl: boolean
  suggestedModels: string[]
  images?: boolean // per-preset default for native image (vision) support; see providerCapabilities
  // Per-model metadata, only on the managed `noteflow` preset: costIndex (how many
  // times faster than the recommended model a typical message spends the monthly
  // allowance — integer >= 1), native vision support and the recommended flag.
  // MIRROR: ManagedModelMeta in electron/ai/llm/presets.ts.
  // Its mere presence also marks the preset as serving a CURATED catalog: the model
  // is picked from suggestedModels (read-only field, no free text) and main refuses
  // to store anything else — see electron/ai/llm/presets.ts and acceptsModel().
  // For `noteflow`, suggestedModels/modelMeta are the catalog main downloaded from the
  // proxy (or its backup constants) — see electron/ai/llm/managedCatalog.ts.
  modelMeta?: Record<string, { costIndex: number; images: boolean; recommended?: boolean }>
}

// What attachments the active provider can ingest natively (no local processing)
export interface ProviderCapabilities {
  images: boolean
  pdf: boolean
}

// Renderer-safe view of the ACTIVE preset's config — never carries the API key
export interface LlmConfigPublic {
  active: string       // active preset id
  model: string
  baseUrl: string
  hasKey: boolean
  configured: boolean
  capabilities: ProviderCapabilities
  // Last BYO provider active before NoteFlow AI (known presets only) — what the
  // "Your provider" card preselects while the managed plan is active.
  lastByoProvider?: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  attachmentIds?: string[]
}

// A file attached to a chat message — metadata only; the bytes stay in the main process
export interface ChatAttachment {
  id: string
  name: string
  kind: 'pdf' | 'image' | 'text'
  sizeBytes: number
}

// A tool action the agent performed (or requested) during a chat turn
export interface ChatToolActivity {
  toolCallId: string
  name: string
  status: 'running' | 'done' | 'error' | 'cancelled'
  summary?: string
  runningLabel?: string // present-tense "what it's doing" label, shown while status === 'running'
  // Undo of a note edit made by this tool: 'available' while main still holds its snapshot
  // (this app session only — main strips it from sessions loaded after a restart), 'done' once undone.
  undo?: 'available' | 'done'
}

// ── Chat context (editor sidebar / detached chat window) ──────────────────────
// What the user shares with the chat on top of the profile: explicit notes/sections and/or
// semantic search over all notes. Without a context payload `ai:chat` keeps the brain chat's
// behaviour (RAG over every note).
export type ChatContextItem =
  | { kind: 'section'; noteId: string; sectionId: string }
  | { kind: 'note'; noteId: string }

export interface ChatContextState {
  allNotes: boolean
  items: ChatContextItem[]
}

export interface ChatContextPayload extends ChatContextState {
  // The note/section open in the editor right now, so "this note" resolves even when it isn't in context.
  openNote?: { noteId: string; sectionId?: string }
}

// The note/section open in the main window's active pane, as the context bar needs it.
export interface ChatEditorTarget {
  noteId: string
  noteTitle: string
  sectionId?: string
  sectionName?: string
  encrypted: boolean
  sectionAiHidden: boolean
}

// The conversation moving between the main window and the detached chat window.
export interface ChatHandoff {
  messages: ChatSession['messages']
  activeSessionId: string | null
  draft: string
  context: ChatContextState
  contextPinned: boolean
  suggestions: string[]
  pendingAttachments: ChatAttachment[]
  // When it was taken (ISO). Absent on a frozen local copy. See lib/chatHandoff.reconcileHandoff.
  takenAt?: string
}

export type ChatUndoResult =
  | { ok: true }
  // conflict: the note or one of its sections was deleted after the edit; encryption: it was
  // encrypted/decrypted after the edit. Neither can be forced.
  | { ok: false; reason: 'modified' | 'unavailable' | 'conflict' | 'encryption' | 'error'; error?: string }

// Requests from the detached chat window that the main window carries out.
export type ChatWindowCommand =
  | { type: 'open-note'; noteId: string; sectionId?: string }
  | { type: 'open-ai-settings' }

// A destructive tool call awaiting the user's confirmation
export interface ChatPendingConfirm {
  requestId: string
  toolCallId: string
  name: string
  input: unknown
  /** Human-readable description of the affected target (e.g. note title), resolved in main. */
  target?: string
}

// A saved chat session (persisted locally in userData/ai-chats.json)
export interface ChatSession {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; error?: boolean; errorText?: string; actions?: ChatToolActivity[]; attachments?: ChatAttachment[] }>
}

// A note cited as a source for a chat answer (powers citations + brain illumination)
export interface ChatSource {
  noteId: string
  sectionId: string
  title: string
}

// Profile note generated by the LLM from the onboarding questionnaire
export interface GeneratedProfile {
  title: string
  sections: Array<{ name: string; content: string }>
}

// ── NoteFlow account (Supabase Auth + entitlements) ─────────────────────────────

// Which paid products the signed-in user has active (derived in main from the
// subscriptions rows; a 'bundle' subscription grants both).
export interface AccountEntitlements {
  ai: boolean
  cloud: boolean
}

// Why an account operation failed, in a form the UI can localize (the raw
// `error` string that comes with it is English, for logs/fallback).
// MIRROR of AccountErrorCode in electron/account.ts — the renderer can't import
// from electron/. Every code has a message under `settings.account.errors`.
export type AccountErrorCode =
  | 'notConfigured'
  | 'invalidEmail'
  | 'emptyCode'
  | 'invalidCode'
  | 'rateLimited'
  | 'network'
  | 'unexpectedResponse'
  | 'sendFailed'
  | 'verifyFailed'
  | 'notSignedIn'
  | 'refreshFailed'
  | 'sessionLocked'
  | 'checkoutUnavailable'
  | 'checkoutInvalidUrl'

// Result of any account IPC call (mirror of AccountOpResult in electron/account.ts).
export interface AccountOpResult {
  ok: boolean
  error?: string             // English fallback, shown when there is no errorCode
  errorCode?: AccountErrorCode
}

// In-app feedback (Settings → About → "Send feedback"); mirrors
// electron/feedbackLogic.ts. Main validates the payload and adds diagnostics.
export type FeedbackKind = 'bug' | 'suggestion' | 'other'

export interface FeedbackPayload {
  kind: FeedbackKind
  message: string
  contact?: string           // optional email so the developer can reply
  includeDiagnostics: boolean
}

// 'invalid' = payload rejected by main's validation; 'network' = unreachable /
// timeout; 'server' = the backend refused or failed the insert.
export type FeedbackSendResult = { ok: true } | { ok: false; reason: 'invalid' | 'network' | 'server' }

// Settings → Sync → "Connect the CLI too" — mirror of electron/cliConnectLogic.ts.
// What the bundled CLI has (read from ITS settings, never its tokens).
export interface CliConnectStatus {
  available: boolean   // the bundled CLI script was found
  cloud: { connected: boolean; email?: string }
  // canDisconnect: false when the CLI reads the app's own githubSync token
  // (Windows, token stored without safeStorage) — only the app's Disconnect can remove it.
  github: { connected: boolean; owner?: string; repo?: string; canDisconnect: boolean }
}

export type CliConnectError =
  | 'cliMissing' | 'notSignedIn' | 'notConnected' | 'noRepo' | 'mismatch'
  | 'invalidCode' | 'rateLimited' | 'network' | 'failed'

// detail = the CLI's own error line (English, shown verbatim like GitHub API errors).
export type CliConnectResult =
  | { ok: true; status: CliConnectStatus }
  | { ok: false; error: CliConnectError; detail?: string }

// Renderer-safe view of the account session — never carries tokens.
export interface AccountStatus {
  configured: boolean   // false while the build has no Supabase project configured
  signedIn: boolean
  email?: string
  entitlements: AccountEntitlements
  // False until entitlements were fetched (or restored from main's on-disk cache)
  // for this session. While false `entitlements` is a placeholder meaning UNKNOWN:
  // never show Subscribe cards nor treat the user as not entitled on it.
  entitlementsKnown: boolean
  entitlementsFetchedAt?: string  // ISO — last successful entitlements fetch (or the cached one)
  // Session on disk but its refresh token can't be decrypted right now (system
  // keychain locked). Still signedIn; main retries on its own.
  sessionLocked: boolean
  aiCheckoutConfigured: boolean   // true when the build ships a NoteFlow AI checkout URL
  cloudCheckoutConfigured: boolean  // same, for the NoteFlow Cloud product
  bundleCheckoutConfigured: boolean  // same, for the NoteFlow Bundle (AI + Cloud) product
}

// ── NoteFlow Cloud (E2EE sync) ───────────────────────────────────────────────

// Renderer-safe view of the cloud sync engine — never carries key material.
export interface CloudSyncStatus {
  configured: boolean   // false while the build has no Supabase project configured
  enabled: boolean
  signedIn: boolean
  /** 'no-keys' = the account has no cloud keys yet (setup needed); 'locked' = keys exist (or unknown) but the DEK is not in memory. */
  keysState: 'unlocked' | 'locked' | 'no-keys'
  /**
   * Encryption mode of the account's keys: 'managed' (standard — server-held
   * key, silent unlock, the default) | 'e2ee' (private — passphrase + recovery
   * code) | null (no keys, or unknown yet — e.g. a locked pre-dual-mode device).
   */
  keysMode: 'managed' | 'e2ee' | null
  lastSync?: string
  error?: string
  initialPullStatus: 'pending' | 'ok' | 'failed'
  /** True while the main process holds a live Realtime subscription (shown in the titlebar sync card; no event on change). */
  realtimeConnected: boolean
  /** Conflict copies the Cloud pull made this session, until dismissed — mirror of ConflictCopiesNotice in electron/conflictCopy.ts. */
  conflictCopies?: ConflictCopiesNotice
  /** Notes the Cloud pull merged WITH conflict blocks (both versions kept in the note, between ⚠️ markers), until dismissed. */
  conflictMerges?: ConflictCopiesNotice
}

/**
 * Local edits that lost against a remote version this device never saw and
 * were kept as new notes ("conflict copies") by the pull of either backend
 * (NoteFlow Cloud or GitHub) — session-only, in main.
 * `titles` = the copies' titles (latest 10); `at` = time of the latest copy.
 */
export interface ConflictCopiesNotice {
  count: number
  titles: string[]
  at: string
}

// One bar of the sync card's activity chart — mirror of SyncHistoryEntry in
// electron/syncHistory.ts. Operations within the same minute are folded into
// one entry (files summed, ok = none of them failed).
export interface SyncHistoryEntry {
  at: string
  files: number
  ok: boolean
}

// Backend-tagged snapshot of the LIVE sync provider (see electron/syncProvider.ts):
// Cloud wins when enabled, else GitHub, else 'none'. Drives the titlebar sync
// button (and its hover status card) so it routes to whichever backend is
// active. Never carries key material.
export interface ActiveSyncStatus {
  backend: 'github' | 'cloud' | 'none'
  active: boolean
  lastSync?: string
  error?: string
  initialPullStatus: 'pending' | 'ok' | 'failed'
  /** Files whose push is in flight (main's pendingPushFiles; debounced edits not counted yet). */
  pendingUploads: number
  /** Cadence of the backend's periodic auto-sync loop (absent when 'none'). */
  autoSyncIntervalMs?: number
  /** This session's sync activity of the live backend, oldest first (in-memory in main; absent when 'none'). */
  history?: SyncHistoryEntry[]
  /** Files the live backend moved today (local day) this session — running total kept in main, not a sum of `history`. */
  filesToday?: number
  /** Conflict copies the live backend's pulls made this session, until dismissed. */
  conflictCopies?: ConflictCopiesNotice
  /** Notes the live backend's pulls merged WITH conflict blocks (either backend), until dismissed with `conflictCopies`. */
  conflictMerges?: ConflictCopiesNotice
  github?: { owner?: string; repo?: string }
  cloud?: {
    keysState: CloudSyncStatus['keysState']
    keysMode: CloudSyncStatus['keysMode']
    realtimeConnected: boolean
  }
}

// Synced appearance + editor settings — ui-settings.json at the root of the
// notes dir (pushed/pulled by both sync backends like section-colors.json).
// Mirror of UiSettings in electron/uiSettings.ts. Tri-state override keys
// (appFont / accent / editorColors.*): ABSENT = never written (readers fall
// back to legacy local sources), null = explicitly cleared ("follow theme"),
// string = the override (accent / editorColors.*: an "r g b" triplet or the
// THEME_TEXT_COLOR sentinel "text" of src/lib/colorUtils.ts, which follows the
// theme's --text). `ui-settings:set` takes a PARTIAL patch merged in main.
export interface UiSettings {
  theme?: string
  /** Last dark / light theme the user had (quick Light / Dark switch, src/lib/themeMemory.ts). */
  lastDarkThemeId?: string
  lastLightThemeId?: string
  appFont?: string | null
  accent?: string | null
  editorColors?: Partial<Record<'h1' | 'h2' | 'h3' | 'italic' | 'inlineCode' | 'codeAccent', string | null>>
  editor?: { fontSize?: number; fontFamily?: 'inter' | 'mono'; readableWidth?: boolean; showToc?: boolean }
}

// Extend window with our electron bridge
declare global {
  interface Window {
    noteflow: {
      platform: string
      // Real hardware info from the Node side (see preload). Optional so contexts
      // or tests without the bridge still type-check.
      hardware?: {
        logicalCores: number
        cpuModel: string
        cpuSpeedMHz: number
        totalMemGiB: number
      }
      // Name of the user's home folder (basename of ~), read once by the preload.
      // Optional like `hardware`.
      systemUserName?: string
      readAllNotes: () => Promise<NoteDirRecord[]>
      readNoteDir: (dir: string) => Promise<NoteDirRecord | null>
      writeNote: (payload: NoteWritePayload) => Promise<{ ok: boolean; error?: string }>
      deleteNote: (dir: string) => Promise<{ ok: boolean; error?: string }>
      getNotesDir: () => Promise<string>
      openNotesFolder: () => Promise<void>
      chooseNotesDir: () => Promise<string | null>
      minimize: () => void
      maximize: () => void
      close: () => void
      setSize: (width: number, height: number, minWidth: number, minHeight: number) => void
      setAlwaysOnTop: (flag: boolean) => void
      foldToCorner: (width: number, height: number) => void
      unfold: () => void
      openSticky: (noteId: string, sectionId: string) => void
      openSectionWindow: (noteId: string, sectionId: string) => void
      setSectionWindowTarget: (noteId: string, sectionId: string) => void
      onNewNote: (cb: () => void) => () => void
      onNotesUpdated: (cb: (filePath?: string, senderId?: number) => void) => () => void
      windowId: () => number
      getTheme: () => string | null
      setTheme: (id: string) => void
      // Native page zoom for the "UI text size" setting (webFrame.setZoomFactor).
      setUiZoom: (factor: number) => void
      getUiSettings: () => UiSettings
      setUiSettings: (patch: UiSettings) => Promise<void>
      getLanguage: () => 'en' | 'es' | 'system'
      setLanguage: (setting: 'en' | 'es' | 'system') => void
      onLanguageChanged: (cb: (setting: 'en' | 'es' | 'system') => void) => () => void
      getLoginItem: () => Promise<{ openAtLogin: boolean }>
      setLoginItem: (enabled: boolean) => Promise<void>
      getSkillSync: () => Promise<{ enabled: boolean }>
      setSkillSync: (enabled: boolean) => Promise<{ ok: boolean; error?: string }>
      getStartupStickies: () => Promise<Array<{ noteId: string; sectionId: string }>>
      setStartupStickies: (stickies: Array<{ noteId: string; sectionId: string }>) => Promise<void>
      /** "What's new" tour: slide ids already shown on this device + startup popup kill switch (env). */
      getWhatsNewSeen: () => Promise<{ seen: string[]; disabled: boolean }>
      /** Union with the stored seen list (settings.json → whatsNewSeen); resolves to the updated list. */
      markWhatsNewSeen: (ids: string[]) => Promise<string[]>
      getUiState: () => Promise<{ activeNoteId?: string; activeSectionId?: string; collapsedGroupIds?: string[]; collapsedFolderIds?: string[]; sidebarMode?: 'pinned' | 'floating' }>
      setUiState: (patch: { activeNoteId?: string; activeSectionId?: string; collapsedGroupIds?: string[]; collapsedFolderIds?: string[]; sidebarMode?: 'pinned' | 'floating' }) => Promise<void>
      getGroups: () => Promise<NoteGroup[]>
      setGroups: (groups: NoteGroup[]) => Promise<void>
      getFolders: () => Promise<NoteFolder[]>
      setFolders: (folders: NoteFolder[]) => Promise<void>
      getSectionTagColors: () => Promise<Record<string, GroupColor>>
      setSectionTagColors: (colors: Record<string, GroupColor>) => Promise<void>
      getNoteOrder: () => Promise<Record<string, string[]>>
      setNoteOrder: (order: Record<string, string[]>) => Promise<void>
      /** groups.json / folders.json / note-order.json changed outside the app (e.g. the CLI) — reload the groups store. */
      onGroupsUpdated: (callback: () => void) => () => void
      getTemplates: () => Promise<NoteTemplate[]>
      setTemplates: (templates: NoteTemplate[]) => Promise<void>
      /** Editor snippets (snippets.json in the notes dir, synced); sanitized by main on read and write. */
      getSnippets: () => Promise<Snippet[]>
      setSnippets: (snippets: Snippet[]) => Promise<void>
      /** Another window saved snippets.json (pulls arrive as a path-less `notes-updated`). */
      onSnippetsUpdated: (callback: () => void) => () => void
      getAppVersion: () => Promise<string>
      /** `error`: the check failed (offline/timeout/bad answer) — it does NOT mean "up to date". */
      checkUpdate: () => Promise<{ hasUpdate: boolean; latestVersion?: string; downloadUrl?: string; error?: true }>
      openUrl: (url: string) => Promise<void>
      downloadAndInstall: (url: string) => Promise<{ success: boolean; error?: string }>
      /** In-app feedback → public.feedback (Supabase). Works signed out (sent anonymously). */
      sendFeedback: (payload: FeedbackPayload) => Promise<FeedbackSendResult>
      onUpdateProgress: (callback: (percent: number) => void) => () => void
      onUpdateInstalling: (callback: () => void) => () => void
      exportNotes: (entries: NoteflowExportEntry[] | PlainExportEntry[], format: string, hint?: string) => Promise<{ ok: boolean; filePath?: string; error?: string; canceled?: boolean }>
      parseImportFile: () => Promise<{ ok: boolean; file?: NoteflowExportFile; error?: string; canceled?: boolean }>
      parseExternalImport: (source: ImportSource) => Promise<{ ok: boolean; source?: ImportSource; notes?: ExternalNote[]; error?: string; canceled?: boolean }>
      writeImportedNotes: (entries: NoteflowExportEntry[]) => Promise<{ written: string[]; errors: string[] }>
      // GitHub Sync
      getSyncStatus: () => Promise<{ enabled: boolean; connected: boolean; owner?: string; repo?: string; lastSync?: string; error?: string; initialPullStatus: 'pending' | 'ok' | 'failed'; conflictCopies?: ConflictCopiesNotice; conflictMerges?: ConflictCopiesNotice }>
      // Backend-tagged status of the live sync provider — drives the titlebar sync button.
      getActiveSyncStatus: () => Promise<ActiveSyncStatus>
      // Clears the session notice of conflict copies made by either backend's pull (titlebar sync card).
      dismissConflictCopies: () => Promise<{ ok: boolean }>
      initiateGitHubAuth: (repo: string) => Promise<{ ok: boolean; userCode?: string; verificationUri?: string; error?: string }>
      cancelGitHubAuth: () => Promise<{ ok: boolean }>
      disconnectGitHub: () => Promise<{ ok: boolean }>
      // Manual GitHub pull — refused with error 'cloud-enabled' while NoteFlow Cloud is enabled.
      pullNotes: () => Promise<{
        pulled: number
        deleted: number
        errors: string[]
        updatedFiles: string[]
        hadDeletions: boolean
        hadMetadataChanges: boolean
        error?: 'cloud-enabled'
      }>
      // Mirror local → repo: leaves the repo as an exact copy of the local state
      // (uploads what differs, deletes what is gone). Only while Cloud is enabled.
      mirrorToGitHub: () => Promise<{
        ok: boolean
        pushed: number
        deleted: number
        skipped: number
        // errors: raw GitHub API failures (verbatim) · warnings: our own codes, localized here
        errors: string[]
        warnings: Array<'deletions-skipped-unreadable'>
        error?: 'cloud-required' | 'cloud-initial-pull-pending' | 'not-connected' | 'in-progress' | 'token'
      }>
      // Settings → Sync → "Connect the CLI too" — the CLI gets its own access
      // to the backend the app uses (main picks the email / token).
      cliConnectGetStatus: () => Promise<CliConnectStatus>
      cliConnectCloudSendCode: () => Promise<CliConnectResult>
      cliConnectCloudVerify: (code: string) => Promise<CliConnectResult>
      cliConnectCloudDisconnect: () => Promise<CliConnectResult>
      cliConnectGithubConnect: () => Promise<CliConnectResult>
      cliConnectGithubDisconnect: () => Promise<CliConnectResult>
      // Manual pull routed to the live backend (Cloud when enabled, else GitHub).
      pullActiveNotes: () => Promise<{
        pulled: number
        deleted: number
        errors: string[]
        updatedFiles: string[]
        hadDeletions: boolean
        hadMetadataChanges: boolean
      }>
      onSyncAuthComplete: (cb: (result: { ok: boolean; owner?: string; repo?: string; error?: string }) => void) => () => void
      onSyncPushState: (cb: (state: 'pushing' | 'idle') => void) => () => void
      onSyncStatusChanged: (cb: () => void) => () => void
      // NoteFlow account (Supabase Auth + entitlements)
      getAccountStatus: () => Promise<AccountStatus>
      accountRequestOtp: (email: string) => Promise<AccountOpResult>
      accountVerifyOtp: (email: string, code: string) => Promise<AccountOpResult>
      accountSignOut: () => Promise<AccountOpResult>
      accountRefreshEntitlements: () => Promise<AccountOpResult & { entitlements: AccountEntitlements }>
      accountOpenCheckout: (product: 'ai' | 'cloud' | 'bundle') => Promise<AccountOpResult>
      onAccountStatusChanged: (cb: (status: AccountStatus) => void) => () => void
      // NoteFlow Cloud (encrypted sync) — keys never cross this bridge
      getCloudStatus: () => Promise<CloudSyncStatus>
      cloudSetup: (passphrase: string) => Promise<{ ok: boolean; recoveryCode?: string; error?: string }>
      cloudSetupManaged: () => Promise<{ ok: boolean; error?: string }>
      // errorCode 'already-e2ee': another device already switched to private mode (no recovery code issued).
      cloudUpgradeE2ee: (passphrase: string) => Promise<{ ok: boolean; recoveryCode?: string; error?: string; errorCode?: 'already-e2ee' }>
      cloudDowngradeManaged: () => Promise<{ ok: boolean; error?: string }>
      cloudUnlock: (secret: string) => Promise<{ ok: boolean; error?: string }>
      cloudAutoUnlock: () => Promise<{ ok: boolean }>
      // Re-reads the account's encryption mode (switched from another device?) — called when the Cloud panel opens.
      cloudRefreshKeysMode: () => Promise<{ changed: boolean }>
      cloudLock: () => Promise<{ ok: boolean }>
      cloudEnable: () => Promise<{ ok: boolean; error?: string }>
      cloudDisable: () => Promise<{ ok: boolean }>
      cloudPull: () => Promise<{
        pulled: number
        deleted: number
        errors: string[]
        updatedFiles: string[]
        hadDeletions: boolean
        hadMetadataChanges: boolean
      }>
      onCloudStatusChanged: (cb: (status: CloudSyncStatus) => void) => () => void
      scheduleAlarms: (alarms: Array<{ noteTitle: string; taskText: string; alarmAt: string }>) => void
      // AI / Semantic index
      getAiSettings: () => Promise<AiSettings>
      setAiSettings: (patch: Partial<AiSettings>) => Promise<AiSettings>
      aiRelated: (noteId: string, sectionId: string, k?: number) => Promise<RelatedNote[]>
      aiSearch: (query: string, k?: number) => Promise<SemanticHit[]>
      aiGraph: () => Promise<GraphEdge[]>
      aiReindexAll: () => Promise<{ ok: boolean }>
      onAiReindexProgress: (cb: (progress: IndexProgress) => void) => () => void
      onAiIndexState: (cb: (state: IndexState) => void) => () => void
      aiGetStale: () => Promise<IndexStaleInfo>
      onAiIndexStale: (cb: (info: IndexStaleInfo) => void) => () => void
      // AI / LLM provider (chat + second brain)
      aiLlmGetConfig: () => Promise<LlmConfigPublic>
      aiLlmPresets: () => Promise<LlmPreset[]>
      // Fired when NoteFlow AI's model catalog (the managed preset's suggestedModels/modelMeta)
      // changes after main downloads it from the proxy — re-pull aiLlmPresets/aiLlmGetConfig
      onAiLlmPresetsChanged: (cb: () => void) => () => void
      aiLlmSetConfig: (patch: { active?: string; model?: string; baseUrl?: string; apiKey?: string; clearKey?: boolean }) => Promise<LlmConfigPublic>
      aiLlmListModels: () => Promise<{ ok: boolean; models: string[]; error?: string }>
      aiLlmTest: () => Promise<{ ok: boolean; error?: string }>
      // NoteFlow AI managed plan: monthly consumption (null on any failure). Abstract units —
      // only used/limit (the share of the monthly allowance spent) is meaningful.
      aiLlmUsage: () => Promise<{ used: number; limit: number } | null>
      aiChatsLoad: () => Promise<ChatSession[]>
      aiChatsSave: (sessions: ChatSession[]) => Promise<{ ok: boolean; error?: string }>
      // Per-device activity log (userData/activity-log.json, local, not synced): local day
      // key (YYYY-MM-DD) → ids of the notes the user edited that day. Ids only, no content.
      recordActivityEdit: (noteId: string) => void
      getActivityLog: () => Promise<{ days: Record<string, string[]> }>
      // `context` (editor sidebar / chat window): explicit notes/sections + RAG only when allNotes.
      // Omitted = the brain chat's behaviour (RAG over every note).
      aiChat: (requestId: string, messages: ChatMessage[], context?: ChatContextPayload) => Promise<void>
      // Undo a note edit made by a chat tool (snapshot kept in main for this app session).
      // force: restore even if the note changed after the AI's edit (the UI asked the user first).
      aiChatUndo: (toolCallId: string, force?: boolean) => Promise<ChatUndoResult>
      // Main window → asks main for its pending editor saves to be written (before a chat turn reads the note).
      onAiFlushEdits: (cb: (token: string) => void) => () => void
      aiFlushEditsDone: (token: string) => void
      // Detached chat window. Main window side: open (moves the conversation), focus, recall,
      // report the open note/section, and get the conversation back.
      aiChatWindowOpen: (handoff: ChatHandoff) => Promise<{ ok: boolean }>
      aiChatWindowIsOpen: () => Promise<boolean>
      aiChatWindowFocus: () => void
      aiChatWindowRecall: () => void
      aiChatWindowSetEditorTarget: (target: ChatEditorTarget | null) => void
      onAiChatWindowReturned: (cb: (handoff: ChatHandoff | null) => void) => () => void
      onAiChatWindowCommand: (cb: (cmd: ChatWindowCommand) => void) => () => void
      // Chat window side: take the conversation, follow the main window's open note/section,
      // send commands to the main window and hand the conversation back on close.
      aiChatWindowGetState: () => Promise<{ handoff: ChatHandoff | null; editorTarget: ChatEditorTarget | null }>
      onAiChatWindowEditorTarget: (cb: (target: ChatEditorTarget | null) => void) => () => void
      onAiChatWindowRequestClose: (cb: () => void) => () => void
      aiChatWindowCommand: (cmd: ChatWindowCommand) => void
      aiChatWindowReturn: (handoff: ChatHandoff | null) => void
      // Main window: "Ask AI" (command palette) while the chat is detached → new chat in that window.
      aiChatWindowAsk: (prompt: string) => void
      onAiChatWindowAsk: (cb: (prompt: string) => void) => () => void
      aiChatPickFiles: () => Promise<{ ok: boolean; canceled?: boolean; files?: ChatAttachment[]; errors?: string[] }>
      aiChatRemoveFile: (id: string) => Promise<{ ok: boolean }>
      aiChatCancel: (requestId: string) => void
      aiChatConfirm: (toolCallId: string, approved: boolean) => void
      onAiChatToolCall: (cb: (p: { requestId: string; toolCallId: string; name: string; input: unknown; label: string }) => void) => () => void
      onAiChatToolResult: (cb: (p: { requestId: string; toolCallId: string; status: ChatToolActivity['status']; summary: string; undoable?: boolean }) => void) => () => void
      onAiChatConfirmRequest: (cb: (p: ChatPendingConfirm) => void) => () => void
      onAiChatDelta: (cb: (p: { requestId: string; delta: string }) => void) => () => void
      onAiChatSources: (cb: (p: { requestId: string; sources: ChatSource[] }) => void) => () => void
      onAiChatDone: (cb: (p: { requestId: string; aborted?: boolean }) => void) => () => void
      onAiChatError: (cb: (p: { requestId: string; error: string }) => void) => () => void
      aiProfilePickFiles: () => Promise<{ ok: boolean; canceled?: boolean; files?: Array<{ id: string; name: string; kind: 'pdf' | 'image' | 'text'; sizeBytes: number }>; errors?: string[] }>
      aiProfileRemoveFile: (id: string) => Promise<{ ok: boolean }>
      aiProfileGenerate: (req: { fields: Array<{ label: string; value: string; section?: string }>; fileIds: string[]; urls: string[]; locale?: string }) => Promise<{ ok: boolean; error?: string } & Partial<GeneratedProfile>>
      aiProfileGetStatus: () => Promise<{ completedAt: string | null; noteId: string | null }>
      aiProfileSetCompleted: (noteId?: string) => Promise<{ ok: boolean }>
    }
  }
}
