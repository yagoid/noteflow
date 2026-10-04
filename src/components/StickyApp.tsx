import { useEffect, useRef, useState } from 'react'
import { useNotesStore } from '../stores/notesStore'
import { useSectionTagColorsStore } from '../stores/sectionTagColorsStore'
import { useThemeStore } from '../stores/themeStore'
import { useEditorSettingsStore } from '../stores/editorSettingsStore'
import { colorChannels, resolveGroupColor } from '../lib/tagColors'
import { Editor } from './Editor/Editor'
import { X, Minus, Lock, Loader2, ChevronDown, ChevronUp, Pin, PinOff } from 'lucide-react'
import { decryptSections } from '../lib/cryptoUtils'
import { useT } from '../i18n/useT'
import type { GroupColor, NoteSection } from '../types'

const FOLDED_W = 220
const FOLDED_H = 32
// Caret breathing room for the small sticky window (default 300px tall, min
// 200px): smaller than the main editor's so the top/bottom bands never overlap.
// The bottom one must stay below `.sticky-editor .ProseMirror` padding-bottom.
const STICKY_CARET_SCROLL_GAP = { top: 8, bottom: 32 }

// Custom TitleBar for the sticky window
function StickyTitleBar({ noteTitle, sectionName, color, onFold, isPinned, onTogglePin }: {
  noteTitle: string
  sectionName?: string
  color: GroupColor
  onFold: () => void
  isPinned?: boolean
  onTogglePin?: () => void
}) {
  const t = useT()
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
            <span className="truncate font-light" style={{ color: `rgb(${colorChannels(color)})` }}>{sectionName}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {onTogglePin && (
          <button
            className={`p-1 rounded transition-colors ${
              isPinned
                ? 'text-text hover:bg-surface-2'
                : 'text-text-muted hover:text-text hover:bg-surface-2'
            }`}
            onClick={onTogglePin}
            title={isPinned ? t.sticky.alwaysOnTopOn : t.sticky.alwaysOnTopOff}
          >
            {isPinned ? <Pin size={12} /> : <PinOff size={12} />}
          </button>
        )}
        <button
          className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          onClick={onFold}
          title={t.sticky.fold}
        >
          <ChevronUp size={12} />
        </button>
        <button
          className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          onClick={() => window.noteflow.minimize()}
          title={t.sticky.minimize}
        >
          <Minus size={12} />
        </button>
        <button
          className="p-1 rounded text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
          onClick={() => window.noteflow.close()}
          title={t.sticky.close}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

// Compact folded pill shown when the sticky note is collapsed
function FoldedPill({ noteTitle, sectionName, color, onUnfold }: {
  noteTitle: string
  sectionName?: string
  color: GroupColor
  onUnfold: () => void
}) {
  const t = useT()
  return (
    <div
      className="h-8 flex items-center justify-between px-2 gap-1 cursor-default select-none bg-surface-0 rounded-lg overflow-hidden border border-border/40"
      style={{
        WebkitAppRegion: 'drag',
        borderLeftColor: `rgb(${colorChannels(color)})`,
        borderLeftWidth: '3px',
      } as React.CSSProperties}
    >
      <div className="text-xs font-mono flex items-center gap-3 flex-1 min-w-0">
        <span className="truncate text-text font-semibold">{noteTitle}</span>
        {sectionName && (
          <>
            <span className="h-3 w-px bg-border/40 flex-shrink-0" />
            <span className="truncate font-light" style={{ color: `rgb(${colorChannels(color)})` }}>{sectionName}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-0.5 flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          className="p-1 rounded-full text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          onClick={onUnfold}
          title={t.sticky.unfold}
        >
          <ChevronDown size={12} />
        </button>
        <button
          className="p-1 rounded-full text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          onClick={() => window.noteflow.minimize()}
          title={t.sticky.minimizeShort}
        >
          <Minus size={12} />
        </button>
        <button
          className="p-1 rounded-full text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
          onClick={() => window.noteflow.close()}
          title={t.sticky.closeShort}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

export function StickyApp() {
  const t = useT()
  const [noteId, setNoteId] = useState<string | null>(null)
  const [sectionId, setSectionId] = useState<string | null>(null)
  const [rawContent, setRawContent] = useState('')
  const [isFolded, setIsFolded] = useState(false)
  // Sticky windows are created with alwaysOnTop: true in the main process,
  // so the pin starts active.
  const [isPinned, setIsPinned] = useState(true)
  const { loadNotes, isLoading, notes, updateSection } = useNotesStore()
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
        // Synced appearance/editor settings — keep stickies visually in step
        // with the main window / other devices. Read-only, so no loop.
        useThemeStore.getState().reloadUiSettings()
        useEditorSettingsStore.getState().reloadUiSettings()
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
      setUnlockError(t.encryption.wrongPassword)
    } finally {
      setUnlockLoading(false)
    }
  }

  // Only block on the loading screen during the very first load (no notes yet).
  // A background reload from sync keeps the previous notes in memory, so we must
  // not unmount the sticky editor mid-session — that resets its scroll/focus.
  if ((isLoading && notes.length === 0) || !noteId || !sectionId) {
    return (
      <div className="flex flex-col h-screen bg-surface-0 rounded-lg overflow-hidden border border-border">
        <StickyTitleBar noteTitle={t.common.loading} color="--accent" onFold={() => {}} />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-xs font-mono text-text-muted animate-pulse">{t.sticky.loadingSticky}</div>
        </div>
      </div>
    )
  }

  // Encrypted note — show unlock form
  if (note?.encryption && !unlockedSections) {
    return (
      <div className="flex flex-col h-screen bg-surface-0 overflow-hidden border border-border rounded-lg">
        <StickyTitleBar noteTitle={note.title || t.common.untitled} color="--accent" onFold={() => {}} />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4">
          <Lock size={20} className="text-text-muted opacity-30" />
          <p className="text-xs font-mono text-text-muted text-center">{t.encryption.noteEncrypted}</p>
          <input
            ref={passwordRef}
            type="password"
            value={unlockPassword}
            onChange={(e) => { setUnlockPassword(e.target.value); setUnlockError('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleUnlock() }}
            placeholder={t.encryption.enterPassword}
            className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-xs font-mono text-text outline-none focus:border-text/30 transition-colors"
            autoComplete="off"
          />
          {unlockError && (
            <p className="text-xs font-mono text-red-400 text-center">{unlockError}</p>
          )}
          <button
            onClick={handleUnlock}
            disabled={!unlockPassword || unlockLoading}
            className="flex items-center gap-1.5 w-full justify-center px-3 py-1.5 text-xs font-mono bg-text text-surface-0 rounded hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {unlockLoading && <Loader2 size={11} className="animate-spin" />}
            {t.encryption.unlock}
          </button>
        </div>
      </div>
    )
  }

  if (!note || !section) {
    return (
      <div className="flex flex-col h-screen bg-surface-0 rounded-lg overflow-hidden border border-border">
        <StickyTitleBar noteTitle={t.sticky.notFound} color="--accent" onFold={() => {}} />
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
          <div className="text-sm font-mono text-red-400 mb-2">{t.sticky.noteNotFound}</div>
          <div className="text-xs font-mono text-text-muted">{t.sticky.mayHaveBeenDeleted}</div>
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

  const handleTogglePin = () => {
    const next = !isPinned
    window.noteflow.setAlwaysOnTop(next)
    setIsPinned(next)
  }

  const handleUnfold = () => {
    window.noteflow.unfold()
    // Delay UI switch until the unfold animation finishes (280ms in main process)
    setTimeout(() => setIsFolded(false), 260)
  }

  // updateSection merges onto the latest sections: a sync of another section that
  // landed after this render must not be overwritten with our stale copy of it.
  const handleContentChange = (content: string) => {
    if (isReadOnly || section.content === content) return
    void updateSection(note.id, section.id, { content })
  }

  const handleRawChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isReadOnly) return
    const content = e.target.value
    setRawContent(content)
    if (section && section.content === content) return
    void updateSection(note!.id, section!.id, { content })
  }

  const showSectionName = section.name !== 'New' && section.name !== 'Main'
  const sectionColor = resolveGroupColor(section.name, sectionTagColors)

  if (isFolded) {
    return (
      <FoldedPill
        noteTitle={note.title}
        sectionName={showSectionName ? section.name : undefined}
        color={sectionColor}
        onUnfold={handleUnfold}
      />
    )
  }

  return (
    <div
      className="flex flex-col h-screen bg-surface-1 overflow-hidden border border-border rounded-lg"
      style={{ borderLeftColor: `rgb(${colorChannels(sectionColor)})`, borderLeftWidth: '3px' }}
    >
      <StickyTitleBar
        noteTitle={note.title}
        sectionName={showSectionName ? section.name : undefined}
        color={sectionColor}
        onFold={handleFold}
        isPinned={isPinned}
        onTogglePin={handleTogglePin}
      />
      {isReadOnly && (
        <div className="flex items-center gap-1 px-2 py-1 bg-amber-500/10 border-b border-amber-500/20">
          <Lock size={9} className="text-amber-400 flex-shrink-0" />
          <span className="text-[10px] font-mono text-amber-400/80">{t.sticky.readOnly}</span>
        </div>
      )}
      <div className="flex-1 overflow-hidden mr-1" onKeyDown={(e) => e.stopPropagation()}>
        {(section.isRawMode || isReadOnly) ? (
          <textarea
            value={isReadOnly ? section.content : rawContent}
            onChange={handleRawChange}
            readOnly={isReadOnly}
            className={`w-full h-full p-3 bg-transparent text-xs font-mono text-text
                       border-none outline-none resize-none caret-text leading-relaxed
                       ${isReadOnly ? 'select-all cursor-default' : ''}`}
            spellCheck={false}
          />
        ) : (
          <div className="h-full overflow-y-auto sticky-editor">
            <Editor
              key={`${note.id}-${section.id}`}
              content={section.content ?? ''}
              onChange={handleContentChange}
              placeholder={t.sticky.startWriting}
              hideToolbar={true}
              caretScrollGap={STICKY_CARET_SCROLL_GAP}
            />
          </div>
        )}
      </div>
    </div>
  )
}
