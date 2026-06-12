import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
// jsdom is the only dependency, and only for these integration tests.
// Install it anywhere Node can resolve it (e.g. `npm i jsdom` in the repo or
// globally) — the static .test.mjs suite needs no dependencies at all.
let JSDOM;
try {
    const require = createRequire(import.meta.url);
    ({ JSDOM } = require('jsdom'));
} catch (_) {
    try {
        const require = createRequire('/tmp/');
        ({ JSDOM } = require('/tmp/node_modules/jsdom'));
    } catch (__) {
        console.log('SKIPPED: jsdom not installed (npm i jsdom to run the integration suite)');
        process.exit(0);
    }
}
import { fileURLToPath } from 'node:url';
const ROOT = process.env.APP_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'https://terminal.test/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
// FULL MOTION this time — exercise the real typewriter.
window.matchMedia = () => ({ matches: false, addEventListener: () => {}, addListener: () => {} });
window.AudioContext = undefined;
window.fetch = async url => {
    const clean = String(url).replace(/^https:\/\/terminal\.test\//, '').split('?')[0];
    const file = path.join(ROOT, decodeURIComponent(clean));
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        const text = fs.readFileSync(file, 'utf8');
        return { ok: true, status: 200, text: async () => text, json: async () => JSON.parse(text) };
    }
    return { ok: false, status: 404 };
};
if (!window.Element.prototype.scrollBy) window.Element.prototype.scrollBy = () => {};
if (!window.Element.prototype.setSelectionRange) window.Element.prototype.setSelectionRange = () => {};
for (const key of ['window','document','navigator','location','localStorage','sessionStorage','requestAnimationFrame','cancelAnimationFrame','matchMedia','fetch','FileReader','getComputedStyle','Element','HTMLElement','Node']) {
    try { Object.defineProperty(globalThis, key, { configurable: true, get: () => window[key] }); } catch (_) {}
}
globalThis.atob = s => Buffer.from(s, 'base64').toString('binary');
window.atob = globalThis.atob;

let failures = 0;
const check = (c, l, d='') => { if (c) console.log('  ✓ ' + l); else { failures++; console.log('  ✗ ' + l + (d ? ' — ' + d : '')); } };

await import(pathToFileURL(path.join(ROOT, 'js/app.js')));
for (const f of ['debug.js','session-restore.js','map-overlay.js','diagnostics.js','facility-status.js','ui.js']) {
    window.eval(fs.readFileSync(path.join(ROOT, 'js/legacy', f), 'utf8'));
}
window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
await new Promise(r => setTimeout(r, 200));
window.document.getElementById('bootSkip').dispatchEvent(new window.Event('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 700));

// 1) Typewriter actually types over time (partial → complete).
window.clearOutput({ force: true });
window.print('THE QUICK BROWN FOX JUMPS OVER THE LAZY TERMINAL OPERATOR DESK', 't-cyan');
await new Promise(r => setTimeout(r, 120));
const partial = window.document.querySelector('#output .output-line')?.textContent || '';
check(partial.length > 0 && partial.length < 63, `typewriter mid-animation (${partial.length}/63 chars revealed)`);
await new Promise(r => setTimeout(r, 1200));
const full = window.document.querySelector('#output .output-line')?.textContent || '';
check(full === 'THE QUICK BROWN FOX JUMPS OVER THE LAZY TERMINAL OPERATOR DESK', 'typewriter completes the line');

// 2) Colored line types into spans.
window.clearOutput({ force: true });
window.print('warn [color=amber]ALERT[/color] done', '');
await new Promise(r => setTimeout(r, 1500));
const line = window.document.querySelector('#output .output-line');
check(line?.querySelector('span.t-amber')?.textContent === 'ALERT', 'colored span typed correctly');
check(line?.textContent === 'warn ALERT done', 'visible text excludes tags');

// 3) Image line renders as <img>, never typed.
window.clearOutput({ force: true });
window.print('![tiny](data:image/png;base64,iVBORw0KGgo=)', 'entry-image-line');
await new Promise(r => setTimeout(r, 300));
const img = window.document.querySelector('#output .output-line img.entry-image-embed');
check(Boolean(img), 'image line renders <img class="entry-image-embed">');

// 4) Full database mount via the modal: selector → password → decrypt → mounted.
const dbModule = await import(pathToFileURL(path.join(ROOT, 'js/features/database.js')));
await dbModule.showDatabaseSelector();
await new Promise(r => setTimeout(r, 400));
const choices = window.document.querySelectorAll('#databaseModal .database-choice');
check(choices.length >= 3, `database selector lists choices (${choices.length}; Terminal-only without site)`);
const first = Array.from(choices).find(c => c.textContent.includes('ARES Director Logbook'));
check(Boolean(first), 'Director Logbook visible without site connection');
first.dispatchEvent(new window.Event('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 600));
const pwInput = window.document.querySelector('#databaseModal .database-password-input');
check(Boolean(pwInput), 'password prompt rendered');
pwInput.value = 'voss';
window.document.querySelector('[data-authenticate-database="true"]').dispatchEvent(new window.Event('click', { bubbles: true }));
console.log('  … decrypt animation running (5s)');
await new Promise(r => setTimeout(r, 7000));
check(window.databaseLoaded === true, 'database mounted after correct password');
check(!window.document.getElementById('databaseModal'), 'modal closed after mount');
const slot1 = window.document.querySelector('.database-slot-button[data-slot="0"]');
check(slot1.classList.contains('loaded'), 'slot 1 indicator shows loaded');

// 5) Search the mounted database.
window.clearOutput({ force: true });
await window.executeCliCommand('search denver', { echo: true });
await new Promise(r => setTimeout(r, 4000));
const out = Array.from(window.document.querySelectorAll('#output .output-line')).map(n => n.textContent).join('\n');
check(/MATCH(ES)? FOUND/.test(out), 'SEARCH finds matches in mounted database');

// 6) Wrong password path.
window.clearOutput({ force: true });
await dbModule.showDatabaseSelector();
await new Promise(r => setTimeout(r, 300));
const second = Array.from(window.document.querySelectorAll('#databaseModal .database-choice')).find(c => c.textContent.includes('Employee Logbook'));
second.dispatchEvent(new window.Event('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 500));
const pw2 = window.document.querySelector('#databaseModal .database-password-input');
pw2.value = 'wrongpassword';
window.document.querySelector('[data-authenticate-database="true"]').dispatchEvent(new window.Event('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 7000));
const err = window.document.querySelector('#databaseModal .database-password-error');
check(Boolean(err && err.textContent.includes('ACCESS DENIED')), 'wrong password re-prompts with error');

console.log('\n' + (failures === 0 ? 'ALL TYPEWRITER+DB CHECKS PASSED' : failures + ' FAILURES'));
process.exit(failures === 0 ? 0 : 1);
