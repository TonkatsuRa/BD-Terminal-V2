// Exercise the site-gating logic in js/database.js:
//   - inferEntrySites(entry)        — explicit `sites` field wins, else filename prefix
//   - visibleDatabasesForSite(...)  — strict per-site gating
//   - parseFrontmatterSites(text)   — read the in-file `sites:` declaration
//
// Loads functions out of js/database.js by source-extract so tests stay
// dependency-free and always reflect what the runtime actually does.

import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, TestRunner } from './_extract.mjs';

const t = new TestRunner('Site gating');

// ---- Extract functions and constants from js/database.js ----
const dbSrc = fs.readFileSync(path.join(REPO_ROOT, 'js/database.js'), 'utf8');

function grabFunction(name) {
    const re = new RegExp(`function ${name}\\b[\\s\\S]*?\\n\\}\\n`, 'm');
    const m = dbSrc.match(re);
    if (!m) throw new Error(`Could not find function ${name} in database.js`);
    return m[0];
}
function grabConst(name) {
    const re = new RegExp(`const ${name}\\s*=\\s*[^;\\n]+;?`, 'm');
    const m = dbSrc.match(re);
    if (!m) throw new Error(`Could not find const ${name} in database.js`);
    return m[0];
}

const sandbox = `
    ${grabConst('SITE_FILENAME_PREFIX_RE')}
    ${grabConst('ALWAYS_SITE')}
    const sitesCache = new Map();
    ${grabFunction('parseFrontmatterSites')}
    ${grabFunction('inferEntrySites')}
    ${grabFunction('visibleDatabasesForSite')}
    ({ parseFrontmatterSites, inferEntrySites, visibleDatabasesForSite, ALWAYS_SITE, sitesCache });
`;
// eslint-disable-next-line no-eval
const { parseFrontmatterSites, inferEntrySites, visibleDatabasesForSite, ALWAYS_SITE, sitesCache } = (0, eval)(sandbox);

t.assertEqual(ALWAYS_SITE, 'terminal', 'ALWAYS_SITE sentinel exported as "terminal"');

// ---- inferEntrySites: explicit manifest field wins ----
{
    const sites = inferEntrySites({ file: 'BRE-01 ignored.md', sites: ['BRE-03'] });
    t.assertEqual(sites.join(','), 'BRE-03', 'explicit manifest sites overrides filename prefix');
}
{
    const sites = inferEntrySites({ file: 'whatever.md', sites: ['BRE-01', 'BRE-02'] });
    t.assertEqual(sites.join(','), 'BRE-01,BRE-02', 'multi-site manifest sites preserved');
}

// ---- inferEntrySites: filename inference ----
[
    ['Terminal ares_01_director_logbook.md', ['terminal']],
    ['BRE-01 ares_database1_metaplanar_access.md', ['BRE-01']],
    ['BRE-06 whatever.md', ['BRE-06']],
    ['database1.md', ['terminal']],
    ['ares_05_security.md', ['terminal']],
    ['ares_database1_metaplanar_access_de.md', ['terminal']],
].forEach(([file, expected]) => {
    const sites = inferEntrySites({ file });
    t.assertEqual(sites.join(','), expected.join(','), `infer from "${file}"`);
});

// ---- visibleDatabasesForSite: strict gating semantics ----
const sample = [
    { id: 'a', file: 'Terminal a.md' },
    { id: 'b', file: 'BRE-01 b.md' },
    { id: 'c', file: 'BRE-02 c.md' },
    { id: 'd', file: 'plain.md' },
    { id: 'e', file: 'irrelevant.md', sites: ['BRE-01', 'BRE-02'] },
    { id: 'f', file: 'wild.md', sites: ['*'] },
];

{
    const v = visibleDatabasesForSite(sample, '').map(e => e.id).join(',');
    t.assertEqual(v, 'a,d,f', 'no site connected -> Terminal + default + wildcard only');
}
{
    const v = visibleDatabasesForSite(sample, 'BRE-01').map(e => e.id).join(',');
    t.assertEqual(v, 'a,b,d,e,f', 'BRE-01 connected -> Terminal + BRE-01 + multi-site + wildcard');
}
{
    const v = visibleDatabasesForSite(sample, 'BRE-02').map(e => e.id).join(',');
    t.assertEqual(v, 'a,c,d,e,f', 'BRE-02 connected hides BRE-01-only');
}
{
    const v = visibleDatabasesForSite(sample, 'BRE-99').map(e => e.id).join(',');
    t.assertEqual(v, 'a,d,f', 'unknown site id -> Terminal/default/wildcard only');
}

// ---- parseFrontmatterSites: parse the in-file `sites:` declaration ----
{
    const md = '---\nid: x\ntitle: X\nsites: BRE-01\n---\n\nbody';
    t.assertEqual(parseFrontmatterSites(md)?.join(','), 'BRE-01', 'single site value');
}
{
    const md = '---\nid: x\nsites: BRE-01, BRE-03\n---\n';
    t.assertEqual(parseFrontmatterSites(md)?.join(','), 'BRE-01,BRE-03', 'comma-separated list');
}
{
    const md = '---\nid: x\nsites: [BRE-01, BRE-03]\n---\n';
    t.assertEqual(parseFrontmatterSites(md)?.join(','), 'BRE-01,BRE-03', 'YAML-array brackets stripped');
}
{
    const md = '---\nid: x\nsites: terminal\n---\n';
    t.assertEqual(parseFrontmatterSites(md)?.join(','), 'terminal', 'terminal sentinel value');
}
{
    const md = '---\nid: x\nsites: *\n---\n';
    t.assertEqual(parseFrontmatterSites(md)?.join(','), '*', 'wildcard sentinel value');
}
{
    const md = '---\nid: x\ntitle: X\n---\n\nbody';
    t.assertEqual(parseFrontmatterSites(md), null, 'no sites line -> null');
}
{
    const md = 'no frontmatter at all\nplain body\n';
    t.assertEqual(parseFrontmatterSites(md), null, 'no frontmatter at all -> null');
}
{
    const md = '---\nsites:    \n---\n';
    t.assertEqual(parseFrontmatterSites(md), null, 'empty value -> null');
}

// ---- Priority chain: manifest > cache > filename > default ----
{
    sitesCache.clear();
    sitesCache.set('demo.md', ['BRE-03']);
    const sites = inferEntrySites({ file: 'demo.md' });
    t.assertEqual(sites.join(','), 'BRE-03', 'cache beats default');
}
{
    sitesCache.clear();
    sitesCache.set('BRE-01 demo.md', ['BRE-01', 'BRE-03']);
    const sites = inferEntrySites({ file: 'BRE-01 demo.md' });
    t.assertEqual(sites.join(','), 'BRE-01,BRE-03', 'cache extends filename prefix to multi-site');
}
{
    sitesCache.clear();
    sitesCache.set('BRE-01 demo.md', ['BRE-03']);
    const sites = inferEntrySites({ file: 'BRE-01 demo.md', sites: ['BRE-05'] });
    t.assertEqual(sites.join(','), 'BRE-05', 'manifest field beats cache + filename');
}
{
    sitesCache.clear();
    const sites = inferEntrySites({ file: 'BRE-04 demo.md' });
    t.assertEqual(sites.join(','), 'BRE-04', 'filename prefix used when nothing else applies');
}
{
    sitesCache.clear();
    const sites = inferEntrySites({ file: 'demo.md' });
    t.assertEqual(sites.join(','), 'terminal', 'default ALWAYS_SITE when nothing applies');
}

// Reset cache before the real-manifest round-trip below.
sitesCache.clear();

// ---- Round-trip against the real manifest ----
{
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'databases/manifest.json'), 'utf8'));
    const all = manifest.databases;
    const totalCount = all.length;
    t.assert(totalCount === 17, `real manifest has ${totalCount} entries`);

    const noSite = visibleDatabasesForSite(all, '');
    const bre01 = visibleDatabasesForSite(all, 'BRE-01');
    const bre02 = visibleDatabasesForSite(all, 'BRE-02');

    t.assert(noSite.length <= bre01.length, 'no-site shows no more than BRE-01-connected');

    const bre01Files = all.filter(e => /^BRE-01\s/.test(e.file)).map(e => e.id);
    const noSiteIds = noSite.map(e => e.id);
    bre01Files.forEach(id => {
        t.assert(!noSiteIds.includes(id), `BRE-01 file "${id}" hidden when no site connected`);
    });

    const bre01Ids = bre01.map(e => e.id);
    bre01Files.forEach(id => {
        t.assert(bre01Ids.includes(id), `BRE-01 file "${id}" visible when connected to BRE-01`);
    });

    const bre02Ids = bre02.map(e => e.id);
    bre01Files.forEach(id => {
        t.assert(!bre02Ids.includes(id), `BRE-01 file "${id}" hidden at BRE-02`);
    });

    const terminalFiles = all.filter(e => /^Terminal\s/i.test(e.file)).map(e => e.id);
    terminalFiles.forEach(id => {
        t.assert(noSiteIds.includes(id), `Terminal file "${id}" visible with no site`);
        t.assert(bre01Ids.includes(id), `Terminal file "${id}" visible at BRE-01`);
        t.assert(bre02Ids.includes(id), `Terminal file "${id}" visible at BRE-02`);
    });
}

// ---- Live verification: the demo file declares sites: BRE-01, BRE-03 ----
// We simulate the prefetch by reading the file and populating the cache.
{
    sitesCache.clear();
    const demoFile = 'BRE-01 ares_database1_metaplanar_access.md';
    const demoText = fs.readFileSync(path.join(REPO_ROOT, 'databases', demoFile), 'utf8');
    const demoSites = parseFrontmatterSites(demoText);
    t.assert(Array.isArray(demoSites) && demoSites.length >= 2,
        `Demo file declares multi-site in frontmatter: ${JSON.stringify(demoSites)}`);
    sitesCache.set(demoFile, demoSites);

    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'databases/manifest.json'), 'utf8')).databases;
    const visibleAtBre03 = visibleDatabasesForSite(manifest, 'BRE-03').map(e => e.id);
    t.assert(visibleAtBre03.includes('ares_database1_metaplanar_access'),
        'Demo file shows up at BRE-03 thanks to frontmatter sites override');

    const visibleAtBre01 = visibleDatabasesForSite(manifest, 'BRE-01').map(e => e.id);
    t.assert(visibleAtBre01.includes('ares_database1_metaplanar_access'),
        'Demo file still shows up at BRE-01');

    sitesCache.clear();
}

t.exit();
