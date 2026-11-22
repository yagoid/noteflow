// "Version history" of one section (NoteFlow Cloud): a large modal with the
// timeline of the versions the server kept (left) and the selected one (right:
// its changes against the current text, or a preview), with Copy / Restore as
// new section / Restore this version.
//
// Restoring never loses the current text: the note's pending edits are flushed
// and written, then main keeps the current text as one more version
// (cloudSnapshotVersion) before the section is replaced — and when that fails,
// the user chooses (restore as a new section, or replace anyway). The
// replacement itself is a normal store write (updateSection → disk → the usual
// conditional Cloud upload), marked as a forced restore so open editors take it
// as an exact, undoable replacement (lib/sectionRestore). Pure logic in
// lib/versionHistory.ts.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Check, Copy, CopyPlus, Eye, GitCompare, History, Loader, RotateCcw, ShieldCheck, X } from 'lucide-react'
import { settleNoteWrites, useNotesStore } from '../../stores/notesStore'
import { useLanguageStore } from '../../stores/languageStore'
import { flushPendingEdits } from '../../lib/pendingEdits'
import { sameContent } from '../../lib/externalContentSync'
import { expireForcedRestore, markForcedRestore } from '../../lib/sectionRestore'
import { OWN_KEYS_PROPS, ownsKeys } from '../../lib/keyScope'
import {
  decideHistoryPanelState,
  formatVersionDate,
  isEmptyVersion,
  planRestoreAfterSnapshot,
  restoredSectionName,
  shouldListVersions,
  versionReasonTag,
  type SnapshotFailureKey,
} from '../../lib/versionHistory'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'
import type { AccountStatus, CloudVersionMeta, CloudVersionReason, CloudVersionsErrorCode, Note } from '../../types'
import {
  CenteredNote,
  DiffLegend,
  PanelStateView,
  ReasonTag,
  SnapshotFailedDialog,
  TimelineSkeleton,
  VersionChanges,
  VersionPreview,
  VersionTimeline,
  type HistorySelection,
} from './VersionHistoryParts'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from './versionHistoryUi'

/** What a restore did — the editor lands on the section and shows a brief notice. */
export type VersionRestoreResult =
  | { kind: 'replace'; sectionId: string; editedAt: string }
  | { kind: 'copy'; sectionId: string; name: string; content: string }

interface VersionHistoryPanelProps {
  note: Note
  sectionId: string
  onClose: () => void
  onRestored: (result: VersionRestoreResult) => void
}

type ListData =
  | { status: 'loading' }
  | { status: 'ok'; versions: CloudVersionMeta[] }
  | { status: 'error'; code: CloudVersionsErrorCode }

type VersionLoad =
  | { status: 'ok'; content: string; editedAt: string; reason: CloudVersionReason }
  | { status: 'error'; code: CloudVersionsErrorCode }

type Busy = null | 'capturing' | 'restoring' | 'copying-new'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])'

export function VersionHistoryPanel({ note, sectionId, onClose, onRestored }: VersionHistoryPanelProps) {
  const t = useT()
  const vh = t.versionHistory
  const dateLocale = useLanguageStore((s) => s.dateLocale)
  const updateSection = useNotesStore((s) => s.updateSection)
  const duplicateSection = useNotesStore((s) => s.duplicateSection)
  const section = useNotesStore((s) => s.notes.find((n) => n.id === note.id)?.sections.find((x) => x.id === sectionId))
  const current = section?.content ?? ''
  const raw = !!section?.isRawMode

  const notePath = note.filePath
  const target = useMemo(() => ({ notePath, sectionId }), [notePath, sectionId])

  const [account, setAccount] = useState<AccountStatus | null>(null)
  const [list, setList] = useState<ListData>({ status: 'loading' })
  const [listNonce, setListNonce] = useState(0)
  const [refreshingPlan, setRefreshingPlan] = useState(false)
  const [selection, setSelection] = useState<HistorySelection | null>(null)
  const [contents, setContents] = useState<Record<number, VersionLoad>>({})
  const [view, setView] = useState<'changes' | 'preview'>('changes')
  const [busy, setBusy] = useState<Busy>(null)
  const [confirm, setConfirm] = useState<SnapshotFailureKey | null>(null)
  const [actionFailed, setActionFailed] = useState(false)
  const [copied, setCopied] = useState(false)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlightRef = useRef(new Set<number>())
  const dialogRef = useRef<HTMLDivElement>(null)
  const restoreButtonRef = useRef<HTMLButtonElement>(null)

  // ── Account (session + entitlements decide whether there is a history at all) ──
  useEffect(() => {
    void window.noteflow.getAccountStatus().then(setAccount)
    return window.noteflow.onAccountStatusChanged(setAccount)
  }, [])

  const canList = shouldListVersions(account)
  useEffect(() => {
    if (!canList) return
    let alive = true
    void window.noteflow.cloudListVersions(target).then((res) => {
      if (!alive) return
      setList(res.ok ? { status: 'ok', versions: res.versions } : { status: 'error', code: res.errorCode })
    })
    return () => { alive = false }
  }, [canList, listNonce, target])

  const versions = list.status === 'ok' ? list.versions : []
  const panelState = decideHistoryPanelState(
    account,
    list.status === 'ok' ? { status: 'ok', count: versions.length } : list,
  )
  // Newest version selected by default (its content preloads below).
  const selected: HistorySelection = selection ?? versions[0]?.id ?? 'current'
  const selectedMeta = selected === 'current' ? null : versions.find((v) => v.id === selected) ?? null
  const selectedLoad = selected === 'current' ? undefined : contents[selected]

  // ── Content of the selected version: on demand, cached while the panel is open ──
  useEffect(() => {
    if (selected === 'current' || selectedLoad || inFlightRef.current.has(selected)) return
    if (panelState !== 'list') return
    const id = selected
    inFlightRef.current.add(id)
    void window.noteflow.cloudGetVersion(target, id).then((res) => {
      inFlightRef.current.delete(id)
      setContents((prev) => ({
        ...prev,
        [id]: res.ok
          ? { status: 'ok', content: res.version.content, editedAt: res.version.editedAt, reason: res.version.reason }
          : { status: 'error', code: res.errorCode },
      }))
      // Pruned meanwhile (out of retention): refresh the list quietly.
      if (!res.ok && res.errorCode === 'not-found') setListNonce((n) => n + 1)
    })
  }, [selected, selectedLoad, panelState, target])

  // ── Section gone (deleted from another pane / window / sync): nothing to restore into ──
  const sectionExists = !!section
  useEffect(() => {
    if (!sectionExists) onClose()
  }, [sectionExists, onClose])

  // ── Focus: into the dialog on open, back where it was on close ──
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
      if (previous && previous !== document.body && previous.isConnected) previous.focus()
    }
  }, [])

  const close = () => { if (!busy) onClose() }

  // Focus back into the panel: "Restore this version" when usable, else the selected row.
  const focusSelectedRow = () =>
    dialogRef.current?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]')?.focus()
  const refocusPanel = () => {
    requestAnimationFrame(() => {
      const button = restoreButtonRef.current
      if (button && !button.disabled) button.focus()
      else if (!dialogRef.current?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]')) dialogRef.current?.focus()
      else focusSelectedRow()
    })
  }

  // Cancel / Esc / outside click of the "couldn't save the current text" dialog.
  const closeConfirm = () => {
    setConfirm(null)
    refocusPanel()
  }

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // The panel owns its keys: nothing behind it (editor, menus) reacts.
    e.stopPropagation()
    if (e.key === 'Escape') {
      e.preventDefault()
      if (confirm) closeConfirm()
      else close()
      return
    }
    if (e.key !== 'Tab') return
    // Focus trap.
    const root = dialogRef.current
    if (!root) return
    const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === root)) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
  }

  // Keys with the focus lost to <body> (a closed dialog's button unmounted under it…):
  // the container's onKeyDown doesn't see them. Only those — keys inside the panel stop at
  // the container (stopPropagation), so nothing is handled twice. Esc closes the
  // confirmation first, then the panel (not while busy); ↑/↓ move through the list.
  const documentKeyRef = useRef<(e: KeyboardEvent) => void>(() => {})
  useEffect(() => {
    documentKeyRef.current = (e: KeyboardEvent) => {
      if (e.target !== document.body && e.target !== document.documentElement) return
      if (e.key === 'Escape') {
        e.preventDefault()
        if (confirm) closeConfirm()
        else close()
        return
      }
      if ((e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || confirm || panelState !== 'list') return
      e.preventDefault()
      const order: HistorySelection[] = ['current', ...versions.map((v) => v.id)]
      const index = order.indexOf(selected)
      const next = e.key === 'ArrowDown' ? Math.min(order.length - 1, index + 1) : Math.max(0, index - 1)
      setSelection(order[next])
      requestAnimationFrame(focusSelectedRow)
    }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (!ownsKeys(e.target)) documentKeyRef.current(e) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const retryList = () => {
    setList({ status: 'loading' })
    setContents((prev) => Object.fromEntries(Object.entries(prev).filter(([, v]) => v.status === 'ok')))
    setListNonce((n) => n + 1)
  }

  const retryVersion = (id: number) => {
    setContents((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const refreshPlan = async () => {
    setRefreshingPlan(true)
    try {
      await window.noteflow.accountRefreshEntitlements()
    } finally {
      setRefreshingPlan(false)
      retryList()
    }
  }

  // Settings → Sync on the NoteFlow Cloud detail (its plan, or the unlock form).
  const openCloudSettings = () => {
    onClose()
    window.dispatchEvent(new CustomEvent('noteflow:open-settings', { detail: { section: 'sync', intent: { offer: 'cloud' } } }))
  }

  // ── Actions ─────────────────────────────────────────────────────────────────
  const version = selectedLoad?.status === 'ok' ? selectedLoad : null
  const versionEmpty = version ? isEmptyVersion(version.content) : false
  const identical = version ? sameContent(version.content, current) : false
  const canRestore = !!version && !versionEmpty && !busy && sectionExists

  const copyText = async () => {
    const text = selected === 'current' ? current : version?.content
    if (text === undefined) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
      copiedTimerRef.current = setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard refused (no focus / permission): nothing to report beyond no "Copied".
    }
  }

  // The replacement itself: a normal store write, marked as a forced restore.
  const replaceWith = async (content: string, editedAt: string) => {
    setBusy('restoring')
    flushPendingEdits(note.id)
    const token = markForcedRestore(note.id, sectionId, content)
    try {
      await updateSection(note.id, sectionId, { content })
    } catch {
      setBusy(null)
      setActionFailed(true)
      return
    } finally {
      expireForcedRestore(token)
    }
    onRestored({ kind: 'replace', sectionId, editedAt })
  }

  // The section's text in the store right now.
  const storeContent = () =>
    useNotesStore.getState().notes.find((n) => n.id === note.id)?.sections.find((s) => s.id === sectionId)?.content ?? ''

  const restore = async () => {
    if (!canRestore || !version || identical) return
    setActionFailed(false)
    setBusy('capturing')
    try {
      for (let attempt = 1; ; attempt++) {
        // Everything typed so far reaches disk (and its Cloud upload is armed) before
        // main lands it on the server and keeps it as a version.
        await settleNoteWrites(note.id)
        const captured = storeContent()
        const snapshot = await window.noteflow.cloudSnapshotVersion(target)
        // Whatever changed meanwhile (this window's panes: flushed and written here;
        // another window, the CLI, the agent, a pull: already in the store) is compared
        // with what was captured. No await between this check and the write below.
        await settleNoteWrites(note.id)
        const next = planRestoreAfterSnapshot({ snapshot, captured, current: storeContent(), attempt })
        if (next.kind === 'recapture') continue
        if (next.kind === 'confirm') {
          setBusy(null)
          setConfirm(next.reason)
          return
        }
        break
      }
    } catch {
      // The IPC itself failed (rejected invoke): never stuck "Saving…", never a silent replace.
      setBusy(null)
      setConfirm('generic')
      return
    }
    await replaceWith(version.content, version.editedAt)
  }

  const restoreAsNew = async () => {
    if (!version || versionEmpty || busy || !section) return
    setConfirm(null)
    setActionFailed(false)
    setBusy('copying-new')
    flushPendingEdits(note.id)
    const name = restoredSectionName(section.name, version.editedAt, {
      template: vh.restoredName,
      dateFormat: vh.restoredNameDateFormat,
      locale: dateLocale,
    })
    try {
      const copy = await duplicateSection(note.id, sectionId, name, version.content)
      if (!copy) throw new Error('section missing')
      onRestored({ kind: 'copy', sectionId: copy.id, name, content: version.content })
    } catch {
      setBusy(null)
      setActionFailed(true)
    }
  }

  const replaceAnyway = async () => {
    if (!version) return
    setConfirm(null)
    await replaceWith(version.content, version.editedAt)
  }

  // ── Right column ────────────────────────────────────────────────────────────
  const renderSelected = () => {
    if (selected === 'current') {
      return (
        <div className="space-y-3">
          <p className="text-[11px] font-mono text-text-muted leading-relaxed">{vh.currentHint}</p>
          {isEmptyVersion(current)
            ? <CenteredNote icon={<History size={18} />} title={vh.emptyVersion} />
            : <VersionPreview content={current} raw={raw} />}
        </div>
      )
    }
    if (!selectedLoad) {
      return (
        <div className="h-full min-h-[220px] flex items-center justify-center gap-2 text-text-muted">
          <Loader size={13} className="animate-spin" />
          <span className="text-xs font-mono">{vh.loadingVersion}</span>
        </div>
      )
    }
    if (selectedLoad.status === 'error') {
      if (selectedLoad.code === 'not-found') {
        return <CenteredNote icon={<History size={18} />} title={vh.versionExpired} body={vh.versionExpiredHint} />
      }
      return (
        <CenteredNote
          tone="warn"
          icon={<History size={18} />}
          title={vh.versionFailed}
          action={(
            <button type="button" onClick={() => retryVersion(selected)} className={SECONDARY_BUTTON}>
              <RotateCcw size={12} />
              {vh.retry}
            </button>
          )}
        />
      )
    }
    if (versionEmpty) {
      return <CenteredNote icon={<History size={18} />} title={vh.emptyVersion} body={vh.emptyVersionHint} />
    }
    return view === 'changes'
      ? <VersionChanges version={selectedLoad.content} current={current} raw={raw} />
      : <VersionPreview content={selectedLoad.content} raw={raw} />
  }

  const headerTag = selectedMeta ? versionReasonTag(selectedMeta.reason) : null
  const headerEditedAt = version?.editedAt ?? selectedMeta?.editedAt
  const headerDate = formatVersionDate(headerEditedAt, vh.noticeDateFormat, dateLocale)
  // When that text was replaced (and kept): only the list carries it (`savedAt`).
  const headerSavedDate = formatVersionDate(selectedMeta?.savedAt, vh.noticeDateFormat, dateLocale)
  // Two pieces that each stay whole: in a narrow window (or a long language) the
  // "replaced" one drops to its own line instead of the label being cut off.
  const headerLabel = headerDate
    ? [tf(vh.editedAt, { date: headerDate }), ...(headerSavedDate ? [`· ${tf(vh.replacedAt, { date: headerSavedDate })}`] : [])]
    : []
  const showViewSwitch = selected !== 'current' && !!version && !versionEmpty
  const restoreLabel = busy === 'capturing' ? vh.savingCurrent : busy === 'restoring' ? vh.restoring : vh.restore

  const showList = panelState === 'list'
  const showSkeleton = panelState === 'loading'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vh-title"
        aria-describedby="vh-subtitle"
        tabIndex={-1}
        {...OWN_KEYS_PROPS}
        onKeyDown={onKeyDown}
        className="relative w-[min(1040px,94vw)] h-[min(720px,88vh)] bg-surface-1 border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden outline-none"
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-3 border-b border-border">
          <History size={15} className="text-text flex-shrink-0" />
          <div className="flex-1 min-w-0 flex items-baseline gap-2">
            <h2 id="vh-title" className="text-sm font-mono font-semibold text-text whitespace-nowrap">{vh.title}</h2>
            <span id="vh-subtitle" className="text-xs font-mono text-text-muted truncate">
              {section?.name ?? ''}
              {note.title ? <span className="text-text-muted/60"> · {note.title}</span> : null}
            </span>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={!!busy}
            aria-label={vh.close}
            title={vh.close}
            className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-3 transition-colors disabled:opacity-40"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {showList || showSkeleton ? (
            <>
              <aside className="w-[248px] flex-shrink-0 border-r border-border flex flex-col min-h-0 bg-surface-1">
                {showList
                  ? <VersionTimeline versions={versions} selected={selected} onSelect={setSelection} />
                  : <TimelineSkeleton />}
              </aside>
              <section className="flex-1 min-w-0 flex flex-col min-h-0" aria-live="polite">
                {showList && (
                  <div className="flex items-center gap-3 px-5 pt-3 pb-2.5 border-b border-border/70 min-h-[48px]">
                    <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                      {selected === 'current'
                        ? <span className="text-xs font-mono text-text truncate">{vh.currentVersion}</span>
                        : headerLabel.map((part, i) => (
                          <span key={i} className="text-xs font-mono text-text whitespace-nowrap">{part}</span>
                        ))}
                      {headerTag && <ReasonTag reason={headerTag} />}
                    </div>
                    {showViewSwitch && view === 'changes' && !identical && <DiffLegend />}
                    {showViewSwitch && (
                      <div role="radiogroup" aria-label={vh.viewLabel} className="flex items-center p-0.5 rounded-md bg-surface-2 border border-border">
                        {(['changes', 'preview'] as const).map((id) => (
                          <button
                            key={id}
                            type="button"
                            role="radio"
                            aria-checked={view === id}
                            onClick={() => setView(id)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono transition-colors ${
                              view === id ? 'bg-surface-3 text-text shadow-sm' : 'text-text-muted hover:text-text'
                            }`}
                          >
                            {id === 'changes' ? <GitCompare size={11} /> : <Eye size={11} />}
                            {id === 'changes' ? vh.viewChanges : vh.viewPreview}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
                  {showList ? renderSelected() : (
                    <div className="space-y-2.5" aria-hidden>
                      {[0.95, 0.8, 0.88, 0.6, 0.92, 0.7, 0.5].map((w, i) => (
                        <div key={i} className="h-3 rounded bg-surface-3/50 animate-pulse" style={{ width: `${w * 100}%` }} />
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </>
          ) : (
            <div className="flex-1 min-w-0 overflow-y-auto">
              <PanelStateView
                state={panelState}
                onRetry={retryList}
                onOpenCloud={openCloudSettings}
                onRefreshPlan={() => void refreshPlan()}
                refreshingPlan={refreshingPlan}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-t border-border">
          <span className="flex items-center gap-1.5 text-[10.5px] font-mono text-text-muted/80 mr-auto min-w-0">
            <ShieldCheck size={12} className="flex-shrink-0" />
            <span className="truncate">{actionFailed ? <span className="text-red/90">{vh.restoreFailed}</span> : vh.reassurance}</span>
          </span>
          {showList && (
            <>
              <button
                type="button"
                onClick={() => void copyText()}
                disabled={selected === 'current' ? !current : !version || versionEmpty}
                className={SECONDARY_BUTTON}
              >
                {copied ? <Check size={12} className="text-accent-2" /> : <Copy size={12} />}
                {copied ? vh.copied : vh.copy}
              </button>
              <button
                type="button"
                onClick={() => void restoreAsNew()}
                disabled={!canRestore}
                className={SECONDARY_BUTTON}
              >
                {busy === 'copying-new' ? <Loader size={12} className="animate-spin" /> : <CopyPlus size={12} />}
                {vh.restoreAsNew}
              </button>
              <button
                type="button"
                ref={restoreButtonRef}
                onClick={() => void restore()}
                disabled={!canRestore || identical}
                title={identical ? vh.identical : undefined}
                className={PRIMARY_BUTTON}
              >
                {busy === 'capturing' || busy === 'restoring' ? <Loader size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                {restoreLabel}
              </button>
            </>
          )}
        </div>

        {confirm && (
          <SnapshotFailedDialog
            reason={confirm}
            onRestoreAsNew={() => void restoreAsNew()}
            onReplaceAnyway={() => void replaceAnyway()}
            onCancel={closeConfirm}
          />
        )}
      </div>
    </div>
  )
}
