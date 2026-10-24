import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, KeyRound, Loader2, RefreshCw, Sparkles, X } from 'lucide-react'
import { useAiChatStore } from '../../stores/aiChatStore'
import { useT } from '../../i18n/useT'
import { tf } from '../../i18n/format'
import type { AccountStatus, LlmConfigPublic } from '../../types'
import { hasKnownEntitlement, isPlanUnknown, type SubscriptionProduct } from '../../lib/subscriptionPlans'
import type { SettingsSection } from '../Settings/SettingsModal'
import { Card, FieldLabel, FIELD_INPUT } from './ui'
import { PlanOffers, PlanUnknownNotice } from '../Settings/PlanOffers'

// The two mutually exclusive ways of powering the assistant. Kept as VIEW state
// (see below) — the source of truth for what is actually in use is llmConfig.active.
type Mode = 'noteflow' | 'byo'

// Provider preselected in the BYO <select> when the managed plan is the active one and no
// earlier BYO provider is remembered (main's presetOf() falls back to 'anthropic' for unknown
// ids too).
const DEFAULT_BYO_PRESET = 'anthropic'

// Initial view state, derived from the provider that is actually in use. Null while the config
// has not landed yet (the panel shows a spinner) — never a fallback, or the first paint would
// preselect the wrong card.
const modeOf = (cfg: LlmConfigPublic | null): Mode | null =>
  cfg ? (cfg.active === 'noteflow' ? 'noteflow' : 'byo') : null
// With NoteFlow AI active, the BYO card points at the provider the user had before it
// (lastByoProvider, e.g. DeepSeek with its saved key), not the generic default.
const byoOf = (cfg: LlmConfigPublic | null): string =>
  cfg && cfg.active !== 'noteflow' ? cfg.active : cfg?.lastByoProvider || DEFAULT_BYO_PRESET

// Share of the NoteFlow AI monthly allowance spent, as a whole percentage. The proxy
// reports abstract units (only used/limit is meaningful). Floored, so "100%" only shows
// once the allowance is really exhausted (a reservation can overshoot it slightly).
function usagePercent(used: number, limit: number): number {
  if (used >= limit) return 100
  return Math.max(0, Math.floor((used / limit) * 100))
}

export function LlmConfigView({
  embedded = false,
  onNavigate,
}: {
  embedded?: boolean
  onNavigate?: (section: SettingsSection) => void
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
  // The managed plan has its own card in the selector, so it is never a <select> option.
  const selectablePresets = useMemo(() => presets.filter((p) => p.id !== 'noteflow'), [presets])
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
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null)
  const lastActive = useRef<string | null>(null)
  // `mode` is VIEW state, not the active provider: it is resolved ONCE, from the provider in use
  // the first time the config is available, and never moves on its own afterwards — a later change
  // of the active provider (subscribing activates NoteFlow AI from main, for instance) must not
  // yank the user out of the panel they are reading. Same contract as `backend` in SyncPanel.
  const [mode, setMode] = useState<Mode | null>(() => modeOf(useAiChatStore.getState().llmConfig))
  // Which BYO provider the <select> is pointing at. Decoupled from llmConfig.active so the
  // dropdown always shows a real preset — with NoteFlow AI active there is no BYO active one.
  const [byoId, setByoId] = useState(() => byoOf(useAiChatStore.getState().llmConfig))

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
  // mode on the first store update that carries it, then unsubscribe — from there on `mode` only
  // moves when the user picks a card.
  useEffect(() => {
    if (mode !== null) return
    return useAiChatStore.subscribe((s) => {
      if (!s.llmConfig) return
      setMode(modeOf(s.llmConfig))
      setByoId(byoOf(s.llmConfig))
    })
  }, [mode])

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

  if (!llmConfig || !preset || mode === null) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted/60">
        <Loader2 size={16} className="animate-spin" />
      </div>
    )
  }

  const changeProvider = (id: string) => { if (id !== llmConfig.active) void setLlmConfig({ active: id }) }
  // Picker label: show the model name only, dropping the "provider/" prefix
  // (x-ai/grok-4.5 → grok-4.5). The stored/sent id keeps the full form — this is
  // cosmetic. NoteFlow AI: the recommended model gets " · Recommended", and models that
  // spend the allowance at least twice as fast as it an "(≈N× quota)" suffix.
  const modelLabel = (m: string) => {
    const name = m.includes('/') ? m.slice(m.indexOf('/') + 1) : m
    const meta = preset.modelMeta?.[m]
    const recommended = meta?.recommended ? ` · ${t.aiPanel.provider.modelRecommended}` : ''
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

  // Checkout for the plans advertised in the gate below — opens in the browser;
  // the entitlement lands on its own via onAccountStatusChanged.
  const openCheckout = async (product: SubscriptionProduct) => {
    setCheckoutError(null)
    const result = await window.noteflow.accountOpenCheckout(product)
    if (!result.ok) setCheckoutError(result.error ?? t.settings.account.couldNotOpenCheckout)
  }

  // Settings → AI can switch section in place; the brain panel has no navigation
  // of its own, so it asks TitleBar to open Settings → Account via the event bus.
  const goToAccount = () => {
    if (onNavigate) onNavigate('account')
    else window.dispatchEvent(new Event('noteflow:open-account'))
  }

  const runTest = async () => {
    setTesting(true)
    setTestResult(null)
    setTestResult(await testConnection())
    setTesting(false)
  }

  const managedActive = llmConfig.active === 'noteflow'
  // Presets carrying `modelMeta` (today only the managed plan) serve a CURATED catalog: the
  // model is picked from the chips, never typed. Main enforces the same rule (llm.acceptsModel).
  const curatedCatalog = !!preset.modelMeta
  // KNOWN to have the 'ai' entitlement. Never-fetched entitlements are UNKNOWN (planUnknown):
  // neither the paywall nor "not subscribed" — main still lets the managed preset run then
  // (the proxy is the judge), and the gate shows a neutral "couldn't verify — Retry".
  const entitled = !!account && hasKnownEntitlement(account, 'ai')
  const planUnknown = !!account && isPlanUnknown(account)
  // The BYO provider on screen owns the config only while it is the active one: baseUrl / key /
  // model all write to whatever provider is active, so those fields stay HIDDEN until the picked
  // provider is activated — otherwise editing them here would silently overwrite the config of
  // the provider that is actually in use (e.g. NoteFlow AI, or the previously selected preset).
  const byoActive = llmConfig.active === byoId
  const byoPreset = presets.find((p) => p.id === byoId) ?? null

  const activeBadge = { label: t.aiPanel.provider.badgeActive, className: 'bg-green-500/15 text-green-400' }
  const inactiveBadge = {
    label: t.aiPanel.provider.badgeInactive,
    className: 'border-solid border border-border text-text-muted',
  }

  // Model + connection test — shared by both modes. Always edits the ACTIVE provider, so it is
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

  return (
    <div className={`flex flex-col gap-6 text-[13px] font-mono ${embedded ? '' : 'p-3 overflow-y-auto'}`}>
      {/* Pick ONE source for the assistant: the managed plan or a BYO-key / local provider. */}
      <div className="flex flex-col gap-3">
        <p className="text-[11px] text-text-muted normal-case leading-relaxed">
          {t.aiPanel.provider.chooseSourceDesc}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <SourceCard
            icon={<Sparkles size={12} className={mode === 'noteflow' ? 'text-accent' : 'text-text-muted'} />}
            title="NoteFlow AI"
            desc={t.aiPanel.provider.noteflowCard.subtitle}
            badge={managedActive ? activeBadge : inactiveBadge}
            selected={mode === 'noteflow'}
            onSelect={() => setMode('noteflow')}
          />
          <SourceCard
            icon={<KeyRound size={12} className={mode === 'byo' ? 'text-accent' : 'text-text-muted'} />}
            title={t.aiPanel.provider.byoCard.title}
            desc={t.aiPanel.provider.byoCard.subtitle}
            badge={managedActive ? inactiveBadge : activeBadge}
            selected={mode === 'byo'}
            onSelect={() => setMode('byo')}
          />
        </div>
      </div>

      <section className="flex flex-col gap-4">
        {mode === 'noteflow' ? (
          <>
            {/* Managed plan: no endpoint, no key — just the quota, the gate and the model.
                Rendered once the account status lands (there is nothing to say before that). */}
            {account && (
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

                {/* Gate: without a session or the 'ai' entitlement there is nothing to activate —
                    show what the plans cost (AI, or the Bundle when Cloud is missing too) and,
                    below them, the way into Settings → Account. */}
                {planUnknown ? (
                  <div className="flex flex-col gap-2 items-start">
                    {managedActive && (
                      <span className="flex items-center gap-1 text-[12px] font-bold text-accent">
                        <Check size={12} /> {t.aiPanel.provider.badgeActive}
                      </span>
                    )}
                    <PlanUnknownNotice />
                  </div>
                ) : !account.signedIn || !entitled ? (
                  <div className="flex flex-col gap-2 items-start">
                    <p className="text-[11px] text-text-muted normal-case leading-relaxed">
                      {!account.signedIn ? t.aiPanel.provider.noteflowSignIn : t.aiPanel.provider.noteflowNeedsSubscription}
                      <span className="ml-1.5 align-middle text-[10px] px-1.5 py-0.5 rounded-md border border-solid border-border text-text-muted">
                        {t.aiPanel.provider.paidLabel}
                      </span>
                    </p>
                    {/* Sign-in hint off: noteflowSignIn above already says it. */}
                    <PlanOffers
                      products={['ai', 'bundle']}
                      account={account}
                      showSignInHint={false}
                      onSubscribe={openCheckout}
                      onGoToAccount={goToAccount}
                    />
                    {checkoutError && <span className="text-[11px] text-red-400 normal-case">{checkoutError}</span>}
                  </div>
                ) : managedActive ? (
                  <span className="flex items-center gap-1 text-[12px] font-bold text-accent">
                    <Check size={12} /> {t.aiPanel.provider.badgeActive}
                  </span>
                ) : (
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
          </>
        ) : (
          <>
            {/* Connection: provider + endpoint + key, grouped together. */}
            <Box className="gap-4">
              {/* Provider */}
              <div className="flex flex-col gap-1.5">
                <FieldLabel>{t.aiPanel.provider.provider}</FieldLabel>
                <select
                  value={byoId}
                  onChange={(e) => {
                    const id = e.target.value
                    setByoId(id)
                    // While the picked provider IS the active one, the <select> keeps switching
                    // providers directly. With NoteFlow AI active it only picks a candidate —
                    // activation is an explicit click on the button below.
                    if (byoActive) changeProvider(id)
                  }}
                  className={FIELD_INPUT}
                >
                  {selectablePresets.map((p) => (
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
                  {t.aiPanel.provider.byoCard.useButton}
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
          </>
        )}
      </section>
    </div>
  )
}

// Groups a chunk of config — the soft rounded surface of the brain panel, used in both surfaces
// (the Settings window adopted this radius language rather than the other way round).
function Box({ className = '', children }: { className?: string; children: ReactNode }) {
  return <Card className={`flex flex-col p-3.5 ${className}`}>{children}</Card>
}

// Selector card for the two assistant sources — the this-or-that of SyncPanel's BackendCard
// (Active/Inactive badge, same accent fill), but borderless: the pick reads from the fill alone, so
// the only boxes on screen are the config ones below, whose radius it shares. `aria-pressed`
// exposes the state to AT.
function SourceCard({
  icon,
  title,
  desc,
  badge,
  selected,
  onSelect,
}: {
  icon: ReactNode
  title: string
  desc: string
  badge: { label: string; className: string }
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`text-left p-3 rounded-xl transition-colors ${
        selected ? 'bg-accent/[0.08]' : 'hover:bg-surface-2'
      }`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        {icon}
        <span className={`text-xs font-semibold ${selected ? 'text-text' : 'text-text-muted'}`}>{title}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${badge.className}`}>{badge.label}</span>
      </div>
      <p className="text-[11px] text-text-muted mt-1.5 normal-case leading-relaxed">{desc}</p>
    </button>
  )
}
