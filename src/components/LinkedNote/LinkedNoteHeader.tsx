import { useState } from 'react'
import { Undo2, AlertTriangle, CloudOff, FileSymlink, FolderOpen, GitCompare, Link2Off, RotateCcw, Save, Search } from 'lucide-react'
import { useNotesStore } from '../../stores/notesStore'
import { ConfirmModal } from '../ConfirmModal'
import { LinkedConflictModal } from './LinkedConflictModal'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'
import type { LinkedNoteState, Note } from '../../types'
import { LINKED_TONE_CLASS, fileNameOf, linkedStatusLabel, linkedTone, shortenPath } from './linkedActions'
import { isLinkedDirty } from '../../lib/linkedNotes'

type LinkedNote = Note & { linked: LinkedNoteState }

function useLinkedActions(note: LinkedNote) {
  const t = useT()
  const unlinkNote = useNotesStore((s) => s.unlinkNote)
  const relocateLinkedNote = useNotesStore((s) => s.relocateLinkedNote)
  const resolveLinkedConflict = useNotesStore((s) => s.resolveLinkedConflict)
  const [modal, setModal] = useState<{ title: string; message: string; confirmLabel: string; danger?: boolean; info?: boolean; onConfirm: () => void } | null>(null)
  const [compareOpen, setCompareOpen] = useState(false)
  const file = fileNameOf(note.linked.path)

  const askUnlink = () => setModal({
    title: t.linked.unlinkTitle,
    message: tf(t.linked.unlinkMessage, { title: note.title || t.common.untitled, file }),
    confirmLabel: t.linked.unlinkConfirm,
    onConfirm: () => { setModal(null); void unlinkNote(note.id) },
  })

  const relocate = async () => {
    const [picked] = await window.noteflow.linkedPickFiles({ multi: false })
    if (!picked) return
    const res = await relocateLinkedNote(note.id, picked)
    if (!res.ok && res.error) {
      setModal({
        title: t.linked.linkErrorsTitle,
        message: tf(t.linked.linkErrorLine, { file: fileNameOf(picked), reason: t.linked.linkError[res.error] }),
        confirmLabel: t.linked.ok,
        info: true,
        onConfirm: () => setModal(null),
      })
    }
  }

  const discardLinkedChanges = useNotesStore((s) => s.discardLinkedChanges)
  const askDiscard = () => setModal({
    title: t.linked.discardConfirmTitle,
    message: tf(t.linked.discardConfirmMessage, { file }),
    confirmLabel: t.linked.discardConfirm,
    danger: true,
    onConfirm: () => { setModal(null); void discardLinkedChanges(note.id) },
  })

  const askKeepMine = () => setModal({
    title: t.linked.keepMineConfirmTitle,
    message: tf(t.linked.keepMineConfirmMessage, { file }),
    confirmLabel: t.linked.keepMineConfirm,
    danger: true,
    onConfirm: () => { setModal(null); void resolveLinkedConflict(note.id, { kind: 'keepMine' }) },
  })

  const modals = (
    <>
      {modal && (
        <ConfirmModal
          title={modal.title}
          message={modal.message}
          confirmLabel={modal.confirmLabel}
          danger={modal.danger}
          hideCancel={modal.info}
          confirmOnEnter={!modal.danger}
          onConfirm={modal.onConfirm}
          onCancel={() => setModal(null)}
        />
      )}
      {compareOpen && note.linked.conflict && (
        <LinkedConflictModal note={note} onClose={() => setCompareOpen(false)} />
      )}
    </>
  )

  return {
    file,
    askUnlink,
    relocate,
    askKeepMine,
    askDiscard,
    reload: () => void resolveLinkedConflict(note.id, { kind: 'reload' }),
    openCompare: () => setCompareOpen(true),
    showInFolder: () => void window.noteflow.linkedShowInFolder(note.id),
    modals,
  }
}

function hintOf(t: ReturnType<typeof useT>, linked: LinkedNoteState, dirty: boolean): string | null {
  if (linked.conflict) return t.linked.conflictHint
  if (linked.status === 'missing') return t.linked.missingHint
  if (linked.status === 'readonly') return t.linked.readonlyHint
  if (linked.status === 'error') return t.linked.errorHint[linked.error ?? 'unreadable']
  if (dirty) return t.linked.unsavedHint
  return null
}

const btn = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-mono transition-colors'
const quietBtn = `${btn} text-text-muted hover:text-text hover:bg-surface-3`

/**
 * Header of a linked note in the editor (under the title): what file it edits, its
 * state, the local-only notice and the file actions; below it, a banner for the
 * read-only states and the conflict choices (Reload / Keep my version / Compare…).
 */
export function LinkedNoteHeader({ note }: { note: LinkedNote }) {
  const t = useT()
  const a = useLinkedActions(note)
  const [copied, setCopied] = useState(false)
  const { linked } = note
  const dirty = isLinkedDirty(note)
  const tone = linkedTone(linked, dirty)
  const hint = hintOf(t, linked, dirty)

  const copyPath = () => {
    void navigator.clipboard.writeText(linked.path)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className="px-4 pb-2 flex-shrink-0">
      <div className="flex items-center gap-1.5 min-w-0 text-[11px] font-mono text-text-muted/80">
        <FileSymlink size={12} className={`flex-shrink-0 ${LINKED_TONE_CLASS[tone]}`} aria-label={t.linked.linkedFile} />
        <button
          type="button"
          onClick={copyPath}
          title={`${linked.path}\n${copied ? t.linked.pathCopied : t.linked.copyPath}`}
          className="min-w-0 truncate text-left hover:text-text transition-colors"
        >
          {copied ? t.linked.pathCopied : shortenPath(linked.path, 3)}
        </button>
        <span className={`flex-shrink-0 ${LINKED_TONE_CLASS[tone]}`}>· {linkedStatusLabel(t.linked, linked, dirty)}</span>
        <span className="flex-shrink-0 flex items-center gap-1 text-text-muted/50" title={t.linked.localOnly}>
          · <CloudOff size={11} /> {t.linked.localOnlyShort}
        </span>
        <span className="flex-1" />
        <button type="button" onClick={a.showInFolder} className={quietBtn} title={t.linked.showInFolder} aria-label={t.linked.showInFolder}>
          <FolderOpen size={11} />
        </button>
        <button type="button" onClick={() => void a.relocate()} className={quietBtn} title={t.linked.relocate} aria-label={t.linked.relocate}>
          <Search size={11} />
        </button>
        <button type="button" onClick={a.askUnlink} className={quietBtn} title={t.linked.unlink} aria-label={t.linked.unlink}>
          <Link2Off size={11} />
        </button>
      </div>

      {hint && (
        <div className={`mt-1.5 px-2.5 py-1.5 rounded border flex items-start gap-2 ${
          tone === 'error' ? 'border-red/30 bg-red/[0.06]' : 'border-amber-300/35 bg-amber-300/10'
        }`}>
          <AlertTriangle size={12} className={`flex-shrink-0 mt-0.5 ${LINKED_TONE_CLASS[tone]}`} />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-mono text-text-muted leading-relaxed">{hint}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {linked.conflict ? (
                <>
                  <button type="button" onClick={a.reload} title={t.linked.reloadHint} className={`${btn} border border-border text-text hover:bg-surface-3`}>
                    <RotateCcw size={10} /> {t.linked.reload}
                  </button>
                  <button type="button" onClick={a.askKeepMine} title={t.linked.keepMineHint} className={`${btn} border border-border text-text hover:bg-surface-3`}>
                    <Save size={10} /> {t.linked.keepMine}
                  </button>
                  <button type="button" onClick={a.openCompare} className={`${btn} border border-border text-text hover:bg-surface-3`}>
                    <GitCompare size={10} /> {t.linked.compare}
                  </button>
                </>
              ) : (
                <>
                  {linked.status === 'missing' && (
                    <button type="button" onClick={() => void a.relocate()} className={`${btn} border border-border text-text hover:bg-surface-3`}>
                      <Search size={10} /> {t.linked.relocate}
                    </button>
                  )}
                  {/* The way out of unwritten changes the file won't take (read-only, too large…). */}
                  {dirty && (
                    <button type="button" onClick={a.askDiscard} title={t.linked.discardHint} className={`${btn} border border-border text-text hover:bg-surface-3`}>
                      <Undo2 size={10} /> {t.linked.discard}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {a.modals}
    </div>
  )
}

/**
 * Compact version for the sticky window: the file name with the full path in the tooltip,
 * the state (read-only / conflict) and, in a conflict, the same three choices.
 */
export function LinkedNoteCompactBar({ note }: { note: LinkedNote }) {
  const t = useT()
  const a = useLinkedActions(note)
  const { linked } = note
  const dirty = isLinkedDirty(note)
  const tone = linkedTone(linked, dirty)
  const hint = hintOf(t, linked, dirty)
  return (
    <div className="px-2 py-1 border-b border-border/60 flex flex-col gap-1 flex-shrink-0">
      <div className="flex items-center gap-1 min-w-0 text-[10px] font-mono text-text-muted/70" title={`${linked.path}\n${t.linked.localOnly}${hint ? `\n\n${hint}` : ''}`}>
        <FileSymlink size={10} className={`flex-shrink-0 ${LINKED_TONE_CLASS[tone]}`} />
        <span className="truncate">{a.file}</span>
        {tone !== 'ok' && <span className={`flex-shrink-0 ${LINKED_TONE_CLASS[tone]}`}>· {linkedStatusLabel(t.linked, linked, dirty)}</span>}
        <span className="flex-1" />
        <button type="button" onClick={a.showInFolder} className={quietBtn} title={t.linked.showInFolder} aria-label={t.linked.showInFolder}>
          <FolderOpen size={10} />
        </button>
      </div>
      {linked.conflict && (
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" onClick={a.reload} title={t.linked.reloadHint} className={`${btn} border border-border text-text hover:bg-surface-3`}>
            <RotateCcw size={10} /> {t.linked.reload}
          </button>
          <button type="button" onClick={a.askKeepMine} title={t.linked.keepMineHint} className={`${btn} border border-border text-text hover:bg-surface-3`}>
            <Save size={10} /> {t.linked.keepMine}
          </button>
          <button type="button" onClick={a.openCompare} className={`${btn} border border-border text-text hover:bg-surface-3`}>
            <GitCompare size={10} /> {t.linked.compare}
          </button>
        </div>
      )}
      {!linked.conflict && dirty && (
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" onClick={a.askDiscard} title={t.linked.discardHint} className={`${btn} border border-border text-text hover:bg-surface-3`}>
            <Undo2 size={10} /> {t.linked.discard}
          </button>
        </div>
      )}
      {a.modals}
    </div>
  )
}
