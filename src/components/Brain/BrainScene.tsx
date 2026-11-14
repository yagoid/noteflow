import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { useThemeStore } from '../../stores/themeStore'
import { readBrainPalette, type BrainPalette, type RGB } from './brainColors'
import { getBrainMesh, mulberry32 } from './brainMesh'
import {
  buildBrainData, entranceCoords, fibre, focusMask, outwardFaces, strongestEdges,
  TIER_FOLDER, TIER_GROUP, TIER_NOTE, type BrainData, type PlacedNode,
} from './brainData'
import { FLAG_CONTENT, FLAG_INTERIOR, opacityFlags, SegmentBuffer, toU8 } from './brainBuffers'
import { BRAIN_BUDGET, BRAIN_LOOK, CENTER_SIZE, RING_SIZE, softNode } from './brainLook'
import { DOT_FS, DOT_VS, GRADE_FS, GRADE_VS, LINE_FS, LINE_VS, NODE_FS, NODE_VS } from './brainShaders'
import type { BrainGraphModel } from './useBrainGraph'

interface Props {
  model: BrainGraphModel
  showContentEdges: boolean
  onOpenNote: (noteId: string, sectionId?: string) => void
  onOpenGroup: (groupId: string) => void
  highlightedNoteIds?: Set<string>   // notes cited by the latest chat answer — kept "lit"
  thinking?: boolean                 // chat is streaming a reply — auto-sweep content relations
  // Clicking a note/section node reports it (with the click position) so a pinned
  // preview card can open next to it.
  onNodeActivate: (noteId: string, sectionId: string | undefined, clientX: number, clientY: number) => void
}

interface SceneApi {
  rebuildData: (m: BrainGraphModel) => void
  syncLoop: () => void
}

type Uniforms = Record<string, THREE.IUniform>

const L = BRAIN_LOOK
const RING_BY_TIER = [RING_SIZE.group, RING_SIZE.folder, RING_SIZE.note, RING_SIZE.section]

// Debug handle for calibration and perf harnesses. Set localStorage['noteflow:brain-debug'] = '1'
// and (re)open the brain: `window.__nfBrain` then exposes the camera, the controls, the renderer,
// the shared uniforms, the mesh and a few switches (see the end of the scene effect). Nothing is
// exposed, and nothing runs, unless the key is set.
const DEBUG_KEY = 'noteflow:brain-debug'

// Draw order. three sorts transparent objects that share a renderOrder by the depth of their
// bounding sphere, which for these layers (all spanning the whole brain) would be arbitrary, so
// every layer gets a slot of its own. The depth skin is opaque and therefore always drawn first.
const ORDER = {
  skin: -20,
  farLines: -9, farDots: -8.9, motes: -8.8,
  floor: -8,
  wire: 0, wireHidden: 0.1, dots: 0.2, dotsHidden: 0.3, synapses: 0.4, sparks: 0.5,
  routes: 1, routesHidden: 1.1, // structure routes and dendrites, one draw each
  impulses: 2, glow: 2.1, sweeps: 2.2,
  nodes: 3, nodesHidden: 3.1,
  marker: 4,
} as const

const SWEEP_FREE = 0, SWEEP_HOVER = 1, SWEEP_THINK = 2
const LABEL_BINS = 256
const FONT_UI = "'Inter',system-ui,sans-serif"
// The app's own UI font (it follows the theme; see tailwind.config.js → fontFamily.mono).
const FONT_APP = "var(--app-font-family,'JetBrains Mono','Fira Code','Cascadia Code',monospace)"
// Longhands on purpose: a `font` shorthand holding a var() leaves style.fontWeight empty, and the
// capture scripts find the hovered note's label by its inline font-weight (400) and opacity (1).
const LABEL_FONT = [
  `font-family:${FONT_APP};font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;`, // group
  `font-family:${FONT_UI};font-size:10.5px;font-weight:500;`, // folder
  `font-family:${FONT_UI};font-size:11px;font-weight:400;`,   // note
  `font-family:${FONT_UI};font-size:10px;font-weight:400;`,   // section
]

// A placeholder for layers that currently have nothing to draw (their mesh stays invisible).
const EMPTY_GEOMETRY = new THREE.BufferGeometry()

// Theme colours are sRGB triples and are used AS THEY ARE: no conversion to linear on the way in
// and none on the way out (see the colour pipeline note in the scene effect). setRGB without a
// colour space argument takes the numbers as working-space values, i.e. untouched.
const rawColor = ([r, g, b]: RGB) => new THREE.Color().setRGB(r / 255, g / 255, b / 255)
const luma = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
// (Color.getStyle() would convert to sRGB: these values already are.)
const cssColor = (c: THREE.Color) => `rgb(${Math.round(c.r * 255)} ${Math.round(c.g * 255)} ${Math.round(c.b * 255)})`
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function canvasTexture(draw: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const s = 64
  const c = document.createElement('canvas')
  c.width = c.height = s
  draw(c.getContext('2d')!, s)
  const tex = new THREE.CanvasTexture(c)
  tex.needsUpdate = true
  return tex
}
// A soft round sprite (ambient sparks).
const makeDotTexture = () => canvasTexture((ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.9)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
})
// A hollow ring (the marker of the focused node).
const makeRingTexture = () => canvasTexture((ctx, s) => {
  ctx.strokeStyle = 'rgba(255,255,255,1)'
  ctx.lineWidth = 6
  ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2 - 7, 0, Math.PI * 2); ctx.stroke()
})
// A wide falloff (the light inside the brain and the pool on the floor).
const makeGlowTexture = () => canvasTexture((ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.42)')
  g.addColorStop(0.6, 'rgba(255,255,255,0.1)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
})

/** One instanced quad per segment (see LINE_VS for the layout). */
function segmentGeometry(segments: SegmentBuffer): THREE.InstancedBufferGeometry {
  const d = segments.finish()
  const g = new THREE.InstancedBufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 0, 1, 0, 1, -1, 0, 1, 1, 0], 3))
  g.setIndex([0, 1, 2, 2, 1, 3])
  g.setAttribute('aA', new THREE.InstancedBufferAttribute(d.a, 3))
  g.setAttribute('aB', new THREE.InstancedBufferAttribute(d.b, 3))
  g.setAttribute('aCol', new THREE.InstancedBufferAttribute(d.col, 4, true))
  // A buffer built without arcs simply has no aArc: the attribute stays disabled and reads as a
  // constant. Only layers whose material ignores the arc (no sweep, no pulses) may do that.
  if (d.arc) g.setAttribute('aArc', new THREE.InstancedBufferAttribute(d.arc, 2))
  g.setAttribute('aRevPh', new THREE.InstancedBufferAttribute(d.rev, 4, true))
  g.setAttribute('aWidth', new THREE.InstancedBufferAttribute(d.width, 1))
  g.instanceCount = d.count
  return g
}

// Cheap, permanent timing marks: `brain:mesh`, `brain:data`, `brain:scene` (DevTools → Performance,
// or performance.getEntriesByName). Only the latest of each is kept.
function measure(name: string, start: number) {
  try {
    performance.clearMeasures(name)
    performance.measure(name, { start, end: performance.now() })
  } catch { /* User Timing unavailable: nothing to record */ }
}

function debugEnabled(): boolean {
  try { return localStorage.getItem(DEBUG_KEY) === '1' } catch { return false }
}

/**
 * Three.js renderer for the immersive 3D brain. Imperative setup in a useEffect (container +
 * ResizeObserver + rAF), lazy-loaded by BrainView so `three` only ships in this chunk.
 *
 * WHAT IS DRAWN. Only wire and points — no shaded surface. The brain is the fixed mesh of
 * brainMesh.ts: its edges as soft lines, its vertices as dots, the notes as ring nodes pinned to
 * vertices, structure routes and relations as coloured lines over the lattice.
 *
 * OCCLUSION. The mesh's faces are drawn first as an invisible skin that only writes depth. Every
 * layer on the brain is then drawn twice from the same geometry: once where it passes the depth
 * test (in front of the skin) and once, much fainter, where it fails it (behind the surface: the
 * far side and the interior). That gives a real near surface with the rest showing through.
 *
 * STATIC VS DATA. The scaffold (skin, wire, dots, backdrop) depends on the mesh and the theme
 * only, and is built once per mount. The data layer (routes, dendrites, synapses, impulses,
 * nodes) is rebuilt by `rebuildData` when the graph changes: its materials and meshes persist and
 * only their geometries are swapped.
 *
 * MOTION is all uniforms: the entrance, the pulses, the ripples, the focus dim. The loop writes
 * no vertex buffer except the six ambient sparks, and allocates nothing per frame.
 */
export function BrainScene({ model, showContentEdges, onOpenNote, onOpenGroup, highlightedNoteIds, thinking, onNodeActivate }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  const activeThemeId = useThemeStore((s) => s.activeThemeId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const palette = useMemo<BrainPalette>(() => readBrainPalette(), [activeThemeId])

  // Mutable inputs the rAF loop / handlers read without tearing down the scene.
  const renderRef = useRef({ model, showContentEdges, palette, onOpenNote, onOpenGroup, highlightedNoteIds, thinking, onNodeActivate })
  renderRef.current = { model, showContentEdges, palette, onOpenNote, onOpenGroup, highlightedNoteIds, thinking, onNodeActivate }
  const apiRef = useRef<SceneApi | null>(null)
  // The entrance plays once per mount of the component: not again when the theme or the notes change.
  const introPlayedRef = useRef(false)
  // Whether the app window is on screen, as last heard from the main process (see the loop control
  // in the scene effect). It lives here and not in that effect because a theme change rebuilds the
  // scene, and it can arrive while the window is hidden (UI settings coming in with a sync pull):
  // the rebuilt scene must find the window still hidden, not assume it is visible and start drawing.
  const windowVisibleRef = useRef(true)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const sceneStart = performance.now()
    const pal = renderRef.current.palette
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    let reduced = motionQuery.matches

    const disposables: Array<{ dispose: () => void }> = []
    const track = <T extends { dispose: () => void }>(x: T): T => { disposables.push(x); return x }

    // ── colour pipeline ──
    // The look was tuned on a renderer with no colour management: sRGB theme triples go in as they
    // are, blend in gamma space and come out as they are. To keep those numbers valid here, colours
    // are created without conversion (rawColor), the renderer does not encode on output
    // (LinearSRGBColorSpace) and the composer works on an 8-bit target, which clips at 1 like the
    // original did (three's default half-float target would not, and would feed the bloom
    // differently — at twice the memory).
    const bg = rawColor(pal.bg), text = rawColor(pal.text)
    const bgLum = luma(bg)
    const isDark = bgLum < 0.5
    // Glow adds up on a dark background; on a light one there is nothing to add to, so those
    // layers fall back to normal blending.
    const glowBlend = isDark ? THREE.AdditiveBlending : THREE.NormalBlending
    const edgeOpacity = (base: number) => (isDark ? base : Math.min(L.color.lightOpacityMax, base * L.color.lightOpacity))
    const energy = L.color.energy
    const colorCache = new Map<string, THREE.Color>()
    // A group/tag colour (theme var or free '#rrggbb'), desaturated; darkened on light themes.
    const colorOf = (cssVar: string): THREE.Color => {
      let c = colorCache.get(cssVar)
      if (!c) {
        c = rawColor(pal.color(cssVar))
        if (cssVar !== '--text') {
          const g = luma(c), s = L.color.saturation
          c.setRGB(g + (c.r - g) * s, g + (c.g - g) * s, g + (c.b - g) * s)
        }
        if (!isDark) c.multiplyScalar(L.color.lightDarken)
        colorCache.set(cssVar, c)
      }
      return c
    }

    // ── renderer / scene / camera ──
    // No MSAA: the scene is drawn into the composer's target (where the default framebuffer's
    // multisampling does nothing) and the lines antialias themselves in the shader.
    let dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = container.clientWidth, H = container.clientHeight
    const renderer = new THREE.WebGLRenderer({ antialias: false })
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace
    renderer.setPixelRatio(dpr)
    renderer.setClearColor(bg, 1) // canvas background = theme bg, never black
    renderer.setSize(Math.max(1, W), Math.max(1, H))
    const canvas = renderer.domElement
    canvas.style.cursor = 'grab'
    container.appendChild(canvas)

    const scene = new THREE.Scene()
    scene.background = bg

    // The scaffold: one fixed mesh, built once per session.
    const meshStart = performance.now()
    const mesh = getBrainMesh()
    measure('brain:mesh', meshStart)
    const P = mesh.positions, V = mesh.vertexCount
    const rev = entranceCoords(mesh)
    const [cx, cy, cz] = mesh.boundCenter
    const radius = mesh.boundRadius

    const camera = new THREE.PerspectiveCamera(L.camera.fov, W > 0 && H > 0 ? W / H : 1, 0.1, 100)
    camera.position.set(L.camera.position[0], L.camera.position[1], L.camera.position[2])
    const controls = new OrbitControls(camera, canvas)
    controls.enableDamping = true
    controls.dampingFactor = L.camera.damping
    controls.enablePan = false
    controls.minDistance = L.camera.minDistance
    controls.maxDistance = L.camera.maxDistance
    controls.target.set(L.camera.target[0], L.camera.target[1], L.camera.target[2])
    controls.autoRotate = !reduced
    controls.autoRotateSpeed = L.motion.rotate
    // A narrow window pulls the camera back so the brain still fits; label tiers scale with it.
    let fitK = 1
    const fitCamera = () => {
      const k = W > 0 && H > 0 ? Math.max(1, L.camera.fitAspect / (W / H)) : 1
      camera.position.sub(controls.target).multiplyScalar(k / fitK).add(controls.target)
      controls.maxDistance = L.camera.maxDistance * k
      fitK = k
    }
    fitCamera()

    // ── uniforms shared by every material ──
    const U = {
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector3(cx, cy, cz) },
      uRadius: { value: radius },
      uReveal: { value: 2 },
      uRevealOn: { value: 0 },
      // Four ripples as flat xyzw (w = start time, < 0 = unused). A mat4 in the shader, one ripple
      // per column: unlike an array uniform, three caches a matrix and only uploads it when a
      // ripple fires, not on every material switch.
      uWaves: { value: new Float32Array([0, 0, 0, -1, 0, 0, 0, -1, 0, 0, 0, -1, 0, 0, 0, -1]) },
      uWaveGain: { value: Math.max(L.motion.waveGain, L.hoverWave) },
      uFade: { value: new THREE.Vector2(L.fade[0], L.fade[1]) },
      uZBias: { value: L.zBias },
      uRes: { value: new THREE.Vector2(Math.max(1, W) * dpr, Math.max(1, H) * dpr) },
      uPx: { value: dpr },
      uScale: { value: Math.max(1, H) * dpr * 0.5 },
      uShowContent: { value: renderRef.current.showContentEdges ? 1 : 0 },
      uFocusAmt: { value: 0 },
      // The cited-note signal's clock and how much each node's seed offsets it: (time, 1) normally,
      // (a constant, 0) with reduced motion, where the signal is a still picture (see the loop).
      uLit: { value: new THREE.Vector2(0, 1) },
    }
    const shared = (): Uniforms => ({
      uTime: U.uTime, uCenter: U.uCenter, uRadius: U.uRadius, uReveal: U.uReveal, uRevealOn: U.uRevealOn,
      uWaves: U.uWaves, uWaveGain: U.uWaveGain, uFade: U.uFade, uZBias: U.uZBias,
    })

    // ── material factories: three programs for the whole brain (lines, dots, nodes) ──
    interface LineOpts {
      width: number; opacity: number; back?: number; depthW?: number; interior?: number; mul?: number
      revGlow?: number; near?: number; flow?: number; flowBase?: number; freq?: number; speed?: number; len?: number
      head?: number; tail?: number; boost?: number; add?: boolean; depthTest?: boolean; depthFunc?: THREE.DepthModes
      skipInterior?: boolean  // this pass never shows the inner lattice: drop it in the vertex shader
      skipBelow?: number      // …or surface segments no wider than this (their aWidth)
    }
    // (The parameters of a layer go packed in vec4s: see the note at the top of brainShaders.ts.
    // Every material is double-sided, points included, so the cull state never flips between
    // layers. three draws a transparent double-sided material twice, back faces then front faces,
    // unless told otherwise: ShaderMaterial opts out by itself, the built-in materials further
    // down need `forceSinglePass`.)
    const lineMaterial = (o: LineOpts) => track(new THREE.ShaderMaterial({
      uniforms: {
        ...shared(), uRes: U.uRes, uPx: U.uPx, uShowContent: U.uShowContent,
        uShape: { value: new THREE.Vector4(o.width, o.depthW ?? 0, o.interior ?? 1, o.back ?? 1) },
        uTone: { value: new THREE.Vector4(o.mul ?? 1, o.revGlow ?? 0, o.near ?? 0, o.boost ?? 0) },
        uCull: { value: new THREE.Vector2(o.skipInterior ? 1 : 0, o.skipBelow ?? 0) },
        uOpacity: { value: o.opacity }, uAA: { value: L.aa },
        uFlow: { value: new THREE.Vector4(o.flow ?? 0, o.flowBase ?? 1, o.freq ?? 1, o.speed ?? 0) },
        uSweep: { value: new THREE.Vector4(o.len ?? 0.3, o.head ?? 99, 1, o.tail ?? 1) }, // y = head, z = envelope
      },
      vertexShader: LINE_VS, fragmentShader: LINE_FS, transparent: true, depthWrite: false,
      depthTest: o.depthTest === true, depthFunc: o.depthFunc ?? THREE.LessEqualDepth,
      blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide,
    }))
    interface DotOpts {
      size: number; opacity: number; color: THREE.Color; soft: number; back?: number; interior?: number
      weighted?: boolean; boost?: number; near?: number; depthTest: boolean; depthFunc?: THREE.DepthModes
    }
    const dotMaterial = (o: DotOpts) => track(new THREE.ShaderMaterial({
      uniforms: {
        ...shared(), uScale: U.uScale,
        uDot: { value: new THREE.Vector4(o.size, o.back ?? 1, o.interior ?? 1, o.weighted ? 1 : 0) },
        uAnim: { value: new THREE.Vector4(0, 0, o.boost ?? 0, o.near ?? 0) }, // x = twinkle, y = drift (see applyMotion)
        uColor: { value: o.color.clone() }, uOpacity: { value: o.opacity }, uSoft: { value: o.soft },
      },
      vertexShader: DOT_VS, fragmentShader: DOT_FS, transparent: true, depthWrite: false,
      depthTest: o.depthTest, depthFunc: o.depthFunc ?? THREE.LessEqualDepth, blending: glowBlend, side: THREE.DoubleSide,
    }))
    interface NodeOpts { ext: number; back: number; add?: boolean; depthTest: boolean; depthFunc?: THREE.DepthModes; opacity?: number }
    // How far a plain halo reaches, in ring radii: it is exp(-d² / (glowSize² · 0.2)) · glow, at
    // most (1 + 1.5 · ripples) times that with four ripples passing at once, and the shader
    // discards anything under 0.004. Past that radius (plus a margin) the sprite would only be
    // fragments to throw away, so the halo of a node that is not cited stops there.
    const haloGlow = (isDark ? L.nodes.glow : L.nodes.glow * L.nodes.glowLight) * energy
    const haloPeak = haloGlow * (1 + 1.5 * 4 * U.uWaveGain.value)
    const haloCut = 1.05 * L.nodes.glowSize * Math.sqrt(0.2 * Math.log(Math.max(Math.E, haloPeak / 0.004)))
    const nodeMaterial = (mode: 0 | 1, o: NodeOpts) => track(new THREE.ShaderMaterial({
      uniforms: {
        ...shared(), uScale: U.uScale, uFocusAmt: U.uFocusAmt, uLit: U.uLit,
        uNode: { value: new THREE.Vector4(o.ext, o.back, mode, o.opacity ?? 1) },
        uDimTo: { value: 1 - L.focusDim }, uCore: { value: CENTER_SIZE * L.nodes.core }, uWaveSize: { value: L.nodes.waveSize },
        uRingW: { value: L.nodes.ringW }, uCoreSoft: { value: L.nodes.coreSoft },
        uGlow: { value: haloGlow }, uGlowSize: { value: L.nodes.glowSize }, uHaloCut: { value: haloCut },
      },
      vertexShader: NODE_VS, fragmentShader: NODE_FS, transparent: true, depthWrite: false,
      depthTest: o.depthTest, depthFunc: o.depthFunc ?? THREE.LessEqualDepth,
      blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide,
    }))
    const addMesh = (geo: THREE.BufferGeometry, mat: THREE.Material, order: number) => {
      const m = new THREE.Mesh(geo, mat)
      m.frustumCulled = false; m.renderOrder = order
      scene.add(m)
      return m
    }
    const addPoints = (geo: THREE.BufferGeometry, mat: THREE.Material, order: number) => {
      const p = new THREE.Points(geo, mat)
      p.frustumCulled = false; p.renderOrder = order
      scene.add(p)
      return p
    }
    // Materials whose opacity follows the focus dim (uOpacity = base × dim, every frame).
    const dimmed: Array<{ u: THREE.IUniform; base: number }> = []
    const dims = (mat: THREE.ShaderMaterial) => { dimmed.push({ u: mat.uniforms.uOpacity, base: mat.uniforms.uOpacity.value }); return mat }

    const dotTex = track(makeDotTexture()), ringTex = track(makeRingTexture())

    // ════════════════ static scaffold (mesh + theme only) ════════════════

    // ── depth skin: invisible, writes depth only. Pushed slightly back (polygon offset) while
    // everything on the surface is pulled slightly forward (uZBias). Front faces are enough, at
    // half the fill of drawing both sides: with every part wound outwards (outwardFaces sees to
    // that) and the cerebrum and the cerebellum closed, the nearest surface along a ray is a front
    // face. (The brainstem, a tube open at its ends, comes in both windings from outwardFaces.) ──
    const positionAttr = new THREE.BufferAttribute(P, 3)
    {
      const g = track(new THREE.BufferGeometry())
      g.setAttribute('position', positionAttr)
      g.setIndex(new THREE.BufferAttribute(outwardFaces(mesh), 1))
      const skin = new THREE.Mesh(g, track(new THREE.MeshBasicMaterial({
        colorWrite: false, depthWrite: true, depthTest: true, side: THREE.FrontSide,
        polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2,
      })))
      skin.frustumCulled = false; skin.renderOrder = ORDER.skin
      scene.add(skin)
    }

    // ── scaffold wire: the outline of a gyrus is the bright line (weight 1), edges inside a gyrus
    // are dimmer, inside a sulcus almost gone; weight-0 seams are routed over but never drawn. ──
    const wireCol = text.clone().lerp(bg, isDark ? L.wire.lerp : L.wire.lerpLight)
    const wireBase = isDark ? L.wire.opacity : L.wire.light
    let wireCount = 0
    let wireMat: THREE.ShaderMaterial
    {
      const E = mesh.edges.length / 2
      // No arc: this material draws the whole line with no sweep and no pulses, so 8 of the 44
      // bytes per segment would be dead weight on the largest buffer of the scene.
      const S = new SegmentBuffer(E, false)
      for (let e = 0; e < E; e++) {
        const ew = mesh.edgeW[e]
        if (ew <= 0) continue
        const u = mesh.edges[e * 2], w = mesh.edges[e * 2 + 1]
        const inner = mesh.surface[u] === 0 || mesh.surface[w] === 0
        let r: number, g: number, b: number
        if (isDark) {
          const k = Math.min(1, ew) // additive: weight scales the brightness
          r = wireCol.r * k; g = wireCol.g * k; b = wireCol.b * k
        } else {
          const k = Math.min(1, L.wire.lightFloor + (1 - L.wire.lightFloor) * ew) // normal blending: weight fades toward the paper
          r = lerp(bg.r, wireCol.r, k); g = lerp(bg.g, wireCol.g, k); b = lerp(bg.b, wireCol.b, k)
        }
        S.add(
          P[u * 3], P[u * 3 + 1], P[u * 3 + 2], P[w * 3], P[w * 3 + 1], P[w * 3 + 2],
          r, g, b, inner ? FLAG_INTERIOR : 0, 0, 0, rev[u], rev[w], 0, 1, L.wire.widthBase + L.wire.widthByWeight * ew,
        )
      }
      wireCount = S.count
      const geo = track(segmentGeometry(S))
      const o: LineOpts = {
        width: L.wire.width, opacity: wireBase, back: L.wire.back, depthW: L.wire.depthW, interior: L.wire.interior,
        boost: L.wire.boost, revGlow: L.wire.revealGlow, add: isDark, depthTest: true,
      }
      // Each pass drops, before any vertex work, the segments it would not show anyway. The visible
      // pass: the inner lattice, which lies behind the skin and fails the depth test (but for a
      // stub of a few pixels at some surface vertices, under their dots). The hidden pass, on dark
      // themes: the faintest surface edges (inside a sulcus), which at hidden opacity add under one
      // grey level; on a light theme they tint the paper enough to notice, so they stay.
      wireMat = lineMaterial({ ...o, skipInterior: true })
      addMesh(geo, wireMat, ORDER.wire)
      addMesh(geo, dims(lineMaterial({
        ...o, opacity: (wireBase * L.wire.hiddenOpacity) / Math.max(L.wire.opacity, 0.01),
        interior: L.wire.hiddenInterior, depthFunc: THREE.GreaterDepth,
        skipBelow: isDark ? L.wire.widthBase + L.wire.widthByWeight * L.wire.hiddenMinWeight : 0,
      })), ORDER.wireHidden)
    }

    // ── vertex dots (same positions as the skin: one shared buffer) ──
    {
      const attr = new Uint8Array(V * 4)
      const rng = mulberry32(7)
      for (let v = 0; v < V; v++) {
        attr[v * 4] = mesh.surface[v] ? 0 : 255
        attr[v * 4 + 1] = toU8(rev[v])
        attr[v * 4 + 2] = toU8(rng())
        attr[v * 4 + 3] = toU8(mesh.vertW[v])
      }
      const g = track(new THREE.BufferGeometry())
      g.setAttribute('position', positionAttr)
      g.setAttribute('aDot', new THREE.BufferAttribute(attr, 4, true))
      const o: DotOpts = {
        size: L.dots.size, opacity: isDark ? L.dots.opacity : L.dots.light, color: wireCol, soft: L.dots.soft,
        back: L.dots.back, interior: L.dots.interior, weighted: isDark, boost: L.dots.boost, depthTest: true,
      }
      addPoints(g, dims(dotMaterial(o)), ORDER.dots)
      addPoints(g, dims(dotMaterial({
        ...o, opacity: L.dots.hiddenOpacity, back: 1, interior: L.dots.hiddenInterior, depthFunc: THREE.GreaterDepth,
      })), ORDER.dotsHidden)
    }

    // ── backdrop: far constellation + motes (both themes) ──
    const B = L.background
    let farCount = 0
    let farMat: THREE.ShaderMaterial | null = null
    const clouds: Array<{ mat: THREE.ShaderMaterial; twinkle: number; drift: number }> = []
    {
      const cloud = (pos: Float32Array, seed: number, o: typeof B.farDots | typeof B.motes, order: number) => {
        const n = pos.length / 3
        const attr = new Uint8Array(n * 4)
        const rng = mulberry32(seed)
        for (let i = 0; i < n; i++) { attr[i * 4 + 1] = toU8(0.5); attr[i * 4 + 2] = toU8(rng()) }
        const g = track(new THREE.BufferGeometry())
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
        g.setAttribute('aDot', new THREE.BufferAttribute(attr, 4, true))
        const mat = dotMaterial({
          size: o.size, opacity: isDark ? o.opacity : o.opacityLight, color: wireCol.clone().lerp(bg, isDark ? o.lerp : o.lerpLight),
          soft: o.soft, near: o.near, depthTest: false,
        })
        addPoints(g, mat, order)
        clouds.push({ mat, twinkle: o.twinkle, drift: o.drift })
      }
      // The random stream is consumed in a fixed order (points, then links, then motes): the
      // backdrop is the same on every open.
      const rng = mulberry32(20260711)
      const N = B.far.count
      const far = new Float64Array(N * 4) // xyz + how far out (0..1)
      for (let i = 0; i < N; i++) {
        const u = rng() * 2 - 1, th = rng() * Math.PI * 2, sq = Math.sqrt(1 - u * u), r = B.far.radius + rng() * B.far.spread
        far[i * 4] = cx + sq * Math.cos(th) * r
        far[i * 4 + 1] = cy + u * r * B.far.flatten
        far[i * 4 + 2] = cz + sq * Math.sin(th) * r
        far[i * 4 + 3] = (r - B.far.radius) / B.far.spread
      }
      // each point links to its two nearest neighbours, if they are close enough
      const range = isDark ? B.far.lerp : B.far.lerpLight
      const S = new SegmentBuffer(N * 2)
      const linked = new Set<number>()
      const maxQ = B.far.link * B.far.link
      for (let i = 0; i < N; i++) {
        let j0 = -1, j1 = -1, q0 = Infinity, q1 = Infinity
        for (let j = 0; j < N; j++) {
          if (j === i) continue
          const q = (far[i * 4] - far[j * 4]) ** 2 + (far[i * 4 + 1] - far[j * 4 + 1]) ** 2 + (far[i * 4 + 2] - far[j * 4 + 2]) ** 2
          if (q < q0) { q1 = q0; j1 = j0; q0 = q; j0 = j } else if (q < q1) { q1 = q; j1 = j }
        }
        for (let n = 0; n < 2; n++) {
          const j = n === 0 ? j0 : j1, q = n === 0 ? q0 : q1
          if (j < 0 || q > maxQ) continue
          const key = i < j ? i * N + j : j * N + i
          if (linked.has(key)) continue
          linked.add(key)
          // one colour per segment: the mean of its two ends (farther out = closer to the background)
          const f = (lerp(range[0], range[1], far[i * 4 + 3]) + lerp(range[0], range[1], far[j * 4 + 3])) / 2
          const phase = rng(), rate = 0.5 + rng()
          S.add(
            far[i * 4], far[i * 4 + 1], far[i * 4 + 2], far[j * 4], far[j * 4 + 1], far[j * 4 + 2],
            lerp(wireCol.r, bg.r, f), lerp(wireCol.g, bg.g, f), lerp(wireCol.b, bg.b, f), 0, 0, 1, 0.5, 0.5, phase, rate, 1,
          )
        }
      }
      farCount = S.count
      if (S.count) {
        farMat = lineMaterial({
          width: 1, opacity: isDark ? B.far.opacity : B.far.opacityLight, back: 1, near: B.far.near,
          flow: B.far.flow, freq: B.far.freq, speed: B.far.speed, len: B.far.len, add: isDark, depthTest: false,
        })
        addMesh(track(segmentGeometry(S)), farMat, ORDER.farLines)
      }
      const farPos = new Float32Array(N * 3)
      for (let i = 0; i < N; i++) { farPos[i * 3] = far[i * 4]; farPos[i * 3 + 1] = far[i * 4 + 1]; farPos[i * 3 + 2] = far[i * 4 + 2] }
      cloud(farPos, 11, B.farDots, ORDER.farDots)
      const M = B.motes.count, motePos = new Float32Array(M * 3)
      for (let i = 0; i < M; i++) {
        const u = rng() * 2 - 1, th = rng() * Math.PI * 2, sq = Math.sqrt(1 - u * u), r = radius * (B.motes.inner + rng() * B.motes.spread)
        motePos[i * 3] = cx + sq * Math.cos(th) * r
        motePos[i * 3 + 1] = cy + u * r * B.motes.flatten
        motePos[i * 3 + 2] = cz + sq * Math.sin(th) * r
      }
      cloud(motePos, 23, B.motes, ORDER.motes)
    }

    // ── light: a glow inside the brain and a pool on the floor (dark themes only) ──
    // The inner glow is a camera-facing disc of light centred a little below the brain's centre,
    // wide enough to cover most of the screen. It is not drawn here: as an additive sprite it cost
    // a draw over ~60 % of the pixels, so the grade pass adds it analytically (uCore / uCoreCol,
    // refreshed every frame from where that centre projects and how far it is).
    const coreColor = text.clone().lerp(rawColor(pal.color('--accent')), L.atmos.coreAccent)
    const coreBase = isDark ? L.atmos.coreOpacity * L.atmos.core : 0
    const coreY = cy + L.atmos.coreDy, coreHalf = (radius * L.atmos.coreScale) / 2
    let floorMat: THREE.MeshBasicMaterial | null = null
    if (isDark) {
      // Two concentric horizontal quads (a wide pool and a hot centre) in one geometry: one draw.
      const fy = B.floor.y, fz = cz + B.floor.dz
      const pos: number[] = [], uv: number[] = [], index: number[] = []
      for (const [sx, sz] of [B.floor.size, B.floor.hot]) {
        const o = pos.length / 3
        pos.push(cx - sx / 2, fy, fz - sz / 2, cx + sx / 2, fy, fz - sz / 2, cx - sx / 2, fy, fz + sz / 2, cx + sx / 2, fy, fz + sz / 2)
        uv.push(0, 0, 1, 0, 0, 1, 1, 1)
        index.push(o, o + 1, o + 2, o + 2, o + 1, o + 3)
      }
      const g = track(new THREE.BufferGeometry())
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
      g.setIndex(index)
      floorMat = track(new THREE.MeshBasicMaterial({
        map: track(makeGlowTexture()), color: text, transparent: true, opacity: B.floor.opacity, blending: THREE.AdditiveBlending,
        depthWrite: false, depthTest: false, fog: false, side: THREE.DoubleSide, forceSinglePass: true,
      }))
      addMesh(g, floorMat, ORDER.floor)
    }

    // ════════════════ data layer (rebuilt when the graph changes) ════════════════
    // Materials and meshes live as long as the scene; rebuildData only swaps geometries.
    interface Layer { objects: Array<THREE.Mesh | THREE.Points>; geo: THREE.BufferGeometry | null; count: number }
    const makeLayer = (...objects: Array<THREE.Mesh | THREE.Points>): Layer => {
      for (const o of objects) o.visible = false
      return { objects, geo: null, count: 0 }
    }
    const setLayer = (layer: Layer, geo: THREE.BufferGeometry | null, count: number) => {
      if (layer.geo) layer.geo.dispose()
      layer.geo = geo
      layer.count = count
      for (const o of layer.objects) { o.geometry = geo ?? EMPTY_GEOMETRY; o.visible = geo !== null && count > 0 }
    }
    const setSegments = (layer: Layer, S: SegmentBuffer) => setLayer(layer, S.count ? segmentGeometry(S) : null, S.count)

    const routeFlow = L.routes.flow * energy
    const routeOpts: LineOpts = {
      width: L.routes.width, opacity: edgeOpacity(L.routes.opacity * energy), back: L.routes.back, mul: L.routes.mul,
      flow: routeFlow, freq: L.routes.freq, speed: L.routes.speed, len: L.routes.len, revGlow: L.routes.revealGlow, depthTest: true,
    }
    const routesMat = dims(lineMaterial(routeOpts))
    const routesHiddenMat = dims(lineMaterial({ ...routeOpts, opacity: routeOpts.opacity * L.routes.hiddenOpacity, depthFunc: THREE.GreaterDepth }))
    // Dendrites are drawn by the routes' two materials (one draw call less per pass): what sets
    // them apart — a thinner line, a lower opacity — travels per segment.
    const dendWidth = L.dend.width / L.routes.width
    const dendFlags = opacityFlags(edgeOpacity(L.dend.opacity * energy) / routeOpts.opacity)
    // On a light theme, what has no group colour is drawn in a soft neutral (see color.lightNeutral).
    const neutralInk = text.clone().lerp(bg, L.color.lightNeutral)
    const branchColor = (colorVar: string) => (!isDark && colorVar === '--text' ? neutralInk : colorOf(colorVar))
    // Synapses and impulses ignore depth: relations travel through the interior and must read.
    const synMat = dims(lineMaterial({ width: L.syn.width, opacity: isDark ? L.syn.opacity : L.syn.light, back: L.syn.back, depthTest: false }))
    const synDim = dimmed[dimmed.length - 1] // its entry in the focus-dim list: `base` is its resting opacity
    let synAll = 0, synUser = 0              // segments in the synapse layer: all, and those of user relations
    // Light themes only: thin the synapses out as they get denser (see syn.lightRef). What counts
    // is what shows: with content relations hidden, only the user's.
    const fitSynapses = () => {
      if (isDark) return
      const shown = U.uShowContent.value > 0.5 ? synAll : synUser
      const k = shown > 0 ? Math.min(1, Math.max(L.syn.lightMin, Math.sqrt(L.syn.lightRef / shown))) : 1
      synDim.base = L.syn.light * k
      needsRender = true
    }
    const impulseMat = lineMaterial({
      width: L.impulse.width, opacity: L.impulse.opacity, back: L.impulse.back, flow: L.syn.impulses * energy, flowBase: 0,
      freq: L.impulse.freq, speed: L.impulse.speed, len: L.impulse.len, add: isDark, depthTest: false,
    })
    const flowing = [routesMat, routesHiddenMat] // pulses down the branches

    const routesLayer = makeLayer(addMesh(EMPTY_GEOMETRY, routesMat, ORDER.routes), addMesh(EMPTY_GEOMETRY, routesHiddenMat, ORDER.routesHidden))
    let routeCount = 0, dendCount = 0 // what routesLayer holds, by kind
    const synLayer = makeLayer(addMesh(EMPTY_GEOMETRY, synMat, ORDER.synapses))
    const impulseLayer = makeLayer(addMesh(EMPTY_GEOMETRY, impulseMat, ORDER.impulses))
    // Nodes: the halo ignores depth (it glows through), the node itself is occluded by the surface
    // and drawn faintly where hidden.
    const nodeLayer = makeLayer(
      addPoints(EMPTY_GEOMETRY, nodeMaterial(1, { ext: L.nodes.glowExtent, back: L.nodes.glowBack, add: isDark, depthTest: false }), ORDER.glow),
      addPoints(EMPTY_GEOMETRY, nodeMaterial(0, { ext: L.nodes.extent, back: L.nodes.back, depthTest: true }), ORDER.nodes),
      addPoints(EMPTY_GEOMETRY, nodeMaterial(0, { ext: L.nodes.extent, back: L.nodes.back, depthTest: true, depthFunc: THREE.GreaterDepth, opacity: L.nodes.hiddenAlpha }), ORDER.nodesHidden),
    )

    // ── sweeps: the relations of the hovered node / of the notes the chat is "thinking" about.
    // A fixed pool of slots (one hover + the concurrent thinking sweeps): materials and objects are
    // reused, only the fibre geometry is built when a sweep is born. ──
    interface SweepSlot {
      mode: number; hasLines: boolean; start: number; dur: number
      line: THREE.Mesh; sweep: THREE.Vector4 // the line material's uSweep: y = head along the arc, z = envelope
      marker: THREE.Points; markerMat: THREE.PointsMaterial; markerPos: THREE.BufferAttribute
    }
    const slots: SweepSlot[] = []
    for (let i = 0; i < BRAIN_BUDGET.thinkSweeps + 1; i++) {
      const lineMat = lineMaterial({ width: L.sweep.width, opacity: 1, back: L.sweep.back, mul: L.sweep.mul, head: 0, tail: L.sweep.tail, depthTest: false })
      const line = addMesh(EMPTY_GEOMETRY, lineMat, ORDER.sweeps)
      line.visible = false
      const markerPos = new THREE.BufferAttribute(new Float32Array(3), 3)
      markerPos.setUsage(THREE.DynamicDrawUsage)
      const markerGeo = track(new THREE.BufferGeometry())
      markerGeo.setAttribute('position', markerPos)
      // A constant white vertex colour, only so this material compiles to the same program as the
      // sparks' (already built by the time something is hovered): no shader compile on first hover.
      markerGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array([1, 1, 1, 1]), 4))
      const markerMat = track(new THREE.PointsMaterial({
        map: ringTex, vertexColors: true, size: L.sweep.markerSize, transparent: true, depthWrite: false, depthTest: false,
        blending: glowBlend, sizeAttenuation: true, alphaTest: 0.02, side: THREE.DoubleSide, forceSinglePass: true,
      }))
      const marker = addPoints(markerGeo, markerMat, ORDER.marker)
      marker.visible = false
      slots.push({ mode: SWEEP_FREE, hasLines: false, start: 0, dur: 0, line, sweep: lineMat.uniforms.uSweep.value as THREE.Vector4, marker, markerMat, markerPos })
    }

    // ── ambient sparks: a small fixed pool of comets, the only vertex data written per frame ──
    const SP = L.sparks
    const sparks: Array<{ alive: boolean; start: number; dur: number; ax: number; ay: number; az: number; bx: number; by: number; bz: number }> = []
    for (let i = 0; i < BRAIN_BUDGET.sparks; i++) sparks.push({ alive: false, start: 0, dur: 1, ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0 })
    // Colour is RGBA and a spark fades through its alpha: on a dark theme (additive) that is the
    // same as dimming the colour; on a light one (normal blending) dimming the colour would paint
    // the fading tail black instead of making it vanish.
    const sparkPos = new Float32Array(BRAIN_BUDGET.sparks * SP.tail * 3), sparkRgba = new Float32Array(BRAIN_BUDGET.sparks * SP.tail * 4)
    const sparkPosAttr = new THREE.BufferAttribute(sparkPos, 3), sparkRgbaAttr = new THREE.BufferAttribute(sparkRgba, 4)
    sparkPosAttr.setUsage(THREE.DynamicDrawUsage); sparkRgbaAttr.setUsage(THREE.DynamicDrawUsage)
    const sparkGeo = track(new THREE.BufferGeometry())
    sparkGeo.setAttribute('position', sparkPosAttr)
    sparkGeo.setAttribute('color', sparkRgbaAttr)
    sparkGeo.setDrawRange(0, 0)
    const sparkPoints = addPoints(sparkGeo, track(new THREE.PointsMaterial({
      map: dotTex, vertexColors: true, size: SP.size, transparent: true, depthWrite: false,
      blending: glowBlend, sizeAttenuation: true, alphaTest: 0.02, side: THREE.DoubleSide, forceSinglePass: true,
    })), ORDER.sparks)
    // Left visible (drawing nothing) for the very first frame, so its program — which the hover
    // marker shares — compiles with everything else at open instead of stalling a later frame.
    let sparksWarm = false
    const sparkR = wireCol.r * SP.boost, sparkG = wireCol.g * SP.boost, sparkB = wireCol.b * SP.boost
    let sparksDrawn = 0

    // ── post-processing: [bloom] → grade ──
    // Light themes get no bloom pass at all (not a zero-strength one: the pass would still run).
    const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(Math.max(1, W) * dpr, Math.max(1, H) * dpr, { type: THREE.UnsignedByteType }))
    composer.addPass(new RenderPass(scene, camera))
    let bloom: UnrealBloomPass | null = null
    if (isDark) {
      bloom = new UnrealBloomPass(new THREE.Vector2(Math.max(1, W), Math.max(1, H)), L.bloom.strength, L.bloom.radius, Math.max(L.bloom.threshold, bgLum))
      composer.addPass(bloom)
    }
    // The bloom pass ends by adding its result onto the scene buffer with one more full-screen
    // draw, which the grade pass then reads back: two full-resolution passes where one will do.
    // The grade pass adds the bloom itself, from the pass's composite target, and the pass's own
    // blend is switched off (three does not draw an invisible material). Should a future three
    // lay the pass out differently, the blend simply stays where it was.
    let bloomComposite: THREE.Texture | null = null
    if (bloom) {
      const inner = bloom as unknown as { blendMaterial?: THREE.Material; renderTargetsHorizontal?: THREE.WebGLRenderTarget[] }
      const composite = inner.renderTargetsHorizontal?.[0]?.texture
      if (inner.blendMaterial && composite) { inner.blendMaterial.visible = false; bloomComposite = composite }
    }
    const gradeU = {
      tDiffuse: { value: null as THREE.Texture | null },
      tBloom: { value: bloomComposite },
      uBloomOn: { value: bloomComposite ? 1 : 0 },
      uCore: { value: new THREE.Vector3(0.5, 0.5, 0) },
      uCoreCol: { value: new THREE.Color(0, 0, 0) },
      uCenterUv: { value: new THREE.Vector2(0.5, 0.5) },
      uAspect: { value: 1 },
      uVig: { value: isDark ? L.atmos.vignette : L.atmos.vignette * L.atmos.vignetteLight },
      uLift: { value: isDark ? L.atmos.liftAmount * L.atmos.lift : 0 },
      uLiftCol: { value: text.clone() },
      uGrain: { value: L.atmos.grain },
      uTime: { value: 0 },
    }
    const grade = new ShaderPass(new THREE.ShaderMaterial({
      uniforms: gradeU, vertexShader: GRADE_VS, fragmentShader: GRADE_FS, depthTest: false, depthWrite: false,
    }))
    composer.addPass(grade)
    // Bloom works at CSS-pixel resolution (as the previous brain did): its cost and the width of
    // its glow do not grow with the device pixel ratio.
    const sizePost = () => {
      composer.setSize(Math.max(1, W), Math.max(1, H))
      if (bloom) bloom.setSize(Math.max(1, W), Math.max(1, H))
    }
    sizePost()

    // ════════════════ state ════════════════
    let data!: BrainData
    let builtModel: BrainGraphModel | null = null
    let nodeState = new Float32Array(0)                  // aState: cited, focus, seed, entrance
    let nodeStateAttr: THREE.BufferAttribute | null = null
    let focusBuf = new Uint8Array(0)

    let raf = 0
    let t = 0, lastMs = performance.now()
    let frozenT: number | null = null                    // debug: time pinned to a value
    let needsRender = true                               // reduced motion renders on demand
    let revealStart = -1
    let waveIdx = 0, waveUntil = 0
    let nextWaveAt = L.motion.firstWave, nextHeartAt = L.motion.firstHeart, nextSparkAt = SP.first
    let nextThinkAt = 0, lastThinkWave = -100, thinkActive = 0, thinkCursor = 0
    let hoverId: string | null = null, selectedId: string | null = null
    let focusBuilt: string | null = null, focusShowContent = false, focusStale = true
    let hoverSlot: SweepSlot | null = null, hoverStart = 0
    let focusAmt = 0
    let litSet: Set<string> | undefined = renderRef.current.highlightedNoteIds
    let litCount = 0
    const cited: string[] = []                           // connected notes among the cited ones
    let citedStale = true
    const cascade: Array<PlacedNode | null> = []
    for (let i = 0; i < L.think.citedWaves; i++) cascade.push(null)
    let cascadeCount = 0, cascadeNext = 0, cascadeStart = 0
    let pointerX = 0, pointerY = 0, pointerDirty = false
    let downX = 0, downY = 0, moved = false, pointerActive = false
    let cursor = 'grab'
    const viewProj = new THREE.Matrix4()

    const fireWave = (x: number, y: number, z: number) => {
      const w = U.uWaves.value, o = (waveIdx++ % 4) * 4
      w[o] = x; w[o + 1] = y; w[o + 2] = z; w[o + 3] = t
      waveUntil = t + L.motion.waveLife
      needsRender = true
    }
    const replay = () => {
      if (reduced) return
      revealStart = t
      U.uRevealOn.value = 1
      U.uReveal.value = 0
      needsRender = true
    }

    // ── sweeps ──
    const releaseSweep = (slot: SweepSlot) => {
      if (slot.hasLines) { slot.line.geometry.dispose(); slot.line.geometry = EMPTY_GEOMETRY; slot.hasLines = false }
      slot.line.visible = false
      slot.marker.visible = false
      slot.mode = SWEEP_FREE
    }
    // Marks the node and, for a note or a section, lays its note's content relations out as smooth
    // fibres that start at the note. Sweeps only ever show content relations, and only while those
    // are on.
    const spawnSweep = (node: PlacedNode, mode: number, withLines: boolean): SweepSlot | null => {
      let slot: SweepSlot | null = null
      for (let i = 0; i < slots.length; i++) if (slots[i].mode === SWEEP_FREE) { slot = slots[i]; break }
      if (!slot) return null
      slot.mode = mode; slot.start = t; slot.dur = 0
      slot.markerPos.setXYZ(0, node.x, node.y, node.z)
      slot.markerPos.needsUpdate = true
      slot.markerMat.color.copy(colorOf(node.colorVar)).multiplyScalar(isDark ? L.sweep.markerBoost : 1)
      slot.markerMat.opacity = 1
      slot.marker.visible = true
      const edges = withLines && node.noteNodeId ? data.contentOf.get(node.noteNodeId) : undefined
      if (edges && edges.length) {
        const c = colorOf(node.colorVar)
        const S = new SegmentBuffer(edges.length * 48)
        for (let k = 0; k < edges.length; k++) {
          const e = data.edgePaths[edges[k]]
          const fb = fibre(P, e.seq, BRAIN_BUDGET.sweepSubdiv, e.source !== node.noteNodeId)
          const q = fb.points
          for (let i = 0; i < fb.count - 1; i++) {
            S.add(q[i * 3], q[i * 3 + 1], q[i * 3 + 2], q[i * 3 + 3], q[i * 3 + 4], q[i * 3 + 5], c.r, c.g, c.b, 0, fb.arc[i], fb.arc[i + 1], 0, 0, 0, 1, 1)
          }
        }
        if (S.count) {
          slot.line.geometry = segmentGeometry(S)
          slot.sweep.y = 0
          slot.sweep.z = 1
          slot.line.visible = true
          slot.hasLines = true
        }
      }
      return slot
    }
    const clearThink = () => {
      for (let i = 0; i < slots.length; i++) if (slots[i].mode === SWEEP_THINK) releaseSweep(slots[i])
      thinkActive = 0
    }
    // Prefers the notes the answer cites, in turn; otherwise any note with content relations.
    const pickThinkingNode = (): PlacedNode | null => {
      const connected = data.connected
      if (!connected.length) return null
      if (citedStale) {
        cited.length = 0
        if (litSet && litSet.size) {
          for (let i = 0; i < connected.length; i++) {
            const nd = data.byId.get(connected[i])
            if (nd && nd.noteId != null && litSet.has(nd.noteId)) cited.push(connected[i])
          }
        }
        citedStale = false
      }
      const id = cited.length ? cited[thinkCursor++ % cited.length] : connected[(Math.random() * connected.length) | 0]
      return data.byId.get(id) ?? null
    }

    // ── node state: cited notes and focus ──
    // Writes the "cited by the AI" flag; with `withCascade`, queues a ripple from the first few
    // (not with reduced motion: there a cited note shows a still signal and nothing ripples).
    const applyLit = (withCascade: boolean) => {
      const placed = data.placed
      const queue = withCascade && !reduced
      litCount = 0; cascadeCount = 0; cascadeNext = 0; cascadeStart = t
      for (let i = 0; i < placed.length; i++) {
        const nd = placed[i]
        const on = nd.tier === TIER_NOTE && nd.noteId != null && litSet !== undefined && litSet.has(nd.noteId)
        nodeState[i * 4] = on ? 1 : 0
        if (on) {
          litCount++
          if (queue && cascadeCount < cascade.length) cascade[cascadeCount++] = nd
        }
      }
      if (nodeStateAttr) nodeStateAttr.needsUpdate = true
      citedStale = true
    }
    const applyFocus = (node: PlacedNode | undefined, withContent: boolean) => {
      focusMask(data, node, withContent, focusBuf)
      for (let i = 0; i < focusBuf.length; i++) nodeState[i * 4 + 1] = focusBuf[i]
      if (nodeStateAttr) nodeStateAttr.needsUpdate = true
    }

    // ── labels: HTML projected from 3D ──
    // Faded on the far side, never overlapping (boxes claimed by priority: focus, group, folder,
    // note, nearer first). One element per node, created the first time it shows and reused; the
    // DOM is only written when a label's position, opacity or visibility actually changes.
    const labelLayer = document.createElement('div')
    labelLayer.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;'
    container.appendChild(labelLayer)
    const shadow = cssColor(bg)
    const labelBase = 'position:absolute;left:0;top:0;white-space:nowrap;line-height:normal;will-change:transform,opacity;display:none;opacity:0;'
      + `text-shadow:0 0 3px ${shadow},0 0 7px ${shadow},0 0 12px ${shadow};`
    interface LabelRec { el: HTMLDivElement; qx: number; qy: number; op: number; shown: boolean }
    let labelRecs: Array<LabelRec | undefined> = []
    let labelStamp = new Int32Array(0), labelFrame = 0
    let shownNow = new Int32Array(0), shownPrev = new Int32Array(0), shownPrevCount = 0
    let candIdx = new Int32Array(0), candOrder = new Int32Array(0), candBin = new Uint16Array(0), candFocus = new Uint8Array(0)
    let candX = new Float32Array(0), candY = new Float32Array(0), candDn = new Float32Array(0), boxes = new Float32Array(0)
    const binStart = new Int32Array(LABEL_BINS + 1)
    let layerOpacity = -1
    // placed indices of the groups, folders and notes: a frame only walks the tiers it shows
    let tierIdx: Int32Array[] = [new Int32Array(0), new Int32Array(0), new Int32Array(0)]
    const resetLabels = () => {
      for (const rec of labelRecs) if (rec) rec.el.remove()
      const n = data ? data.placed.length : 0
      const byTier: number[][] = [[], [], []]
      if (data) for (const nd of data.placed) if (nd.tier <= TIER_NOTE) byTier[nd.tier].push(nd.index)
      tierIdx = byTier.map((list) => Int32Array.from(list))
      labelRecs = new Array<LabelRec | undefined>(n)
      labelStamp = new Int32Array(n); shownNow = new Int32Array(n); shownPrev = new Int32Array(n); shownPrevCount = 0
      candIdx = new Int32Array(n); candOrder = new Int32Array(n); candBin = new Uint16Array(n); candFocus = new Uint8Array(n)
      candX = new Float32Array(n); candY = new Float32Array(n); candDn = new Float32Array(n); boxes = new Float32Array(n * 4)
    }
    const makeLabel = (nd: PlacedNode): LabelRec => {
      const el = document.createElement('div')
      el.textContent = nd.label.length > L.labels.maxChars ? nd.label.slice(0, L.labels.maxChars - 1) + '…' : nd.label
      el.style.cssText = labelBase + LABEL_FONT[nd.tier] + (reduced ? '' : 'transition:opacity .22s ease;')
      // groups and folders wear the group colour; notes and sections lean toward the text colour
      const c = colorOf(nd.colorVar)
      el.style.color = cssColor(nd.tier <= TIER_FOLDER ? c : c.clone().lerp(text, L.labels.toText))
      labelLayer.appendChild(el)
      return { el, qx: NaN, qy: NaN, op: 0, shown: false }
    }
    const updateLabels = (revealK: number, zc: number) => {
      const lo = Math.round(revealK * 100)
      if (lo !== layerOpacity) { layerOpacity = lo; labelLayer.style.opacity = String(lo / 100) }
      const placed = data.placed, N = placed.length
      const LB = L.labels
      labelFrame++
      let n = 0
      if (N) {
        const camDist = camera.position.distanceTo(controls.target)
        const showFolders = camDist < LB.folderDist * fitK, showNotes = camDist < LB.noteDist * fitK
        const fovScale = H / (2 * Math.tan((camera.fov * Math.PI / 180) / 2))
        const e = viewProj.elements, m = camera.matrixWorldInverse.elements
        const hoverIdx = hoverId ? (data.byId.get(hoverId)?.index ?? -1) : -1
        const selectedIdx = selectedId ? (data.byId.get(selectedId)?.index ?? -1) : -1
        // Passes 0-2 walk the tiers that show at this zoom (groups always); passes 3 and 4 add the
        // hovered and the selected node when their own tier is not showing (sections never do).
        for (let pass = 0; pass < 5; pass++) {
          if ((pass === 1 && !showFolders) || (pass === 2 && !showNotes)) continue
          const list = pass < 3 ? tierIdx[pass] : null
          const single = pass === 3 ? hoverIdx : pass === 4 && selectedIdx !== hoverIdx ? selectedIdx : -1
          const count = list ? list.length : single >= 0 ? 1 : 0
          for (let k = 0; k < count; k++) {
            const i = list ? list[k] : single
            const nd = placed[i], tier = nd.tier
            if (!list && (tier === TIER_GROUP || (tier === TIER_FOLDER && showFolders) || (tier === TIER_NOTE && showNotes))) continue
            const focus = i === hoverIdx || i === selectedIdx
            const w = e[3] * nd.x + e[7] * nd.y + e[11] * nd.z + e[15]
            if (w <= 0) continue
            if ((e[2] * nd.x + e[6] * nd.y + e[10] * nd.z + e[14]) / w > 1) continue
            const x = ((e[0] * nd.x + e[4] * nd.y + e[8] * nd.z + e[12]) / w * 0.5 + 0.5) * W
            const y = (-(e[1] * nd.x + e[5] * nd.y + e[9] * nd.z + e[13]) / w * 0.5 + 0.5) * H
            if (x < -60 || x > W + 60 || y < -20 || y > H + 20) continue
            const mvz = m[2] * nd.x + m[6] * nd.y + m[10] * nd.z + m[14]
            const dn = Math.max(0, Math.min(1, ((zc + radius) - mvz) / (2 * radius)))
            // sit just above the node's ring, whatever the zoom
            const ringPx = (RING_BY_TIER[tier] * fovScale) / Math.max(-mvz, 0.001)
            candIdx[n] = i
            candX[n] = x
            candY[n] = y - Math.min(ringPx * LB.lift + LB.liftPad, LB.liftMax)
            candDn[n] = dn
            candFocus[n] = focus ? 1 : 0
            // priority: focus, group, folder, note — and within a tier, nearer first
            candBin[n] = Math.min(LABEL_BINS - 1, (((focus ? 0 : tier === TIER_GROUP ? 1 : tier === TIER_FOLDER ? 2 : 3) + dn * 0.9) * 64) | 0)
            n++
          }
        }
      }
      // counting sort by priority (no allocation, stable)
      binStart.fill(0)
      for (let c = 0; c < n; c++) binStart[candBin[c] + 1]++
      for (let b = 0; b < LABEL_BINS; b++) binStart[b + 1] += binStart[b]
      for (let c = 0; c < n; c++) candOrder[binStart[candBin[c]]++] = c

      let nBoxes = 0, nShown = 0
      for (let o = 0; o < n; o++) {
        const c = candOrder[o], i = candIdx[c], nd = placed[i]
        const focus = candFocus[c] === 1
        const op = focus ? 1 : LB.opacity[nd.tier] * (candDn[c] > LB.hiddenDepth ? LB.hiddenFade : 1)
        const x = candX[c], y = candY[c]
        const half = (Math.min(nd.label.length, LB.maxChars) * (nd.tier === TIER_GROUP ? LB.groupCharWidth : LB.charWidth) + LB.boxPad) / 2
        const x0 = x - half, x1 = x + half, y0 = y - LB.boxAbove, y1 = y + LB.boxBelow
        if (!focus) {
          let hit = false
          for (let b = 0; b < nBoxes; b++) {
            const k = b * 4
            if (x0 < boxes[k + 2] && x1 > boxes[k] && y0 < boxes[k + 3] && y1 > boxes[k + 1]) { hit = true; break }
          }
          if (hit) continue
        }
        boxes[nBoxes * 4] = x0; boxes[nBoxes * 4 + 1] = y0; boxes[nBoxes * 4 + 2] = x1; boxes[nBoxes * 4 + 3] = y1
        nBoxes++

        let rec = labelRecs[i]
        if (!rec) rec = labelRecs[i] = makeLabel(nd)
        const qx = Math.round(x * 10), qy = Math.round(y * 10)
        if (!rec.shown) { rec.el.style.display = ''; rec.shown = true }
        if (qx !== rec.qx || qy !== rec.qy) {
          rec.qx = qx; rec.qy = qy
          rec.el.style.transform = `translate(${qx / 10}px,${qy / 10}px) translate(-50%,-100%)`
        }
        if (op !== rec.op) { rec.op = op; rec.el.style.opacity = String(op) }
        labelStamp[i] = labelFrame
        shownNow[nShown++] = i
      }
      // hide what was showing and no longer is (opacity back to 0 as well: a hidden label must
      // never look like the focused one to whoever inspects the inline styles)
      for (let k = 0; k < shownPrevCount; k++) {
        const i = shownPrev[k]
        if (labelStamp[i] === labelFrame) continue
        const rec = labelRecs[i]
        if (rec && rec.shown) { rec.el.style.display = 'none'; rec.el.style.opacity = '0'; rec.op = 0; rec.shown = false }
      }
      const swap = shownPrev; shownPrev = shownNow; shownNow = swap
      shownPrevCount = nShown
    }

    // ── picking: nearest node to the pointer in screen space (nodes are projected, not ray-cast) ──
    const pick = (px: number, py: number): PlacedNode | null => {
      const placed = data.placed
      const e = viewProj.elements
      const camX = camera.position.x, camY = camera.position.y, camZ = camera.position.z
      let best: PlacedNode | null = null, bestScore = Infinity
      for (let i = 0; i < placed.length; i++) {
        const nd = placed[i]
        const w = e[3] * nd.x + e[7] * nd.y + e[11] * nd.z + e[15]
        if (w <= 0) continue
        const nz = (e[2] * nd.x + e[6] * nd.y + e[10] * nd.z + e[14]) / w
        if (nz > 1) continue
        const sx = ((e[0] * nd.x + e[4] * nd.y + e[8] * nd.z + e[12]) / w * 0.5 + 0.5) * W
        const sy = (-(e[1] * nd.x + e[5] * nd.y + e[9] * nd.z + e[13]) / w * 0.5 + 0.5) * H
        const d = Math.hypot(sx - px, sy - py)
        const dist = Math.hypot(nd.x - camX, nd.y - camY, nd.z - camZ)
        const reach = Math.max(9, (RING_BY_TIER[nd.tier] * (H * 0.5)) / dist * 0.5 + 4)
        if (d < reach) {
          const score = d + nz * 40 // a slight preference for the nearer of two overlapping nodes
          if (score < bestScore) { bestScore = score; best = nd }
        }
      }
      return best
    }

    // ════════════════ rebuildData: the graph changed ════════════════
    const rebuildData = (m: BrainGraphModel) => {
      if (m === builtModel) return // mount and the [model] effect both ask for the first build
      builtModel = m
      const dataStart = performance.now()
      data = buildBrainData(mesh, m)
      measure('brain:data', dataStart)
      const d = data
      const at = (S: SegmentBuffer, u: number, w: number, c: THREE.Color, flags: number, arcU: number, arcW: number, revOffset: number, width: number) => S.add(
        P[u * 3], P[u * 3 + 1], P[u * 3 + 2], P[w * 3], P[w * 3 + 1], P[w * 3 + 2],
        c.r, c.g, c.b, flags, arcU, arcW, rev[u] + revOffset, rev[w] + revOffset, 0, 1, width,
      )

      // structure routes (one quad per lattice edge, thicker where routes share it), then the
      // dendrites, in the same buffer
      {
        const S = new SegmentBuffer(d.structDedup.length + d.dend.length)
        for (const s of d.structDedup) {
          at(S, s.u, s.w, branchColor(s.colorVar), 0, s.arcU, s.arcW, L.routes.revealOffset, Math.min(L.trunkMax, 1 + L.trunk * Math.log2(s.count)))
        }
        for (const s of d.dend) at(S, s.u, s.w, branchColor(s.colorVar), dendFlags, s.arcU, s.arcW, L.dend.revealOffset, dendWidth)
        routeCount = d.structDedup.length; dendCount = d.dend.length
        setSegments(routesLayer, S)
      }
      // synapses at rest: content and user relations in one mesh; the flag lets uShowContent hide
      // the content ones without touching the buffer. Like the wire, they are drawn whole (no
      // sweep, no pulses), so they carry no arc.
      {
        const c = colorOf('--text').clone().lerp(bg, isDark ? L.syn.lerp : L.syn.lerpLight)
        const S = new SegmentBuffer(d.synSegs.length, false)
        synAll = d.synSegs.length; synUser = 0
        for (const s of d.synSegs) {
          if (!s.content) synUser++
          at(S, s.u, s.w, c, s.content ? FLAG_CONTENT : 0, 0, 1, L.syn.revealOffset, 1)
        }
        setSegments(synLayer, S)
        fitSynapses()
      }
      // impulses: only the strongest relations, as fibres with few subdivisions (see BRAIN_BUDGET)
      {
        const picks = strongestEdges(d.edgePaths, BRAIN_BUDGET.impulseEdges)
        const S = new SegmentBuffer(picks.length * 32)
        const rng = mulberry32(31337)
        const c = new THREE.Color()
        for (const ei of picks) {
          const e = d.edgePaths[ei]
          const src = d.byId.get(e.source)
          c.copy(src && src.colorVar !== '--text' ? colorOf(src.colorVar) : text).lerp(text, L.impulse.toText)
          const phase = rng(), rate = L.impulse.rateMin + rng() * L.impulse.rateSpread
          const fb = fibre(P, e.seq, BRAIN_BUDGET.impulseSubdiv)
          const q = fb.points, flags = e.content ? FLAG_CONTENT : 0
          for (let i = 0; i < fb.count - 1; i++) {
            S.add(q[i * 3], q[i * 3 + 1], q[i * 3 + 2], q[i * 3 + 3], q[i * 3 + 4], q[i * 3 + 5], c.r, c.g, c.b, flags, fb.arc[i], fb.arc[i + 1], 0, 0, phase, rate, 1)
          }
        }
        setSegments(impulseLayer, S)
        impulseLayer.objects[0].visible = S.count > 0 && !reduced
      }
      // nodes: one geometry for the halo, the node and its hidden pass
      {
        const N = d.placed.length
        const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), style = new Float32Array(N * 4)
        nodeState = new Float32Array(N * 4)
        focusBuf = new Uint8Array(N)
        const rng = mulberry32(555)
        litCount = 0
        for (let i = 0; i < N; i++) {
          const nd = d.placed[i], c = colorOf(nd.colorVar), s = softNode(nd.kind, nd.colorVar === '--text')
          pos[i * 3] = nd.x; pos[i * 3 + 1] = nd.y; pos[i * 3 + 2] = nd.z
          col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b
          size[i] = RING_SIZE[nd.kind]
          style[i * 4] = s.core; style[i * 4 + 1] = s.ring; style[i * 4 + 2] = s.alpha; style[i * 4 + 3] = s.fill
          const lit = nd.tier === TIER_NOTE && nd.noteId != null && litSet !== undefined && litSet.has(nd.noteId)
          if (lit) litCount++
          nodeState[i * 4] = lit ? 1 : 0
          nodeState[i * 4 + 2] = rng()
          nodeState[i * 4 + 3] = rev[nd.v] + L.nodes.revealOffset
        }
        if (N) {
          const g = new THREE.BufferGeometry()
          g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
          g.setAttribute('aColor', new THREE.BufferAttribute(col, 3))
          g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
          g.setAttribute('aStyle', new THREE.BufferAttribute(style, 4))
          nodeStateAttr = new THREE.BufferAttribute(nodeState, 4)
          nodeStateAttr.setUsage(THREE.DynamicDrawUsage)
          g.setAttribute('aState', nodeStateAttr)
          setLayer(nodeLayer, g, N)
        } else {
          nodeStateAttr = null
          setLayer(nodeLayer, null, 0)
        }
      }

      // everything that pointed into the old data
      clearThink()
      if (hoverSlot) { releaseSweep(hoverSlot); hoverSlot = null }
      if (hoverId && !d.byId.has(hoverId)) hoverId = null
      if (selectedId && !d.byId.has(selectedId)) selectedId = null
      focusStale = true
      citedStale = true
      cascadeCount = 0; cascadeNext = 0
      resetLabels()
      needsRender = true
    }

    // Everything that `prefers-reduced-motion` switches off: auto-rotation, the entrance, pulses and
    // impulses, twinkle and drift, and every ripple already on its way. (The loop does the rest: no
    // ambient ripples, heartbeat or sparks, no ripples from hovering, thinking or cited notes, and
    // a still signal on the cited ones.) What is left moves only in answer to the user — orbiting,
    // the sweep of a hovered note, the sweeps while the chat writes — and the scene is drawn only
    // while something does.
    const applyMotion = () => {
      reduced = motionQuery.matches
      if (reduced) {
        controls.autoRotate = false
        revealStart = -1
        U.uRevealOn.value = 0
        const w = U.uWaves.value
        w[3] = w[7] = w[11] = w[15] = -1
        waveUntil = 0
        cascadeCount = 0; cascadeNext = 0
      }
      for (const mat of flowing) (mat.uniforms.uFlow.value as THREE.Vector4).x = reduced ? 0 : routeFlow
      if (farMat) (farMat.uniforms.uFlow.value as THREE.Vector4).x = reduced ? 0 : B.far.flow
      for (const c of clouds) {
        const anim = c.mat.uniforms.uAnim.value as THREE.Vector4
        anim.x = reduced ? 0 : c.twinkle
        anim.y = reduced ? 0 : c.drift
      }
      impulseLayer.objects[0].visible = impulseLayer.count > 0 && !reduced
      if (data) resetLabels() // labels carry (or not) the opacity transition
      needsRender = true
    }
    applyMotion()

    rebuildData(renderRef.current.model)
    if (!introPlayedRef.current) replay()

    // ════════════════ render loop ════════════════
    const frame = () => {
      // This callback's id is spent. Cleared first, so that if anything below throws the loop is
      // seen as stopped and the next syncLoop (a resize, the window coming back) can restart it.
      raf = 0
      const nowMs = performance.now()
      // A long gap (tab in the background, a stall) must not fast-forward the animation.
      const dt = Math.min(0.1, Math.max(0, (nowMs - lastMs) / 1000))
      lastMs = nowMs
      if (frozenT === null) t += dt
      else t = frozenT
      const live = renderRef.current
      const ambient = !reduced && frozenT === null
      U.uTime.value = t
      gradeU.uTime.value = t
      // cited notes: rings travelling outwards and a pulsing glow — or, with reduced motion, the
      // same rings and glow standing still
      if (reduced) U.uLit.value.set(L.think.citedStill, 0)
      else U.uLit.value.set(t, 1)

      controls.update(dt)
      camera.updateMatrixWorld()
      viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)

      // content relations on/off (AI enabled or not): the buffers stay, a uniform hides them
      const showContent = live.showContentEdges
      if ((U.uShowContent.value > 0.5) !== showContent) { U.uShowContent.value = showContent ? 1 : 0; fitSynapses(); needsRender = true }

      // entrance: the brain switches on from the core outwards
      let revealK = 1
      if (revealStart >= 0) {
        const q = (t - revealStart) / L.motion.intro
        if (q >= 1) { revealStart = -1; U.uRevealOn.value = 0 }
        else {
          U.uRevealOn.value = 1
          U.uReveal.value = (1 - Math.pow(1 - Math.max(0, q), 2.2)) * 1.25
          revealK = 0.25 + 0.75 * smooth(0.5, 0.95, q)
        }
      }

      // hover: one pick per frame at most, and only if the pointer moved
      if (pointerDirty) {
        pointerDirty = false
        const hit = pick(pointerX, pointerY)
        hoverId = hit ? hit.id : null
      }
      const hoverNode = hoverId ? data.byId.get(hoverId) : undefined
      const wantCursor = hoverNode && hoverNode.tier !== TIER_FOLDER ? 'pointer' : 'grab'
      if (wantCursor !== cursor) { cursor = wantCursor; canvas.style.cursor = wantCursor }

      // focus (hovered, else selected): marker + sweep of its relations + dim of the rest + a ripple
      const focusId = hoverId ?? selectedId
      if (focusStale || focusId !== focusBuilt || showContent !== focusShowContent) {
        const changed = focusId !== focusBuilt
        if (hoverSlot) { releaseSweep(hoverSlot); hoverSlot = null }
        const node = focusId ? data.byId.get(focusId) : undefined
        if (node) hoverSlot = spawnSweep(node, SWEEP_HOVER, showContent)
        focusBuilt = focusId; focusShowContent = showContent; focusStale = false
        hoverStart = t
        applyFocus(node, showContent)
        if (node && changed && !reduced) fireWave(node.x, node.y, node.z)
        needsRender = true
      }
      const sweeping = hoverSlot !== null && hoverSlot.hasLines && (t - hoverStart) / L.sweep.fill < 2
      if (hoverSlot && hoverSlot.hasLines) hoverSlot.sweep.y = Math.min(2, (t - hoverStart) / L.sweep.fill) * 1.07
      const focusTarget = focusId ? 1 : 0
      const focusBefore = focusAmt
      focusAmt += (focusTarget - focusAmt) * (1 - Math.pow(1 - L.focusEase, dt * 60))
      if (Math.abs(focusTarget - focusAmt) < 0.002) focusAmt = focusTarget
      U.uFocusAmt.value = focusAmt

      // thinking: several concurrent relation sweeps while the chat streams. Not while hovering; a
      // selected folder does not hold them back (its marker has a slot of its own).
      if (!hoverId && live.thinking && showContent && data.connected.length) {
        if (t >= nextThinkAt && thinkActive < BRAIN_BUDGET.thinkSweeps) {
          const node = pickThinkingNode()
          const slot = node ? spawnSweep(node, SWEEP_THINK, true) : null
          if (node && slot && slot.hasLines) {
            slot.dur = L.think.life + Math.random() * L.think.lifeJitter
            thinkActive++
            if (!reduced && t - lastThinkWave > L.think.waveGap) { lastThinkWave = t; fireWave(node.x, node.y, node.z) }
          } else if (slot) releaseSweep(slot)
          nextThinkAt = t + L.think.every + Math.random() * L.think.jitter
        }
      } else if (thinkActive && !live.thinking) clearThink()
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i]
        if (slot.mode !== SWEEP_THINK) continue
        const age = t - slot.start
        if (age >= slot.dur) { releaseSweep(slot); thinkActive--; continue }
        // fills fast from its note, holds, then fades over the rest of its life
        const life = age / slot.dur, env = life < L.think.hold ? 1 : 1 - (life - L.think.hold) / (1 - L.think.hold)
        slot.markerMat.opacity = env
        slot.sweep.y = (age / L.sweep.thinkFill) * 1.07
        slot.sweep.z = env
      }

      // notes cited by the answer: compared by identity (BrainView memoises the Set)
      if (live.highlightedNoteIds !== litSet) {
        litSet = live.highlightedNoteIds
        applyLit(true)
        needsRender = true
      }
      while (cascadeNext < cascadeCount && t >= cascadeStart + cascadeNext * L.think.citedGap) {
        const nd = cascade[cascadeNext++]
        if (nd) fireWave(nd.x, nd.y, nd.z)
      }

      if (ambient) {
        // ambient ripples from a random node, and the heartbeat from the core
        if (t >= nextWaveAt) {
          const n = data.placed.length
          if (n) { const nd = data.placed[(Math.random() * n) | 0]; fireWave(nd.x, nd.y, nd.z) }
          nextWaveAt = t + (1 / L.motion.waves) * (0.6 + Math.random() * 0.8)
        }
        if (revealStart < 0 && t >= nextHeartAt) {
          fireWave(data.core[0], data.core[1], data.core[2])
          nextHeartAt = t + L.motion.heart
        }
        // a new spark on a random lattice edge, now and then
        if (t >= nextSparkAt) {
          for (let i = 0; i < sparks.length; i++) {
            const s = sparks[i]
            if (s.alive) continue
            const ei = (Math.random() * (mesh.edges.length / 2)) | 0
            let a = mesh.edges[ei * 2], b = mesh.edges[ei * 2 + 1]
            if (Math.random() < 0.5) { const swap = a; a = b; b = swap }
            s.alive = true; s.start = t; s.dur = SP.life + Math.random() * SP.lifeJitter
            s.ax = P[a * 3]; s.ay = P[a * 3 + 1]; s.az = P[a * 3 + 2]
            s.bx = P[b * 3]; s.by = P[b * 3 + 1]; s.bz = P[b * 3 + 2]
            break
          }
          nextSparkAt = t + SP.every + Math.random() * SP.jitter
        }
      }
      // sparks: a head and a short fading tail crawling the edge
      {
        let w = 0
        for (let i = 0; i < sparks.length; i++) {
          const s = sparks[i]
          if (!s.alive) continue
          const head = (t - s.start) / s.dur
          if (head >= 1 || head < 0 || reduced) { s.alive = false; continue }
          const env = Math.sin(Math.PI * head)
          for (let k = 0; k < SP.tail; k++) {
            const raw = head - k * SP.tailGap, u = raw < 0 ? 0 : raw
            sparkPos[w * 3] = lerp(s.ax, s.bx, u); sparkPos[w * 3 + 1] = lerp(s.ay, s.by, u); sparkPos[w * 3 + 2] = lerp(s.az, s.bz, u)
            sparkRgba[w * 4] = sparkR; sparkRgba[w * 4 + 1] = sparkG; sparkRgba[w * 4 + 2] = sparkB
            sparkRgba[w * 4 + 3] = (raw >= 0 ? env : 0) * (1 - k / SP.tail)
            w++
          }
        }
        if (w > 0 || sparksDrawn > 0) {
          sparkPosAttr.needsUpdate = true; sparkRgbaAttr.needsUpdate = true
          sparkGeo.setDrawRange(0, w)
          sparkPoints.visible = w > 0
          sparksDrawn = w
        }
      }

      // With reduced motion nothing moves by itself, so a frame is only drawn when something
      // changed — the camera, the size, the data, the set of cited notes (all through needsRender) —
      // or while something the user set off is still playing: the focus dim easing, the sweep of a
      // hovered note, the sweeps while the chat writes. Cited notes do not count: their signal
      // stands still there, and they stay cited until the next question. (waveUntil only matters
      // for a ripple fired by hand through the debug handle.)
      const draw = !reduced || needsRender || focusAmt !== focusBefore || sweeping || thinkActive > 0 || t < waveUntil
      if (draw) {
        needsRender = false
        // breathing + focus dim
        const br = reduced ? 0 : Math.sin(t * 1.1)
        const dim = 1 - L.focusDim * 0.55 * focusAmt
        wireMat.uniforms.uOpacity.value = (wireBase + (isDark && !reduced ? L.wire.breathe * Math.sin(t * 1.1 + 1) : 0)) * dim
        for (let i = 0; i < dimmed.length; i++) dimmed[i].u.value = dimmed[i].base * dim
        if (floorMat) {
          // the pool on the floor fades as the camera rises above the brain
          const dx = camera.position.x - controls.target.x, dy = camera.position.y - controls.target.y, dz = camera.position.z - controls.target.z
          const elevation = dy / (Math.hypot(dx, dy, dz) || 1)
          floorMat.opacity = B.floor.opacity * (1 + B.floor.breathe * br) * (1 - smooth(B.floor.fadeFrom, B.floor.fadeTo, elevation))
        }
        if (bloom) bloom.strength = L.bloom.strength + L.bloom.breathe * br

        // the grade pass follows the brain's position on screen
        const e = viewProj.elements, m = camera.matrixWorldInverse.elements
        const cw = e[3] * cx + e[7] * cy + e[11] * cz + e[15] || 1
        gradeU.uCenterUv.value.set(
          (e[0] * cx + e[4] * cy + e[8] * cz + e[12]) / cw * 0.5 + 0.5,
          (e[1] * cx + e[5] * cy + e[9] * cz + e[13]) / cw * 0.5 + 0.5,
        )
        gradeU.uAspect.value = W / H
        // the inner light: its centre on screen and its radius in screen heights, which is its
        // world radius over the visible height at its depth (clip w is that depth; the projection
        // matrix holds 1 / tan(fov / 2))
        if (coreBase > 0) {
          const depth = e[3] * cx + e[7] * coreY + e[11] * cz + e[15]
          if (depth > 0.05) {
            gradeU.uCore.value.set(
              (e[0] * cx + e[4] * coreY + e[8] * cz + e[12]) / depth * 0.5 + 0.5,
              (e[1] * cx + e[5] * coreY + e[9] * cz + e[13]) / depth * 0.5 + 0.5,
              (coreHalf * camera.projectionMatrix.elements[5]) / (2 * depth),
            )
            gradeU.uCoreCol.value.copy(coreColor).multiplyScalar(coreBase * (1 + 0.12 * br))
          } else gradeU.uCore.value.z = 0 // the camera is at or past its centre: nothing sensible to draw
        }

        updateLabels(revealK, m[2] * cx + m[6] * cy + m[10] * cz + m[14])
        composer.render(dt)
        introPlayedRef.current = true
        if (!sparksWarm) { sparksWarm = true; sparkPoints.visible = sparksDrawn > 0 }
      }
      if (!raf) raf = requestAnimationFrame(frame)
    }

    // The loop only runs while there is something to look at: not in a hidden window, not with a
    // zero-sized container. `document.hidden` alone would never stop it in the app: the main
    // window runs with backgroundThrottling off (so the renderer survives long stays in the tray),
    // and then Chromium keeps the page "visible" and rAF firing while the window is minimised or
    // hidden. The main process says when the window really is on screen (`window:visibility`,
    // kept in windowVisibleRef by an effect of its own so that it outlives this scene).
    const syncLoop = () => {
      const run = windowVisibleRef.current && !document.hidden && W > 0 && H > 0
      if (run && !raf) { lastMs = performance.now(); needsRender = true; raf = requestAnimationFrame(frame) }
      else if (!run && raf) { cancelAnimationFrame(raf); raf = 0 }
    }
    // Safety net: whoever can point at the canvas is looking at it.
    const seen = () => { if (!windowVisibleRef.current) { windowVisibleRef.current = true; syncLoop() } }
    syncLoop()

    // ── hooks for the component's other effects: new graph, window shown or hidden ──
    apiRef.current = { rebuildData, syncLoop }

    // ── resize ──
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth, h = container.clientHeight
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      if (w === W && h === H && ratio === dpr) return
      W = w; H = h
      if (ratio !== dpr) {
        dpr = ratio
        renderer.setPixelRatio(dpr)
        composer.setPixelRatio(dpr)
        U.uPx.value = dpr
      }
      if (W > 0 && H > 0) {
        camera.aspect = W / H
        camera.updateProjectionMatrix()
        fitCamera()
        renderer.setSize(W, H)
        sizePost()
        U.uRes.value.set(W * dpr, H * dpr)
        U.uScale.value = H * dpr * 0.5
        needsRender = true
      }
      syncLoop()
    })
    ro.observe(container)

    // ── pointer: orbit (drag) · node-click (quick click) · hover ──
    const onDown = (e: PointerEvent) => { seen(); downX = e.clientX; downY = e.clientY; moved = false; pointerActive = true; controls.autoRotate = false }
    // Only remembers where the pointer is: the pick runs in the loop, once per frame at most.
    const onMove = (e: PointerEvent) => {
      seen()
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 4) moved = true
      if (pointerActive) return
      pointerX = e.offsetX; pointerY = e.offsetY; pointerDirty = true
    }
    const onUp = (e: PointerEvent) => {
      pointerActive = false
      if (moved) return
      // node click: notes/sections pin a preview card; groups open their overview; folders toggle selection
      const hit = pick(e.offsetX, e.offsetY)
      if (!hit) { selectedId = null; return }
      if ((hit.kind === 'note' || hit.kind === 'section') && hit.noteId) {
        renderRef.current.onNodeActivate(hit.noteId, hit.sectionId, e.clientX, e.clientY)
      } else if (hit.kind === 'group') renderRef.current.onOpenGroup(hit.refId)
      else selectedId = selectedId === hit.id ? null : hit.id
    }
    const onCancel = () => { pointerActive = false }
    const onLeave = () => { hoverId = null; pointerDirty = false }
    const onControlsChange = () => { needsRender = true }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onCancel)
    canvas.addEventListener('pointerleave', onLeave)
    controls.addEventListener('change', onControlsChange)
    document.addEventListener('visibilitychange', syncLoop)
    motionQuery.addEventListener('change', applyMotion)

    // ── debug handle (see DEBUG_KEY) ──
    const host = window as unknown as { __nfBrain?: unknown }
    let debugHandle: unknown = null
    if (debugEnabled()) {
      debugHandle = {
        camera, controls, renderer, scene, composer, uniforms: U, mesh,
        data: () => data,
        // Pins uTime to `value` (and stops ambient ripples/sparks from spawning) or, with null, lets it run again.
        setTime: (value: number | null) => {
          frozenT = value
          if (value !== null) { t = value; U.uTime.value = value; gradeU.uTime.value = value }
          needsRender = true
        },
        // Focuses a node as if hovered; it holds until the pointer next moves over the canvas.
        setHover: (id: string | null) => { hoverId = id !== null && data.byId.has(id) ? id : null; pointerDirty = false; needsRender = true },
        setRotate: (on: boolean) => { controls.autoRotate = on },
        fireWave: (id: string) => { const nd = data.byId.get(id); if (nd) fireWave(nd.x, nd.y, nd.z) },
        replay,
        // renderer.info plus how many instances each layer holds right now.
        info: () => {
          let sweeps = 0, sweepSegments = 0
          for (const slot of slots) {
            if (slot.mode === SWEEP_FREE) continue
            sweeps++
            if (slot.hasLines) sweepSegments += (slot.line.geometry as THREE.InstancedBufferGeometry).instanceCount
          }
          return {
            renderer: renderer.info,
            dark: isDark, reduced, dpr, size: [W, H], time: t,
            layers: {
              wire: wireCount, dots: V, farLines: farCount, farDots: B.far.count, motes: B.motes.count,
              routes: routeCount, dendrites: dendCount, synapses: synLayer.count, impulses: impulseLayer.count,
              nodes: nodeLayer.count, cited: litCount, sweeps, sweepSegments, sparks: sparksDrawn, labels: shownPrevCount,
            },
          }
        },
      }
      host.__nfBrain = debugHandle
    }

    measure('brain:scene', sceneStart)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      ro.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onCancel)
      canvas.removeEventListener('pointerleave', onLeave)
      controls.removeEventListener('change', onControlsChange)
      document.removeEventListener('visibilitychange', syncLoop)
      motionQuery.removeEventListener('change', applyMotion)
      if (debugHandle !== null && host.__nfBrain === debugHandle) delete host.__nfBrain
      apiRef.current = null
      controls.dispose()
      for (const rec of labelRecs) if (rec) rec.el.remove()
      if (labelLayer.parentNode === container) container.removeChild(labelLayer)
      for (const slot of slots) releaseSweep(slot)
      for (const layer of [routesLayer, synLayer, impulseLayer, nodeLayer]) setLayer(layer, null, 0)
      for (const x of disposables) x.dispose()
      grade.dispose()
      if (bloom) bloom.dispose()
      composer.dispose()
      renderer.dispose()
      if (canvas.parentNode === container) container.removeChild(canvas)
    }
  // Rebuild only when the theme changes (palette). The graph updates live via apiRef.
  }, [activeThemeId])

  // Re-pin nodes whenever the graph (notes/groups/content) changes.
  useEffect(() => { apiRef.current?.rebuildData(model) }, [model])

  // Window shown / hidden / minimised / restored, from the main process. (No bridge in tests and
  // other contexts without a preload: hence the optional calls.)
  useEffect(() => window.noteflow?.onWindowVisibility?.((visible) => {
    windowVisibleRef.current = visible
    apiRef.current?.syncLoop()
  }), [])

  return <div ref={containerRef} className="absolute inset-0" style={{ touchAction: 'none' }} />
}

export default BrainScene
