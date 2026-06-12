// tests/_helpers.mjs — shared test plumbing.
//
// Unlike the old test suite (which regex-extracted function bodies out of the
// runtime source), these tests import the real ES modules from js/format and
// js/core directly. Only the Database Studio editor still needs source
// extraction, because it is deliberately a standalone HTML file.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..');

/** List every .md file inside databases/. */
export function listDatabaseFiles() {
    const dir = path.join(REPO_ROOT, 'databases');
    return fs.readdirSync(dir)
        .filter(f => f.endsWith('.md'))
        .map(f => path.join(dir, f));
}

function readStudioScript() {
    const html = fs.readFileSync(path.join(REPO_ROOT, 'database-studio.html'), 'utf8');
    const match = html.match(/<script>([\s\S]+?)<\/script>/);
    if (!match) throw new Error('Could not find <script> block in database-studio.html');
    return match[1];
}

function grabFunction(source, name) {
    const re = new RegExp(`function ${name}\\b[\\s\\S]*?\\n\\}\\n`, 'm');
    const m = source.match(re);
    if (!m) throw new Error(`Could not find function ${name}`);
    return m[0];
}

function grabConst(source, name) {
    const multi = new RegExp(`const ${name}\\s*=\\s*Object\\.freeze\\(\\[[\\s\\S]*?\\]\\);`, 'm');
    const m1 = source.match(multi);
    if (m1) return m1[0];
    const single = new RegExp(`const ${name}\\s*=\\s*[^;\\n]+;?`, 'm');
    const m2 = source.match(single);
    if (m2) return m2[0];
    throw new Error(`Could not find const ${name}`);
}

/**
 * Load named functions/consts from database-studio.html's inline script into
 * a sandbox object.
 */
export function loadFromStudio(names) {
    const src = readStudioScript();
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
    // eslint-disable-next-line no-eval
    return (0, eval)(wrapped);
}

/** Tiny assertion helper: tick per pass, cross + diff per failure. */
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
