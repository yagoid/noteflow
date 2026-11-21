// @vitest-environment happy-dom
// The list of the section's agent tasks the queue bar's counts open
// (AgentQueueBar.tsx → AgentTaskList.tsx): how it opens (from the bar and from
// the folded pill), what its rows show, the keys, and that a row goes to the task.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Editor } from '@tiptap/core'
import { AgentQueueBar } from '../../src/components/Editor/AgentQueueBar'
import { schemaExtensions } from '../../src/components/Editor/editorExtensions'
import { setAgentNoteId } from '../../src/components/Editor/useAgentTask'
import { htmlFromMarkdown } from '../../src/lib/markdownHtml'
import { resetAgentTasksStoreForTests, useAgentTasksStore } from '../../src/stores/agentTasksStore'
import { useNotesStore } from '../../src/stores/notesStore'
import type { AgentBlock, Note } from '../../src/types'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ROBOT = '\u{1F916}'
const NOW = Date.parse('2026-11-20T12:00:00.000Z')
const FRESH = new Date(NOW - 60_000).toISOString()

let root: Root | null = null
let host: HTMLElement | null = null
let editorHost: HTMLElement | null = null
let editor: Editor

const NOTE: Note = {
  id: 'n1', title: 'Website relaunch', tags: [], created: '', updated: '', archived: false, favorited: false,
  sections: [{ id: 's1', name: 'Main', content: '' }], raw: '', filePath: 'C:\\notes\\website-n1',
}

const DOC = [
  `- [ ] Wire the login form ${ROBOT}aaaa1:running`,
  `- [ ] Queued one ${ROBOT}bbbb2:queued`,
  `- [ ] Which database ${ROBOT}cccc3:waiting`,
  `- [ ] Queued two ${ROBOT}dddd4:queued`,
  `- [ ] Running, no percent ${ROBOT}eeee5:running`,
].join('\n')

function setBlocks(blocks: AgentBlock[]) {
  useAgentTasksStore.setState({
    byDir: { note: blocks },
    byId: Object.fromEntries(blocks.map((b) => [b.id, b])),
    pendingLoads: 0,
    now: NOW,
  })
}

function makeEditor(md: string) {
  editorHost = document.createElement('div')
  document.body.appendChild(editorHost)
  editor = new Editor({ element: editorHost, extensions: schemaExtensions(), content: htmlFromMarkdown(md) })
  setAgentNoteId(editor, 'n1', 's1')
}

function render() {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(createElement(AgentQueueBar, { editor })))
}

const list = () => document.querySelector<HTMLElement>('.agent-tasklist')
const rows = () => Array.from(document.querySelectorAll<HTMLButtonElement>('.agent-tasklist-row'))
const press = (key: string) => act(() => {
  document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
})

beforeEach(() => {
  resetAgentTasksStoreForTests()
  ;(window as unknown as { noteflow: unknown }).noteflow = {}
  useNotesStore.setState({ notes: [NOTE] })
  useAgentTasksStore.setState({ settings: { ...useAgentTasksStore.getState().settings, enabled: true } })
  setBlocks([
    { id: 'aaaa1', meta: { state: 'running', lastSignal: FRESH, percent: '40', progress: 'Writing the tests', startedAt: FRESH }, body: '' },
    { id: 'cccc3', meta: { state: 'waiting', lastSignal: FRESH, question: 'Postgres or SQLite?' }, body: '' },
    { id: 'eeee5', meta: { state: 'running', lastSignal: FRESH, startedAt: new Date(NOW - 12 * 60_000).toISOString() }, body: '' },
  ])
})

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  editor?.destroy()
  editorHost?.remove()
  document.querySelectorAll('.agent-tasklist, .agent-queue-pop').forEach((el) => el.remove())
  useNotesStore.setState({ notes: [] })
  resetAgentTasksStoreForTests()
})

describe('AgentTaskList (from the queue bar)', () => {
  it('the counts are one button that opens the list: needs you first, then running, then queued', () => {
    makeEditor(DOC)
    render()
    const counts = host!.querySelector<HTMLButtonElement>('.agent-queue-full .agent-queue-counts')!
    expect(counts.tagName).toBe('BUTTON')
    expect(counts.getAttribute('aria-haspopup')).toBe('dialog')
    expect(counts.getAttribute('aria-expanded')).toBe('false')
    act(() => counts.click())
    expect(counts.getAttribute('aria-expanded')).toBe('true')
    expect(list()?.getAttribute('role')).toBe('dialog')
    expect(Array.from(document.querySelectorAll('.agent-tasklist-head')).map((h) => h.textContent))
      .toEqual(['Needs you1', 'Running2', 'Queued2'])
    expect(rows().map((r) => r.querySelector('.agent-tasklist-text')?.textContent))
      .toEqual(['Which database', 'Wire the login form', 'Running, no percent', 'Queued one', 'Queued two'])
    // The first row takes the focus.
    expect(document.activeElement).toBe(rows()[0])
    act(() => counts.click())
    expect(list()).toBeNull()
  })

  it('each row says what is its own: the question, the percent and what it is doing, the time, the place in the queue', () => {
    makeEditor(DOC)
    render()
    act(() => host!.querySelector<HTMLButtonElement>('.agent-queue-counts')!.click())
    const [asked, running, noPercent, first, second] = rows()
    expect(asked.querySelector('.agent-tasklist-ask')?.textContent).toBe('Postgres or SQLite?')
    expect(running.querySelector('.agent-tasklist-meter-value')?.textContent).toBe('40%')
    expect(running.querySelector<HTMLElement>('.agent-tasklist-meter-fill')?.style.width).toBe('40%')
    expect(running.querySelector('.agent-tasklist-sub')?.textContent).toBe('Writing the tests')
    expect(noPercent.querySelector('.agent-tasklist-meter')).toBeNull()
    expect(noPercent.querySelector('.agent-tasklist-side')?.textContent).toBe('12m')
    expect(first.querySelector('.agent-tasklist-side')?.textContent).toBe('#1Number 1 in the queue')
    expect(second.querySelector('.agent-tasklist-side [aria-hidden]')?.textContent).toBe('#2')
  })

  it('the arrows move between the rows; Escape closes it and gives the focus back to the counts', () => {
    makeEditor(DOC)
    render()
    const counts = host!.querySelector<HTMLButtonElement>('.agent-queue-counts')!
    act(() => counts.click())
    press('ArrowDown')
    expect(document.activeElement).toBe(rows()[1])
    press('ArrowUp')
    press('ArrowUp')
    expect(document.activeElement).toBe(rows()[4]) // wraps around
    press('Home')
    expect(document.activeElement).toBe(rows()[0])
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(list()).toBeNull()
    expect(document.activeElement).toBe(counts)
  })

  it('a row goes to its task: the list closes and the cursor lands at the end of the task', () => {
    makeEditor(DOC)
    render()
    act(() => host!.querySelector<HTMLButtonElement>('.agent-queue-counts')!.click())
    act(() => rows()[4].click()) // "Queued two"
    expect(list()).toBeNull()
    const { $from } = editor.state.selection
    expect($from.parent.textContent).toBe('Queued two')
    expect($from.parentOffset).toBe('Queued two'.length)
    // A queued task is not touched (its chip would have taken it out of the queue).
    expect($from.node($from.depth - 1).attrs).toMatchObject({ agentId: 'dddd4', agentState: 'queued' })
  })

  it('folded into the pill: its counts open the list in place of the popover', () => {
    makeEditor(DOC)
    render()
    const pill = host!.querySelector<HTMLButtonElement>('.agent-queue-pill')!
    act(() => pill.click())
    const named = document.querySelector<HTMLButtonElement>('.agent-queue-pop .agent-queue-counts')!
    expect(named.textContent).toContain('1 needs you')
    act(() => named.click())
    expect(document.querySelector('.agent-queue-pop')).toBeNull()
    expect(rows()).toHaveLength(5)
    expect(pill.getAttribute('aria-expanded')).toBe('true')
    act(() => pill.click())
    expect(list()).toBeNull()
  })
})

describe('AgentTaskList — edge cases', () => {
  /** The position of the task item whose first line is `text`. */
  const itemAt = (text: string) => {
    let found = -1
    editor.state.doc.descendants((node, pos) => {
      if (found < 0 && node.type.name === 'taskItem' && node.firstChild?.textContent === text) found = pos
    })
    return found
  }
  const setState = (text: string, agentState: string) => {
    const pos = itemAt(text)
    editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...editor.state.doc.nodeAt(pos)!.attrs, agentState }))
  }

  it('the last active task finishing closes the list with the bar — no key listener is left behind', () => {
    vi.useFakeTimers()
    try {
      makeEditor(`- [ ] Only one ${ROBOT}aaaa1:running`)
      render()
      act(() => host!.querySelector<HTMLButtonElement>('.agent-queue-counts')!.click())
      expect(list()).not.toBeNull()
      act(() => {
        setState('Only one', 'review')
        vi.advanceTimersByTime(500) // the recount
      })
      expect(host!.innerHTML).toBe('')
      expect(list()).toBeNull()
      // Escape is the editor's again: nothing swallows it.
      const esc = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
      window.dispatchEvent(esc)
      expect(esc.defaultPrevented).toBe(false)
      // The bar coming back does not bring the list back with it.
      act(() => {
        setState('Only one', 'running')
        vi.advanceTimersByTime(500)
      })
      expect(host!.querySelector('.agent-queue-counts')).not.toBeNull()
      expect(list()).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('an id on two tasks (a sync merge): each row goes to its own task', () => {
    makeEditor(`- [ ] First copy ${ROBOT}aaaa1:queued\n- [ ] Second copy ${ROBOT}aaaa1:queued`)
    render()
    act(() => host!.querySelector<HTMLButtonElement>('.agent-queue-counts')!.click())
    act(() => rows()[1].click())
    expect(editor.state.selection.$from.parent.textContent).toBe('Second copy')
  })

  it('a queued task in a read-only editor: the focus goes back to the counts, not to nowhere', () => {
    makeEditor(DOC)
    editor.setEditable(false)
    render()
    const counts = host!.querySelector<HTMLButtonElement>('.agent-queue-counts')!
    act(() => counts.click())
    act(() => rows()[3].click()) // "Queued one"
    expect(list()).toBeNull()
    expect(document.activeElement).toBe(counts)
  })

  // The React node views (the box, the chip) do not mount on this headless
  // editor: the plain task DOM gets stand-ins for them, where the real ones sit.
  it('opens the report with the task\'s OWN control, never a subtask\'s — and never presses a queued task\'s chip', () => {
    makeEditor(`- [ ] Parent ${ROBOT}aaaa1:review\n  - [ ] Child ${ROBOT}bbbb2:failed\n- [ ] Waiting turn ${ROBOT}cccc3:queued`)
    render()
    act(() => host!.querySelector<HTMLButtonElement>('.agent-queue-counts')!.click())
    const pressed: string[] = []
    for (const li of Array.from(editorHost!.querySelectorAll<HTMLElement>('li[data-type="taskItem"]'))) {
      const control = document.createElement('button')
      control.className = 'agent-task-trigger'
      control.addEventListener('click', () => pressed.push(li.getAttribute('data-agent-id')!))
      li.querySelector(':scope > div')!.appendChild(control) // after the task's content (and its subtasks)
    }
    const byText = (text: string) => rows().find((r) => r.querySelector('.agent-tasklist-text')?.textContent === text)!
    act(() => byText('Parent').click())
    expect(pressed).toEqual(['aaaa1'])
    act(() => host!.querySelector<HTMLButtonElement>('.agent-queue-counts')!.click())
    act(() => byText('Waiting turn').click())
    expect(pressed).toEqual(['aaaa1']) // its chip would take it out of the queue
    const pos = itemAt('Waiting turn')
    expect(editor.state.doc.nodeAt(pos)!.attrs.agentState).toBe('queued')
  })
})
