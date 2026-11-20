import { describe, it, expect } from 'vitest'
import { containsMarkdownTable, htmlFromMarkdown, looksLikeMarkdown } from '../../src/lib/markdownHtml'

// These tests exercise the markdown → HTML direction (a pure, node-safe string
// transform). The inverse `htmlToMarkdown` relies on the DOM (`DOMParser`) and
// therefore can't run in this node-only vitest env — but both the *correct* and
// the *old-buggy* serialized forms of a multi-line task are covered here at the
// markdown boundary, so the round-trip behaviour is characterised end to end:
//   - "annotation on the first line"  = what the fixed serializer now emits.
//   - "annotation on the last line"   = what the old, buggy serializer emitted;
//     the parser must recover it instead of leaking a literal 🔺 / 📅 / ⏰.

describe('htmlFromMarkdown — multi-line task annotations', () => {
  it('keeps data-importance on a multi-line task when the annotation is on the first line', () => {
    const md = '- [ ] Buy milk 🔺low\nand eggs'
    const html = htmlFromMarkdown(md)
    expect(html).toContain('data-type="taskList"')
    expect(html).toContain('data-importance="low"')
    // Both physical lines survive as a single task, joined by a hard break.
    expect(html).toContain('Buy milk<br>and eggs')
    // The annotation must not leak into the rendered text.
    expect(html).not.toContain('🔺')
  })

  it('recovers importance appended to the LAST line of a multi-line task (old buggy format)', () => {
    const md = '- [ ] Buy milk\nand eggs 🔺low'
    const html = htmlFromMarkdown(md)
    expect(html).toContain('data-importance="low"')
    expect(html).toContain('Buy milk<br>and eggs')
    expect(html).not.toContain('🔺')
  })

  it('recovers a date + importance appended to a continuation line', () => {
    const md = '- [ ] Ship release\npolish notes 📅2026-07-23 🔺high'
    const html = htmlFromMarkdown(md)
    expect(html).toContain('data-due="2026-07-23"')
    expect(html).toContain('data-importance="high"')
    expect(html).not.toContain('📅')
    expect(html).not.toContain('🔺')
  })

  it('does not let a continuation-line annotation overwrite the first-line one', () => {
    // First line wins: the 🔺low on the continuation line must not clobber the
    // high importance declared on the `- [ ]` line — and, since the task already
    // has an importance, it stays as the text the user wrote (not cut and lost).
    const md = '- [ ] Task 🔺high\nkeep going 🔺low'
    const html = htmlFromMarkdown(md)
    expect(html).toContain('data-importance="high"')
    expect(html).not.toContain('data-importance="low"')
    expect(html).toContain('Task<br>keep going 🔺low')
  })

  it('closes the gap left by an annotation written mid-text', () => {
    const html = htmlFromMarkdown('- [ ] Fix 📅2026-07-23 the bug ⏰09:00 now')
    expect(html).toContain('data-due="2026-07-23"')
    expect(html).toContain('data-alarm="09:00"')
    expect(html).toContain('<p>Fix the bug now</p>')
  })
})

// A table is followed by exactly one blank line in the serialized markdown
// (`tableElToMd` owns that separator). If a serializer ever emits an extra
// newline there, the next block gets parsed with a leading hard break and the
// gap grows on every save/reopen round-trip — these tests pin the boundary.
describe('htmlFromMarkdown — blocks after a table', () => {
  const table = '| a | b |\n| --- | --- |\n| 1 | 2 |'

  it('renders the paragraph after a table without a leading hard break', () => {
    const html = htmlFromMarkdown(`${table}\n\nText`)
    expect(html).toContain('<p>Text</p>')
    expect(html).not.toContain('<br>Text')
    expect(html).not.toContain('<p></p>')
  })

  it('renders a heading after a table without an empty paragraph before it', () => {
    const html = htmlFromMarkdown(`${table}\n\n# Title`)
    expect(html).toContain('<h1>Title</h1>')
    expect(html).not.toContain('<p><br></p>')
  })
})

// A top-level code fence must be its own block even when it touches other
// content without a blank line. Blocks are split on \n\n, so before the fix a
// fence glued to a paragraph/list became plain text, and content glued after
// the closing ``` ended up *inside* the code block (e.g. a literal "- [ ]").
describe('htmlFromMarkdown — code fences adjacent to other blocks', () => {
  const F = '```'
  const jsBlock = '<pre><code class="language-js">const a = 1</code></pre>'
  const taskList =
    '<ul data-type="taskList"><li data-checked="false" data-type="taskItem"><label><input type="checkbox"></label><p>tarea</p></li></ul>'

  it('ends the code block at the closing fence when a task follows without a blank line', () => {
    const html = htmlFromMarkdown(`${F}js\nconst a = 1\n${F}\n- [ ] tarea`)
    expect(html).toBe(jsBlock + taskList)
  })

  it('starts a code block after a paragraph line without a blank line', () => {
    const html = htmlFromMarkdown(`Mira esto:\n${F}js\nconst a = 1\n${F}`)
    expect(html).toBe('<p>Mira esto:</p>' + jsBlock)
  })

  it('does not turn a fence right after a list item into continuation text', () => {
    const html = htmlFromMarkdown(`- uno\n${F}\ncode\n${F}`)
    expect(html).toBe('<ul><li><p>uno</p></li></ul><pre><code class="language-">code</code></pre>')
  })

  it('renders a heading glued after the closing fence', () => {
    const html = htmlFromMarkdown(`${F}js\nconst a = 1\n${F}\n# Title`)
    expect(html).toBe(jsBlock + '<h1>Title</h1>')
  })

  it('renders a paragraph glued after the closing fence', () => {
    const html = htmlFromMarkdown(`${F}js\nconst a = 1\n${F}\nAfter`)
    expect(html).toBe(jsBlock + '<p>After</p>')
  })

  it('keeps a blank line inside a fence that touches content on both sides', () => {
    const html = htmlFromMarkdown(`Before\n${F}\na\n\nb\n${F}\nAfter`)
    expect(html).toBe('<p>Before</p><pre><code class="language-">a\n\nb</code></pre><p>After</p>')
    expect(html).not.toContain('\x00')
  })

  it('keeps consecutive blank lines inside a fence', () => {
    const html = htmlFromMarkdown(`${F}\na\n\n\nb\n${F}`)
    expect(html).toBe('<pre><code class="language-">a\n\n\nb</code></pre>')
  })

  it('does not parse markdown inside the fence', () => {
    const html = htmlFromMarkdown(`Text\n${F}md\n# not a heading\n- [ ] not a task\n${F}`)
    expect(html).toBe('<p>Text</p><pre><code class="language-md"># not a heading\n- [ ] not a task</code></pre>')
  })

  it('keeps today\'s behaviour for an unclosed fence (rest of the block is code)', () => {
    expect(htmlFromMarkdown(`${F}js\nconst a = 1\n- [ ] tarea`))
      .toBe('<pre><code class="language-js">const a = 1\n- [ ] tarea</code></pre>')
    // Not closed → nothing is isolated: a fence line glued to a paragraph stays text.
    expect(htmlFromMarkdown(`para\n${F}js\nx`)).toBe('<p>para<br>```js<br>x</p>')
  })

  // Well-separated markdown is what htmlToMarkdown emits for the editor
  // round-trip: the fence handling must not add or remove blocks there.
  it('leaves well-separated fences unchanged (no spurious empty paragraphs)', () => {
    expect(htmlFromMarkdown(`${F}js\nconst a = 1\n${F}\n\n- [ ] tarea`)).toBe(jsBlock + taskList)
    expect(htmlFromMarkdown(`Mira esto:\n\n${F}js\nconst a = 1\n${F}\n\n# Title`))
      .toBe('<p>Mira esto:</p>' + jsBlock + '<h1>Title</h1>')
    // Intentional empty paragraphs (\n\n\n\n) around a fence are preserved as-is.
    expect(htmlFromMarkdown(`a\n\n\n\n${F}js\nconst a = 1\n${F}\n\n\n\nb`))
      .toBe('<p>a</p><p></p>' + jsBlock + '<p></p><p>b</p>')
  })
})

// blockElToMd always writes a 3-backtick fence, so a code block whose content
// has its own ``` lines (e.g. a README snippet) serializes as nested fences. A
// fence that starts a block must keep running to the LAST closing line of its
// \n\n block, exactly as before; otherwise those ``` lines are lost and the
// broken structure is saved back to the note on the next edit.
describe('htmlFromMarkdown — nested fences written by NoteFlow', () => {
  const F = '```'

  it('keeps a trailing ``` line that is part of the code', () => {
    expect(htmlFromMarkdown(`${F}\nfoo\n${F}\n${F}`))
      .toBe('<pre><code class="language-">foo\n```</code></pre>')
  })

  it('keeps an inner fenced snippet inside a markdown code block', () => {
    expect(htmlFromMarkdown(`${F}md\n${F}js\nfoo\n${F}\n${F}`))
      .toBe('<pre><code class="language-md">```js\nfoo\n```</code></pre>')
  })

  it('keeps a code block whose content starts with a bare ``` line', () => {
    expect(htmlFromMarkdown(`${F}\n${F}\nfoo\n${F}\n${F}`))
      .toBe('<pre><code class="language-">```\nfoo\n```</code></pre>')
  })

  it('keeps an inner snippet with a blank line inside it', () => {
    expect(htmlFromMarkdown(`${F}\nfoo\n${F}\n${F}js\n\nbar\n${F}`))
      .toBe('<pre><code class="language-">foo\n```\n```js\n\nbar</code></pre>')
  })

  // A code block whose content ENDS with a ``` line is written as "…\n```\n```".
  // The trailing bare ``` is the real closer: it must not open a new fence that
  // pairs with a later one across blank lines and swallows everything between.
  describe('code block ending in a nested snippet, followed by more content', () => {
    const mdBlock = '<pre><code class="language-md">```js\nfoo\n```</code></pre>'
    const nested = `${F}md\n${F}js\nfoo\n${F}\n${F}`

    it('does not merge the paragraph and the next fence into the code block', () => {
      const html = htmlFromMarkdown(`${nested}\n\npara\n\n${F}py\nx\n${F}`)
      expect(html).toBe(mdBlock + '<p>para</p><pre><code class="language-py">x</code></pre>')
    })

    it('keeps an empty paragraph between them', () => {
      expect(htmlFromMarkdown(`${nested}\n\n\n\npara\n\n${F}py\nx\n${F}`))
        .toBe(mdBlock + '<p></p><p>para</p><pre><code class="language-py">x</code></pre>')
    })

    it('keeps a later nested code block separate', () => {
      expect(htmlFromMarkdown(`${nested}\n\npara\n\n${F}md\n${F}py\nbar\n${F}\n${F}`)).toBe(
        mdBlock + '<p>para</p><pre><code class="language-md">```py\nbar\n```</code></pre>'
      )
      expect(htmlFromMarkdown(`${nested}\n\n${F}md\n${F}py\nbar\n${F}\n${F}\n\nend`)).toBe(
        mdBlock + '<pre><code class="language-md">```py\nbar\n```</code></pre><p>end</p>'
      )
    })

    it('handles a later bare fence, an inner blank line and CRLF', () => {
      expect(htmlFromMarkdown(`${nested}\n\npara\n\n${F}\nx\n${F}`))
        .toBe(mdBlock + '<p>para</p><pre><code class="language-">x</code></pre>')
      const html = htmlFromMarkdown(`${F}md\n${F}js\nfoo\n\nbar\n${F}\n${F}\n\npara\n\n${F}py\nx\n${F}`)
      expect(html).toBe(
        '<pre><code class="language-md">```js\nfoo\n\nbar\n```</code></pre>' +
        '<p>para</p><pre><code class="language-py">x</code></pre>'
      )
      expect(html).not.toContain('\x00')
      expect(htmlFromMarkdown(`${nested}\n\npara\n\n${F}py\nx\n${F}`.replace(/\n/g, '\r\n')))
        .toBe(mdBlock + '<p>para</p><pre><code class="language-py">x</code></pre>')
    })
  })

  // The closing-run rule only applies when the bare ``` run ends at a blank
  // line. These pin both branches so any change to them is deliberate.
  describe('closing-run rule boundaries', () => {
    it('keeps pairing a bare ``` run that is followed by content (one code block)', () => {
      expect(htmlFromMarkdown(`${F}js\na\n${F}\n${F}\nb\n\nc\n${F}`))
        .toBe('<pre><code class="language-js">a\n```\n```\nb\n\nc</code></pre>')
    })

    // KNOWN LIMITATION (accepted trade-off): code content with two adjacent bare
    // ``` lines followed by a blank line and more content (3-level nesting, in
    // practice) is indistinguishable from a block ending in a nested snippet, so
    // the code block is cut at the second ```. This round-tripped before the
    // closing-run rule; the outputs below document the current behaviour.
    it('known limitation: splits ``` ``` + blank + content when nothing follows', () => {
      expect(htmlFromMarkdown(`${F}md\na\n${F}\n${F}\n\nb\n${F}`))
        .toBe('<pre><code class="language-md">a\n```</code></pre><p>b<br>```</p>')
    })

    it('known limitation: the leftover ``` merges up to a later fence', () => {
      expect(htmlFromMarkdown(`${F}md\na\n${F}\n${F}\n\nb\n${F}\n\nq\n\n${F}py\nx\n${F}`)).toBe(
        '<pre><code class="language-md">a\n```</code></pre><p>b</p>' +
        '<pre><code class="language-">\nq\n\n```py\nx</code></pre>'
      )
    })
  })

  it('still splits off content glued after the last closing line', () => {
    expect(htmlFromMarkdown(`Intro\n${F}md\n${F}js\nfoo\n${F}\n${F}\n- [ ] tarea`)).toBe(
      '<p>Intro</p><pre><code class="language-md">```js\nfoo\n```</code></pre>' +
      '<ul data-type="taskList"><li data-checked="false" data-type="taskItem"><label><input type="checkbox"></label><p>tarea</p></li></ul>'
    )
  })
})

describe('htmlFromMarkdown — multi-line task annotations on a continuation line', () => {
  it('keeps a continuation annotation the task already has as text', () => {
    const html = htmlFromMarkdown('- [ ] Ship 📅2026-01-02\nwas 📅2025-12-20 before slip')
    expect(html).toContain('data-due="2026-01-02"')
    expect(html).toContain('Ship<br>was 📅2025-12-20 before slip')
  })

  it('still recovers a kind the first line lacks', () => {
    const html = htmlFromMarkdown('- [ ] Ship 📅2026-01-02\nthen ⏰09:30 and 📅2025-12-20')
    expect(html).toContain('data-due="2026-01-02"')
    expect(html).toContain('data-alarm="09:30"')
    expect(html).toContain('Ship<br>then and 📅2025-12-20')
  })
})

// Task / bullet / ordered items can't be siblings in the editor (a taskList only
// holds taskItems). The serializer ends every list with the block separator,
// so the one blank line before an item of another kind is that separator, not
// a hard break of the item above (the reported phantom line that came back
// after deleting it). The real-editor round trip is in editorRoundTrip.test.ts.
describe('htmlFromMarkdown — adjacent lists of different kinds', () => {
  const task = (text: string) =>
    `<li data-checked="false" data-type="taskItem"><label><input type="checkbox"></label><p>${text}</p></li>`

  it('reads task, bullet, task separated by blank lines as three lists with no hard break', () => {
    expect(htmlFromMarkdown('- [ ] **x**\n\n- **B42.** t\n\n- [ ] y')).toBe(
      `<ul data-type="taskList">${task('<strong>x</strong>')}</ul>` +
      '<ul><li><p><strong>B42.</strong> t</p></li></ul>' +
      `<ul data-type="taskList">${task('y')}</ul>`
    )
  })

  it('splits items of different kinds glued together into separate lists', () => {
    expect(htmlFromMarkdown('- [ ] a\n- b\n1. c')).toBe(
      `<ul data-type="taskList">${task('a')}</ul><ul><li><p>b</p></li></ul><ol><li><p>c</p></li></ol>`
    )
  })

  it('reads a second blank line before another kind as a hard break of the item above', () => {
    expect(htmlFromMarkdown('- [ ] a\n\n\n- b'))
      .toBe(`<ul data-type="taskList">${task('a<br>')}</ul><ul><li><p>b</p></li></ul>`)
    // …of its deepest last item: the one written last.
    expect(htmlFromMarkdown('- a\n  - c\n\n\n1. d'))
      .toBe('<ul><li><p>a</p><ul><li><p>c<br></p></li></ul></li></ul><ol><li><p>d</p></li></ol>')
  })

  it('keeps reading same-kind items after a blank line as one list (inherent ambiguity)', () => {
    // `- a\n\n- b` is both "one list whose first item ends in a break" and "two
    // bullet lists in a row": it has always been read as the former.
    expect(htmlFromMarkdown('- a\n\n- b')).toBe('<ul><li><p>a<br></p></li><li><p>b</p></li></ul>')
  })

  it('splits nested siblings by kind, every blank line before them being a break', () => {
    expect(htmlFromMarkdown('- p\n  - [ ] t\n\n  - b')).toBe(
      `<ul><li><p>p</p><ul data-type="taskList">${task('t<br>')}</ul><ul><li><p>b</p></li></ul></li></ul>`
    )
  })

  it('keeps nested items after any number of blank lines inside their parent', () => {
    expect(htmlFromMarkdown('- a\n\n\n\n  - b'))
      .toBe('<ul><li><p>a<br><br><br></p><ul><li><p>b</p></li></ul></li></ul>')
  })

  it('reads `- [x](url)` as a bullet starting with a link, not a checked task', () => {
    expect(htmlFromMarkdown('- [x](https://e.com) more'))
      .toBe('<ul><li><p><a href="https://e.com">x</a> more</p></li></ul>')
    // An empty task at the end of the text keeps working without its trailing space.
    expect(htmlFromMarkdown('- [ ]')).toBe(`<ul data-type="taskList">${task('')}</ul>`)
  })
})

// listElToMd writes an empty bullet item as `- `, and one whose text starts
// with a hard break as `- ` + the text on the next lines. Read as a blank line
// (the legacy meaning of `- `), the first item of a list had no item above to
// take it and its text was dropped.
describe('htmlFromMarkdown — empty bullet markers never drop text', () => {
  it('reads `- ` starting a list as an empty bullet item, keeping the lines after it', () => {
    expect(htmlFromMarkdown('- \nimportant text\n- second'))
      .toBe('<ul><li><p><br>important text</p></li><li><p>second</p></li></ul>')
    expect(htmlFromMarkdown('- \n  - child')).toBe('<ul><li><p></p><ul><li><p>child</p></li></ul></li></ul>')
    expect(htmlFromMarkdown('intro\n\n- \ntext')).toBe('<p>intro</p><ul><li><p><br>text</p></li></ul>')
    expect(htmlFromMarkdown('# Title\n- \ntext')).toBe('<h1>Title</h1><ul><li><p><br>text</p></li></ul>')
  })

  it('reads `- ` after a task or ordered sibling as the start of a bullet list', () => {
    expect(htmlFromMarkdown('- a\n  1. o\n  - \n  text')).toBe(
      '<ul><li><p>a</p><ol><li><p>o</p></li></ol><ul><li><p><br>text</p></li></ul></li></ul>'
    )
  })

  it('still reads `- ` right below a bullet sibling as a blank line (legacy, ambiguous)', () => {
    expect(htmlFromMarkdown('- a\n- \n- b')).toBe('<ul><li><p>a<br></p></li><li><p>b</p></li></ul>')
  })

  it('accepts a tab after the marker, as the list detection does', () => {
    expect(htmlFromMarkdown('-\tx\n1.\ty')).toBe('<ul><li><p>x</p></li></ul><ol><li><p>y</p></li></ol>')
  })

  it('keeps kanban markers inside a quote as quoted text', () => {
    expect(htmlFromMarkdown('> <!-- kanban -->\n> - Todo\n> <!-- /kanban -->')).toBe(
      '<blockquote><p>&lt;!-- kanban --&gt;<br>- Todo<br>&lt;!-- /kanban --&gt;</p></blockquote>'
    )
  })
})

describe('htmlFromMarkdown — the odd newline between blocks', () => {
  // A textblock ending in a hard break writes one extra \n before the block
  // separator; the \n\n splitter leaves it at the start of the next block.
  it('gives it back to the paragraph above a heading, list, fence or kanban', () => {
    expect(htmlFromMarkdown('x\n\n\n# T')).toBe('<p>x<br></p><h1>T</h1>')
    expect(htmlFromMarkdown('x\n\n\n- a')).toBe('<p>x<br></p><ul><li><p>a</p></li></ul>')
    expect(htmlFromMarkdown('x\n\n\n```js\nc\n```')).toBe('<p>x<br></p><pre><code class="language-js">c</code></pre>')
    expect(htmlFromMarkdown('x\n\n\n<!-- kanban -->\n- Todo\n<!-- /kanban -->')).toMatch(/^<p>x<br><\/p><div data-type="kanban"/)
  })

  it('makes an empty paragraph above a heading a paragraph with a break', () => {
    expect(htmlFromMarkdown('x\n\n\n\n\n# T')).toBe('<p>x</p><p><br></p><h1>T</h1>')
  })

  it('leaves it at the start of a following paragraph, as always (inherent ambiguity)', () => {
    expect(htmlFromMarkdown('x\n\n\ny')).toBe('<p>x</p><p><br>y</p>')
  })
})

describe('htmlFromMarkdown — blocks glued to a heading or a table', () => {
  it('reads what follows a glued heading as a block of its own', () => {
    expect(htmlFromMarkdown('## Title\n- a\n- b')).toBe('<h2>Title</h2><ul><li><p>a</p></li><li><p>b</p></li></ul>')
    expect(htmlFromMarkdown('text\n# T\nmore')).toBe('<p>text</p><h1>T</h1><p>more</p>')
    expect(htmlFromMarkdown('---\n# T')).toBe('<hr><h1>T</h1>')
  })

  it('keeps the text glued below a table instead of dropping it', () => {
    expect(htmlFromMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |\nAfter the table'))
      .toBe('<table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table><p>After the table</p>')
  })
})

describe('htmlFromMarkdown — blockquote content', () => {
  it('parses the quoted lines as markdown of their own (lists, code, headings, quotes)', () => {
    expect(htmlFromMarkdown('> a\n>\n> - b\n> - [ ] c\n>\n> ```js\n> x\n> ```\n>\n> ## h\n>\n> > n')).toBe(
      '<blockquote><p>a</p><ul><li><p>b</p></li></ul>' +
      '<ul data-type="taskList"><li data-checked="false" data-type="taskItem"><label><input type="checkbox"></label><p>c</p></li></ul>' +
      '<pre><code class="language-js">x</code></pre><h2>h</h2><blockquote><p>n</p></blockquote></blockquote>'
    )
  })

  it('reads paragraphs and soft breaks as before', () => {
    expect(htmlFromMarkdown('> a\n> b\n>\n> c')).toBe('<blockquote><p>a<br>b</p><p>c</p></blockquote>')
    expect(htmlFromMarkdown('>')).toBe('<blockquote><p></p></blockquote>')
  })
})

// A one-column pipe table (what's left after deleting columns down to one) is
// a table, in every separator spelling with a pipe; a bare `---` never is (an
// HR), nor is a one-column separator below a header with more than one cell.
describe('htmlFromMarkdown — one-column tables', () => {
  it('reads the separators a one-column table can have', () => {
    for (const sep of ['| --- |', '|---|', '| :---: |', '|:---|', '| ---: |', '| --- ', '|---', '--- |', '---|', '  | --- |  ']) {
      expect(htmlFromMarkdown(`| H |\n${sep}\n| a |`), sep).toMatch(/^<table><tr><th[^>]*>H<\/th><\/tr><tr><td[^>]*>a<\/td><\/tr><\/table>$/)
      expect(containsMarkdownTable(`| H |\n${sep}`), sep).toBe(true)
    }
  })

  it('keeps header-only tables, rows, alignment, <br> and escaped pipes', () => {
    expect(htmlFromMarkdown('|   |\n| --- |')).toBe('<table><tr><th></th></tr></table>')
    expect(htmlFromMarkdown('| H |\n| --- |\n| a |\n| b |'))
      .toBe('<table><tr><th>H</th></tr><tr><td>a</td></tr><tr><td>b</td></tr></table>')
    expect(htmlFromMarkdown('| H |\n| :---: |\n| a |'))
      .toBe('<table><tr><th style="text-align:center">H</th></tr><tr><td style="text-align:center">a</td></tr></table>')
    expect(htmlFromMarkdown('| H |\n| --- |\n| a<br>b |')).toBe('<table><tr><th>H</th></tr><tr><td>a<br>b</td></tr></table>')
    expect(htmlFromMarkdown('| a \\| b |\n| --- |')).toBe('<table><tr><th>a | b</th></tr></table>')
    expect(htmlFromMarkdown('H |\n|---')).toBe('<table><tr><th>H</th></tr></table>')
  })

  it('reads one inside a blockquote', () => {
    expect(htmlFromMarkdown('> | H |\n> | --- |\n> | a |'))
      .toBe('<blockquote><table><tr><th>H</th></tr><tr><td>a</td></tr></table></blockquote>')
  })

  it('does not turn prose with a pipe and a rule or a dash line into a table', () => {
    const notTables = [
      'a | b\n---', // setext underline / HR below a line with a pipe
      'prose with a | pipe\n---',
      '| H |\n---', // a bare HR right below a table-ish line
      '| H |\n   ---   ',
      'text |\n- - -',
      'text |\n--',
      'a | b\n| --- |', // a one-cell separator below a two-cell header
      'a | b | c\n|---|',
      'a | b\n--- |',
      'no pipe\n| --- |', // the header needs a pipe
      '| H |\n| - |', // fewer than 3 dashes
      '| H |\n| --- | x',
    ]
    for (const md of notTables) {
      expect(htmlFromMarkdown(md), md).not.toContain('<table>')
      expect(containsMarkdownTable(md), md).toBe(false)
    }
    expect(looksLikeMarkdown('a | b\n---')).toBe(false)
    expect(looksLikeMarkdown('prose with a | pipe\n| --- |')).toBe(false)
    expect(looksLikeMarkdown('| H |\n| --- |\n| a |')).toBe(true)
  })

  it('reads two-or-more-column tables exactly as before', () => {
    expect(htmlFromMarkdown('| a | b |\n| :--- | ---: |\n| 1 | 2 |')).toBe(
      '<table><tr><th style="text-align:left">a</th><th style="text-align:right">b</th></tr>' +
      '<tr><td style="text-align:left">1</td><td style="text-align:right">2</td></tr></table>')
    // A two-cell separator below a one-cell header is a table, as it always was.
    expect(htmlFromMarkdown('a |\n--- | ---')).toBe('<table><tr><th>a</th></tr></table>')
    expect(containsMarkdownTable('x | y\n---|---')).toBe(true)
  })
})

describe('htmlFromMarkdown — code block trailing blank lines', () => {
  it('drops them, as the serializer does, so they can\'t come and go', () => {
    expect(htmlFromMarkdown('```\na\n\n\n```')).toBe('<pre><code class="language-">a</code></pre>')
  })
})

// Column widths (lib/tableWidth.ts, note-format.md "Tablas: ancho de columna"):
// the dash count of a separator cell, read only from a separator spaced the way
// NoteFlow writes it and not lined up with the header. The writer side
// (htmlToMarkdown) needs a DOM: tests/lib/tableWidth.test.ts.
describe('htmlFromMarkdown — column widths', () => {
  const cell = (tag: string, text: string, width: number | null, align: string | null = null) => {
    const style = [align && `text-align:${align}`, width && `--nf-colw:${width}`].filter(Boolean).join(';')
    return `<${tag}${width ? ` data-nf-colw="${width}"` : ''}${style ? ` style="${style}"` : ''}>${text}</${tag}>`
  }

  it('puts the width on every cell of its column (alignment kept), automatic columns untouched', () => {
    expect(htmlFromMarkdown('| Product | Price | Notes |\n| ------------------------ | ----------: | --- |\n| a | 1 | x |')).toBe(
      `<table><tr>${cell('th', 'Product', 24)}${cell('th', 'Price', 10, 'right')}${cell('th', 'Notes', null)}</tr>`
      + `<tr>${cell('td', 'a', 24)}${cell('td', '1', 10, 'right')}${cell('td', 'x', null)}</tr></table>`)
  })

  it('a one-column table, centred: the colons are alignment, not dashes', () => {
    expect(htmlFromMarkdown('| Task |\n| :--------------: |\n| a |')).toBe(
      `<table><tr>${cell('th', 'Task', 14, 'center')}</tr><tr>${cell('td', 'a', 14, 'center')}</tr></table>`)
  })

  it('clamps: 3-9 dashes are automatic, 10 kept, more than 80 are 80', () => {
    const widths = (sep: string) => htmlFromMarkdown(`| a | b |\n${sep}\n| 1 | 2 |`).match(/data-nf-colw="\d+"/g)
    expect(widths('| ---- | ----- |')).toBeNull()
    expect(widths('| --------- | :-------: |')).toBeNull()
    // (th + td of the first column; the second is automatic.)
    expect(widths('| ---------- | --- |')).toEqual(['data-nf-colw="10"', 'data-nf-colw="10"'])
    expect(widths(`| ${'-'.repeat(200)} | ${'-'.repeat(80)} |`)).toEqual(Array(4).fill('data-nf-colw="80"'))
  })

  it('gate 1: only a canonically spaced separator (compact, indented or without outer pipes → automatic)', () => {
    for (const sep of ['|----------|---|', '|---------- | --- |', ' | ---------- | --- |', '---------- | ---', '| ---------- | --- ', '|  ---------- | --- |', '| ----------  | --- |']) {
      expect(htmlFromMarkdown(`| a | b |\n${sep}\n| 1 | 2 |`), sep).not.toContain('data-nf-colw')
      expect(htmlFromMarkdown(`| a | b |\n${sep}\n| 1 | 2 |`), sep).toContain('<table>')
    }
    // Trailing spaces are fine.
    expect(htmlFromMarkdown('| a | b |\n| ---------- | --- |   \n| 1 | 2 |')).toContain('data-nf-colw="10"')
  })

  it('gate 2: a separator lined up with its header (a formatter, an LLM) is automatic', () => {
    const prettier = '| Name         | Description |\n| ------------ | ----------- |\n| a            | b           |'
    expect(htmlFromMarkdown(prettier)).not.toContain('data-nf-colw')
    expect(htmlFromMarkdown('| Name | Description |\n| ---- | ----------- |')).not.toContain('data-nf-colw')
    // Escaped pipes count as text: lined up still.
    expect(htmlFromMarkdown('| a \\| b | c      |\n| ------ | ------ |')).not.toContain('data-nf-colw')
    // One column off by a dash is not lined up.
    expect(htmlFromMarkdown('| Name         | Description |\n| ------------ | ------------ |')).toContain('data-nf-colw="12"')
  })

  it('in a quote', () => {
    expect(htmlFromMarkdown('> | H | I |\n> | ---------- | --- |\n> | a | b |')).toContain(cell('td', 'a', 10))
  })

  it('columnWidths: false (pasted markdown, the AI chat) and plain read every column as automatic', () => {
    const md = '| a | b |\n| ---------- | :--------: |\n| 1 | 2 |'
    const auto = '<table><tr><th>a</th><th style="text-align:center">b</th></tr><tr><td>1</td><td style="text-align:center">2</td></tr></table>'
    expect(htmlFromMarkdown(md, { columnWidths: false })).toBe(auto)
    expect(htmlFromMarkdown(md, { plain: true })).toBe(auto)
    expect(htmlFromMarkdown(md, { plain: true, columnWidths: true })).toBe(auto)
    expect(htmlFromMarkdown(md)).toContain('data-nf-colw="10"')
  })

  it('tables without widths read exactly as before', () => {
    expect(htmlFromMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |')).toBe('<table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table>')
  })
})

describe('htmlFromMarkdown — agent-task marker', () => {
  it('is an attribute pair of the task item, with the text left clean', () => {
    expect(htmlFromMarkdown('- [x] Ship 🔺low 🤖k3f9a:done')).toBe(
      '<ul data-type="taskList"><li data-checked="true" data-type="taskItem" data-importance="low" data-agent-id="k3f9a" data-agent-state="done">' +
      '<label><input type="checkbox" checked></label><p>Ship</p></li></ul>',
    )
  })

  it('a multi-line task keeps it on the item, whatever line it was written on', () => {
    for (const md of ['- [ ] one 🤖k3f9a:running\ntwo', '- [ ] one\ntwo 🤖k3f9a:running']) {
      const html = htmlFromMarkdown(md)
      expect(html).toContain('data-agent-id="k3f9a" data-agent-state="running"')
      expect(html).toContain('<p>one<br>two</p>')
    }
  })

  it('nothing changes for tasks without a marker', () => {
    expect(htmlFromMarkdown('- [ ] Ship 📅2026-01-02')).toBe(
      '<ul data-type="taskList"><li data-checked="false" data-type="taskItem" data-due="2026-01-02">' +
      '<label><input type="checkbox"></label><p>Ship</p></li></ul>',
    )
  })
})

// The HTML built here is rendered with innerHTML (previews, kanban cards, the
// chat, the report of an external agent): whatever the markdown says, a value
// interpolated into an attribute must not be able to close it.
describe('htmlFromMarkdown — nothing the author writes leaves an attribute', () => {
  const F = '```'
  /** Every tag the HTML opens, by name. */
  const tags = (html: string) => Array.from(html.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)[\s>]/g), (m) => m[1].toLowerCase())

  it('the language of a code fence cannot inject markup (the reported case)', () => {
    const html = htmlFromMarkdown(`${F}html"><script>alert(1)</script>\ncode\n${F}`)
    expect(html).toBe('<pre><code class="language-html&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;">code</code></pre>')
    expect(tags(html)).toEqual(['pre', 'code'])
  })

  it.each([
    ['a style element', 'x"><style>*{display:none}</style>'],
    ['a base element', 'x"><base href="https://evil.example/">'],
    ['a form', 'x"><form action="https://evil.example/"><input name="q">'],
    ['an event handler', 'js" onmouseover="alert(1)'],
    ['an attribute after a space', 'js " autofocus onfocus="alert(1)'],
    ['a bare closing bracket', 'js><img src=x onerror=alert(1)>'],
    ['an entity that would decode to a quote', 'js&quot;><b>'],
    ['single quotes and backticks', "js' `x` '><i>"],
  ])('%s in the info string stays inside the class attribute', (_name, info) => {
    const html = htmlFromMarkdown(`${F}${info}\ncode\n${F}`)
    expect(tags(html)).toEqual(['pre', 'code'])
    // One attribute, and its value has no raw quote or bracket.
    const m = /^<pre><code class="([^"]*)">code<\/code><\/pre>$/.exec(html)
    expect(m).not.toBeNull()
    expect(m![1]).not.toMatch(/[<>"]/)
    expect(m![1].startsWith('language-')).toBe(true)
  })

  it('ordinary languages are written exactly as before', () => {
    for (const lang of ['', 'js', 'c++', 'c#', 'objective-c', 'shell-session', 'f#', 'x86asm', 'js {1,3}', 'ts title=a.ts']) {
      expect(htmlFromMarkdown(`${F}${lang}\ncode\n${F}`)).toBe(`<pre><code class="language-${lang}">code</code></pre>`)
    }
    // An ampersand is the one ordinary character that is now an entity (it decodes back to itself).
    expect(htmlFromMarkdown(`${F}a&b\ncode\n${F}`)).toBe('<pre><code class="language-a&amp;b">code</code></pre>')
  })

  it('the same holds inside a list item, a quote and next to other blocks', () => {
    const info = 'x"><script>alert(1)</script>'
    for (const md of [
      `- item\n\n  ${F}${info}\n  code\n  ${F}`,
      `> ${F}${info}\n> code\n> ${F}`,
      `para\n${F}${info}\ncode\n${F}\n# Title`,
    ]) {
      expect(tags(htmlFromMarkdown(md))).not.toContain('script')
    }
  })

  it('links, images and section relations keep their values inside the attribute', () => {
    const html = htmlFromMarkdown('[a](https://x/"><script>1</script>) ![alt"><b>](img.png"><i>) text')
    expect(tags(html).filter((t) => t === 'script' || t === 'b' || t === 'i')).toEqual([])
  })

  it('task annotations and table widths are attributes with nothing raw in them', () => {
    const task = htmlFromMarkdown('- [ ] Ship 📅2026-01-02 ⏰09:30 🔺high 🤖k3f9a:running')
    expect(task).toContain('data-due="2026-01-02" data-alarm="09:30" data-importance="high" data-agent-id="k3f9a" data-agent-state="running"')
    const table = htmlFromMarkdown('| a | b |\n| :--- | ---: |\n| 1 | 2 |')
    expect(tags(table).every((t) => ['table', 'tbody', 'thead', 'tr', 'th', 'td', 'p', 'colgroup', 'col'].includes(t))).toBe(true)
  })
})
