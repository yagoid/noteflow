import fs from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'
import {
  normalizeFeedback,
  buildFeedbackRow,
  classifyFeedbackResponse,
  isPlausibleEmail,
  FEEDBACK_KINDS,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_CONTACT_MAX,
  FEEDBACK_DIAG_MAX,
  type FeedbackDiagnostics,
} from '../../electron/feedbackLogic'

const base = { kind: 'bug', message: 'It crashes', includeDiagnostics: true }

const diag: FeedbackDiagnostics = {
  appVersion: '3.2.1',
  platform: 'win32 x64',
  osVersion: '10.0.26200',
  locale: 'es',
}

describe('normalizeFeedback', () => {
  it('accepts every known kind', () => {
    for (const kind of FEEDBACK_KINDS) {
      expect(normalizeFeedback({ ...base, kind })?.kind).toBe(kind)
    }
  })

  it('rejects non-objects, unknown kinds and non-string messages', () => {
    expect(normalizeFeedback(null)).toBeNull()
    expect(normalizeFeedback('bug')).toBeNull()
    expect(normalizeFeedback({ ...base, kind: 'praise' })).toBeNull()
    expect(normalizeFeedback({ ...base, kind: undefined })).toBeNull()
    expect(normalizeFeedback({ ...base, message: 42 })).toBeNull()
  })

  it('trims the message and rejects an empty or whitespace-only one', () => {
    expect(normalizeFeedback({ ...base, message: '  hi \n' })?.message).toBe('hi')
    expect(normalizeFeedback({ ...base, message: '' })).toBeNull()
    expect(normalizeFeedback({ ...base, message: ' \n\t  ' })).toBeNull()
  })

  it('enforces the message length after trimming', () => {
    const max = 'a'.repeat(FEEDBACK_MESSAGE_MAX)
    expect(normalizeFeedback({ ...base, message: `  ${max}  ` })?.message).toBe(max)
    expect(normalizeFeedback({ ...base, message: max + 'a' })).toBeNull()
  })

  it('strips NUL characters (Postgres text cannot store them)', () => {
    expect(normalizeFeedback({ ...base, message: 'a\u0000b' })?.message).toBe('ab')
    expect(normalizeFeedback({ ...base, message: '\u0000' })).toBeNull()
  })

  it('treats a missing, null or blank contact as no contact', () => {
    expect(normalizeFeedback(base)?.contact).toBeNull()
    expect(normalizeFeedback({ ...base, contact: null })?.contact).toBeNull()
    expect(normalizeFeedback({ ...base, contact: '   ' })?.contact).toBeNull()
  })

  it('keeps a plausible contact email (trimmed) and rejects an implausible or oversized one', () => {
    expect(normalizeFeedback({ ...base, contact: ' me@example.com ' })?.contact).toBe('me@example.com')
    expect(normalizeFeedback({ ...base, contact: 'not-an-email' })).toBeNull()
    expect(normalizeFeedback({ ...base, contact: 42 })).toBeNull()
    const long = `${'a'.repeat(FEEDBACK_CONTACT_MAX)}@example.com`
    expect(normalizeFeedback({ ...base, contact: long })).toBeNull()
  })

  it('only opts into diagnostics with an explicit true', () => {
    expect(normalizeFeedback(base)?.includeDiagnostics).toBe(true)
    expect(normalizeFeedback({ ...base, includeDiagnostics: 'yes' })?.includeDiagnostics).toBe(false)
    expect(normalizeFeedback({ kind: 'other', message: 'x' })?.includeDiagnostics).toBe(false)
  })
})

describe('isPlausibleEmail', () => {
  it('is deliberately lax', () => {
    expect(isPlausibleEmail('a@b.co')).toBe(true)
    expect(isPlausibleEmail('first.last+tag@sub.example.org')).toBe(true)
    expect(isPlausibleEmail('a@b')).toBe(false)
    expect(isPlausibleEmail('a b@c.d')).toBe(false)
    expect(isPlausibleEmail('@c.d')).toBe(false)
  })
})

describe('buildFeedbackRow', () => {
  it('maps to the table columns with diagnostics when opted in', () => {
    const fb = normalizeFeedback({ ...base, contact: 'me@example.com' })!
    expect(buildFeedbackRow(fb, diag)).toEqual({
      kind: 'bug',
      message: 'It crashes',
      contact: 'me@example.com',
      app_version: '3.2.1',
      platform: 'win32 x64',
      os_version: '10.0.26200',
      locale: 'es',
    })
  })

  it('drops diagnostics when the user did not opt in, even if main passed them', () => {
    const fb = normalizeFeedback({ ...base, includeDiagnostics: false })!
    const row = buildFeedbackRow(fb, diag)
    expect(row.app_version).toBeNull()
    expect(row.platform).toBeNull()
    expect(row.os_version).toBeNull()
    expect(row.locale).toBeNull()
  })

  it('never sends a user_id (the column default sets it server-side)', () => {
    const row = buildFeedbackRow(normalizeFeedback(base)!, diag)
    expect(Object.keys(row)).not.toContain('user_id')
  })

  it('clips oversized diagnostics and nulls empty ones', () => {
    const row = buildFeedbackRow(normalizeFeedback(base)!, {
      appVersion: 'v'.repeat(500),
      platform: '  ',
      osVersion: 'o'.repeat(500),
      locale: 'l'.repeat(500),
    })
    expect(row.app_version).toHaveLength(FEEDBACK_DIAG_MAX.appVersion)
    expect(row.platform).toBeNull()
    expect(row.os_version).toHaveLength(FEEDBACK_DIAG_MAX.osVersion)
    expect(row.locale).toHaveLength(FEEDBACK_DIAG_MAX.locale)
  })
})

describe('classifyFeedbackResponse', () => {
  it('treats 2xx as success', () => {
    expect(classifyFeedbackResponse(201, true)).toBe('ok')
    expect(classifyFeedbackResponse(204, false)).toBe('ok')
  })

  it('retries anonymously only when the request with a token was refused', () => {
    // 401 = the token itself is dead → also invalidate it (account.ts contract).
    expect(classifyFeedbackResponse(401, true)).toBe('retry-anonymous-invalidate')
    // 403 = refused for this role, token still valid → retry without dropping it.
    expect(classifyFeedbackResponse(403, true)).toBe('retry-anonymous')
    expect(classifyFeedbackResponse(401, false)).toBe('server')
    expect(classifyFeedbackResponse(403, false)).toBe('server')
  })

  it('maps any other status to a server failure', () => {
    expect(classifyFeedbackResponse(400, true)).toBe('server')
    expect(classifyFeedbackResponse(404, false)).toBe('server')
    expect(classifyFeedbackResponse(500, false)).toBe('server')
  })
})

// The client validation must never let through a row the table's CHECKs reject
// (the report would be lost with a 400): keep the constants and 0015 in sync.
describe('mirror of supabase/migrations/0015_feedback.sql', () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '../../supabase/migrations/0015_feedback.sql'),
    'utf-8'
  )

  it('has the same kinds', () => {
    const quoted = FEEDBACK_KINDS.map((k) => `'${k}'`).join(', ')
    expect(sql).toContain(`kind in (${quoted})`)
  })

  it('has the same length limits', () => {
    expect(sql).toContain(`char_length(message) <= ${FEEDBACK_MESSAGE_MAX}`)
    expect(sql).toContain(`char_length(contact) <= ${FEEDBACK_CONTACT_MAX}`)
    expect(sql).toContain(`char_length(app_version) <= ${FEEDBACK_DIAG_MAX.appVersion}`)
    expect(sql).toContain(`char_length(platform) <= ${FEEDBACK_DIAG_MAX.platform}`)
    expect(sql).toContain(`char_length(os_version) <= ${FEEDBACK_DIAG_MAX.osVersion}`)
    expect(sql).toContain(`char_length(locale) <= ${FEEDBACK_DIAG_MAX.locale}`)
  })

  it('only grants INSERT on the columns the client sends', () => {
    const grant = /grant insert \(([^)]*)\)/.exec(sql)
    expect(grant).not.toBeNull()
    const cols = grant![1].split(',').map((c) => c.trim()).sort()
    const row = buildFeedbackRow(normalizeFeedback(base)!, diag)
    expect(cols).toEqual(Object.keys(row).sort())
  })
})
