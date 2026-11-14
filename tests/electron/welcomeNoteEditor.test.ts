// @vitest-environment happy-dom
// The welcome note's sections go through the editor's real markdown pipeline
// (load → save) unchanged: opening the note doesn't rewrite it, and every block
// it shows (headings, lists, task list, code block, quote) is one the editor knows.
import { describe, it, expect } from 'vitest'
import { load, save } from '../helpers/editorPipeline'
import { buildWelcomeNote } from '../../electron/welcomeNote'

const ids = () => { let n = 0; return (c: number) => String(++n).padStart(c, '0') }

describe('welcome note in the editor', () => {
  for (const lang of ['en', 'es'] as const) {
    for (const platform of ['win32', 'darwin']) {
      it(`${lang}/${platform}: every section round-trips unchanged`, () => {
        const note = buildWelcomeNote(lang, platform, '2026-11-14T10:00:00.000Z', ids())
        for (const s of note.sections) expect(save(load(s.content))).toBe(s.content)
      })
    }
  }
})
