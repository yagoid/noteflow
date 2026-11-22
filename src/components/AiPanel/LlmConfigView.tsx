import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Check, ChevronDown, Cpu, KeyRound, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { useAiChatStore } from '../../stores/aiChatStore'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'
import { formatDate } from '../../i18n/formatDate'
import type { AccountStatus, AiUsage, LlmConfigPublic, LlmPreset } from '../../types'
import { hasKnownEntitlement, isPlanUnknown } from '../../lib/subscriptionPlans'
import {
  byoPresetFor, fitsSource, initialSource, modelDisplayName, modelOptions, quotaChipTone, sourceOfPreset, usagePercent,
  usageResetDate, type ByoSource, type LlmSource,
} from '../../lib/llmSources'
import { clearLlmVerified, isLlmVerified, markLlmVerified } from '../../lib/llmVerified'
import { FIELD_INPUT } from './ui'
import { PlanDetail, PlanTag, PlanUnknownNotice } from '../Settings/PlanOffers'
import { useOfferTag } from '../Settings/planOffersShared'
import { SettingsListSection, StatusBadge, settingsButtonClass } from '../Settings/ui'
import { TONE_BADGE, TONE_TEXT } from '../Settings/statusTone'

type TestState = 'running' | { ok: boolean; error?: string }
type FieldPatch = { model?: string; baseUrl?: string; apiKey?: string; clearKey?: boolean }

const PRIMARY_BUTTON = 'px-3 py-1.5 rounded-lg bg-text text-surface-0 text-[12px] font-mono font-bold hover:opacity-90 disabled:opacity-50'
const SMALL_BUTTON = `px-2.5 py-1 rounded-md text-[11px] font-mono ${settingsButtonClass}`

/**
 * The assistant's provider config — Settings → AI ("Assistant" section, `embedded`) and the brain
 * panel's settings tab (narrow: every label + control row stacks).
 *
 * One bordered list with the three sources (NoteFlow AI, your API key, a local model), each a radio
 * row. The PICKED row (view state) unfolds into its form; the source IN USE (llmConfig.active, only
 * when it can answer) carries the green "In use" pill — the two are independent, so the user can
 * read or fill in a source without switching to it. Every field is shown before activating: edits go
 * to THAT preset's own config (`preset` on the ai:llm-* IPC — main never touches `active` then), and
 * a dashed footer offers "Use <provider>" while the picked provider is not the one in use.
 */
export function LlmConfigView({
  embedded = false,
  initialOffer,
}: {
  embedded?: boolean
  /** Open the NoteFlow AI plan detail (with the Bundle chosen for 'bundle'). */
  initialOffer?: 'ai' | 'bundle'
} = {}) {
  const t = useT()
  const llmConfig = useAiChatStore((s) => s.llmConfig)
  const presets = useAiChatStore((s) => s.presets)
  const setLlmConfig = useAiChatStore((s) => s.setLlmConfig)
  const loadConfig = useAiChatStore((s) => s.loadConfig)
  const refreshModels = useAiChatStore((s) => s.refreshModels)
  const activeModels = useAiChatStore((s) => s.models)
  const activeModelsLoading = useAiChatStore((s) => s.modelsLoading)

  const [account, setAccount] = useState<AccountStatus | null>(null)
  const [usage, setUsage] = useState<AiUsage | null>(null)
  const [offerBundle, setOfferBundle] = useState(initialOffer === 'bundle')
  // Settings → Account's "View" on NoteFlow AI lands on the plan detail (when there is no plan).
  const [planOpen, setPlanOpen] = useState(!!initialOffer)
  // `view` is VIEW state, not the active provider: resolved ONCE, from the provider in use the
  // first time the config is available, and never moves on its own afterwards — a later change of
  // the active provider (subscribing activates NoteFlow AI from main, for instance) must not yank
  // the user out of the row they are reading. Same contract as `view` in SyncPanel.
  const [view, setView] = useState<LlmSource | undefined>(() => {
    const s = useAiChatStore.getState()
    return initialSource(s.llmConfig, s.presets, !!initialOffer)
  })
  // Provider each BYO row points at (its <select>). Decoupled from llmConfig.active.
  const [byoIds, setByoIds] = useState<Record<ByoSource, string>>(() => {
    const s = useAiChatStore.getState()
    return { key: byoPresetFor('key', s.llmConfig, s.presets), local: byoPresetFor('local', s.llmConfig, s.presets) }
  })
  // Public config of the presets on screen that are NOT active (the active one is llmConfig).
  const [presetViews, setPresetViews] = useState<Record<string, LlmConfigPublic>>({})
  // Models listed by a non-active provider ("Load list" / "Detect"); the active one's are the store's.
  const [listed, setListed] = useState<Record<string, string[]>>({})
  const [listing, setListing] = useState<string | null>(null)
  const [listErrors, setListErrors] = useState<Record<string, string>>({})
  const [tests, setTests] = useState<Record<string, TestState | undefined>>({})
  const aiTag = useOfferTag(account, 'ai')

  // The NoteFlow AI preset gates on the account session + 'ai' entitlement: track the public
  // status and re-pull the config (its `configured` flag is account-derived in main) on changes.
  useEffect(() => {
    void window.noteflow.getAccountStatus().then(setAccount)
    return window.noteflow.onAccountStatusChanged((status) => {
      setAccount(status)
      void loadConfig()
    })
  }, [loadConfig])

  // Monthly consumption of the managed plan — refetched whenever the account status changes.
  // Silent by design: a null answer (no session, offline, non-200) just hides the quota row.
  useEffect(() => {
    if (!account?.entitlements.ai) return
    let cancelled = false
    void window.noteflow.aiLlmUsage().then((u) => { if (!cancelled) setUsage(u) })
    return () => { cancelled = true }
  }, [account])

  // Mounted before the config landed (the parents load it asynchronously): resolve the initial
  // view on the first store update that carries it, then unsubscribe.
  useEffect(() => {
    if (view !== undefined) return
    return useAiChatStore.subscribe((s) => {
      if (!s.llmConfig) return
      setView(initialSource(s.llmConfig, s.presets, !!initialOffer))
      setByoIds({ key: byoPresetFor('key', s.llmConfig, s.presets), local: byoPresetFor('local', s.llmConfig, s.presets) })
    })
  }, [view, initialOffer])

  // Own config of every non-active preset on screen. Re-read whenever the active config changes
  // (activation, edits, account changes re-pull it), a BYO row points elsewhere or the catalog moves.
  useEffect(() => {
    if (!llmConfig) return
    let cancelled = false
    const ids = [...new Set(['noteflow', byoIds.key, byoIds.local])].filter((id) => id !== llmConfig.active)
    void Promise.all(ids.map((id) => window.noteflow.aiLlmGetConfig(id))).then((list) => {
      if (!cancelled) setPresetViews(Object.fromEntries(list.map((c) => [c.active, c])))
    })
    return () => { cancelled = true }
  }, [llmConfig, byoIds.key, byoIds.local, presets])

  const activePreset = presets.find((p) => p.id === llmConfig?.active) ?? null
  if (!llmConfig || !activePreset || view === undefined) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted/60">
        <Loader2 size={16} className="animate-spin" />
      </div>
    )
  }

  const presetById = (id: string) => presets.find((p) => p.id === id)
  // Provider names come from main in English; the few that are words, not brands, are translated.
  const presetLabel = (p: LlmPreset) => (t.aiPanel.provider.presetNames as Record<string, string | undefined>)[p.id] ?? p.label
  const cfgOf = (id: string): LlmConfigPublic | undefined => (id === llmConfig.active ? llmConfig : presetViews[id])

  // KNOWN to have the 'ai' entitlement. Never-fetched entitlements are UNKNOWN (planUnknown):
  // neither the offer nor "not subscribed" — main still lets the managed preset run then
  // (the proxy is the judge), and the row shows a neutral "couldn't verify — Retry".
  const entitled = !!account && hasKnownEntitlement(account, 'ai')
  const planUnknown = !!account && isPlanUnknown(account)
  const noPlan = !!account && !entitled && !planUnknown
  // "View plan" (or Account's "View"): the plan detail replaces the list, with a link back.
  const showPlanDetail = planOpen && view === 'noteflow' && noPlan

  // The source in use — only when it is set up (a fresh install sits on Anthropic without a
  // key, which is no source). Its pill says "In use" only once it is KNOWN to answer (a Test
  // passed or a chat reply arrived: lib/llmVerified.ts); until then "Not tested".
  const inUseSource = llmConfig.configured ? sourceOfPreset(llmConfig.active, presets) : null
  const inUseVerified = isLlmVerified(llmConfig)
  const inUseBadge = inUseVerified
    ? <StatusBadge tone="ok" dot>{tf(t.aiPanel.provider.inUse, { provider: presetLabel(activePreset) })}</StatusBadge>
    : (
      <span title={t.aiPanel.provider.inUseUntestedHint} className="inline-flex">
        <StatusBadge tone="neutral" dot>{tf(t.aiPanel.provider.inUseUntested, { provider: presetLabel(activePreset) })}</StatusBadge>
      </span>
    )

  const pickSource = (source: LlmSource) => setView(source)
  const activate = (id: string) => void setLlmConfig({ active: id })

  // Field edits of ONE preset (active or not) — never a provider switch.
  const edit = async (id: string, patch: FieldPatch) => {
    setTests((s) => ({ ...s, [id]: undefined })) // the last result belonged to the old fields
    // A new (or no) key is unproven; model/URL edits need no clearing — they change the fingerprint.
    if (patch.apiKey || patch.clearKey) clearLlmVerified(id)
    const res = await setLlmConfig({ ...patch, preset: id })
    if (id !== useAiChatStore.getState().llmConfig?.active) setPresetViews((v) => ({ ...v, [id]: res }))
  }

  const loadModels = async (id: string) => {
    setListErrors((e) => { const next = { ...e }; delete next[id]; return next })
    if (id === llmConfig.active) {
      const res = await refreshModels()
      if (!res.ok) setListErrors((e) => ({ ...e, [id]: res.error ?? t.aiPanel.provider.error }))
      return
    }
    setListing(id)
    const res = await window.noteflow.aiLlmListModels(id)
    setListing(null)
    if (res.ok) setListed((l) => ({ ...l, [id]: res.models }))
    else setListErrors((e) => ({ ...e, [id]: res.error ?? t.aiPanel.provider.error }))
  }

  const runTest = async (id: string) => {
    setTests((s) => ({ ...s, [id]: 'running' }))
    const res = await window.noteflow.aiLlmTest(id)
    const cfg = cfgOf(id)
    if (cfg) markLlmVerified(cfg, res.ok)
    setTests((s) => ({ ...s, [id]: res }))
  }

  // ── Shared rows ──
  const modelRow = (preset: LlmPreset, cfg: LlmConfigPublic, loadLabel: string) => (
    <FormRow label={t.aiPanel.provider.model} stacked={!embedded}>
      <ModelPicker
        key={preset.id}
        value={cfg.model}
        options={modelOptions(preset, preset.id === llmConfig.active ? activeModels : listed[preset.id] ?? [], cfg.model)}
        meta={preset.modelMeta}
        loading={preset.id === llmConfig.active ? activeModelsLoading : listing === preset.id}
        error={listErrors[preset.id]}
        loadLabel={preset.modelMeta ? null : loadLabel}
        onLoad={() => void loadModels(preset.id)}
        onPick={(m) => void edit(preset.id, { model: m })}
        placeholder={preset.impl === 'anthropic' ? 'claude-opus-4-8' : 'model-name'}
      />
    </FormRow>
  )

  const connectionRow = (id: string) => {
    const state = tests[id]
    return (
      <FormRow label={t.aiPanel.provider.connection} stacked={!embedded}>
        <div className="flex flex-wrap items-center gap-2 min-h-[30px]">
          <button type="button" onClick={() => void runTest(id)} disabled={state === 'running'} className={`flex items-center gap-1.5 ${SMALL_BUTTON}`}>
            {state === 'running' && <Loader2 size={11} className="animate-spin" />}
            {t.aiPanel.provider.test}
          </button>
          {state && state !== 'running' && (
            <span className={`text-[11px] font-mono break-words min-w-0 ${state.ok ? TONE_TEXT.ok : TONE_TEXT.error}`}>
              {state.ok ? t.aiPanel.provider.testOk : `✗ ${state.error ?? t.aiPanel.provider.error}`}
            </span>
          )}
        </div>
      </FormRow>
    )
  }

  // Dashed footer of a picked provider that is not the one in use. "Use …" only once that
  // provider can answer (its key, if it needs one, and a model); until then the footer says
  // what is missing and the button stays disabled.
  const activateFooter = (id: string, label: string) => {
    if (id === llmConfig.active) return null
    const cfg = cfgOf(id)
    const needsKey = !!presetById(id)?.needsKey && !cfg?.hasKey
    const needsModel = !cfg?.model
    const ready = !!cfg?.configured
    const missing = ready ? null
      : needsKey && needsModel ? t.aiPanel.provider.needsKeyAndModel
        : needsKey ? t.aiPanel.provider.needsKey
          : needsModel ? t.aiPanel.provider.needsModel
            : null
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border px-3 py-2">
        <span className="text-[11px] font-mono text-text-muted leading-relaxed">
          {missing
            ? tf(missing, { provider: label })
            : llmConfig.configured ? tf(t.aiPanel.provider.chatUses, { provider: presetLabel(activePreset) }) : t.aiPanel.provider.chatHasNoModel}
        </span>
        <button type="button" onClick={() => activate(id)} disabled={!ready} className={PRIMARY_BUTTON}>
          {tf(t.aiPanel.provider.useProvider, { provider: label })}
        </button>
      </div>
    )
  }

  const pendingForm = (
    <div className="flex items-center gap-2 text-text-muted/60 py-1"><Loader2 size={13} className="animate-spin" /></div>
  )

  // ── NoteFlow AI ──
  const noteflowPreset = presetById('noteflow')
  const noteflowCfg = cfgOf('noteflow')
  const noteflowForm = !account || !noteflowPreset || !noteflowCfg ? pendingForm : noPlan ? (
    <FormRow label={t.aiPanel.provider.plan} stacked={!embedded}>
      <div className="flex flex-wrap items-center gap-2 min-h-[30px]">
        {aiTag && <span className="text-[12px] font-mono text-text">{aiTag}</span>}
        <button type="button" onClick={() => setPlanOpen(true)} className={SMALL_BUTTON}>
          {t.aiPanel.provider.noteflowCard.viewPlan}
        </button>
      </div>
    </FormRow>
  ) : (
    <>
      {planUnknown && (
        <FormRow label={t.aiPanel.provider.plan} stacked={!embedded}>
          <div className="min-h-[30px] flex items-center"><PlanUnknownNotice /></div>
        </FormRow>
      )}
      {entitled && usage && usage.limit > 0 && (
        <FormRow label={t.aiPanel.provider.quota} stacked={!embedded}>
          <div className="flex flex-col gap-1 pt-1.5">
            <div className="h-1.5 rounded-full bg-border/50 overflow-hidden">
              <div
                className={`h-full rounded-full ${usage.used >= usage.limit ? 'bg-yellow-400' : 'bg-accent'}`}
                style={{ width: `${Math.min(100, (usage.used / usage.limit) * 100)}%` }}
              />
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className={`text-[11px] font-mono ${usage.used >= usage.limit ? TONE_TEXT.warn : 'text-text-muted'}`}>
                {tf(t.aiPanel.provider.noteflowCard.usage, { percent: usagePercent(usage.used, usage.limit) })}
              </span>
              <span className="text-[11px] font-mono text-text-muted/70">
                {tf(t.common.aiUsageResets, { date: formatDate(usageResetDate(), t.common.aiUsageResetDateFormat) })}
              </span>
            </div>
          </div>
        </FormRow>
      )}
      {modelRow(noteflowPreset, noteflowCfg, t.aiPanel.provider.loadList)}
      {connectionRow('noteflow')}
      {activateFooter('noteflow', presetLabel(noteflowPreset))}
    </>
  )

  // ── Your API key / Local model ──
  const byoForm = (source: ByoSource) => {
    const id = byoIds[source]
    const preset = presetById(id)
    const cfg = cfgOf(id)
    const choices = presets.filter((p) => fitsSource(p, source))
    const providerSelect = (
      <FormRow label={source === 'key' ? t.aiPanel.provider.provider : t.aiPanel.provider.server} stacked={!embedded}>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <select
            value={id}
            onChange={(e) => setByoIds((b) => ({ ...b, [source]: e.target.value }))}
            className={`${FIELD_INPUT} py-1.5 text-[12px] max-w-full`}
          >
            {choices.map((p) => (
              <option key={p.id} value={p.id}>{presetLabel(p)}</option>
            ))}
          </select>
          {source === 'key' && preset && (
            <span className="text-[11px] font-mono text-text-muted">
              {preset.impl === 'anthropic' ? t.aiPanel.provider.hintAnthropic : t.aiPanel.provider.hintOpenAiCompat}
            </span>
          )}
        </div>
      </FormRow>
    )
    if (!preset || !cfg) return <>{providerSelect}{pendingForm}</>
    const urlRow = preset.editableBaseUrl && (
      <FormRow label={t.aiPanel.provider.url} stacked={!embedded}>
        <BaseUrlField
          key={`${preset.id}:${cfg.baseUrl}`}
          stored={cfg.baseUrl}
          placeholder={preset.baseUrl || 'https://…/v1'}
          onSave={(baseUrl) => void edit(preset.id, { baseUrl })}
        />
      </FormRow>
    )
    return (
      <>
        {providerSelect}
        {source === 'local' && urlRow}
        {preset.needsKey && (
          <FormRow label={t.aiPanel.provider.apiKey} stacked={!embedded}>
            <ApiKeyField
              key={preset.id}
              hasKey={cfg.hasKey}
              onSave={(apiKey) => edit(preset.id, { apiKey })}
              onClear={() => void edit(preset.id, { clearKey: true })}
            />
          </FormRow>
        )}
        {source === 'key' && urlRow}
        {modelRow(preset, cfg, source === 'local' ? t.aiPanel.provider.detect : t.aiPanel.provider.loadList)}
        {connectionRow(preset.id)}
        {activateFooter(preset.id, presetLabel(preset))}
      </>
    )
  }

  if (showPlanDetail && account) {
    return (
      <div className={`flex flex-col gap-4 text-[13px] font-mono ${embedded ? '' : 'p-3 overflow-y-auto'}`}>
        <button
          type="button"
          onClick={() => setPlanOpen(false)}
          className="self-start flex items-center gap-1.5 text-[11px] text-text-muted hover:text-text transition-colors normal-case"
        >
          <ArrowLeft size={11} />
          {t.aiPanel.provider.backToOptions}
        </button>
        <PlanDetail product="ai" account={account} bundle={offerBundle} onBundleChange={setOfferBundle} />
      </div>
    )
  }

  const rows: { id: LlmSource; icon: ReactNode; title: string; desc: string; tag: string | null; form: () => ReactNode }[] = [
    { id: 'noteflow', icon: <Sparkles size={14} />, title: 'NoteFlow AI', desc: t.aiPanel.provider.noteflowCard.subtitle, tag: aiTag, form: () => noteflowForm },
    { id: 'key', icon: <KeyRound size={14} />, title: t.aiPanel.provider.keyCard.title, desc: t.aiPanel.provider.keyCard.subtitle, tag: t.settings.plans.free, form: () => byoForm('key') },
    { id: 'local', icon: <Cpu size={14} />, title: t.aiPanel.provider.localCard.title, desc: t.aiPanel.provider.localCard.subtitle, tag: t.settings.plans.free, form: () => byoForm('local') },
  ]

  return (
    <div className={`font-mono normal-case ${embedded ? '' : 'p-3 overflow-y-auto'}`}>
      <SettingsListSection
        title={t.aiPanel.provider.assistantTitle}
        summary={
          llmConfig.configured
            ? tf(inUseVerified ? t.aiPanel.provider.summaryReady : t.aiPanel.provider.summaryUntested, { model: modelDisplayName(llmConfig.model) })
            : t.aiPanel.provider.summaryNotSetUp
        }
      >
        <div role="radiogroup" aria-label={t.aiPanel.provider.assistantTitle} className="divide-y divide-border">
          {rows.map((row) => {
            const picked = view === row.id
            return (
              <div key={row.id} className={picked ? 'bg-text/[0.05]' : ''}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={picked}
                  onClick={() => pickSource(row.id)}
                  className="w-full flex items-start gap-3 px-3.5 py-3 text-left hover:bg-surface-2/40 transition-colors"
                >
                  <RadioDot checked={picked} className="mt-2" />
                  <span className={`w-7 h-7 rounded-lg bg-surface-2 flex items-center justify-center flex-shrink-0 ${picked ? 'text-accent' : 'text-text/80'}`}>
                    {row.icon}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-xs font-semibold text-text">{row.title}</span>
                      {row.tag && <PlanTag>{row.tag}</PlanTag>}
                    </span>
                    <span className="block text-[11px] text-text-muted leading-normal mt-0.5">{row.desc}</span>
                    {/* Narrow panel: the pill goes under the description (no room on the right). */}
                    {!embedded && inUseSource === row.id && <span className="block mt-1.5">{inUseBadge}</span>}
                  </span>
                  {embedded && inUseSource === row.id && inUseBadge}
                </button>
                {picked && (
                  <div className={`flex flex-col gap-2.5 pb-3.5 pr-3.5 ${embedded ? 'pl-[86px]' : 'pl-3.5'}`}>{row.form()}</div>
                )}
              </div>
            )
          })}
        </div>
      </SettingsListSection>
    </div>
  )
}

/** One "label | control" line of a source's form. Stacks (label above) in the narrow brain panel. */
function FormRow({ label, stacked, children }: { label: string; stacked: boolean; children: ReactNode }) {
  return (
    <div className={stacked ? 'flex flex-col gap-1' : 'grid grid-cols-[112px_minmax(0,1fr)] items-start gap-3'}>
      <span className={`text-[11px] font-mono text-text-muted ${stacked ? '' : 'pt-[7px]'}`}>{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** Radio circle (decorative — the row button carries role="radio"). `border-solid` because of the
 *  global `button { border: none }` reset. */
function RadioDot({ checked, className = '' }: { checked: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={`w-3.5 h-3.5 rounded-full border border-solid flex items-center justify-center flex-shrink-0 ${
        checked ? 'border-accent' : 'border-text-muted/50'
      } ${className}`}
    >
      {checked && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
    </span>
  )
}

/** Base URL input, saved on blur. Keyed by the stored value, so a save elsewhere resets the draft. */
function BaseUrlField({ stored, placeholder, onSave }: { stored: string; placeholder: string; onSave: (url: string) => void }) {
  const [draft, setDraft] = useState(stored)
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== stored) onSave(draft) }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      placeholder={placeholder}
      className={`${FIELD_INPUT} py-1.5 text-[12px] w-full`}
    />
  )
}

/** API key: masked with a check once saved ("Change" / "Remove"), else an input + "Save". The key
 *  itself never reaches the renderer — main only reports `hasKey`. */
function ApiKeyField({ hasKey, onSave, onClear }: { hasKey: boolean; onSave: (key: string) => Promise<void>; onClear: () => void }) {
  const t = useT()
  const [changing, setChanging] = useState(false)
  const [input, setInput] = useState('')
  const save = async () => {
    const key = input.trim()
    if (!key) return
    await onSave(key)
    setInput('')
    setChanging(false)
  }
  if (hasKey && !changing) {
    return (
      <div className="flex flex-wrap items-center gap-2 min-h-[30px]">
        <span className="text-[12px] font-mono text-text-muted tracking-widest">••••••••</span>
        <span className={`flex items-center gap-1 text-[11px] font-mono ${TONE_TEXT.ok}`}>
          <Check size={12} /> {t.aiPanel.provider.keySaved}
        </span>
        <button type="button" onClick={() => setChanging(true)} className={SMALL_BUTTON}>{t.aiPanel.provider.changeKey}</button>
        <button type="button" onClick={onClear} className="px-2 py-1 rounded-md text-[11px] font-mono text-text-muted hover:text-red transition-colors">
          {t.aiPanel.remove}
        </button>
      </div>
    )
  }
  return (
    <div className="flex gap-1.5">
      <input
        type="password"
        value={input}
        autoFocus={changing}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save()
          if (e.key === 'Escape' && changing) { setInput(''); setChanging(false) }
        }}
        placeholder="sk-…"
        className={`flex-1 min-w-0 ${FIELD_INPUT} py-1.5 text-[12px]`}
      />
      <button type="button" onClick={() => void save()} disabled={!input.trim()} className={PRIMARY_BUTTON}>
        {t.common.save}
      </button>
    </div>
  )
}

type ModelMeta = NonNullable<LlmPreset['modelMeta']>

/** "Recommended" (accent) and "≈N× quota" (yellow, red from ≈10×) chips of a NoteFlow AI model. */
function ModelChips({ meta }: { meta: ModelMeta[string] | undefined }) {
  const t = useT()
  if (!meta) return null
  const tone = quotaChipTone(meta.costIndex)
  return (
    <>
      {meta.recommended && (
        <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono whitespace-nowrap ${TONE_BADGE.info}`}>
          {t.aiPanel.provider.modelRecommended}
        </span>
      )}
      {tone && (
        <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono whitespace-nowrap ${TONE_BADGE[tone]}`}>
          {tf(t.aiPanel.provider.modelQuotaChip, { mult: meta.costIndex })}
        </span>
      )}
    </>
  )
}

/**
 * Model dropdown: one row per model (radio, name without the "provider/" prefix, chips). A curated
 * catalog (`meta` — the managed plan) is closed: no free text, no "Load list" (main refreshes it on
 * its own). Other providers add "Type another model…" and a "Load list" / "Detect" button.
 */
function ModelPicker({
  value, options, meta, loading, error, loadLabel, onLoad, onPick, placeholder,
}: {
  value: string
  options: string[]
  meta: ModelMeta | undefined
  loading: boolean
  error: string | undefined
  /** null = curated catalog (no free text, no list loading). */
  loadLabel: string | null
  onLoad: () => void
  onPick: (model: string) => void
  placeholder: string
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const curated = loadLabel === null

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  const commitTyped = () => {
    const m = draft.trim()
    if (m && m !== value) onPick(m)
    setTyping(false)
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-1.5">
        <div ref={ref} className="relative flex-1 min-w-0">
          {typing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitTyped}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTyped()
                if (e.key === 'Escape') { e.stopPropagation(); setTyping(false) }
              }}
              placeholder={placeholder}
              className={`${FIELD_INPUT} py-1.5 text-[12px] w-full`}
            />
          ) : (
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              className={`${FIELD_INPUT} py-1.5 text-[12px] w-full flex items-center gap-2 text-left`}
            >
              <span className={`truncate ${value ? 'text-text' : 'text-text-muted/60'}`}>
                {value ? modelDisplayName(value) : t.aiPanel.provider.chooseModel}
              </span>
              <ModelChips meta={meta?.[value]} />
              <ChevronDown size={12} className="ml-auto flex-shrink-0 text-text-muted" />
            </button>
          )}
          {open && !typing && (
            <div
              role="listbox"
              className="absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-lg border border-solid border-border bg-surface-1 shadow-xl py-1"
            >
              {options.length === 0 && (
                <div className="px-2.5 py-1.5 text-[11px] font-mono text-text-muted">{t.aiPanel.provider.noModels}</div>
              )}
              {options.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="option"
                  aria-selected={m === value}
                  onClick={() => { setOpen(false); if (m !== value) onPick(m) }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[12px] font-mono text-text hover:bg-surface-2 transition-colors"
                >
                  <RadioDot checked={m === value} />
                  <span className="truncate min-w-0" title={m}>{modelDisplayName(m)}</span>
                  <span className="ml-auto flex items-center gap-1 flex-shrink-0">
                    <ModelChips meta={meta?.[m]} />
                  </span>
                </button>
              ))}
              {!curated && (
                <button
                  type="button"
                  onClick={() => { setOpen(false); setDraft(value); setTyping(true) }}
                  className="w-full mt-1 px-2.5 py-1.5 text-left text-[11px] font-mono text-text-muted hover:text-text hover:bg-surface-2 border-t border-solid border-border transition-colors"
                >
                  {t.aiPanel.provider.otherModel}
                </button>
              )}
            </div>
          )}
        </div>
        {!curated && (
          <button
            type="button"
            onClick={onLoad}
            disabled={loading}
            className={`flex items-center gap-1.5 flex-shrink-0 py-[7px] ${SMALL_BUTTON}`}
          >
            {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            {loadLabel}
          </button>
        )}
      </div>
      {error && <span className={`text-[11px] font-mono break-words ${TONE_TEXT.error}`}>{error}</span>}
    </div>
  )
}
