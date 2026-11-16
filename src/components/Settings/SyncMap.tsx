import type { CSSProperties, ReactNode } from 'react'
import { Cloud, Github, Lock, Monitor, Smartphone, Terminal } from 'lucide-react'
import { tf } from '../../i18n/format'
import { useT } from '../../i18n/useT'
import { badgeTone, platformName, type SyncMapModel } from '../../lib/syncOverview'
import { TONE_TEXT } from './statusTone'

export type CliMapState = 'connected' | 'off' | 'unavailable'

interface SyncMapProps {
  model: SyncMapModel
  /** The provider's status, already localized (same text as the card's badge). */
  statusLabel: string
  /** GitHub `owner/repo` (the GitHub node's subtitle, and the paused mirror's description). */
  repo: string | null
  /** Auto-sync cadence in minutes (null when unknown). */
  minutes: number | null
  cli: CliMapState
}

// Five columns — left node · connector · provider · connector · right nodes —
// in roughly the proportions of the design (≈780 px wide; the left column a bit
// wider so "This computer" fits) so the map scales with the panel: the connectors keep a minimum length and the nodes shrink (their text
// truncates) when the panel is narrow.
const GRID_STYLE: CSSProperties = {
  gridTemplateColumns: 'minmax(0,150fr) minmax(20px,105fr) minmax(0,172fr) minmax(20px,105fr) minmax(0,176fr)',
  // Row 1 holds the provider (44 px); row 2 the secondary nodes (36 px).
  gridTemplateRows: '44px 36px',
  rowGap: 8,
}

// Dotted grid behind the nodes, from the theme's ink so it works on all themes.
const BACKDROP_STYLE: CSSProperties = {
  backgroundImage: 'radial-gradient(rgb(var(--text) / 0.07) 1px, transparent 1px)',
  backgroundSize: '16px 16px',
}

// Vertical centre of each row inside the grid (px): the connectors meet the nodes there.
const ROW1_CENTER = 22
const ROW2_CENTER = 44 + 8 + 18

function lineClass(active: boolean): string {
  return active ? 'border-accent/60' : 'border-dashed border-text-muted/40'
}

/**
 * Informative map of Settings → Sync's status card: this computer, the active
 * provider, the other devices and the noteflow CLI, plus the inactive provider
 * as a dashed node. Not interactive — plain divs exposed as one image whose
 * label describes the same state in words.
 */
export function SyncMap({ model, statusLabel, repo, minutes, cli }: SyncMapProps) {
  const t = useT()
  const o = t.settings.sync.overview
  const tone = badgeTone(model.badge)
  const isCloud = model.provider === 'cloud'
  const cadence = minutes !== null ? tf(o.everyMinutes, { minutes }) : null
  const peersSub = model.peersRealtime ? o.mapRealtime : cadence ?? ''
  const cliSub = cli === 'connected' ? o.mapCliConnected : cli === 'off' ? o.mapCliOff : o.mapCliUnavailable

  const aria = [
    isCloud
      ? tf(o.mapAriaCloud, { status: statusLabel, peers: peersSub })
      : tf(o.mapAriaGithub, { status: statusLabel, repo: repo ?? '', cadence: cadence ?? '' }),
    cli === 'connected' ? o.mapAriaCliOn : o.mapAriaCliOff,
    ...(model.secondary === 'github-mirror' ? [o.mapAriaGithubMirror] : []),
    ...(model.secondary === 'cloud-inactive' ? [o.mapAriaCloudInactive] : []),
  ].join(' ')

  const statusDot = <span aria-hidden className={`w-[5px] h-[5px] rounded-full bg-current flex-shrink-0 ${TONE_TEXT[tone]}`} />

  return (
    <div
      role="img"
      aria-label={aria}
      className="h-[136px] px-6 pt-6 pb-[22px] rounded-[10px] border border-solid border-border bg-surface-1/40 overflow-hidden font-mono select-none"
      style={BACKDROP_STYLE}
    >
      <div aria-hidden className="grid h-full" style={GRID_STYLE}>
        {/* ── This computer (+ the dashed link down to the secondary node) ── */}
        <div className="relative self-center col-start-1 row-start-1 min-w-0">
          <MapNode icon={<Monitor size={14} />} title={o.mapThisComputer} sub={platformName(window.noteflow.platform)} />
          {model.secondary && (
            <div className="absolute left-1/2 top-full h-3 border-l border-dashed border-text-muted/40" />
          )}
        </div>

        {/* ── This computer ↔ provider, with its chip ── */}
        <div className="relative col-start-2 row-start-1">
          <div className={`absolute left-0 right-0 border-t border-solid ${lineClass(model.mainActive)}`} style={{ top: ROW1_CENTER }} />
          {(isCloud || cadence) && (
            <span
              className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex items-center gap-1 px-[7px] py-px rounded-full border border-solid border-border bg-surface-0 text-[9.5px] text-text/80 whitespace-nowrap"
              style={{ top: ROW1_CENTER }}
            >
              {isCloud ? (
                <>
                  <Lock size={10} />
                  {o.mapEncrypted}
                </>
              ) : (
                cadence
              )}
            </span>
          )}
        </div>

        {/* ── The provider ── */}
        <div className="col-start-3 row-start-1 min-w-0">
          <MapNode
            variant="provider"
            icon={isCloud ? <Cloud size={16} className="text-accent" /> : <Github size={16} />}
            title={
              isCloud ? (
                t.settings.cloud.title
              ) : (
                <>
                  <span className="truncate">{t.titleBar.sync.backendGithub}</span>
                  {statusDot}
                </>
              )
            }
            sub={
              isCloud ? (
                <span className={`flex items-center gap-1 min-w-0 ${TONE_TEXT[tone]}`}>
                  {statusDot}
                  <span className="truncate">{statusLabel}</span>
                </span>
              ) : (
                repo ?? ''
              )
            }
          />
        </div>

        {/* ── Provider → other devices (top) and the L down to the CLI ── */}
        <div className="relative col-start-4 row-start-1 row-span-2">
          <div className={`absolute left-0 right-0 border-t border-solid ${lineClass(model.peersActive)}`} style={{ top: ROW1_CENTER }} />
          <div
            className={`absolute left-1/2 border-l border-solid ${lineClass(model.cliActive)}`}
            style={{ top: ROW1_CENTER, height: ROW2_CENTER - ROW1_CENTER }}
          />
          <div
            className={`absolute left-1/2 right-0 border-t border-solid ${lineClass(model.cliActive)}`}
            style={{ top: ROW2_CENTER }}
          />
        </div>

        <div className="self-center col-start-5 row-start-1 min-w-0">
          <MapNode icon={<Smartphone size={14} />} title={o.mapOtherDevices} sub={peersSub} />
        </div>
        <div className="col-start-5 row-start-2 min-w-0">
          <MapNode
            variant={cli === 'connected' ? 'normal' : 'dim'}
            icon={<Terminal size={14} />}
            title={o.mapCli}
            sub={cliSub}
          />
        </div>

        {/* ── Secondary node: the paused GitHub mirror / the inactive Cloud ── */}
        {model.secondary && (
          <div className="col-start-1 col-span-2 row-start-2 min-w-0">
            {model.secondary === 'github-mirror' ? (
              <MapNode
                variant="dim"
                fit
                icon={<Github size={14} />}
                title={t.titleBar.sync.backendGithub}
                sub={<span className="text-yellow-400">{o.mapGithubMirror}</span>}
              />
            ) : (
              <MapNode variant="dim" fit icon={<Cloud size={14} />} title={t.settings.cloud.title} sub={o.mapCloudInactive} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const NODE_VARIANT = {
  normal: 'h-9 border-border bg-surface-1 text-text',
  provider: 'h-11 border-accent bg-surface-1 ring-2 ring-accent/15 text-text',
  dim: 'h-9 border-dashed border-border bg-surface-0 text-text-muted',
} as const

function MapNode({
  icon,
  title,
  sub,
  variant = 'normal',
  fit = false,
}: {
  icon: ReactNode
  title: ReactNode
  sub: ReactNode
  variant?: keyof typeof NODE_VARIANT
  /** Size to the content (up to the cell) instead of filling the cell. */
  fit?: boolean
}) {
  return (
    <div
      className={`flex items-center gap-[9px] ${fit ? 'w-max max-w-full' : 'w-full'} min-w-0 px-[11px] rounded-[9px] border border-solid leading-tight ${NODE_VARIANT[variant]}`}
    >
      <span className="flex flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="flex items-center gap-[5px] min-w-0 text-[11.5px] font-semibold truncate">{title}</div>
        <div className="mt-0.5 text-[9.5px] text-text-muted truncate">{sub}</div>
      </div>
    </div>
  )
}
