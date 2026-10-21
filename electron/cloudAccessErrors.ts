// Why a NoteFlow Cloud request could not even be sent — pure, imports nothing
// from Electron. Covered by tests/electron/cloudAccessErrors.test.ts.
//
// cloudKeys.supabaseRest / callCloudKeysFn need a fresh access token per call.
// When account.getAccessTokenResult() can't produce one, they throw an Error
// whose message is a stable TAG per failure reason, so callers (cloudKeys'
// catch blocks, the cloudSync pull) can tell "signed out" apart from "offline"
// and "keychain locked" — a session that just can't reach the server must
// never be reported as "sign in first". Callers match with String(err), so the
// tags survive being wrapped in another message.

import type { AccessTokenFailure } from './account'

export const NOT_SIGNED_IN_TAG = 'not-signed-in'
export const ACCOUNT_UNREACHABLE_TAG = 'account-unreachable'
export const SESSION_LOCKED_TAG = 'session-locked'

/** Error to throw when no access token could be obtained, tagged by reason. */
export function accessTokenError(reason: AccessTokenFailure): Error {
  switch (reason) {
    case 'noSession':
      return new Error(NOT_SIGNED_IN_TAG)
    case 'locked':
      return new Error(SESSION_LOCKED_TAG)
    case 'network':
    case 'server':
      return new Error(ACCOUNT_UNREACHABLE_TAG)
  }
}

export type CloudAccessErrorKind = 'notSignedIn' | 'unreachable' | 'locked'

/** True for the errors thrown by accessTokenError (any reason). */
export function isAccessTokenError(err: unknown): boolean {
  const text = String(err)
  return (
    text.includes(NOT_SIGNED_IN_TAG) ||
    text.includes(ACCOUNT_UNREACHABLE_TAG) ||
    text.includes(SESSION_LOCKED_TAG)
  )
}

/**
 * Network-level failure of a fetch() itself (no HTTP answer at all): undici's
 * `TypeError: fetch failed` (offline, DNS, refused connection) or the
 * AbortSignal.timeout of the REST helpers.
 */
function isFetchNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  if (err.name === 'TimeoutError' || err.name === 'AbortError') return true
  return err instanceof TypeError && /fetch failed/i.test(err.message)
}

/**
 * Classifies an error caught around a Cloud request: signed out, unreachable
 * (token refresh failed on network/server, or the request itself never got an
 * answer) or keychain-locked session. Null for anything else (HTTP errors,
 * decrypt failures, …) — the caller keeps its own message for those.
 */
export function classifyCloudAccessError(err: unknown): CloudAccessErrorKind | null {
  const text = String(err)
  if (text.includes(NOT_SIGNED_IN_TAG)) return 'notSignedIn'
  if (text.includes(SESSION_LOCKED_TAG)) return 'locked'
  if (text.includes(ACCOUNT_UNREACHABLE_TAG)) return 'unreachable'
  if (isFetchNetworkError(err)) return 'unreachable'
  return null
}

export type CloudAccessErrorMessages = Record<CloudAccessErrorKind, string>

/** User-facing message for a classified access error, or null (see classifyCloudAccessError). */
export function cloudAccessErrorMessage(err: unknown, messages: CloudAccessErrorMessages): string | null {
  const kind = classifyCloudAccessError(err)
  return kind ? messages[kind] : null
}

/** Shown by the Cloud sync status when the server can't be reached. */
export const CLOUD_UNREACHABLE_ERROR =
  "Can't reach NoteFlow Cloud — check your connection. Your notes are safe and will sync when you're back online."

/** Same wording as account.ts SESSION_LOCKED_ERROR (keychain-locked refresh token). */
export const CLOUD_SESSION_LOCKED_ERROR =
  "Couldn't unlock your saved session. Your system keychain may be locked."
