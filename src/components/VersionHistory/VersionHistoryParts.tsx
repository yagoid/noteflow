// Presentational pieces of the version history panel (VersionHistoryPanel.tsx):
// the timeline, the right column's body (changes / preview), the whole-panel
// states and the "couldn't save the current text" confirmation. No IPC and no
// store writes here — everything arrives through props.
import { useEffect, useMemo, useRef } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import {
  AlertTriangle, CloudOff, FileQuestion, History, KeyRound, Loader, Lock, RefreshCw, ShieldAlert, Sparkles, WifiOff,
} from 'lucide-react'
import { useT } from '../../i18n/useT'
import { plural, tf } from '../../i18n/format'
import { formatDate } from '../../i18n/formatDate'
import { useLanguageStore } from '../../stores/languageStore'
import { useEditorSettingsStore, proseFontStack } from '../../stores/editorSettingsStore'
import { rawPreviewText, sectionPreviewHtml } from '../../lib/noteOverviewGrid'
import {
  buildVersionDiff,
  formatByteSize,
  groupVersionsByDay,
  versionReasonTag,
  versionTimeRange,
  type HistoryPanelState,
  type SnapshotFailureKey,
} from '../../lib/versionHistory'
import type { CloudVersionMeta, CloudVersionReason } from '../../types'
import { DANGER_BUTTON, MONO_STACK, PRIMARY_BUTTON, SECONDARY_BUTTON } from './versionHistoryUi'

/** The current text (no diff) or one version, by id. */
export type HistorySelection = 'current' | number

// A whole section, not a card: still capped so a huge one can't build a huge DOM.
const PREVIEW_MAX_CHARS = 80_000


// ── Timeline ──────────────────────────────────────────────────────────────────

interface TimelineProps {
  versions: CloudVersionMeta[]
  selected: HistorySelection
  onSelect: (selection: HistorySelection) => void
}

/**
 * Left column: "Current version" on top, then the versions grouped by local day.
 * A listbox with roving focus: ↑/↓ (Home/End) move the selection and the focus.
 */
export function VersionTimeline({ versions, selected, onSelect }: TimelineProps) {
  const t = useT()
  const lang = useLanguageStore((s) => s.lang)
  const dateLocale = useLanguageStore((s) => s.dateLocale)
  const groups = useMemo(() => groupVersionsByDay(versions), [versions])
  const order = useMemo<HistorySelection[]>(() => ['current', ...versions.map((v) => v.id)], [versions])
  const optionRefs = useRef(new Map<HistorySelection, HTMLDivElement>())

  const move = (to: HistorySelection) => {
    onSelect(to)
    optionRefs.current.get(to)?.focus()
  }

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const index = order.indexOf(selected)
    let next: number | null = null
    if (e.key === 'ArrowDown') next = Math.min(order.length - 1, index + 1)
    else if (e.key === 'ArrowUp') next = Math.max(0, index - 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = order.length - 1
    if (next === null) return
    e.preventDefault()
    move(order[next])
  }

  // The selected option stays in view (keyboard moves, the initial selection).
  useEffect(() => {
    optionRefs.current.get(selected)?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  // When the list appears, focus goes to its selected row (unless the user already put
  // it on a control): opening the panel and pressing ↓ navigates right away.
  const initialSelectedRef = useRef(selected)
  useEffect(() => {
    const row = optionRefs.current.get(initialSelectedRef.current)
    const active = document.activeElement
    const idle = !active || active === document.body || (active.getAttribute('role') === 'dialog' && active.contains(row ?? null))
    if (row && idle) row.focus()
  }, [])

  const option = (id: HistorySelection, children: ReactNode, label: string, title?: string) => {
    const isSelected = id === selected
    return (
      <div
        key={String(id)}
        ref={(el) => { if (el) optionRefs.current.set(id, el); else optionRefs.current.delete(id) }}
        role="option"
        aria-selected={isSelected}
        aria-label={label}
        title={title}
        tabIndex={isSelected ? 0 : -1}
        onClick={() => move(id)}
        className={`group relative mx-2 px-2.5 py-1.5 rounded-md cursor-pointer outline-none transition-colors
          focus-visible:ring-1 focus-visible:ring-accent/60
          ${isSelected ? 'bg-surface-3 text-text' : 'text-text/85 hover:bg-surface-2 hover:text-text'}`}
      >
        {isSelected && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent" aria-hidden />}
        {children}
      </div>
    )
  }

  return (
    <div
      role="listbox"
      aria-label={t.versionHistory.timelineLabel}
      onKeyDown={onKeyDown}
      className="flex-1 min-h-0 overflow-y-auto py-2"
    >
      {option(
        'current',
        <div className="flex flex-col">
          <span className="text-xs font-mono font-semibold">{t.versionHistory.currentVersion}</span>
          <span className="text-[10.5px] font-mono text-text-muted">{t.versionHistory.currentVersionHint}</span>
        </div>,
        t.versionHistory.currentVersion,
      )}
      {groups.map((group) => {
        const dayLabel = group.day === 'today'
          ? t.versionHistory.today
          : group.day === 'yesterday'
            ? t.versionHistory.yesterday
            : formatDate(group.date, t.versionHistory.dayFormat)
        return (
          <div key={group.key} role="group" aria-label={dayLabel} className="mt-2.5">
            <div className="px-4 pb-1 text-[10px] font-mono uppercase tracking-widest text-text-muted/80">{dayLabel}</div>
            {group.versions.map((v) => {
              // Written → replaced: the version holds the text written at `from` until `to`.
              const range = versionTimeRange(v.editedAt, v.savedAt, {
                timeFormat: t.versionHistory.timeFormat,
                otherDayFormat: t.versionHistory.replacedOtherDayFormat,
                locale: dateLocale,
              })
              const spanLabel = range.to === null
                ? tf(t.versionHistory.rowWritten, { from: range.from })
                : tf(range.sameDay ? t.versionHistory.rowWrittenReplaced : t.versionHistory.rowWrittenReplacedOtherDay, {
                  from: range.from,
                  to: range.to,
                })
              const tag = versionReasonTag(v.reason)
              return option(
                v.id,
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-xs font-mono tabular-nums">
                      {range.from}
                      {range.to !== null && <span className="text-text-muted"> → {range.to}</span>}
                    </span>
                    <span className="shrink-0 text-[10.5px] font-mono tabular-nums text-text-muted">{formatByteSize(v.size, lang)}</span>
                  </div>
                  {tag && <ReasonTag reason={tag} />}
                </div>,
                `${dayLabel} · ${spanLabel}${tag ? ` · ${t.versionHistory.reason[tag]}` : ''}`,
                spanLabel,
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

export function ReasonTag({ reason }: { reason: Exclude<CloudVersionReason, 'edit'> }) {
  const t = useT()
  return (
    <span className="self-start text-[10px] font-mono px-1.5 py-px rounded border border-border text-text-muted">
      {t.versionHistory.reason[reason]}
    </span>
  )
}

/** Skeleton of the timeline while the list loads. */
export function TimelineSkeleton() {
  return (
    <div className="flex-1 py-3 px-4 space-y-3" aria-hidden>
      {[0.9, 0.7, 0.8, 0.6, 0.75, 0.5].map((w, i) => (
        <div key={i} className="space-y-1.5">
          <div className="h-3 rounded bg-surface-3/70 animate-pulse" style={{ width: `${w * 100}%` }} />
          <div className="h-2.5 rounded bg-surface-3/40 animate-pulse" style={{ width: `${w * 60}%` }} />
        </div>
      ))}
    </div>
  )
}

// ── Right column ──────────────────────────────────────────────────────────────

/** Read-only render of a section's text: Markdown as the editor shows it, or text mode as is. */
export function VersionPreview({ content, raw }: { content: string; raw: boolean }) {
  const fontFamily = useEditorSettingsStore((s) => s.fontFamily)
  const html = useMemo(() => (raw ? '' : sectionPreviewHtml(content, PREVIEW_MAX_CHARS)), [content, raw])
  if (raw) {
    return (
      <pre
        className="whitespace-pre-wrap break-words text-xs leading-relaxed text-text"
        style={{ fontFamily: MONO_STACK }}
      >
        {rawPreviewText(content, PREVIEW_MAX_CHARS)}
      </pre>
    )
  }
  return (
    <div className="note-preview" style={{ '--prose-font-family': proseFontStack(fontFamily) } as CSSProperties}>
      <div className="prose-editor">
        <div className="ProseMirror" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  )
}

/** Line diff of a version against the current text, with folded context. */
export function VersionChanges({ version, current, raw }: { version: string; current: string; raw: boolean }) {
  const t = useT()
  const diff = useMemo(() => buildVersionDiff(version, current), [version, current])

  if (diff.identical) {
    return <CenteredNote icon={<History size={20} />} title={t.versionHistory.identical} body={t.versionHistory.identicalHint} />
  }
  if (diff.truncated) {
    return (
      <div className="space-y-3">
        <p className="flex items-start gap-2 text-[11px] font-mono text-text-muted leading-relaxed">
          <AlertTriangle size={12} className="mt-0.5 shrink-0 text-accent-3" />
          {t.versionHistory.tooManyChanges}
        </p>
        <VersionPreview content={version} raw={raw} />
      </div>
    )
  }
  return (
    <div className="rounded-md border border-border overflow-hidden text-[11.5px] leading-5" style={{ fontFamily: MONO_STACK }}>
      {diff.rows.map((row, i) => {
        if (row.kind === 'gap') {
          return (
            <div key={i} className="px-3 py-0.5 bg-surface-2/60 text-[10.5px] font-mono text-text-muted/80 select-none border-y border-border/60 first:border-t-0 last:border-b-0">
              ⋯ {plural(t.versionHistory.linesUnchanged, row.count)}
            </div>
          )
        }
        const tone = row.kind === 'version'
          ? 'bg-accent-2/[0.12] text-text border-l-accent-2'
          : row.kind === 'current'
            ? 'bg-red/[0.10] text-text border-l-red'
            : 'text-text-muted border-l-transparent'
        return (
          <div key={i} className={`px-3 border-l-2 whitespace-pre-wrap break-words min-h-[1.25rem] ${tone}`}>
            {row.text}
          </div>
        )
      })}
    </div>
  )
}

/** Legend of the diff colours. */
export function DiffLegend() {
  const t = useT()
  return (
    <div className="flex items-center gap-3 text-[10.5px] font-mono text-text-muted">
      <span className="inline-flex items-center gap-1.5">
        <i className="w-2.5 h-2.5 rounded-sm bg-accent-2/40 border border-accent-2/70" aria-hidden />
        {t.versionHistory.legendVersion}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className="w-2.5 h-2.5 rounded-sm bg-red/30 border border-red/60" aria-hidden />
        {t.versionHistory.legendCurrent}
      </span>
    </div>
  )
}

/** A centred icon + title + text (+ optional action) — empty / error / info states. */
export function CenteredNote({ icon, title, body, action, tone = 'muted' }: {
  icon: ReactNode
  title: string
  body?: string
  action?: ReactNode
  tone?: 'muted' | 'accent' | 'warn'
}) {
  const iconTone = tone === 'accent' ? 'text-accent bg-accent/10' : tone === 'warn' ? 'text-accent-3 bg-accent-3/10' : 'text-text-muted bg-surface-2'
  return (
    <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center px-8 gap-2.5">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${iconTone}`}>{icon}</div>
      <p className="text-sm font-mono font-semibold text-text max-w-sm">{title}</p>
      {body && <p className="text-xs font-mono text-text-muted leading-relaxed max-w-sm">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/** The whole-panel states (everything but the list itself). */
export function PanelStateView({ state, onRetry, onOpenCloud, onRefreshPlan, refreshingPlan }: {
  state: Exclude<HistoryPanelState, 'list' | 'loading'>
  onRetry: () => void
  onOpenCloud: () => void
  onRefreshPlan: () => void
  refreshingPlan: boolean
}) {
  const t = useT()
  const vh = t.versionHistory
  const retry = (
    <button type="button" onClick={onRetry} className={SECONDARY_BUTTON}>
      <RefreshCw size={12} />
      {vh.retry}
    </button>
  )
  switch (state) {
    case 'offer':
      return (
        <CenteredNote
          tone="accent"
          icon={<History size={18} />}
          title={vh.offerTitle}
          body={vh.offerBody}
          action={
            <button type="button" onClick={onOpenCloud} className={PRIMARY_BUTTON}>
              <Sparkles size={12} />
              {vh.offerAction}
            </button>
          }
        />
      )
    case 'plan-unknown':
      return (
        <CenteredNote
          icon={<FileQuestion size={18} />}
          title={vh.planUnknownTitle}
          body={vh.planUnknownBody}
          action={
            <button type="button" onClick={onRefreshPlan} disabled={refreshingPlan} className={SECONDARY_BUTTON}>
              {refreshingPlan ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {vh.retry}
            </button>
          }
        />
      )
    case 'empty':
      return <CenteredNote icon={<History size={18} />} title={vh.emptyTitle} body={vh.emptyBody} />
    case 'locked':
      return (
        <CenteredNote
          tone="warn"
          icon={<KeyRound size={18} />}
          title={vh.lockedTitle}
          body={vh.lockedBody}
          action={
            <button type="button" onClick={onOpenCloud} className={SECONDARY_BUTTON}>
              <Lock size={12} />
              {vh.lockedAction}
            </button>
          }
        />
      )
    case 'unreachable':
      return <CenteredNote icon={<WifiOff size={18} />} title={vh.unreachableTitle} body={vh.unreachableBody} action={retry} />
    case 'unavailable':
      return <CenteredNote icon={<CloudOff size={18} />} title={vh.unavailableTitle} body={vh.unavailableBody} />
    case 'unsupported':
      return <CenteredNote icon={<Lock size={18} />} title={vh.unsupportedTitle} body={vh.unsupportedBody} />
    case 'error':
      return <CenteredNote tone="warn" icon={<ShieldAlert size={18} />} title={vh.errorTitle} body={vh.errorBody} action={retry} />
  }
}

// ── Snapshot failed ───────────────────────────────────────────────────────────

/**
 * Inside the panel: the current text couldn't be kept in the history, so a plain
 * restore would lose it. Restoring as a new section is the recommended way out.
 */
export function SnapshotFailedDialog({ reason, onRestoreAsNew, onReplaceAnyway, onCancel }: {
  reason: SnapshotFailureKey
  onRestoreAsNew: () => void
  onReplaceAnyway: () => void
  onCancel: () => void
}) {
  const t = useT()
  const vh = t.versionHistory
  const primaryRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { primaryRef.current?.focus() }, [])
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/45 backdrop-blur-[1px]" onMouseDown={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="vh-snapshot-failed-title"
        aria-describedby="vh-snapshot-failed-body"
        className="w-[min(580px,92%)] bg-surface-1 border border-border rounded-lg shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2.5 px-4 pt-4 pb-3 border-b border-border">
          <AlertTriangle size={15} className="text-accent-3 flex-shrink-0 mt-0.5" />
          <span id="vh-snapshot-failed-title" className="text-sm font-mono font-semibold text-text leading-snug">{vh.snapshotFailedTitle}</span>
        </div>
        <div id="vh-snapshot-failed-body" className="px-4 py-3 space-y-2 text-xs font-mono leading-relaxed">
          <p className="text-text">{vh.snapshotReasons[reason]}</p>
          <p className="text-text-muted">{vh.snapshotFailedBody}</p>
          <p className="text-text-muted">{vh.snapshotFailedRecommend}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 px-4 pb-4 pt-1 [&>button]:whitespace-nowrap">
          <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-md text-xs font-mono text-text-muted hover:text-text hover:bg-surface-2 transition-colors">
            {vh.cancel}
          </button>
          <button type="button" onClick={onReplaceAnyway} className={DANGER_BUTTON}>
            {vh.replaceAnyway}
          </button>
          <button ref={primaryRef} type="button" onClick={onRestoreAsNew} className={PRIMARY_BUTTON}>
            {vh.restoreAsNew}
          </button>
        </div>
      </div>
    </div>
  )
}
