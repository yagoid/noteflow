import type { ReactNode } from 'react'
import { FileText, Hash, Library, X } from 'lucide-react'
import { useAiChatStore } from '../../stores/aiChatStore'
import { useNotesStore } from '../../stores/notesStore'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'
import {
  contextItemKey, currentNoteItem, currentSectionItem, hasContextItem, noteBlock, sectionBlock, type ContextBlock,
} from '../../lib/chatContext'
import type { ChatContextItem } from '../../types'

function ToggleButton({ active, disabled, title, icon, label, onClick }: {
  active: boolean
  disabled?: boolean
  title: string
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={`min-w-0 max-w-full inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-mono border-solid border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? 'border-accent/50 bg-accent/15 text-accent'
          : 'border-border bg-surface-0 text-text-muted hover:text-text hover:border-text/30 disabled:hover:text-text-muted disabled:hover:border-border'
      }`}
    >
      <span className="shrink-0 flex items-center">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  )
}

/**
 * Context bar above the composer of the editor chat (sidebar / detached window). Chips for what was
 * shared earlier + toggles for the section and note open in the editor right now and for semantic
 * search over all notes. State lives in aiChatStore (`context`); rules in lib/chatContext.
 */
export function ChatContextBar() {
  const t = useT()
  const tc = t.aiPanel.context
  const context = useAiChatStore((s) => s.context)
  const target = useAiChatStore((s) => s.editorTarget)
  const toggleItem = useAiChatStore((s) => s.toggleContextItem)
  const removeItem = useAiChatStore((s) => s.removeContextItem)
  const setAllNotes = useAiChatStore((s) => s.setAllNotes)
  const notes = useNotesStore((s) => s.notes)

  const blockedReason = (block: ContextBlock): string =>
    block === 'encrypted' ? tc.encrypted : block === 'ai-hidden' ? tc.aiHidden : block === 'no-section' ? tc.noSection : tc.noNote

  const sectionItem = currentSectionItem(target)
  const noteItem = currentNoteItem(target)
  const secBlock = sectionBlock(target)
  const nBlock = noteBlock(target)
  const sectionActive = !!sectionItem && hasContextItem(context, sectionItem)
  const noteActive = !!noteItem && hasContextItem(context, noteItem)

  // What the toggles already show isn't repeated as a chip.
  const shownByButtons = new Set([sectionItem, noteItem].filter((i): i is ChatContextItem => !!i).map(contextItemKey))
  const chips = context.items.filter((i) => !shownByButtons.has(contextItemKey(i)))

  const chipLabel = (item: ChatContextItem): string => {
    const note = notes.find((n) => n.id === item.noteId)
    const title = note?.title?.trim() || t.common.untitled
    if (item.kind === 'note') return title
    const section = note?.sections.find((s) => s.id === item.sectionId)
    return tf(tc.sectionChip, { note: title, section: section?.name ?? '…' })
  }

  const sectionName = target?.sectionName?.trim() || '—'
  const noteTitle = target ? target.noteTitle.trim() || t.common.untitled : '—'

  return (
    <div className="mb-1.5 flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1 min-w-0">
        <span className="text-[11px] font-mono text-text-muted/70">{tc.label}</span>
        {context.items.length === 0 && !context.allNotes && (
          <span className="text-[11px] font-mono text-text-muted/50">{tc.none}</span>
        )}
        {chips.map((item) => (
          <span
            key={contextItemKey(item)}
            className="min-w-0 max-w-full inline-flex items-center gap-1 pl-1.5 pr-0.5 py-0.5 rounded-md text-[11px] font-mono border-solid border border-accent/40 bg-accent/10 text-text"
          >
            {item.kind === 'note' ? <FileText size={10} className="shrink-0 text-accent" /> : <Hash size={10} className="shrink-0 text-accent" />}
            <span className="truncate" title={chipLabel(item)}>{chipLabel(item)}</span>
            <button
              onClick={() => removeItem(item)}
              title={tc.removeItem}
              aria-label={tc.removeItem}
              className="shrink-0 flex items-center justify-center w-4 h-4 rounded text-text-muted hover:text-red transition-colors"
            >
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1 min-w-0">
        <ToggleButton
          active={sectionActive}
          disabled={!sectionItem}
          title={secBlock ? blockedReason(secBlock) : sectionActive ? tc.removeSection : tc.addSection}
          icon={<Hash size={11} />}
          label={tf(tc.section, { name: sectionName })}
          onClick={() => { if (sectionItem) toggleItem(sectionItem) }}
        />
        <ToggleButton
          active={noteActive}
          disabled={!noteItem}
          title={nBlock ? blockedReason(nBlock) : noteActive ? tc.removeNote : tc.addNote}
          icon={<FileText size={11} />}
          label={tf(tc.note, { name: noteTitle })}
          onClick={() => { if (noteItem) toggleItem(noteItem) }}
        />
        <ToggleButton
          active={context.allNotes}
          title={context.allNotes ? tc.allNotesOff : tc.allNotesOn}
          icon={<Library size={11} />}
          label={tc.allNotes}
          onClick={() => setAllNotes(!context.allNotes)}
        />
      </div>
    </div>
  )
}
