// `noteflow self-update` also refreshes the AI agent skill (cli/noteflow.js),
// but only the SKILL.md copies that already exist: it must never install the
// skill where it wasn't, nor bring it back where the user turned it off in the
// app. Destinations mirror skillAgentDestDirs() in electron/main.ts. Pure fs on
// a throwaway home dir — no network.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const cli = require('../../cli/noteflow.js')

type RefreshResult = { updated: string[]; current: string[]; failed: string[] }
const skillAgentDestDirs = cli.skillAgentDestDirs as (home: string) => string[]
const refreshInstalledSkills = cli.refreshInstalledSkills as (home: string, content: string) => RefreshResult

const NEW = '---\nname: noteflow-cli\nversion: 9.9.9\n---\nnew\n'
let home: string
const skillFile = (...parts: string[]) => path.join(home, ...parts, 'noteflow-cli', 'SKILL.md')
const put = (file: string, content: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content, 'utf-8')
}

beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-skill-')) })
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }) })

describe('skillAgentDestDirs', () => {
  it('targets Claude Code and the Agent Skills standard dir', () => {
    expect(skillAgentDestDirs(home)).toEqual([
      path.join(home, '.claude', 'skills', 'noteflow-cli'),
      path.join(home, '.agents', 'skills', 'noteflow-cli'),
    ])
  })

  it('adds Windsurf only when ~/.codeium/windsurf already exists', () => {
    fs.mkdirSync(path.join(home, '.codeium', 'windsurf'), { recursive: true })
    expect(skillAgentDestDirs(home)).toContain(path.join(home, '.codeium', 'windsurf', 'skills', 'noteflow-cli'))
  })
})

describe('refreshInstalledSkills', () => {
  it('does nothing (and creates nothing) when the skill is not installed', () => {
    expect(refreshInstalledSkills(home, NEW)).toEqual({ updated: [], current: [], failed: [] })
    expect(fs.readdirSync(home)).toEqual([])
  })

  it('rewrites stale copies, leaves identical ones and never adds missing ones', () => {
    put(skillFile('.claude', 'skills'), 'old')
    put(skillFile('.agents', 'skills'), NEW)
    fs.mkdirSync(path.join(home, '.codeium', 'windsurf'), { recursive: true })

    const r = refreshInstalledSkills(home, NEW)

    expect(r.updated).toEqual([skillFile('.claude', 'skills')])
    expect(r.current).toEqual([skillFile('.agents', 'skills')])
    expect(r.failed).toEqual([])
    expect(fs.readFileSync(skillFile('.claude', 'skills'), 'utf-8')).toBe(NEW)
    expect(fs.existsSync(skillFile('.codeium', 'windsurf', 'skills'))).toBe(false)
  })

  it('keeps going when one destination cannot be written', () => {
    // A directory named SKILL.md: exists, but reading it as a file fails.
    fs.mkdirSync(skillFile('.claude', 'skills'), { recursive: true })
    put(skillFile('.agents', 'skills'), 'old')

    const r = refreshInstalledSkills(home, NEW)

    expect(r.failed).toEqual([skillFile('.claude', 'skills')])
    expect(r.updated).toEqual([skillFile('.agents', 'skills')])
  })
})
