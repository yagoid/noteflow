"use strict";
// NoteFlow Cloud Realtime subscription (phase 4.2, stage 3) — main-process only.
//
// Replaces the interim autosync polling with a push signal: a raw WebSocket to
// Supabase Realtime (Phoenix protocol, vsn=1.0.0) subscribed to postgres_changes
// on public.files filtered to the signed-in user (migration 0006 adds the table
// to the supabase_realtime publication). NO new dependencies — Electron 35 ships
// Node 22, whose global WebSocket (undici) is enough; same REST/WS-pure
// philosophy as account.ts / cloudKeys.ts (no @supabase/supabase-js).
//
// The event payload is CIPHERTEXT rows and is deliberately NEVER parsed or
// applied here: all decryption/conflict logic lives in cloudSync.pullNotes().
// This module only tells main.ts "something changed remotely" (onRemoteChange),
// which debounces and runs the normal sync cycle (pull → drain journal) — also
// fired on every successful (re)join as a catch-up for the time the socket was
// down. Key material never enters this module.
//
// Pure protocol logic (frames, classification, backoff) lives in
// cloudRealtimeLogic.ts, tested in tests/electron/cloudRealtime.test.ts.
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
exports.startCloudRealtime = startCloudRealtime;
exports.stopCloudRealtime = stopCloudRealtime;
exports.isCloudRealtimeConnected = isCloudRealtimeConnected;
const account = __importStar(require("./account"));
const cloudConfig_1 = require("./cloudConfig");
const cloudRealtimeLogic_1 = require("./cloudRealtimeLogic");
// ── Constants ─────────────────────────────────────────────────────────────────
// Under Phoenix's default 60 s channel timeout; a missed ack is detected on the
// next tick (~25 s), so a dead connection is noticed in ≤ ~50 s.
const HEARTBEAT_INTERVAL_MS = 25000;
// GoTrue JWTs expire in ~1 h — refresh the channel's token well before that.
// (Reconnects always fetch a fresh token anyway.)
const TOKEN_REFRESH_INTERVAL_MS = 45 * 60 * 1000;
// ── Module state ──────────────────────────────────────────────────────────────
let started = false;
let onRemoteChangeCb = null;
let ws = null;
// Bumped on every start/stop/reconnect — lets async continuations detect they
// belong to a torn-down session and bail out silently.
let generation = 0;
let joined = false;
let refCounter = 0;
let reconnectAttempt = 0;
let reconnectTimer = null;
let heartbeatTimer = null;
let tokenRefreshTimer = null;
let awaitingHeartbeatAck = false;
// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Starts (idempotently) the Realtime subscription. `onRemoteChange` fires once
 * per incoming postgres_changes event and once per successful channel
 * (re)join (catch-up) — the caller debounces and pulls.
 * Reconnection (exponential backoff with jitter, capped at 60 s) is handled
 * internally and silently: offline periods produce no error cascades, just one
 * sober log per state transition.
 */
function startCloudRealtime(onRemoteChange) {
    onRemoteChangeCb = onRemoteChange;
    if (started)
        return;
    started = true;
    reconnectAttempt = 0;
    void connect(++generation);
}
/** Closes the socket and clears every timer. Idempotent. */
function stopCloudRealtime() {
    if (!started)
        return;
    started = false;
    generation++;
    onRemoteChangeCb = null;
    clearReconnectTimer();
    teardownConnection();
}
/** True while the channel join has been acked (exposed via CloudSyncStatus). */
function isCloudRealtimeConnected() {
    return joined;
}
// ── Connection lifecycle ──────────────────────────────────────────────────────
async function connect(gen) {
    if (!started || gen !== generation || !(0, cloudConfig_1.isCloudConfigured)())
        return;
    // Fresh credentials on EVERY (re)connect — Supabase JWTs expire in ~1 h.
    const userId = account.getUserId();
    let token = null;
    try {
        token = await account.getAccessToken();
    }
    catch {
        token = null;
    }
    if (gen !== generation)
        return;
    if (!userId || !token) {
        // No usable session right now (signed out mid-flight, or offline refresh) —
        // retry later; main.ts stops us for real on sign-out.
        scheduleReconnect();
        return;
    }
    let socket;
    try {
        socket = new WebSocket((0, cloudRealtimeLogic_1.buildRealtimeUrl)(cloudConfig_1.SUPABASE_URL, cloudConfig_1.SUPABASE_ANON_KEY));
    }
    catch {
        scheduleReconnect();
        return;
    }
    ws = socket;
    socket.onopen = () => {
        if (gen !== generation || socket !== ws)
            return;
        sendFrame((0, cloudRealtimeLogic_1.buildJoinFrame)(userId, token, ++refCounter));
        startHeartbeat();
        startTokenRefresh();
    };
    socket.onmessage = (ev) => {
        if (gen !== generation || socket !== ws)
            return;
        handleFrame(typeof ev.data === 'string' ? ev.data : String(ev.data));
    };
    socket.onclose = () => {
        if (gen !== generation || socket !== ws)
            return;
        handleConnectionLost('socket closed');
    };
    socket.onerror = () => {
        // onclose always follows an error — nothing to do here (and logging every
        // failed attempt while offline would be exactly the cascade we avoid).
    };
}
function handleFrame(raw) {
    const kind = (0, cloudRealtimeLogic_1.classifyFrame)(raw);
    switch (kind) {
        case 'change':
            onRemoteChangeCb?.();
            break;
        case 'heartbeat-ok':
            awaitingHeartbeatAck = false;
            break;
        case 'join-ok':
            if ((0, cloudRealtimeLogic_1.isFreshJoin)(kind, joined)) {
                joined = true;
                reconnectAttempt = 0; // stable connection — reset the backoff
                console.log('[CloudRealtime] channel joined');
                // Catch-up: whatever changed while the socket was down (or before the
                // first join) emitted no event we will ever see — ask main for a cycle
                // now instead of waiting for the safety-net tick.
                onRemoteChangeCb?.();
            }
            break;
        case 'join-error':
            // Bad/expired token or rejected channel — rejoin with fresh credentials.
            handleConnectionLost('channel rejected');
            break;
        case 'close':
            handleConnectionLost('channel closed by server');
            break;
        case 'other':
            break;
    }
}
function handleConnectionLost(reason) {
    if (joined)
        console.log(`[CloudRealtime] disconnected (${reason}) — will reconnect`);
    teardownConnection();
    scheduleReconnect();
}
function teardownConnection() {
    joined = false;
    awaitingHeartbeatAck = false;
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
    if (tokenRefreshTimer) {
        clearInterval(tokenRefreshTimer);
        tokenRefreshTimer = null;
    }
    const socket = ws;
    ws = null;
    if (socket) {
        // Detach before closing so the stale socket can't re-enter our handlers.
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = () => { };
        try {
            socket.close();
        }
        catch {
            // already closed/failed — fine
        }
    }
}
function scheduleReconnect() {
    if (!started || reconnectTimer)
        return;
    const delay = (0, cloudRealtimeLogic_1.nextBackoffMs)(reconnectAttempt++);
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connect(++generation);
    }, delay);
}
function clearReconnectTimer() {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
}
// ── Keepalive ─────────────────────────────────────────────────────────────────
function startHeartbeat() {
    if (heartbeatTimer)
        clearInterval(heartbeatTimer);
    awaitingHeartbeatAck = false;
    heartbeatTimer = setInterval(() => {
        if (awaitingHeartbeatAck) {
            // The previous heartbeat was never acked — the connection is dead even
            // if the TCP socket looks open (e.g. network switch, laptop resume).
            handleConnectionLost('heartbeat timeout');
            return;
        }
        awaitingHeartbeatAck = true;
        sendFrame((0, cloudRealtimeLogic_1.buildHeartbeatFrame)(++refCounter));
    }, HEARTBEAT_INTERVAL_MS);
}
function startTokenRefresh() {
    if (tokenRefreshTimer)
        clearInterval(tokenRefreshTimer);
    tokenRefreshTimer = setInterval(async () => {
        const gen = generation;
        let token = null;
        try {
            token = await account.getAccessToken();
        }
        catch {
            token = null;
        }
        if (gen !== generation || !token)
            return; // torn down meanwhile, or offline
        sendFrame((0, cloudRealtimeLogic_1.buildAccessTokenFrame)(token, ++refCounter));
    }, TOKEN_REFRESH_INTERVAL_MS);
}
function sendFrame(frame) {
    if (!ws || ws.readyState !== WebSocket.OPEN)
        return;
    try {
        ws.send(JSON.stringify(frame));
    }
    catch (err) {
        console.error('[CloudRealtime] send failed:', String(err));
    }
}
