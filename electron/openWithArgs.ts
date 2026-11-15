// "Open with NoteFlow": the files the OS — or a terminal (`NoteFlow file.md`) — asks NoteFlow
// to open. They arrive in the command line of the first launch (process.argv), in the argv a
// second launch forwards through 'second-instance' (Windows / Linux), or one by one through
// macOS's 'open-file' event. main.ts links each as a TRANSIENT linked note (a grant of its
// own: linkedNotes.grantLinkPaths) and opens it — see patterns.md § "Notas vinculadas" →
// "Abrir desde el sistema / notas temporales".
//
// Pure (no Electron, the file check injected) so it can be unit-tested
// (tests/electron/openWithArgs.test.ts), like relaunchArgs.ts.

import path from 'path'
import { linkedPathKey } from './linkedNotesLogic'

/** At most this many files from one launch (a glob gone wrong must not link a whole folder). */
export const MAX_LAUNCH_FILES = 50

export interface OpenTargetOptions {
  /** Directory relative paths are resolved against (the launching process's, for 'second-instance'). */
  cwd: string
  /** Paths that are never a file to open: the executable, the app path / main script (dev). */
  exclude?: readonly string[]
  /** Whether an ABSOLUTE path is an existing regular file (fs in main, a stub in tests). */
  isFile: (absolutePath: string) => boolean
  platform?: NodeJS.Platform | string
}

export interface LaunchFileOptions extends OpenTargetOptions {
  /**
   * Started as `electron <app>` (dev, e2e — Electron's `process.defaultApp`): the first
   * positional argument is the app path / main script, never a file to open.
   */
  defaultApp: boolean
}

function pathModule(platform: string): typeof path.posix {
  return platform === 'win32' ? path.win32 : path.posix
}

/**
 * A command-line switch (`--x`, `--x=y`, `-x`). On Windows a single leading `/` is one too
 * (Chromium's switch prefix there); `//host/share` is a UNC path, not a switch.
 */
function isSwitch(arg: string, platform: string): boolean {
  return arg.startsWith('-') || (platform === 'win32' && /^\/(?!\/)/.test(arg))
}

/**
 * A `file:` URL (Linux desktop entries launch with `%U`, which may hand local files over as
 * URLs) → the local path; null for any other URL, a remote host or a malformed one.
 */
export function fileUrlToPath(arg: string, platform: string = process.platform): string | null {
  if (!/^file:/i.test(arg)) return null
  let url: URL
  try { url = new URL(arg) } catch { return null }
  let pathname: string
  try { pathname = decodeURIComponent(url.pathname) } catch { return null }
  if (pathname.includes('\0')) return null
  const host = url.hostname && url.hostname.toLowerCase() !== 'localhost' ? url.hostname : ''
  if (platform === 'win32') {
    const local = pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/\//g, '\\')
    return host ? `\\\\${host}${local}` : local
  }
  return host ? null : pathname
}

/**
 * The files to open among `args` (positional arguments or 'open-file' paths): switches and
 * URLs other than `file:` dropped, `file:` URLs turned into paths, relative paths resolved
 * against `cwd`, then only EXISTING regular files that aren't excluded — normalized and
 * de-duplicated (platform case rules), in order, at most MAX_LAUNCH_FILES. Any extension: a
 * linked note can be any text file, and main refuses a binary one when it links it.
 */
export function openTargets(args: readonly unknown[], opts: OpenTargetOptions): string[] {
  const platform = opts.platform ?? process.platform
  const mod = pathModule(platform)
  const excluded = new Set((opts.exclude ?? []).filter((p) => typeof p === 'string' && p.trim()).map((p) => linkedPathKey(mod.resolve(opts.cwd, p), platform)))
  const seen = new Set<string>()
  const out: string[] = []
  for (const arg of args) {
    if (out.length >= MAX_LAUNCH_FILES) break
    if (typeof arg !== 'string' || !arg.trim() || arg.includes('\0') || isSwitch(arg, platform)) continue
    let candidate: string | null = arg
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(arg)) candidate = fileUrlToPath(arg, platform) // a URL: only file:
    if (!candidate) continue
    const absolute = mod.resolve(opts.cwd, candidate)
    const key = linkedPathKey(absolute, platform)
    if (excluded.has(key) || seen.has(key)) continue
    if (!opts.isFile(absolute)) continue
    seen.add(key)
    out.push(absolute)
  }
  return out
}

/**
 * The files to open from a launch's argv (`process.argv` of this process, or the argv of a
 * 'second-instance'): argv[0] is the executable; in dev / e2e (`defaultApp`) the first
 * positional argument is the app path. Chromium puts the switches of a forwarded argv BEFORE
 * the positional arguments, so "first positional" is counted after dropping switches.
 */
export function launchFilePaths(argv: readonly unknown[], opts: LaunchFileOptions): string[] {
  const platform = opts.platform ?? process.platform
  const positional = argv.slice(1).filter((a): a is string => typeof a === 'string' && !!a.trim() && !isSwitch(a, platform))
  return openTargets(opts.defaultApp ? positional.slice(1) : positional, opts)
}

/**
 * The pending files of one batch, each once (platform case rules), in order. The same file can
 * be queued twice (opened again while a slow startup was still loading the registry, or in our
 * own argv AND a 'second-instance'): linking it twice would consume its single-use grant on the
 * first copy and report the second as `notGranted`.
 */
export function uniqueOpenPaths(paths: readonly string[], platform: string = process.platform): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of paths) {
    if (typeof p !== 'string' || !p.trim()) continue
    const key = linkedPathKey(p, platform)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

/**
 * Relaunch args (a launch that arrived while quitting, relaunched after exit): a RELATIVE
 * argument naming an existing file is made absolute against the launching process's
 * directory — the relaunched process starts in ours. Everything else is kept as is.
 */
export function absolutizeFileArgs(args: readonly string[], cwd: string, isFile: (absolutePath: string) => boolean, platform: string = process.platform): string[] {
  const mod = pathModule(platform)
  return args.map((arg) => {
    if (!arg || isSwitch(arg, platform) || mod.isAbsolute(arg) || /^[a-z][a-z0-9+.-]*:/i.test(arg)) return arg
    const absolute = mod.resolve(cwd, arg)
    return isFile(absolute) ? absolute : arg
  })
}
