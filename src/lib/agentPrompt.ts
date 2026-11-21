// Agent tasks — the PROMPT the app copies for the user to paste into an agent
// (the queue bar, the button over a selection, the report menu). Pure: text in,
// text out, in the app's language; the commands are the CLI's, verbatim
// (`noteflow help task`). Covered by tests/lib/agentPrompt.test.ts.
// Docs: .agents/context/patterns.md "Tareas con agentes: enviar".

import { getMessages, plural, tf, type Lang } from '../i18n'
import { AGENT_ID_RE } from './agentTasks'

export interface AgentPromptInput {
  noteTitle: string
  sectionName: string
  /** The tasks to do, in order. None → the text-only prompt. */
  taskIds: readonly string[]
  /** Text of the note that is not a task: extra context with tasks, THE prompt without them. */
  contextText?: string | null
  /** What `task finish` does (Settings → AI → Agent tasks → When finished). */
  onFinish: 'check' | 'review'
  /**
   * How SEVERAL tasks are done (Settings → AI → Agent tasks → Several tasks):
   * 'sequential' (the default) — one after another, one `task start <ids>`;
   * 'parallel' — one subagent per task, each starting its own. With one task
   * (or none) the prompt is the same either way.
   */
  batchMode?: 'sequential' | 'parallel'
  lang: Lang
  /**
   * An integer 0…255 per call: the randomness of the context block's marker
   * (agentContextDelimiters). Injected so the function stays pure — the app
   * passes crypto; the default is Math.random.
   */
  randomByte?: () => number
}

const CONTEXT_TAG = 'noteflow-context'
const SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
const SUFFIX_LENGTH = 6

/**
 * The two lines that fence the quoted context. Not a markdown fence: the text
 * may hold any run of backticks. The marker carries a RANDOM suffix made for
 * this one prompt (`<noteflow-context-7f3k9q>`): a text written beforehand
 * cannot contain its closing line, nor anything that reads like it — another
 * case, a look-alike hyphen — because it cannot know the suffix. Should the
 * text hold the suffix anyway (checked without regard to case), another one is
 * drawn; a generator that keeps giving the same one gets a counter added.
 */
export function agentContextDelimiters(
  text: string,
  randomByte: () => number = () => Math.floor(Math.random() * 256),
): { open: string; close: string } {
  const haystack = text.toLowerCase()
  const draw = () => {
    let suffix = ''
    for (let i = 0; i < SUFFIX_LENGTH; i++) suffix += SUFFIX_ALPHABET[Math.abs(Math.trunc(randomByte()) || 0) % SUFFIX_ALPHABET.length]
    return suffix
  }
  let suffix = draw()
  for (let attempt = 1; haystack.includes(suffix); attempt++) suffix = attempt < 8 ? draw() : `${draw()}${attempt}`
  const tag = `${CONTEXT_TAG}-${suffix}`
  return { open: `<${tag}>`, close: `</${tag}>` }
}

/** The text as it is quoted: LF line ends, no blank lines around it. Indentation is kept. */
function quotedText(text: string | null | undefined): string {
  return String(text ?? '').replace(/\r\n?/g, '\n').replace(/^(?:[ \t]*\n)+/, '').replace(/\s+$/, '')
}

/**
 * The text to paste into an agent.
 *   - With tasks: what to do (the ids, the note and the section), the command
 *     that starts them and the rules of the protocol; `contextText`, if any,
 *     goes last, quoted between two marker lines. Several tasks in 'parallel'
 *     mode: one subagent per task, each starting ITS OWN with
 *     `task start <id>` (one id: no batch, so no subagent is told to start
 *     another's task), the questions relayed by the main agent, and the rules
 *     for each subagent (agentParallelLines; the CLI's `run --parallel` says
 *     the same).
 *   - Without tasks: `contextText` and a line saying where it comes from — no
 *     rules, no commands: nothing is tracked.
 * '' when there is neither a task nor a text.
 */
export function buildAgentPrompt(input: AgentPromptInput): string {
  const p = getMessages(input.lang).editor.agentTask.prompt
  const ids = [...new Set(input.taskIds.filter((id) => AGENT_ID_RE.test(id)))]
  const context = quotedText(input.contextText)
  // One line each, whatever the note is called.
  const names = {
    note: input.noteTitle.replace(/\s+/g, ' ').trim(),
    section: input.sectionName.replace(/\s+/g, ' ').trim(),
  }

  if (ids.length === 0) {
    return context ? `${context}\n\n${tf(p.provenance, names)}` : ''
  }

  // One task: its id is written into every command. Several: `<id>` stands for the current one.
  const id = ids.length === 1 ? ids[0] : '<id>'
  const onFinish = input.onFinish === 'review' ? 'review' : 'check'
  const lines = input.batchMode === 'parallel' && ids.length > 1 ? agentParallelLines(p, ids, names, onFinish) : [
    plural(p.intro, ids.length, { ids: ids.join(' ') }),
    tf(p.source, names),
    '',
    p.startLabel,
    `    noteflow task start ${ids.join(' ')} --on-finish ${onFinish}`,
    plural(p.startHint, ids.length),
    tf(p.startRecover, { command: 'noteflow pull' }),
    '',
    p.rulesLabel,
    `- ${tf(p.ruleReport, { command: `noteflow task report ${id} "<${p.phProgress}>" --percent <0-100>` })}`,
    `- ${tf(p.ruleAsk, { command: `noteflow task ask ${id} "<${p.phQuestion}>"` })}`,
    `- ${plural(p.ruleFinish, ids.length, { command: `noteflow task finish ${id} --file <${p.phReport}>` })}`,
    `- ${tf(p.ruleFail, { command: `noteflow task fail ${id} "<${p.phReason}>"` })}`,
    `- ${p.ruleNoEdit}`,
  ]
  if (context) {
    const { open, close } = agentContextDelimiters(context, input.randomByte)
    lines.push('', tf(p.contextLabel, { open, close }), open, context, close)
  }
  return lines.join('\n')
}

type PromptMessages = ReturnType<typeof getMessages>['editor']['agentTask']['prompt']

/** Several tasks, one subagent per task: everything but the quoted context. */
function agentParallelLines(p: PromptMessages, ids: readonly string[], names: { note: string; section: string }, onFinish: 'check' | 'review'): string[] {
  return [
    tf(p.introParallel, { count: ids.length, ids: ids.join(' ') }),
    tf(p.source, names),
    '',
    p.startParallel,
    `    noteflow task start <id> --on-finish ${onFinish}`,
    p.startParallelHint,
    tf(p.startRecover, { command: 'noteflow pull' }),
    p.parallelGroup,
    p.parallelFallback,
    p.parallelRelay,
    '',
    p.rulesParallelLabel,
    `- ${p.ruleOwnTask}`,
    `- ${tf(p.ruleReport, { command: `noteflow task report <id> "<${p.phProgress}>" --percent <0-100>` })}`,
    `- ${tf(p.ruleAskParallel, { command: `noteflow task ask <id> "<${p.phQuestion}>"` })}`,
    `- ${plural(p.ruleFinish, ids.length, { command: `noteflow task finish <id> --file <${p.phReport}>` })}`,
    `- ${tf(p.ruleFail, { command: `noteflow task fail <id> "<${p.phReason}>"` })}`,
    `- ${p.ruleNoEdit}`,
  ]
}
