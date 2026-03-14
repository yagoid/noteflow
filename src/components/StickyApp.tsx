import { useEffect, useState } from 'react'
import { useNotesStore } from '../stores/notesStore'
import { Editor } from './Editor/Editor'
import { X } from 'lucide-react'

// Custom TitleBar for the sticky window
function StickyTitleBar({ title }: { title: string }) {
  return (
    <div
      className="h-8 bg-surface-1 border-b border-border flex items-center justify-between px-2 cursor-default select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="text-xs font-mono text-text-muted truncate flex-1 pr-2">
        {title}
      </div>
      <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/*
        <button
          className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          onClick={onPopIn}
          title="Pop back in"
        >
          <ExternalLink size={12} className="rotate-180" />
        </button>
        */}
        <button
          className="p-1 rounded text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
          onClick={() => window.noteflow.close()}
          title="Close Sticky Note"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  )
}

export function StickyApp() {
  const [noteId, setNoteId] = useState<string | null>(null)
  const [sectionId, setSectionId] = useState<string | null>(null)
  const [rawContent, setRawContent] = useState('')
  const { loadNotes, isLoading, notes, updateNote } = useNotesStore()

  // Parse hash and load notes
  useEffect(() => {
    // Expected hash: #sticky?noteId=xxx&sectionId=yyy
    const hash = window.location.hash
    if (hash.startsWith('#sticky')) {
      const q = hash.split('?')[1]
      const params = new URLSearchParams(q)
      setNoteId(params.get('noteId'))
      setSectionId(params.get('sectionId'))
    }
    loadNotes()

    // Sync from other windows
    const currentWindowId = typeof window.noteflow?.windowId === 'function' ? window.noteflow.windowId() : null
    console.log('[Sticky] Window ID:', currentWindowId)

    if (!window.noteflow?.onNotesUpdated) {
      console.error('[Sticky] onNotesUpdated API missing!')
      return
    }

    const unbindUpdate = window.noteflow.onNotesUpdated((filePath, senderId) => {
      if (currentWindowId !== null && senderId === currentWindowId) return

      if (filePath) {
        useNotesStore.getState().syncNote(filePath)
      } else {
        loadNotes()
      }
    })

    return () => {
      unbindUpdate()
    }
  }, [loadNotes])

  const note = notes.find(n => n.id === noteId)
  const section = note?.sections.find(s => s.id === sectionId)

  // Sync local buffer when section changes or store updates
  useEffect(() => {
    if (section && section.content !== rawContent) {
      setRawContent(section.content)
    }
  }, [section?.id, section?.content]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || !noteId || !sectionId) {
    return (
      <div className="flex flex-col h-screen bg-surface-0">
        <StickyTitleBar title="Loading..." />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-xs font-mono text-text-muted animate-pulse">Loading sticky note...</div>
        </div>
      </div>
    )
  }

  if (!note || !section) {
    return (
      <div className="flex flex-col h-screen bg-surface-0">
        <StickyTitleBar title="Not Found" />
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
          <div className="text-sm font-mono text-red-400 mb-2">Note not found</div>
          <div className="text-xs font-mono text-text-muted">It may have been deleted.</div>
        </div>
      </div>
    )
  }

  const handleContentChange = (content: string) => {
    if (section.content === content) return
    updateNote(note.id, {
      sections: note.sections.map((s) =>
        s.id === section.id ? { ...s, content } : s,
      ),
    })
  }

  const handleRawChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const content = e.target.value
    setRawContent(content)
    if (section && section.content === content) return
    updateNote(note!.id, {
      sections: note!.sections.map((s) =>
        s.id === section!.id ? { ...s, content } : s,
      ),
    })
  }

  return (
    <div className="flex flex-col h-screen bg-surface-0 overflow-hidden border border-border">
      <StickyTitleBar title={section.name === 'New' || section.name === 'Main' ? note.title : `${note.title} - ${section.name}`} />
      <div className="flex-1 overflow-hidden" onKeyDown={(e) => e.stopPropagation()}>
        {section.isRawMode ? (
          <textarea
            value={rawContent}
            onChange={handleRawChange}
            className="w-full h-full p-3 bg-transparent text-xs font-mono text-text
                       border-none outline-none resize-none caret-accent leading-relaxed"
            spellCheck={false}
          />
        ) : (
          <div className="h-full overflow-y-auto p-2">
            <Editor
              key={`${note.id}-${section.id}`}
              content={section.content ?? ''}
              onChange={handleContentChange}
              placeholder="Start writing..."
              hideToolbar={true}
            />
          </div>
        )}
      </div>
    </div>
  )
}
