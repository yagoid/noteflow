import { useLanguageStore } from '../../stores/languageStore'
import { resolveLang } from '../../i18n'
import { tf } from '../../i18n/format'
import { useT } from '../../i18n/useT'
import type { LanguageSetting } from '../../i18n'
import { ActivityPulse } from './ActivityPulse'

const OPTIONS: LanguageSetting[] = ['system', 'en', 'es']

export function GeneralPanel() {
  const setting = useLanguageStore((s) => s.setting)
  const setLanguage = useLanguageStore((s) => s.setLanguage)
  const t = useT()

  const label: Record<LanguageSetting, string> = {
    system: t.settings.general.system,
    en: t.settings.general.english,
    es: t.settings.general.spanish,
  }
  // Name of the language 'system' currently resolves to, shown as a hint.
  const detectedName = resolveLang('system') === 'es' ? t.settings.general.spanish : t.settings.general.english

  return (
    <div className="space-y-6">
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
      <ActivityPulse />
    </div>
  )
}
