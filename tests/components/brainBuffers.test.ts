import { describe, it, expect } from 'vitest'
import {
  FLAG_CONTENT, FLAG_INTERIOR, opacityFlags, SegmentBuffer, toU8,
  type SegmentArrays,
} from '../../src/components/Brain/brainBuffers'

// How the line shader (LINE_VS in brainShaders.ts) reads the packed values back. Written out
// here on purpose: the tests pin the wire format, so they must not borrow it from the module.
const opacityOfFlags = (flags: number) => 1 - (flags >> 2) / 63   // keep = 1 - floor(flags / 4) / 63
const rateOfByte = (byte: number) => byte / 127                    // aRevPh.w · 255 / 127
const SEGMENT_BYTES = 44, SEGMENT_BYTES_NO_ARC = 36                // per instance, with and without the arc

const bytes = (d: SegmentArrays) =>
  d.a.byteLength + d.b.byteLength + d.col.byteLength + (d.arc ? d.arc.byteLength : 0) + d.rev.byteLength + d.width.byteLength

/** Adds segment number `i` with values that are easy to recognise afterwards. */
function addNumbered(S: SegmentBuffer, i: number) {
  S.add(i, i + 0.25, i + 0.5, -i, -i - 0.25, -i - 0.5, 0.2, 0.4, 0.6, i % 4, i * 2, i * 2 + 1, 0.1, 0.3, 0.5, 1, 1 + i)
}

describe('toU8', () => {
  it('maps 0..1 onto a byte and clamps what falls outside', () => {
    expect(toU8(0)).toBe(0)
    expect(toU8(1)).toBe(255)
    expect(toU8(0.5)).toBe(128)
    expect(toU8(-0.3)).toBe(0)
    expect(toU8(1.8)).toBe(255) // a typed array would have wrapped this around
    expect(toU8(0.2)).toBe(51)
  })
})

describe('opacityFlags', () => {
  it('leaves a fully opaque segment with no bits set', () => {
    expect(opacityFlags(1)).toBe(0)
    expect(opacityFlags(1.7)).toBe(0)
    expect(opacityOfFlags(0)).toBe(1)
  })

  it('stores an opacity in the six high bits, clear of the two flag bits', () => {
    for (const k of [0, 0.25, 0.5, 0.806, 0.99]) {
      const bits = opacityFlags(k)
      expect(bits & (FLAG_INTERIOR | FLAG_CONTENT)).toBe(0)
      expect(bits).toBeLessThanOrEqual(255)
      expect(opacityOfFlags(bits)).toBeCloseTo(k, 1)
      expect(Math.abs(opacityOfFlags(bits) - k)).toBeLessThanOrEqual(0.5 / 63 + 1e-9)
      // the other flags ride along untouched
      const all = bits | FLAG_INTERIOR | FLAG_CONTENT
      expect(all & FLAG_INTERIOR).toBe(FLAG_INTERIOR)
      expect(all & FLAG_CONTENT).toBe(FLAG_CONTENT)
      expect(opacityOfFlags(all)).toBe(opacityOfFlags(bits))
    }
    expect(opacityFlags(-2)).toBe(63 << 2)
    expect(opacityOfFlags(opacityFlags(0))).toBe(0)
  })

  it('survives the trip through a segment buffer', () => {
    const S = new SegmentBuffer(1)
    S.add(0, 0, 0, 0, 0, 0, 1, 1, 1, opacityFlags(0.8) | FLAG_CONTENT, 0, 0, 0, 0, 0, 1, 1)
    const byte = S.finish().col[3]
    expect(byte & FLAG_CONTENT).toBe(FLAG_CONTENT)
    expect(opacityOfFlags(byte)).toBeCloseTo(0.8, 1)
  })
})

describe('SegmentBuffer', () => {
  it('packs a segment into 44 bytes, 36 without the arc', () => {
    const full = new SegmentBuffer(10), bare = new SegmentBuffer(10, false)
    for (let i = 0; i < 10; i++) { addNumbered(full, i); addNumbered(bare, i) }
    expect(bytes(full.finish()) / 10).toBe(SEGMENT_BYTES)
    expect(bytes(bare.finish()) / 10).toBe(SEGMENT_BYTES_NO_ARC)
    expect(bare.finish().arc).toBeNull()
  })

  it('stores endpoints, arcs and width as floats, the rest as normalised bytes', () => {
    const S = new SegmentBuffer(1)
    S.add(1, 2, 3, 4, 5, 6, 0.2, 0.4, 1.5, FLAG_INTERIOR, 0.75, 1.25, 0.1, 0.86, 0.5, 1, 1.3)
    const d = S.finish()
    expect(d.count).toBe(1)
    expect(Array.from(d.a)).toEqual([1, 2, 3])
    expect(Array.from(d.b)).toEqual([4, 5, 6])
    expect(Array.from(d.col)).toEqual([51, 102, 255, FLAG_INTERIOR]) // 1.5 clamps to 255
    expect(Array.from(d.arc!)).toEqual([0.75, 1.25])
    expect(d.rev[0]).toBe(toU8(0.1))
    expect(d.rev[1]).toBe(toU8(0.86))
    expect(d.rev[2]).toBe(128)
    expect(d.width[0]).toBeCloseTo(1.3, 6)
  })

  it('keeps a pulse rate of 1 exact and the usual range of rates distinguishable', () => {
    const S = new SegmentBuffer(4)
    for (const rate of [1, 0.6, 1.4, 5]) S.add(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, rate, 1)
    const d = S.finish()
    const decoded = [0, 1, 2, 3].map((i) => rateOfByte(d.rev[i * 4 + 3]))
    expect(decoded[0]).toBe(1)
    expect(decoded[1]).toBeCloseTo(0.6, 2)
    expect(decoded[2]).toBeCloseTo(1.4, 2)
    expect(d.rev[3 * 4 + 3]).toBe(255) // out of range: clamped, not wrapped
  })

  it('carries the flags in the colour\'s alpha byte', () => {
    const S = new SegmentBuffer(4)
    for (const flags of [0, FLAG_INTERIOR, FLAG_CONTENT, FLAG_INTERIOR | FLAG_CONTENT]) S.add(0, 0, 0, 0, 0, 0, 1, 1, 1, flags, 0, 0, 0, 0, 0, 1, 1)
    const d = S.finish()
    expect([0, 1, 2, 3].map((i) => d.col[i * 4 + 3])).toEqual([0, 1, 2, 3])
    // the shader reads bit 0 as "inner lattice" and bit 1 as "content relation"
    expect([0, 1, 2, 3].map((i) => d.col[i * 4 + 3] % 2)).toEqual([0, 1, 0, 1])
    expect([0, 1, 2, 3].map((i) => (d.col[i * 4 + 3] >= 2 ? 1 : 0))).toEqual([0, 0, 1, 1])
  })

  it('grows past its capacity without losing a segment', () => {
    const S = new SegmentBuffer(2)
    for (let i = 0; i < 100; i++) addNumbered(S, i)
    const d = S.finish()
    expect(d.count).toBe(100)
    for (const i of [0, 1, 2, 37, 99]) {
      expect(Array.from(d.a.slice(i * 3, i * 3 + 3))).toEqual([i, i + 0.25, i + 0.5])
      expect(Array.from(d.b.slice(i * 3, i * 3 + 3))).toEqual([-i, -i - 0.25, -i - 0.5])
      expect(Array.from(d.arc!.slice(i * 2, i * 2 + 2))).toEqual([i * 2, i * 2 + 1])
      expect(d.col[i * 4 + 3]).toBe(i % 4)
      expect(d.width[i]).toBe(1 + i)
    }
  })

  it('hands back arrays exactly as long as what was added', () => {
    const slack = new SegmentBuffer(64)
    for (let i = 0; i < 5; i++) addNumbered(slack, i)
    const d = slack.finish()
    expect([d.a.length, d.b.length, d.col.length, d.arc!.length, d.rev.length, d.width.length]).toEqual([15, 15, 20, 10, 20, 5])
    expect(bytes(d)).toBe(5 * SEGMENT_BYTES)

    const empty = new SegmentBuffer(0).finish()
    expect(empty.count).toBe(0)
    expect(bytes(empty)).toBe(0)

    const fromZero = new SegmentBuffer(0)
    addNumbered(fromZero, 3)
    expect(fromZero.finish().count).toBe(1)
    expect(bytes(fromZero.finish())).toBe(SEGMENT_BYTES)
  })
})
