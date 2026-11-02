import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react'
import { Check, ChevronDown, EyeOff, Plus } from 'lucide-react'
import type { GroupColor, NoteSection } from '../../types'
import { useSectionTagColorsStore } from '../../stores/sectionTagColorsStore'
import { useThemeStore } from '../../stores/themeStore'
import { colorChannels, isCustomColor, resolveGroupColor } from '../../lib/tagColors'
import { hexToRgbChannels } from '../../lib/colorUtils'
import {
  mixRgb, parseRgbTriple, pickReadableInk, planSectionMap, visibleSectionIndices,
  type Rgb, type SectionMapPlan,
} from '../../lib/sectionMap'
import { OWN_KEYS_PROPS } from '../../lib/keyScope'
import { useSectionHoverPreview } from '../SectionPreview/hoverPreviewContext'
import { useT } from '../../i18n/useT'
import { plural } from '../../i18n/format'

// Joint between cells (matches `.section-map { gap }` in index.css).
const GAP = 4
// Share of the section colour in the active tab of a section hidden from the AI
// (matches `.section-map-tab.is-ai-hidden.is-active` in index.css).
const AI_HIDDEN_MIX = 0.72
// Px within which a tab counts as touching the block's edge (drop bar drawn inside it).
const EDGE_TOLERANCE = 1.5

interface DropTarget {
  sectionId: string
  /** Joint the dragged tab lands on: moveSectionInList puts it after the target when it
   *  comes from the left, before it when it comes from the right. */
  side: 'before' | 'after'
  /** The joint is the block's edge (clipped): draw the bar inside the tab instead. */
  inside: boolean
}

export interface SectionMapProps {
  noteId: string
  sections: NoteSection[]
  /** The section the editor shows (already resolved to a member of `sections`). */
  activeSectionId: string | null
  renamingId: string | null
  renameValue: string
  renameRef: RefObject<HTMLInputElement | null>
  onRenameChange: (value: string) => void
  onRenameKeyDown: (e: ReactKeyboardEvent) => void
  onRenameCommit: () => void
  /** Section whose context menu is open, so the chevron toggles it. */
  menuSectionId: string | null
  onSwitch: (sectionId: string) => void
  onStartRename: (section: NoteSection) => void
  onOpenMenu: (sectionId: string, x: number, y: number) => void
  onCloseMenu: () => void
  onAdd: () => void
  onReorder: (draggedId: string, targetId: string) => void
}

/**
 * Text colour of the active tab, on its solid section-colour background: the theme's
 * `--bg-0` (dark ink in dark themes) or `--text`, whichever contrasts more. Theme colours
 * are read from the live CSS vars (themeStore applies them before updating its state, so
 * they're current when a theme change re-renders this).
 */
function resolveActiveInk(color: GroupColor, aiHidden: boolean): string {
  const fallback = 'rgb(var(--bg-0))'
  if (typeof document === 'undefined') return fallback
  const css = getComputedStyle(document.documentElement)
  const themeRgb = (name: string) => parseRgbTriple(css.getPropertyValue(name))
  let background: Rgb | null = isCustomColor(color) ? hexToRgbChannels(color) : themeRgb(color)
  const bgInk = themeRgb('--bg-0')
  const textInk = themeRgb('--text')
  if (!background || !bgInk || !textInk) return fallback
  if (aiHidden) {
    const editor = themeRgb('--bg-editor')
    if (editor) background = mixRgb(background, editor, AI_HIDDEN_MIX)
  }
  return pickReadableInk(background, [bgInk, textInk]) === 0 ? fallback : 'rgb(var(--text))'
}

/**
 * The editor's section tabs as one reticulated block that wraps onto rows (filing-cabinet
 * tabs): rows are justified (the active tab grows more), past three rows the rest fold
 * into a "+N more" tab. See "Editor: mapa de secciones" in .claude/context/patterns.md.
 */
export function SectionMap({
  noteId, sections, activeSectionId, renamingId, renameValue, renameRef,
  onRenameChange, onRenameKeyDown, onRenameCommit, menuSectionId,
  onSwitch, onStartRename, onOpenMenu, onCloseMenu, onAdd, onReorder,
}: SectionMapProps) {
  const t = useT()
  const { previewProps } = useSectionHoverPreview()
  const sectionTagColors = useSectionTagColorsStore((s) => s.sectionTagColors)
  // Only to recompute the active ink when the theme (or its accent) changes.
  const themeId = useThemeStore((s) => s.activeThemeId)
  const accentOverride = useThemeStore((s) => s.accentOverride)

  const blockRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)

  // ── Row cap ──────────────────────────────────────────────────────────────────
  // Per editor instance, not persisted (the editor remounts the map per note).
  const [expanded, setExpanded] = useState(false)
  const [plan, setPlan] = useState<SectionMapPlan | null>(null)

  const total = sections.length
  const activeIndex = sections.findIndex((s) => s.id === activeSectionId)
  const renamingIndex = renamingId ? sections.findIndex((s) => s.id === renamingId) : -1
  // Never folded away: the active section, and the one being renamed (its input must
  // stay mounted, and it is wider than the tab it replaces).
  const pinKey = `${activeIndex}|${renamingIndex}`

  // The hidden measure layer holds every section tab at its natural width (as it renders
  // in its current state, active included), then "+N more" and "+". It never depends on
  // the plan, and the block's width comes from its parent, so measuring can't loop.
  const measure = useCallback(() => {
    const block = blockRef.current
    const row = measureRef.current?.firstElementChild
    if (!block || !row) return
    const widths = Array.from(row.children, (el) => el.getBoundingClientRect().width)
    const count = widths.length - 2
    if (count < 0) return
    const next = planSectionMap({
      tabWidths: widths.slice(0, count),
      pinned: pinKey.split('|').map(Number),
      moreWidth: widths[count],
      addWidth: widths[count + 1],
      containerWidth: block.getBoundingClientRect().width,
      gap: GAP,
    })
    setPlan((prev) =>
      prev && prev.visibleCount === next.visibleCount && prev.overflowing === next.overflowing ? prev : next)
  }, [pinKey])

  const measureRefFn = useRef(measure)
  useLayoutEffect(() => { measureRefFn.current = measure })

  // Re-measure when anything that changes a tab's width changes (typing in a section
  // rebuilds `sections` but leaves this signature alone).
  const layoutKey = sections.map((s) => `${s.id}\u0000${s.name}\u0000${s.aiHidden ? 1 : 0}`).join('\u0001')
  const moreLabel = plural(t.editor.moreSections, total)
  useLayoutEffect(() => { measure() }, [measure, layoutKey, renamingId, moreLabel])

  // Width of the pane, and late font loads (they resize the measure layer).
  useEffect(() => {
    const block = blockRef.current
    const row = measureRef.current?.firstElementChild
    if (!block || !row) return
    const ro = new ResizeObserver(() => measureRefFn.current())
    ro.observe(block)
    ro.observe(row)
    return () => ro.disconnect()
  }, [])

  const overflowing = plan?.overflowing ?? false
  const folded = overflowing && !expanded
  const shown = folded
    ? visibleSectionIndices(total, [activeIndex, renamingIndex], plan?.visibleCount ?? total)
    : sections.map((_, i) => i)
  const hiddenCount = total - shown.length

  // ── Drag & drop reorder ──────────────────────────────────────────────────────
  // The id lives in a ref for the handlers; the visual "hole" is set a frame later so
  // the browser's drag image is captured from the tab as it looks, not from the hole.
  const dragIdRef = useRef<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [drop, setDrop] = useState<DropTarget | null>(null)
  // The map was unfolded by this drag (see handleDragStart): fold it back if it's cancelled.
  const unfoldedForDragRef = useRef(false)

  // `dropped`: the drag ended in a reorder, which stays unfolded so the moved tab is seen.
  const endDrag = useCallback((dropped = false) => {
    dragIdRef.current = null
    setDraggingId(null)
    setDrop(null)
    if (unfoldedForDragRef.current && !dropped) setExpanded(false)
    unfoldedForDragRef.current = false
  }, [])

  // Safety net: a drag that ends on another target, or whose source tab unmounted
  // mid-drag (its dragend then fires on a detached node that reaches nobody). `drop` is
  // listened in the bubble phase on purpose: in capture it would run before the block's
  // own onDrop and clear the drag it is about to commit.
  useEffect(() => {
    const onEnd = () => { if (dragIdRef.current) endDrag() }
    window.addEventListener('dragend', onEnd, true)
    window.addEventListener('drop', onEnd)
    return () => {
      window.removeEventListener('dragend', onEnd, true)
      window.removeEventListener('drop', onEnd)
    }
  }, [endDrag])

  // A folded map unfolds as the drag starts: the visual order then matches the data (no
  // promoted active section), every section is a target and a drop can't send the tab
  // into the folded zone unseen. Also a frame later — re-laying out the tabs inside
  // dragstart could disturb the drag image, or the drag itself.
  const handleDragStart = (e: React.DragEvent, sectionId: string) => {
    dragIdRef.current = sectionId
    e.dataTransfer.effectAllowed = 'move'
    const unfold = folded && hiddenCount > 0
    requestAnimationFrame(() => {
      if (dragIdRef.current !== sectionId) return
      setDraggingId(sectionId)
      if (unfold) {
        unfoldedForDragRef.current = true
        setExpanded(true)
      }
    })
  }

  const handleTabDragOver = (e: React.DragEvent<HTMLDivElement>, sectionId: string) => {
    const draggedId = dragIdRef.current
    if (!draggedId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (draggedId === sectionId) { setDrop(null); return }
    const from = sections.findIndex((s) => s.id === draggedId)
    const to = sections.findIndex((s) => s.id === sectionId)
    if (from === -1 || to === -1) return
    const side = from < to ? 'after' : 'before'
    // Fractional rects (offset* round to integers): the joint is the block's edge when the
    // tab sits within EDGE_TOLERANCE of it.
    const tabRect = e.currentTarget.getBoundingClientRect()
    const blockRect = blockRef.current?.getBoundingClientRect()
    const inside = !blockRect || (side === 'before'
      ? tabRect.left - blockRect.left <= EDGE_TOLERANCE
      : blockRect.right - tabRect.right <= EDGE_TOLERANCE)
    setDrop((prev) =>
      prev && prev.sectionId === sectionId && prev.side === side && prev.inside === inside
        ? prev
        : { sectionId, side, inside })
  }

  // The joints, "+" and the pills sit between tabs: still a valid drop zone (the last
  // target is kept), so the cursor doesn't flicker to "no drop" crossing a gap.
  const handleBlockDragOver = (e: React.DragEvent) => {
    if (!dragIdRef.current) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleBlockDrop = (e: React.DragEvent) => {
    const draggedId = dragIdRef.current
    if (!draggedId) return
    e.preventDefault()
    const reorder = !!drop && drop.sectionId !== draggedId
    if (reorder) onReorder(draggedId, drop.sectionId)
    endDrag(reorder)
  }

  // dragleave bubbles from tab to tab: only clear when the pointer leaves the block.
  const handleBlockDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null
    if (next && e.currentTarget.contains(next)) return
    setDrop(null)
  }

  // ── Colours ──────────────────────────────────────────────────────────────────
  const colorOf = (section: NoteSection) => resolveGroupColor(section.name, sectionTagColors)
  const activeSection = activeIndex === -1 ? null : sections[activeIndex]
  const activeColor = activeSection ? colorOf(activeSection) : null
  const activeAiHidden = !!activeSection?.aiHidden
  const activeInk = useMemo(
    () => (activeColor ? resolveActiveInk(activeColor, activeAiHidden) : undefined),
    // themeId/accentOverride: the vars it reads change with them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeColor, activeAiHidden, themeId, accentOverride],
  )

  // ── Rendering ────────────────────────────────────────────────────────────────
  const renderTab = (section: NoteSection, measuring: boolean) => {
    const isActive = section.id === activeSectionId
    const isRenaming = renamingId === section.id
    const style = {
      '--sm-color': `rgb(${colorChannels(colorOf(section))})`,
      ...(isActive && activeInk ? { '--sm-ink': activeInk } : {}),
    } as CSSProperties
    const className = [
      'section-map-tab',
      isActive && 'is-active',
      section.aiHidden && 'is-ai-hidden',
      isRenaming && 'is-renaming',
      !measuring && draggingId === section.id && 'is-dragging',
    ].filter(Boolean).join(' ')

    if (measuring) {
      // Same faces as below, inert: only their widths matter.
      return (
        <div key={section.id} className={className}>
          {isRenaming ? (
            <>
              <span className="section-map-rename-input" />
              <span className="section-map-rename-ok" />
            </>
          ) : (
            <>
              <span className="section-map-main">
                {section.aiHidden && <EyeOff size={11} className="flex-shrink-0" />}
                <span className="section-map-label">
                  <span className="section-map-label-sizer">{section.name}</span>
                </span>
              </span>
              <span className="section-map-chevron"><ChevronDown size={13} /></span>
            </>
          )}
        </div>
      )
    }

    const menuOpen = menuSectionId === section.id
    const dropHere = drop && drop.sectionId === section.id && draggingId !== section.id ? drop : null
    return (
      <div
        key={section.id}
        data-section-id={section.id}
        className={className}
        style={style}
        draggable={!isRenaming}
        title={t.editor.dragToReorder}
        onDragStart={(e) => handleDragStart(e, section.id)}
        onDragOver={(e) => handleTabDragOver(e, section.id)}
        onDragEnd={() => endDrag()}
        onContextMenu={(e) => {
          // Not over the inline rename input: its name isn't saved yet, and the
          // colours are keyed by section name.
          if (isRenaming) return
          e.preventDefault()
          onOpenMenu(section.id, e.clientX, e.clientY)
        }}
      >
        {isRenaming ? (
          <>
            <input
              ref={renameRef}
              {...OWN_KEYS_PROPS}
              value={renameValue}
              onChange={(e) => onRenameChange(e.target.value)}
              onKeyDown={onRenameKeyDown}
              onBlur={onRenameCommit}
              className="section-map-rename-input"
            />
            <button
              onMouseDown={(e) => { e.preventDefault(); onRenameCommit() }}
              className="section-map-rename-ok"
              tabIndex={-1}
            >
              <Check size={12} />
            </button>
          </>
        ) : (
          <>
            <button
              {...(isActive ? {} : previewProps(noteId, section.id, { placement: 'cursor-below' }))}
              onClick={() => onSwitch(section.id)}
              onDoubleClick={() => onStartRename(section)}
              className="section-map-main"
            >
              {section.aiHidden && (
                <EyeOff size={11} className="opacity-70 flex-shrink-0" aria-label={t.common.hiddenFromAI} />
              )}
              <span className="section-map-label">
                <span className="section-map-label-sizer" aria-hidden>{section.name}</span>
                <span className="section-map-label-text">{section.name}</span>
              </span>
            </button>
            <button
              className="section-map-chevron"
              tabIndex={isActive ? 0 : -1}
              aria-hidden={!isActive}
              aria-label={t.editor.sectionOptions}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title={t.editor.sectionOptions}
              onClick={(e) => {
                // Not on to window: the open menu's outside-click listener would close it.
                e.stopPropagation()
                if (menuOpen) { onCloseMenu(); return }
                const rect = e.currentTarget.parentElement?.getBoundingClientRect() ?? e.currentTarget.getBoundingClientRect()
                onOpenMenu(section.id, rect.left, rect.bottom + 4)
              }}
            >
              <ChevronDown size={13} />
            </button>
            <span className="section-map-corner" aria-hidden />
          </>
        )}
        {dropHere && (
          <span
            className="section-map-drop"
            data-side={dropHere.side}
            data-inside={dropHere.inside ? '' : undefined}
            aria-hidden
          />
        )}
      </div>
    )
  }

  return (
    <div className="relative min-w-0 font-mono">
      <div
        ref={blockRef}
        className="section-map"
        onDragOver={handleBlockDragOver}
        onDrop={handleBlockDrop}
        onDragLeave={handleBlockDragLeave}
      >
        {shown.map((i) => renderTab(sections[i], false))}
        {folded && hiddenCount > 0 && (
          <button
            className="section-map-pill"
            onClick={() => setExpanded(true)}
            title={t.editor.showAllSections}
          >
            {plural(t.editor.moreSections, hiddenCount)}
          </button>
        )}
        {overflowing && expanded && (
          <button
            className="section-map-pill"
            onClick={() => setExpanded(false)}
            title={t.editor.showLessSectionsHint}
          >
            {t.editor.showLessSections}
          </button>
        )}
        <button
          className="section-map-add"
          onClick={onAdd}
          title={t.editor.addSection}
          aria-label={t.editor.addSection}
        >
          <Plus size={13} />
        </button>
      </div>

      <div ref={measureRef} className="section-map-measure" aria-hidden>
        <div>
          {sections.map((section) => renderTab(section, true))}
          <span className="section-map-pill">{moreLabel}</span>
          <span className="section-map-add" />
        </div>
      </div>
    </div>
  )
}
