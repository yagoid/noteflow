import { useEffect, useRef, useState } from 'react'
import { useNotesStore } from '../stores/notesStore'
import { useSectionTagColorsStore } from '../stores/sectionTagColorsStore'
import { resolveColorVar } from '../lib/tagColors'
import { Editor } from './Editor/Editor'
import { X, Minus, Lock, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { decryptSections } from '../lib/cryptoUtils'
import type { NoteSection } from '../types'

const FOLDED_W = 220
const FOLDED_H = 32

// Custom TitleBar for the sticky window
function StickyTitleBar({ noteTitle, sectionName, colorVar, onFold }: {
  noteTitle: string
  sectionName?: string
  colorVar: string
  onFold: () => void
}) {
  return (
    <div
      className="h-8 bg-surface-0 border-b border-border/40 flex items-center justify-between px-2 cursor-default select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="text-xs font-mono flex items-center gap-3 flex-1 pr-2 min-w-0">
        <span className="truncate text-text font-semibold">{noteTitle}</span>
        {sectionName && (
          <>
            <span className="h-3 w-px bg-border/40 flex-shrink-0" />
            <span className="truncate font-light" style={{ color: `rgb(var(${colorVar}))` }}>{sectionName}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          onClick={onFold}
          title="Fold Sticky Note"
        >
          <ChevronUp size={12} />
        </button>
        <button
          className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          onClick={() => window.noteflow.minimize()}
          title="Minimize Sticky Note"
        >
          <Minus size={12} />
        </button>
        <button
          className="p-1 rounded text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
          onClick={() => window.noteflow.close()}
          title="Close Sticky Note"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

// Compact folded pill shown when the sticky note is collapsed
function FoldedPill({ noteTitle, sectionName, colorVar, onUnfold }: {
  noteTitle: string
  sectionName?: string
  colorVar: string
  onUnfold: () => void
}) {
  return (
    <div
      className="h-8 flex items-center justify-between px-2 gap-1 cursor-default select-none bg-surface-0 rounded-lg overflow-hidden border border-border/40"
      style={{
        WebkitAppRegion: 'drag',
        borderLeftColor: `rgb(var(${colorVar}))`,
        borderLeftWidth: '3px',
      } as React.CSSProperties}
    >
      <div className="text-xs font-mono flex items-center gap-3 flex-1 min-w-0">
        <span className="truncate text-text font-semibold">{noteTitle}</span>
        {sectionName && (
          <>
            <span className="h-3 w-px bg-border/40 flex-shrink-0" />
            <span className="truncate font-light" style={{ color: `rgb(var(${colorVar}))` }}>{sectionName}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-0.5 flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          className="p-1 rounded-full text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          onClick={onUnfold}
          title="Unfold Sticky Note"
        >
          <ChevronDown size={12} />
        </button>
        <button
          className="p-1 rounded-full text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          onClick={() => window.noteflow.minimize()}
          title="Minimize"
        >
          <Minus size={12} />
        </button>
        <button
          className="p-1 rounded-full text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
          onClick={() => window.noteflow.close()}
          title="Close"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

export function StickyApp() {
  const [noteId, setNoteId] = useState<string | null>(null)
  const [sectionId, setSectionId] = useState<string | null>(null)
  const [rawContent, setRawContent] = useState('')
  const [isFolded, setIsFolded] = useState(false)
  const { loadNotes, isLoading, notes, updateNote } = useNotesStore()
  const sectionTagColors = useSectionTagColorsStore((s) => s.sectionTagColors)

  // Encrypted note unlock state (local — no store interaction)
  const [unlockedSections, setUnlockedSections] = useState<NoteSection[] | null>(null)
  const [unlockPassword, setUnlockPassword] = useState('')
  const [unlockError, setUnlockError] = useState('')
  const [unlockLoading, setUnlockLoading] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)

  // Parse hash and load notes
  useEffect(() => {
    // Expected hash: #sticky?noteId=xxx&sectionId=yyy
    const hash = window.location.hash
    let parsedNoteId: string | null = null
    if (hash.startsWith('#sticky')) {
      const q = hash.split('?')[1]
      const params = new URLSearchParams(q)
      parsedNoteId = params.get('noteId')
      setNoteId(parsedNoteId)
      setSectionId(params.get('sectionId'))
    }
    // At system startup the OS filesystem may not be fully ready when the
    // sticky window first loads (this affects both Windows and Linux). If the
    // note isn't found after the initial load, retry with increasing delays.
    const retryDelays = [1500, 3000, 5000]
    let retryIndex = 0
    const tryLoad = () => {
      loadNotes().then(() => {
        if (
          parsedNoteId &&
          !useNotesStore.getState().notes.find(n => n.id === parsedNoteId) &&
          retryIndex < retryDelays.length
        ) {
          setTimeout(tryLoad, retryDelays[retryIndex++])
        }
      })
    }
    tryLoad()

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

  // Use locally unlocked sections if available, otherwise store sections
  const section = unlockedSections
    ? unlockedSections.find(s => s.id === sectionId)
    : note?.sections.find(s => s.id === sectionId)

  // Sync local buffer when section changes or store updates
  useEffect(() => {
    if (section && section.content !== rawContent) {
      setRawContent(section.content)
    }
  }, [section?.id, section?.content]) // eslint-disable-line react-hooks/exhaustive-deps

  // Focus password input when encrypted note is detected
  useEffect(() => {
    if (note?.encryption && !unlockedSections) {
      setTimeout(() => passwordRef.current?.focus(), 100)
    }
  }, [note?.id, note?.encryption, unlockedSections]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleUnlock = async () => {
    if (!note?.encryption || !unlockPassword || unlockLoading) return
    setUnlockLoading(true)
    setUnlockError('')
    try {
      const sections = await decryptSections(note.encryption, unlockPassword)
      setUnlockedSections(sections)
    } catch {
      setUnlockError('Wrong password. Try again.')
    } finally {
      setUnlockLoading(false)
    }
  }

  if (isLoading || !noteId || !sectionId) {
    return (
      <div className="flex flex-col h-screen bg-surface-0 rounded-lg overflow-hidden border border-border">
        <StickyTitleBar noteTitle="Loading..." colorVar="--accent" onFold={() => {}} />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-xs font-mono text-text-muted animate-pulse">Loading sticky note...</div>
        </div>
      </div>
    )
  }

  // Encrypted note — show unlock form
  if (note?.encryption && !unlockedSections) {
    return (
      <div className="flex flex-col h-screen bg-surface-0 overflow-hidden border border-border rounded-lg">
        <StickyTitleBar noteTitle={note.title || 'Untitled'} colorVar="--accent" onFold={() => {}} />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4">
          <Lock size={20} className="text-text-muted opacity-30" />
          <p className="text-xs font-mono text-text-muted text-center">This note is encrypted</p>
          <input
            ref={passwordRef}
            type="password"
            value={unlockPassword}
            onChange={(e) => { setUnlockPassword(e.target.value); setUnlockError('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleUnlock() }}
            placeholder="Enter password"
            className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-xs font-mono text-text outline-none focus:border-accent transition-colors"
            autoComplete="off"
          />
          {unlockError && (
            <p className="text-xs font-mono text-red-400 text-center">{unlockError}</p>
          )}
          <button
            onClick={handleUnlock}
            disabled={!unlockPassword || unlockLoading}
            className="flex items-center gap-1.5 w-full justify-center px-3 py-1.5 text-xs font-mono bg-accent text-bg rounded hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {unlockLoading && <Loader2 size={11} className="animate-spin" />}
            Unlock
          </button>
        </div>
      </div>
    )
  }

  if (!note || !section) {
    return (
      <div className="flex flex-col h-screen bg-surface-0 rounded-lg overflow-hidden border border-border">
        <StickyTitleBar noteTitle="Not Found" colorVar="--accent" onFold={() => {}} />
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
          <div className="text-sm font-mono text-red-400 mb-2">Note not found</div>
          <div className="text-xs font-mono text-text-muted">It may have been deleted.</div>
        </div>
      </div>
    )
  }

  // Read-only mode for unlocked encrypted notes (changes can't be persisted
  // since the sticky window's store has no session password for re-encryption)
  const isReadOnly = !!unlockedSections

  const handleFold = () => {
    window.noteflow.foldToCorner(FOLDED_W, FOLDED_H)
    setIsFolded(true)
  }

  const handleUnfold = () => {
    window.noteflow.unfold()
    // Delay UI switch until the unfold animation finishes (280ms in main process)
    setTimeout(() => setIsFolded(false), 260)
  }

  const handleContentChange = (content: string) => {
    if (isReadOnly || section.content === content) return
    updateNote(note.id, {
      sections: note.sections.map((s) =>
        s.id === section.id ? { ...s, content } : s,
      ),
    })
  }

  const handleRawChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isReadOnly) return
    const content = e.target.value
    setRawContent(content)
    if (section && section.content === content) return
    updateNote(note!.id, {
      sections: note!.sections.map((s) =>
        s.id === section!.id ? { ...s, content } : s,
      ),
    })
  }

  const showSectionName = section.name !== 'New' && section.name !== 'Main'
  const sectionColorVar = resolveColorVar(section.name, sectionTagColors)

  if (isFolded) {
    return (
      <FoldedPill
        noteTitle={note.title}
        sectionName={showSectionName ? section.name : undefined}
        colorVar={sectionColorVar}
        onUnfold={handleUnfold}
      />
    )
  }

  return (
    <div
      className="flex flex-col h-screen bg-surface-1 overflow-hidden border border-border rounded-lg"
      style={{ borderLeftColor: `rgb(var(${sectionColorVar}))`, borderLeftWidth: '3px' }}
    >
      <StickyTitleBar
        noteTitle={note.title}
        sectionName={showSectionName ? section.name : undefined}
        colorVar={sectionColorVar}
        onFold={handleFold}
      />
      {isReadOnly && (
        <div className="flex items-center gap-1 px-2 py-1 bg-amber-500/10 border-b border-amber-500/20">
          <Lock size={9} className="text-amber-400 flex-shrink-0" />
          <span className="text-[10px] font-mono text-amber-400/80">read-only</span>
        </div>
      )}
      <div className="flex-1 overflow-hidden mr-1" onKeyDown={(e) => e.stopPropagation()}>
        {(section.isRawMode || isReadOnly) ? (
          <textarea
            value={isReadOnly ? section.content : rawContent}
            onChange={handleRawChange}
            readOnly={isReadOnly}
            className={`w-full h-full p-3 bg-transparent text-xs font-mono text-text
                       border-none outline-none resize-none caret-accent leading-relaxed
                       ${isReadOnly ? 'select-all cursor-default' : ''}`}
            spellCheck={false}
          />
        ) : (
          <div className="h-full overflow-y-auto sticky-editor">
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
