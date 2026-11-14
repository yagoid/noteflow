import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { buildBrainMesh, getBrainMesh, REGIONS, REGION_CODE } from '../../src/components/Brain/brainMesh'
import { BRAIN_MESH_REF as REF } from '../helpers/brainMeshRef'

// One mesh for the whole file. Tests that need empty route caches build their own.
const mesh = buildBrainMesh()
const V = mesh.vertexCount
const E = mesh.edges.length / 2

const count = (values: ArrayLike<number>, pred: (v: number) => boolean) => {
  let n = 0
  for (let i = 0; i < values.length; i++) if (pred(values[i])) n++
  return n
}
const adjacent = (a: number, b: number) => mesh.adjacency[a].includes(b)
const isWalk = (path: number[]) => path.every((v, i) => i === 0 || adjacent(path[i - 1], v))
const pairKey = (a: number, b: number) => Math.min(a, b) * V + Math.max(a, b)
const ends = (path: number[]) => [path[0], path[path.length - 1]].sort((x, y) => x - y)
const cortex: number[] = []
for (let v = 0; v < V; v++) if (mesh.cortex[v]) cortex.push(v)
// cortex landmarks: the vertices farthest to each side (opposite hemispheres) and farthest back
const extreme = (axis: number, sign: number) =>
  cortex.reduce((best, v) => (sign * mesh.positions[v * 3 + axis] > sign * mesh.positions[best * 3 + axis] ? v : best), cortex[0])
const leftmost = extreme(0, -1), rightmost = extreme(0, 1), backmost = extreme(2, -1)
// the vertices the lattice cannot reach from vertex 0
const stranded: number[] = []
{
  const seen = new Uint8Array(V)
  const queue = [0]
  seen[0] = 1
  for (let h = 0; h < queue.length; h++) for (const nb of mesh.adjacency[queue[h]]) if (!seen[nb]) { seen[nb] = 1; queue.push(nb) }
  for (let v = 0; v < V; v++) if (!seen[v]) stranded.push(v)
}

describe('buildBrainMesh — the approved shape', () => {
  it('has exactly the reference counts', () => {
    expect(V).toBe(REF.vertexCount)
    expect(E).toBe(REF.edges)
    expect(mesh.faces.length / 3).toBe(REF.faces)
    expect(mesh.interiorVertices.length).toBe(REF.interior)
    expect(cortex.length).toBe(REF.cortex)
    expect([0, 1, 2].map((k) => count(mesh.kind, (v) => v === k))).toEqual(REF.kind)
    expect(REGIONS.map((r) => mesh.verticesByRegion[r].length)).toEqual(REF.regions)
    expect(count(mesh.edgeW, (w) => w > 0)).toBe(REF.visibleEdges)
    expect(count(mesh.edgeW, (w) => w >= 0.6)).toBe(REF.outlineEdges)
    expect(mesh.center).toEqual(REF.center)
  })

  it('sizes every per-vertex and per-edge array consistently', () => {
    expect(mesh.positions.length).toBe(V * 3)
    for (const arr of [mesh.regionOf, mesh.vertW, mesh.cortex, mesh.kind, mesh.surface]) expect(arr.length).toBe(V)
    expect(mesh.adjacency.length).toBe(V)
    expect(mesh.edgeW.length).toBe(E)
    expect(mesh.faces.length % 3).toBe(0)
  })

  it('reproduces the reference vertices, edges and weights', () => {
    const offPosition = REF.firstPositions.filter((want, i) => Math.abs(mesh.positions[i] - want) > 1e-5)
    expect(offPosition).toEqual([])
    expect(Array.from(mesh.edges.slice(0, REF.firstEdges.length))).toEqual(REF.firstEdges)
    const offWeight = REF.firstEdgeW.filter((want, i) => Math.abs(mesh.edgeW[i] - want) > 1e-4)
    expect(offWeight).toEqual([])
  })

  // The whole mesh, bit for bit: a checksum of every array against the prototype's.
  //
  // If this ever fails with the mesh code untouched, look at the engine before the test: the shape
  // is built with Math.sin / cos / exp / pow / hypot / cbrt, and a JavaScript engine is free to
  // change the last bit of any of them. In that case do NOT just paste in the new hashes. Dump the
  // arrays from the last version that passed into a fixture and compare against it with a
  // tolerance (positions and weights to ~1e-6; edges, faces, cortex, kind and regionOf must still
  // match exactly — a flipped classification or a reordered edge is a real change, not rounding),
  // and only then decide whether the hashes may move.
  it('matches the reference checksum of every array, whole', () => {
    const sha = (ta: ArrayBufferView) => createHash('sha1').update(new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength)).digest('hex')
    const got: Record<string, string> = {}
    for (const key of Object.keys(REF.sha) as Array<keyof typeof REF.sha>) got[key] = sha(mesh[key])
    expect(got).toEqual(REF.sha)
    // and what each array is: the hashes are of these exact types' bytes
    expect(mesh.positions).toBeInstanceOf(Float32Array)
    expect(mesh.edges).toBeInstanceOf(Uint32Array)
    expect(mesh.faces).toBeInstanceOf(Uint32Array)
    expect(mesh.edgeW).toBeInstanceOf(Float32Array)
    expect(mesh.vertW).toBeInstanceOf(Float32Array)
  })

  it('is deterministic: two builds are identical', () => {
    const other = buildBrainMesh()
    for (const key of ['positions', 'edges', 'faces', 'regionOf', 'edgeW', 'vertW', 'cortex', 'kind', 'surface'] as const) {
      expect(other[key], key).toEqual(mesh[key])
    }
    expect(other.interiorVertices).toEqual(mesh.interiorVertices)
    expect(other.adjacency).toEqual(mesh.adjacency)
    expect(other.boundCenter).toEqual(mesh.boundCenter)
    expect(other.boundRadius).toBe(mesh.boundRadius)
  })

  it('getBrainMesh returns one shared instance', () => {
    const shared = getBrainMesh()
    expect(getBrainMesh()).toBe(shared)
    expect(shared.vertexCount).toBe(REF.vertexCount)
  })
})

describe('buildBrainMesh — invariants', () => {
  it('edges join two valid, distinct vertices and never repeat', () => {
    const seen = new Set<number>(), bad: number[] = []
    for (let e = 0; e < E; e++) {
      const a = mesh.edges[e * 2], b = mesh.edges[e * 2 + 1]
      if (!(a < b && b < V)) bad.push(e)
      seen.add(a * V + b)
    }
    expect(bad).toEqual([])
    expect(seen.size).toBe(E)
  })

  it('adjacency mirrors the edge list, in both directions', () => {
    let degree = 0
    const oneWay: number[] = [], missing: number[] = []
    for (let v = 0; v < V; v++) {
      degree += mesh.adjacency[v].length
      for (const nb of mesh.adjacency[v]) if (!adjacent(nb, v)) oneWay.push(v)
    }
    for (let e = 0; e < E; e++) if (!adjacent(mesh.edges[e * 2], mesh.edges[e * 2 + 1])) missing.push(e)
    expect(oneWay).toEqual([])
    expect(missing).toEqual([])
    expect(degree).toBe(E * 2)
  })

  it('is one connected lattice, bar a stranded island deep in the occipital pole', () => {
    // The approved mesh has seven interior points wired only to each other. The whole surface
    // (everywhere a node sits by rule) and the rest of the interior are one component.
    expect(stranded).toEqual([2904, 2923, 3013, 3256, 3583, 3584, 3950])
    expect(stranded.filter((v) => mesh.surface[v] === 1)).toEqual([])
  })

  it('stitches cerebrum, cerebellum and stem with hidden seams only', () => {
    // an edge has weight 0 exactly when it crosses from one part to another
    const wrong: number[] = []
    for (let e = 0; e < E; e++) {
      const crosses = mesh.kind[mesh.edges[e * 2]] !== mesh.kind[mesh.edges[e * 2 + 1]]
      if (crosses !== (mesh.edgeW[e] === 0)) wrong.push(e)
    }
    expect(wrong).toEqual([])
    expect(count(mesh.edgeW, (w) => w === 0)).toBe(REF.edges - REF.visibleEdges)
  })

  it('labels every vertex consistently', () => {
    const interior = new Set(mesh.interiorVertices)
    const regionSets = REGIONS.map((r) => new Set(mesh.verticesByRegion[r]))
    const bad: number[] = []
    for (let v = 0; v < V; v++) {
      const region = mesh.regionOf[v]
      const kind = region === REGION_CODE.cerebellum ? 1 : region === REGION_CODE.stem ? 2 : 0
      const ok = mesh.surface[v] === (interior.has(v) ? 0 : 1)
        && mesh.kind[v] === kind
        && regionSets[region].has(v)
        && (kind === 0 || mesh.surface[v] === 1)
        && mesh.vertW[v] > 0
      if (!ok) bad.push(v)
    }
    expect(bad).toEqual([])
  })

  it('wires every interior vertex into the lattice', () => {
    expect(mesh.interiorVertices.filter((v) => mesh.adjacency[v].length === 0)).toEqual([])
  })

  it('keeps the cortex on the cerebral surface', () => {
    expect(cortex.filter((v) => mesh.kind[v] !== 0 || mesh.surface[v] !== 1)).toEqual([])
  })

  it('draws every triangle of the skin with surface vertices and lattice edges', () => {
    const bad: number[] = []
    for (let f = 0; f < mesh.faces.length; f += 3) {
      const a = mesh.faces[f], b = mesh.faces[f + 1], c = mesh.faces[f + 2]
      const ok = mesh.surface[a] && mesh.surface[b] && mesh.surface[c] && adjacent(a, b) && adjacent(b, c) && adjacent(c, a)
      if (!ok) bad.push(f / 3)
    }
    expect(bad).toEqual([])
  })

  it('bounds the cerebral surface with its sphere', () => {
    const [cx, cy, cz] = mesh.boundCenter
    let sx = 0, sy = 0, sz = 0, n = 0, far = 0
    for (let v = 0; v < V; v++) {
      if (mesh.kind[v] !== 0 || !mesh.surface[v]) continue
      const x = mesh.positions[v * 3], y = mesh.positions[v * 3 + 1], z = mesh.positions[v * 3 + 2]
      sx += x; sy += y; sz += z; n++
      far = Math.max(far, Math.hypot(x - cx, y - cy, z - cz))
    }
    expect(cx).toBeCloseTo(sx / n, 10)
    expect(cy).toBeCloseTo(sy / n, 10)
    expect(cz).toBeCloseTo(sz / n, 10)
    expect(mesh.boundRadius).toBeCloseTo(far, 10)
  })
})

describe('buildBrainMesh — routing', () => {
  it('finds the reference routes', () => {
    const fresh = buildBrainMesh() // empty caches: each search runs in the reference direction
    const between = REF.path.between, interior = REF.path.interior
    expect(fresh.pathBetween(between[0], between[between.length - 1])).toEqual(between)
    expect(fresh.pathThroughInterior(interior[0], interior[interior.length - 1])).toEqual(interior)
  })

  it('caches a route per unordered pair', () => {
    const path = mesh.pathBetween(leftmost, rightmost)
    expect(mesh.pathBetween(leftmost, rightmost)).toBe(path)
    expect(mesh.pathBetween(rightmost, leftmost)).toBe(path)
    expect(mesh.pathBetween(leftmost, leftmost)).toEqual([leftmost])
  })

  it('routes along lattice edges, diving through the interior when asked to', () => {
    // from the side of the brain to its back: the short way hugs the surface
    const along = mesh.pathBetween(rightmost, backmost)!, deep = mesh.pathThroughInterior(rightmost, backmost)!
    for (const path of [along, deep]) {
      expect(ends(path)).toEqual(ends([rightmost, backmost]))
      expect(isWalk(path)).toBe(true)
    }
    const inside = (path: number[]) => count(path, (v) => mesh.surface[v] === 0)
    expect(inside(along)).toBe(0)
    expect(inside(deep)).toBeGreaterThan(0)
  })

  it('returns null between vertices the lattice does not connect', () => {
    expect(mesh.pathBetween(leftmost, stranded[0])).toBeNull()
    expect(mesh.pathThroughInterior(stranded[0], leftmost)).toBeNull()
  })

  it('routes a whole batch of content edges, each from end to end', () => {
    const pairs: Array<[number, number]> = []
    for (let i = 0; i < 40; i++) pairs.push([cortex[(i * 37) % cortex.length], cortex[(i * 211 + 600) % cortex.length]])
    pairs.push([pairs[0][1], pairs[0][0]]) // the first relation again, reversed: routed once
    const routes = mesh.routeContentEdges(pairs)
    expect(routes.size).toBe(40)
    for (const [a, b] of pairs) {
      const route = routes.get(pairKey(a, b))!
      expect(ends(route)).toEqual(ends([a, b]))
      expect(isWalk(route)).toBe(true)
    }
    // the same batch gives the same routes — remembered here, routed afresh on another mesh
    expect(mesh.routeContentEdges(pairs)).toEqual(routes)
    expect(buildBrainMesh().routeContentEdges(pairs)).toEqual(routes)
    // and a different batch is not answered from memory
    expect(mesh.routeContentEdges(pairs.slice(0, 5)).size).toBe(5)
  })

  it('fans a second relation out instead of stacking it on the first', () => {
    // two relations between neighbouring vertices at both ends: on its own, the second one
    // would take much the same corridor as the first
    const a2 = mesh.adjacency[leftmost].find((v) => mesh.cortex[v])!, b2 = mesh.adjacency[rightmost].find((v) => mesh.cortex[v])!
    const routes = mesh.routeContentEdges([[leftmost, rightmost], [a2, b2]])
    const first = routes.get(pairKey(leftmost, rightmost))!, second = routes.get(pairKey(a2, b2))!
    const alone = buildBrainMesh().routeContentEdges([[a2, b2]]).get(pairKey(a2, b2))!
    const sharedEdges = (p: number[], q: number[]) => {
      const keys = new Set<number>()
      for (let i = 1; i < q.length; i++) keys.add(pairKey(q[i - 1], q[i]))
      let n = 0
      for (let i = 1; i < p.length; i++) if (keys.has(pairKey(p[i - 1], p[i]))) n++
      return n
    }
    expect(sharedEdges(alone, first)).toBeGreaterThan(0)
    expect(sharedEdges(second, first)).toBeLessThan(sharedEdges(alone, first))
  })
})
