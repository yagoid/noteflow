// @vitest-environment happy-dom
// The agent chip of a task and the report menu it opens (AgentTaskChip.tsx,
// AgentReportPopover.tsx): what shows for each state, what a click does, and
// the menu's actions — discard asks first while an agent may still be at work.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createElement, act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { AgentTaskTrigger } from '../../src/components/Editor/AgentTaskChip'
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
    expect(button?.querySelector('.agent-chip--review')?.textContent).toBe('To review')
    expect(button?.getAttribute('aria-haspopup')).toBe('dialog')
    act(() => button?.click())
    expect(onAction).toHaveBeenCalledWith('report', button)
  })

  it('queued: a click takes the task back — unless the note is read-only', () => {
    const { button, onAction } = mountTrigger({ agentId: 'aaaa1', agentState: 'queued' })
    expect(button?.querySelector('.agent-chip--queued')?.textContent).toBe('Queued')
    act(() => button?.click())
    expect(onAction).toHaveBeenCalledWith('unqueue', button)
    act(() => root?.unmount())
    expect(mountTrigger({ agentId: 'aaaa1', agentState: 'queued', editable: false }).button?.disabled).toBe(true)
  })

  it('running turns into "no signal" when its block has been silent for too long', () => {
    setBlocks([{ id: 'aaaa1', meta: { state: 'running', lastSignal: FRESH }, body: '' }])
    const fresh = mountTrigger({ agentId: 'aaaa1', agentState: 'running' })
    expect(fresh.button?.querySelector('.agent-chip--running .agent-chip-live')).not.toBeNull()
    act(() => setBlocks([{ id: 'aaaa1', meta: { state: 'running', lastSignal: STALE }, body: '' }]))
    expect(fresh.button?.querySelector('.agent-chip--no-signal')?.textContent).toBe('No signal')
  })

  it('a running task without a block is not "lost" until the reports have loaded', () => {
    const { button } = mountTrigger({ agentId: 'aaaa1', agentState: 'running' })
    expect(button?.querySelector('.agent-chip--running')).not.toBeNull() // nothing loaded yet
    act(() => setBlocks([]))
    expect(button?.querySelector('.agent-chip--no-signal')).not.toBeNull()
  })

  it('a state this version does not know shows as written', () => {
    const { button } = mountTrigger({ agentId: 'aaaa1', agentState: 'paused-by-app' })
    expect(button?.querySelector('.agent-chip--unknown')?.textContent).toBe('paused-by-app')
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

  it('shows the task, its state, the facts and the report as rendered markdown', () => {
    setBlocks([{
      id: 'aaaa1',
      meta: { state: 'review', machine: 'laptop', agent: 'claude-code', startedAt: '2026-11-20T10:00:00.000Z', finishedAt: '2026-11-20T11:30:00.000Z', gitBranch: 'fix/login', gitCommits: '2', gitFilesChanged: '5' },
      body: '## Summary\n\nFixed **it**.\n\n- [x] tests pass',
    }])
    const { menu, labels } = mountReport({})
    expect(menu.getAttribute('role')).toBe('dialog')
    expect(menu.querySelector('.agent-report-title')?.textContent).toBe('Fix the login')
    expect(menu.querySelector('.agent-report-head .agent-chip--review')).not.toBeNull()
    const facts = Object.fromEntries(Array.from(menu.querySelectorAll('.agent-report-fact')).map((f) => [f.querySelector('dt')?.textContent, f.querySelector('dd')?.textContent]))
    expect(facts).toMatchObject({ Machine: 'laptop', Agent: 'claude-code', Duration: '1h 30m', Branch: 'fix/login', Commits: '2', 'Files changed': '5' })
    expect(menu.querySelector('.agent-report-body h2')?.textContent).toBe('Summary')
    expect(menu.querySelector('.agent-report-body strong')?.textContent).toBe('it')
    expect(menu.querySelector('.agent-report-empty')).toBeNull()
    expect(labels()).toEqual(['Discard', 'Copy id', 'Mark as done', 'Back to the queue'])
    expect(menu.querySelector('.agent-report-btn--primary')?.textContent).toBe('Mark as done')
  })

  it('a waiting task shows the question and where to answer it', () => {
    setBlocks([{ id: 'aaaa1', meta: { state: 'waiting', lastSignal: FRESH, question: 'Which branch?', progress: 'Reading the code' }, body: '' }])
    const { menu } = mountReport({ agentState: 'waiting' })
    expect(menu.querySelector('.agent-report-note--question .agent-report-note-text')?.textContent).toBe('Which branch?')
    expect(menu.querySelector('.agent-report-note--question .agent-report-note-hint')?.textContent).toContain('terminal')
    expect(menu.querySelector('.agent-report-note--progress .agent-report-note-text')?.textContent).toBe('Reading the code')
    expect(menu.querySelector('.agent-report-empty')?.textContent).toContain('No report yet')
  })

  it('a failed task shows why, and stresses going back to the queue', () => {
    setBlocks([{ id: 'aaaa1', meta: { state: 'failed', failReason: 'Tests red' }, body: '' }])
    const { menu } = mountReport({ agentState: 'failed' })
    expect(menu.querySelector('.agent-report-note--failed .agent-report-note-text')?.textContent).toBe('Tests red')
    expect(menu.querySelector('.agent-report-btn--primary')?.textContent).toBe('Back to the queue')
    expect(menu.querySelector('.agent-report-empty')?.textContent).toContain('left no report')
  })

  it('says so when the report has not reached this device', () => {
    setBlocks([])
    const { menu } = mountReport({ agentState: 'done', title: '' })
    expect(menu.querySelector('.agent-report-empty')?.textContent).toContain('not on this device yet')
    expect(menu.querySelector('.agent-report-title')?.textContent).toBe('Untitled task')
    expect(menu.querySelector('.agent-report-facts')).toBeNull()
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
    expect(labels()).toEqual(['Discard', 'Copy id', 'Mark as done'])
    press('Discard')
    press('Discard')
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledWith(true)
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
