// Pure helper for "Delete account" (no electron imports, so vitest can load it).
// Covered by tests/electron/deleteAccount.test.ts. The networked part lives in
// account.ts (deleteAccount → Edge Function delete-account,
// supabase/functions/delete-account/logic.ts); main.ts does the local teardown.
//
// Contract of the function (POST, Bearer access token + apikey, no body):
//   2xx                                  → deleted (auth user, Cloud rows, subscription cancelled;
//                                          also when it already was)
//   401                                  → the access token was not accepted
//   502 {error: 'billing_cancel_failed'} → an active subscription could not be cancelled,
//                                          so NOTHING was deleted
//   anything else (500, a gateway 404/502 without that body…) → failed, safe to retry

export type DeleteAccountOutcome =
  | 'deleted'
  | 'unauthorized'
  | 'billingFailed'
  | 'failed'

/** Reads a delete-account answer. Same reading as the mobile app (core/accountSession.ts). */
export function deleteAccountOutcome(status: number, json: unknown): DeleteAccountOutcome {
  if (status >= 200 && status < 300) return 'deleted'
  if (status === 401) return 'unauthorized'
  const errorId = json && typeof json === 'object' ? (json as Record<string, unknown>).error : undefined
  if (status === 502 && errorId === 'billing_cancel_failed') return 'billingFailed'
  return 'failed'
}
