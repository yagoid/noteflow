import type { Editor } from '@tiptap/core'
import { DOMParser as ProseMirrorDOMParser, Fragment, Slice, type Schema } from '@tiptap/pm/model'
import { htmlFromMarkdown } from '../../lib/markdownHtml'
import { isInlineSnippet } from '../../lib/snippets'

/**
 * The slice an (already expanded) snippet inserts: its markdown goes through the
 * same markdown → HTML → ProseMirror path as a markdown paste (Editor.tsx
 * handlePaste), so headings, lists and checkboxes render. A one-line snippet
 * without block syntax becomes an OPEN inline slice — it joins the text at the
 * caret instead of splitting the paragraph. A multi-block snippet that ends in a
 * blank line gets a trailing empty paragraph, so the caret lands below it
 * (e.g. under a journal heading) ready to type.
 */
export function snippetSlice(schema: Schema, markdown: string): Slice {
  const dom = new window.DOMParser().parseFromString(htmlFromMarkdown(markdown), 'text/html')
  const parsed = ProseMirrorDOMParser.fromSchema(schema).parseSlice(dom.body)
  const first = parsed.content.firstChild
  if (isInlineSnippet(markdown) && parsed.content.childCount === 1 && first?.isTextblock) {
    // The markdown → HTML parse trims the line: keep its edge spaces, they are
    // usually deliberate ("{time} " before the text that follows).
    const line = markdown.replace(/^\n+|\n+$/g, '')
    const lead = /^[ \t]*/.exec(line)?.[0] ?? ''
    const trail = line.trim() ? (/[ \t]*$/.exec(line)?.[0] ?? '') : ''
    let inline = first.content
    if (lead) inline = Fragment.from(schema.text(lead)).append(inline)
    if (trail) inline = inline.append(Fragment.from(schema.text(trail)))
    return new Slice(inline, 0, 0)
  }
  const last = parsed.content.lastChild
  const endsWithBlankLine = /\n[ \t]*\n\s*$/.test(markdown)
  const lastIsEmptyParagraph = last?.type === schema.nodes.paragraph && last.content.size === 0
  if (endsWithBlankLine && last && !lastIsEmptyParagraph && schema.nodes.paragraph) {
    return new Slice(parsed.content.append(Fragment.from(schema.nodes.paragraph.create())), 0, 0)
  }
  return parsed
}

/**
 * Inserts an expanded snippet at the editor's selection (replacing it). Inside a
 * code block markdown is literal source, so it goes in as plain text — same rule
 * as the markdown paste.
 */
export function insertSnippet(editor: Editor, markdown: string): void {
  if (!markdown) return
  const { view, state } = editor
  const { $from } = state.selection
  for (let depth = $from.depth; depth >= 0; depth--) {
    if ($from.node(depth).type.spec.code) {
      view.dispatch(state.tr.insertText(markdown).scrollIntoView())
      view.focus()
      return
    }
  }
  view.dispatch(state.tr.replaceSelection(snippetSlice(state.schema, markdown)).scrollIntoView())
  view.focus()
}
