// GENERATED — copied from src/components/Brain/brainShaders.ts by docs/scripts/build-brain.mjs.
// Do not edit here: change the app's module and run `npm run brain` in docs/.

// GLSL for the 3D brain (BrainScene.tsx). Plain strings, no three import.
//
// Written in GLSL ES 1.00 style (attribute / varying / gl_FragColor): three's ShaderMaterial
// translates it for WebGL2 and prepends the precision statement and its built-ins
// (projectionMatrix, modelViewMatrix, viewMatrix, position, uv), so none of that is declared here.
// Nothing needs an extension.
//
// Three programs draw the whole brain — lines, dots and nodes — plus the final grade pass. Every
// layer of a kind shares its program and differs only in uniforms, so adding a layer never adds a
// shader compile.
//
// The parameters of a layer are packed into a few vec4 uniforms instead of one float each. Layers
// that share a program overwrite each other's uniforms on every material switch, so the number of
// uniforms is the number of GL calls per layer per frame: four floats in one vec4 are one call.

import { BRAIN_LOOK } from './look'

/** A number as a GLSL float literal (GLSL wants the decimal point). */
const glsl = (x: number) => (Number.isInteger(x) ? x.toFixed(1) : String(x))
// How long a ripple lives: the scene keeps drawing for exactly this long after firing one
// (reduced motion renders on demand), so shader and scene read the same number.
const WAVE_LIFE = glsl(BRAIN_LOOK.motion.waveLife)

// Shared by the three vertex shaders: the depth cue, the ripples, the entrance and the depth bias.
const COMMON = /* glsl */ `
uniform float uTime;
uniform vec3 uCenter;      // centre of the brain's bounding sphere…
uniform float uRadius;     // …and its radius: together they normalise depth across the brain
uniform float uReveal;     // entrance front, grows from 0 outwards from the core
uniform float uRevealOn;   // 1 while the entrance plays
uniform mat4 uWaves;       // four ripples, one per column: xyz = origin, w = start time (< 0 = unused)
uniform float uWaveGain;
uniform vec2 uFade;
uniform float uZBias;

// 0 at the point of the brain nearest to the camera, 1 at the farthest.
float depthN(float mvz) {
  float zc = (viewMatrix * vec4(uCenter, 1.0)).z;
  return clamp(((zc + uRadius) - mvz) / (2.0 * uRadius), 0.0, 1.0);
}
float fadeBy(float dn, float back) {
  return mix(1.0, back, smoothstep(uFade.x, uFade.y, dn));
}
// One ripple at a point: a thin shell that expands from its origin and fades out over its life.
float ripple(vec3 p, vec4 wave) {
  float age = uTime - wave.w;
  float live = (wave.w >= 0.0 && age >= 0.0 && age < ${WAVE_LIFE}) ? 1.0 : 0.0;
  float x = (distance(p, wave.xyz) - age * 0.95) / 0.12;
  return exp(-x * x) * (1.0 - age / ${WAVE_LIFE}) * live;
}
// Sum of the live ripples. The columns are indexed with constants on purpose: indexing a matrix
// with a loop variable makes the Direct3D shader compiler (Windows) emit a warning, which three
// then logs.
float waveAt(vec3 p) {
  return (ripple(p, uWaves[0]) + ripple(p, uWaves[1]) + ripple(p, uWaves[2]) + ripple(p, uWaves[3])) * uWaveGain;
}
// Clip-space z of a view-space point pulled toward the camera by uZBias, for a vertex whose w is
// already known: keeps what sits on the surface in front of the depth skin.
float biasedZ(vec4 mv, float w) {
  vec4 q = mv;
  q.z += uZBias;
  vec4 cb = projectionMatrix * q;
  return cb.z / cb.w * w;
}
// Entrance: dim until the front arrives (rev = distance from the core, 0..~0.9)…
float revealAt(float rev) {
  return uRevealOn > 0.5 ? mix(0.2, 1.0, smoothstep(0.0, 0.12, uReveal - rev)) : 1.0;
}
// …and a flash as it passes.
float revealEdge(float rev) {
  if (uRevealOn < 0.5) return 0.0;
  float x = (uReveal - rev - 0.05) / 0.07;
  return exp(-x * x);
}
`

// ── Lines ────────────────────────────────────────────────────────────────────────
// One instanced quad per segment, expanded in screen space: soft antialiased lines of any width
// (GL lines are locked to 1px), with the depth cue, pulses travelling along the arc and a sweep
// head (hover / thinking).
//
// Per instance (44 bytes; layers that draw whole lines leave aArc out — see BrainScene):
//   aA, aB     endpoints
//   aCol       rgb + flags in alpha (inner lattice, content relation, per-segment opacity), u8 normalised
//   aArc       arc length at each end
//   aRevPh     entrance coordinate at each end, pulse phase, pulse rate (1.0 = 127/255), u8 normalised
//   aWidth     width multiplier
export const LINE_VS = COMMON + /* glsl */ `
attribute vec3 aA;
attribute vec3 aB;
attribute vec4 aCol;
attribute vec2 aArc;
attribute vec4 aRevPh;
attribute float aWidth;
uniform vec2 uRes;           // drawing buffer size, device px
uniform float uPx;           // device pixel ratio
uniform vec4 uShape;         // width (CSS px) · thinning with depth · opacity × of the inner lattice · opacity left at the back
uniform vec4 uTone;          // colour × · entrance glow · near fade distance (0 = off) · how strongly ripples light the line up
uniform vec2 uCull;          // what this pass skips: 1 = the inner lattice · surface segments no wider than this (aWidth; 0 = none)
uniform float uShowContent;  // 0 hides the content relations (AI off); user relations stay
varying vec3 vCol;
varying float vAlpha;
varying float vSide;
varying float vHalf;
varying float vArc;
varying float vBoost;
varying vec2 vPh;
void main() {
  // flags byte: bit 0 inner lattice · bit 1 content relation · six high bits = how much opacity to drop
  float flags = floor(aCol.a * 255.0 + 0.5);
  float interior = mod(flags, 2.0);
  float content = mod(floor(flags * 0.5), 2.0);
  // A segment this pass has no use for leaves before any work is done, as a point outside the
  // clip volume (no fragments): a content relation while those are hidden, or what uCull names.
  if ((content > 0.5 && uShowContent < 0.5) || (interior > 0.5 ? uCull.x > 0.5 : aWidth <= uCull.y)) {
    vCol = vec3(0.0);
    vAlpha = 0.0;
    vSide = 0.0;
    vHalf = 0.0;
    vArc = 0.0;
    vBoost = 0.0;
    vPh = vec2(0.0);
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float t = position.x;
  float side = position.y;
  vec4 mvA = modelViewMatrix * vec4(aA, 1.0);
  vec4 mvB = modelViewMatrix * vec4(aB, 1.0);
  vec4 cA = projectionMatrix * mvA;
  vec4 cB = projectionMatrix * mvB;
  vec2 sA = cA.xy / cA.w * uRes * 0.5;
  vec2 sB = cB.xy / cB.w * uRes * 0.5;
  vec2 dir = sB - sA;
  float len = length(dir);
  dir = len > 1e-4 ? dir / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  vec4 mv = mix(mvA, mvB, t);
  float dn = depthN(mv.z);
  float w = uShape.x * uPx * aWidth * mix(1.0 + uShape.y, 1.0 - uShape.y, dn);
  // a line thinner than a pixel keeps a 1px quad and fades instead (plus 2px for the soft edge)
  float geo = max(w, 1.0) + 2.0;
  vec4 c = mix(cA, cB, t);
  c.xy += nrm * side * geo * 0.5 / (uRes * 0.5) * c.w;
  if (uZBias > 0.0) c.z = biasedZ(mv, c.w);

  float keep = 1.0 - floor(flags * 0.25) / 63.0;
  float rev = mix(aRevPh.x, aRevPh.y, t);
  vCol = aCol.rgb * uTone.x;
  vAlpha = min(w, 1.0) * fadeBy(dn, uShape.w) * mix(1.0, uShape.z, interior) * revealAt(rev) * keep;
  if (uTone.z > 0.0) vAlpha *= smoothstep(uTone.z * 0.45, uTone.z, -mv.z);
  vBoost = (waveAt(mix(aA, aB, t)) + revealEdge(rev) * uTone.y) * uTone.w;
  vArc = mix(aArc.x, aArc.y, t);
  vPh = vec2(aRevPh.z, aRevPh.w * (255.0 / 127.0));
  vSide = side * geo * 0.5;
  vHalf = max(w, 1.0) * 0.5;
  gl_Position = c;
}
`

export const LINE_FS = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uAA;
uniform vec4 uFlow;    // pulse strength (0 = none) · opacity between pulses (0 = only the pulses show) · frequency along the arc · speed
uniform vec4 uSweep;   // pulse length · sweep head along the arc (99 = fully drawn) · sweep envelope · opacity left at the far end
varying vec3 vCol;
varying float vAlpha;
varying float vSide;
varying float vHalf;
varying float vArc;
varying float vBoost;
varying vec2 vPh;
void main() {
  float edge = 1.0 - smoothstep(vHalf - uAA, vHalf + uAA, abs(vSide));
  float a = uOpacity * vAlpha * edge * uSweep.z * clamp((uSweep.y - vArc) / 0.06, 0.0, 1.0) * mix(1.0, uSweep.w, clamp(vArc, 0.0, 1.0));
  float pulse = 0.0;
  if (uFlow.x > 0.0) {
    float ph = fract(vArc * uFlow.z - uTime * uFlow.w * vPh.y + vPh.x);
    pulse = smoothstep(1.0 - uSweep.x, 1.0, ph);
    pulse *= pulse;
  }
  float extra = pulse * uFlow.x + vBoost;
  a *= uFlow.y + extra;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vCol * (1.0 + extra * 0.55), min(a, 1.0));
}
`

// ── Dots ─────────────────────────────────────────────────────────────────────────
// Round soft points: the lattice vertices, the far constellation and the motes.
//   aDot   inner-lattice flag, entrance coordinate, random seed, brightness weight (u8 normalised)
export const DOT_VS = COMMON + /* glsl */ `
attribute vec4 aDot;
uniform float uScale;      // half the drawing buffer height: world size → device px at distance 1
uniform vec4 uDot;         // size (world) · opacity left at the back · opacity × of the inner lattice · 1 = brightness follows the vertex weight
uniform vec4 uAnim;        // twinkle · drift · how strongly ripples light the dot up · near fade distance (0 = off)
uniform vec3 uColor;
varying float vAlpha;
varying vec3 vCol;
void main() {
  float inner = aDot.x;
  float rev = aDot.y;
  float seed = aDot.z;
  vec3 p = position;
  if (uAnim.y > 0.0) p += uAnim.y * vec3(sin(uTime * 0.21 + seed * 31.0), cos(uTime * 0.17 + seed * 17.0), sin(uTime * 0.19 + seed * 53.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  if (uZBias > 0.0) gl_Position.z = biasedZ(mv, gl_Position.w);
  float dn = depthN(mv.z);
  float wv = waveAt(p) * uAnim.z + revealEdge(rev);
  float s = uDot.x * uScale / -mv.z * (1.0 + wv * 0.5);
  gl_PointSize = max(s, 1.5);
  float tw = 1.0 - uAnim.x * (0.5 + 0.5 * sin(uTime * (0.8 + seed * 1.7) + seed * 40.0));
  vAlpha = min(s / 1.5, 1.0) * fadeBy(dn, uDot.y) * mix(1.0, uDot.z, inner) * revealAt(rev) * tw * (1.0 + wv);
  if (uAnim.w > 0.0) vAlpha *= smoothstep(uAnim.w * 0.45, uAnim.w, -mv.z);
  vCol = uColor * mix(1.0, aDot.w, uDot.w) * (1.0 + wv * 0.6);
}
`

export const DOT_FS = /* glsl */ `
uniform float uOpacity;
uniform float uSoft;
varying float vAlpha;
varying vec3 vCol;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = (1.0 - smoothstep(uSoft, 1.0, d)) * uOpacity * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol, min(a, 1.0));
}
`

// ── Nodes ────────────────────────────────────────────────────────────────────────
// One sprite per node. Mode 0 draws the node itself: a faint fill, a ring and a centre dot.
// Mode 1 draws what glows behind it: the halo, plus the signal of a note cited by the AI
// (rings rippling outwards).
//   aSize    ring radius (world units)
//   aStyle   centre brightness, ring brightness, ring opacity, fill opacity
//   aState   cited (0/1), lit while something is focused (0/1), random seed, entrance coordinate
const NODE_UNIFORMS = /* glsl */ `
uniform vec4 uNode;        // sprite half-size in ring radii · opacity left at the back · mode (0 node, 1 halo) · opacity
`

export const NODE_VS = COMMON + NODE_UNIFORMS + /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute vec4 aStyle;
attribute vec4 aState;
uniform float uScale;
uniform float uFocusAmt;   // 0..1: how far the focus dim has faded in
uniform float uDimTo;      // opacity left on a node unrelated to the focused one
uniform float uCore;
uniform float uWaveSize;
uniform float uHaloCut;    // radius (in ring radii) by which a plain halo has faded below the discard threshold
varying vec3 vColor;
varying vec4 vStyle;
varying float vAlpha;
varying float vPx;
varying float vLit;
varying float vSeed;
varying float vCoreR;
varying float vWave;
varying float vExt;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  if (uZBias > 0.0) gl_Position.z = biasedZ(mv, gl_Position.w);
  float dn = depthN(mv.z);
  float rev = aState.w;
  float rv = uRevealOn > 0.5 ? mix(0.28, 1.0, smoothstep(0.0, 0.08, uReveal - rev)) : 1.0;
  float pop = 1.0;
  if (uRevealOn > 0.5) {
    float x = (uReveal - rev - 0.09) / 0.07;
    pop += 0.45 * exp(-x * x);
  }
  vWave = waveAt(position);
  float ring = aSize * pop * (1.0 + vWave * uWaveSize);
  // The halo sprite is as large as the rings of a cited note travel. A node that is not cited
  // only has its glow, gone long before that edge: it gets a sprite just big enough for it —
  // the same picture for a fraction of the fragments.
  float ext = uNode.x;
  if (uNode.z > 0.5 && aState.x < 0.5) ext = min(ext, uHaloCut);
  float s = max(ring * ext * uScale / -mv.z, 2.0);
  gl_PointSize = s;
  vPx = 2.0 * ext / s;
  vExt = ext;
  vAlpha = fadeBy(dn, uNode.y) * rv * mix(1.0, mix(uDimTo, 1.0, aState.y), uFocusAmt);
  vColor = aColor;
  vStyle = aStyle;
  vLit = aState.x;
  vSeed = aState.z;
  vCoreR = uCore / aSize;
}
`

export const NODE_FS = NODE_UNIFORMS + /* glsl */ `
uniform vec2 uLit;         // the cited-note signal: its clock · how much each node's seed offsets it.
                           // Normally (time, 1). With reduced motion (a constant, 0): the rings and
                           // the glow stand still, the same on every cited node.
uniform float uRingW;
uniform float uCoreSoft;
uniform float uGlow;
uniform float uGlowSize;
varying vec3 vColor;
varying vec4 vStyle;
varying float vAlpha;
varying float vPx;
varying float vLit;
varying float vSeed;
varying float vCoreR;
varying float vWave;
varying float vExt;
float ringAt(float d, float r, float hw) {
  return 1.0 - smoothstep(hw - vPx, hw + vPx, abs(d - r));
}
void main() {
  float ext = uNode.x;
  // distance from the centre, in ring radii (vExt: the half-size this sprite was actually given)
  float d = length(gl_PointCoord - 0.5) * 2.0 * vExt;
  if (uNode.z < 0.5) {
    float ring = ringAt(d, 0.78, uRingW) * vStyle.z;
    float core = 1.0 - smoothstep(vCoreR * uCoreSoft, vCoreR, d);
    float fill = (1.0 - smoothstep(0.78 - vPx, 0.78 + vPx, d)) * vStyle.w;
    // fill, then the ring over it, then the centre over both (premultiplied, divided out at the end)
    vec3 rgb = vColor * vStyle.y * fill;
    float a = fill;
    rgb = vColor * vStyle.y * ring + rgb * (1.0 - ring);
    a = ring + a * (1.0 - ring);
    rgb = vColor * vStyle.x * core + rgb * (1.0 - core);
    a = core + a * (1.0 - core);
    float k = vAlpha * uNode.w;
    if (a * k < 0.004) discard;
    gl_FragColor = vec4(rgb / max(a, 1e-4), min(a * k, 1.0));
  } else {
    float g = exp(-d * d / (uGlowSize * uGlowSize * 0.2)) * uGlow * (1.0 + vWave * 1.5);
    g *= 1.0 - smoothstep(ext * 0.72, ext, d);
    float lit = 0.0;
    vec3 c = vColor;
    if (vLit > 0.5) {
      for (int i = 0; i < 2; i++) {
        float ph = fract(uLit.x * 0.42 + vSeed * uLit.y + float(i) * 0.5);
        lit += ringAt(d, 0.9 + ph * (ext - 1.7), max(0.07, vPx * 1.15)) * (1.0 - ph) * (1.0 - ph) * 0.9;
      }
      lit += exp(-d * d / 2.4) * (0.6 + 0.2 * sin(uLit.x * 2.4 + vSeed * 6.283 * uLit.y));
      c = vColor * 1.45;
    }
    float a = (g + lit) * vAlpha * uNode.w;
    if (a < 0.004) discard;
    gl_FragColor = vec4(c, min(a, 1.0));
  }
}
`

// ── Grade ────────────────────────────────────────────────────────────────────────
// The last full-screen pass, the one that writes to the screen. In one go it does everything that
// would otherwise each cost a full-screen draw of its own:
//   · adds the bloom (the bloom pass's own additive blend onto the scene buffer is switched off),
//   · adds the light inside the brain (it used to be a screen-filling additive sprite),
//   · then the soft light behind the brain, the vignette centred on it and a little animated grain.
export const GRADE_VS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const GRADE_FS = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tBloom;  // the bloom pass's composite (every mip, strength applied), at its own resolution
uniform float uBloomOn;    // 0: no bloom (light themes), or the pass still blends it itself
uniform vec2 uCenterUv;    // where the brain's centre lands on screen
uniform float uAspect;
uniform float uVig;
uniform float uLift;
uniform vec3 uLiftCol;
uniform float uGrain;
uniform float uTime;
uniform vec3 uCore;        // the light inside the brain: where its centre lands (xy, uv) and its radius in screen heights (0 = none)
uniform vec3 uCoreCol;     // its colour × opacity
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  // The bloom, exactly as its pass would have blended it: additive, weighted by its own alpha,
  // clipped at 1 like the 8-bit buffer it used to be written to. (textureLod: no derivatives
  // inside a branch.)
  if (uBloomOn > 0.5) {
    vec4 b = textureLod(tBloom, vUv, 0.0);
    c.rgb = min(c.rgb + b.rgb * b.a, 1.0);
  }
  // The inner light: a round glow with the falloff of the old sprite's texture — 1 at the centre,
  // 0.42 at a quarter of the radius, 0.1 at 0.6, 0 at the rim, straight lines in between.
  if (uCore.z > 0.0) {
    vec2 d = vUv - uCore.xy;
    d.x *= uAspect;
    float k = length(d) / uCore.z;
    float g = k < 0.25 ? mix(1.0, 0.42, k / 0.25) : (k < 0.6 ? mix(0.42, 0.1, (k - 0.25) / 0.35) : mix(0.1, 0.0, min((k - 0.6) / 0.4, 1.0)));
    c.rgb = min(c.rgb + uCoreCol * g, 1.0);
  }
  vec2 q = vUv - uCenterUv;
  q.x *= uAspect;
  float r = length(q);
  c.rgb += uLiftCol * uLift * exp(-r * r * 6.0);
  c.rgb *= 1.0 - uVig * smoothstep(0.3, 1.05, r);
  float n = fract(sin(dot(gl_FragCoord.xy + floor(uTime * 24.0) * 7.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  c.rgb += n * uGrain;
  gl_FragColor = c;
}
`
