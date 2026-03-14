import { useEditor, EditorContent } from '@tiptap/react'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Bold from '@tiptap/extension-bold'
import Italic from '@tiptap/extension-italic'
import Underline from '@tiptap/extension-underline'
import Strike from '@tiptap/extension-strike'
import Code from '@tiptap/extension-code'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Heading from '@tiptap/extension-heading'
import BulletList from '@tiptap/extension-bullet-list'
import OrderedList from '@tiptap/extension-ordered-list'
import ListItem from '@tiptap/extension-list-item'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'
import HardBreak from '@tiptap/extension-hard-break'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import History from '@tiptap/extension-history'
import Placeholder from '@tiptap/extension-placeholder'
import { common, createLowlight } from 'lowlight'
import { useCallback, useEffect, useRef } from 'react'
import { EditorToolbar } from './EditorToolbar'

const lowlight = createLowlight(common)

interface EditorProps {
  content: string
  onChange: (markdown: string) => void
  placeholder?: string
  readOnly?: boolean
  hideToolbar?: boolean
}

export function Editor({
  content,
  onChange,
  placeholder = 'Start typing...',
  readOnly = false,
  hideToolbar = false,
}: EditorProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editor = useEditor({
    editorProps: {
      attributes: {
        spellcheck: 'false',
      },
    },
    extensions: [
      Document,
      Paragraph,
      Text,
      Bold,
      Italic,
      Underline,
      Strike,
      Code,
      CodeBlockLowlight.configure({ lowlight }),
      Heading.configure({ levels: [1, 2, 3] }),
      BulletList,
      OrderedList,
      ListItem,
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false }),
      HorizontalRule,
      HardBreak,
      History,
      Placeholder.configure({ placeholder }),
    ],
    content: htmlFromMarkdown(content),
    editable: !readOnly,
    autofocus: true,
    onUpdate({ editor }) {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        onChange(htmlToMarkdown(editor.getHTML()))
      }, 400)
    },
  })

  // Sync external content changes (e.g. switching notes)
  // IMPORTANT: compare normalized markdown to avoid overwriting valid content
  // with a superficially-different representation (which would eat line breaks).
  useEffect(() => {
    if (!editor) return
    const currentMd = htmlToMarkdown(editor.getHTML()).trim()
    const incomingMd = content.trim()
    if (currentMd !== incomingMd) {
      editor.commands.setContent(htmlFromMarkdown(content), false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!editor) return
      // Ctrl+Shift+` → code block
      if (e.ctrlKey && e.shiftKey && e.key === '`') {
        e.preventDefault()
        editor.chain().focus().toggleCodeBlock().run()
        return
      }

      // Intercept Enter to ensure we don't get trapped after a horizontal rule
      // or lose focus in weird edge cases.
      if (e.key === 'Enter' && !e.shiftKey) {
        const { state } = editor
        const { selection } = state
        const { $from } = selection

        // Check if we are right after a horizontal rule
        const nodeBefore = $from.nodeBefore
        if (nodeBefore && nodeBefore.type.name === 'horizontalRule') {
          // If we are, explicitly insert a paragraph to prevent getting trapped
          e.preventDefault()
          editor.chain().insertContent('<p></p>').focus().run()
          return
        }
      }
    },
    [editor]
  )

  if (!editor) return null

  return (
    <div className="flex flex-col h-full" onKeyDown={handleKeyDown}>
      {!readOnly && !hideToolbar && <EditorToolbar editor={editor} />}
      <div className="flex-1 overflow-y-auto">
        <EditorContent
          editor={editor}
          className="h-full prose-editor"
        />
      </div>
    </div>
  )
}

// ── Markdown ↔ HTML helpers ──────────────────────────────────────────────────
//
// Rules:
//   - Blank line (two newlines) = paragraph break  → </p><p>
//   - Single newline within a paragraph             → <br>  (HardBreak)
//   - Lists: consecutive same-type items are merged into one <ul>/<ol>
//

function htmlFromMarkdown(md: string): string {
  if (!md.trim()) return '<p></p>'

  // Normalise line endings
  const src = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Split into "blocks" on blank lines
  const rawBlocks = src.split(/\n\n+/)
  const htmlBlocks: string[] = []

  for (const block of rawBlocks) {
    const lines = block.split('\n')

    // ── Code fence ──────────────────────────────────────────────────────────
    if (/^```/.test(lines[0])) {
      const lang = lines[0].slice(3).trim()
      const code = lines.slice(1).join('\n').replace(/```\s*$/, '').trimEnd()
      htmlBlocks.push(`<pre><code class="language-${lang}">${escapeHtml(code)}</code></pre>`)
      continue
    }

    // ── Headings ─────────────────────────────────────────────────────────────
    if (lines.length === 1) {
      const hm = lines[0].match(/^(#{1,3})\s+(.+)$/)
      if (hm) {
        const level = hm[1].length
        htmlBlocks.push(`<h${level}>${inlineToHtml(hm[2])}</h${level}>`)
        continue
      }
    }

    // ── Horizontal Rule ──────────────────────────────────────────────────────
    if (lines.length === 1 && lines[0].trim() === '---') {
      htmlBlocks.push('<hr>')
      continue
    }

    // ── List block ───────────────────────────────────────────────────────────
    const isUl = lines.every((l) => /^[-*+] /.test(l) || l === '')
    const isOl = lines.every((l) => /^\d+\. /.test(l) || l === '')
    const isTask = lines.every((l) => /^- \[[ x]\] /.test(l) || l === '')

    if (isTask) {
      const items = lines
        .filter((l) => l.trim())
        .map((l) => {
          const checked = l.startsWith('- [x]')
          const text = l.replace(/^- \[[ x]\] /, '')
          return `<li data-checked="${checked}" data-type="taskItem"><label><input type="checkbox"${checked ? ' checked' : ''}></label><p>${inlineToHtml(text)}</p></li>`
        })
        .join('')
      htmlBlocks.push(`<ul data-type="taskList">${items}</ul>`)
      continue
    }

    if (isUl) {
      const items = lines
        .filter((l) => l.trim())
        .map((l) => `<li><p>${inlineToHtml(l.replace(/^[-*+] /, ''))}</p></li>`)
        .join('')
      htmlBlocks.push(`<ul>${items}</ul>`)
      continue
    }

    if (isOl) {
      const items = lines
        .filter((l) => l.trim())
        .map((l) => `<li><p>${inlineToHtml(l.replace(/^\d+\. /, ''))}</p></li>`)
        .join('')
      htmlBlocks.push(`<ol>${items}</ol>`)
      continue
    }

    // ── Paragraph (may span multiple lines — single \n becomes <br>) ────────
    const paraContent = lines
      .map((l) => {
        const hm = l.match(/^(#{1,3})\s+(.+)$/)
        if (hm) {
          const level = hm[1].length
          return `</p><h${level}>${inlineToHtml(hm[2])}</h${level}><p>`
        }
        return inlineToHtml(l)
      })
      .join('<br>')
      // clean up <p></p> artefacts from heading injection
      .replace(/<p><\/p>/g, '')
      .replace(/<\/p><br>/g, '</p>')
      .replace(/<br><p>/g, '<p>')

    htmlBlocks.push(`<p>${paraContent}</p>`)
  }

  return htmlBlocks.join('') || '<p></p>'
}

function htmlToMarkdown(html: string): string {
  // Normalise self-closing and void tags
  const md = html
    // Hard breaks
    .replace(/<br\s*\/?>/gi, '\n')
    // Code blocks (must come before inline code)
    .replace(/<pre><code(?:\s+class="language-(\w*)")?>([\s\S]*?)<\/code><\/pre>/gi,
      (_m, lang, code) => `\`\`\`${lang || ''}\n${unescapeHtml(code).trimEnd()}\n\`\`\``)
    // Inline code
    .replace(/<code>(.*?)<\/code>/gi, '`$1`')
    // Headings — wrap with double newlines so they always separate from adjacent blocks
    .replace(/<h1>(.*?)<\/h1>/gi, '\n\n# $1\n\n')
    .replace(/<h2>(.*?)<\/h2>/gi, '\n\n## $1\n\n')
    .replace(/<h3>(.*?)<\/h3>/gi, '\n\n### $1\n\n')
    // Horizontal Rule
    .replace(/<hr\s*\/?>/gi, '\n\n---\n\n')
    // Bold + italic
    .replace(/<strong><em>(.*?)<\/em><\/strong>/gi, '***$1***')
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<em>(.*?)<\/em>/gi, '*$1*')
    // Strike
    .replace(/<s>(.*?)<\/s>/gi, '~~$1~~')
    // Task items (before generic li)
    .replace(/<li[^>]*data-type="taskItem"[^>]*>([\s\S]*?)<\/li>/gi, (m, inner) => {
      const isChecked = m.includes('data-checked="true"') || inner.includes('checked="checked"') || inner.includes('checked')
      const text = m.replace(/<[^>]+>/g, '').trim()
      return isChecked ? `- [x] ${text}\n` : `- [ ] ${text}\n`
    })
    // Ordered list items
    .replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner) => {
      let i = 1
      return '\n' + inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m: string, content: string) => {
        const text = content.replace(/<[^>]+>/g, '').trim()
        return `${i++}. ${text}\n`
      }) + '\n'
    })
    // Unordered list items — also wrap with newlines
    .replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner) =>
      '\n' + inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m: string, content: string) => {
        const text = content.replace(/<[^>]+>/g, '').trim()
        return `- ${text}\n`
      }) + '\n'
    )
    // Paragraphs → double newline between them
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<p>([\s\S]*?)<\/p>/gi, '$1')
    // Strip remaining tags
    .replace(/<[^>]+>/g, '')
    // Unescape HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    // Collapse 3+ newlines to 2
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return md
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function unescapeHtml(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

/** Convert inline markdown (bold, italic, code, etc.) to HTML */
function inlineToHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
}
