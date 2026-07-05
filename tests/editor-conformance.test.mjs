// tests/editor-conformance.test.mjs — proves the Database Studio's inlined
// parser is functionally identical to the runtime parser, and that the
// studio's serializer round-trips every real database file losslessly.
//
// No dependencies. Run: node tests/editor-conformance.test.mjs

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
function check(cond, label, detail = '') {
    if (cond) console.log(`  ✓ ${label}`);
    else { failures++; console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }
}

// ---- extract the studio's canonical parser block ----
const html = fs.readFileSync(path.join(ROOT, 'database-studio.html'), 'utf8');
const MARKER = '<script id="studio-canonical-parser">';
const start = html.indexOf(MARKER);
check(start >= 0, 'database-studio.html contains the canonical parser block');
const end = html.indexOf('</' + 'script>', start);
const parserSource = html.slice(start + MARKER.length, end);

const tmpFile = path.join(os.tmpdir(), `studio-parser-${process.pid}.cjs`);
fs.writeFileSync(tmpFile, parserSource);
const require = createRequire(import.meta.url);
const Studio = require(tmpFile);

const runtime = await import(new URL('../js/format/database-format.js', import.meta.url));
const colors = await import(new URL('../js/format/colors.js', import.meta.url));
const utils = await import(new URL('../js/core/utils.js', import.meta.url));

// ---- 1. parser conformance on every real database file ----
console.log('\n[1] parser conformance (studio vs runtime)');
const dbDir = path.join(ROOT, 'databases');
const files = fs.readdirSync(dbDir).filter(f => f.endsWith('.md'));
check(files.length >= 10, `found ${files.length} database files`);
let identical = 0;
for (const file of files) {
    const text = fs.readFileSync(path.join(dbDir, file), 'utf8');
    const a = JSON.stringify(runtime.parseMarkdownDatabase(text, file));
    const b = JSON.stringify(Studio.parseMarkdownDatabase(text, file));
    if (a === b) identical++;
    else check(false, `parse identical: ${file}`);
}
check(identical === files.length, `all ${files.length} files parse identically in both parsers`);

// also compare helper behavior on tricky inputs
const trickyAccess = ['Admin', 'Administrator', 'Management', 'shareholder', 'Elevated', 'restricted', 'Public', 'CONFIDENTIAL', '4', '3', '2', '1', '0', '', 'employee', 'omega-full'];
check(trickyAccess.every(v => runtime.normalizeEntryAccess(v) === Studio.normalizeEntryAccess(v)),
    'normalizeEntryAccess matches for label/clearance variants');
const redaction = await import(new URL('../js/format/redaction.js', import.meta.url));
const redactCases = [
    'Report: [redact=2]the portal at [redact=3]KHEPRI[/redact] failed[/redact] today.',
    '[redact=4][color=red]SEALED[/color][/redact]',
    '[redact=2]unclosed', 'stray[/redact]', 'plain text', '[redact=9]bogus[/redact]'
];
check(redactCases.every(v => [0, 1, 2, 3, 4].every(r => redaction.applyRedactionMarkup(v, r) === Studio.applyRedactionMarkup(v, r))),
    'applyRedactionMarkup identical across all ranks (runtime vs studio)');
check(redactCases.every(v => JSON.stringify(redaction.validateRedactionMarkup(v)) === JSON.stringify(Studio.validateRedactionMarkup(v))),
    'validateRedactionMarkup identical (runtime vs studio)');
const trickyColor = ['[color=amber]x\ny[/color]', 'plain', '[color=bogus]x[/color]', '[color=red]unclosed'];
check(trickyColor.every(v => colors.balanceColorTagsAcrossLines(v) === Studio.balanceColorTagsAcrossLines(v)),
    'balanceColorTagsAcrossLines matches');
check(trickyColor.every(v => JSON.stringify(colors.parseColorSegments(v)) === JSON.stringify(Studio.parseColorSegments(v))),
    'parseColorSegments matches');
check(String(utils.IMG_LINE_RE) === String(Studio.IMG_LINE_RE), 'IMG_LINE_RE identical');

// ---- 2. serialize → reparse round-trip on every real database ----
console.log('\n[2] serializer round-trip (lossless through the runtime parser)');
const dropEmpty = obj => Object.fromEntries(Object.entries(obj).filter(([, v]) => String(v ?? '').trim() !== ''));
const groupByCategory = entries => {
    const map = new Map();
    entries.forEach(e => {
        const c = e.category;
        if (!map.has(c)) map.set(c, []);
        map.get(c).push(e);
    });
    return map;
};
let lossless = 0;
for (const file of files) {
    const text = fs.readFileSync(path.join(dbDir, file), 'utf8');
    const original = runtime.parseMarkdownDatabase(text, file);
    const serialized = Studio.serializeDatabase(original);
    const reparsed = runtime.parseMarkdownDatabase(serialized, file);
    const issues = [];
    if (JSON.stringify(dropEmpty(original.metadata)) !== JSON.stringify(dropEmpty(reparsed.metadata))) issues.push('metadata');
    if (original.entries.length !== reparsed.entries.length) {
        issues.push(`entry count ${original.entries.length} != ${reparsed.entries.length}`);
    } else {
        const g1 = groupByCategory(original.entries);
        const g2 = groupByCategory(reparsed.entries);
        if ([...g1.keys()].join('|') !== [...g2.keys()].join('|')) issues.push('category order');
        else for (const cat of g1.keys()) {
            const l1 = g1.get(cat), l2 = g2.get(cat);
            for (let i = 0; i < l1.length; i++) {
                for (const key of new Set([...Object.keys(l1[i]), ...Object.keys(l2[i])])) {
                    if (String(l1[i][key] ?? '') !== String(l2[i][key] ?? '')) issues.push(`${cat}[${i}].${key}`);
                }
            }
        }
    }
    if (!issues.length) lossless++;
    else check(false, `round-trip lossless: ${file}`, issues.slice(0, 5).join(', '));
}
check(lossless === files.length, `all ${files.length} files round-trip losslessly`);

// ---- 3. round-trip hardening: synthetic edge cases ----
console.log('\n[3] synthetic edge cases');
const synthetic = `---
id: synth_db
title: Synthetic
password: PW
custom_meta: kept
---
## Category: ALPHA

### Entry: Indented art 2079-03-01
ID or Person: person-x
ID: different-id
Date: 2079-03-01
Clearance: 3
Access: Admin
Keywords: alpha; beta
Related: other-entry
Redacted: partially sealed
Custom_Field: preserved value
Message:
line one
        deep indented line
[color=amber]colored
across lines[/color]

## Category: BETA

### Entry: Second
Access: Employee
Message:
plain
`;
const p1 = runtime.parseMarkdownDatabase(synthetic, 'synthetic');
const p2 = runtime.parseMarkdownDatabase(Studio.serializeDatabase(p1), 'synthetic');
check(p1.entries.length === p2.entries.length, 'synthetic entry count preserved');
const keys = new Set([...Object.keys(p1.entries[0]), ...Object.keys(p2.entries[0])]);
const diffs = [...keys].filter(k => String(p1.entries[0][k] ?? '') !== String(p2.entries[0][k] ?? ''));
check(!diffs.length, 'synthetic entry fields preserved (id/clearance/related/redacted/extras/indent)', diffs.join(', '));
check(p2.metadata.custom_meta === 'kept', 'unknown frontmatter keys preserved');
// The parser strips up to 4 leading spaces on ANY parse; an 8-space source
// line keeps 4 after the first parse, and the serializer's shield must keep
// exactly those 4 through every later round-trip.
check(p1.entries[0].message.includes('    deep indented line'), 'first parse keeps residual 4-space indent');
check(p2.entries[0].message.includes('    deep indented line'), 'round-trip preserves residual indentation exactly');

// A body that would split into extra entries must change the count (this is
// what the studio's live round-trip gate warns about).
const splitDoc = {
    metadata: { id: 'x', title: 'X' },
    entries: [{ topic: 'One', category: 'A', access: 'employee', message: 'ok\nTopic: sneaky split' }]
};
