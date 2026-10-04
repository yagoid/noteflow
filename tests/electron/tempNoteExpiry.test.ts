import { describe, it, expect } from 'vitest'
import { shouldRunExpiryCheck, type ActiveSyncState, type ExpiryTrigger } from '../../electron/tempNoteExpiry'

const noSync: ActiveSyncState = { backend: 'github', connected: false }
const github: ActiveSyncState = { backend: 'github', connected: true }
const cloud: ActiveSyncState = { backend: 'cloud', connected: true }

const pull = (
  backend: 'github' | 'cloud',
  errorCount = 0,
  incomplete = false,
): ExpiryTrigger => ({ kind: 'pull', backend, errorCount, incomplete })

describe('shouldRunExpiryCheck', () => {
  it('without sync, the timer runs the check (startup + every 60s, unchanged behaviour)', () => {
    expect(shouldRunExpiryCheck({ kind: 'timer' }, noSync)).toBe(true)
    expect(shouldRunExpiryCheck({ kind: 'timer' }, { backend: 'cloud', connected: false })).toBe(true)
  })

  it('without sync, a pull trigger is ignored (the timer owns the check)', () => {
    expect(shouldRunExpiryCheck(pull('github'), noSync)).toBe(false)
  })

  it('with sync connected, the timer never runs it — not at startup, not after resume', () => {
    expect(shouldRunExpiryCheck({ kind: 'timer' }, github)).toBe(false)
    expect(shouldRunExpiryCheck({ kind: 'timer' }, cloud)).toBe(false)
  })

  it('with sync connected, runs right after a complete pull of the active backend', () => {
    expect(shouldRunExpiryCheck(pull('github'), github)).toBe(true)
    expect(shouldRunExpiryCheck(pull('cloud'), cloud)).toBe(true)
  })

  it('a pull with ANY error does not run it (offline / locked keys / per-folder failure)', () => {
    expect(shouldRunExpiryCheck(pull('github', 1), github)).toBe(false)
    expect(shouldRunExpiryCheck(pull('cloud', 3), cloud)).toBe(false)
  })

  it('an error-free but INCOMPLETE pull does not run it (truncated tree / swallowed note.md GET)', () => {
    expect(shouldRunExpiryCheck(pull('github', 0, true), github)).toBe(false)
    expect(shouldRunExpiryCheck(pull('cloud', 0, true), cloud)).toBe(false)
  })

  it('a pull of the NON-active backend does not run it (manual GitHub pull while Cloud is active)', () => {
    expect(shouldRunExpiryCheck(pull('github'), cloud)).toBe(false)
    expect(shouldRunExpiryCheck(pull('cloud'), github)).toBe(false)
  })
})
