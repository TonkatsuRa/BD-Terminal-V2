// Round-trip every databases/*.md through the studio's parse → serialize →
// parse cycle, and cross-check the runtime parser (js/format/database-format.js)
// against the studio parser so the two implementations cannot drift apart.
// (tests/editor-conformance.test.mjs goes deeper — full-field identity — this
// suite keeps the fast structural checks plus markup-survival cases.)

import fs from 'node:fs';
import { loadFromStudio, listDatabaseFiles, TestRunner } from './_helpers.mjs';
import { parseMarkdownDatabase } from '../js/format/database-format.js';

const t = new TestRunner('Database round-trip');

const studio = loadFromStudio();
t.assert(typeof studio.parseMarkdownDatabase === 'function', 'studio exposes parseMarkdownDatabase');
t.assert(typeof studio.serializeDatabase === 'function', 'studio exposes serializeDatabase');

const files = listDatabaseFiles();
t.assert(files.length > 0, `Found ${files.length} database file(s) under databases/`);

for (const file of files) {
    const name = file.split(/[\\/]/).pop();
    const text = fs.readFileSync(file, 'utf8');
    const parsed = studio.parseMarkdownDatabase(text, name);

    if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) {
        t.fail(`${name}: no entries parsed`);
        continue;
    }

    // Cross-parser equivalence: byte-identical parse output.
    const runtime = parseMarkdownDatabase(text, name);
    t.assertEqual(
        JSON.stringify(runtime),
        JSON.stringify(parsed),
        `${name}: runtime and studio parsers agree exactly (${parsed.entries.length} entries)`
    );

    // Serialize → re-parse (both parsers must read the studio's output).
    const serialized = studio.serializeDatabase(parsed);
    const reparsed = studio.parseMarkdownDatabase(serialized, name);

    t.assertEqual(reparsed.metadata.id, parsed.metadata.id, `${name}: id round-trips`);
    t.assertEqual(reparsed.metadata.title, parsed.metadata.title, `${name}: title round-trips`);
    t.assertEqual(reparsed.metadata.password, parsed.metadata.password, `${name}: password round-trips`);
    t.assertEqual(
        reparsed.entries.length,
        parsed.entries.length,
        `${name}: entry count preserved (${parsed.entries.length} entries)`
    );

    const cats1 = new Set(parsed.entries.map(e => e.category));
    const cats2 = new Set(reparsed.entries.map(e => e.category));
    t.assertEqual(
        Array.from(cats1).sort().join('|'),
        Array.from(cats2).sort().join('|'),
        `${name}: category set preserved`
    );

    const runtimeReparsed = parseMarkdownDatabase(serialized, name);
    t.assertEqual(
        runtimeReparsed.entries.length,
        parsed.entries.length,
        `${name}: runtime parser reads studio-serialized output`
    );
}

// Inject a colored passage and an embedded image into a body to confirm the
// markup survives serialization.
{
    const name = files[0].split(/[\\/]/).pop();
    const text = fs.readFileSync(files[0], 'utf8');
    const parsed = studio.parseMarkdownDatabase(text, name);
    parsed.entries[0].message = [
        '[color=amber]ALERT[/color]',
        '',
        parsed.entries[0].message,
        '',
        '![tiny](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=)',
        '',
        '[color=red]REDACTED[/color]',
    ].join('\n');
    const serialized = studio.serializeDatabase(parsed);
    const reparsed = studio.parseMarkdownDatabase(serialized, name);
    const body = reparsed.entries[0].message;
    t.assert(body.includes('[color=amber]ALERT[/color]'), 'color tag survives round-trip');
    t.assert(body.includes('[color=red]REDACTED[/color]'), 'second color tag survives round-trip');
    t.assert(/!\[tiny\]\(data:image\/png;base64,/.test(body), 'embedded image survives round-trip');
}

t.exit();
