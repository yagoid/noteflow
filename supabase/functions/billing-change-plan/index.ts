// Supabase Edge Function: billing-change-plan — upgrades the signed-in user's
// single NoteFlow AI / NoteFlow Cloud subscription to the NoteFlow Bundle by
// changing the plan of that SAME Lemon Squeezy subscription (prorated,
// invoiced now, same billing interval). Zero external dependencies (fetch
// only). The whole request flow lives in ./logic.ts (network injected, covered
// by tests/supabase/billing-change-plan.test.ts); this file is just the Deno
// glue: env and the Response.
//
//   POST <fn>   {"plan":"bundle"} → 200 {ok:true, product:"bundle", changed}
//               (changed:false = LS already had it on the bundle variant)
//               400 unsupported_plan · 401 missing/invalid session
//               404 no_subscription · 409 already_entitled /
//               multiple_subscriptions / subscription_not_active
//               502 Lemon Squeezy failed · 500 config/query
//
// Entitlements are NOT written here: Lemon Squeezy sends
// subscription_updated / subscription_plan_changed for the same subscription
// and billing-webhook moves its row to product 'bundle'.
//
// Auth: `Authorization: Bearer <Supabase access token>`, resolved via
// /auth/v1/user; the subscriptions query then runs with the service role and
// an explicit user_id filter. Deploy WITH JWT verification (the default).
//
// Env (set via `supabase secrets set`, except the SUPABASE_* ones which the
// platform injects automatically):
//   LEMONSQUEEZY_API_KEY             Lemon Squeezy API key (LIVE mode) — shared with billing-portal
//   LEMONSQUEEZY_VARIANT_MAP         the same value billing-webhook uses
//   LEMONSQUEEZY_BUNDLE_UPGRADE_MAP  "<ai|cloud variant>:<bundle variant>,…" (same interval)
//   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY  injected

import { handleChangePlan } from './logic.ts'

// Minimal surface of the Deno global we use (this file is deployed to Deno;
// it is excluded from the repo's tsc builds, which know nothing about Deno).
declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): unknown
}

Deno.serve(async (req: Request): Promise<Response> => {
  const body = req.method === 'POST' ? await req.text().catch(() => '') : ''
  const result = await handleChangePlan(
    { method: req.method, authorization: req.headers.get('Authorization'), body },
    {
      supabaseUrl: Deno.env.get('SUPABASE_URL'),
      anonKey: Deno.env.get('SUPABASE_ANON_KEY'),
      serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      lemonApiKey: Deno.env.get('LEMONSQUEEZY_API_KEY'),
      variantMap: Deno.env.get('LEMONSQUEEZY_VARIANT_MAP'),
      bundleUpgradeMap: Deno.env.get('LEMONSQUEEZY_BUNDLE_UPGRADE_MAP'),
    },
    { fetch, log: (message) => console.error(message) }
  )
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json' },
  })
})
