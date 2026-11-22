// Agent tasks — "Run" (launch an agent on tasks from the app): the pure rules
// of the renderer's side. What main does — the launcher script, the terminal,
// the link — is electron/agentRun.ts; the editor glue is
// components/Editor/useAgentTask.ts. Covered by tests/lib/agentRun.test.ts.
// Docs: .agents/context/patterns.md "Tareas con agentes: ejecutar".

import {
  AGENT_EFFORT_PRESETS,
  AGENT_MODEL_PRESETS,
  AGENT_MODEL_RE,
  type AgentEffort,
  type AgentEffortPreset,
  type AgentLaunchMode,
  type AgentModelPreset,
  type AgentRunPreset,
  type AgentTaskSettings,
} from './agentTasks'

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

/** An agent with a name of its own: not a custom command or link. */
export type AgentNamedKey = Exclude<AgentRunAgentKey, 'custom' | 'customUrl'>

/**
 * The agent a task is handed to, by name ("Hand to Claude Code", the hint of
 * a task's robot): the one "Run" launches with these settings, or null for a
 * custom command or link, which have no name to show.
 */
export function agentNamedKey(settings: LaunchSettings): AgentNamedKey | null {
  const key = agentRunAgentKey(settings)
  return key === 'custom' || key === 'customUrl' ? null : key
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

/**
 * The choices the "Run with" row of the Run menu (the ▾ of Run, the pill)
 * offers: only those with which "Run" stays offered (agentRunVisible) — no
 * terminal where this build or this computer cannot run one — so a change
 * does not hide the menu it was made from. One exception: main only looks for
 * Node.js while a terminal is chosen, so on Windows without it the terminal
 * group shows while Run is set to an app, and choosing one of them hides Run
 * (and closes the ▾). `current` is always in, in its group:
 * the select never shows a blank value.
 */
export function agentRunChoicesAvailable(
  current: AgentRunChoice,
  terminal: boolean | null,
  node: boolean | null = true,
): { terminal: AgentRunChoice[]; app: AgentRunChoice[] } {
  const canTerminal = agentRunVisible({ launch: 'terminal', agent: 'claude' }, terminal, node)
  return {
    terminal: canTerminal ? [...AGENT_RUN_TERMINAL_CHOICES] : AGENT_RUN_TERMINAL_CHOICES.filter((c) => c === current),
    app: [...AGENT_RUN_APP_CHOICES],
  }
}

/**
 * A custom command or link chosen with nothing written for it yet: 'command' /
 * 'url' (Run would fail — main refuses an empty template), null otherwise. The
 * template itself is only written in Settings → AI.
 */
export function agentRunTemplateMissing(settings: Pick<AgentTaskSettings, 'launch' | 'agent' | 'agentCommand' | 'agentUrl'>): 'command' | 'url' | null {
  if (settings.launch === 'custom-url') return settings.agentUrl.trim() ? null : 'url'
  if (settings.launch === 'terminal' && settings.agent === 'custom') return settings.agentCommand.trim() ? null : 'command'
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
 * One model offered for an agent: `id` is what is stored and reaches
 * `--model`; `name` is what people read. `latest`: an alias the agent resolves
 * when it starts — it follows the family's newest model by itself — and its
 * label says so ("Opus (latest)"); the others are fixed versions.
 */
export interface AgentModelChoice {
  id: string
  name: string
  latest?: boolean
}

/**
 * The models offered for each agent (the "Model" rows: Settings → AI and the ▾
 * of Run); the field takes any other name. Only what the agent's own CLI
 * documents. Claude Code (`claude --model`, code.claude.com/docs/en/model-config):
 * the aliases first, then the full ids of the current versions.
 * ⚠️ REVIEW THE FIXED VERSIONS WHEN NEW CLAUDE MODELS COME OUT (the aliases
 * need no change). Codex and Gemini CLI name their models by version, which
 * changes too often to list.
 */
export const AGENT_MODEL_CHOICES: Readonly<Record<AgentModelPreset, readonly AgentModelChoice[]>> = {
  claude: [
    { id: 'opus', name: 'Opus', latest: true },
    { id: 'sonnet', name: 'Sonnet', latest: true },
    { id: 'haiku', name: 'Haiku', latest: true },
    { id: 'claude-opus-5-5', name: 'Opus 5.5' },
    { id: 'claude-sonnet-5-5', name: 'Sonnet 5.5' },
    { id: 'claude-haiku-5-5', name: 'Haiku 5.5' },
    { id: 'claude-fable-5-2', name: 'Fable 5.2' },
  ],
  codex: [],
  gemini: [],
}

/** The offered choice a stored model is (`agent`: a preset's name, as a block's `agent` records it), or null for any other text. */
export function agentModelChoice(agent: string | null | undefined, model: string | null | undefined): AgentModelChoice | null {
  const preset = AGENT_MODEL_PRESETS.find((name) => name === agent)
  if (!preset || !model) return null
  return AGENT_MODEL_CHOICES[preset].find((c) => c.id === model) ?? null
}

/**
 * The model as a task's report shows it: the readable name of a fixed version
 * ('claude-opus-5-5' → 'Opus 5.5'); anything else as it was stored — an alias
 * ('opus') names whatever it was resolved to on that day, so it stays as typed.
 */
export function agentModelShown(agent: string | null | undefined, model: string): string {
  const choice = agentModelChoice(agent, model)
  return choice && !choice.latest ? choice.name : model
}

/**
 * Who a task's report says ran it: the agent with its model and effort
 * (`effort`: already worded for the report, "high effort") —
 * 'claude (Opus 5.5 · high effort)', 'claude (opus)', 'claude'; null with none.
 */
export function agentRanWith(agent: string | null, model: string | null, effort: string | null): string | null {
  const how = [model && agentModelShown(agent, model), effort].filter(Boolean).join(' · ')
  if (!agent) return how || null
  return how ? `${agent} (${how})` : agent
}

/** A model as typed → what is stored ('' = the agent's own default), or null when it is not a name `--model` takes. */
export function agentModelInput(text: string): string | null {
  const value = text.trim()
  return value === '' || AGENT_MODEL_RE.test(value) ? value : null
}

// The effort ─ how hard Claude Code thinks (agentTasks.efforts).

/**
 * The agent whose effort the "Effort" rows set (Settings → AI and the ▾ of
 * Run): Claude Code in a terminal, null for anything else (`noteflow run
 * --effort` refuses it).
 */
export function agentEffortPreset(settings: LaunchSettings): AgentEffortPreset | null {
  if (settings.launch !== 'terminal') return null
  return AGENT_EFFORT_PRESETS.find((name) => name === settings.agent) ?? null
}

/**
 * The settings patch that sets `agent`'s effort — null takes it back to the
 * agent's own default: a patch merges `efforts` by agent and '' removes that
 * agent's (patchAgentTaskSettings), a value the stored type does not hold.
 */
export function agentEffortPatch(agent: AgentEffortPreset, level: AgentEffort | null): Partial<AgentTaskSettings> {
  return { efforts: { [agent]: level ?? '' } as AgentTaskSettings['efforts'] }
}

// Errors ─ one message per code.

/** The i18n key (editor.agentTask.run.errors) of a failure code — the CLI's (`noteflow run --dry-run --json`) or main's. */
export type AgentRunErrorKey =
  | 'agentNotFound' | 'agentInvalid' | 'agentMissing' | 'urlMissing' | 'noQueuedTasks' | 'taskNotFound' | 'fileUnreadable'
  | 'noTerminal' | 'noFolder' | 'uncFolder' | 'disabled' | 'notAvailable' | 'cliMissing' | 'nodeNotFound' | 'unsafePath' | 'invalidUrl' | 'openFailed' | 'failed'

const ERROR_KEYS: Readonly<Record<string, AgentRunErrorKey>> = {
  agent_not_found: 'agentNotFound',
  agent_invalid: 'agentInvalid',
  // A custom command / link left empty: what is missing, not "invalid".
  agent_missing: 'agentMissing',
  url_missing: 'urlMissing',
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
