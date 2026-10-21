// `AccountErrorCode` (why a NoteFlow account operation failed) is DUPLICATED on
// purpose in three places:
//   - main:     electron/account.ts       (emits the code)
//   - renderer: src/types/index.ts        (can't import from electron/)
//   - copy:     settings.account.errors   (one localized message per code)
// A code emitted by main with no entry in the dicts would surface as the raw
// English fallback from GoTrue — exactly the bug this whole layer removes — so
// the mirror is turned into an invariant here. The unions are read as TEXT
// because electron/account.ts imports `electron` at module load.
import fs from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'
import { en } from '../../src/i18n/en'
import { es } from '../../src/i18n/es'

const ROOT = path.resolve(__dirname, '../..')

/** Reads the string members of the `AccountErrorCode` union declared in a file. */
function unionMembers(relPath: string): string[] {
  const source = fs.readFileSync(path.join(ROOT, relPath), 'utf-8')
  const start = source.indexOf('export type AccountErrorCode =')
  expect(start, `AccountErrorCode not declared in ${relPath}`).toBeGreaterThanOrEqual(0)
  // The union ends at the first blank line after the declaration. EOL-agnostic:
  // with core.autocrlf=true the checkout is CRLF, so a literal '\n\n' never matches.
  const blankLine = /\r?\n[ \t]*\r?\n/.exec(source.slice(start))
  const block = source.slice(start, blankLine ? start + blankLine.index : undefined)
  return Array.from(block.matchAll(/'([A-Za-z]+)'/g), (m) => m[1])
}

describe('AccountErrorCode — main ↔ renderer ↔ i18n mirror', () => {
  const mainCodes = unionMembers('electron/account.ts')
  const rendererCodes = unionMembers('src/types/index.ts')

  it('declares the same codes in main and in the renderer types', () => {
    expect(mainCodes.length).toBeGreaterThan(0)
    expect([...rendererCodes].sort()).toEqual([...mainCodes].sort())
  })

  it('has exactly one English message per code — no missing, no leftovers', () => {
    expect(Object.keys(en.settings.account.errors).sort()).toEqual([...mainCodes].sort())
  })

  it('has the Spanish mirror of those messages', () => {
    expect(Object.keys(es.settings.account.errors).sort()).toEqual([...mainCodes].sort())
  })
})
