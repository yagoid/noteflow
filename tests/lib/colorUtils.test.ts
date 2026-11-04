import { describe, it, expect } from 'vitest'
import { THEME_TEXT_COLOR, hexToRgbChannels, hexToRgbTriple, resolveThemeColor, rgbTripleToHex } from '../../src/lib/colorUtils'

describe('hexToRgbChannels', () => {
  it('parses full and shorthand hex', () => {
    expect(hexToRgbChannels('#7aa2f7')).toEqual([122, 162, 247])
    expect(hexToRgbChannels('#7AA2F7')).toEqual([122, 162, 247])
    expect(hexToRgbChannels('#abc')).toEqual([170, 187, 204])
  })

  it('degrades to black on junk', () => {
    expect(hexToRgbChannels('#zzzzzz')).toEqual([0, 0, 0])
  })
})

describe('hexToRgbTriple', () => {
  it('formats the CSS-var channel triple', () => {
    expect(hexToRgbTriple('#7aa2f7')).toBe('122 162 247')
  })
})

describe('rgbTripleToHex', () => {
  it('round-trips a channel triple', () => {
    expect(rgbTripleToHex('122 162 247')).toBe('#7aa2f7')
    expect(rgbTripleToHex('  122 162 247  ')).toBe('#7aa2f7')
    expect(rgbTripleToHex('122, 162, 247')).toBe('#7aa2f7')
  })

  it('clamps out-of-range channels and pads', () => {
    expect(rgbTripleToHex('0 0 0')).toBe('#000000')
    expect(rgbTripleToHex('300 -20 5')).toBe('#ff0005')
  })
})

describe('resolveThemeColor', () => {
  it('resolves the theme-text sentinel to the given --text triple', () => {
    expect(THEME_TEXT_COLOR).toBe('text')
    expect(resolveThemeColor(THEME_TEXT_COLOR, '236 234 224')).toBe('236 234 224')
    expect(resolveThemeColor('text', '42 38 32')).toBe('42 38 32')
  })

  it('passes concrete triples through untouched', () => {
    expect(resolveThemeColor('88 128 214', '236 234 224')).toBe('88 128 214')
  })
})
