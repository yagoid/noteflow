// Brain graph model — the type contract of the app's src/components/Brain/useBrainGraph.ts (and
// GroupColor from src/types), without the hook: the web has no notes or stores, so the graph is
// provided statically (sampleGraph.ts). The synced copies (assign.ts, data.ts, look.ts) import
// their types from here, so this must keep every field they read.
//
// Node ids are prefixed so groups, folders, notes and sections never collide: `g:<id>`, `f:<id>`,
// `n:<id>`, `s:<id>`.

/** A theme CSS var (e.g. '--accent') or a free '#rrggbb' colour. */
export type GroupColor = `--${string}` | `#${string}`

export type BrainNodeKind = 'group' | 'folder' | 'note' | 'section'

export interface BrainNode {
  id: string
  kind: BrainNodeKind
  label: string
  colorVar: GroupColor   // group color; folders/notes inherit their group's (ungrouped → --text)
  refId: string          // raw group/folder/note/section id
  noteId?: string        // note + section nodes (section's parent note)
  sectionId?: string     // note: first section (click target); section: its own id
  favorited?: boolean    // note + section nodes — drives the cerebellum mapping
  centered?: boolean     // group node of the AI profile group — pinned to the core of the 3D brain
  groupId?: string       // folder, note + section nodes under a group: that group's node id (`g:<id>`)
}

export interface BrainStructureEdge { source: string; target: string }
export interface BrainContentEdge { source: string; target: string; score: number }
// Explicit user-made section→section relation (inline `noteflow://` links in the app).
export interface BrainRelationEdge { source: string; target: string }

export interface BrainGraphModel {
  nodes: BrainNode[]
  structureEdges: BrainStructureEdge[]
  contentEdges: BrainContentEdge[]
  relationEdges: BrainRelationEdge[]
}
