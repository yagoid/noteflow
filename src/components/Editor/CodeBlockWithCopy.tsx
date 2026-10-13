import { NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../../i18n/useT'

// Pretty labels for common lowlight language ids. Anything not listed falls back
// to capitalising the id. The value stored in `node.attrs.language` is ALWAYS the
// raw lowlight id (never the label) so highlighting and the markdown round-trip
// keep working.
const LANGUAGE_LABELS: Record<string, string> = {
  javascript: 'JavaScript',
  js: 'JavaScript',
  typescript: 'TypeScript',
  ts: 'TypeScript',
  python: 'Python',
  py: 'Python',
  bash: 'Bash',
  shell: 'Shell',
  c: 'C',
  cpp: 'C++',
  csharp: 'C#',
  css: 'CSS',
  scss: 'SCSS',
  less: 'Less',
  diff: 'Diff',
  go: 'Go',
  graphql: 'GraphQL',
  ini: 'INI',
  java: 'Java',
  json: 'JSON',
  kotlin: 'Kotlin',
  lua: 'Lua',
  makefile: 'Makefile',
  markdown: 'Markdown',
  objectivec: 'Objective-C',
  perl: 'Perl',
  php: 'PHP',
  r: 'R',
  ruby: 'Ruby',
  rust: 'Rust',
  sql: 'SQL',
  swift: 'Swift',
  vbnet: 'VB.NET',
  wasm: 'WebAssembly',
  xml: 'XML / HTML',
  yaml: 'YAML',
  html: 'HTML',
}

function labelFor(id: string): string {
  return LANGUAGE_LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1)
}

function CodeBlockView({ node, extension, updateAttributes, editor }: NodeViewProps) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 })

  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const language: string | null = node.attrs.language || null

  const handleCopy = () => {
    navigator.clipboard.writeText(node.textContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // Languages registered on the lowlight instance passed via `.configure({ lowlight })`.
  // Sorted by their pretty label; `plaintext` is dropped since our own "Plain text"
  // option (language = null) already covers unhighlighted code.
  const languages = useMemo(() => {
    const lowlight = extension.options.lowlight as { listLanguages?: () => string[] } | undefined
    const ids = lowlight?.listLanguages?.() ?? []
    return ids
      .filter((id) => id !== 'plaintext')
      .map((id) => ({ id, label: labelFor(id) }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [extension.options.lowlight])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return languages
    return languages.filter((l) => l.label.toLowerCase().includes(q) || l.id.toLowerCase().includes(q))
  }, [languages, query])

  const openDropdown = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) setPos({ left: rect.left, top: rect.bottom + 6 })
    setQuery('')
    setOpen(true)
  }

  const selectLanguage = (id: string | null) => {
    updateAttributes({ language: id })
    setOpen(false)
    editor.commands.focus()
  }

  // Keep the dropdown on screen once it has laid out. Clamp by writing the style
  // directly (before paint) instead of through state, to avoid a cascading render.
  useLayoutEffect(() => {
    if (!open) return
    const el = dropdownRef.current
    if (!el) return
    const margin = 8
    let { left, top } = pos
    const w = el.offsetWidth
    const h = el.offsetHeight
    if (left + w + margin > window.innerWidth) left = window.innerWidth - w - margin
    if (left < margin) left = margin
    if (top + h + margin > window.innerHeight) top = window.innerHeight - h - margin
    if (top < margin) top = margin
    el.style.left = `${left}px`
    el.style.top = `${top}px`
  }, [open, pos])

  // Focus the search field when the dropdown opens.
  useEffect(() => {
    if (open) searchRef.current?.focus()
  }, [open])

  // Close on click outside and on Escape.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (dropdownRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        editor.commands.focus()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, editor])

  const currentLabel = language ? labelFor(language) : t.editor.codeBlock.plainText

  return (
    <NodeViewWrapper className="group code-block-node">
      <pre className={language ? 'has-language' : undefined}>
        <button
          ref={buttonRef}
          contentEditable={false}
          onClick={() => (open ? setOpen(false) : openDropdown())}
          className="code-lang-button absolute top-2 left-2 transition-opacity text-xs px-2 py-1 rounded opacity-60 group-hover:opacity-100"
          style={{
            background: 'rgb(var(--bg-2))',
            color: 'rgb(var(--text-muted))',
            border: '1px solid rgb(var(--border))',
            lineHeight: 1,
          }}
        >
          {currentLabel}
        </button>
        <button
          contentEditable={false}
          onClick={handleCopy}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs px-2 py-1 rounded"
          style={{
            background: 'rgb(var(--bg-2))',
            color: 'rgb(var(--text-muted))',
            border: '1px solid rgb(var(--border))',
            lineHeight: 1,
          }}
        >
          {copied ? t.editor.codeBlock.copied : t.editor.codeBlock.copy}
        </button>
        <NodeViewContent as="code" className={language ? `language-${language}` : undefined} />
      </pre>
      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            contentEditable={false}
            className="code-lang-menu"
            style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 9999 }}
          >
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.editor.codeBlock.searchLanguage}
              className="code-lang-search"
            />
            <div className="code-lang-list">
              <button
                type="button"
                className={`code-lang-item${language === null ? ' is-active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  selectLanguage(null)
                }}
              >
                {t.editor.codeBlock.plainText}
              </button>
              {filtered.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className={`code-lang-item${language === l.id ? ' is-active' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    selectLanguage(l.id)
                  }}
                >
                  {l.label}
                </button>
              ))}
              {filtered.length === 0 && <div className="code-lang-empty">{t.editor.codeBlock.noLanguages}</div>}
            </div>
          </div>,
          document.body
        )}
    </NodeViewWrapper>
  )
}

export const CodeBlockWithCopy = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView)
  },
})
