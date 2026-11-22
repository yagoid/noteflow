// @vitest-environment happy-dom
// Sending agent tasks from the app, on a real editor: the queue bar right of
// the note title (AgentQueueBar.tsx) and the pill over a text selection
// (AgentSelectionButton.tsx) — what they show, what they copy and what they
// change in the note.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Editor } from '@tiptap/core'
import History from '@tiptap/extension-history'
import { TextSelection } from '@tiptap/pm/state'
import { AgentQueueBar } from '../../src/components/Editor/AgentQueueBar'
import { AgentSelectionButton } from '../../src/components/Editor/AgentSelectionButton'
import { schemaExtensions } from '../../src/components/Editor/editorExtensions'
import { agentCheckRuleOf, copyAgentPrompt, setAgentNoteId, useAgentSendAllowed } from '../../src/components/Editor/useAgentTask'
import { createDebouncedSave } from '../../src/lib/pendingEdits'
import { htmlFromMarkdown, htmlToMarkdown } from '../../src/lib/markdownHtml'
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
const STALE = new Date(NOW - 5 * 60 * 60_000).toISOString()

let root: Root | null = null
let host: HTMLElement | null = null
let editorHost: HTMLElement | null = null
let editor: Editor
let copied: string[]
let reconciled: string[]

const NOTE: Note = {
  id: 'n1', title: 'Website relaunch', tags: [], created: '', updated: '', archived: false, favorited: false,
  sections: [{ id: 's1', name: 'Main', content: '' }, { id: 's2', name: 'Backlog', content: '' }],
  raw: '', filePath: 'C:\\notes\\website-n1',
}

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
  editor = new Editor({ element: editorHost, extensions: [...schemaExtensions(), History], content: htmlFromMarkdown(md) })
  setAgentNoteId(editor, 'n1', 's2')
}

function render(element: ReturnType<typeof createElement>) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(element))
}

const saved = () => htmlToMarkdown(editor.getHTML())
const flush = () => act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve() })

/** Selects from the start of `a` to the end of `b` in the editor's text. */
function selectText(a: string, b: string = a) {
  const find = (text: string) => {
    let found = -1
    editor.state.doc.descendants((node, pos) => {
      if (found < 0 && node.isText && node.text?.includes(text)) found = pos + node.text.indexOf(text)
    })
    if (found < 0) throw new Error(`"${text}" is not in the document`)
    return found
  }
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, find(a), find(b) + b.length)))
}

beforeEach(() => {
  vi.useFakeTimers()
  resetAgentTasksStoreForTests()
  copied = []
  reconciled = []
  ;(window as unknown as { noteflow: unknown }).noteflow = {
    agentTasksReconcile: async (_dir: string, id: string) => { reconciled.push(id); return { ok: true } },
  }
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (text: string) => { copied.push(text) } },
  })
  useNotesStore.setState({ notes: [NOTE] })
  // One after another (not the default 'parallel'): these tests read the batch prompt, one `task start <ids>`.
  useAgentTasksStore.setState({ settings: { ...useAgentTasksStore.getState().settings, enabled: true, onFinish: 'review', batchMode: 'sequential' } })
})

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  editor?.destroy()
  editorHost?.remove()
  document.querySelectorAll('.agent-select, .agent-queue-pop').forEach((el) => el.remove())
  useNotesStore.setState({ notes: [] })
  resetAgentTasksStoreForTests()
  vi.useRealTimers()
})

describe('AgentQueueBar', () => {
  // The bar shows a glyph and a number per state; the words are its tooltip (and its accessible text).
  const counts = () => Array.from(host!.querySelectorAll('.agent-queue-full .agent-queue-count')).map((el) => el.getAttribute('title'))
  const copyButton = () => host!.querySelector<HTMLButtonElement>('.agent-queue-full .agent-queue-btn')

  it('nothing at all while the section has no task queued or with an agent', () => {
    makeEditor(`- [ ] Plain\n- [x] Done ${ROBOT}aaaa1:done\n- [ ] Failed ${ROBOT}bbbb2:failed`)
    render(createElement(AgentQueueBar, { editor }))
    expect(host!.innerHTML).toBe('')
  })

  it('counts by state — a glyph and a number, the words in the tooltip — live states first', () => {
    setBlocks([
      { id: 'aaaa1', meta: { state: 'running', lastSignal: FRESH }, body: '' },
      { id: 'cccc3', meta: { state: 'waiting', lastSignal: FRESH }, body: '' },
    ])
    makeEditor([
      `- [ ] One ${ROBOT}aaaa1:running`,
      `- [ ] Two ${ROBOT}bbbb2:queued`,
      `- [ ] Three ${ROBOT}cccc3:waiting`,
      `- [ ] Four ${ROBOT}dddd4:queued`,
      `- [ ] Five ${ROBOT}eeee5:queued`,
    ].join('\n'))
    render(createElement(AgentQueueBar, { editor }))
    expect(counts()).toEqual(['1 running', '1 needs you', '3 queued'])
    expect(Array.from(host!.querySelectorAll('.agent-queue-full .agent-queue-count')).map((el) => el.textContent))
      .toEqual(['11 running', '11 needs you', '33 queued']) // the number, then the words for screen readers
    expect(host!.querySelector('.agent-queue')?.getAttribute('aria-label')).toBe('Agent tasks of this section')
    // The folded pill carries the total and an accessible name.
    const pill = host!.querySelector('.agent-queue-pill')!
    expect(pill.textContent).toBe('5')
    expect(pill.getAttribute('aria-label')).toBe('5 agent tasks. Show details')
    expect(pill.querySelector('.agent-queue-pill-ask')).not.toBeNull() // one needs you: the dot
  })

  it('a running task that went silent counts as "no signal" — and follows the store', () => {
    setBlocks([{ id: 'aaaa1', meta: { state: 'running', lastSignal: FRESH }, body: '' }])
    makeEditor(`- [ ] One ${ROBOT}aaaa1:running`)
    render(createElement(AgentQueueBar, { editor }))
    expect(counts()).toEqual(['1 running'])
    act(() => setBlocks([{ id: 'aaaa1', meta: { state: 'running', lastSignal: STALE }, body: '' }]))
    expect(counts()).toEqual(['1 with no signal'])
    expect(copyButton()).toBeNull() // nothing queued: nothing to copy
  })

  it('"Copy prompt" copies the prompt of the QUEUED tasks, in document order, cards included', async () => {
    makeEditor([
      `- [ ] One ${ROBOT}aaaa1:running`,
      `- [ ] Two ${ROBOT}bbbb2:queued`,
      '',
      '<!-- kanban -->',
      '- Todo',
      `  - [ ] Card ${ROBOT}cccc3:queued`,
      '<!-- /kanban -->',
      '',
      `- [ ] Last ${ROBOT}dddd4:queued`,
    ].join('\n'))
    const before = saved()
    render(createElement(AgentQueueBar, { editor }))
    expect(copyButton()?.textContent).toBe('Copy prompt')
    act(() => copyButton()!.click())
    await flush()
    expect(copied).toHaveLength(1)
    expect(copied[0]).toContain('Do these 3 NoteFlow tasks, in order: bbbb2 cccc3 dddd4')
    expect(copied[0]).toContain('Note: "Website relaunch" · Section: "Backlog"')
    expect(copied[0]).toContain('noteflow task start bbbb2 cccc3 dddd4 --on-finish review')
    expect(saved()).toBe(before) // copying from the bar changes nothing
    expect(copyButton()?.textContent).toBe('Prompt copied')
    act(() => { vi.advanceTimersByTime(2000) })
    expect(copyButton()?.textContent).toBe('Copy prompt')
  })

  it('follows the document, a moment after it changes', () => {
    makeEditor('- [ ] One\n- [ ] Two')
    render(createElement(AgentQueueBar, { editor }))
    expect(host!.innerHTML).toBe('')
    act(() => {
      editor.view.dispatch(editor.state.tr.setNodeMarkup(1, undefined, { ...editor.state.doc.nodeAt(1)!.attrs, agentId: 'aaaa1', agentState: 'queued' }))
    })
    expect(host!.innerHTML).toBe('') // not per transaction
    act(() => { vi.advanceTimersByTime(200) })
    expect(counts()).toEqual(['1 queued'])
  })

  it('the pill opens the same counts and action in a popover; Escape closes it', async () => {
    makeEditor(`- [ ] Two ${ROBOT}bbbb2:queued`)
    render(createElement(AgentQueueBar, { editor }))
    const pill = host!.querySelector<HTMLButtonElement>('.agent-queue-pill')!
    expect(pill.getAttribute('aria-expanded')).toBe('false')
    act(() => pill.click())
    const pop = document.querySelector<HTMLElement>('.agent-queue-pop')!
    expect(pop.getAttribute('role')).toBe('dialog')
    expect(pop.querySelector('.agent-queue-count')?.textContent).toBe('1 queued')
    act(() => pop.querySelector<HTMLButtonElement>('.agent-queue-btn')!.click())
    await flush()
    expect(copied[0]).toContain('noteflow task start bbbb2 --on-finish review')
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(document.querySelector('.agent-queue-pop')).toBeNull()
  })

  it('"queue all": only once something is queued and while open tasks are left — queues them in one undoable step', () => {
    const queueAll = () => host!.querySelector<HTMLButtonElement>('.agent-queue-full .agent-queue-all')
    makeEditor([
      `- [ ] Two ${ROBOT}bbbb2:running`,
      '- [ ] Open one',
      '  - [ ] Its sub',
      `- [ ] Failed ${ROBOT}cccc3:failed`,
      '- [ ] Open two',
    ].join('\n'))
    render(createElement(AgentQueueBar, { editor }))
    expect(counts()).toEqual(['1 running'])
    expect(queueAll()).toBeNull() // nothing queued yet: "not before"
    // One task goes to the queue: the button shows, with how many it would add.
    act(() => {
      editor.view.dispatch(editor.state.tr.setNodeMarkup(1, undefined, { ...editor.state.doc.nodeAt(1)!.attrs, agentState: 'queued' }))
      vi.advanceTimersByTime(1000) // the recount, and past the undo history's grouping delay
    })
    expect(queueAll()?.getAttribute('aria-label')).toBe('Queue all 2 open tasks in this section')
    const before = saved()
    act(() => queueAll()!.click())
    const lines = saved().split('\n')
    expect(lines[1]).toMatch(new RegExp(`^- \\[ \\] Open one ${ROBOT}[a-z0-9]{5}:queued$`))
    expect(lines[2]).toBe('  - [ ] Its sub') // goes with its parent
    expect(lines[3]).toBe(`- [ ] Failed ${ROBOT}cccc3:failed`) // a task with a state is left alone
    expect(lines[4]).toMatch(new RegExp(`^- \\[ \\] Open two ${ROBOT}[a-z0-9]{5}:queued$`))
    expect(lines[1].slice(-12)).not.toBe(lines[4].slice(-12)) // two different ids
    act(() => { vi.advanceTimersByTime(200) })
    expect(counts()).toEqual(['3 queued'])
    expect(queueAll()).toBeNull() // nothing open is left
    act(() => { editor.commands.undo() })
    expect(saved()).toBe(before) // one undo takes them all back
  })
})

describe('AgentSelectionButton', () => {
  const pill = () => document.querySelector<HTMLElement>('.agent-select')
  const button = () => pill()?.querySelector<HTMLButtonElement>('.agent-select-btn') ?? null

  function mount(md: string) {
    makeEditor(md)
    render(createElement(AgentSelectionButton, { editor }))
    act(() => { editor.view.focus() })
  }
  /** Selects and waits for the pill's delay. */
  function selectAndSettle(a: string, b: string = a) {
    act(() => selectText(a, b))
    act(() => { vi.advanceTimersByTime(400) })
  }

  it('shows only for a settled, non-empty text selection — and goes when it collapses', () => {
    mount('Some prose here.\n\n- [ ] A task')
    expect(pill()).toBeNull()
    act(() => selectText('prose'))
    expect(pill()).toBeNull() // not yet: the selection may still be moving
    act(() => { vi.advanceTimersByTime(400) })
    expect(pill()?.getAttribute('role')).toBe('toolbar')
    expect(pill()?.getAttribute('aria-label')).toBe('Send to an agent')
    expect(button()?.textContent).toBe('Copy prompt')
    act(() => { editor.commands.setTextSelection(3) })
    act(() => { vi.advanceTimersByTime(400) })
    expect(pill()).toBeNull()
  })

  it('never while the mouse button is down: it waits for the release', () => {
    mount('Some prose here.')
    act(() => { editor.view.dom.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    act(() => selectText('prose'))
    act(() => { vi.advanceTimersByTime(1000) })
    expect(pill()).toBeNull()
    act(() => { document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })) })
    act(() => { vi.advanceTimersByTime(100) })
    expect(pill()).not.toBeNull()
  })

  it('goes when the note is edited or the editor loses the focus', () => {
    mount('Some prose here.')
    selectAndSettle('prose')
    expect(pill()).not.toBeNull()
    act(() => { editor.commands.insertContent('x') }) // typing replaces the selection
    act(() => { vi.advanceTimersByTime(400) })
    expect(pill()).toBeNull()
    selectAndSettle('Some')
    expect(pill()).not.toBeNull()
    act(() => { (editor.view.dom as HTMLElement).blur() })
    expect(pill()).toBeNull()
  })

  it('nothing in a read-only editor', () => {
    mount('Some prose here.')
    act(() => { editor.setEditable(false) })
    selectAndSettle('prose')
    expect(pill()).toBeNull()
  })

  it('a press on it does not take the focus from the editor', () => {
    mount('Some prose here.')
    selectAndSettle('prose')
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    act(() => { button()!.dispatchEvent(event) })
    expect(event.defaultPrevented).toBe(true)
  })

  it('text only: copies the selection with where it comes from, and does not touch the note', async () => {
    mount('Refactor the **auth** module.\n\n- [ ] A task further down')
    const before = saved()
    selectAndSettle('Refactor', 'module')
    act(() => button()!.click())
    await flush()
    expect(copied).toEqual(['Refactor the **auth** module\n\n(From the note "Website relaunch", section "Backlog", in NoteFlow.)'])
    expect(saved()).toBe(before)
    expect(pill()?.querySelector('[role="status"]')?.textContent).toBe('Prompt copied')
    act(() => { vi.advanceTimersByTime(2500) })
    expect(pill()).toBeNull()
  })

  it('tasks: queues them all in one undoable step, names them in the prompt and sends the rest as context', async () => {
    mount([
      '- [ ] First task',
      `- [ ] Second task ${ROBOT}bbbb2:failed`,
      '',
      'Use the new endpoint.',
      '',
      `- [x] Done already`,
    ].join('\n'))
    const before = saved()
    selectAndSettle('First', 'Done')
    act(() => button()!.click())
    await flush()

    const lines = saved().split('\n')
    const fresh = /^- \[ \] First task \u{1F916}([a-z0-9]{5}):queued$/u.exec(lines[0])?.[1]
    expect(fresh).toBeDefined()
    expect(lines[1]).toBe(`- [ ] Second task ${ROBOT}bbbb2:queued`)
    expect(lines[lines.length - 1]).toBe('- [x] Done already') // a checked task is left as it is

    expect(copied).toHaveLength(1)
    expect(copied[0]).toContain(`noteflow task start ${fresh} bbbb2 --on-finish review`)
    expect(copied[0]).toMatch(/<noteflow-context-([a-z0-9]{6})>\nUse the new endpoint\.\n<\/noteflow-context-\1>$/)
    expect(pill()?.querySelector('[role="status"]')?.textContent).toBe('Prompt copied · 2 tasks')

    // ONE undo takes both tasks back.
    act(() => { editor.commands.undo() })
    expect(saved()).toBe(before)
  })

  it('every task of the selection done or in progress: copied as text, with a warning, note untouched', async () => {
    setBlocks([{ id: 'aaaa1', meta: { state: 'running', lastSignal: FRESH }, body: '' }])
    mount(`- [ ] Working ${ROBOT}aaaa1:running\n- [x] Shipped`)
    const before = saved()
    selectAndSettle('Working', 'Shipped')
    act(() => button()!.click())
    await flush()
    expect(saved()).toBe(before)
    expect(copied[0]).toBe('- [ ] Working\n- [x] Shipped\n\n(From the note "Website relaunch", section "Backlog", in NoteFlow.)')
    expect(pill()?.classList.contains('agent-select--warn')).toBe(true)
    expect(pill()?.querySelector('[role="status"]')?.textContent).toBe('Copied as text: those tasks are done or in progress')
  })

  it('a failure while reading the selection: the error shows, nothing is queued, nothing is copied', async () => {
    mount('- [ ] First task\n- [ ] Second task')
    const before = saved()
    selectAndSettle('First', 'Second')
    // The id of the first task cannot be made: the whole edit is dropped.
    const spy = vi.spyOn(crypto, 'getRandomValues').mockImplementation(() => { throw new Error('no entropy') })
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    act(() => button()!.click())
    await flush()
    spy.mockRestore()
    expect(logged).toHaveBeenCalled()
    logged.mockRestore()
    expect(saved()).toBe(before)
    expect(copied).toEqual([])
    expect(pill()?.classList.contains('agent-select--warn')).toBe(true)
    expect(pill()?.querySelector('[role="status"]')?.textContent).toBe('Could not copy')
  })

  it('a selection that cuts a table in half works: the cells go as context, the task is queued', async () => {
    mount('| Name | Role |\n| --- | --- |\n| Ana | Dev |\n| Luis | Ops |\n\n- [ ] Task after')
    selectAndSettle('Role', 'Task')
    act(() => button()!.click())
    await flush()
    expect(saved()).toMatch(/- \[ \] Task after \u{1F916}[a-z0-9]{5}:queued$/u)
    expect(copied).toHaveLength(1)
    expect(copied[0]).toContain('| Ana | Dev |')
    expect(pill()?.querySelector('[role="status"]')?.textContent).toBe('Prompt copied · 1 task')
  })

  it('a running task that lost its agent is taken: back to the queue', async () => {
    setBlocks([{ id: 'aaaa1', meta: { state: 'running', lastSignal: STALE }, body: '' }])
    mount(`- [ ] Stuck ${ROBOT}aaaa1:running`)
    selectAndSettle('Stuck')
    act(() => button()!.click())
    await flush()
    expect(saved()).toBe(`- [ ] Stuck ${ROBOT}aaaa1:queued`)
    expect(copied[0]).toContain('noteflow task start aaaa1 --on-finish review')
  })
})

describe('agentPromptFor', () => {
  it('names the section the editor shows — or, for an editor that was never told (a sticky), the one that holds the task', async () => {
    const { agentPromptFor } = await import('../../src/components/Editor/useAgentTask')
    useNotesStore.setState({
      notes: [{ ...NOTE, sections: [{ id: 's1', name: 'Main', content: 'x' }, { id: 's2', name: 'Backlog', content: `- [ ] T ${ROBOT}aaaa1:failed` }, { id: 's3', name: 'Later', content: '' }] }],
    })
    makeEditor(`- [ ] T ${ROBOT}aaaa1:failed`)
    setAgentNoteId(editor, 'n1', 's3')
    expect(agentPromptFor(editor, ['aaaa1'])).toContain('Section: "Later"')
    setAgentNoteId(editor, 'n1', null)
    expect(agentPromptFor(editor, ['aaaa1'])).toContain('Section: "Backlog"')
    expect(agentPromptFor(editor, ['zzzz9'])).toContain('Section: "Main"')
    // The "when finished" of the settings travels in the start command.
    expect(agentPromptFor(editor, ['aaaa1'])).toContain('--on-finish review')
  })
})

describe('copyAgentPrompt', () => {
  it('with tasks, the note is written BEFORE the prompt reaches the clipboard: the pending edit is flushed first', async () => {
    makeEditor(`- [ ] T ${ROBOT}aaaa1:queued`)
    const order: string[] = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => { order.push('copied') } },
    })
    // What Editor.tsx holds for a change of the last 400 ms.
    const save = createDebouncedSave()
    save.schedule('n1', 400, () => { order.push('saved') })
    let ok = false
    await act(async () => { ok = await copyAgentPrompt(editor, ['aaaa1']) })
    expect(ok).toBe(true)
    expect(order).toEqual(['saved', 'copied'])
  })

  it('a text-only prompt changes nothing in the note: it does not wait for (nor flush) anything', async () => {
    makeEditor('Some prose')
    const save = createDebouncedSave()
    let flushed = false
    save.schedule('n1', 400, () => { flushed = true })
    await act(async () => { await copyAgentPrompt(editor, [], 'Some prose') })
    expect(copied).toHaveLength(1)
    expect(flushed).toBe(false)
    save.cancel()
  })
})

describe('useAgentSendAllowed (hand a task over / copy its prompt from a task)', () => {
  function Probe({ of }: { of: Editor }) {
    return createElement('span', { className: 'probe' }, String(useAgentSendAllowed(of)))
  }
  const allowed = () => host!.querySelector('.probe')?.textContent

  it('the feature on, in a regular note: yes', () => {
    makeEditor('- [ ] T')
    render(createElement(Probe, { of: editor }))
    expect(allowed()).toBe('true')
  })

  it('never in an encrypted note, even unlocked — an agent could not start the task — and it follows the note', () => {
    makeEditor('- [ ] T')
    render(createElement(Probe, { of: editor }))
    // The editor resolves its note once and tells its tasks (Editor.tsx → setAgentNoteId).
    act(() => setAgentNoteId(editor, 'n1', 's2', true))
    expect(allowed()).toBe('false')
    act(() => setAgentNoteId(editor, 'n1', 's2', false))
    expect(allowed()).toBe('true')
  })

  it('a task does not look the note up itself: a change of the notes store alone does not re-render it', () => {
    makeEditor('- [ ] T')
    let renders = 0
    function Counting({ of }: { of: Editor }) {
      renders++
      return createElement('span', { className: 'probe' }, String(useAgentSendAllowed(of)))
    }
    render(createElement(Counting, { of: editor }))
    const before = renders
    act(() => useNotesStore.setState({ notes: [{ ...NOTE, title: 'Renamed' }, { ...NOTE, id: 'n2' }] }))
    expect(renders).toBe(before)
  })

  it('the lookup of the note happens once per editor (useAgentNoteEncrypted) — with the feature off too: its marked tasks still show', async () => {
    const { useAgentNoteEncrypted } = await import('../../src/components/Editor/useAgentTask')
    function Probe2({ id }: { id: string }) {
      return createElement('span', { className: 'probe' }, String(useAgentNoteEncrypted(id, false)))
    }
    useNotesStore.setState({ notes: [{ ...NOTE, encryption: { salt: 's', iv: 'i' } } as Note] })
    render(createElement(Probe2, { id: 'n1' }))
    expect(allowed()).toBe('true')
    act(() => useNotesStore.setState({ notes: [NOTE] }))
    expect(allowed()).toBe('false')
    act(() => {
      useAgentTasksStore.setState({ settings: { ...useAgentTasksStore.getState().settings, enabled: false } })
      useNotesStore.setState({ notes: [{ ...NOTE, encryption: { salt: 's', iv: 'i' } } as Note] })
    })
    expect(allowed()).toBe('true')
  })

  it('useAgentEditorEncrypted follows the note of the editor (an encrypted note shows the states of its tasks as written)', async () => {
    const { useAgentEditorEncrypted } = await import('../../src/components/Editor/useAgentTask')
    makeEditor('- [ ] T')
    function Probe3({ of }: { of: Editor }) {
      return createElement('span', { className: 'probe' }, String(useAgentEditorEncrypted(of)))
    }
    useAgentTasksStore.setState({ settings: { ...useAgentTasksStore.getState().settings, enabled: false } })
    render(createElement(Probe3, { of: editor }))
    expect(allowed()).toBe('false')
    act(() => setAgentNoteId(editor, 'n1', 's2', true))
    expect(allowed()).toBe('true')
  })

  it('the rule of the box follows the state shown: in an encrypted note, the line (never "no signal" from the reports of other notes)', () => {
    makeEditor('- [ ] T')
    // Reports of OTHER notes loaded: a running task with no block counts as silent (no signal) and ticking closes it.
    useAgentTasksStore.setState({ byDir: { other: [] }, byId: {}, pendingLoads: 0 })
    const rule = agentCheckRuleOf(editor)
    expect(rule('zzzz9', 'running')).toBe('done')
    // Encrypted: no report can be there; the state on the line rules, as its chip and box show it.
    setAgentNoteId(editor, 'n1', 's2', true)
    expect(rule('zzzz9', 'running')).toBe('blocked')
    expect(rule('zzzz9', 'review')).toBe('done')
    expect(rule('zzzz9', 'queued')).toBe('unqueue')
  })

  it('the feature off: no', () => {
    useAgentTasksStore.setState({ settings: { ...useAgentTasksStore.getState().settings, enabled: false } })
    makeEditor('- [ ] T')
    render(createElement(Probe, { of: editor }))
    expect(allowed()).toBe('false')
  })
})
