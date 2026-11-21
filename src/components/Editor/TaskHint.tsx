import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { taskMenuPosition, type TaskMenuPlacement } from './taskBadge'

// The hint card of a task's EMPTY buttons (the date's and the robot's, right
// of the text): what the button does, in a title and one sentence — instead of
// the native `title`, which says only a name and shows late. Shown by
// useTaskHint.ts. Portalled to the window's <body> and `position: fixed`, so
// the editor's scroller (overflow-x: hidden) never clips it; placed like the
// task menu (taskMenuPosition: below the button, right edges aligned, above
// when it does not fit, always inside the window). Never takes the pointer.
// index.css § Task hint card.

interface TaskHintProps {
  /** The button it explains. */
  anchor: HTMLElement
  title: string
  text: string
  /** Id of the sentence, for the button's aria-describedby. */
  textId?: string
}

export function TaskHint({ anchor, title, text, textId }: TaskHintProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<TaskMenuPlacement | null>(null)

  // Measured before the first paint: it shows already in place.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const win = anchor.ownerDocument.defaultView ?? window
    setPlace(taskMenuPosition(
      anchor.getBoundingClientRect(),
      { width: el.offsetWidth, height: el.offsetHeight },
      { width: win.innerWidth, height: win.innerHeight },
    ))
  }, [anchor, title, text])

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      className={`task-hint${place ? ` is-placed task-hint--${place.side}` : ''}`}
      style={place ? { top: place.top, left: place.left } : { top: 0, left: 0, visibility: 'hidden' }}
    >
      <div className="task-hint-title">{title}</div>
      <div className="task-hint-text" id={textId}>{text}</div>
    </div>,
    anchor.ownerDocument.body,
  )
}
