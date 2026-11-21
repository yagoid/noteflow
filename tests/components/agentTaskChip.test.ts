// @vitest-environment happy-dom
// The agent state of a task — its text chip, or its own box for running /
// done — and the report menu it opens (AgentTaskChip.tsx,
// AgentReportPopover.tsx): what shows for each state, what a click does, and
// the menu's actions — discard asks first while an agent may still be at work.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createElement, act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { AgentTaskBox, AgentTaskTrigger } from '../../src/components/Editor/AgentTaskChip'
import { AgentReportPopover } from '../../src/components/Editor/AgentReportPopover'
import { resetAgentTasksStoreForTests, useAgentTasksStore } from '../../src/stores/agentTasksStore'
import type { AgentBlock } from '../../src/types'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const NOW = Date.parse('2026-11-20T12:00:00.000Z')
const FRESH = new Date(NOW - 60_000).toISOString()
const STALE = new Date(NOW - 5 * 60 * 60_000).toISOString()

let root: Root | null = null
let host: HTMLElement | null = null

function setBlocks(blocks: AgentBlock[]) {
  useAgentTasksStore.setState({
    byDir: { note: blocks },
    byId: Object.fromEntries(blocks.map((b) => [b.id, b])),
    pendingLoads: 0,
    now: NOW,
  })
}

function render(element: ReturnType<typeof createElement>) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(element))
}

beforeEach(() => {
  resetAgentTasksStoreForTests()
  ;(window as unknown as { noteflow: unknown }).noteflow = { openUrl: vi.fn() }
})

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  resetAgentTasksStoreForTests()
})

type TriggerProps = ComponentProps<typeof AgentTaskTrigger>

function mountTrigger(props: Partial<TriggerProps>) {
  const onAction = vi.fn()
  render(createElement(AgentTaskTrigger, {
    agentId: null, agentState: null, canQueue: true, editable: true, open: false, className: 'task-meta-trigger', onAction, ...props,
  }))
  return { button: host!.querySelector('button'), onAction }
}

describe('AgentTaskTrigger', () => {
  it('without a marker: nothing with the feature off, a hover-only icon with it on', () => {
    expect(mountTrigger({ canQueue: false }).button).toBeNull()
    act(() => root?.unmount())
    const { button, onAction } = mountTrigger({ canQueue: true })
    expect(button?.classList.contains('has-value')).toBe(false)
    expect(button?.querySelector('.agent-chip')).toBeNull()
    expect(button?.getAttribute('aria-haspopup')).toBeNull()
    act(() => button?.click())
    expect(onAction).toHaveBeenCalledWith('queue', button)
  })

  it('a marked task shows its chip even with the feature off', () => {
    const { button, onAction } = mountTrigger({ agentId: 'aaaa1', agentState: 'review', canQueue: false })
    expect(button?.classList.contains('has-value')).toBe(true)
    expect(button?.querySelector('.agent-chip.agent-tone--review')?.textContent).toBe('To review')
    expect(button?.getAttribute('aria-haspopup')).toBe('dialog')
    act(() => button?.click())
    expect(onAction).toHaveBeenCalledWith('report', button)
  })

  it('queued: a click takes the task back — unless the note is read-only', () => {
    const { button, onAction } = mountTrigger({ agentId: 'aaaa1', agentState: 'queued' })
    expect(button?.querySelector('.agent-chip.agent-tone--queued')?.textContent).toBe('Queued')
    act(() => button?.click())
    expect(onAction).toHaveBeenCalledWith('unqueue', button)
    act(() => root?.unmount())
    expect(mountTrigger({ agentId: 'aaaa1', agentState: 'queued', editable: false }).button?.disabled).toBe(true)
  })

  it('running (unticked) and done (ticked) are drawn in the box: no chip — any other mix keeps it', () => {
    setBlocks([{ id: 'aaaa1', meta: { state: 'running', lastSignal: FRESH }, body: '' }])
    expect(mountTrigger({ agentId: 'aaaa1', agentState: 'running' }).button).toBeNull()
    act(() => root?.unmount())
    expect(mountTrigger({ agentId: 'aaaa1', agentState: 'done', checked: true }).button).toBeNull()
    act(() => root?.unmount())
    expect(mountTrigger({ agentId: 'aaaa1', agentState: 'done', checked: false }).button?.querySelector('.agent-chip.agent-tone--done')?.textContent).toBe('Done')
    act(() => root?.unmount())
    expect(mountTrigger({ agentId: 'aaaa1', agentState: 'running', checked: true }).button?.querySelector('.agent-chip.agent-tone--running')).not.toBeNull()
  })

  it('running turns into a "no signal" chip when its block has been silent for too long', () => {
    setBlocks([{ id: 'aaaa1', meta: { state: 'running', lastSignal: FRESH }, body: '' }])
    mountTrigger({ agentId: 'aaaa1', agentState: 'running' })
    expect(host!.querySelector('button')).toBeNull() // in the box
    act(() => setBlocks([{ id: 'aaaa1', meta: { state: 'running', lastSignal: STALE }, body: '' }]))
    expect(host!.querySelector('.agent-chip.agent-tone--no-signal')?.textContent).toBe('No signal')
  })

  it('a running task without a block is not "lost" until the reports have loaded', () => {
    mountTrigger({ agentId: 'aaaa1', agentState: 'running' })
    expect(host!.querySelector('button')).toBeNull() // nothing loaded yet: running, in the box
    act(() => setBlocks([]))
    expect(host!.querySelector('.agent-chip.agent-tone--no-signal')).not.toBeNull()
  })

  it('a state this version does not know shows as written', () => {
    const { button } = mountTrigger({ agentId: 'aaaa1', agentState: 'paused-by-app' })
    expect(button?.querySelector('.agent-chip.agent-tone--unknown')?.textContent).toBe('paused-by-app')
  })

  it('the press that closes the open report does not reopen it', () => {
    const { button, onAction } = mountTrigger({ agentId: 'aaaa1', agentState: 'done', open: true })
    act(() => {
      button?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      button?.click()
    })
    expect(onAction).not.toHaveBeenCalled()
  })
})

describe('AgentTaskBox', () => {
  function mountBox(props: Partial<ComponentProps<typeof AgentTaskBox>>) {
    const onOpenReport = vi.fn()
    const onToggle = vi.fn()
    render(createElement(AgentTaskBox, {
      agentId: 'aaaa1', agentState: 'running', checked: false, open: false, className: 'task-checkbox-label', onOpenReport, ...props,
    }, createElement('input', { type: 'checkbox', className: 'plain-box', onChange: onToggle })))
    return { onOpenReport, onToggle, box: host!.querySelector<HTMLButtonElement>('button.agent-box') }
  }

  it('running: the box is drawn running; a click opens the report and never ticks the task', () => {
    setBlocks([{ id: 'aaaa1', meta: { state: 'running', lastSignal: FRESH }, body: '' }])
    const { box, onOpenReport, onToggle } = mountBox({})
    expect(box?.classList.contains('agent-box--running')).toBe(true)
    expect(box?.getAttribute('aria-label')).toBe('Agent task: Running. Open the report')
    expect(box?.getAttribute('data-agent-anchor')).toBe('start') // the report lines up with the box
    expect(host!.querySelector('.plain-box')).toBeNull()
    act(() => box?.click())
    expect(onOpenReport).toHaveBeenCalledWith(box)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('done and ticked: the tick with a spark; done unticked, or any other state: the plain box', () => {
    expect(mountBox({ agentState: 'done', checked: true }).box?.classList.contains('agent-box--done')).toBe(true)
    act(() => root?.unmount())
    expect(mountBox({ agentState: 'done', checked: false }).box).toBeNull()
    expect(host!.querySelector('.plain-box')).not.toBeNull()
    act(() => root?.unmount())
    expect(mountBox({ agentState: 'review' }).box).toBeNull()
  })

  it('running that lost its agent goes back to the plain box (and the "no signal" chip)', () => {
    setBlocks([{ id: 'aaaa1', meta: { state: 'running', lastSignal: STALE }, body: '' }])
    expect(mountBox({}).box).toBeNull()
  })

  it('the press that closes the open report does not reopen it', () => {
    setBlocks([{ id: 'aaaa1', meta: { state: 'running', lastSignal: FRESH }, body: '' }])
    const { box, onOpenReport } = mountBox({ open: true })
    act(() => {
      box?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      box?.click()
    })
    expect(onOpenReport).not.toHaveBeenCalled()
  })
})

type ReportProps = ComponentProps<typeof AgentReportPopover>

function mountReport(props: Partial<ReportProps>) {
  const handlers = { onMarkDone: vi.fn(), onRequeue: vi.fn(), onDismiss: vi.fn(), onClose: vi.fn() }
  const trigger = document.createElement('button')
  document.body.appendChild(trigger)
  render(createElement(AgentReportPopover, {
    trigger, agentId: 'aaaa1', agentState: 'review', title: 'Fix the login', checked: false, editable: true, ...handlers, ...props,
  }))
  const menu = document.querySelector<HTMLElement>('.agent-report')!
  const press = (label: string) => {
    const button = Array.from(menu.querySelectorAll('button')).find((b) => b.textContent === label)
    if (!button) throw new Error(`no "${label}" button in: ${Array.from(menu.querySelectorAll('button')).map((b) => b.textContent).join(' | ')}`)
    act(() => button.click())
  }
  const labels = () => Array.from(menu.querySelectorAll('.agent-report-foot button')).map((b) => b.textContent)
  return { menu, press, labels, trigger, ...handlers }
}

describe('AgentReportPopover', () => {
  afterEach(() => document.querySelectorAll('body > button').forEach((b) => b.remove()))

  it('shows the state, who / where / how long, the task, the timeline and the report as rendered markdown', () => {
    setBlocks([{
      id: 'aaaa1',
      meta: { state: 'review', machine: 'laptop', agent: 'claude-code', startedAt: '2026-11-20T10:00:00.000Z', finishedAt: '2026-11-20T11:30:00.000Z', gitBranch: 'fix/login', gitCommits: '2', gitFilesChanged: '5' },
      body: '## Summary\n\nFixed **it**.\n\n- [x] tests pass',
    }])
    const { menu, labels } = mountReport({})
    expect(menu.getAttribute('role')).toBe('dialog')
    expect(menu.querySelector('.agent-report-title')?.textContent).toBe('Fix the login')
    expect(menu.classList.contains('agent-tone--review')).toBe(true)
    expect(menu.querySelector('.agent-report-head .agent-report-state')?.textContent).toBe('To review')
    expect(menu.querySelector('.agent-report-sub')?.textContent).toBe('claude-code · laptop · 1h 30m')
    const events = Array.from(menu.querySelectorAll('.agent-report-ev')).map((e) => [e.querySelector('time')?.getAttribute('dateTime'), e.querySelector('p')?.textContent, e.classList.contains('is-now')])
    expect(events).toEqual([
      ['2026-11-20T10:00:00.000Z', 'Started · fix/login', false],
      ['2026-11-20T11:30:00.000Z', 'Finished · 2 commits · 5 files', true],
    ])
    expect(menu.querySelector('.agent-report-strip')).toBeNull() // every fact is in an event
    expect(menu.querySelector('.agent-report-body h2')?.textContent).toBe('Summary')
    expect(menu.querySelector('.agent-report-body strong')?.textContent).toBe('it')
    expect(menu.querySelector('.agent-report-empty')).toBeNull()
    expect(labels()).toEqual(['Copy id', 'Discard', 'Back to the queue', 'Mark as done'])
    expect(menu.querySelector('.agent-report-btn--primary')?.textContent).toBe('Mark as done')
  })

  it('a waiting task shows the question and where to answer it', () => {
    setBlocks([{ id: 'aaaa1', meta: { state: 'waiting', lastSignal: FRESH, question: 'Which branch?', progress: 'Reading the code' }, body: '' }])
    const { menu } = mountReport({ agentState: 'waiting' })
    expect(menu.querySelector('.agent-report-ev--question.is-now .agent-report-ask')?.textContent).toBe('Which branch?')
    expect(menu.querySelector('.agent-report-ev--question .agent-report-hint')?.textContent).toBe('Reply in its terminal.')
    expect(menu.querySelector('.agent-report-ev--progress p')?.textContent).toBe('Reading the code')
    expect(menu.querySelector('.agent-report-ev--progress time')).toBeNull() // no hour is made up
    expect(menu.querySelector('.agent-report-empty')?.textContent).toContain('No report yet')
  })

  it('a failed task shows why, and stresses going back to the queue', () => {
    setBlocks([{ id: 'aaaa1', meta: { state: 'failed', failReason: 'Tests red' }, body: '' }])
    const { menu } = mountReport({ agentState: 'failed' })
    expect(menu.querySelector('.agent-report-ev--failed.is-now .agent-report-bad')?.textContent).toBe('Tests red')
    expect(menu.querySelector('.agent-report-btn--primary')?.textContent).toBe('Back to the queue')
    expect(menu.querySelector('.agent-report-empty')?.textContent).toContain('left no report')
  })

  it('says so when the report has not reached this device', () => {
    setBlocks([])
    const { menu } = mountReport({ agentState: 'done', title: '' })
    expect(menu.querySelector('.agent-report-empty')?.textContent).toContain('not on this device yet')
    expect(menu.querySelector('.agent-report-title')?.textContent).toBe('Untitled task')
    expect(menu.querySelector('.agent-report-thread')).toBeNull()
    expect(menu.querySelector('.agent-report-sub')).toBeNull()
  })

  it('actions run and close the menu', () => {
    setBlocks([{ id: 'aaaa1', meta: { state: 'review' }, body: 'done' }])
    const a = mountReport({})
    a.press('Mark as done')
    expect(a.onMarkDone).toHaveBeenCalledTimes(1)
    expect(a.onClose).toHaveBeenCalledWith(true)
    act(() => root?.unmount())
    const b = mountReport({})
    b.press('Back to the queue')
    expect(b.onRequeue).toHaveBeenCalledTimes(1)
    act(() => root?.unmount())
    const c = mountReport({})
    c.press('Discard') // the agent is through: no question asked
    expect(c.onDismiss).toHaveBeenCalledTimes(1)
    expect(c.onClose).toHaveBeenCalledWith(true)
  })

  it('discarding a task an agent may still be working on asks first, in the menu itself', () => {
    setBlocks([{ id: 'aaaa1', meta: { state: 'running', lastSignal: FRESH }, body: '' }])
    const { menu, press, labels, onDismiss, onClose } = mountReport({ agentState: 'running' })
    press('Discard')
    expect(onDismiss).not.toHaveBeenCalled()
    expect(menu.querySelector('[role="alert"]')?.textContent).toContain('may still be working')
    expect(labels()).toEqual(['Cancel', 'Discard'])
    expect(document.activeElement?.textContent).toBe('Cancel')
    press('Cancel')
    expect(labels()).toEqual(['Copy id', 'Discard', 'Mark as done'])
    press('Discard')
    press('Discard')
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledWith(true)
  })

  it('"Copy prompt" shows where the task can be sent, runs without closing the menu and says it copied', async () => {
    setBlocks([{ id: 'aaaa1', meta: { state: 'failed', failReason: 'Tests red' }, body: '' }])
    const onCopyPrompt = vi.fn(() => Promise.resolve(true))
    const { menu, press, labels, onClose, onRequeue } = mountReport({ agentState: 'failed', onCopyPrompt })
    // Copy id and Discard as icons on the left; "Back to the queue" (what failed waits for) solid, "Copy prompt" next to it,
    // "Mark as done" folded into its icon. Icons keep their names for screen readers.
    expect(labels()).toEqual(['Copy id', 'Discard', 'Mark as done', 'Copy prompt', 'Back to the queue'])
    expect(menu.querySelectorAll('.agent-report-btn--quiet')).toHaveLength(2)
    expect(menu.querySelectorAll('.agent-report-btn--icon')).toHaveLength(1)
    press('Copy prompt')
    await act(async () => { await Promise.resolve() })
    expect(onCopyPrompt).toHaveBeenCalledTimes(1)
    expect(onRequeue).not.toHaveBeenCalled() // the caller's onCopyPrompt requeues: the menu does not do it twice
    expect(onClose).not.toHaveBeenCalled()
    expect(labels()).toContain('Prompt copied')
  })

  it('"Copy prompt" on a task that is not queued says it also puts it back in the queue', () => {
    const onCopyPrompt = () => Promise.resolve(true)
    const hint = (menu: HTMLElement) =>
      Array.from(menu.querySelectorAll('button')).find((b) => b.textContent === 'Copy prompt')?.getAttribute('title')
    for (const agentState of ['review', 'failed', 'interrupted', 'done']) {
      setBlocks([{ id: 'aaaa1', meta: { state: agentState }, body: '' }])
      expect(hint(mountReport({ agentState, onCopyPrompt }).menu), agentState).toContain('Puts the task back in the queue and copies its prompt')
      act(() => root?.unmount())
    }
    // No signal: running on the line, lost for the app.
    setBlocks([{ id: 'aaaa1', meta: { state: 'running', lastSignal: STALE }, body: '' }])
    expect(hint(mountReport({ agentState: 'running', onCopyPrompt }).menu)).toContain('Puts the task back in the queue and copies its prompt')
    act(() => root?.unmount())
    // Already queued (right after a copy): nothing changes, nothing to warn about.
    setBlocks([{ id: 'aaaa1', meta: { state: 'queued' }, body: '' }])
    expect(hint(mountReport({ agentState: 'queued', onCopyPrompt }).menu)).toBeNull()
  })

  it('"Copy prompt" says so when the clipboard refuses', async () => {
    setBlocks([{ id: 'aaaa1', meta: { state: 'review' }, body: 'done' }])
    const { press, labels } = mountReport({ onCopyPrompt: () => Promise.resolve(false) })
    press('Copy prompt')
    await act(async () => { await Promise.resolve() })
    expect(labels()).toContain('Could not copy')
  })

  it('no "Copy prompt" for a task in progress, a checked one, a read-only note or a caller that cannot send', () => {
    const onCopyPrompt = () => Promise.resolve(true)
    setBlocks([{ id: 'aaaa1', meta: { state: 'running', lastSignal: FRESH }, body: '' }])
    expect(mountReport({ agentState: 'running', onCopyPrompt }).labels()).not.toContain('Copy prompt')
    act(() => root?.unmount())
    expect(mountReport({ agentState: 'review', checked: true, onCopyPrompt }).labels()).not.toContain('Copy prompt')
    act(() => root?.unmount())
    expect(mountReport({ agentState: 'review', editable: false, onCopyPrompt }).labels()).toEqual(['Copy id'])
    act(() => root?.unmount())
    expect(mountReport({ agentState: 'review' }).labels()).not.toContain('Copy prompt')
  })

  it('a running task that lost its agent can be sent again', () => {
    setBlocks([{ id: 'aaaa1', meta: { state: 'running', lastSignal: STALE }, body: '' }])
    expect(mountReport({ agentState: 'running', onCopyPrompt: () => Promise.resolve(true) }).labels()).toContain('Copy prompt')
  })

  it('a done task with its box ticked (the box opens this report) is unticked here: "Reopen"', () => {
    setBlocks([{ id: 'aaaa1', meta: { state: 'done' }, body: 'done' }])
    const onReopen = vi.fn()
    const { press, labels, onClose } = mountReport({ agentState: 'done', checked: true, onReopen })
    expect(labels()).toEqual(['Copy id', 'Discard', 'Reopen'])
    press('Reopen')
    expect(onReopen).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledWith(true)
    act(() => root?.unmount())
    // Without a caller that can untick it, not offered.
    expect(mountReport({ agentState: 'done', checked: true }).labels()).toEqual(['Copy id', 'Discard'])
  })

  it('a read-only note can only copy the id', () => {
    setBlocks([{ id: 'aaaa1', meta: { state: 'review' }, body: 'done' }])
    expect(mountReport({ editable: false }).labels()).toEqual(['Copy id'])
  })

  it('closes on Escape and on a press outside, not on a press inside', () => {
    setBlocks([{ id: 'aaaa1', meta: { state: 'review' }, body: 'done' }])
    const { menu, onClose } = mountReport({})
    act(() => { menu.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    expect(onClose).not.toHaveBeenCalled()
    act(() => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    expect(onClose).toHaveBeenLastCalledWith(false)
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(onClose).toHaveBeenLastCalledWith(true)
  })

  it('links of the report open in the browser', () => {
    setBlocks([{ id: 'aaaa1', meta: { state: 'done' }, body: 'See [the PR](https://example.com/pr/1).' }])
    const { menu } = mountReport({ agentState: 'done' })
    const link = menu.querySelector<HTMLAnchorElement>('.agent-report-body a')!
    act(() => link.click())
    expect((window.noteflow.openUrl as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('https://example.com/pr/1')
  })
})
