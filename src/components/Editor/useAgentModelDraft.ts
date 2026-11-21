import { useEffect, useRef, useState } from 'react'
import { agentModelInput } from '../../lib/agentRun'
import type { AgentModelPreset } from '../../lib/agentTasks'
import { useAgentTasksStore } from '../../stores/agentTasksStore'

/** Writes `next` as `agent`'s model ('' = its own default) — unless it already is. */
function writeAgentModel(agent: AgentModelPreset, next: string): void {
  const store = useAgentTasksStore.getState()
  if (next === (store.settings.models[agent] ?? '')) return
  void store.setSettings({ models: { [agent]: next } }).catch((err) => console.error('Failed to change the agent model:', err))
}

/**
 * The "Model" field of an agent (Settings → AI and the ▾ menu of Run): what is
 * shown — the draft being typed, or the stored model — and how it is written.
 * `commit` (blur / Enter) writes a draft `--model` would take; one it would
 * refuse stays in the field (`invalid`) and is never written.
 *
 * A valid draft is ALSO written when the field goes away without a blur: the
 * Run menu closes on a press outside it (Run itself), Escape or a resize, and
 * Settings may close with the field focused — React does not deliver the blur
 * of an input it removes. Run waits for that write (prepareAgentRun →
 * settingsSettled), so it starts with the model just typed.
 */
export function useAgentModelDraft(agent: AgentModelPreset) {
  const stored = useAgentTasksStore((s) => s.settings.models[agent] ?? '')
  const [draft, setDraftState] = useState<string | null>(null)
  // The same draft, for the unmount (no state can be read there).
  const draftRef = useRef<string | null>(null)

  const setDraft = (text: string) => {
    draftRef.current = text
    setDraftState(text)
  }
  /** Writes `next` (already a valid name, or '') and drops the draft. */
  const save = (next: string) => {
    draftRef.current = null
    setDraftState(null)
    writeAgentModel(agent, next)
  }
  const commit = () => {
    if (draftRef.current === null) return
    const next = agentModelInput(draftRef.current)
    if (next !== null) save(next)
  }

  useEffect(() => () => {
    const left = draftRef.current
    const next = left === null ? null : agentModelInput(left)
    if (next !== null) writeAgentModel(agent, next)
  }, [agent])

  const value = draft ?? stored
  return { value, invalid: agentModelInput(value) === null, setDraft, commit, save }
}
