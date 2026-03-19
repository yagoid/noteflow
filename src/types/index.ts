// A single section inside a note (user-defined, ordered)
export interface NoteSection {
  id: string       // nanoid — stable key for React
  name: string     // display label, user-editable
  content: string  // markdown body
  isRawMode?: boolean
}

// Legacy fixed type kept only for default section creation
export type NoteType = 'note' | 'task' | 'question'

export interface NoteMeta {
  id: string
  title: string
  tags: string[]
  created: string
  updated: string
  archived: boolean
  pinned: boolean
}

export interface Note extends NoteMeta {
  sections: NoteSection[]  // ordered, user-defined content areas
  raw: string              // full file content including frontmatter
  filePath: string
}

export interface NoteFileMeta {
  filename: string
  path: string
  mtime: string
  ctime: string
}

// Extend window with our electron bridge
declare global {
  interface Window {
    noteflow: {
      listNotes: () => Promise<NoteFileMeta[]>
      readNote: (filePath: string) => Promise<string | null>
      readAllNotes: () => Promise<{ path: string; content: string | null }[]>
      writeNote: (filePath: string, content: string) => Promise<{ ok: boolean; error?: string }>
      deleteNote: (filePath: string) => Promise<{ ok: boolean; error?: string }>
      renameNote: (oldPath: string, newPath: string) => Promise<{ ok: boolean; error?: string }>
      getNotesDir: () => Promise<string>
      openNotesFolder: () => Promise<void>
      chooseNotesDir: () => Promise<string | null>
      minimize: () => void
      maximize: () => void
      close: () => void
      openSticky: (noteId: string, sectionId: string) => void
      onNewNote: (cb: () => void) => () => void
      onNotesUpdated: (cb: (filePath?: string, senderId?: number) => void) => () => void
      windowId: () => number
    }
  }
}
