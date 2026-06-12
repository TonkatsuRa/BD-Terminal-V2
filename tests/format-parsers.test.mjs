// New coverage for the rebuilt format modules: entry field parsing, access
// normalization, legacy format, and the status-profile parser.

import { TestRunner } from './_helpers.mjs';
import {
    parseMarkdownDatabase, parseLegacyDatabase, normalizeEntryAccess, ENTRY_ACCESS, extractDateFromText
} from '../js/format/database-format.js';
import { parseStatusProfile, parseTerminalBlockLine, sortStatusIds } from '../js/format/status-format.js';

const t = new TestRunner('Format parsers');

// ---- markdown database parser ----
{
    const md = [
        '---',
        'id: demo-db',
        'title: Demo Database',
        'password: hunter2',
        '---',
        '',
        '## Category: ALPHA',
        '',
        '### Entry: First Entry 2084-03-14',
        'id: first-entry',
        'Keywords: one; two',
        'Clearance: 1',
        'Message:',
        'Line one.',
        'Line two.',
        '',
        '### Entry: Sealed Entry',
        'Access: Admin',
        'Message:',
        'Top secret.'
    ].join('\n');

    const parsed = parseMarkdownDatabase(md, 'demo.md');
    t.assertEqual(parsed.metadata.id, 'demo-db', 'front matter id parsed');
    t.assertEqual(parsed.metadata.password, 'hunter2', 'front matter password parsed');
    t.assertEqual(parsed.entries.length, 2, 'two entries parsed');

    const [first, sealed] = parsed.entries;
    t.assertEqual(first.id, 'first-entry', 'entry id parsed');
    t.assertEqual(first.category, 'ALPHA', 'category applied to entry');
    t.assertEqual(first.date, '2084-03-14', 'date extracted from title');
    t.assertEqual(first.tags, 'one; two', 'keywords aliased to tags');
    t.assert(first.message.includes('Line one.') && first.message.includes('Line two.'), 'multi-line body joined');
    t.assertEqual(first.access, ENTRY_ACCESS.employee, 'clearance 1 -> employee');

    t.assertEqual(sealed.access, ENTRY_ACCESS.admin, 'Access: Admin -> admin');
    t.assertEqual(sealed.confidential, true, 'admin entries flagged confidential');
}

// HTML comments are stripped before parsing.
{
    const md = '### Entry: X\nMessage:\nvisible <!-- hidden --> text\n<!-- whole\nline -->\nend';
    const parsed = parseMarkdownDatabase(md);
    t.assert(!parsed.entries[0].message.includes('hidden'), 'inline HTML comment stripped');
    t.assert(parsed.entries[0].message.includes('visible'), 'surrounding text kept');
}

// ---- access normalization ----
[
    ['Admin', ENTRY_ACCESS.admin],
    ['full', ENTRY_ACCESS.admin],
    ['Elevated', ENTRY_ACCESS.elevated],
    ['shareholder', ENTRY_ACCESS.elevated],
    ['restricted', ENTRY_ACCESS.elevated],
    ['Employee', ENTRY_ACCESS.employee],
    ['public', ENTRY_ACCESS.employee],
    ['', ENTRY_ACCESS.employee],
].forEach(([raw, expected]) => {
    t.assertEqual(normalizeEntryAccess(raw), expected, `normalizeEntryAccess("${raw}") -> ${expected}`);
});
t.assertEqual(normalizeEntryAccess('', { clearance: '4' }), ENTRY_ACCESS.admin, 'clearance 4 -> admin');
t.assertEqual(normalizeEntryAccess('', { clearance: '3' }), ENTRY_ACCESS.elevated, 'clearance 3 -> elevated');
t.assertEqual(normalizeEntryAccess('', { category: 'CONFIDENTIAL' }), ENTRY_ACCESS.admin, 'CONFIDENTIAL category -> admin');

// ---- legacy database format ----
{
    const legacy = 'ALPHA: First Title | Body text here\n\nCONFIDENTIAL: Sealed | Secret body';
    const parsed = parseLegacyDatabase(legacy, 'legacy.txt');
    t.assertEqual(parsed.entries.length, 2, 'legacy entries parsed');
    t.assertEqual(parsed.entries[0].category, 'ALPHA', 'legacy category parsed');
    t.assertEqual(parsed.entries[0].message, 'Body text here', 'legacy body parsed');
    t.assertEqual(parsed.entries[1].access, ENTRY_ACCESS.admin, 'legacy CONFIDENTIAL -> admin');
}

// ---- date extraction ----
t.assertEqual(extractDateFromText('Report 2084.03.14 final'), '2084-03-14', 'dotted date normalized');
t.assertEqual(extractDateFromText('No date here'), '', 'no date -> empty');

// ---- status profile parser ----
{
    const profile = parseStatusProfile([
        '[diagnostic.network]',
        'state = warn',
        'level = 62',
        '',
        '## facility.grid',
        'power: 61',
        '',
        '# a comment',
        '- bullet = 5',
        '```',
        'plain line',
        '@amber colored line',
        '```'
    ].join('\n'), 'test');

    t.assertEqual(profile.loaded, true, 'profile loaded');
    t.assertEqual(profile.values['diagnostic.network.state'], 'warn', 'INI section key parsed');
    t.assertEqual(profile.values['diagnostic.network.level'], '62', 'numeric value parsed as string');
    t.assertEqual(profile.values['facility.grid.power'], '61', 'markdown heading section + colon separator');
    t.assertEqual(profile.values['facility.grid.bullet'], '5', 'bullet prefix stripped');
    t.assertEqual(profile.values['facility.grid.line1'], 'plain line', 'fenced block line 1');
    t.assertEqual(profile.values['facility.grid.line2'], 'colored line', 'fenced block @color text');
    t.assertEqual(profile.values['facility.grid.class2'], 't-amber', 'fenced block @color class');
}
{
    t.assertEqual(parseStatusProfile('').loaded, false, 'empty content -> not loaded');
    const block = parseTerminalBlockLine('@red ALERT TEXT');
    t.assertEqual(block.className, 't-red', '@red maps to t-red');
    t.assertEqual(block.text, 'ALERT TEXT', '@red strips the tag');
    const plain = parseTerminalBlockLine('@unknown stays');
    t.assertEqual(plain.className, '', 'unknown @tag keeps line as plain');
}

// ---- sortStatusIds ----
t.assertEqual(['10', '2', '1'].sort(sortStatusIds).join(','), '1,2,10', 'numeric ids sort numerically');
t.assertEqual(['b', 'a'].sort(sortStatusIds).join(','), 'a,b', 'non-numeric ids sort lexically');

t.exit();
