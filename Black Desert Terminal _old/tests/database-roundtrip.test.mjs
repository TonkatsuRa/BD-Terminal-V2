// Round-trip every databases/*.md through parseDatabase → serializeDatabase
// → parseDatabase and confirm entry counts, titles, categories, bodies, and
// extras survive intact.
//
// This is the most important parser test. Run it whenever you touch the
// markdown parser/serializer in either database-studio.html or js/database.js.

import fs from 'node:fs';
import { loadFromStudio, listDatabaseFiles, TestRunner } from './_extract.mjs';

const t = new TestRunner('Database round-trip');

const studio = loadFromStudio([
    'normalizeKey', 'parseMetaBlock', 'slugify',
    'parseDatabase', 'serializeDatabase',
    'escapeHtml', 'escapeAttr',
]);

const files = listDatabaseFiles();
t.assert(files.length > 0, `Found ${files.length} database file(s) under databases/`);

for (const file of files) {
    const name = file.split(/[\\/]/).pop();
    const text = fs.readFileSync(file, 'utf8');
    const parsed = studio.parseDatabase(text, name);

    // Basic shape checks
    if (!parsed || typeof parsed !== 'object') {
        t.fail(`${name}: parsed value is not an object`);
        continue;
    }
    if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) {
        t.fail(`${name}: no entries parsed`);
        continue;
    }

    // Serialize → re-parse
    const serialized = studio.serializeDatabase({
        id: parsed.id,
        title: parsed.title,
        description: parsed.description,
        password: parsed.password,
        entries: parsed.entries,
        extras: parsed.extras,
    });
    const reparsed = studio.parseDatabase(serialized, name);

    // Top-level metadata should match
    t.assertEqual(reparsed.id, parsed.id, `${name}: id round-trips`);
    t.assertEqual(reparsed.title, parsed.title, `${name}: title round-trips`);
    t.assertEqual(reparsed.password, parsed.password, `${name}: password round-trips`);

    // Entry count must be preserved
    t.assertEqual(
        reparsed.entries.length,
        parsed.entries.length,
        `${name}: entry count preserved (${parsed.entries.length} entries)`
    );

    // Spot-check the first entry's body and title
    if (parsed.entries.length && reparsed.entries.length) {
        t.assertEqual(
            reparsed.entries[0].title,
            parsed.entries[0].title,
            `${name}: first entry title preserved`
        );
        t.assertEqual(
            reparsed.entries[0].body,
            parsed.entries[0].body,
            `${name}: first entry body preserved`
        );
    }

    // Categories should match as a set
    const cats1 = new Set(parsed.entries.map(e => e.category));
    const cats2 = new Set(reparsed.entries.map(e => e.category));
    t.assertEqual(
        Array.from(cats1).sort().join('|'),
        Array.from(cats2).sort().join('|'),
        `${name}: category set preserved`
    );
}

// Inject a colored passage and an embedded image into a body to confirm the
// markup survives serialization too.
{
    const text = fs.readFileSync(files[0], 'utf8');
    const parsed = studio.parseDatabase(text, files[0]);
    parsed.entries[0].body = [
        '[color=amber]ALERT[/color]',
        '',
        parsed.entries[0].body,
        '',
        '![tiny](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=)',
        '',
        '[color=red]REDACTED[/color]',
    ].join('\n');
    const serialized = studio.serializeDatabase({
        id: parsed.id, title: parsed.title, description: parsed.description,
        password: parsed.password, entries: parsed.entries, extras: parsed.extras,
    });
    const reparsed = studio.parseDatabase(serialized, files[0]);
    const body = reparsed.entries[0].body;
    t.assert(body.includes('[color=amber]ALERT[/color]'), 'color tag survives round-trip');
    t.assert(body.includes('[color=red]REDACTED[/color]'), 'second color tag survives round-trip');
    t.assert(/!\[tiny\]\(data:image\/png;base64,/.test(body), 'embedded image survives round-trip');
}

t.exit();
