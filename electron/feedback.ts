// In-app feedback (Settings → About → "Send feedback") — main-process IO.
//
// Inserts one row into public.feedback (supabase/migrations/0015_feedback.sql)
// via PostgREST. The table has an INSERT-only RLS policy for anon AND
// authenticated, so feedback NEVER requires a NoteFlow account:
//   - signed in  → sent with the user's access token (the row's user_id
//     defaults to auth.uid() server-side; the client never sends it);
//   - signed out, keychain locked, token refresh failing, or the request with
//     the token refused with 401/403 → sent anonymously (apikey only, like
//     account.ts' calls without a session). Only a 401 drops the token
//     (account.invalidateAccessToken's contract).
// `Prefer: return=minimal` because there is no SELECT policy (RETURNING would
// fail). Validation and the row shape live in feedbackLogic.ts (pure, tested).

import { app } from 'electron'
import * as account from './account'
import { SUPABASE_URL, SUPABASE_ANON_KEY, isCloudConfigured } from './cloudConfig'
import {
  normalizeFeedback,
  buildFeedbackRow,
  classifyFeedbackResponse,
  type FeedbackDiagnostics,
  type FeedbackRow,
  type FeedbackSendResult,
} from './feedbackLogic'

const FEEDBACK_TIMEOUT_MS = 15_000

/**
 * What "Include app and system version" sends: app version, OS + CPU arch, OS
 * version and the app's UI language. Deliberately NOT the OS locale (it
 * carries the region) — the privacy policy and the in-app text promise only
 * these fields. Nothing else — never note content, paths or identifiers.
 */
function collectDiagnostics(uiLanguage: string): FeedbackDiagnostics {
  let osVersion = ''
  try {
    osVersion = process.getSystemVersion()
  } catch {
    // Not fatal: the row just goes without it.
  }
  return {
    appVersion: app.getVersion(),
    platform: `${process.platform} ${process.arch}`,
    osVersion,
    locale: uiLanguage,
  }
}

/** The user's access token if there is a usable session; null otherwise (never throws). */
async function sessionAccessToken(): Promise<string | null> {
  try {
    const result = await account.getAccessTokenResult()
    return result.ok ? result.token : null
  } catch {
    return null
  }
}

/** One POST; returns the HTTP status. Throws only on network/timeout errors. */
async function postFeedback(row: FeedbackRow, accessToken: string | null): Promise<number> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/feedback`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
    signal: AbortSignal.timeout(FEEDBACK_TIMEOUT_MS),
  })
  return res.status
}

/**
 * Validates the renderer's payload and stores it. `uiLanguage` is the resolved
 * UI language ('en'/'es'), only used when the user opted into diagnostics.
 * Never throws.
 */
export async function sendFeedback(input: unknown, uiLanguage: string): Promise<FeedbackSendResult> {
  const feedback = normalizeFeedback(input)
  if (!feedback) return { ok: false, reason: 'invalid' }
  if (!isCloudConfigured()) return { ok: false, reason: 'server' }

  const row = buildFeedbackRow(feedback, feedback.includeDiagnostics ? collectDiagnostics(uiLanguage) : null)

  try {
    const token = await sessionAccessToken()
    let status = await postFeedback(row, token)
    let outcome = classifyFeedbackResponse(status, token !== null)
    if (outcome === 'retry-anonymous-invalidate' || outcome === 'retry-anonymous') {
      // 401 = dead token: drop it so the next account call mints a fresh one.
      // Either way, deliver the report anonymously instead of failing.
      if (outcome === 'retry-anonymous-invalidate' && token) account.invalidateAccessToken(token)
      status = await postFeedback(row, null)
      outcome = classifyFeedbackResponse(status, false)
    }
    if (outcome === 'ok') return { ok: true }
    console.error('[Feedback] insert rejected with HTTP', status)
    return { ok: false, reason: 'server' }
  } catch (err: unknown) {
    console.error('[Feedback] could not reach the feedback service:', String(err))
    return { ok: false, reason: 'network' }
  }
}
