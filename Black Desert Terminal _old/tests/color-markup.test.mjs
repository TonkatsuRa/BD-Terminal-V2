// Exercise the [color=NAME]...[/color] pipeline:
//   - detection (lineHasColorMarkup)
//   - segmentation (parseColorSegments)
//   - newline balancing (balanceColorTagsAcrossLines)
//
// Also verifies the regex source in terminal.js matches what would be built
// from the canonical TERMINAL_COLOR_NAMES list in js/utils.js.

import fs from 'node:fs';
import path from 'node:path';
import { loadFromUtils, REPO_ROOT, TestRunner } from './_extract.mjs';

const t = new TestRunner('Color markup');

// Reconstruct the helpers from terminal.js (they're plain top-level functions).
// We don't have a loader for terminal.js so we inline-recreate them here using
// the canonical TERMINAL_COLOR_NAMES from utils.js. This intentionally mirrors
// the construction in terminal.js so the test catches drift between the two.
const { TERMINAL_COLOR_NAMES } = loadFromUtils(['TERMINAL_COLOR_NAMES']);

t.assert(
    Array.isArray(TERMINAL_COLOR_NAMES) && TERMINAL_COLOR_NAMES.length >= 7,
    `TERMINAL_COLOR_NAMES loaded (${TERMINAL_COLOR_NAMES.length} names)`
);

const COLOR_TAG_NAME_RE = new RegExp('^(' + TERMINAL_COLOR_NAMES.join('|') + ')$', 'i');

function lineHasColorMarkup(text) {
    return /\[color=[a-z]+\]|\[\/color\]/i.test(String(text || ''));
}

function parseColorSegments(text) {
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

function balanceColorTagsAcrossLines(text) {
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

// ---- Drift check: terminal.js builds COLOR_TAG_NAME_RE from TERMINAL_COLOR_NAMES ----
{
    const terminalSrc = fs.readFileSync(path.join(REPO_ROOT, 'js/terminal.js'), 'utf8');
    t.assert(
        /COLOR_TAG_NAME_RE\s*=\s*new RegExp\([^)]*TERMINAL_COLOR_NAMES/.test(terminalSrc),
        'terminal.js builds COLOR_TAG_NAME_RE from TERMINAL_COLOR_NAMES'
    );
    t.assert(
        !/COLOR_TAG_NAME_RE\s*=\s*\/\^\(green\|amber\|cyan\|red/.test(terminalSrc),
        'terminal.js no longer has a hardcoded color list in COLOR_TAG_NAME_RE'
    );
}

// ---- Detection ----
[
    ['plain text', false],
    ['[color=amber]hello[/color]', true],
    ['mix [color=red]X[/color] more', true],
    ['only opening [color=amber] no close', true],
    ['only closing [/color] no open', true],
    ['no tags here at all', false],
].forEach(([input, expected]) => {
    t.assertEqual(lineHasColorMarkup(input), expected, `detect: "${input.slice(0, 40)}"`);
});

// ---- Per-line segmentation ----
{
    const seg = parseColorSegments('Plain [color=amber]warn[/color] tail');
    t.assertEqual(seg.length, 3, '3 segments for plain/colored/plain');
    t.assertEqual(seg[0].className, null, '  first segment is plain');
    t.assertEqual(seg[1].className, 't-amber', '  middle segment is t-amber');
    t.assertEqual(seg[1].text, 'warn', '  middle segment text');
    t.assertEqual(seg[2].className, null, '  trailing segment is plain');
}
{
    const seg = parseColorSegments('[color=invalid]rejected[/color]');
    t.assertEqual(seg.length, 1, 'invalid color name -> single plain segment');
    t.assertEqual(seg[0].className, null, '  className null for invalid color');
    t.assertEqual(seg[0].text, 'rejected', '  text content preserved');
}
{
    const seg = parseColorSegments('[color=AMBER]case insens[/COLOR]');
    t.assertEqual(seg.length, 1, 'case-insensitive color tag accepted');
    t.assertEqual(seg[0].className, 't-amber', '  normalized to lowercase t-amber');
}

// ---- Cross-line balancing ----
{
    const input = 'opener\n[color=amber]line one\nline two\nline three[/color]\ncloser';
    const balanced = balanceColorTagsAcrossLines(input);
    const lines = balanced.split('\n');
    t.assertEqual(lines[0], 'opener', 'line 1 unchanged');
    t.assert(lines[1].startsWith('[color=amber]') && lines[1].endsWith('[/color]'),
        'line 2 self-contains color');
    t.assert(lines[2].startsWith('[color=amber]') && lines[2].endsWith('[/color]'),
        'line 3 self-contains color');
    t.assert(lines[3].startsWith('[color=amber]') && lines[3].endsWith('[/color]'),
        'line 4 self-contains color');
    t.assertEqual(lines[4], 'closer', 'line 5 unchanged');
}

// ---- Round-trip: balance -> segment per line -> reassemble preserves content ----
{
    const input = 'a\n[color=cyan]b\nc[/color]\nd';
    const balanced = balanceColorTagsAcrossLines(input);
    const recovered = balanced.split('\n').map(line =>
        parseColorSegments(line).map(s => s.text).join('')
    ).join('\n');
    t.assertEqual(recovered, 'a\nb\nc\nd', 'visible text unchanged after balance + segment');
}

// ---- All 7 color names produce a t-NAME className ----
TERMINAL_COLOR_NAMES.forEach(name => {
    const seg = parseColorSegments(`[color=${name}]x[/color]`);
    t.assertEqual(seg[0].className, 't-' + name, `t-${name} produced for [color=${name}]`);
});

t.exit();
