import { useEffect } from 'react'
import { useAiChatStore } from '../../stores/aiChatStore'
import { LlmConfigView } from '../AiPanel/LlmConfigView'
import type { SettingsIntent } from './SettingsModal'

export function AiPanel({ intent }: { intent?: SettingsIntent }) {
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
      {/* ── Assistant (LLM provider) — no title: LlmConfigView opens with its own
             status line and the three source cards. Local AI, the profile and the
             CLI skill toggle live in Settings → General. ── */}
      <section>
        <LlmConfigView embedded initialOffer={initialOffer} />
      </section>
    </div>
  )
}
