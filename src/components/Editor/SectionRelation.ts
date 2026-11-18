import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { SectionRelationView } from './SectionRelationView'
import { stepOffSelectedDrawing } from './drawingCommands'

// Inline atom node for a section→section relation. It serializes to a span the
// markdown layer (markdownHtml.ts) reads/writes as `[Name](noteflow://noteId/sectionId)`,
// so the relation is plain text in the section's .md (single source of truth):
// it round-trips, syncs and the brain graph derives edges from it.
export interface SectionRelationAttrs {
  noteId: string
  sectionId: string
  sectionName: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sectionRelation: {
      insertSectionRelation: (attrs: SectionRelationAttrs) => ReturnType
    }
  }
}

export const SectionRelation = Node.create({
  name: 'sectionRelation',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      noteId: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-note-id') ?? '',
        renderHTML: (attrs) => ({ 'data-note-id': attrs.noteId }),
      },
      sectionId: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-section-id') ?? '',
        renderHTML: (attrs) => ({ 'data-section-id': attrs.sectionId }),
      },
      sectionName: {
        default: '',
        // The visible label is the span's text content.
        parseHTML: (el) => el.textContent ?? '',
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="section-relation"]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-type': 'section-relation' }),
      node.attrs.sectionName || 'Section',
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(SectionRelationView, { as: 'span' })
  },

  addCommands() {
    return {
      insertSectionRelation:
        (attrs) =>
        ({ chain }) =>
          chain()
            // A node-selected drawing is never replaced: the link goes to a paragraph below it.
            .command(({ tr }) => { stepOffSelectedDrawing(tr); return true })
            .insertContent({ type: this.name, attrs })
            // A trailing space so the caret leaves the atom and typing continues normally.
            .insertContent(' ')
            .run(),
    }
  },
})
