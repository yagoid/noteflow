import { describe, it, expect } from 'vitest'
import {
  accessTokenError,
  isAccessTokenError,
  classifyCloudAccessError,
  cloudAccessErrorMessage,
  NOT_SIGNED_IN_TAG,
  ACCOUNT_UNREACHABLE_TAG,
  SESSION_LOCKED_TAG,
} from '../../electron/cloudAccessErrors'

const MESSAGES = { notSignedIn: 'sign in', unreachable: 'offline', locked: 'locked' }

describe('accessTokenError', () => {
  it('tags each token failure reason', () => {
    expect(accessTokenError('noSession').message).toBe(NOT_SIGNED_IN_TAG)
    expect(accessTokenError('network').message).toBe(ACCOUNT_UNREACHABLE_TAG)
    expect(accessTokenError('server').message).toBe(ACCOUNT_UNREACHABLE_TAG)
    expect(accessTokenError('locked').message).toBe(SESSION_LOCKED_TAG)
  })

  it('is recognised by isAccessTokenError, also when wrapped', () => {
    for (const reason of ['noSession', 'network', 'server', 'locked'] as const) {
      const err = accessTokenError(reason)
      expect(isAccessTokenError(err)).toBe(true)
      expect(isAccessTokenError(new Error(`pull failed: ${String(err)}`))).toBe(true)
    }
    expect(isAccessTokenError(new Error('HTTP 500'))).toBe(false)
    expect(isAccessTokenError(new TypeError('fetch failed'))).toBe(false)
  })
})

describe('classifyCloudAccessError / cloudAccessErrorMessage', () => {
  it('only reports "sign in" when there is no session', () => {
    expect(cloudAccessErrorMessage(accessTokenError('noSession'), MESSAGES)).toBe('sign in')
    expect(cloudAccessErrorMessage(accessTokenError('network'), MESSAGES)).toBe('offline')
    expect(cloudAccessErrorMessage(accessTokenError('server'), MESSAGES)).toBe('offline')
    expect(cloudAccessErrorMessage(accessTokenError('locked'), MESSAGES)).toBe('locked')
  })

  it('treats a fetch that never got an answer as unreachable', () => {
    expect(classifyCloudAccessError(new TypeError('fetch failed'))).toBe('unreachable')
    const timeout = new Error('The operation was aborted due to timeout')
    timeout.name = 'TimeoutError'
    expect(classifyCloudAccessError(timeout)).toBe('unreachable')
  })

  it('leaves other errors to the caller', () => {
    expect(classifyCloudAccessError(new Error('Cloud pull failed (HTTP 500)'))).toBeNull()
    expect(classifyCloudAccessError(new TypeError('x is not a function'))).toBeNull()
    expect(classifyCloudAccessError('boom')).toBeNull()
    expect(cloudAccessErrorMessage(new Error('decrypt failed'), MESSAGES)).toBeNull()
  })
})
