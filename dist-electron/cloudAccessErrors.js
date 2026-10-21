"use strict";
// Why a NoteFlow Cloud request could not even be sent — pure, imports nothing
// from Electron. Covered by tests/electron/cloudAccessErrors.test.ts.
//
// cloudKeys.supabaseRest / callCloudKeysFn need a fresh access token per call.
// When account.getAccessTokenResult() can't produce one, they throw an Error
// whose message is a stable TAG per failure reason, so callers (cloudKeys'
// catch blocks, the cloudSync pull) can tell "signed out" apart from "offline"
// and "keychain locked" — a session that just can't reach the server must
// never be reported as "sign in first". Callers match with String(err), so the
// tags survive being wrapped in another message.
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLOUD_SESSION_LOCKED_ERROR = exports.CLOUD_UNREACHABLE_ERROR = exports.SESSION_LOCKED_TAG = exports.ACCOUNT_UNREACHABLE_TAG = exports.NOT_SIGNED_IN_TAG = void 0;
exports.accessTokenError = accessTokenError;
exports.isAccessTokenError = isAccessTokenError;
exports.classifyCloudAccessError = classifyCloudAccessError;
exports.cloudAccessErrorMessage = cloudAccessErrorMessage;
exports.NOT_SIGNED_IN_TAG = 'not-signed-in';
exports.ACCOUNT_UNREACHABLE_TAG = 'account-unreachable';
exports.SESSION_LOCKED_TAG = 'session-locked';
/** Error to throw when no access token could be obtained, tagged by reason. */
function accessTokenError(reason) {
    switch (reason) {
        case 'noSession':
            return new Error(exports.NOT_SIGNED_IN_TAG);
        case 'locked':
            return new Error(exports.SESSION_LOCKED_TAG);
        case 'network':
        case 'server':
            return new Error(exports.ACCOUNT_UNREACHABLE_TAG);
    }
}
/** True for the errors thrown by accessTokenError (any reason). */
function isAccessTokenError(err) {
    const text = String(err);
    return (text.includes(exports.NOT_SIGNED_IN_TAG) ||
        text.includes(exports.ACCOUNT_UNREACHABLE_TAG) ||
        text.includes(exports.SESSION_LOCKED_TAG));
}
/**
 * Network-level failure of a fetch() itself (no HTTP answer at all): undici's
 * `TypeError: fetch failed` (offline, DNS, refused connection) or the
 * AbortSignal.timeout of the REST helpers.
 */
function isFetchNetworkError(err) {
    if (!(err instanceof Error))
        return false;
    if (err.name === 'TimeoutError' || err.name === 'AbortError')
        return true;
    return err instanceof TypeError && /fetch failed/i.test(err.message);
}
/**
 * Classifies an error caught around a Cloud request: signed out, unreachable
 * (token refresh failed on network/server, or the request itself never got an
 * answer) or keychain-locked session. Null for anything else (HTTP errors,
 * decrypt failures, …) — the caller keeps its own message for those.
 */
function classifyCloudAccessError(err) {
    const text = String(err);
    if (text.includes(exports.NOT_SIGNED_IN_TAG))
        return 'notSignedIn';
    if (text.includes(exports.SESSION_LOCKED_TAG))
        return 'locked';
    if (text.includes(exports.ACCOUNT_UNREACHABLE_TAG))
        return 'unreachable';
    if (isFetchNetworkError(err))
        return 'unreachable';
    return null;
}
/** User-facing message for a classified access error, or null (see classifyCloudAccessError). */
function cloudAccessErrorMessage(err, messages) {
    const kind = classifyCloudAccessError(err);
    return kind ? messages[kind] : null;
}
/** Shown by the Cloud sync status when the server can't be reached. */
exports.CLOUD_UNREACHABLE_ERROR = "Can't reach NoteFlow Cloud — check your connection. Your notes are safe and will sync when you're back online.";
/** Same wording as account.ts SESSION_LOCKED_ERROR (keychain-locked refresh token). */
exports.CLOUD_SESSION_LOCKED_ERROR = "Couldn't unlock your saved session. Your system keychain may be locked.";
