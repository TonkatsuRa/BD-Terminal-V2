// Site-gated database visibility — tested directly against the pure module
// js/format/database-format.js (inferEntrySites, visibleDatabasesForSite,
// parseFrontmatterSites).

import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, TestRunner } from './_helpers.mjs';
import {
    parseFrontmatterSites, inferEntrySites, visibleDatabasesForSite, ALWAYS_SITE
} from '../js/format/database-format.js';

const t = new TestRunner('Site gating');
const sitesCache = new Map();

t.assertEqual(ALWAYS_SITE, 'terminal', 'ALWAYS_SITE sentinel exported as "terminal"');

// ---- inferEntrySites: explicit manifest field wins ----
{
    const sites = inferEntrySites({ file: 'BRE-01 ignored.md', sites: ['BRE-03'] }, sitesCache);
    t.assertEqual(sites.join(','), 'BRE-03', 'explicit manifest sites overrides filename prefix');
}
{
    const sites = inferEntrySites({ file: 'whatever.md', sites: ['BRE-01', 'BRE-02'] }, sitesCache);
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
    const sites = inferEntrySites({ file }, sitesCache);
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

t.assertEqual(visibleDatabasesForSite(sample, '', sitesCache).map(e => e.id).join(','), 'a,d,f',
    'no site connected -> Terminal + default + wildcard only');
t.assertEqual(visibleDatabasesForSite(sample, 'BRE-01', sitesCache).map(e => e.id).join(','), 'a,b,d,e,f',
    'BRE-01 connected -> Terminal + BRE-01 + multi-site + wildcard');
t.assertEqual(visibleDatabasesForSite(sample, 'BRE-02', sitesCache).map(e => e.id).join(','), 'a,c,d,e,f',
    'BRE-02 connected hides BRE-01-only');
t.assertEqual(visibleDatabasesForSite(sample, 'BRE-99', sitesCache).map(e => e.id).join(','), 'a,d,f',
    'unknown site id -> Terminal/default/wildcard only');

// ---- parseFrontmatterSites ----
t.assertEqual(parseFrontmatterSites('---\nid: x\ntitle: X\nsites: BRE-01\n---\n\nbody')?.join(','), 'BRE-01', 'single site value');
t.assertEqual(parseFrontmatterSites('---\nid: x\nsites: BRE-01, BRE-03\n---\n')?.join(','), 'BRE-01,BRE-03', 'comma-separated list');
t.assertEqual(parseFrontmatterSites('---\nid: x\nsites: [BRE-01, BRE-03]\n---\n')?.join(','), 'BRE-01,BRE-03', 'YAML-array brackets stripped');
t.assertEqual(parseFrontmatterSites('---\nid: x\nsites: terminal\n---\n')?.join(','), 'terminal', 'terminal sentinel value');
t.assertEqual(parseFrontmatterSites('---\nid: x\nsites: *\n---\n')?.join(','), '*', 'wildcard sentinel value');
t.assertEqual(parseFrontmatterSites('---\nid: x\ntitle: X\n---\n\nbody'), null, 'no sites line -> null');
t.assertEqual(parseFrontmatterSites('no frontmatter at all\nplain body\n'), null, 'no frontmatter at all -> null');
t.assertEqual(parseFrontmatterSites('---\nsites:    \n---\n'), null, 'empty value -> null');

// ---- Priority chain: manifest > cache > filename > default ----
{
    sitesCache.clear();
    sitesCache.set('demo.md', ['BRE-03']);
    t.assertEqual(inferEntrySites({ file: 'demo.md' }, sitesCache).join(','), 'BRE-03', 'cache beats default');
}
{
    sitesCache.clear();
    sitesCache.set('BRE-01 demo.md', ['BRE-01', 'BRE-03']);
    t.assertEqual(inferEntrySites({ file: 'BRE-01 demo.md' }, sitesCache).join(','), 'BRE-01,BRE-03',
        'cache extends filename prefix to multi-site');
}
{
    sitesCache.clear();
    sitesCache.set('BRE-01 demo.md', ['BRE-03']);
    t.assertEqual(inferEntrySites({ file: 'BRE-01 demo.md', sites: ['BRE-05'] }, sitesCache).join(','), 'BRE-05',
        'manifest field beats cache + filename');
}
{
    sitesCache.clear();
    t.assertEqual(inferEntrySites({ file: 'BRE-04 demo.md' }, sitesCache).join(','), 'BRE-04',
        'filename prefix used when nothing else applies');
    t.assertEqual(inferEntrySites({ file: 'demo.md' }, sitesCache).join(','), 'terminal',
        'default ALWAYS_SITE when nothing applies');
}

sitesCache.clear();

// ---- Round-trip against the real manifest ----
{
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'databases/manifest.json'), 'utf8'));
    const all = manifest.databases;
    t.assert(all.length === 17, `real manifest has ${all.length} entries`);

    const noSite = visibleDatabasesForSite(all, '', sitesCache);
    const bre01 = visibleDatabasesForSite(all, 'BRE-01', sitesCache);
    const bre02 = visibleDatabasesForSite(all, 'BRE-02', sitesCache);

    t.assert(noSite.length <= bre01.length, 'no-site shows no more than BRE-01-connected');

    const bre01Files = all.filter(e => /^BRE-01\s/.test(e.file)).map(e => e.id);
    const noSiteIds = noSite.map(e => e.id);
    const bre01Ids = bre01.map(e => e.id);
    const bre02Ids = bre02.map(e => e.id);

    bre01Files.forEach(id => {
        t.assert(!noSiteIds.includes(id), `BRE-01 file "${id}" hidden when no site connected`);
        t.assert(bre01Ids.includes(id), `BRE-01 file "${id}" visible when connected to BRE-01`);
        t.assert(!bre02Ids.includes(id), `BRE-01 file "${id}" hidden at BRE-02`);
    });

    const terminalFiles = all.filter(e => /^Terminal\s/i.test(e.file)).map(e => e.id);
    terminalFiles.forEach(id => {
        t.assert(noSiteIds.includes(id), `Terminal file "${id}" visible with no site`);
        t.assert(bre01Ids.includes(id), `Terminal file "${id}" visible at BRE-01`);
        t.assert(bre02Ids.includes(id), `Terminal file "${id}" visible at BRE-02`);
    });
}

// ---- Live verification: demo file declares sites: BRE-01, BRE-03 ----
{
    sitesCache.clear();
    const demoFile = 'BRE-01 ares_database1_metaplanar_access.md';
    const demoText = fs.readFileSync(path.join(REPO_ROOT, 'databases', demoFile), 'utf8');
    const demoSites = parseFrontmatterSites(demoText);
    t.assert(Array.isArray(demoSites) && demoSites.length >= 2,
        `Demo file declares multi-site in frontmatter: ${JSON.stringify(demoSites)}`);
    sitesCache.set(demoFile, demoSites);

    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'databases/manifest.json'), 'utf8')).databases;
    t.assert(visibleDatabasesForSite(manifest, 'BRE-03', sitesCache).map(e => e.id).includes('ares_database1_metaplanar_access'),
        'Demo file shows up at BRE-03 thanks to frontmatter sites override');
    t.assert(visibleDatabasesForSite(manifest, 'BRE-01', sitesCache).map(e => e.id).includes('ares_database1_metaplanar_access'),
        'Demo file still shows up at BRE-01');
    sitesCache.clear();
}

t.exit();
