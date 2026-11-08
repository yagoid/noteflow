import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNotesStore } from '../../stores/notesStore'
import { useSectionTagColorsStore } from '../../stores/sectionTagColorsStore'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'
import { SectionHoverCard } from '../SectionPreview/SectionHoverCard'
import {
  PREVIEW_CARD_HEIGHT,
  PREVIEW_VIEWPORT_MARGIN as MARGIN,
  previewCardWidth,
} from '../SectionPreview/previewSize'

const CURSOR_GAP = 12

export interface PinnedPreview {
  noteId: string
  sectionId?: string
  x: number // viewport coords of the click
  y: number
}

// Below the click, centred; flipped above if it would overflow the viewport.
function computePos(pinned: PinnedPreview, height: number, width: number) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const left = Math.max(MARGIN, Math.min(pinned.x - width / 2, vw - width - MARGIN))
  let top = pinned.y + CURSOR_GAP
  if (top + height + MARGIN > vh) top = pinned.y - CURSOR_GAP - height
  if (top < MARGIN) top = MARGIN
  return { left, top }
}

// The section preview card (the same SectionHoverCard as the hover preview, at the same
// fixed size) pinned next to a clicked brain node. Unlike the hover preview it stays put
// and navigates to the section when clicked. Dismisses on an outside click or Escape.
export function BrainNodePreview({
  pinned,
  onOpen,
  onDismiss,
}: {
  pinned: PinnedPreview
  onOpen: (noteId: string, sectionId?: string) => void
  onDismiss: () => void
}) {
  const t = useT()
  const note = useNotesStore((s) => s.notes.find((n) => n.id === pinned.noteId) ?? null)
  const sectionTagColors = useSectionTagColorsStore((s) => s.sectionTagColors)
  const ref = useRef<HTMLButtonElement>(null)

  // A node may not carry a section id → fall back to the note's first one.
  const section = note?.sections.find((s) => s.id === pinned.sectionId) ?? note?.sections[0] ?? null

  // Dismiss on outside click / Escape. Registered after mount, so the click that
  // opened the card (already handled on pointerup) doesn't immediately close it.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onDismiss()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [onDismiss])

  // Section not in memory (e.g. an encrypted note that's still locked) → nothing to show.
  if (!note || !section) return null

  // Fixed-size card, so it's placed straight away (no measuring pass); the width is
  // capped on narrow windows, like the hover preview's.
  const width = previewCardWidth()
  const pos = computePos(pinned, PREVIEW_CARD_HEIGHT, width)
  const label = tf(t.overview.openSection, { name: section.name })

  return createPortal(
    <button
      ref={ref}
      type="button"
      onClick={() => onOpen(pinned.noteId, section.id)}
      title={label}
      aria-label={label}
      className="section-preview-button fixed z-[9999] animate-in fade-in zoom-in-95 duration-100"
      style={{ width, height: PREVIEW_CARD_HEIGHT, left: pos.left, top: pos.top }}
    >
      <SectionHoverCard note={note} section={section} sectionTagColors={sectionTagColors} />
    </button>,
    document.body,
  )
}
