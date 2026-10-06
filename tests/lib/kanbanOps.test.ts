import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { htmlFromMarkdown, htmlToMarkdown } from '../../src/lib/markdownHtml'
import {
  kanbanDataFromElement,
  kanbanDataToHtml,
  parseKanbanMarkdown,
  serializeKanbanMarkdown,
  type KanbanBoardData,
} from '../../src/lib/kanban'
import {
  addCard,
  addColumn,
  applyCardText,
  boardToTaskListMarkdown,
  countCards,
  createBoard,
  deleteCard,
  deleteColumn,
  doneColumnIndex,
  emptyCard,
  extraLineCount,
  isDoneColumn,
  moveCard,
  moveColumn,
  normalizeBoard,
  renameColumn,
  setDoneColumn,
  taskListMarkdownToBoard,
  toggleCard,
  uniqueColumnName,
  updateCard,
} from '../../src/lib/kanbanOps'
import { installMiniDom, miniElement } from '../helpers/miniDom'

let uninstallDom: () => void
beforeAll(() => { uninstallDom = installMiniDom() })
afterAll(() => uninstallDom())

const BOARD_MD = [
  '<!-- kanban done="Done" foo="1" -->',
  '- Todo',
  '  - [ ] Design the NodeView #ui 📅2026-10-12 🔺high',
  '    - a sub-bullet',
  '  - [ ] Parser **md↔html**',
  '- Doing',
  '  - [ ] Drag & drop 📅2026-10-08 ⏰18:00',
  '- Done',
  '  - [x] Pick the format',
  '<!-- /kanban -->',
].join('\n')

const board = (): KanbanBoardData => parseKanbanMarkdown(BOARD_MD)!
const names = (b: KanbanBoardData) => b.columns.map((c) => c.name)
const texts = (b: KanbanBoardData, col: number) => b.columns[col].cards.map((c) => c.md)

/** Deep-freeze so a transform that mutates its input throws. */
function frozen<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v as object).forEach(frozen)
    Object.freeze(v)
  }
  return v
}

describe('normalizeBoard', () => {
  it('keeps a well-formed board as is', () => {
    expect(normalizeBoard(board())).toEqual(board())
  })
  it('repairs garbage and JSON strings', () => {
    expect(normalizeBoard(null)).toEqual({ attrs: '', done: null, columns: [] })
    expect(normalizeBoard(JSON.stringify(board()))).toEqual(board())
    expect(normalizeBoard({ columns: [{ name: 3, cards: [{ md: 'x', importance: 'urgent', checked: 'yes' }] }] }))
      .toEqual({
        attrs: '',
        done: null,
        columns: [{ name: '', cards: [{ md: 'x', checked: false, due: null, alarm: null, importance: null, extra: '' }] }],
      })
  })
})

describe('columns', () => {
  it('adds columns with unique, one-line names', () => {
    const b = addColumn(frozen(board()), 'Todo')
    expect(names(b)).toEqual(['Todo', 'Doing', 'Done', 'Todo 2'])
    expect(names(addColumn(b, ' Review\nnow '))).toContain('Review now')
    expect(uniqueColumnName(b, 'Todo 2', 3)).toBe('Todo 2')
  })

  it('renames, keeping the done column in sync; empty names are ignored', () => {
    const b = frozen(board())
    const renamed = renameColumn(b, 2, 'Shipped')
    expect(names(renamed)).toEqual(['Todo', 'Doing', 'Shipped'])
    expect(renamed.done).toBe('Shipped')
    expect(serializeKanbanMarkdown(renamed).split('\n')[0]).toBe('<!-- kanban done="Shipped" foo="1" -->')
    expect(renameColumn(b, 0, '   ')).toBe(b)
    expect(renameColumn(b, 0, 'Todo')).toBe(b)
    // A non-done column can't steal the done column's name.
    const clash = renameColumn(b, 0, 'Done')
    expect(names(clash)).toEqual(['Done 2', 'Doing', 'Done'])
    expect(clash.done).toBe('Done')
  })

  it('deletes columns; deleting the done column clears done', () => {
    const b = frozen(board())
    expect(names(deleteColumn(b, 0))).toEqual(['Doing', 'Done'])
    expect(deleteColumn(b, 0).done).toBe('Done')
    const noDone = deleteColumn(b, 2)
    expect(noDone.done).toBeNull()
    expect(serializeKanbanMarkdown(noDone).split('\n')[0]).toBe('<!-- kanban foo="1" -->')
  })

  it('moves columns to a slot', () => {
    const b = frozen(board())
    expect(names(moveColumn(b, 0, 3))).toEqual(['Doing', 'Done', 'Todo'])
    expect(names(moveColumn(b, 2, 0))).toEqual(['Done', 'Todo', 'Doing'])
    expect(names(moveColumn(b, 0, 2))).toEqual(['Doing', 'Todo', 'Done'])
    expect(moveColumn(b, 1, 1)).toBe(b)
    expect(moveColumn(b, 1, 2)).toBe(b)
  })

  it('sets and unsets the done column', () => {
    const b = frozen(board())
    expect(setDoneColumn(b, 1).done).toBe('Doing')
    expect(setDoneColumn(b, null).done).toBeNull()
    expect(setDoneColumn(b, 2)).toBe(b)
    expect(isDoneColumn(b, 2)).toBe(true)
    expect(doneColumnIndex(b)).toBe(2)
    expect(doneColumnIndex(setDoneColumn(b, null))).toBe(-1)
  })
})

describe('cards', () => {
  it('adds, updates and deletes cards', () => {
    const b = frozen(board())
    const added = addCard(b, 1, emptyCard('New'), 0)
    expect(texts(added, 1)).toEqual(['New', 'Drag & drop'])
    expect(addCard(b, 2, emptyCard('Shipped')).columns[2].cards[1].checked).toBe(true)
    expect(updateCard(b, { col: 0, idx: 1 }, { importance: 'low' }).columns[0].cards[1].importance).toBe('low')
    expect(texts(deleteCard(b, { col: 0, idx: 0 }), 0)).toEqual(['Parser **md↔html**'])
    expect(deleteCard(b, { col: 5, idx: 0 })).toBe(b)
    expect(countCards(b)).toBe(4)
  })

  it('moves within a column', () => {
    const b = frozen(board())
    expect(texts(moveCard(b, { col: 0, idx: 0 }, { col: 0, idx: 2 }), 0)).toEqual(['Parser **md↔html**', 'Design the NodeView #ui'])
    expect(texts(moveCard(b, { col: 0, idx: 1 }, { col: 0, idx: 0 }), 0)).toEqual(['Parser **md↔html**', 'Design the NodeView #ui'])
    expect(moveCard(b, { col: 0, idx: 0 }, { col: 0, idx: 1 })).toBe(b)
    expect(moveCard(b, { col: 0, idx: 0 }, { col: 0, idx: 0 })).toBe(b)
  })

  it('checks cards moved into the done column and unchecks the ones leaving it', () => {
    const b = frozen(board())
    const done = moveCard(b, { col: 0, idx: 0 }, { col: 2, idx: 0 })
    expect(done.columns[2].cards[0]).toMatchObject({ md: 'Design the NodeView #ui', checked: true, extra: '    - a sub-bullet' })
    const back = moveCard(done, { col: 2, idx: 1 }, { col: 1, idx: 1 })
    expect(back.columns[1].cards[1]).toMatchObject({ md: 'Pick the format', checked: false })
    // Between two non-done columns the check state is untouched.
    const checked = updateCard(b, { col: 0, idx: 0 }, { checked: true })
    expect(moveCard(checked, { col: 0, idx: 0 }, { col: 1, idx: 0 }).columns[1].cards[0].checked).toBe(true)
  })

  it('checkbox: checking moves to the end of done, unchecking leaves done', () => {
    const b = frozen(board())
    const checked = toggleCard(b, { col: 1, idx: 0 })
    expect(texts(checked, 1)).toEqual([])
    expect(checked.columns[2].cards.map((c) => [c.md, c.checked])).toEqual([['Pick the format', true], ['Drag & drop', true]])
    const unchecked = toggleCard(checked, { col: 2, idx: 0 })
    expect(texts(unchecked, 2)).toEqual(['Drag & drop'])
    expect(unchecked.columns[0].cards.at(-1)).toMatchObject({ md: 'Pick the format', checked: false })
  })

  it('checkbox without a done column just toggles', () => {
    const b = frozen(setDoneColumn(board(), null))
    const t = toggleCard(b, { col: 0, idx: 0 })
    expect(t.columns[0].cards[0].checked).toBe(true)
    expect(toggleCard(t, { col: 0, idx: 0 }).columns[0].cards[0].checked).toBe(false)
    // A checked card outside the done column unchecks in place.
    const d = frozen(board())
    const outside = updateCard(d, { col: 0, idx: 0 }, { checked: true })
    expect(toggleCard(outside, { col: 0, idx: 0 }).columns[0].cards[0].checked).toBe(false)
    // Only a done column: unchecking stays there.
    const solo = createBoard(['Done'], 0)
    const withCard = addCard(solo, 0, emptyCard('x'))
    expect(toggleCard(withCard, { col: 0, idx: 0 }).columns[0].cards[0].checked).toBe(false)
  })

  it('applies typed text: one line, annotations pulled out of md', () => {
    const card = { ...emptyCard('old'), due: '2026-01-01', importance: 'low' as const }
    expect(applyCardText(card, 'Ship it 📅2026-12-24 ⏰09:30 now')).toEqual({
      ...card, md: 'Ship it now', due: '2026-12-24', alarm: '09:30',
    })
    expect(applyCardText(card, 'a\nb 🔺high')).toMatchObject({ md: 'a b', due: '2026-01-01', importance: 'high' })
  })

  it('counts extra lines', () => {
    expect(extraLineCount(board().columns[0].cards[0])).toBe(1)
    expect(extraLineCount(emptyCard())).toBe(0)
  })

  it('every transform result serializes to a re-parseable board', () => {
    const b = board()
    const results = [
      addColumn(b, 'X "quoted" & <odd>'),
      renameColumn(b, 2, 'Fini "!"'),
      moveCard(b, { col: 0, idx: 0 }, { col: 2, idx: 1 }),
      toggleCard(b, { col: 0, idx: 1 }),
      addCard(b, 0, applyCardText(emptyCard(), 'multi\nline 📅2026-02-02')),
    ]
    for (const r of results) {
      expect(parseKanbanMarkdown(serializeKanbanMarkdown(r))).toEqual(r)
    }
  })
})

describe('task list conversions', () => {
  const LIST = [
    '- [ ] First 📅2026-10-12 🔺high',
    '  - [x] nested task',
    '    - deeper',
    '- [x] Second',
    'continued line',
    '- [ ] ',
  ].join('\n')

  it('task list → board: cards in the first column, children as extra', () => {
    const b = taskListMarkdownToBoard(LIST, ['To do', 'Doing', 'Done'], 2)
    expect(b.done).toBe('Done')
    expect(names(b)).toEqual(['To do', 'Doing', 'Done'])
    expect(b.columns[0].cards).toEqual([
      { md: 'First', checked: false, due: '2026-10-12', alarm: null, importance: 'high', extra: '    - [x] nested task\n      - deeper' },
      { md: 'Second continued line', checked: true, due: null, alarm: null, importance: null, extra: '' },
    ])
    expect(parseKanbanMarkdown(serializeKanbanMarkdown(b))).toEqual(b)
  })

  it('works on the markdown the editor writes for a task list', () => {
    const md = htmlToMarkdown(htmlFromMarkdown('- [ ] a **b** ⏰08:00 📅2026-01-02\n  - [ ] child\n- [x] c'))
    const b = taskListMarkdownToBoard(md, ['A', 'B', 'C'], 2)
    expect(b.columns[0].cards.map((c) => [c.md, c.checked, c.due, c.alarm, c.extra])).toEqual([
      ['a **b**', false, '2026-01-02', '08:00', '    - [ ] child'],
      ['c', true, null, null, ''],
    ])
  })

  it('board → task list keeps every card, its state, annotations and nesting', () => {
    const md = boardToTaskListMarkdown(board())
    expect(md).toBe([
      '- [ ] Design the NodeView #ui 📅2026-10-12 🔺high',
      '  - a sub-bullet',
      '- [ ] Parser **md↔html**',
      '- [ ] Drag & drop 📅2026-10-08 ⏰18:00',
      '- [x] Pick the format',
    ].join('\n'))
    // And it is a real task list for the editor.
    expect(htmlToMarkdown(htmlFromMarkdown(md))).toBe(md)
    expect(boardToTaskListMarkdown(createBoard(['a'], null))).toBe('')
  })

  it('board → task list → board round-trips the cards', () => {
    const b = board()
    const back = taskListMarkdownToBoard(boardToTaskListMarkdown(b), ['x'], null)
    expect(back.columns[0].cards).toEqual(b.columns.flatMap((c) => c.cards))
  })
})

// The editor node (components/Editor/KanbanBoard.ts) stores the board in an
// attribute parsed with kanbanDataFromElement and renders it back with
// kanbanDataToHtml(normalizeBoard(attr)); the editor saves via getHTML →
// htmlToMarkdown. Simulate that load → (JSON-cloned attr, as history/clipboard
// keep it) → render → save path on whole sections.
describe('editor node round-trip (simulated)', () => {
  /** Replace each top-level kanban div in `html` with what the node renders. */
  function throughNode(html: string, edit: (b: KanbanBoardData) => KanbanBoardData = (b) => b): string {
    let out = ''
    let i = 0
    const open = '<div data-type="kanban"'
    for (let start = html.indexOf(open); start !== -1; start = html.indexOf(open, i)) {
      out += html.slice(i, start)
      // Find the matching </div> by depth.
      const re = /<div\b|<\/div>/g
      re.lastIndex = start
      let depth = 0
      let end = start
      for (let m = re.exec(html); m; m = re.exec(html)) {
        depth += m[0] === '</div>' ? -1 : 1
        if (depth === 0) { end = m.index + m[0].length; break }
      }
      const attr = JSON.parse(JSON.stringify(kanbanDataFromElement(miniElement(html.slice(start, end)))))
      out += kanbanDataToHtml(edit(normalizeBoard(attr)))
      i = end
    }
    return out + html.slice(i)
  }

  const SECTION = [
    '# Plan',
    '',
    'Intro paragraph with **bold**.',
    '',
    BOARD_MD,
    '',
    '- [ ] a regular task 📅2026-03-03',
    '',
    '<!-- kanban -->',
    '- Only',
    '<!-- /kanban -->',
    '',
    'Tail.',
  ].join('\n')

  it('a section with boards saves back to the identical markdown', () => {
    const html = htmlFromMarkdown(SECTION)
    expect(throughNode(html)).toBe(html)
    let md = SECTION
    for (let n = 0; n < 3; n++) {
      md = htmlToMarkdown(throughNode(htmlFromMarkdown(md)))
      expect(md).toBe(SECTION)
    }
  })

  it('an edit made through the node is what gets saved', () => {
    const edited = htmlToMarkdown(throughNode(htmlFromMarkdown(BOARD_MD), (b) =>
      moveCard(b, { col: 0, idx: 0 }, { col: 2, idx: 1 })))
    const expected = moveCard(board(), { col: 0, idx: 0 }, { col: 2, idx: 1 })
    expect(edited).toBe(serializeKanbanMarkdown(expected))
    expect(parseKanbanMarkdown(edited)).toEqual(expected)
  })

  it('the HTML carries `done` even if `attrs` lags behind it', () => {
    const stale = { ...board(), done: 'Doing' } // attrs still says done="Done"
    expect(kanbanDataFromElement(miniElement(kanbanDataToHtml(stale))).done).toBe('Doing')
  })

  it('pasting a board (markdown → html → node) is lossless', () => {
    const pasted = htmlToMarkdown(throughNode(htmlFromMarkdown(BOARD_MD)))
    expect(pasted).toBe(BOARD_MD)
  })
})
