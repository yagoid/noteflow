"use strict";
// NoteFlow account (Supabase Auth + entitlements) — main-process session layer.
//
// Structural mirror of githubSync.ts: settings persisted under a section of
// settings.json with the secret encrypted via safeStorage (base64 fallback),
// module-level state, a public status object for the renderer, and an
// onStatusChanged callback that main.ts wires to a broadcast.
//
// Auth is Supabase GoTrue over plain REST (no @supabase/supabase-js dep):
//   POST /auth/v1/otp                          → email a 6-digit code
//   POST /auth/v1/verify                       → code → session (access+refresh)
//   POST /auth/v1/token?grant_type=refresh_token → rotate session
//   POST /auth/v1/logout?scope=local           → revoke THIS session only
//                                                (best-effort; the default scope
//                                                would sign out every device and
//                                                the CLI too)
// Entitlements come from PostgREST: GET /rest/v1/subscriptions (RLS-scoped).
//
// Security model: the refresh token is encrypted at rest and NEVER crosses to
// the renderer; the access token lives only in main-process memory. The
// renderer sees exclusively the public status {configured, signedIn, email,
// entitlements, entitlementsKnown, entitlementsFetchedAt, sessionLocked, …}.
//
// Resilience (see entitlementsRetry.ts for the pure parts):
//   - Entitlements are UNKNOWN until fetched (entitlementsKnown=false) — never
//     "not entitled". The last good answer is cached in settings.json →
//     account.entitlementsCache (not secret) so a restart is known from t=0.
//   - Transient fetch failures are retried with backoff, immediately on
//     powerMonitor 'resume', and on an offline→online flip of net.isOnline().
//   - A refresh token that can't be DECRYPTED (keychain locked: Linux before the
//     keyring unlocks, a denied macOS Keychain prompt) is NOT a sign-out: the
//     blob stays on disk and the session is flagged `sessionLocked` until a
//     later decrypt succeeds.
//   - `sessionGeneration` is bumped on every sign-out/sign-in so a network
//     call that started under a previous session can never write its result
//     (rotated token, entitlements) into the current one.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadAccountSettings = loadAccountSettings;
exports.onStatusChanged = onStatusChanged;
exports.getAccountStatus = getAccountStatus;
exports.areEntitlementsFromCache = areEntitlementsFromCache;
exports.getUserId = getUserId;
exports.requestOtp = requestOtp;
exports.verifyOtp = verifyOtp;
exports.getAccessTokenResult = getAccessTokenResult;
exports.getAccessToken = getAccessToken;
exports.signOut = signOut;
exports.refreshEntitlements = refreshEntitlements;
exports.initAccount = initAccount;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const secret_1 = require("./ai/llm/secret");
const cloudConfig_1 = require("./cloudConfig");
const entitlements_1 = require("./entitlements");
const entitlementsRetry_1 = require("./entitlementsRetry");
const settingsFile_1 = require("./settingsFile");
// ── Settings helpers (same idiom as githubSync) ───────────────────────────────
function getSettingsPath() {
    return path_1.default.join(electron_1.app.getPath('userData'), 'settings.json');
}
function readSettings() {
    try {
        return JSON.parse(fs_1.default.readFileSync(getSettingsPath(), 'utf-8'));
    }
    catch {
        return {};
    }
}
function writeSettings(data) {
    (0, settingsFile_1.writeSettingsFile)(getSettingsPath(), data); // owner-only (0600) on POSIX
}
// ── Module state ──────────────────────────────────────────────────────────────
let accountSettings = null;
// Access token lives ONLY in memory (GoTrue access tokens expire in ~1h; the
// persisted refresh token mints new ones on demand).
let accessToken = null;
let accessTokenExpiresAtMs = 0;
let entitlements = entitlements_1.NO_ENTITLEMENTS;
let entitlementsFetchedAt;
// UNKNOWN until fetched or restored from the cache — see AccountStatus.
let entitlementsKnown = false;
// True while the known entitlements come from the on-disk cache rather than a
// fetch made in this run (main.ts keeps the AI auto-switch baseline off it).
let entitlementsFromCache = false;
// Refresh token on disk but undecryptable right now (keychain locked) — I1.
let sessionLocked = false;
// Bumped by every sign-out (clearSession) and sign-in (verifyOtp). Anything that
// awaits the network captures it first and drops its result if it changed.
let sessionGeneration = 0;
// A rotated refresh token (or the entitlements cache) that couldn't be written
// to settings.json yet. The in-memory accountSettings is then the ONLY copy of
// the live refresh token — never replaced by a re-read of the stale disk copy.
let pendingPersist = false;
let persistRetryTimer = null;
const PERSIST_ATTEMPTS = 3;
const PERSIST_RETRY_MS = 30000;
let statusListener = null;
// Single-flight guard: GoTrue ROTATES the refresh token on every use, so two
// concurrent refreshes would race — the loser would persist an already-consumed
// token and sign the user out.
let refreshInFlight = null;
// Single-flight for the entitlements fetch (boot timer, retry timer, resume,
// online flip and the Refresh button can all fire close together). Keyed by the
// session generation: a new sign-in must never join a fetch of the old session.
let entitlementsInFlight = null;
let entitlementsInFlightGeneration = -1;
// Backoff state for transient entitlements failures.
let retryAttempt = 0;
let retryTimer = null;
// Electron's main process has no 'online' event: while a retry is pending we
// poll net.isOnline() and retry at once on an offline→online flip.
let onlinePollTimer = null;
let lastOnline = true;
const ONLINE_POLL_MS = 10000;
let powerHooksInstalled = false;
const NOT_CONFIGURED_ERROR = 'NoteFlow account services are not available in this build.';
const NETWORK_ERROR = 'Could not reach the NoteFlow account service. Check your connection and try again.';
const SESSION_LOCKED_ERROR = "Couldn't unlock your saved session. Your system keychain may be locked.";
/** JSON request against the Supabase project. Throws only on network/timeout errors. */
async function supabaseRequest(endpoint, opts = {}) {
    const res = await fetch(`${cloudConfig_1.SUPABASE_URL}${endpoint}`, {
        method: opts.method ?? 'GET',
        headers: {
            apikey: cloudConfig_1.SUPABASE_ANON_KEY,
            ...(opts.accessToken ? { Authorization: `Bearer ${opts.accessToken}` } : {}),
            ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(15000),
    });
    let json = null;
    try {
        json = await res.json();
    }
    catch {
        // 204 / empty body — fine
    }
    return { status: res.status, json };
}
/** Extracts a human-readable message from a GoTrue/PostgREST error payload. */
function extractErrorMessage(json, fallback) {
    if (json && typeof json === 'object') {
        const o = json;
        for (const key of ['msg', 'message', 'error_description', 'error']) {
            if (typeof o[key] === 'string' && o[key])
                return o[key];
        }
    }
    return fallback;
}
/** GoTrue's machine-readable reason (`error_code`), when the payload carries one. */
function extractErrorCode(json) {
    if (json && typeof json === 'object') {
        const raw = json.error_code;
        if (typeof raw === 'string')
            return raw;
    }
    return '';
}
// ── Session persistence ───────────────────────────────────────────────────────
function loadAccountSettings() {
    // The disk copy is stale while a write is pending (it may hold an already
    // consumed refresh token) — the in-memory one wins.
    if (pendingPersist && accountSettings)
        return accountSettings;
    const settings = readSettings();
    accountSettings = settings.account ?? {};
    applyEntitlementsCache();
    return accountSettings;
}
/** Seeds the in-memory entitlements from the on-disk cache, if it belongs to the stored session. */
function applyEntitlementsCache() {
    if (entitlementsKnown)
        return; // a fetch from this run is fresher than anything on disk
    const cached = (0, entitlementsRetry_1.parseEntitlementsCache)(accountSettings?.entitlementsCache, accountSettings?.userId);
    if (!cached)
        return;
    entitlements = cached.entitlements;
    entitlementsFetchedAt = cached.fetchedAt;
    entitlementsKnown = true;
    entitlementsFromCache = true;
}
/** Writes the in-memory section to disk, retrying a few times. Never throws. */
function writeAccountToDisk() {
    let lastError;
    for (let i = 0; i < PERSIST_ATTEMPTS; i++) {
        try {
            const settings = readSettings();
            settings.account = accountSettings ?? {};
            writeSettings(settings);
            return true;
        }
        catch (err) {
            lastError = err;
        }
    }
    console.error('[Account] could not write the session to settings.json (will retry):', String(lastError));
    return false;
}
function stopPersistRetry() {
    if (persistRetryTimer)
        clearInterval(persistRetryTimer);
    persistRetryTimer = null;
}
function writeOrMarkPending() {
    if (writeAccountToDisk()) {
        pendingPersist = false;
        stopPersistRetry();
        return;
    }
    pendingPersist = true;
    if (!persistRetryTimer)
        persistRetryTimer = setInterval(flushPendingPersist, PERSIST_RETRY_MS);
}
/** Retries a write that failed earlier (called on every account operation and on a timer). */
function flushPendingPersist() {
    if (pendingPersist)
        writeOrMarkPending();
}
/**
 * Replaces the WHOLE `account` section. Memory is updated first and is the
 * source of truth: a failed disk write is retried later, never reported as a
 * network error (after a rotation the old refresh token is already consumed —
 * dropping the new one would sign the user out). Callers build `next` from the
 * CURRENT accountSettings so the token and the entitlements cache never drop
 * each other.
 */
function persistAccountSettings(next) {
    accountSettings = next;
    writeOrMarkPending();
}
function cancelEntitlementsRetry() {
    if (retryTimer)
        clearTimeout(retryTimer);
    retryTimer = null;
    retryAttempt = 0;
    if (onlinePollTimer)
        clearInterval(onlinePollTimer);
    onlinePollTimer = null;
}
function clearSession() {
    sessionGeneration++;
    cancelEntitlementsRetry();
    stopPersistRetry();
    pendingPersist = false;
    accountSettings = {};
    accessToken = null;
    accessTokenExpiresAtMs = 0;
    entitlements = entitlements_1.NO_ENTITLEMENTS;
    entitlementsFetchedAt = undefined;
    entitlementsKnown = false;
    entitlementsFromCache = false;
    sessionLocked = false;
    try {
        const settings = readSettings();
        delete settings.account;
        writeSettings(settings);
    }
    catch (err) {
        // The in-memory session is gone either way; a stale disk copy holds a
        // revoked/abandoned token that the next boot drops on its first refresh.
        console.error('[Account] could not remove the session from settings.json:', String(err));
    }
}
function notifyStatusChanged() {
    statusListener?.();
}
/**
 * Flips the keychain-locked flag. The broadcast is DEFERRED: this runs inside
 * refreshAccessToken before refreshInFlight is assigned, and a synchronous
 * listener (main.ts → autoUnlockManaged → getAccessToken) would otherwise start
 * a second, concurrent refresh — exactly the rotation race single-flight avoids.
 */
function setSessionLocked(locked) {
    if (sessionLocked === locked)
        return;
    sessionLocked = locked;
    setImmediate(notifyStatusChanged);
}
// ── Public API ────────────────────────────────────────────────────────────────
function onStatusChanged(cb) {
    statusListener = cb;
}
function getAccountStatus() {
    const s = accountSettings ?? loadAccountSettings();
    const configured = (0, cloudConfig_1.isCloudConfigured)();
    const signedIn = configured && !!(s.encryptedRefreshToken && s.userId);
    return {
        configured,
        signedIn,
        email: signedIn ? s.email : undefined,
        entitlements: signedIn ? entitlements : entitlements_1.NO_ENTITLEMENTS,
        entitlementsKnown: signedIn && entitlementsKnown,
        entitlementsFetchedAt: signedIn ? entitlementsFetchedAt : undefined,
        sessionLocked: signedIn && sessionLocked,
        aiCheckoutConfigured: cloudConfig_1.LEMONSQUEEZY_CHECKOUT_URLS.ai.length > 0,
        cloudCheckoutConfigured: cloudConfig_1.LEMONSQUEEZY_CHECKOUT_URLS.cloud.length > 0,
        bundleCheckoutConfigured: cloudConfig_1.LEMONSQUEEZY_CHECKOUT_URLS.bundle.length > 0,
    };
}
/**
 * Main-process only: true while the known entitlements are the ones restored
 * from the on-disk cache (no fetch has succeeded yet in this run). main.ts uses
 * it so the cached value never becomes the AI auto-switch baseline.
 */
function areEntitlementsFromCache() {
    return entitlementsFromCache;
}
/** Supabase user id of the signed-in session (main-process only — used to tag
 *  the Lemon Squeezy checkout; it never crosses to the renderer). */
function getUserId() {
    const s = accountSettings ?? loadAccountSettings();
    return s.userId ?? null;
}
/** Emails a 6-digit one-time code (creates the account on first sign-in). */
async function requestOtp(email) {
    if (!(0, cloudConfig_1.isCloudConfigured)())
        return { ok: false, error: NOT_CONFIGURED_ERROR, errorCode: 'notConfigured' };
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
        return { ok: false, error: 'Please enter a valid email address.', errorCode: 'invalidEmail' };
    }
    try {
        const res = await supabaseRequest('/auth/v1/otp', {
            method: 'POST',
            body: { email: trimmed, create_user: true },
        });
        if (res.status >= 400) {
            if (res.status === 429) {
                return { ok: false, error: 'Too many attempts. Please wait a moment and try again.', errorCode: 'rateLimited' };
            }
            return {
                ok: false,
                error: extractErrorMessage(res.json, 'Could not send the sign-in code.'),
                errorCode: 'sendFailed',
            };
        }
        return { ok: true };
    }
    catch (err) {
        console.error('[Account] requestOtp failed:', String(err));
        return { ok: false, error: NETWORK_ERROR, errorCode: 'network' };
    }
}
/** Exchanges the emailed code for a session, persists it and fetches entitlements. */
async function verifyOtp(email, code) {
    if (!(0, cloudConfig_1.isCloudConfigured)())
        return { ok: false, error: NOT_CONFIGURED_ERROR, errorCode: 'notConfigured' };
    const trimmedCode = code.trim();
    if (!trimmedCode)
        return { ok: false, error: 'Please enter the code from your email.', errorCode: 'emptyCode' };
    try {
        const res = await supabaseRequest('/auth/v1/verify', {
            method: 'POST',
            body: { type: 'email', email: email.trim(), token: trimmedCode },
        });
        if (res.status >= 400) {
            if (res.status === 429) {
                return { ok: false, error: 'Too many attempts. Please wait a moment and try again.', errorCode: 'rateLimited' };
            }
            // GoTrue reports both a wrong code and an expired one as
            // "Token has expired or is invalid" (error_code: otp_expired) — one code.
            const raw = extractErrorMessage(res.json, '');
            const rawCode = extractErrorCode(res.json);
            if (rawCode === 'otp_expired' || /expired|invalid/i.test(raw)) {
                return {
                    ok: false,
                    error: 'That code is invalid or has expired. Request a new one and try again.',
                    errorCode: 'invalidCode',
                };
            }
            return { ok: false, error: raw || 'Could not verify the code.', errorCode: 'verifyFailed' };
        }
        const session = res.json;
        if (!session?.access_token || !session.refresh_token || !session.user?.id) {
            return { ok: false, error: 'Unexpected response from the account service.', errorCode: 'unexpectedResponse' };
        }
        // A new identity: anything still in flight (or scheduled) for a previous
        // session must not land on this one, and its entitlements start UNKNOWN.
        sessionGeneration++;
        cancelEntitlementsRetry();
        entitlements = entitlements_1.NO_ENTITLEMENTS;
        entitlementsFetchedAt = undefined;
        entitlementsKnown = false;
        entitlementsFromCache = false;
        sessionLocked = false;
        persistAccountSettings({
            email: session.user.email ?? email.trim(),
            userId: session.user.id,
            encryptedRefreshToken: (0, secret_1.encryptSecret)(session.refresh_token),
        });
        accessToken = session.access_token;
        accessTokenExpiresAtMs = Date.now() + (session.expires_in ?? 3600) * 1000;
        // First entitlements fetch — best-effort; a failure must not undo the
        // sign-in (a transient one schedules the backoff by itself).
        try {
            await refreshEntitlements();
        }
        catch { /* refreshEntitlements never throws, but be safe */ }
        notifyStatusChanged();
        return { ok: true };
    }
    catch (err) {
        console.error('[Account] verifyOtp failed:', String(err));
        return { ok: false, error: NETWORK_ERROR, errorCode: 'network' };
    }
}
/**
 * Returns a valid access token, refreshing via the persisted refresh token when
 * the in-memory one is missing or expires within 60s — or WHY it can't: no
 * session (none stored, or the refresh token was revoked → session cleared +
 * notified), network, a server error, or a keychain-locked session.
 */
async function getAccessTokenResult() {
    if (!(0, cloudConfig_1.isCloudConfigured)())
        return { ok: false, reason: 'noSession' };
    flushPendingPersist();
    if (accessToken && accessTokenExpiresAtMs - Date.now() > 60000)
        return { ok: true, token: accessToken };
    if (refreshInFlight)
        return refreshInFlight;
    refreshInFlight = refreshAccessToken().finally(() => { refreshInFlight = null; });
    return refreshInFlight;
}
/** Thin wrapper for callers that only care about the token (cloudSync, cloudKeys, llm, realtime). */
async function getAccessToken() {
    const result = await getAccessTokenResult();
    return result.ok ? result.token : null;
}
async function refreshAccessToken() {
    const generation = sessionGeneration;
    const s = accountSettings ?? loadAccountSettings();
    if (!s.encryptedRefreshToken || !s.userId)
        return { ok: false, reason: 'noSession' };
    let refreshToken;
    try {
        refreshToken = (0, secret_1.decryptSecret)(s.encryptedRefreshToken);
    }
    catch (err) {
        // safeStorage can fail TEMPORARILY (Linux before the keyring is unlocked, a
        // denied macOS Keychain prompt). Not a sign-out: keep the blob on disk and
        // the session signed in, flag it locked and let the retries try again.
        // Nothing is rotated or persisted while locked.
        console.error('[Account] could not decrypt the refresh token (keychain locked?):', String(err));
        setSessionLocked(true);
        return { ok: false, reason: 'locked' };
    }
    setSessionLocked(false);
    let res;
    try {
        res = await supabaseRequest('/auth/v1/token?grant_type=refresh_token', {
            method: 'POST',
            body: { refresh_token: refreshToken },
        });
    }
    catch (err) {
        if (generation !== sessionGeneration)
            return { ok: false, reason: 'noSession' };
        // Network/timeout — keep the session; a later call will retry.
        console.error('[Account] token refresh network error:', String(err));
        return { ok: false, reason: 'network' };
    }
    // Signed out (or in as someone else) while the request was in flight: the
    // answer belongs to a session that no longer exists — persisting its rotated
    // token would resurrect it. Drop everything.
    if (generation !== sessionGeneration)
        return { ok: false, reason: 'noSession' };
    if (res.status === 400 || res.status === 401) {
        // Refresh token revoked/expired — the user is effectively signed out.
        console.warn('[Account] refresh token rejected — signing out');
        clearSession();
        notifyStatusChanged();
        return { ok: false, reason: 'noSession' };
    }
    if (res.status >= 400) {
        console.error('[Account] token refresh failed:', extractErrorMessage(res.json, `HTTP ${res.status}`));
        return { ok: false, reason: 'server' }; // transient — keep the session, caller can retry later
    }
    const session = res.json;
    if (!session?.access_token)
        return { ok: false, reason: 'server' };
    accessToken = session.access_token;
    accessTokenExpiresAtMs = Date.now() + (session.expires_in ?? 3600) * 1000;
    // GoTrue ROTATES the refresh token on every grant — persist the new one or
    // the next refresh would present a consumed token and get signed out. Built
    // from the CURRENT settings (not `s`) so a concurrently written entitlements
    // cache survives; a failed disk write keeps it in memory and retries.
    if (session.refresh_token) {
        let encrypted = null;
        try {
            encrypted = (0, secret_1.encryptSecret)(session.refresh_token);
        }
        catch (err) {
            console.error('[Account] could not encrypt the rotated refresh token:', String(err));
        }
        if (encrypted)
            persistAccountSettings({ ...(accountSettings ?? s), encryptedRefreshToken: encrypted });
    }
    return { ok: true, token: accessToken };
}
/** Revokes THIS session server-side (best-effort) and clears local state. */
async function signOut() {
    const token = accessToken; // don't mint a fresh token just to revoke it
    if (token) {
        try {
            // scope=local: revoke only this device's session. The default (global)
            // would also sign out every other device and the CLI.
            await supabaseRequest('/auth/v1/logout?scope=local', { method: 'POST', accessToken: token });
        }
        catch (err) {
            console.warn('[Account] logout request failed (ignored):', String(err));
        }
    }
    clearSession();
    notifyStatusChanged();
    return { ok: true };
}
// ── Entitlements (fetch + retry) ──────────────────────────────────────────────
const TOKEN_FAILURE_RESULT = {
    noSession: { error: 'Not signed in.', errorCode: 'notSignedIn' },
    network: { error: NETWORK_ERROR, errorCode: 'network' },
    server: { error: 'Could not refresh the account session.', errorCode: 'refreshFailed' },
    locked: { error: SESSION_LOCKED_ERROR, errorCode: 'sessionLocked' },
};
/**
 * Re-reads the user's subscription rows and re-derives {ai, cloud}. Never
 * throws. A transient failure schedules a retry with backoff; a success resets
 * it, caches the answer on disk and broadcasts.
 */
function refreshEntitlements() {
    if (entitlementsInFlight && entitlementsInFlightGeneration === sessionGeneration)
        return entitlementsInFlight;
    entitlementsInFlightGeneration = sessionGeneration;
    const run = fetchEntitlements().finally(() => {
        if (entitlementsInFlight === run)
            entitlementsInFlight = null;
    });
    entitlementsInFlight = run;
    return run;
}
async function fetchEntitlements() {
    if (!(0, cloudConfig_1.isCloudConfigured)()) {
        return { ok: false, error: NOT_CONFIGURED_ERROR, errorCode: 'notConfigured', entitlements: entitlements_1.NO_ENTITLEMENTS };
    }
    flushPendingPersist();
    const generation = sessionGeneration;
    // The answer of a fetch that started under a previous session is ignored —
    // not applied, not cached, not retried.
    const stale = () => ({
        ok: false, error: 'Not signed in.', errorCode: 'notSignedIn', entitlements: entitlements_1.NO_ENTITLEMENTS,
    });
    const tokenResult = await getAccessTokenResult();
    if (generation !== sessionGeneration)
        return stale();
    if (!tokenResult.ok)
        return entitlementsFailure(TOKEN_FAILURE_RESULT[tokenResult.reason]);
    let res;
    try {
        res = await supabaseRequest('/rest/v1/subscriptions?select=product,status,renews_at', {
            accessToken: tokenResult.token,
        });
    }
    catch (err) {
        if (generation !== sessionGeneration)
            return stale();
        console.error('[Account] refreshEntitlements failed:', String(err));
        return entitlementsFailure({ error: NETWORK_ERROR, errorCode: 'network' });
    }
    if (generation !== sessionGeneration)
        return stale();
    if (res.status >= 400 || !Array.isArray(res.json)) {
        // A 401 means the in-memory access token is no longer accepted: drop it so
        // the retry mints a fresh one instead of replaying it until it expires.
        if (res.status === 401 && accessToken === tokenResult.token) {
            accessToken = null;
            accessTokenExpiresAtMs = 0;
        }
        return entitlementsFailure({
            error: extractErrorMessage(res.json, 'Could not load subscription status.'),
            errorCode: 'refreshFailed',
        });
    }
    entitlements = (0, entitlements_1.computeEntitlements)(res.json);
    entitlementsFetchedAt = new Date().toISOString();
    entitlementsKnown = true;
    entitlementsFromCache = false;
    cancelEntitlementsRetry(); // a success resets the backoff
    const current = accountSettings ?? {};
    if (current.userId) {
        persistAccountSettings({
            ...current,
            entitlementsCache: {
                userId: current.userId,
                ai: entitlements.ai,
                cloud: entitlements.cloud,
                fetchedAt: entitlementsFetchedAt,
            },
        });
    }
    notifyStatusChanged();
    return { ok: true, entitlements };
}
function entitlementsFailure(failure) {
    if ((0, entitlementsRetry_1.isRetryableEntitlementsFailure)(failure.errorCode))
        scheduleEntitlementsRetry();
    else
        cancelEntitlementsRetry(); // nothing will change by waiting (no session / no project)
    return { ok: false, ...failure, entitlements };
}
function scheduleEntitlementsRetry() {
    if (!getAccountStatus().signedIn)
        return;
    if (retryTimer)
        clearTimeout(retryTimer);
    const delay = (0, entitlementsRetry_1.entitlementsRetryDelayMs)(retryAttempt);
    retryAttempt++;
    retryTimer = setTimeout(() => {
        retryTimer = null;
        void refreshEntitlements();
    }, delay);
    startOnlinePoll();
}
/** Skips the pending backoff wait and retries now, from the shortest delay again. */
function retryEntitlementsNow() {
    if (retryTimer)
        clearTimeout(retryTimer);
    retryTimer = null;
    retryAttempt = 0;
    void refreshEntitlements();
}
function startOnlinePoll() {
    if (onlinePollTimer)
        return;
    lastOnline = electron_1.net.isOnline();
    onlinePollTimer = setInterval(() => {
        const online = electron_1.net.isOnline();
        const cameBack = online && !lastOnline;
        lastOnline = online;
        if (cameBack && retryTimer)
            retryEntitlementsNow();
    }, ONLINE_POLL_MS);
}
/** Resume from sleep: a pending retry (or still-unknown entitlements) is retried at once. */
function installPowerHooks() {
    if (powerHooksInstalled)
        return;
    powerHooksInstalled = true;
    electron_1.powerMonitor.on('resume', () => {
        if (!getAccountStatus().signedIn)
            return;
        if (retryTimer || !entitlementsKnown || sessionLocked)
            retryEntitlementsNow();
    });
}
/**
 * App-startup hook (call after app ready — powerMonitor needs it): loads the
 * persisted session (+ its cached entitlements) and, if there is one, refreshes
 * entitlements in the background. Deferred so it never competes with the boot
 * path (same spirit as the AI worker warmup); a failure enters the backoff.
 */
function initAccount() {
    loadAccountSettings();
    if (!(0, cloudConfig_1.isCloudConfigured)())
        return;
    installPowerHooks();
    if (!getAccountStatus().signedIn)
        return;
    setTimeout(() => {
        refreshEntitlements().catch((err) => {
            console.error('[Account] startup entitlements refresh failed:', String(err));
        });
    }, 5000);
}
