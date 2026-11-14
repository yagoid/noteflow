// Relaunch after quit, for a launch that arrived while NoteFlow was quitting.
//
// Pure logic, no Electron imports (same pattern as updateAsset.ts) so it can be unit-tested.
// main.ts keeps the single-instance lock until Electron releases it on 'quit' (after every
// window has closed): a launch in between (the pinned taskbar icon clicked right after
// "Quit") loses the lock, notifies the dying process through 'second-instance' and exits.
// main.ts then schedules ONE relaunch after exit with the args built here, so the click is
// honoured without two processes ever sharing the notes dir and userData.

/** Login autostart flag: starts with the main window hidden in the tray. */
export const STARTUP_FLAG = '--noteflow-startup'

/**
 * Switches Chromium adds to the argv a second instance reports — not the user's nor the
 * app's (Electron documents `--original-process-start-time`; `--allow-file-access-from-files`
 * shows up on Windows). Matched as `--name` or `--name=value`.
 */
const CHROMIUM_INJECTED_SWITCHES = ['--allow-file-access-from-files', '--original-process-start-time']

function isSwitch(arg: string, name: string): boolean {
  return arg === name || arg.startsWith(`${name}=`)
}

/**
 * Args for `app.relaunch({ args })` from the argv of the 'second-instance' event: drops
 * argv[0] (the executable — relaunch uses process.execPath), the Chromium-injected switches
 * and the startup flag (the user clicked the icon and wants to see the window, even if the
 * launcher passed it). Everything else (dev's app path and --user-data-dir…) is kept in order.
 */
export function secondInstanceRelaunchArgs(argv: readonly string[]): string[] {
  return argv
    .slice(1)
    .filter((arg) => typeof arg === 'string' && arg !== STARTUP_FLAG)
    .filter((arg) => !CHROMIUM_INJECTED_SWITCHES.some((name) => isSwitch(arg, name)))
}
