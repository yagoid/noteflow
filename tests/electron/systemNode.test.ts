// Finding the computer's Node.js (electron/systemNode.ts): what "Run" of the
// agent tasks uses on Windows to run the CLI inside a terminal — the app's
// binary gets no console there. Pure: the disk and `node --version` are faked,
// except in the last test, which asks the Node that runs these tests.
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import {
  SYSTEM_NODE_MAX_CANDIDATES,
  isInsideDir,
  isUsableNodeVersion,
  parseNodeMajor,
  resolveSystemNode,
  systemNodeCandidates,
} from '../../electron/systemNode'

describe('the version `node --version` prints', () => {
  it('its major, from the usual shapes', () => {
    expect(parseNodeMajor('v22.3.0')).toBe(22)
    expect(parseNodeMajor('v18.0.0\r\n')).toBe(18)
    expect(parseNodeMajor('  v24.14.0\n')).toBe(24)
    expect(parseNodeMajor('v23.0.0-nightly20240101abcdef')).toBe(23)
    expect(parseNodeMajor('v0.10.48')).toBe(0)
  })

  it('anything that is not a Node version is none', () => {
    for (const text of ['', '22.3.0', 'v22', 'v22.3', 'node v22.3.0', 'v22.3.0\nextra', 'Electron v35.0.0', 'vX.1.2', null, undefined]) {
      expect(parseNodeMajor(text), String(text)).toBeNull()
    }
  })

  it('usable = Node 18 or later (what the CLI needs)', () => {
    expect(isUsableNodeVersion('v18.0.0')).toBe(true)
    expect(isUsableNodeVersion('v24.14.0\n')).toBe(true)
    expect(isUsableNodeVersion('v17.9.1')).toBe(false)
    expect(isUsableNodeVersion('v8.17.0')).toBe(false)
    expect(isUsableNodeVersion('not node')).toBe(false)
    expect(isUsableNodeVersion(null)).toBe(false)
  })
})

describe('isInsideDir', () => {
  it('Windows: case-insensitive, either slash; a sibling with the same prefix is outside', () => {
    expect(isInsideDir('win32', 'C:\\Proj\\bin\\node.exe', 'c:\\proj')).toBe(true)
    expect(isInsideDir('win32', 'C:/proj/node.exe', 'C:\\proj\\')).toBe(true)
    expect(isInsideDir('win32', 'C:\\proj', 'C:\\proj')).toBe(true)
    expect(isInsideDir('win32', 'C:\\project\\node.exe', 'C:\\proj')).toBe(false)
    expect(isInsideDir('win32', 'D:\\proj\\node.exe', 'C:\\proj')).toBe(false)
    expect(isInsideDir('win32', 'C:\\node.exe', 'C:\\proj')).toBe(false)
  })

  it('POSIX: case-sensitive', () => {
    expect(isInsideDir('linux', '/home/ana/proj/bin/node', '/home/ana/proj')).toBe(true)
    expect(isInsideDir('linux', '/home/ana/Proj/node', '/home/ana/proj')).toBe(false)
    expect(isInsideDir('linux', '/usr/bin/node', '/home/ana/proj')).toBe(false)
  })
})

describe('the `node` of PATH', () => {
  const files = (...list: string[]) => {
    const set = new Set(list.map((f) => f.toLowerCase()))
    return (file: string) => set.has(file.toLowerCase())
  }

  it('Windows: node.exe in PATH\'s order, absolute — the variable is `Path`, entries may be quoted or repeated', () => {
    const env = { Path: 'C:\\Windows\\System32;"C:\\Program Files\\nodejs";C:\\Users\\Ana\\AppData\\Roaming\\nvm\\v20; c:\\program files\\nodejs\\ ;;' }
    const isRunnable = files('C:\\Program Files\\nodejs\\node.exe', 'C:\\Users\\Ana\\AppData\\Roaming\\nvm\\v20\\node.exe')
    expect(systemNodeCandidates({ platform: 'win32', env, isRunnable })).toEqual([
      'C:\\Program Files\\nodejs\\node.exe',
      'C:\\Users\\Ana\\AppData\\Roaming\\nvm\\v20\\node.exe',
    ])
    expect(systemNodeCandidates({ platform: 'win32', env: { PATH: 'C:\\Program Files\\nodejs' }, isRunnable })).toEqual(['C:\\Program Files\\nodejs\\node.exe'])
    expect(systemNodeCandidates({ platform: 'win32', env: {}, isRunnable })).toEqual([])
  })

  it('Windows: only node.exe — never a .cmd / .bat shim, whatever PATHEXT says', () => {
    const asked: string[] = []
    const env = { Path: 'C:\\shims', PATHEXT: '.CMD;.BAT;.EXE' }
    expect(systemNodeCandidates({ platform: 'win32', env, isRunnable: (f) => { asked.push(f); return f.endsWith('node.cmd') } })).toEqual([])
    expect(asked).toEqual(['C:\\shims\\node.exe'])
  })

  it('never in the current folder, a relative entry or a network path — they are not even looked at', () => {
    const asked: string[] = []
    const isRunnable = (f: string) => { asked.push(f); return true }
    const env = { Path: '.;node_modules\\.bin;..\\tools;\\rooted;\\\\nas\\share\\node;C:relative;D:\\tools' }
    expect(systemNodeCandidates({ platform: 'win32', env, isRunnable })).toEqual(['D:\\tools\\node.exe'])
    expect(asked).toEqual(['D:\\tools\\node.exe'])
    asked.length = 0
    expect(systemNodeCandidates({ platform: 'linux', env: { PATH: '.:bin:~/bin::/usr/local/bin' }, isRunnable })).toEqual(['/usr/local/bin/node'])
    expect(asked).toEqual(['/usr/local/bin/node'])
  })

  it('never inside an excluded folder (the note\'s project): a repository\'s own node.exe does not run the CLI', () => {
    const env = { Path: 'C:\\Proj\\tools;c:\\proj;C:\\project\\bin;C:\\Program Files\\nodejs' }
    expect(systemNodeCandidates({ platform: 'win32', env, isRunnable: () => true, exclude: ['C:\\proj'] })).toEqual([
      'C:\\project\\bin\\node.exe',
      'C:\\Program Files\\nodejs\\node.exe',
    ])
    // An exclusion that is not an absolute folder excludes nothing (it would be resolved against the current folder).
    expect(systemNodeCandidates({ platform: 'win32', env: { Path: 'C:\\a' }, isRunnable: () => true, exclude: ['', 'a'] })).toEqual(['C:\\a\\node.exe'])
  })

  it('macOS / Linux: `node`, PATH with `:`', () => {
    const isRunnable = files('/opt/homebrew/bin/node', '/usr/bin/node')
    expect(systemNodeCandidates({ platform: 'darwin', env: { PATH: '/usr/local/bin:/opt/homebrew/bin:/usr/bin', Path: 'ignored' }, isRunnable }))
      .toEqual(['/opt/homebrew/bin/node', '/usr/bin/node'])
  })
})

describe('resolveSystemNode', () => {
  const env = { Path: 'C:\\old;C:\\broken;C:\\good;C:\\newer' }
  const versions: Record<string, string | null> = {
    'C:\\old\\node.exe': 'v16.20.2\n',
    'C:\\broken\\node.exe': null,
    'C:\\good\\node.exe': 'v20.11.1\n',
    'C:\\newer\\node.exe': 'v24.0.0\n',
  }
  const deps = (over: Partial<Parameters<typeof resolveSystemNode>[0]> = {}) => {
    const asked: string[] = []
    return {
      asked,
      d: {
        platform: 'win32' as const, env, isRunnable: (f: string) => f in versions,
        readVersion: async (f: string) => { asked.push(f); return versions[f] }, ...over,
      },
    }
  }

  it('the first Node 18+ of PATH: an older or a broken one before it is skipped; nothing after it is run', async () => {
    const { d, asked } = deps()
    expect(await resolveSystemNode(d)).toBe('C:\\good\\node.exe')
    expect(asked).toEqual(['C:\\old\\node.exe', 'C:\\broken\\node.exe', 'C:\\good\\node.exe'])
  })

  it('none: no node in PATH, only old ones, one that throws, or the good one is inside the excluded folder', async () => {
    expect(await resolveSystemNode(deps({ env: { Path: 'C:\\Windows' } }).d)).toBeNull()
    expect(await resolveSystemNode(deps({ env: { Path: 'C:\\old;C:\\broken' } }).d)).toBeNull()
    expect(await resolveSystemNode(deps({ env: { Path: 'C:\\good' }, readVersion: async () => { throw new Error('EACCES') } }).d)).toBeNull()
    expect(await resolveSystemNode(deps({ env: { Path: 'C:\\old;C:\\good' }, exclude: ['C:\\good'] }).d)).toBeNull()
    expect(await resolveSystemNode(deps({ exclude: ['C:\\good'] }).d)).toBe('C:\\newer\\node.exe')
  })

  it('a PATH full of old Nodes is not walked forever', async () => {
    const dirs = Array.from({ length: 30 }, (_v, i) => `C:\\n${i}`)
    const asked: string[] = []
    const found = await resolveSystemNode({
      platform: 'win32', env: { Path: dirs.join(';') }, isRunnable: () => true,
      readVersion: async (f) => { asked.push(f); return 'v12.0.0' },
    })
    expect(found).toBeNull()
    expect(asked).toHaveLength(SYSTEM_NODE_MAX_CANDIDATES)
  })

  it('for real: the Node that runs these tests is found through its own folder and passes the version check', async () => {
    const dir = path.dirname(process.execPath)
    const found = await resolveSystemNode({
      platform: process.platform,
      env: { PATH: dir },
      isRunnable: (f) => f.toLowerCase() === process.execPath.toLowerCase(),
      readVersion: async (f) => execFileSync(f, ['--version'], { encoding: 'utf-8', windowsHide: true, timeout: 20_000 }),
    })
    // Only when the binary is named node(.exe) — it is, under vitest.
    if (/^node(\.exe)?$/i.test(path.basename(process.execPath))) expect(found?.toLowerCase()).toBe(process.execPath.toLowerCase())
  })
})
