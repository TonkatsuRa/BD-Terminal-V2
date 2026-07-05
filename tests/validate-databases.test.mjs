// tests/validate-databases.test.mjs — content lint for databases/*.md and the
// manifest chain. Run before shipping new lore entries.
//
// Checks:
//   [1] every file parses, frontmatter complete, ids/titles unique
//   [2] entry hygiene: topics, dates, keywords, color tags, image lines
//   [3] manifest.json ↔ files on disk ↔ FALLBACK_DATABASE_MANIFEST in
//       js/features/database.js agree (ids, files, effective site gating)

import fs from 'node:fs';
import path from 'node:path';
import { listDatabaseFiles, TestRunner, REPO_ROOT } from './_helpers.mjs';
import {
    parseMarkdownDatabase, parseFrontmatterSites, inferEntrySites
} from '../js/format/database-format.js';

const t = new TestRunner('Database content validation');
const KNOWN_SITES = ['terminal', '*', 'BRE-01', 'BRE-02', 'BRE-03', 'BRE-04', 'BRE-05', 'BRE-06'];

/* ---------- [1] + [2] per-file checks ---------- */
const files = listDatabaseFiles();
t.assert(files.length > 0, `found ${files.length} database files`);
const seenIds = new Map();
const seenTitles = new Map();
const parsedByName = new Map();

for (const file of files) {
    const name = path.basename(file);
    const text = fs.readFileSync(file, 'utf8');
    const parsed = parseMarkdownDatabase(text, name);
    parsedByName.set(name, { parsed, text });
    const issues = [];

    // frontmatter
    for (const key of ['id', 'title', 'password', 'description']) {
        if (!String(parsed.metadata[key] || '').trim()) issues.push(`missing frontmatter ${key}`);
    }
    const id = String(parsed.metadata.id || '').trim();
    if (id) {
        if (seenIds.has(id)) issues.push(`id "${id}" already used by ${seenIds.get(id)}`);
        seenIds.set(id, name);
    }
    const title = String(parsed.metadata.title || '').trim();
    if (title) {
        if (seenTitles.has(title)) issues.push(`title "${title}" already used by ${seenTitles.get(title)}`);
        seenTitles.set(title, name);
    }

    // sites sanity (frontmatter + filename prefix)
    const fmSites = parseFrontmatterSites(text) || [];
    fmSites.forEach(site => {
        if (!KNOWN_SITES.includes(site)) issues.push(`unknown site "${site}" in frontmatter`);
    });
    const prefix = (name.match(/^(BRE-\d{2})\s/) || [])[1];
    if (prefix && fmSites.length && !fmSites.includes(prefix) && !fmSites.includes('*')) {
        issues.push(`filename prefix ${prefix} not covered by frontmatter sites [${fmSites.join(', ')}]`);
    }
    if (!prefix && !/^Terminal\s/i.test(name)) {
        issues.push('filename lacks "Terminal " or "BRE-xx " prefix (gating falls back to always-visible)');
    }

    // entries
    if (!parsed.entries.length) issues.push('no entries');
    const topicsInCat = new Set();
    parsed.entries.forEach((entry, index) => {
        const where = `entry ${index + 1} ("${entry.topic}")`;
        if (!String(entry.topic || '').trim() || entry.topic === 'Untitled Entry') issues.push(`${where}: missing topic`);
        const topicKey = `${entry.category}//${String(entry.topic).toLowerCase()}`;
        if (topicsInCat.has(topicKey)) issues.push(`${where}: duplicate topic in category ${entry.category}`);
        topicsInCat.add(topicKey);
        const date = String(entry.date || '').trim();
        if (date && !/^20\d{2}-\d{2}-\d{2}$/.test(date)) issues.push(`${where}: date "${date}" not YYYY-MM-DD`);
        if (!String(entry.keywords || '').trim()) issues.push(`${where}: no keywords (invisible to /SEARCH)`);
        const opens = (entry.message.match(/\[color=[a-z]+\]/gi) || []).length;
        const closes = (entry.message.match(/\[\/color\]/gi) || []).length;
        if (opens !== closes) issues.push(`${where}: unbalanced color tags (${opens} open / ${closes} close)`);
        (entry.message.match(/\[color=([a-z]+)\]/gi) || []).forEach(tag => {
            const colorName = tag.replace(/\[color=|\]/gi, '').toLowerCase();
            if (!['green', 'amber', 'cyan', 'red', 'magenta', 'dim', 'bright'].includes(colorName)) {
                issues.push(`${where}: unknown color "${colorName}"`);
            }
        });
        entry.message.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (/^!\[/.test(trimmed) && !/^!\[[^\]]*\]\(data:image\//i.test(trimmed)) {
                issues.push(`${where}: image line must embed a data:image/… URL`);
            }
        });
    });

    t.assert(!issues.length, `${name} (${parsed.entries.length} entries)`, issues.slice(0, 6).join('; '));
}

/* ---------- [3] manifest chain consistency ---------- */
const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'databases/manifest.json'), 'utf8')).databases;
t.assert(Array.isArray(manifest) && manifest.length > 0, `manifest.json lists ${manifest.length} databases`);

// every manifest entry points at a real file; every disk file is listed
const manifestFiles = new Set(manifest.map(item => item.file));
const diskFiles = new Set(files.map(f => path.basename(f)));
const missingOnDisk = [...manifestFiles].filter(f => !diskFiles.has(f));
const unlisted = [...diskFiles].filter(f => !manifestFiles.has(f));
t.assert(!missingOnDisk.length, 'every manifest file exists on disk', missingOnDisk.join(', '));
t.assert(!unlisted.length, 'every databases/*.md is listed in manifest.json', unlisted.join(', '));

// manifest ids unique and matching frontmatter ids is NOT required (manifest
// ids are separate), but manifest ids must be unique among themselves.
const manifestIds = manifest.map(item => item.id);
t.assert(new Set(manifestIds).size === manifestIds.length, 'manifest ids are unique');

// FALLBACK_DATABASE_MANIFEST in js/features/database.js mirrors manifest.json
const featureSrc = fs.readFileSync(path.join(REPO_ROOT, 'js/features/database.js'), 'utf8');
const fallbackMatch = featureSrc.match(/const FALLBACK_DATABASE_MANIFEST = (\[[\s\S]*?\n\]);/);
t.assert(Boolean(fallbackMatch), 'found FALLBACK_DATABASE_MANIFEST in js/features/database.js');
if (fallbackMatch) {
    // eslint-disable-next-line no-new-func
    const fallback = new Function('return ' + fallbackMatch[1])();
    const fbFiles = new Set(fallback.map(item => item.file));
    const onlyInManifest = manifest.filter(i => !fbFiles.has(i.file)).map(i => i.file);
    const onlyInFallback = fallback.filter(i => !manifestFiles.has(i.file)).map(i => i.file);
    t.assert(!onlyInManifest.length, 'fallback covers every manifest file', onlyInManifest.join(', '));
    t.assert(!onlyInFallback.length, 'fallback lists no phantom files', onlyInFallback.join(', '));

    // Effective site gating must agree between the two manifest sources.
    // Effective sites = explicit sites > frontmatter sites > filename prefix.
    const sitesCache = new Map();
    for (const [name, { text }] of parsedByName) {
        sitesCache.set(name, parseFrontmatterSites(text));
    }
    const effective = item => inferEntrySites(item, sitesCache).slice().sort().join('|');
    const mismatches = [];
    manifest.forEach(mItem => {
        const fItem = fallback.find(i => i.file === mItem.file);
        if (!fItem) return;
        if (effective(mItem) !== effective(fItem)) {
            mismatches.push(`${mItem.file}: manifest→[${effective(mItem)}] fallback→[${effective(fItem)}]`);
        }
    });
    t.assert(!mismatches.length, 'effective site gating identical for manifest.json and fallback', mismatches.join('; '));
}

t.exit();
