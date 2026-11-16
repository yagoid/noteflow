import { describe, it, expect } from 'vitest'
import { es } from 'date-fns/locale'
import {
  buildVersionDiff,
  decideHistoryPanelState,
  formatByteSize,
  formatVersionDate,
  groupVersionsByDay,
  isEmptyVersion,
  planRestoreAfterSnapshot,
  restoredSectionName,
  shouldListVersions,
  snapshotFailureKey,
  versionReasonTag,
  versionTimeRange,
  type VersionDiffRow,
} from '../../src/lib/versionHistory'
import { diffSequencesWithStatus, diffSequences } from '../../src/lib/externalContentSync'
import type { PlanAccountView } from '../../src/lib/subscriptionPlans'
import type { CloudVersionMeta, CloudVersionsErrorCode, CloudVersionsSnapshotErrorCode } from '../../src/types'

// Local-time ISO helper: the grouping is by LOCAL day.
const local = (y: number, mo: number, d: number, h = 12, mi = 0) => new Date(y, mo - 1, d, h, mi).toISOString()

let nextId = 1
const meta = (editedAt: string, extra: Partial<CloudVersionMeta> = {}): CloudVersionMeta => ({
  id: nextId++, seq: nextId, editedAt, savedAt: editedAt, size: 100, reason: 'edit', ...extra,
})

describe('groupVersionsByDay', () => {
  const now = new Date(2026, 10, 15, 9, 30) // Nov 15, 09:30 local

  it('groups by local day as today / yesterday / date, keeping the list order', () => {
    const versions = [
      meta(local(2026, 11, 15, 8, 10)),
      meta(local(2026, 11, 15, 0, 5)),
      meta(local(2026, 11, 14, 23, 59)),
      meta(local(2026, 11, 14, 7)),
      meta(local(2026, 11, 2, 18)),
    ]
    const groups = groupVersionsByDay(versions, now)
    expect(groups.map((g) => [g.day, g.key, g.versions.length])).toEqual([
      ['today', '2026-11-15', 2],
      ['yesterday', '2026-11-14', 2],
      ['date', '2026-11-02', 1],
    ])
    expect(groups[0].versions[0]).toBe(versions[0])
    expect(groups[2].date.getHours()).toBe(0)
  })

  it('a day that shows up again later joins its first group', () => {
    const groups = groupVersionsByDay([
      meta(local(2026, 11, 15, 8)),
      meta(local(2026, 11, 10)),
      meta(local(2026, 11, 15, 7)),
    ], now)
    expect(groups.map((g) => g.versions.length)).toEqual([2, 1])
  })

  it('empty list → no groups', () => {
    expect(groupVersionsByDay([], now)).toEqual([])
  })
})

describe('versionReasonTag', () => {
  it('only non-routine reasons carry a tag', () => {
    expect(versionReasonTag('edit')).toBeNull()
    expect(versionReasonTag('shrink')).toBe('shrink')
    expect(versionReasonTag('delete')).toBe('delete')
    expect(versionReasonTag('manual')).toBe('manual')
    expect(versionReasonTag('future-reason-x')).toBeNull()
    expect(versionReasonTag('')).toBeNull()
  })
})

describe('formatByteSize', () => {
  it('bytes, KB and MB in the UI language', () => {
    expect(formatByteSize(0, 'en')).toBe('0 B')
    expect(formatByteSize(820, 'en')).toBe('820 B')
    expect(formatByteSize(1229, 'en')).toBe('1.2 KB')
    expect(formatByteSize(1229, 'es')).toBe('1,2 KB')
    expect(formatByteSize(2048, 'en')).toBe('2 KB')
    expect(formatByteSize(3.4 * 1024 * 1024, 'en')).toBe('3.4 MB')
    expect(formatByteSize(-5, 'en')).toBe('0 B')
    expect(formatByteSize(Number.NaN, 'es')).toBe('0 B')
  })
})

describe('isEmptyVersion', () => {
  it('no text (or only whitespace) is empty', () => {
    expect(isEmptyVersion('')).toBe(true)
    expect(isEmptyVersion(' \n\t')).toBe(true)
    expect(isEmptyVersion('x')).toBe(false)
  })
})

describe('restoredSectionName', () => {
  const at = local(2026, 11, 14, 13, 50)
  it('English and Spanish names with a localized date', () => {
    expect(restoredSectionName('Plan', at, { template: '{name} (version from {date})', dateFormat: 'MMM d, HH:mm' }))
      .toBe('Plan (version from Nov 14, 13:50)')
    expect(restoredSectionName('Plan', at, { template: '{name} (versión del {date})', dateFormat: 'd MMM HH:mm', locale: es }))
      .toBe('Plan (versión del 14 nov 13:50)')
  })
  it('a name with braces is kept as is', () => {
    expect(restoredSectionName('{date}', at, { template: '{name} ({date})', dateFormat: 'HH:mm' })).toBe('{date} (13:50)')
  })
})

describe('versionTimeRange', () => {
  const en = { timeFormat: 'HH:mm', otherDayFormat: 'MMM d, HH:mm' }
  const esOpts = { timeFormat: 'HH:mm', otherDayFormat: 'd MMM HH:mm', locale: es }

  it('same local day: two times', () => {
    expect(versionTimeRange(local(2026, 11, 16, 11, 25), local(2026, 11, 16, 16, 13), en))
      .toEqual({ from: '11:25', to: '16:13', sameDay: true })
  })

  it('replaced on another local day: the replaced side carries the localized date', () => {
    const edited = local(2026, 11, 15, 18, 2)
    const saved = local(2026, 11, 16, 9, 0)
    expect(versionTimeRange(edited, saved, en)).toEqual({ from: '18:02', to: 'Nov 16, 09:00', sameDay: false })
    expect(versionTimeRange(edited, saved, esOpts)).toEqual({ from: '18:02', to: '16 nov 09:00', sameDay: false })
  })

  it('midnight is the boundary, in local time', () => {
    expect(versionTimeRange(local(2026, 11, 15, 23, 59), local(2026, 11, 16, 0, 0), en))
      .toEqual({ from: '23:59', to: 'Nov 16, 00:00', sameDay: false })
    expect(versionTimeRange(local(2026, 11, 16, 0, 0), local(2026, 11, 16, 23, 59), en))
      .toEqual({ from: '00:00', to: '23:59', sameDay: true })
  })

  it('a missing or invalid savedAt shows only the written time', () => {
    const edited = local(2026, 11, 16, 11, 25)
    for (const saved of [undefined, null, '', 'not a date']) {
      expect(versionTimeRange(edited, saved, en)).toEqual({ from: '11:25', to: null, sameDay: true })
    }
  })

  it('an invalid editedAt never throws', () => {
    expect(versionTimeRange('garbage', local(2026, 11, 16, 16, 13), en)).toEqual({ from: '', to: 'Nov 16, 16:13', sameDay: false })
  })
})

describe('formatVersionDate', () => {
  it('formats a valid ISO date, localized', () => {
    expect(formatVersionDate(local(2026, 11, 16, 16, 13), 'd MMM HH:mm', es)).toBe('16 nov 16:13')
  })
  it('null for missing or unparsable dates', () => {
    expect(formatVersionDate(undefined, 'HH:mm')).toBeNull()
    expect(formatVersionDate(null, 'HH:mm')).toBeNull()
    expect(formatVersionDate('', 'HH:mm')).toBeNull()
    expect(formatVersionDate('nope', 'HH:mm')).toBeNull()
  })
})

describe('buildVersionDiff', () => {
  const lines = (n: number, prefix = 'line') => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`)
  const kinds = (rows: VersionDiffRow[]) => rows.map((r) => (r.kind === 'gap' ? `gap:${r.count}` : `${r.kind}:${r.text}`))

  it('identical texts (line endings and BOM aside)', () => {
    expect(buildVersionDiff('a\nb', 'a\r\nb')).toEqual({ rows: [], identical: true, truncated: false })
    expect(buildVersionDiff(String.fromCharCode(0xfeff) + 'a', 'a').identical).toBe(true)
  })

  it('version lines first, then the current ones, with context folded', () => {
    const base = lines(20)
    const version = [...base]
    version[9] = 'old ten'
    const current = [...base]
    current[9] = 'new ten'
    const diff = buildVersionDiff(version.join('\n'), current.join('\n'))
    expect(diff.identical).toBe(false)
    expect(diff.truncated).toBe(false)
    expect(kinds(diff.rows)).toEqual([
      'gap:6',
      'same:line 7', 'same:line 8', 'same:line 9',
      'version:old ten',
      'current:new ten',
      'same:line 11', 'same:line 12', 'same:line 13',
      'gap:7',
    ])
  })

  it('a single folded line is shown instead of a gap of 1', () => {
    const base = lines(4)
    const current = [...base, 'added']
    const diff = buildVersionDiff(base.join('\n'), current.join('\n'), 3)
    expect(kinds(diff.rows)).toEqual(['same:line 1', 'same:line 2', 'same:line 3', 'same:line 4', 'current:added'])
    const longer = buildVersionDiff(lines(6).join('\n'), [...lines(6), 'added'].join('\n'), 3)
    expect(kinds(longer.rows)[0]).toBe('gap:3')
  })

  it('lines only in the version (deleted since) and only in the current text', () => {
    const diff = buildVersionDiff('a\nkept\nb', 'a\nb\nnew', 1)
    expect(kinds(diff.rows)).toEqual(['same:a', 'version:kept', 'same:b', 'current:new'])
  })

  it('an empty version against a text: every current line is "added since"', () => {
    const diff = buildVersionDiff('', 'x\ny')
    expect(diff.rows.filter((r) => r.kind === 'current').length).toBe(2)
  })

  it('too many changes → truncated (the caller shows a preview)', () => {
    const a = Array.from({ length: 2600 }, (_, i) => `a${i}`)
    const b = Array.from({ length: 2600 }, (_, i) => `b${i}`)
    const diff = buildVersionDiff(a.join('\n'), b.join('\n'))
    expect(diff.truncated).toBe(true)
    expect(diff.identical).toBe(false)
  })
})

describe('diffSequencesWithStatus', () => {
  it('same hunks as diffSequences; says when it gave up', () => {
    const a = ['x', 'y', 'z']
    const b = ['x', 'Y', 'z']
    expect(diffSequencesWithStatus(a, b)).toEqual({ hunks: diffSequences(a, b), truncated: false })
    const many = Array.from({ length: 2600 }, (_, i) => `a${i}`)
    const other = Array.from({ length: 2600 }, (_, i) => `b${i}`)
    const res = diffSequencesWithStatus(many, other)
    expect(res.truncated).toBe(true)
    expect(res.hunks).toEqual([{ aStart: 0, aEnd: 2600, bStart: 0, bEnd: 2600 }])
    expect(diffSequencesWithStatus([], ['new']).truncated).toBe(false)
  })
})

describe('decideHistoryPanelState', () => {
  const account = (o: Partial<PlanAccountView> = {}): PlanAccountView => ({
    signedIn: true, entitlementsKnown: true, entitlements: { ai: false, cloud: true }, ...o,
  })
  const err = (code: CloudVersionsErrorCode) => ({ status: 'error' as const, code })

  it('loading until the account (and then the list) arrive', () => {
    expect(decideHistoryPanelState(null, { status: 'ok', count: 3 })).toBe('loading')
    expect(decideHistoryPanelState(account(), { status: 'loading' })).toBe('loading')
  })

  it('no usable Cloud → offer, whatever the list says', () => {
    expect(decideHistoryPanelState(account({ signedIn: false }), { status: 'loading' })).toBe('offer')
    expect(decideHistoryPanelState(account({ entitlements: { ai: true, cloud: false } }), { status: 'loading' })).toBe('offer')
    expect(decideHistoryPanelState(account(), err('not-signed-in'))).toBe('offer')
  })

  it('unknown entitlements never show the offer', () => {
    const unknown = account({ entitlementsKnown: false, entitlements: { ai: false, cloud: false } })
    expect(decideHistoryPanelState(unknown, { status: 'loading' })).toBe('loading')
    expect(decideHistoryPanelState(unknown, { status: 'ok', count: 2 })).toBe('list')
    expect(decideHistoryPanelState(unknown, err('not-signed-in'))).toBe('plan-unknown')
    expect(decideHistoryPanelState(unknown, err('unknown'))).toBe('plan-unknown')
    expect(decideHistoryPanelState(unknown, err('unreachable'))).toBe('unreachable')
  })

  it('list results and error codes', () => {
    expect(decideHistoryPanelState(account(), { status: 'ok', count: 0 })).toBe('empty')
    expect(decideHistoryPanelState(account(), { status: 'ok', count: 4 })).toBe('list')
    expect(decideHistoryPanelState(account(), err('locked'))).toBe('locked')
    expect(decideHistoryPanelState(account(), err('session-locked'))).toBe('locked')
    expect(decideHistoryPanelState(account(), err('unreachable'))).toBe('unreachable')
    expect(decideHistoryPanelState(account(), err('unavailable'))).toBe('unavailable')
    expect(decideHistoryPanelState(account(), err('unsupported-note'))).toBe('unsupported')
    for (const code of ['decrypt-failed', 'invalid-path', 'unknown', 'not-found'] as const) {
      expect(decideHistoryPanelState(account(), err(code))).toBe('error')
    }
  })

  it('shouldListVersions: only with a session that may own Cloud', () => {
    expect(shouldListVersions(null)).toBe(false)
    expect(shouldListVersions(account({ signedIn: false }))).toBe(false)
    expect(shouldListVersions(account({ entitlements: { ai: false, cloud: false } }))).toBe(false)
    expect(shouldListVersions(account({ entitlementsKnown: false, entitlements: { ai: false, cloud: false } }))).toBe(true)
    expect(shouldListVersions(account())).toBe(true)
  })
})

describe('snapshotFailureKey', () => {
  it('maps every snapshot error code to a message', () => {
    const cases: Array<[CloudVersionsSnapshotErrorCode, string]> = [
      ['sync-off', 'syncOff'],
      ['sync-pending', 'syncPending'],
      ['no-subscription', 'noSubscription'],
      ['unreachable', 'unreachable'],
      ['locked', 'locked'],
      ['session-locked', 'locked'],
      ['unavailable', 'unavailable'],
      ['not-signed-in', 'signedOut'],
      ['unsupported-note', 'unsupported'],
      ['invalid-path', 'generic'],
      ['unknown', 'generic'],
    ]
    for (const [code, key] of cases) expect(snapshotFailureKey(code)).toBe(key)
  })
})

describe('planRestoreAfterSnapshot', () => {
  const ok = { ok: true as const }
  it('captured text unchanged → replace', () => {
    expect(planRestoreAfterSnapshot({ snapshot: ok, captured: 'a', current: 'a', attempt: 1 })).toEqual({ kind: 'replace' })
    expect(planRestoreAfterSnapshot({ snapshot: ok, captured: 'a\nb', current: 'a\r\nb', attempt: 2 })).toEqual({ kind: 'replace' })
  })
  it('changed during the snapshot → one more snapshot, then ask (sync pending)', () => {
    expect(planRestoreAfterSnapshot({ snapshot: ok, captured: 'a', current: 'a+', attempt: 1 })).toEqual({ kind: 'recapture' })
    expect(planRestoreAfterSnapshot({ snapshot: ok, captured: 'a+', current: 'a++', attempt: 2 }))
      .toEqual({ kind: 'confirm', reason: 'syncPending' })
  })
  it('a failed snapshot asks with its reason, whatever the text did', () => {
    expect(planRestoreAfterSnapshot({ snapshot: { ok: false, errorCode: 'sync-off' }, captured: 'a', current: 'a', attempt: 1 }))
      .toEqual({ kind: 'confirm', reason: 'syncOff' })
    expect(planRestoreAfterSnapshot({ snapshot: { ok: false, errorCode: 'unreachable' }, captured: 'a', current: 'b', attempt: 2 }))
      .toEqual({ kind: 'confirm', reason: 'unreachable' })
  })
})
