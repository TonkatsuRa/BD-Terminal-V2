// tests/editor-smoke.mjs — boots the rewritten Database Studio in jsdom and
// drives it through open → edit → validate → serialize. Skips (exit 0) when
// jsdom is not installed, like the terminal integration suites.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

let JSDOM;
try {
    const require = createRequire(import.meta.url);
    ({ JSDOM } = require('jsdom'));
} catch (_) {
    try {
        const require = createRequire('/tmp/');
        ({ JSDOM } = require('/tmp/node_modules/jsdom'));
    } catch (__) {
        console.log('SKIPPED: jsdom not installed (npm i jsdom to run the editor smoke test)');
        process.exit(0);
    }
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'database-studio.html'), 'utf8');

let failures = 0;
function check(cond, label, detail = '') {
    if (cond) console.log(`  ✓ ${label}`);
    else { failures++; console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }
}

const dom = new JSDOM(html, {
    url: 'http://localhost/database-studio.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true
});
const { window } = dom;
const errors = [];
window.addEventListener('error', e => errors.push(e.message));
await new Promise(r => setTimeout(r, 300));

const studio = window.__studio;
check(Boolean(studio), 'studio test hook mounted');
check(Boolean(window.StudioShared?.parseMarkdownDatabase), 'canonical parser exposed');

// open a real database
const file = 'BRE-04 confidential_archive.md';
const text = fs.readFileSync(path.join(ROOT, 'databases', file), 'utf8');
studio.openContent(text, file, null);
const doc = studio.getDoc();
check(doc && doc.entries.length > 0, `opened ${file} (${doc.entries.length} entries)`);
check(window.document.querySelectorAll('.entry-item').length === doc.entries.length, 'sidebar lists every entry');
check(!window.document.getElementById('entryCard').hidden, 'entry form visible');

// terminal preview renders like printEntry, honoring the view-as clearance
const screenText = () => window.document.getElementById('termScreen').textContent;
check(screenText().includes('TOPIC'), 'preview renders TOPIC line');
check(!screenText().includes('REDACTED'), 'admin viewer reads admin entry');
window.document.querySelector('#viewAsSeg [data-level="employee"]').click();
check(screenText().includes('REDACTED') && screenText().includes('█'), 'employee viewer sees redaction');
window.document.querySelector('#viewAsSeg [data-level="admin"]').click();

// edits flow DOM → model → serializer
const topic = window.document.getElementById('fTopic');
topic.value = 'Smoke Edited Topic';
topic.dispatchEvent(new window.Event('input', { bubbles: true }));
await new Promise(r => setTimeout(r, 600));
check(studio.getDoc().entries.some(e => e.topic === 'Smoke Edited Topic'), 'topic edit reaches the model');
check(studio.serialize().includes('### Entry: Smoke Edited Topic'), 'serializer picks up the edit');

// serialized output parses identically in the runtime parser
const runtime = await import(new URL('../js/format/database-format.js', import.meta.url));
const reparsed = runtime.parseMarkdownDatabase(studio.serialize(), file);
check(reparsed.entries.length === studio.getDoc().entries.length, 'serialized file reparses to same entry count');

// validation catches terminal-parser landmines
studio.getDoc().entries[0].message = 'fine\n---\nTopic: sneaky\n### heading\n![bad](http://not-a-data-url)';
studio.validateNow();
const msgs = studio.getProblems().map(p => p.msg).join(' | ');
check(msgs.includes('---'), 'validator: bare --- flagged');
check(/Topic:\/Title:\/Entry:/.test(msgs), 'validator: entry-splitting body line flagged');
check(msgs.includes('heading'), 'validator: markdown heading flagged');
check(msgs.includes('image'), 'validator: malformed image line flagged');
check(msgs.includes('Round-trip'), 'validator: live round-trip gate fires on entry split');

// inline redaction: preview honors view-as rank through the shared engine
studio.getDoc().entries[0].message = 'Base [redact=2]block [redact=3]DEEP[/redact] rest[/redact] end';
studio.getDoc().entries[0].access = 'employee';
window.document.querySelector('#viewAsSeg [data-level="restricted"]').click();
check(screenText().includes('block') && screenText().includes('██') && !screenText().includes('DEEP'), 'view-as Restricted: L2 visible, L3 keyword masked');
window.document.querySelector('#viewAsSeg [data-level="management"]').click();
check(screenText().includes('DEEP'), 'view-as Management: L3 keyword visible');
window.document.querySelector('#viewAsSeg [data-level="employee"]').click();
check(!screenText().includes('block') && !screenText().includes('DEEP'), 'view-as Employee: whole L2 block masked');
window.document.querySelector('#viewAsSeg [data-level="admin"]').click();

// the preview pane's own "viewing as" dropdown drives the same state
const pvSel = window.document.getElementById('previewViewAs');
check(pvSel && pvSel.value === 'admin', 'preview dropdown synced with ribbon seg');
pvSel.value = 'employee';
pvSel.dispatchEvent(new window.Event('change', { bubbles: true }));
check(!screenText().includes('DEEP') && screenText().includes('██'), 'preview dropdown: employee view masks the block');
check(window.document.querySelector('#viewAsSeg [data-level="employee"]').classList.contains('active'), 'ribbon seg follows preview dropdown');
pvSel.value = 'admin';
pvSel.dispatchEvent(new window.Event('change', { bubbles: true }));

// validator catches redaction mistakes
studio.getDoc().entries[0].message = '[redact=2]unclosed and [/redact][/redact] stray';
studio.validateNow();
const rmsgs = studio.getProblems().map(p => p.msg).join(' | ');
check(rmsgs.includes('stray [/redact]'), 'validator: stray [/redact] flagged');
studio.getDoc().entries[0].message = 'ok';
studio.validateNow();

// entry CRUD
const before = studio.getDoc().entries.length;
studio.addEntry('DIRECTIVES');
check(studio.getDoc().entries.length === before + 1, 'add entry works');

check(!errors.length, 'no window errors during the session', errors.slice(0, 3).join(' | '));
console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);
