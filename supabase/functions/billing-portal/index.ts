// Supabase Edge Function: billing-portal — fresh Lemon Squeezy customer-portal
// link for the signed-in user (Settings → Subscription → "Manage subscription").
// Zero external dependencies (fetch only). The whole request flow lives in
// ./logic.ts (network injected, covered by tests/supabase/billing-portal.test.ts);
// this file is just the Deno glue: env and the Response.
//
//   POST <fn>   no body → 200 {url}  (https://<store>.lemonsqueezy.com/billing?…signed…)
//               401 missing/invalid session · 404 no Lemon Squeezy subscription
//               502 Lemon Squeezy failed / returned no valid link · 500 config/query
//
// Why a function: LS's `urls.customer_portal` is PRE-SIGNED and expires after
// 24 h, so it can't be stored from the webhook; asking LS needs the operator's
// API key, which must never ship in the client. The desktop app falls back to
// the store's generic portal (sign-in by email) on any failure.
//
// Auth: `Authorization: Bearer <Supabase access token>` — resolved to a user id
// via /auth/v1/user (cloud-keys / ai-proxy pattern); the subscriptions query
// then runs with the service role and an explicit user_id filter. Deploy WITH
// JWT verification (the default; no --no-verify-jwt).
//
// Env (set via `supabase secrets set`, except the SUPABASE_* ones which the
// platform injects automatically):
//   LEMONSQUEEZY_API_KEY   Lemon Squeezy API key (Settings → API, LIVE mode)
//   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY  injected

import { handleBillingPortal } from './logic.ts'

// Minimal surface of the Deno global we use (this file is deployed to Deno;
// it is excluded from the repo's tsc builds, which know nothing about Deno).
declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): unknown
}

Deno.serve(async (req: Request): Promise<Response> => {
  const result = await handleBillingPortal(
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
