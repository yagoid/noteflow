import { useEffect, useRef, useState } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import { useGroupsStore } from '../../stores/groupsStore'
import { useAiChatStore } from '../../stores/aiChatStore'
import type { Note } from '../../types'
import {
  Search, Plus, FolderOpen, Keyboard, X,
  Clock, FolderPlus, Upload, Download, RefreshCw, Cloud, Zap, Settings,
  Brain, MessageSquare, Sparkles, Link2, SlidersHorizontal, AppWindow,
} from 'lucide-react'
import { formatDate } from '../../i18n/formatDate'
import { useT } from '../../i18n/useT'
import { tf, plural } from '../../i18n/format'
import { escapeRegExp, getNoteSearchIndex, normalize } from '../../lib/searchUtils'
import { modKey } from '../../lib/platform'

function HighlightText({ text, query }: { text: string; query: string }) {
  const trimmed = query.trim()
  if (!trimmed) return <>{text}</>

  const matcher = new RegExp(`(${escapeRegExp(trimmed)})`, 'ig')
  const parts = text.split(matcher)
  if (parts.length <= 1) return <>{text}</>

  return (
    <>
      {parts.map((part, index) => (
        index % 2 === 1
          ? (
            <mark key={`${part}-${index}`} className="bg-text/15 text-text rounded px-[1px]">
              {part}
            </mark>
          )
          : <span key={`${part}-${index}`}>{part}</span>
      ))}
    </>
  )
}

interface Command {
  id: string
  label: string
  description?: string
  // English search terms so the fuzzy filter still finds a command by its English
  // name even when the UI (label/description) is running in another language.
  keywords?: string
  icon: React.ReactNode
  action: () => void
  category: 'create' | 'navigate' | 'action'
}

const ICON_CLS = 'text-text-muted/60'
const ICON_SIZE = 12

export function CommandPalette() {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    notes,
    setActiveNote,
    createNote,
    createTempNote,
  } = useNotesStore()

  const createGroup = useGroupsStore((s) => s.createGroup)
  const setBrainView = useNotesStore((s) => s.setBrainView)
  const openAiPanel = useAiChatStore((s) => s.openAiPanel)
  // Section of the active pane — what "Open section in new window" acts on (primitive
  // selectors: the target object itself is rebuilt on every call).
  const targetNoteId = useNotesStore((s) => s.getActiveSectionTarget()?.noteId ?? null)
  const targetSectionId = useNotesStore((s) => s.getActiveSectionTarget()?.sectionId ?? null)
  // Encrypted notes can't be opened in a section window (see NoteContextMenu).
  const targetEncrypted = useNotesStore((s) => !!s.notes.find((n) => n.id === targetNoteId)?.encryption)
  const t = useT()

  const [query, setQuery] = useState('')
  const [showCheatSheet, setShowCheatSheet] = useState(false)
  const [mode, setMode] = useState<'search' | 'create-group' | 'ask-ai'>('search')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (commandPaletteOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery('')
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode('search')
      const seenCheatSheet = window.localStorage.getItem('noteflow:palette-cheatsheet-seen') === '1'
      setShowCheatSheet(!seenCheatSheet)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [commandPaletteOpen])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (e.key === 'Escape' && commandPaletteOpen) {
        if (mode !== 'search') {
          setMode('search')
          setQuery('')
        } else {
          setCommandPaletteOpen(false)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [commandPaletteOpen, mode, setCommandPaletteOpen])

  const [selectedIdx, setSelectedIdx] = useState(0)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedIdx(0)
  }, [query])

  if (!commandPaletteOpen) return null

  // Labels/descriptions come from the dict (re-read each render via `t`); `keywords`
  // are English aliases so the fuzzy filter finds commands regardless of UI language.
  const cmd = t.palette.commands
  const staticCommands: Command[] = [
    {
      id: 'new-note',
      label: cmd.newNote.label,
      description: cmd.newNote.description,
      keywords: 'new note create blank',
      icon: <Plus size={ICON_SIZE} className={ICON_CLS} />,
      action: () => { createNote(); setCommandPaletteOpen(false) },
      category: 'create',
    },
    {
      id: 'new-temp-note',
      label: cmd.newTempNote.label,
      description: cmd.newTempNote.description,
      keywords: 'new temporary note temp auto delete',
      icon: <Clock size={ICON_SIZE} className={ICON_CLS} />,
      action: () => { createTempNote(); setCommandPaletteOpen(false) },
      category: 'create',
    },
    {
      id: 'create-group',
      label: cmd.createGroup.label,
      description: cmd.createGroup.description,
      keywords: 'create group new organize',
      icon: <FolderPlus size={ICON_SIZE} className={ICON_CLS} />,
      action: () => { setMode('create-group'); setQuery('') },
      category: 'create',
    },
    {
      id: 'open-brain',
      label: cmd.openBrain.label,
      description: cmd.openBrain.description,
      keywords: 'open brain graph 3d visualize',
      icon: <Brain size={ICON_SIZE} className={ICON_CLS} />,
      action: () => { setBrainView(true); setCommandPaletteOpen(false) },
      category: 'navigate',
    },
    {
      id: 'ai-chat',
      label: cmd.aiChat.label,
      description: cmd.aiChat.description,
      keywords: 'chat ai assistant ask',
      icon: <MessageSquare size={ICON_SIZE} className={ICON_CLS} />,
      action: () => { setBrainView(true); openAiPanel('chat'); setCommandPaletteOpen(false) },
      category: 'navigate',
    },
    {
      id: 'ai-ask',
      label: cmd.aiAsk.label,
      description: cmd.aiAsk.description,
      keywords: 'ask ai question',
      icon: <Sparkles size={ICON_SIZE} className={ICON_CLS} />,
      action: () => { setMode('ask-ai'); setQuery('') },
      category: 'navigate',
    },
    {
      id: 'ai-related',
      label: cmd.aiRelated.label,
      description: cmd.aiRelated.description,
      keywords: 'find related notes connections ai',
      icon: <Link2 size={ICON_SIZE} className={ICON_CLS} />,
      action: () => { setBrainView(true); openAiPanel('related'); setCommandPaletteOpen(false) },
      category: 'navigate',
    },
    {
      id: 'ai-profile',
      label: cmd.aiProfile.label,
      description: cmd.aiProfile.description,
      keywords: 'ai profile second brain',
      icon: <Sparkles size={ICON_SIZE} className={ICON_CLS} />,
      action: () => { setBrainView(true); openAiPanel('profile'); setCommandPaletteOpen(false) },
      category: 'navigate',
    },
    {
      id: 'ai-settings',
      label: cmd.aiSettings.label,
      description: cmd.aiSettings.description,
      keywords: 'ai provider settings model api key',
      icon: <SlidersHorizontal size={ICON_SIZE} className={ICON_CLS} />,
      action: () => { setBrainView(true); openAiPanel('settings'); setCommandPaletteOpen(false) },
      category: 'action',
    },
    {
      id: 'export',
      label: cmd.export.label,
      description: cmd.export.description,
      keywords: 'export notes save file',
      icon: <Upload size={ICON_SIZE} className={ICON_CLS} />,
      action: () => { window.dispatchEvent(new CustomEvent('noteflow:open-export')); setCommandPaletteOpen(false) },
      category: 'action',
    },
    {
      id: 'import',
      label: cmd.import.label,
      description: cmd.import.description,
      keywords: 'import notes load file',
      icon: <Download size={ICON_SIZE} className={ICON_CLS} />,
      action: () => { window.dispatchEvent(new CustomEvent('noteflow:open-import')); setCommandPaletteOpen(false) },
      category: 'action',
    },
    {
      id: 'sync',
      label: cmd.sync.label,
      description: cmd.sync.description,
      keywords: 'sync notes pull github',
      icon: <RefreshCw size={ICON_SIZE} className={ICON_CLS} />,
      action: () => { window.dispatchEvent(new CustomEvent('noteflow:sync-notes')); setCommandPaletteOpen(false) },
      category: 'action',
    },
    {
      id: 'github-sync',
      label: cmd.githubSync.label,
      description: cmd.githubSync.description,
      keywords: 'github sync configuration',
      icon: <Cloud size={ICON_SIZE} className={ICON_CLS} />,
      action: () => { window.dispatchEvent(new CustomEvent('noteflow:open-github-sync')); setCommandPaletteOpen(false) },
      category: 'action',
    },
    {
      id: 'check-update',
      label: cmd.checkUpdate.label,
      description: cmd.checkUpdate.description,
      keywords: 'check for updates version',
      icon: <Zap size={ICON_SIZE} className={ICON_CLS} />,
      action: () => { window.dispatchEvent(new CustomEvent('noteflow:check-for-update')); setCommandPaletteOpen(false) },
      category: 'action',
    },
    {
      id: 'startup-settings',
      label: cmd.startup.label,
      description: cmd.startup.description,
      keywords: 'startup settings autostart launch',
      icon: <Settings size={ICON_SIZE} className={ICON_CLS} />,
      action: () => { window.dispatchEvent(new CustomEvent('noteflow:open-startup')); setCommandPaletteOpen(false) },
      category: 'action',
    },
    {
      id: 'open-folder',
      label: cmd.openFolder.label,
      description: '~/noteflow-notes',
      keywords: 'open notes folder directory',
      icon: <FolderOpen size={ICON_SIZE} className={ICON_CLS} />,
      action: () => { window.noteflow.openNotesFolder(); setCommandPaletteOpen(false) },
      category: 'action',
    },
    ...(targetNoteId && targetSectionId && !targetEncrypted
      ? [{
          id: 'open-section-window',
          label: cmd.openSectionWindow.label,
          description: cmd.openSectionWindow.description,
          keywords: 'open section new window separate detach',
          icon: <AppWindow size={ICON_SIZE} className={ICON_CLS} />,
          action: () => {
            window.noteflow.openSectionWindow(targetNoteId, targetSectionId)
            setCommandPaletteOpen(false)
          },
          category: 'action' as const,
        }]
      : []),
    {
      id: 'shortcuts',
      label: cmd.shortcuts.label,
      description: cmd.shortcuts.description,
      keywords: 'keyboard shortcuts reference help',
      icon: <Keyboard size={ICON_SIZE} className={ICON_CLS} />,
      action: () => {
        window.dispatchEvent(new CustomEvent('noteflow:open-shortcuts'))
        setCommandPaletteOpen(false)
      },
      category: 'action',
    },
  ]

  const q = query.toLowerCase().trim()
  // Accent-insensitive, and reuses the cached per-note normalized index so scanning
  // every note's body here doesn't re-normalize on each keystroke (see searchUtils).
  const nq = normalize(query)

  const matchedNotes: Command[] = q
    ? notes
        .filter((n) => {
          if (n.archived) return false
          const idx = getNoteSearchIndex(n)
          return (
            idx.title.includes(nq) ||
            idx.sectionContents.some((c) => c.includes(nq)) ||
            idx.sectionNames.some((s) => s.includes(nq)) ||
            idx.tags.some((tag) => tag.includes(nq))
          )
        })
        .slice(0, 8)
        .map((n: Note) => ({
          id: `note-${n.id}`,
          label: n.title || t.common.untitled,
          description: formatDate(new Date(n.updated), 'MMM d · HH:mm'),
          icon: <Search size={ICON_SIZE} className={ICON_CLS} />,
          action: () => { setActiveNote(n.id); setCommandPaletteOpen(false) },
          category: 'navigate' as const,
        }))
    : []

  const matchedCommands = q
    ? staticCommands.filter(
        (c) =>
          c.label.toLowerCase().includes(q) ||
          (c.description?.toLowerCase().includes(q) ?? false) ||
          (c.keywords?.includes(q) ?? false)
      )
    : staticCommands

  const allItems = mode === 'search' ? [...matchedCommands, ...matchedNotes] : []

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mode === 'create-group') {
      if (e.key === 'Enter' && query.trim()) {
        e.preventDefault()
        createGroup(query.trim(), '--accent')
        setCommandPaletteOpen(false)
      }
      return
    }
    if (mode === 'ask-ai') {
      if (e.key === 'Enter' && query.trim()) {
        e.preventDefault()
        setBrainView(true)
        openAiPanel('chat', query.trim())
        setCommandPaletteOpen(false)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((i) => (allItems.length === 0 ? 0 : (i + 1) % allItems.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((i) => (allItems.length === 0 ? 0 : (i <= 0 ? allItems.length - 1 : i - 1)))
    } else if (e.key === 'Enter' && allItems[selectedIdx]) {
      allItems[selectedIdx].action()
    }
  }

  const dismissCheatSheet = () => {
    setShowCheatSheet(false)
    window.localStorage.setItem('noteflow:palette-cheatsheet-seen', '1')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-32 bg-black/60 backdrop-blur-sm"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        className="w-full max-w-lg bg-surface-1 border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          {mode !== 'search' ? (
            <>
              {mode === 'create-group'
                ? <FolderPlus size={14} className="text-text-muted flex-shrink-0" />
                : <Sparkles size={14} className="text-text-muted flex-shrink-0" />}
              <button
                onClick={() => { setMode('search'); setQuery('') }}
                className="text-[10px] font-mono text-text-muted/50 hover:text-text-muted whitespace-nowrap flex-shrink-0 transition-colors"
              >
                {t.palette.commandsBreadcrumb}
              </button>
            </>
          ) : (
            <Search size={14} className="text-text-muted flex-shrink-0" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={mode === 'create-group' ? t.palette.groupNamePlaceholder : mode === 'ask-ai' ? t.palette.askPlaceholder : t.palette.searchPlaceholder}
            className="flex-1 bg-transparent text-xs font-mono text-text placeholder-text-muted/50
                       outline-none caret-text"
          />
          <button
            onClick={() => setCommandPaletteOpen(false)}
            className="text-text-muted hover:text-text transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-1">
          {mode === 'create-group' ? (
            <div className="px-4 py-8 text-center">
              <p className="text-xs font-mono text-text-muted">
                {query.trim() ? (
                  <>
                    {t.palette.press}{' '}
                    <kbd className="bg-surface-2 border border-border px-1 py-0.5 rounded text-[10px]">Enter</kbd>
                    {' '}{t.palette.createSuffix}{' '}
                    <span className="text-text">"{query.trim()}"</span>
                  </>
                ) : t.palette.typeGroupName}
              </p>
              <p className="text-[10px] font-mono text-text-muted/40 mt-1.5">{t.palette.escToGoBack}</p>
            </div>
          ) : mode === 'ask-ai' ? (
            <div className="px-4 py-8 text-center">
              <p className="text-xs font-mono text-text-muted">
                {query.trim() ? (
                  <>
                    {t.palette.press}{' '}
                    <kbd className="bg-surface-2 border border-border px-1 py-0.5 rounded text-[10px]">Enter</kbd>
                    {' '}{t.palette.askSuffix}
                  </>
                ) : t.palette.typeQuestion}
              </p>
              <p className="text-[10px] font-mono text-text-muted/40 mt-1.5">{t.palette.opensBrainChat}</p>
            </div>
          ) : (
            <>
              {showCheatSheet && !q && (
                <div className="mx-3 mt-2 mb-2 rounded border border-text/15 bg-surface-2 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">{t.palette.quickShortcuts}</span>
                    <button
                      onClick={dismissCheatSheet}
                      className="text-[10px] font-mono text-text-muted/70 hover:text-text transition-colors"
                    >
                      {t.palette.hide}
                    </button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] font-mono text-text-muted/80">
                    <span className="flex items-center gap-1"><kbd className="bg-surface-2 border border-border px-1 py-0.5 rounded">{modKey}+P</kbd> {t.palette.scPalette}</span>
                    <span className="flex items-center gap-1"><kbd className="bg-surface-2 border border-border px-1 py-0.5 rounded">{modKey}+N</kbd> {t.palette.scNote}</span>
                    <span className="flex items-center gap-1"><kbd className="bg-surface-2 border border-border px-1 py-0.5 rounded">{modKey}+F</kbd> {t.palette.scSearch}</span>
                    <span className="flex items-center gap-1"><kbd className="bg-surface-2 border border-border px-1 py-0.5 rounded">{modKey}+Shift+E</kbd> {t.palette.scRawEditor}</span>
                  </div>
                </div>
              )}

              <div className="px-4 py-1 text-[10px] font-mono text-text-muted/60 uppercase tracking-wider">
                {plural(t.palette.results, allItems.length)}
              </div>

              {allItems.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs font-mono text-text-muted">
                  {tf(t.palette.noResults, { query })}
                </div>
              ) : (
                <>
                  {matchedCommands.length > 0 && (
                    <>
                      <div className="px-3 py-1">
                        <span className="text-[10px] font-mono text-text-muted/40 uppercase tracking-wider">{t.palette.commandsHeader}</span>
                      </div>
                      {matchedCommands.map((cmd, i) => (
                        <CommandItem
                          key={cmd.id}
                          cmd={cmd}
                          query={query}
                          isSelected={selectedIdx === i}
                          onHover={() => setSelectedIdx(i)}
                        />
                      ))}
                    </>
                  )}
                  {matchedNotes.length > 0 && (
                    <>
                      <div className="px-3 py-1 mt-1">
                        <span className="text-[10px] font-mono text-text-muted/40 uppercase tracking-wider">{t.palette.notesHeader}</span>
                      </div>
                      {matchedNotes.map((cmd, i) => (
                        <CommandItem
                          key={cmd.id}
                          cmd={cmd}
                          query={query}
                          isSelected={selectedIdx === matchedCommands.length + i}
                          onHover={() => setSelectedIdx(matchedCommands.length + i)}
                        />
                      ))}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border flex gap-3">
          {mode !== 'search' ? (
            <>
              {[['↵', mode === 'ask-ai' ? t.palette.footer.ask : t.palette.footer.create], ['esc', t.palette.footer.back]].map(([key, label]) => (
                <span key={key} className="flex items-center gap-1 text-[10px] font-mono text-text-muted/50">
                  <kbd className="bg-surface-2 border border-border px-1 py-0.5 rounded text-[10px]">{key}</kbd>
                  {label}
                </span>
              ))}
            </>
          ) : (
            <>
              {[['↑↓', t.palette.footer.navigate], ['↵', t.palette.footer.select], ['esc', t.palette.footer.close], [`${modKey}+P`, t.palette.footer.toggle]].map(([key, label]) => (
                <span key={key} className="flex items-center gap-1 text-[10px] font-mono text-text-muted/50">
                  <kbd className="bg-surface-2 border border-border px-1 py-0.5 rounded text-[10px]">{key}</kbd>
                  {label}
                </span>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function CommandItem({
  cmd,
  query,
  isSelected,
  onHover,
}: {
  cmd: Command
  query: string
  isSelected: boolean
  onHover: () => void
}) {
  return (
    <button
      onClick={cmd.action}
      onMouseEnter={onHover}
      className={`w-full flex items-center gap-3 px-4 py-1.5 text-left transition-colors
        ${isSelected ? 'bg-surface-2' : 'hover:bg-surface-3'}`}
    >
      <span className="flex-shrink-0">{cmd.icon}</span>
      <div className="flex-1 min-w-0">
        <span className="text-xs font-mono text-text truncate block"><HighlightText text={cmd.label} query={query} /></span>
        {cmd.description && (
          <span className="text-[10px] font-mono text-text-muted/50 truncate block"><HighlightText text={cmd.description} query={query} /></span>
        )}
      </div>
    </button>
  )
}
