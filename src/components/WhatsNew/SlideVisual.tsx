import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { keyLabel } from '../../lib/platform'
import { tf, type Messages } from '../../i18n'
import { SPLIT_VIEW_COMBO, accentVars, comboText, type SlideExtra, type WhatsNewSlide } from './whatsNewSlides'
import { getSlideMedia } from './whatsNewMedia'

// Visual building blocks shared by the tour (WhatsNewTour) and the thumbnails of
// Settings → Tutorial. Styles: index.css § "What's new" tour (.wn-*).

/** A combo as separate key caps: [Ctrl] + [T]. */
export function KeyCombo({ combo, index = 0 }: { combo: string[]; index?: number }) {
  return (
    <span className="wn-combo">
      {combo.map((token, i) => (
        <span key={i} className="wn-combo">
          <kbd className="wn-kbd font-mono" style={{ '--k': index + i } as CSSProperties}>{keyLabel(token)}</kbd>
          {i < combo.length - 1 && <span className="wn-combo-plus">+</span>}
        </span>
      ))}
    </span>
  )
}

/** A slide text whose `{placeholders}` (the slide's key ids) become inline key chips. */
export function TextWithKeys({ template, keys }: { template: string; keys: Record<string, string[]> }) {
  const parts = template.split(/(\{\w+\})/)
  const out: ReactNode[] = []
  for (let i = 0; i < parts.length; i++) {
    const name = /^\{(\w+)\}$/.exec(parts[i])?.[1]
    const combo = name ? keys[name] : undefined
    if (!combo) { out.push(parts[i]); continue }
    // Glue the punctuation right after the chip to it, so a line never starts with ", or…".
    const next = parts[i + 1] ?? ''
    const punct = /^[,.;:!?)»]+/.exec(next)?.[0] ?? ''
    if (punct) parts[i + 1] = next.slice(punct.length)
    out.push(
      <span key={i} className="whitespace-nowrap">
        <kbd className="wn-kbd wn-kbd-inline font-mono">{comboText(combo)}</kbd>{punct}
      </span>,
    )
  }
  return <>{out}</>
}

// Deterministic particle field (same on every render: no Math.random in render).
const PARTICLES = Array.from({ length: 12 }, (_, i) => ({
  x: `${(i * 37 + 11) % 100}%`,
  s: `${3 + (i % 3)}px`,
  t: `${5 + ((i * 7) % 5)}s`,
  d: `${-((i * 1.3) % 6).toFixed(1)}s`,
  sway: `${((i % 2 ? 1 : -1) * (8 + (i % 4) * 6))}px`,
}))

/** Shown when the slide has no clip: big icon with pulse rings, orbits and rising particles. */
export function SlideFallback({ slide, thumb = false }: { slide: WhatsNewSlide; thumb?: boolean }) {
  const Icon = slide.icon
  return (
    <div className={`wn-fallback${thumb ? ' is-thumb' : ''}`} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={`ring-${i}`} className="wn-fb-ring" style={{ '--i': i } as CSSProperties} />
      ))}
      {!thumb && (
        <>
          <span className="wn-fb-orbit" style={{ '--r': '62%', '--t': '18s' } as CSSProperties}><i /><i /></span>
          <span className="wn-fb-orbit" style={{ '--r': '44%', '--t': '11s', '--dir': 'reverse' } as CSSProperties}><i /></span>
          <span className="wn-fb-particles">
            {PARTICLES.map((p, i) => (
              <i key={i} style={{ '--x': p.x, '--s': p.s, '--t': p.t, '--d': p.d, '--sway': p.sway } as CSSProperties} />
            ))}
          </span>
        </>
      )}
      <span className="wn-fb-core">
        <Icon size={thumb ? 22 : 42} strokeWidth={1.6} />
      </span>
    </div>
  )
}

/** Chip grid of the "And much more" slide. `list` = compact column next to a clip. */
export function ExtrasGrid({ extras, t, list = false }: { extras: SlideExtra[]; t: Messages; list?: boolean }) {
  return (
    <div className={`wn-extras${list ? ' is-list' : ''}`}>
      {extras.map((extra, i) => {
        const Icon = extra.icon
        return (
          <div key={extra.id} className="wn-extra font-mono" style={{ '--i': i, ...accentVars(extra.accent, '--wn-x') } as CSSProperties}>
            <span className="wn-extra-icon"><Icon size={14} /></span>
            {/* Plain text inside a chip: "Split view (Ctrl+Click)". */}
            <span>{tf(t.whatsNew.extras[extra.id], { split: comboText(SPLIT_VIEW_COMBO) })}</span>
          </div>
        )
      })}
    </div>
  )
}

// Read once per mount, like the other reduced-motion checks of the app
// (Settings/ActivityPulse.tsx, Settings/PlanCardBackdrop.tsx).
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

interface SlideClipProps {
  slide: WhatsNewSlide
  lang: string
  /**
   * Thumbnail (Settings → Tutorial): no autoplay; it plays while `playing` is true
   * (the card is hovered / focused) and otherwise shows the poster.
   */
  thumb?: boolean
  playing?: boolean
  /**
   * The slide on its way out (it is a fresh mount, never the element that was
   * playing): the poster as a still image instead of a second <video> that would
   * load and decode from frame 0 just to be faded away, right when the next clip starts.
   */
  still?: boolean
}

/**
 * The clip of a slide (`<video>` muted + loop) or, when there is none bundled — or
 * it fails to load — the animated fallback. Under prefers-reduced-motion nothing
 * moves: the poster as a still image, or the fallback (its loops are stopped in CSS).
 */
export function SlideClip({ slide, lang, thumb = false, playing = false, still = false }: SlideClipProps) {
  const media = getSlideMedia(slide.id, lang)
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const [reducedMotion] = useState(prefersReducedMotion)
  if (media.poster && (reducedMotion || still)) {
    return <img className="wn-clip" src={media.poster} alt="" aria-hidden draggable={false} />
  }
  if (reducedMotion) return <SlideFallback slide={slide} thumb={thumb} />
  if (!media.video || failedSrc === media.video) return <SlideFallback slide={slide} thumb={thumb} />
  const src = media.video
  if (thumb) {
    return <ThumbClip key={src} src={src} poster={media.poster} playing={playing} onError={() => setFailedSrc(src)} />
  }
  return (
    <video
      key={src}
      className="wn-clip"
      src={src}
      poster={media.poster ?? undefined}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      onError={() => setFailedSrc(src)}
      aria-hidden
    />
  )
}

/**
 * Thumbnail clip. The poster is its own <img> layered over the <video>, not just the
 * `poster` attribute: Chromium only shows `poster` until playback first starts, so
 * after a hover (pause + rewind) the card showed the clip's frame 0 — black, the
 * clips fade in from black. The <img> is hidden only once the video is actually
 * playing (no black flash while the first frame decodes) and comes back on stop.
 * Without a poster the video just pauses where it is (never rewinds to black).
 * With one, the <video> is only mounted the first time the card plays: until then
 * the poster covers it anyway, and a media pipeline per card (the whole deck at
 * once) is a lot to set up just to open Settings → Tutorial.
 */
function ThumbClip({ src, poster, playing, onError }: { src: string; poster: string | null; playing: boolean; onError: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [started, setStarted] = useState(false)
  const [mounted, setMounted] = useState(!poster)
  if (playing && !mounted) setMounted(true)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (playing) {
      void v.play().catch(() => {})
      return
    }
    v.pause()
    if (poster) v.currentTime = 0
  }, [playing, poster])

  const showPoster = !!poster && !(playing && started)
  return (
    <>
      {mounted && (
        <video
          ref={videoRef}
          className="wn-clip"
          src={src}
          muted
          loop
          playsInline
          preload="metadata"
          onPlaying={() => setStarted(true)}
          onPause={() => setStarted(false)}
          onError={onError}
          aria-hidden
        />
      )}
      {poster && (
        <img
          className={`wn-clip wn-clip-poster${showPoster ? '' : ' is-hidden'}`}
          src={poster}
          alt=""
          aria-hidden
          draggable={false}
        />
      )}
    </>
  )
}

/** The "app window" frame around the clip, with the glow and the sweeping border light. */
export function SlideFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="wn-frame">
      <div className="wn-frame-bar" aria-hidden>
        <i /><i /><i />
        <span className="font-mono">{label}</span>
      </div>
      <div className="wn-frame-body">{children}</div>
      <span className="wn-frame-glow" aria-hidden />
    </div>
  )
}
