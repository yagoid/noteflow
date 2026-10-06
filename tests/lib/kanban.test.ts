import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { htmlFromMarkdown, htmlToMarkdown, looksLikeMarkdown } from '../../src/lib/markdownHtml'
import {
  getKanbanAttr,
  kanbanDataFromElement,
  kanbanDataToHtml,
  parseKanbanMarkdown,
  serializeKanbanMarkdown,
  setKanbanAttr,
  type KanbanBoardData,
} from '../../src/lib/kanban'
import { installMiniDom, miniElement } from '../helpers/miniDom'

// htmlToMarkdown needs DOMParser; the vitest env is node-only, so these tests
// install a minimal DOM that understands htmlFromMarkdown's own output.
let uninstallDom: () => void
beforeAll(() => { uninstallDom = installMiniDom() })
afterAll(() => uninstallDom())

const F = '```'
const roundTrip = (md: string) => htmlToMarkdown(htmlFromMarkdown(md))

/** md → html → md lands on `expected` and stays there over several cycles. */
function expectStable(md: string, expected = md) {
  let cur = md
  for (let i = 0; i < 4; i++) {
    cur = roundTrip(cur)
    expect(cur).toBe(expected)
  }
}

const countBoards = (html: string) => (html.match(/data-type="kanban"/g) ?? []).length

// Same markdown with the markers defused: what the region rendered as before
// boards existed. A rejected board must render exactly like this.
const defuse = (md: string) => md.replace(/<!-- (\/?)kanban/g, '<!-- $1kanbanx')
const expectAsBefore = (md: string) => {
  const html = htmlFromMarkdown(md)
  expect(countBoards(html)).toBe(0)
  expect(html).toBe(htmlFromMarkdown(defuse(md)).replace(/kanbanx/g, 'kanban'))
}

const BOARD = [
  '<!-- kanban done="Done" -->',
  '- Todo',
  '  - [ ] Design the NodeView #ui 📅2026-10-12 🔺high',
  '  - [ ] Parser md↔html',
  '- Doing',
  '  - [ ] Drag & drop 📅2026-10-08 ⏰18:00',
  '- Done',
  '  - [x] Pick the format',
  '<!-- /kanban -->',
].join('\n')

describe('parseKanbanMarkdown', () => {
  it('parses columns, cards, annotations and the done attribute', () => {
    const board = parseKanbanMarkdown(BOARD)
    expect(board).toEqual({
      attrs: 'done="Done"',
      done: 'Done',
      columns: [
        {
          name: 'Todo',
          cards: [
            { md: 'Design the NodeView #ui', checked: false, due: '2026-10-12', alarm: null, importance: 'high', extra: '' },
            { md: 'Parser md↔html', checked: false, due: null, alarm: null, importance: null, extra: '' },
          ],
        },
        { name: 'Doing', cards: [{ md: 'Drag & drop', checked: false, due: '2026-10-08', alarm: '18:00', importance: null, extra: '' }] },
        { name: 'Done', cards: [{ md: 'Pick the format', checked: true, due: null, alarm: null, importance: null, extra: '' }] },
      ],
    })
  })

  it('keeps lines nested under a card verbatim as its extra', () => {
    const board = parseKanbanMarkdown([
      '<!-- kanban -->',
      '- Todo',
      '  - [ ] Card',
      '    - sub bullet',
      '      - [ ] deep task 📅2026-01-01',
      '\tnote with a tab  ',
      '',
      '    after a blank line',
      '<!-- /kanban -->',
    ].join('\n'))
    expect(board?.columns[0].cards[0].extra)
      .toBe('    - sub bullet\n      - [ ] deep task 📅2026-01-01\n\tnote with a tab  \n    after a blank line')
  })

  it('accepts empty columns, an empty board and blank lines anywhere inside', () => {
    expect(parseKanbanMarkdown('<!-- kanban -->\n<!-- /kanban -->')).toEqual({ attrs: '', done: null, columns: [] })
    const board = parseKanbanMarkdown('<!-- kanban -->\n\n- Backlog\n\n\n- Todo\n\n  - [ ] a\n\n<!-- /kanban -->')
    expect(board?.columns.map(c => [c.name, c.cards.length])).toEqual([['Backlog', 0], ['Todo', 1]])
  })

  it('moves a mid-text annotation out without leaving a double space', () => {
    const board = parseKanbanMarkdown('<!-- kanban -->\n- A\n  - [ ] Fix 📅2026-01-01 the  thing\n<!-- /kanban -->')
    expect(board?.columns[0].cards[0]).toMatchObject({ md: 'Fix the  thing', due: '2026-01-01' })
  })

  it.each([
    ['a paragraph line', '<!-- kanban -->\n- A\nsome text\n<!-- /kanban -->'],
    ['a card that is not a task', '<!-- kanban -->\n- A\n  - plain bullet\n<!-- /kanban -->'],
    ['a 2-space line that is not a card', '<!-- kanban -->\n- A\n  note\n<!-- /kanban -->'],
    ['odd indentation', '<!-- kanban -->\n- A\n - [ ] a\n<!-- /kanban -->'],
    ['an ordered list', '<!-- kanban -->\n1. A\n  - [ ] a\n<!-- /kanban -->'],
    ['a `*` bullet column', '<!-- kanban -->\n* A\n<!-- /kanban -->'],
    ['a card before any column', '<!-- kanban -->\n  - [ ] a\n- A\n<!-- /kanban -->'],
    ['an extra right under a column', '<!-- kanban -->\n- A\n    - sub\n<!-- /kanban -->'],
    ['an uppercase [X]', '<!-- kanban -->\n- A\n  - [X] a\n<!-- /kanban -->'],
    ['a card glued to its checkbox', '<!-- kanban -->\n- A\n  - [ ]a\n<!-- /kanban -->'],
    ['a nested opener', '<!-- kanban -->\n- A\n<!-- kanban -->\n<!-- /kanban -->'],
    ['a code fence', `<!-- kanban -->\n- A\n${F}\nx\n${F}\n<!-- /kanban -->`],
    ['an indented marker', '  <!-- kanban -->\n- A\n<!-- /kanban -->'],
    ['no closer', '<!-- kanban -->\n- A'],
  ])('rejects %s', (_label, md) => {
    expect(parseKanbanMarkdown(md)).toBeNull()
  })
})

describe('serializeKanbanMarkdown', () => {
  it('writes the canonical form (annotations in fixed order, no blank lines)', () => {
    const board = parseKanbanMarkdown('<!--kanban   done="Done"-->\n\n-   Todo  \n  - [ ]   a ⏰09:00 🔺low 📅2026-01-01\n<!-- /kanban   -->')!
    expect(serializeKanbanMarkdown(board))
      .toBe('<!-- kanban done="Done" -->\n- Todo\n  - [ ] a 📅2026-01-01 ⏰09:00 🔺low\n<!-- /kanban -->')
  })

  it('round-trips through parse', () => {
    expect(serializeKanbanMarkdown(parseKanbanMarkdown(BOARD)!)).toBe(BOARD)
  })

  it('keeps unknown attributes verbatim and syncs `done` into them', () => {
    const board = parseKanbanMarkdown('<!-- kanban wip="3"  done="Done" x=y -->\n- Done\n<!-- /kanban -->')!
    expect(board.done).toBe('Done')
    expect(serializeKanbanMarkdown(board)).toBe('<!-- kanban wip="3"  done="Done" x=y -->\n- Done\n<!-- /kanban -->')
    expect(serializeKanbanMarkdown({ ...board, done: 'Shipped "v2" & co' }))
      .toBe('<!-- kanban wip="3"  done="Shipped &quot;v2&quot; &amp; co" x=y -->\n- Done\n<!-- /kanban -->')
    expect(serializeKanbanMarkdown({ ...board, done: null })).toBe('<!-- kanban wip="3" x=y -->\n- Done\n<!-- /kanban -->')
  })

  it('always produces markdown that parses back to the same board', () => {
    const data: KanbanBoardData = {
      attrs: '',
      done: 'Done',
      columns: [
        { name: '', cards: [{ md: '', checked: true, due: '2026-01-01', alarm: null, importance: null, extra: '' }] },
        { name: 'Multi\nline', cards: [{ md: 'two\nlines', checked: false, due: null, alarm: null, importance: null, extra: 'not indented\n\n    - indented' }] },
      ],
    }
    const md = serializeKanbanMarkdown(data)
    expect(md).toBe([
      '<!-- kanban done="Done" -->',
      '-',
      '  - [x] 📅2026-01-01',
      '- Multi line',
      '  - [ ] two lines',
      '    not indented',
      '    - indented',
      '<!-- /kanban -->',
    ].join('\n'))
    expect(serializeKanbanMarkdown(parseKanbanMarkdown(md)!)).toBe(md)
  })
})

describe('marker attributes', () => {
  it('gets, sets in place, appends and removes', () => {
    expect(getKanbanAttr('a="1" done="R&amp;D"', 'done')).toBe('R&D')
    expect(getKanbanAttr('undone="x"', 'done')).toBeNull()
    expect(setKanbanAttr('a="1" done="X" b="2"', 'done', 'X')).toBe('a="1" done="X" b="2"')
    expect(setKanbanAttr('a="1" done="X" b="2"', 'done', 'Y')).toBe('a="1" done="Y" b="2"')
    expect(setKanbanAttr('a="1"', 'done', 'Y')).toBe('a="1" done="Y"')
    expect(setKanbanAttr('', 'done', 'Y')).toBe('done="Y"')
    expect(setKanbanAttr('a="1" done="X" b="2"', 'done', null)).toBe('a="1" b="2"')
    expect(setKanbanAttr('done="X"', 'done', null)).toBe('')
  })
})

describe('kanban HTML', () => {
  it('renders the structured shape the previews and the editor consume', () => {
    const html = htmlFromMarkdown(
      '<!-- kanban done="Done" wip="2" -->\n- To "do"\n  - [ ] **Bold** <b> 📅2026-10-12 ⏰18:00 🔺high\n    - child\n- Done\n  - [x] ok\n- Empty\n<!-- /kanban -->'
    )
    expect(html).toBe(
      '<div data-type="kanban" data-attrs="done=&quot;Done&quot; wip=&quot;2&quot;">' +
        '<div data-kanban-column data-name="To &quot;do&quot;"><div data-kanban-column-title>To "do"</div><ul data-type="taskList">' +
          '<li data-type="taskItem" data-checked="false" data-due="2026-10-12" data-alarm="18:00" data-importance="high"' +
          ' data-md="**Bold** &lt;b&gt;" data-extra="    - child"><label><input type="checkbox"></label>' +
          '<p><strong>Bold</strong> &lt;b&gt;</p></li>' +
        '</ul></div>' +
        '<div data-kanban-column data-name="Done" data-done="true"><div data-kanban-column-title>Done</div><ul data-type="taskList">' +
          '<li data-type="taskItem" data-checked="true" data-md="ok"><label><input type="checkbox" checked></label><p>ok</p></li>' +
        '</ul></div>' +
        '<div data-kanban-column data-name="Empty"><div data-kanban-column-title>Empty</div><ul data-type="taskList"></ul></div>' +
      '</div>'
    )
  })

  it('reads a board back from its element (data-* attributes are the source of truth)', () => {
    const board = parseKanbanMarkdown(
      '<!-- kanban done="R&amp;D" -->\n- R&D\n  - [ ] `<x>` & "q" 📅2026-01-01\n    multi\n\tline\n- Empty\n<!-- /kanban -->'
    )!
    expect(kanbanDataFromElement(miniElement(kanbanDataToHtml(board)))).toEqual(board)
    // The rendered children are ignored: a stale <p> doesn't change the card.
    const tampered = kanbanDataToHtml(board).replace('<p><code>', '<p>EDITED<code>')
    expect(kanbanDataFromElement(miniElement(tampered))).toEqual(board)
  })
})

describe('kanban md → html → md round-trip', () => {
  it('is stable for a canonical board', () => {
    expectStable(BOARD)
    expect(countBoards(htmlFromMarkdown(BOARD))).toBe(1)
  })

  it('canonicalizes once: annotation order, blank lines, marker spacing', () => {
    expectStable(
      '<!--kanban done="Done"-->\n- Todo\n\n  - [ ] a ⏰09:00 📅2026-01-01\n\n- Done\n<!-- /kanban -->',
      '<!-- kanban done="Done" -->\n- Todo\n  - [ ] a 📅2026-01-01 ⏰09:00\n- Done\n<!-- /kanban -->'
    )
  })

  it('keeps card extras, empty columns and unknown attributes', () => {
    expectStable([
      '<!-- kanban wip="3" done="Done" -->',
      '- Backlog',
      '- Todo',
      '  - [ ] Card',
      '    - sub bullet',
      '      - [ ] deep 📅2026-01-01',
      '\ttabbed note',
      '- Done',
      '<!-- /kanban -->',
    ].join('\n'))
  })

  it('separates text glued before/after the board, and keeps it when already separated', () => {
    const glued = `Intro\n${BOARD}\nOutro`
    const sep = `Intro\n\n${BOARD}\n\nOutro`
    expect(htmlFromMarkdown(glued)).toBe(htmlFromMarkdown(sep))
    expect(htmlFromMarkdown(sep)).toMatch(/^<p>Intro<\/p><div data-type="kanban".*<\/div><p>Outro<\/p>$/)
    expectStable(glued, sep)
    expectStable(sep)
    // Intentional empty paragraphs around the board are preserved.
    expectStable(`Intro\n\n\n\n${BOARD}\n\n\n\nOutro`)
  })

  it('handles several boards in one section, glued or not', () => {
    const b2 = '<!-- kanban -->\n- X\n  - [x] y\n<!-- /kanban -->'
    expect(countBoards(htmlFromMarkdown(`${BOARD}\n${b2}`))).toBe(2)
    expectStable(`${BOARD}\n${b2}`, `${BOARD}\n\n${b2}`)
    expectStable(`a\n\n${BOARD}\n\nb\n\n${b2}\n\nc`)
  })

  it('keeps the \\n\\n invariant: no growing gap before a table, list, task list or fence', () => {
    for (const after of [
      '| a | b |\n| --- | --- |\n| 1 | 2 |',
      '- one\n- two',
      '- [ ] task 📅2026-01-01',
      `${F}js\nconst a = 1\n${F}`,
      '# Heading',
      '> quote',
    ]) {
      expectStable(`${BOARD}\n\n${after}`)
      expectStable(`${after}\n\n${BOARD}`)
      expect(htmlFromMarkdown(`${BOARD}\n\n${after}`)).not.toContain('<p></p>')
    }
  })

  it('splits a fence glued after the board into its own code block', () => {
    const md = `${BOARD}\n${F}js\nx\n${F}`
    expect(htmlFromMarkdown(md)).toMatch(/<\/div><pre><code class="language-js">x<\/code><\/pre>$/)
    expectStable(md, `${BOARD}\n\n${F}js\nx\n${F}`)
  })
})

describe('kanban fallbacks (render as before, lossless)', () => {
  it('leaves an unclosed opener as literal text', () => {
    const md = '<!-- kanban -->\n- Todo\n  - [ ] a'
    expectAsBefore(md)
    expect(htmlFromMarkdown(md)).toBe('<p>&lt;!-- kanban --&gt;<br>- Todo<br>&nbsp;&nbsp;- [ ] a</p>')
    expectStable(md)
  })

  it.each([
    ['a paragraph inside', '<!-- kanban -->\n- A\nsome text\n<!-- /kanban -->'],
    ['a non-task card', '<!-- kanban -->\n- A\n  - plain\n<!-- /kanban -->'],
    ['odd indentation', '<!-- kanban -->\n- A\n - [ ] a\n<!-- /kanban -->'],
    ['an ordered list', '<!-- kanban -->\n1. A\n2. B\n<!-- /kanban -->'],
    ['a blank line before the invalid line', 'Intro\n<!-- kanban -->\n- A\n\nnope\n<!-- /kanban -->\nOutro'],
  ])('renders %s as ordinary markdown', (_label, md) => {
    expectAsBefore(md)
    // Second save is a fixed point (whatever the pre-board pipeline did to it).
    const once = roundTrip(md)
    expectStable(once)
  })

  it('treats markers inside a code fence as code', () => {
    const md = `${F}md\n<!-- kanban -->\n- A\n\n  - [ ] a\n<!-- /kanban -->\n${F}`
    expect(htmlFromMarkdown(md))
      .toBe('<pre><code class="language-md">&lt;!-- kanban --&gt;\n- A\n\n  - [ ] a\n&lt;!-- /kanban --&gt;</code></pre>')
    expectStable(md)
  })

  it('does not pair an opener in code with a closer outside it', () => {
    const md = `${F}\n<!-- kanban -->\n${F}\n\n- A\n\n<!-- /kanban -->`
    expectAsBefore(md)
  })

  it('does not pair an opener with a closer inside a later code block', () => {
    const md = `<!-- kanban -->\n- A\n\n${F}\n<!-- /kanban -->\n${F}`
    expectAsBefore(md)
    expectStable(md)
  })

  it('builds the later valid board when an earlier opener is malformed', () => {
    const md = '<!-- kanban -->\n- A\n<!-- kanban -->\n- B\n<!-- /kanban -->'
    const html = htmlFromMarkdown(md)
    expect(countBoards(html)).toBe(1)
    expect(html).toMatch(/^<p>&lt;!-- kanban --&gt;<br>- A<\/p><div data-type="kanban"/)
    expectStable(md, '<!-- kanban -->\n- A\n\n<!-- kanban -->\n- B\n<!-- /kanban -->')
  })

  it('splits off a board glued after a fence closer', () => {
    const md = `${F}js\nx\n${F}\n${BOARD}\n\nafter`
    expect(htmlFromMarkdown(md)).toMatch(/^<pre><code class="language-js">x<\/code><\/pre><div data-type="kanban"/)
    expectStable(md, `${F}js\nx\n${F}\n\n${BOARD}\n\nafter`)
  })

  // KNOWN AMBIGUITY (inherited from nested fences, see isolateCodeFences): a
  // code block runs to the LAST closing fence of its \n\n block, so a board
  // glued between two fences is read as code. Nothing is lost: it's kept, and
  // saved back, verbatim inside the code block.
  it('known ambiguity: a board glued between two fences is code', () => {
    const md = `${F}js\nx\n${F}\n${BOARD}\n${F}py\ny\n${F}`
    expect(countBoards(htmlFromMarkdown(md))).toBe(0)
    expectStable(md)
  })

  it('leaves a board followed by a glued unpaired fence as text', () => {
    const md = `<!-- kanban -->\n- A\n<!-- /kanban -->\n${F}js\nx`
    expectAsBefore(md)
  })

  it('leaves text without markers untouched (fast path)', () => {
    expect(htmlFromMarkdown('- A\n  - [ ] a')).toBe(htmlFromMarkdown(defuse('- A\n  - [ ] a')))
  })
})

describe('looksLikeMarkdown', () => {
  it('detects a pasted board, even an empty one', () => {
    expect(looksLikeMarkdown('<!-- kanban -->\n<!-- /kanban -->')).toBe(true)
    expect(looksLikeMarkdown('<!-- just a comment -->')).toBe(false)
  })
})

// Randomized round-trip: sections built from ordinary blocks and boards. Boards
// are glued to their neighbours with random separators; whatever the input,
// the first save must be a fixed point and keep every board intact.
describe('kanban round-trip fuzz', () => {
  // Deterministic PRNG (mulberry32) so failures are reproducible.
  function rng(seed: number) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  const WORDS = ['alpha', 'beta', '**bold**', '`code`', '==hi==', 'R&D', '"quoted"', '<tag>', 'a  b', 'x|y', 'ñandú', '#tag']
  const NAMES = ['Todo', 'Doing', 'Done', 'In "review"', 'R&D', '', '[ ] odd', 'Back log']
  const EXTRAS = ['    - sub', '    note', '\ttabbed', '      - [ ] deep 📅2026-02-03 ⏰07:30', '   three spaces']
  const BLOCKS = [
    'Plain paragraph',
    'Two line\nparagraph',
    '- one\n- two',
    '- [ ] task 📅2026-01-01\n- [x] done',
    '| a | b |\n| --- | --- |\n| 1 | 2 |',
    `${F}js\nconst a = 1\n\nconst b = 2\n${F}`,
    '# Heading',
    '> quote',
  ]

  const isList = (b: string) => b.startsWith('- ')
  // Ordinary block that won't merge with the previous one (htmlFromMarkdown
  // joins consecutive list blocks into one list — unrelated to boards).
  function randomBlock(r: () => number, prev: string | undefined): string {
    for (;;) {
      const b = BLOCKS[Math.floor(r() * BLOCKS.length)]
      if (!(prev && isList(prev) && isList(b))) return b
    }
  }

  function randomBoard(r: () => number): KanbanBoardData {
    const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]
    const columns = Array.from({ length: Math.floor(r() * 4) }, () => ({
      name: pick(NAMES),
      cards: Array.from({ length: Math.floor(r() * 3) }, () => ({
        md: Array.from({ length: 1 + Math.floor(r() * 3) }, () => pick(WORDS)).join(' '),
        checked: r() < 0.3,
        due: r() < 0.4 ? '2026-10-12' : null,
        alarm: r() < 0.3 ? '18:00' : null,
        importance: r() < 0.3 ? pick(['low', 'medium', 'high'] as const) : null,
        extra: r() < 0.3 ? Array.from({ length: 1 + Math.floor(r() * 2) }, () => pick(EXTRAS)).join('\n') : '',
      })),
    }))
    const attrs = pick(['', 'wip="3"', 'x="a b" y=z'])
    return { attrs, done: r() < 0.5 ? pick(NAMES) : null, columns }
  }

  it('round-trips random sections', () => {
    const r = rng(42)
    for (let n = 0; n < 300; n++) {
      const boards: string[] = []
      let md = ''
      let prev: string | undefined
      let prevIsBoard = false
      const parts = 1 + Math.floor(r() * 5)
      for (let p = 0; p < parts; p++) {
        const isBoard = r() < 0.5
        const block = isBoard ? serializeKanbanMarkdown(randomBoard(r)) : randomBlock(r, prev)
        if (isBoard) boards.push(block)
        // Next to a board: glued (\n), separated (\n\n) or with empty paragraphs.
        // An odd run (\n\n\n) is only tried BEFORE a board: after any block it
        // leaves the next one starting with a hard break, and a heading there
        // grows on every round-trip — pre-existing, unrelated to boards.
        // A board is not glued right after a fence: see the nested-fence test.
        const sep = isBoard
          ? ['\n', '\n\n', '\n\n\n', '\n\n\n\n'][Math.floor(r() * 4) + (prev?.startsWith(F) ? 1 : 0)] ?? '\n\n'
          : prevIsBoard ? ['\n', '\n\n', '\n\n\n\n'][Math.floor(r() * 3)] : '\n\n'
        md += (p === 0 ? '' : sep) + block
        prev = block
        prevIsBoard = isBoard
      }

      expect(countBoards(htmlFromMarkdown(md)), md).toBe(boards.length)
      const once = roundTrip(md)
      for (const b of boards) expect(once, md).toContain(b)
      expect(roundTrip(once), md).toBe(once)
    }
  })

  it('renders random malformed boards exactly as before', () => {
    const r = rng(99)
    const BAD = ['loose text', '  - plain bullet', ' - [ ] odd indent', '1. ordered', '* star', '-glued', '  text', '<!-- other -->']
    for (let n = 0; n < 200; n++) {
      const lines = serializeKanbanMarkdown(randomBoard(r)).split('\n')
      lines.splice(1 + Math.floor(r() * (lines.length - 1)), 0, BAD[Math.floor(r() * BAD.length)])
      const md = `before\n${lines.join('\n')}\n\nafter`
      expect(parseKanbanMarkdown(lines.join('\n'))).toBeNull()
      expectAsBefore(md)
      const once = roundTrip(md)
      expect(roundTrip(once), md).toBe(once)
    }
  })

  it('round-trips random canonical sections exactly', () => {
    const r = rng(7)
    for (let n = 0; n < 300; n++) {
      const parts: string[] = []
      const count = 1 + Math.floor(r() * 5)
      for (let p = 0; p < count; p++) {
        parts.push(r() < 0.5 ? serializeKanbanMarkdown(randomBoard(r)) : randomBlock(r, parts[p - 1]))
      }
      const md = parts.join('\n\n')
      expect(roundTrip(md), md).toBe(md)
    }
  })
})
