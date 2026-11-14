// GENERATED — copied from src/components/Brain/brainLook.ts by docs/scripts/build-brain.mjs.
// Do not edit here: change the app's module and run `npm run brain` in docs/.

// The approved look of the 3D brain ("Corriente afinada" with the "Bandas" relief), flattened from
// the design prototype's preset chain into one constant. There are no presets and no sliders: a
// number changed here changes the scene, and nothing in BrainScene.tsx should carry a magic number
// that belongs to the look.
//
// Units: line widths are CSS px (the shader scales them by the device pixel ratio), sizes of dots
// and nodes are world units, times are seconds, opacities are 0..1. A `back` value is what is left
// of the opacity at the far side of the brain (the depth fade); a `hidden*` value belongs to the
// second pass that draws what the surface occludes.

import type { BrainNodeKind } from './graph'

export const BRAIN_LOOK = {
  // Half-width of the antialiasing ramp of a line, in device px.
  aa: 0.6,
  // Lines, dots and nodes are pulled this far toward the camera (view space) so they pass the depth
  // test against the invisible skin they sit on.
  zBias: 0.014,
  // Depth range (0 = nearest point of the brain, 1 = farthest) over which things fade to `back`.
  fade: [0.28, 0.92],
  // How much everything unrelated dims while a node is focused, and how fast the dim eases in
  // (fraction of the remaining distance per 60 Hz frame).
  focusDim: 0.62,
  focusEase: 0.14,
  // Structure routes shared by several notes thicken into trunks: 1 + trunk · log2(count), capped.
  trunk: 0.42,
  trunkMax: 2.3,
  // Strength of the ripple a focused node sends out.
  hoverWave: 0.8,

  // Everything that carries a group colour is desaturated and toned down ("Color" at 0.45 in the
  // prototype); on a light background colours are darkened so they read as ink, and the faint
  // coloured lines get their opacity multiplied (capped) because nothing glows there. --text is
  // exempt from the desaturation.
  // `lightNeutral`: on a light theme the routes and dendrites of whatever has no group colour
  // (loose notes and their sections) would be darkened --text at near-full opacity, i.e. heavy
  // black strokes that take over the picture; they are drawn in --text pulled this far toward the
  // background instead.
  color: { saturation: 0.67, energy: 0.7925, lightDarken: 0.62, lightOpacity: 2.6, lightOpacityMax: 0.95, lightNeutral: 0.45 },

  // The scaffold wire. `opacity` is for dark themes (additive), `light` for light ones (normal
  // blending). `lerp*` pulls the text colour toward the background. `interior` multiplies the
  // opacity of the inner lattice, `boost` is how strongly ripples light it up. An edge's weight
  // sets its width (widthBase + widthByWeight · w) and its brightness.
  wire: {
    width: 1.0, opacity: 0.36, light: 0.5, lerp: 0.1, lerpLight: 0.25, back: 0.5, depthW: 0.2, interior: 3,
    breathe: 0.01, boost: 0.9, revealGlow: 3, hiddenOpacity: 0.05, hiddenInterior: 4,
    widthBase: 0.8, widthByWeight: 0.5, lightFloor: 0.25,
    // On dark themes the hidden pass skips surface edges at or below this weight (the inside of a
    // sulcus): they would add well under one grey level.
    hiddenMinWeight: 0.06,
  },
  // The dot on every lattice vertex.
  dots: {
    size: 0.021, opacity: 0.85, light: 0.6, back: 0.5, interior: 0.5, soft: 0.45, boost: 0.55,
    hiddenOpacity: 0.19, hiddenInterior: 1.5,
  },
  // Note/group nodes: a ring, a centre dot and a faint fill, plus a halo behind them.
  nodes: {
    ringW: 0.07, core: 1, coreSoft: 0.45, glow: 0.42, glowLight: 0.35, glowSize: 2.7, glowExtent: 6.5, extent: 1.08,
    back: 0.75, glowBack: 0.1, hiddenAlpha: 0.2, waveSize: 0.32, revealOffset: 0.14,
  },
  // Structure routes group → folder → note, with pulses travelling down the branch.
  routes: {
    width: 1.5, opacity: 0.62, back: 0.75, mul: 1.0, flow: 1.3, freq: 1.0, speed: 0.2, len: 0.32,
    revealGlow: 1.2, hiddenOpacity: 0.2, revealOffset: 0.12,
  },
  // Dendrites note → section. They ride in the routes' draw call (width and opacity go per
  // segment), so they share the routes' depth fade (`back`) and pulse.
  dend: { width: 1.05, opacity: 0.5, revealOffset: 0.14 },
  // Synapses at rest: the faint neutral threads of content and user relations. On a light theme
  // they are drawn with normal blending at `light`, which suits a few hundred segments; a vault
  // with thousands would turn into a grey mesh over the brain, so there the opacity is scaled by
  // sqrt(lightRef / visible segments), never below lightMin of it (and never above it).
  syn: {
    width: 0.9, opacity: 0.09, light: 0.5, lerp: 0.34, lerpLight: 0.24, back: 0.8, impulses: 1.25, revealOffset: 0.16,
    lightRef: 850, lightMin: 0.3,
  },
  // The impulses that fire along those synapses. `toText` pulls their colour toward --text; each
  // relation gets its own phase and a rate in rateMin .. rateMin + rateSpread.
  impulse: { width: 1.15, len: 0.03, freq: 0.09, speed: 0.1, toText: 0.25, opacity: 0.62, back: 0.45, rateMin: 0.6, rateSpread: 0.8 },
  // The relations of a hovered note (and the "thinking" sweeps), drawn as smooth fibres that fill
  // from the note outwards in `fill` seconds, plus a ring marking the node.
  sweep: { width: 1.35, mul: 1.15, back: 0.6, tail: 0.4, fill: 0.22, thinkFill: 0.1, markerSize: 0.07, markerBoost: 1.8 },
  // Atmosphere: the light inside the brain (dark themes only) and the final grade pass.
  atmos: {
    core: 0.55, coreOpacity: 0.11, coreScale: 3.1, coreDy: -0.05, coreAccent: 0.25,
    vignette: 0.16, vignetteLight: 0.35, lift: 0.5, liftAmount: 0.03, grain: 0.012,
  },
  // Bloom, dark themes only. The threshold never drops below the background's own luminance.
  bloom: { strength: 0.24, radius: 0.55, threshold: 0.22, breathe: 0.03 },
  // Motion: ambient ripples per second, ripple strength and lifetime, auto-rotation, the heartbeat
  // period and the length of the entrance.
  motion: { waves: 0.09, waveGain: 0.7, waveLife: 2.4, firstWave: 1.2, rotate: 0.35, heart: 6.5, firstHeart: 2.6, intro: 2.4 },
  // While the chat is streaming: a new relation sweep every `every` (+ jitter) seconds, each alive
  // for `life` (+ jitter), and a ripple at most every `waveGap`. When the answer lands, up to
  // `citedWaves` cited notes ripple one after another.
  // With reduced motion a cited note shows that signal standing still: its clock is pinned at
  // `citedStill`, which leaves its two rings a quarter and three quarters of the way out.
  think: { every: 0.16, jitter: 0.12, life: 0.6, lifeJitter: 0.3, hold: 0.6, waveGap: 0.9, citedWaves: 5, citedGap: 0.42, citedStill: 0.595 },
  // Ambient sparks: rare, short comets crawling a random lattice edge.
  sparks: { size: 0.03, boost: 1.4, first: 1.5, every: 2.2, jitter: 3, life: 0.3, lifeJitter: 0.2, tail: 4, tailGap: 0.06 },

  // The backdrop: a pool of light on the floor (dark only), a far constellation that echoes the
  // lattice and a few suspended motes. All of it is static in the world, so orbiting gives parallax;
  // whatever drifts closer to the camera than `near` fades out.
  background: {
    floor: { y: -1.08, dz: -0.1, opacity: 0.2, size: [3.4, 2.4], hot: [1.5, 1.0], breathe: 0.1, fadeFrom: 0.3, fadeTo: 0.7 },
    far: {
      count: 220, radius: 4.6, spread: 3.4, flatten: 0.6, link: 1.25, near: 3.6,
      opacity: 0.04, opacityLight: 0.16, flow: 2.0, freq: 0.5, speed: 0.035, len: 0.2,
      lerp: [0.1, 0.62], lerpLight: [0.3, 0.72],
    },
    farDots: { size: 0.042, twinkle: 0.45, drift: 0, opacity: 0.42, opacityLight: 0.5, lerp: 0.2, lerpLight: 0.4, near: 3.4, soft: 0.25 },
    motes: {
      count: 260, inner: 1.25, spread: 2.1, flatten: 0.75,
      size: 0.013, twinkle: 0.85, drift: 0.04, opacity: 0.34, opacityLight: 0.4, lerp: 0.1, lerpLight: 0.4, near: 3.4, soft: 0.25,
    },
  },

  // Three-quarter lateral view (the angle a brain is recognised from), orbiting the centre of the
  // cerebrum. Narrow windows pull the camera back: k = max(1, fitAspect / aspect).
  camera: {
    fov: 50, position: [3.16, 1.01, 1.03], target: [0, 0.3, 0], minDistance: 1.6, maxDistance: 7,
    damping: 0.08, fitAspect: 0.92,
  },

  // Labels: which tiers show at which camera distance (× the fit factor), their opacity by tier
  // (group, folder, note, section), the fade of the ones on the far side, and the estimated box of
  // a label (px) used to keep them from overlapping.
  labels: {
    folderDist: 2.8, noteDist: 2.2, opacity: [0.95, 0.82, 0.7, 0.7], hiddenDepth: 0.52, hiddenFade: 0.25,
    maxChars: 24, charWidth: 6.1, groupCharWidth: 7.6, boxPad: 10, boxAbove: 15, boxBelow: 1,
    lift: 0.4, liftPad: 4, liftMax: 110, toText: 0.45,
  },
} as const

// Performance budgets (see the notes in BrainScene.tsx). The approved look had ~70 relations; a
// real vault can have well over a thousand, and every relation that fires impulses costs one quad
// per subdivision of every hop of its route.
export const BRAIN_BUDGET = {
  impulseEdges: 160,   // only the strongest relations fire impulses
  impulseSubdiv: 3,    // fibre subdivisions per hop for impulses
  sweepSubdiv: 6,      // …and for the hover / thinking sweeps, which are few and seen up close
  thinkSweeps: 6,      // concurrent sweeps while the chat is streaming
  sparks: 6,           // ambient sparks alive at once
} as const

// Ring size per node kind (world units): the hierarchy reads from the size of the ring; the centre
// dot is the same small size everywhere.
export const RING_SIZE: Record<BrainNodeKind, number> = { group: 0.075, folder: 0.052, note: 0.04, section: 0.026 }
export const CENTER_SIZE = 0.014

export interface NodeStyle {
  core: number   // brightness of the centre dot
  ring: number   // brightness of the ring
  alpha: number  // opacity of the ring
  fill: number   // opacity of the faint disc inside the ring
}

/** How a node of each kind is drawn. `neutral` = it has no group colour (--text). */
export function softNode(kind: BrainNodeKind, neutral: boolean): NodeStyle {
  return {
    core: kind === 'group' ? 1.3 : 1.05,
    ring: neutral ? 0.72 : 0.94,
    alpha: kind === 'section' ? 0.7 : kind === 'note' ? 0.86 : 1,
    fill: 0.07,
  }
}
