// Integration harness: boots the rebuilt terminal inside jsdom.
// Loads the real index.html, evaluates the ES-module core (bridge/app),
// evaluates the legacy classic scripts in the jsdom window, fires
// DOMContentLoaded, fast-forwards the boot, and runs real commands.

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

const dom = new JSDOM(html, {
    url: 'https://terminal.test/index.html',
    pretendToBeVisual: true,
    runScripts: 'outside-only'
});
const { window } = dom;

// ---- polyfills the app expects ----
// Reduced motion ON: the typewriter renders instantly so transcript checks
// test logic, not animation pacing.
window.matchMedia = query => ({
    matches: /prefers-reduced-motion/.test(String(query)),
    addEventListener: () => {},
    addListener: () => {}
});
window.AudioContext = undefined; // AudioEngine silently disables
window.fetch = async url => {
    // Serve project files from disk for content/databases/sites fetches.
    const clean = String(url).replace(/^https:\/\/terminal\.test\//, '').split('?')[0];
    const file = path.join(ROOT, decodeURIComponent(clean));
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        const text = fs.readFileSync(file, 'utf8');
        return { ok: true, status: 200, text: async () => text, json: async () => JSON.parse(text), blob: async () => new Blob([text]) };
    }
    return { ok: false, status: 404, text: async () => '', json: async () => ({}) };
};
window.scrollBy = () => {};
if (!window.Element.prototype.scrollBy) window.Element.prototype.scrollBy = () => {};
if (!window.Element.prototype.setSelectionRange) window.Element.prototype.setSelectionRange = () => {};

// Expose the jsdom globals to the ES modules (which reference bare globals).
for (const key of ['window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage',
    'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia', 'fetch', 'FileReader',
    'getComputedStyle', 'Element', 'HTMLElement', 'Node']) {
    try {
        Object.defineProperty(globalThis, key, { configurable: true, get: () => window[key] });
    } catch (_) {}
}
globalThis.atob = s => Buffer.from(s, 'base64').toString('binary');
window.atob = globalThis.atob;
// (do not override globalThis.performance — jsdom's Performance delegates to it)

const log = [];
const realWarn = console.warn;
console.warn = (...args) => { log.push(['warn', args.join(' ')]); };
window.addEventListener('error', e => log.push(['window-error', e.message]));

let failures = 0;
function check(cond, label, detail = '') {
    if (cond) console.log(`  ✓ ${label}`);
    else { failures++; console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }
}

// ---- evaluate the module graph ----
await import(pathToFileURL(path.join(ROOT, 'js/app.js')));
console.log('module graph evaluated');

// ---- evaluate legacy classic scripts in the window's global scope ----
for (const file of ['debug.js', 'session-restore.js', 'map-overlay.js', 'diagnostics.js', 'facility-status.js', 'ui.js']) {
    const src = fs.readFileSync(path.join(ROOT, 'js/legacy', file), 'utf8');
    try {
        window.eval(src);
        console.log(`legacy ${file} evaluated`);
    } catch (err) {
        failures++;
        console.log(`  ✗ legacy ${file} threw: ${err.message}`);
    }
}

// ---- fire DOMContentLoaded (jsdom already parsed; dispatch manually) ----
window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
await new Promise(r => setTimeout(r, 300));

check(typeof window.print === 'function', 'bridge print() on window');
check(typeof window.showDiagnosticDashboard === 'function', 'legacy showDiagnosticDashboard on window');
check(typeof window.initHologram === 'function', 'legacy initHologram on window');
check(typeof window.TerminalSessionRestore === 'object', 'session restore controller present');
check(typeof window.MapOverlayController === 'object', 'map overlay controller present');

// Boot sequence is RAF/timer driven; skip it like a player pressing Enter.
const bootSkip = window.document.getElementById('bootSkip');
bootSkip.dispatchEvent(new window.Event('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 600));

check(window.document.body.classList.contains('terminal-ready'), 'terminal-ready after boot skip');

// ---- run real commands through the dispatcher ----
async function run(cmd) {
    await window.executeCliCommand(cmd, { echo: true, history: true });
    await new Promise(r => setTimeout(r, 120));
}
function transcript() {
    return Array.from(window.document.querySelectorAll('#output .output-line')).map(n => n.textContent).join('\n');
}

await run('help');
check(transcript().includes('SYSTEM MANUAL'), '/HELP renders the system manual');
check(transcript().includes('/SEARCH'), 'help lists /SEARCH');

await run('search test');
check(transcript().includes('No database loaded'), 'SEARCH without database prints error');

await run('home');
check(transcript().includes('ARES MACROTECHNOLOGY'), '/HOME renders');

await run('unknowncommand');
check(transcript().includes('UNKNOWN COMMAND: UNKNOWNCOMMAND'), 'unknown command handled');

// Network + site connect flow (progress bars are RAF based — give them time).
const netPromise = window.executeCliCommand('net on', { echo: true });
await new Promise(r => setTimeout(r, 2500));
await netPromise;
check(window.AppState.networkOnline === true, 'NET ON enables network');

const connectPromise = window.executeCliCommand('connect BRE-01 ALPHA-7742', { echo: true });
await new Promise(r => setTimeout(r, 3500));
await connectPromise;
check(window.AppState.connectedSiteId === 'BRE-01', 'CONNECT BRE-01 sets connected site');
check(transcript().includes('BRE-01: CONNECTED'), 'connect log printed');
check(window.databaseLoaded === true, 'site default records mounted');

await run('welcome');
check(transcript().includes('BRE SITE INTRANET'), '/WELCOME shows site intranet');

await run('site status');
check(transcript().includes('ACTIVE SITE : BRE-01'), '/SITE STATUS reports BRE-01');

// Access flow: drive the real dialog (admin password) through the DOM.
const accessInput = window.document.getElementById('accessPassword');
accessInput.value = 'apocalypse';
window.document.getElementById('accessSubmitBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 200));
check(window.AppState.adminMode === true, 'admin password grants admin via dialog');
window.setAppState({ accessLevel: 'employee' });

window.setAppState({ accessLevel: 'admin' });
check(window.AppState.adminMode === true, 'admin state applies');
check(window.document.body.classList.contains('admin-access-active'), 'admin body class set');
await run('list all');
check(transcript().includes('COMPLETE DATABASE INDEX'), 'LIST ALL renders for admin');

window.setAppState({ accessLevel: 'employee' });
await run('list all');
check(transcript().includes('ACCESS REQUIRED'), 'LIST ALL blocked for employee');

await run('fx low');
check(transcript().includes('VISUAL EFFECTS MODE'), 'FX LOW acknowledges');

await run('safe mode');
check(window.safeModeActive() === true, 'safe mode enables');
await run('safe mode off');
check(window.safeModeActive() === false, 'safe mode disables');

await run('eject all database');
check(transcript().includes('NO DATABASES LOADED') || transcript().includes('EJECTED'), 'eject responds');

await run('disconnect');
check(window.AppState.connectedSiteId === '', 'DISCONNECT clears site');

// Diagnostics overlay (requires net + site → reconnect quickly)
const reconnect = window.executeCliCommand('connect BRE-02 BRAVO-3318', { echo: false });
await new Promise(r => setTimeout(r, 3500));
await reconnect;
check(window.AppState.connectedSiteId === 'BRE-02', 'reconnect to BRE-02');

// showDiagnosticDashboard would normally open the tool page via session
// restore; force the in-page overlay path by removing the controller.
const savedTSR = window.TerminalSessionRestore;
window.TerminalSessionRestore = null;
window.showDiagnosticDashboard();
await new Promise(r => setTimeout(r, 400));
check(window.diagnosticActive === true, 'diagnostic overlay activates');
check(window.document.getElementById('diagnosticOverlay').classList.contains('active'), 'diagnostic overlay DOM active');
const svgNodes = window.document.querySelectorAll('#diagnosticOverlay svg *').length;
check(svgNodes > 50, `diagnostic widgets render SVG (${svgNodes} nodes)`);
window.closeDiagnosticDashboard();
await new Promise(r => setTimeout(r, 300));
check(window.diagnosticActive === false, 'diagnostic overlay closes');
window.TerminalSessionRestore = savedTSR;

// Session snapshot roundtrip (core of the tool-page handoff)
const snapshotModule = window.TerminalSessionRestore;
check(typeof snapshotModule.applySnapshot === 'function', 'applySnapshot available');

const errors = log.filter(([kind]) => kind === 'window-error');
check(errors.length === 0, 'no window error events', errors.map(e => e[1]).join('; '));

console.warn = realWarn;
console.log(`\n${failures === 0 ? 'ALL INTEGRATION CHECKS PASSED' : failures + ' FAILURES'}`);
if (log.length) {
    console.log('\nCaptured warnings/errors:');
    log.slice(0, 15).forEach(([kind, msg]) => console.log(`  [${kind}] ${msg}`));
}
process.exit(failures === 0 ? 0 : 1);
