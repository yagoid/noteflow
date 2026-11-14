// GENERATED — copied from src/components/Brain/assignVertices.ts by docs/scripts/build-brain.mjs.
// Do not edit here: change the app's module and run `npm run brain` in docs/.

// Vertex occupation: pins each graph node (group / folder / note / section) onto a free vertex of
// the brain mesh, deterministically, so opening the brain always lays notes out the same way.
//
// Cortex-first: notes live on the cortex (the surface) and relations travel through the interior.
//  · Groups are seeded by farthest-point sampling over the whole cortex, so territories spread
//    across both hemispheres. The first one sits front-lateral, where the opening 3/4 view looks.
//  · Each folder gets a patch of its own next to its group, as far as it can from its siblings.
//  · Notes cluster around their parent (group or folder), keeping a little air between them: no
//    two on adjacent vertices while there is room close by.
//  · Loose notes fill the gaps (farthest point again); loose favourites keep the cerebellum.
//  · The `centered` group (the AI profile) takes the interior vertex nearest the core, and its
//    notes stay inside.
//  · Sections (dendrites) sit on a free mesh-neighbour of their note.
//
// Staying together comes first. A note looks for its spot walking outward from its parent ALONG
// THE SKIN of the brain — never cutting through the interior lattice, whose long links would land
// it on the far side — and takes the first of: a gyrus with air around it, close by; any gyrus
// in its group's territory; the nearest free spot on the skin, gyrus or not; anything at all. So
// a big group grows as one patch, and a vault with more nodes than the cortex has vertices packs
// each group around its anchor instead of scattering its notes or dropping them.
// Output: Map<nodeId, vertexIndex>.

import type { BrainMesh } from './mesh'
import type { BrainGraphModel } from './graph'

const PATCH_REACH = 0.42 // how far from its group a folder's patch may start
const PATCH_HOPS = 9
// How far from its parent a note may go for the sake of air; past that, a spot right next to its
// siblings beats an airy one across the brain. Measured: in the layouts this was designed on (up
// to ~10 notes per parent) no note sits farther than 0.20 from its parent, and a search with no
// limit at all picks the very same spots until its first pick beyond 0.45 — the point where it
// starts leaping. Within 0.45 a parent of 20 notes still gets air for 94% of them (37% within
// 0.30), and it is just past the folder patch.
const AIR_REACH = 0.45
// A section with no free gyrus next to its note may take one a few steps along the skin, or
// failing that any spot within those steps (in those same layouts sections stay within 0.2 of
// their note: about three steps). Beyond that it takes the nearest vertex of any kind.
const SECTION_HOPS = 3

export function assignVertices(mesh: BrainMesh, model: BrainGraphModel): Map<string, number> {
  const V = mesh.vertexCount, pos = mesh.positions, adjacency = mesh.adjacency
  const assignment = new Map<string, number>()
  const free = new Uint8Array(V).fill(1)
  const d2 = (a: number, b: number) =>
    (pos[a * 3] - pos[b * 3]) ** 2 + (pos[a * 3 + 1] - pos[b * 3 + 1]) ** 2 + (pos[a * 3 + 2] - pos[b * 3 + 2]) ** 2
  // cortex = the gyri, where notes live · cereb = the cerebellum
  const cortex: number[] = [], cereb: number[] = []
  for (let v = 0; v < V; v++) {
    if (mesh.cortex[v]) cortex.push(v)
    else if (mesh.kind[v] === 1) cereb.push(v)
  }
  const claim = (id: string, v: number) => { assignment.set(id, v); free[v] = 0 }

  // The free vertex of `pool` farthest from every vertex in `from`.
  const farthest = (pool: number[], from: number[]): number => {
    let best = -1, bestD = -1
    for (const v of pool) {
      if (!free[v]) continue
      let nd = Infinity
      for (const c of from) { const q = d2(v, c); if (q < nd) nd = q }
      if (nd > bestD) { bestD = nd; best = v }
    }
    return best
  }
  // The same pick for a set that keeps growing: per pool vertex, the squared distance to the
  // nearest point fed so far, so a pick is one pass instead of |pool| × |from| distances.
  const makeSpread = (pool: number[]) => {
    const near = new Float64Array(pool.length).fill(Infinity)
    return {
      feed: (c: number) => {
        for (let i = 0; i < pool.length; i++) { const q = d2(pool[i], c); if (q < near[i]) near[i] = q }
      },
      pick: (): number => {
        let best = -1, bestD = -1
        for (let i = 0; i < pool.length; i++) if (free[pool[i]] && near[i] > bestD) { bestD = near[i]; best = pool[i] }
        return best
      },
    }
  }

  const isCortex = (v: number) => mesh.cortex[v] === 1
  const isCereb = (v: number) => mesh.kind[v] === 1
  const isInterior = (v: number) => mesh.surface[v] === 0
  // the outside of the cerebrum: gyri, sulci, the fissure, the underside
  const onSkin = (v: number) => mesh.kind[v] === 0 && mesh.surface[v] === 1
  const anyFree = () => true
  // notes of one parent keep a little air between them: no two on adjacent vertices
  const spaced = (v: number) => {
    for (const nb of adjacency[v]) if (!free[nb] && mesh.cortex[nb]) return false
    return true
  }
  // front-lateral on one side, so the opening 3/4 view shows a group
  const frontLateral = (c: number) => pos[c * 3] * 0.62 + (pos[c * 3 + 1] - 0.3) * 0.35 + pos[c * 3 + 2] * 0.6

  // Breadth-first from `start` — over the whole lattice, or only along the skin: the first free
  // vertex that passes `accept` (and `visit`, which may simply inspect it and return false to
  // keep going), or -1. The visited marks are generation stamps, so a search allocates nothing.
  const seenAt = new Int32Array(V), depth = new Int16Array(V), queue = new Int32Array(V)
  let stamp = 0
  const bfs = (start: number, alongSkin: boolean, accept: (v: number) => boolean, maxDepth = 0, visit?: (v: number) => boolean): number => {
    stamp++
    let tail = 0
    queue[tail++] = start; seenAt[start] = stamp; depth[start] = 0
    for (let h = 0; h < tail; h++) {
      const cur = queue[h]
      if (cur !== start && free[cur] && accept(cur) && (!visit || visit(cur))) return cur
      if (maxDepth && depth[cur] >= maxDepth) continue
      const nbs = adjacency[cur]
      for (let i = 0; i < nbs.length; i++) {
        const nb = nbs[i]
        if (seenAt[nb] !== stamp && (!alongSkin || onSkin(nb))) { seenAt[nb] = stamp; depth[nb] = depth[cur] + 1; queue[tail++] = nb }
      }
    }
    return -1
  }
  // Every vertex the same walk reaches, in visiting order (the start left out).
  const orderFrom = (start: number, alongSkin: boolean): Int32Array => {
    stamp++
    let tail = 0
    queue[tail++] = start; seenAt[start] = stamp
    for (let h = 0; h < tail; h++) {
      const nbs = adjacency[queue[h]]
      for (let i = 0; i < nbs.length; i++) {
        const nb = nbs[i]
        if (seenAt[nb] !== stamp && (!alongSkin || onSkin(nb))) { seenAt[nb] = stamp; queue[tail++] = nb }
      }
    }
    return queue.slice(1, tail)
  }

  // A group's territory: its half of the gap to the nearest group. Groups are seeded by
  // farthest-point sampling, so the gap they end up with follows from how many there are (1.27
  // between 5 groups, 0.83 between 10, 0.66 between 12, 0.51 between 20) and is known before any
  // is placed: run the same sampling over the empty cortex and keep the last, shortest, distance.
  let territory = Infinity
  {
    let groups = 0
    for (const node of model.nodes) if (node.kind === 'group' && !node.centered) groups++
    if (groups > 1 && cortex.length) {
      const near = new Float64Array(cortex.length).fill(Infinity)
      let seed = cortex[0], score = -Infinity, gap2 = 0
      for (const c of cortex) { const s = frontLateral(c); if (s > score) { score = s; seed = c } }
      for (let k = 1; k < groups; k++) {
        let next = seed
        gap2 = -1
        for (let i = 0; i < cortex.length; i++) {
          const q = d2(cortex[i], seed)
          if (q < near[i]) near[i] = q
          if (near[i] > gap2) { gap2 = near[i]; next = cortex[i] }
        }
        seed = next
      }
      territory = Math.sqrt(gap2) / 2
    }
  }
  const air2 = Math.min(AIR_REACH, territory) ** 2      // a gyrus with air: close by, and on the group's side
  const home2 = territory ** 2                          // any gyrus: anywhere in the territory
  const patch2 = Math.min(PATCH_REACH, territory) ** 2  // where a folder's patch may start

  // The spot for something that belongs around `anchor`, in order of preference. Everything that
  // gathers around one anchor runs the same search from it, and the lattice never changes, so the
  // visiting order is walked once and kept; and because vertices only ever get taken (one that
  // fails a test fails it for good), every test keeps a cursor into that order instead of
  // starting over. Same result as a fresh search each time, at a fraction of the cost.
  const AIRY = 0, GYRUS = 1, SKIN = 2, INSIDE = 3, ANY = 4
  interface Walk { skin: Int32Array | null; lattice: Int32Array | null; at: number[] }
  const walks = new Map<number, Walk>()
  const pick = (anchor: number, test: number): number => {
    let w = walks.get(anchor)
    if (!w) { w = { skin: null, lattice: null, at: [0, 0, 0, 0, 0] }; walks.set(anchor, w) }
    const order = test <= SKIN ? (w.skin ??= orderFrom(anchor, true)) : (w.lattice ??= orderFrom(anchor, false))
    let i = w.at[test]
    for (; i < order.length; i++) {
      const v = order[i]
      if (!free[v]) continue
      if (test === AIRY ? isCortex(v) && d2(v, anchor) <= air2 && spaced(v)
        : test === GYRUS ? isCortex(v) && d2(v, anchor) <= home2
        : test === INSIDE ? isInterior(v)
        : true) break
    }
    w.at[test] = i
    return i < order.length ? order[i] : -1
  }
  const spotNear = (anchor: number, withAir: boolean): number => {
    let v = withAir ? pick(anchor, AIRY) : -1
    if (v < 0) v = pick(anchor, GYRUS)
    if (v < 0) v = pick(anchor, SKIN)
    return v < 0 ? pick(anchor, ANY) : v
  }

  const parentOf = new Map<string, string>()
  for (const e of model.structureEdges) parentOf.set(e.target, e.source)
  const anchorOf = new Map<string, number>()
  const centered = new Set<string>()
  const siblings = new Map<string, number[]>() // group id → anchors already used by the group and its folders
  // Spread anchors: group seeds, loose notes scattered over the cortex, loose favourites.
  const seeds: number[] = [], scattered: number[] = [], favs: number[] = []
  const fromSeeds = makeSpread(cortex)   // cortex ↔ seeds: where the next group goes
  const fromSpread = makeSpread(cortex)  // cortex ↔ seeds + scattered: where the next loose note goes
  const fromFavs = makeSpread(cereb)     // cerebellum ↔ favourites
  let fromOverflow: ReturnType<typeof makeSpread> | null = null
  let reachable: Uint8Array | null = null
  const addSeed = (v: number) => { seeds.push(v); fromSeeds.feed(v); fromSpread.feed(v); fromOverflow?.feed(v) }
  const addScattered = (v: number) => { scattered.push(v); fromSpread.feed(v); fromOverflow?.feed(v) }
  // The cortex is full: keep spreading over the rest of the cerebrum (sulci, the underside, the
  // interior lattice), away from every seed and loose note so far; as a last resort, any free
  // vertex. Only vertices the lattice reaches from the surface count: the interior has a few
  // stranded points, and a node placed on one could never be routed to.
  const overflow = (): number => {
    if (!fromOverflow || !reachable) {
      reachable = new Uint8Array(V)
      reachable[0] = 1
      for (const v of orderFrom(0, false)) reachable[v] = 1
      const rest: number[] = []
      for (let v = 0; v < V; v++) if (reachable[v] && mesh.kind[v] === 0 && !mesh.cortex[v]) rest.push(v)
      fromOverflow = makeSpread(rest)
      for (const c of seeds) fromOverflow.feed(c)
      for (const c of scattered) fromOverflow.feed(c)
    }
    const v = fromOverflow.pick()
    if (v >= 0) return v
    for (let c = 0; c < V; c++) if (free[c] && reachable[c]) return c
    return -1
  }

  // model.nodes is in stable sidebar order, parents before children, so a single pass works.
  for (const node of model.nodes) {
    if (node.kind === 'group') {
      let v = -1
      if (node.centered) {
        centered.add(node.id)
        let bestD = Infinity
        for (const iv of mesh.interiorVertices) {
          if (!free[iv]) continue
          const q = (pos[iv * 3] - mesh.center[0]) ** 2 + (pos[iv * 3 + 1] - mesh.center[1]) ** 2 + (pos[iv * 3 + 2] - mesh.center[2]) ** 2
          if (q < bestD) { bestD = q; v = iv }
        }
        if (v < 0) v = overflow()
      } else {
        if (!seeds.length) {
          // first territory: the best front-lateral spot still free
          let bestD = -Infinity
          for (const c of cortex) {
            if (!free[c]) continue
            const s = frontLateral(c)
            if (s > bestD) { bestD = s; v = c }
          }
        } else v = fromSeeds.pick()
        if (v < 0) v = overflow()
        if (v >= 0) addSeed(v)
      }
      if (v >= 0) { claim(node.id, v); anchorOf.set(node.id, v); siblings.set(node.id, [v]) }
    } else if (node.kind === 'folder') {
      const g = parentOf.get(node.id), ga = g !== undefined ? anchorOf.get(g) : undefined
      if (g === undefined || ga === undefined) continue
      const sib = siblings.get(g) ?? [ga]
      // a patch of its own: close to the group, as far as possible from its siblings
      let best = -1, bestD = -1
      bfs(ga, false, isCortex, PATCH_HOPS, (v) => {
        if (d2(v, ga) > patch2) return false
        let nd = Infinity
        for (const c of sib) { const q = d2(v, c); if (q < nd) nd = q }
        if (nd > bestD) { bestD = nd; best = v }
        return false
      })
      // no gyrus left that close: stay with the group all the same
      if (best < 0) best = spotNear(ga, false)
      if (best >= 0) { claim(node.id, best); anchorOf.set(node.id, best); sib.push(best) }
    } else if (node.kind === 'note') {
      const parent = parentOf.get(node.id)
      const a = parent !== undefined ? anchorOf.get(parent) : undefined
      let v = -1
      if (parent !== undefined && a !== undefined) {
        if (!centered.has(parent)) v = spotNear(a, true)
        else { v = pick(a, INSIDE); if (v < 0) v = pick(a, ANY) }
      } else {
        if (node.favorited) {
          v = favs.length ? fromFavs.pick() : farthest(cereb, seeds)
          if (v >= 0) { favs.push(v); fromFavs.feed(v) }
        }
        if (v < 0) {
          // a loose note — or a favourite the cerebellum has no room left for
          v = seeds.length + scattered.length ? fromSpread.pick() : farthest(cortex, [cortex[0]])
          if (v < 0) v = overflow()
          if (v >= 0) addScattered(v)
        }
      }
      if (v >= 0) { claim(node.id, v); anchorOf.set(node.id, v) }
    } else {
      // section → a free neighbour of its note, in the same kind of area as the note
      const nv = anchorOf.get(`n:${node.noteId}`)
      if (nv === undefined) continue
      const accept = isCereb(nv) ? isCereb : isCortex(nv) ? isCortex : anyFree
      let v = -1
      for (const nb of adjacency[nv]) if (free[nb] && accept(nb)) { v = nb; break }
      if (v < 0 && onSkin(nv)) {
        // none: a gyrus a few steps along the skin, else whatever spot those steps pass first
        let other = -1
        v = bfs(nv, true, anyFree, SECTION_HOPS, (x) => { if (isCortex(x)) return true; if (other < 0) other = x; return false })
        if (v < 0) v = other
      } else if (v < 0) v = bfs(nv, false, accept)
      if (v < 0) v = bfs(nv, false, anyFree)
      if (v >= 0) claim(node.id, v)
    }
  }
  return assignment
}
