// js/features/payload.js — decoding of XOR/Base64 "encrypted" .dat payloads.

import { xorCrypt } from '../core/utils.js';
import { parseMarkdownDatabase } from '../format/database-format.js';
import { parseStatusProfile } from '../format/status-format.js';

/**
 * Decode a Base64 + XOR payload. Returns both the legacy (Latin-1) and UTF-8
 * interpretations because old exports predate the UTF-8 encoding step.
 */
export function decodeEncryptedPayload(encoded) {
    const raw = atob(String(encoded || '').trim());
    const legacyPlaintext = xorCrypt(raw);
    let utf8Plaintext = '';

    try {
        const utf8Encrypted = decodeURIComponent(escape(raw));
        utf8Plaintext = xorCrypt(utf8Encrypted);
    } catch (_) {}

    return {
        legacyPlaintext,
        utf8Plaintext,
        preferred: utf8Plaintext || legacyPlaintext
    };
}

/** Pick the interpretation that parses as a database. */
export function decodeDatabasePayload(encoded) {
    const decoded = decodeEncryptedPayload(encoded);
    if (decoded.legacyPlaintext.includes(':') && decoded.legacyPlaintext.includes('|')) return decoded.legacyPlaintext;
    if (decoded.utf8Plaintext.includes(':') && decoded.utf8Plaintext.includes('|')) return decoded.utf8Plaintext;
    if (parseMarkdownDatabase(decoded.utf8Plaintext).entries.length) return decoded.utf8Plaintext;
    if (parseMarkdownDatabase(decoded.legacyPlaintext).entries.length) return decoded.legacyPlaintext;
    return decoded.preferred;
}

/** Pick the interpretation that parses as a status profile. */
export function decodeStatusPayload(encoded) {
    const decoded = decodeEncryptedPayload(encoded);
    const candidates = [decoded.utf8Plaintext, decoded.legacyPlaintext].filter(Boolean);
    return candidates.find(content => parseStatusProfile(content).loaded) || decoded.preferred;
}
