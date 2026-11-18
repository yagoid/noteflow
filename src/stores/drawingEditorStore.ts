import { create } from 'zustand'
import type { DrawingBlock } from '../lib/drawing/drawingBlock'
import type { ExcalidrawScene } from '../lib/drawing/drawingScene'

// The drawing overlay of this window (components/Drawing): one editing session at a time,
// opened by a drawing node view (components/Editor/DrawingBlockView.tsx) and answered by
// the overlay. Kept in a store because the two live in different React trees: the node
// view inside the editor, the overlay host at the root of the window.

/** How a session ended. `lines` = the new fence content of an `excalidraw` block. */
export type DrawingEditResult =
  | { type: 'unchanged' }
  | { type: 'saved'; lines: string[]; empty: boolean }

export interface DrawingEditSession {
  /** The block being edited (its attributes and, for a source, the Mermaid text). */
  block: DrawingBlock
  /** What the canvas starts from: the stored scene restored, or the Mermaid source converted. */
  scene: ExcalidrawScene
  /** Just inserted: nothing to lose yet, and closing it empty removes the block. */
  isNew: boolean
  finish: (result: DrawingEditResult) => void
}

interface DrawingEditorState {
  /** An overlay host is mounted in this window (main and section windows; not stickies). */
  available: boolean
  session: DrawingEditSession | null
  setAvailable: (available: boolean) => void
  /** Opens the overlay; resolves when it closes. Rejects nothing: no host or a session already open → 'unchanged'. */
  edit: (session: Omit<DrawingEditSession, 'finish'>) => Promise<DrawingEditResult>
}

export const useDrawingEditorStore = create<DrawingEditorState>((set, get) => ({
  available: false,
  session: null,
  setAvailable: (available) => set({ available }),
  edit: (session) => {
    if (!get().available || get().session) return Promise.resolve({ type: 'unchanged' })
    return new Promise((resolve) => {
      set({
        session: {
          ...session,
          finish: (result) => {
            set({ session: null })
            resolve(result)
          },
        },
      })
    })
  },
}))
