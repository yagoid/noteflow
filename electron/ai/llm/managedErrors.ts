// Classifies a raw chat error coming from the managed NoteFlow AI proxy, so
// main.ts (friendlyChatError) can show an actionable, localized message instead
// of `HTTP 403 Forbidden — {json}`. Pure (no electron imports) — covered by
// tests/electron/managedErrors.test.ts.
//
// The OpenAI-compatible provider throws `HTTP <status> <statusText> — <body>`
// for a non-2xx response (openaiCompatible.ts), and the proxy's body carries a
// stable machine code (supabase/functions/ai-proxy: `missing_token` /
// `invalid_token` with 401, `subscription_required` with 403). Either signal is
// enough: the status is read only from a LEADING "HTTP nnn" (so a number inside
// a model's text can't match) and the codes are matched as quoted JSON values.
//
// Only meaningful for the managed preset: for a BYO provider a 401/403 means a
// wrong API key and must keep its raw wording — the caller decides.

import type { ChatErrorMessages } from '../../i18n'

export type ManagedProxyErrorKind = 'signInAgain' | 'subscriptionInactive' | null

export function managedProxyErrorKind(raw: string): ManagedProxyErrorKind {
  const status = /^HTTP (\d{3})\b/.exec(raw.trim())?.[1]
  if (status === '401' || /"(missing_token|invalid_token)"/.test(raw)) return 'signInAgain'
  if (status === '403' || raw.includes('"subscription_required"')) return 'subscriptionInactive'
  return null
}

/**
 * User-facing reason why no access token could be minted for the managed preset
 * (account.getAccessTokenResult's failure). Only `noSession` means "sign in" —
 * offline, a locked keychain or a failing account service must not tell a
 * signed-in user to sign in again.
 */
export function managedTokenFailureMessage(
  reason: 'noSession' | 'network' | 'server' | 'locked',
  messages: Pick<ChatErrorMessages, 'managedNoSession' | 'managedOffline' | 'managedKeychainLocked' | 'managedServiceUnavailable'>
): string {
  if (reason === 'network') return messages.managedOffline
  if (reason === 'locked') return messages.managedKeychainLocked
  if (reason === 'server') return messages.managedServiceUnavailable
  return messages.managedNoSession
}
