import { useLanguageStore } from '../../stores/languageStore'
import { resolveLang } from '../../i18n'
import { tf } from '../../i18n/format'
import { useT } from '../../i18n/useT'
import type { LanguageSetting } from '../../i18n'
import { ActivitySummary } from './ActivitySummary'
import { SettingsSegmented } from './ui'

const OPTIONS: LanguageSetting[] = ['system', 'en', 'es']

// Local AI, the profile and the CLI skill moved to Settings → AI ("Your notes and AI").
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
        <SettingsSegmented
          label={t.settings.general.language}
          options={OPTIONS.map((opt) => ({ value: opt, label: label[opt] }))}
          value={setting}
          onChange={setLanguage}
        />
      </section>

      {/* Activity: totals cards + the notes touched on the most days lately */}
      <section className="pt-2">
        <ActivitySummary />
      </section>
    </div>
  )
}
