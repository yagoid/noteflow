// GENERATED — copied from src/components/Brain/brainBuffers.ts by docs/scripts/build-brain.mjs.
// Do not edit here: change the app's module and run `npm run brain` in docs/.

// Compact per-instance buffers for the brain's lines (pure typed-array packing: no three, no DOM).
//
// Every line of the 3D brain — scaffold wire, structure routes, synapses, impulses, sweeps — is an
// instanced quad (see LINE_VS in brainShaders.ts), so the bytes per segment are the bulk of what
// the scene uploads to the GPU. The layout is 44 bytes per segment, 36 without the arc:
//
//   a, b    2 × vec3 float32   endpoints                                   24 B
//   col     vec4 uint8         rgb + flags (FLAG_*)                         4 B
//   arc     vec2 float32       arc length at each end (optional)            8 B
//   rev     vec4 uint8         entrance coord × 2, pulse phase, pulse rate  4 B
//   width   float32            width multiplier                             4 B
//
// Colours, entrance coordinates and phases live in 0..1, where 8 bits are plenty. The pulse rate
// is stored as rate × RATE_ONE so that a rate of exactly 1 survives the round trip.
//
// The flags byte: bit 0 and bit 1 are FLAG_INTERIOR / FLAG_CONTENT; the six high bits hold a
// per-segment opacity (see opacityFlags), which lets two kinds of line that differ only in width
// and opacity share one draw call.

/** The segment belongs to the inner lattice (its opacity follows the layer's `interior`). */
export const FLAG_INTERIOR = 1
/** The segment belongs to a content (AI) relation: hidden while content edges are off. */
export const FLAG_CONTENT = 2

/**
 * Flag bits for a segment drawn at `k` (0..1) of its layer's opacity. 64 steps; full opacity is 0,
 * so segments that never ask for this are untouched. Combine with the other flags by OR. The
 * shader reads them back as 1 - (flags >> 2) / 63.
 */
export function opacityFlags(k: number): number {
  return Math.round((1 - (k <= 0 ? 0 : k >= 1 ? 1 : k)) * 63) << 2
}
// uint8 code of a pulse rate of 1 (the shader divides by it: aRevPh.w · 255 / 127). Rates span 0 .. ≈ 2.
const RATE_ONE = 127

/** A 0..1 value as a normalised byte (clamped: a typed array would wrap, not clamp). */
export function toU8(x: number): number {
  return x <= 0 ? 0 : x >= 1 ? 255 : Math.round(x * 255)
}

export interface SegmentArrays {
  count: number
  a: Float32Array
  b: Float32Array
  col: Uint8Array
  arc: Float32Array | null
  rev: Uint8Array
  width: Float32Array
}

/** A growable list of line segments in the packed layout above. */
export class SegmentBuffer {
  count = 0
  private capacity: number
  private a: Float32Array
  private b: Float32Array
  private col: Uint8Array
  private arc: Float32Array | null
  private rev: Uint8Array
  private width: Float32Array

  /** `capacity` is a hint (the buffer grows); `withArc: false` leaves the arc out altogether. */
  constructor(capacity: number, withArc = true) {
    const n = Math.max(0, Math.floor(capacity))
    this.capacity = n
    this.a = new Float32Array(n * 3)
    this.b = new Float32Array(n * 3)
    this.col = new Uint8Array(n * 4)
    this.arc = withArc ? new Float32Array(n * 2) : null
    this.rev = new Uint8Array(n * 4)
    this.width = new Float32Array(n)
  }

  add(
    ax: number, ay: number, az: number, bx: number, by: number, bz: number,
    r: number, g: number, bl: number, flags: number,
    arcA: number, arcB: number, revA: number, revB: number,
    phase: number, rate: number, width: number,
  ): void {
    if (this.count === this.capacity) this.grow()
    const i = this.count++, i3 = i * 3, i4 = i * 4
    this.a[i3] = ax; this.a[i3 + 1] = ay; this.a[i3 + 2] = az
    this.b[i3] = bx; this.b[i3 + 1] = by; this.b[i3 + 2] = bz
    this.col[i4] = toU8(r); this.col[i4 + 1] = toU8(g); this.col[i4 + 2] = toU8(bl); this.col[i4 + 3] = flags & 255
    if (this.arc) { this.arc[i * 2] = arcA; this.arc[i * 2 + 1] = arcB }
    this.rev[i4] = toU8(revA); this.rev[i4 + 1] = toU8(revB); this.rev[i4 + 2] = toU8(phase)
    this.rev[i4 + 3] = Math.max(0, Math.min(255, Math.round(rate * RATE_ONE)))
    this.width[i] = width
  }

  private grow(): void {
    const n = Math.max(16, this.capacity * 2)
    const f32 = (old: Float32Array, k: number) => { const next = new Float32Array(n * k); next.set(old); return next }
    const u8 = (old: Uint8Array, k: number) => { const next = new Uint8Array(n * k); next.set(old); return next }
    this.a = f32(this.a, 3); this.b = f32(this.b, 3); this.col = u8(this.col, 4)
    if (this.arc) this.arc = f32(this.arc, 2)
    this.rev = u8(this.rev, 4); this.width = f32(this.width, 1)
    this.capacity = n
  }

  /** The arrays, exactly `count` segments long (copied down if the buffer has slack). */
  finish(): SegmentArrays {
    const n = this.count
    if (n === this.capacity) return { count: n, a: this.a, b: this.b, col: this.col, arc: this.arc, rev: this.rev, width: this.width }
    return {
      count: n,
      a: this.a.slice(0, n * 3), b: this.b.slice(0, n * 3), col: this.col.slice(0, n * 4),
      arc: this.arc ? this.arc.slice(0, n * 2) : null,
      rev: this.rev.slice(0, n * 4), width: this.width.slice(0, n),
    }
  }
}
