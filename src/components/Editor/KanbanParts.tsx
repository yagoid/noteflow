import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlignLeft, Calendar, Ellipsis, Flag } from 'lucide-react'
import type { KanbanCard } from '../../lib/kanban'
import { extraLineCount, type CardRef } from '../../lib/kanbanOps'
import { getRootZoom } from '../../stores/themeStore'
import { useNotesStore } from '../../stores/notesStore'
import { useT } from '../../i18n/useT'
import { plural, tf } from '../../i18n/format'
import { badgeColorClass, formatBadgeDate, type Importance } from './taskBadge'

// Building blocks of the kanban NodeView (KanbanBoardView.tsx): the inline
// single-line editor, the options menu and the card.

export type PickerKind = 'deadline' | 'importance'

// ── Inline single-line editor (card text, column titles, composers) ─────────

interface InlineEditorProps {
  initial: string
  placeholder?: string
  className: string
  selectAll?: boolean
  /** Enter, or focus leaving the field (`via: 'blur'`: don't pull focus back). */
  onSubmit: (value: string, via: 'enter' | 'blur') => void
  /** Escape. */
  onCancel: () => void
}

export function InlineEditor({ initial, placeholder, className, selectAll, onSubmit, onCancel }: InlineEditorProps) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLTextAreaElement>(null)
  // Exactly one outcome per editor (Enter, Escape, or blur — the blur that
  // follows an Enter/Escape unmount must not submit twice).
  const settled = useRef(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus({ preventScroll: true })
    if (selectAll) el.select()
    else el.setSelectionRange(el.value.length, el.value.length)
  }, [selectAll])

  const settle = (fn: () => void) => {
    if (settled.current) return
    settled.current = true
    fn()
  }

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      className={className}
      spellCheck={false}
      onChange={(e) => setValue(e.target.value.replace(/\n/g, ' '))}
      onKeyDown={(e) => {
        // Plain keys belong to the field (Enter, Backspace, arrows… must not
        // reach the editor's own handlers); app accelerators (Ctrl+S, Ctrl+F…)
        // keep bubbling so global shortcuts still work.
        if (!e.ctrlKey && !e.metaKey && !e.altKey) e.stopPropagation()
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault()
          settle(() => onSubmit(value, 'enter'))
        } else if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          settle(onCancel)
        }
      }}
      onBlur={() => settle(() => onSubmit(value, 'blur'))}
    />
  )
}

// ── Popup menu (column / card options) ──────────────────────────────────────

export interface MenuItem {
  key: string
  label: string
  icon: React.ReactNode
  danger?: boolean
  /** Ask again before running (the item turns into this question). */
  confirm?: string
  onSelect: () => void
}

interface KanbanMenuProps {
  anchor: HTMLElement
  items: MenuItem[]
  /** 'select' = an item ran (focus goes back to the board); 'dismiss' = click outside / Escape. */
  onClose: (reason: 'select' | 'dismiss') => void
}

export function KanbanMenu({ anchor, items, onClose }: KanbanMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [armed, setArmed] = useState<string | null>(null)

  // Fixed popup positioned from a device-space rect: divide by the root zoom,
  // then clamp to the viewport (same as CodeBlockWithCopy's dropdown).
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const z = getRootZoom()
    const rect = anchor.getBoundingClientRect()
    // Viewport in the popup's local space, from the root's rect (also rect
    // space) rather than window.inner*, whose space varies across Chromium
    // versions under the root zoom (see clientToRectScale in KanbanBoardView).
    const root = document.documentElement.getBoundingClientRect()
    const vw = root.width / z
    const vh = root.height / z
    const margin = 8
    let left = rect.right / z - el.offsetWidth
    let top = rect.bottom / z + 4
    if (left + el.offsetWidth + margin > vw) left = vw - el.offsetWidth - margin
    if (left < margin) left = margin
    if (top + el.offsetHeight + margin > vh) top = rect.top / z - el.offsetHeight - 4
    el.style.left = `${left}px`
    el.style.top = `${Math.max(margin, top)}px`
  }, [anchor])

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (menuRef.current?.contains(target) || anchor.contains(target)) return
      onClose('dismiss')
    }
    // Capture phase: the editor's key handlers stop propagation before a
    // bubbling listener on document/window would see the Escape.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      onClose('dismiss')
    }
    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [anchor, onClose])

  return createPortal(
    <div ref={menuRef} className="kanban-menu" style={{ position: 'fixed', left: 0, top: 0, zIndex: 9999 }}>
      {items.map((item) => {
        const isArmed = armed === item.key
        return (
          <button
            key={item.key}
            type="button"
            className={`kanban-menu-item${item.danger ? ' is-danger' : ''}${isArmed ? ' is-armed' : ''}`}
            onClick={() => {
              if (item.confirm && !isArmed) { setArmed(item.key); return }
              item.onSelect()
              onClose('select')
            }}
          >
            {item.icon}
            <span>{isArmed ? item.confirm : item.label}</span>
          </button>
        )
      })}
    </div>,
    document.body,
  )
}

// ── Card ─────────────────────────────────────────────────────────────────────

interface CardViewProps {
  card: KanbanCard
  cardRef: CardRef
  html: string
  editable: boolean
  editing: boolean
  isDragSource?: boolean
  ghost?: boolean
  onToggle?: () => void
  onStartEdit?: () => void
  onSubmitText?: (text: string, via: 'enter' | 'blur') => void
  onCancelEdit?: () => void
  onOpenPicker?: (kind: PickerKind, trigger: HTMLElement) => void
  onOpenMenu?: (anchor: HTMLElement) => void
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void
}

export function CardView({
  card, cardRef, html, editable, editing, isDragSource, ghost,
  onToggle, onStartEdit, onSubmitText, onCancelEdit, onOpenPicker, onOpenMenu, onPointerDown,
}: CardViewProps) {
  const t = useT()
  const extraCount = extraLineCount(card)
  const importanceLabels: Record<Importance, string> = {
    low: t.editor.task.importanceLow,
    medium: t.editor.task.importanceMedium,
    high: t.editor.task.importanceHigh,
  }
  const hasMeta = !!card.due || !!card.importance || extraCount > 0

  const onTextClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    // Links open externally (the editor's own click handler does it).
    if (target.closest('a')) return
    const relation = target.closest<HTMLElement>('span[data-type="section-relation"]')
    if (relation) {
      const noteId = relation.getAttribute('data-note-id')
      const sectionId = relation.getAttribute('data-section-id')
      if (noteId && sectionId) useNotesStore.getState().navigateToSection(noteId, sectionId)
      return
    }
    if (editable) onStartEdit?.()
  }

  return (
    <div
      className={[
        'kanban-card group',
        card.checked ? 'is-checked' : '',
        editing ? 'is-editing' : '',
        isDragSource ? 'is-drag-source' : '',
        ghost ? 'is-ghost' : '',
      ].filter(Boolean).join(' ')}
      data-kanban-card={ghost ? undefined : cardRef.idx}
      onPointerDown={onPointerDown}
    >
      <label className="kanban-check">
        <input type="checkbox" checked={card.checked} disabled={!editable} onChange={() => onToggle?.()} />
      </label>

      <div className="kanban-card-body">
        {editing ? (
          <InlineEditor
            initial={card.md}
            className="kanban-input kanban-card-input"
            onSubmit={(v, via) => onSubmitText?.(v, via)}
            onCancel={() => onCancelEdit?.()}
          />
        ) : (
          <div
            className={`kanban-card-text${card.md ? '' : ' is-empty'}`}
            onClick={onTextClick}
            dangerouslySetInnerHTML={{ __html: html || '&nbsp;' }}
          />
        )}

        {hasMeta && (
          <div className="kanban-card-meta">
            {card.importance && (
              <button
                type="button"
                className="task-importance-trigger has-importance"
                disabled={!editable}
                onClick={(e) => onOpenPicker?.('importance', e.currentTarget)}
                title={tf(t.editor.task.importanceTooltip, { level: importanceLabels[card.importance] })}
              >
                <span className={`task-importance-dot task-importance-dot--${card.importance}`} />
              </button>
            )}
            {card.due && (
              <button
                type="button"
                className="task-deadline-trigger has-due"
                disabled={!editable}
                onClick={(e) => onOpenPicker?.('deadline', e.currentTarget)}
                title={`${tf(t.editor.task.deadlineTooltip, { date: card.due })}${card.alarm ? ` ⏰${card.alarm}` : ''}`}
              >
                <span className={`task-badge ${badgeColorClass(card.due)}`}>
                  📅 {formatBadgeDate(card.due)}
                  {card.alarm && <> ⏰{card.alarm}</>}
                </span>
              </button>
            )}
            {extraCount > 0 && (
              <span
                className="kanban-extra"
                title={`${plural(t.editor.kanban.extraLines, extraCount)}\n${card.extra}`}
              >
                <AlignLeft size={11} />
                {extraCount}
              </span>
            )}
          </div>
        )}
      </div>

      {editable && !editing && !ghost && (
        <div className="kanban-card-actions">
          {!card.importance && (
            <button
              type="button"
              className="kanban-icon-btn"
              title={t.editor.task.setImportance}
              onClick={(e) => onOpenPicker?.('importance', e.currentTarget)}
            >
              <Flag size={12} />
            </button>
          )}
          {!card.due && (
            <button
              type="button"
              className="kanban-icon-btn"
              title={t.editor.task.setDeadline}
              onClick={(e) => onOpenPicker?.('deadline', e.currentTarget)}
            >
              <Calendar size={12} />
            </button>
          )}
          <button
            type="button"
            className="kanban-icon-btn"
            title={t.editor.kanban.cardOptions}
            onClick={(e) => onOpenMenu?.(e.currentTarget)}
          >
            <Ellipsis size={12} />
          </button>
        </div>
      )}
    </div>
  )
}
