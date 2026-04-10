import { useEffect, useRef, useState, useCallback } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import { useEditorSettingsStore } from '../../stores/editorSettingsStore'
import { useSectionTagColorsStore } from '../../stores/sectionTagColorsStore'
import { Editor } from './Editor'
import type { GroupColor, NoteSection } from '../../types'
import { nanoid } from 'nanoid'
import {
  Pin, Trash2, Copy, Eye, Edit3,
  Plus, X, Check, Pencil, ExternalLink, Lock, RotateCcw,
} from 'lucide-react'
import { format } from 'date-fns'
import { ConfirmModal } from '../ConfirmModal'
import { EncryptionModal } from '../EncryptionModal'
import { getTagColor, normalizeTagColorKey, TAG_COLOR_VARS } from '../../lib/tagColors'

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

interface SectionUndoState {
  noteId: string
  sectionName: string
  previousSections: NoteSection[]
  previousActiveSectionId: string | null
}

interface NoteEditorProps {
  noteId?: string
}

// ---------------------------------------------------------------------------
// NoteEditor
// ---------------------------------------------------------------------------
export function NoteEditor({ noteId }: NoteEditorProps) {
  const globalActiveNoteId = useNotesStore((s) => s.activeNoteId)
  const resolvedNoteId = noteId ?? globalActiveNoteId
  const isPaneActive = Boolean(resolvedNoteId && globalActiveNoteId === resolvedNoteId)
  const note = useNotesStore((s) => {
    const targetId = noteId ?? s.activeNoteId
    return s.notes.find((n) => n.id === targetId) ?? null
  })
  const setActiveNote = useNotesStore((s) => s.setActiveNote)
  const updateNote = useNotesStore((s) => s.updateNote)
  const deleteNote = useNotesStore((s) => s.deleteNote)
  const unlockNote = useNotesStore((s) => s.unlockNote)
  const sessionPasswords = useNotesStore((s) => s.sessionPasswords)
  const sectionTagColors = useSectionTagColorsStore((s) => s.sectionTagColors)
  const setSectionTagColor = useSectionTagColorsStore((s) => s.setSectionTagColor)
  const clearSectionTagColor = useSectionTagColorsStore((s) => s.clearSectionTagColor)

  // Active section by id (not index — stable across reorders)
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)

  // Editor font size (from shared store)
  const { fontSize, changeFontSize, resetFontSize } = useEditorSettingsStore()

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

  // Unlock modal for encrypted notes
  const [showUnlockModal, setShowUnlockModal] = useState(false)

  // Drag and drop state
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null)
  const [dragOverSectionId, setDragOverSectionId] = useState<string | null>(null)
  const [sectionColorPickerId, setSectionColorPickerId] = useState<string | null>(null)
  const [sectionUndo, setSectionUndo] = useState<SectionUndoState | null>(null)

  const titleRef = useRef<HTMLInputElement>(null)
  const pendingSectionRef = useRef<string | null>(null)
  const rawTextareaRef = useRef<HTMLTextAreaElement>(null)
  const sectionUndoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Derived state ──────────────────────────────────────────────────────────
  const activeSection: NoteSection | undefined = note?.sections.find(
    (s) => s.id === activeSectionId,
  ) ?? note?.sections[0]

  const rawMode = activeSection?.isRawMode ?? false

  // ── Reset when the active note changes ─────────────────────────────────────
  useEffect(() => {
    if (!note) return
    const pending = pendingSectionRef.current
    const initialSection = useNotesStore.getState().pendingInitialSectionId
    const targetId =
      (pending && note.sections.find((s) => s.id === pending))
        ? pending
        : (initialSection && note.sections.find((s) => s.id === initialSection))
        ? initialSection
        : note.sections[0]?.id ?? null
    pendingSectionRef.current = null
    if (initialSection) useNotesStore.setState({ pendingInitialSectionId: null })
    setActiveSectionId(targetId)
    setRawContent(note.sections.find((s) => s.id === targetId)?.content ?? '')
    setTitleDraft(note.title)
    setRenamingId(null)
    setSectionColorPickerId(null)
    if (targetId && isPaneActive) window.noteflow.setUiState({ activeSectionId: targetId })
  }, [note?.id, isPaneActive]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (sectionUndoTimerRef.current) {
        clearTimeout(sectionUndoTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const close = () => setSectionColorPickerId(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  // ── Handle section request from sidebar ────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const { noteId: targetNoteId, sectionId } = (e as CustomEvent<{ noteId: string; sectionId: string }>).detail
      if (noteRef.current?.id === targetNoteId) {
        // Same note: switch section directly
        const section = noteRef.current.sections.find((s) => s.id === sectionId)
        if (section) {
          setRawContent(section.content)
          setActiveSectionId(sectionId)
        }
      } else if (!noteId) {
        // Different note: store for when the note.id effect fires
        pendingSectionRef.current = sectionId
      }
    }
    window.addEventListener('noteflow:request-section', handler)
    return () => window.removeEventListener('noteflow:request-section', handler)
  }, [noteId]) // eslint-disable-line react-hooks/exhaustive-deps

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
  // Skip if the textarea is focused — same guard as TipTap uses — to avoid
  // resetting the cursor position while the user is actively typing.
  useEffect(() => {
    if (rawTextareaRef.current === document.activeElement) return
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

  // Auto-show unlock modal when switching to a locked encrypted note
  useEffect(() => {
    if (isPaneActive && note?.encryption && !sessionPasswords[note.id]) {
      setShowUnlockModal(true)
    }
  }, [note?.id, isPaneActive]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-focus editor on new note ──────────────────────────────────────────
  useEffect(() => {
    if (note && note.sections.length === 1 && note.sections[0].content === '') {
      requestAnimationFrame(() => {
        rawTextareaRef.current?.focus()
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

  const handleRawImageInsert = useCallback(async (files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'))
    if (imageFiles.length === 0 || !activeSection) return
    let insertText = ''
    for (const file of imageFiles) {
      const src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      insertText += `![${file.name}](${src})\n`
    }
    const textarea = rawTextareaRef.current
    const pos = textarea?.selectionStart ?? rawContent.length
    const newValue = rawContent.substring(0, pos) + insertText + rawContent.substring(pos)
    setRawContent(newValue)
    if (rawDebounceRef.current) clearTimeout(rawDebounceRef.current)
    rawDebounceRef.current = setTimeout(() => {
      if (activeSection && noteRef.current) {
        updateNote(noteRef.current.id, {
          sections: noteRef.current.sections.map((s) =>
            s.id === activeSection.id ? { ...s, content: newValue } : s,
          ),
        })
      }
    }, 600)
  }, [rawContent, activeSection, updateNote]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Delete key on the note (only when editor is NOT focused) ──────────────
  useEffect(() => {
    if (!isPaneActive) return
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
  }, [note, openDeleteNoteModal, isPaneActive])

  // ── Ctrl+T / Ctrl+W via custom events ────────────────────────────────────
  useEffect(() => {
    if (!isPaneActive) return
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
      deleteSectionWithUndo(sectionId)
    }
    window.addEventListener('noteflow:add-tab', handleAddTab)
    window.addEventListener('noteflow:close-tab', handleCloseTab)
    return () => {
      window.removeEventListener('noteflow:add-tab', handleAddTab)
      window.removeEventListener('noteflow:close-tab', handleCloseTab)
    }
  }, [updateNote, isPaneActive])

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

    if (resolvedNoteId && !isPaneActive) {
      setActiveNote(resolvedNoteId)
    }

    setSectionColorPickerId(null)

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
    if (isPaneActive) window.noteflow.setUiState({ activeSectionId: sectionId })
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

  const deleteSectionWithUndo = (sectionId: string) => {
    const currentNote = noteRef.current
    if (!currentNote || currentNote.sections.length <= 1) return

    const removeIndex = currentNote.sections.findIndex((s) => s.id === sectionId)
    if (removeIndex === -1) return

    const previousSections = currentNote.sections.map((section) => ({ ...section }))
    const nextSections = currentNote.sections.filter((s) => s.id !== sectionId)
    const removedSection = currentNote.sections[removeIndex]
    const previousActiveSectionId = activeSectionIdRef.current

    const fallbackSection = previousActiveSectionId === sectionId
      ? nextSections[Math.min(removeIndex, nextSections.length - 1)] ?? nextSections[0]
      : nextSections.find((s) => s.id === previousActiveSectionId) ?? nextSections[0]

    void updateNote(currentNote.id, { sections: nextSections })

    if (previousActiveSectionId === sectionId) {
      const nextActiveId = fallbackSection?.id ?? null
      setActiveSectionId(nextActiveId)
      setRawContent(fallbackSection?.content ?? '')
      if (nextActiveId && isPaneActive) window.noteflow.setUiState({ activeSectionId: nextActiveId })
    }

    if (sectionUndoTimerRef.current) {
      clearTimeout(sectionUndoTimerRef.current)
    }

    setSectionUndo({
      noteId: currentNote.id,
      sectionName: removedSection.name,
      previousSections,
      previousActiveSectionId,
    })

    sectionUndoTimerRef.current = setTimeout(() => {
      sectionUndoTimerRef.current = null
      setSectionUndo(null)
    }, 6000)
  }

  const undoSectionDelete = () => {
    if (!sectionUndo) return
    const currentNote = noteRef.current
    if (!currentNote || currentNote.id !== sectionUndo.noteId) {
      setSectionUndo(null)
      return
    }

    if (sectionUndoTimerRef.current) {
      clearTimeout(sectionUndoTimerRef.current)
      sectionUndoTimerRef.current = null
    }

    const restoredSections = sectionUndo.previousSections.map((section) => ({ ...section }))
    void updateNote(currentNote.id, { sections: restoredSections })

    const restoreActiveId = sectionUndo.previousActiveSectionId && restoredSections.some((s) => s.id === sectionUndo.previousActiveSectionId)
      ? sectionUndo.previousActiveSectionId
      : restoredSections[0]?.id ?? null

    setActiveSectionId(restoreActiveId)
    setRawContent(restoredSections.find((s) => s.id === restoreActiveId)?.content ?? '')
    if (restoreActiveId && isPaneActive) window.noteflow.setUiState({ activeSectionId: restoreActiveId })
    setSectionUndo(null)
  }

  const handleDeleteSection = (sectionId: string) => {
    deleteSectionWithUndo(sectionId)
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

  const handleSetSectionColor = async (sectionName: string, color: GroupColor) => {
    await setSectionTagColor(sectionName, color)
    setSectionColorPickerId(null)
  }

  const handleClearSectionColor = async (sectionName: string) => {
    await clearSectionTagColor(sectionName)
    setSectionColorPickerId(null)
  }

  const colorPickerSection = sectionColorPickerId
    ? note.sections.find((s) => s.id === sectionColorPickerId) ?? null
    : null

  const lastColorPickerSectionRef = useRef(colorPickerSection)
  if (colorPickerSection) lastColorPickerSectionRef.current = colorPickerSection
  const visibleColorPickerSection = colorPickerSection ?? lastColorPickerSectionRef.current

  const colorPickerOverride = visibleColorPickerSection
    ? sectionTagColors[normalizeTagColorKey(visibleColorPickerSection.name)]
    : undefined

  const handleRawChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newDisplay = e.target.value

    // Restore base64 data URIs from original rawContent (matched in order)
    const origSrcs: string[] = []
    rawContent.replace(/!\[[^\]]*\]\((data:[^)]+)\)/g, (_, src) => { origSrcs.push(src); return '' })
    let idx = 0
    const newContent = newDisplay.replace(/(!\[[^\]]*\])\(\[image\]\)/g, (_, prefix) => {
      const src = origSrcs[idx++]
      return src ? `${prefix}(${src})` : `${prefix}([image])`
    })

    if (activeSection) pushToUndoStack(activeSection.id, rawContent)
    setRawContent(newContent)
    if (rawDebounceRef.current) clearTimeout(rawDebounceRef.current)
    rawDebounceRef.current = setTimeout(() => {
      if (activeSection && noteRef.current) {
        updateNote(noteRef.current.id, {
          sections: noteRef.current.sections.map((s) =>
            s.id === activeSection.id ? { ...s, content: newContent } : s,
          ),
        })
      }
    }, 600)
  }

  const displayContent = rawContent.replace(
    /!\[([^\]]*)\]\(data:[^)]+\)/g,
    (_, alt) => `![${alt}]([image])`
  )

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

  // ── Encrypted note — locked view ───────────────────────────────────────────
  if (note.encryption && !sessionPasswords[note.id]) {
    return (
      <>
        <div
          className="flex flex-col h-full"
          onMouseDownCapture={() => {
            if (resolvedNoteId && !isPaneActive) setActiveNote(resolvedNoteId)
          }}
        >
          <div className="px-4 pt-3 pb-2 border-b border-border flex-shrink-0">
            <span className="text-xl font-bold font-mono text-text">
              {note.title || 'Untitled'}
            </span>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-muted">
            <Lock size={28} className="opacity-20" />
            <p className="text-sm font-mono">This note is encrypted</p>
            <button
              onClick={() => setShowUnlockModal(true)}
              className="text-xs font-mono text-accent hover:underline opacity-70 hover:opacity-100 transition-opacity"
            >
              Click to unlock
            </button>
          </div>
        </div>
        {showUnlockModal && (
          <EncryptionModal
            mode="unlock"
            noteTitle={note.title}
            onConfirm={async (password) => {
              await unlockNote(note.id, password)
              setShowUnlockModal(false)
            }}
            onCancel={() => setShowUnlockModal(false)}
          />
        )}
      </>
    )
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

      <div
        className="flex flex-col h-full"
        onMouseDownCapture={() => {
          if (resolvedNoteId && !isPaneActive) setActiveNote(resolvedNoteId)
        }}
        onKeyDown={(e) => {
          e.stopPropagation()
          const isAccel = e.ctrlKey || e.metaKey
          const key = e.key.toLowerCase()

          if (isAccel && e.shiftKey && key === 'e') {
            e.preventDefault()
            handleRawToggle()
            return
          }
          if (isAccel && (e.key === '=' || e.key === '+')) { e.preventDefault(); changeFontSize(1) }
          if (isAccel && e.key === '-') { e.preventDefault(); changeFontSize(-1) }
          if (isAccel && e.key === '0') { e.preventDefault(); resetFontSize() }
        }}
      >
        <div className="flex items-center gap-3 px-3 pt-3 pb-2 border-b border-border min-h-0 flex-shrink-0">
          <div className="flex items-center gap-1.5 flex-1 overflow-x-auto min-w-0 pr-1 tabs-scroll">
            {note.sections.map((section) => {
              const isActive = section.id === (activeSection?.id)
              const isRenaming = renamingId === section.id
              const colorStyle = getTagColor(section.name, sectionTagColors)
              return (
                <div
                  key={section.id}
                  draggable
                  title="Drag to reorder section"
                  onDragStart={(e) => handleDragStart(e, section.id)}
                  onDragOver={(e) => handleDragOver(e, section.id)}
                  onDrop={(e) => handleDrop(e, section.id)}
                  onDragEnd={handleDragEnd}
                  onDragLeave={() => setDragOverSectionId(null)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setSectionColorPickerId((prev) => (prev === section.id ? null : section.id))
                  }}
                  className={`relative group flex items-center gap-1 flex-shrink-0 rounded px-0.5 transition-all duration-200 cursor-grab active:cursor-grabbing
                     ${isActive
                      ? 'tab-active-bg border'
                      : 'border border-border/40 hover:border-border/70'
                    }
                    ${draggedSectionId === section.id ? 'opacity-30' : 'opacity-100'}
                    ${dragOverSectionId === section.id ? 'border-l-2 tab-active-border-l pl-1 bg-accent/10 border-dashed' : ''}
                  `}
                  style={isActive
                    ? { border: colorStyle.border, background: colorStyle.background }
                    : {}
                  }
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
                      style={isActive ? { color: colorStyle.color } : undefined}
                    >
                      {section.name}
                    </button>
                  )}

                  {!isRenaming && (
                    <div className="flex items-center gap-0.5 pr-1 invisible group-hover:visible">
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
              onClick={openDeleteNoteModal}
              title="Delete note (Del)"
              className="p-1.5 rounded text-xs text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>


        {sectionUndo && sectionUndo.noteId === note.id && (
          <div className="mx-3 mt-2 px-3 py-2 rounded border border-amber-300/35 bg-amber-300/10 flex items-center justify-between gap-2">
            <span className="text-[11px] font-mono text-text-muted min-w-0 truncate">
              Section "{sectionUndo.sectionName}" deleted
            </span>
            <button
              onClick={undoSectionDelete}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono border border-amber-300/45 text-amber-200 hover:bg-amber-300/15 transition-colors"
            >
              <RotateCcw size={10} />
              Undo
            </button>
          </div>
        )}

        <div
          className="overflow-hidden transition-all duration-200 ease-in-out border-border/60 bg-surface-1/40"
          style={{
            maxHeight: colorPickerSection ? '60px' : '0px',
            opacity: colorPickerSection ? 1 : 0,
            borderBottomWidth: colorPickerSection ? '1px' : '0px',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {visibleColorPickerSection && (
            <div className="px-3 py-2 flex items-center justify-between gap-2">
              <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted/70 min-w-0 truncate flex-shrink-0">
                {visibleColorPickerSection.name}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {TAG_COLOR_VARS.map((color) => (
                  <button
                    key={`tab-color-${visibleColorPickerSection.id}-${color}`}
                    title={color.replace('--', '')}
                    onClick={() => { void handleSetSectionColor(visibleColorPickerSection.name, color) }}
                    className={`w-4 h-4 rounded-full transition-transform hover:scale-110 ${colorPickerOverride === color ? 'ring-1 ring-white/60 ring-offset-1 ring-offset-surface-2' : ''}`}
                    style={{ background: `rgb(var(${color}))` }}
                  />
                ))}
                <button
                  onClick={() => { void handleClearSectionColor(visibleColorPickerSection.name) }}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                    colorPickerOverride
                      ? 'text-text-muted border-border hover:text-text hover:border-accent/40'
                      : 'text-accent border-accent/50 bg-accent/10'
                  }`}
                >
                  Auto
                </button>
                <button
                  onClick={() => setSectionColorPickerId(null)}
                  className="p-0.5 rounded text-text-muted/70 hover:text-text transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          )}
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


        <div className="px-4 pb-2 flex-shrink-0">
          <span className="text-xs font-mono text-text-muted/50">
            {format(new Date(note.updated), 'MMM d, yyyy · HH:mm')}
          </span>
        </div>

        <div className="flex-1 overflow-hidden mr-1">
          {rawMode ? (
            <textarea
              ref={rawTextareaRef}
              value={displayContent}
              onChange={handleRawChange}
              onBlur={handleRawBlur}
              onKeyDown={handleRawKeyDown}
              onPaste={(e) => {
                const imageItems = Array.from(e.clipboardData.items).filter(i => i.type.startsWith('image/'))
                if (imageItems.length === 0) return
                e.preventDefault()
                handleRawImageInsert(imageItems.map(i => i.getAsFile()).filter(Boolean) as File[])
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const files = Array.from(e.dataTransfer.files)
                if (!files.some(f => f.type.startsWith('image/'))) return
                e.preventDefault()
                handleRawImageInsert(files)
              }}
              style={{ fontSize: `${fontSize}px` }}
              className="w-full h-full p-4 bg-transparent font-mono text-text
                         border-none outline-none resize-none caret-accent leading-relaxed"
              spellCheck={false}
            />
          ) : (
            <Editor
              key={`${note.id}-${activeSection?.id ?? 'none'}`}
              content={activeSection?.content ?? ''}
              onChange={handleSectionContentChange}
              placeholder={`${activeSection?.name ?? 'Section'} — start writing...`}
              fontSize={fontSize}
            />
          )}
        </div>
      </div>
    </>
  )
}
