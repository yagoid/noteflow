import { describe, it, expect } from 'vitest'
import {
  NOTE_GRID_MIN_COLUMN,
  TASK_STATS_MIN,
  clipPreviewMarkdown,
  gridColumnCount,
  gridNeighbor,
  planNoteGrid,
  sectionCardStats,
  type NoteGridRow,
} from '../../src/lib/noteOverviewGrid'
import { reorderDropSide } from '../../src/lib/sectionMap'

// Compact view of a plan: each row as "id:units" / "+:units", slim rows marked with "~".
const shape = (rows: NoteGridRow[]) =>
  rows.map((row) =>
    (row.slim ? '~' : '') +
    row.cells.map((c) => (c.kind === 'section' ? `${c.id}:${c.units}` : `+:${c.units}`)).join(' '))

describe('gridColumnCount', () => {
  it('fits as many 220px columns (with 4px joints) as the width allows', () => {
    // 4 columns need 4 × 220 + 3 × 4 = 892px.
    expect(gridColumnCount(892)).toBe(4)
    expect(gridColumnCount(891)).toBe(3)
    expect(gridColumnCount(1200)).toBe(5)
    expect(gridColumnCount(NOTE_GRID_MIN_COLUMN)).toBe(1)
  })

  it('is at least one column (narrow or not laid out yet)', () => {
    expect(gridColumnCount(100)).toBe(1)
    expect(gridColumnCount(0)).toBe(1)
    expect(gridColumnCount(Number.NaN)).toBe(1)
  })

  it('honours a custom minimum and gap', () => {
    expect(gridColumnCount(300, 100, 0)).toBe(3)
    expect(gridColumnCount(300, 100, 10)).toBe(2)
  })
})

describe('planNoteGrid', () => {
  it('fills justified rows in tab order, the open section counting double', () => {
    const rows = planNoteGrid(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'], 'c', 4)
    expect(shape(rows)).toEqual([
      'a:1 b:1 c:2',
      'd:1 e:1 f:1 g:1',
      'h:1 i:1 +:2',
    ])
  })

  it('closes a row early when the open section does not fit (its cells stretch)', () => {
    const rows = planNoteGrid(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 'd', 4)
    expect(shape(rows)).toEqual([
      'a:1 b:1 c:1',
      'd:2 e:1 f:1',
      'g:1 h:1 +:2',
    ])
  })

  it('puts "New section" on a slim row of its own when the last row is full', () => {
    expect(shape(planNoteGrid(['a', 'b', 'c', 'd'], null, 4))).toEqual(['a:1 b:1 c:1 d:1', '~+:4'])
    expect(shape(planNoteGrid(['a', 'b', 'c'], 'c', 4))).toEqual(['a:1 b:1 c:2', '~+:4'])
  })

  it('opens never span more columns than there are (1–2 columns)', () => {
    // One column: each section on its own row; the last row is always full.
    expect(shape(planNoteGrid(['a', 'b'], 'a', 1))).toEqual(['a:1', 'b:1', '~+:1'])
    // Two columns: the open section takes one unit.
    expect(shape(planNoteGrid(['a', 'b', 'c'], 'b', 2))).toEqual(['a:1 b:1', 'c:1 +:1'])
    expect(shape(planNoteGrid(['a', 'b'], 'a', 2))).toEqual(['a:1 b:1', '~+:2'])
  })

  it('spans two columns from three columns up', () => {
    expect(shape(planNoteGrid(['a', 'b'], 'a', 3))).toEqual(['a:2 b:1', '~+:3'])
    expect(shape(planNoteGrid(['a'], 'a', 3))).toEqual(['a:2 +:1'])
  })

  it('handles an unknown open id and a note without sections', () => {
    expect(shape(planNoteGrid(['a', 'b'], 'zzz', 4))).toEqual(['a:1 b:1 +:2'])
    expect(shape(planNoteGrid([], null, 4))).toEqual(['~+:4'])
  })

  it('treats a fractional or invalid column count as at least one whole column', () => {
    expect(shape(planNoteGrid(['a', 'b'], null, 2.7))).toEqual(['a:1 b:1', '~+:2'])
    expect(shape(planNoteGrid(['a'], null, 0))).toEqual(['a:1', '~+:1'])
  })
})

describe('gridNeighbor', () => {
  const rows = planNoteGrid(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'], 'c', 4)
  // a:1 b:1 c:2 / d e f g / h i +:2

  it('walks the tab order with left/right, across rows', () => {
    expect(gridNeighbor(rows, 'c', 'right')).toBe('d')
    expect(gridNeighbor(rows, 'd', 'left')).toBe('c')
    expect(gridNeighbor(rows, 'a', 'left')).toBeNull()
    expect(gridNeighbor(rows, 'i', 'right')).toBeNull()
  })

  it('moves up/down to the cell under the centre', () => {
    expect(gridNeighbor(rows, 'a', 'down')).toBe('d')
    // c spans units 2–4 (centre 3): f covers 2–3 and g 3–4, so the centre lands on g.
    expect(gridNeighbor(rows, 'c', 'down')).toBe('g')
    expect(gridNeighbor(rows, 'f', 'up')).toBe('c')
    expect(gridNeighbor(rows, 'e', 'down')).toBe('i')
  })

  it('takes the row\'s last section when the target is "New section", null past the edges', () => {
    expect(gridNeighbor(rows, 'g', 'down')).toBe('i')
    expect(gridNeighbor(rows, 'a', 'up')).toBeNull()
    expect(gridNeighbor(rows, 'h', 'down')).toBeNull()
    const full = planNoteGrid(['a', 'b'], null, 2) // a b / ~+
    expect(gridNeighbor(full, 'a', 'down')).toBeNull()
    expect(gridNeighbor(full, 'zzz', 'down')).toBeNull()
  })

  it('compares positions as fractions of rows that closed early', () => {
    // a b c (3 units, stretched) / d:2 e f
    const early = planNoteGrid(['a', 'b', 'c', 'd', 'e', 'f'], 'd', 4)
    expect(gridNeighbor(early, 'c', 'down')).toBe('f')
    expect(gridNeighbor(early, 'a', 'down')).toBe('d')
  })
})

describe('sectionCardStats', () => {
  it('is empty for blank content', () => {
    expect(sectionCardStats('')).toEqual({ kind: 'empty' })
    expect(sectionCardStats('  \n\n \t')).toEqual({ kind: 'empty' })
  })

  it(`shows task progress from ${TASK_STATS_MIN} tasks`, () => {
    const md = '- [x] one\n- [ ] two\n  - [x] nested\n- [ ] four'
    expect(sectionCardStats(md)).toEqual({ kind: 'tasks', done: 2, total: 4 })
  })

  it('counts words below the task threshold, without markdown syntax', () => {
    expect(sectionCardStats('- [x] Buy milk\n- [ ] Call Ana')).toEqual({ kind: 'words', count: 4 })
    expect(sectionCardStats('## Big title\n\n**Bold** and _italic_ text.')).toEqual({ kind: 'words', count: 6 })
    expect(sectionCardStats('> quoted words here\n\n---\n\n1. first item')).toEqual({ kind: 'words', count: 5 })
  })

  it('keeps link and image text but not their targets', () => {
    expect(sectionCardStats('See [the docs](https://example.com/a/b) ![diagram](img/x.png)'))
      .toEqual({ kind: 'words', count: 4 })
  })

  it('ignores task annotations, table pipes and HTML comments', () => {
    expect(sectionCardStats('- [ ] Pay rent 📅2026-11-02 ⏰09:30 🔺high'))
      .toEqual({ kind: 'words', count: 2 })
    expect(sectionCardStats('| Name | Age |\n| --- | --- |\n| Ana | 31 |'))
      .toEqual({ kind: 'words', count: 4 })
    expect(sectionCardStats('<!-- kanban -->\n- [ ] a\n- [x] b\n- [ ] c\n<!-- /kanban -->'))
      .toEqual({ kind: 'tasks', done: 1, total: 3 })
  })

  it('counts code words but not tasks inside code fences', () => {
    const md = '```md\n- [ ] not a task\n- [ ] nor this\n- [x] nor this\n```'
    expect(sectionCardStats(md)).toEqual({ kind: 'words', count: 7 })
  })

  it('does not take uppercase X or a link right after the box as a task', () => {
    expect(sectionCardStats('- [X] a\n- [x](url)\n- [x]b')).toEqual({ kind: 'words', count: 4 })
  })
})

describe('clipPreviewMarkdown', () => {
  it('returns short markdown untouched', () => {
    expect(clipPreviewMarkdown('hello\n\nworld', 100)).toBe('hello\n\nworld')
  })

  it('cuts at the last block boundary within the limit', () => {
    const md = `${'a'.repeat(60)}\n\n${'b'.repeat(60)}`
    expect(clipPreviewMarkdown(md, 100)).toBe('a'.repeat(60))
  })

  it('falls back to a line break, then to a hard cut', () => {
    expect(clipPreviewMarkdown(`${'a'.repeat(60)}\n${'b'.repeat(60)}`, 100)).toBe('a'.repeat(60))
    expect(clipPreviewMarkdown('x'.repeat(300), 100)).toBe('x'.repeat(100))
  })

  it('closes a code fence the cut left open', () => {
    const md = `intro\n\n\`\`\`js\n${'const a = 1\n'.repeat(20)}\`\`\`\n\nafter`
    const clipped = clipPreviewMarkdown(md, 120)
    expect(clipped.startsWith('intro\n\n```js\n')).toBe(true)
    expect(clipped.endsWith('\n```')).toBe(true)
    expect(clipped.length).toBeLessThanOrEqual(124)
  })
})

describe('reorderDropSide', () => {
  const sections = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('lands after a target that comes later, before one that comes earlier', () => {
    expect(reorderDropSide(sections, 'a', 'c')).toBe('after')
    expect(reorderDropSide(sections, 'c', 'a')).toBe('before')
  })

  it('is null for the same section or unknown ids', () => {
    expect(reorderDropSide(sections, 'b', 'b')).toBeNull()
    expect(reorderDropSide(sections, 'x', 'a')).toBeNull()
    expect(reorderDropSide(sections, 'a', 'x')).toBeNull()
  })
})
