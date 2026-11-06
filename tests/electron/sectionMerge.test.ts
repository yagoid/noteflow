// Line merge of a section both sides changed (mergeSectionText,
// electron/cloudSyncLogic.ts) — what the Cloud three-way pull does instead of a
// conflict copy. The bug it fixes (2026-11-06): the CLI appended a line to a
// section (`noteflow add … --section "Improvements"`) whose remote version
// the desktop app had already written to disk; the CLI's base was older, so
// the pull saw "both changed" and created a separate note "<title> (conflict
// copy …)" identical to the remote but for the added line.
import { describe, it, expect } from 'vitest'
import { mergeSectionText, DEFAULT_SECTION_CONFLICT_LABELS as L } from '../../electron/cloudSyncLogic'

const block = (local: string[], remote: string[]) => [`> ${L.local}`, '', ...local, '', `> ${L.remote}`, '', ...remote, '', `> ${L.end}`]

describe('mergeSectionText — the real case: this device appended a line at the end', () => {
  const remote = '- [ ] one\n- [ ] two\n- [ ] desktop'
  const local = `${remote}\n- [ ] cli`

  it('without base content: remote + the line, no conflict (with and without a final newline)', () => {
    expect(mergeSectionText(null, local, remote)).toEqual({ content: local, conflicts: 0 })
    expect(mergeSectionText(null, `${local}\n`, `${remote}\n`)).toEqual({ content: `${local}\n`, conflicts: 0 })
    // The local line was appended WITH a newline to a remote that has none.
    expect(mergeSectionText(null, `${local}\n`, remote)).toEqual({ content: `${local}\n`, conflicts: 0 })
  })

  it('with the stale base (the remote WITHOUT the desktop change): still remote + the line', () => {
    const base = '- [ ] one\n- [ ] two'
    expect(mergeSectionText(base, local, remote)).toEqual({ content: local, conflicts: 0 })
    expect(mergeSectionText(`${base}\n`, `${local}\n`, `${remote}\n`)).toEqual({ content: `${local}\n`, conflicts: 0 })
    expect(mergeSectionText(base, `${local}\n`, remote)).toEqual({ content: `${local}\n`, conflicts: 0 })
  })

  it('with the exact base (= remote): the local version', () => {
    expect(mergeSectionText(remote, local, remote)).toEqual({ content: local, conflicts: 0 })
  })

  it('never duplicates nor glues lines', () => {
    const { content } = mergeSectionText(null, local, remote)
    expect(content.split('\n')).toEqual(['- [ ] one', '- [ ] two', '- [ ] desktop', '- [ ] cli'])
  })
})

describe('mergeSectionText — diff3 with the base', () => {
  const base = 'a\nb\nc\nd\ne'

  it('additions in different places on each side are combined', () => {
    expect(mergeSectionText(base, 'a\nL\nb\nc\nd\ne', 'a\nb\nc\nd\nR\ne')).toEqual({ content: 'a\nL\nb\nc\nd\nR\ne', conflicts: 0 })
  })

  it('edits of different lines are combined', () => {
    expect(mergeSectionText(base, 'A\nb\nc\nd\ne', 'a\nb\nc\nd\nE')).toEqual({ content: 'A\nb\nc\nd\nE', conflicts: 0 })
  })

  it('the same change on both sides is taken once', () => {
    expect(mergeSectionText(base, 'a\nb\nC\nd\ne\nx', 'a\nb\nC\nd\ne\nx')).toEqual({ content: 'a\nb\nC\nd\ne\nx', conflicts: 0 })
    expect(mergeSectionText(base, 'a\nb\nC\nd\ne', 'a\nb\nC\nd\ne\nR')).toEqual({ content: 'a\nb\nC\nd\ne\nR', conflicts: 0 })
  })

  it('a deletion on one side is applied', () => {
    expect(mergeSectionText(base, 'a\nb\nd\ne', 'a\nb\nc\nd\ne\nR')).toEqual({ content: 'a\nb\nd\ne\nR', conflicts: 0 })
  })

  it('a real conflict on the same line keeps both versions between the markers', () => {
    const r = mergeSectionText(base, 'a\nb\nmine\nd\ne', 'a\nb\ntheirs\nd\ne')
    expect(r.conflicts).toBe(1)
    expect(r.content.split('\n')).toEqual(['a', 'b', '', ...block(['mine'], ['theirs']), '', 'd', 'e'])
  })

  it('a section edited here and deleted (emptied) there: the edit stays', () => {
    expect(mergeSectionText('x', 'x2', '')).toEqual({ content: 'x2', conflicts: 0 })
  })
})

describe('mergeSectionText — two-way union (base content unknown)', () => {
  it('a deletion on one side comes back (nothing is ever lost)', () => {
    expect(mergeSectionText(null, 'a\nb\nd', 'a\nb\nc\nd')).toEqual({ content: 'a\nb\nc\nd', conflicts: 0 })
  })

  it('additions in different places are combined', () => {
    expect(mergeSectionText(null, 'L\na\nb', 'a\nb\nR')).toEqual({ content: 'L\na\nb\nR', conflicts: 0 })
  })

  it('a line changed on one side cannot be told from a conflict: both versions', () => {
    const r = mergeSectionText(null, 'a\nmine\nz', 'a\ntheirs\nz')
    expect(r.conflicts).toBe(1)
    expect(r.content.split('\n')).toEqual(['a', '', ...block(['mine'], ['theirs']), '', 'z'])
  })

  it('a conflict at the start / the end gets no stray blank line outside the block', () => {
    expect(mergeSectionText(null, 'mine', 'theirs').content.split('\n')).toEqual(block(['mine'], ['theirs']))
    expect(mergeSectionText(null, 'a\nmine\n', 'a\ntheirs\n').content).toBe(['a', '', ...block(['mine'], ['theirs'])].join('\n') + '\n')
  })
})

describe('mergeSectionText — line endings and labels', () => {
  it('CRLF on both sides: compared without terminators, written back as CRLF', () => {
    const remote = 'one\r\ntwo\r\n'
    const local = 'one\r\ntwo\r\nthree\r\n'
    expect(mergeSectionText(null, local, remote)).toEqual({ content: local, conflicts: 0 })
    expect(mergeSectionText('one\r\n', local, remote)).toEqual({ content: local, conflicts: 0 })
  })

  it('mixed endings (an editor rewrote one side as CRLF): no spurious conflict, the remote ending wins', () => {
    expect(mergeSectionText(null, 'one\r\ntwo\r\nthree', 'one\ntwo')).toEqual({ content: 'one\ntwo\nthree', conflicts: 0 })
  })

  it('custom (localized) labels', () => {
    const labels = { local: 'ESTE', remote: 'OTRO', end: 'FIN' }
    expect(mergeSectionText(null, 'x', 'y', labels).content).toBe('> ESTE\n\nx\n\n> OTRO\n\ny\n\n> FIN')
  })

  it('empty sides', () => {
    expect(mergeSectionText(null, '', '')).toEqual({ content: '', conflicts: 0 })
    expect(mergeSectionText(null, 'a\n', '')).toEqual({ content: 'a\n', conflicts: 0 })
    expect(mergeSectionText('', '', 'b')).toEqual({ content: 'b', conflicts: 0 })
  })

  it('large, very different sides stay bounded (the middle becomes one hunk)', () => {
    const a = Array.from({ length: 4000 }, (_, i) => `a${i}`).join('\n')
    const b = Array.from({ length: 4000 }, (_, i) => `b${i}`).join('\n')
    const r = mergeSectionText(null, `head\n${a}\ntail`, `head\n${b}\ntail`)
    expect(r.conflicts).toBe(1)
    expect(r.content.startsWith('head\n\n> ')).toBe(true)
    expect(r.content.endsWith('\n\ntail')).toBe(true)
  })
})
