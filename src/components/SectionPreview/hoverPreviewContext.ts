import { createContext, useContext } from 'react'

// 'element-right' anchors to the right of the trigger element (AI panels).
// 'cursor-below' hangs the card just below the cursor (sidebar / groups / editor),
// so it never covers the content to the right of the pointer.
// 'panel-right' anchors to the right of the floating panel the trigger lives in (the
// closest PREVIEW_PANEL_ATTR ancestor), level with the trigger: a cell of the sidebar's
// section peek previews beside the peek instead of over it. Without such an ancestor it
// behaves as 'element-right'.
export type Placement = 'element-right' | 'cursor-below' | 'panel-right'

/** Marks the floating panel a 'panel-right' preview sits beside. */
export const PREVIEW_PANEL_ATTR = 'data-preview-panel'

export interface PreviewOptions {
  placement?: Placement
}

export interface PreviewHandlers {
  title: string
  onMouseEnter: (e: React.MouseEvent) => void
  onMouseMove?: (e: React.MouseEvent) => void
  onMouseLeave: () => void
}

export interface HoverPreviewContextValue {
  // Spread the returned handlers onto any element that navigates to a section
  // to show a hover preview of that section's content.
  previewProps: (noteId: string, sectionId: string, opts?: PreviewOptions) => PreviewHandlers
  // Drops the preview of `noteId` (shown or pending): for triggers that go away under a
  // resting pointer (no mouseleave reaches them), e.g. the sidebar's section peek closing.
  dismissNote: (noteId: string) => void
}

export const HoverPreviewContext = createContext<HoverPreviewContextValue | null>(null)

export function useSectionHoverPreview(): HoverPreviewContextValue {
  const ctx = useContext(HoverPreviewContext)
  if (!ctx) throw new Error('useSectionHoverPreview must be used within a HoverPreviewProvider')
  return ctx
}
