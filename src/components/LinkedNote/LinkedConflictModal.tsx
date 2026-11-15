import { useEffect, useMemo, useState } from 'react'
import { GitCompare, X } from 'lucide-react'
import { linkedKeepMineBody, useNotesStore } from '../../stores/notesStore'
import { diffSequences } from '../../lib/externalContentSync'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'
import type { LinkedNoteState, Note } from '../../types'
import { fileNameOf } from './linkedActions'

interface Row {
  left: string | null
  right: string | null
  changed: boolean
}

/** Side-by-side rows of a line diff: equal lines on both sides, each hunk padded to its longer side. */
function sideBySide(a: string, b: string): Row[] {
  const al = a.split('\n')
  const bl = b.split('\n')
  const rows: Row[] = []
  let i = 0
  let j = 0
  const hunks = diffSequences(al, bl)
  for (const h of [...hunks, { aStart: al.length, aEnd: al.length, bStart: bl.length, bEnd: bl.length }]) {
    while (i < h.aStart && j < h.bStart) rows.push({ left: al[i++], right: bl[j++], changed: false })
    const left = al.slice(h.aStart, h.aEnd)
    const right = bl.slice(h.bStart, h.bEnd)
    for (let k = 0; k < Math.max(left.length, right.length); k++) {
      rows.push({ left: left[k] ?? null, right: right[k] ?? null, changed: true })
    }
    i = h.aEnd
    j = h.bEnd
  }
  return rows
}

/**
 * "Compare…" of a linked note in conflict: the version on disk next to mine (as it would
 * be written), and a merged text the user can edit and save. Choosing a side or saving
 * the merge resolves the conflict (notesStore.resolveLinkedConflict).
 */
export function LinkedConflictModal({ note, onClose }: { note: Note & { linked: LinkedNoteState }; onClose: () => void }) {
  const t = useT()
  const resolveLinkedConflict = useNotesStore((s) => s.resolveLinkedConflict)
  const conflict = note.linked.conflict
  const disk = conflict?.diskBody ?? ''
  // Mine as it would be written (the file's own source kept for the blocks I didn't touch),
  // so the diff shows real changes and not the editor's spelling of the same Markdown.
  // With the disk's leading / trailing blank lines (they don't render): the merged text starts
  // from this, so if its start and end aren't touched they don't change in the file.
  // (A plain-text file, not Markdown: exactly the note's text.)
  const mine = useMemo(() => linkedKeepMineBody(note, note.sections[0]?.content ?? '', disk), [note, disk])
  const rows = useMemo(() => sideBySide(disk, mine), [disk, mine])
  const [tab, setTab] = useState<'diff' | 'merge'>('diff')
  const [merged, setMerged] = useState(mine)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // The conflict ended meanwhile (another window resolved it, the file came back equal…).
  useEffect(() => { if (!conflict) onClose() }, [conflict, onClose])

  const choose = (resolution: Parameters<typeof resolveLinkedConflict>[1]) => {
    onClose()
    void resolveLinkedConflict(note.id, resolution)
  }

  const anyChange = rows.some((r) => r.changed)
  const cell = 'px-2 whitespace-pre-wrap break-words min-h-[1.25rem]'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tf(t.linked.compareTitle, { file: fileNameOf(note.linked.path) })}
        className="w-[min(1100px,92vw)] h-[min(760px,86vh)] bg-surface-1 border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-3 border-b border-border">
          <GitCompare size={15} className="text-text flex-shrink-0" />
          <span className="text-sm font-mono font-semibold text-text truncate flex-1">
            {tf(t.linked.compareTitle, { file: fileNameOf(note.linked.path) })}
          </span>
          <button type="button" onClick={onClose} className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-3" aria-label={t.linked.cancel}>
            <X size={14} />
          </button>
        </div>

        <div className="flex items-center gap-1 px-4 pt-2">
          {(['diff', 'merge'] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${tab === id ? 'bg-surface-3 text-text' : 'text-text-muted hover:text-text hover:bg-surface-2'}`}
            >
              {id === 'diff' ? t.linked.compareDiff : t.linked.compareMerge}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 px-4 py-2">
          {tab === 'diff' ? (
            <div className="h-full overflow-auto rounded border border-border text-[11.5px] font-mono leading-5">
              <div className="grid grid-cols-2 sticky top-0 bg-surface-2 border-b border-border text-[10px] uppercase tracking-widest text-text-muted">
                <div className="px-2 py-1">{t.linked.onDisk}</div>
                <div className="px-2 py-1 border-l border-border">{t.linked.mine}</div>
              </div>
              {!anyChange && <div className="px-3 py-3 text-text-muted">{t.linked.noDifferences}</div>}
              {rows.map((r, k) => (
                <div key={k} className="grid grid-cols-2">
                  <div className={`${cell} ${r.changed && r.left !== null ? 'bg-red/[0.10] text-text' : 'text-text-muted'}`}>{r.left ?? ''}</div>
                  <div className={`${cell} border-l border-border ${r.changed && r.right !== null ? 'bg-accent/[0.10] text-text' : 'text-text-muted'}`}>{r.right ?? ''}</div>
                </div>
              ))}
            </div>
          ) : (
            <textarea
              value={merged}
              onChange={(e) => setMerged(e.target.value)}
              spellCheck={false}
              className="w-full h-full resize-none rounded border border-border bg-surface-0 p-3 text-xs font-mono text-text outline-none focus:border-text/30"
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 px-4 pb-3.5 pt-1">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded text-xs font-mono text-text-muted border border-border hover:border-text/25 hover:text-text">
            {t.linked.cancel}
          </button>
          <span className="flex-1" />
          <button type="button" onClick={() => choose({ kind: 'reload' })} className="px-3 py-1.5 rounded text-xs font-mono text-text border border-border hover:bg-surface-3">
            {t.linked.useDisk}
          </button>
          <button type="button" onClick={() => choose({ kind: 'keepMine' })} className="px-3 py-1.5 rounded text-xs font-mono text-text border border-border hover:bg-surface-3">
            {t.linked.useMine}
          </button>
          {tab === 'merge' && (
            <button type="button" onClick={() => choose({ kind: 'merged', body: merged })} className="px-3 py-1.5 rounded text-xs font-mono bg-surface-2 text-text border border-text/20 hover:bg-surface-3">
              {t.linked.saveMerged}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
