"use strict";
// In-app feedback (Settings → About → "Send feedback") — pure logic, no
// Electron/network imports so it is unit-tested (tests/electron/feedbackLogic.test.ts).
//
// The renderer hands main an untrusted payload over IPC; normalizeFeedback
// validates it with the SAME limits the public.feedback table enforces
// (supabase/migrations/0015_feedback.sql), so a row that passes here is never
// rejected by a CHECK constraint. buildFeedbackRow turns it into the PostgREST
// body (snake_case columns of the table). feedback.ts does the IO.
Object.defineProperty(exports, "__esModule", { value: true });
exports.FEEDBACK_DIAG_MAX = exports.FEEDBACK_CONTACT_MAX = exports.FEEDBACK_MESSAGE_MAX = exports.FEEDBACK_KINDS = void 0;
exports.isPlausibleEmail = isPlausibleEmail;
exports.normalizeFeedback = normalizeFeedback;
exports.buildFeedbackRow = buildFeedbackRow;
exports.classifyFeedbackResponse = classifyFeedbackResponse;
exports.FEEDBACK_KINDS = ['bug', 'suggestion', 'other'];
/** Max message length (after trimming). Mirrors the CHECK in 0015 and the UI textarea maxLength. */
exports.FEEDBACK_MESSAGE_MAX = 5000;
/** Max contact (email) length — the longest valid email address. Mirrors 0015. */
exports.FEEDBACK_CONTACT_MAX = 254;
/** Max length of each diagnostic column. Mirrors the CHECKs in 0015. */
exports.FEEDBACK_DIAG_MAX = {
    appVersion: 64,
    platform: 64,
    osVersion: 128,
    locale: 64,
};
// Postgres `text` cannot store NUL (PostgREST answers 400), so strip it up front.
function stripNul(value) {
    return value.split('\u0000').join('');
}
/**
 * Lax email check: something@something.tld, no whitespace. Deliberately
 * permissive — the address is only a courtesy for the operator to reply, and a
 * stricter regex would reject valid addresses. The About panel mirrors it to
 * flag the field before sending.
 */
function isPlausibleEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
/**
 * Validates and normalizes the renderer's payload: kind must be a known one,
 * message is trimmed and must be 1..FEEDBACK_MESSAGE_MAX characters, contact is
 * optional (empty → null) but, when present, must look like an email and fit
 * FEEDBACK_CONTACT_MAX. Only `includeDiagnostics === true` opts in.
 */
function normalizeFeedback(input) {
    if (!input || typeof input !== 'object')
        return null;
    const raw = input;
    const kind = raw.kind;
    if (typeof kind !== 'string' || !exports.FEEDBACK_KINDS.includes(kind))
        return null;
    if (typeof raw.message !== 'string')
        return null;
    const message = stripNul(raw.message).trim();
    if (message.length === 0 || message.length > exports.FEEDBACK_MESSAGE_MAX)
        return null;
    let contact = null;
    if (raw.contact !== undefined && raw.contact !== null) {
        if (typeof raw.contact !== 'string')
            return null;
        const trimmed = stripNul(raw.contact).trim();
        if (trimmed.length > 0) {
            if (trimmed.length > exports.FEEDBACK_CONTACT_MAX || !isPlausibleEmail(trimmed))
                return null;
            contact = trimmed;
        }
    }
    return {
        kind: kind,
        message,
        contact,
        includeDiagnostics: raw.includeDiagnostics === true,
    };
}
// Diagnostic values come from main, but clip them anyway so an odd OS string
// can never trip the table's length CHECKs (that would lose the whole report).
function clipDiag(value, max) {
    const clean = stripNul(value).trim();
    return clean.length > 0 ? clean.slice(0, max) : null;
}
/** PostgREST body: diagnostics only when the user opted in AND main provided them. */
function buildFeedbackRow(feedback, diagnostics) {
    const diag = feedback.includeDiagnostics ? diagnostics : null;
    return {
        kind: feedback.kind,
        message: feedback.message,
        contact: feedback.contact,
        app_version: diag ? clipDiag(diag.appVersion, exports.FEEDBACK_DIAG_MAX.appVersion) : null,
        platform: diag ? clipDiag(diag.platform, exports.FEEDBACK_DIAG_MAX.platform) : null,
        os_version: diag ? clipDiag(diag.osVersion, exports.FEEDBACK_DIAG_MAX.osVersion) : null,
        locale: diag ? clipDiag(diag.locale, exports.FEEDBACK_DIAG_MAX.locale) : null,
    };
}
/**
 * What to do with PostgREST's answer to the insert:
 *   - 2xx → 'ok' (201 with `Prefer: return=minimal`).
 *   - 401 while sending WITH the user's access token → 'retry-anonymous-invalidate':
 *     the token itself was rejected (expired/revoked between minting and use).
 *     Drop it (account.invalidateAccessToken — that contract is 401-only) and
 *     resend without it: feedback must not depend on the account.
 *   - 403 while sending WITH the token → 'retry-anonymous': authorization was
 *     refused for this role, which says nothing about the token's validity, so
 *     keep it and just resend anonymously.
 *   - anything else → 'server'.
 */
function classifyFeedbackResponse(status, sentWithToken) {
    if (status >= 200 && status < 300)
        return 'ok';
    if (sentWithToken && status === 401)
        return 'retry-anonymous-invalidate';
    if (sentWithToken && status === 403)
        return 'retry-anonymous';
    return 'server';
}
