// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import { schemaExtensions } from '../../src/components/Editor/editorExtensions'
import { htmlFromMarkdown } from '../../src/lib/markdownHtml'
import { rawSectionDisplayText, sectionTextForClipboard } from '../../src/lib/sectionClipboard'

const editors: Editor[] = []

function editorFor(markdown: string): Editor {
  const editor = new Editor({ extensions: schemaExtensions(), content: htmlFromMarkdown(markdown) })
  editors.push(editor)
  return editor
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

describe('section clipboard text', () => {
  it('copies visible markdown-mode blocks with one newline between them', () => {
    const editor = editorFor('# Heading\n\nFirst paragraph\n\nSecond paragraph')

    expect(sectionTextForClipboard(false, 'stale markdown source', editor)).toBe(
      'Heading\nFirst paragraph\nSecond paragraph',
    )
  })

  it('requests TipTap text with a single-newline block separator', () => {
    const getText = vi.fn(() => 'visible text')

    expect(sectionTextForClipboard(false, '', { getText })).toBe('visible text')
    expect(getText).toHaveBeenCalledWith({ blockSeparator: '\n' })
  })

  it('copies the text-mode view without leaking inline image data URIs', () => {
    const raw = [
      '# Source stays markdown',
      '',
      '![diagram](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA)',
      '',
      '![remote](https://example.com/image.png)',
    ].join('\n')

    const expected = [
      '# Source stays markdown',
      '',
      '![diagram]([image])',
      '',
      '![remote](https://example.com/image.png)',
    ].join('\n')

    expect(rawSectionDisplayText(raw)).toBe(expected)
    expect(sectionTextForClipboard(true, raw, undefined)).toBe(expected)
  })
})
