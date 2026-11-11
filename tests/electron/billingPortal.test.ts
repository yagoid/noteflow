import { describe, it, expect } from 'vitest'
import {
  parseBillingPortalUrl,
  deriveStorePortalUrl,
  portalUrlFromFunctionResponse,
  portalErrorCode,
} from '../../electron/billingPortal'
import { LEMONSQUEEZY_CHECKOUT_URLS, LEMONSQUEEZY_STORE_PORTAL_URL } from '../../electron/cloudConfig'

const PORTAL = 'https://noteflow-app.lemonsqueezy.com/billing?expires=1&signature=abc'

describe('parseBillingPortalUrl — the allowlist shell.openExternal relies on', () => {
  it('accepts https on lemonsqueezy.com and its subdomains', () => {
    expect(parseBillingPortalUrl(PORTAL)?.toString()).toBe(PORTAL)
    expect(parseBillingPortalUrl('https://lemonsqueezy.com/billing')).not.toBeNull()
    expect(parseBillingPortalUrl('https://NoteFlow-App.LemonSqueezy.com/billing')).not.toBeNull()
  })

  it('rejects other schemes, hosts, look-alikes, credentials and ports', () => {
    for (const bad of [
      'http://noteflow-app.lemonsqueezy.com/billing',
      'file:///C:/Windows/system32/calc.exe',
      'javascript:alert(1)',
      'https://lemonsqueezy.com.evil.example/billing',
      'https://evillemonsqueezy.com/billing',
      'https://user:pw@noteflow-app.lemonsqueezy.com/billing',
      'https://noteflow-app.lemonsqueezy.com:444/billing',
      'not a url',
      '',
      undefined,
      null,
      42,
    ]) {
      expect(parseBillingPortalUrl(bad), String(bad)).toBeNull()
    }
  })
})

describe('deriveStorePortalUrl', () => {
  it('builds <store>.lemonsqueezy.com/billing from the first checkout URL', () => {
    expect(
      deriveStorePortalUrl(['https://my-store.lemonsqueezy.com/checkout/buy/abc', 'https://other.lemonsqueezy.com/x'])
    ).toBe('https://my-store.lemonsqueezy.com/billing')
  })

  it('skips empty, invalid and apex URLs', () => {
    expect(deriveStorePortalUrl(['', 'nope', 'https://lemonsqueezy.com/x', 'https://s.lemonsqueezy.com/y'])).toBe(
      'https://s.lemonsqueezy.com/billing'
    )
  })

  it("'' when no usable checkout URL is configured", () => {
    expect(deriveStorePortalUrl([])).toBe('')
    expect(deriveStorePortalUrl(['', ''])).toBe('')
    expect(deriveStorePortalUrl(['https://evil.example/checkout/buy/x'])).toBe('')
  })

  it('the shipped constant is the store of the configured checkout URLs', () => {
    const configured = Object.values(LEMONSQUEEZY_CHECKOUT_URLS).filter(Boolean)
    if (configured.length === 0) {
      expect(LEMONSQUEEZY_STORE_PORTAL_URL).toBe('')
      return
    }
    const host = new URL(configured[0]).hostname
    expect(LEMONSQUEEZY_STORE_PORTAL_URL).toBe(`https://${host}/billing`)
    expect(parseBillingPortalUrl(LEMONSQUEEZY_STORE_PORTAL_URL)).not.toBeNull()
  })
})

describe('portalUrlFromFunctionResponse', () => {
  it('returns the URL of a 200 {url} answer', () => {
    expect(portalUrlFromFunctionResponse(200, { url: PORTAL })?.toString()).toBe(PORTAL)
  })

  it('null for errors, missing/foreign URLs and non-JSON bodies', () => {
    expect(portalUrlFromFunctionResponse(404, { error: { code: 'no_subscription' } })).toBeNull()
    expect(portalUrlFromFunctionResponse(200, { url: 'https://evil.example/billing' })).toBeNull()
    expect(portalUrlFromFunctionResponse(200, {})).toBeNull()
    expect(portalUrlFromFunctionResponse(200, null)).toBeNull()
    expect(portalUrlFromFunctionResponse(201, { url: PORTAL })).toBeNull()
  })

  it('portalErrorCode reads error.code for the logs', () => {
    expect(portalErrorCode({ error: { code: 'no_subscription', message: 'x' } })).toBe('no_subscription')
    expect(portalErrorCode(null)).toBe('unknown')
    expect(portalErrorCode({ msg: 'not found' })).toBe('unknown')
  })
})
