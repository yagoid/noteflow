import fs from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'
import {
  pickUpdateTarget,
  isAllowedUpdateAssetPath,
  updateAssetKind,
  isRunningFromOwnAppImage,
  RELEASES_PAGE_URL,
  buildUpdateCheckResult,
  UPDATE_CHECK_FAILED,
  type UpdateTargetInput,
} from '../../electron/updateAsset'

const DL = 'https://github.com/yagoid/noteflow/releases/latest/download'

const linux = (over: Partial<UpdateTargetInput> = {}): UpdateTargetInput => ({
  platform: 'linux',
  version: '2.1.0',
  isAppImage: false,
  isDebian: false,
  ...over,
})

describe('pickUpdateTarget', () => {
  it('Windows → the NSIS installer with the published name', () => {
    expect(pickUpdateTarget({ platform: 'win32', version: '2.1.0', isAppImage: false, isDebian: false }))
      .toBe(`${DL}/NoteFlow-2.1.0-Setup.exe`)
  })

  it('macOS → the arm64 DMG with the published name', () => {
    expect(pickUpdateTarget({ platform: 'darwin', version: '2.1.0', isAppImage: false, isDebian: false }))
      .toBe(`${DL}/NoteFlow-2.1.0-arm64.dmg`)
  })

  it('Linux AppImage → NoteFlow-X.Y.Z.AppImage (no -x86_64 suffix)', () => {
    const url = pickUpdateTarget(linux({ isAppImage: true }))
    expect(url).toBe(`${DL}/NoteFlow-2.1.0.AppImage`)
    expect(url).not.toContain('x86_64')
  })

  it('Linux AppImage wins over Debian (an AppImage running on Ubuntu updates itself)', () => {
    expect(pickUpdateTarget(linux({ isAppImage: true, isDebian: true }))).toBe(`${DL}/NoteFlow-2.1.0.AppImage`)
  })

  it('Linux Debian-based (not AppImage) → noteflow_X.Y.Z_amd64.deb', () => {
    expect(pickUpdateTarget(linux({ isDebian: true }))).toBe(`${DL}/noteflow_2.1.0_amd64.deb`)
  })

  it('Linux Arch / Fedora / source build → the releases page, never a pacman package', () => {
    const url = pickUpdateTarget(linux())
    expect(url).toBe(RELEASES_PAGE_URL)
    expect(url).toBe('https://github.com/yagoid/noteflow/releases/latest')
    expect(url).not.toContain('pkg.tar.zst')
  })

  it('unknown platform or missing version → the releases page', () => {
    expect(pickUpdateTarget({ platform: 'freebsd', version: '2.1.0', isAppImage: false, isDebian: false }))
      .toBe(RELEASES_PAGE_URL)
    expect(pickUpdateTarget(linux({ version: undefined, isAppImage: true }))).toBe(RELEASES_PAGE_URL)
    expect(pickUpdateTarget({ platform: 'win32', version: '', isAppImage: false, isDebian: false }))
      .toBe(RELEASES_PAGE_URL)
  })

  it('every asset it picks passes the allow-check; the releases page does not', () => {
    const picked = [
      pickUpdateTarget({ platform: 'win32', version: '2.1.0', isAppImage: false, isDebian: false }),
      pickUpdateTarget({ platform: 'darwin', version: '2.1.0', isAppImage: false, isDebian: false }),
      pickUpdateTarget(linux({ isAppImage: true })),
      pickUpdateTarget(linux({ isDebian: true })),
    ]
    for (const url of picked) expect(isAllowedUpdateAssetPath(new URL(url).pathname)).toBe(true)
    // The renderer relies on this rejection to open the page in the browser instead.
    expect(isAllowedUpdateAssetPath(new URL(RELEASES_PAGE_URL).pathname)).toBe(false)
  })
})

describe('isAllowedUpdateAssetPath', () => {
  it('accepts the published asset extensions, case-insensitively', () => {
    expect(isAllowedUpdateAssetPath('/yagoid/noteflow/releases/latest/download/NoteFlow-2.1.0.AppImage')).toBe(true)
    expect(isAllowedUpdateAssetPath('/yagoid/noteflow/releases/latest/download/NoteFlow-2.1.0.appimage')).toBe(true)
    expect(isAllowedUpdateAssetPath('/yagoid/noteflow/releases/latest/download/NOTEFLOW-2.1.0-SETUP.EXE')).toBe(true)
    expect(isAllowedUpdateAssetPath('/yagoid/noteflow/releases/download/v2.1.0/noteflow_2.1.0_amd64.deb')).toBe(true)
    expect(isAllowedUpdateAssetPath('/YagoID/NoteFlow/releases/latest/download/NoteFlow-2.1.0-arm64.dmg')).toBe(true)
  })

  it('rejects pacman packages (never published) and unknown extensions', () => {
    expect(isAllowedUpdateAssetPath('/yagoid/noteflow/releases/latest/download/noteflow-2.1.0-x86_64.pkg.tar.zst')).toBe(false)
    expect(isAllowedUpdateAssetPath('/yagoid/noteflow/releases/latest/download/noteflow-2.1.0.rpm')).toBe(false)
    expect(isAllowedUpdateAssetPath('/yagoid/noteflow/releases/latest/download/latest.yml')).toBe(false)
    expect(isAllowedUpdateAssetPath('/yagoid/noteflow/releases/latest/download/NoteFlow-2.1.0-Setup.exe.blockmap')).toBe(false)
  })

  it('rejects anything outside this repo\'s releases', () => {
    expect(isAllowedUpdateAssetPath('/someone/noteflow/releases/latest/download/NoteFlow-2.1.0-Setup.exe')).toBe(false)
    expect(isAllowedUpdateAssetPath('/yagoid/other/releases/latest/download/NoteFlow-2.1.0-Setup.exe')).toBe(false)
    expect(isAllowedUpdateAssetPath('/evil/yagoid/noteflow/releases/latest/download/NoteFlow-2.1.0-Setup.exe')).toBe(false)
    expect(isAllowedUpdateAssetPath('/yagoid/noteflow/raw/main/NoteFlow-2.1.0-Setup.exe')).toBe(false)
  })
})

describe('updateAssetKind', () => {
  it('classifies installable assets by extension, case-insensitively', () => {
    expect(updateAssetKind('/tmp/NoteFlow-2.1.0.AppImage')).toBe('appimage')
    expect(updateAssetKind('/tmp/noteflow_2.1.0_amd64.deb')).toBe('deb')
    expect(updateAssetKind('C:\\Temp\\NoteFlow-2.1.0-Setup.exe')).toBe('exe')
    expect(updateAssetKind('NoteFlow-2.1.0-arm64.DMG')).toBe('dmg')
    expect(updateAssetKind('noteflow-2.1.0-x86_64.pkg.tar.zst')).toBeNull()
  })
})

describe('isRunningFromOwnAppImage', () => {
  const own = {
    appImage: '/home/u/Apps/NoteFlow-2.0.0.AppImage',
    appDir: '/tmp/.mount_NoteFlAbC123',
    execPath: '/tmp/.mount_NoteFlAbC123/noteflow',
  }

  it('true when APPIMAGE + APPDIR are set and execPath is inside APPDIR', () => {
    expect(isRunningFromOwnAppImage(own)).toBe(true)
    expect(isRunningFromOwnAppImage({ ...own, appDir: '/tmp/.mount_NoteFlAbC123/' })).toBe(true)
    expect(isRunningFromOwnAppImage({ ...own, execPath: '/tmp/.mount_NoteFlAbC123/usr/bin/noteflow' })).toBe(true)
  })

  it('false when APPIMAGE or APPDIR is missing (dev, .deb, plain install)', () => {
    expect(isRunningFromOwnAppImage({ ...own, appImage: undefined })).toBe(false)
    expect(isRunningFromOwnAppImage({ ...own, appImage: '' })).toBe(false)
    expect(isRunningFromOwnAppImage({ ...own, appDir: undefined })).toBe(false)
  })

  it('false for a .deb NoteFlow that inherited APPIMAGE/APPDIR from another AppImage', () => {
    expect(isRunningFromOwnAppImage({
      appImage: '/home/u/Apps/SomeTerminal.AppImage',
      appDir: '/tmp/.mount_SomeTeXyZ',
      execPath: '/opt/NoteFlow/noteflow',
    })).toBe(false)
  })

  it('compares by path segment, not raw prefix', () => {
    expect(isRunningFromOwnAppImage({ ...own, appDir: '/tmp/.mount_ab', execPath: '/tmp/.mount_abc/noteflow' })).toBe(false)
    // APPDIR itself is not "inside" APPDIR.
    expect(isRunningFromOwnAppImage({ ...own, execPath: '/tmp/.mount_NoteFlAbC123' })).toBe(false)
    // '..' cannot escape the mount point.
    expect(isRunningFromOwnAppImage({ ...own, execPath: '/tmp/.mount_NoteFlAbC123/../evil/noteflow' })).toBe(false)
  })

  it('rejects a relative or root APPDIR', () => {
    expect(isRunningFromOwnAppImage({ ...own, appDir: '/', execPath: '/opt/NoteFlow/noteflow' })).toBe(false)
    expect(isRunningFromOwnAppImage({ ...own, appDir: 'tmp/.mount_x', execPath: 'tmp/.mount_x/noteflow' })).toBe(false)
  })
})

describe('buildUpdateCheckResult', () => {
  const pick = (v: string) => `${DL}/NoteFlow-${v}-Setup.exe`
  const release = (tag: unknown) => JSON.stringify({ tag_name: tag })

  it('reports a newer release with its download URL', () => {
    expect(buildUpdateCheckResult(200, release('v2.1.0'), '2.0.0', pick)).toEqual({
      hasUpdate: true,
      latestVersion: '2.1.0',
      downloadUrl: `${DL}/NoteFlow-2.1.0-Setup.exe`,
    })
  })

  it('reports up to date only when the check succeeded', () => {
    const result = buildUpdateCheckResult(200, release('v2.0.0'), '2.0.0', pick)
    expect(result.hasUpdate).toBe(false)
    expect(result.error).toBeUndefined()
  })

  it('flags a failed check instead of claiming "up to date"', () => {
    // GitHub rate limit / outage: an error JSON without tag_name.
    expect(buildUpdateCheckResult(403, JSON.stringify({ message: 'API rate limit exceeded' }), '2.0.0', pick))
      .toEqual(UPDATE_CHECK_FAILED)
    expect(buildUpdateCheckResult(500, release('v2.1.0'), '2.0.0', pick)).toEqual(UPDATE_CHECK_FAILED)
    expect(buildUpdateCheckResult(undefined, release('v2.1.0'), '2.0.0', pick)).toEqual(UPDATE_CHECK_FAILED)
    expect(buildUpdateCheckResult(200, '<html>proxy error</html>', '2.0.0', pick)).toEqual(UPDATE_CHECK_FAILED)
    expect(buildUpdateCheckResult(200, JSON.stringify({}), '2.0.0', pick)).toEqual(UPDATE_CHECK_FAILED)
    expect(buildUpdateCheckResult(200, release(''), '2.0.0', pick)).toEqual(UPDATE_CHECK_FAILED)
    expect(buildUpdateCheckResult(200, 'null', '2.0.0', pick)).toEqual(UPDATE_CHECK_FAILED)
    expect(UPDATE_CHECK_FAILED).toEqual({ hasUpdate: false, error: true })
  })
})

// Contract with the electron-builder config: the updater builds asset names by hand, so a
// change to package.json → build (artifactName, productName, name) must not silently
// diverge from what pickUpdateTarget() asks for (a 404 for every user, shipped inside the
// OLD version). Mirrors electron-builder 26's naming rules (app-builder-lib):
//   - pattern = target.artifactName || platform.artifactName || build.artifactName || default
//   - NSIS default "${productName} Setup ${version}.${ext}"; deb default
//     "${name}_${version}_${arch}.${ext}" with arch kept even on x64 ("amd64");
//     AppImage default "${productName}-${version}-${arch}.${ext}" with "-${arch}" DROPPED
//     on x64 unless the pattern was user-specified (then arch = "x86_64").
// scripts/update-e2e.cjs proves the same end to end on real builds.
describe('pickUpdateTarget ↔ electron-builder artifact names (package.json build)', () => {
  type Opts = { artifactName?: string }
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf-8')) as {
    name: string
    build: Opts & { productName: string; win?: Opts; nsis?: Opts; mac?: Opts; dmg?: Opts; linux?: Opts; deb?: Opts; appImage?: Opts }
  }
  const b = pkg.build

  function expand(pattern: string, version: string, ext: string, arch: string | null): string {
    let p = pattern
    if (arch === null) p = p.replace('-${arch}', '').replace(' ${arch}', '').replace('_${arch}', '')
    const vars: Record<string, string> = { productName: b.productName, name: pkg.name, version, ext, arch: arch ?? '' }
    return p.replace(/\$\{(\w+)\}/g, (_m, k: string) => {
      if (!(k in vars)) throw new Error(`macro \${${k}} not modelled by this test — extend it`)
      return vars[k]
    })
  }
  const pattern = (...candidates: Array<string | undefined>) => candidates.find(Boolean)
  const basename = (url: string) => decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '')

  for (const version of ['2.1.0', '2.1.0-e2e.1']) {
    it(`Windows NSIS (${version})`, () => {
      const user = pattern(b.nsis?.artifactName, b.win?.artifactName, b.artifactName)
      const name = expand(user ?? '${productName} Setup ${version}.${ext}', version, 'exe', user ? 'x64' : null)
      expect(basename(pickUpdateTarget({ platform: 'win32', version, isAppImage: false, isDebian: false }))).toBe(name)
    })

    it(`Linux .deb (${version})`, () => {
      const user = pattern(b.deb?.artifactName, b.linux?.artifactName, b.artifactName)
      const name = expand(user ?? '${name}_${version}_${arch}.${ext}', version, 'deb', 'amd64')
      expect(basename(pickUpdateTarget(linux({ version, isDebian: true })))).toBe(name)
    })

    it(`Linux AppImage (${version})`, () => {
      const user = pattern(b.appImage?.artifactName, b.linux?.artifactName, b.artifactName)
      const name = expand(user ?? '${productName}-${version}-${arch}.${ext}', version, 'AppImage', user ? 'x86_64' : null)
      expect(basename(pickUpdateTarget(linux({ version, isAppImage: true })))).toBe(name)
    })

    it(`macOS dmg arm64 (${version})`, () => {
      const user = pattern(b.dmg?.artifactName, b.mac?.artifactName, b.artifactName)
      const name = expand(user ?? '${productName}-${version}-${arch}.${ext}', version, 'dmg', 'arm64')
      expect(basename(pickUpdateTarget({ platform: 'darwin', version, isAppImage: false, isDebian: false }))).toBe(name)
    })
  }
})
