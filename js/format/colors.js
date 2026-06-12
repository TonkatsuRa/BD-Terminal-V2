// js/format/colors.js — BBCode-style inline color markup ([color=amber]...[/color]).
// Pure module: safe to import from both the browser and Node test scripts.

import { TERMINAL_COLOR_NAMES } from '../core/utils.js';

export const COLOR_TAG_NAME_RE = new RegExp('^(' + TERMINAL_COLOR_NAMES.join('|') + ')$', 'i');

/** Quick check whether a line contains any color tag at all. */
export function lineHasColorMarkup(text) {
    return /\[color=[a-z]+\]|\[\/color\]/i.test(String(text || ''));
}

/**
 * Parse a line into segments. Lenient: unmatched open/close tags don't break
 * the line, they just affect span boundaries. Unknown color names render as
 * plain text segments (className null).
 *
 * @param {string} text
 * @returns {Array<{text: string, className: string|null}>}
 */
export function parseColorSegments(text) {
    const value = String(text || '');
    const segments = [];
    let buf = '';
    let active = null;
    let i = 0;
    while (i < value.length) {
        const rest = value.slice(i);
        const open = rest.match(/^\[color=([a-z]+)\]/i);
        if (open) {
            if (buf) segments.push({ text: buf, className: active ? 't-' + active : null });
            buf = '';
            const name = open[1].toLowerCase();
            active = COLOR_TAG_NAME_RE.test(name) ? name : null;
            i += open[0].length;
            continue;
        }
        const close = rest.match(/^\[\/color\]/i);
        if (close) {
            if (buf) segments.push({ text: buf, className: active ? 't-' + active : null });
            buf = '';
            active = null;
            i += close[0].length;
            continue;
        }
        buf += value[i];
        i++;
    }
    if (buf) segments.push({ text: buf, className: active ? 't-' + active : null });
    return segments;
}

/**
 * Re-balance color tags across newlines so each physical line is
 * self-contained for the line-by-line print() pipeline.
 * @param {string} text
 * @returns {string}
 */
export function balanceColorTagsAcrossLines(text) {
    const value = String(text || '');
    let out = '';
    let active = null;
    let i = 0;
    while (i < value.length) {
        const rest = value.slice(i);
        const open = rest.match(/^\[color=([a-z]+)\]/i);
        if (open) {
            const name = open[1].toLowerCase();
            active = COLOR_TAG_NAME_RE.test(name) ? name : null;
            out += open[0];
            i += open[0].length;
            continue;
        }
        const close = rest.match(/^\[\/color\]/i);
        if (close) {
            active = null;
            out += '[/color]';
            i += close[0].length;
            continue;
        }
        const ch = value[i];
        if (ch === '\n' && active) {
            out += '[/color]\n[color=' + active + ']';
            i++;
            continue;
        }
        out += ch;
        i++;
    }
    return out;
}
