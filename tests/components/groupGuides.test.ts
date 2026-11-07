// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest'
import { StrictMode, createElement, createRef, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { GroupGuides } from '../../src/components/Sidebar/GroupGuides'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const noIds: ReadonlySet<string> = new Set()

// Module-level ref (the Sidebar uses useRef; same object shape, no hook needed here).
const rootRef = createRef<HTMLDivElement>()

function Harness() {
  return createElement(
    'div',
    { ref: rootRef, 'data-testid': 'root' },
    createElement(GroupGuides, { activeKey: null, rootRef, collapsedGroupIds: noIds, collapsedFolderIds: noIds }),
  )
}

/** A group body with its cursor, as Sidebar renders it (visible, so a placement shows). */
function appendGroupBody(root: Element): HTMLElement {
  const body = document.createElement('div')
  body.className = 'sbg-in'
  const cur = document.createElement('i')
  cur.className = 'sbg-cur'
  body.appendChild(cur)
  root.appendChild(body)
  return cur
}

let root: Root | null = null
let container: HTMLElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

describe('GroupGuides', () => {
  it('keeps observing the list after a StrictMode mount → unmount → mount', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root!.render(createElement(StrictMode, null, createElement(Harness)))
    })
    await wait(20)

    // A group mounted later (e.g. a filter cleared): the observers must pick it up and
    // place its cursor — with no open note, that means hiding it.
    const cur = appendGroupBody(container.querySelector('[data-testid="root"]')!)
    expect(cur.classList.contains('is-off')).toBe(false)
    await wait(80)
    expect(cur.classList.contains('is-off')).toBe(true)
  })
})
