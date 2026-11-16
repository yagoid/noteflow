import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import type { SuggestionProps } from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import { SlashCommandMenu, type SlashCommandMenuHandle } from './SlashCommandMenu'
import type { Messages } from '../../i18n'
import {
  convertTaskListToBoard,
  insertDefaultBoard,
  kanbanDefaultColumns,
  topLevelTaskList,
  type KanbanDefaultColumns,
} from './kanbanCommands'
import { insertSnippet } from './snippetCommands'
import { insertNewTable } from './tableCommands'
import { sortCheckedToBottom, taskListAround } from '../../lib/listItemMove'
import { expandSnippet } from '../../lib/snippets'
import { filterSlashItems, snippetSlashEntries, TABLE_SLASH_KEYWORDS } from '../../lib/slashItems'
import { DEFAULT_TABLE_SIZE, canInsertTableHere } from '../../lib/tableInsert'
import { useSnippetsStore } from '../../stores/snippetsStore'
import { useLanguageStore } from '../../stores/languageStore'

export interface SlashCommandItem {
  /** Stable React key — titles can repeat (two snippets with one name, or a snippet named like a command). */
  id: string
  title: string
  description?: string
  /** 'snippet' = one of the user's snippets (rendered with its icon, under a heading). Default: a command. */
  kind?: 'command' | 'snippet'
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
  sortChecked: string
  sortCheckedDescription: string
  table: string
  tableDescription: string
  /** Column names of a new board (to do / in progress / done). */
  kanbanColumns: KanbanDefaultColumns
  /** Title of a snippet without a name. */
  snippetUntitled: string
  /** Description of a snippet with no previewable line. */
  snippetDescription: string
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
    sortChecked: t.editor.slash.sortChecked,
    sortCheckedDescription: t.editor.slash.sortCheckedDescription,
    table: t.editor.slash.table,
    tableDescription: t.editor.slash.tableDescription,
    kanbanColumns: kanbanDefaultColumns(t),
    snippetUntitled: t.editor.snippets.untitled,
    snippetDescription: t.editor.slash.snippet,
  }
}

export interface SlashCommandsOptions {
  onLinkSection: (editor: Editor) => void
  /** Linked notes (plain Markdown): no "Link section" nor kanban commands — only "Table", "Move checked to bottom" and snippets. */
  plain: boolean
  // Read fresh labels each time the menu builds its items (see getSlashCommands).
  getLabels: () => SlashCommandLabels
}

// Position the popup just below the caret, clamped to the viewport.
function positionPopup(popup: HTMLElement, rect: DOMRect | null) {
  if (!rect) return
  const margin = 8
  const width = popup.offsetWidth || 240
  let left = rect.left
  if (left + width + margin > window.innerWidth) left = window.innerWidth - width - margin
  if (left < margin) left = margin
  let top = rect.bottom + 6
  const height = popup.offsetHeight || 0
  if (top + height + margin > window.innerHeight) top = rect.top - height - 6
  popup.style.left = `${left}px`
  popup.style.top = `${Math.max(margin, top)}px`
}

export const SlashCommands = Extension.create<SlashCommandsOptions>({
  name: 'slashCommands',

  addOptions() {
    return {
      onLinkSection: () => {},
      plain: false,
      // English fallback; the editor overrides this with a `useT()`-backed getter.
      getLabels: () => ({
        linkSection: 'Link section',
        linkSectionDescription: 'Link to another section',
        kanban: 'Kanban board',
        kanbanDescription: 'Columns and cards you can drag around',
        convertToKanban: 'Convert task list to board',
        convertToKanbanDescription: 'Turn this task list into a kanban board',
        sortChecked: 'Move checked to bottom',
        sortCheckedDescription: 'Put the checked tasks of this list at the end',
        table: 'Table',
        tableDescription: 'A 3 × 3 table with a header row',
        kanbanColumns: ['To do', 'In progress', 'Done'],
        snippetUntitled: 'Untitled snippet',
        snippetDescription: 'Snippet',
      }),
    }
  },

  // The snippets are listed in the menu: load them (and follow external changes)
  // with the editor, not only when the toolbar's snippets button mounts — that
  // button can be hidden. Idempotent: the first call in the window wins.
  onCreate() {
    void useSnippetsStore.getState().ensureLoaded()
  },

  addProseMirrorPlugins() {
    const onLinkSection = this.options.onLinkSection
    const getLabels = this.options.getLabels
    const plain = this.options.plain
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
          const all: SlashCommandItem[] = []
          if (!plain) {
            all.push({
              id: 'link-section',
              title: labels.linkSection,
              description: labels.linkSectionDescription,
              run: (editor) => onLinkSection(editor),
            })
            // Inside a top-level task list: offer to turn it into a board.
            if (topLevelTaskList(editor)) {
              all.push({
                id: 'convert-to-kanban',
                title: labels.convertToKanban,
                description: labels.convertToKanbanDescription,
                keywords: ['kanban', 'board'],
                run: (editor) => { convertTaskListToBoard(editor, labels.kanbanColumns) },
              })
            }
            all.push({
              id: 'kanban',
              title: labels.kanban,
              description: labels.kanbanDescription,
              // `/kanban` and `/board` find it in any UI language.
              keywords: ['kanban', 'board'],
              run: (editor) => insertDefaultBoard(editor, labels.kanbanColumns),
            })
          }
          // A pipe table is plain Markdown: also in linked notes. Only offered
          // where it can go at the caret — not inside a list nor another table
          // (lib/tableInsert.ts); the toolbar button inserts after those instead.
          if (canInsertTableHere(editor.state.selection)) {
            all.push({
              id: 'table',
              title: labels.table,
              description: labels.tableDescription,
              keywords: TABLE_SLASH_KEYWORDS,
              run: (editor) => insertNewTable(editor, DEFAULT_TABLE_SIZE),
            })
          }
          // Inside a task list (any level, also in linked notes): put its checked
          // tasks at the end, by hand (lib/listItemMove.ts).
          if (taskListAround(editor.state)) {
            all.push({
              id: 'sort-checked',
              title: labels.sortChecked,
              description: labels.sortCheckedDescription,
              keywords: ['sort', 'checked', 'done'],
              run: (editor) => {
                const tr = sortCheckedToBottom(editor.state)
                if (tr) editor.view.dispatch(tr)
              },
            })
          }
          // The user's snippets, after the commands and in their configured
          // order. Read fresh on every keystroke (the store follows edits made
          // in the modal or another window); variables expand on insertion.
          const snippetEntries = snippetSlashEntries(
            useSnippetsStore.getState().snippets,
            { untitled: labels.snippetUntitled, fallbackDescription: labels.snippetDescription },
            new Date(),
            useLanguageStore.getState().lang,
          )
          for (const entry of snippetEntries) {
            all.push({
              id: entry.id,
              kind: 'snippet',
              title: entry.title,
              description: entry.description,
              keywords: entry.keywords,
              run: (editor) => insertSnippet(editor, expandSnippet(entry.snippet.content, new Date(), useLanguageStore.getState().lang)),
            })
          }
          return filterSlashItems(all, query)
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
