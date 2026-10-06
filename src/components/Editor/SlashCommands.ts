import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import type { SuggestionProps } from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import { SlashCommandMenu, type SlashCommandMenuHandle } from './SlashCommandMenu'
import { getRootZoom } from '../../stores/themeStore'
import type { Messages } from '../../i18n'
import {
  convertTaskListToBoard,
  insertDefaultBoard,
  topLevelTaskList,
  type KanbanDefaultColumns,
} from './kanbanCommands'

export interface SlashCommandItem {
  title: string
  description?: string
  /** Extra (untranslated) words that also match the typed query. */
  keywords?: string[]
  // Runs after the typed `/query` range has been deleted.
  run: (editor: Editor) => void
}

export interface SlashCommandLabels {
  linkSection: string
  linkSectionDescription: string
  kanban: string
  kanbanDescription: string
  convertToKanban: string
  convertToKanbanDescription: string
  /** Column names of a new board (to do / in progress / done). */
  kanbanColumns: KanbanDefaultColumns
}

/**
 * Factory for the slash-command labels. Never call at module load — invoke it at
 * use time (via `getLabels`, wired to a `useT()`-backed ref) so a live language
 * switch is reflected the next time the `/` menu opens.
 */
export function getSlashCommands(t: Messages): SlashCommandLabels {
  return {
    linkSection: t.editor.slash.linkSection,
    linkSectionDescription: t.editor.slash.linkSectionDescription,
    kanban: t.editor.slash.kanban,
    kanbanDescription: t.editor.slash.kanbanDescription,
    convertToKanban: t.editor.slash.convertToKanban,
    convertToKanbanDescription: t.editor.slash.convertToKanbanDescription,
    kanbanColumns: [t.editor.kanban.defaultTodo, t.editor.kanban.defaultDoing, t.editor.kanban.defaultDone],
  }
}

export interface SlashCommandsOptions {
  onLinkSection: (editor: Editor) => void
  // Read fresh labels each time the menu builds its items (see getSlashCommands).
  getLabels: () => SlashCommandLabels
}

// Position the popup just below the caret, clamped to the viewport.
function positionPopup(popup: HTMLElement, rect: DOMRect | null) {
  if (!rect) return
  const margin = 8
  // The popup is `position: fixed` (zoomed/local space), but `rect` comes from
  // getBoundingClientRect() (device space). Divide the rect coords by the root
  // zoom so they match the local space of the popup and window.innerWidth/Height.
  // popup.offsetWidth/offsetHeight are already in local space — don't touch them.
  const z = getRootZoom()
  const rectLeft = rect.left / z
  const rectTop = rect.top / z
  const rectBottom = rect.bottom / z
  const width = popup.offsetWidth || 240
  let left = rectLeft
  if (left + width + margin > window.innerWidth) left = window.innerWidth - width - margin
  if (left < margin) left = margin
  let top = rectBottom + 6
  const height = popup.offsetHeight || 0
  if (top + height + margin > window.innerHeight) top = rectTop - height - 6
  popup.style.left = `${left}px`
  popup.style.top = `${Math.max(margin, top)}px`
}

export const SlashCommands = Extension.create<SlashCommandsOptions>({
  name: 'slashCommands',

  addOptions() {
    return {
      onLinkSection: () => {},
      // English fallback; the editor overrides this with a `useT()`-backed getter.
      getLabels: () => ({
        linkSection: 'Link section',
        linkSectionDescription: 'Link to another section',
        kanban: 'Kanban board',
        kanbanDescription: 'Columns and cards you can drag around',
        convertToKanban: 'Convert task list to board',
        convertToKanbanDescription: 'Turn this task list into a kanban board',
        kanbanColumns: ['To do', 'In progress', 'Done'],
      }),
    }
  },

  addProseMirrorPlugins() {
    const onLinkSection = this.options.onLinkSection
    const getLabels = this.options.getLabels
    return [
      Suggestion<SlashCommandItem>({
        editor: this.editor,
        char: '/',
        startOfLine: false,
        // Don't trigger inside code blocks.
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from)
          return $from.parent.type.name !== 'codeBlock'
        },
        items: ({ query, editor }) => {
          const labels = getLabels()
          const all: SlashCommandItem[] = [
            {
              title: labels.linkSection,
              description: labels.linkSectionDescription,
              run: (editor) => onLinkSection(editor),
            },
          ]
          // Inside a top-level task list: offer to turn it into a board.
          if (topLevelTaskList(editor)) {
            all.push({
              title: labels.convertToKanban,
              description: labels.convertToKanbanDescription,
              keywords: ['kanban', 'board'],
              run: (editor) => { convertTaskListToBoard(editor, labels.kanbanColumns) },
            })
          }
          all.push({
            title: labels.kanban,
            description: labels.kanbanDescription,
            // `/kanban` and `/board` find it in any UI language.
            keywords: ['kanban', 'board'],
            run: (editor) => insertDefaultBoard(editor, labels.kanbanColumns),
          })
          const q = query.trim().toLowerCase()
          return q
            ? all.filter((i) => i.title.toLowerCase().includes(q) || i.keywords?.some((k) => k.startsWith(q)))
            : all
        },
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).run()
          props.run(editor)
        },
        render: () => {
          let component: ReactRenderer<SlashCommandMenuHandle> | null = null
          let popup: HTMLDivElement | null = null

          return {
            onStart: (props: SuggestionProps<SlashCommandItem>) => {
              component = new ReactRenderer(SlashCommandMenu, {
                props: { items: props.items, command: props.command },
                editor: props.editor,
              })
              popup = document.createElement('div')
              popup.style.position = 'fixed'
              popup.style.zIndex = '9999'
              popup.appendChild(component.element)
              document.body.appendChild(popup)
              positionPopup(popup, props.clientRect?.() ?? null)
            },
            onUpdate: (props: SuggestionProps<SlashCommandItem>) => {
              component?.updateProps({ items: props.items, command: props.command })
              if (popup) positionPopup(popup, props.clientRect?.() ?? null)
            },
            onKeyDown: (props: { event: KeyboardEvent }) => {
              if (props.event.key === 'Escape') {
                popup?.remove()
                return true
              }
              return component?.ref?.onKeyDown(props.event) ?? false
            },
            onExit: () => {
              popup?.remove()
              popup = null
              component?.destroy()
              component = null
            },
          }
        },
      }),
    ]
  },
})
