// Inline color markup ([color=NAME]...[/color]) — behavioral tests against
// the real module (js/format/colors.js), no source extraction.

import { TestRunner } from './_helpers.mjs';
import { TERMINAL_COLOR_NAMES } from '../js/core/utils.js';
import {
    lineHasColorMarkup, parseColorSegments, balanceColorTagsAcrossLines, COLOR_TAG_NAME_RE
} from '../js/format/colors.js';

const t = new TestRunner('Color markup');

t.assert(Array.isArray(TERMINAL_COLOR_NAMES) && TERMINAL_COLOR_NAMES.length === 7,
    `TERMINAL_COLOR_NAMES loaded (${TERMINAL_COLOR_NAMES.length} names)`);
t.assert(TERMINAL_COLOR_NAMES.every(name => COLOR_TAG_NAME_RE.test(name)),
    'COLOR_TAG_NAME_RE accepts every canonical color name');
t.assert(!COLOR_TAG_NAME_RE.test('purple'), 'COLOR_TAG_NAME_RE rejects unknown color names');

// Detection
[
    ['plain text', false],
    ['[color=amber]hello[/color]', true],
    ['mix [color=red]X[/color] more', true],
    ['only opening [color=amber] no close', true],
    ['only closing [/color] no open', true],
    ['no tags here at all', false],
].forEach(([line, expected]) => {
    t.assertEqual(lineHasColorMarkup(line), expected, `detect: "${line}"`);
});

// Segmentation
{
    const segments = parseColorSegments('before [color=amber]mid[/color] after');
    t.assertEqual(segments.length, 3, '3 segments for plain/colored/plain');
    t.assertEqual(segments[0].className, null, '  first segment is plain');
    t.assertEqual(segments[1].className, 't-amber', '  middle segment is t-amber');
    t.assertEqual(segments[1].text, 'mid', '  middle segment text');
    t.assertEqual(segments[2].className, null, '  trailing segment is plain');
}
{
    const segments = parseColorSegments('[color=zzz]nope[/color]');
    t.assertEqual(segments.length, 1, 'invalid color name -> single plain segment');
    t.assertEqual(segments[0].className, null, '  className null for invalid color');
    t.assertEqual(segments[0].text, 'nope', '  text content preserved');
}
{
    const segments = parseColorSegments('[COLOR=AMBER]loud[/COLOR]');
    t.assertEqual(segments.length, 1, 'case-insensitive color tag accepted');
    t.assertEqual(segments[0].className, 't-amber', '  normalized to lowercase t-amber');
}

// Multi-line balancing
{
    const input = [
        'line one',
        'start [color=cyan]colored',
        'still colored',
        'ends here[/color] done',
        'line five'
    ].join('\n');
    const balanced = balanceColorTagsAcrossLines(input);
    const lines = balanced.split('\n');
    t.assertEqual(lines[0], 'line one', 'line 1 unchanged');
    t.assert(lines[1].endsWith('[/color]'), 'line 2 self-contains color');
    t.assert(lines[2].startsWith('[color=cyan]') && lines[2].endsWith('[/color]'), 'line 3 self-contains color');
    t.assert(lines[3].startsWith('[color=cyan]'), 'line 4 self-contains color');
    t.assertEqual(lines[4], 'line five', 'line 5 unchanged');

    const visible = lines
        .map(line => parseColorSegments(line).map(seg => seg.text).join(''))
        .join('\n');
    const expectedVisible = input.replace(/\[color=[a-z]+\]|\[\/color\]/gi, '');
    t.assertEqual(visible, expectedVisible, 'visible text unchanged after balance + segment');
}

// Every canonical color produces its t-* class
TERMINAL_COLOR_NAMES.forEach(name => {
    const segments = parseColorSegments(`[color=${name}]x[/color]`);
    t.assertEqual(segments[0]?.className, `t-${name}`, `t-${name} produced for [color=${name}]`);
});

t.exit();
