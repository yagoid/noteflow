import type { LlmConfigPublic } from '../types'

// Which assistant providers are KNOWN to answer — Settings → AI only says "In use" /
// "Answers with <model>" about those. A saved key + model is not proof (a typo'd key, a
// model the account can't use), and the app never spends the user's key on a check of its
// own: a provider becomes verified when the user's "Test" passes or a chat reply arrives,
// and stops being so when that Test fails or its key changes. Per preset, fingerprinted
// with the model + URL it was verified with (editing either is a different config).
// The managed NoteFlow AI plan is exempt: no key of the user's to get wrong, its
// availability is the plan check (`configured`).
// Renderer-local (localStorage, shared by every window): a label hint, never a gate.

const STORAGE_KEY = 'noteflow.llmVerified'
const MANAGED_PRESET_ID = 'noteflow'

type VerifiedMap = Record<string, string>

const fingerprint = (cfg: Pick<LlmConfigPublic, 'model' | 'baseUrl'>) => `${cfg.model}\n${cfg.baseUrl}`

function read(): VerifiedMap {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as VerifiedMap : {}
  } catch {
    return {}
  }
}

function write(map: VerifiedMap) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)) } catch { /* storage full / blocked: just a hint */ }
}

/** Whether this preset config (its `active` = the preset id) is known to answer. */
export function isLlmVerified(cfg: LlmConfigPublic): boolean {
  if (!cfg.configured) return false
  if (cfg.active === MANAGED_PRESET_ID) return true
  return read()[cfg.active] === fingerprint(cfg)
}

/** Record the outcome of a Test (or a chat reply, always `true`) for that preset config. */
export function markLlmVerified(cfg: LlmConfigPublic, ok: boolean) {
  if (cfg.active === MANAGED_PRESET_ID) return
  const map = read()
  if (ok) map[cfg.active] = fingerprint(cfg)
  else delete map[cfg.active]
  write(map)
}

/** Forget a preset's verification (its key was changed or removed). */
export function clearLlmVerified(presetId: string) {
  const map = read()
  if (!(presetId in map)) return
  delete map[presetId]
  write(map)
}
