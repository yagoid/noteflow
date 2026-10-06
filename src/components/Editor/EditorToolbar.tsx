import { useState, useRef } from 'react'
import type { Editor } from '@tiptap/react'
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Highlighter,
  Code,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Link,
  Undo2,
  Redo2,
  Table as TableIcon,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Plus,
  Minus,
  Trash2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  SquareKanban,
} from 'lucide-react'
import { setColumnAlign, getColumnAlign } from './tableUtils'
import { convertTaskListToBoard, insertDefaultBoard, kanbanDefaultColumns, topLevelTaskList } from './kanbanCommands'
import { useT } from '../../i18n/useT'

interface ToolbarProps {
  editor: Editor
}

interface ToolbarButton {
  icon: React.ReactNode
  action: () => void
  isActive?: boolean
  title: string
}

export function EditorToolbar({ editor }: ToolbarProps) {
  const t = useT()
  const [linkInputOpen, setLinkInputOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const linkInputRef = useRef<HTMLInputElement>(null)

  const openLinkInput = () => {
    const existing = editor.getAttributes('link').href ?? ''
    setLinkUrl(existing)
    setLinkInputOpen(true)
    setTimeout(() => { linkInputRef.current?.focus(); linkInputRef.current?.select() }, 0)
  }

  const commitLink = () => {
    const url = linkUrl.trim()
    if (url) editor.chain().focus().setLink({ href: url }).run()
    else editor.chain().focus().unsetLink().run()
    setLinkInputOpen(false)
    setLinkUrl('')
  }

  const cancelLink = () => {
    setLinkInputOpen(false)
    setLinkUrl('')
    editor.chain().focus().run()
  }

  // Inside a top-level task list the kanban button converts it (as the `/` menu does).
  const inTaskList = topLevelTaskList(editor) !== null

  const buttons: (ToolbarButton | 'sep')[] = [
    {
      icon: <Heading1 size={14} />,
      action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      isActive: editor.isActive('heading', { level: 1 }),
      title: t.editor.toolbar.heading1,
    },
    {
      icon: <Heading2 size={14} />,
      action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      isActive: editor.isActive('heading', { level: 2 }),
      title: t.editor.toolbar.heading2,
    },
    {
      icon: <Heading3 size={14} />,
      action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      isActive: editor.isActive('heading', { level: 3 }),
      title: t.editor.toolbar.heading3,
    },
    'sep',
    {
      icon: <Bold size={14} />,
      action: () => editor.chain().focus().toggleBold().run(),
      isActive: editor.isActive('bold'),
      title: t.editor.toolbar.bold,
    },
    {
      icon: <Italic size={14} />,
      action: () => editor.chain().focus().toggleItalic().run(),
      isActive: editor.isActive('italic'),
      title: t.editor.toolbar.italic,
    },
    {
      icon: <Underline size={14} />,
      action: () => editor.chain().focus().toggleUnderline().run(),
      isActive: editor.isActive('underline'),
      title: t.editor.toolbar.underline,
    },
    {
      icon: <Strikethrough size={14} />,
      action: () => editor.chain().focus().toggleStrike().run(),
      isActive: editor.isActive('strike'),
      title: t.editor.toolbar.strikethrough,
    },
    {
      icon: <Highlighter size={14} />,
      action: () => editor.chain().focus().toggleHighlight().run(),
      isActive: editor.isActive('highlight'),
      title: t.editor.toolbar.highlight,
    },
    {
      icon: <Code size={14} />,
      action: () => editor.chain().focus().toggleCode().run(),
      isActive: editor.isActive('code'),
      title: t.editor.toolbar.inlineCode,
    },
    {
      icon: <Code2 size={14} />,
      action: () => editor.chain().focus().toggleCodeBlock().run(),
      isActive: editor.isActive('codeBlock'),
      title: t.editor.toolbar.codeBlock,
    },
    'sep',
    {
      icon: <List size={14} />,
      action: () => editor.chain().focus().toggleBulletList().run(),
      isActive: editor.isActive('bulletList'),
      title: t.editor.toolbar.bulletList,
    },
    {
      icon: <ListOrdered size={14} />,
      action: () => editor.chain().focus().toggleOrderedList().run(),
      isActive: editor.isActive('orderedList'),
      title: t.editor.toolbar.orderedList,
    },
    {
      icon: <CheckSquare size={14} />,
      action: () => editor.chain().focus().toggleTaskList().run(),
      isActive: editor.isActive('taskList'),
      title: t.editor.toolbar.taskList,
    },
    {
      icon: <Quote size={14} />,
      action: () => editor.chain().focus().toggleBlockquote().run(),
      isActive: editor.isActive('blockquote'),
      title: t.editor.toolbar.blockquote,
    },
    'sep',
    {
      icon: <Link size={14} />,
      action: () => {
        if (editor.isActive('link')) editor.chain().focus().unsetLink().run()
        else openLinkInput()
      },
      isActive: editor.isActive('link'),
      title: t.editor.toolbar.insertLink,
    },
    {
      icon: <TableIcon size={14} />,
      action: () => {
        if (editor.isActive('table')) {
          editor.chain().focus().deleteTable().run()
        } else {
          editor.chain().focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
      },
      isActive: editor.isActive('table'),
      title: editor.isActive('table') ? t.editor.toolbar.deleteTable : t.editor.toolbar.insertTable,
    },
    {
      icon: <SquareKanban size={14} />,
      action: () => {
        if (inTaskList) convertTaskListToBoard(editor, kanbanDefaultColumns(t))
        else insertDefaultBoard(editor, kanbanDefaultColumns(t))
      },
      title: inTaskList ? t.editor.slash.convertToKanban : t.editor.toolbar.insertKanban,
    },
    'sep',
    {
      icon: <Undo2 size={14} />,
      action: () => editor.chain().focus().undo().run(),
      title: t.editor.toolbar.undo,
    },
    {
      icon: <Redo2 size={14} />,
      action: () => editor.chain().focus().redo().run(),
      title: t.editor.toolbar.redo,
    },
  ]

  return (
    <div className="border-b border-border bg-surface-1">
      <div className="flex items-center gap-0.5 px-3 py-1.5 flex-wrap">
        {buttons.map((btn, i) => {
          if (btn === 'sep') {
            return <div key={`sep-${i}`} className="w-px h-4 bg-border mx-1" />
          }
          return (
            <button
              key={btn.title}
              onClick={btn.action}
              title={btn.title}
              className={`p-1.5 rounded text-xs transition-colors font-mono
                ${btn.isActive
                  ? 'bg-surface-3 text-text'
                  : 'text-text-muted hover:text-text hover:bg-surface-3'
                }`}
            >
              {btn.icon}
            </button>
          )
        })}
      </div>

      {linkInputOpen && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-t border-border">
          <Link size={11} className="text-text-muted flex-shrink-0" />
          <input
            ref={linkInputRef}
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitLink() }
              if (e.key === 'Escape') cancelLink()
            }}
            placeholder="https://..."
            className="flex-1 bg-transparent text-xs font-mono text-text placeholder-text-muted/40 outline-none caret-text"
          />
          <button
            onMouseDown={(e) => { e.preventDefault(); commitLink() }}
            className="text-xs font-mono text-text/70 hover:text-text transition-colors px-1"
          >
            {t.editor.toolbar.set}
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); cancelLink() }}
            className="text-xs font-mono text-text-muted hover:text-text transition-colors"
          >
            ✕
          </button>
        </div>
      )}

      {editor.isActive('table') && (() => {
        // The header row must stay at row 0 — markdown tables require a header.
        // Block actions that would remove it or push a body row above it.
        const inHeader = editor.isActive('tableHeader')
        const align = getColumnAlign(editor)
        return (
        <div className="flex items-center gap-1 px-3 py-1.5 border-t border-border flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-text-muted/60 mr-1">{t.editor.table.label}</span>
          <TableOpButton
            title={inHeader ? t.editor.table.addRowAboveBlocked : t.editor.table.addRowAbove}
            disabled={inHeader}
            onClick={() => editor.chain().focus().addRowBefore().run()}
          >
            <Plus size={11} /> {t.editor.table.row} <ArrowUp size={11} />
          </TableOpButton>
          <TableOpButton title={t.editor.table.addRowBelow} onClick={() => editor.chain().focus().addRowAfter().run()}>
            <Plus size={11} /> {t.editor.table.row} <ArrowDown size={11} />
          </TableOpButton>
          <TableOpButton
            title={inHeader ? t.editor.table.deleteRowBlocked : t.editor.table.deleteRow}
            disabled={inHeader}
            onClick={() => editor.chain().focus().deleteRow().run()}
          >
            <Minus size={11} /> {t.editor.table.row}
          </TableOpButton>
          <div className="w-px h-4 bg-border mx-1" />
          <TableOpButton title={t.editor.table.addColLeft} onClick={() => editor.chain().focus().addColumnBefore().run()}>
            <Plus size={11} /> {t.editor.table.col} <ArrowLeft size={11} />
          </TableOpButton>
          <TableOpButton title={t.editor.table.addColRight} onClick={() => editor.chain().focus().addColumnAfter().run()}>
            <Plus size={11} /> {t.editor.table.col} <ArrowRight size={11} />
          </TableOpButton>
          <TableOpButton title={t.editor.table.deleteCol} onClick={() => editor.chain().focus().deleteColumn().run()}>
            <Minus size={11} /> {t.editor.table.col}
          </TableOpButton>
          <div className="w-px h-4 bg-border mx-1" />
          <TableOpButton
            title={t.editor.table.alignLeft}
            isActive={align === 'left' || align === null}
            onClick={() => setColumnAlign(editor, 'left')}
          >
            <AlignLeft size={11} />
          </TableOpButton>
          <TableOpButton
            title={t.editor.table.alignCenter}
            isActive={align === 'center'}
            onClick={() => setColumnAlign(editor, 'center')}
          >
            <AlignCenter size={11} />
          </TableOpButton>
          <TableOpButton
            title={t.editor.table.alignRight}
            isActive={align === 'right'}
            onClick={() => setColumnAlign(editor, 'right')}
          >
            <AlignRight size={11} />
          </TableOpButton>
          <div className="w-px h-4 bg-border mx-1" />
          <TableOpButton title={t.editor.table.deleteWholeTable} onClick={() => editor.chain().focus().deleteTable().run()}>
            <Trash2 size={11} /> {t.editor.table.tableWord}
          </TableOpButton>
        </div>
        )
      })()}
    </div>
  )
}

interface TableOpButtonProps {
  title: string
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
  isActive?: boolean
}

function TableOpButton({ title, onClick, children, disabled, isActive }: TableOpButtonProps) {
  return (
    <button
      onMouseDown={(e) => {
        e.preventDefault()
        if (!disabled) onClick()
      }}
      title={title}
      disabled={disabled}
      className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-mono transition-colors
        ${disabled
          ? 'text-text-muted/30 cursor-not-allowed'
          : isActive
            ? 'bg-surface-3 text-text'
            : 'text-text-muted hover:text-text hover:bg-surface-3'
        }`}
    >
      {children}
    </button>
  )
}
