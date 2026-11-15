// Migration 0017 adds the explicit capture of a file's CURRENT version
// (`cloud_snapshot_file`, called by the client before restoring an old version)
// on top of the version history of 0016: reason 'manual', a unique
// (user_id, path_key, seq) index so the trigger and the RPC never store the same
// content twice, and the prune moved to a shared internal function. The RPC is
// security definer (it writes where clients can't), so RLS does not protect it:
// this file pins the checks it does by hand. Same text-level approach as
// cloud-file-versions.test.ts (the behaviour was exercised against a real
// Postgres when the migration was written).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const SQL = readFileSync(join(__dirname, '../../supabase/migrations/0017_cloud_file_versions_snapshot.sql'), 'utf-8')

/** The SQL without `--` comments, with every whitespace run collapsed to one space. */
const CODE = SQL.split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')
  .replace(/\s+/g, ' ')

function functionStart(name: string): number {
  const start = CODE.indexOf(`create or replace function public.${name}(`)
  expect(start, name).toBeGreaterThan(-1)
  return start
}

/** Body (between `as $$` and `$$;`) of a function created by the migration. */
function functionBody(name: string): string {
  const open = CODE.indexOf('as $$', functionStart(name))
  return CODE.slice(open + 'as $$'.length, CODE.indexOf('$$;', open))
}

/** Header (signature + options, up to `as $$`) of a function created by the migration. */
function functionHeader(name: string): string {
  const start = functionStart(name)
  return CODE.slice(start, CODE.indexOf('as $$', start))
}

describe('migration 0017 — schema', () => {
  it("accepts 'manual' as a reason (recreated check)", () => {
    expect(CODE).toContain(
      "alter table public.file_versions drop constraint file_versions_reason_check, add constraint file_versions_reason_check check (reason in ('edit', 'delete', 'shrink', 'manual'));"
    )
  })

  it('dedupes keeping the lowest id, then creates the unique (user_id, path_key, seq) index', () => {
    const dedupe = CODE.indexOf('delete from public.file_versions a using public.file_versions b')
    const unique = CODE.indexOf('create unique index file_versions_user_path_seq_key on public.file_versions (user_id, path_key, seq);')
    expect(dedupe).toBeGreaterThan(-1)
    expect(unique).toBeGreaterThan(dedupe)
    expect(CODE.slice(dedupe, unique)).toContain(
      'where a.user_id = b.user_id and a.path_key = b.path_key and a.seq = b.seq and a.id > b.id;'
    )
  })

  it('drops the 0016 index the unique one makes redundant', () => {
    expect(CODE).toContain('drop index if exists public.file_versions_user_path_seq_idx;')
  })

  it('does not touch the retention, the purge, the RLS policy or the Realtime publication', () => {
    expect(CODE).not.toContain('file_versions_retention')
    expect(CODE).not.toContain('purge_file_versions')
    expect(CODE).not.toMatch(/create policy|drop policy|alter policy/)
    expect(CODE).not.toContain('supabase_realtime')
    expect(CODE).not.toMatch(/alter publication/)
    expect(CODE).not.toContain('cron.')
  })
})

describe('migration 0017 — shared prune', () => {
  it('is security definer with an empty search_path and nobody can execute it', () => {
    const header = functionHeader('file_versions_prune')
    expect(header).toContain('(p_user_id uuid, p_path_key text) returns void')
    expect(header).toContain('security definer')
    expect(header).toContain("set search_path = ''")
    expect(CODE).toContain(
      'revoke execute on function public.file_versions_prune(uuid, text) from public, anon, authenticated, service_role;'
    )
    expect(CODE).not.toMatch(/grant execute on function public\.file_versions_prune/)
  })

  it('holds the count/size limits — and they appear nowhere else', () => {
    const body = functionBody('file_versions_prune')
    expect(body).toContain('max_versions constant integer := 100;')
    expect(body).toContain('max_bytes constant bigint := 20 * 1024 * 1024;')
    expect(body).toContain('ranked.rn > max_versions or (ranked.rn > 1 and ranked.cum_bytes > max_bytes)')
    expect(body).toContain('window w as (order by fv.seq desc, fv.id desc)')
    expect(CODE.split('max_versions constant').length - 1).toBe(1)
    expect(CODE.split('max_bytes constant').length - 1).toBe(1)
  })

  it('prunes only the given file (user_id + path_key)', () => {
    const body = functionBody('file_versions_prune')
    expect(body).toContain(
      'from public.file_versions fv where fv.user_id = p_user_id and fv.path_key = p_path_key window w as'
    )
    expect(body).toContain('where v.id = ranked.id and')
  })
})

describe('migration 0017 — capture trigger function', () => {
  const body = () => functionBody('files_capture_version')

  it('keeps security definer, the empty search_path and the revoke', () => {
    expect(functionHeader('files_capture_version')).toContain('security definer')
    expect(functionHeader('files_capture_version')).toContain("set search_path = ''")
    expect(CODE).toContain('revoke execute on function public.files_capture_version() from public, anon, authenticated;')
  })

  it('keeps the window and the shrink threshold (and only those) as its constants', () => {
    expect(body()).toContain("edit_window constant interval := interval '10 minutes';")
    expect(body()).toContain('shrink_min_bytes constant integer := 1024;')
    expect(body()).not.toContain('max_versions')
    expect(body()).not.toContain('max_bytes')
    expect(CODE.split('edit_window constant').length - 1).toBe(1)
    expect(CODE.split('shrink_min_bytes constant').length - 1).toBe(1)
  })

  it('same classification as 0016, inserts with on conflict do nothing and calls the shared prune', () => {
    expect(body()).toMatch(/if new\.deleted then v_reason := 'delete';/)
    expect(body()).toMatch(
      /elsif new_size < old_size \/ 2 and old_size - new_size >= shrink_min_bytes then v_reason := 'shrink';/
    )
    expect(body()).toContain('v.created_at > pg_catalog.now() - edit_window')
    expect(body()).toContain('on conflict (user_id, path_key, seq) do nothing;')
    expect(body()).toContain('perform public.file_versions_prune(old.user_id, old.path_key);')
  })

  it('stores the PREVIOUS row (old.*) and scopes the window to THIS file', () => {
    expect(body()).toContain('old_size integer := pg_catalog.octet_length(old.content_ct);')
    expect(body()).toContain(
      'insert into public.file_versions (user_id, path_key, path_ct, content_ct, key_ct, updated_at, seq, size, reason) values (old.user_id, old.path_key, old.path_ct, old.content_ct, old.key_ct, old.updated_at, old.seq, old_size, v_reason) on conflict (user_id, path_key, seq) do nothing;'
    )
    expect(body()).toContain(
      'from public.file_versions v where v.user_id = old.user_id and v.path_key = old.path_key and v.created_at > pg_catalog.now() - edit_window'
    )
  })

  it('does not recreate the trigger itself', () => {
    expect(CODE).not.toMatch(/create trigger|drop trigger/)
  })
})

describe('migration 0017 — cloud_snapshot_file RPC', () => {
  const body = () => functionBody('cloud_snapshot_file')

  it('is security definer with an empty search_path, returning boolean', () => {
    const header = functionHeader('cloud_snapshot_file')
    expect(header).toContain('(p_path_key text) returns boolean')
    expect(header).toContain('security definer')
    expect(header).toContain("set search_path = ''")
  })

  it('rejects a call without a user with 42501', () => {
    expect(body()).toContain('uid uuid := auth.uid();')
    expect(body()).toMatch(/if uid is null then raise exception '[^']+' using errcode = '42501';/)
  })

  it('requires the same entitlement as the files insert policy of 0004, else 42501', () => {
    expect(body()).toMatch(
      /if not exists \( select 1 from public\.subscriptions s where s\.user_id = uid and s\.product in \('cloud', 'bundle'\) and s\.status = 'active' \) then raise exception '[^']+' using errcode = '42501';/
    )
    // …which is the predicate the 0004 policy uses.
    const m0004 = readFileSync(join(__dirname, '../../supabase/migrations/0004_cloud.sql'), 'utf-8').replace(/\s+/g, ' ')
    expect(m0004).toContain("s.product in ('cloud', 'bundle') and s.status = 'active'")
  })

  it('takes the per-user advisory lock of 0008 before reading any row', () => {
    const lock = body().indexOf(
      "perform pg_catalog.pg_advisory_xact_lock( pg_catalog.hashtextextended('noteflow.files.seq:' || uid::text, 0) );"
    )
    expect(lock).toBeGreaterThan(-1)
    expect(lock).toBeLessThan(body().indexOf('from public.files f'))
  })

  it("reads only the caller's live row", () => {
    expect(body()).toContain(
      "from public.files f where f.user_id = uid and f.path_key = p_path_key and f.deleted = false and f.content_ct <> '';"
    )
    expect(body()).toMatch(/if not found then return false; end if;/)
  })

  it("stores it as 'manual' with on conflict do nothing, prunes, and returns true", () => {
    expect(body()).toContain(
      "insert into public.file_versions (user_id, path_key, path_ct, content_ct, key_ct, updated_at, seq, size, reason) values (cur.user_id, cur.path_key, cur.path_ct, cur.content_ct, cur.key_ct, cur.updated_at, cur.seq, pg_catalog.octet_length(cur.content_ct), 'manual') on conflict (user_id, path_key, seq) do nothing;"
    )
    expect(body()).toContain('perform public.file_versions_prune(uid, p_path_key);')
    expect(body()).toMatch(/return true; end;\s*$/)
  })

  it('only authenticated can execute it', () => {
    expect(CODE).toContain('revoke execute on function public.cloud_snapshot_file(text) from public, anon, service_role;')
    const grants = [...CODE.matchAll(/grant execute on function public\.cloud_snapshot_file\(text\) to ([\w, ]+);/g)]
    expect(grants.map((m) => m[1])).toEqual(['authenticated'])
  })
})

describe('migration 0017 — function hygiene', () => {
  it('creates exactly these functions, all with an empty search_path', () => {
    const names = [...CODE.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1])
    expect(names.sort()).toEqual(['cloud_snapshot_file', 'file_versions_prune', 'files_capture_version'])
    for (const name of names) expect(functionHeader(name), name).toContain("set search_path = ''")
  })

  it('ends by reloading the PostgREST schema cache', () => {
    expect(CODE.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
})
