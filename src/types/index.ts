// A single section inside a note (user-defined, ordered)
export interface NoteSection {
  id: string       // nanoid — stable key for React
  name: string     // display label, user-editable
  content: string  // markdown body
  isRawMode?: boolean
  aiHidden?: boolean  // when true, the AI never sees this section (index, chat, tools)
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

// A subfolder inside a group (single nesting level: group → folder → note)
export interface NoteFolder {
  id: string        // nanoid(8)
  name: string      // user-visible label
  groupId: string   // parent NoteGroup id
  order: number     // sort order ascending within the group
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
  // Per-model metadata, only on the managed `noteflow` preset: quota multiplier
  // (pricier models burn the monthly quota faster) + native vision support.
  // Its mere presence also marks the preset as serving a CURATED catalog: the model
  // is picked from suggestedModels (read-only field, no free text) and main refuses
  // to store anything else — see electron/ai/llm/presets.ts and acceptsModel().
  modelMeta?: Record<string, { quotaMultiplier: number; images: boolean }>
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
}

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
  | 'checkoutUnavailable'
  | 'checkoutInvalidUrl'

// Result of any account IPC call (mirror of AccountOpResult in electron/account.ts).
export interface AccountOpResult {
  ok: boolean
  error?: string             // English fallback, shown when there is no errorCode
  errorCode?: AccountErrorCode
}

// Renderer-safe view of the account session — never carries tokens.
export interface AccountStatus {
  configured: boolean   // false while the build has no Supabase project configured
  signedIn: boolean
  email?: string
  entitlements: AccountEntitlements
  entitlementsFetchedAt?: string  // ISO — last successful entitlements fetch
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
  /** True while the main process holds a live Realtime subscription (informational — no UI yet). */
  realtimeConnected: boolean
}

// Backend-tagged snapshot of the LIVE sync provider (see electron/syncProvider.ts):
// Cloud wins when enabled, else GitHub, else 'none'. Drives the titlebar sync
// button so it routes to whichever backend is active. Never carries key material.
export interface ActiveSyncStatus {
  backend: 'github' | 'cloud' | 'none'
  active: boolean
  lastSync?: string
  error?: string
  initialPullStatus: 'pending' | 'ok' | 'failed'
  github?: { owner?: string; repo?: string }
  cloud?: { keysState: CloudSyncStatus['keysState']; keysMode: CloudSyncStatus['keysMode'] }
}

// Synced appearance + editor settings — ui-settings.json at the root of the
// notes dir (pushed/pulled by both sync backends like section-colors.json).
// Mirror of UiSettings in electron/uiSettings.ts. Tri-state override keys
// (appFont / accent / editorColors.*): ABSENT = never written (readers fall
// back to legacy local sources), null = explicitly cleared ("follow theme"),
// string = the override. `ui-settings:set` takes a PARTIAL patch merged in main.
export interface UiSettings {
  theme?: string
  appFont?: string | null
  accent?: string | null
  editorColors?: Partial<Record<'h1' | 'h2' | 'h3' | 'italic' | 'inlineCode' | 'codeAccent', string | null>>
  editor?: { fontSize?: number; fontFamily?: 'inter' | 'mono'; readableWidth?: boolean }
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
      getUiState: () => Promise<{ activeNoteId?: string; activeSectionId?: string; collapsedGroupIds?: string[]; collapsedFolderIds?: string[] }>
      setUiState: (patch: { activeNoteId?: string; activeSectionId?: string; collapsedGroupIds?: string[]; collapsedFolderIds?: string[] }) => Promise<void>
      getGroups: () => Promise<NoteGroup[]>
      setGroups: (groups: NoteGroup[]) => Promise<void>
      getFolders: () => Promise<NoteFolder[]>
      setFolders: (folders: NoteFolder[]) => Promise<void>
      getSectionTagColors: () => Promise<Record<string, GroupColor>>
      setSectionTagColors: (colors: Record<string, GroupColor>) => Promise<void>
      getNoteOrder: () => Promise<Record<string, string[]>>
      setNoteOrder: (order: Record<string, string[]>) => Promise<void>
      getTemplates: () => Promise<NoteTemplate[]>
      setTemplates: (templates: NoteTemplate[]) => Promise<void>
      getAppVersion: () => Promise<string>
      checkUpdate: () => Promise<{ hasUpdate: boolean; latestVersion?: string; downloadUrl?: string }>
      openUrl: (url: string) => Promise<void>
      downloadAndInstall: (url: string) => Promise<{ success: boolean; error?: string }>
      onUpdateProgress: (callback: (percent: number) => void) => () => void
      onUpdateInstalling: (callback: () => void) => () => void
      exportNotes: (entries: NoteflowExportEntry[] | PlainExportEntry[], format: string, hint?: string) => Promise<{ ok: boolean; filePath?: string; error?: string; canceled?: boolean }>
      parseImportFile: () => Promise<{ ok: boolean; file?: NoteflowExportFile; error?: string; canceled?: boolean }>
      parseExternalImport: (source: ImportSource) => Promise<{ ok: boolean; source?: ImportSource; notes?: ExternalNote[]; error?: string; canceled?: boolean }>
      writeImportedNotes: (entries: NoteflowExportEntry[]) => Promise<{ written: string[]; errors: string[] }>
      // GitHub Sync
      getSyncStatus: () => Promise<{ enabled: boolean; connected: boolean; owner?: string; repo?: string; lastSync?: string; error?: string; initialPullStatus: 'pending' | 'ok' | 'failed' }>
      // Backend-tagged status of the live sync provider — drives the titlebar sync button.
      getActiveSyncStatus: () => Promise<ActiveSyncStatus>
      initiateGitHubAuth: (repo: string) => Promise<{ ok: boolean; userCode?: string; verificationUri?: string; error?: string }>
      cancelGitHubAuth: () => Promise<{ ok: boolean }>
      disconnectGitHub: () => Promise<{ ok: boolean }>
      pullNotes: () => Promise<{
        pulled: number
        deleted: number
        errors: string[]
        updatedFiles: string[]
        hadDeletions: boolean
        hadMetadataChanges: boolean
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
        error?: 'cloud-required' | 'not-connected' | 'in-progress' | 'token'
      }>
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
      cloudUpgradeE2ee: (passphrase: string) => Promise<{ ok: boolean; recoveryCode?: string; error?: string }>
      cloudDowngradeManaged: () => Promise<{ ok: boolean; error?: string }>
      cloudUnlock: (secret: string) => Promise<{ ok: boolean; error?: string }>
      cloudAutoUnlock: () => Promise<{ ok: boolean }>
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
      aiLlmSetConfig: (patch: { active?: string; model?: string; baseUrl?: string; apiKey?: string; clearKey?: boolean }) => Promise<LlmConfigPublic>
      aiLlmListModels: () => Promise<{ ok: boolean; models: string[]; error?: string }>
      aiLlmTest: () => Promise<{ ok: boolean; error?: string }>
      // NoteFlow AI managed plan: monthly consumption in weighted quota tokens (null on any failure)
      aiLlmUsage: () => Promise<{ used: number; limit: number } | null>
      aiChatsLoad: () => Promise<ChatSession[]>
      aiChatsSave: (sessions: ChatSession[]) => Promise<{ ok: boolean; error?: string }>
      aiChat: (requestId: string, messages: ChatMessage[]) => Promise<void>
      aiChatPickFiles: () => Promise<{ ok: boolean; canceled?: boolean; files?: ChatAttachment[]; errors?: string[] }>
      aiChatRemoveFile: (id: string) => Promise<{ ok: boolean }>
      aiChatCancel: (requestId: string) => void
      aiChatConfirm: (toolCallId: string, approved: boolean) => void
      onAiChatToolCall: (cb: (p: { requestId: string; toolCallId: string; name: string; input: unknown; label: string }) => void) => () => void
      onAiChatToolResult: (cb: (p: { requestId: string; toolCallId: string; status: ChatToolActivity['status']; summary: string }) => void) => () => void
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
