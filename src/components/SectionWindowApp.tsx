import { useEffect, useRef, useState } from 'react'
import { Loader2, Lock, Minus, Square, X } from 'lucide-react'
import { useNotesStore } from '../stores/notesStore'
import { useGroupsStore } from '../stores/groupsStore'
import { useTemplatesStore } from '../stores/templatesStore'
import { useSectionTagColorsStore } from '../stores/sectionTagColorsStore'
import { useThemeStore } from '../stores/themeStore'
import { useEditorSettingsStore } from '../stores/editorSettingsStore'
import { NoteEditor } from './Editor/NoteEditor'
import { useT } from '../i18n/useT'
import { decryptSections } from '../lib/cryptoUtils'
import { ownsKeys } from '../lib/keyScope'
import type { Note, NoteSection } from '../types'

// The window's single pane. Fixed: there is exactly one editor per section window.
const SECTION_WINDOW_PANE_ID = 'section-window'

function parseHash(): { noteId: string | null; sectionId: string | null } {
  // Expected: #section-window?noteId=xxx&sectionId=yyy
  const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '')
  return { noteId: params.get('noteId'), sectionId: params.get('sectionId') }
}

/**
 * "Open in new window": an editor-only window for one note, opened on one section
 * (BrowserWindow created by main's createSectionWindow). It renders NoteEditor — tabs
 * included, so the user can move to other sections — under a minimal frameless title
 * bar, with no sidebar.
 *
 * It is a SECONDARY window (store role 'section', set by App before this mounts): it
 * loads every note to edit them, but never schedules alarms on load, persists the main
 * window's UI state, prunes empty notes, syncs with GitHub/Cloud, indexes AI or checks
 * for updates — those stay with the main window / main process. Writes go through the
 * same per-section store path as split panes (updateSection/mutateSections), and the
 * main process' `notes-updated` broadcast keeps both directions in sync live.
 */
export function SectionWindowApp() {
  const t = useT()
  const [{ noteId: initialNoteId, sectionId: initialSectionId }] = useState(parseHash)
  const loadNotes = useNotesStore((s) => s.loadNotes)
  const isLoading = useNotesStore((s) => s.isLoading)
  const notesLoaded = useNotesStore((s) => s.notes.length > 0)
  // The window follows its pane, not the hash: a section-link pill clicked in here
  // navigates (navigateToSection → setActiveNote reuses this pane) and the editor must
  // move along with the store — a fixed note id would leave it on a section of another note.
  const pane = useNotesStore((s) => s.openPanes.find((p) => p.paneId === SECTION_WINDOW_PANE_ID) ?? null)
  const noteId = pane?.noteId ?? null
  const paneSectionId = pane?.sectionId
  const note = useNotesStore((s) => (noteId ? s.notes.find((n) => n.id === noteId) ?? null : null))
  const [loadedOnce, setLoadedOnce] = useState(false)

  // Single pane on the requested section — set BEFORE loading so NoteEditor mounts on it.
  useEffect(() => {
    if (!initialNoteId) return
    useNotesStore.setState({
      openPanes: [{ paneId: SECTION_WINDOW_PANE_ID, noteId: initialNoteId, ...(initialSectionId ? { sectionId: initialSectionId } : {}) }],
      activePaneId: SECTION_WINDOW_PANE_ID,
      activeNoteId: initialNoteId,
    })
  }, [initialNoteId, initialSectionId])

  // Load + live sync with every other window (same filter as the main window/stickies:
  // our own writes come back with our webContents id and are ignored).
  useEffect(() => {
    const loadAll = () => Promise.all([
      loadNotes(),
      useGroupsStore.getState().loadGroups(),
      // Templates must be loaded: "Save as template" rewrites the whole templates.json.
      useTemplatesStore.getState().loadTemplates(),
      useSectionTagColorsStore.getState().loadSectionTagColors(),
    ])
    void loadAll().finally(() => setLoadedOnce(true))

    const currentWindowId = typeof window.noteflow?.windowId === 'function' ? window.noteflow.windowId() : null
    const unbind = window.noteflow.onNotesUpdated((filePath, senderId) => {
      if (currentWindowId !== null && senderId === currentWindowId) return
      if (filePath) {
        void useNotesStore.getState().syncNote(filePath)
      } else {
        void loadAll()
        useThemeStore.getState().reloadUiSettings()
        useEditorSettingsStore.getState().reloadUiSettings()
      }
    })
    return () => unbind()
  }, [loadNotes])

  // Editor shortcuts (the main window's global handler isn't mounted here). Only the
  // ones that make sense in a single-note window; NoteEditor handles Ctrl+Tab itself.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isAccel = e.ctrlKey || e.metaKey
      if (!isAccel || e.altKey || e.shiftKey) return
      if (ownsKeys(e.target)) return
      const events: Record<string, string> = {
        KeyT: 'noteflow:add-tab',
        KeyW: 'noteflow:close-tab',
        KeyM: 'noteflow:toggle-raw',
        KeyF: 'noteflow:in-note-search',
        KeyS: 'noteflow:open-sticky-section',
        KeyG: 'noteflow:open-sticky-all',
      }
      const name = events[e.code]
      if (!name) return
      e.preventDefault()
      window.dispatchEvent(new CustomEvent(name))
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [])

  const section = note?.sections.find((s) => s.id === paneSectionId)
  const noteTitle = note ? note.title?.trim() || t.common.untitled : ''

  // Report the section we're on: main uses it to focus this window when the same
  // section is opened again, and the hash makes a reload land back on it.
  useEffect(() => {
    if (!noteId || !paneSectionId || !note?.sections.some((s) => s.id === paneSectionId)) return
    window.noteflow.setSectionWindowTarget(noteId, paneSectionId)
    window.history.replaceState(
      null,
      '',
      `#section-window?noteId=${encodeURIComponent(noteId)}&sectionId=${encodeURIComponent(paneSectionId)}`,
    )
  }, [noteId, paneSectionId, note?.sections])

  // OS window title (taskbar / alt-tab).
  useEffect(() => {
    document.title = note ? (section ? `${noteTitle} · ${section.name}` : noteTitle) : 'NoteFlow'
  }, [note, noteTitle, section])

  const firstLoad = !loadedOnce || (isLoading && !notesLoaded)

  return (
    <div className="flex flex-col h-screen bg-surface-0 text-text overflow-hidden">
      <div
        className="flex items-center h-8 bg-surface-0 border-b border-border select-none flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2 px-4 min-w-0 flex-1 text-xs font-mono">
          <span className="truncate text-text font-semibold">{noteTitle || 'NoteFlow'}</span>
          {section && (
            <>
              <span className="text-text-muted/40 flex-shrink-0">·</span>
              <span className="truncate text-text-muted">{section.name}</span>
            </>
          )}
        </div>
        <div className="flex h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            onClick={() => window.noteflow.minimize()}
            className="w-10 h-7 flex items-center justify-center text-text-muted hover:bg-surface-2 transition-colors"
            title={t.titleBar.minimize}
          >
            <Minus size={11} />
          </button>
          <button
            onClick={() => window.noteflow.maximize()}
            className="w-10 h-7 flex items-center justify-center text-text-muted hover:bg-surface-2 transition-colors"
            title={t.titleBar.maximize}
          >
            <Square size={10} />
          </button>
          <button
            onClick={() => window.noteflow.close()}
            className="w-10 h-7 flex items-center justify-center text-text-muted hover:bg-red-500 hover:text-white transition-colors"
            title={t.common.close}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      <main className="flex-1 overflow-hidden relative pr-1" style={{ background: 'rgb(var(--bg-editor))' }}>
        {firstLoad ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-5 h-5 border-2 border-text/20 border-t-text rounded-full animate-spin" />
            <div className="text-xs font-mono text-text-muted">{t.shell.loadingNotes}</div>
          </div>
        ) : !note ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <div className="text-sm font-mono text-red-400 mb-2">{t.sticky.noteNotFound}</div>
            <div className="text-xs font-mono text-text-muted">{t.sticky.mayHaveBeenDeleted}</div>
          </div>
        ) : note.encryption ? (
          // Encrypted notes are never edited from here (the menu/palette don't offer it;
          // this covers an old hash or a note encrypted after the window opened).
          <EncryptedReadOnlyView key={note.id} note={note} initialSectionId={paneSectionId ?? initialSectionId} />
        ) : (
          <NoteEditor noteId={note.id} paneId={SECTION_WINDOW_PANE_ID} standalone />
        )}
      </main>
    </div>
  )
}

/**
 * Read-only view of an encrypted note, like the sticky window: unlock decrypts into LOCAL
 * state only (no session password in the store, so nothing in this window can write the
 * note). If the ciphertext changes (edited in the main window), it is decrypted again
 * with the same password; a failure locks the view again.
 */
function EncryptedReadOnlyView({ note, initialSectionId }: { note: Note; initialSectionId: string | null }) {
  const t = useT()
  const [sections, setSections] = useState<NoteSection[] | null>(null)
  const [viewSectionId, setViewSectionId] = useState<string | null>(initialSectionId)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const passwordRef = useRef<string | null>(null)
  const encryption = note.encryption

  useEffect(() => {
    const pw = passwordRef.current
    if (!encryption || !pw) return
    let cancelled = false
    decryptSections(encryption, pw)
      .then((next) => { if (!cancelled) setSections(next) })
      .catch(() => { if (!cancelled) { passwordRef.current = null; setSections(null) } })
    return () => { cancelled = true }
  }, [encryption])

  const unlock = async () => {
    if (!encryption || !password || loading) return
    setLoading(true)
    setError('')
    try {
      setSections(await decryptSections(encryption, password))
      passwordRef.current = password
      setPassword('')
    } catch {
      setError(t.encryption.wrongPassword)
    } finally {
      setLoading(false)
    }
  }

  if (!sections) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-4 max-w-sm mx-auto">
        <Lock size={22} className="text-text-muted opacity-30" />
        <p className="text-xs font-mono text-text-muted text-center">{t.encryption.noteEncrypted}</p>
        <p className="text-[11px] font-mono text-text-muted/70 text-center">{t.shell.encryptedReadOnlyHint}</p>
        <input
          autoFocus
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError('') }}
          onKeyDown={(e) => { if (e.key === 'Enter') void unlock() }}
          placeholder={t.encryption.enterPassword}
          className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-xs font-mono text-text outline-none focus:border-text/30 transition-colors"
          autoComplete="off"
        />
        {error && <p className="text-xs font-mono text-red-400 text-center">{error}</p>}
        <button
          onClick={() => void unlock()}
          disabled={!password || loading}
          className="flex items-center gap-1.5 w-full justify-center px-3 py-1.5 text-xs font-mono bg-text text-surface-0 rounded hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          {loading && <Loader2 size={11} className="animate-spin" />}
          {t.encryption.unlock}
        </button>
      </div>
    )
  }

  const section = sections.find((s) => s.id === viewSectionId) ?? sections[0]
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-3 pt-2 flex-shrink-0 overflow-x-auto">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setViewSectionId(s.id)}
            className={`px-3 py-1 text-xs font-mono rounded-t whitespace-nowrap transition-colors ${
              s.id === section?.id ? 'text-text font-semibold bg-surface-2' : 'text-text-muted hover:text-text'
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1 px-3 py-1 bg-amber-500/10 border-y border-amber-500/20 flex-shrink-0">
        <Lock size={9} className="text-amber-400 flex-shrink-0" />
        <span className="text-[10px] font-mono text-amber-400/80">{t.sticky.readOnly} · {t.shell.encryptedReadOnlyHint}</span>
      </div>
      <textarea
        value={section?.content ?? ''}
        readOnly
        className="flex-1 w-full p-4 bg-transparent text-xs font-mono text-text border-none outline-none resize-none leading-relaxed"
        spellCheck={false}
      />
    </div>
  )
}
