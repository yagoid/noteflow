import { describe, it, expect } from 'vitest'
import { planChangeOutcome } from '../../electron/planChange'

const fnError = (code: string) => ({ error: { message: 'x', code } })

describe('planChangeOutcome — billing-change-plan answer → AccountErrorCode', () => {
  it('success only for a 200 with ok:true', () => {
    expect(planChangeOutcome(200, { ok: true, product: 'bundle', changed: true })).toEqual({ ok: true, changed: true })
    expect(planChangeOutcome(200, { ok: true, product: 'bundle', changed: false })).toEqual({ ok: true, changed: false })
    // A 200 without ok:true (or a 2xx that isn't 200) is not a success.
    expect(planChangeOutcome(200, {}).ok).toBe(false)
    expect(planChangeOutcome(200, null).ok).toBe(false)
    expect(planChangeOutcome(201, { ok: true }).ok).toBe(false)
  })

  it('an inactive LS subscription asks the user to resume / fix the payment', () => {
    expect(planChangeOutcome(409, fnError('subscription_not_active'))).toEqual({
      ok: false,
      errorCode: 'planChangeSubscriptionInactive',
      serverCode: 'subscription_not_active',
    })
  })

  it('nothing upgradable → not eligible', () => {
    for (const code of ['no_subscription', 'already_entitled', 'multiple_subscriptions', 'unsupported_plan']) {
      expect(planChangeOutcome(409, fnError(code)), code).toMatchObject({ ok: false, errorCode: 'planChangeNotEligible' })
    }
  })

  it('everything else (function missing, LS down, config, auth) → unavailable, keeping the server code', () => {
    expect(planChangeOutcome(502, fnError('provider_error'))).toEqual({
      ok: false,
      errorCode: 'planChangeUnavailable',
      serverCode: 'provider_error',
    })
    expect(planChangeOutcome(401, fnError('invalid_token'))).toMatchObject({ errorCode: 'planChangeUnavailable' })
    expect(planChangeOutcome(404, null)).toEqual({ ok: false, errorCode: 'planChangeUnavailable', serverCode: 'unknown' })
    expect(planChangeOutcome(500, 'oops')).toMatchObject({ errorCode: 'planChangeUnavailable' })
  })
})
