import { describe, it, expect } from 'vitest'
import { deleteAccountOutcome } from '../../electron/deleteAccount'

const fnError = (error: string) => ({ error, message: 'x' })

describe('deleteAccountOutcome — delete-account answer → what the app does', () => {
  it('any 2xx means deleted (also "already deleted", which the function answers 200)', () => {
    expect(deleteAccountOutcome(200, { ok: true })).toBe('deleted')
    expect(deleteAccountOutcome(200, null)).toBe('deleted')
    expect(deleteAccountOutcome(204, null)).toBe('deleted')
  })

  it('401 is an access token the function did not accept (retried once with a fresh one)', () => {
    expect(deleteAccountOutcome(401, fnError('invalid_token'))).toBe('unauthorized')
    expect(deleteAccountOutcome(401, fnError('missing_token'))).toBe('unauthorized')
    expect(deleteAccountOutcome(401, null)).toBe('unauthorized')
  })

  it('502 billing_cancel_failed: the subscription was not cancelled, so nothing was deleted', () => {
    expect(deleteAccountOutcome(502, fnError('billing_cancel_failed'))).toBe('billingFailed')
  })

  it('a 502 without that body (gateway error) is a plain, retryable failure', () => {
    expect(deleteAccountOutcome(502, null)).toBe('failed')
    expect(deleteAccountOutcome(502, fnError('something_else'))).toBe('failed')
  })

  it('500s, a missing function (404) and anything unexpected are retryable failures', () => {
    for (const code of ['auth_unreachable', 'query_failed', 'delete_failed', 'not_configured']) {
      expect(deleteAccountOutcome(500, fnError(code)), code).toBe('failed')
    }
    expect(deleteAccountOutcome(404, null)).toBe('failed')
    expect(deleteAccountOutcome(405, fnError('method_not_allowed'))).toBe('failed')
    expect(deleteAccountOutcome(302, null)).toBe('failed')
  })
})
