import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { useNotesStore } from '../../stores/notesStore'
import { useLanguageStore } from '../../stores/languageStore'
import { useT } from '../../i18n/useT'
import { plural, tf } from '../../i18n/format'
import {
  FOCUS_DAYS,
  activityTotals,
  buildActivityFocus,
  compactCount,
  dayStart,
  type ActivityLogDays,
} from '../../lib/activitySummary'

// Activity section of Settings → General, top to bottom:
//  - header: title + "since <month year>" of the oldest note;
//  - four totals cards (notes, sections, words, tasks done with a progress bar);
//  - "the notes you keep coming back to": the notes touched on the most days of
//    the last 4 weeks, each with a strip of 28 day cells (4 blocks of 7, oldest
//    → today) and an axis with the start date of each block. Its title says
//    "per device": the edit log behind the strips is local to this device.
// "Touched" merges the per-device activity log (userData/activity-log.json, read
// once on mount) with each note's `updated` and `created` days; the counting and
// ranking rules live in lib/activitySummary.ts. Colours are theme tokens only.

const CELL_W = 9
const CELL_GAP = 3
const BLOCK_DAYS = 7
const BLOCKS = FOCUS_DAYS / BLOCK_DAYS
const BLOCK_W = BLOCK_DAYS * CELL_W + (BLOCK_DAYS - 1) * CELL_GAP
const TITLE_W = 140

// Touched cells: the accent on the top row, a dimmer accent below; untouched: a faint
// tint of the muted text colour (a surface token like --bg-3 vanishes on light themes,
// where it sits almost on top of the panel background)
const TOUCHED_TOP = 'rgb(var(--accent))'
const TOUCHED = 'rgb(var(--accent) / 0.55)'
const UNTOUCHED = 'rgb(var(--text-muted) / 0.18)'

function StatCard({ value, label, progress }: { value: string; label: string; progress?: number }) {
  return (
    <div className="rounded-[10px] bg-surface-2 px-3 py-2.5 min-w-0">
      <p className="text-[22px] leading-none font-mono font-semibold text-text tabular-nums truncate">{value}</p>
      {progress !== undefined && (
        <div className="mt-2 h-[3px] rounded-full bg-surface-3 overflow-hidden">
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      <p className="text-[11px] font-mono text-text-muted mt-1.5 truncate">{label}</p>
    </div>
  )
}

export function ActivitySummary() {
  const notes = useNotesStore((s) => s.notes)
  const lang = useLanguageStore((s) => s.lang)
  const dateLocale = useLanguageStore((s) => s.dateLocale)
  const t = useT()
  const tA = t.settings.general.activity

  // Per-device edit log (null while loading). If it fails, "touched" falls back
  // to the notes' own created/updated days only.
  const [log, setLog] = useState<ActivityLogDays | null>(null)
  useEffect(() => {
    let alive = true
    window.noteflow.getActivityLog()
      .then((res) => { if (alive) setLog(res.days) })
      .catch(() => { if (alive) setLog({}) })
    return () => { alive = false }
  }, [])

  const totals = useMemo(() => activityTotals(notes), [notes])
  // "Now" is taken with the data, so the strips and their dates agree
  const { focus, cellDays } = useMemo(() => {
    const now = new Date()
    return {
      focus: buildActivityFocus(notes, log ?? {}, now),
      // Day of each cell, oldest first (the last one is today)
      cellDays: Array.from({ length: FOCUS_DAYS }, (_, i) => dayStart(now, FOCUS_DAYS - 1 - i)),
    }
  }, [notes, log])

  const fmt = (d: Date, pattern: string) => format(d, pattern, { locale: dateLocale })
  // Native tooltip of each cell: short local date · touched or not (· today on the last one)
  const cellDates = cellDays.map((d) => fmt(d, 'EEE d MMM'))
  const cellTitle = (i: number, on: boolean) =>
    [cellDates[i], on ? tA.cellTouched : tA.cellUntouched, ...(i === FOCUS_DAYS - 1 ? [tA.today] : [])].join(' · ')

  const since = totals.oldestCreated ? fmt(new Date(totals.oldestCreated), 'MMM yyyy') : null
  const tasksProgress = totals.tasksTotal > 0 ? totals.tasksDone / totals.tasksTotal : 0

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-mono font-medium text-text">{tA.title}</p>
        {since && (
          <p className="text-[10px] font-mono text-text-muted whitespace-nowrap">{tf(tA.since, { date: since })}</p>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2.5 mt-3">
        <StatCard value={String(totals.notes)} label={plural(tA.notes, totals.notes)} />
        <StatCard value={String(totals.sections)} label={plural(tA.sections, totals.sections)} />
        <StatCard value={compactCount(totals.words, lang)} label={plural(tA.words, totals.words)} />
        <StatCard
          value={`${totals.tasksDone} / ${totals.tasksTotal}`}
          label={tA.tasksDone}
          progress={tasksProgress}
        />
      </div>

      <div className="mt-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[11px] font-mono text-text-muted">
            {tA.focusTitle}
            <span className="text-text-muted/60"> · {tA.perDevice}</span>
          </p>
          <p className="text-[10px] font-mono text-text-muted whitespace-nowrap">{tA.focusWindow}</p>
        </div>

        {focus.rows.length === 0 ? (
          // Wait for the log before claiming nothing was touched
          log !== null && <p className="text-[11px] font-mono text-text-muted/70 mt-3">{tA.empty}</p>
        ) : (
          <div className="mt-3 space-y-1.5">
            {focus.rows.map((row, r) => (
              <div key={row.id} className="flex items-center gap-3">
                <p
                  className="text-[11px] font-mono text-text truncate shrink min-w-0"
                  style={{ width: TITLE_W }}
                  title={row.title || t.common.untitled}
                >
                  {row.title || t.common.untitled}
                </p>
                <div className="flex flex-shrink-0 gap-2">
                  {Array.from({ length: BLOCKS }, (_, b) => (
                    <div key={b} className="flex" style={{ gap: CELL_GAP }}>
                      {row.touched.slice(b * BLOCK_DAYS, (b + 1) * BLOCK_DAYS).map((on, k) => {
                        const i = b * BLOCK_DAYS + k
                        return (
                          <span
                            key={i}
                            className="block rounded-[2px]"
                            style={{
                              width: CELL_W,
                              height: 18,
                              background: on ? (r === 0 ? TOUCHED_TOP : TOUCHED) : UNTOUCHED,
                            }}
                            title={cellTitle(i, on)}
                          />
                        )
                      })}
                    </div>
                  ))}
                </div>
                <p className="w-14 flex-shrink-0 text-right text-[10px] font-mono text-text-muted tabular-nums whitespace-nowrap">
                  {plural(tA.daysTouched, row.count)}
                </p>
              </div>
            ))}

            {/* Axis: start date of each 7-day block, "today" under the last cell */}
            <div className="flex items-center gap-3 text-[10px] font-mono text-text-muted select-none" aria-hidden="true">
              <span className="shrink min-w-0" style={{ width: TITLE_W }} />
              <div className="flex flex-shrink-0 gap-2">
                {Array.from({ length: BLOCKS }, (_, b) => (
                  <div key={b} className="flex justify-between whitespace-nowrap" style={{ width: BLOCK_W }}>
                    <span>{fmt(cellDays[b * BLOCK_DAYS], 'd MMM')}</span>
                    {b === BLOCKS - 1 && <span>{tA.today}</span>}
                  </div>
                ))}
              </div>
              <span className="w-14 flex-shrink-0" />
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
