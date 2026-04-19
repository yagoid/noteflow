import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'
import { buildSearchRegex } from '../../lib/searchUtils'

interface Match {
  from: number
  to: number
}

interface SearchState {
  query: string
  caseSensitive: boolean
  matches: Match[]
  activeIndex: number
}

const searchPluginKey = new PluginKey<SearchState>('searchHighlight')

function findMatches(doc: ProseMirrorNode, regex: RegExp | null): Match[] {
  const matches: Match[] = []
  if (!regex) return matches
  doc.descendants((node, pos) => {
    if (!node.isText) return
    const text = node.text ?? ''
    regex.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = regex.exec(text)) !== null) {
      if (m[0].length === 0) {
        regex.lastIndex++
        continue
      }
      matches.push({ from: pos + m.index, to: pos + m.index + m[0].length })
    }
  })
  return matches
}

function getState(state: EditorState): SearchState | null {
  return searchPluginKey.getState(state) ?? null
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    searchHighlight: {
      setSearchTerm: (query: string, caseSensitive: boolean) => ReturnType
      searchNext: () => ReturnType
      searchPrev: () => ReturnType
      clearSearch: () => ReturnType
    }
  }
}

export interface SearchHighlightStorage {
  // Plain properties updated on every transaction via onTransaction —
  // safe to read directly without any PluginKey lookup.
  matchCount: number
  activeIndex: number
  // Function-based accessors kept for backward-compat / convenience.
  getMatchCount: () => number
  getActiveIndex: () => number
  getQuery: () => string
  getCaseSensitive: () => boolean
}

export const SearchHighlight = Extension.create<unknown, SearchHighlightStorage>({
  name: 'searchHighlight',

  addStorage() {
    return {
      matchCount: 0,
      activeIndex: 0,
      getMatchCount: () => 0,
      getActiveIndex: () => 0,
      getQuery: () => '',
      getCaseSensitive: () => false,
    }
  },

  onCreate() {
    const editor = this.editor
    this.storage.getMatchCount = () => getState(editor.state)?.matches.length ?? 0
    this.storage.getActiveIndex = () => getState(editor.state)?.activeIndex ?? 0
    this.storage.getQuery = () => getState(editor.state)?.query ?? ''
    this.storage.getCaseSensitive = () => getState(editor.state)?.caseSensitive ?? false
  },

  // Keep matchCount / activeIndex in sync after every transaction.
  // onTransaction runs inside dispatchTransaction with the correct editor
  // reference, so getState(this.editor.state) always uses the right
  // PluginKey instance regardless of Vite HMR module re-evaluations.
  onTransaction() {
    const s = getState(this.editor.state)
    this.storage.matchCount = s?.matches.length ?? 0
    this.storage.activeIndex = s?.activeIndex ?? 0
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchPluginKey,
        state: {
          init(): SearchState {
            return { query: '', caseSensitive: false, matches: [], activeIndex: 0 }
          },
          apply(tr, prev, _oldState, newState): SearchState {
            const meta = tr.getMeta(searchPluginKey) as Partial<SearchState> | undefined

            if (meta) {
              const query = meta.query ?? prev.query
              const caseSensitive = meta.caseSensitive ?? prev.caseSensitive
              const regex = buildSearchRegex(query, { caseSensitive })
              const matches = findMatches(newState.doc, regex)
              let activeIndex = meta.activeIndex ?? 0
              if (matches.length === 0) activeIndex = 0
              else if (activeIndex >= matches.length) activeIndex = matches.length - 1
              else if (activeIndex < 0) activeIndex = 0
              return { query, caseSensitive, matches, activeIndex }
            }

            if (tr.docChanged && prev.query) {
              const regex = buildSearchRegex(prev.query, { caseSensitive: prev.caseSensitive })
              const matches = findMatches(newState.doc, regex)
              const activeIndex =
                matches.length === 0 ? 0 : Math.min(prev.activeIndex, matches.length - 1)
              return { ...prev, matches, activeIndex }
            }

            return prev
          },
        },
        props: {
          decorations(state) {
            const s = getState(state)
            if (!s || s.matches.length === 0) return DecorationSet.empty
            const decos = s.matches.map((m, i) =>
              Decoration.inline(m.from, m.to, {
                class:
                  i === s.activeIndex
                    ? 'nf-search-match nf-search-match-active'
                    : 'nf-search-match',
              }),
            )
            return DecorationSet.create(state.doc, decos)
          },
        },
      }),
    ]
  },

  addCommands() {
    return {
      setSearchTerm:
        (query: string, caseSensitive: boolean) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(searchPluginKey, { query, caseSensitive, activeIndex: 0 })
            dispatch(tr)
          }
          return true
        },

      searchNext:
        () =>
        ({ state, tr, dispatch }) => {
          const s = getState(state)
          if (!s || s.matches.length === 0) return false
          const nextIndex = (s.activeIndex + 1) % s.matches.length
          const match = s.matches[nextIndex]
          if (dispatch) {
            tr.setMeta(searchPluginKey, {
              query: s.query,
              caseSensitive: s.caseSensitive,
              activeIndex: nextIndex,
            })
            tr.setSelection(TextSelection.create(tr.doc, match.from, match.to))
            tr.scrollIntoView()
            dispatch(tr)
          }
          return true
        },

      searchPrev:
        () =>
        ({ state, tr, dispatch }) => {
          const s = getState(state)
          if (!s || s.matches.length === 0) return false
          const prevIndex = (s.activeIndex - 1 + s.matches.length) % s.matches.length
          const match = s.matches[prevIndex]
          if (dispatch) {
            tr.setMeta(searchPluginKey, {
              query: s.query,
              caseSensitive: s.caseSensitive,
              activeIndex: prevIndex,
            })
            tr.setSelection(TextSelection.create(tr.doc, match.from, match.to))
            tr.scrollIntoView()
            dispatch(tr)
          }
          return true
        },

      clearSearch:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(searchPluginKey, { query: '', caseSensitive: false, activeIndex: 0 })
            dispatch(tr)
          }
          return true
        },
    }
  },
})
