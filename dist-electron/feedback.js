"use strict";
// In-app feedback (Settings → About → "Send feedback") — main-process IO.
//
// Inserts one row into public.feedback (supabase/migrations/0015_feedback.sql)
// via PostgREST. The table has an INSERT-only RLS policy for anon AND
// authenticated, so feedback NEVER requires a NoteFlow account:
//   - signed in  → sent with the user's access token (the row's user_id
//     defaults to auth.uid() server-side; the client never sends it);
//   - signed out, keychain locked, token refresh failing, or the request with
//     the token refused with 401/403 → sent anonymously (apikey only, like
//     account.ts' calls without a session). Only a 401 drops the token
//     (account.invalidateAccessToken's contract).
// `Prefer: return=minimal` because there is no SELECT policy (RETURNING would
// fail). Validation and the row shape live in feedbackLogic.ts (pure, tested).
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendFeedback = sendFeedback;
const electron_1 = require("electron");
const account = __importStar(require("./account"));
const cloudConfig_1 = require("./cloudConfig");
const feedbackLogic_1 = require("./feedbackLogic");
const FEEDBACK_TIMEOUT_MS = 15000;
/**
 * What "Include app and system version" sends: app version, OS + CPU arch, OS
 * version and the app's UI language. Deliberately NOT the OS locale (it
 * carries the region) — the privacy policy and the in-app text promise only
 * these fields. Nothing else — never note content, paths or identifiers.
 */
function collectDiagnostics(uiLanguage) {
    let osVersion = '';
    try {
        osVersion = process.getSystemVersion();
    }
    catch {
        // Not fatal: the row just goes without it.
    }
    return {
        appVersion: electron_1.app.getVersion(),
        platform: `${process.platform} ${process.arch}`,
        osVersion,
        locale: uiLanguage,
    };
}
/** The user's access token if there is a usable session; null otherwise (never throws). */
async function sessionAccessToken() {
    try {
        const result = await account.getAccessTokenResult();
        return result.ok ? result.token : null;
    }
    catch {
        return null;
    }
}
/** One POST; returns the HTTP status. Throws only on network/timeout errors. */
async function postFeedback(row, accessToken) {
    const res = await fetch(`${cloudConfig_1.SUPABASE_URL}/rest/v1/feedback`, {
        method: 'POST',
        headers: {
            apikey: cloudConfig_1.SUPABASE_ANON_KEY,
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
        },
        body: JSON.stringify(row),
        signal: AbortSignal.timeout(FEEDBACK_TIMEOUT_MS),
    });
    return res.status;
}
/**
 * Validates the renderer's payload and stores it. `uiLanguage` is the resolved
 * UI language ('en'/'es'), only used when the user opted into diagnostics.
 * Never throws.
 */
async function sendFeedback(input, uiLanguage) {
    const feedback = (0, feedbackLogic_1.normalizeFeedback)(input);
    if (!feedback)
        return { ok: false, reason: 'invalid' };
    if (!(0, cloudConfig_1.isCloudConfigured)())
        return { ok: false, reason: 'server' };
    const row = (0, feedbackLogic_1.buildFeedbackRow)(feedback, feedback.includeDiagnostics ? collectDiagnostics(uiLanguage) : null);
    try {
        const token = await sessionAccessToken();
        let status = await postFeedback(row, token);
        let outcome = (0, feedbackLogic_1.classifyFeedbackResponse)(status, token !== null);
        if (outcome === 'retry-anonymous-invalidate' || outcome === 'retry-anonymous') {
            // 401 = dead token: drop it so the next account call mints a fresh one.
            // Either way, deliver the report anonymously instead of failing.
            if (outcome === 'retry-anonymous-invalidate' && token)
                account.invalidateAccessToken(token);
            status = await postFeedback(row, null);
            outcome = (0, feedbackLogic_1.classifyFeedbackResponse)(status, false);
        }
        if (outcome === 'ok')
            return { ok: true };
        console.error('[Feedback] insert rejected with HTTP', status);
        return { ok: false, reason: 'server' };
    }
    catch (err) {
        console.error('[Feedback] could not reach the feedback service:', String(err));
        return { ok: false, reason: 'network' };
    }
}
