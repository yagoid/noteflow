import { describe, expect, it } from 'vitest'
import { pairKeys, shortcutText, tableShortcuts } from '../../src/lib/tableShortcuts'

describe('tableShortcuts', () => {
  it('Windows / Linux chords', () => {
    const s = tableShortcuts(false)
    expect(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.pm]))).toEqual({
      moveRowUp: 'Alt-ArrowUp',
      moveRowDown: 'Alt-ArrowDown',
      moveColumnLeft: 'Alt-ArrowLeft',
      moveColumnRight: 'Alt-ArrowRight',
      insertRowBelow: 'Mod-Enter',
      insertColumnRight: 'Mod-Shift-Enter',
      duplicateRow: 'Mod-d',
      deleteRows: 'Mod-Shift-Backspace',
      deleteColumns: 'Alt-Shift-Backspace',
    })
    expect(shortcutText(s.insertColumnRight.keys, false)).toBe('Ctrl+Shift+Enter')
    expect(shortcutText(s.deleteColumns.keys, false)).toBe('Alt+Shift+Backspace')
  })

  it('macOS: columns move with ⌘⌥←/→ (⌥←/→ is the word jump), keys shown as symbols', () => {
    const s = tableShortcuts(true)
    expect(s.moveColumnLeft.pm).toBe('Mod-Alt-ArrowLeft')
    expect(s.moveColumnRight.pm).toBe('Mod-Alt-ArrowRight')
    expect(s.moveRowUp.pm).toBe('Alt-ArrowUp')
    expect(shortcutText(s.moveColumnRight.keys, true)).toBe('⌘⌥→')
    expect(shortcutText(s.insertRowBelow.keys, true)).toBe('⌘↩')
    expect(shortcutText(s.insertColumnRight.keys, true)).toBe('⌘⇧↩')
    expect(shortcutText(s.duplicateRow.keys, true)).toBe('⌘D')
    expect(shortcutText(s.deleteRows.keys, true)).toBe('⌘⇧⌫')
    expect(shortcutText(s.deleteColumns.keys, true)).toBe('⌥⇧⌫')
  })

  it('no chord is bound twice on a platform', () => {
    for (const mac of [false, true]) {
      const names = Object.values(tableShortcuts(mac)).map((s) => s.pm)
      expect(new Set(names).size).toBe(names.length)
    }
  })
})

describe('pairKeys', () => {
  it('joins the last key of two chords that only differ there', () => {
    expect(pairKeys(['Alt', '↑'], ['Alt', '↓'])).toEqual(['Alt', '↑/↓'])
    expect(pairKeys(['Mod', 'Alt', '←'], ['Mod', 'Alt', '→'])).toEqual(['Mod', 'Alt', '←/→'])
  })

  it('otherwise the first chord', () => {
    expect(pairKeys(['Alt', '↑'], ['Mod', '↓'])).toEqual(['Alt', '↑'])
    expect(pairKeys(['Alt', '↑'], ['Alt', 'Shift', '↓'])).toEqual(['Alt', '↑'])
  })
})
