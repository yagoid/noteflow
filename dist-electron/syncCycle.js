"use strict";
// Pure helpers behind the NoteFlow Cloud sync cycle of main.ts (no Electron
// imports — tested in tests/electron/syncCycle.test.ts).
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCoalescedRunner = createCoalescedRunner;
exports.waitUntil = waitUntil;
exports.trackInFlight = trackInFlight;
function createCoalescedRunner(pass, mergeFlags) {
    let running = false;
    let queued = null;
    async function loop(first) {
        running = true;
        let current = first;
        try {
            while (current) {
                const { flags, waiters } = current;
                try {
                    const result = await pass(flags);
                    for (const w of waiters)
                        w.resolve(result);
                }
                catch (err) {
                    for (const w of waiters)
                        w.reject(err);
                }
                current = queued;
                queued = null;
            }
        }
        finally {
            running = false;
        }
    }
    return {
        run(flags) {
            return new Promise((resolve, reject) => {
                const waiter = { resolve, reject };
                if (!running) {
                    void loop({ flags, waiters: [waiter] });
                    return;
                }
                if (queued) {
                    queued.flags = mergeFlags(queued.flags, flags);
                    queued.waiters.push(waiter);
                }
                else {
                    queued = { flags, waiters: [waiter] };
                }
            });
        },
        isRunning: () => running,
    };
}
/**
 * Resolves true as soon as `done()` holds (checked right away, then every
 * `intervalMs`), or false once `timeoutMs` elapsed without it. Used by the
 * manual Cloud sync to let uploads already in flight land before it pulls
 * (an automatic cycle just stands down instead).
 */
async function waitUntil(done, timeoutMs, intervalMs = 200, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
    let waited = 0;
    while (!done()) {
        if (waited >= timeoutMs)
            return false;
        await sleep(intervalMs);
        waited += intervalMs;
    }
    return true;
}
/**
 * Runs `work` (a remote mutation) as "in flight": `key` sits in `inFlight`
 * from the call until the work settles — success or failure — and `notify`
 * fires on both transitions. main.ts wraps the remote deletes with it (note
 * folders, dropped section files): they show as "uploading" while they run,
 * and the status is re-read when they land, so a deletion neither flashes nor
 * leaves behind a stale "not uploaded" (its journal entry exists only while it
 * is in flight, or after it failed). Rejects with the work's error.
 */
async function trackInFlight(inFlight, key, work, notify) {
    inFlight.add(key);
    notify();
    try {
        await work();
    }
    finally {
        inFlight.delete(key);
        notify();
    }
}
