// ── Table keyboard shortcuts (definitions, no editor code) ───────────────────
//
// The chords of the editor's table actions, per platform: the ProseMirror key
// name the keymap binds (src/components/Editor/TableKeymap.ts) and the keys to
// show (Settings → Shortcuts, menus). One source for both, so what the UI says
// is what the keymap does. Decisions (why each chord) are documented in
// .agents/context/patterns.md ("Editor: teclado y portapapeles de tablas").

export type TableShortcutAction =
  | 'moveRowUp'
  | 'moveRowDown'
  | 'moveColumnLeft'
  | 'moveColumnRight'
  | 'insertRowBelow'
  | 'insertColumnRight'
  | 'duplicateRow'
  | 'deleteRows'
  | 'deleteColumns'

export interface TableShortcut {
  /** ProseMirror keymap name ('Alt-ArrowUp', 'Mod-Shift-Enter'…). `Mod` = Cmd on macOS, Ctrl elsewhere. */
  pm: string
  /**
   * Keys to show, one token per key. Modifiers as 'Mod' / 'Alt' / 'Shift'
   * (platform.ts keyLabel or shortcutText turn them into ⌘ ⌥ ⇧ or Ctrl Alt
   * Shift); the key itself is already in the platform's form ('↩' / 'Enter').
   */
  keys: string[]
}

/**
 * The table chords on macOS (`mac`) or Windows / Linux. Columns move with
 * ⌘⌥←/→ on macOS because ⌥←/→ is the system's word jump there; elsewhere Alt
 * alone, like rows.
 */
export function tableShortcuts(mac: boolean): Record<TableShortcutAction, TableShortcut> {
  const enter = mac ? '↩' : 'Enter'
  const backspace = mac ? '⌫' : 'Backspace'
  const column = mac ? 'Mod-Alt' : 'Alt'
  const columnKeys = mac ? ['Mod', 'Alt'] : ['Alt']
  return {
    moveRowUp: { pm: 'Alt-ArrowUp', keys: ['Alt', '↑'] },
    moveRowDown: { pm: 'Alt-ArrowDown', keys: ['Alt', '↓'] },
    moveColumnLeft: { pm: `${column}-ArrowLeft`, keys: [...columnKeys, '←'] },
    moveColumnRight: { pm: `${column}-ArrowRight`, keys: [...columnKeys, '→'] },
    insertRowBelow: { pm: 'Mod-Enter', keys: ['Mod', enter] },
    insertColumnRight: { pm: 'Mod-Shift-Enter', keys: ['Mod', 'Shift', enter] },
    duplicateRow: { pm: 'Mod-d', keys: ['Mod', 'D'] },
    deleteRows: { pm: 'Mod-Shift-Backspace', keys: ['Mod', 'Shift', backspace] },
    deleteColumns: { pm: 'Alt-Shift-Backspace', keys: ['Alt', 'Shift', backspace] },
  }
}

/**
 * One row of keys for two chords that differ only in their last key
 * (['Alt', '↑'] + ['Alt', '↓'] → ['Alt', '↑/↓']). Otherwise the first chord's keys.
 */
export function pairKeys(a: readonly string[], b: readonly string[]): string[] {
  const same = a.length === b.length && a.slice(0, -1).every((k, i) => k === b[i])
  return same ? [...a.slice(0, -1), `${a[a.length - 1]}/${b[b.length - 1]}`] : [...a]
}

const MODIFIER_LABELS: Record<string, [mac: string, other: string]> = {
  Mod: ['⌘', 'Ctrl'],
  Alt: ['⌥', 'Alt'],
  Shift: ['⇧', 'Shift'],
}

/**
 * A chord as one string, the way each platform writes it: '⌘⇧↩' on macOS,
 * 'Ctrl+Shift+Enter' elsewhere (for menu entries and tooltips).
 */
export function shortcutText(keys: readonly string[], mac: boolean): string {
  const labels = keys.map((k) => MODIFIER_LABELS[k]?.[mac ? 0 : 1] ?? k)
  return labels.join(mac ? '' : '+')
}
