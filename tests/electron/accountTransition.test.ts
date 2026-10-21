import { describe, it, expect } from 'vitest'
import {
  planAccountTransition,
  parseAccountRestore,
  clearRestoreSurface,
  stepAiEntitlementBaseline,
  NO_AI_BASELINE,
  type AiEntitlementBaseline,
  type AccountLocalState,
  type AccountObservation,
  type AccountRestoreRecord,
} from '../../electron/accountTransition'

const SIGNED_OUT = { signedIn: false, identity: null }
const SIGNED_IN = { signedIn: true, identity: 'user@example.com' }

function observation(patch: Partial<AccountObservation> = {}): AccountObservation {
  return {
    signedIn: true,
    identity: 'user@example.com',
    entitlements: { ai: true, cloud: true },
    entitlementsKnown: true,
    ...patch,
  }
}

function local(patch: Partial<AccountLocalState> = {}): AccountLocalState {
  return {
    cloudEnabled: false,
    aiManaged: false,
    aiFallbackProvider: 'anthropic',
    restore: null,
    ...patch,
  }
}

function record(patch: Partial<AccountRestoreRecord> = {}): AccountRestoreRecord {
  return { identity: 'user@example.com', cloudEnabled: true, aiManaged: true, ...patch }
}

describe('planAccountTransition — sign-out', () => {
  it('tears down Cloud + the managed assistant and remembers both', () => {
    const plan = planAccountTransition(
      SIGNED_IN,
      observation({ signedIn: false, identity: null, entitlements: { ai: false, cloud: false }, entitlementsKnown: false }),
      local({ cloudEnabled: true, aiManaged: true, aiFallbackProvider: 'ollama' })
    )
    expect(plan).toEqual({
      disableCloud: true,
      resetKeys: true,
      enableCloud: false,
      setAiProvider: 'ollama',
      restore: { identity: 'user@example.com', cloudEnabled: true, aiManaged: true },
    })
  })

  it('always drops the DEK, even with nothing enabled', () => {
    const plan = planAccountTransition(
      SIGNED_IN,
      observation({ signedIn: false, identity: null, entitlementsKnown: false }),
      local()
    )
    expect(plan.resetKeys).toBe(true)
    expect(plan.disableCloud).toBe(false)
    expect(plan.setAiProvider).toBeNull()
    expect(plan.restore).toEqual({ identity: 'user@example.com', cloudEnabled: false, aiManaged: false })
  })

  it('leaves a BYO assistant alone (only the managed plan is reverted)', () => {
    const plan = planAccountTransition(
      SIGNED_IN,
      observation({ signedIn: false, identity: null, entitlementsKnown: false }),
      local({ cloudEnabled: true, aiManaged: false })
    )
    expect(plan.setAiProvider).toBeNull()
    expect(plan.restore).toEqual({ identity: 'user@example.com', cloudEnabled: true, aiManaged: false })
  })

  it('with no known identity clears the record instead of writing an unmatchable one', () => {
    const plan = planAccountTransition(
      { signedIn: true, identity: null },
      observation({ signedIn: false, identity: null, entitlementsKnown: false }),
      local({ cloudEnabled: true, aiManaged: true })
    )
    expect(plan.restore).toBeNull()
    expect(plan.resetKeys).toBe(true)
    expect(plan.disableCloud).toBe(true)
  })
})

describe('planAccountTransition — sign-in restore', () => {
  it('restores both halves when the identity matches and the entitlements are alive', () => {
    const plan = planAccountTransition(SIGNED_OUT, observation(), local({ restore: record() }))
    expect(plan).toEqual({
      disableCloud: false,
      resetKeys: false,
      enableCloud: true,
      setAiProvider: 'noteflow',
      restore: null,
    })
  })

  it('is case-insensitive on the email', () => {
    const plan = planAccountTransition(
      SIGNED_OUT,
      observation({ identity: 'User@Example.com' }),
      local({ restore: record() })
    )
    expect(plan.enableCloud).toBe(true)
    expect(plan.setAiProvider).toBe('noteflow')
  })

  it('restores only what the entitlements still allow, and consumes the record', () => {
    const plan = planAccountTransition(
      SIGNED_OUT,
      observation({ entitlements: { ai: false, cloud: true } }),
      local({ restore: record() })
    )
    expect(plan.enableCloud).toBe(true)
    expect(plan.setAiProvider).toBeNull()
    expect(plan.restore).toBeNull()
  })

  it('restores nothing when the subscriptions lapsed, but still consumes the record', () => {
    const plan = planAccountTransition(
      SIGNED_OUT,
      observation({ entitlements: { ai: false, cloud: false } }),
      local({ restore: record() })
    )
    expect(plan.enableCloud).toBe(false)
    expect(plan.setAiProvider).toBeNull()
    expect(plan.restore).toBeNull()
  })

  it('waits for the entitlements to land instead of dropping the record', () => {
    const plan = planAccountTransition(
      SIGNED_OUT,
      observation({ entitlements: { ai: false, cloud: false }, entitlementsKnown: false }),
      local({ restore: record() })
    )
    expect(plan).toEqual({ disableCloud: false, resetKeys: false, enableCloud: false, setAiProvider: null })
    expect(plan.restore).toBeUndefined() // record untouched — re-evaluated on the next status change
  })

  it('a different account gets a clean slate: the record is dropped, nothing is applied', () => {
    const plan = planAccountTransition(
      SIGNED_OUT,
      observation({ identity: 'other@example.com' }),
      local({ restore: record() })
    )
    expect(plan.enableCloud).toBe(false)
    expect(plan.setAiProvider).toBeNull()
    expect(plan.restore).toBeNull()
  })

  it('does not re-enable what is already on (idempotent)', () => {
    const plan = planAccountTransition(
      SIGNED_OUT,
      observation(),
      local({ cloudEnabled: true, aiManaged: true, restore: record() })
    )
    expect(plan.enableCloud).toBe(false)
    expect(plan.setAiProvider).toBeNull()
    expect(plan.restore).toBeNull()
  })

  it('drops a record that asks for nothing', () => {
    const plan = planAccountTransition(
      SIGNED_OUT,
      observation({ entitlementsKnown: false }),
      local({ restore: record({ cloudEnabled: false, aiManaged: false }) })
    )
    expect(plan.restore).toBeNull()
    expect(plan.enableCloud).toBe(false)
  })
})

describe('planAccountTransition — irrelevant status changes', () => {
  it('an entitlements refresh with no pending record does nothing', () => {
    const plan = planAccountTransition(SIGNED_IN, observation(), local({ cloudEnabled: true, aiManaged: true }))
    expect(plan).toEqual({ disableCloud: false, resetKeys: false, enableCloud: false, setAiProvider: null })
    expect(plan.restore).toBeUndefined()
  })

  it('losing an entitlement while signed in changes nothing (the feature is just offered again)', () => {
    const plan = planAccountTransition(
      SIGNED_IN,
      observation({ entitlements: { ai: false, cloud: false } }),
      local({ cloudEnabled: true, aiManaged: true })
    )
    expect(plan.disableCloud).toBe(false)
    expect(plan.resetKeys).toBe(false)
    expect(plan.setAiProvider).toBeNull()
  })

  it('a status change while signed out keeps the pending record waiting', () => {
    const plan = planAccountTransition(
      SIGNED_OUT,
      observation({ signedIn: false, identity: null, entitlementsKnown: false }),
      local({ restore: record() })
    )
    expect(plan).toEqual({ disableCloud: false, resetKeys: false, enableCloud: false, setAiProvider: null })
    expect(plan.restore).toBeUndefined()
  })
})

describe('clearRestoreSurface — an explicit user action overrules the pending record', () => {
  it('drops only the touched half and keeps the other one waiting', () => {
    expect(clearRestoreSurface(record(), true, 'cloud')).toEqual({
      identity: 'user@example.com',
      cloudEnabled: false,
      aiManaged: true,
    })
    expect(clearRestoreSurface(record(), true, 'ai')).toEqual({
      identity: 'user@example.com',
      cloudEnabled: true,
      aiManaged: false,
    })
  })

  it('deletes the record once nothing is left to restore', () => {
    expect(clearRestoreSurface(record({ aiManaged: false }), true, 'cloud')).toBeNull()
    expect(clearRestoreSurface(record({ cloudEnabled: false }), true, 'ai')).toBeNull()
  })

  it('does nothing while signed out, or with no record / no pending half', () => {
    expect(clearRestoreSurface(record(), false, 'cloud')).toBeUndefined()
    expect(clearRestoreSurface(null, true, 'cloud')).toBeUndefined()
    expect(clearRestoreSurface(record({ cloudEnabled: false }), true, 'cloud')).toBeUndefined()
  })

  it('a later entitlements refresh cannot re-enable what the user just turned off', () => {
    // Signed in offline (entitlements unknown) → record kept…
    const pending = record()
    expect(
      planAccountTransition(
        SIGNED_OUT,
        observation({ entitlementsKnown: false, entitlements: { ai: false, cloud: false } }),
        local({ restore: pending })
      ).restore
    ).toBeUndefined()
    // …user explicitly disables Cloud (IPC cloud:disable) …
    const narrowed = clearRestoreSurface(pending, true, 'cloud')
    expect(narrowed).toEqual({ identity: 'user@example.com', cloudEnabled: false, aiManaged: true })
    // …and when the entitlements finally land, only the assistant is restored.
    const plan = planAccountTransition(SIGNED_IN, observation(), local({ restore: narrowed as AccountRestoreRecord }))
    expect(plan.enableCloud).toBe(false)
    expect(plan.setAiProvider).toBe('noteflow')
    expect(plan.restore).toBeNull()
  })
})

describe('parseAccountRestore', () => {
  it('accepts a well-formed record', () => {
    expect(parseAccountRestore({ identity: 'a@b.c', cloudEnabled: true, aiManaged: false })).toEqual({
      identity: 'a@b.c',
      cloudEnabled: true,
      aiManaged: false,
    })
  })

  it('coerces missing/garbage flags to false', () => {
    expect(parseAccountRestore({ identity: 'a@b.c', cloudEnabled: 'yes' })).toEqual({
      identity: 'a@b.c',
      cloudEnabled: false,
      aiManaged: false,
    })
  })

  it('rejects anything without an identity', () => {
    expect(parseAccountRestore(null)).toBeNull()
    expect(parseAccountRestore(undefined)).toBeNull()
    expect(parseAccountRestore('nope')).toBeNull()
    expect(parseAccountRestore({ cloudEnabled: true })).toBeNull()
    expect(parseAccountRestore({ identity: '' })).toBeNull()
  })
})

describe('stepAiEntitlementBaseline — auto-switch to NoteFlow AI on subscribe', () => {
  const ME = 'user@example.com'
  type Obs = Parameters<typeof stepAiEntitlementBaseline>[1]
  /** Feeds a sequence of observations and returns the autoSwitch flags. */
  function run(observations: Obs[], start: AiEntitlementBaseline = NO_AI_BASELINE): boolean[] {
    let state = start
    return observations.map((obs) => {
      const step = stepAiEntitlementBaseline(state, obs)
      state = step.next
      return step.autoSwitch
    })
  }

  it('fires on a fresh false → true for the same identity', () => {
    expect(run([
      { identity: ME, ai: false, fresh: true },
      { identity: ME, ai: true, fresh: true },
    ])).toEqual([false, true])
  })

  it('never fires on the first observation of an identity (boot of a subscribed user)', () => {
    expect(run([{ identity: ME, ai: true, fresh: true }])).toEqual([false])
  })

  it('unknown → true is NOT a transition', () => {
    expect(run([
      { identity: ME, ai: false, fresh: false }, // placeholder: never fetched
      { identity: ME, ai: true, fresh: true },
    ])).toEqual([false, false])
  })

  it('a cached false (not fetched this run) is not a baseline either', () => {
    expect(run([
      { identity: ME, ai: false, fresh: false }, // restored from settings.json
      { identity: ME, ai: true, fresh: true },   // subscribed while the app was closed
    ])).toEqual([false, false])
  })

  it('an unknown observation in between does not erase a known false', () => {
    expect(run([
      { identity: ME, ai: false, fresh: true },
      { identity: ME, ai: false, fresh: false },
      { identity: ME, ai: true, fresh: true },
    ])).toEqual([false, false, true])
  })

  it('fires only once', () => {
    expect(run([
      { identity: ME, ai: false, fresh: true },
      { identity: ME, ai: true, fresh: true },
      { identity: ME, ai: true, fresh: true },
    ])).toEqual([false, true, false])
  })

  it('an identity change re-establishes the baseline instead of firing', () => {
    expect(run([
      { identity: 'a@example.com', ai: false, fresh: true },
      { identity: null, ai: false, fresh: false },
      { identity: 'b@example.com', ai: true, fresh: true },
    ])).toEqual([false, false, false])
  })

  it('signing out and back in as the same user does not carry the old false over', () => {
    expect(run([
      { identity: ME, ai: false, fresh: true },
      { identity: null, ai: false, fresh: false },
      { identity: ME, ai: true, fresh: true },
    ])).toEqual([false, false, false])
  })
})
