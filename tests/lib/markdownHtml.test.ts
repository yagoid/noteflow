import { describe, it, expect } from 'vitest'
import { htmlFromMarkdown } from '../../src/lib/markdownHtml'

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
    // First line wins: the stray 🔺low on the continuation line is stripped but
    // must not clobber the high importance declared on the `- [ ]` line.
    const md = '- [ ] Task 🔺high\nkeep going 🔺low'
    const html = htmlFromMarkdown(md)
    expect(html).toContain('data-importance="high"')
    expect(html).not.toContain('data-importance="low"')
    expect(html).not.toContain('🔺')
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
