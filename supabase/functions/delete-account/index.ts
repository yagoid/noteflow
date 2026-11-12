// Supabase Edge Function: delete-account — permanently deletes the signed-in
// user's NoteFlow account (in-app Settings → Account → Delete account; Google
// Play requires in-app deletion for apps that create accounts).
// Zero external dependencies (fetch only). The whole request flow lives in
// ./logic.ts (network injected, covered by tests/supabase/delete-account.test.ts);
// this file is just the Deno glue: env and the Response.
//
//   POST <fn>   no body → 200 {ok:true}  account deleted (also when it already was)
//               401 {error:"missing_token"|"invalid_token"}  missing/invalid session
//               502 {error:"billing_cancel_failed"}  an active Lemon Squeezy
//                   subscription could not be cancelled — NOTHING was deleted
//               500 {error:…}  config / query / delete failure (safe to retry)
//   Every error body also carries a human-readable `message`.
//
// Order: cancel billing (LS, operator API key) → delete the user's rows (service
// role, explicit user_id filter) → delete the auth user (GoTrue admin API).
// Feedback rows survive anonymised (`on delete set null`, migration 0015).
//
// Auth: `Authorization: Bearer <Supabase access token>` — resolved to a user id
// via /auth/v1/user (billing-portal pattern). Deploy WITH JWT verification
// (the default; no --no-verify-jwt).
//
// Env (set via `supabase secrets set`, except the SUPABASE_* ones which the
// platform injects automatically):
//   LEMONSQUEEZY_API_KEY   Lemon Squeezy API key (Settings → API, LIVE mode) —
//                          the same secret billing-portal uses
//   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY  injected

import { handleDeleteAccount } from './logic.ts'

// Minimal surface of the Deno global we use (this file is deployed to Deno;
// it is excluded from the repo's tsc builds, which know nothing about Deno).
declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): unknown
}

Deno.serve(async (req: Request): Promise<Response> => {
  const result = await handleDeleteAccount(
    { method: req.method, authorization: req.headers.get('Authorization') },
    {
      supabaseUrl: Deno.env.get('SUPABASE_URL'),
      anonKey: Deno.env.get('SUPABASE_ANON_KEY'),
      serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      lemonApiKey: Deno.env.get('LEMONSQUEEZY_API_KEY'),
    },
    { fetch, log: (message) => console.error(message) }
  )
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json' },
  })
})
