import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { useLanguageStore } from '../../stores/languageStore'
import { useAiStore } from '../../stores/aiStore'
import { useNotesStore } from '../../stores/notesStore'
import { useAiChatStore } from '../../stores/aiChatStore'
import { resolveLang } from '../../i18n'
import { tf } from '../../i18n/format'
import { useT } from '../../i18n/useT'
import type { LanguageSetting } from '../../i18n'
import { ActivityPulse } from './ActivityPulse'
import { settingsButtonClass } from './ui'

const OPTIONS: LanguageSetting[] = ['system', 'en', 'es']

function Toggle({ on, title, onToggle }: { on: boolean; title: string; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title={title}
      className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors ${
        on ? 'bg-text/70' : 'bg-surface-3 border border-border'
      }`}
    >
      <span
        className={`absolute top-[2px] w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${
          on ? 'left-[18px]' : 'left-[2px]'
        }`}
      />
    </button>
  )
}

export function GeneralPanel({ onClose }: { onClose: () => void }) {
  const setting = useLanguageStore((s) => s.setting)
  const setLanguage = useLanguageStore((s) => s.setLanguage)
  const enabled = useAiStore((s) => s.enabled)
  const setEnabled = useAiStore((s) => s.setEnabled)
  const reindexAll = useAiStore((s) => s.reindexAll)
  const indexState = useAiStore((s) => s.indexState)
  const progress = useAiStore((s) => s.progress)
  const setBrainView = useNotesStore((s) => s.setBrainView)
  const openAiPanel = useAiChatStore((s) => s.openAiPanel)
  const [exposeSkill, setExposeSkill] = useState(true)
  const t = useT()

  useEffect(() => {
    void window.noteflow.getSkillSync().then(({ enabled }) => setExposeSkill(enabled))
  }, [])

  const handleToggleSkill = async (next: boolean) => {
    setExposeSkill(next)
    await window.noteflow.setSkillSync(next)
  }

  const busy = indexState !== 'idle'

  const openProfile = () => {
    setBrainView(true)
    openAiPanel('profile')
    onClose()
  }

  const label: Record<LanguageSetting, string> = {
    system: t.settings.general.system,
    en: t.settings.general.english,
    es: t.settings.general.spanish,
  }
  // Name of the language 'system' currently resolves to, shown as a hint.
  const detectedName = resolveLang('system') === 'es' ? t.settings.general.spanish : t.settings.general.english

  return (
    <div className="settings-rows space-y-6">
      <section className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-mono font-medium text-text">{t.settings.general.language}</p>
          <p className="text-[11px] font-mono text-text-muted mt-1">{t.settings.general.languageHint}</p>
          {setting === 'system' && (
            <p className="text-[11px] font-mono text-text-muted/70 mt-0.5">
              {tf(t.settings.general.detected, { lang: detectedName })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-0.5 text-[11px] font-mono p-0.5 rounded-md border border-border bg-surface-2 flex-shrink-0">
          {OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => setLanguage(opt)}
              className={`px-2 py-1 rounded transition-colors ${
                setting === opt ? 'bg-surface-1 text-text' : 'text-text-muted hover:text-text'
              }`}
            >
              {label[opt]}
            </button>
          ))}
        </div>
      </section>

      {/* Decorative chart of recent note activity (header + axis legends included) */}
      <section className="pt-2">
        <ActivityPulse />
      </section>

      {/* ── Local AI (embeddings index) ─────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-mono font-medium text-text">{t.settings.ai.localAi}</p>
            <p className="text-[11px] font-mono text-text-muted mt-1 leading-relaxed">{t.settings.ai.localAiHint}</p>
          </div>
          <Toggle
            on={enabled}
            title={enabled ? t.settings.ai.disableLocalAi : t.settings.ai.enableLocalAi}
            onToggle={() => void setEnabled(!enabled)}
          />
        </div>

        {enabled && (
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={() => void reindexAll()}
              disabled={busy}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs font-mono ${settingsButtonClass}`}
            >
              {busy ? <Loader2 size={13} className="animate-spin text-text-muted" /> : <RefreshCw size={13} className="text-text-muted" />}
              {t.settings.ai.reindexAll}
            </button>
            {busy && progress && (
              <span className="text-[11px] font-mono text-text-muted tabular-nums">
                {indexState === 'downloading-model' ? t.settings.ai.downloadingModel : `${progress.done}/${progress.total}`}
              </span>
            )}
          </div>
        )}
      </section>

      {/* ── Profile (second brain) ──────────────────────────────────── */}
      <section className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-mono font-medium text-text">{t.settings.ai.profile}</p>
          <p className="text-[11px] font-mono text-text-muted mt-1 leading-relaxed">{t.settings.ai.profileHint}</p>
        </div>
        <button
          onClick={openProfile}
          className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs font-mono text-left flex-shrink-0 ${settingsButtonClass}`}
        >
          <Sparkles size={13} className="text-text-muted flex-shrink-0" />
          <span>{t.settings.ai.openProfileSetup}</span>
        </button>
      </section>

      {/* ── AI agents (CLI skill) ───────────────────────────────────── */}
      <section className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-mono font-medium text-text">{t.settings.ai.exposeSkill}</p>
          <p className="text-[11px] font-mono text-text-muted mt-1 leading-relaxed">{t.settings.ai.exposeSkillHint}</p>
        </div>
        <Toggle
          on={exposeSkill}
          title={exposeSkill ? t.settings.ai.stopExposingSkill : t.settings.ai.exposeSkillTooltip}
          onToggle={() => void handleToggleSkill(!exposeSkill)}
        />
      </section>
    </div>
  )
}
