import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowLeft, ArrowRight, PenLine, Sparkles, X } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'
import { useLanguageStore } from '../../stores/languageStore'
import { useWhatsNewStore, type OpenTour } from '../../stores/whatsNewStore'
import { OWN_KEYS_PROPS } from '../../lib/keyScope'
import { stepIndex } from '../../lib/whatsNew'
import { WHATS_NEW_SLIDES, accentVars, slideKeyMap, type WhatsNewSlide } from './whatsNewSlides'
import { hasClip } from './whatsNewMedia'
import { ExtrasGrid, KeyCombo, SlideClip, SlideFrame, TextWithKeys } from './SlideVisual'

// The "What's new" tour: a large modal over the main window, one slide at a time
// (clip in an app-window frame + title + body + shortcut chips). Opened by
// WhatsNewHost (startup popup) or by hand (Settings → Tutorial, command palette).
// Seen bookkeeping: each slide is marked seen as soon as it is shown (a crash
// halfway keeps the progress); closing a startup tour marks the whole batch seen.
// Visual language: index.css § "What's new" tour.

const BY_ID = new Map(WHATS_NEW_SLIDES.map((s) => [s.id, s]))
// Must cover the longest exit animation (.wn-slide[data-state="exit"]).
const LEAVE_MS = 400
const CLOSE_MS = 240

interface Leaving {
  index: number
  dx: number
}

export function WhatsNewTour({ tour }: { tour: OpenTour }) {
  const t = useT()
  const lang = useLanguageStore((s) => s.lang)
  const markSeen = useWhatsNewStore((s) => s.markSeen)
  const closeTour = useWhatsNewStore((s) => s.closeTour)

  const slides = tour.slideIds.map((id) => BY_ID.get(id)).filter((s): s is WhatsNewSlide => !!s)
  const count = slides.length
  const [index, setIndex] = useState(() => Math.min(tour.startIndex, Math.max(0, count - 1)))
  const [dx, setDx] = useState(0.5) // first slide: a short drift in, after the modal's own entrance
  const [moved, setMoved] = useState(false)
  const [leaving, setLeaving] = useState<Leaving | null>(null)
  const [visited, setVisited] = useState<Set<number>>(() => new Set([index]))
  const [closing, setClosing] = useState(false)
  const [version, setVersion] = useState<string | null>(null)

  const dialogRef = useRef<HTMLDivElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)
  const skipRef = useRef<HTMLButtonElement>(null)
  const backRef = useRef<HTMLButtonElement>(null)
  const leaveTimer = useRef<number | undefined>(undefined)
  const closeTimer = useRef<number | undefined>(undefined)

  const slide = slides[index]
  const isLast = index === count - 1

  // Mark each slide seen the moment it is on screen.
  useEffect(() => {
    if (slide) markSeen([slide.id])
  }, [slide, markSeen])

  useEffect(() => {
    if (tour.mode !== 'new') return
    window.noteflow.getAppVersion().then(setVersion).catch(() => setVersion(null))
  }, [tour.mode])

  // Focus moves into the dialog (and back where it was on close).
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    primaryRef.current?.focus({ preventScroll: true })
    return () => { previous?.focus?.({ preventScroll: true }) }
  }, [])

  // Focus never leaves the dialog while it is open:
  //  - the dialog itself is focusable (tabIndex -1), so a click on a non-interactive
  //    spot focuses it instead of dropping focus to <body>;
  //  - whatever grabs focus behind the overlay (an editor restoring its selection
  //    after the palette closed…) is sent back in.
  // Focus inside the [data-own-keys] root is what makes the app accelerators that
  // run before our key listener (App.tsx, window capture) step aside.
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const root = dialogRef.current
      if (root && e.target instanceof Node && !root.contains(e.target)) primaryRef.current?.focus({ preventScroll: true })
    }
    document.addEventListener('focusin', onFocusIn)
    return () => document.removeEventListener('focusin', onFocusIn)
  }, [])

  useEffect(() => () => {
    window.clearTimeout(leaveTimer.current)
    window.clearTimeout(closeTimer.current)
  }, [])

  // Safety net after every slide change, before the browser handles the next key:
  // focus must be on a live control of the dialog. (Skips the mount: the effect
  // above moves focus in and remembers where it came from.)
  const slideChanged = useRef(false)
  useLayoutEffect(() => {
    if (!slideChanged.current) { slideChanged.current = true; return }
    const root = dialogRef.current
    const active = document.activeElement
    if (!root || !active || !root.contains(active) || active.getAttribute('aria-disabled') === 'true') {
      primaryRef.current?.focus({ preventScroll: true })
    }
  }, [index])

  const goTo = useCallback((next: number) => {
    const target = stepIndex(next, 0, count)
    if (target === index || closing) return
    // A focused control about to vanish drops focus to <body> with no focusin, and the
    // app accelerators (App.tsx, window capture, they run before our key listener)
    // would then act behind the tour: hand focus to the main button first. Skip
    // unmounts on the last slide; Back goes inert (aria-disabled) on the first.
    const active = document.activeElement
    if ((target === count - 1 && active === skipRef.current) || (target === 0 && active === backRef.current)) {
      primaryRef.current?.focus({ preventScroll: true })
    }
    const dir = target > index ? 1 : -1
    setLeaving({ index, dx: dir })
    setDx(dir)
    setMoved(true)
    setIndex(target)
    setVisited((v) => new Set(v).add(target))
    window.clearTimeout(leaveTimer.current)
    leaveTimer.current = window.setTimeout(() => setLeaving(null), LEAVE_MS)
  }, [count, index, closing])

  const close = useCallback(() => {
    if (closing) return
    // A startup batch counts as seen once dismissed (skip included), so it doesn't
    // come back on the next launch. A replay only marks what was actually shown.
    if (tour.mode !== 'replay') markSeen(tour.slideIds)
    setClosing(true)
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => closeTour(tour.seq), CLOSE_MS)
  }, [closing, tour.mode, tour.slideIds, tour.seq, markSeen, closeTour])

  const next = useCallback(() => {
    if (isLast) close()
    else goTo(index + 1)
  }, [isLast, close, goTo, index])

  // Keyboard: window capture phase, and EVERY key stops there while the tour is
  // open — nothing behind it may react (Delete would open the editor's "delete
  // note" confirm under the tour, Esc would also close Settings…). Native button
  // activation (Enter/Space on a focused control) is a default action, unaffected
  // by stopping propagation. Listeners registered on window capture BEFORE this one
  // (App.tsx accelerators, NoteEditor's Ctrl+Tab) still run first: they skip events
  // whose target is inside [data-own-keys], hence the focus rules above.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const root = dialogRef.current
      if (!root) return
      e.stopImmediatePropagation()
      // Focus slipped out anyway (should not happen): keep the key from acting
      // behind the overlay and bring focus back.
      if (!(e.target instanceof Node) || !root.contains(e.target)) {
        e.preventDefault()
        primaryRef.current?.focus({ preventScroll: true })
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault(); close(); return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault(); if (!isLast) goTo(index + 1); return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault(); goTo(index - 1); return
      }
      if (e.key === 'Enter') {
        // A focused control (a progress dot, Skip, Back) keeps its own Enter.
        const target = e.target as HTMLElement
        if (target !== primaryRef.current && target.closest('button')) return
        e.preventDefault(); next(); return
      }
      if (e.key === 'Tab') {
        // Focus trap.
        const focusables = Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]):not([aria-disabled="true"])'))
          .filter((el) => el.offsetParent !== null && !el.closest('[data-state="exit"]'))
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement as HTMLElement | null
        const inside = !!active && root.contains(active)
        if (e.shiftKey && (!inside || active === first)) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && (!inside || active === last)) { e.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [close, goTo, next, index, isLast])

  if (!slide) return null

  const title = tour.mode === 'discover' || tour.mode === 'replay'
    ? t.whatsNew.titleDiscover
    : version ? tf(t.whatsNew.titleNew, { version }) : t.whatsNew.titleNewNoVersion
  const counter = tf(t.whatsNew.counter, { current: index + 1, total: count })

  const renderSlide = (s: WhatsNewSlide, i: number, state: 'enter' | 'exit', slideDx: number) => {
    const copy = t.whatsNew.slides[s.i18nKey]
    const keys = slideKeyMap(s)
    const clip = hasClip(s.id, lang)
    const style = {
      '--dx': slideDx,
      '--wn-base': moved ? '40ms' : '260ms',
    } as CSSProperties
    return (
      <div
        key={`${state}-${s.id}`}
        className="wn-slide"
        data-state={state}
        style={style}
        aria-hidden={state === 'exit' || undefined}
      >
        <div className="wn-media">
          <SlideFrame label={`noteflow · ${s.id}`}>
            {s.extras && !clip
              ? <ExtrasGrid extras={s.extras} t={t} />
              : <SlideClip slide={s} lang={lang} />}
          </SlideFrame>
        </div>
        <div className="wn-text" aria-live={state === 'enter' ? 'polite' : undefined}>
          <span className="wn-reveal wn-eyebrow font-mono" style={{ '--i': 0 } as CSSProperties}>
            {String(i + 1).padStart(2, '0')}
          </span>
          <h2 className="wn-reveal wn-title" style={{ '--i': 1 } as CSSProperties}>
            {copy.title}
          </h2>
          <p className="wn-reveal wn-body font-mono" style={{ '--i': 2 } as CSSProperties}>
            <TextWithKeys template={copy.body} keys={keys} />
          </p>
          {s.keys.length > 0 && (
            <div className="wn-reveal flex flex-wrap items-center gap-2.5" style={{ '--i': 3 } as CSSProperties} aria-label={t.whatsNew.keysLabel}>
              {s.keys.map((k, ki) => <KeyCombo key={k.id} combo={k.combo} index={ki * 3} />)}
            </div>
          )}
          {s.extras && clip && (
            <div className="wn-reveal" style={{ '--i': 3 } as CSSProperties}>
              <ExtrasGrid extras={s.extras} t={t} list />
            </div>
          )}
        </div>
      </div>
    )
  }

  const leavingSlide = leaving ? slides[leaving.index] : null

  return (
    <div className={`wn-root${closing ? ' is-closing' : ''}`} data-whats-new {...OWN_KEYS_PROPS}>
      {/* preventDefault: the click must not move focus out of the dialog while it fades out. */}
      <div className="wn-backdrop" onMouseDown={(e) => { e.preventDefault(); close() }} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t.whatsNew.dialogLabel}
        tabIndex={-1}
        className="wn-modal outline-none"
        style={accentVars(slide.accent)}
      >
        <div className="wn-aurora" aria-hidden>
          <span className="wn-blob wn-blob-a" />
          <span className="wn-blob wn-blob-b" />
          <span className="wn-blob wn-blob-c" />
        </div>
        <div className="wn-dots" aria-hidden />

        {/* Header */}
        <div className="wn-header flex items-center gap-3 px-6 pt-5 pb-1">
          <span className="wn-header-icon"><Sparkles size={13} /></span>
          <span className="text-[13px] font-mono font-semibold text-text truncate">{title}</span>
          <span className="ml-auto text-[11px] font-mono tabular-nums text-text-muted">{counter}</span>
          <button
            type="button"
            onClick={close}
            className="wn-btn wn-btn-ghost !h-7 !px-1.5"
            aria-label={t.whatsNew.close}
            title={t.whatsNew.close}
          >
            <X size={14} />
          </button>
        </div>

        {/* Stage */}
        <div className="wn-stage flex-1 min-h-0 px-6 sm:px-8 py-4">
          <div className="wn-deck">
            {leavingSlide && leaving && leaving.index !== index && renderSlide(leavingSlide, leaving.index, 'exit', leaving.dx)}
            {renderSlide(slide, index, 'enter', dx)}
          </div>
        </div>

        {/* Footer */}
        <div className="wn-footer flex items-center gap-3 px-6 pb-5 pt-2">
          <div className="flex items-center" role="group" aria-label={t.whatsNew.progressLabel}>
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className="wn-pill-hit"
                onClick={() => goTo(i)}
                aria-label={tf(t.whatsNew.goToSlide, { n: i + 1, title: t.whatsNew.slides[s.i18nKey].title })}
                aria-current={i === index ? 'step' : undefined}
              >
                <span className={`wn-pill${i === index ? ' is-active' : visited.has(i) ? ' is-visited' : ''}`} />
              </button>
            ))}
          </div>
          <span className="hidden md:inline text-[10px] font-mono text-text-muted/70 ml-2">{t.whatsNew.keyboardHint}</span>
          <div className="ml-auto flex items-center gap-2">
            {!isLast && (
              <button ref={skipRef} type="button" onClick={close} className="wn-btn wn-btn-ghost font-mono">
                {t.whatsNew.skip}
              </button>
            )}
            {/* aria-disabled, not disabled: a focused button that becomes `disabled` drops
                focus to <body>. Hidden on the first slide and skipped by the Tab trap. */}
            <button
              ref={backRef}
              type="button"
              onClick={() => { if (index > 0) goTo(index - 1) }}
              aria-disabled={index === 0}
              tabIndex={index === 0 ? -1 : undefined}
              className="wn-btn wn-btn-secondary font-mono"
            >
              <ArrowLeft size={13} />
              {t.whatsNew.back}
            </button>
            <button
              ref={primaryRef}
              type="button"
              onClick={next}
              className={`wn-btn wn-btn-primary font-mono${isLast ? ' wn-btn-cta' : ''}`}
            >
              {isLast ? <PenLine size={13} /> : null}
              {isLast ? t.whatsNew.startWriting : t.whatsNew.next}
              <ArrowRight size={13} className="wn-btn-arrow" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
