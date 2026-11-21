// @vitest-environment happy-dom
// "Run" in its three places — the queue bar, the pill over a selection and the
// report menu — on a real editor, with main mocked (window.noteflow): what is
// asked of main, in which order, and what the user is told. Nothing is launched.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Editor } from '@tiptap/core'
import History from '@tiptap/extension-history'
import { TextSelection } from '@tiptap/pm/state'
import { AgentQueueBar } from '../../src/components/Editor/AgentQueueBar'
import { AgentReportPopover } from '../../src/components/Editor/AgentReportPopover'
import { AgentSelectionButton } from '../../src/components/Editor/AgentSelectionButton'
import { schemaExtensions } from '../../src/components/Editor/editorExtensions'
import { agentRunFeedback, prepareAgentRun, runAgentTasks, setAgentNoteId } from '../../src/components/Editor/useAgentTask'
import { createDebouncedSave } from '../../src/lib/pendingEdits'
import { htmlFromMarkdown, htmlToMarkdown } from '../../src/lib/markdownHtml'
import { getMessages } from '../../src/i18n'
import { resetAgentTasksStoreForTests, useAgentTasksStore } from '../../src/stores/agentTasksStore'
import { useNotesStore } from '../../src/stores/notesStore'
import type { AgentAppResult, AgentPreflightResult, AgentTaskSettings, AgentTerminalResult, Note } from '../../src/types'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ROBOT = '\u{1F916}'
const FOLDER = 'C:\\Users\\Ana\\Documents\\projects\\clients\\acme\\website-relaunch'
const NOTE: Note = {
  id: 'n1', title: 'Website relaunch', tags: [], created: '', updated: '', archived: false, favorited: false,
  sections: [{ id: 's1', name: 'Main', content: '' }, { id: 's2', name: 'Backlog', content: '' }],
  raw: '', filePath: 'C:\\notes\\website-n1',
}

let root: Root | null = null
let host: HTMLElement | null = null
let editorHost: HTMLElement | null = null
let editor: Editor
/** What main was asked, in order. */
let calls: Array<[string, unknown]>
let folder: { folder: string | null; exists: boolean }
let preflight: () => Promise<AgentPreflightResult>
let terminal: (request: unknown) => Promise<AgentTerminalResult>
let openApp: (request: unknown) => Promise<AgentAppResult>

function settings(patch: Partial<AgentTaskSettings>) {
  useAgentTasksStore.setState({ settings: { ...useAgentTasksStore.getState().settings, ...patch } })
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
const flush = () => act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve() })

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
  localStorage.clear()
  calls = []
  folder = { folder: FOLDER, exists: true }
  // Main's preflight: the folder (its dialog cancelled when there is none here), then everything else passes.
  preflight = async () => (folder.folder && folder.exists ? { ok: true, folder: folder.folder } : { ok: false, code: 'canceled' })
  terminal = async () => ({ ok: true })
  openApp = async () => ({ ok: true, app: 'claude-desktop', promptCopied: false })
  ;(window as unknown as { noteflow: unknown }).noteflow = {
    agentTasksReconcile: async (_dir: string, id: string) => { calls.push(['reconcile', id]); return { ok: true } },
    agentRunGetFolder: async (noteId: string) => { calls.push(['get-folder', noteId]); return folder },
    agentRunPreflight: async (noteId: string) => { calls.push(['preflight', noteId]); return preflight() },
    agentRunPickFolder: async (noteId: string) => { calls.push(['pick-folder', noteId]); folder = { folder: 'D:\\other', exists: true }; return { folder: 'D:\\other' } },
    agentRunClearFolder: async (noteId: string) => { calls.push(['clear-folder', noteId]); folder = { folder: null, exists: false } },
    agentRunTerminal: async (request: unknown) => { calls.push(['terminal', request]); return terminal(request) },
    agentRunOpenApp: async (request: unknown) => { calls.push(['open-app', request]); return openApp(request) },
  }
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { calls.push(['clipboard', text]) } } })
  useNotesStore.setState({ notes: [NOTE] })
  useAgentTasksStore.setState({ runTerminal: true })
  settings({ enabled: true, onFinish: 'review' })
})

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  editor?.destroy()
  editorHost?.remove()
  document.querySelectorAll('.agent-select, .agent-queue-pop, .agent-report').forEach((el) => el.remove())
  useNotesStore.setState({ notes: [] })
  resetAgentTasksStoreForTests()
  vi.useRealTimers()
})

const asked = (name: string) => calls.filter(([n]) => n === name).map(([, arg]) => arg)

describe('the queue bar', () => {
  const buttons = () => Array.from(host!.querySelectorAll<HTMLButtonElement>('.agent-queue-full .agent-queue-btn'))
  const runButton = () => host!.querySelector<HTMLButtonElement>('.agent-queue-full .agent-queue-btn--run')
  const note = () => host!.querySelector('.agent-queue-full .agent-run-note')?.textContent ?? null

  it('"Run" sits next to "Copy prompt" as the main action, and says what it opens', () => {
    makeEditor(`- [ ] Two ${ROBOT}bbbb2:queued`)
    render(createElement(AgentQueueBar, { editor }))
    expect(buttons().map((b) => b.textContent)).toEqual(['Copy prompt', 'Run'])
    expect(runButton()?.getAttribute('title')).toBe("Opens a terminal in this note's project folder and runs Claude Code on these tasks")
  })

  it('not offered where a terminal cannot be opened with the CLI (Microsoft Store) — unless a desktop app is chosen', () => {
    useAgentTasksStore.setState({ runTerminal: false })
    makeEditor(`- [ ] Two ${ROBOT}bbbb2:queued`)
    render(createElement(AgentQueueBar, { editor }))
    expect(buttons().map((b) => b.textContent)).toEqual(['Copy prompt'])
    expect(host!.querySelector('.agent-queue-more')).toBeNull() // no Run: no folder either
    act(() => settings({ launch: 'codex-app' }))
    expect(buttons().map((b) => b.textContent)).toEqual(['Copy prompt', 'Run'])
    expect(runButton()?.getAttribute('title')).toContain('Opens Codex')
  })

  it('not offered in a terminal on a computer without Node.js to run the CLI there (Windows) — a desktop app still is', () => {
    useAgentTasksStore.setState({ runTerminal: true, runNode: false })
    makeEditor(`- [ ] Two ${ROBOT}bbbb2:queued`)
    render(createElement(AgentQueueBar, { editor }))
    expect(buttons().map((b) => b.textContent)).toEqual(['Copy prompt'])
    act(() => settings({ launch: 'claude-desktop' }))
    expect(buttons().map((b) => b.textContent)).toEqual(['Copy prompt', 'Run'])
  })

  it('terminal: the folder, then the note written, then main gets the QUEUED ids in order — never a command — and the note is untouched', async () => {
    makeEditor([`- [ ] One ${ROBOT}aaaa1:running`, `- [ ] Two ${ROBOT}bbbb2:queued`, `- [ ] Three ${ROBOT}cccc3:queued`].join('\n'))
    const before = saved()
    const save = createDebouncedSave()
    save.schedule('n1', 400, () => { calls.push(['saved', null]) })
    render(createElement(AgentQueueBar, { editor }))
    act(() => runButton()!.click())
    await flush()
    expect(calls.map(([n]) => n).filter((n) => n !== 'get-folder')).toEqual(['preflight', 'saved', 'terminal'])
    expect(asked('terminal')).toEqual([{ noteId: 'n1', ids: ['bbbb2', 'cccc3'], context: null }])
    expect(saved()).toBe(before)
    expect(runButton()?.textContent).toBe('Opening terminal…')
    expect(note()).toBeNull()
    act(() => { vi.advanceTimersByTime(6000) })
    expect(runButton()?.textContent).toBe('Run')
  })

  it('no folder and the dialog is cancelled: nothing happens at all', async () => {
    folder = { folder: null, exists: false }
    makeEditor(`- [ ] Two ${ROBOT}bbbb2:queued`)
    render(createElement(AgentQueueBar, { editor }))
    act(() => runButton()!.click())
    await flush()
    expect(asked('terminal')).toEqual([])
    expect(runButton()?.textContent).toBe('Run')
    expect(note()).toBeNull()
  })

  it.each([
    ['agent_not_found', { agent: 'claude' }, 'Claude Code was not found on this computer'],
    ['agent_not_found', { agent: 'aider' }, 'aider was not found on this computer'],
    ['agent_invalid', {}, 'The agent command in Settings → AI is not valid'],
    ['no_terminal', {}, 'Could not open a terminal. Use Copy prompt instead'],
    ['node_not_found', {}, 'Run in a terminal needs Node.js 18 or later installed on this computer. Use Copy prompt, or choose a desktop app in Settings → AI'],
    ['task_not_found', {}, 'The task is not saved yet. Try again in a moment'],
    ['something_new', {}, 'Could not run the agent'],
  ])('a run that does not start says why (%s) and leaves "Copy prompt" at hand', async (code, extra, text) => {
    terminal = async () => ({ ok: false, code, ...extra } as AgentTerminalResult)
    makeEditor(`- [ ] Two ${ROBOT}bbbb2:queued`)
    render(createElement(AgentQueueBar, { editor }))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    act(() => runButton()!.click())
    await flush()
    expect(note()).toBe(text)
    expect(host!.querySelector('.agent-run-note')?.getAttribute('role')).toBe('status')
    expect(buttons().map((b) => b.textContent)).toEqual(['Copy prompt', 'Run'])
    vi.restoreAllMocks()
  })

  it('a run the preflight stops (the agent is not installed, the feature is off…) says why and asks main for nothing else', async () => {
    preflight = async () => ({ ok: false, code: 'agent_not_found', agent: 'claude' })
    makeEditor(`- [ ] Two ${ROBOT}bbbb2:queued`)
    render(createElement(AgentQueueBar, { editor }))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    act(() => runButton()!.click())
    await flush()
    expect(note()).toBe('Claude Code was not found on this computer')
    expect(asked('terminal')).toEqual([])
    vi.restoreAllMocks()
  })

  it('a desktop app gets the SAME prompt "Copy prompt" gives; the first time the feedback adds "press Enter there"', async () => {
    settings({ launch: 'claude-desktop' })
    makeEditor(`- [ ] Two ${ROBOT}bbbb2:queued`)
    render(createElement(AgentQueueBar, { editor }))
    act(() => buttons()[0].click())
    await flush()
    const copiedPrompt = asked('clipboard')[0]
    act(() => runButton()!.click())
    await flush()
    expect(asked('open-app')).toEqual([{ noteId: 'n1', prompt: copiedPrompt }])
    expect(copiedPrompt).toContain('noteflow task start bbbb2 --on-finish review')
    expect(runButton()?.textContent).toBe('Opened in Claude Desktop. Press Enter there to start')
    act(() => { vi.advanceTimersByTime(6000) })
    act(() => runButton()!.click())
    await flush()
    expect(runButton()?.textContent).toBe('Opened in Claude Desktop')
  })

  it('a prompt too long for a link: main copied it — the user is told to paste it', async () => {
    settings({ launch: 'codex-app' })
    openApp = async () => ({ ok: true, app: 'codex-app', promptCopied: true })
    makeEditor(`- [ ] Two ${ROBOT}bbbb2:queued`)
    render(createElement(AgentQueueBar, { editor }))
    act(() => runButton()!.click())
    await flush()
    expect(note()).toBe('Prompt copied: paste it in Codex')
  })

  it('the ▾ of Run: the project folder, cut in the middle with the whole path as its tooltip — it can be changed and removed — and Copy prompt', async () => {
    makeEditor(`- [ ] Two ${ROBOT}bbbb2:queued`)
    render(createElement(AgentQueueBar, { editor }))
    await flush()
    const more = host!.querySelector<HTMLButtonElement>('.agent-run-split .agent-queue-more')!
    expect(more.getAttribute('aria-label')).toBe('Project folder and more')
    act(() => more.click())
    await flush()
    const pop = document.querySelector<HTMLElement>('.agent-queue-pop')!
    expect(pop.getAttribute('aria-label')).toBe('Project folder and more')
    expect(pop.querySelector('.agent-queue-counts')).toBeNull() // the folder alone: the bar already shows the rest
    const pathEl = pop.querySelector<HTMLElement>('.agent-folder-path')!
    expect(pathEl.textContent).toBe('C:\\…\\clients\\acme\\website-relaunch')
    expect(pathEl.getAttribute('title')).toBe(FOLDER)
    const press = (label: string) => act(() => Array.from(pop.querySelectorAll('button')).find((b) => (b.getAttribute('aria-label') ?? b.textContent) === label)!.click())
    press('Change')
    await flush()
    expect(pop.querySelector('.agent-folder-path')?.textContent).toBe('D:\\other')
    press('Remove')
    await flush()
    expect(pop.querySelector('.agent-folder-path')?.textContent).toBe('Not chosen yet')
    // (The model row — its own test below — has buttons of its own.)
    expect(Array.from(pop.querySelectorAll('button:not(.agent-model-pick)')).map((b) => b.textContent)).toEqual(['Choose…', 'Copy prompt'])
    expect(asked('pick-folder')).toEqual(['n1'])
    expect(asked('clear-folder')).toEqual(['n1'])
  })

  it('the ▾ of Run: the model the terminal agent starts with — its documented names in one click, any other typed; a name --model refuses is never written', async () => {
    const patches: unknown[] = []
    ;(window as unknown as { noteflow: Record<string, unknown> }).noteflow.agentTasksSetSettings = async (patch: Partial<AgentTaskSettings>) => {
      patches.push(patch)
      const now = useAgentTasksStore.getState().settings
      return { ...now, ...patch, models: { ...now.models, ...patch.models } }
    }
    makeEditor(`- [ ] Two ${ROBOT}bbbb2:queued`)
    render(createElement(AgentQueueBar, { editor }))
    await flush()
    act(() => host!.querySelector<HTMLButtonElement>('.agent-queue-more')!.click())
    await flush()
    const pop = () => document.querySelector<HTMLElement>('.agent-queue-pop')!
    const row = () => pop().querySelector<HTMLElement>('.agent-model')
    const input = () => row()!.querySelector<HTMLInputElement>('.agent-model-input')!
    const picks = () => Array.from(row()!.querySelectorAll<HTMLButtonElement>('.agent-model-pick'))
    const chosen = () => picks().filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent)
    expect(row()!.querySelector('.agent-model-label')?.textContent).toBe('Model · Claude Code')
    expect(input().placeholder).toBe("Agent's default")
    expect(input().value).toBe('')
    expect(picks().map((b) => b.textContent)).toEqual(['Default', 'opus', 'sonnet', 'haiku'])
    expect(chosen()).toEqual(['Default'])
    // One click: written for this agent alone.
    act(() => picks()[2].click())
    await flush()
    expect(patches).toEqual([{ models: { claude: 'sonnet' } }])
    expect(input().value).toBe('sonnet')
    expect(chosen()).toEqual(['sonnet'])
    // Typed: a name with a space stays in the field, with a warning, and is not written.
    const type = (text: string) => act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(), text)
      input().dispatchEvent(new Event('input', { bubbles: true }))
    })
    type('two words')
    act(() => { input().dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
    await flush()
    expect(input().getAttribute('aria-invalid')).toBe('true')
    expect(row()!.querySelector('.agent-model-warning')?.textContent).toBe('Starts with a letter or digit, no spaces: letters, digits and . _ - : / @ [ ]')
    expect(chosen()).toEqual([])
    expect(patches).toHaveLength(1)
    // A good one: Enter writes it.
    type(' claude-opus-4-1 ')
    act(() => { input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    await flush()
    expect(patches[1]).toEqual({ models: { claude: 'claude-opus-4-1' } })
    expect(row()!.querySelector('.agent-model-warning')).toBeNull()
    // "Default" empties it.
    act(() => picks()[0].click())
    await flush()
    expect(patches[2]).toEqual({ models: { claude: '' } })
  })

  it('a model typed in the ▾ menu is kept when the menu closes without a blur — a press outside, Escape — but never a name --model refuses', async () => {
    const patches: unknown[] = []
    ;(window as unknown as { noteflow: Record<string, unknown> }).noteflow.agentTasksSetSettings = async (patch: Partial<AgentTaskSettings>) => {
      patches.push(patch)
      const now = useAgentTasksStore.getState().settings
      return { ...now, ...patch, models: { ...now.models, ...patch.models } }
    }
    makeEditor(`- [ ] Two ${ROBOT}bbbb2:queued`)
    render(createElement(AgentQueueBar, { editor }))
    await flush()
    const open = async () => {
      act(() => host!.querySelector<HTMLButtonElement>('.agent-queue-more')!.click())
      await flush()
      return document.querySelector<HTMLInputElement>('.agent-queue-pop .agent-model-input')!
    }
    // No focusout is ever dispatched here: what React does with an input it removes.
    const type = (input: HTMLInputElement, text: string) => act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    type(await open(), ' claude-opus-4-1 ')
    act(() => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    await flush()
    expect(document.querySelector('.agent-queue-pop')).toBeNull()
    expect(patches).toEqual([{ models: { claude: 'claude-opus-4-1' } }])
    expect(useAgentTasksStore.getState().settings.models).toEqual({ claude: 'claude-opus-4-1' })
    // Escape: the same.
    type(await open(), 'sonnet')
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    await flush()
    expect(document.querySelector('.agent-queue-pop')).toBeNull()
    expect(patches[1]).toEqual({ models: { claude: 'sonnet' } })
    // A bad name goes nowhere; an untouched field writes nothing.
    type(await open(), 'two words')
    act(() => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    await open()
    act(() => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    await flush()
    expect(patches).toHaveLength(2)
  })

  it('Run pressed with the model just typed in the ▾ menu: the model is written before main is asked anything', async () => {
    let release: () => void = () => undefined
    ;(window as unknown as { noteflow: Record<string, unknown> }).noteflow.agentTasksSetSettings = (patch: Partial<AgentTaskSettings>) => {
      calls.push(['set-settings', patch])
      const now = useAgentTasksStore.getState().settings
      // Main answers late: Run must still wait for it.
      return new Promise((resolve) => { release = () => resolve({ ...now, ...patch, models: { ...now.models, ...patch.models } }) })
    }
    makeEditor(`- [ ] Two ${ROBOT}bbbb2:queued`)
    render(createElement(AgentQueueBar, { editor }))
    await flush()
    act(() => host!.querySelector<HTMLButtonElement>('.agent-queue-more')!.click())
    await flush()
    const input = document.querySelector<HTMLInputElement>('.agent-queue-pop .agent-model-input')!
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'haiku')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    // The press on Run: its mousedown closes the menu, then the click runs.
    const run = host!.querySelector<HTMLButtonElement>('.agent-queue-full .agent-queue-btn--run')!
    act(() => { run.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    act(() => run.click())
    await flush()
    expect(calls.map(([name]) => name).filter((name) => name !== 'get-folder')).toEqual(['set-settings'])
    act(() => release())
    await flush()
    const order = calls.map(([name]) => name).filter((name) => name !== 'get-folder')
    expect(order.slice(0, 2)).toEqual(['set-settings', 'preflight'])
    expect(calls[calls.findIndex(([name]) => name === 'set-settings')][1]).toEqual({ models: { claude: 'haiku' } })
    expect(order).toContain('terminal')
  })

  it('the model row: only for a terminal agent that takes one — Codex without suggestions; not OpenCode, a custom command or a desktop app', async () => {
    makeEditor(`- [ ] Two ${ROBOT}bbbb2:queued`)
    render(createElement(AgentQueueBar, { editor }))
    await flush()
    act(() => host!.querySelector<HTMLButtonElement>('.agent-queue-more')!.click())
    await flush()
    const row = () => document.querySelector<HTMLElement>('.agent-queue-pop .agent-model')
    act(() => settings({ agent: 'codex', models: { codex: 'gpt-5-codex' } }))
    expect(row()!.querySelector('.agent-model-label')?.textContent).toBe('Model · Codex')
    expect(row()!.querySelector<HTMLInputElement>('.agent-model-input')!.value).toBe('gpt-5-codex')
    expect(row()!.querySelector('.agent-model-picks')).toBeNull()
    for (const patch of [{ agent: 'opencode' }, { agent: 'custom', agentCommand: 'x {prompt}' }, { launch: 'claude-desktop' }] as const) {
      act(() => settings({ launch: 'terminal', ...patch }))
      expect(row(), JSON.stringify(patch)).toBeNull()
    }
  })

  it('the ▾ menu goes away with its button when nothing is queued any more', async () => {
    makeEditor(`- [ ] Two ${ROBOT}bbbb2:queued
- [ ] One ${ROBOT}aaaa1:failed`)
    render(createElement(AgentQueueBar, { editor }))
    await flush()
    act(() => host!.querySelector<HTMLButtonElement>('.agent-queue-more')!.click())
    expect(document.querySelector('.agent-queue-pop')).not.toBeNull()
    act(() => {
      editor.view.dispatch(editor.state.tr.setNodeMarkup(1, undefined, { ...editor.state.doc.nodeAt(1)!.attrs, agentState: 'running' }))
    })
    act(() => { vi.advanceTimersByTime(200) })
    expect(host!.querySelector('.agent-queue-more')).toBeNull()
    expect(document.querySelector('.agent-queue-pop')).toBeNull()
  })

  it('a folder that is gone is marked as such; the pill\'s popover carries the counts, the actions and the folder', async () => {
    folder = { folder: FOLDER, exists: false }
    makeEditor(`- [ ] Two ${ROBOT}bbbb2:queued`)
    render(createElement(AgentQueueBar, { editor }))
    await flush()
    // The ▾ that holds the folder says so: warning colour, and why in its tooltip.
    const more = host!.querySelector<HTMLButtonElement>('.agent-queue-more')!
    expect(more.classList.contains('is-missing')).toBe(true)
    expect(more.getAttribute('title')).toBe('Project folder and more. This folder no longer exists')
    act(() => host!.querySelector<HTMLButtonElement>('.agent-queue-pill')!.click())
    await flush()
    const pop = document.querySelector<HTMLElement>('.agent-queue-pop')!
    expect(pop.querySelector('.agent-queue-count')?.textContent).toBe('1 queued')
    expect(Array.from(pop.querySelectorAll('.agent-queue-btn')).map((b) => b.textContent)).toEqual(['Copy prompt', 'Run'])
    expect(pop.querySelector('.agent-folder-path')?.classList.contains('is-missing')).toBe(true)
    expect(pop.querySelector('.agent-folder-warning')?.textContent).toBe('This folder no longer exists')
  })
})

describe('the pill over a selection', () => {
  const pill = () => document.querySelector<HTMLElement>('.agent-select')
  const runButton = () => pill()?.querySelector<HTMLButtonElement>('.agent-select-btn--run') ?? null
  const status = () => pill()?.querySelector('[role="status"]')?.textContent ?? null

  function mount(md: string, a: string, b: string = a) {
    makeEditor(md)
    render(createElement(AgentSelectionButton, { editor }))
    act(() => { editor.view.focus() })
    act(() => selectText(a, b))
    act(() => { vi.advanceTimersByTime(400) })
  }

  it('tasks + text, terminal: the folder first, then the tasks queued in one step, then main gets the ids and the context', async () => {
    mount(['- [ ] First task', `- [ ] Second task ${ROBOT}bbbb2:failed`, '', 'Use the new endpoint.'].join('\n'), 'First', 'endpoint')
    // A round drop that opens on hover: "Copy prompt" and "Send to <the agent of the settings>".
    expect(pill()!.querySelector('.agent-select-drop')?.getAttribute('title')).toBe('Send to an agent')
    expect(Array.from(pill()!.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Copy prompt', 'Send to Claude Code'])
    act(() => runButton()!.click())
    await flush()
    const request = asked('terminal')[0] as { noteId: string; ids: string[]; context: string }
    expect(request.ids).toHaveLength(2)
    expect(request.ids[1]).toBe('bbbb2')
    expect(request).toMatchObject({ noteId: 'n1', context: 'Use the new endpoint' })
    expect(saved()).toContain(`- [ ] First task ${ROBOT}${request.ids[0]}:queued`)
    expect(saved()).toContain(`- [ ] Second task ${ROBOT}bbbb2:queued`)
    expect(calls.findIndex(([n]) => n === 'preflight')).toBeLessThan(calls.findIndex(([n]) => n === 'terminal'))
    expect(status()).toBe('Opening terminal…')
    // One undo takes the queueing back.
    act(() => { editor.commands.undo() })
    expect(saved()).toContain(`- [ ] Second task ${ROBOT}bbbb2:failed`)
  })

  it('the folder dialog cancelled: no task is queued, nothing is sent, the pill is as it was', async () => {
    folder = { folder: null, exists: false }
    const md = ['- [ ] First task', `- [ ] Second task ${ROBOT}bbbb2:failed`].join('\n')
    mount(md, 'First', 'Second task')
    act(() => runButton()!.click())
    await flush()
    expect(saved()).toBe(md)
    expect(asked('terminal')).toEqual([])
    expect(asked('reconcile')).toEqual([])
    expect(status()).toBeNull()
    expect(runButton()).not.toBeNull()
  })

  it.each([
    ['the agent is not installed', { ok: false, code: 'agent_not_found', agent: 'codex' }, 'Codex was not found on this computer'],
    ['a network folder', { ok: false, code: 'unc_folder' }, 'A terminal cannot work in a network folder (\\\\server\\share). Choose a local folder or a mapped drive'],
    ['the feature is off in main', { ok: false, code: 'disabled' }, 'Agent tasks are off, or this note is encrypted'],
    ['Windows without Node.js to run the CLI in the terminal', { ok: false, code: 'node_not_found' }, 'Run in a terminal needs Node.js 18 or later installed on this computer. Use Copy prompt, or choose a desktop app in Settings → AI'],
  ] as const)('validate → queue: when the preflight stops the run (%s) NO task is queued or moved, and it says why', async (_name, answer, text) => {
    preflight = async () => answer as AgentPreflightResult
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const md = ['- [ ] First task', `- [ ] Second task ${ROBOT}bbbb2:failed`].join('\n')
    mount(md, 'First', 'Second task')
    act(() => runButton()!.click())
    await flush()
    expect(saved()).toBe(md)
    expect(asked('terminal')).toEqual([])
    expect(asked('reconcile')).toEqual([])
    expect(status()).toBe(text)
    vi.restoreAllMocks()
  })

  it('the approval of a custom command refused in main\'s dialog (answered as "canceled"): nothing queued, nothing said', async () => {
    preflight = async () => ({ ok: false, code: 'canceled' })
    const md = ['- [ ] First task', `- [ ] Second task ${ROBOT}bbbb2:review`].join('\n')
    mount(md, 'First', 'Second task')
    act(() => runButton()!.click())
    await flush()
    expect(saved()).toBe(md)
    expect(asked('terminal')).toEqual([])
    expect(status()).toBeNull()
  })

  it('a launch that fails AFTER the tasks were queued (no terminal could be opened) says that they stay queued', async () => {
    terminal = async () => ({ ok: false, code: 'no_terminal' })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mount(['- [ ] First task', 'Some prose.'].join('\n'), 'First', 'prose')
    act(() => runButton()!.click())
    await flush()
    expect(saved()).toMatch(/First task .+:queued/u)
    expect(status()).toBe('Could not open a terminal. Use Copy prompt instead. The tasks stay queued')
    vi.restoreAllMocks()
  })

  it('text only, terminal: main gets the text-only prompt (for --prompt-file) and the note is not touched', async () => {
    mount('Refactor the **auth** module.\n\n- [ ] A task further down', 'Refactor', 'module')
    const before = saved()
    act(() => runButton()!.click())
    await flush()
    expect(asked('terminal')).toEqual([{ noteId: 'n1', ids: [], prompt: 'Refactor the **auth** module\n\n(From the note "Website relaunch", section "Backlog", in NoteFlow.)' }])
    expect(saved()).toBe(before)
  })

  it('a run that fails: the reason shows, then the actions come back — "Copy prompt" still works', async () => {
    terminal = async () => ({ ok: false, code: 'no_terminal' })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mount('Some prose here.', 'prose')
    act(() => runButton()!.click())
    await flush()
    expect(status()).toBe('Could not open a terminal. Use Copy prompt instead')
    act(() => { vi.advanceTimersByTime(5200) })
    expect(Array.from(pill()!.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Copy prompt', 'Send to Claude Code'])
    vi.restoreAllMocks()
  })

  it('losing the focus to the folder dialog or to the new terminal does not take the feedback away', async () => {
    mount('Some prose here.', 'prose')
    act(() => runButton()!.click())
    act(() => { (editor.view.dom as HTMLElement).blur() })
    await flush()
    expect(status()).toBe('Opening terminal…')
  })

  it('every task of the selection left out (done / in progress): sent as text, and it says so', async () => {
    settings({ launch: 'claude-desktop' })
    mount(`- [x] Done already\n- [ ] Busy ${ROBOT}aaaa1:running`, 'Done', 'Busy')
    useAgentTasksStore.setState({ byDir: { n: [] }, byId: { aaaa1: { id: 'aaaa1', meta: { state: 'running', lastSignal: new Date().toISOString() }, body: '' } }, pendingLoads: 0, now: Date.now() })
    act(() => runButton()!.click())
    await flush()
    expect(asked('open-app')).toHaveLength(1)
    expect(status()).toBe('Sent as text: those tasks are done or in progress')
  })
})

describe('the report menu', () => {
  const setBlocksDone = () => useAgentTasksStore.setState({ byDir: { n: [] }, byId: { aaaa1: { id: 'aaaa1', meta: { state: 'done' }, body: '' } }, pendingLoads: 0, now: Date.now() })
  function mountReport(props: Partial<Parameters<typeof AgentReportPopover>[0]>) {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    render(createElement(AgentReportPopover, {
      trigger, agentId: 'aaaa1', agentState: 'failed', title: 'Fix the login', checked: false, editable: true,
      onMarkDone: vi.fn(), onRequeue: vi.fn(), onDismiss: vi.fn(), onClose: vi.fn(), ...props,
    }))
    const menu = document.querySelector<HTMLElement>('.agent-report')!
    const labels = () => Array.from(menu.querySelectorAll('.agent-report-foot button')).map((b) => b.textContent)
    const button = (label: string) => Array.from(menu.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent === label)!
    return { menu, labels, button }
  }

  it('"Run" is the secondary next to the state’s own action, "Copy prompt" folds into its icon; not without a caller able to run', () => {
    const onCopyPrompt = () => Promise.resolve(true)
    const without = mountReport({ onCopyPrompt })
    expect(without.labels()).toEqual(['Copy id', 'Discard', 'Mark as done', 'Copy prompt', 'Back to the queue'])
    act(() => root?.unmount())
    const { labels, button } = mountReport({ onCopyPrompt, onRun: async () => ({ kind: 'terminal' }) })
    expect(labels()).toEqual(['Copy id', 'Discard', 'Mark as done', 'Copy prompt', 'Run', 'Back to the queue'])
    expect(button('Copy prompt').classList.contains('agent-report-btn--icon')).toBe(true)
    expect(button('Run').getAttribute('title')).toContain('Puts the task back in the queue and runs it')
    // The state's own action stays the stressed one; with none, "Run" is.
    expect(button('Back to the queue').classList.contains('agent-report-btn--primary')).toBe(true)
    expect(button('Run').classList.contains('agent-report-btn--secondary')).toBe(true)
    act(() => root?.unmount())
    setBlocksDone()
    expect(mountReport({ agentState: 'done', onCopyPrompt, onRun: async () => ({ kind: 'terminal' }) }).button('Run').classList.contains('agent-report-btn--primary')).toBe(true)
  })

  it('not for a task an agent is on, nor a checked one, nor read-only, nor where no terminal can be opened', () => {
    const onRun = async () => ({ kind: 'terminal' as const })
    useAgentTasksStore.setState({ byDir: { n: [] }, byId: { aaaa1: { id: 'aaaa1', meta: { state: 'running', lastSignal: new Date().toISOString() }, body: '' } }, pendingLoads: 0, now: Date.now() })
    expect(mountReport({ agentState: 'running', onRun }).labels()).not.toContain('Run')
    act(() => root?.unmount())
    expect(mountReport({ agentState: 'review', checked: true, onRun }).labels()).not.toContain('Run')
    act(() => root?.unmount())
    expect(mountReport({ editable: false, onRun }).labels()).toEqual(['Copy id'])
    act(() => root?.unmount())
    useAgentTasksStore.setState({ runTerminal: false })
    expect(mountReport({ onRun }).labels()).not.toContain('Run')
  })

  it('runs without closing the menu and says what happened — or why not, on a line of its own', async () => {
    const onClose = vi.fn()
    let outcome: Awaited<ReturnType<NonNullable<Parameters<typeof AgentReportPopover>[0]['onRun']>>> = { kind: 'terminal' }
    const onRun = vi.fn(async () => outcome)
    const { menu, labels, button } = mountReport({ agentState: 'review', onRun, onClose })
    expect(button('Run').classList.contains('agent-report-btn--icon')).toBe(true) // "Mark as done" is what review waits for
    act(() => button('Run').click())
    await flush()
    expect(onRun).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
    expect(labels()).toContain('Opening terminal…')
    act(() => { vi.advanceTimersByTime(6000) })
    outcome = { kind: 'error', code: 'agent_not_found', agent: 'codex' }
    act(() => button('Run').click())
    await flush()
    expect(menu.querySelector('.agent-report-run-note')?.textContent).toBe('Codex was not found on this computer')
    expect(labels()).toContain('Run')
    // Cancelled at the folder dialog: nothing is said.
    act(() => { vi.advanceTimersByTime(6000) })
    outcome = { kind: 'canceled' }
    act(() => button('Run').click())
    await flush()
    expect(menu.querySelector('.agent-report-run-note')).toBeNull()
    expect(labels()).toContain('Run')
  })
})

describe('runAgentTasks / prepareAgentRun', () => {
  it('prepareAgentRun: null = go ahead (and the folder main confirmed is remembered); otherwise what to report', async () => {
    makeEditor('- [ ] T')
    expect(await prepareAgentRun(editor)).toBeNull()
    expect(useAgentTasksStore.getState().folders.n1).toEqual({ folder: FOLDER, exists: true })
    folder = { folder: null, exists: false }
    expect(await prepareAgentRun(editor)).toEqual({ kind: 'canceled' })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    preflight = async () => ({ ok: false, code: 'agent_invalid', detail: 'x' })
    expect(await prepareAgentRun(editor)).toEqual({ kind: 'error', code: 'agent_invalid', agent: undefined })
    preflight = async () => { throw new Error('ipc down') }
    expect(await prepareAgentRun(editor)).toEqual({ kind: 'error', code: 'failed' })
    vi.restoreAllMocks()
    setAgentNoteId(editor, null)
    calls = []
    expect(await prepareAgentRun(editor)).toEqual({ kind: 'error', code: 'invalid_request' })
    expect(calls).toEqual([])
  })

  it('"canceled" answered by a launch (a dialog closed in main) is not an error', async () => {
    makeEditor(`- [ ] T ${ROBOT}aaaa1:queued`)
    terminal = async () => ({ ok: false, code: 'canceled' })
    const run = runAgentTasks(editor, ['aaaa1'])
    await vi.advanceTimersByTimeAsync(11_000)
    expect(await run).toEqual({ kind: 'canceled' })
  })

  it('never throws: a failing IPC is a failure outcome', async () => {
    makeEditor(`- [ ] T ${ROBOT}aaaa1:queued`)
    terminal = async () => { throw new Error('ipc down') }
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const run = runAgentTasks(editor, ['aaaa1'])
    await vi.advanceTimersByTimeAsync(11_000)
    expect(await run).toEqual({ kind: 'error', code: 'failed' })
    vi.restoreAllMocks()
  })

  it('the feedback, in Spanish too', () => {
    const es = getMessages('es')
    expect(agentRunFeedback(es, { kind: 'terminal' })).toEqual({ text: 'Abriendo terminal…', tone: 'ok' })
    expect(agentRunFeedback(es, { kind: 'error', code: 'agent_not_found', agent: 'claude' })).toEqual({ text: 'No se encuentra Claude Code en este equipo', tone: 'warn' })
    expect(agentRunFeedback(es, { kind: 'canceled' })).toBeNull()
    expect(agentRunFeedback(es, { kind: 'error', code: 'no_terminal', queued: true }))
      .toEqual({ text: 'No se pudo abrir una terminal. Usa Copiar prompt. Las tareas quedan en cola', tone: 'warn' })
    settings({ launch: 'claude-desktop' })
    expect(agentRunFeedback(es, { kind: 'app', promptCopied: true })).toEqual({ text: 'Prompt copiado: pégalo en Claude Desktop', tone: 'warn' })
    expect(agentRunFeedback(es, { kind: 'app', promptCopied: false })).toEqual({ text: 'Abierto en Claude Desktop. Pulsa Enter allí para empezar', tone: 'ok' })
    expect(agentRunFeedback(es, { kind: 'app', promptCopied: false })).toEqual({ text: 'Abierto en Claude Desktop', tone: 'ok' })
  })
})
