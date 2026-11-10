import { useEffect, useState, type CSSProperties } from 'react'
import { Play } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'
import { useLanguageStore } from '../../stores/languageStore'
import { useWhatsNewStore } from '../../stores/whatsNewStore'
import { WHATS_NEW_SLIDES, accentVars, type WhatsNewSlide } from '../WhatsNew/whatsNewSlides'
import { SlideClip } from '../WhatsNew/SlideVisual'
import { SectionTitle } from './ui'

// Settings → Tutorial: replay the "What's new" tour (whole deck or from one slide).
// The tour opens on top of Settings (z-70 over z-50) and Settings stays open below,
// so the "New" badges refresh as slides get seen.

function SlideCard({ slide, isNew, onOpen }: { slide: WhatsNewSlide; isNew: boolean; onOpen: () => void }) {
  const t = useT()
  const lang = useLanguageStore((s) => s.lang)
  // The clip plays while the card is hovered or keyboard-focused (SlideClip → ThumbClip).
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const title = t.whatsNew.slides[slide.i18nKey].title
  const Icon = slide.icon

  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={(e) => setFocused(e.currentTarget.matches(':focus-visible'))}
      onBlur={() => setFocused(false)}
      aria-label={tf(t.whatsNew.settings.openSlide, { title })}
      className="wn-thumb group text-left rounded-lg border border-border bg-surface-2/50 overflow-hidden
                 hover:border-text-muted/50 hover:bg-surface-2 transition-colors
                 focus:outline-none focus-visible:border-text-muted"
      style={accentVars(slide.accent)}
    >
      <div className="relative aspect-[3/2] border-b border-border bg-surface-0 overflow-hidden">
        <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transform-none">
          <SlideClip slide={slide} lang={lang} thumb playing={hovered || focused} />
        </div>
        {isNew && (
          <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold uppercase tracking-wider
                           bg-accent text-surface-0 shadow">
            {t.whatsNew.settings.newBadge}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 px-2.5 py-2">
        <Icon size={12} className="flex-shrink-0" style={{ color: 'rgb(var(--wn-c))' } as CSSProperties} />
        <span className="text-[11px] font-mono text-text truncate flex-1">{title}</span>
        <span className="text-[9px] font-mono text-text-muted/70 flex-shrink-0">
          {tf(t.whatsNew.settings.sinceVersion, { version: slide.since })}
        </span>
      </div>
    </button>
  )
}

export function TutorialPanel() {
  const t = useT()
  const seen = useWhatsNewStore((s) => s.seen)
  const loaded = useWhatsNewStore((s) => s.loaded)
  const openFullTour = useWhatsNewStore((s) => s.openFullTour)

  useEffect(() => {
    if (!loaded) void useWhatsNewStore.getState().load()
  }, [loaded])

  return (
    <div className="space-y-6">
      <div
        className="relative overflow-hidden rounded-lg border border-border bg-surface-2/40 px-5 py-5"
        style={accentVars('accent')}
      >
        <div className="wn-card-aurora" aria-hidden>
          <span className="wn-card-blob wn-card-blob-a" />
          <span className="wn-card-blob wn-card-blob-b" />
        </div>
        <div className="relative flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-mono font-semibold text-text">{t.whatsNew.titleDiscover}</p>
            <p className="mt-1 text-[11px] font-mono text-text-muted leading-relaxed">{t.whatsNew.settings.playTourHint}</p>
          </div>
          <button
            type="button"
            onClick={() => openFullTour()}
            className="wn-btn wn-btn-primary font-mono flex-shrink-0"
          >
            <Play size={12} />
            {t.whatsNew.settings.playTour}
          </button>
        </div>
      </div>

      <div>
        <SectionTitle>{t.whatsNew.settings.slidesTitle}</SectionTitle>
        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
          {WHATS_NEW_SLIDES.map((slide) => (
            <SlideCard
              key={slide.id}
              slide={slide}
              isNew={loaded && !seen.includes(slide.id)}
              onOpen={() => openFullTour(slide.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
