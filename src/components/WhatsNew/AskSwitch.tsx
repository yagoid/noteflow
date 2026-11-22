import { useEffect, useState } from 'react'
import { useT } from '../../i18n/useT'
import { useAgentTasksStore } from '../../stores/agentTasksStore'
import type { WhatsNewSlide } from './whatsNewSlides'

// A question answered right on a tour slide (`ask` in whatsNewSlides.ts): the question,
// then ONE big switch whose label says what it does / that it is done, and a muted line
// under it. Today only the agent-tasks slide asks ("do you use coding agents?"): the
// switch is the same local, per-device setting as Settings → AI → Agent tasks, so it
// shows its real state (also on a replay) and turns it off again too.
// Keys: the tour lets Enter/Space on a focused button act natively (WhatsNewTour.tsx).
// aria-disabled, not disabled, while the settings load: a focused button that becomes
// `disabled` drops focus to <body>. Visual language: index.css § "What's new" tour.

export function AskSwitch({ ask }: { ask: NonNullable<WhatsNewSlide['ask']> }) {
  // One kind of question so far; a new one gets its own branch here.
  if (ask === 'agentTasks') return <AgentTasksAsk />
  return null
}

function AgentTasksAsk() {
  const t = useT()
  const copy = t.whatsNew.agentTasksAsk
  const loaded = useAgentTasksStore((s) => s.settingsLoaded)
  const on = useAgentTasksStore((s) => s.settings.enabled)
  const ensureLoaded = useAgentTasksStore((s) => s.ensureLoaded)
  const setSettings = useAgentTasksStore((s) => s.setSettings)
  const [busy, setBusy] = useState(false)

  useEffect(() => { void ensureLoaded() }, [ensureLoaded])

  const inert = !loaded || busy
  const toggle = () => {
    if (inert) return
    setBusy(true)
    setSettings({ enabled: !on })
      .catch((err) => console.error('Failed to toggle agent tasks from the tour:', err))
      .finally(() => setBusy(false))
  }

  return (
    <div className="wn-ask">
      <p className="wn-ask-q">{copy.question}</p>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-disabled={inert || undefined}
        onClick={toggle}
        className="wn-ask-switch"
        data-on={on || undefined}
      >
        <span className="wn-ask-track" aria-hidden><span className="wn-ask-thumb" /></span>
        <span className="wn-ask-label font-mono">{on ? copy.on : copy.off}</span>
      </button>
      <p className="wn-ask-hint font-mono">{on ? copy.hintOn : copy.hintOff}</p>
    </div>
  )
}
