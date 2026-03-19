import { useEffect, useRef, useState, useCallback } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import { Editor } from './Editor'
import type { NoteSection } from '../../types'
import { nanoid } from 'nanoid'
import {
  Pin, Archive, Trash2, Copy, Eye, Edit3,
  Plus, X, Check, Pencil, ExternalLink
} from 'lucide-react'
import { format } from 'date-fns'
import { ConfirmModal } from '../ConfirmModal'

// ---------------------------------------------------------------------------
// Confirm modal state type
// ---------------------------------------------------------------------------
interface ModalState {
  title: string
  message: string
  confirmLabel: string
  danger: boolean
  onConfirm: () => void
}

// ---------------------------------------------------------------------------
// NoteEditor
// ---------------------------------------------------------------------------
export function NoteEditor() {
  const note = useNotesStore((s) => s.notes.find((n) => n.id === s.activeNoteId) ?? null)
  const updateNote = useNotesStore((s) => s.updateNote)
  const deleteNote = useNotesStore((s) => s.deleteNote)
  const archiveNote = useNotesStore((s) => s.archiveNote)

  // Active section by id (not index — stable across reorders)
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)

  // Raw (markdown source) mode buffer
  const [rawContent, setRawContent] = useState('')

  // Local title draft — decoupled from store to prevent cursor jump
  const [titleDraft, setTitleDraft] = useState(note?.title ?? '')
  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Raw mode debounce ref (for sorting: save to store while typing)
  const rawDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Per-section undo/redo stacks for raw mode
  const undoStackMap = useRef<Map<string, string[]>>(new Map())
  const redoStackMap = useRef<Map<string, string[]>>(new Map())
  const lastUndoPushRef = useRef<Map<string, number>>(new Map())

  // Tab rename state
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameRef = useRef<HTMLInputElement>(null)

  // Confirm modal
  const [modal, setModal] = useState<ModalState | null>(null)

  // Drag and drop state
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null)
  const [dragOverSectionId, setDragOverSectionId] = useState<string | null>(null)

  const titleRef = useRef<HTMLInputElement>(null)

  // ── Derived state ──────────────────────────────────────────────────────────
  const activeSection: NoteSection | undefined = note?.sections.find(
    (s) => s.id === activeSectionId,
  ) ?? note?.sections[0]

  const rawMode = activeSection?.isRawMode ?? false

  // ── Reset when the active note changes ─────────────────────────────────────
  useEffect(() => {
    if (!note) return
    const firstId = note.sections[0]?.id ?? null
    setActiveSectionId(firstId)
    setRawContent(note.sections[0]?.content ?? '')
    setTitleDraft(note.title)
    setRenamingId(null)
  }, [note?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-focus title field when new note is created ───────────────────────
  useEffect(() => {
    const newlyCreatedNoteId = useNotesStore.getState().newlyCreatedNoteId
    const currentNoteId = note?.id

    if (currentNoteId === newlyCreatedNoteId) {
      setTimeout(() => {
        const store = useNotesStore.getState()
        const { newlyCreatedNoteId: updatedNewlyCreatedNoteId } = store

        if (updatedNewlyCreatedNoteId && updatedNewlyCreatedNoteId === currentNoteId) {
          try {
            if (titleRef.current && document.activeElement !== titleRef.current) {
              titleRef.current.focus()
              titleRef.current.select()
              store.setNewlyCreatedNoteId(null)
            }
          } catch (error) {
            console.error('Failed to focus title element:', error)
          }
        }
      }, 0)
    }
  }, [note?.id])

  // ── Sync raw buffer with store updates (external changes) ──────────────────
  useEffect(() => {
    if (activeSection && activeSection.content !== rawContent) {
      setRawContent(activeSection.content)
    }
  }, [activeSection?.content]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep a ref to note so handlers always see the latest value
  const noteRef = useRef(note)
  useEffect(() => { noteRef.current = note })

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingId) {
      setTimeout(() => {
        renameRef.current?.focus()
        renameRef.current?.select()
      }, 0)
    }
  }, [renamingId])

  // Stable ref for activeSectionId (for use inside event handlers)
  const activeSectionIdRef = useRef(activeSectionId)
  useEffect(() => { activeSectionIdRef.current = activeSectionId }, [activeSectionId])

  // ── Auto-focus title on new note ───────────────────────────────────────────
  useEffect(() => {
    if (note && (note.title === '' || note.title === 'Untitled') && note.sections.length === 1 && note.sections[0].content === '') {
      // Use requestAnimationFrame to ensure focus is set after the render/mount transitions
      requestAnimationFrame(() => {
        titleRef.current?.focus()
        titleRef.current?.select()
      })
    }
  }, [note?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Undo/Redo logic ────────────────────────────────────────────────────────
  const pushToUndoStack = useCallback((sectionId: string, prevContent: string) => {
    const now = Date.now()
    const lastTime = lastUndoPushRef.current.get(sectionId) ?? 0
    if (now - lastTime > 500) {
      const stack = undoStackMap.current.get(sectionId) ?? []
      undoStackMap.current.set(sectionId, [...stack, prevContent].slice(-100))
      lastUndoPushRef.current.set(sectionId, now)
      redoStackMap.current.delete(sectionId)
    }
  }, [])

  const openDeleteNoteModal = useCallback(() => {
    if (!note) return
    setModal({
      title: 'Delete note',
      message: `"${note.title || 'Untitled'}" will be permanently deleted.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => { setModal(null); deleteNote(note.id) },
    })
  }, [note, deleteNote])

  // ── Delete key on the note (only when editor is NOT focused) ──────────────
  useEffect(() => {
    if (!note) return
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isEditing =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      if (e.key === 'Delete' && !isEditing) {
        e.preventDefault()
        openDeleteNoteModal()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [note, openDeleteNoteModal])

  // ── Ctrl+T / Ctrl+W via custom events ────────────────────────────────────
  useEffect(() => {
    const handleAddTab = () => {
      if (!noteRef.current) return
      const newSection: NoteSection = { id: nanoid(6), name: 'New', content: '', isRawMode: true }
      const sections = [...noteRef.current.sections, newSection]
      updateNote(noteRef.current.id, { sections })
      setRawContent('')
      setActiveSectionId(newSection.id)
      setRenamingId(newSection.id)
      setRenameValue('New')
    }
    const handleCloseTab = () => {
      const n = noteRef.current
      if (!n || n.sections.length <= 1) return
      const sectionId = activeSectionIdRef.current
      if (!sectionId) return
      const sectionName = n.sections.find((s) => s.id === sectionId)?.name ?? 'this'
      setModal({
        title: 'Delete section',
        message: `Delete the "${sectionName}" section? Its content will be lost.`,
        confirmLabel: 'Delete',
        danger: true,
        onConfirm: () => {
          setModal(null)
          const sections = noteRef.current!.sections.filter((s) => s.id !== sectionId)
          updateNote(noteRef.current!.id, { sections })
          setActiveSectionId(sections[0]?.id ?? null)
          setRawContent(sections[0]?.content ?? '')
        },
      })
    }
    window.addEventListener('noteflow:add-tab', handleAddTab)
    window.addEventListener('noteflow:close-tab', handleCloseTab)
    return () => {
      window.removeEventListener('noteflow:add-tab', handleAddTab)
      window.removeEventListener('noteflow:close-tab', handleCloseTab)
    }
  }, [updateNote])

  // ── Early exit ─────────────────────────────────────────────────────────────
  if (!note) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-muted gap-3">
        <div className="text-4xl opacity-20 font-mono">_</div>
        <p className="text-sm font-mono">No note selected</p>
        <p className="text-xs opacity-50 font-mono">Ctrl+N to create one</p>
      </div>
    )
  }

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setTitleDraft(val)
    if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current)
    titleDebounceRef.current = setTimeout(() => {
      updateNote(note.id, { title: val })
    }, 300)
  }

  const handleTitleBlur = () => {
    if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current)
    updateNote(note.id, { title: titleDraft })
  }

  const handleSectionContentChange = (content: string) => {
    if (!activeSection) return
    if (activeSection.content === content) return
    updateNote(note.id, {
      sections: note.sections.map((s) =>
        s.id === activeSection.id ? { ...s, content } : s,
      ),
    })
  }

  const handleCopyAllText = () => {
    const text = note.sections.map((s) => s.content).join('\n\n')
    navigator.clipboard.writeText(text)
  }

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedSectionId(id)
    e.dataTransfer.effectAllowed = 'move'
    // Set a transparent ghost image or just let the browser handle it
  }

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    if (draggedSectionId === id) return
    setDragOverSectionId(id)
  }

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    if (!draggedSectionId || draggedSectionId === targetId) {
      setDraggedSectionId(null)
      setDragOverSectionId(null)
      return
    }

    const sections = [...note.sections]
    const draggedIdx = sections.findIndex(s => s.id === draggedSectionId)
    const targetIdx = sections.findIndex(s => s.id === targetId)

    if (draggedIdx !== -1 && targetIdx !== -1) {
      const [moved] = sections.splice(draggedIdx, 1)
      sections.splice(targetIdx, 0, moved)
      updateNote(note.id, { sections })
    }

    setDraggedSectionId(null)
    setDragOverSectionId(null)
  }

  const handleDragEnd = () => {
    setDraggedSectionId(null)
    setDragOverSectionId(null)
  }

  const handleRawToggle = () => {
    if (!activeSection) return
    const newRawMode = !rawMode

    if (newRawMode) {
      setRawContent(activeSection.content)
      updateNote(note.id, {
        sections: note.sections.map((s) =>
          s.id === activeSection.id ? { ...s, isRawMode: true } : s,
        ),
      })
    } else {
      if (rawDebounceRef.current) clearTimeout(rawDebounceRef.current)
      updateNote(note.id, {
        sections: note.sections.map((s) =>
          s.id === activeSection.id ? { ...s, content: rawContent, isRawMode: false } : s,
        ),
      })
    }
  }

  const handleSwitchSection = (sectionId: string) => {
    if (sectionId === activeSectionId) return

    if (rawMode && activeSection) {
      if (rawDebounceRef.current) clearTimeout(rawDebounceRef.current)
      updateNote(note.id, {
        sections: note.sections.map((s) =>
          s.id === activeSection.id ? { ...s, content: rawContent } : s,
        ),
      })
    }

    const newContent = note.sections.find((s) => s.id === sectionId)?.content ?? ''
    setRawContent(newContent)
    setActiveSectionId(sectionId)
  }

  const handleAddSection = () => {
    const newSection: NoteSection = { id: nanoid(6), name: 'New', content: '', isRawMode: true }
    const sections = [...note.sections, newSection]
    updateNote(note.id, { sections })
    setRawContent('')
    setActiveSectionId(newSection.id)
    setRenamingId(newSection.id)
    setRenameValue('New')
  }

  const handleDeleteSection = (sectionId: string) => {
    if (note.sections.length <= 1) return
    const sectionName = note.sections.find((s) => s.id === sectionId)?.name ?? 'this'
    setModal({
      title: 'Delete section',
      message: `Delete the "${sectionName}" section? Its content will be lost.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => {
        setModal(null)
        const sections = noteRef.current!.sections.filter((s) => s.id !== sectionId)
        updateNote(noteRef.current!.id, { sections })
        if (activeSectionId === sectionId) {
          setActiveSectionId(sections[0]?.id ?? null)
          setRawContent(sections[0]?.content ?? '')
        }
      },
    })
  }

  const handleStartRename = (section: NoteSection) => {
    setRenamingId(section.id)
    setRenameValue(section.name)
  }

  const handleCommitRename = () => {
    if (!renamingId) return
    const trimmed = renameValue.trim()
    if (trimmed) {
      updateNote(note.id, {
        sections: note.sections.map((s) =>
          s.id === renamingId ? { ...s, name: trimmed } : s,
        ),
      })
    }
    setRenamingId(null)
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleCommitRename() }
    if (e.key === 'Escape') { setRenamingId(null) }
  }

  const handleRawChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (activeSection) pushToUndoStack(activeSection.id, rawContent)
    const val = e.target.value
    setRawContent(val)
    if (rawDebounceRef.current) clearTimeout(rawDebounceRef.current)
    rawDebounceRef.current = setTimeout(() => {
      if (activeSection && noteRef.current) {
        updateNote(noteRef.current.id, {
          sections: noteRef.current.sections.map((s) =>
            s.id === activeSection.id ? { ...s, content: val } : s,
          ),
        })
      }
    }, 600)
  }

  const handleRawKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const sectionId = activeSection?.id
    if (!sectionId) return

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault()
      const stack = undoStackMap.current.get(sectionId) ?? []
      if (stack.length > 0) {
        const prev = stack[stack.length - 1]
        undoStackMap.current.set(sectionId, stack.slice(0, -1))
        const redoStack = redoStackMap.current.get(sectionId) ?? []
        redoStackMap.current.set(sectionId, [...redoStack, rawContent])
        setRawContent(prev)
      }
      return
    }

    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
      e.preventDefault()
      const redoStack = redoStackMap.current.get(sectionId) ?? []
      if (redoStack.length > 0) {
        const next = redoStack[redoStack.length - 1]
        redoStackMap.current.set(sectionId, redoStack.slice(0, -1))
        const undoStack = undoStackMap.current.get(sectionId) ?? []
        undoStackMap.current.set(sectionId, [...undoStack, rawContent])
        setRawContent(next)
      }
      return
    }
  }

  const handleRawBlur = () => {
    if (rawDebounceRef.current) clearTimeout(rawDebounceRef.current)
    if (activeSection && activeSection.content !== rawContent) {
      updateNote(note.id, {
        sections: note.sections.map((s) =>
          s.id === activeSection.id ? { ...s, content: rawContent } : s,
        ),
      })
    }
  }

  return (
    <>
      {modal && (
        <ConfirmModal
          title={modal.title}
          message={modal.message}
          confirmLabel={modal.confirmLabel}
          danger={modal.danger}
          onConfirm={modal.onConfirm}
          onCancel={() => setModal(null)}
        />
      )}

      <div className="flex flex-col h-full" onKeyDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1 px-3 pt-3 pb-2 border-b border-border min-h-0 flex-shrink-0">
          <div className="flex items-center gap-1.5 flex-1 overflow-x-auto min-w-0 pr-1">
            {note.sections.map((section) => {
              const isActive = section.id === (activeSection?.id)
              const isRenaming = renamingId === section.id
              return (
                <div
                  key={section.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, section.id)}
                  onDragOver={(e) => handleDragOver(e, section.id)}
                  onDrop={(e) => handleDrop(e, section.id)}
                  onDragEnd={handleDragEnd}
                  onDragLeave={() => setDragOverSectionId(null)}
                  className={`group flex items-center gap-1 flex-shrink-0 rounded px-0.5 transition-all duration-200 cursor-grab active:cursor-grabbing
                     ${isActive
                      ? 'tab-active-bg border'
                      : 'border border-border/40 hover:border-border/70'
                    }
                    ${draggedSectionId === section.id ? 'opacity-30' : 'opacity-100'}
                    ${dragOverSectionId === section.id ? 'border-l-2 tab-active-border-l pl-1' : ''}
                  `}
                >
                  {isRenaming ? (
                    // Inline rename input
                    <div className="flex items-center gap-0.5 px-1.5 py-1">
                      <input
                        ref={renameRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={handleRenameKeyDown}
                        onBlur={handleCommitRename}
                        className="w-20 bg-surface-0 border border-yellow-400/40 rounded px-1
                                   text-xs font-mono text-text outline-none tab-active-caret"
                      />
                      <button
                        onMouseDown={(e) => { e.preventDefault(); handleCommitRename() }}
                        className="tab-active-text p-0.5 rounded"
                      >
                        <Check size={12} />
                      </button>
                    </div>
                  ) : (
                    // Normal tab
                    <button
                      onClick={() => handleSwitchSection(section.id)}
                      onDoubleClick={() => handleStartRename(section)}
                      className={`px-2 py-0.5 text-xs font-mono transition-colors
                        ${isActive ? 'tab-active-text' : 'text-text-muted'}`}
                    >
                      {section.name}
                    </button>
                  )}

                  {!isRenaming && (
                    <div className={`flex items-center gap-0.5 pr-1
                      ${isActive ? 'visible' : 'invisible group-hover:visible'}`}
                    >
                      <button
                        onClick={() => handleStartRename(section)}
                        title="Rename section"
                        className="p-0.5 rounded text-text-muted/80 hover:text-text transition-colors"
                      >
                        <Pencil size={12} />
                      </button>
                      {note.sections.length > 1 && (
                        <button
                          onClick={() => handleDeleteSection(section.id)}
                          title="Delete section (Ctrl+W)"
                          className="p-0.5 rounded text-text-muted/80 hover:text-red-400 transition-colors"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            <button
              onClick={handleAddSection}
              title="Add section (Ctrl+T)"
              className="flex items-center justify-center w-6 h-6 rounded flex-shrink-0
                         text-text-muted/60 hover:text-text-muted hover:bg-surface-3
                         border border-transparent hover:border-border transition-colors"
            >
              <Plus size={13} />
            </button>
          </div>

          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              onClick={handleRawToggle}
              title={rawMode ? 'Editor mode (Markdown view)' : 'Raw markdown mode'}
              className={`p-1.5 rounded text-xs transition-colors
                ${rawMode
                  ? 'text-accent bg-accent/10 border border-accent/20'
                  : 'text-text-muted hover:text-text hover:bg-surface-3 border border-transparent'
                }`}
            >
              {rawMode ? <Edit3 size={13} /> : <Eye size={13} />}
            </button>
            <button
              onClick={handleCopyAllText}
              title="Copy note text to clipboard"
              className="p-1.5 rounded text-xs text-text-muted hover:text-text hover:bg-surface-3 transition-colors"
            >
              <Copy size={13} />
            </button>
            <button
              onClick={() => {
                if (window.noteflow?.openSticky && activeSection?.id) {
                  window.noteflow.openSticky(note.id, activeSection.id)
                }
              }}
              title="Pop out section as Sticky Note"
              className="p-1.5 rounded text-xs text-text-muted hover:text-text hover:bg-surface-3 transition-colors"
            >
              <ExternalLink size={13} />
            </button>
            <button
              onClick={() => updateNote(note.id, { pinned: !note.pinned })}
              title={note.pinned ? 'Unpin note' : 'Pin note'}
              className={`p-1.5 rounded text-xs transition-colors
                ${note.pinned ? 'text-yellow-400 bg-yellow-400/10' : 'text-text-muted hover:text-text hover:bg-surface-3'}`}
            >
              <Pin size={13} />
            </button>
            <button
              onClick={() => archiveNote(note.id)}
              title={note.archived ? 'Unarchive note' : 'Archive note'}
              className="p-1.5 rounded text-xs text-text-muted hover:text-text hover:bg-surface-3 transition-colors"
            >
              <Archive size={13} />
            </button>
            <button
              onClick={openDeleteNoteModal}
              title="Delete note (Del)"
              className="p-1.5 rounded text-xs text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        <div className="px-4 pt-3 pb-1 flex-shrink-0">
          <input
            ref={titleRef}
            type="text"
            value={titleDraft}
            onChange={handleTitleChange}
            onBlur={handleTitleBlur}
            placeholder="Untitled"
            className="w-full bg-transparent text-xl font-bold font-mono text-text
                       placeholder-text-muted/30 border-none outline-none caret-accent"
          />
        </div>

        {note.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 px-4 pb-2 flex-shrink-0">
            {note.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs font-mono text-accent/70 bg-accent/5 border border-accent/20 px-1.5 py-0.5 rounded"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        <div className="px-4 pb-2 flex-shrink-0">
          <span className="text-xs font-mono text-text-muted/50">
            {format(new Date(note.updated), 'MMM d, yyyy · HH:mm')}
          </span>
        </div>

        <div className="flex-1 overflow-hidden">
          {rawMode ? (
            <textarea
              value={rawContent}
              onChange={handleRawChange}
              onBlur={handleRawBlur}
              onKeyDown={handleRawKeyDown}
              className="w-full h-full p-4 bg-transparent text-sm font-mono text-text
                         border-none outline-none resize-none caret-accent leading-relaxed"
              spellCheck={false}
            />
          ) : (
            <Editor
              key={`${note.id}-${activeSection?.id ?? 'none'}`}
              content={activeSection?.content ?? ''}
              onChange={handleSectionContentChange}
              placeholder={`${activeSection?.name ?? 'Section'} — start writing...`}
            />
          )}
        </div>
      </div>
    </>
  )
}
