import { describe, it, expect } from 'vitest'
import { secondInstanceRelaunchArgs, STARTUP_FLAG } from '../../electron/relaunchArgs'

// A launch that arrived while quitting is relaunched after exit with these args.
describe('secondInstanceRelaunchArgs', () => {
  it('drops the executable (relaunch uses process.execPath)', () => {
    expect(secondInstanceRelaunchArgs(['C:\\Program Files\\NoteFlow\\NoteFlow.exe'])).toEqual([])
    expect(secondInstanceRelaunchArgs([])).toEqual([])
  })

  it('drops the startup flag: the user clicked the icon and wants the window', () => {
    expect(secondInstanceRelaunchArgs(['/usr/bin/noteflow', STARTUP_FLAG])).toEqual([])
  })

  it('drops the switches Chromium injects, with or without a value', () => {
    expect(
      secondInstanceRelaunchArgs([
        'NoteFlow.exe',
        '--allow-file-access-from-files',
        '--original-process-start-time=13385470123456789',
        '--original-process-start-time',
      ]),
    ).toEqual([])
  })

  it('keeps every other arg in order (dev: app path and user data dir)', () => {
    // Real argv seen in 'second-instance' on Windows: Chromium moves switches before the
    // positional app path and adds --allow-file-access-from-files.
    expect(
      secondInstanceRelaunchArgs([
        'C:\\repo\\node_modules\\electron\\dist\\electron.exe',
        '--user-data-dir=.electron-dev',
        '--allow-file-access-from-files',
        '.',
      ]),
    ).toEqual(['--user-data-dir=.electron-dev', '.'])
  })

  it('does not drop switches that merely share a prefix', () => {
    expect(
      secondInstanceRelaunchArgs(['x', '--allow-file-access-from-files-extra', '--noteflow-startup-x']),
    ).toEqual(['--allow-file-access-from-files-extra', '--noteflow-startup-x'])
  })
})
