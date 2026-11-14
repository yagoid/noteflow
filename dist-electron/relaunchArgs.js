"use strict";
// Relaunch after quit, for a launch that arrived while NoteFlow was quitting.
//
// Pure logic, no Electron imports (same pattern as updateAsset.ts) so it can be unit-tested.
// main.ts keeps the single-instance lock until Electron releases it on 'quit' (after every
// window has closed): a launch in between (the pinned taskbar icon clicked right after
// "Quit") loses the lock, notifies the dying process through 'second-instance' and exits.
// main.ts then schedules ONE relaunch after exit with the args built here, so the click is
// honoured without two processes ever sharing the notes dir and userData.
Object.defineProperty(exports, "__esModule", { value: true });
exports.STARTUP_FLAG = void 0;
exports.secondInstanceRelaunchArgs = secondInstanceRelaunchArgs;
/** Login autostart flag: starts with the main window hidden in the tray. */
exports.STARTUP_FLAG = '--noteflow-startup';
/**
 * Switches Chromium adds to the argv a second instance reports — not the user's nor the
 * app's (Electron documents `--original-process-start-time`; `--allow-file-access-from-files`
 * shows up on Windows). Matched as `--name` or `--name=value`.
 */
const CHROMIUM_INJECTED_SWITCHES = ['--allow-file-access-from-files', '--original-process-start-time'];
function isSwitch(arg, name) {
    return arg === name || arg.startsWith(`${name}=`);
}
/**
 * Args for `app.relaunch({ args })` from the argv of the 'second-instance' event: drops
 * argv[0] (the executable — relaunch uses process.execPath), the Chromium-injected switches
 * and the startup flag (the user clicked the icon and wants to see the window, even if the
 * launcher passed it). Everything else (dev's app path and --user-data-dir…) is kept in order.
 */
function secondInstanceRelaunchArgs(argv) {
    return argv
        .slice(1)
        .filter((arg) => typeof arg === 'string' && arg !== exports.STARTUP_FLAG)
        .filter((arg) => !CHROMIUM_INJECTED_SWITCHES.some((name) => isSwitch(arg, name)));
}
