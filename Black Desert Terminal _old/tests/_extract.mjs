// _extract.mjs — pull canonical function bodies out of the source files so
// the test scripts can exercise them without maintaining a parallel copy.
//
// The studio editor (database-studio.html) is a self-contained HTML file with
// its parser/serializer inside an inline <script> block. js/utils.js holds
// the shared constants (TERMINAL_COLOR_NAMES, IMG_LINE_RE, etc.) and helper
// functions used across the runtime.
//
// We extract by source regex rather than by parsing/AST so the tests stay
// dependency-free.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..');

function readStudioScript() {
    const html = fs.readFileSync(path.join(REPO_ROOT, 'database-studio.html'), 'utf8');
    const match = html.match(/<script>([\s\S]+?)<\/script>/);
    if (!match) throw new Error('Could not find <script> block in database-studio.html');
    return match[1];
}

function readUtilsSource() {
    return fs.readFileSync(path.join(REPO_ROOT, 'js/utils.js'), 'utf8');
}

// Extract a top-level function body by its name. Matches "function NAME(...)"
// through the matching closing brace at column 0 (which is how the codebase
// formats its top-level functions).
function grabFunction(source, name) {
    const re = new RegExp(`function ${name}\\b[\\s\\S]*?\\n\\}\\n`, 'm');
    const m = source.match(re);
    if (!m) throw new Error(`Could not find function ${name}`);
    return m[0];
}

// Extract a top-level "const NAME = ..." declaration. Handles simple single-
// line assignments and Object.freeze(...) blocks.
function grabConst(source, name) {
    // Try multi-line Object.freeze first
    const multi = new RegExp(`const ${name}\\s*=\\s*Object\\.freeze\\(\\[[\\s\\S]*?\\]\\);`, 'm');
    const m1 = source.match(multi);
    if (m1) return m1[0];
    // Otherwise a single-line const (regex, string, number, etc.)
    const single = new RegExp(`const ${name}\\s*=\\s*[^;\\n]+;?`, 'm');
    const m2 = source.match(single);
    if (m2) return m2[0];
    throw new Error(`Could not find const ${name}`);
}

/**
 * Load the named functions and constants from database-studio.html's inline
 * script, eval them into a fresh sandbox object, and return that object.
 *
 * @param {string[]} names - function and/or const names to expose
 * @returns {Object} { [name]: <function or value>, ... }
 */
export function loadFromStudio(names) {
    const src = readStudioScript();
    const wantList = Array.isArray(names) ? names : [names];
    const pieces = [];
    const exposes = [];
    for (const n of wantList) {
        // Try function first; fall back to const.
        let chunk;
        try { chunk = grabFunction(src, n); }
        catch { chunk = grabConst(src, n); }
        pieces.push(chunk);
        exposes.push(`__out.${n} = ${n};`);
    }
    const wrapped = `
        const __out = {};
        ${pieces.join('\n')}
        ${exposes.join('\n')}
        __out;
    `;
    // eslint-disable-next-line no-eval
    return (0, eval)(wrapped);
}

/**
 * Load the named functions and constants from js/utils.js into a fresh
 * sandbox object and return it.
 */
export function loadFromUtils(names) {
    const src = readUtilsSource();
    const wantList = Array.isArray(names) ? names : [names];
    const pieces = [];
    const exposes = [];
    for (const n of wantList) {
        let chunk;
        try { chunk = grabFunction(src, n); }
        catch { chunk = grabConst(src, n); }
        pieces.push(chunk);
        exposes.push(`__out.${n} = ${n};`);
    }
    const wrapped = `
        const __out = {};
        ${pieces.join('\n')}
        ${exposes.join('\n')}
        __out;
    `;
    return (0, eval)(wrapped);
}

/**
 * List every .md file inside databases/.
 */
export function listDatabaseFiles() {
    const dir = path.join(REPO_ROOT, 'databases');
    return fs.readdirSync(dir)
        .filter(f => f.endsWith('.md'))
        .map(f => path.join(dir, f));
}

/**
 * Tiny assertion helper. Prints a tick for OK, prints a cross + diff for
 * failure, and tracks failure count.
 */
export class TestRunner {
    constructor(name) {
        this.name = name;
        this.passed = 0;
        this.failed = 0;
        console.log(`\n=== ${name} ===\n`);
    }
    ok(label) {
        this.passed++;
        console.log(`  ✓ ${label}`);
    }
    fail(label, detail = '') {
        this.failed++;
        console.log(`  ✗ ${label}`);
        if (detail) console.log(`      ${detail}`);
    }
    assert(condition, label, detail = '') {
        if (condition) this.ok(label);
        else this.fail(label, detail);
    }
    assertEqual(actual, expected, label) {
        if (actual === expected) this.ok(label);
        else this.fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
    summary() {
        const total = this.passed + this.failed;
        console.log(`\n${this.name}: ${this.passed}/${total} passed${this.failed ? `, ${this.failed} FAILED` : ''}`);
        return this.failed === 0;
    }
    exit() {
        process.exit(this.summary() ? 0 : 1);
    }
}
