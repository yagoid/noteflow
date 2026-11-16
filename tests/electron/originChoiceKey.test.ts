// electron/originChoiceKey.ts — the opaque key the renderer sends back with
// its answer to an origin choice: main applies the answer only while the
// pending choice is still the one the user saw.
import { describe, it, expect } from 'vitest'
import { cloudOriginChoiceKey, githubOriginChoiceKey, originChoiceStillPending } from '../../electron/originChoiceKey'

const gh = (prev: string, next: string, stale?: true) => ({
  previous: { owner: 'me', repo: prev },
  next: { owner: 'me', repo: next },
  ...(stale ? { stale } : {}),
})

describe('origin choice keys', () => {
  it('GitHub: both repos (case-insensitive, like GitHub) and the stale flag', () => {
    expect(githubOriginChoiceKey(gh('notes-a', 'notes-b'))).toBe(githubOriginChoiceKey(gh('Notes-A', 'NOTES-B')))
    expect(githubOriginChoiceKey(gh('notes-a', 'notes-b'))).not.toBe(githubOriginChoiceKey(gh('notes-a', 'notes-c')))
    expect(githubOriginChoiceKey(gh('notes-a', 'notes-a', true))).not.toBe(githubOriginChoiceKey(gh('notes-a', 'notes-a')))
  })
  it('Cloud: both accounts, the stale flag and the repo the notes came from', () => {
    const base = { previous: { userId: 'uA' }, next: { userId: 'uB' } }
    expect(cloudOriginChoiceKey(base)).not.toBe(cloudOriginChoiceKey({ ...base, next: { userId: 'uC' } }))
    expect(cloudOriginChoiceKey({ ...base, stale: true })).not.toBe(cloudOriginChoiceKey(base))
    expect(cloudOriginChoiceKey({ ...base, stale: true, staleFrom: { owner: 'me', repo: 'x' } }))
      .not.toBe(cloudOriginChoiceKey({ ...base, stale: true, staleFrom: { owner: 'me', repo: 'y' } }))
    expect(cloudOriginChoiceKey(base)).not.toBe(githubOriginChoiceKey(gh('uA', 'uB')))
  })
  it('an answer applies only to the choice still pending (no key = older caller, not checked)', () => {
    const key = cloudOriginChoiceKey({ previous: { userId: 'uA' }, next: { userId: 'uB' } })
    expect(originChoiceStillPending(key, key)).toBe(true)
    expect(originChoiceStillPending(key, cloudOriginChoiceKey({ previous: { userId: 'uA' }, next: { userId: 'uC' } }))).toBe(false)
    expect(originChoiceStillPending(key, null)).toBe(false)
    expect(originChoiceStillPending(undefined, key)).toBe(true)
    expect(originChoiceStillPending(undefined, null)).toBe(false)
  })
})
