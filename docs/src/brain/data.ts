// GENERATED — copied from src/components/Brain/brainData.ts by docs/scripts/build-brain.mjs.
// Do not edit here: change the app's module and run `npm run brain` in docs/.

// Everything the 3D brain draws that depends on the notes, as plain data (no three, no DOM): where
// each node sits, the structure routes with their arc lengths, the dendrites, the synapses and the
// routed path of every relation. BrainScene.tsx turns this into GPU buffers.

import type { BrainMesh, Vec3 } from './mesh'
import { assignVertices } from './assign'
import type { BrainGraphModel, BrainNodeKind } from './graph'

/** Node kinds as small integers, in hierarchy order (also the label priority). */
export const NODE_TIER: Record<BrainNodeKind, number> = { group: 0, folder: 1, note: 2, section: 3 }
export const TIER_GROUP = 0, TIER_FOLDER = 1, TIER_NOTE = 2, TIER_SECTION = 3

/** A graph node pinned to a vertex of the mesh. */
export interface PlacedNode {
  id: string
  index: number            // position in `BrainData.placed`
  kind: BrainNodeKind
  tier: number             // NODE_TIER[kind]
  label: string
  colorVar: string
  refId: string
  noteId?: string
  sectionId?: string
  groupId?: string
  centered: boolean
  noteNodeId: string | null  // `n:<noteId>` for note and section nodes: the key of their content relations
  parent: number             // index of the structural parent (group, folder or note), -1 if none
  v: number                  // mesh vertex
  x: number
  y: number
  z: number
}

/** One lattice hop of a structure route. `arcU`/`arcW` accumulate from the group, so a pulse can travel the whole branch. */
export interface RouteSegment { u: number; w: number; colorVar: string; arcU: number; arcW: number; count: number }
/** A note → section dendrite, continuing its note's arc. */
export interface DendriteSegment { u: number; w: number; colorVar: string; arcU: number; arcW: number }
/** One lattice hop of the synapse layer at rest; `content` = it belongs only to AI content relations. */
export interface SynapseSegment { u: number; w: number; content: boolean }
/** The routed path of one relation, from `source` to `target`. */
export interface EdgePath {
  source: string
  target: string
  seq: number[]      // mesh vertices; may be shared with the mesh's route cache — never mutate
  total: number      // length of the path (1 for a degenerate one)
  content: boolean   // true: AI content relation · false: explicit user relation
  score: number      // similarity; user relations count as 1
}

export interface BrainData {
  assignment: Map<string, number>
  placed: PlacedNode[]
  byId: Map<string, PlacedNode>
  structRaw: RouteSegment[]      // every hop of every route
  structDedup: RouteSegment[]    // one per lattice edge, with how many routes share it
  dend: DendriteSegment[]
  synSegs: SynapseSegment[]      // deduplicated per lattice edge
  edgePaths: EdgePath[]          // content relations first, then user relations
  contentOf: Map<string, number[]>   // note node id → indices into edgePaths (content relations only)
  relatedOf: Map<string, number[]>   // node id → placed indices linked to it by a user relation
  connected: string[]            // note node ids with at least one content relation
  core: Vec3                     // where the heartbeat starts
  coreId: string | null          // the node at the core, if there is one
}

/**
 * Lays the graph out on the mesh and derives everything the scene draws from it.
 *
 * Relations are routed in one congestion-aware batch (strongest first), so this calls
 * `mesh.routeContentEdges` exactly once: at ≈0.3 ms per relation it is the expensive part.
 */
export function buildBrainData(mesh: BrainMesh, model: BrainGraphModel): BrainData {
  const assignment = assignVertices(mesh, model)
  const P = mesh.positions, V = mesh.vertexCount
  const dist = (a: number, b: number) => Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2])
  const edgeKey = (u: number, w: number) => (u < w ? u * V + w : w * V + u)

  const placed: PlacedNode[] = [], byId = new Map<string, PlacedNode>()
  for (const nd of model.nodes) {
    const v = assignment.get(nd.id)
    if (v == null) continue
    const info: PlacedNode = {
      id: nd.id, index: placed.length, kind: nd.kind, tier: NODE_TIER[nd.kind], label: nd.label, colorVar: nd.colorVar,
      refId: nd.refId, noteId: nd.noteId, sectionId: nd.sectionId, groupId: nd.groupId, centered: nd.centered === true,
      noteNodeId: nd.noteId != null && (nd.kind === 'note' || nd.kind === 'section') ? `n:${nd.noteId}` : null,
      parent: -1, v, x: P[v * 3], y: P[v * 3 + 1], z: P[v * 3 + 2],
    }
    placed.push(info); byId.set(nd.id, info)
  }

  // ── Structure: group → folder → note routed along the lattice, sections as short direct
  // dendrites. Arc length accumulates from the group. Edges are taken parent tier by parent tier
  // (folders, then notes, then sections) so a child always finds its parent's arc, whatever order
  // the model lists them in. ──
  const arcAt = new Map<string, number>()
  const structRaw: RouteSegment[] = [], dend: DendriteSegment[] = []
  for (let tier = TIER_FOLDER; tier <= TIER_SECTION; tier++) {
    for (const e of model.structureEdges) {
      const src = byId.get(e.source), tgt = byId.get(e.target)
      if (!src || !tgt || tgt.tier !== tier) continue
      tgt.parent = src.index
      const a = src.v, b = tgt.v
      let arc = arcAt.get(e.source) ?? 0
      if (tier === TIER_SECTION) {
        dend.push({ u: a, w: b, colorVar: tgt.colorVar, arcU: arc, arcW: arc + dist(a, b) })
        continue
      }
      // pathBetween caches per unordered pair: the path may come back from either end
      const path = mesh.pathBetween(a, b)
      if (path && path.length >= 2) {
        const n = path.length, forward = path[0] === a
        for (let i = 0; i < n - 1; i++) {
          const u = forward ? path[i] : path[n - 1 - i], w = forward ? path[i + 1] : path[n - 2 - i]
          const len = dist(u, w)
          structRaw.push({ u, w, colorVar: tgt.colorVar, arcU: arc, arcW: arc + len, count: 1 })
          arc += len
        }
      } else {
        // unreachable over the lattice (it has a small stranded island): a straight line
        const len = dist(a, b)
        structRaw.push({ u: a, w: b, colorVar: tgt.colorVar, arcU: arc, arcW: arc + len, count: 1 })
        arc += len
      }
      arcAt.set(e.target, arc)
    }
  }
  const shared = new Map<number, RouteSegment>()
  for (const s of structRaw) {
    const k = edgeKey(s.u, s.w), first = shared.get(k)
    if (first) first.count++
    else shared.set(k, { ...s })
  }
  const structDedup = [...shared.values()]

  // ── Relations: AI content edges plus explicit user relations (which count as the strongest),
  // routed through the interior. ──
  interface Relation { source: string; target: string; score: number; content: boolean; a: number; b: number }
  const relations: Relation[] = []
  for (const e of model.contentEdges) {
    const a = assignment.get(e.source), b = assignment.get(e.target)
    if (a != null && b != null) relations.push({ source: e.source, target: e.target, score: e.score, content: true, a, b })
  }
  for (const e of model.relationEdges) {
    const a = assignment.get(e.source), b = assignment.get(e.target)
    if (a != null && b != null) relations.push({ source: e.source, target: e.target, score: 1, content: false, a, b })
  }
  const pairs: Array<readonly [number, number]> = relations
    .map((_, i) => i)
    .sort((x, y) => relations[y].score - relations[x].score)
    .map((i) => [relations[i].a, relations[i].b] as const)
  const routes = pairs.length ? mesh.routeContentEdges(pairs) : new Map<number, number[]>()
  const routeOf = (a: number, b: number): number[] => {
    let p = routes.get(edgeKey(a, b)) ?? mesh.pathThroughInterior(a, b)
    if (!p || p.length < 2) p = [a, b]
    return p[0] === a ? p : p.slice().reverse()
  }

  const edgePaths: EdgePath[] = [], contentOf = new Map<string, number[]>(), relatedOf = new Map<string, number[]>()
  const link = (map: Map<string, number[]>, id: string, value: number) => {
    const list = map.get(id)
    if (list) list.push(value); else map.set(id, [value])
  }
  for (const r of relations) {
    const seq = routeOf(r.a, r.b)
    let total = 0
    for (let i = 0; i < seq.length - 1; i++) total += dist(seq[i], seq[i + 1])
    const idx = edgePaths.length
    edgePaths.push({ source: r.source, target: r.target, seq, total: total || 1, content: r.content, score: r.score })
    if (r.content) { link(contentOf, r.source, idx); link(contentOf, r.target, idx) }
    else { link(relatedOf, r.source, byId.get(r.target)!.index); link(relatedOf, r.target, byId.get(r.source)!.index) }
  }

  // The resting synapse layer draws each lattice edge once. User relations claim their edges
  // first, so an edge a content relation shares with one stays visible when content is hidden.
  const synSegs: SynapseSegment[] = [], seen = new Set<number>()
  for (const content of [false, true]) {
    for (const e of edgePaths) {
      if (e.content !== content) continue
      for (let i = 0; i < e.seq.length - 1; i++) {
        const k = edgeKey(e.seq[i], e.seq[i + 1])
        if (seen.has(k)) continue
        seen.add(k); synSegs.push({ u: e.seq[i], w: e.seq[i + 1], content })
      }
    }
  }

  // The heartbeat leaves from the AI profile group at the core (or its first note); a vault
  // without one beats from the core of the mesh.
  let coreNode = placed.find((nd) => nd.tier === TIER_GROUP && nd.centered)
  if (!coreNode) {
    const group = model.nodes.find((nd) => nd.kind === 'group' && nd.centered)
    if (group) coreNode = placed.find((nd) => nd.tier === TIER_NOTE && nd.groupId === group.id)
  }
  const core: Vec3 = coreNode ? [coreNode.x, coreNode.y, coreNode.z] : [mesh.center[0], mesh.center[1], mesh.center[2]]

  return {
    assignment, placed, byId, structRaw, structDedup, dend, synSegs, edgePaths, contentOf, relatedOf,
    connected: [...contentOf.keys()], core, coreId: coreNode ? coreNode.id : null,
  }
}

/** Indices of the `limit` strongest relations (stable: user relations, at score 1, come first). */
export function strongestEdges(edgePaths: EdgePath[], limit: number): number[] {
  return edgePaths
    .map((_, i) => i)
    .sort((x, y) => edgePaths[y].score - edgePaths[x].score)
    .slice(0, Math.max(0, limit))
}

/**
 * Marks in `out` (one byte per placed node) what stays lit while `node` is focused; everything
 * else dims. A group lights its members, a folder its notes and their sections, a note or a
 * section the whole note; plus whatever a user relation links to it and — when `includeContent` —
 * the notes its content relations reach.
 */
export function focusMask(data: BrainData, node: PlacedNode | null | undefined, includeContent: boolean, out: Uint8Array): Uint8Array {
  out.fill(0)
  if (!node) return out
  const placed = data.placed
  out[node.index] = 1
  if (node.tier === TIER_GROUP) {
    for (const nd of placed) if (nd.groupId === node.id) out[nd.index] = 1
  } else if (node.tier === TIER_FOLDER) {
    for (const nd of placed) {
      const p = nd.parent
      if (p === node.index || (p >= 0 && placed[p].parent === node.index)) out[nd.index] = 1
    }
  } else if (node.noteId != null) {
    for (const nd of placed) if (nd.noteId === node.noteId) out[nd.index] = 1
  }
  const related = data.relatedOf.get(node.id)
  if (related) for (const i of related) out[i] = 1
  const edges = includeContent && node.noteNodeId ? data.contentOf.get(node.noteNodeId) : undefined
  if (edges) {
    for (const ei of edges) {
      const e = data.edgePaths[ei]
      const s = data.byId.get(e.source), t = data.byId.get(e.target)
      if (s) out[s.index] = 1
      if (t) out[t.index] = 1
    }
  }
  return out
}

/**
 * Entrance coordinate per vertex: 0 at the core of the mesh, growing outwards to 0.7. The brain
 * switches on from the inside out. It depends on the mesh alone, so the static scaffold can use it.
 */
export function entranceCoords(mesh: BrainMesh): Float32Array {
  const P = mesh.positions, V = mesh.vertexCount, [cx, cy, cz] = mesh.center
  const rev = new Float32Array(V)
  let max = 0
  for (let v = 0; v < V; v++) {
    rev[v] = Math.hypot(P[v * 3] - cx, P[v * 3 + 1] - cy, P[v * 3 + 2] - cz)
    if (rev[v] > max) max = rev[v]
  }
  if (max > 0) for (let v = 0; v < V; v++) rev[v] = (rev[v] / max) * 0.7
  return rev
}

/**
 * The mesh's faces, all wound outwards, as an index buffer for a single-sided depth skin.
 *
 * brainMesh winds the cerebrum's faces outwards but the cerebellum's and the brainstem's inwards
 * (harmless while the skin was drawn double-sided). Drawing front faces only needs them
 * consistent, or those two parts would write the depth of their far wall and stop hiding what is
 * behind them. Each part (`mesh.kind`) is judged on its own: if the signed volume its triangles
 * enclose about the centroid of its vertices is negative, they are flipped. The mesh itself is
 * left alone — its face order is part of a tested contract.
 *
 * The brainstem is a tube open at both ends, so from below one looks at the inside of its wall,
 * which a single-sided skin would not draw. Its (few) triangles are therefore appended a second
 * time wound the other way: that part stays double-sided, as it was.
 */
export function outwardFaces(mesh: BrainMesh): Uint16Array | Uint32Array {
  const P = mesh.positions, F = mesh.faces, V = mesh.vertexCount
  const STEM = 2
  let stemCorners = 0
  for (let i = 0; i < F.length; i += 3) if (mesh.kind[F[i]] === STEM) stemCorners += 3
  // 0xFFFF is the primitive-restart index in WebGL2, so 16 bits only up to 65534 vertices
  const out = V < 65535 ? new Uint16Array(F.length + stemCorners) : new Uint32Array(F.length + stemCorners)
  out.set(F)
  const parts = 3
  const cx = new Float64Array(parts), cy = new Float64Array(parts), cz = new Float64Array(parts), n = new Float64Array(parts)
  for (let v = 0; v < V; v++) {
    if (!mesh.surface[v]) continue
    const k = mesh.kind[v]
    cx[k] += P[v * 3]; cy[k] += P[v * 3 + 1]; cz[k] += P[v * 3 + 2]; n[k]++
  }
  for (let k = 0; k < parts; k++) if (n[k]) { cx[k] /= n[k]; cy[k] /= n[k]; cz[k] /= n[k] }
  const volume = new Float64Array(parts)
  for (let i = 0; i < F.length; i += 3) {
    const k = mesh.kind[F[i]], a = F[i] * 3, b = F[i + 1] * 3, c = F[i + 2] * 3
    const ax = P[a] - cx[k], ay = P[a + 1] - cy[k], az = P[a + 2] - cz[k]
    const bx = P[b] - cx[k], by = P[b + 1] - cy[k], bz = P[b + 2] - cz[k]
    const dx = P[c] - cx[k], dy = P[c + 1] - cy[k], dz = P[c + 2] - cz[k]
    volume[k] += ax * (by * dz - bz * dy) + ay * (bz * dx - bx * dz) + az * (bx * dy - by * dx)
  }
  let extra = F.length
  for (let i = 0; i < F.length; i += 3) {
    const k = mesh.kind[F[i]]
    if (volume[k] < 0) { out[i + 1] = F[i + 2]; out[i + 2] = F[i + 1] }
    if (k === STEM) { out[extra] = out[i]; out[extra + 1] = out[i + 2]; out[extra + 2] = out[i + 1]; extra += 3 }
  }
  return out
}

export interface Fibre {
  count: number          // points
  points: Float32Array   // xyz per point
  arc: Float32Array      // arc length per point, normalised to 0..1
}

/**
 * A relation routed vertex to vertex reads as a zig-zag; this draws it as a smooth fibre through
 * the same vertices: a centripetal Catmull-Rom spline with `subdiv` points per hop (uniform in the
 * curve parameter within each hop — the same sampling as three's `CatmullRomCurve3.getPoints`, in
 * plain arithmetic so this module stays free of three). `reverse` walks `seq` from its end without
 * copying it. With `subdiv` ≤ 1, or fewer than three vertices, the result is the plain polyline.
 */
export function fibre(positions: Float32Array, seq: ArrayLike<number>, subdiv: number, reverse = false): Fibre {
  const n = seq.length
  if (n === 0) return { count: 0, points: new Float32Array(0), arc: new Float32Array(0) }
  const at = (i: number) => (reverse ? seq[n - 1 - i] : seq[i]) * 3
  const sub = n > 2 && subdiv > 1 ? Math.floor(subdiv) : 1
  const count = (n - 1) * sub + 1
  const points = new Float32Array(count * 3), arc = new Float32Array(count)

  if (sub === 1) {
    for (let i = 0; i < n; i++) { const o = at(i); points[i * 3] = positions[o]; points[i * 3 + 1] = positions[o + 1]; points[i * 3 + 2] = positions[o + 2] }
  } else {
    const p = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] // the four control points of the current hop
    const load = (slot: number, i: number) => { const o = at(i); p[slot] = positions[o]; p[slot + 1] = positions[o + 1]; p[slot + 2] = positions[o + 2] }
    // the neighbour a curve end lacks is mirrored through that end
    const mirror = (slot: number, end: number, inner: number) => {
      const e = at(end), q = at(inner)
      for (let k = 0; k < 3; k++) p[slot + k] = 2 * positions[e + k] - positions[q + k]
    }
    const gap = (i: number, j: number) => Math.pow((p[i] - p[j]) ** 2 + (p[i + 1] - p[j + 1]) ** 2 + (p[i + 2] - p[j + 2]) ** 2, 0.25)
    let w = 0
    for (let i = 0; i < n - 1; i++) {
      if (i > 0) load(0, i - 1); else mirror(0, 0, 1)
      load(3, i); load(6, i + 1)
      if (i + 2 < n) load(9, i + 2); else mirror(9, n - 1, n - 2)
      let dt0 = gap(0, 3), dt1 = gap(3, 6), dt2 = gap(6, 9)
      if (dt1 < 1e-4) dt1 = 1 // repeated points
      if (dt0 < 1e-4) dt0 = dt1
      if (dt2 < 1e-4) dt2 = dt1
      for (let s = 0; s < sub; s++) {
        const t = s / sub, t2 = t * t, t3 = t2 * t
        for (let k = 0; k < 3; k++) {
          const x0 = p[k], x1 = p[3 + k], x2 = p[6 + k], x3 = p[9 + k]
          // tangents of the non-uniform spline, rescaled to the hop's own 0..1 parameter
          const m1 = ((x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1) * dt1
          const m2 = ((x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2) * dt1
          points[w * 3 + k] = x1 + m1 * t + (-3 * x1 + 3 * x2 - 2 * m1 - m2) * t2 + (2 * x1 - 2 * x2 + m1 + m2) * t3
        }
        w++
      }
    }
    const o = at(n - 1)
    points[w * 3] = positions[o]; points[w * 3 + 1] = positions[o + 1]; points[w * 3 + 2] = positions[o + 2]
  }

  for (let i = 1; i < count; i++) {
    arc[i] = arc[i - 1] + Math.hypot(points[i * 3] - points[i * 3 - 3], points[i * 3 + 1] - points[i * 3 - 2], points[i * 3 + 2] - points[i * 3 - 1])
  }
  const total = arc[count - 1] || 1
  for (let i = 0; i < count; i++) arc[i] /= total
  return { count, points, arc }
}
