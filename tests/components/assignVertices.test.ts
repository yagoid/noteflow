import { describe, it, expect } from 'vitest'
import { getBrainMesh } from '../../src/components/Brain/brainMesh'
import { assignVertices } from '../../src/components/Brain/assignVertices'
import type { BrainGraphModel } from '../../src/components/Brain/useBrainGraph'
import { BRAIN_MESH_REF as REF, brainNode, buildRefModel } from '../helpers/brainMeshRef'

const mesh = getBrainMesh()
const V = mesh.vertexCount
const cortexSize = mesh.cortex.reduce((n, c) => n + c, 0)

const dist = (a: number, b: number) => Math.hypot(
  mesh.positions[a * 3] - mesh.positions[b * 3],
  mesh.positions[a * 3 + 1] - mesh.positions[b * 3 + 1],
  mesh.positions[a * 3 + 2] - mesh.positions[b * 3 + 2],
)
/** Lattice hops between two vertices. */
function hops(from: number, to: number): number {
  const depth = new Int32Array(V).fill(-1)
  const queue = [from]
  depth[from] = 0
  for (let h = 0; h < queue.length; h++) {
    if (queue[h] === to) return depth[to]
    for (const nb of mesh.adjacency[queue[h]]) if (depth[nb] < 0) { depth[nb] = depth[queue[h]] + 1; queue.push(nb) }
  }
  return Infinity
}
const sharedVertices = (assignment: Map<string, number>) => assignment.size - new Set(assignment.values()).size

interface VaultShape { groups: number; perGroup: number; loose?: number; sectionEvery?: number; folders?: number }
/**
 * A vault-sized graph: `groups` groups of `perGroup` notes each — all directly in the group, or
 * with `folders` folders, half in the group and half split over them — plus `loose` ungrouped
 * notes: half before the groups, half after, one in ten favourited. Every `sectionEvery`-th note
 * has three sections.
 */
function buildVault({ groups, perGroup, loose = 0, sectionEvery = Infinity, folders = 2 }: VaultShape): BrainGraphModel {
  const model: BrainGraphModel = { nodes: [], structureEdges: [], contentEdges: [], relationEdges: [] }
  let notes = 0
  const addNote = (noteId: string, parent?: string, groupId?: string, favorited = false) => {
    const id = `n:${noteId}`
    model.nodes.push(brainNode({ id, kind: 'note', noteId, groupId, favorited }))
    if (parent) model.structureEdges.push({ source: parent, target: id })
    if (++notes % sectionEvery !== 0) return
    for (let s = 0; s < 3; s++) {
      model.nodes.push(brainNode({ id: `s:${noteId}-${s}`, kind: 'section', noteId, groupId, favorited }))
      model.structureEdges.push({ source: id, target: `s:${noteId}-${s}` })
    }
  }
  for (let i = 0; i < loose / 2; i++) addNote(`before${i}`, undefined, undefined, i % 10 === 0)
  for (let g = 0; g < groups; g++) {
    const gid = `g:${g}`
    model.nodes.push(brainNode({ id: gid, kind: 'group', colorVar: '--accent' }))
    for (let i = 0; i < (folders ? perGroup / 2 : perGroup); i++) addNote(`${g}-${i}`, gid, gid)
    for (let f = 0; f < folders; f++) {
      const fid = `f:${g}-${f}`
      model.nodes.push(brainNode({ id: fid, kind: 'folder', colorVar: '--accent', groupId: gid }))
      model.structureEdges.push({ source: gid, target: fid })
      for (let i = 0; i < perGroup / 2 / folders; i++) addNote(`${g}-${f}-${i}`, fid, gid)
    }
  }
  for (let i = 0; i < loose / 2; i++) addNote(`after${i}`, undefined, undefined, i % 10 === 0)
  return model
}

/** How well a layout keeps each group together. Distances are straight lines between vertices. */
function summarize(model: BrainGraphModel, assignment: Map<string, number>) {
  const at = (id: string) => assignment.get(id)!
  const parentOf = new Map(model.structureEdges.map((e) => [e.target, e.source]))
  const groups = model.nodes.filter((n) => n.kind === 'group' && !n.centered)
  const nearestGroup = (v: number) => groups.reduce((best, g) => (dist(v, at(g.id)) < dist(v, at(best.id)) ? g : best)).id
  const toParent: number[] = [], toNote: number[] = []
  let strays = 0, directStrays = 0, withoutAir = 0
  const byParent = new Map<string, number[]>()
  for (const n of model.nodes) {
    if (n.kind === 'section') { toNote.push(dist(at(n.id), at(`n:${n.noteId}`))); continue }
    const parent = parentOf.get(n.id)
    if (n.kind !== 'note' || !parent) continue
    toParent.push(dist(at(n.id), at(parent)))
    byParent.set(parent, [...(byParent.get(parent) ?? []), at(n.id)])
    if (nearestGroup(at(n.id)) === n.groupId) continue
    strays++
    if (parent === n.groupId) directStrays++
  }
  for (const vs of byParent.values()) for (const v of vs) if (mesh.adjacency[v].some((nb) => vs.includes(nb))) withoutAir++
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
  return {
    notes: toParent.length,
    farthest: Math.max(...toParent),       // the note farthest from its parent (group or folder)
    typical: mean(toParent),
    strays,                                // notes nearer to another group's anchor than to their own
    directStrays,                          // …among the notes that hang straight off their group
    withoutAir,                            // notes touching a sibling
    farthestSection: toNote.length ? Math.max(...toNote) : 0,
  }
}

describe('assignVertices — the reference layout', () => {
  const model = buildRefModel()
  const assignment = assignVertices(mesh, model)
  const at = (id: string) => assignment.get(id)!
  const parentOf = new Map(model.structureEdges.map((e) => [e.target, e.source]))

  it('matches the approved prototype vertex for vertex', () => {
    expect([...assignment.entries()]).toEqual(REF.assignment)
  })

  it('is deterministic', () => {
    expect([...assignVertices(mesh, buildRefModel()).entries()]).toEqual([...assignment.entries()])
  })

  it('places every node on a vertex of its own', () => {
    expect(assignment.size).toBe(model.nodes.length)
    expect(sharedVertices(assignment)).toBe(0)
  })

  it('keeps groups, folders and their notes on the cortex', () => {
    const off = model.nodes
      .filter((n) => n.kind !== 'section' && n.id !== 'g:ai' && (n.kind !== 'note' || (parentOf.has(n.id) && n.groupId !== 'g:ai')))
      .filter((n) => mesh.cortex[at(n.id)] !== 1)
      .map((n) => n.id)
    expect(off).toEqual([])
  })

  it('spreads the groups apart', () => {
    const anchors = model.nodes.filter((n) => n.kind === 'group' && !n.centered).map((n) => at(n.id))
    for (let i = 0; i < anchors.length; i++) for (let j = i + 1; j < anchors.length; j++) {
      expect(dist(anchors[i], anchors[j])).toBeGreaterThan(0.5)
    }
  })

  it('gives each folder a patch next to its group', () => {
    for (const folder of model.nodes.filter((n) => n.kind === 'folder')) {
      expect(dist(at(folder.id), at(parentOf.get(folder.id)!))).toBeLessThanOrEqual(0.42)
    }
  })

  it('keeps air between the notes of one parent', () => {
    const byParent = new Map<string, number[]>()
    for (const n of model.nodes) {
      const parent = parentOf.get(n.id)
      if (n.kind !== 'note' || !parent || parent === 'g:ai') continue
      byParent.set(parent, [...(byParent.get(parent) ?? []), at(n.id)])
    }
    const touching: string[] = []
    for (const [parent, vs] of byParent) {
      for (const a of vs) for (const b of vs) if (a !== b && mesh.adjacency[a].includes(b)) touching.push(parent)
    }
    expect(touching).toEqual([])
  })

  it('sends loose favourites to the cerebellum and other loose notes to the cortex', () => {
    for (const n of model.nodes.filter((x) => x.kind === 'note' && !parentOf.has(x.id))) {
      if (n.favorited) expect(mesh.kind[at(n.id)], n.id).toBe(1)
      else expect(mesh.cortex[at(n.id)], n.id).toBe(1)
    }
  })

  it('pins the centered group to the core, with its notes inside', () => {
    const core = at('g:ai')
    expect(mesh.surface[core]).toBe(0)
    const toCenter = (v: number) => Math.hypot(mesh.positions[v * 3] - mesh.center[0], mesh.positions[v * 3 + 1] - mesh.center[1], mesh.positions[v * 3 + 2] - mesh.center[2])
    expect(mesh.interiorVertices.filter((v) => toCenter(v) < toCenter(core))).toEqual([])
    expect(mesh.surface[at('n:profile')]).toBe(0)
  })

  it('hangs every section next to its note, in the same kind of area', () => {
    for (const s of model.nodes.filter((n) => n.kind === 'section')) {
      const note = at(`n:${s.noteId}`)
      expect(hops(note, at(s.id)), s.id).toBeLessThanOrEqual(2)
      expect(mesh.cortex[at(s.id)], s.id).toBe(mesh.cortex[note])
    }
  })
})

// The brain is about 2.3 long and 1.6 wide; the anchors of a dozen groups sit some 0.65 apart.
// These bounds are loose on purpose — the measured values are in the comments — but a search
// that cuts through the interior, or that chases air across the brain, breaks every one of them
// (it left notes up to 1.9 away from their group).
describe('assignVertices — groups stay together', () => {
  it('keeps the notes of a small parent airy and close', () => {
    const model = buildVault({ groups: 6, perGroup: 10, loose: 12, sectionEvery: 5, folders: 0 })
    const layout = summarize(model, assignVertices(mesh, model))
    expect(layout.withoutAir).toBe(0)
    expect(layout.farthest).toBeLessThanOrEqual(0.45)            // 0.42
    expect(layout.strays).toBe(0)
  })

  it('grows one big group as a single patch around its anchor', () => {
    const model = buildVault({ groups: 1, perGroup: 100, folders: 0 })
    const layout = summarize(model, assignVertices(mesh, model))
    expect(layout.farthest).toBeLessThan(0.6)                     // 0.45
    expect(layout.typical).toBeLessThan(0.35)                     // 0.26
    // air runs out near the anchor long before the hundredth note: the rest pack in beside it
    expect(layout.withoutAir).toBeGreaterThan(50)
  })

  it('keeps 40 notes per group together in a 600-note vault', () => {
    const model = buildVault({ groups: 12, perGroup: 40, loose: 120, sectionEvery: 3 })
    const layout = summarize(model, assignVertices(mesh, model))
    expect(layout.notes).toBe(480)
    expect(layout.farthest).toBeLessThan(0.6)                     // 0.41
    expect(layout.typical).toBeLessThan(0.3)                      // 0.19
    expect(layout.directStrays).toBeLessThanOrEqual(12)           // 0 of the 240 that hang off a group
    expect(layout.strays).toBeLessThan(96)                        // 43 of 480: notes in folders near a border
    expect(layout.farthestSection).toBeLessThan(0.45)             // 0.29
  })

  it('keeps 100 notes per group together', () => {
    const model = buildVault({ groups: 6, perGroup: 100, loose: 60, sectionEvery: 4, folders: 0 })
    const layout = summarize(model, assignVertices(mesh, model))
    expect(layout.notes).toBe(600)
    expect(layout.farthest).toBeLessThan(0.9)                     // 0.68
    expect(layout.typical).toBeLessThan(0.45)                     // 0.32
    expect(layout.strays).toBeLessThan(30)                        // 2
    expect(layout.farthestSection).toBeLessThan(0.45)             // 0.26
  })

  it('packs each group around its anchor when the vault outgrows the cortex', () => {
    const model = buildVault({ groups: 16, perGroup: 40, loose: 160, sectionEvery: 2 })
    expect(model.nodes.length).toBeGreaterThan(cortexSize * 1.5)
    const assignment = assignVertices(mesh, model)
    expect(assignment.size).toBe(model.nodes.length)
    const layout = summarize(model, assignment)
    expect(layout.farthest).toBeLessThan(0.9)                     // 0.61
    expect(layout.typical).toBeLessThan(0.3)                      // 0.20
    expect(layout.directStrays).toBeLessThanOrEqual(16)           // 2 of 320
    expect(layout.farthestSection).toBeLessThan(0.7)              // 0.40
  })

  it('keeps a folder with its group even when no gyrus is left beside it', () => {
    // each group's own notes use up the gyri around its anchor before its folders are placed
    const model = buildVault({ groups: 6, perGroup: 100, loose: 60, sectionEvery: 4 })
    const assignment = assignVertices(mesh, model)
    const folders = model.nodes.filter((n) => n.kind === 'folder')
    const fromGroup = folders.map((f) => dist(assignment.get(f.id)!, assignment.get(f.groupId!)!))
    expect(Math.max(...fromGroup)).toBeLessThan(0.5)              // 0.42
  })
})

describe('assignVertices — real-sized vaults', () => {
  // the vertices the lattice reaches from the surface: only there can a node be routed to
  const reachable = new Set<number>([0])
  {
    const queue = [0]
    for (let h = 0; h < queue.length; h++) for (const nb of mesh.adjacency[queue[h]]) if (!reachable.has(nb)) { reachable.add(nb); queue.push(nb) }
  }
  const unroutable = (assignment: Map<string, number>) => [...assignment.values()].filter((v) => !reachable.has(v))

  it('places every node of a 600-note vault, one per vertex', () => {
    const model = buildVault({ groups: 12, perGroup: 40, loose: 120, sectionEvery: 3 })
    expect(model.nodes.filter((n) => n.kind === 'note').length).toBe(600)
    const assignment = assignVertices(mesh, model)
    expect(assignment.size).toBe(model.nodes.length)
    expect(sharedVertices(assignment)).toBe(0)
    expect(unroutable(assignment)).toEqual([])
    // every group is seeded on a gyrus
    const groups = model.nodes.filter((n) => n.kind === 'group')
    expect(groups.filter((g) => mesh.cortex[assignment.get(g.id)!] !== 1)).toEqual([])
  })

  it('never puts the first group on a vertex that is already taken', () => {
    // 79 loose notes with two sections each, then the first group: its front-lateral spot is
    // already under one of those sections, so it takes the best spot still free
    const model: BrainGraphModel = { nodes: [], structureEdges: [], contentEdges: [], relationEdges: [] }
    for (let i = 0; i < 79; i++) {
      model.nodes.push(brainNode({ id: `n:l${i}`, kind: 'note', noteId: `l${i}` }))
      for (let s = 0; s < 2; s++) {
        model.nodes.push(brainNode({ id: `s:l${i}-${s}`, kind: 'section', noteId: `l${i}` }))
        model.structureEdges.push({ source: `n:l${i}`, target: `s:l${i}-${s}` })
      }
    }
    model.nodes.push(brainNode({ id: 'g:0', kind: 'group', colorVar: '--accent' }))
    const assignment = assignVertices(mesh, model)
    const frontLateral = REF.assignment.find(([id]) => id === 'g:0')![1]
    expect([...assignment.entries()].find(([, v]) => v === frontLateral)![0]).toMatch(/^s:/)
    expect(assignment.size).toBe(model.nodes.length)
    expect(sharedVertices(assignment)).toBe(0)
    expect(mesh.cortex[assignment.get('g:0')!]).toBe(1)
  })

  it('spills over the rest of the brain when the cortex is full, dropping nothing', () => {
    const model = buildVault({ groups: 20, perGroup: 60, loose: 300, sectionEvery: 2 })
    expect(model.nodes.length).toBeGreaterThan(cortexSize)
    expect(model.nodes.length).toBeLessThan(reachable.size)
    const assignment = assignVertices(mesh, model)
    expect(assignment.size).toBe(model.nodes.length)
    expect(sharedVertices(assignment)).toBe(0)
    expect(unroutable(assignment)).toEqual([])
  })

  it('fills every routable vertex and then stops, without throwing, when there are more nodes than room', () => {
    const model = buildVault({ groups: 30, perGroup: 80, loose: 800, sectionEvery: 2 })
    expect(model.nodes.length).toBeGreaterThan(V)
    const assignment = assignVertices(mesh, model)
    expect(assignment.size).toBe(reachable.size)
    expect(sharedVertices(assignment)).toBe(0)
    expect(unroutable(assignment)).toEqual([])
  })

  it('copes with an empty graph and with orphans', () => {
    expect(assignVertices(mesh, { nodes: [], structureEdges: [], contentEdges: [], relationEdges: [] }).size).toBe(0)
    // a folder and a section whose parents are missing are skipped; the rest is placed
    const model: BrainGraphModel = {
      nodes: [
        brainNode({ id: 'f:lost', kind: 'folder' }),
        brainNode({ id: 's:lost', kind: 'section', noteId: 'nowhere' }),
        brainNode({ id: 'n:a', kind: 'note', noteId: 'a' }),
      ],
      structureEdges: [], contentEdges: [], relationEdges: [],
    }
    expect([...assignVertices(mesh, model).keys()]).toEqual(['n:a'])
  })
})
