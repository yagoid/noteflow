// The note editor's markdown load/save pipeline, outside React, on the editor's
// REAL schema (src/components/Editor/editorExtensions.ts — the same extension
// list Editor.tsx registers). getSchema() never instantiates node views, so the
// React NodeView modules are imported but never run.
//
// Needs a DOM (ProseMirror parses/serializes HTML with it): only import this
// from test files that opt in with `// @vitest-environment happy-dom`.

import { createDocument, getHTMLFromFragment, getSchema } from '@tiptap/core'
import type { Node as PMNode, Schema } from '@tiptap/pm/model'
import { schemaExtensions } from '../../src/components/Editor/editorExtensions'
import { htmlFromMarkdown, htmlToMarkdown } from '../../src/lib/markdownHtml'

export const schema: Schema = getSchema(schemaExtensions())

/** Open a section: what Editor.tsx does with the stored markdown (its initial
 *  `content` and syncExternalContent's `parse`). */
export function load(md: string): PMNode {
  return createDocument(htmlFromMarkdown(md), schema)
}

/** Save a section: Editor.tsx's `htmlToMarkdown(editor.getHTML())`
 *  (getHTML() is getHTMLFromFragment of the document's content). */
export function save(doc: PMNode): string {
  return htmlToMarkdown(getHTMLFromFragment(doc.content, schema))
}
