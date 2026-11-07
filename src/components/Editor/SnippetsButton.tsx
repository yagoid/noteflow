import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'
import { ChevronDown, Settings2, Stamp } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'
import { useLanguageStore } from '../../stores/languageStore'
import { useSnippetsStore } from '../../stores/snippetsStore'
import { expandSnippet, getDefaultSnippet, snippetPreviewLine } from '../../lib/snippets'
import type { Snippet } from '../../types'
import { insertSnippet } from './snippetCommands'
import { SnippetsModal } from './SnippetsModal'

const MENU_WIDTH = 288

// Every button here acts on mousedown (+ preventDefault: the editor keeps its
// selection) AND on a click with detail === 0 — what the keyboard (Enter/Space
// on a focused button) produces. A mouse click also fires onClick afterwards,
// but with detail ≥ 1, so it's ignored and the action never runs twice.
const fromKeyboard = (e: React.MouseEvent) => e.detail === 0

// Split button of the formatting toolbar: the main part inserts the default
// snippet at the caret (variables expanded at click time), the chevron opens the
// list of every snippet + "Configure snippets…". With no snippets the main part
// opens the configuration modal directly. mousedown + preventDefault everywhere
// so the editor keeps its selection (same as the link input / TableOpButton).
export function SnippetsButton({ editor }: { editor: Editor }) {
  const t = useT()
  const lang = useLanguageStore((s) => s.lang)
  const snippets = useSnippetsStore((s) => s.snippets)
  const ensureLoaded = useSnippetsStore((s) => s.ensureLoaded)
  // `now` is taken when the menu opens: the previews show what a click inserts.
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; now: Date } | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const chevronRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => { void ensureLoaded() }, [ensureLoaded])

  const defaultSnippet = getDefaultSnippet(snippets)
  const closeMenu = useCallback(() => setMenuPos(null), [])

  const insert = (snippet: Snippet) => {
    closeMenu()
    insertSnippet(editor, expandSnippet(snippet.content, new Date(), lang))
  }

  const openModal = () => {
    closeMenu()
    setModalOpen(true)
  }

  const runMain = () => {
    if (defaultSnippet) insert(defaultSnippet)
    else openModal()
  }

  const toggleMenu = () => {
    if (menuPos) { closeMenu(); return }
    const rect = chevronRef.current?.getBoundingClientRect()
    if (!rect) return
    const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8))
    setMenuPos({ top: rect.bottom + 4, left, now: new Date() })
  }

  // Dismiss on click outside (the chevron toggles it itself) and on Escape —
  // capture phase: the note editor stops keydown propagation.
  useEffect(() => {
    if (!menuPos) return
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (menuRef.current?.contains(target) || chevronRef.current?.contains(target)) return
      closeMenu()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeMenu() }
    }
    const onResize = () => closeMenu()
    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('resize', onResize)
    }
  }, [menuPos, closeMenu])

  const mainTitle = defaultSnippet
    ? tf(t.editor.snippets.insertDefault, { name: defaultSnippet.name.trim() || t.editor.snippets.untitled })
    : t.editor.snippets.setUp

  return (
    <>
      <div className="flex items-center">
        <button
          onMouseDown={(e) => { e.preventDefault(); runMain() }}
          onClick={(e) => { if (fromKeyboard(e)) runMain() }}
          title={mainTitle}
          aria-label={mainTitle}
          className="p-1.5 rounded-l text-xs transition-colors font-mono text-text-muted hover:text-text hover:bg-surface-3"
        >
          <Stamp size={14} />
        </button>
        <button
          ref={chevronRef}
          onMouseDown={(e) => { e.preventDefault(); toggleMenu() }}
          onClick={(e) => { if (fromKeyboard(e)) toggleMenu() }}
          title={t.editor.snippets.chooseSnippet}
          aria-label={t.editor.snippets.chooseSnippet}
          aria-expanded={menuPos !== null}
          className={`self-stretch px-0.5 rounded-r text-xs transition-colors
            ${menuPos ? 'bg-surface-3 text-text' : 'text-text-muted hover:text-text hover:bg-surface-3'}`}
        >
          <ChevronDown size={11} />
        </button>
      </div>

      {menuPos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ top: menuPos.top, left: menuPos.left, width: MENU_WIDTH }}
          className="fixed z-50 bg-surface-2 border border-border rounded-lg shadow-xl py-1 animate-in fade-in zoom-in duration-100"
        >
          {snippets.length === 0 ? (
            <p className="px-3 py-1.5 text-xs font-mono text-text-muted">{t.editor.snippets.menuEmpty}</p>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              {snippets.map((s) => {
                const preview = snippetPreviewLine(s.content, menuPos.now, lang, 48)
                return (
                  <button
                    key={s.id}
                    role="menuitem"
                    onMouseDown={(e) => { e.preventDefault(); insert(s) }}
                    onClick={(e) => { if (fromKeyboard(e)) insert(s) }}
                    className="w-full text-left px-3 py-1.5 hover:bg-surface-3 transition-colors flex flex-col gap-0.5"
                  >
                    <span className="flex items-center gap-2 text-xs font-mono text-text min-w-0">
                      <span className="truncate">{s.name.trim() || t.editor.snippets.untitled}</span>
                      {s.id === defaultSnippet?.id && (
                        <span className="flex-shrink-0 text-[10px] text-text-muted/70">{t.editor.snippets.defaultBadge}</span>
                      )}
                    </span>
                    {preview && (
                      <span className="text-[11px] font-mono text-text-muted truncate">{preview}</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
          <div className="h-px bg-border my-1" />
          <button
            role="menuitem"
            onMouseDown={(e) => { e.preventDefault(); openModal() }}
            onClick={(e) => { if (fromKeyboard(e)) openModal() }}
            className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 flex items-center gap-2 transition-colors"
          >
            <Settings2 size={12} className="text-text-muted" />
            {t.editor.snippets.configure}
          </button>
        </div>,
        document.body,
      )}

      {modalOpen && (
        <SnippetsModal
          onClose={() => {
            setModalOpen(false)
            editor.commands.focus()
          }}
        />
      )}
    </>
  )
}
