// Size of the section preview card (SectionHoverCard), shared by every place that shows
// it: the hover preview (HoverPreviewProvider) and the Brain view's pinned preview
// (Brain/BrainNodePreview). The card is landscape and fixed-size, so every preview is the
// same rectangle: header 34 + body ~128 + foot 26 (+ 1px border each side). The body
// fades out at the bottom (see .section-hover-card in index.css).
export const PREVIEW_CARD_WIDTH = 360
export const PREVIEW_CARD_HEIGHT = 190
// Keep the card this far from the viewport edges when placing/clamping it.
export const PREVIEW_VIEWPORT_MARGIN = 8

// Card width: PREVIEW_CARD_WIDTH, capped so it never overflows a narrow window.
export const previewCardWidth = () =>
  Math.max(0, Math.min(PREVIEW_CARD_WIDTH, window.innerWidth - 2 * PREVIEW_VIEWPORT_MARGIN))
