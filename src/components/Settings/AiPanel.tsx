import { useEffect } from 'react'
import { useAiChatStore } from '../../stores/aiChatStore'
import { LlmConfigView } from '../AiPanel/LlmConfigView'
import type { SettingsSection } from './SettingsModal'

export function AiPanel({ onNavigate }: { onNavigate?: (section: SettingsSection) => void }) {
  const loadConfig = useAiChatStore((s) => s.loadConfig)
  const configLoaded = useAiChatStore((s) => s.configLoaded)

  // The LLM config is normally loaded by the brain panel; load it here too in case the
  // user jumps straight to Settings → AI without ever opening the brain view.
  useEffect(() => {
    if (!configLoaded) void loadConfig()
  }, [configLoaded, loadConfig])

  return (
    <div className="space-y-6">
      {/* ── Assistant (LLM provider) — no title: LlmConfigView opens with its own
             "pick one source" line, followed by the two source cards. Local AI, the
             profile and the CLI skill toggle live in Settings → General. ── */}
      <section>
        <LlmConfigView embedded onNavigate={onNavigate} />
      </section>
    </div>
  )
}
