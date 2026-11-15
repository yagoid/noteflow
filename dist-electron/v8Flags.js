"use strict";
// V8 flags for the renderer processes (value of Chromium's `js-flags` switch).
//
// Pure logic, no Electron imports (same pattern as relaunchArgs.ts) so it can be unit-tested.
// main.ts appends the switch before 'ready'; see the call site for why it sits after the
// single-instance lock.
//
// Why: with V8's defaults the heap growing factor reaches x4 on small heaps like ours
// (~36 MB live). V8 schedules the JS heap and Blink's (Oilpan) together, so moving between
// sections/notes — lots of short-lived Blink garbage from layout/style — ran very few major
// GCs and Blink's heap ballooned to ~190 MB reserved with ~8 MB live. Those freed pages stay
// in an Oilpan pool that never returns to the OS, so the app went from ~170 MB at startup to
// ~405 MB at rest. A fixed 1.3 factor (the "conservative" mode Chrome uses on low-memory
// devices) leaves the same navigation at ~255 MB at rest, with main-thread GC pauses of
// 3–9 ms at most. Details in .agents/context/patterns.md § "Memoria del renderer".
Object.defineProperty(exports, "__esModule", { value: true });
exports.HEAP_GROWING_PERCENT = void 0;
exports.rendererJsFlags = rendererJsFlags;
/** Heap growth allowed between major GCs, in percent: 30 → a fixed growing factor of 1.3. */
exports.HEAP_GROWING_PERCENT = 30;
/**
 * Separators between flags in a `js-flags` value: whitespace and commas. Chromium splits
 * the value on commas before handing it to V8, which splits on whitespace, so both forms
 * (and a mix of them) reach V8 as separate flags.
 */
const FLAG_SEPARATORS = /[\s,]+/;
/**
 * One token that names the heap growing percent, in the spellings supported here:
 * one or two leading dashes, `-` or `_` between the words (V8 reads `_` as `-` in flag
 * names), and either `=value` or bare (the value is then the next token).
 */
const HEAP_GROWING_FLAG = /^--?heap[-_]growing[-_]percent(?:=.*)?$/;
/**
 * Value for the `js-flags` switch: the flags already there (`existing`, the current value
 * of the switch — may be empty, space- and/or comma-separated, with stray separators) plus
 * our heap growing percent. A heap growing percent that is already present, anywhere in
 * the list, wins: it is kept as is and ours is not added (V8 takes the last value, so ours
 * would override it), which also makes the function idempotent. The result is always
 * normalised to single spaces between flags, commas included.
 */
function rendererJsFlags(existing) {
    const flags = existing.split(FLAG_SEPARATORS).filter(Boolean);
    if (!flags.some((flag) => HEAP_GROWING_FLAG.test(flag))) {
        flags.push(`--heap-growing-percent=${exports.HEAP_GROWING_PERCENT}`);
    }
    return flags.join(' ');
}
