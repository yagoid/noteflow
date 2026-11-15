// "Open with NoteFlow": which arguments of a launch are files to open (electron/openWithArgs.ts).
import { describe, it, expect } from 'vitest'
import path from 'path'
import { absolutizeFileArgs, fileUrlToPath, launchFilePaths, MAX_LAUNCH_FILES, openTargets, uniqueOpenPaths } from '../../electron/openWithArgs'

const winFiles = new Set(['C:\\notes\\a.md', 'C:\\notes\\b.txt', 'C:\\work\\c.json', 'C:\\work\\d e.md', '\\\\srv\\share\\f.md', 'C:\\repo\\dist-electron\\main.js'])
const isWinFile = (p: string) => winFiles.has(p)
const win = { platform: 'win32', cwd: 'C:\\work', isFile: isWinFile }

const posixFiles = new Set(['/home/u/a.md', '/home/u/my notes.md', '/tmp/x.txt'])
const posix = { platform: 'linux', cwd: '/home/u', isFile: (p: string) => posixFiles.has(p) }

describe('launchFilePaths', () => {
  it('takes the files of a packaged launch (argv[0] = the executable)', () => {
    expect(launchFilePaths(['C:\\Program Files\\NoteFlow\\NoteFlow.exe', 'C:\\notes\\a.md'], { ...win, defaultApp: false }))
      .toEqual(['C:\\notes\\a.md'])
  })

  it('drops switches (with or without a value) and the startup flag', () => {
    expect(launchFilePaths([
      'NoteFlow.exe', '--noteflow-startup', '--allow-file-access-from-files', '--original-process-start-time=1',
      '--user-data-dir=C:\\notes\\a.md', '-x', 'C:\\notes\\b.txt',
    ], { ...win, defaultApp: false })).toEqual(['C:\\notes\\b.txt'])
  })

  it('in dev / e2e skips the app path, even after Chromium moved the switches before it', () => {
    // `electron dist-electron/main.js file.md` → second-instance argv: switches first.
    expect(launchFilePaths([
      'C:\\repo\\node_modules\\electron\\dist\\electron.exe', '--user-data-dir=C:\\tmp\\ud', '--allow-file-access-from-files',
      'C:\\repo\\dist-electron\\main.js', 'C:\\notes\\a.md',
    ], { ...win, defaultApp: true })).toEqual(['C:\\notes\\a.md'])
    // `electron .` (the app dir is not a file anyway).
    expect(launchFilePaths(['electron.exe', '.', 'C:\\notes\\b.txt'], { ...win, defaultApp: true })).toEqual(['C:\\notes\\b.txt'])
  })

  it('never opens the excluded paths (executable, app path / main script)', () => {
    expect(launchFilePaths(['NoteFlow.exe', 'C:\\repo\\dist-electron\\main.js', 'C:\\notes\\a.md'], {
      ...win, defaultApp: false, exclude: ['C:\\repo\\dist-electron\\main.js'],
    })).toEqual(['C:\\notes\\a.md'])
    // Excluded paths compare with the platform's case rules.
    expect(launchFilePaths(['NoteFlow.exe', 'c:\\REPO\\dist-electron\\MAIN.js'], {
      ...win, platform: 'win32', isFile: () => true, defaultApp: false, exclude: ['C:\\repo\\dist-electron\\main.js'],
    })).toEqual([])
  })

  it('resolves relative paths against the launching directory, keeps only existing files', () => {
    expect(launchFilePaths(['NoteFlow.exe', 'c.json', 'missing.md', '..\\notes\\a.md', 'd e.md'], { ...win, defaultApp: false }))
      .toEqual(['C:\\work\\c.json', 'C:\\notes\\a.md', 'C:\\work\\d e.md'])
    expect(launchFilePaths(['/opt/NoteFlow/noteflow', 'a.md', 'my notes.md', '../../tmp/x.txt'], { ...posix, defaultApp: false }))
      .toEqual(['/home/u/a.md', '/home/u/my notes.md', '/tmp/x.txt'])
  })

  it('takes any existing file (main refuses a binary one), but no directory', () => {
    const files = { ...win, isFile: (p: string) => p.endsWith('.json') || p.endsWith('.exe') }
    expect(launchFilePaths(['NoteFlow.exe', 'C:\\work\\c.json', 'C:\\x\\tool.exe', 'C:\\work'], { ...files, defaultApp: false }))
      .toEqual(['C:\\work\\c.json', 'C:\\x\\tool.exe'])
  })

  it('de-duplicates (platform case rules) and caps how many', () => {
    expect(launchFilePaths(['NoteFlow.exe', 'C:\\notes\\a.md', 'c:\\NOTES\\A.MD', 'C:\\notes\\a.md'], {
      ...win, isFile: () => true, defaultApp: false,
    })).toEqual(['C:\\notes\\a.md'])
    const many = Array.from({ length: MAX_LAUNCH_FILES + 10 }, (_, i) => `/tmp/f${i}.md`)
    expect(launchFilePaths(['noteflow', ...many], { ...posix, isFile: () => true, defaultApp: false })).toHaveLength(MAX_LAUNCH_FILES)
  })

  it('treats a single leading slash as a switch on Windows only', () => {
    expect(launchFilePaths(['NoteFlow.exe', '/flag', 'C:\\notes\\a.md'], { ...win, isFile: () => true, defaultApp: false }))
      .toEqual(['C:\\notes\\a.md'])
    expect(launchFilePaths(['NoteFlow.exe', '//srv/share/f.md'], { ...win, isFile: () => true, defaultApp: false }))
      .toEqual(['\\\\srv\\share\\f.md'])
    expect(launchFilePaths(['noteflow', '/tmp/x.txt'], { ...posix, defaultApp: false })).toEqual(['/tmp/x.txt'])
  })

  it('turns file: URLs into paths (Linux desktop entries launch with %U) and ignores other URLs', () => {
    expect(launchFilePaths(['noteflow', 'file:///home/u/my%20notes.md', 'https://example.com/a.md', 'noteflow://x'], { ...posix, defaultApp: false }))
      .toEqual(['/home/u/my notes.md'])
    expect(launchFilePaths(['NoteFlow.exe', 'file:///C:/work/d%20e.md'], { ...win, defaultApp: false })).toEqual(['C:\\work\\d e.md'])
  })

  it('ignores non-strings, blanks and NUL bytes', () => {
    expect(launchFilePaths(['noteflow', 42, '', '   ', '/tmp/x.txt\0.md', '/tmp/x.txt'], { ...posix, isFile: () => true, defaultApp: false }))
      .toEqual(['/tmp/x.txt'])
  })
})

describe('openTargets (macOS open-file)', () => {
  it('keeps existing files only, no executable skipping', () => {
    expect(openTargets(['/home/u/a.md', '/home/u/nope.md'], posix)).toEqual(['/home/u/a.md'])
  })
})

describe('fileUrlToPath', () => {
  it('converts local file URLs per platform', () => {
    expect(fileUrlToPath('file:///home/u/a%23b.md', 'linux')).toBe('/home/u/a#b.md')
    expect(fileUrlToPath('file://localhost/tmp/x.txt', 'darwin')).toBe('/tmp/x.txt')
    expect(fileUrlToPath('file:///C:/Users/Me/a.md', 'win32')).toBe('C:\\Users\\Me\\a.md')
    expect(fileUrlToPath('file://srv/share/f.md', 'win32')).toBe('\\\\srv\\share\\f.md')
  })

  it('refuses other schemes, remote hosts on POSIX and malformed URLs', () => {
    expect(fileUrlToPath('http://x/a.md', 'linux')).toBeNull()
    expect(fileUrlToPath('file://other-host/a.md', 'linux')).toBeNull()
    expect(fileUrlToPath('file:///bad%E0%A4%A.md', 'linux')).toBeNull()
    expect(fileUrlToPath('file:///a%00b.md', 'linux')).toBeNull()
  })
})

describe('absolutizeFileArgs (relaunch after quit)', () => {
  it('makes relative existing files absolute against the launching directory and keeps the rest', () => {
    const isFile = (p: string) => p === path.posix.join('/home/u', 'a.md')
    expect(absolutizeFileArgs(['--user-data-dir=/x', '.', 'a.md', 'nope.md', '/tmp/x.txt', 'file:///y.md'], '/home/u', isFile, 'linux'))
      .toEqual(['--user-data-dir=/x', '.', '/home/u/a.md', 'nope.md', '/tmp/x.txt', 'file:///y.md'])
    expect(absolutizeFileArgs(['c.json'], 'C:\\work', isWinFile, 'win32')).toEqual(['C:\\work\\c.json'])
  })
})

describe('uniqueOpenPaths (one batch of the open queue)', () => {
  it('keeps each file once, first spelling and order, with the platform case rules', () => {
    // argv + second-instance (or a double double-click) queue the same file twice.
    expect(uniqueOpenPaths(['C:/notes/a.md', 'c:/NOTES/A.md', 'C:/notes/b.txt', 'C:/notes/a.md'], 'win32'))
      .toEqual(['C:/notes/a.md', 'C:/notes/b.txt'])
    expect(uniqueOpenPaths(['/home/u/a.md', '/home/u/A.md', '/home/u/a.md', ''], 'linux'))
      .toEqual(['/home/u/a.md', '/home/u/A.md'])
  })
})
