import { describe, it, expect } from 'vitest'
import { CatmullRomCurve3, Vector3 } from 'three'
import { getBrainMesh, mulberry32, type BrainMesh } from '../../src/components/Brain/brainMesh'
import {
  buildBrainData, entranceCoords, fibre, focusMask, outwardFaces, strongestEdges, NODE_TIER,
  type BrainData, type EdgePath,
} from '../../src/components/Brain/brainData'
import type { BrainGraphModel } from '../../src/components/Brain/useBrainGraph'
import { brainNode, buildRefModel } from '../helpers/brainMeshRef'

const mesh = getBrainMesh()
const V = mesh.vertexCount
const P = mesh.positions

const dist = (a: number, b: number) => Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2])
const adjacent = (a: number, b: number) => mesh.adjacency[a].includes(b)
const pairKey = (a: number, b: number) => Math.min(a, b) * V + Math.max(a, b)
const lit = (data: BrainData, mask: Uint8Array) => data.placed.filter((nd) => mask[nd.index] === 1).map((nd) => nd.id).sort()

/**
 * The reference graph plus a few relations: four content edges (one of them duplicating a user
 * relation's pair, one pointing at a note that does not exist) and two explicit user relations.
 */
function buildModel(): BrainGraphModel {
  const model = buildRefModel()
  model.contentEdges.push(
    { source: 'n:0-1', target: 'n:1-1', score: 0.9 },
    { source: 'n:0-1', target: 'n:2-2', score: 0.5 },
    { source: 'n:3-4', target: 'n:4-5', score: 0.7 },
    { source: 'n:profile', target: 'n:0-0', score: 0.6 },
    { source: 'n:loose3', target: 'n:1-7', score: 0.4 },
    { source: 'n:1-1', target: 'n:ghost', score: 0.8 },
  )
  model.relationEdges.push(
    { source: 's:0-0-1', target: 'n:2-2' },
    { source: 'n:loose3', target: 'n:1-7' },
  )
  return model
}

describe('buildBrainData — placement', () => {
  const model = buildModel()
  const data = buildBrainData(mesh, model)

  it('places every assigned node, in model order, at its vertex', () => {
    expect(data.placed.map((nd) => nd.id)).toEqual(model.nodes.filter((nd) => data.assignment.has(nd.id)).map((nd) => nd.id))
    expect(data.placed.length).toBe(model.nodes.length)
    for (const [i, nd] of data.placed.entries()) {
      expect(nd.index).toBe(i)
      expect(nd.v).toBe(data.assignment.get(nd.id))
      expect([nd.x, nd.y, nd.z]).toEqual([P[nd.v * 3], P[nd.v * 3 + 1], P[nd.v * 3 + 2]])
      expect(nd.tier).toBe(NODE_TIER[nd.kind])
      expect(data.byId.get(nd.id)).toBe(nd)
    }
  })

  it('gives notes and sections the key of their note, and nothing to groups and folders', () => {
    expect(data.byId.get('n:0-0')!.noteNodeId).toBe('n:0-0')
    expect(data.byId.get('s:0-0-1')!.noteNodeId).toBe('n:0-0')
    expect(data.byId.get('g:0')!.noteNodeId).toBeNull()
    expect(data.byId.get('f:0')!.noteNodeId).toBeNull()
  })

  it('links every child to its structural parent', () => {
    for (const e of model.structureEdges) {
      expect(data.byId.get(e.target)!.parent, e.target).toBe(data.byId.get(e.source)!.index)
    }
    expect(data.byId.get('g:0')!.parent).toBe(-1)
    expect(data.byId.get('n:loose0')!.parent).toBe(-1)
  })

  it('starts the heartbeat at the centered group, or at the core of the mesh without one', () => {
    const ai = data.byId.get('g:ai')!
    expect(data.coreId).toBe('g:ai')
    expect(data.core).toEqual([ai.x, ai.y, ai.z])

    const plain = buildRefModel()
    plain.nodes = plain.nodes.map((nd) => (nd.centered ? { ...nd, centered: undefined } : nd))
    const without = buildBrainData(mesh, plain)
    expect(without.coreId).toBeNull()
    expect(without.core).toEqual(mesh.center)
  })

  it('copes with an empty graph', () => {
    const empty = buildBrainData(mesh, { nodes: [], structureEdges: [], contentEdges: [], relationEdges: [] })
    expect(empty.placed).toEqual([])
    expect(empty.structDedup).toEqual([])
    expect(empty.synSegs).toEqual([])
    expect(empty.edgePaths).toEqual([])
    expect(empty.connected).toEqual([])
    expect(empty.core).toEqual(mesh.center)
  })
})

describe('buildBrainData — structure routes and dendrites', () => {
  const model = buildModel()
  const data = buildBrainData(mesh, model)
  const groupVertices = new Set(data.placed.filter((nd) => nd.kind === 'group').map((nd) => nd.v))

  it('routes group → folder → note hop by hop along the lattice', () => {
    expect(data.structRaw.length).toBeGreaterThan(0)
    for (const s of data.structRaw) {
      expect(adjacent(s.u, s.w)).toBe(true)
      expect(s.arcW - s.arcU).toBeCloseTo(dist(s.u, s.w), 9)
      expect(s.count).toBe(1)
    }
  })

  it('accumulates arc length from the group down the whole branch', () => {
    for (const s of data.structRaw) {
      if (s.arcU === 0) { expect(groupVertices.has(s.u)).toBe(true); continue }
      // some hop ends where this one starts, at the same arc
      expect(data.structRaw.some((p) => p.w === s.u && Math.abs(p.arcW - s.arcU) < 1e-9)).toBe(true)
    }
    // a note under a folder is farther along than the folder itself
    const folderArc = Math.max(...data.structRaw.filter((s) => s.w === data.byId.get('f:0')!.v).map((s) => s.arcW))
    const noteArc = Math.max(...data.structRaw.filter((s) => s.w === data.byId.get('n:0-3')!.v).map((s) => s.arcW))
    expect(noteArc).toBeGreaterThan(folderArc)
  })

  it('draws each lattice edge once and counts how many routes share it', () => {
    const keys = data.structDedup.map((s) => pairKey(s.u, s.w))
    expect(new Set(keys).size).toBe(keys.length)
    expect(new Set(data.structRaw.map((s) => pairKey(s.u, s.w)))).toEqual(new Set(keys))
    expect(data.structDedup.reduce((n, s) => n + s.count, 0)).toBe(data.structRaw.length)
    // routes fan out from a group, so some edge next to one is shared
    expect(Math.max(...data.structDedup.map((s) => s.count))).toBeGreaterThan(1)
    // the count lives on the deduplicated copy only
    expect(data.structRaw.every((s) => s.count === 1)).toBe(true)
  })

  it('hangs each section off its note, continuing the note\'s arc', () => {
    const sections = model.nodes.filter((nd) => nd.kind === 'section')
    expect(data.dend.length).toBe(sections.length)
    for (const s of sections) {
      const note = data.byId.get(`n:${s.noteId}`)!, sec = data.byId.get(s.id)!
      const d = data.dend.find((x) => x.u === note.v && x.w === sec.v)!
      expect(d, s.id).toBeDefined()
      expect(d.arcW - d.arcU).toBeCloseTo(dist(note.v, sec.v), 9)
      const noteArc = Math.max(...data.structRaw.filter((p) => p.w === note.v).map((p) => p.arcW))
      expect(d.arcU).toBeCloseTo(noteArc, 9)
      expect(d.arcU).toBeGreaterThan(0)
    }
  })

  it('does not depend on the order the model lists its structure edges in', () => {
    const shuffled = buildModel()
    shuffled.structureEdges.reverse()
    const other = buildBrainData(mesh, shuffled)
    const arcs = (d: BrainData) => d.dend.map((s) => `${s.u}>${s.w}@${s.arcU.toFixed(9)}`).sort()
    expect(arcs(other)).toEqual(arcs(data))
    const hops = (d: BrainData) => d.structRaw.map((s) => `${s.u}>${s.w}@${s.arcU.toFixed(9)}`).sort()
    expect(hops(other)).toEqual(hops(data))
  })
})

describe('buildBrainData — relations', () => {
  const model = buildModel()
  const data = buildBrainData(mesh, model)
  const pathOf = (source: string, target: string, content: boolean) =>
    data.edgePaths.find((e) => e.source === source && e.target === target && e.content === content)!

  it('routes every relation between placed nodes: content first, then user relations', () => {
    expect(data.edgePaths.map((e) => [e.source, e.target, e.content])).toEqual([
      ['n:0-1', 'n:1-1', true], ['n:0-1', 'n:2-2', true], ['n:3-4', 'n:4-5', true], ['n:profile', 'n:0-0', true],
      ['n:loose3', 'n:1-7', true],
      ['s:0-0-1', 'n:2-2', false], ['n:loose3', 'n:1-7', false],
    ])
    expect(data.edgePaths.filter((e) => !e.content).every((e) => e.score === 1)).toBe(true)
    expect(pathOf('n:0-1', 'n:1-1', true).score).toBe(0.9)
  })

  it('orients each path from its source to its target, over lattice edges', () => {
    for (const e of data.edgePaths) {
      expect(e.seq[0]).toBe(data.byId.get(e.source)!.v)
      expect(e.seq[e.seq.length - 1]).toBe(data.byId.get(e.target)!.v)
      let total = 0
      for (let i = 0; i < e.seq.length - 1; i++) {
        expect(adjacent(e.seq[i], e.seq[i + 1])).toBe(true)
        total += dist(e.seq[i], e.seq[i + 1])
      }
      expect(e.total).toBeCloseTo(total, 9)
    }
  })

  it('routes the whole batch with a single call to the congestion-aware router', () => {
    let calls = 0, pairs = 0
    const counting: BrainMesh = {
      ...mesh,
      routeContentEdges: (batch) => { calls++; pairs = batch.length; return mesh.routeContentEdges(batch) },
    }
    buildBrainData(counting, buildModel())
    expect(calls).toBe(1)
    expect(pairs).toBe(7)
    // nothing to route: the router (and its memo of the last batch) is left alone
    calls = 0
    buildBrainData(counting, buildRefModel())
    expect(calls).toBe(0)
  })

  it('indexes content relations by note, and leaves user relations out of that index', () => {
    const edges = (id: string) => (data.contentOf.get(id) ?? []).map((i) => `${data.edgePaths[i].source}~${data.edgePaths[i].target}`)
    expect(edges('n:0-1')).toEqual(['n:0-1~n:1-1', 'n:0-1~n:2-2'])
    expect(edges('n:2-2')).toEqual(['n:0-1~n:2-2'])
    expect(data.contentOf.has('s:0-0-1')).toBe(false)
    expect([...data.connected].sort()).toEqual(['n:0-0', 'n:0-1', 'n:1-1', 'n:1-7', 'n:2-2', 'n:3-4', 'n:4-5', 'n:loose3', 'n:profile'])
    for (const list of data.contentOf.values()) for (const i of list) expect(data.edgePaths[i].content).toBe(true)
  })

  it('indexes user relations both ways', () => {
    const related = (id: string) => (data.relatedOf.get(id) ?? []).map((i) => data.placed[i].id)
    expect(related('s:0-0-1')).toEqual(['n:2-2'])
    expect(related('n:2-2')).toEqual(['s:0-0-1'])
    expect(related('n:1-7')).toEqual(['n:loose3'])
    expect(related('n:0-1')).toEqual([])
  })

  it('draws each lattice edge of the synapse layer once', () => {
    const keys = data.synSegs.map((s) => pairKey(s.u, s.w))
    expect(new Set(keys).size).toBe(keys.length)
    const hops = new Set<number>()
    for (const e of data.edgePaths) for (let i = 0; i < e.seq.length - 1; i++) hops.add(pairKey(e.seq[i], e.seq[i + 1]))
    expect(new Set(keys)).toEqual(hops)
  })

  it('keeps an edge shared with a user relation visible when content is hidden', () => {
    const contentOnly = new Map(data.synSegs.map((s) => [pairKey(s.u, s.w), s.content]))
    const hopsOf = (e: EdgePath) => e.seq.slice(1).map((v, i) => pairKey(e.seq[i], v))
    // every hop of a user relation is drawn as "not content"…
    for (const e of data.edgePaths.filter((x) => !x.content)) for (const k of hopsOf(e)) expect(contentOnly.get(k)).toBe(false)
    // …including the ones the duplicate content relation of the same pair runs over
    const twin = pathOf('n:loose3', 'n:1-7', true)
    expect(twin.seq).toEqual(pathOf('n:loose3', 'n:1-7', false).seq)
    for (const k of hopsOf(twin)) expect(contentOnly.get(k)).toBe(false)
    // …while a relation that is only content is flagged as such
    expect(hopsOf(pathOf('n:3-4', 'n:4-5', true)).some((k) => contentOnly.get(k) === true)).toBe(true)
  })

  it('picks the strongest relations for the impulses, user relations first', () => {
    const order = strongestEdges(data.edgePaths, 4).map((i) => data.edgePaths[i])
    expect(order.map((e) => e.content)).toEqual([false, false, true, true])
    expect(order.slice(2).map((e) => e.score)).toEqual([0.9, 0.7])
    expect(strongestEdges(data.edgePaths, 100).length).toBe(data.edgePaths.length)
    expect(strongestEdges(data.edgePaths, 0)).toEqual([])
  })
})

describe('focusMask', () => {
  const data = buildBrainData(mesh, buildModel())
  const mask = (id: string | null, includeContent: boolean) =>
    lit(data, focusMask(data, id ? data.byId.get(id) : null, includeContent, new Uint8Array(data.placed.length)))

  it('lights nothing without a focus', () => {
    expect(mask(null, true)).toEqual([])
  })

  it('lights a group with all its members', () => {
    const members = data.placed.filter((nd) => nd.id === 'g:1' || nd.groupId === 'g:1').map((nd) => nd.id).sort()
    expect(mask('g:1', true)).toEqual(members)
    expect(members.length).toBe(1 + 1 + 9 + 9) // group, folder, nine notes, three notes × three sections
  })

  it('lights a folder with its notes and their sections', () => {
    expect(mask('f:0', false)).toEqual(['f:0', 'n:0-0', 'n:0-3', 'n:0-6', 's:0-0-0', 's:0-0-1', 's:0-0-2'].sort())
  })

  it('lights a note with its sections, what a user relation links, and its content relations on demand', () => {
    expect(mask('n:0-0', false)).toEqual(['n:0-0', 's:0-0-0', 's:0-0-1', 's:0-0-2'])
    expect(mask('n:0-0', true)).toEqual(['n:0-0', 'n:profile', 's:0-0-0', 's:0-0-1', 's:0-0-2'])
    expect(mask('n:0-1', true)).toEqual(['n:0-1', 'n:1-1', 'n:2-2'])
    expect(mask('n:0-1', false)).toEqual(['n:0-1'])
  })

  it('treats a section like its note, plus its own user relations', () => {
    expect(mask('s:0-0-1', false)).toEqual(['n:0-0', 'n:2-2', 's:0-0-0', 's:0-0-1', 's:0-0-2'])
    expect(mask('s:0-0-2', true)).toEqual(['n:0-0', 'n:profile', 's:0-0-0', 's:0-0-1', 's:0-0-2'])
  })

  it('reuses the buffer it is given', () => {
    const buf = new Uint8Array(data.placed.length).fill(1)
    expect(focusMask(data, data.byId.get('n:loose0'), true, buf)).toBe(buf)
    expect(lit(data, buf)).toEqual(['n:loose0'])
  })
})

describe('entranceCoords', () => {
  const rev = entranceCoords(mesh)

  it('grows from the core of the mesh outwards, up to 0.7', () => {
    expect(rev.length).toBe(V)
    let max = 0, nearest = 0, farthest = 0
    const toCore = (v: number) => Math.hypot(P[v * 3] - mesh.center[0], P[v * 3 + 1] - mesh.center[1], P[v * 3 + 2] - mesh.center[2])
    for (let v = 0; v < V; v++) {
      expect(rev[v]).toBeGreaterThanOrEqual(0)
      if (rev[v] > max) max = rev[v]
      if (toCore(v) < toCore(nearest)) nearest = v
      if (toCore(v) > toCore(farthest)) farthest = v
    }
    expect(max).toBeCloseTo(0.7, 6)
    expect(rev[farthest]).toBeCloseTo(0.7, 6)
    expect(rev[nearest]).toBe(Math.min(...rev))
    expect(rev[nearest]).toBeLessThan(0.1)
  })
})

describe('outwardFaces', () => {
  const before = mesh.faces.slice()
  const faces = outwardFaces(mesh)
  // Signed volume the triangles of each part (cerebrum, cerebellum, brainstem) enclose about the
  // centroid of that part's vertices: positive = wound outwards.
  const volumes = (F: ArrayLike<number>) => {
    const c = [0, 1, 2].map(() => [0, 0, 0, 0])
    for (let v = 0; v < V; v++) if (mesh.surface[v]) { const k = c[mesh.kind[v]]; k[0] += P[v * 3]; k[1] += P[v * 3 + 1]; k[2] += P[v * 3 + 2]; k[3]++ }
    const vol = [0, 0, 0]
    for (let i = 0; i < F.length; i += 3) {
      const k = mesh.kind[F[i]], o = c[k]
      const p = [F[i], F[i + 1], F[i + 2]].map((v) => [P[v * 3] - o[0] / o[3], P[v * 3 + 1] - o[1] / o[3], P[v * 3 + 2] - o[2] / o[3]])
      vol[k] += p[0][0] * (p[1][1] * p[2][2] - p[1][2] * p[2][1]) + p[0][1] * (p[1][2] * p[2][0] - p[1][0] * p[2][2]) + p[0][2] * (p[1][0] * p[2][1] - p[1][1] * p[2][0])
    }
    return vol
  }

  const own = faces.subarray(0, mesh.faces.length) // the mesh's own triangles; the brainstem's doubles follow

  it('winds every part of the mesh outwards', () => {
    const vol = volumes(own)
    expect(vol[0]).toBeGreaterThan(0)
    expect(vol[1]).toBeGreaterThan(0)
    expect(vol[2]).toBeGreaterThan(0)
  })

  it('flips exactly the parts that were wound inwards, and only swaps two corners of their triangles', () => {
    const was = volumes(mesh.faces)
    // the case this exists for: not every part of the mesh comes wound the same way
    expect(was.some((v) => v < 0)).toBe(true)
    expect(was.some((v) => v > 0)).toBe(true)
    for (let i = 0; i < own.length; i += 3) {
      const flipped = was[mesh.kind[mesh.faces[i]]] < 0
      const want = flipped ? [mesh.faces[i], mesh.faces[i + 2], mesh.faces[i + 1]] : [mesh.faces[i], mesh.faces[i + 1], mesh.faces[i + 2]]
      if (own[i] !== want[0] || own[i + 1] !== want[1] || own[i + 2] !== want[2]) throw new Error(`triangle ${i / 3}`)
    }
  })

  it('keeps the open brainstem double-sided: its triangles again, wound the other way', () => {
    const stem: number[][] = []
    for (let i = 0; i < own.length; i += 3) if (mesh.kind[own[i]] === 2) stem.push([own[i], own[i + 1], own[i + 2]])
    expect(stem.length).toBeGreaterThan(0)
    const doubles = faces.subarray(mesh.faces.length)
    expect(doubles.length).toBe(stem.length * 3)
    stem.forEach((tri, n) => expect([doubles[n * 3], doubles[n * 3 + 1], doubles[n * 3 + 2]]).toEqual([tri[0], tri[2], tri[1]]))
    // and nothing else is doubled: the closed parts cull their far side
    expect(faces.length).toBe(mesh.faces.length + stem.length * 3)
  })

  it('returns 16-bit indices and leaves the mesh untouched', () => {
    expect(faces).toBeInstanceOf(Uint16Array)
    expect(Array.from(mesh.faces)).toEqual(Array.from(before))
    expect(outwardFaces(mesh)).not.toBe(faces)
  })
})

describe('fibre', () => {
  // a path through the lattice long enough to bend
  const seq = mesh.pathThroughInterior(0, 1200)!
  const point = (f: { points: Float32Array }, i: number) => [f.points[i * 3], f.points[i * 3 + 1], f.points[i * 3 + 2]]
  const vertex = (v: number) => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]

  it('has a path worth smoothing', () => {
    expect(seq.length).toBeGreaterThan(4)
  })

  it('passes through every vertex of the path, with the requested points per hop', () => {
    for (const sub of [3, 6]) {
      const f = fibre(P, seq, sub)
      expect(f.count).toBe((seq.length - 1) * sub + 1)
      expect(f.points.length).toBe(f.count * 3)
      for (let i = 0; i < seq.length; i++) {
        const got = point(f, i * sub), want = vertex(seq[i])
        for (let k = 0; k < 3; k++) expect(got[k]).toBeCloseTo(want[k], 5)
      }
    }
  })

  it('samples the same curve as three\'s centripetal CatmullRomCurve3', () => {
    const sub = 6
    const curve = new CatmullRomCurve3(seq.map((v) => new Vector3(P[v * 3], P[v * 3 + 1], P[v * 3 + 2])), false, 'centripetal')
    const want = curve.getPoints((seq.length - 1) * sub)
    const f = fibre(P, seq, sub)
    expect(f.count).toBe(want.length)
    let worst = 0
    for (let i = 0; i < f.count; i++) {
      const got = point(f, i)
      worst = Math.max(worst, Math.abs(got[0] - want[i].x), Math.abs(got[1] - want[i].y), Math.abs(got[2] - want[i].z))
    }
    expect(worst).toBeLessThan(1e-5)
  })

  it('normalises the arc from 0 to 1, never going backwards', () => {
    const f = fibre(P, seq, 6)
    expect(f.arc[0]).toBe(0)
    expect(f.arc[f.count - 1]).toBeCloseTo(1, 6)
    for (let i = 1; i < f.count; i++) expect(f.arc[i]).toBeGreaterThanOrEqual(f.arc[i - 1])
  })

  it('walks the path from its end when asked, without touching it', () => {
    const before = seq.slice()
    const forward = fibre(P, seq.slice().reverse(), 6), backward = fibre(P, seq, 6, true)
    expect(seq).toEqual(before)
    expect(Array.from(backward.points)).toEqual(Array.from(forward.points))
    expect(Array.from(backward.arc)).toEqual(Array.from(forward.arc))
    expect(point(backward, 0)).toEqual(vertex(seq[seq.length - 1]))
  })

  it('leaves short or unsubdivided paths as plain polylines', () => {
    const straight = fibre(P, [seq[0], seq[1]], 6)
    expect(straight.count).toBe(2)
    expect(point(straight, 0)).toEqual(vertex(seq[0]))
    expect(point(straight, 1)).toEqual(vertex(seq[1]))
    expect(Array.from(straight.arc)).toEqual([0, 1])

    const plain = fibre(P, seq, 1)
    expect(plain.count).toBe(seq.length)
    for (let i = 0; i < seq.length; i++) expect(point(plain, i)).toEqual(vertex(seq[i]))

    expect(fibre(P, [], 6).count).toBe(0)
    const single = fibre(P, [seq[0]], 6)
    expect(single.count).toBe(1)
    expect(Array.from(single.arc)).toEqual([0])
  })
})

describe('mulberry32', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = mulberry32(7), b = mulberry32(7), c = mulberry32(8)
    const seqA = Array.from({ length: 50 }, () => a()), seqB = Array.from({ length: 50 }, () => b()), seqC = Array.from({ length: 50 }, () => c())
    expect(seqA).toEqual(seqB)
    expect(seqA).not.toEqual(seqC)
    expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true)
  })
})

describe('buildBrainData — a node the model does not place', () => {
  it('skips relations and structure edges that touch it', () => {
    // a folder with no group is never placed (see assignVertices): its note still is
    const model: BrainGraphModel = {
      nodes: [
        brainNode({ id: 'f:lost', kind: 'folder' }),
        brainNode({ id: 'n:a', kind: 'note', noteId: 'a' }),
        brainNode({ id: 'n:b', kind: 'note', noteId: 'b' }),
      ],
      structureEdges: [{ source: 'f:lost', target: 'n:a' }],
      contentEdges: [{ source: 'n:a', target: 'n:b', score: 0.5 }, { source: 'f:lost', target: 'n:b', score: 0.9 }],
      relationEdges: [{ source: 'n:b', target: 'f:lost' }],
    }
    const data = buildBrainData(mesh, model)
    expect(data.placed.map((nd) => nd.id).sort()).toEqual(['n:a', 'n:b'])
    expect(data.structRaw).toEqual([])
    expect(data.byId.get('n:a')!.parent).toBe(-1)
    expect(data.edgePaths.map((e) => [e.source, e.target])).toEqual([['n:a', 'n:b']])
    expect(data.relatedOf.size).toBe(0)
  })
})
