// "Run" of the agent tasks, the renderer's pure rules (src/lib/agentRun.ts):
// when the button shows, which agent it names, the selector of Settings → AI,
// the message of each failure code and the folder path cut in the middle.
import { describe, it, expect } from 'vitest'
import {
  AGENT_RUN_APP_CHOICES,
  AGENT_RUN_TERMINAL_CHOICES,
  abbreviatePathMiddle,
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
      'not_available', 'cli_missing', 'unsafe_path', 'invalid_url', 'open_failed', 'whatever']
    for (const lang of ['en', 'es'] as const) {
      const run = getMessages(lang).editor.agentTask.run
      for (const code of codes) expect(run.errors[agentRunErrorKey(code)], `${lang} ${code}`).toBeTruthy()
      expect(run.errors.agentNotFound).toContain('{agent}')
      expect(run.errors.noTerminal).toContain(getMessages(lang).editor.agentTask.copyPrompt)
    }
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
