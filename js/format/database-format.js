// js/format/database-format.js — THE canonical database file parser.
// Pure module (no DOM): imported by the browser runtime AND the Node test
// scripts, so there is exactly one parser implementation in the project.
// The standalone Database Studio editor keeps a deliberate inline copy
// (database-studio.html must stay double-clickable) — keep behavior in sync.
//
// File format (YAML-ish front matter + "## Category:" + "### Entry:" blocks)
// is documented in AGENTS.md.

import { normalizeStatusKey, cleanStatusValue } from '../core/utils.js';

// Access level strings — duplicated as plain constants so this module stays
// dependency-light and Node-safe. Must match core/state.js ACCESS_LEVELS.
export const ENTRY_ACCESS = Object.freeze({
    employee: 'employee',
    elevated: 'elevated',
    admin: 'admin'
});

/**
 * Normalize an entry's access/clearance declaration to one of ENTRY_ACCESS.
 * Accepts labels ("Admin", "restricted", "shareholder"), numeric clearance
 * levels, and the CONFIDENTIAL category convention.
 */
export function normalizeEntryAccess(value, entry = {}) {
    const raw = String(value || '').trim().toLowerCase();
    const clearance = Number.parseInt(entry.clearance || value || '0', 10);
    const category = String(entry.category || '').trim().toLowerCase();

    if (raw === ENTRY_ACCESS.admin || raw.includes('admin') || raw.includes('full')) return ENTRY_ACCESS.admin;
    if (raw === ENTRY_ACCESS.elevated || raw.includes('elevated') || raw.includes('shareholder')) return ENTRY_ACCESS.elevated;
    if (raw === ENTRY_ACCESS.employee || raw.includes('employee') || raw.includes('cleared') || raw.includes('public')) return ENTRY_ACCESS.employee;
    if (raw.includes('confidential') || category === 'confidential' || clearance >= 4) return ENTRY_ACCESS.admin;
    if (raw.includes('restricted') || clearance >= 3) return ENTRY_ACCESS.elevated;
    return ENTRY_ACCESS.employee;
}

/** Extract the first in-world date (20xx-xx-xx with -, . or / separators). */
export function extractDateFromText(value) {
    const match = String(value || '').match(/\b(20\d{2}|207\d|208\d)[-./]\d{2}[-./]\d{2}\b/);
    return match ? match[0].replace(/[./]/g, '-') : '';
}

/** Parse simple `key: value` metadata lines (front matter body). */
export function parseSimpleMetadata(lines) {
    const values = {};
    lines.forEach(line => {
        const pair = line.match(/^([a-z0-9_.-]+)\s*:\s*(.*)$/i);
        if (pair) values[normalizeStatusKey(pair[1])] = cleanStatusValue(pair[2]);
    });
    return values;
}

/**
 * Parse a markdown database file.
 *
 * @param {string} content - raw file text
 * @param {string} [source] - display name for error messages / metadata
 * @returns {{source: string, metadata: Object, entries: Array<Object>}}
 */
export function parseMarkdownDatabase(content, source = 'Markdown database') {
    const clean = String(content || '')
        .replace(/\r/g, '')
        .replace(/<!--[\s\S]*?-->/g, '');
    const lines = clean.split('\n');
    const metadataLines = [];
    let startIndex = 0;
    if (lines[0]?.trim() === '---') {
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() === '---') {
                startIndex = i + 1;
                break;
            }
            metadataLines.push(lines[i]);
        }
    }
    const metadata = parseSimpleMetadata(metadataLines);
    const entries = [];
    let category = '';
    let current = null;
    let bodyMode = false;

    function createEmptyEntry(title = '') {
        return {
            id: '',
            title,
            topic: title,
            idOrPerson: '',
            date: extractDateFromText(title),
            access: '',
            category,
            tags: '',
            keywords: '',
            clearance: '1',
            related: '',
            redacted: '',
            bodyLines: []
        };
    }

    function finishEntry() {
        if (!current) return;
        current.topic = current.topic || current.title || current.idOrPerson || current.id || 'Untitled Entry';
        current.title = current.topic;
        current.idOrPerson = current.idOrPerson || current.person || current.subject || current.id || '';
        if (!current.id && current.idOrPerson) current.id = current.idOrPerson;
        current.date = current.date || extractDateFromText(current.topic);
        current.category = String(current.category || category || 'GENERAL').trim().toUpperCase();
        if (!current.tags && current.keywords) current.tags = current.keywords;
        if (!current.keywords && current.tags) current.keywords = current.tags;
        current.access = normalizeEntryAccess(current.access || current.clearance, current);
        current.message = current.bodyLines.join('\n').trim();
        if (current.related) current.message += `${current.message ? '\n' : ''}Related: ${current.related}`;
        if (current.redacted) current.message += `${current.message ? '\n' : ''}Redacted note: ${current.redacted}`;
        if (!current.message) current.message = 'NO MESSAGE TEXT AVAILABLE.';
        current.content = current.message;
        current.confidential = current.access === ENTRY_ACCESS.admin;
        delete current.bodyLines;
        entries.push(current);
        current = null;
        bodyMode = false;
    }

    for (let i = startIndex; i < lines.length; i++) {
        const raw = lines[i];
        const line = raw.trim();
        if (!line) {
            if (bodyMode && current) current.bodyLines.push('');
            continue;
        }

        if (current && line === '---') {
            finishEntry();
            continue;
        }

        const categoryMatch = line.match(/^##\s+Category\s*:\s*(.+)$/i);
        if (categoryMatch) {
            finishEntry();
            category = categoryMatch[1].trim().toUpperCase();
            continue;
        }

        const entryMatch = line.match(/^###\s+(?:Entry\s*:\s*)?(.+)$/i);
        if (entryMatch) {
            finishEntry();
            current = createEmptyEntry(entryMatch[1].trim());
            bodyMode = false;
            continue;
        }

        const pair = line.match(/^([^:]+)\s*:\s*(.*)$/);
        if (pair && bodyMode && current) {
            // A new "Topic:"-style key inside a body starts the next entry.
            const bodyKey = normalizeStatusKey(pair[1]);
            if (['topic', 'title', 'entry'].includes(bodyKey)) {
                finishEntry();
                current = createEmptyEntry(cleanStatusValue(pair[2]));
                bodyMode = false;
                continue;
            }
        }
        if (pair && !bodyMode) {
            const key = normalizeStatusKey(pair[1]);
            const value = cleanStatusValue(pair[2]);
            if (!current && ['topic', 'title', 'id', 'id_or_person', 'person', 'entry'].includes(key)) current = createEmptyEntry();
            if (!current) continue;

            if (['body', 'content', 'message', 'text'].includes(key)) {
                if (value) current.bodyLines.push(value);
                bodyMode = true;
                continue;
            }
            if (key === 'topic' || key === 'title' || key === 'entry') {
                current.topic = value;
                current.title = value;
                if (!current.date) current.date = extractDateFromText(value);
            } else if (key === 'id_or_person' || key === 'person' || key === 'subject') {
                current.idOrPerson = value;
            } else if (key === 'id') {
                current.id = value;
                if (!current.idOrPerson) current.idOrPerson = value;
            } else if (key === 'date') {
                current.date = value;
            } else if (key === 'access') {
                current.access = normalizeEntryAccess(value, current);
            } else if (key === 'keywords' || key === 'tags') {
                current.keywords = value;
                current.tags = value;
            } else if (key === 'clearance_level' || key === 'clearance') {
                current.clearance = value;
                current.access = normalizeEntryAccess(value, current);
            } else if (key === 'category') {
                current.category = value;
            } else {
                // Unknown keys are preserved so round-tripping never loses fields.
                current[key] = value;
            }
            continue;
        }

        if (!current) continue;
        current.bodyLines.push(raw.replace(/^\s{0,4}/, ''));
    }
    finishEntry();

    entries.forEach(entry => {
        entry.access = normalizeEntryAccess(entry.access, entry);
        entry.confidential = entry.access === ENTRY_ACCESS.admin;
    });

    return { source, metadata, entries };
}

/**
 * Parse the legacy "CATEGORY: Title | body" double-newline-separated format.
 */
export function parseLegacyDatabase(content, source = 'Legacy database') {
    const entriesOut = [];
    String(content || '').split('\n\n').forEach(block => {
        const entry = block.trim();
        if (!entry) return;
        const colonIdx = entry.indexOf(':');
        if (colonIdx < 0) return;
        const category = entry.substring(0, colonIdx).trim();
        const rest = entry.substring(colonIdx + 1);
        const pipeIdx = rest.indexOf('|');
        if (pipeIdx < 0) return;
        const title = rest.substring(0, pipeIdx).trim();
        const entryContent = rest.substring(pipeIdx + 1).trim();
        const parsedEntry = {
            id: title.toLowerCase().replace(/\s+/g, '-'),
            idOrPerson: title,
            topic: title,
            title,
            date: extractDateFromText(title),
            category,
            access: category === 'CONFIDENTIAL' ? ENTRY_ACCESS.admin : ENTRY_ACCESS.employee,
            keywords: category,
            tags: category,
            message: entryContent,
            content: entryContent
        };
        parsedEntry.confidential = parsedEntry.access === ENTRY_ACCESS.admin;
        entriesOut.push(parsedEntry);
    });
    return {
        source,
        metadata: {
            title: source,
            id: source.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        },
        entries: entriesOut
    };
}

/* ------------------------------------------------------------------ *
 * Site-gated visibility (pure logic; the fetch cache lives in the
 * browser feature module and is passed in as `sitesCache`)
 * ------------------------------------------------------------------ */

// Pattern for canonical site ids at the start of a filename: "BRE-01 ...".
export const SITE_FILENAME_PREFIX_RE = /^(BRE-\d{2})\s/;
// Sentinel meaning "always available regardless of connected site".
export const ALWAYS_SITE = 'terminal';

/**
 * Compute the sites at which a manifest entry is visible.
 * Priority: manifest.sites > cached frontmatter sites > filename prefix > default.
 * @param {Object} entry - manifest entry ({file, sites?, ...})
 * @param {Map<string, string[]|null>} [sitesCache] - filename → frontmatter sites
 * @returns {string[]}
 */
export function inferEntrySites(entry, sitesCache) {
    if (Array.isArray(entry?.sites) && entry.sites.length) {
        return entry.sites.map(s => String(s));
    }
    const file = String(entry?.file || '');
    const cached = sitesCache?.get?.(file);
    if (Array.isArray(cached) && cached.length) return cached;
    if (/^Terminal\s/i.test(file)) return [ALWAYS_SITE];
    const m = file.match(SITE_FILENAME_PREFIX_RE);
    if (m) return [m[1]];
    return [ALWAYS_SITE];
}

/**
 * Filter a manifest to entries visible at the connected site. Strict gating:
 * an empty site id collapses to ALWAYS_SITE entries only; "*" is wildcard.
 * @param {Array<Object>} manifest
 * @param {string} connectedSiteId - e.g. "BRE-01" or "" when disconnected
 * @param {Map<string, string[]|null>} [sitesCache]
 * @returns {Array<Object>}
 */
export function visibleDatabasesForSite(manifest, connectedSiteId, sitesCache) {
    const list = Array.isArray(manifest) ? manifest : [];
    const current = String(connectedSiteId || '').trim();
    return list.filter(entry => {
        const sites = inferEntrySites(entry, sitesCache);
        if (sites.includes('*')) return true;
        if (sites.includes(ALWAYS_SITE)) return true;
        return current && sites.includes(current);
    });
}

/**
 * Parse a `sites:` line from the front matter of a database .md file.
 * Accepts comma-separated values with optional [ ] brackets.
 * Returns null when no sites: line is present or its value is empty.
 */
export function parseFrontmatterSites(text) {
    const src = String(text || '');
    if (!/^---\s*\n/.test(src)) return null;
    const end = src.indexOf('\n---', 4);
    if (end < 0) return null;
    const block = src.slice(0, end);
    const m = block.match(/^\s*sites\s*:\s*(.+?)\s*$/im);
    if (!m) return null;
    const raw = m[1].replace(/^\[|\]$/g, '').trim();
    if (!raw) return null;
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    return parts.length ? parts : null;
}
