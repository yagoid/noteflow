// GENERATED — copied from src/components/Brain/brainMesh.ts by docs/scripts/build-brain.mjs.
// Do not edit here: change the app's module and run `npm run brain` in docs/.

// The scaffold of "El Cerebro 3D": a low-poly human brain, asset-free and fully deterministic.
//
// SHAPE. The cerebrum is LOFTED FROM MEASURED PROFILES rather than sculpted: the lateral outline
// (dorsal and ventral contours traced from Gray's lateral plate, rescaled toward MRI proportions)
// and the outline seen from above define a cross-section at every point of the front–back axis.
// That pins the two silhouettes people recognise a brain by.
//
// FOLDS. Gyri are geometry, not texture. A labyrinth field (a warped gyroid, with the real
// landmarks forced in: longitudinal fissure, lateral fissure, central sulcus and the gyri that
// flank them) splits the surface into gyri and sulci. Lattice vertices slide along the surface
// onto the gyrus/sulcus boundary, so that boundary runs along mesh edges and every triangle is
// cleanly one or the other; gyri are pushed out and sulci pulled in. Each edge carries a weight:
// the outline of a gyrus is the bright line, edges inside a gyrus are dimmer, inside a sulcus
// almost gone.
//
// The solid is sampled radially over an icosphere topology. The interior (white matter) is a
// lattice of random points wired to their nearest neighbours. The cerebellum is built from
// horizontal rings (folia) and the brainstem is a tapered tube with the pons; hidden weight-0
// seams stitch the three parts together so routes can cross between them.
//
// Vertices double as anchor points where graph nodes get pinned (assignVertices.ts), plus
// per-vertex region labels, adjacency and lattice routing (A*). The shape is fixed — no params —
// so the mesh is identical on every build and is built once per session (getBrainMesh).
//
// This is the approved design, reproduced number for number: the tests hold it against a
// fingerprint of the original (tests/helpers/brainMeshRef.ts). The order of the floating-point
// operations and the order vertices and edges are added in are therefore part of the contract —
// speed it up by doing less work, never by rearranging the arithmetic.

export type Vec3 = [number, number, number]

export const REGIONS = ['frontal', 'parietal', 'temporal', 'occipital', 'cerebellum', 'stem'] as const
export type Region = (typeof REGIONS)[number]
export const REGION_CODE: Record<Region, number> = {
  frontal: 0, parietal: 1, temporal: 2, occipital: 3, cerebellum: 4, stem: 5,
}

export interface BrainMesh {
  positions: Float32Array
  edges: Uint32Array
  faces: Uint32Array          // the skin: cerebrum + cerebellum (both closed) + brainstem (a tube, open at its ends)
  regionOf: Int8Array
  adjacency: number[][]
  vertexCount: number
  verticesByRegion: Record<Region, number[]>
  interiorVertices: number[]   // indices of the random interior-fill points (for routing through the volume)
  edgeW: Float32Array          // per-edge weight (0 = hidden seam: routed over, never drawn)
  vertW: Float32Array          // per-vertex weight (how bright its dot is)
  cortex: Uint8Array           // 1 = a cortex vertex a note may sit on (on a gyrus, not underneath, not in the fissure)
  kind: Uint8Array             // 0 cerebrum · 1 cerebellum · 2 brainstem
  surface: Uint8Array          // 1 = on the surface, 0 = interior lattice
  center: Vec3                 // origin of the sampling rays (the core)
  boundCenter: Vec3            // bounding sphere of the cerebral surface (mean position + max distance)
  boundRadius: number
  // Shortest lattice path by raw Euclidean edge length (structure routes hug the surface unless
  // diving through the interior is literally shorter). Cached per unordered pair, so the result may
  // come back oriented either way and must not be mutated.
  pathBetween: (a: number, b: number) => number[] | null
  // Same lattice routing, but penalises edges near the outer shell so the path dives through the
  // interior fill and crosses the core. Used as the per-edge fallback when a content edge isn't
  // part of a batch route.
  pathThroughInterior: (a: number, b: number) => number[] | null
  // Congestion-aware batch router for content edges (synapses): routes all relations together so
  // they fan out onto parallel corridors instead of stacking onto one (which would hide each
  // other). Pass pairs strongest-first; returns a map keyed by the unordered pair (min*V+max).
  // The map is the caller's, but the path arrays in it are shared with the mesh: don't mutate them.
  routeContentEdges: (pairs: Array<readonly [number, number]>) => Map<number, number[]>
}

// Deterministic PRNG (mulberry32) for the interior fill — fixed seed → same lattice every build.
// (Exported for the scene, whose "random" phases and seeds must also repeat on every open.)
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const normalize = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t

// ── topology: an icosphere (shared-vertex subdivision) ──────────────────────────
type Face = [number, number, number]
interface Topology { verts: Vec3[]; faces: Face[] }

function icosahedron(): Topology {
  const t = (1 + Math.sqrt(5)) / 2
  const verts: Vec3[] = ([
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ] as Vec3[]).map(normalize)
  const faces: Face[] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ]
  return { verts, faces }
}

// Every face split in four, `detail` times; a midpoint is shared by the two faces on its edge.
function topology(detail: number): Topology {
  const base = icosahedron()
  const verts = base.verts.slice()
  const mid = new Map<number, number>()
  const getMid = (a: number, b: number): number => {
    const key = a < b ? a * 65536 + b : b * 65536 + a
    const found = mid.get(key)
    if (found !== undefined) return found
    const va = verts[a], vb = verts[b]
    verts.push(normalize([(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2]))
    mid.set(key, verts.length - 1)
    return verts.length - 1
  }
  let faces = base.faces
  for (let i = 0; i < detail; i++) {
    const next: Face[] = []
    for (const f of faces) {
      const ab = getMid(f[0], f[1]), bc = getMid(f[1], f[2]), ca = getMid(f[2], f[0])
      next.push([f[0], ab, ca], [f[1], bc, ab], [f[2], ca, bc], [ab, bc, ca])
    }
    faces = next
  }
  return { verts, faces }
}

// ── measured profiles ───────────────────────────────────────────────────────────
// A smooth curve through [z, value] samples (cubic Hermite, finite-difference tangents).
function curve(pts: ReadonlyArray<readonly [number, number]>): (z: number) => number {
  const n = pts.length
  const xs = new Float64Array(n), ys = new Float64Array(n), m = new Float64Array(n)
  for (let i = 0; i < n; i++) { xs[i] = pts[i][0]; ys[i] = pts[i][1] }
  for (let i = 0; i < n; i++) {
    const a = i > 0 ? (ys[i] - ys[i - 1]) / (xs[i] - xs[i - 1]) : null
    const b = i < n - 1 ? (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]) : null
    m[i] = a == null ? (b ?? 0) : b == null ? a : a * b <= 0 ? 0 : (a + b) / 2 // flat at extrema: no overshoot
  }
  // The segment of the last query: consecutive queries walk along a ray, so it rarely moves.
  let i = 0
  return (z) => {
    if (z <= xs[0]) return ys[0]
    if (z >= xs[n - 1]) return ys[n - 1]
    while (z > xs[i + 1]) i++
    while (z <= xs[i]) i--
    const h = xs[i + 1] - xs[i], t = (z - xs[i]) / h, t2 = t * t, t3 = t2 * t
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1]
  }
}

// z+ is the front (frontal pole at +1.15), y+ is up. One unit ≈ 75 mm.
const ZB = -1.15, ZF = 1.15
// Dorsal contour: a blunt frontal pole, the vertex behind the middle, a tapering occipital end.
const TOP = curve([[-1.15, 0.22], [-1.139, 0.355], [-1.07, 0.557], [-0.948, 0.739], [-0.784, 0.89], [-0.58, 1.025], [-0.377, 1.11], [-0.173, 1.138], [0.03, 1.133], [0.235, 1.102], [0.437, 1.043], [0.642, 0.967], [0.805, 0.874], [0.966, 0.739], [1.07, 0.66], [1.125, 0.565], [1.15, 0.42]])
// Ventral contour seen from the side: the temporal lobe hangs below the orbital surface and its
// pole stops well short of the frontal pole.
const BOT = curve([[-1.15, 0.22], [-1.13, 0.09], [-1.07, -0.03], [-0.987, -0.1], [-0.823, -0.18], [-0.58, -0.27], [-0.377, -0.345], [-0.173, -0.38], [0.03, -0.38], [0.235, -0.362], [0.437, -0.326], [0.56, -0.25], [0.615, -0.11], [0.655, 0.02], [0.72, 0.045], [0.844, 0.083], [1.007, 0.163], [1.09, 0.25], [1.135, 0.33], [1.15, 0.42]])
// The underside along the midline (between the temporal lobes it stays high: room for the stem).
const MED = curve([[-1.15, 0.22], [-1.12, 0.1], [-1.0, -0.05], [-0.8, -0.14], [-0.5, -0.24], [-0.2, -0.29], [0.1, -0.29], [0.33, -0.25], [0.5, -0.15], [0.62, -0.01], [0.72, 0.045], [0.844, 0.083], [1.007, 0.163], [1.09, 0.25], [1.135, 0.33], [1.15, 0.42]])
// Half-width seen from above: an egg, widest behind the middle, narrower at the forehead.
const SLIM = 0.86 // overall width: the measured outline read a little too broad
const WID0 = curve([[-1.15, 0], [-1.1155, 0.23], [-1.081, 0.39], [-0.966, 0.62], [-0.805, 0.78], [-0.575, 0.885], [-0.345, 0.92], [-0.115, 0.92], [0.115, 0.885], [0.345, 0.84], [0.575, 0.76], [0.805, 0.62], [0.966, 0.46], [1.081, 0.28], [1.127, 0.16], [1.15, 0]])
const WID = (z: number) => WID0(z) * SLIM
// Landmarks: the lateral (Sylvian) fissure rises gently toward the back; the central sulcus
// runs from the midline down and slightly forward, stopping just above it.
const sylY = (z: number) => 0.014 + 0.241 * Math.max(0, Math.min(1.15, (0.62 - z) / 0.99))
const cenZ = (u: number) => -0.3 + 0.38 * Math.pow(Math.min(1, Math.max(0, u)), 0.8)
const CENTER: Vec3 = [0, 0.42, 0]

function inside(x: number, y: number, z: number): boolean {
  if (z <= ZB || z >= ZF) return false
  let w = WID(z)
  if (w <= 1e-4) return false
  const sm = smoothstep(-0.6, -0.3, z) * (1 - smoothstep(0.42, 0.6, z))
  if (sm > 0) { const q = (y - sylY(z)) / 0.06; w *= 1 - 0.045 * Math.exp(-q * q) * sm }   // the fissure dents the lateral wall
  const u = Math.abs(x) / w
  if (u >= 1) return false
  const top = TOP(z), bl = BOT(z)
  const yc = bl + 0.4 * (top - bl)                       // the widest point sits low on the side
  if (y >= yc) return y < yc + (top - yc) * Math.pow(1 - Math.pow(u, 2.3), 1 / 2.3)
  const bm = MED(z)
  const bot = bm + (bl - bm) * smoothstep(0.2, 0.5, u)   // the temporal lobes are lateral
  return y > yc - (yc - bot) * Math.pow(1 - Math.pow(u, 2.8), 1 / 2.8)
}
// Spread the rays like the brain's own ellipsoid so the lattice stays even along its length.
const warp = (d: Vec3): Vec3 => normalize([d[0] * 0.92 * SLIM, d[1] * 0.76, d[2] * 1.15])
function solveRadius(dir: Vec3): number {
  // start just outside a bounding ellipsoid and walk in: the outermost crossing is the surface
  let r = 1 / Math.sqrt((dir[0] / 0.97) ** 2 + (dir[1] / 0.86) ** 2 + (dir[2] / 1.2) ** 2) + 0.06
  while (r > 0.04 && !inside(CENTER[0] + dir[0] * r, CENTER[1] + dir[1] * r, CENTER[2] + dir[2] * r)) r -= 0.025
  let lo = r, hi = r + 0.025
  for (let i = 0; i < 10; i++) {
    const m = (lo + hi) / 2
    if (inside(CENTER[0] + dir[0] * m, CENTER[1] + dir[1] * m, CENTER[2] + dir[2] * m)) lo = m; else hi = m
  }
  return lo
}
const surfacePoint = (d: Vec3): Vec3 => {
  const r = solveRadius(d)
  return [CENTER[0] + d[0] * r, CENTER[1] + d[1] * r, CENTER[2] + d[2] * r]
}

// ── the fold field: > C0 is a gyrus, < C0 a sulcus ──────────────────────────────
const GF = 15.5, GW = 1.15, C0 = -0.12
const bump = (d: number, a: number, b: number) => smoothstep(a * 0.7, a, d) * (1 - smoothstep(b, b * 1.3, d))
function gyri(x: number, y: number, z: number): number {
  const ax = Math.abs(x) + 0.05 * Math.sin(z * 3.1 + (x > 0 ? 0 : 1.9)) // near-mirror hemispheres, not identical
  let qx = ax * GF, qy = y * GF, qz = z * GF
  const wx = GW * Math.sin(qz * 0.63 + 1.7), wy = GW * Math.sin(qx * 0.63 + 4.1), wz = GW * Math.sin(qy * 0.63 + 2.9)
  qx += wx; qy += wy; qz += wz
  let g = Math.sin(qx) * Math.cos(qy) + Math.sin(qy) * Math.cos(qz) + Math.sin(qz) * Math.cos(qx)
  const w = Math.max(WID(z), 1e-4), u = Math.abs(x) / w, sy = sylY(z)
  const upper = smoothstep(sy + 0.05, sy + 0.16, y), lat = smoothstep(0.35, 0.55, u)
  const zs = smoothstep(-0.55, -0.3, z) * (1 - smoothstep(0.5, 0.62, z))
  const dC = Math.abs(z - cenZ(u)), dS = y - sy
  g = mix(g, 1.0, 0.85 * upper * bump(dC, 0.085, 0.2))                 // pre- and post-central gyri
  g = mix(g, 1.0, 0.85 * lat * zs * bump(-dS, 0.075, 0.2))             // superior temporal gyrus
  g = mix(g, -1.2, upper * (1 - smoothstep(0.03, 0.075, dC)))          // central sulcus
  g = mix(g, -1.2, lat * zs * (1 - smoothstep(0.03, 0.07, Math.abs(dS)))) // lateral fissure
  g = mix(g, -1.2, 1 - smoothstep(0.035, 0.085, Math.abs(x)))          // longitudinal fissure
  return g
}
function regionAt(x: number, y: number, z: number): Region {
  const u = Math.abs(x) / Math.max(WID(z), 1e-4)
  if (y < sylY(z) && z < 0.66 && z > -0.62 && u > 0.3) return 'temporal'
  if (z < -0.74) return 'occipital'
  return z > cenZ(u) ? 'frontal' : 'parietal'
}

const DETAIL = 4            // icosphere subdivisions: the fold bands need this fixed, dense lattice
// The mesh lives the whole session, so the route caches are bounded (emptied when they fill up).
// Above the vertex count: a graph can't have more structure edges than that, so one never thrashes.
const PATH_CACHE_MAX = 8192

// ── assembly ────────────────────────────────────────────────────────────────────
export function buildBrainMesh(): BrainMesh {
  const positions: number[] = [], regionOf: number[] = [], kind: number[] = [], surface: number[] = []
  const edgeSet = new Map<number, number>(), edgeLo: number[] = [], edgeHi: number[] = [], edgeWs: number[] = []
  const faces: number[] = []
  let V = 0
  const push = (x: number, y: number, z: number, region: Region, k: number, isSurf: boolean): number => {
    positions.push(x, y, z); regionOf.push(REGION_CODE[region]); kind.push(k); surface.push(isSurf ? 1 : 0)
    return V++
  }
  // Insertion order is the edge order; a repeated pair keeps its slot and the larger weight.
  const addEdge = (a: number, b: number, w: number) => {
    if (a === b) return
    const lo = Math.min(a, b), hi = Math.max(a, b), key = lo * 8192 + hi
    const at = edgeSet.get(key)
    if (at !== undefined) { if (w > edgeWs[at]) edgeWs[at] = w; return }
    edgeSet.set(key, edgeLo.length); edgeLo.push(lo); edgeHi.push(hi); edgeWs.push(w)
  }
  const C = CENTER

  // ── cerebrum surface ──
  const topo = topology(DETAIL)
  const nC = topo.verts.length, nF = topo.faces.length
  // mean angular edge length → how far a vertex may slide to reach a fold boundary
  let ang = 0
  const sample = Math.min(nF, 400)
  for (let i = 0; i < sample; i++) {
    const a = topo.verts[topo.faces[i][0]], b = topo.verts[topo.faces[i][1]]
    ang += Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])))
  }
  const maxStep = (ang / sample) * 0.42

  const base: Vec3[] = [], dirs: Vec3[] = [], fold: number[] = [], snapped = new Uint8Array(nC)
  for (let i = 0; i < nC; i++) {
    let d = warp(topo.verts[i])
    // p / g always belong to the current d, so the last pair is the vertex itself
    let p = surfacePoint(d), g = gyri(p[0], p[1], p[2])
    for (let it = 0; it < 2; it++) {
      // two tangents on the ray sphere
      const up: Vec3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
      const t1 = normalize([d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2], d[0] * up[1] - d[1] * up[0]])
      const t2: Vec3 = [d[1] * t1[2] - d[2] * t1[1], d[2] * t1[0] - d[0] * t1[2], d[0] * t1[1] - d[1] * t1[0]]
      const e = 0.012
      const p1 = surfacePoint(normalize([d[0] + e * t1[0], d[1] + e * t1[1], d[2] + e * t1[2]]))
      const p2 = surfacePoint(normalize([d[0] + e * t2[0], d[1] + e * t2[1], d[2] + e * t2[2]]))
      const g1 = (gyri(p1[0], p1[1], p1[2]) - g) / e, g2 = (gyri(p2[0], p2[1], p2[2]) - g) / e, gg = g1 * g1 + g2 * g2
      if (gg < 1e-6) break
      const s1 = ((C0 - g) * g1) / gg, s2 = ((C0 - g) * g2) / gg, len = Math.hypot(s1, s2)
      if (len > maxStep * (it === 0 ? 1 : 0.5)) break
      d = normalize([d[0] + s1 * t1[0] + s2 * t2[0], d[1] + s1 * t1[1] + s2 * t2[1], d[2] + s1 * t1[2] + s2 * t2[2]])
      snapped[i] = 1
      p = surfacePoint(d); g = gyri(p[0], p[1], p[2])
    }
    dirs.push(d); base.push(p); fold.push(g)
  }

  // classify faces at their centroid, then drop single-triangle islands
  const fc = new Uint8Array(nF)
  for (let i = 0; i < nF; i++) {
    const f = topo.faces[i], a = base[f[0]], b = base[f[1]], c = base[f[2]]
    fc[i] = gyri((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3) > C0 ? 1 : 0
  }
  // the surface edges in first-seen order, each with the (up to) two faces that share it
  const slotOf = new Map<number, number>()
  const seLo: number[] = [], seHi: number[] = [], seF0: number[] = [], seF1: number[] = []
  const faceEdge = new Int32Array(nF * 3)
  for (let i = 0; i < nF; i++) {
    const f = topo.faces[i]
    for (let k = 0; k < 3; k++) {
      const a = f[k], b = f[(k + 1) % 3], lo = a < b ? a : b, hi = a < b ? b : a, key = lo * 8192 + hi
      let s = slotOf.get(key)
      if (s === undefined) { s = seLo.length; slotOf.set(key, s); seLo.push(lo); seHi.push(hi); seF0.push(i); seF1.push(-1) }
      else seF1[s] = i
      faceEdge[i * 3 + k] = s
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    const next = fc.slice()
    for (let i = 0; i < nF; i++) {
      let other = 0
      for (let k = 0; k < 3; k++) {
        const s = faceEdge[i * 3 + k], nb = seF0[s] === i ? seF1[s] : seF0[s]
        if (nb >= 0 && fc[nb] !== fc[i]) other++
      }
      if (other === 3) next[i] = 1 - fc[i]
    }
    fc.set(next)
  }
  // displace: gyri out, sulci in, boundaries stay on the lofted surface
  const cerebrumIndex: number[] = []
  for (let i = 0; i < nC; i++) {
    const g = fold[i], d = dirs[i], b = base[i]
    let h = snapped[i] ? -0.004 : g > C0 ? 0.032 * smoothstep(C0, C0 + 0.7, g) : -0.06 * smoothstep(C0, C0 - 0.7, g)
    h -= 0.13 * Math.exp(-Math.pow(b[0] / 0.07, 2)) * smoothstep(-0.3, 0.05, d[1])
    cerebrumIndex.push(push(b[0] + d[0] * h, b[1] + d[1] * h, b[2] + d[2] * h, regionAt(b[0], b[1], b[2]), 0, true))
  }
  const vertW: number[] = []
  for (let i = 0; i < nC; i++) vertW.push(0.22)
  for (let i = 0; i < nF; i++) {
    const f = topo.faces[i]
    faces.push(f[0], f[1], f[2])
    if (fc[i]) for (const v of f) if (vertW[v] < 0.5) vertW[v] = 0.5
  }
  for (let s = 0; s < seLo.length; s++) {
    const a = seLo[s], b = seHi[s]
    const ca = fc[seF0[s]], cb = seF1[s] >= 0 ? fc[seF1[s]] : ca
    const under = dirs[a][1] < -0.5 && dirs[b][1] < -0.5 ? 0.6 : 1
    const w = (ca !== cb ? 1 : ca ? 0.3 : 0.045) * under   // the outline of a gyrus is the bright line
    addEdge(a, b, w)
    if (ca !== cb) { vertW[a] = Math.max(vertW[a], under); vertW[b] = Math.max(vertW[b], under) }
  }

  // ── interior lattice (white matter): random points inside, wired to their nearest neighbours ──
  const interiorVertices: number[] = []
  {
    const rng = mulberry32(0x1a2b3c4d)
    const n = Math.round(Math.min(2400, nC * 0.65))
    // Link candidates, in index order: the cortex at its lofted (un-displaced) position, then the
    // interior points. Candidate j is vertex j.
    const N = nC + n
    const cand = new Float64Array(N * 3)
    for (let i = 0; i < nC; i++) { const b = base[i]; cand[i * 3] = b[0]; cand[i * 3 + 1] = b[1]; cand[i * 3 + 2] = b[2] }
    for (let i = 0; i < n; i++) {
      const u = rng() * 2 - 1, th = rng() * Math.PI * 2, sq = Math.sqrt(1 - u * u)
      const d = warp([sq * Math.cos(th), u, sq * Math.sin(th)])
      const r = solveRadius(d) * Math.cbrt(rng()) * 0.88
      const x = C[0] + d[0] * r, y = C[1] + d[1] * r, z = C[2] + d[2] * r
      const v = push(x, y, z, regionAt(x, y, z), 0, false)
      interiorVertices.push(v); vertW.push(0.6)
      cand[v * 3] = x; cand[v * 3 + 1] = y; cand[v * 3 + 2] = z
    }

    // Each interior point links to its (up to) 3 nearest candidates within maxE; ties resolve by
    // candidate index, exactly as a stable sort of the full candidate sweep would. A uniform grid
    // (RINGS cells span maxE, plus a hair so rounding can never hide a candidate in range) is
    // searched ring by ring around the point's cell: once ring k is done every unseen candidate
    // lies more than k cells away, so the search stops as soon as the third nearest is closer.
    const maxE = 0.42, maxE2 = maxE * maxE
    const RINGS = 3, cell = (maxE / RINGS) * 1.000001
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    for (let j = 0; j < N; j++) {
      const x = cand[j * 3], y = cand[j * 3 + 1], z = cand[j * 3 + 2]
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (z < minZ) minZ = z
      if (z > maxZ) maxZ = z
    }
    const gx = Math.floor((maxX - minX) / cell) + 1, gy = Math.floor((maxY - minY) / cell) + 1, gz = Math.floor((maxZ - minZ) / cell) + 1
    const cellX = new Int32Array(N), cellY = new Int32Array(N), cellZ = new Int32Array(N)
    const cellStart = new Int32Array(gx * gy * gz + 1), cellItems = new Int32Array(N)
    for (let j = 0; j < N; j++) {
      cellX[j] = Math.floor((cand[j * 3] - minX) / cell); cellY[j] = Math.floor((cand[j * 3 + 1] - minY) / cell); cellZ[j] = Math.floor((cand[j * 3 + 2] - minZ) / cell)
      cellStart[(cellX[j] * gy + cellY[j]) * gz + cellZ[j] + 1]++
    }
    for (let c = 0; c < gx * gy * gz; c++) cellStart[c + 1] += cellStart[c]
    {
      const fill = cellStart.slice(0, gx * gy * gz)
      for (let j = 0; j < N; j++) cellItems[fill[(cellX[j] * gy + cellY[j]) * gz + cellZ[j]]++] = j
    }
    for (let i = 0; i < n; i++) {
      const self = interiorVertices[i]
      const px = cand[self * 3], py = cand[self * 3 + 1], pz = cand[self * 3 + 2]
      const ix = cellX[self], iy = cellY[self], iz = cellZ[self]
      // the three nearest so far, ordered by (distance, candidate index)
      let b0 = -1, b1 = -1, b2 = -1, q0 = Infinity, q1 = Infinity, q2 = Infinity
      for (let k = 0; k <= RINGS; k++) {
        const x0 = Math.max(0, ix - k), x1 = Math.min(gx - 1, ix + k)
        const y0 = Math.max(0, iy - k), y1 = Math.min(gy - 1, iy + k)
        const z0 = Math.max(0, iz - k), z1 = Math.min(gz - 1, iz + k)
        for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
          // only the shell of the block: its inside was covered by the previous rings
          const edge = Math.abs(cx - ix) === k || Math.abs(cy - iy) === k
          for (let cz = z0; cz <= z1; cz++) {
            if (!edge && Math.abs(cz - iz) !== k) continue
            const c = (cx * gy + cy) * gz + cz
            for (let s = cellStart[c], end = cellStart[c + 1]; s < end; s++) {
              const j = cellItems[s]
              if (j === self) continue
              const q = (px - cand[j * 3]) ** 2 + (py - cand[j * 3 + 1]) ** 2 + (pz - cand[j * 3 + 2]) ** 2
              if (q > maxE2 || q > q2 || (q === q2 && j > b2)) continue
              if (q < q1 || (q === q1 && j < b1)) {
                q2 = q1; b2 = b1
                if (q < q0 || (q === q0 && j < b0)) { q1 = q0; b1 = b0; q0 = q; b0 = j } else { q1 = q; b1 = j }
              } else { q2 = q; b2 = j }
            }
          }
        }
        const clear = k * cell * 0.999999 // nothing unseen is nearer than this
        if (b2 >= 0 && q2 < clear * clear) break
      }
      if (b0 >= 0) {
        addEdge(self, b0, 0.3)
        if (b1 >= 0) addEdge(self, b1, 0.3)
        if (b2 >= 0) addEdge(self, b2, 0.3)
      } else {
        // nothing within maxE: never leave a point orphaned — link it to the nearest candidate
        let bestIdx = -1, bestD2 = Infinity
        for (let j = 0; j < N; j++) {
          if (j === self) continue
          const q = (px - cand[j * 3]) ** 2 + (py - cand[j * 3 + 1]) ** 2 + (pz - cand[j * 3 + 2]) ** 2
          if (q < bestD2) { bestD2 = q; bestIdx = j }
        }
        if (bestIdx >= 0) addEdge(self, bestIdx, 0.3)
      }
    }
  }

  // ── cerebellum: tucked under the occipital lobes; horizontal rings read as folia, with a
  // flattened top (it sits under the tentorium) and a notch between its two hemispheres ──
  const cbIndex: number[] = []
  {
    const cc: Vec3 = [0, -0.31, -0.7], rr: Vec3 = [0.4 * SLIM, 0.235, 0.33], R = 12, S = 18
    const at = (i: number, j: number): number => {
      const th = (Math.PI * i) / R, ph = (Math.PI * 2 * (j + (i % 2) * 0.5)) / S
      const d: Vec3 = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)]
      const notch = (1 - 0.3 * Math.exp(-Math.pow(d[0] / 0.22, 2)) * (0.55 - 0.45 * d[2])) * (1 + 0.1 * Math.pow(Math.abs(d[0]), 1.5))
      const ridge = i % 2 ? 1.025 : 0.985          // alternate rings in and out: folia
      return push(
        cc[0] + d[0] * rr[0] * notch * ridge,
        cc[1] + d[1] * rr[1] * (d[1] > 0 ? 0.88 : 1) * (1 - 0.22 * Math.exp(-Math.pow(d[0] / 0.2, 2)) * Math.max(0, -d[1])),
        cc[2] + d[2] * rr[2] * notch * ridge,
        'cerebellum', 1, true,
      )
    }
    const top = at(0, 0); vertW.push(0.6)
    const rings: number[][] = []
    for (let i = 1; i < R; i++) {
      const ring: number[] = []
      for (let j = 0; j < S; j++) { ring.push(at(i, j)); vertW.push(i % 2 ? 0.9 : 0.4) }
      rings.push(ring)
    }
    const bottom = at(R, 0); vertW.push(0.4)
    cbIndex.push(top, bottom)
    rings.forEach((ring, i) => {
      for (let j = 0; j < S; j++) {
        const a = ring[j], b = ring[(j + 1) % S]
        cbIndex.push(a)
        addEdge(a, b, (i + 1) % 2 ? 0.95 : 0.4)
        if (i === 0) { faces.push(top, a, b); addEdge(top, a, 0.3) }
        if (i < rings.length - 1) {
          // consecutive rings are offset by half a step → a clean zig-zag band of triangles
          const lower = rings[i + 1], l0 = lower[j], l1 = lower[(j + 1) % S]
          if (i % 2) { faces.push(a, l0, b, b, l0, l1); addEdge(a, l0, 0.3); addEdge(b, l0, 0.3) }
          else { faces.push(a, l0, l1, a, l1, b); addEdge(a, l0, 0.3); addEdge(a, l1, 0.3) }
        } else { faces.push(bottom, b, a); addEdge(bottom, a, 0.2) }
      }
    })
  }

  // ── brainstem: midbrain → pons (bulging forward) → medulla, leaning back as it descends ──
  const stemIndex: number[] = []
  const L = 9, M = 8
  {
    const T: Vec3 = [0, 0.0, -0.1], B: Vec3 = [0, -0.82, -0.37]
    const rings: number[][] = []
    for (let i = 0; i < L; i++) {
      const t = i / (L - 1), pons = Math.exp(-Math.pow((t - 0.32) / 0.17, 2))
      const rad = 0.19 * (1 - t) + 0.09 * t + 0.085 * pons
      const cx = T[0] + (B[0] - T[0]) * t, cy = T[1] + (B[1] - T[1]) * t, cz = T[2] + (B[2] - T[2]) * t + 0.05 * pons
      const ring: number[] = []
      for (let j = 0; j < M; j++) {
        const a = (Math.PI * 2 * (j + (i % 2) * 0.5)) / M
        ring.push(push(cx + Math.cos(a) * rad * 1.05, cy, cz + Math.sin(a) * rad, 'stem', 2, true)); vertW.push(0.7)
      }
      rings.push(ring)
    }
    rings.forEach((ring, i) => {
      for (let j = 0; j < M; j++) {
        const a = ring[j], b = ring[(j + 1) % M]
        stemIndex.push(a)
        addEdge(a, b, 0.6)
        if (i < L - 1) {
          const lower = rings[i + 1]
          const l0 = i % 2 ? lower[j] : lower[(j + M - 1) % M], l1 = i % 2 ? lower[(j + 1) % M] : lower[j]
          faces.push(a, l0, l1, a, l1, b); addEdge(a, l0, 0.6); addEdge(a, l1, 0.6)
        }
      }
    })
  }

  const posArr = new Float32Array(positions)
  const dist2 = (i: number, j: number) =>
    (posArr[i * 3] - posArr[j * 3]) ** 2 + (posArr[i * 3 + 1] - posArr[j * 3 + 1]) ** 2 + (posArr[i * 3 + 2] - posArr[j * 3 + 2]) ** 2
  const nearestIn = (target: number, pool: number[]): number => {
    let best = pool[0], bestD = Infinity
    for (const j of pool) { const d = dist2(target, j); if (d < bestD) { bestD = d; best = j } }
    return best
  }
  // stitch the three parts so routes can cross between them (hidden links: weight 0)
  for (const v of cbIndex) if (posArr[v * 3 + 1] > -0.2 && posArr[v * 3 + 2] < -0.7) addEdge(v, nearestIn(v, cerebrumIndex), 0)
  for (let j = 0; j < M; j += 2) addEdge(stemIndex[j], nearestIn(stemIndex[j], interiorVertices), 0)
  addEdge(stemIndex[3 * M + 6], nearestIn(stemIndex[3 * M + 6], cbIndex), 0)
  addEdge(stemIndex[5 * M + 6], nearestIn(stemIndex[5 * M + 6], cbIndex), 0)

  // cortex = a cerebral vertex a note may sit on: on a gyrus, not the underside, not in the fissure
  const cortex = new Uint8Array(V)
  for (let i = 0; i < nC; i++) cortex[i] = vertW[i] >= 0.5 && dirs[i][1] > -0.38 && Math.abs(posArr[i * 3]) > 0.1 ? 1 : 0

  const E = edgeLo.length
  const adjacency: number[][] = Array.from({ length: V }, () => [])
  for (let e = 0; e < E; e++) { adjacency[edgeLo[e]].push(edgeHi[e]); adjacency[edgeHi[e]].push(edgeLo[e]) }
  const verticesByRegion: Record<Region, number[]> = {
    frontal: [], parietal: [], temporal: [], occipital: [], cerebellum: [], stem: [],
  }
  for (let i = 0; i < V; i++) verticesByRegion[REGIONS[regionOf[i]]].push(i)

  // bounding sphere of the cerebral surface (the first nC vertices): depth-cue normalisation
  let bx = 0, by = 0, bz = 0
  for (let v = 0; v < nC; v++) { bx += posArr[v * 3]; by += posArr[v * 3 + 1]; bz += posArr[v * 3 + 2] }
  bx /= nC; by /= nC; bz /= nC
  let boundRadius = 0
  for (let v = 0; v < nC; v++) boundRadius = Math.max(boundRadius, Math.hypot(posArr[v * 3] - bx, posArr[v * 3 + 1] - by, posArr[v * 3 + 2] - bz))

  // ── routing: shortest lattice paths (A*), an interior-biased variant for content relations and a
  // congestion-aware batch. The search state lives in arrays shared by every search and reset by a
  // generation stamp, so a route costs no allocation beyond its own path. ──
  // Per-vertex radial fraction: distance from the core normalised by the max, so ~1 on the outer
  // shell and →0 toward the core. The interior-biased weight uses it to make surface travel dear.
  const radialFrac = new Float64Array(V)
  {
    let rMax = 0
    for (let i = 0; i < V; i++) {
      radialFrac[i] = Math.hypot(posArr[i * 3] - C[0], posArr[i * 3 + 1] - C[1], posArr[i * 3 + 2] - C[2])
      if (radialFrac[i] > rMax) rMax = radialFrac[i]
    }
    for (let i = 0; i < V; i++) radialFrac[i] /= rMax
  }
  // Adjacency in flat form (same neighbour order as `adjacency`) with the edge id of every slot, and
  // both edge weights precomputed: raw Euclidean length, and length × exterior penalty.
  const adjStart = new Int32Array(V + 1), adjTo = new Int32Array(E * 2), adjEdge = new Int32Array(E * 2)
  const edgeLen = new Float64Array(E), edgeContent = new Float64Array(E)
  {
    for (let e = 0; e < E; e++) { adjStart[edgeLo[e] + 1]++; adjStart[edgeHi[e] + 1]++ }
    for (let v = 0; v < V; v++) adjStart[v + 1] += adjStart[v]
    const fill = adjStart.slice(0, V)
    for (let e = 0; e < E; e++) {
      const u = edgeLo[e], v = edgeHi[e]
      adjTo[fill[u]] = v; adjEdge[fill[u]++] = e
      adjTo[fill[v]] = u; adjEdge[fill[v]++] = e
      edgeLen[e] = Math.sqrt(dist2(u, v))
      edgeContent[e] = Math.sqrt(dist2(u, v)) * (1 + 5.5 * 0.5 * (radialFrac[u] ** 3 + radialFrac[v] ** 3))
    }
  }
  const edgeKey = (u: number, v: number) => (u < v ? u * V + v : v * V + u)
  const edgeBetween = (u: number, v: number): number => {
    for (let s = adjStart[u], end = adjStart[u + 1]; s < end; s++) if (adjTo[s] === v) return adjEdge[s]
    return -1
  }

  const dist = new Float64Array(V), score = new Float64Array(V), prev = new Int32Array(V)
  const seenAt = new Uint32Array(V), doneAt = new Uint32Array(V)
  const heap = new Int32Array(E * 2 + 2) // every directed edge relaxes at most once
  let stamp = 0
  // A* over the lattice (lazy-deleting binary min-heap, straight-line distance as the heuristic).
  // The edge cost is weight[e], times (1 + CONGESTION · usage[e]) when a usage table is given.
  const CONGESTION = 2.6
  const search = (a: number, b: number, weight: Float64Array, usage: Float64Array | null): number[] | null => {
    if (a === b) return [a]
    if (++stamp === 0xffffffff) { seenAt.fill(0); doneAt.fill(0); stamp = 1 }
    seenAt[a] = stamp; dist[a] = 0; prev[a] = -1; score[a] = Math.sqrt(dist2(a, b))
    let n = 0
    heap[n++] = a
    let found = false
    while (n > 0) {
      const cur = heap[0], last = heap[--n]
      if (n > 0) {
        heap[0] = last
        for (let i = 0; ;) {
          const l = 2 * i + 1, r = l + 1
          let m = i
          if (l < n && score[heap[l]] < score[heap[m]]) m = l
          if (r < n && score[heap[r]] < score[heap[m]]) m = r
          if (m === i) break
          const t = heap[m]; heap[m] = heap[i]; heap[i] = t
          i = m
        }
      }
      if (doneAt[cur] === stamp) continue
      doneAt[cur] = stamp
      if (cur === b) { found = true; break }
      const dcur = dist[cur]
      for (let s = adjStart[cur], end = adjStart[cur + 1]; s < end; s++) {
        const nb = adjTo[s]
        if (doneAt[nb] === stamp) continue
        const e = adjEdge[s]
        const nd = dcur + (usage ? weight[e] * (1 + CONGESTION * usage[e]) : weight[e])
        if (seenAt[nb] !== stamp || nd < dist[nb]) {
          seenAt[nb] = stamp; dist[nb] = nd; score[nb] = nd + Math.sqrt(dist2(nb, b)); prev[nb] = cur
          let i = n
          heap[n++] = nb
          while (i > 0) {
            const p = (i - 1) >> 1
            if (score[heap[p]] <= score[heap[i]]) break
            const t = heap[p]; heap[p] = heap[i]; heap[i] = t
            i = p
          }
        }
      }
    }
    if (!found) return null
    const path: number[] = []
    for (let cur = b; cur !== -1; cur = prev[cur]) path.push(cur)
    return path.reverse()
  }
  // A cached single-weight pather, keyed by the unordered {a,b} pair.
  const makePather = (weight: Float64Array) => {
    const cache = new Map<number, number[] | null>()
    return (a: number, b: number): number[] | null => {
      if (a === b) return [a]
      const k = edgeKey(a, b)
      let p = cache.get(k)
      if (p === undefined) {
        p = search(a, b, weight, null)
        if (cache.size >= PATH_CACHE_MAX) cache.clear()
        cache.set(k, p)
      }
      return p
    }
  }
  const pathBetween = makePather(edgeLen)
  const pathThroughInterior = makePather(edgeContent)
  // Each chosen route adds load to the lattice edges it uses; the next route pays CONGESTION per
  // unit of load, so it fans out onto a parallel corridor instead of overlapping. The last batch
  // is remembered: the same pairs in the same order (re-opening the brain, rebuilding the scene)
  // get the same routes back without routing again.
  let lastPairs: Int32Array | null = null, lastRoutes: Map<number, number[]> | null = null
  const routeContentEdges = (pairs: Array<readonly [number, number]>): Map<number, number[]> => {
    const flat = new Int32Array(pairs.length * 2)
    for (let i = 0; i < pairs.length; i++) { flat[i * 2] = pairs[i][0]; flat[i * 2 + 1] = pairs[i][1] }
    if (lastPairs && lastRoutes && lastPairs.length === flat.length && lastPairs.every((v, i) => v === flat[i])) return new Map(lastRoutes)
    const usage = new Float64Array(E), routes = new Map<number, number[]>()
    for (const pr of pairs) {
      const k = edgeKey(pr[0], pr[1])
      if (routes.has(k)) continue
      const path = pr[0] === pr[1] ? [pr[0]] : search(pr[0], pr[1], edgeContent, usage)
      const seq = path && path.length >= 2 ? path : [pr[0], pr[1]]
      routes.set(k, seq)
      for (let i = 0; i < seq.length - 1; i++) { const id = edgeBetween(seq[i], seq[i + 1]); if (id >= 0) usage[id] += 1 }
    }
    lastPairs = flat; lastRoutes = routes
    return new Map(routes)
  }

  const edges = new Uint32Array(E * 2)
  for (let e = 0; e < E; e++) { edges[e * 2] = edgeLo[e]; edges[e * 2 + 1] = edgeHi[e] }
  return {
    positions: posArr, edges, faces: new Uint32Array(faces), regionOf: new Int8Array(regionOf), adjacency, vertexCount: V,
    verticesByRegion, interiorVertices, edgeW: new Float32Array(edgeWs), vertW: new Float32Array(vertW), cortex,
    kind: new Uint8Array(kind), surface: new Uint8Array(surface), center: [C[0], C[1], C[2]],
    boundCenter: [bx, by, bz], boundRadius, pathBetween, pathThroughInterior, routeContentEdges,
  }
}

// The shape is fixed, so one mesh serves every open of the brain for the whole session.
let cached: BrainMesh | null = null
export function getBrainMesh(): BrainMesh {
  if (!cached) cached = buildBrainMesh()
  return cached
}
