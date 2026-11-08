import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { closeWindowAfterSaving, useNotesStore } from '../stores/notesStore'
import { useSectionTagColorsStore } from '../stores/sectionTagColorsStore'
import { useThemeStore } from '../stores/themeStore'
import { useEditorSettingsStore } from '../stores/editorSettingsStore'
import { colorChannels, resolveGroupColor } from '../lib/tagColors'
import { Editor } from './Editor/Editor'
import { ContextMenu } from './ContextMenu'
import { MENU_ITEM_CLASS } from './contextMenuStyles'
import { X, Minus, Lock, Loader2, ChevronDown, ChevronUp, Pin, PinOff, Check } from 'lucide-react'
import { decryptSections } from '../lib/cryptoUtils'
import { createDebouncedSave, flushPendingEdits } from '../lib/pendingEdits'
import { menuNavIndex, showStickySectionName, stickyHashWithSection } from '../lib/stickySectionMenu'
import {
  createContentSync, mapOffsetThroughChange, needsSave, recordSave, resolveExternalContent, type ContentSync,
} from '../lib/externalContentSync'
import { useT } from '../i18n/useT'
import type { GroupColor, NoteSection } from '../types'

const FOLDED_W = 220
const FOLDED_H = 32
// Caret breathing room for the small sticky window (default 300px tall, min
// 200px): smaller than the main editor's so the top/bottom bands never overlap.
// The bottom one must stay below `.sticky-editor .ProseMirror` padding-bottom.
const STICKY_CARET_SCROLL_GAP = { top: 8, bottom: 32 }

// Same look as the sidebar context menus (MENU_CLASS), sized for the small sticky window
// (300px wide by default, 200×200 minimum) and scrolling when the note has many sections.
const SECTION_MENU_CLASS = 'fixed z-50 bg-surface-2 border border-border rounded-lg shadow-xl py-1 w-max min-w-40 max-w-[calc(100vw-16px)] max-h-[calc(100vh-40px)] overflow-y-auto animate-in fade-in zoom-in duration-100'

const NO_DRAG = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

interface SectionOption {
  id: string
  name: string
  color: GroupColor
}

// Title-bar section switcher: the section name opens a menu with every section of the
// note (note order). Closes on Escape, Tab, an outside click (a transparent backdrop,
// which also takes the title bar's drag region out while open), window blur, or after
// picking one. Escape / Tab return the focus to the trigger, an outside click leaves it.
function SectionSwitcher({ sectionName, color, sections, currentSectionId, onSelect }: {
  sectionName: string
  color: GroupColor
  sections: SectionOption[]
  currentSectionId: string
  onSelect: (sectionId: string) => void
}) {
  const t = useT()
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const open = menuPos !== null

  const openMenu = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) setMenuPos({ x: rect.left, y: rect.bottom + 4 })
  }
  const closeMenu = (refocusTrigger: boolean) => {
    setMenuPos(null)
    if (refocusTrigger) triggerRef.current?.focus()
  }

  // The current section gets the focus on open, so the arrows start from it.
  useEffect(() => {
    if (!open) return
    const current = Math.max(0, sections.findIndex((s) => s.id === currentSectionId))
    itemRefs.current[current]?.focus()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // On the window, not the menu: a click on the menu's padding leaves the focus on the
  // body, and Escape / the arrows must still work. Enter / Space are the focused item's
  // own button activation.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault()
        setMenuPos(null)
        triggerRef.current?.focus()
        return
      }
      const items = itemRefs.current.filter((el): el is HTMLButtonElement => el !== null)
      const next = menuNavIndex(e.key, items.findIndex((el) => el === document.activeElement), items.length)
      if (next !== null) {
        e.preventDefault()
        items[next].focus()
      }
    }
    const onBlur = () => setMenuPos(null)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', onBlur)
    }
  }, [open])

  // Another section: the focus goes to its content (StickyApp). The current one changes
  // nothing, so it closes like Escape (a keyboard pick returns to the trigger).
  const select = (sectionId: string, viaKeyboard: boolean) => {
    if (sectionId === currentSectionId) {
      closeMenu(viaKeyboard)
      return
    }
    closeMenu(false)
    onSelect(sectionId)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="flex items-center gap-1 min-w-0 -mx-1 px-1 rounded font-light hover:bg-surface-2 focus-visible:bg-surface-2 outline-none transition-colors"
        style={{ ...NO_DRAG, color: `rgb(${colorChannels(color)})` }}
        onClick={() => (open ? closeMenu(false) : openMenu())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            openMenu()
          }
        }}
        title={t.sticky.switchSection}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="truncate">{sectionName}</span>
        <ChevronDown size={10} className="flex-shrink-0 opacity-70" />
      </button>
      {menuPos && (
        <>
          <div className="fixed inset-0 z-40" style={NO_DRAG} onMouseDown={() => closeMenu(false)} />
          <ContextMenu x={menuPos.x} y={menuPos.y} className={SECTION_MENU_CLASS}>
            <div role="menu" aria-label={t.sticky.sections} style={NO_DRAG}>
              {sections.map((s, i) => {
                const isCurrent = s.id === currentSectionId
                return (
                  <button
                    key={s.id}
                    ref={(el) => { itemRefs.current[i] = el }}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isCurrent}
                    tabIndex={-1}
                    className={`${MENU_ITEM_CLASS} focus:bg-surface-3 outline-none`}
                    // Keyboard activation (Enter / Space) fires a click with detail 0.
                    onClick={(e) => select(s.id, e.detail === 0)}
                    onMouseEnter={(e) => e.currentTarget.focus()}
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: `rgb(${colorChannels(s.color)})` }}
                    />
                    <span className={`flex-1 min-w-0 truncate ${isCurrent ? 'font-semibold' : ''}`}>{s.name}</span>
                    <Check size={12} className={`flex-shrink-0 ${isCurrent ? '' : 'invisible'}`} />
                  </button>
                )
              })}
            </div>
          </ContextMenu>
        </>
      )}
    </>
  )
}

// Custom TitleBar for the sticky window
function StickyTitleBar({ noteTitle, sectionName, color, onFold, isPinned, onTogglePin, sections, currentSectionId, onSelectSection }: {
  noteTitle: string
  sectionName?: string
  color: GroupColor
  onFold: () => void
  isPinned?: boolean
  onTogglePin?: () => void
  /** With 2+ sections (and `onSelectSection`), the section name becomes a switcher. */
  sections?: SectionOption[]
  currentSectionId?: string
  onSelectSection?: (sectionId: string) => void
}) {
  const t = useT()
  const canSwitch = !!sectionName && !!onSelectSection && !!currentSectionId && !!sections && sections.length >= 2
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
            {canSwitch ? (
              <SectionSwitcher
                sectionName={sectionName}
                color={color}
                sections={sections}
                currentSectionId={currentSectionId}
                onSelect={onSelectSection}
              />
            ) : (
              <span className="truncate font-light" style={{ color: `rgb(${colorChannels(color)})` }}>{sectionName}</span>
            )}
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
          onClick={() => void closeWindowAfterSaving()}
          title={t.sticky.close}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

// Compact folded pill shown when the sticky note is collapsed. Fills the whole
// window (h-screen) instead of a fixed 32px: on Windows the OS clamps the folded
// window to ~39px tall, and a fixed height would leave the window background showing.
function FoldedPill({ noteTitle, sectionName, color, onUnfold }: {
  noteTitle: string
  sectionName?: string
  color: GroupColor
  onUnfold: () => void
}) {
  const t = useT()
  return (
    <div
      className="h-screen flex items-center justify-between px-2 gap-1 cursor-default select-none bg-surface-0 rounded-lg overflow-hidden border border-border/40"
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
          onClick={() => void closeWindowAfterSaving()}
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
  // Raw textarea: base + outbox of its writes for the section shown (`key`), to tell
  // their echoes from external updates (lib/externalContentSync), and the selection
  // to restore after an external update replaced the text.
  const rawSyncRef = useRef<{ key: string; sync: ContentSync } | null>(null)
  const rawTextareaRef = useRef<HTMLTextAreaElement>(null)
  const rawSelectionRef = useRef<{ start: number; end: number } | null>(null)
  // IME composition running in the textarea: external updates wait for its end.
  const rawComposingRef = useRef(false)
  const rawDeferredRef = useRef(false)
  const rawRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (rawRetryTimerRef.current) clearTimeout(rawRetryTimerRef.current) }, [])
  // Debounced raw save (like NoteEditor's raw mode): registered in lib/pendingEdits, so
  // the close button (closeWindowAfterSaving) and beforeunload flush it; flushed on
  // unmount too.
  const [rawSave] = useState(createDebouncedSave)
  useEffect(() => () => rawSave.flush(), [rawSave])
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

  // Sync local buffer when section changes or store updates. The store lags behind the
  // textarea (debounced, queued writes): an echo of an older write must not reset the
  // text (the next save would drop the chars typed since). Genuine external content is
  // applied, or merged with a write still pending/in flight (lib/externalContentSync).
  const syncRawFromStore = () => {
    if (!section) return
    const incoming = section.content
    const tracked = rawSyncRef.current
    if (tracked?.key !== section.id) {
      rawSyncRef.current = { key: section.id, sync: createContentSync(incoming) }
      rawDeferredRef.current = false
      // A textarea unmounted mid-composition (keyed by section) never fires compositionend.
      rawComposingRef.current = false
      if (incoming !== rawContent) setRawContent(incoming)
      return
    }
    if (rawComposingRef.current) {
      rawDeferredRef.current = true
      return
    }
    rawDeferredRef.current = false
    const result = resolveExternalContent(tracked.sync, { incoming, current: rawContent, pending: rawSave.isPending() })
    if (result.kind !== 'apply' && result.kind !== 'merge') return
    const next = result.kind === 'apply' ? incoming : result.merged
    const textarea = rawTextareaRef.current
    if (textarea && textarea === document.activeElement) {
      rawSelectionRef.current = {
        start: mapOffsetThroughChange(rawContent, next, textarea.selectionStart),
        end: mapOffsetThroughChange(rawContent, next, textarea.selectionEnd),
      }
    }
    setRawContent(next)
    if (result.kind === 'merge') scheduleRawSave(next)
  }
  useEffect(() => syncRawFromStore(), [section?.id, section?.content]) // eslint-disable-line react-hooks/exhaustive-deps
  // Latest closure, for the composition-end retry.
  const syncRawFromStoreRef = useRef(syncRawFromStore)
  useEffect(() => { syncRawFromStoreRef.current = syncRawFromStore })

  // After a switch from the section menu the focus goes to the new section's content:
  // the rich Editor autofocuses on mount; the raw / read-only textarea (keyed by
  // section) is focused here once mounted, caret at the start.
  const focusContentRef = useRef(false)
  useEffect(() => {
    if (!focusContentRef.current) return
    focusContentRef.current = false
    const textarea = rawTextareaRef.current
    if (!textarea) return
    textarea.focus()
    textarea.setSelectionRange(0, 0)
  }, [section?.id])

  // A controlled textarea whose value is replaced puts the caret at the end.
  useLayoutEffect(() => {
    const selection = rawSelectionRef.current
    rawSelectionRef.current = null
    if (selection) rawTextareaRef.current?.setSelectionRange(selection.start, selection.end)
  }, [rawContent])

  // Debounced write of the raw text, remembering it so its echo isn't taken for an
  // external update. "Nothing to write" = equal to our last write still in flight, not
  // to the store (Backspace back to the store's text while that write is queued must
  // still be written). Read-only (unlocked encrypted) stickies never write. Target
  // captured now (the section switcher can show another section before it fires) and
  // used as the debounce target: one scheduled for another section runs the pending one.
  const scheduleRawSave = (content: string) => {
    if (unlockedSections || !noteId || !sectionId) return
    const targetNoteId = noteId
    const targetSectionId = sectionId
    rawSave.schedule(targetNoteId, 600, () => {
      const stored = useNotesStore.getState().notes.find((n) => n.id === targetNoteId)
        ?.sections.find((s) => s.id === targetSectionId)?.content ?? ''
      const tracked = rawSyncRef.current
      if (tracked?.key === targetSectionId) {
        if (!needsSave(tracked.sync, content, stored)) return
        recordSave(tracked.sync, content, stored)
      } else if (stored === content) {
        return
      }
      void updateSection(targetNoteId, targetSectionId, { content })
    }, `${targetNoteId}/${targetSectionId}`)
  }

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
  // No "same as the store" check: Editor only calls this for a real change (see
  // its saveContent — the store may not show its last save in flight yet).
  const handleContentChange = (content: string) => {
    if (isReadOnly) return
    void updateSection(note.id, section.id, { content })
  }

  const handleRawChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isReadOnly) return
    const content = e.target.value
    setRawContent(content)
    scheduleRawSave(content)
  }

  // Sections the switcher lists (note order): the decrypted ones of an unlocked
  // encrypted note (they stay read-only). aiHidden only hides a section from the AI.
  const switchableSections = unlockedSections ?? note.sections
  const sectionOptions = switchableSections.map((s) => ({
    id: s.id,
    name: s.name,
    color: resolveGroupColor(s.name, sectionTagColors),
  }))

  // Shows another section in place. The pending edits of the one shown are written
  // first, still to it (raw: target captured at schedule time; rich: the Editor is keyed
  // by section). The raw buffer starts from the new section's text (syncRawFromStore
  // then re-keys its echo tracking), and the hash follows so a reload reopens it.
  const handleSelectSection = (nextSectionId: string) => {
    const next = switchableSections.find((s) => s.id === nextSectionId)
    if (!next || nextSectionId === section.id) return
    flushPendingEdits(note.id)
    setRawContent(next.content)
    focusContentRef.current = true
    setSectionId(nextSectionId)
    window.history.replaceState(null, '', stickyHashWithSection(window.location.hash, nextSectionId))
  }

  const showSectionName = showStickySectionName(section.name, switchableSections.length)
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
        sections={sectionOptions}
        currentSectionId={section.id}
        onSelectSection={handleSelectSection}
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
            // Per section: a fresh textarea (scroll at the top, no native undo history
            // reaching into the previous section's text).
            key={section.id}
            ref={rawTextareaRef}
            value={isReadOnly ? section.content : rawContent}
            onChange={handleRawChange}
            onBlur={() => rawSave.flush()}
            onCompositionStart={() => { rawComposingRef.current = true }}
            onCompositionEnd={() => {
              rawComposingRef.current = false
              // After the composed text's own change has rendered.
              if (!rawDeferredRef.current) return
              if (rawRetryTimerRef.current) clearTimeout(rawRetryTimerRef.current)
              rawRetryTimerRef.current = setTimeout(() => {
                rawRetryTimerRef.current = null
                syncRawFromStoreRef.current()
              }, 0)
            }}
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
              noteId={note.id}
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
