import { useEditor, EditorContent } from '@tiptap/react'
import type { Editor as TiptapEditor } from '@tiptap/react'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Bold from '@tiptap/extension-bold'
import Italic from '@tiptap/extension-italic'
import Underline from '@tiptap/extension-underline'
import Strike from '@tiptap/extension-strike'
import Code from '@tiptap/extension-code'
import { CodeBlockWithCopy } from './CodeBlockWithCopy'
import Heading from '@tiptap/extension-heading'
import BulletList from '@tiptap/extension-bullet-list'
import OrderedList from '@tiptap/extension-ordered-list'
import ListItem from '@tiptap/extension-list-item'
import TaskList from '@tiptap/extension-task-list'
import { DeadlineTaskItem } from './DeadlineTaskItem'
import Link from '@tiptap/extension-link'
import { ResizableImage } from './ResizableImage'
import HardBreak from '@tiptap/extension-hard-break'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import History from '@tiptap/extension-history'
import Placeholder from '@tiptap/extension-placeholder'
import { common, createLowlight } from 'lowlight'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { EditorToolbar } from './EditorToolbar'
import { SearchHighlight } from './SearchHighlightExtension'
import { useEditorSettingsStore } from '../../stores/editorSettingsStore'

const lowlight = createLowlight(common)

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

interface EditorProps {
  content: string
  onChange: (markdown: string) => void
  placeholder?: string
  readOnly?: boolean
  hideToolbar?: boolean
  fontSize?: number
}

export interface EditorHandle {
  editor: TiptapEditor | null
}

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor({
  content,
  onChange,
  placeholder = 'Start typing...',
  readOnly = false,
  hideToolbar = false,
  fontSize,
}, ref) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { fontFamily } = useEditorSettingsStore()

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
      CodeBlockWithCopy.configure({ lowlight }),
      Heading.configure({ levels: [1, 2, 3] }),
      BulletList,
      OrderedList,
      ListItem,
      TaskList,
      DeadlineTaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false, autolink: false }),
      ResizableImage.configure({ inline: true, allowBase64: true }),
      HorizontalRule,
      HardBreak,
      History,
      Placeholder.configure({ placeholder }),
      SearchHighlight,
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

  useImperativeHandle(ref, () => ({ editor }), [editor])

  // Open links in external browser on click
  useEffect(() => {
    if (!editor) return
    const handler = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('a')
      if (!target) return
      e.preventDefault()
      const href = target.getAttribute('href')
      if (href) window.noteflow.openUrl(href)
    }
    editor.view.dom.addEventListener('click', handler)
    return () => editor.view.dom.removeEventListener('click', handler)
  }, [editor])

  // Sync external content changes (e.g. sync from another window).
  // IMPORTANT: never reset content while the editor is focused — the debounced
  // save creates a window where the store lags behind the editor state, causing
  // a false mismatch that would call setContent mid-typing and jump the cursor.
  useEffect(() => {
    if (!editor) return
    if (editor.isFocused) return
    const currentMd = htmlToMarkdown(editor.getHTML()).trim()
    const incomingMd = content.trim()
    if (currentMd !== incomingMd) {
      editor.commands.setContent(htmlFromMarkdown(content), false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content])

  const insertImageFiles = useCallback(async (files: File[]) => {
    if (!editor) return
    for (const file of files.filter(f => f.type.startsWith('image/'))) {
      const src = await fileToBase64(file)
      editor.chain().focus().setImage({ src, alt: file.name }).run()
    }
  }, [editor])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!editor) return
      // Ctrl+Shift+B → code block
      if (e.ctrlKey && e.shiftKey && e.key === 'B') {
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
    <div
      className="flex flex-col h-full"
      onKeyDown={handleKeyDown}
      onPaste={(e: React.ClipboardEvent) => {
        const imageItems = Array.from(e.clipboardData.items).filter(i => i.type.startsWith('image/'))
        if (imageItems.length === 0) return
        e.preventDefault()
        insertImageFiles(imageItems.map(i => i.getAsFile()).filter(Boolean) as File[])
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e: React.DragEvent) => {
        const files = Array.from(e.dataTransfer.files)
        if (!files.some(f => f.type.startsWith('image/'))) return
        e.preventDefault()
        e.stopPropagation()
        insertImageFiles(files)
      }}
    >
      {!readOnly && !hideToolbar && <EditorToolbar editor={editor} />}
      <div
        className="flex-1 overflow-y-auto"
        style={{
          '--prose-font-size': fontSize ? `${fontSize}px` : undefined,
          '--prose-font-family': fontFamily === 'inter'
            ? "'Inter', sans-serif"
            : "'JetBrains Mono', 'Fira Code', monospace",
        } as React.CSSProperties}
      >
        <EditorContent
          editor={editor}
          className="h-full prose-editor"
        />
      </div>
    </div>
  )
})

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

  // Split into "blocks" on blank lines — use exactly \n\n so that multiple
  // consecutive blank lines produce empty blocks, preserving them as <p></p>.
  const rawBlocks = src.split(/\n\n/)
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

    // ── List block (supports nested/indented items) ───────────────────────────
    const firstMeaningfulLine = lines.find(l => l.trim())
    const isListBlock = !!firstMeaningfulLine && /^\s*(?:[-*+]|\d+\.)[ \t]/.test(firstMeaningfulLine)

    if (isListBlock) {
      htmlBlocks.push(mdListBlockToHtml(lines))
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

// ── htmlToMarkdown: DOM-based walker to preserve nested list structure ────────

function htmlToMarkdown(html: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html')
  let result = ''
  for (const child of doc.body.childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      result += blockElToMd(child as Element)
    }
  }
  return result.trim()
}

function blockElToMd(el: Element): string {
  const tag = el.tagName.toLowerCase()
  if (tag === 'p') return inlineElToMd(el) + '\n\n'
  if (tag === 'h1') return `# ${inlineElToMd(el)}\n\n`
  if (tag === 'h2') return `## ${inlineElToMd(el)}\n\n`
  if (tag === 'h3') return `### ${inlineElToMd(el)}\n\n`
  if (tag === 'hr') return `---\n\n`
  if (tag === 'pre') {
    const codeEl = el.querySelector('code')
    const lang = (codeEl?.className ?? '').replace('language-', '')
    const code = codeEl?.textContent ?? ''
    return `\`\`\`${lang}\n${code.trimEnd()}\n\`\`\`\n\n`
  }
  if (tag === 'ul' || tag === 'ol') return listElToMd(el, 0) + '\n'
  let out = ''
  for (const c of el.childNodes) {
    if (c.nodeType === Node.ELEMENT_NODE) out += blockElToMd(c as Element)
  }
  return out
}

function inlineElToMd(el: Element): string {
  let result = ''
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      // &nbsp; in HTML becomes \u00A0 in textContent — restore to regular space
      result += (child.textContent ?? '').replace(/\u00A0/g, ' ')
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const c = child as Element
      const tag = c.tagName.toLowerCase()
      if (tag === 'strong' || tag === 'b') result += `**${inlineElToMd(c)}**`
      else if (tag === 'em' || tag === 'i') result += `*${inlineElToMd(c)}*`
      else if (tag === 's') result += `~~${inlineElToMd(c)}~~`
      else if (tag === 'code') result += `\`${(c.textContent ?? '').replace(/\u00A0/g, ' ')}\``
      else if (tag === 'br') result += '\n'
      else if (tag === 'img') {
        const w = c.getAttribute('width')
        const suffix = w ? `{width=${w}}` : ''
        result += `![${c.getAttribute('alt') ?? ''}](${c.getAttribute('src') ?? ''})${suffix}`
      }
      else if (tag === 'a') result += `[${inlineElToMd(c)}](${c.getAttribute('href') ?? ''})`
      else result += inlineElToMd(c)
    }
  }
  return result
}

function listElToMd(listEl: Element, depth: number): string {
  const prefix = '  '.repeat(depth)
  const isTaskList = listEl.getAttribute('data-type') === 'taskList'
  const isOl = listEl.tagName.toLowerCase() === 'ol'
  let result = ''
  let olIndex = 1

  for (const li of listEl.children) {
    const isTaskItem = li.getAttribute('data-type') === 'taskItem'
    let text = ''
    const nestedListEls: Element[] = []

    for (const child of li.childNodes) {
      if (child.nodeType !== Node.ELEMENT_NODE) continue
      const c = child as Element
      const tag = c.tagName.toLowerCase()
      if (tag === 'p') {
        text += inlineElToMd(c)
      } else if (tag === 'div') {
        // TipTap may wrap task item content in a <div>
        for (const gc of c.childNodes) {
          if (gc.nodeType !== Node.ELEMENT_NODE) continue
          const gcEl = gc as Element
          const gcTag = gcEl.tagName.toLowerCase()
          if (gcTag === 'p') text += inlineElToMd(gcEl)
          else if (gcTag === 'ul' || gcTag === 'ol') nestedListEls.push(gcEl)
        }
      } else if (tag === 'ul' || tag === 'ol') {
        nestedListEls.push(c)
      }
      // <label> and <input> are intentionally skipped
    }

    if (isTaskItem || isTaskList) {
      const checked   = li.getAttribute('data-checked') === 'true'
      const due       = li.getAttribute('data-due')
      const alarm     = li.getAttribute('data-alarm')
      const dueAnn    = due   ? ` 📅${due}`   : ''
      const alarmAnn  = alarm ? ` ⏰${alarm}` : ''
      result += `${prefix}- [${checked ? 'x' : ' '}] ${text}${dueAnn}${alarmAnn}\n`
    } else if (isOl) {
      result += `${prefix}${olIndex++}. ${text}\n`
    } else {
      result += `${prefix}- ${text}\n`
    }

    for (const nested of nestedListEls) {
      result += listElToMd(nested, depth + 1)
    }
  }

  return result
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Convert inline markdown (bold, italic, code, links, etc.) to HTML */
function inlineToHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Preserve runs of 2+ spaces: ProseMirror collapses regular spaces when
    // parsing HTML, so we use &nbsp; to keep them intact.
    .replace(/ {2,}/g, (m) => '&nbsp;'.repeat(m.length))
    .replace(/!\[([^\]]*)\]\(([^)]+)\)(?:\{width=(\d+)\})?/g, (_, alt, src, w) =>
      w ? `<img alt="${alt}" src="${src}" width="${w}">` : `<img alt="${alt}" src="${src}">`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
}

// ── Nested markdown list parsing (htmlFromMarkdown helpers) ──────────────────

interface MdListItem {
  type: 'ul' | 'ol' | 'task'
  checked: boolean
  text: string
  due: string | null
  alarm: string | null
  children: MdListItem[]
}

function extractDeadlineAnnotations(raw: string): { text: string; due: string | null; alarm: string | null } {
  let text = raw
  let due: string | null = null
  let alarm: string | null = null
  const dueMatch = text.match(/📅(\d{4}-\d{2}-\d{2})/)
  if (dueMatch) { due = dueMatch[1]; text = text.replace(dueMatch[0], '').trim() }
  const alarmMatch = text.match(/⏰(\d{2}:\d{2})/)
  if (alarmMatch) { alarm = alarmMatch[1]; text = text.replace(alarmMatch[0], '').trim() }
  return { text, due, alarm }
}

function parseMdListItems(lines: string[]): MdListItem[] {
  const result: MdListItem[] = []
  const stack: { depth: number; node: MdListItem }[] = []

  for (const line of lines) {
    if (!line.trim()) continue

    const indentLen = line.match(/^(\s*)/)?.[1].length ?? 0
    const depth = Math.floor(indentLen / 2)

    const taskMatch = line.match(/^\s*- \[([ x])\] ?(.*)$/)
    const olMatch = line.match(/^\s*(\d+)\. (.*)$/)
    const ulMatch = line.match(/^\s*[-*+] (.*)$/)

    let item: MdListItem
    if (taskMatch) {
      const { text: cleanText, due, alarm } = extractDeadlineAnnotations(taskMatch[2])
      item = { type: 'task', checked: taskMatch[1] === 'x', text: cleanText, due, alarm, children: [] }
    } else if (olMatch) {
      item = { type: 'ol', checked: false, text: olMatch[2], due: null, alarm: null, children: [] }
    } else if (ulMatch) {
      item = { type: 'ul', checked: false, text: ulMatch[1], due: null, alarm: null, children: [] }
    } else {
      // Continuation line (soft/hard break inside list item) — append to last item
      if (stack.length > 0) {
        stack[stack.length - 1].node.text += '\n' + line.trim()
      }
      continue
    }

    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop()
    }

    if (stack.length === 0) {
      result.push(item)
    } else {
      stack[stack.length - 1].node.children.push(item)
    }

    stack.push({ depth, node: item })
  }

  return result
}

function renderMdListItems(items: MdListItem[]): string {
  if (items.length === 0) return ''

  const firstType = items[0].type
  const isTask = firstType === 'task'
  const isOl = firstType === 'ol'

  const innerHtml = items.map(item => {
    const childHtml = item.children.length > 0 ? renderMdListItems(item.children) : ''
    if (item.type === 'task') {
      const dueAttr   = item.due   ? ` data-due="${item.due}"`     : ''
      const alarmAttr = item.alarm ? ` data-alarm="${item.alarm}"` : ''
      return `<li data-checked="${item.checked}" data-type="taskItem"${dueAttr}${alarmAttr}><label><input type="checkbox"${item.checked ? ' checked' : ''}></label><p>${item.text.split('\n').map(inlineToHtml).join('<br>')}</p>${childHtml}</li>`
    }
    return `<li><p>${item.text.split('\n').map(inlineToHtml).join('<br>')}</p>${childHtml}</li>`
  }).join('')

  if (isTask) return `<ul data-type="taskList">${innerHtml}</ul>`
  if (isOl) return `<ol>${innerHtml}</ol>`
  return `<ul>${innerHtml}</ul>`
}

function mdListBlockToHtml(lines: string[]): string {
  return renderMdListItems(parseMdListItems(lines))
}
