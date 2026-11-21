// "Run" of the agent tasks, the renderer's pure rules (src/lib/agentRun.ts):
// when the button shows, which agent it names, the selector of Settings → AI,
// the message of each failure code and the folder path cut in the middle.
import { describe, it, expect } from 'vitest'
import {
  AGENT_MODEL_SUGGESTIONS,
  AGENT_RUN_APP_CHOICES,
  AGENT_RUN_TERMINAL_CHOICES,
  abbreviatePathMiddle,
  agentModelInput,
  agentModelPreset,
  agentRunAgentKey,
  agentRunChoice,
  agentRunChoicePatch,
  agentRunErrorKey,
  agentRunFailureOutcome,
  agentRunVisible,
  withTasksQueued,
} from '../../src/lib/agentRun'
import { sanitizeAgentTaskSettings } from '../../src/lib/agentTasks'
import { getMessages } from '../../src/i18n'

describe('agentRunVisible', () => {
  it('in a terminal only where the build can open one with the CLI (not the Microsoft Store build, not before main answers)', () => {
    const terminal = { launch: 'terminal', agent: 'claude' } as const
    expect(agentRunVisible(terminal, true)).toBe(true)
    expect(agentRunVisible(terminal, false)).toBe(false)
    expect(agentRunVisible(terminal, null)).toBe(false)
  })

  it('in a terminal only with something to run the CLI there (Windows without Node.js 18+: not offered); unknown yet counts as yes', () => {
    const terminal = { launch: 'terminal', agent: 'claude' } as const
    expect(agentRunVisible(terminal, true, true)).toBe(true)
    expect(agentRunVisible(terminal, true, null)).toBe(true)
    expect(agentRunVisible(terminal, true, false)).toBe(false)
    expect(agentRunVisible(terminal, false, true)).toBe(false)
    expect(agentRunVisible(terminal, null, true)).toBe(false)
    // A desktop app needs no Node.
    expect(agentRunVisible({ launch: 'claude-desktop', agent: 'claude' }, true, false)).toBe(true)
  })

  it('a desktop app is a link: always', () => {
    for (const launch of ['claude-desktop', 'codex-app', 'custom-url'] as const) {
      expect(agentRunVisible({ launch, agent: 'claude' }, false)).toBe(true)
      expect(agentRunVisible({ launch, agent: 'claude' }, null)).toBe(true)
    }
  })
})

describe('the "Run with" selector', () => {
  it('every choice round-trips through the settings, and has a name in both languages', () => {
    for (const choice of [...AGENT_RUN_TERMINAL_CHOICES, ...AGENT_RUN_APP_CHOICES]) {
      const patch = agentRunChoicePatch(choice)
      expect(patch, choice).not.toBeNull()
      const settings = sanitizeAgentTaskSettings({ launch: 'codex-app', agent: 'gemini', ...patch })
      expect(agentRunChoice(settings)).toBe(choice)
      for (const lang of ['en', 'es'] as const) {
        expect(getMessages(lang).settings.ai.agentRunChoices[choice], `${lang} ${choice}`).toBeTruthy()
        expect(getMessages(lang).editor.agentTask.run.agents[agentRunAgentKey(settings)], `${lang} ${choice}`).toBeTruthy()
      }
    }
  })

  it('choosing a desktop app keeps the terminal agent for later; a value that is no choice changes nothing', () => {
    expect(agentRunChoicePatch('claude-desktop')).toEqual({ launch: 'claude-desktop' })
    expect(agentRunChoicePatch('terminal:opencode')).toEqual({ launch: 'terminal', agent: 'opencode' })
    for (const junk of ['', 'terminal', 'terminal:', 'terminal:rm -rf', 'powershell', 'constructor']) expect(agentRunChoicePatch(junk)).toBeNull()
  })

  it('names the agent the button launches', () => {
    expect(agentRunAgentKey({ launch: 'terminal', agent: 'gemini' })).toBe('gemini')
    expect(agentRunAgentKey({ launch: 'terminal', agent: 'custom' })).toBe('custom')
    expect(agentRunAgentKey({ launch: 'claude-desktop', agent: 'gemini' })).toBe('claudeDesktop')
    expect(agentRunAgentKey({ launch: 'codex-app', agent: 'claude' })).toBe('codexApp')
    expect(agentRunAgentKey({ launch: 'custom-url', agent: 'claude' })).toBe('customUrl')
  })
})

describe('the model rows', () => {
  it('only for a terminal agent that takes a model', () => {
    expect(agentModelPreset({ launch: 'terminal', agent: 'claude' })).toBe('claude')
    expect(agentModelPreset({ launch: 'terminal', agent: 'codex' })).toBe('codex')
    expect(agentModelPreset({ launch: 'terminal', agent: 'gemini' })).toBe('gemini')
    expect(agentModelPreset({ launch: 'terminal', agent: 'opencode' })).toBeNull()
    expect(agentModelPreset({ launch: 'terminal', agent: 'custom' })).toBeNull()
    for (const launch of ['claude-desktop', 'codex-app', 'custom-url'] as const) expect(agentModelPreset({ launch, agent: 'claude' })).toBeNull()
  })

  it('a typed name: trimmed, empty = the default, null when --model would refuse it', () => {
    expect(agentModelInput(' opus ')).toBe('opus')
    expect(agentModelInput('  ')).toBe('')
    expect(agentModelInput('anthropic/claude-sonnet-4@2025')).toBe('anthropic/claude-sonnet-4@2025')
    for (const bad of ['two words', '-m', '"x"', 'a%b', 'x'.repeat(101)]) expect(agentModelInput(bad), bad).toBeNull()
    // Every suggestion is a name the settings keep.
    for (const [agent, names] of Object.entries(AGENT_MODEL_SUGGESTIONS)) {
      for (const name of names) expect(sanitizeAgentTaskSettings({ models: { [agent]: name } }).models).toEqual({ [agent]: name })
    }
  })
})

describe('agentRunErrorKey', () => {
  it('one message per code — the CLI\'s and main\'s', () => {
    expect(agentRunErrorKey('agent_not_found')).toBe('agentNotFound')
    expect(agentRunErrorKey('agent_invalid')).toBe('agentInvalid')
    expect(agentRunErrorKey('no_queued_tasks')).toBe('noQueuedTasks')
    expect(agentRunErrorKey('task_not_found')).toBe('taskNotFound')
    expect(agentRunErrorKey('note_not_found')).toBe('taskNotFound')
    expect(agentRunErrorKey('section_not_found')).toBe('taskNotFound')
    expect(agentRunErrorKey('file_unreadable')).toBe('fileUnreadable')
    expect(agentRunErrorKey('file_empty')).toBe('fileUnreadable')
    expect(agentRunErrorKey('no_terminal')).toBe('noTerminal')
    expect(agentRunErrorKey('no_folder')).toBe('noFolder')
    expect(agentRunErrorKey('unc_folder')).toBe('uncFolder')
    expect(agentRunErrorKey('disabled')).toBe('disabled')
    expect(agentRunErrorKey('not_available')).toBe('notAvailable')
    expect(agentRunErrorKey('cli_missing')).toBe('cliMissing')
    expect(agentRunErrorKey('node_not_found')).toBe('nodeNotFound')
    expect(agentRunErrorKey('unsafe_path')).toBe('unsafePath')
    expect(agentRunErrorKey('invalid_url')).toBe('invalidUrl')
    expect(agentRunErrorKey('open_failed')).toBe('openFailed')
  })

  it('anything else — a newer CLI\'s code, a bad request, nothing — is the generic failure', () => {
    for (const code of ['failed', 'invalid_request', 'from_the_future', 'toString', '__proto__', '', null, undefined]) {
      expect(agentRunErrorKey(code)).toBe('failed')
    }
  })

  it('every key has its text in English and Spanish; "not found" names the agent, "no terminal" offers Copy prompt', () => {
    const codes = ['agent_not_found', 'agent_invalid', 'no_queued_tasks', 'task_not_found', 'file_unreadable', 'no_terminal', 'no_folder', 'unc_folder', 'disabled',
      'not_available', 'cli_missing', 'node_not_found', 'unsafe_path', 'invalid_url', 'open_failed', 'whatever']
    for (const lang of ['en', 'es'] as const) {
      const run = getMessages(lang).editor.agentTask.run
      for (const code of codes) expect(run.errors[agentRunErrorKey(code)], `${lang} ${code}`).toBeTruthy()
      expect(run.errors.agentNotFound).toContain('{agent}')
      expect(run.errors.noTerminal).toContain(getMessages(lang).editor.agentTask.copyPrompt)
      // No Node.js: says what is needed and offers the same way out as "no terminal".
      expect(run.errors.nodeNotFound).toContain('Node.js 18')
      expect(run.errors.nodeNotFound).toContain(getMessages(lang).editor.agentTask.copyPrompt)
      expect(getMessages(lang).settings.ai.agentRunNoNode).toContain('Node.js 18')
    }
    expect(getMessages('es').editor.agentTask.run.errors.nodeNotFound).toMatch(/^Ejecutar en una terminal necesita Node\.js 18 o posterior instalado en este equipo/)
    expect(getMessages('es').editor.agentTask.run.errors.agentNotFound).toBe('No se encuentra {agent} en este equipo')
  })
})

describe('outcomes', () => {
  it('"canceled" from main (a native dialog closed) is not an error; anything else is, with its code', () => {
    expect(agentRunFailureOutcome({ code: 'canceled' })).toEqual({ kind: 'canceled' })
    expect(agentRunFailureOutcome({ code: 'agent_not_found', agent: 'codex' })).toEqual({ kind: 'error', code: 'agent_not_found', agent: 'codex' })
  })

  it('only an error says that the tasks this click queued stay queued — and only if it queued any', () => {
    const error = { kind: 'error', code: 'no_terminal' } as const
    expect(withTasksQueued(error, true)).toEqual({ ...error, queued: true })
    expect(withTasksQueued(error, false)).toBe(error)
    expect(withTasksQueued({ kind: 'terminal' }, true)).toEqual({ kind: 'terminal' })
    expect(withTasksQueued({ kind: 'canceled' }, true)).toEqual({ kind: 'canceled' })
  })
})

describe('abbreviatePathMiddle', () => {
  it('a path that fits is left alone', () => {
    expect(abbreviatePathMiddle('C:\\dev\\app')).toBe('C:\\dev\\app')
    expect(abbreviatePathMiddle('/home/ana/app', 13)).toBe('/home/ana/app')
  })

  it('keeps where it starts and as many of its LAST folders as fit', () => {
    expect(abbreviatePathMiddle('C:\\Users\\yago\\Documents\\projects\\notas_windows\\noteflow', 40)).toBe('C:\\…\\projects\\notas_windows\\noteflow')
    expect(abbreviatePathMiddle('/home/ana/code/clients/acme/website-relaunch', 34)).toBe('/home/…/acme/website-relaunch')
    expect(abbreviatePathMiddle('C:\\Users\\yago\\Documents\\projects\\notas_windows\\noteflow', 16)).toBe('C:\\…\\noteflow')
  })

  it('never longer than asked, whatever the path', () => {
    const paths = [
      'C:\\Users\\yago\\Documents\\projects\\notas_windows\\noteflow',
      '/home/ana/code/clients/acme/website-relaunch',
      `C:\\${'a-very-long-single-folder-name'.repeat(4)}`,
      `/${'x'.repeat(200)}/y`,
      'relative/path/that/is/quite/long/indeed/for/a/row',
    ]
    for (const p of paths) {
      for (const max of [12, 20, 34, 40]) {
        const short = abbreviatePathMiddle(p, max)
        expect(short.length, `${p} @${max}`).toBeLessThanOrEqual(max)
        if (p.length > max) expect(short).toContain('…')
      }
    }
  })
})
