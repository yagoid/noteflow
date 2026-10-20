import { describe, it, expect } from 'vitest'
import { managedProxyErrorKind } from '../../electron/ai/llm/managedErrors'

// Shapes as thrown by OpenAiCompatibleProvider for a non-2xx response, with the
// OpenAI-shaped bodies the ai-proxy Edge Function sends.
const body401 = '{"error":{"message":"Invalid or expired NoteFlow session.","type":"authentication_error","code":"invalid_token"}}'
const body403 = '{"error":{"message":"NoteFlow AI requires an active subscription.","type":"permission_error","code":"subscription_required"}}'

describe('managedProxyErrorKind', () => {
  it('maps a 401 to "sign in again"', () => {
    expect(managedProxyErrorKind(`HTTP 401 Unauthorized — ${body401}`)).toBe('signInAgain')
    expect(managedProxyErrorKind('HTTP 401 ')).toBe('signInAgain')
  })

  it('maps a 403 to "subscription inactive"', () => {
    expect(managedProxyErrorKind(`HTTP 403 Forbidden — ${body403}`)).toBe('subscriptionInactive')
    expect(managedProxyErrorKind('HTTP 403 Forbidden')).toBe('subscriptionInactive')
  })

  it('recognizes the proxy machine codes without the status prefix', () => {
    expect(managedProxyErrorKind(`Stream error — ${body403}`)).toBe('subscriptionInactive')
    expect(managedProxyErrorKind(`something ${body401}`)).toBe('signInAgain')
  })

  it('only reads a LEADING status', () => {
    expect(managedProxyErrorKind('The model said HTTP 403 somewhere')).toBeNull()
    expect(managedProxyErrorKind('HTTP 4031 nonsense')).toBeNull()
  })

  it('leaves everything else alone (429 quota, 5xx, network)', () => {
    expect(managedProxyErrorKind('HTTP 429 Too Many Requests — {"error":{"code":"monthly_quota_exceeded"}}')).toBeNull()
    expect(managedProxyErrorKind('HTTP 500 Internal Server Error')).toBeNull()
    expect(managedProxyErrorKind('fetch failed')).toBeNull()
  })
})
