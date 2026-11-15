import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Check, Cpu, KeyRound, Loader2, RefreshCw, Sparkles, X } from 'lucide-react'
import { useAiChatStore } from '../../stores/aiChatStore'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'
import type { AccountStatus, LlmConfigPublic, LlmPreset } from '../../types'
import { hasKnownEntitlement, isPlanUnknown } from '../../lib/subscriptionPlans'
import { Card, FieldLabel, FIELD_INPUT } from './ui'
import { PlanDetail, PlanTag, PlanUnknownNotice } from '../Settings/PlanOffers'
import { useOfferTag } from '../Settings/planOffersShared'

// The three ways of powering the assistant, offered at the same level: the managed plan, your
// own API key (presets that need one) or a model on your computer (presets that don't — Ollama,
// Custom). Kept as VIEW state (see below) — the source of truth for what is actually in use is
// llmConfig.active.
type Source = 'noteflow' | 'key' | 'local'
type ByoSource = Exclude<Source, 'noteflow'>

// Provider preselected in each BYO card when neither the active provider nor the remembered
// lastByoProvider belongs to it (main's presetOf() falls back to 'anthropic' for unknown ids too).
const DEFAULT_PRESET: Record<ByoSource, string> = { key: 'anthropic', local: 'ollama' }

const fitsSource = (p: LlmPreset | undefined, source: ByoSource): boolean =>
  !!p && p.id !== 'noteflow' && (source === 'key' ? p.needsKey : !p.needsKey)

const sourceOfPreset = (id: string, presets: LlmPreset[]): Source =>
  id === 'noteflow' ? 'noteflow' : presets.find((p) => p.id === id)?.needsKey === false ? 'local' : 'key'

// Initial view, derived from the provider that is actually in use. `undefined` while the config has
// not landed yet (the panel shows a spinner — never a fallback, or the first paint would preselect
// the wrong card); `null` = nothing usable is configured (a fresh install: Anthropic without a key),
// so no card is preselected and the status line says so. `initialOffer` (Settings → Account's
// "View" on NoteFlow AI) opens the managed plan's detail.
const viewOf = (
  cfg: LlmConfigPublic | null,
  presets: LlmPreset[],
  initialOffer: 'ai' | 'bundle' | undefined,
): Source | null | undefined => {
  if (!cfg) return undefined
  if (initialOffer || cfg.active === 'noteflow') return 'noteflow'
  if (!cfg.configured) return null
  return sourceOfPreset(cfg.active, presets)
}

// Which provider the BYO card's <select> points at: the active one if it belongs to that card,
// else the provider the user had before NoteFlow AI (lastByoProvider, e.g. DeepSeek with its saved
// key) if it does, else the card's default (Ollama for "Local model").
const byoFor = (source: ByoSource, cfg: LlmConfigPublic | null, presets: LlmPreset[]): string => {
  const find = (id: string) => presets.find((p) => p.id === id)
  if (cfg && fitsSource(find(cfg.active), source)) return cfg.active
  if (cfg?.lastByoProvider && fitsSource(find(cfg.lastByoProvider), source)) return cfg.lastByoProvider
  return DEFAULT_PRESET[source]
}

// Share of the NoteFlow AI monthly allowance spent, as a whole percentage. The proxy
// reports abstract units (only used/limit is meaningful). Floored, so "100%" only shows
// once the allowance is really exhausted (a reservation can overshoot it slightly).
function usagePercent(used: number, limit: number): number {
  if (used >= limit) return 100
  return Math.max(0, Math.floor((used / limit) * 100))
}

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
  const models = useAiChatStore((s) => s.models)
  const modelsLoading = useAiChatStore((s) => s.modelsLoading)
  const testConnection = useAiChatStore((s) => s.testConnection)

  const preset = useMemo(() => presets.find((p) => p.id === llmConfig?.active) ?? null, [presets, llmConfig?.active])
  // Chips offered for the active preset. For a curated catalog (preset.modelMeta — the managed
  // plan) the list is EXACTLY the catalog main has in force (downloaded from the proxy's /models
  // and cached, else its backup constants): main refuses to store anything else, so a chip from
  // any other source would do nothing when clicked. "Load" re-downloads that catalog, and the
  // new presets arrive through onAiLlmPresetsChanged (App.tsx).
  const modelOptions = useMemo(() => {
    if (preset?.modelMeta) return preset.suggestedModels
    const set = new Set<string>([...(preset?.suggestedModels ?? []), ...models])
    if (llmConfig?.model) set.add(llmConfig.model)
    return [...set]
  }, [preset, models, llmConfig?.model])

  const [keyInput, setKeyInput] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [account, setAccount] = useState<AccountStatus | null>(null)
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null)
  const [offerBundle, setOfferBundle] = useState(initialOffer === 'bundle')
  const lastActive = useRef<string | null>(null)
  // `view` is VIEW state, not the active provider: it is resolved ONCE, from the provider in use
  // the first time the config is available, and never moves on its own afterwards — a later change
  // of the active provider (subscribing activates NoteFlow AI from main, for instance) must not
  // yank the user out of the panel they are reading. Same contract as `view` in SyncPanel.
  const [view, setView] = useState<Source | null | undefined>(() => {
    const s = useAiChatStore.getState()
    return viewOf(s.llmConfig, s.presets, initialOffer)
  })
  // Which BYO provider the <select> is pointing at. Decoupled from llmConfig.active so the
  // dropdown always shows a real preset of the card on screen.
  const [byoId, setByoId] = useState(() => {
    const s = useAiChatStore.getState()
    return byoFor(viewOf(s.llmConfig, s.presets, initialOffer) === 'local' ? 'local' : 'key', s.llmConfig, s.presets)
  })
  // Price tag of the NoteFlow AI card (hook: before the early return below).
  const aiTag = useOfferTag(account, 'ai')

  // The NoteFlow AI preset gates on the account session + 'ai' entitlement:
  // track the public status and re-pull the config (its `configured` flag is
  // account-derived in main) whenever it changes.
  useEffect(() => {
    void window.noteflow.getAccountStatus().then(setAccount)
    return window.noteflow.onAccountStatusChanged((status) => {
      setAccount(status)
      void loadConfig()
    })
  }, [loadConfig])

  // Monthly consumption of the managed plan — refetched whenever the account
  // status changes (the effect above updates `account`). Silent by design: a
  // null answer (no session, offline, non-200) just hides the usage bar.
  useEffect(() => {
    if (!account?.entitlements.ai) return
    let cancelled = false
    void window.noteflow.aiLlmUsage().then((u) => { if (!cancelled) setUsage(u) })
    return () => { cancelled = true }
  }, [account])

  // Mounted before the config landed (the parents load it asynchronously): resolve the initial
  // view on the first store update that carries it, then unsubscribe — from there on `view` only
  // moves when the user picks a card.
  useEffect(() => {
    if (view !== undefined) return
    return useAiChatStore.subscribe((s) => {
      if (!s.llmConfig) return
      const next = viewOf(s.llmConfig, s.presets, initialOffer)
      setView(next)
      setByoId(byoFor(next === 'local' ? 'local' : 'key', s.llmConfig, s.presets))
    })
  }, [view, initialOffer])

  // Reset the editable fields whenever the active provider changes.
  useEffect(() => {
    if (llmConfig && llmConfig.active !== lastActive.current) {
      lastActive.current = llmConfig.active
      setBaseUrl(llmConfig.baseUrl)
      setKeyInput('')
      setTestResult(null)
      setModelsError(null)
    }
  }, [llmConfig])

  if (!llmConfig || !preset || view === undefined) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted/60">
        <Loader2 size={16} className="animate-spin" />
      </div>
    )
  }

  const changeProvider = (id: string) => { if (id !== llmConfig.active) void setLlmConfig({ active: id }) }
  // Picker label: show the model name only, dropping the "provider/" prefix
  // (x-ai/grok-4.5 → grok-4.5). The stored/sent id keeps the full form — this is
  // cosmetic. NoteFlow AI: the recommended model gets " (Recommended)", and models that
  // spend the allowance at least twice as fast as it an "(≈N× quota)" suffix.
  const modelLabel = (m: string) => {
    const name = m.includes('/') ? m.slice(m.indexOf('/') + 1) : m
    const meta = preset.modelMeta?.[m]
    const recommended = meta?.recommended ? ` (${t.aiPanel.provider.modelRecommended})` : ''
    const mult = meta?.costIndex ?? 1
    const suffix = mult >= 2 ? ` ${tf(t.aiPanel.provider.modelQuotaSuffix, { mult })}` : ''
    return `${name}${recommended}${suffix}`
  }
  const saveKey = async () => { if (keyInput.trim()) { await setLlmConfig({ apiKey: keyInput.trim() }); setKeyInput('') } }
  const clearKey = () => void setLlmConfig({ clearKey: true })
  const saveBaseUrl = () => { if (baseUrl !== llmConfig.baseUrl) void setLlmConfig({ baseUrl }) }
  const pickModel = (m: string) => void setLlmConfig({ model: m })

  const loadModels = async () => {
    setModelsError(null)
    const res = await refreshModels()
    if (!res.ok) setModelsError(res.error ?? t.aiPanel.provider.error)
  }

  const runTest = async () => {
    setTesting(true)
    setTestResult(null)
    setTestResult(await testConnection())
    setTesting(false)
  }

  const pickSource = (source: Source) => {
    setView(source)
    if (source !== 'noteflow') setByoId(byoFor(source, llmConfig, presets))
  }

  const managedActive = llmConfig.active === 'noteflow'
  // Presets carrying `modelMeta` (today only the managed plan) serve a CURATED catalog: the
  // model is picked from the chips, never typed. Main enforces the same rule (llm.acceptsModel).
  const curatedCatalog = !!preset.modelMeta
  // KNOWN to have the 'ai' entitlement. Never-fetched entitlements are UNKNOWN (planUnknown):
  // neither the offer nor "not subscribed" — main still lets the managed preset run then
  // (the proxy is the judge), and the section shows a neutral "couldn't verify — Retry".
  const entitled = !!account && hasKnownEntitlement(account, 'ai')
  const planUnknown = !!account && isPlanUnknown(account)
  // NoteFlow AI picked without the plan: its detail (value, one plan box with the inline
  // sign-in, or the Bundle plan change for a Cloud subscriber) replaces the cards, with a
  // link back to them.
  const showOfferDetail = view === 'noteflow' && !!account && !entitled && !planUnknown
  // The card the ACTIVE provider belongs to. Only marked "Active" when it can really answer
  // (llmConfig.configured): a fresh install sits on Anthropic without a key, which is no source.
  const activeSource = sourceOfPreset(llmConfig.active, presets)
  const byoSource: ByoSource = view === 'local' ? 'local' : 'key'
  const byoChoices = presets.filter((p) => fitsSource(p, byoSource))
  // The BYO provider on screen owns the config only while it is the active one: baseUrl / key /
  // model all write to whatever provider is active, so those fields stay HIDDEN until the picked
  // provider is activated — otherwise editing them here would silently overwrite the config of
  // the provider that is actually in use (e.g. NoteFlow AI, or the previously selected preset).
  const byoActive = llmConfig.active === byoId
  const byoPreset = presets.find((p) => p.id === byoId) ?? null

  // Model + connection test — shared by every source. Always edits the ACTIVE provider, so it is
  // only rendered when the provider shown on screen is the active one. Built as an element (not a
  // nested component) so it keeps its identity across renders and the input never loses focus.
  const modelCard = (
    <Box className="gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <FieldLabel hint={curatedCatalog ? t.aiPanel.provider.modelCuratedHint : undefined}>
            {t.aiPanel.provider.model}
          </FieldLabel>
          <button onClick={loadModels} disabled={modelsLoading} className="text-[11px] text-text-muted hover:text-text flex items-center gap-1">
            {modelsLoading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} {t.aiPanel.provider.load}
          </button>
        </div>
        {/* Free-text everywhere EXCEPT presets with a curated catalog (modelMeta — the managed
            plan): there the model must be one of the chips below, so the field is read-only.
            Typing into it would fight effectiveModel (which resolves an unknown id back to the
            first curated one) and persist a model the proxy rejects. Same idea as the base URL,
            which is simply not offered when the preset does not allow editing it. */}
        <input
          value={llmConfig.model}
          onChange={(e) => pickModel(e.target.value)}
          disabled={curatedCatalog}
          placeholder={preset.impl === 'anthropic' ? 'claude-opus-4-8' : 'model-name'}
          className={`${FIELD_INPUT} py-1.5`}
        />
        {modelsError && <span className="text-[11px] text-red-400">{modelsError}</span>}
        {modelOptions.length > 0 && (
          <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
            {modelOptions.map((m) => (
              <button
                key={m}
                onClick={() => pickModel(m)}
                className={`px-1.5 py-0.5 rounded-md text-[11px] border-solid border transition-colors ${
                  m === llmConfig.model ? 'border-accent/50 bg-accent/15 text-text' : 'border-border text-text-muted hover:text-text hover:border-text/30'
                }`}
              >
                {modelLabel(m)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Test */}
      <div className="flex flex-col gap-1.5">
        <button
          onClick={runTest}
          disabled={testing}
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border-solid border border-border text-text-muted hover:text-text hover:border-text/30 transition-colors disabled:opacity-50"
        >
          {testing ? <Loader2 size={12} className="animate-spin" /> : null}
          {t.aiPanel.provider.testConnection}
        </button>
        {testResult && (
          <span className={`text-[11px] ${testResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
            {testResult.ok ? t.aiPanel.provider.connected : `✗ ${testResult.error ?? t.aiPanel.provider.error}`}
          </span>
        )}
      </div>
    </Box>
  )

  const sources: { id: Source; icon: ReactNode; title: string; desc: string; tag: string | null }[] = [
    {
      id: 'noteflow',
      icon: <Sparkles size={12} />,
      title: 'NoteFlow AI',
      desc: t.aiPanel.provider.noteflowCard.subtitle,
      tag: aiTag,
    },
    {
      id: 'key',
      icon: <KeyRound size={12} />,
      title: t.aiPanel.provider.keyCard.title,
      desc: t.aiPanel.provider.keyCard.subtitle,
      tag: t.settings.plans.free,
    },
    {
      id: 'local',
      icon: <Cpu size={12} />,
      title: t.aiPanel.provider.localCard.title,
      desc: t.aiPanel.provider.localCard.subtitle,
      tag: t.settings.plans.free,
    },
  ]

  return (
    <div className={`flex flex-col gap-6 text-[13px] font-mono ${embedded ? '' : 'p-3 overflow-y-auto'}`}>
      {/* Honest status: "ready" only when the active provider can actually answer. */}
      <div className="flex flex-col gap-1.5 normal-case">
        <p className="flex items-center gap-2 text-xs text-text-muted">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${llmConfig.configured ? 'bg-green-400' : 'bg-text-muted/50'}`}
            aria-hidden
          />
          {llmConfig.configured
            ? tf(t.aiPanel.provider.statusReady, { provider: preset.label })
            : t.aiPanel.provider.statusNotSetUp}
        </p>
        {!showOfferDetail && (
          <p className="text-[11px] text-text-muted/80 leading-relaxed">{t.aiPanel.provider.chooseSourceDesc}</p>
        )}
      </div>

      {showOfferDetail && account ? (
        <section className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setView(null)}
            className="self-start flex items-center gap-1.5 text-[11px] text-text-muted hover:text-text transition-colors normal-case"
          >
            <ArrowLeft size={11} />
            {t.aiPanel.provider.backToOptions}
          </button>
          <PlanDetail product="ai" account={account} bundle={offerBundle} onBundleChange={setOfferBundle} />
        </section>
      ) : (
        <>
          {/* Three sources at the same level: three columns in Settings, one per row (full
              width) in the brain panel, which is narrow and resizable. Grid rows keep the cards
              of a row the same height. */}
          <div className={`grid gap-2 ${embedded ? 'sm:grid-cols-3' : 'grid-cols-1'}`}>
            {sources.map((source) => (
              <SourceCard
                key={source.id}
                icon={source.icon}
                title={source.title}
                desc={source.desc}
                tag={source.tag}
                activeLabel={llmConfig.configured && activeSource === source.id ? t.aiPanel.provider.badgeActive : null}
                selected={view === source.id}
                onSelect={() => pickSource(source.id)}
              />
            ))}
          </div>

          {view === 'noteflow' && (
            <section className="flex flex-col gap-4">
              {/* Managed plan with the entitlement (or a plan that couldn't be verified yet):
                  no endpoint, no key — just the quota, the activation and the model. */}
              {/* Active managed plan: the card above already says "Active", so the box
                  only carries the quota (and is left out when there is none to show). */}
              {account && (planUnknown || !managedActive || (entitled && usage && usage.limit > 0)) && (
                <Box className="gap-3">
                  {/* Monthly consumption (share of the allowance). Hidden while unknown or without entitlement. */}
                  {entitled && usage && usage.limit > 0 && (
                    <div className="flex flex-col gap-1">
                      <div className="h-1.5 rounded-full bg-border/50 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${usage.used >= usage.limit ? 'bg-amber-400' : 'bg-accent'}`}
                          style={{ width: `${Math.min(100, (usage.used / usage.limit) * 100)}%` }}
                        />
                      </div>
                      <span className={`text-[11px] normal-case ${usage.used >= usage.limit ? 'text-amber-300' : 'text-text-muted/70'}`}>
                        {tf(t.aiPanel.provider.noteflowCard.usage, { percent: usagePercent(usage.used, usage.limit) })}
                      </span>
                    </div>
                  )}

                  {planUnknown ? (
                    <PlanUnknownNotice />
                  ) : managedActive ? null : (
                    <button
                      onClick={() => changeProvider('noteflow')}
                      className="self-start px-3 py-1.5 rounded-lg bg-text text-surface-0 text-[12px] font-bold"
                    >
                      {t.aiPanel.provider.noteflowCard.useButton}
                    </button>
                  )}
                </Box>
              )}

              {managedActive && modelCard}
            </section>
          )}

          {(view === 'key' || view === 'local') && (
            <section className="flex flex-col gap-4">
              {/* Connection: provider + endpoint + key, grouped together. */}
              <Box className="gap-4">
                {/* Provider — only the presets of the card on screen (with or without a key). */}
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>{t.aiPanel.provider.provider}</FieldLabel>
                  <select
                    value={byoId}
                    onChange={(e) => {
                      const id = e.target.value
                      setByoId(id)
                      // While the picked provider IS the active one, the <select> keeps switching
                      // providers directly. Otherwise it only picks a candidate — activation is an
                      // explicit click on the button below.
                      if (byoActive) changeProvider(id)
                    }}
                    className={FIELD_INPUT}
                  >
                    {byoChoices.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                  <span className="text-[11px] text-text-muted/60 normal-case">
                    {byoPreset?.impl === 'anthropic' ? t.aiPanel.provider.hintAnthropic : byoPreset?.needsKey ? t.aiPanel.provider.hintOpenAiCompat : t.aiPanel.provider.hintLocal}
                  </span>
                </div>

                {!byoActive && (
                  <button
                    onClick={() => changeProvider(byoId)}
                    className="self-start px-3 py-1.5 rounded-lg bg-text text-surface-0 text-[12px] font-bold"
                  >
                    {t.aiPanel.provider.useProviderButton}
                  </button>
                )}

                {/* Base URL */}
                {byoActive && preset.editableBaseUrl && (
                  <div className="flex flex-col gap-1.5">
                    <FieldLabel>{t.aiPanel.provider.baseUrl}</FieldLabel>
                    <input
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      onBlur={saveBaseUrl}
                      placeholder={preset.baseUrl || 'https://…/v1'}
                      className={`${FIELD_INPUT} py-1.5`}
                    />
                  </div>
                )}

                {/* API key */}
                {byoActive && preset.needsKey && (
                  <div className="flex flex-col gap-1.5">
                    <FieldLabel>{t.aiPanel.provider.apiKey}</FieldLabel>
                    {llmConfig.hasKey ? (
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-[12px] text-emerald-400"><Check size={12} /> {t.aiPanel.provider.keySaved}</span>
                        <button onClick={clearKey} className="text-[11px] text-text-muted hover:text-red-300 flex items-center gap-1">
                          <X size={11} /> {t.aiPanel.remove}
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-1.5">
                        <input
                          type="password"
                          value={keyInput}
                          onChange={(e) => setKeyInput(e.target.value)}
                          placeholder="sk-…"
                          className={`flex-1 ${FIELD_INPUT} py-1.5`}
                        />
                        <button onClick={saveKey} disabled={!keyInput.trim()} className="px-3 py-1 rounded-lg bg-text text-surface-0 text-[12px] font-bold disabled:opacity-50">
                          {t.common.save}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </Box>

              {byoActive && modelCard}
            </section>
          )}
        </>
      )}
    </div>
  )
}

// Groups a chunk of config — the soft rounded surface of the brain panel, used in both surfaces
// (the Settings window adopted this radius language rather than the other way round).
function Box({ className = '', children }: { className?: string; children: ReactNode }) {
  return <Card className={`flex flex-col p-3.5 ${className}`}>{children}</Card>
}

// Selector card for the three assistant sources — same box as SyncPanel's cards (border, surface
// fill, accent border on hover / when picked). "Active" only marks the source that can really
// answer; the others carry their price tag ("Free" / the plan price / "In your plan").
// `aria-pressed` exposes the pick to AT. A <button> centers its content vertically by default, so
// it is a top-aligned flex column: cards of different text lengths line up in a row.
// `border-solid` is explicit because of the global `button { border: none }` reset.
function SourceCard({
  icon,
  title,
  desc,
  tag,
  activeLabel,
  selected,
  onSelect,
}: {
  icon: ReactNode
  title: string
  desc: string
  tag: string | null
  /** "Active" label when this source is the one answering; replaces the price tag. */
  activeLabel: string | null
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex h-full flex-col items-stretch justify-start text-left p-3 rounded-xl border border-solid transition-colors ${
        selected ? 'border-accent bg-accent/[0.08]' : 'border-border bg-surface-0 hover:border-accent/60'
      }`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className={selected ? 'text-accent' : 'text-text-muted'}>{icon}</span>
        <span className={`text-xs font-semibold ${selected ? 'text-text' : 'text-text-muted'}`}>{title}</span>
        {activeLabel ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 normal-case">{activeLabel}</span>
        ) : (
          tag && <PlanTag>{tag}</PlanTag>
        )}
      </div>
      <p className="text-[11px] text-text-muted mt-1.5 normal-case leading-relaxed">{desc}</p>
    </button>
  )
}
