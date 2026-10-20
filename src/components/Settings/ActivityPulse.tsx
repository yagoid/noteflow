import { useEffect, useId, useMemo, useState } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import { useT } from '../../i18n/useT'
import { plural } from '../../i18n/format'
import { buildActivityPulse, activityAxisStart, type ActivityLogDays } from '../../lib/activityPulse'

// Decorative "activity pulse" section in Settings → General: a mirror chart of an
// ADAPTIVE window (from the first active day, 4 to 16 weeks), one point per day
// or every 2 days (dense zigzag). Left = start of the window, right = today.
// A thin baseline runs through the middle; notes EDITED rise above it (green)
// and SECTIONS CREATED hang below it (violet), each half as a
// flat translucent area with a straight-segment (zigzag) outline:
//
//        /\    /\  /\/\        ← notes edited
//   ____/  \/\/  \/    \_____
//         \/\    /\/\  /       ← sections created
//
// Each point is a rolling 7-day sum, and each half is sqrt-normalised against its
// OWN maximum, so both stay lively even with sparse activity (the heights of the
// two halves are therefore not comparable with each other; the legend has totals).
// "Edited" merges the per-device activity log (userData/activity-log.json, read
// once on mount) with each note's last edit; the counting, merge, window and
// sampling rules all live in lib/activityPulse.ts. Only note ids and timestamps
// are read, never content or titles.
//
// The <svg> itself is decorative (aria-hidden, no interactivity, no text inside):
// because it stretches with preserveAspectRatio="none", any SVG <text> would be
// horizontally distorted — so the header, the legend and the axis labels are
// plain HTML laid out around the SVG, and go through i18n like every other UI string.

// ── Geometry (viewBox units) ──────────────────────────────────────────────────
// The x scale depends on the window (number of points), so it is derived per render
const VB_W = 160
const VB_H = 44
const BASELINE = VB_H / 2 // 22
const MAX_AMP = 19 // tallest peak reaches y = 3 (or 41), leaving a little headroom

// Fixed colours: no theme token is reliably green (--accent-2 is teal, grey or
// cyan depending on the theme) or violet (--purple is orchid/pink in several
// themes and blue in Arctic Day). Both are the reference mockup's colours, mid
// tones that read on dark and light backgrounds alike.
const EDITED_RGB = '29 158 117' // #1D9E75
const CREATED_RGB = '127 119 221' // #7F77DD
const FILL_OPACITY = 0.32
const STROKE_OPACITY = 0.88
const ink = (rgb: string, alpha = 1) => `rgb(${rgb} / ${alpha})`
const BASELINE_INK = 'rgb(var(--text-muted) / 0.45)'
// Very faint background grid: one vertical per week (counted back from today),
// horizontals at ½ and full amplitude on both halves
const GRID_INK = 'rgb(var(--text-muted) / 0.08)'
const GRID_Y = [0.5, 1].flatMap((f) => [BASELINE - MAX_AMP * f, BASELINE + MAX_AMP * f])

// One half of the mirror as a closed zigzag: from the baseline at the left edge,
// straight segments through one point per sample (the last one on the right edge,
// i.e. today), then back down onto the baseline. `dir` = -1 up, +1 down.
function halfPathD(amps: number[], dir: -1 | 1): string {
  const pointW = VB_W / amps.length
  let d = `M 0 ${BASELINE}`
  amps.forEach((a, i) => {
    d += ` L ${(i + 1) * pointW} ${BASELINE + dir * a}`
  })
  return `${d} L ${VB_W} ${BASELINE} Z`
}

export function ActivityPulse() {
  const notes = useNotesStore((s) => s.notes)
  const t = useT()
  const clipId = useId()

  // Per-device edit log (null while loading). If it fails, the chart falls back
  // to the notes' own last edits only.
  const [log, setLog] = useState<ActivityLogDays | null>(null)
  useEffect(() => {
    let alive = true
    window.noteflow.getActivityLog()
      .then((res) => { if (alive) setLog(res.days) })
      .catch(() => { if (alive) setLog({}) })
    return () => { alive = false }
  }, [])
  const logReady = log !== null

  const { editedD, createdD, totalEdited, totalCreated, windowDays } = useMemo(() => {
    const pulse = buildActivityPulse(notes, log ?? {})
    const edited = pulse.edited
    const created = pulse.sectionsCreated
    const points = edited.length

    // Each half scales to its OWN maximum (sqrt-normalised so one monster stretch
    // can't flatten the rest): both halves always fill their height
    const amps = (series: number[]) => {
      const max = Math.max(0, ...series)
      return series.map((c) => (c > 0 && max > 0 ? (Math.sqrt(c) / Math.sqrt(max)) * MAX_AMP : 0))
    }
    const editedAmps = amps(edited)
    const createdAmps = amps(created)

    // Seed state: no activity in the window → one small, subtle mound near the
    // end, mirrored above and below the baseline
    if (Math.max(...edited, ...created) === 0) {
      const seed = points - 6
      for (const a of [editedAmps, createdAmps]) {
        a[seed - 1] = MAX_AMP * 0.12
        a[seed] = MAX_AMP * 0.3
        a[seed + 1] = MAX_AMP * 0.12
      }
    }

    return {
      editedD: halfPathD(editedAmps, -1),
      createdD: halfPathD(createdAmps, 1),
      // Legend totals: distinct notes edited / sections created within the window
      totalEdited: pulse.totalEdited,
      totalCreated: pulse.totalCreated,
      windowDays: pulse.days,
    }
  }, [notes, log])

  // Background grid: one vertical per week, counted back from today (right edge)
  const weekLinesX = Array.from(
    { length: Math.ceil(windowDays / 7) - 1 },
    (_, i) => VB_W - ((i + 1) * 7 * VB_W) / windowDays,
  )

  // Draw-in animation: a clip rectangle that grows left → right in ~1s, revealing
  // both halves (the baseline sits outside the clip, so it is there from the
  // start). Waits for the log so the shape doesn't jump mid-animation. Skipped
  // under prefers-reduced-motion.
  const reducedMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  const [drawn, setDrawn] = useState(reducedMotion)
  useEffect(() => {
    if (reducedMotion || !logReady) return
    // Double rAF: make sure the 0-width clip gets painted before transitioning
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setDrawn(true))
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [reducedMotion, logReady])

  const tA = t.settings.general.activity
  const axisStart = activityAxisStart(windowDays)

  return (
    <section>
      {/* Title row: legend with the window totals on the right (adds no height) */}
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-mono font-medium text-text">{tA.title}</p>
        <p className="text-[10px] font-mono text-text-muted select-none whitespace-nowrap">
          <span style={{ color: ink(EDITED_RGB) }}>↑ {totalEdited}</span>{' '}
          {plural(tA.notesEdited, totalEdited)}
          <span className="mx-1.5">·</span>
          <span style={{ color: ink(CREATED_RGB) }}>↓ {totalCreated}</span>{' '}
          {plural(tA.sectionsCreated, totalCreated)}
        </p>
      </div>
      <p className="text-[11px] font-mono text-text-muted mt-1">{tA.hint}</p>

      <div className="mt-3">
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="none"
          className="w-full h-32 block pointer-events-none"
        >
          <defs>
            <clipPath id={clipId}>
              <rect
                x="0"
                y="0"
                height={VB_H}
                style={{
                  width: drawn ? VB_W : 0,
                  transition: reducedMotion ? 'none' : 'width 1000ms cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              />
            </clipPath>
          </defs>

          <g stroke={GRID_INK} strokeWidth={1}>
            {weekLinesX.map((x) => (
              <line
                key={`v${x}`}
                x1={x}
                y1={0}
                x2={x}
                y2={VB_H}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {GRID_Y.map((y) => (
              <line key={`h${y}`} x1={0} y1={y} x2={VB_W} y2={y} vectorEffect="non-scaling-stroke" />
            ))}
          </g>

          <line
            x1={0}
            y1={BASELINE}
            x2={VB_W}
            y2={BASELINE}
            stroke={BASELINE_INK}
            strokeWidth={0.75}
            vectorEffect="non-scaling-stroke"
          />

          <g clipPath={`url(#${clipId})`} strokeWidth={1.25} strokeLinejoin="round">
            {[
              { d: editedD, rgb: EDITED_RGB },
              { d: createdD, rgb: CREATED_RGB },
            ].map(({ d, rgb }) => (
              <path
                key={rgb}
                d={d}
                fill={ink(rgb, FILL_OPACITY)}
                stroke={ink(rgb, STROKE_OPACITY)}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        </svg>

        {/* X axis: start of the window on the left, today on the right */}
        <div className="flex items-center justify-between text-[10px] font-mono text-text-muted mt-1 select-none">
          <span>{plural(axisStart.unit === 'weeks' ? tA.xStartWeeks : tA.xStartDays, axisStart.count)}</span>
          <span>{tA.xEnd}</span>
        </div>
      </div>
    </section>
  )
}
