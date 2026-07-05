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

/**
 * Load the Database Studio's canonical parser/serializer block.
 *
 * The rewritten studio inlines a verbatim copy of the runtime parser inside
 * a script tag with id "studio-canonical-parser" and ends that block with a
 * CommonJS export hook, so tests can run the exact code the editor ships.
 */
export function loadFromStudio() {
    const html = fs.readFileSync(path.join(REPO_ROOT, 'database-studio.html'), 'utf8');
    const marker = '<script id="studio-canonical-parser">';
    const start = html.indexOf(marker);
    if (start < 0) throw new Error('Could not find the studio-canonical-parser block in database-studio.html');
    const end = html.indexOf('</' + 'script>', start);
    const source = html.slice(start + marker.length, end);
    const module = { exports: {} };
    // eslint-disable-next-line no-new-func
    new Function('module', 'exports', source)(module, module.exports);
    return module.exports;
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
