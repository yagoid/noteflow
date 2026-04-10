import { useEffect, useRef, useState } from 'react'
import { Check, PackageOpen, X } from 'lucide-react'
import { nanoid } from 'nanoid'
import { useNotesStore } from '../stores/notesStore'
import { noteFilename, parseNote, serializeNote } from '../lib/noteUtils'
import { getTagColor } from '../lib/tagColors'
import { useSectionTagColorsStore } from '../stores/sectionTagColorsStore'
import type { ImportConflictStrategy, ImportPreviewEntry, NoteflowExportEntry } from '../types'

interface Props {
  mode: 'export' | 'import'
  onClose: () => void
}

type ExportStep = 'select' | 'exporting' | 'success' | 'error'
type ImportStep = 'picking' | 'preview' | 'importing' | 'done' | 'error'

export function ExportImportModal({ mode: initialMode, onClose }: Props) {
  const [mode, setMode] = useState<'export' | 'import'>(initialMode)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        className="w-[520px] max-h-[80vh] flex flex-col bg-surface-1 border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-border flex-shrink-0">
          <PackageOpen size={13} className="text-accent flex-shrink-0" />
          <div className="flex gap-1 flex-1">
            {(['export', 'import'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-2 py-0.5 rounded text-xs font-mono transition-colors ${
                  mode === m
                    ? 'bg-accent/15 text-accent border border-accent/30'
                    : 'text-text-muted border border-transparent hover:text-text'
                }`}
              >
                {m === 'export' ? 'Export' : 'Import'}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text transition-colors">
            <X size={13} />
          </button>
        </div>

        {mode === 'export'
          ? <ExportPanel onClose={onClose} />
          : <ImportPanel onClose={onClose} />
        }
      </div>
    </div>
  )
}

// ── Export ────────────────────────────────────────────────────────────────────

function ExportPanel({ onClose }: { onClose: () => void }) {
  const { notes, activeNoteId } = useNotesStore()
  const sectionTagColors = useSectionTagColorsStore((s) => s.sectionTagColors)
  const [step, setStep] = useState<ExportStep>('select')
  const [successPath, setSuccessPath] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // Which note IDs are selected
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(
    () => new Set(activeNoteId ? [activeNoteId] : [])
  )
  // Granular section selection: noteId → Set<sectionId>. If absent, all sections selected.
  const [selectedSections, setSelectedSections] = useState<Map<string, Set<string>>>(new Map())

  const visibleNotes = notes.filter((n) => !n.archived)

  const allSelected = visibleNotes.length > 0 && visibleNotes.every((n) => selectedNoteIds.has(n.id))
  const someSelected = visibleNotes.some((n) => selectedNoteIds.has(n.id))

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedNoteIds(new Set())
    } else {
      setSelectedNoteIds(new Set(visibleNotes.map((n) => n.id)))
    }
  }

  function toggleNote(id: string) {
    setSelectedNoteIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSection(noteId: string, sectionId: string) {
    // If parent note isn't selected, select it and mark only this section
    if (!selectedNoteIds.has(noteId)) {
      setSelectedNoteIds((prev) => new Set([...prev, noteId]))
      setSelectedSections((prev) => new Map([...prev, [noteId, new Set([sectionId])]]))
      return
    }

    setSelectedSections((prev) => {
      const next = new Map(prev)
      const note = visibleNotes.find((n) => n.id === noteId)!
      // If no entry yet, it means "all selected" — initialize with all section IDs
      const current = next.get(noteId) ?? new Set(note.sections.map((s) => s.id))
      const updated = new Set(current)
      if (updated.has(sectionId)) updated.delete(sectionId)
      else updated.add(sectionId)
      // If all sections selected again, remove the entry (back to "all selected" default)
      if (updated.size === note.sections.length) next.delete(noteId)
      else next.set(noteId, updated)
      return next
    })
  }

  function isSectionSelected(noteId: string, sectionId: string): boolean {
    if (!selectedNoteIds.has(noteId)) return false
    const entry = selectedSections.get(noteId)
    if (!entry) return true // default: all selected
    return entry.has(sectionId)
  }

  function countSelectedSections(noteId: string): number {
    if (!selectedNoteIds.has(noteId)) return 0
    const note = visibleNotes.find((n) => n.id === noteId)!
    const entry = selectedSections.get(noteId)
    if (!entry) return note.sections.length
    return entry.size
  }

  const totalSelectedSections = visibleNotes
    .filter((n) => selectedNoteIds.has(n.id))
    .reduce((acc, n) => acc + countSelectedSections(n.id), 0)

  async function handleExport() {
    setStep('exporting')
    const entries: NoteflowExportEntry[] = visibleNotes
      .filter((n) => selectedNoteIds.has(n.id))
      .map((n) => {
        const sectionFilter = selectedSections.get(n.id)
        if (!sectionFilter) {
          // All sections — use raw as-is
          return { filename: noteFilename(n.id, n.title), content: n.raw }
        }
        // Partial sections — re-serialize
        const filteredSections = n.sections.filter((s) => sectionFilter.has(s.id))
        const content = serializeNote({ ...n, sections: filteredSections })
        return { filename: noteFilename(n.id, n.title), content }
      })

    const result = await window.noteflow.exportNotes(entries)
    if (result.canceled) {
      setStep('select')
    } else if (result.ok && result.filePath) {
      setSuccessPath(result.filePath)
      setStep('success')
    } else {
      setErrorMsg(result.error ?? 'Unknown error')
      setStep('error')
    }
  }

  if (step === 'success') {
    return (
      <>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 py-8">
          <Check size={24} className="text-accent" />
          <p className="text-sm font-mono text-text text-center">Export complete</p>
          <p className="text-xs font-mono text-text-muted text-center break-all">{successPath}</p>
        </div>
        <div className="flex justify-end gap-2 px-4 pb-4 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs font-mono bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 transition-colors"
          >
            Done
          </button>
        </div>
      </>
    )
  }

  if (step === 'error') {
    return (
      <>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 py-8">
          <p className="text-sm font-mono text-red-400 text-center">Export failed</p>
          <p className="text-xs font-mono text-text-muted text-center">{errorMsg}</p>
        </div>
        <div className="flex justify-end gap-2 px-4 pb-4 flex-shrink-0">
          <button onClick={() => setStep('select')} className="px-3 py-1.5 rounded text-xs font-mono text-text-muted border border-border hover:border-accent/40 hover:text-text transition-colors">
            Back
          </button>
        </div>
      </>
    )
  }

  if (step === 'exporting') {
    return (
      <div className="flex-1 flex items-center justify-center py-10">
        <p className="text-xs font-mono text-text-muted">Waiting for save dialog...</p>
      </div>
    )
  }

  return (
    <>
      {/* Select all */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border flex-shrink-0">
        <Checkbox
          checked={allSelected}
          indeterminate={!allSelected && someSelected}
          onChange={toggleSelectAll}
        />
        <span className="text-xs font-mono text-text-muted">
          Select all ({selectedNoteIds.size} of {visibleNotes.length})
        </span>
      </div>

      {/* Note list */}
      <div className="flex-1 overflow-y-auto py-1">
        {visibleNotes.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs font-mono text-text-muted">No notes</div>
        ) : (
          visibleNotes.map((note) => {
            const isSelected = selectedNoteIds.has(note.id)
            const hasMutipleSections = note.sections.length > 1

            return (
              <div key={note.id}>
                <div className="flex items-center gap-2 px-4 py-1.5 hover:bg-surface-2">
                  <Checkbox
                    checked={isSelected}
                    onChange={() => toggleNote(note.id)}
                  />
                  <span className="w-[11px] flex-shrink-0" />
                  <span className="flex-1 text-xs font-mono text-text truncate">
                    {note.title || 'Untitled'}
                  </span>
                  <span className="text-xs font-mono text-text-muted/50">
                    {countSelectedSections(note.id)}/{note.sections.length}
                  </span>
                </div>

                {hasMutipleSections && (
                  <div className="flex flex-wrap gap-1 pl-10 pr-4 pb-2">
                    {note.sections.map((section) => {
                      const active = isSectionSelected(note.id, section.id)
                      return (
                        <button
                          key={section.id}
                          onClick={() => toggleSection(note.id, section.id)}
                          className="text-[9px] font-mono px-1.5 py-0.5 rounded transition-all"
                          style={
                            active
                              ? { ...getTagColor(section.name, sectionTagColors), opacity: 1, outline: '1px solid currentColor' }
                              : { ...getTagColor(section.name, sectionTagColors), opacity: 0.35 }
                          }
                        >
                          {section.name}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-border flex-shrink-0">
        <span className="text-xs font-mono text-text-muted/60">
          {selectedNoteIds.size} notes · {totalSelectedSections} sections
        </span>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs font-mono text-text-muted border border-border hover:border-accent/40 hover:text-text transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={selectedNoteIds.size === 0}
            onClick={handleExport}
            className="px-3 py-1.5 rounded text-xs font-mono bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Export to file...
          </button>
        </div>
      </div>
    </>
  )
}

// ── Import ────────────────────────────────────────────────────────────────────

function ImportPanel({ onClose }: { onClose: () => void }) {
  const { notes, loadNotes } = useNotesStore()
  const [step, setStep] = useState<ImportStep>('picking')
  const [entries, setEntries] = useState<ImportPreviewEntry[]>([])
  const [importedCount, setImportedCount] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [exportedDate, setExportedDate] = useState('')
  const didPick = useRef(false)

  // Auto-open file picker when the panel mounts
  useEffect(() => {
    if (didPick.current) return
    didPick.current = true

    window.noteflow.parseImportFile().then((result) => {
      if (result.canceled) {
        onClose()
        return
      }
      if (!result.ok || !result.file) {
        setErrorMsg(result.error ?? 'Invalid file')
        setStep('error')
        return
      }

      const existingIds = new Set(notes.map((n) => n.id))
      const existingFilenames = new Set(
        notes.map((n) => {
          const parts = n.filePath.replace(/\\/g, '/').split('/')
          return parts[parts.length - 1]
        })
      )

      setExportedDate(result.file.exported)
      setEntries(
        result.file.notes.map((entry) => {
          const parsed = parseNote(entry.content, '')
          const idConflict = existingIds.has(parsed.id)
          const filenameConflict = existingFilenames.has(entry.filename)
          const conflict: ImportPreviewEntry['conflict'] =
            idConflict ? 'id' : filenameConflict ? 'filename' : 'none'
          return {
            filename: entry.filename,
            content: entry.content,
            parsedTitle: parsed.title,
            parsedId: parsed.id,
            conflict,
            strategy: conflict === 'none' ? 'overwrite' : 'skip',
          }
        })
      )
      setStep('preview')
    })
  }, [notes, onClose])

  function setStrategy(idx: number, strategy: ImportConflictStrategy) {
    setEntries((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, strategy } : e))
    )
  }

  async function handleImport() {
    setStep('importing')
    const toWrite: NoteflowExportEntry[] = entries
      .filter((e) => e.strategy !== 'skip')
      .map((e) => {
        if (e.strategy === 'keep-both') {
          const newId = nanoid(8)
          const parsed = parseNote(e.content, '')
          const newContent = serializeNote({
            ...parsed,
            id: newId,
            sections: parsed.sections,
          })
          return { filename: noteFilename(newId, parsed.title), content: newContent }
        }
        return { filename: e.filename, content: e.content }
      })

    const result = await window.noteflow.writeImportedNotes(toWrite)
    setImportedCount(result.written.length)
    await loadNotes()
    setStep('done')
  }

  if (step === 'picking') {
    return (
      <div className="flex-1 flex items-center justify-center py-10">
        <p className="text-xs font-mono text-text-muted">Opening file picker...</p>
      </div>
    )
  }

  if (step === 'importing') {
    return (
      <div className="flex-1 flex items-center justify-center py-10">
        <p className="text-xs font-mono text-text-muted">Importing notes...</p>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 py-8">
          <Check size={24} className="text-accent" />
          <p className="text-sm font-mono text-text">{importedCount} note{importedCount !== 1 ? 's' : ''} imported</p>
        </div>
        <div className="flex justify-end gap-2 px-4 pb-4 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs font-mono bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 transition-colors"
          >
            Done
          </button>
        </div>
      </>
    )
  }

  if (step === 'error') {
    return (
      <>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 py-8">
          <p className="text-sm font-mono text-red-400">Import failed</p>
          <p className="text-xs font-mono text-text-muted text-center">{errorMsg}</p>
        </div>
        <div className="flex justify-end gap-2 px-4 pb-4 flex-shrink-0">
          <button onClick={onClose} className="px-3 py-1.5 rounded text-xs font-mono text-text-muted border border-border hover:border-accent/40 hover:text-text transition-colors">
            Close
          </button>
        </div>
      </>
    )
  }

  // step === 'preview'
  const conflicts = entries.filter((e) => e.conflict !== 'none').length
  const toImport = entries.filter((e) => e.strategy !== 'skip').length
  const dateLabel = exportedDate
    ? new Date(exportedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : ''

  return (
    <>
      {/* Sub-header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border flex-shrink-0">
        <span className="text-xs font-mono text-text-muted">
          {entries.length} notes{dateLabel ? ` · exported ${dateLabel}` : ''}
          {conflicts > 0 && (
            <span className="text-yellow-500 ml-2">· {conflicts} conflict{conflicts !== 1 ? 's' : ''}</span>
          )}
        </span>
      </div>

      {/* Note list */}
      <div className="flex-1 overflow-y-auto py-1">
        {entries.map((entry, i) => (
          <div key={entry.parsedId} className="px-4 py-2 hover:bg-surface-2 border-b border-border/40 last:border-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-mono text-text truncate">{entry.parsedTitle || 'Untitled'}</p>
                {entry.conflict !== 'none' && (
                  <p className="text-xs font-mono text-yellow-500/80 mt-0.5">
                    ⚠ {entry.conflict === 'id' ? 'ID already exists' : 'Filename already exists'}
                  </p>
                )}
              </div>
              {entry.conflict !== 'none' && (
                <select
                  value={entry.strategy}
                  onChange={(e) => setStrategy(i, e.target.value as ImportConflictStrategy)}
                  className="text-xs font-mono bg-surface-2 border border-border rounded px-1.5 py-0.5 text-text-muted focus:outline-none focus:border-accent/60 flex-shrink-0"
                >
                  <option value="skip">Skip</option>
                  <option value="overwrite">Overwrite</option>
                  <option value="keep-both">Keep both</option>
                </select>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-border flex-shrink-0">
        <span className="text-xs font-mono text-text-muted/60">
          {toImport} of {entries.length} will be imported
        </span>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs font-mono text-text-muted border border-border hover:border-accent/40 hover:text-text transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={toImport === 0}
            onClick={handleImport}
            className="px-3 py-1.5 rounded text-xs font-mono bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Import notes
          </button>
        </div>
      </div>
    </>
  )
}

// ── Shared ────────────────────────────────────────────────────────────────────

function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  disabled = false,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: () => void
  disabled?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      className="w-3 h-3 accent-[var(--color-accent)] flex-shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
    />
  )
}
