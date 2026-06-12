// Embedded image-line detection (IMG_LINE_RE) — tested directly against the
// shared constant in js/core/utils.js.

import { TestRunner } from './_helpers.mjs';
import { IMG_LINE_RE } from '../js/core/utils.js';

const t = new TestRunner('Image markup');

t.assert(IMG_LINE_RE instanceof RegExp, 'IMG_LINE_RE loaded from core/utils.js');
t.assert(IMG_LINE_RE.flags.includes('i'), 'IMG_LINE_RE is case-insensitive');

// Matches
[
    '![diagram](data:image/png;base64,iVBORw0KGgo)',
    '![](data:image/jpeg;base64,/9j/4AAQ)',
    '![logo](data:image/svg+xml;base64,PHN2Zy8+)',
    '| ![pic](data:image/png;base64,AAAA)',
    '  ![indented](data:image/png;base64,XXXX)',
    '![alt](data:image/png;base64,A+/=)',
    '![alt](DATA:IMAGE/PNG;BASE64,UPPERCASE)',
].forEach(line => {
    t.assert(IMG_LINE_RE.test(line), `match: "${line.length > 60 ? line.slice(0, 57) + '...' : line}"`);
});

// Rejections
[
    ['plain text', 'plain text'],
    ['| some prefixed text', 'prefixed plain'],
    ['text with ![inline](data:image/png;base64,AAAA) inside', 'inline image inside text'],
    ['![alt](https://example.com/x.png)', 'non-data URL'],
    ['![alt](data:text/plain;base64,AAAA)', 'non-image data URL'],
    ['![alt](data:image/png;base64,AAAA', 'missing close paren'],
    ['', 'empty string'],
].forEach(([line, label]) => {
    t.assert(!IMG_LINE_RE.test(line), `reject: ${label}`);
});

// Capture groups
{
    const m = '![diagram](data:image/png;base64,iVBORw0KGgo)'.match(IMG_LINE_RE);
    t.assert(Boolean(m), 'captures fire on a clean image line');
    t.assertEqual(m?.[1], 'diagram', '  alt captured');
    t.assertEqual(m?.[2], 'data:image/png;base64,iVBORw0KGgo', '  src captured');
}
{
    const m = '  | ![pic](data:image/png;base64,AAAA)  '.match(IMG_LINE_RE);
    t.assertEqual(m?.[1], 'pic', 'alt captured with prefix+whitespace');
    t.assertEqual(m?.[2], 'data:image/png;base64,AAAA', 'src captured with prefix+whitespace');
}

t.exit();
