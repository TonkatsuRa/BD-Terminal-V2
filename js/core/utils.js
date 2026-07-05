// js/core/utils.js — shared constants and pure helpers.
// Single source of truth for the encryption key, color names, and the
// embedded-image detector. The standalone editor pages (database-studio.html,
// diagnostics-editor.html) keep deliberate inline copies so they stay
// double-clickable — keep those in sync when changing anything here.

// IMPORTANT: ENCRYPTION_KEY is duplicated in the standalone editor HTML files
// and the ZIP password ("AresAres123") is derived from the same word. Grep the
// repo for 'Ares' (hex 41 72 65 73) before rotating.
export const ENCRYPTION_KEY = 'Ares';

/**
 * Symmetric XOR "encryption" used by encrypted .dat database exports.
 * Light obfuscation only — call again on the output to decrypt.
 * @param {string} text
 * @returns {string}
 */
export function xorCrypt(text) {
    let result = '';
    for (let i = 0; i < text.length; i++) {
        result += String.fromCharCode(text.charCodeAt(i) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length));
    }
    return result;
}

/**
 * Escape a value for safe insertion into HTML text or attributes.
 * @param {*} value - non-strings are coerced via String(value ?? '')
 * @returns {string}
 */
export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Detector for an embedded-image line in markdown bodies. Lenient: tolerates
// an optional leading "| " gutter prefix added by the entry renderer.
// Capture groups: (alt, dataUrl).
export const IMG_LINE_RE = /^\s*\|?\s*!\[([^\]]*)\]\((data:image\/[^)]+)\)\s*$/i;

// Canonical list of inline-color names supported by the terminal renderer and
// the Database Studio editor. The matching CSS classes (.t-green, ...) live in
// css/terminal.css.
export const TERMINAL_COLOR_NAMES = Object.freeze([
    'green', 'amber', 'cyan', 'red', 'magenta', 'dim', 'bright'
]);

/** Normalize a status/content key: lowercase, snake_case, dotted paths kept. */
export function normalizeStatusKey(key) {
    return String(key || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9._-]/g, '');
}

/** Trim a status value, strip wrapping quotes, expand literal \n sequences. */
export function cleanStatusValue(value) {
    let cleaned = String(value || '').trim();
    if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
        cleaned = cleaned.slice(1, -1);
    }
    return cleaned.replace(/\\n/g, '\n');
}

/** Collapse whitespace runs and trim. */
export function compactText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

/** Normalize free text for search matching (diacritics stripped, a-z0-9). */
export function normalizeSearchText(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        // ß is not decomposed by NFKD and would otherwise become a word break
        // ("straße" → "stra e"). Fold to "ss" so German queries match either way.
        .replace(/ß/g, 'ss')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}
