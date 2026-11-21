import { useEffect, useState, type ReactNode } from 'react'
import { Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { useAiChatStore } from '../../stores/aiChatStore'
import { useAiStore } from '../../stores/aiStore'
import { useAiAutocompleteStore } from '../../stores/aiAutocompleteStore'
import { useAgentTasksStore } from '../../stores/agentTasksStore'
import { useNotesStore } from '../../stores/notesStore'
import { useT } from '../../i18n/useT'
import { plural, tf } from '../../i18n/format'
import { formatDate } from '../../i18n/formatDate'
import { autocompleteUsagePercent } from '../../lib/aiAutocomplete'
import { AGENT_RUN_APP_CHOICES, AGENT_RUN_TERMINAL_CHOICES, agentRunChoice, agentRunChoicePatch } from '../../lib/agentRun'
import { usageResetDate } from '../../lib/llmSources'
import type { AiUsage } from '../../types'
import { LlmConfigView } from '../AiPanel/LlmConfigView'
import { SettingsListSection, SettingsToggle, StatusBadge, settingsButtonClass } from './ui'
import { TONE_TEXT } from './statusTone'
import type { SettingsIntent } from './SettingsModal'

const SMALL_BUTTON = `flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono flex-shrink-0 ${settingsButtonClass}`

export function AiPanel({ intent, onClose }: { intent?: SettingsIntent; onClose: () => void }) {
  const loadConfig = useAiChatStore((s) => s.loadConfig)
  const configLoaded = useAiChatStore((s) => s.configLoaded)

  // The LLM config is normally loaded by the brain panel; load it here too in case the
  // user jumps straight to Settings → AI without ever opening the brain view.
  useEffect(() => {
    if (!configLoaded) void loadConfig()
  }, [configLoaded, loadConfig])

  // Settings → Account's "View" on NoteFlow AI (or the Bundle) opens its plan detail.
  const initialOffer = intent?.offer === 'ai' || intent?.offer === 'bundle' ? intent.offer : undefined

  return (
    <div className="space-y-6">
      {/* ── Assistant (LLM provider): the three sources as one radio list ── */}
      <LlmConfigView embedded initialOffer={initialOffer} />
      {/* ── Local AI index, profile and CLI skill ── */}
      <NotesAndAiSection onClose={onClose} />
    </div>
  )
}

/** "Your notes and AI": same label + control form as the assistant's sources. */
function NotesAndAiSection({ onClose }: { onClose: () => void }) {
  const t = useT()
  const enabled = useAiStore((s) => s.enabled)
  const setEnabled = useAiStore((s) => s.setEnabled)
  const reindexAll = useAiStore((s) => s.reindexAll)
  const indexState = useAiStore((s) => s.indexState)
  const progress = useAiStore((s) => s.progress)
  // Notes the index covers: encrypted ones are skipped (see localAiHint).
  const indexable = useNotesStore((s) => s.notes.filter((n) => !n.encryption).length)
  const setBrainView = useNotesStore((s) => s.setBrainView)
  const openAiPanel = useAiChatStore((s) => s.openAiPanel)
  const [exposeSkill, setExposeSkill] = useState(true)
  // null until known, so the skill row doesn't flash the toggle in the Store build
  // (which ships no CLI, hence no skill to expose).
  const [isStore, setIsStore] = useState<boolean | null>(null)

  useEffect(() => {
    void window.noteflow.getSkillSync().then(({ enabled }) => setExposeSkill(enabled))
    void window.noteflow.getDistribution().then((d) => setIsStore(d === 'store'))
  }, [])

  const handleToggleSkill = async (next: boolean) => {
    setExposeSkill(next)
    await window.noteflow.setSkillSync(next)
  }

  const busy = indexState !== 'idle'

  // The questionnaire lives in the brain's AI panel (Profile tab): open it and close Settings.
  const openProfile = () => {
    setBrainView(true)
    openAiPanel('profile')
    onClose()
  }

  return (
    <SettingsListSection title={t.settings.ai.notesTitle}>
      <NotesRow label={t.settings.ai.localAi} description={t.settings.ai.localAiHint}>
        <div className="flex items-center gap-2.5">
          {enabled && (
            <>
              <span className="text-[11px] font-mono text-text-muted tabular-nums">
                {busy && progress
                  ? indexState === 'downloading-model' ? t.settings.ai.downloadingModel : `${progress.done}/${progress.total}`
                  : plural(t.common.notesPlural, indexable)}
              </span>
              <button type="button" onClick={() => void reindexAll()} disabled={busy} className={SMALL_BUTTON}>
                {busy ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                {t.settings.ai.reindex}
              </button>
            </>
          )}
          <SettingsToggle
            on={enabled}
            title={enabled ? t.settings.ai.disableLocalAi : t.settings.ai.enableLocalAi}
            onToggle={() => void setEnabled(!enabled)}
          />
        </div>
      </NotesRow>

      <NotesRow label={t.settings.ai.profile} description={t.settings.ai.profileHint}>
        <button type="button" onClick={openProfile} className={SMALL_BUTTON}>
          <Sparkles size={11} />
          {t.settings.ai.redoQuestionnaire}
        </button>
      </NotesRow>

      <AutocompleteRow />

      {isStore !== null && (
        <NotesRow label={t.settings.ai.cliSkill} description={isStore ? t.settings.ai.exposeSkillStore : t.settings.ai.exposeSkillHint}>
          {!isStore && (
            <SettingsToggle
              on={exposeSkill}
              title={exposeSkill ? t.settings.ai.stopExposingSkill : t.settings.ai.exposeSkillTooltip}
              onToggle={() => void handleToggleSkill(!exposeSkill)}
            />
          )}
        </NotesRow>
      )}

      <AgentTasksRows />
    </SettingsListSection>
  )
}

/**
 * Agent tasks (checklist tasks handed to external AI agents through the CLI): a local,
 * per-device switch, off by default, that does NOT depend on the assistant above being
 * configured. While it is off nothing of the feature shows in the app (a task that already
 * carries a marker, arrived by sync, still shows its state). Its options only show
 * while it is on; the CLI reads "when finished" from the same settings ("several tasks"
 * reaches `noteflow run` as its --parallel flag).
 */
function AgentTasksRows() {
  const t = useT()
  const loaded = useAgentTasksStore((s) => s.settingsLoaded)
  const settings = useAgentTasksStore((s) => s.settings)
  const ensureLoaded = useAgentTasksStore((s) => s.ensureLoaded)
  const setSettings = useAgentTasksStore((s) => s.setSettings)
  // The days field keeps a draft while it has the focus: written on blur / Enter.
  const [daysDraft, setDaysDraft] = useState<string | null>(null)

  useEffect(() => { void ensureLoaded() }, [ensureLoaded])

  const commitDays = () => {
    if (daysDraft === null) return
    const days = Math.min(3650, Math.max(0, Math.round(Number(daysDraft))))
    setDaysDraft(null)
    if (daysDraft.trim() !== '' && Number.isFinite(days) && days !== settings.discardAfterDays) {
      void setSettings({ discardAfterDays: days })
    }
  }

  // ONE child of the list (its divide-y draws a rule above the block only): the switch row,
  // then its options hanging from it on a guide (see AgentSubRows).
  return (
    <div>
      <NotesRow label={t.settings.ai.agentTasks} description={t.settings.ai.agentTasksHint}>
        <SettingsToggle
          on={settings.enabled}
          disabled={!loaded}
          title={settings.enabled ? t.settings.ai.disableAgentTasks : t.settings.ai.enableAgentTasks}
          onToggle={() => void setSettings({ enabled: !settings.enabled })}
        />
      </NotesRow>

      {settings.enabled && (
        <AgentSubRows>
          <NotesRow nested label={t.settings.ai.agentOnFinish} description={t.settings.ai.agentOnFinishHint}>
            <button
              type="button"
              onClick={() => void setSettings({ onFinish: settings.onFinish === 'review' ? 'check' : 'review' })}
              className="flex items-center gap-0.5 text-[11px] font-mono px-2 py-1 rounded-lg border border-border settings-btn bg-surface-2 text-text-muted hover:text-text transition-colors flex-shrink-0"
            >
              <span className={settings.onFinish === 'check' ? 'text-text' : ''}>{t.settings.ai.agentOnFinishCheck}</span>
              <span className="opacity-30 px-0.5">/</span>
              <span className={settings.onFinish === 'review' ? 'text-text' : ''}>{t.settings.ai.agentOnFinishReview}</span>
            </button>
          </NotesRow>

          <NotesRow nested label={t.settings.ai.agentBatch} description={t.settings.ai.agentBatchHint}>
            <button
              type="button"
              onClick={() => void setSettings({ batchMode: settings.batchMode === 'parallel' ? 'sequential' : 'parallel' })}
              className="flex items-center gap-0.5 text-[11px] font-mono px-2 py-1 rounded-lg border border-border settings-btn bg-surface-2 text-text-muted hover:text-text transition-colors flex-shrink-0"
            >
              <span className={settings.batchMode === 'sequential' ? 'text-text' : ''}>{t.settings.ai.agentBatchSequential}</span>
              <span className="opacity-30 px-0.5">/</span>
              <span className={settings.batchMode === 'parallel' ? 'text-text' : ''}>{t.settings.ai.agentBatchParallel}</span>
            </button>
          </NotesRow>

          <NotesRow nested label={t.settings.ai.agentDiscard} description={t.settings.ai.agentDiscardHint}>
            <label className="flex items-center gap-2 text-[11px] font-mono text-text-muted">
              <input
                type="number"
                min={0}
                max={3650}
                step={1}
                inputMode="numeric"
                aria-label={t.settings.ai.agentDiscard}
                value={daysDraft ?? String(settings.discardAfterDays)}
                onChange={(e) => setDaysDraft(e.target.value)}
                onBlur={commitDays}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                className="w-16 bg-surface-2 border border-border rounded-lg px-2 py-1 text-[11px] font-mono text-text text-right tabular-nums outline-none focus:border-text/30 transition-colors"
              />
              <span className="w-10">
                {(daysDraft ?? String(settings.discardAfterDays)).trim() === '0' ? t.settings.ai.agentDiscardNever : t.settings.ai.agentDiscardDays}
              </span>
            </label>
          </NotesRow>

          <AgentRunRows />
        </AgentSubRows>
      )}
    </div>
  )
}

/**
 * The options of the agent-tasks switch, hanging from it: indented to the column of its
 * description (row padding 14px + label 112px + gap 12px), on a thin guide to their left and
 * with no rules between them — they read as part of the same setting, not as rows of their own.
 */
function AgentSubRows({ children }: { children: ReactNode }) {
  return (
    <div className="ml-[138px] mr-3.5 mb-3 -mt-1 border-l border-border flex flex-col">
      {children}
    </div>
  )
}

const AGENT_FIELD =
  'w-full bg-surface-2 border border-border rounded-lg px-2 py-1 text-[11px] font-mono text-text outline-none focus:border-text/30 transition-colors'

/**
 * "Run with": what the Run button next to the tasks launches — an agent CLI in a terminal
 * (through `noteflow run`, which reads `agent` / `agentCommand` from the same settings) or a
 * desktop app through a link. The custom command and the custom link are plain text fields,
 * written on blur / Enter; the link is checked by main (the same check it makes before opening it).
 */
function AgentRunRows() {
  const t = useT()
  const a = t.settings.ai
  const settings = useAgentTasksStore((s) => s.settings)
  const setSettings = useAgentTasksStore((s) => s.setSettings)
  const terminal = useAgentTasksStore((s) => s.runTerminal)
  const node = useAgentTasksStore((s) => s.runNode)
  const [commandDraft, setCommandDraft] = useState<string | null>(null)
  const [urlDraft, setUrlDraft] = useState<string | null>(null)
  // What main said about a link (the one it was asked about): a link not checked yet shows no warning.
  const [urlCheck, setUrlCheck] = useState<{ url: string; ok: boolean } | null>(null)

  const url = settings.agentUrl
  useEffect(() => {
    if (settings.launch !== 'custom-url' || !url) return
    let cancelled = false
    void window.noteflow.agentRunCheckUrl(url).then((ok) => { if (!cancelled) setUrlCheck({ url, ok }) }, () => undefined)
    return () => { cancelled = true }
  }, [settings.launch, url])
  const urlValid = !url || urlCheck?.url !== url || urlCheck.ok

  const commit = (key: 'agentCommand' | 'agentUrl', draft: string | null, clear: () => void) => {
    if (draft === null) return
    clear()
    if (draft.trim() !== settings[key]) void setSettings({ [key]: draft.trim() })
  }

  return (
    <>
      <NotesRow nested label={a.agentRunWith} description={a.agentRunWithHint}>
        <select
          aria-label={a.agentRunWith}
          value={agentRunChoice(settings)}
          onChange={(e) => {
            const patch = agentRunChoicePatch(e.target.value)
            if (patch) void setSettings(patch)
          }}
          className="bg-surface-2 border border-border rounded-lg px-2 py-1 text-[11px] font-mono text-text outline-none focus:border-text/30 transition-colors max-w-[190px]"
        >
          <optgroup label={a.agentRunGroupTerminal}>
            {AGENT_RUN_TERMINAL_CHOICES.map((c) => <option key={c} value={c}>{a.agentRunChoices[c]}</option>)}
          </optgroup>
          <optgroup label={a.agentRunGroupApp}>
            {AGENT_RUN_APP_CHOICES.map((c) => <option key={c} value={c}>{a.agentRunChoices[c]}</option>)}
          </optgroup>
        </select>
      </NotesRow>

      {settings.launch === 'terminal' && terminal === false && (
        <NotesRow nested label="" description={a.agentRunStore} />
      )}

      {settings.launch === 'terminal' && terminal === true && node === false && (
        <NotesRow nested label="" description={a.agentRunNoNode} />
      )}

      {settings.launch === 'terminal' && settings.agent === 'custom' && (
        <AgentTemplateRow nested label={a.agentRunCommand} description={a.agentRunCommandHint} notes={[a.agentRunApprovalNote]}>
          <input
            type="text"
            spellCheck={false}
            maxLength={2000}
            aria-label={a.agentRunCommand}
            placeholder={a.agentRunCommandPlaceholder}
            value={commandDraft ?? settings.agentCommand}
            onChange={(e) => setCommandDraft(e.target.value)}
            onBlur={() => commit('agentCommand', commandDraft, () => setCommandDraft(null))}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
            className={AGENT_FIELD}
          />
        </AgentTemplateRow>
      )}

      {settings.launch === 'custom-url' && (
        <AgentTemplateRow
          nested
          label={a.agentRunUrl}
          description={a.agentRunUrlHint}
          notes={[a.agentRunUrlPrivacy, a.agentRunApprovalNote]}
          warning={urlValid ? undefined : a.agentRunUrlInvalid}
        >
          <input
            type="text"
            spellCheck={false}
            maxLength={2000}
            aria-label={a.agentRunUrl}
            aria-invalid={!urlValid}
            placeholder={a.agentRunUrlPlaceholder}
            value={urlDraft ?? settings.agentUrl}
            onChange={(e) => setUrlDraft(e.target.value)}
            onBlur={() => commit('agentUrl', urlDraft, () => setUrlDraft(null))}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
            className={AGENT_FIELD}
          />
        </AgentTemplateRow>
      )}
    </>
  )
}

/** A row whose control is a full-width text field under its description (a command, a link).
 *  `nested`: an option hanging from a switch (see NotesRow). */
function AgentTemplateRow(
  { label, description, notes = [], warning, nested = false, children }: { label: string; description: string; notes?: string[]; warning?: string; nested?: boolean; children: ReactNode },
) {
  return (
    <div className={`grid items-start ${nested ? NESTED_ROW : 'grid-cols-[112px_minmax(0,1fr)] gap-3 px-3.5 py-3'}`}>
      <span className={`text-xs font-mono text-text pt-0.5 ${nested ? 'font-medium' : 'font-semibold'}`}>{label}</span>
      <div className={`min-w-0 flex flex-col gap-1.5 ${nested ? 'col-span-2' : ''}`}>
        <p className="text-[11px] font-mono text-text-muted leading-relaxed">{description}</p>
        {children}
        {notes.map((note) => <p key={note} className="text-[11px] font-mono text-text-muted/80 leading-relaxed">{note}</p>)}
        {warning && <p className={`text-[11px] font-mono leading-relaxed ${TONE_TEXT.warn}`} role="status">{warning}</p>}
      </div>
    </div>
  )
}

/**
 * Inline AI autocomplete in the editor (ghost text): a local, per-device switch, off by
 * default and only usable with a NoteFlow AI plan — whatever provider the chat uses. While
 * on, it shows how much of the month's autocomplete allowance is spent (the proxy caps it
 * at a share of the plan's allowance; hidden when the proxy doesn't report it).
 */
function AutocompleteRow() {
  const t = useT()
  const loaded = useAiAutocompleteStore((s) => s.loaded)
  const enabled = useAiAutocompleteStore((s) => s.enabled)
  const available = useAiAutocompleteStore((s) => s.available)
  const ensureLoaded = useAiAutocompleteStore((s) => s.ensureLoaded)
  const setEnabled = useAiAutocompleteStore((s) => s.setEnabled)
  const [usage, setUsage] = useState<AiUsage['autocomplete'] | null>(null)

  useEffect(() => { void ensureLoaded() }, [ensureLoaded])

  const active = enabled && available
  // Silent by design: no answer (offline, an older proxy) just hides the bar.
  useEffect(() => {
    if (!active) return
    let cancelled = false
    void window.noteflow.aiLlmUsage().then((u) => { if (!cancelled) setUsage(u?.autocomplete ?? null) })
    return () => { cancelled = true }
  }, [active])

  const usedUp = !!usage && usage.used >= usage.limit
  const resetDate = formatDate(usageResetDate(), t.common.aiUsageResetDateFormat)

  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-3">
      <div className="flex flex-col items-start gap-1">
        <span className="text-xs font-mono font-semibold text-text">{t.settings.ai.autocomplete}</span>
        <StatusBadge tone="info">{t.settings.ai.autocompleteBeta}</StatusBadge>
      </div>
      <div className="min-w-0 flex flex-col gap-1.5">
        <p className="text-[11px] font-mono text-text-muted leading-relaxed">{t.settings.ai.autocompleteHint}</p>
        {loaded && !available && (
          <p className={`text-[11px] font-mono leading-relaxed ${TONE_TEXT.warn}`}>{t.settings.ai.autocompleteNeedsPlan}</p>
        )}
        {active && usage && (
          <div className="flex flex-col gap-1 pt-0.5">
            <div className="h-1.5 rounded-full bg-border/50 overflow-hidden">
              <div
                className={`h-full rounded-full ${usedUp ? 'bg-yellow-400' : 'bg-accent'}`}
                style={{ width: `${Math.min(100, (usage.used / usage.limit) * 100)}%` }}
              />
            </div>
            {usedUp ? (
              <span className={`text-[11px] font-mono ${TONE_TEXT.warn}`}>
                {tf(t.settings.ai.autocompleteUsedUp, { date: resetDate })}
              </span>
            ) : (
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="text-[11px] font-mono text-text-muted">
                  {tf(t.settings.ai.autocompleteUsage, { percent: autocompleteUsagePercent(usage) })}
                </span>
                <span className="text-[11px] font-mono text-text-muted/70">
                  {tf(t.common.aiUsageResets, { date: resetDate })}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center justify-end">
        {/* Without the plan it can only be switched OFF (a setting left on from before). */}
        <SettingsToggle
          on={enabled}
          disabled={!loaded || (!available && !enabled)}
          title={enabled ? t.settings.ai.disableAutocomplete : t.settings.ai.enableAutocomplete}
          onToggle={() => void setEnabled(!enabled)}
        />
      </div>
    </div>
  )
}

/** Grid of an option hanging from a switch (inside AgentSubRows): a narrower label column,
 *  compact vertical padding, and the guide's own left padding. */
const NESTED_ROW = 'grid-cols-[100px_minmax(0,1fr)_auto] gap-x-3 pl-3 py-[7px]'

/** One "label | description | control" row of the section (the assistant form's 112px label
 *  column); the control sits at the end of the same line. `nested`: an option hanging from a
 *  switch row (AgentSubRows) — compact, narrower label, one weight lighter. */
function NotesRow({ label, description, nested = false, children }: { label: string; description: string; nested?: boolean; children?: ReactNode }) {
  return (
    <div className={`grid items-center ${nested ? NESTED_ROW : 'grid-cols-[112px_minmax(0,1fr)_auto] gap-3 px-3.5 py-3'}`}>
      <span className={`text-xs font-mono text-text ${nested ? 'font-medium' : 'font-semibold'}`}>{label}</span>
      <p className="min-w-0 text-[11px] font-mono text-text-muted leading-relaxed">{description}</p>
      {children ? <div className="flex items-center justify-end">{children}</div> : <span />}
    </div>
  )
}
