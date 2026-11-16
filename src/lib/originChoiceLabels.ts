// Display labels of a pending origin choice (ActiveSyncStatus.originChoice /
// OriginChoiceDialog). Main sends '' for a remote whose name it doesn't know —
// a NoteFlow account recorded before emails were, or a "stale" origin whose
// other sync left no name — and the UI shows a generic, localized text instead.
import type { Messages } from '../i18n'

export function originChoiceLabels(
  m: Messages['originChoice'],
  backend: 'github' | 'cloud',
  choice: { previous: string; next: string; stale?: boolean },
): { previous: string; next: string } {
  return {
    previous: choice.previous || (choice.stale || backend === 'github' ? m.unknownSync : m.unknownAccount),
    next: choice.next || (backend === 'cloud' ? m.unknownNextAccount : m.unknownSync),
  }
}
