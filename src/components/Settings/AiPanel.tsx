import { useEffect, useState, type ReactNode } from 'react'
import { Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { useAiChatStore } from '../../stores/aiChatStore'
import { useAiStore } from '../../stores/aiStore'
import { useNotesStore } from '../../stores/notesStore'
import { useT } from '../../i18n/useT'
import { plural } from '../../i18n/format'
import { LlmConfigView } from '../AiPanel/LlmConfigView'
import { SettingsListSection, SettingsToggle, settingsButtonClass } from './ui'
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
    </SettingsListSection>
  )
}

/** One "label | description | control" row of the section (the assistant form's 112px label
 *  column); the control sits at the end of the same line. */
function NotesRow({ label, description, children }: { label: string; description: string; children?: ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-3">
      <span className="text-xs font-mono font-semibold text-text">{label}</span>
      <p className="min-w-0 text-[11px] font-mono text-text-muted leading-relaxed">{description}</p>
      {children ? <div className="flex items-center justify-end">{children}</div> : <span />}
    </div>
  )
}
