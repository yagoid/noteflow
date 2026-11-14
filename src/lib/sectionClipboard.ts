import type { Editor as TiptapEditor } from '@tiptap/core'

/**
 * Text-mode sections keep inline image data in their markdown, but the textarea
 * deliberately shows a compact placeholder instead of exposing the data URI.
 */
export function rawSectionDisplayText(content: string): string {
  return content.replace(/!\[([^\]]*)\]\(data:[^)]+\)/g, (_, alt) => `![${alt}]([image])`)
}

type TextEditor = Pick<TiptapEditor, 'getText'>

/** The exact text shown by the active editor, ready for the system clipboard. */
export function sectionTextForClipboard(
  isRawMode: boolean,
  rawContent: string,
  editor: TextEditor | null | undefined,
): string {
  if (isRawMode) return rawSectionDisplayText(rawContent)
  return editor?.getText({ blockSeparator: '\n' }) ?? ''
}
