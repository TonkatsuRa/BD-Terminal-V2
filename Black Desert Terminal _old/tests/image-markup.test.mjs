// Exercise IMG_LINE_RE from js/utils.js — the shared regex used by both
// database.js (to detect image-only lines in entry bodies) and terminal.js
// (to route those lines to the <img> renderer instead of the typewriter).

import fs from 'node:fs';
import path from 'node:path';
import { loadFromUtils, REPO_ROOT, TestRunner } from './_extract.mjs';

const t = new TestRunner('Image markup');

const { IMG_LINE_RE } = loadFromUtils(['IMG_LINE_RE']);

t.assert(IMG_LINE_RE instanceof RegExp, 'IMG_LINE_RE loaded from utils.js');
t.assert(IMG_LINE_RE.flags.includes('i'), 'IMG_LINE_RE is case-insensitive');

// ---- Positive cases (should match) ----
[
    '![diagram](data:image/png;base64,iVBORw0KGgo)',
    '![](data:image/jpeg;base64,/9j/4AAQ)',
    '![logo](data:image/svg+xml;base64,PHN2Zy8+)',
    '| ![pic](data:image/png;base64,AAAA)',
    '  ![indented](data:image/png;base64,XXXX)',
    '![alt](data:image/png;base64,A+/=)',
    '![alt](DATA:IMAGE/PNG;BASE64,UPPERCASE)',
].forEach(line => {
    t.assert(IMG_LINE_RE.test(line), `match: "${line.slice(0, 60)}${line.length > 60 ? '...' : ''}"`);
});

// ---- Negative cases (should NOT match) ----
[
    ['plain text line', 'plain text'],
    ['| ordinary | table row', 'prefixed plain'],
    ['text before ![inline](data:image/png;base64,A) text after', 'inline image inside text'],
    ['![alt](https://example.com/img.png)', 'non-data URL'],
    ['![alt](data:text/html;base64,XXXX)', 'non-image data URL'],
    ['![no closing paren](data:image/png;base64,XXXX', 'missing close paren'],
    ['', 'empty string'],
    // Note: 'data:image/png;base64,' (empty payload) DOES match because the
    // mediatype prefix itself satisfies [^)]+. Runtime image rendering would
    // produce a broken <img>, which is acceptable.
].forEach(([line, label]) => {
    t.assert(!IMG_LINE_RE.test(line), `reject: ${label}`);
});

// ---- Capture groups ----
{
    const line = '![my photo](data:image/png;base64,iVBORabc)';
    const m = line.match(IMG_LINE_RE);
    t.assert(m, 'captures fire on a clean image line');
    if (m) {
        t.assertEqual(m[1], 'my photo', '  alt captured');
        t.assertEqual(m[2], 'data:image/png;base64,iVBORabc', '  src captured');
    }
}
{
    const line = '|   ![p](data:image/jpeg;base64,xy)';
    const m = line.match(IMG_LINE_RE);
    if (m) {
        t.assertEqual(m[1], 'p', 'alt captured with prefix+whitespace');
        t.assertEqual(m[2], 'data:image/jpeg;base64,xy', 'src captured with prefix+whitespace');
    } else {
        t.fail('should match prefixed image line');
    }
}

// ---- Drift check: js/database.js and js/terminal.js reference the shared const ----
{
    const dbSrc = fs.readFileSync(path.join(REPO_ROOT, 'js/database.js'), 'utf8');
    t.assert(/IMG_LINE_RE/.test(dbSrc), 'js/database.js references IMG_LINE_RE');
    t.assert(!/imgLineRe\s*=\s*\//.test(dbSrc),
        'js/database.js no longer declares a local imgLineRe');

    const termSrc = fs.readFileSync(path.join(REPO_ROOT, 'js/terminal.js'), 'utf8');
    t.assert(/IMG_LINE_RE/.test(termSrc), 'js/terminal.js references IMG_LINE_RE');
    t.assert(!/const IMG_LINE_RE\s*=/.test(termSrc),
        'js/terminal.js no longer redeclares IMG_LINE_RE');
}

t.exit();
