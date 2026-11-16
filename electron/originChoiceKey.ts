// Opaque key of a pending origin choice (syncOrigin.ts): what the user is
// looking at in the OriginChoiceDialog. The renderer gets it with the choice
// (ActiveSyncStatus.originChoice.key) and sends it back with its answer, and
// main.ts answers 'not-pending' when the pending choice is no longer that one
// (another account signed in, the CLI switched the repo, the gate re-derived
// meanwhile…) — an answer is never applied to a choice the user didn't see.
// Pure, no Electron; tested in tests/electron/originChoiceKey.test.ts.

/** GitHub: the two repos (case-insensitive, like GitHub names) and whether the origin is stale. */
export function githubOriginChoiceKey(choice: {
  previous: { owner: string; repo: string }
  next: { owner: string; repo: string }
  stale?: true
}): string {
  const repo = (r: { owner: string; repo: string }) => `${r.owner}/${r.repo}`.toLowerCase()
  return ['github', choice.stale ? 'stale' : '', repo(choice.previous), repo(choice.next)].join('|')
}

/** NoteFlow Cloud: the two accounts (userId) and, for a stale origin, the repo the notes came from. */
export function cloudOriginChoiceKey(choice: {
  previous: { userId: string }
  next: { userId: string }
  stale?: true
  staleFrom?: { owner: string; repo: string }
}): string {
  const from = choice.staleFrom ? `${choice.staleFrom.owner}/${choice.staleFrom.repo}`.toLowerCase() : ''
  return ['cloud', choice.stale ? 'stale' : '', choice.previous.userId, choice.next.userId, from].join('|')
}

/**
 * Does the answer still match the pending choice? `sent` = the key the
 * renderer sent back (absent from older callers → not checked); `pending` =
 * the key of the choice pending now (null = none pending).
 */
export function originChoiceStillPending(sent: unknown, pending: string | null): boolean {
  if (pending === null) return false
  return typeof sent !== 'string' || sent === pending
}
