// Shared message protocol + constants between the main process (aiIndex.ts) and
// the AI utilityProcess (aiWorker.ts). Structured-clone friendly (plain objects).

// Chosen by benchmark (scripts/ai-bench.cjs) over the user's real notes: best topical
// relations for mixed ES/EN/code content. The embedding dimension is detected at runtime
// from the model, so swapping modelId in settings just works (triggers a reindex).
export const DEFAULT_AI_MODEL = 'Xenova/paraphrase-multilingual-mpnet-base-v2'
export const SCHEMA_VERSION = 2         // bump → triggers a full reindex on next start

export type IndexState = 'idle' | 'indexing' | 'downloading-model'

export interface IndexProgress {
  done: number
  total: number
  phase: string
}

export interface RelatedNote {
  noteId: string
  title: string
  sectionId: string    // the matching section in the related note (for navigation)
  sectionName: string  // its display label (which tab)
  score: number
  snippet: string
}

export interface SemanticHit {
  noteId: string
  sectionId: string
  score: number
  snippet: string
}

// A content (semantic) edge between two notes — powers the brain graph's content layer.
export interface GraphEdge { a: string; b: string; score: number }   // a, b = noteId

// ── Requests (main → worker) ────────────────────────────────────────────────

export interface InitPayload { modelId: string; cacheDir: string; dbPath: string }
export interface IndexNotePayload { dirPath: string }   // absolute path of the note directory
export type LoadModelPayload = Record<string, never>
export interface RemovePayload { dirPath: string }      // absolute path of the note directory (or a DataNote key)

/**
 * A note handed to the worker as data instead of a folder to read — linked notes
 * (an external .md, electron/linkedNotes.ts). `key` is what the index stores as
 * its file path (`linked://<id>`), so remove-note works with it too.
 */
export interface DataNote {
  key: string
  note: {
    noteId: string
    title: string
    encrypted: false
    sections: Array<{ id: string; name: string; content: string; aiHidden?: boolean }>
  }
}
export type IndexNoteDataPayload = DataNote
export interface ReindexPayload { notesDir: string; extra?: DataNote[] }
export interface SearchPayload { query: string; k: number }
export interface RelatedPayload { noteId: string; sectionId: string; k: number }
export interface GraphPayload { minScore?: number; maxPerNote?: number }

export type WorkerRequest =
  | { type: 'init';        id: number; payload: InitPayload }
  | { type: 'load-model';  id: number; payload: LoadModelPayload }
  | { type: 'index-note';  id: number; payload: IndexNotePayload }
  | { type: 'index-note-data'; id: number; payload: IndexNoteDataPayload }
  | { type: 'remove-note'; id: number; payload: RemovePayload }
  | { type: 'reindex-all'; id: number; payload: ReindexPayload }
  | { type: 'search';      id: number; payload: SearchPayload }
  | { type: 'related';     id: number; payload: RelatedPayload }
  | { type: 'graph';       id: number; payload: GraphPayload }

// ── Responses (worker → main) ───────────────────────────────────────────────

export type WorkerResponse =
  | { type: 'result';   id: number; payload: unknown }
  | { type: 'error';    id: number; error: string }
  | { type: 'progress'; payload: IndexProgress }
  | { type: 'state';    payload: IndexState }
