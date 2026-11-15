// Migration 0016 adds the server-side version history of NoteFlow Cloud: the
// table public.file_versions, filled ONLY by an AFTER UPDATE trigger on
// public.files, and read by the clients through a select-only RLS policy. There
// is no Postgres in the test run, so this file pins the SQL text of the
// security-relevant parts (RLS, grants, trigger condition, limits) — a careless
// edit that opens a write path for clients or lets the policy and the purge use
// different retentions fails here. (The behaviour itself was exercised against a
// real Postgres when the migration was written.)
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const SQL = readFileSync(join(__dirname, '../../supabase/migrations/0016_cloud_file_versions.sql'), 'utf-8')

/** The SQL without `--` comments, with every whitespace run collapsed to one space. */
const CODE = SQL.split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')
  .replace(/\s+/g, ' ')

/** Body (between `as $$` and `$$;`) of a function created by the migration. */
function functionBody(name: string): string {
  const start = CODE.indexOf(`create or replace function public.${name}(`)
  expect(start, name).toBeGreaterThan(-1)
  const open = CODE.indexOf('as $$', start)
  return CODE.slice(open + 'as $$'.length, CODE.indexOf('$$;', open))
}

/** Header (signature + options, up to `as $$`) of a function created by the migration. */
function functionHeader(name: string): string {
  const start = CODE.indexOf(`create or replace function public.${name}(`)
  return CODE.slice(start, CODE.indexOf('as $$', start))
}

describe('migration 0016 — file_versions table', () => {
  it('the create table closes with "\\n);" (delete-account mirror test) and has the contract columns', () => {
    const m = SQL.match(/create table public\.file_versions\s*\(([\s\S]*?)\n\);/)
    expect(m).not.toBeNull()
    const body = m![1].replace(/--.*$/gm, '').replace(/\s+/g, ' ')
    for (const col of [
      'id bigint generated always as identity primary key',
      'user_id uuid not null references auth.users(id) on delete cascade',
      'path_key text not null',
      'path_ct text not null',
      'content_ct text not null',
      'key_ct text not null',
      'updated_at timestamptz not null',
      'seq bigint not null',
      'size integer not null',
      "reason text not null check (reason in ('edit', 'delete', 'shrink'))",
      'created_at timestamptz not null default now()',
    ]) {
      expect(body, col).toContain(col)
    }
  })

  it('has the list/prune and the purge indexes', () => {
    expect(CODE).toMatch(/create index \w+ on public\.file_versions \(user_id, path_key, seq desc\);/)
    expect(CODE).toMatch(/create index \w+ on public\.file_versions \(created_at\);/)
  })

  it('is not added to the Realtime publication', () => {
    expect(CODE).not.toContain('supabase_realtime')
    expect(CODE).not.toMatch(/alter publication/i)
  })
})

describe('migration 0016 — RLS and grants (clients only read)', () => {
  it('enables row level security on file_versions', () => {
    expect(CODE).toContain('alter table public.file_versions enable row level security;')
  })

  it('has exactly one policy, for select to authenticated, by owner and within the retention', () => {
    const policies = [...CODE.matchAll(/create policy "[^"]+" on public\.(\w+) for (\w+)/g)]
    expect(policies.map((m) => [m[1], m[2]])).toEqual([['file_versions', 'select']])
    expect(CODE).toMatch(
      /create policy "[^"]+" on public\.file_versions for select to authenticated using \( auth\.uid\(\) = user_id and created_at > now\(\) - public\.file_versions_retention\(\) \);/
    )
    expect(CODE).not.toMatch(/for (insert|update|delete|all)\b/)
  })

  it('revokes everything from clients and grants only SELECT to authenticated', () => {
    expect(CODE).toContain('revoke all on table public.file_versions from public, anon, authenticated;')
    expect(CODE).toContain('revoke all on sequence public.file_versions_id_seq from public, anon, authenticated;')
    const grants = [...CODE.matchAll(/grant ([\w, ]+) on table public\.file_versions to ([\w, ]+);/g)]
    expect(grants.map((m) => [m[1], m[2]])).toEqual([['select', 'authenticated']])
    expect(CODE).not.toMatch(/grant [^;]* on sequence public\.file_versions_id_seq/)
  })
})

describe('migration 0016 — capture trigger', () => {
  it('fires AFTER UPDATE of each files row, only when live content changes', () => {
    expect(CODE).toContain(
      "create trigger files_capture_version after update on public.files for each row when (old.deleted = false and old.content_ct <> '' and old.content_ct is distinct from new.content_ct) execute function public.files_capture_version();"
    )
  })

  it('names its limits as constants with the agreed values', () => {
    const body = functionBody('files_capture_version')
    expect(body).toContain("edit_window constant interval := interval '10 minutes';")
    expect(body).toContain('max_versions constant integer := 100;')
    expect(body).toContain('max_bytes constant bigint := 20 * 1024 * 1024;')
    expect(body).toContain('shrink_min_bytes constant integer := 1024;')
  })

  it('classifies delete / shrink / edit and only skips edits inside the window', () => {
    const body = functionBody('files_capture_version')
    expect(body).toMatch(/if new\.deleted then v_reason := 'delete';/)
    expect(body).toMatch(
      /elsif new_size < old_size \/ 2 and old_size - new_size >= shrink_min_bytes then v_reason := 'shrink';/
    )
    expect(body).toMatch(/if v_reason = 'edit' and exists \(/)
    expect(body).toContain('v.created_at > pg_catalog.now() - edit_window')
  })

  it('stores the PREVIOUS row (old.*), never the new one', () => {
    const body = functionBody('files_capture_version')
    expect(body).toContain(
      'insert into public.file_versions (user_id, path_key, path_ct, content_ct, key_ct, updated_at, seq, size, reason) values (old.user_id, old.path_key, old.path_ct, old.content_ct, old.key_ct, old.updated_at, old.seq, old_size, v_reason);'
    )
    expect(body).toContain('old_size integer := pg_catalog.octet_length(old.content_ct);')
  })

  it('the edit window and the prune are scoped to THIS file (user_id + path_key)', () => {
    const body = functionBody('files_capture_version')
    // Window check: select ... from public.file_versions v where <this file> and <recent>.
    expect(body).toContain(
      'from public.file_versions v where v.user_id = old.user_id and v.path_key = old.path_key and v.created_at > pg_catalog.now() - edit_window'
    )
    // Prune: the ranked subquery only sees this file's versions.
    expect(body).toContain(
      'from public.file_versions fv where fv.user_id = old.user_id and fv.path_key = old.path_key window w as'
    )
    expect(body).toContain('where v.id = ranked.id and')
  })

  it('prunes by count and by cumulative size, always keeping the newest version', () => {
    const body = functionBody('files_capture_version')
    expect(body).toContain('window w as (order by fv.seq desc, fv.id desc)')
    expect(body).toContain('over (w rows between unbounded preceding and current row)')
    expect(body).toContain('ranked.rn > max_versions or (ranked.rn > 1 and ranked.cum_bytes > max_bytes)')
  })

  it('cannot be called directly by clients', () => {
    expect(CODE).toContain('revoke execute on function public.files_capture_version() from public, anon, authenticated;')
    expect(CODE).not.toMatch(/grant execute on function public\.files_capture_version\(\)/)
  })
})

describe('migration 0016 — retention and purge', () => {
  it('defines the 30-day retention once, in file_versions_retention()', () => {
    expect(functionBody('file_versions_retention').trim()).toBe("select interval '30 days'")
    expect(functionHeader('file_versions_retention')).toContain('returns interval language sql immutable')
    // No other copy of the literal anywhere in the code.
    expect(CODE.split("interval '30 days'").length - 1).toBe(1)
  })

  it('the RLS policy and the purge both use file_versions_retention()', () => {
    expect(CODE).toMatch(/created_at > now\(\) - public\.file_versions_retention\(\)/)
    expect(functionBody('purge_file_versions')).toContain(
      'where created_at < pg_catalog.now() - public.file_versions_retention();'
    )
  })

  it('authenticated can execute the retention function (the policy needs it), anon cannot', () => {
    expect(CODE).toContain('revoke execute on function public.file_versions_retention() from public, anon;')
    expect(CODE).toContain('grant execute on function public.file_versions_retention() to authenticated, service_role;')
  })

  it('purge_file_versions returns the count and is granted only to service_role', () => {
    expect(functionHeader('purge_file_versions')).toContain('returns bigint')
    expect(functionBody('purge_file_versions')).toContain('get diagnostics v_count = row_count;')
    expect(CODE).toContain('revoke execute on function public.purge_file_versions() from public, anon, authenticated;')
    const grants = [...CODE.matchAll(/grant execute on function public\.purge_file_versions\(\) to ([\w, ]+);/g)]
    expect(grants.map((m) => m[1])).toEqual(['service_role'])
  })

  it('the migration does not schedule anything (pg_cron is the operator\'s choice)', () => {
    expect(CODE).not.toContain('cron.')
  })
})

describe('migration 0016 — function hygiene', () => {
  it('the trigger and the purge are security definer; every function pins search_path = \'\'', () => {
    for (const name of ['files_capture_version', 'purge_file_versions']) {
      expect(functionHeader(name), name).toContain('security definer')
    }
    const headers = [...CODE.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1])
    expect(headers.sort()).toEqual(['file_versions_retention', 'files_capture_version', 'purge_file_versions'])
    for (const name of headers) expect(functionHeader(name), name).toContain("set search_path = ''")
  })
})
