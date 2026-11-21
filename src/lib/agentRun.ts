// Agent tasks — "Run" (launch an agent on tasks from the app): the pure rules
// of the renderer's side. What main does — the launcher script, the terminal,
// the link — is electron/agentRun.ts; the editor glue is
// components/Editor/useAgentTask.ts. Covered by tests/lib/agentRun.test.ts.
// Docs: .agents/context/patterns.md "Tareas con agentes: ejecutar".

import { AGENT_MODEL_PRESETS, AGENT_MODEL_RE, type AgentLaunchMode, type AgentModelPreset, type AgentRunPreset, type AgentTaskSettings } from './agentTasks'

type LaunchSettings = Pick<AgentTaskSettings, 'launch' | 'agent'>

/**
 * Is "Run" offered at all? Always for a desktop app (a link). In a terminal
 * only where this build can run the bundled CLI in one (`terminal`, from main:
 * false in the Microsoft Store build; null = not known yet → not shown) and
 * there is something to run it with there (`node`, from main: false on Windows
 * without Node.js 18+ — a button that could only fail is not offered; main
 * checks again when a run starts).
 */
export function agentRunVisible(settings: LaunchSettings, terminal: boolean | null, node: boolean | null = true): boolean {
  return settings.launch !== 'terminal' || (terminal === true && node !== false)
}

/** The i18n key (editor.agentTask.run.agents) of the agent "Run" launches with these settings. */
export type AgentRunAgentKey = 'claude' | 'codex' | 'gemini' | 'opencode' | 'custom' | 'claudeDesktop' | 'codexApp' | 'customUrl'

const APP_KEYS: Record<Exclude<AgentLaunchMode, 'terminal'>, AgentRunAgentKey> = {
  'claude-desktop': 'claudeDesktop',
  'codex-app': 'codexApp',
  'custom-url': 'customUrl',
}

export function agentRunAgentKey(settings: LaunchSettings): AgentRunAgentKey {
  return settings.launch === 'terminal' ? settings.agent : APP_KEYS[settings.launch]
}

// The "Run with" selector of Settings → AI: one flat value per choice.

export type AgentRunChoice = `terminal:${AgentRunPreset}` | Exclude<AgentLaunchMode, 'terminal'>

export const AGENT_RUN_TERMINAL_CHOICES: readonly AgentRunChoice[] = ['terminal:claude', 'terminal:codex', 'terminal:gemini', 'terminal:opencode', 'terminal:custom']
export const AGENT_RUN_APP_CHOICES: readonly AgentRunChoice[] = ['claude-desktop', 'codex-app', 'custom-url']

export function agentRunChoice(settings: LaunchSettings): AgentRunChoice {
  return settings.launch === 'terminal' ? `terminal:${settings.agent}` : settings.launch
}

/** The settings a choice of the selector stands for, null for a value that is not one. */
export function agentRunChoicePatch(value: string): Partial<Pick<AgentTaskSettings, 'launch' | 'agent'>> | null {
  if ((AGENT_RUN_APP_CHOICES as readonly string[]).includes(value)) return { launch: value as Exclude<AgentLaunchMode, 'terminal'> }
  if ((AGENT_RUN_TERMINAL_CHOICES as readonly string[]).includes(value)) {
    return { launch: 'terminal', agent: value.slice('terminal:'.length) as AgentRunPreset }
  }
  return null
}

// The model ─ which one each agent starts with (agentTasks.models).

/**
 * The agent whose model the "Model" rows set (Settings → AI and the ▾ of Run):
 * a terminal preset that takes one, null for a desktop app, a custom command
 * and OpenCode (`noteflow run --model` refuses them).
 */
export function agentModelPreset(settings: LaunchSettings): AgentModelPreset | null {
  if (settings.launch !== 'terminal') return null
  return AGENT_MODEL_PRESETS.find((name) => name === settings.agent) ?? null
}

/**
 * Names offered for each agent's model; the field takes any other. Only names
 * the agent's own CLI documents: `claude --model` takes these aliases for the
 * latest model of each family (code.claude.com/docs/en/model-config). Codex and
 * Gemini CLI name their models by version, which changes too often to list.
 */
export const AGENT_MODEL_SUGGESTIONS: Readonly<Record<AgentModelPreset, readonly string[]>> = {
  claude: ['opus', 'sonnet', 'haiku'],
  codex: [],
  gemini: [],
}

/** A model as typed → what is stored ('' = the agent's own default), or null when it is not a name `--model` takes. */
export function agentModelInput(text: string): string | null {
  const value = text.trim()
  return value === '' || AGENT_MODEL_RE.test(value) ? value : null
}

// Errors ─ one message per code.

/** The i18n key (editor.agentTask.run.errors) of a failure code — the CLI's (`noteflow run --dry-run --json`) or main's. */
export type AgentRunErrorKey =
  | 'agentNotFound' | 'agentInvalid' | 'noQueuedTasks' | 'taskNotFound' | 'fileUnreadable'
  | 'noTerminal' | 'noFolder' | 'uncFolder' | 'disabled' | 'notAvailable' | 'cliMissing' | 'nodeNotFound' | 'unsafePath' | 'invalidUrl' | 'openFailed' | 'failed'

const ERROR_KEYS: Readonly<Record<string, AgentRunErrorKey>> = {
  agent_not_found: 'agentNotFound',
  agent_invalid: 'agentInvalid',
  no_queued_tasks: 'noQueuedTasks',
  // The task (or its note / section) is not where the CLI looks: one message.
  task_not_found: 'taskNotFound',
  note_not_found: 'taskNotFound',
  section_not_found: 'taskNotFound',
  // The temp file with the context / prompt.
  file_unreadable: 'fileUnreadable',
  file_empty: 'fileUnreadable',
  no_terminal: 'noTerminal',
  no_folder: 'noFolder',
  unc_folder: 'uncFolder',
  disabled: 'disabled',
  not_available: 'notAvailable',
  cli_missing: 'cliMissing',
  node_not_found: 'nodeNotFound',
  unsafe_path: 'unsafePath',
  invalid_url: 'invalidUrl',
  open_failed: 'openFailed',
}

/** A code this version does not know (a newer CLI's) is the generic failure. */
export function agentRunErrorKey(code: string | null | undefined): AgentRunErrorKey {
  return (code && Object.prototype.hasOwnProperty.call(ERROR_KEYS, code) ? ERROR_KEYS[code] : undefined) ?? 'failed'
}

/**
 * What a "Run" came to. `canceled`: the user closed a native dialog (the
 * folder, the approval of a custom command) — nothing happened, nothing to say.
 * `queued` (an error): this click had already put tasks in the queue when the
 * launch failed — they stay there, and the message says so.
 */
export type AgentRunOutcome =
  | { kind: 'canceled' }
  | { kind: 'terminal' }
  | { kind: 'app'; promptCopied: boolean }
  | { kind: 'error'; code: string; agent?: string; queued?: boolean }

/** A failure answered by main, as an outcome ('canceled' is not an error). */
export function agentRunFailureOutcome(res: { code: string; agent?: string }): AgentRunOutcome {
  return res.code === 'canceled' ? { kind: 'canceled' } : { kind: 'error', code: res.code, agent: res.agent }
}

/** The same outcome, saying that the tasks this click queued stay queued (only an error needs to). */
export function withTasksQueued(outcome: AgentRunOutcome, queued: boolean): AgentRunOutcome {
  return outcome.kind === 'error' && queued ? { ...outcome, queued: true } : outcome
}

// The folder row ─ a long path, shortened in the middle.

/**
 * `path` in at most `max` characters: its start (the drive or root and the
 * first folder) and as many of its LAST folders as fit, with `…` in between —
 * the end of a path is what tells two projects apart. A path that still does
 * not fit is cut in the middle, character by character.
 */
export function abbreviatePathMiddle(path: string, max = 40): string {
  if (path.length <= max) return path
  const sep = path.includes('\\') ? '\\' : '/'
  const parts = path.split(/[\\/]/)
  if (parts.length > 3) {
    // '/home/…' keeps the empty first part (the root) plus one folder; 'C:\Users\…' the drive plus one.
    const headCount = parts[0] === '' ? 2 : 1
    const head = parts.slice(0, headCount).join(sep)
    let tail = ''
    for (let i = parts.length - 1; i >= headCount; i--) {
      const next = `${sep}${parts[i]}${tail}`
      if (head.length + sep.length + 1 + next.length > max) break
      tail = next
    }
    if (tail) return `${head}${sep}…${tail}`
  }
  const keep = Math.max(2, max - 1)
  const front = Math.ceil(keep / 2)
  return `${path.slice(0, front)}…${path.slice(path.length - (keep - front))}`
}
