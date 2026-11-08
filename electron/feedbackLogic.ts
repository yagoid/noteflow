// In-app feedback (Settings → About → "Send feedback") — pure logic, no
// Electron/network imports so it is unit-tested (tests/electron/feedbackLogic.test.ts).
//
// The renderer hands main an untrusted payload over IPC; normalizeFeedback
// validates it with the SAME limits the public.feedback table enforces
// (supabase/migrations/0015_feedback.sql), so a row that passes here is never
// rejected by a CHECK constraint. buildFeedbackRow turns it into the PostgREST
// body (snake_case columns of the table). feedback.ts does the IO.

export type FeedbackKind = 'bug' | 'suggestion' | 'other'

export const FEEDBACK_KINDS: readonly FeedbackKind[] = ['bug', 'suggestion', 'other']

/** Max message length (after trimming). Mirrors the CHECK in 0015 and the UI textarea maxLength. */
export const FEEDBACK_MESSAGE_MAX = 5000

/** Max contact (email) length — the longest valid email address. Mirrors 0015. */
export const FEEDBACK_CONTACT_MAX = 254

/** Max length of each diagnostic column. Mirrors the CHECKs in 0015. */
export const FEEDBACK_DIAG_MAX = {
  appVersion: 64,
  platform: 64,
  osVersion: 128,
  locale: 64,
} as const

/** Why a send failed — the renderer localizes it. */
export type FeedbackFailureReason = 'invalid' | 'network' | 'server'

export type FeedbackSendResult = { ok: true } | { ok: false; reason: FeedbackFailureReason }

/** A validated payload, ready to become a row. */
export interface NormalizedFeedback {
  kind: FeedbackKind
  message: string
  contact: string | null
  includeDiagnostics: boolean
}

/** Diagnostics collected by main (never by the renderer) when the user opts in. */
export interface FeedbackDiagnostics {
  appVersion: string
  platform: string
  osVersion: string
  locale: string
}

/** Body of the POST /rest/v1/feedback — only the columns the client is granted. */
export interface FeedbackRow {
  kind: FeedbackKind
  message: string
  contact: string | null
  app_version: string | null
  platform: string | null
  os_version: string | null
  locale: string | null
}

// Postgres `text` cannot store NUL (PostgREST answers 400), so strip it up front.
function stripNul(value: string): string {
  return value.split('\u0000').join('')
}

/**
 * Lax email check: something@something.tld, no whitespace. Deliberately
 * permissive — the address is only a courtesy for the operator to reply, and a
 * stricter regex would reject valid addresses. The About panel mirrors it to
 * flag the field before sending.
 */
export function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

/**
 * Validates and normalizes the renderer's payload: kind must be a known one,
 * message is trimmed and must be 1..FEEDBACK_MESSAGE_MAX characters, contact is
 * optional (empty → null) but, when present, must look like an email and fit
 * FEEDBACK_CONTACT_MAX. Only `includeDiagnostics === true` opts in.
 */
export function normalizeFeedback(input: unknown): NormalizedFeedback | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>

  const kind = raw.kind
  if (typeof kind !== 'string' || !(FEEDBACK_KINDS as readonly string[]).includes(kind)) return null

  if (typeof raw.message !== 'string') return null
  const message = stripNul(raw.message).trim()
  if (message.length === 0 || message.length > FEEDBACK_MESSAGE_MAX) return null

  let contact: string | null = null
  if (raw.contact !== undefined && raw.contact !== null) {
    if (typeof raw.contact !== 'string') return null
    const trimmed = stripNul(raw.contact).trim()
    if (trimmed.length > 0) {
      if (trimmed.length > FEEDBACK_CONTACT_MAX || !isPlausibleEmail(trimmed)) return null
      contact = trimmed
    }
  }

  return {
    kind: kind as FeedbackKind,
    message,
    contact,
    includeDiagnostics: raw.includeDiagnostics === true,
  }
}

// Diagnostic values come from main, but clip them anyway so an odd OS string
// can never trip the table's length CHECKs (that would lose the whole report).
function clipDiag(value: string, max: number): string | null {
  const clean = stripNul(value).trim()
  return clean.length > 0 ? clean.slice(0, max) : null
}

/** PostgREST body: diagnostics only when the user opted in AND main provided them. */
export function buildFeedbackRow(
  feedback: NormalizedFeedback,
  diagnostics: FeedbackDiagnostics | null
): FeedbackRow {
  const diag = feedback.includeDiagnostics ? diagnostics : null
  return {
    kind: feedback.kind,
    message: feedback.message,
    contact: feedback.contact,
    app_version: diag ? clipDiag(diag.appVersion, FEEDBACK_DIAG_MAX.appVersion) : null,
    platform: diag ? clipDiag(diag.platform, FEEDBACK_DIAG_MAX.platform) : null,
    os_version: diag ? clipDiag(diag.osVersion, FEEDBACK_DIAG_MAX.osVersion) : null,
    locale: diag ? clipDiag(diag.locale, FEEDBACK_DIAG_MAX.locale) : null,
  }
}

/**
 * What to do with PostgREST's answer to the insert:
 *   - 2xx → 'ok' (201 with `Prefer: return=minimal`).
 *   - 401 while sending WITH the user's access token → 'retry-anonymous-invalidate':
 *     the token itself was rejected (expired/revoked between minting and use).
 *     Drop it (account.invalidateAccessToken — that contract is 401-only) and
 *     resend without it: feedback must not depend on the account.
 *   - 403 while sending WITH the token → 'retry-anonymous': authorization was
 *     refused for this role, which says nothing about the token's validity, so
 *     keep it and just resend anonymously.
 *   - anything else → 'server'.
 */
export function classifyFeedbackResponse(
  status: number,
  sentWithToken: boolean
): 'ok' | 'retry-anonymous-invalidate' | 'retry-anonymous' | 'server' {
  if (status >= 200 && status < 300) return 'ok'
  if (sentWithToken && status === 401) return 'retry-anonymous-invalidate'
  if (sentWithToken && status === 403) return 'retry-anonymous'
  return 'server'
}
