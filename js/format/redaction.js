// js/format/redaction.js — inline clearance-gated redaction markup.
//
// Message bodies may contain [redact=N]…[/redact] spans (N = 0-4, the
// clearance rank required to READ the span). Spans nest: the effective level
// of a character is the MAX of all open spans, so an outer level-2 block can
// contain level-3 keywords that stay hidden from a rank-2 reader.
//
// Pure module (no DOM): shared by the terminal runtime, the Node tests, and
// copied verbatim into database-studio.html's canonical parser block.
//
// Clearance ranks: 0 Public · 1 Employee · 2 Restricted · 3 Management ·
// 4 Administrator (see ACCESS_RANKS in js/core/state.js).

const REDACT_OPEN_RE = /^\[redact=([0-4])\]/i;
const REDACT_CLOSE_RE = /^\[\/redact\]/i;
const COLOR_TAG_RE = /^\[color=[a-z]+\]|^\[\/color\]/i;

/** Quick check whether a message contains any redaction markup. */
export function messageHasRedactionMarkup(text) {
    return /\[redact=[0-4]\]|\[\/redact\]/i.test(String(text || ''));
}

/**
 * Resolve redaction markup for a reader of the given clearance rank.
 * Tags are always removed. Characters inside spans whose effective level
 * exceeds viewerRank are replaced with █ (spaces/newlines preserved, so the
 * word shape stays visible). Color tags inside hidden spans are dropped so
 * they neither leak nor render as █ garbage.
 * Lenient like the color parser: an unclosed span redacts to the end, stray
 * [/redact] tags are ignored.
 *
 * @param {string} text
 * @param {number} viewerRank - 0..4
 * @returns {string}
 */
export function applyRedactionMarkup(text, viewerRank = 4) {
    const value = String(text || '');
    if (!messageHasRedactionMarkup(value)) return value;
    const rank = Number.isFinite(viewerRank) ? viewerRank : 0;
    const stack = [];
    let out = '';
    let i = 0;
    while (i < value.length) {
        const rest = value.slice(i);
        const open = rest.match(REDACT_OPEN_RE);
        if (open) {
            stack.push(Number.parseInt(open[1], 10));
            i += open[0].length;
            continue;
        }
        if (REDACT_CLOSE_RE.test(rest)) {
            stack.pop();
            i += '[/redact]'.length;
            continue;
        }
        const hidden = stack.length > 0 && Math.max(...stack) > rank;
        if (hidden) {
            const colorTag = rest.match(COLOR_TAG_RE);
            if (colorTag) {
                i += colorTag[0].length;
                continue;
            }
            const ch = value[i];
            out += /\s/.test(ch) ? ch : '█';
            i++;
            continue;
        }
        out += value[i];
        i++;
    }
    return out;
}

/** Remove all redaction tags, keeping every span readable (rank-4 view). */
export function stripRedactionTags(text) {
    return applyRedactionMarkup(text, 4);
}

/**
 * Lint redaction markup. Returns an array of human-readable issues
 * ({severity: 'error'|'warn', message}). Used by the studio validator.
 */
export function validateRedactionMarkup(text) {
    const value = String(text || '');
    const issues = [];
    const stack = [];
    let i = 0;
    while (i < value.length) {
        const rest = value.slice(i);
        const open = rest.match(REDACT_OPEN_RE);
        if (open) {
            const level = Number.parseInt(open[1], 10);
            const outer = stack.length ? Math.max(...stack) : -1;
            if (stack.length && level <= outer) {
                issues.push({ severity: 'warn', message: `nested [redact=${level}] inside a level-${outer} span has no effect (inner level must be higher)` });
            }
            stack.push(level);
            i += open[0].length;
            continue;
        }
        if (REDACT_CLOSE_RE.test(rest)) {
            if (!stack.length) issues.push({ severity: 'error', message: 'stray [/redact] without a matching [redact=N]' });
            else stack.pop();
            i += '[/redact]'.length;
            continue;
        }
        const malformed = rest.match(/^\[redact=([^\]]*)\]/i);
        if (malformed) {
            issues.push({ severity: 'error', message: `invalid redaction level "[redact=${malformed[1]}]" (allowed: 0-4)` });
            i += malformed[0].length;
            continue;
        }
        i++;
    }
    if (stack.length) {
        issues.push({ severity: 'error', message: `${stack.length} unclosed [redact=N] tag(s) — the span will redact to the end of the message` });
    }
    return issues;
}
