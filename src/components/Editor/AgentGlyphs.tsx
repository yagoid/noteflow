import type { AgentBoxGlyph, AgentTone } from '../../lib/agentTaskUi'
import './agentTasks.css'

// The drawn glyphs of agent tasks (agentTasks.css styles them):
//   - AgentStateGlyph ("orbit"): one ring per state that fills as the task
//     goes — the text chip, the report's head and the queue bar's counts;
//   - AgentTaskBoxGlyph: a task's own checkbox while it runs (its border runs)
//     or once it is done (the tick with a spark) — AgentTaskBox;
//   - AgentHandOverGlyph: the dashed tick with a spark, "hand it to an agent"
//     — the pill over a text selection.
// All of them draw in `currentColor` on a 16-unit grid; the state's colour
// comes from the CSS (`.agent-tone--<tone>`). Their animations stop with
// prefers-reduced-motion.

/** A four-point spark centred on (x, y) with radius r, filled. */
function sparkPath(x: number, y: number, r: number): string {
  const a = +(r * 0.3).toFixed(3)
  const b = +(r * 0.7).toFixed(3)
  return `M${x} ${y - r}l${a} ${b} ${b} ${a} -${b} ${a} -${a} ${b} -${a} -${b} -${b} -${a} ${b} -${a}z`
}

const R = 5.75

function orbit(tone: AgentTone) {
  switch (tone) {
    case 'queued':
      return (
        <>
          <circle cx="8" cy="8" r={R} strokeDasharray="2.2 1.9" />
          <path d="M5.6 8.2l1.6 1.6 3.2-3.5" />
        </>
      )
    case 'running':
      return (
        <>
          <circle cx="8" cy="8" r={R} opacity=".22" />
          <g className="agent-g-spin"><path d="M8 2.25a5.75 5.75 0 0 1 5.75 5.75" /></g>
        </>
      )
    case 'waiting':
      return (
        <>
          <circle cx="8" cy="8" r={R} />
          <circle cx="8" cy="8" r="2.3" fill="currentColor" stroke="none" className="agent-g-pulse" />
        </>
      )
    case 'review':
      return (
        <>
          <circle cx="8" cy="8" r={R} />
          <path d="M8 8V4.1A3.9 3.9 0 1 1 4.1 8z" fill="currentColor" stroke="none" />
        </>
      )
    case 'done':
      return (
        <>
          <circle cx="8" cy="8" r="6.6" fill="currentColor" stroke="none" />
          <path d="M5.2 8.2l1.9 1.9 3.7-4" className="agent-g-cut" strokeWidth="1.7" />
        </>
      )
    case 'failed':
      return (
        <>
          <circle cx="8" cy="8" r={R} />
          <path d="M6.1 6.1l3.8 3.8M9.9 6.1l-3.8 3.8" />
        </>
      )
    case 'interrupted':
      return (
        <>
          <circle cx="8" cy="8" r={R} />
          <path d="M6.7 5.9v4.2M9.3 5.9v4.2" />
        </>
      )
    case 'no-signal':
      return (
        <g className="agent-g-fade">
          <circle cx="8" cy="8" r={R} strokeDasharray=".1 2.7" strokeWidth="1.9" />
        </g>
      )
    default:
      // A state this version has no name for: an empty, dotted ring.
      return <circle cx="8" cy="8" r={R} strokeDasharray="1.4 2" opacity=".7" />
  }
}

/** The "orbit" glyph of a state, in the state's colour. */
export function AgentStateGlyph({ tone, size = 16, className }: { tone: AgentTone; size?: number; className?: string }) {
  return (
    <svg
      className={`agent-g agent-tone--${tone}${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden
    >
      {orbit(tone)}
    </svg>
  )
}

// The checkbox drawn by hand: same box as the editor's CSS checkbox (14 px,
// 1.5 px border, radius 3) on a 14-unit grid, so it lines up with its neighbours.
const BOX = { x: 0.75, y: 0.75, width: 12.5, height: 12.5, rx: 2.25 }

/** A task's checkbox drawn with its agent state: running (the border runs) or done (tick + spark). */
export function AgentTaskBoxGlyph({ kind }: { kind: AgentBoxGlyph }) {
  return (
    <svg className={`agent-box-g agent-tone--${kind}`} width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      {kind === 'running' ? (
        <>
          <rect {...BOX} opacity=".35" strokeWidth="1.1" />
          <rect {...BOX} pathLength={40} strokeDasharray="9 31" strokeWidth="1.4" className="agent-g-march" />
        </>
      ) : (
        <>
          {/* Box and tick thinner than the 1.5 of the CSS box: a centred SVG stroke in a bright colour reads heavier. */}
          <rect {...BOX} className="agent-box-g-fill" strokeWidth="1.1" />
          <path d="M4.2 7.2l1.9 1.9 3.7-4" strokeWidth="1.1" />
          <path d={sparkPath(12.8, 1.2, 4)} fill="currentColor" stroke="none" className="agent-box-g-spark" />
        </>
      )}
    </svg>
  )
}

/** "Hand it to an agent": a dashed tick with a spark. */
export function AgentHandOverGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg className="agent-g" width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path d="M2.8 8.6l3.1 3.1L12.6 4.4" strokeDasharray="1.5 2.1" />
      <path d={sparkPath(13.6, 2.4, 1.9)} fill="currentColor" stroke="none" />
    </svg>
  )
}
