import { useMemo } from 'react'
import type { GroupColor, Note } from '../../types'
import { useNotesStore } from '../../stores/notesStore'
import { useGroupsStore } from '../../stores/groupsStore'
import { useAiStore } from '../../stores/aiStore'
import { useSidebarGroups } from '../Sidebar/useSidebarGroups'
import { extractSectionRelations } from '../../lib/sectionRelations'
import { isAiGroupName } from '../../lib/aiGroup'

// Two-layer brain graph model. Node ids are prefixed so groups, folders, notes and sections never
// collide: `g:<groupId>`, `f:<folderId>`, `n:<noteId>`, `s:<sectionId>`.
export type BrainNodeKind = 'group' | 'folder' | 'note' | 'section'

export interface BrainNode {
  id: string
  kind: BrainNodeKind
  label: string
  colorVar: GroupColor   // group color; folders/notes inherit their group's (ungrouped → --text)
  refId: string          // raw group/folder/note/section id
  noteId?: string        // note + section nodes (section's parent note)
  sectionId?: string     // note: first section (click target); section: its own id
  favorited?: boolean     // note + section nodes — drives the cerebellum mapping
  centered?: boolean      // group node of the AI profile group — pinned to the core of the 3D brain
  groupId?: string        // folder, note + section nodes under a group: that group's node id (`g:<id>`)
}

export interface BrainStructureEdge { source: string; target: string }
export interface BrainContentEdge { source: string; target: string; score: number }
// Explicit user-made section→section relation (from inline `noteflow://` links).
// Independent of the AI index, so it shows even with embeddings disabled.
export interface BrainRelationEdge { source: string; target: string }

export interface BrainGraphModel {
  nodes: BrainNode[]
  structureEdges: BrainStructureEdge[]
  contentEdges: BrainContentEdge[]
  relationEdges: BrainRelationEdge[]
}

/**
 * Builds the brain graph from the live note/group state (structure layer) and the AI index's
 * note-to-note similarities (content layer). Excludes archived, encrypted (no plaintext in the
 * index) and temporary notes; archived and empty groups/folders are dropped too.
 */
export function useBrainGraph(): BrainGraphModel {
  const notes = useNotesStore((s) => s.notes)
  const groups = useGroupsStore((s) => s.groups)
  const folders = useGroupsStore((s) => s.folders)
  const noteOrder = useGroupsStore((s) => s.noteOrder)
  const graphEdges = useAiStore((s) => s.graphEdges)

  const visibleNotes = useMemo(
    () => notes.filter((n) => !n.archived && !n.encryption && !n.expiresAt),
    [notes],
  )

  const items = useSidebarGroups(visibleNotes, groups, folders, noteOrder)

  return useMemo(() => {
    const nodes: BrainNode[] = []
    const structureEdges: BrainStructureEdge[] = []
    const noteNodeIds = new Set<string>()
    // Resolves a section id to the node that represents it: its own `s:` dendrite when the note
    // has 2+ sections, otherwise the collapsed `n:` soma. Used to anchor user relation edges.
    const sectionNodeId = new Map<string, string>()

    const addNote = (note: Note, colorVar: GroupColor, groupId?: string): string => {
      const id = `n:${note.id}`
      nodes.push({
        id, kind: 'note',
        label: note.title?.trim() || 'Untitled',
        colorVar, refId: note.id, noteId: note.id,
        sectionId: note.sections[0]?.id,
        favorited: note.favorited,
        groupId,
      })
      noteNodeIds.add(note.id)
      // A single-section note collapses to just the soma: one node that already carries that
      // section as its click target (preview + navigation), so we skip the redundant dendrite.
      // With two or more sections, every section becomes a dendrite hanging off the soma —
      // including the first one, which the soma also keeps as its own click target.
      if (note.sections.length < 2) {
        if (note.sections[0]) sectionNodeId.set(note.sections[0].id, id)
        return id
      }
      for (let i = 0; i < note.sections.length; i++) {
        const sec = note.sections[i]
        const sid = `s:${sec.id}`
        nodes.push({
          id: sid, kind: 'section',
          label: sec.name?.trim() || 'Section',
          colorVar, refId: sec.id, noteId: note.id,
          sectionId: sec.id, favorited: note.favorited,
          groupId,
        })
        structureEdges.push({ source: id, target: sid })
        sectionNodeId.set(sec.id, sid)
      }
      return id
    }

    for (const item of items) {
      if (item.kind === 'note') {
        addNote(item.note, '--text') // ungrouped → neutral, no structure edge
        continue
      }
      if (item.group.archived || item.visibleCount === 0) continue

      const gColor = item.group.color
      const gId = `g:${item.group.id}`
      const gNode: BrainNode = { id: gId, kind: 'group', label: item.group.name, colorVar: gColor, refId: item.group.id }
      if (isAiGroupName(item.group.name)) gNode.centered = true
      nodes.push(gNode)

      for (const note of item.notes) {
        structureEdges.push({ source: gId, target: addNote(note, gColor, gId) })
      }
      for (const sf of item.folders) {
        if (sf.notes.length === 0) continue
        const fId = `f:${sf.folder.id}`
        nodes.push({ id: fId, kind: 'folder', label: sf.folder.name, colorVar: gColor, refId: sf.folder.id, groupId: gId })
        structureEdges.push({ source: gId, target: fId })
        for (const note of sf.notes) {
          structureEdges.push({ source: fId, target: addNote(note, gColor, gId) })
        }
      }
    }

    // The AI index emits relations generously (cosine > 0.05, up to 6 per note). Across a full
    // vault that's enough edges to drape the whole wireframe in a uniform whitish wash. Thin them
    // down to just the meaningful links: drop anything below MIN_SCORE, then keep only each note's
    // strongest MAX_PER_NOTE relations (strongest-first, and an edge survives as long as either
    // endpoint still has room — so no note is left fully unconnected). Raise/lower these two to
    // trade a denser web for a cleaner brain.
    const MIN_SCORE = 0.12
    const MAX_PER_NOTE = 5
    const candidates = graphEdges
      .filter((e) => e.score >= MIN_SCORE && noteNodeIds.has(e.a) && noteNodeIds.has(e.b))
      .sort((x, y) => y.score - x.score)
    const perNote = new Map<string, number>()
    const contentEdges: BrainContentEdge[] = []
    for (const e of candidates) {
      const ca = perNote.get(e.a) ?? 0, cb = perNote.get(e.b) ?? 0
      if (ca >= MAX_PER_NOTE && cb >= MAX_PER_NOTE) continue // both endpoints already saturated
      perNote.set(e.a, ca + 1); perNote.set(e.b, cb + 1)
      contentEdges.push({ source: `n:${e.a}`, target: `n:${e.b}`, score: e.score })
    }

    // Explicit user relations: parsed from each visible section's inline `noteflow://` links.
    // The source is the section that holds the link; the target is the linked section (its `s:`
    // dendrite, or the `n:` soma if the note collapsed / the section id no longer exists). This
    // layer is derived purely from note content in memory — no AI index involved.
    const relationEdges: BrainRelationEdge[] = []
    const seenRel = new Set<string>()
    for (const note of visibleNotes) {
      for (const sec of note.sections) {
        const source = sectionNodeId.get(sec.id)
        if (!source) continue
        for (const rel of extractSectionRelations(sec.content)) {
          const target =
            sectionNodeId.get(rel.targetSectionId) ??
            (noteNodeIds.has(rel.targetNoteId) ? `n:${rel.targetNoteId}` : null)
          if (!target || target === source) continue
          const key = `${source}->${target}`
          if (seenRel.has(key)) continue
          seenRel.add(key)
          relationEdges.push({ source, target })
        }
      }
    }

    return { nodes, structureEdges, contentEdges, relationEdges }
  }, [items, graphEdges, visibleNotes])
}
