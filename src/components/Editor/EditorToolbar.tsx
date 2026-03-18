import type { Editor } from '@tiptap/react'
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Link,
  Undo2,
  Redo2,
} from 'lucide-react'

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
  const buttons: (ToolbarButton | 'sep')[] = [
    {
      icon: <Heading1 size={14} />,
      action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      isActive: editor.isActive('heading', { level: 1 }),
      title: 'Heading 1',
    },
    {
      icon: <Heading2 size={14} />,
      action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      isActive: editor.isActive('heading', { level: 2 }),
      title: 'Heading 2',
    },
    {
      icon: <Heading3 size={14} />,
      action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      isActive: editor.isActive('heading', { level: 3 }),
      title: 'Heading 3',
    },
    'sep',
    {
      icon: <Bold size={14} />,
      action: () => editor.chain().focus().toggleBold().run(),
      isActive: editor.isActive('bold'),
      title: 'Bold (Ctrl+B)',
    },
    {
      icon: <Italic size={14} />,
      action: () => editor.chain().focus().toggleItalic().run(),
      isActive: editor.isActive('italic'),
      title: 'Italic (Ctrl+I)',
    },
    {
      icon: <Underline size={14} />,
      action: () => editor.chain().focus().toggleUnderline().run(),
      isActive: editor.isActive('underline'),
      title: 'Underline (Ctrl+U)',
    },
    {
      icon: <Strikethrough size={14} />,
      action: () => editor.chain().focus().toggleStrike().run(),
      isActive: editor.isActive('strike'),
      title: 'Strikethrough',
    },
    {
      icon: <Code size={14} />,
      action: () => editor.chain().focus().toggleCode().run(),
      isActive: editor.isActive('code'),
      title: 'Inline code (Ctrl+E)',
    },
    {
      icon: <Code2 size={14} />,
      action: () => editor.chain().focus().toggleCodeBlock().run(),
      isActive: editor.isActive('codeBlock'),
      title: 'Code block (Ctrl+Shift+`)',
    },
    'sep',
    {
      icon: <List size={14} />,
      action: () => editor.chain().focus().toggleBulletList().run(),
      isActive: editor.isActive('bulletList'),
      title: 'Bullet list',
    },
    {
      icon: <ListOrdered size={14} />,
      action: () => editor.chain().focus().toggleOrderedList().run(),
      isActive: editor.isActive('orderedList'),
      title: 'Ordered list',
    },
    {
      icon: <CheckSquare size={14} />,
      action: () => editor.chain().focus().toggleTaskList().run(),
      isActive: editor.isActive('taskList'),
      title: 'Task list',
    },
    'sep',
    {
      icon: <Link size={14} />,
      action: () => {
        const url = window.prompt('URL:')
        if (url) editor.chain().focus().setLink({ href: url }).run()
      },
      isActive: editor.isActive('link'),
      title: 'Insert link (Ctrl+K)',
    },
    'sep',
    {
      icon: <Undo2 size={14} />,
      action: () => editor.chain().focus().undo().run(),
      title: 'Undo (Ctrl+Z)',
    },
    {
      icon: <Redo2 size={14} />,
      action: () => editor.chain().focus().redo().run(),
      title: 'Redo (Ctrl+Y)',
    },
  ]

  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border bg-surface-1 flex-wrap">
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
                ? 'bg-accent/20 text-accent'
                : 'text-text-muted hover:text-text hover:bg-surface-3'
              }`}
          >
            {btn.icon}
          </button>
        )
      })}
    </div>
  )
}
