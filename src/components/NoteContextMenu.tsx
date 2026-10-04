import { useEffect, useState } from 'react'
import {
  Archive, Star, StarOff, Trash2, Lock, Unlock, Copy, CopyPlus, Columns2, Share,
  ExternalLink, FolderPlus, FolderMinus, Folder, ChevronRight, LayoutGrid, Eye, EyeOff, AppWindow,
} from 'lucide-react'
import { useNotesStore } from '../stores/notesStore'
import { useGroupsStore } from '../stores/groupsStore'
import { useSectionTagColorsStore } from '../stores/sectionTagColorsStore'
import { colorChannels, normalizeTagColorKey, resolveGroupColor, TAG_COLOR_VARS } from '../lib/tagColors'
import { ConfirmModal } from './ConfirmModal'
import { CustomColorSwatch } from './CustomColorSwatch'
import { EncryptionModal } from './EncryptionModal'
import { ContextMenu } from './ContextMenu'
import { useT } from '../i18n/useT'
import { tf } from '../i18n/format'
import type { Note, GroupColor } from '../types'

const GROUP_COLORS: GroupColor[] = [...TAG_COLOR_VARS]

export interface NoteContextMenuRequest {
  x: number
  y: number
  noteId: string
  sectionId: string | null
}

interface NoteContextMenuProps {
  request: NoteContextMenuRequest | null
  onClose: () => void
}

/**
 * Right-click menu for a note (and optionally a specific section). Self-contained:
 * owns its submenu pickers and the confirm / encryption modals so it can be dropped
 * into any view (sidebar, group overview…). The parent should render it
 * unconditionally and toggle visibility through `request`.
 *
 * The modals live here (not in the keyed body) so dismissing the menu doesn't kill
 * an in-flight delete/unlock dialog; the menu body is keyed by `request` so each
 * open starts with fresh submenu/input state.
 */
export function NoteContextMenu({ request, onClose }: NoteContextMenuProps) {
  const t = useT()
  const rawNotes = useNotesStore((s) => s.notes)
  const deleteNote = useNotesStore((s) => s.deleteNote)
  const mutateSections = useNotesStore((s) => s.mutateSections)
  const encryptNote = useNotesStore((s) => s.encryptNote)
  const unlockNote = useNotesStore((s) => s.unlockNote)
  const removeNoteEncryption = useNotesStore((s) => s.removeNoteEncryption)

  // Modals outlive `request` (menu closes when an option is picked)
  const [modal, setModal] = useState<{
    title: string
    message: string
    confirmLabel: string
    danger: boolean
    onConfirm: () => void
  } | null>(null)
  const [encModal, setEncModal] = useState<{ mode: 'encrypt' | 'unlock' | 'remove'; noteId: string } | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  // Close the menu on outside click / Escape (modals manage their own dismissal)
  useEffect(() => {
    if (!request) return
    const close = () => onClose()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('click', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [request, onClose])

  const confirmDelete = (note: Note) => {
    setModal({
      title: t.common.deleteNote,
      message: tf(t.common.deleteNoteMessage, { title: note.title || t.common.untitled }),
      confirmLabel: t.common.delete,
      danger: true,
      onConfirm: () => { setModal(null); deleteNote(note.id) },
    })
  }

  const confirmDeleteSection = (note: Note, sectionId: string) => {
    const section = note.sections.find((s) => s.id === sectionId)
    if (!section) return
    setModal({
      title: t.common.deleteSection,
      message: tf(t.common.deleteSectionMessage, { name: section.name }),
      confirmLabel: t.common.delete,
      danger: true,
      onConfirm: () => {
        setModal(null)
        // Filter the latest list (an open editor may have edited other sections meanwhile).
        void mutateSections(note.id, (sections) =>
          sections.length > 1 && sections.some((s) => s.id === sectionId)
            ? sections.filter((s) => s.id !== sectionId)
            : null,
        )
      },
    })
  }

  return (
    <>
      {request && (
        <NoteMenuBody
          key={`${request.noteId}:${request.sectionId ?? ''}:${request.x}:${request.y}`}
          request={request}
          onClose={onClose}
          onConfirmDelete={confirmDelete}
          onConfirmDeleteSection={confirmDeleteSection}
          onUnlockThenDelete={(noteId) => { onClose(); setPendingDeleteId(noteId); setEncModal({ mode: 'unlock', noteId }) }}
          onEncModal={(mode, noteId) => { onClose(); setEncModal({ mode, noteId }) }}
        />
      )}

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

      {encModal && (() => {
        const encNote = rawNotes.find((n) => n.id === encModal.noteId)
        if (!encNote) return null
        return (
          <EncryptionModal
            mode={encModal.mode}
            noteTitle={encNote.title}
            onConfirm={async (password, options) => {
              if (encModal.mode === 'encrypt') {
                await encryptNote(encModal.noteId, password, options)
              } else if (encModal.mode === 'unlock') {
                await unlockNote(encModal.noteId, password)
                if (pendingDeleteId === encModal.noteId) {
                  const target = rawNotes.find((n) => n.id === pendingDeleteId)
                  setPendingDeleteId(null)
                  setEncModal(null)
                  if (target) confirmDelete(target)
                  return
                }
              } else {
                await removeNoteEncryption(encModal.noteId, password)
              }
              setEncModal(null)
            }}
            onCancel={() => { setPendingDeleteId(null); setEncModal(null) }}
          />
        )
      })()}
    </>
  )
}

interface NoteMenuBodyProps {
  request: NoteContextMenuRequest
  onClose: () => void
  onConfirmDelete: (note: Note) => void
  onConfirmDeleteSection: (note: Note, sectionId: string) => void
  onUnlockThenDelete: (noteId: string) => void
  onEncModal: (mode: 'encrypt' | 'unlock' | 'remove', noteId: string) => void
}

// The visible menu. Mounted fresh per open (keyed by request) so its submenu and
// inline-input state always starts clean.
function NoteMenuBody({ request, onClose, onConfirmDelete, onConfirmDeleteSection, onUnlockThenDelete, onEncModal }: NoteMenuBodyProps) {
  const t = useT()
  const rawNotes = useNotesStore((s) => s.notes)
  const updateNote = useNotesStore((s) => s.updateNote)
  const updateSection = useNotesStore((s) => s.updateSection)
  const archiveNote = useNotesStore((s) => s.archiveNote)
  const duplicateNote = useNotesStore((s) => s.duplicateNote)
  const duplicateSection = useNotesStore((s) => s.duplicateSection)
  const navigateToSection = useNotesStore((s) => s.navigateToSection)
  const lockNote = useNotesStore((s) => s.lockNote)
  const sessionPasswords = useNotesStore((s) => s.sessionPasswords)
  const setNoteView = useNotesStore((s) => s.setNoteView)
  const openNoteInSplit = useNotesStore((s) => s.openNoteInSplit)

  const groups = useGroupsStore((s) => s.groups)
  const folders = useGroupsStore((s) => s.folders)
  const createGroup = useGroupsStore((s) => s.createGroup)
  const createFolder = useGroupsStore((s) => s.createFolder)

  const sectionTagColors = useSectionTagColorsStore((s) => s.sectionTagColors)
  const setSectionTagColor = useSectionTagColorsStore((s) => s.setSectionTagColor)
  const clearSectionTagColor = useSectionTagColorsStore((s) => s.clearSectionTagColor)

  const [folderPickerOpen, setFolderPickerOpen] = useState(false)
  const [groupPickerOpen, setGroupPickerOpen] = useState(false)
  const [pickerFlip, setPickerFlip] = useState<{ x: boolean; y: boolean }>({ x: false, y: false })
  const [groupNameInput, setGroupNameInput] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState<string | null>(null)

  const note = rawNotes.find((n) => n.id === request.noteId) ?? null
  if (!note) return null

  const currentGroup = note.group ? groups.find((g) => g.id === note.group) ?? null : null
  const currentSection = request.sectionId
    ? note.sections.find((section) => section.id === request.sectionId) ?? null
    : null
  // Only offer per-section delete when the menu targets a section and the note
  // has more than one — deleting the lone section would leave an empty note.
  const canDeleteSection = !!currentSection && note.sections.length > 1
  // Locked encrypted notes have no readable content to export or copy.
  const isLocked = !!note.encryption && !sessionPasswords[note.id]
  const currentSectionColor = currentSection
    ? sectionTagColors[normalizeTagColorKey(currentSection.name)]
    : undefined

  return (
    <ContextMenu
      x={request.x}
      y={request.y}
      className="fixed z-50 bg-surface-2 border border-border rounded shadow-xl py-1 w-48 animate-in fade-in zoom-in duration-100"
    >
      {/* Note-level actions — hidden when the menu targets a specific section */}
      {!currentSection && (
        <>
          <button
            onClick={() => { updateNote(note.id, { favorited: !note.favorited }); onClose() }}
            className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
          >
            {note.favorited ? <StarOff size={12} /> : <Star size={12} />}
            {note.favorited ? t.common.removeFromFavorites : t.common.addToFavorites}
          </button>
          <button
            onClick={() => { archiveNote(note.id); onClose() }}
            className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
          >
            <Archive size={12} />
            {note.archived ? t.common.unarchive : t.common.archive}
          </button>
        </>
      )}
      {note.encryption && !sessionPasswords[note.id] && (
        <button
          onClick={() => onEncModal('unlock', note.id)}
          className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
        >
          <Unlock size={12} />
          {t.noteMenu.unlockNote}
        </button>
      )}
      {note.encryption && !!sessionPasswords[note.id] && (
        <button
          onClick={() => { lockNote(note.id); onClose() }}
          className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
        >
          <Lock size={12} />
          {t.noteMenu.lockNote}
        </button>
      )}
      {note.encryption && (
        <button
          onClick={() => onEncModal('remove', note.id)}
          className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
        >
          <Unlock size={12} />
          {t.noteMenu.removeEncryption}
        </button>
      )}
      {!currentSection && (
        <>
          <button
            onClick={() => { openNoteInSplit(note.id); onClose() }}
            className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
          >
            <Columns2 size={12} />
            {t.noteMenu.openAlongside}
          </button>
          <button
            onClick={() => { duplicateNote(note.id); onClose() }}
            className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
          >
            <Copy size={12} />
            {t.noteMenu.duplicateNote}
          </button>
          {!isLocked && (
            <button
              onClick={() => {
                onClose()
                window.dispatchEvent(new CustomEvent('noteflow:open-export', { detail: { noteId: note.id } }))
              }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
            >
              <Share size={12} />
              {t.common.exportNote}
            </button>
          )}
        </>
      )}
      <button
        onClick={() => { setNoteView(note.id); onClose() }}
        className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
      >
        <LayoutGrid size={12} />
        {t.noteMenu.noteOverview}
      </button>

      {currentSection && (
        <>
          <div className="h-px bg-border my-1" />
          {/* Opens a pane of its own on this section — also when the note is already open
              in another pane (two sections of one note side by side). */}
          <button
            onClick={() => { openNoteInSplit(note.id, currentSection.id); onClose() }}
            className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
          >
            <Columns2 size={12} />
            {t.noteMenu.openSectionAlongside}
          </button>
          {!note.encryption && (
            <button
              onClick={() => {
                void updateSection(note.id, currentSection.id, { aiHidden: !currentSection.aiHidden })
                onClose()
              }}
              title={currentSection.aiHidden ? t.noteMenu.aiShowTooltip : t.noteMenu.aiHideTooltip}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
            >
              {currentSection.aiHidden ? <Eye size={12} /> : <EyeOff size={12} />}
              {currentSection.aiHidden ? t.common.showToAI : t.common.hideFromAI}
            </button>
          )}
          {!isLocked && (
            <button
              onClick={() => {
                onClose()
                const name = tf(t.common.sectionCopyName, { name: currentSection.name })
                void duplicateSection(note.id, currentSection.id, name).then((copy) => {
                  if (copy) navigateToSection(note.id, copy.id)
                })
              }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
            >
              <CopyPlus size={12} />
              {t.common.duplicateSection}
            </button>
          )}
          <div className="px-3 pt-1 text-[10px] font-mono text-text-muted uppercase tracking-wider">
            {t.noteMenu.sectionColor}
          </div>
          <div className="px-3 py-2">
            <div className="flex gap-1.5 flex-wrap">
              {GROUP_COLORS.map((color) => (
                <button
                  key={`section-color-${color}`}
                  title={color.replace('--', '')}
                  onClick={(e) => {
                    e.stopPropagation()
                    void setSectionTagColor(currentSection.name, color)
                    onClose()
                  }}
                  className={`w-4 h-4 rounded-full transition-transform hover:scale-110 ${currentSectionColor === color ? 'ring-1 ring-white/50 ring-offset-1 ring-offset-surface-2' : ''}`}
                  style={{ background: `rgb(${colorChannels(color)})` }}
                />
              ))}
              <CustomColorSwatch
                value={currentSectionColor ?? resolveGroupColor(currentSection.name)}
                onPick={(c) => { void setSectionTagColor(currentSection.name, c) }}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  void clearSectionTagColor(currentSection.name)
                  onClose()
                }}
                className={`px-1.5 h-4 rounded text-[9px] font-mono border transition-colors ${
                  currentSectionColor
                    ? 'text-text-muted border-border hover:text-text hover:border-text/30'
                    : 'text-text border-text/25 bg-surface-2'
                }`}
              >
                {t.noteMenu.autoColor}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Group placement (note-level) — hidden when the menu targets a section ── */}
      {!currentSection && (
        <>
      <div className="h-px bg-border my-1" />
      {currentGroup ? (
        <>
          {/* Move to folder submenu */}
          <div
            className="relative"
            onMouseEnter={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const groupFolders = folders.filter((f) => f.groupId === currentGroup.id)
              const submenuW = 160
              const submenuH = (groupFolders.length + 2) * 34
              setPickerFlip({
                x: rect.right + submenuW > window.innerWidth,
                y: rect.top + submenuH > window.innerHeight,
              })
              setFolderPickerOpen(true)
            }}
            onMouseLeave={() => { setFolderPickerOpen(false); setNewFolderName(null) }}
          >
            <button
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
            >
              <Folder size={12} />
              {t.noteMenu.moveToFolder}
              <ChevronRight size={10} className="ml-auto" />
            </button>

            {folderPickerOpen && (() => {
              const groupFolders = folders.filter((f) => f.groupId === currentGroup.id)
              return (
                <div
                  className="absolute z-50 bg-surface-2 border border-border rounded shadow-xl py-1 w-44 animate-in fade-in zoom-in duration-100"
                  style={{
                    [pickerFlip.x ? 'right' : 'left']: '100%',
                    [pickerFlip.y ? 'bottom' : 'top']: 0,
                  }}
                >
                  {note.folder && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        updateNote(note.id, { folder: undefined })
                        onClose()
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs font-mono text-text-muted hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
                    >
                      <FolderMinus size={12} />
                      {t.common.groupRoot}
                    </button>
                  )}
                  {groupFolders.map((f) => (
                    <button
                      key={f.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        updateNote(note.id, { folder: f.id })
                        onClose()
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs font-mono flex items-center gap-2 transition-colors hover:bg-surface-3 hover:text-text ${note.folder === f.id ? 'text-text' : 'text-text-muted'}`}
                    >
                      <Folder size={12} className="flex-shrink-0" style={{ color: `rgb(${colorChannels(currentGroup.color)})` }} />
                      <span className="truncate">{f.name}</span>
                    </button>
                  ))}
                  {groupFolders.length === 0 && newFolderName === null && (
                    <div className="px-3 py-1.5 text-[10px] font-mono text-text-muted/60">{t.common.noFoldersYet}</div>
                  )}
                  {newFolderName === null ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); setNewFolderName('') }}
                      className="w-full text-left px-3 py-1.5 text-xs font-mono text-text-muted hover:bg-surface-3 hover:text-text transition-colors"
                    >
                      {t.common.newFolderInline}
                    </button>
                  ) : (
                    <input
                      autoFocus
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={async (e) => {
                        e.stopPropagation()
                        if (e.key === 'Enter' && newFolderName.trim()) {
                          const folder = await createFolder(currentGroup.id, newFolderName.trim())
                          updateNote(note.id, { group: currentGroup.id, folder: folder.id })
                          onClose()
                        }
                        if (e.key === 'Escape') setNewFolderName(null)
                      }}
                      onClick={(e) => e.stopPropagation()}
                      placeholder={t.common.folderNamePlaceholder}
                      className="mx-3 my-1 px-2 py-1 text-xs font-mono bg-surface-1 border border-text/25 rounded outline-none text-text w-[calc(100%-1.5rem)] block placeholder-text-muted/40"
                    />
                  )}
                </div>
              )
            })()}
          </div>

          <button
            onClick={() => { updateNote(note.id, { group: undefined, folder: undefined }); onClose() }}
            className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
          >
            <FolderMinus size={12} />
            {t.noteMenu.removeFromGroup}
          </button>
        </>
      ) : (
        <>
          <div
            className="relative"
            onMouseEnter={(e) => {
              if (groups.length === 0) return
              const rect = e.currentTarget.getBoundingClientRect()
              const submenuW = 160
              const submenuH = (groups.length + 1) * 34
              setPickerFlip({
                x: rect.right + submenuW > window.innerWidth,
                y: rect.top + submenuH > window.innerHeight,
              })
              setGroupPickerOpen(true)
              setGroupNameInput(null)
            }}
            onMouseLeave={() => setGroupPickerOpen(false)}
          >
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (groups.length === 0) setGroupNameInput('')
              }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
            >
              <FolderPlus size={12} />
              {t.noteMenu.addToGroup}
              {groups.length > 0 && <ChevronRight size={10} className="ml-auto" />}
            </button>

            {/* Group picker — submenu, repositioned to stay within window */}
            {groupPickerOpen && (
              <div
                className="absolute z-50 bg-surface-2 border border-border rounded shadow-xl py-1 w-40 animate-in fade-in zoom-in duration-100"
                style={{
                  [pickerFlip.x ? 'right' : 'left']: '100%',
                  [pickerFlip.y ? 'bottom' : 'top']: 0,
                }}
              >
                {groups.map((g) => (
                  <button
                    key={g.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      updateNote(note.id, { group: g.id })
                      onClose()
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: `rgb(${colorChannels(g.color)})` }}
                    />
                    {g.name}
                  </button>
                ))}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setGroupPickerOpen(false)
                    setGroupNameInput('')
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs font-mono text-text-muted hover:bg-surface-3 hover:text-text transition-colors"
                >
                  {t.common.newGroupInline}
                </button>
              </div>
            )}
          </div>

          {/* Inline group name input */}
          {groupNameInput !== null && (
            <input
              autoFocus
              value={groupNameInput}
              onChange={(e) => setGroupNameInput(e.target.value)}
              onKeyDown={async (e) => {
                e.stopPropagation()
                if (e.key === 'Enter' && groupNameInput.trim()) {
                  const g = await createGroup(groupNameInput.trim(), '--accent')
                  updateNote(note.id, { group: g.id })
                  onClose()
                }
                if (e.key === 'Escape') setGroupNameInput(null)
              }}
              onClick={(e) => e.stopPropagation()}
              className="mx-3 my-1 px-2 py-1 text-xs font-mono bg-surface-1 border border-text/25 rounded outline-none text-text w-[calc(100%-1.5rem)] block"
              placeholder={t.common.groupNamePlaceholder}
            />
          )}
        </>
      )}
        </>
      )}

      {(!note.encryption || !!sessionPasswords[note.id]) && (
        <>
          <div className="h-px bg-border my-1" />
          <button
            onClick={() => {
              const targetSectionId = request.sectionId ?? note.sections[0]?.id
              if (targetSectionId) window.noteflow.openSticky(note.id, targetSectionId)
              onClose()
            }}
            className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
          >
            <ExternalLink size={12} />
            {t.noteMenu.openAsSticky}
          </button>
          {/* Not for encrypted notes: their unlock is per window (session password), and a
              second window editing one would re-encrypt from its own copy. */}
          {currentSection && !note.encryption && (
            <button
              onClick={() => {
                window.noteflow.openSectionWindow(note.id, currentSection.id)
                onClose()
              }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
            >
              <AppWindow size={12} />
              {t.noteMenu.openInNewWindow}
            </button>
          )}
        </>
      )}
      <div className="h-px bg-border my-1" />
      {canDeleteSection ? (
        <button
          onClick={() => {
            onClose()
            onConfirmDeleteSection(note, currentSection!.id)
          }}
          className="w-full text-left px-3 py-1.5 text-xs font-mono font-normal text-red/75 hover:text-red hover:bg-red/10 flex items-center gap-2 transition-colors"
        >
          <Trash2 size={12} />
          {t.common.deleteSection}
        </button>
      ) : (
        <button
          onClick={() => {
            if (note.encryption && !sessionPasswords[note.id]) {
              onUnlockThenDelete(note.id)
              return
            }
            onClose()
            onConfirmDelete(note)
          }}
          className="w-full text-left px-3 py-1.5 text-xs font-mono font-normal text-red/75 hover:text-red hover:bg-red/10 flex items-center gap-2 transition-colors"
        >
          <Trash2 size={12} />
          {t.common.deleteNote}
        </button>
      )}
    </ContextMenu>
  )
}
