"use strict";
// Pure crypto layer for NoteFlow Cloud (E2EE) — phase 4.2, stage 1. Implements
// the key hierarchy of .claude/context/monetization.md § 4: a random 256-bit DEK
// (master key) wrapped by a passphrase-derived KEK and by a recovery-code-derived
// KEK (rows of public.user_keys), plus a per-note key wrapped by the DEK
// (files.key_ct) that encrypts content_ct/path_ct. Lives in electron/ but imports
// nothing from Electron (node:crypto webcrypto only) — same pure-module pattern
// as electron/entitlements.ts / syncState.ts, covered by
// tests/electron/cloudCrypto.test.ts.
//
// Primitives mirror src/lib/cryptoUtils.ts (per-note encryption): AES-256-GCM,
// PBKDF2-SHA256, base64url encoding. It is a separate module because
// tsconfig.electron.json (rootDir: 'electron') cannot import from src/. The
// PBKDF2 work factor is NOT shared with per-note encryption: new cloud wraps use
// 600,000 iterations (OWASP 2023 for PBKDF2-SHA256), per-note encryption keeps
// its own default (310,000).
//
// Sealed blob format (used by wrapKey/encryptContent, i.e. every *_ct column):
//   base64url( iv (12 bytes) || AES-256-GCM ciphertext+tag )
// The IV is random per operation and travels with the ciphertext; the GCM tag
// authenticates it, so a wrong key or tampered blob throws on open.
Object.defineProperty(exports, "__esModule", { value: true });
exports.RECOVERY_CODE_GROUP_LEN = exports.RECOVERY_CODE_GROUPS = exports.DEFAULT_KDF_ITERATIONS = exports.KDF_SALT_BYTES = exports.KEY_BYTES = void 0;
exports.toB64Url = toB64Url;
exports.fromB64Url = fromB64Url;
exports.generateDek = generateDek;
exports.generateNoteKey = generateNoteKey;
exports.generateKdfSalt = generateKdfSalt;
exports.deriveKek = deriveKek;
exports.generateRecoveryCode = generateRecoveryCode;
exports.normalizeRecoveryCode = normalizeRecoveryCode;
exports.looksLikeRecoveryCode = looksLikeRecoveryCode;
exports.deriveRecoveryKek = deriveRecoveryKek;
exports.wrapKey = wrapKey;
exports.unwrapKey = unwrapKey;
exports.encryptContent = encryptContent;
exports.decryptContent = decryptContent;
exports.derivePathKeyHmac = derivePathKeyHmac;
const node_crypto_1 = require("node:crypto");
const { subtle } = node_crypto_1.webcrypto;
exports.KEY_BYTES = 32; // AES-256 / DEK / note key / HMAC subkey
exports.KDF_SALT_BYTES = 16;
// Work factor for NEW cloud wraps (user_keys passphrase/recovery copies). The
// value is stored per row (pass_iterations / recovery_iterations) and every
// unwrap — desktop and CLI — derives with the STORED value, so raising it never
// breaks rows wrapped earlier with 310,000. Deliberately independent from
// src/lib/cryptoUtils.ts (per-note encryption has its own default).
exports.DEFAULT_KDF_ITERATIONS = 600000;
const IV_BYTES = 12;
const HASH_ALG = 'SHA-256';
// HKDF info for the path-HMAC subkey — a distinct label so the raw DEK is never
// reused across two purposes (wrapping keys vs keyed hashing).
const PATH_HMAC_INFO = 'noteflow-cloud-path';
// ── Encoding ──────────────────────────────────────────────────────────────────
function toB64Url(bytes) {
    return Buffer.from(bytes).toString('base64url');
}
function fromB64Url(s) {
    return new Uint8Array(Buffer.from(s, 'base64url'));
}
// ── Random material ───────────────────────────────────────────────────────────
function randomBytes(n) {
    const bytes = new Uint8Array(n);
    node_crypto_1.webcrypto.getRandomValues(bytes);
    return bytes;
}
/** Master key (DEK): 256 random bits, generated client-side when Cloud is enabled. */
function generateDek() {
    return randomBytes(exports.KEY_BYTES);
}
/** Per-note key: 256 random bits, wrapped by the DEK into files.key_ct. */
function generateNoteKey() {
    return randomBytes(exports.KEY_BYTES);
}
/** Salt for the passphrase / recovery-code KDFs (user_keys.pass_salt / recovery_salt). */
function generateKdfSalt() {
    return randomBytes(exports.KDF_SALT_BYTES);
}
// ── KEK derivation (passphrase / recovery code) ───────────────────────────────
/** PBKDF2-SHA256 passphrase → 256-bit KEK (same KDF as per-note encryption; iterations per call). */
async function deriveKek(passphrase, salt, iterations = exports.DEFAULT_KDF_ITERATIONS) {
    const material = await subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: HASH_ALG }, material, exports.KEY_BYTES * 8);
    return new Uint8Array(bits);
}
// Recovery code alphabet: base32-sized (32 chars → exactly 5 bits each, and
// 256 % 32 === 0 so `byte % 32` is uniform) with the ambiguous 0/O/1/I removed.
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
exports.RECOVERY_CODE_GROUPS = 6;
exports.RECOVERY_CODE_GROUP_LEN = 5;
// 6 groups × 5 chars × 5 bits = 150 bits of entropy (≥ the 128-bit floor).
/**
 * Human-readable recovery code, e.g. 'K7MHQ-2XWDF-...' (6 groups of 5). Shown
 * ONCE at Cloud onboarding; it wraps the DEK as the second access path
 * (user_keys.dek_recovery_ct).
 */
function generateRecoveryCode() {
    const bytes = randomBytes(exports.RECOVERY_CODE_GROUPS * exports.RECOVERY_CODE_GROUP_LEN);
    const groups = [];
    for (let g = 0; g < exports.RECOVERY_CODE_GROUPS; g++) {
        let group = '';
        for (let i = 0; i < exports.RECOVERY_CODE_GROUP_LEN; i++) {
            group += RECOVERY_ALPHABET[bytes[g * exports.RECOVERY_CODE_GROUP_LEN + i] % RECOVERY_ALPHABET.length];
        }
        groups.push(group);
    }
    return groups.join('-');
}
/**
 * Tolerant normalization for user-typed codes: uppercases and strips separators
 * or anything outside the alphabet. Applied by deriveRecoveryKek, so
 * 'k7mhq 2xwdf' and 'K7MHQ-2XWDF' derive the same KEK.
 */
function normalizeRecoveryCode(code) {
    const up = code.toUpperCase();
    let out = '';
    for (const ch of up) {
        if (RECOVERY_ALPHABET.includes(ch))
            out += ch;
    }
    return out;
}
/**
 * Heuristic used by the unlock flow: a user-typed secret is treated as a
 * possible recovery code only when its normalized form has EXACTLY the length
 * of a generated code (30 chars). Deriving a recovery KEK from an arbitrary
 * passphrase-looking string would silently succeed at the KDF and fail at
 * unwrap — checking the length first lets the caller give a clear error.
 */
function looksLikeRecoveryCode(input) {
    return normalizeRecoveryCode(input).length === exports.RECOVERY_CODE_GROUPS * exports.RECOVERY_CODE_GROUP_LEN;
}
/** PBKDF2-SHA256 recovery code → 256-bit KEK (code normalized first). */
async function deriveRecoveryKek(code, salt, iterations = exports.DEFAULT_KDF_ITERATIONS) {
    return deriveKek(normalizeRecoveryCode(code), salt, iterations);
}
// ── AES-256-GCM sealed blobs ──────────────────────────────────────────────────
async function importAesKey(raw, usage) {
    if (raw.length !== exports.KEY_BYTES) {
        throw new Error(`cloudCrypto: expected a ${exports.KEY_BYTES}-byte key, got ${raw.length}`);
    }
    return subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [usage]);
}
/** Seals plaintext bytes under an AES-256 key → base64url(iv || ciphertext+tag). */
async function seal(keyBytes, plaintext) {
    const iv = randomBytes(IV_BYTES);
    const key = await importAesKey(keyBytes, 'encrypt');
    const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
    const blob = new Uint8Array(IV_BYTES + ct.length);
    blob.set(iv);
    blob.set(ct, IV_BYTES);
    return toB64Url(blob);
}
/** Opens a sealed blob. Throws on a wrong key or tampered data (GCM tag mismatch). */
async function open(keyBytes, sealed) {
    const blob = fromB64Url(sealed);
    if (blob.length <= IV_BYTES)
        throw new Error('cloudCrypto: sealed blob too short');
    const key = await importAesKey(keyBytes, 'decrypt');
    const plain = await subtle.decrypt({ name: 'AES-GCM', iv: blob.subarray(0, IV_BYTES) }, key, blob.subarray(IV_BYTES));
    return new Uint8Array(plain);
}
// ── Key wrapping (DEK ↔ KEK, note key ↔ DEK) ─────────────────────────────────
/** Wraps a raw key under a wrapping key (KEK or DEK) → sealed blob for *_ct columns. */
async function wrapKey(key, wrappingKey) {
    if (key.length !== exports.KEY_BYTES) {
        throw new Error(`cloudCrypto: expected a ${exports.KEY_BYTES}-byte key to wrap, got ${key.length}`);
    }
    return seal(wrappingKey, key);
}
/** Unwraps a sealed key blob. Throws on a wrong wrapping key. */
async function unwrapKey(wrapped, wrappingKey) {
    const key = await open(wrappingKey, wrapped);
    if (key.length !== exports.KEY_BYTES) {
        throw new Error(`cloudCrypto: unwrapped key has ${key.length} bytes, expected ${exports.KEY_BYTES}`);
    }
    return key;
}
// ── Content encryption (files.content_ct / files.path_ct) ────────────────────
/** Encrypts UTF-8 text under a note key → sealed blob. */
async function encryptContent(noteKey, plaintext) {
    return seal(noteKey, new TextEncoder().encode(plaintext));
}
/** Decrypts a sealed blob back to UTF-8 text. Throws on a wrong key. */
async function decryptContent(noteKey, sealed) {
    return new TextDecoder().decode(await open(noteKey, sealed));
}
// ── Opaque path identifier (files.path_key) ───────────────────────────────────
/**
 * path_key = base64url(HMAC-SHA256(subkey, relPath)) where the HMAC subkey is
 * derived from the DEK via HKDF-SHA256 (info 'noteflow-cloud-path'), so the raw
 * DEK is never used directly for two purposes. Deterministic per (DEK, relPath):
 * the same file always maps to the same row, without leaking titles/slugs
 * (the current relPath contains the note title).
 */
async function derivePathKeyHmac(dek, relPath) {
    if (dek.length !== exports.KEY_BYTES) {
        throw new Error(`cloudCrypto: expected a ${exports.KEY_BYTES}-byte DEK, got ${dek.length}`);
    }
    const material = await subtle.importKey('raw', dek, 'HKDF', false, ['deriveBits']);
    const subkeyBits = await subtle.deriveBits({
        name: 'HKDF',
        hash: HASH_ALG,
        salt: new Uint8Array(0),
        info: new TextEncoder().encode(PATH_HMAC_INFO),
    }, material, exports.KEY_BYTES * 8);
    const hmacKey = await subtle.importKey('raw', subkeyBits, { name: 'HMAC', hash: HASH_ALG }, false, ['sign']);
    const mac = await subtle.sign('HMAC', hmacKey, new TextEncoder().encode(relPath));
    return toB64Url(new Uint8Array(mac));
}
