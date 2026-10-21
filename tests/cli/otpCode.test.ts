// OTP code parsing of `noteflow cloud login` (cli/noteflow.js). GoTrue's code
// length is a per-project setting (6–10 digits; the project emails 8), so the
// CLI must not pin one length — a 6-only regex once rejected every real code.
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const cli = require('../../cli/noteflow.js')

const normalizeOtpCode = cli.normalizeOtpCode as (answer: string) => string | null

describe('normalizeOtpCode', () => {
  it('accepts the 8-digit codes the project emails', () => {
    expect(normalizeOtpCode('12345678')).toBe('12345678')
  })

  it('accepts the whole GoTrue range (6–10 digits)', () => {
    expect(normalizeOtpCode('123456')).toBe('123456')
    expect(normalizeOtpCode('1234567890')).toBe('1234567890')
  })

  it('tolerates pasted spaces and dashes', () => {
    expect(normalizeOtpCode(' 1234 5678 ')).toBe('12345678')
    expect(normalizeOtpCode('1234-5678')).toBe('12345678')
  })

  it('rejects empty, too short, too long or non-numeric input', () => {
    expect(normalizeOtpCode('')).toBeNull()
    expect(normalizeOtpCode('12345')).toBeNull()
    expect(normalizeOtpCode('12345678901')).toBeNull()
    expect(normalizeOtpCode('1234abcd')).toBeNull()
  })
})
