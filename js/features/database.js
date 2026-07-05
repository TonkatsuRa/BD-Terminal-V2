// js/features/database.js — database slots, search, entry rendering, the
// LOAD DATABASE modal, file/ZIP/.dat loading, and site-gated visibility.
// Parsing itself lives in js/format/database-format.js (shared with tests).

import { getById, el } from '../core/dom.js';
import { compactText, normalizeSearchText, normalizeStatusKey, IMG_LINE_RE } from '../core/utils.js';
import { motion } from '../core/effects.js';
import { AudioEngine } from '../core/audio.js';
import { asciiBar, asciiSweep, asciiGraph, spinner } from '../core/ascii.js';
import { loadScriptOnce } from '../core/loader.js';
import {
    AppState, setAppState, ACCESS_LEVELS, hasAccess, accessLevelLabel, accessLevelClass, accessRank
} from '../core/state.js';
import {
    parseMarkdownDatabase, parseLegacyDatabase, normalizeEntryAccess,
    parseFrontmatterSites, inferEntrySites as inferEntrySitesPure,
    visibleDatabasesForSite as visibleDatabasesForSitePure
} from '../format/database-format.js';
import { balanceColorTagsAcrossLines } from '../format/colors.js';
import { applyRedactionMarkup } from '../format/redaction.js';
import { print, clearOutput } from '../terminal/output.js';
import { printNoDatabaseLoaded, printDatabaseSlotsFull } from '../terminal/messages.js';
import { contentGet } from './status.js';
import { decodeDatabasePayload } from './payload.js';
// Runtime-only circular import: sites.js provides the connected-site record
// store and the mount progress log. Safe because nothing is called during
// module evaluation.
import { getConnectedSiteDatabaseEntries, getConnectedSiteDatabase, runDatabaseLoadLog } from './sites.js';

export const DATABASE_SLOT_COUNT = 3;

function makeEmptySlot(index) {
    return { index, loaded: false, source: '', file: '', metadata: {}, entries: [] };
}

let database = {};
let databaseEntries = [];
let databaseLoadedFlag = false;
let databaseSource = 'NO DATABASE';
let databaseSlots = Array.from({ length: DATABASE_SLOT_COUNT }, (_, index) => makeEmptySlot(index));
let databaseManifest = null;
let databaseManifestSource = 'unloaded';
let activeDatabaseSelection = null;
let pendingLocalDatabaseItem = null;
let databaseDecryptFrame = null;

export function isDatabaseLoaded() {
    return databaseLoadedFlag;
}

export function getDatabaseEntries() {
    return databaseEntries;
}

export function getDatabaseSource() {
    return databaseSource;
}

export function getDatabaseSlots() {
    return databaseSlots;
}

export function getDatabaseManifestInfo() {
    return { manifest: databaseManifest, source: databaseManifestSource };
}

/* ------------------------------------------------------------------ *
 * Entry field helpers
 * ------------------------------------------------------------------ */

function splitEntryKeywords(value) {
    return String(value || '')
        .split(/[;,|\n]+/)
        .map(keyword => keyword.trim())
        .filter(Boolean);
}

export function entryTopic(entry) {
    return compactText(entry.topic || entry.title || entry.entry || 'Untitled Entry');
}

export function entryIdOrPerson(entry) {
    return compactText(entry.idOrPerson || entry.person || entry.subject || entry.id || '');
}

export function entryDate(entry) {
    return compactText(entry.date || '');
}

export function entryKeywords(entry) {
    return splitEntryKeywords(entry.keywords || entry.tags || '').join('; ');
}

export function entryMessage(entry) {
    return String(entry.message ?? entry.content ?? '').trim();
}

export function entryAccessLevel(entry) {
    return normalizeEntryAccess(entry.access || entry.clearance, entry);
}

/** Current reader's clearance rank (0 Public … 4 Administrator). */
function viewerRank() {
    return accessRank(AppState.accessLevel);
}

/**
 * Entry message as the CURRENT reader may see it: inline [redact=N] spans
 * above their clearance become █ blocks, tags are stripped. This is also
 * what search and snippets operate on, so hidden spans cannot leak.
 */
export function entryVisibleMessage(entry) {
    return applyRedactionMarkup(entryMessage(entry), viewerRank());
}

export function canReadEntry(entry) {
    return hasAccess(entryAccessLevel(entry));
}

function redactMessageContent(text) {
    return String(text || '').replace(/[^\s]/g, '█');
}

export function visibleDatabaseEntries() {
    return databaseEntries.slice();
}

/* ------------------------------------------------------------------ *
 * Search & ranking
 * ------------------------------------------------------------------ */

function entrySearchFields(entry, mode = 'search') {
    const keywords = splitEntryKeywords(entry.keywords || entry.tags || '');
    const fields = [
        { name: 'topic', label: 'TOPIC', text: entryTopic(entry), weight: 120 },
        { name: 'date', label: 'DATE', text: entryDate(entry), weight: 98 },
        { name: 'keywords', label: 'KEYWORDS', text: keywords.join(' '), weight: 92 },
        ...keywords.map(keyword => ({ name: 'keywords', label: 'KEYWORD', text: keyword, weight: 96 }))
    ];

    if (mode === 'fsearch') {
        fields.push(
            { name: 'idOrPerson', label: 'ID/PERSON', text: entryIdOrPerson(entry), weight: 88 },
            // Search the reader-visible text only: inline-redacted spans are
            // already █-masked here, so sealed keywords can't be probed.
            { name: 'message', label: 'MESSAGE', text: entryVisibleMessage(entry), weight: 34 }
        );
    }
    return fields.filter(field => compactText(field.text));
}

function fuzzySequenceScore(haystack, needle) {
    if (!needle || needle.length < 3) return 0;
    let queryIndex = 0;
    let firstMatch = -1;
    let lastMatch = -1;
    for (let i = 0; i < haystack.length && queryIndex < needle.length; i++) {
        if (haystack[i] !== needle[queryIndex]) continue;
        if (firstMatch < 0) firstMatch = i;
        lastMatch = i;
        queryIndex++;
    }
    if (queryIndex !== needle.length) return 0;
    const spread = Math.max(1, lastMatch - firstMatch + 1);
    return Math.max(0.18, needle.length / spread);
}

function scoreSearchField(field, query, tokens, fuzzy) {
    const text = normalizeSearchText(field.text);
    if (!text) return 0;
    let score = 0;

    if (text === query) score += field.weight + 58;
    else if (text.startsWith(query)) score += field.weight + 28;
    else if (text.includes(query)) score += field.weight;

    const tokenHits = tokens.filter(token => token && text.includes(token)).length;
    if (tokenHits) {
        score += (tokenHits / Math.max(1, tokens.length)) * Math.min(field.weight, 52);
    }

    if (fuzzy && !score) {
        const fuzzyScore = fuzzySequenceScore(text.replace(/\s+/g, ''), query.replace(/\s+/g, ''));
        if (fuzzyScore) score += Math.round(field.weight * fuzzyScore * 0.74);
    }
    return score;
}

function makeEntrySnippet(entry, query, matchedField = 'message') {
    const sourceText = compactText(
        matchedField === 'topic' ? entryTopic(entry) :
        matchedField === 'keywords' ? entryKeywords(entry) :
        matchedField === 'date' ? entryDate(entry) :
        matchedField === 'idOrPerson' ? entryIdOrPerson(entry) :
        entryVisibleMessage(entry)
    );
    if (!sourceText) return '';

    const lowerSource = sourceText.toLowerCase();
    const lowerQuery = String(query || '').toLowerCase();
    let index = lowerSource.indexOf(lowerQuery);
    if (index < 0) {
        const firstToken = normalizeSearchText(query).split(/\s+/).find(Boolean);
        if (firstToken) index = lowerSource.indexOf(firstToken);
    }
    if (index < 0) index = 0;

    const radius = 78;
    const start = Math.max(0, index - radius);
    const end = Math.min(sourceText.length, index + lowerQuery.length + radius);
    const prefix = start > 0 ? '...' : '';
    const suffix = end < sourceText.length ? '...' : '';
    return `${prefix}${sourceText.slice(start, end)}${suffix}`;
}

export function rankDatabaseEntries(term, entries, options = {}) {
    const query = normalizeSearchText(term);
    const tokens = query.split(/\s+/).filter(Boolean);
    if (!query || !tokens.length) return [];
    const mode = options.mode === 'fsearch' ? 'fsearch' : 'search';

    return entries
        .map(entry => {
            let bestScore = 0;
            let matchedField = mode === 'fsearch' ? 'message' : 'topic';
            let matchedLabel = mode === 'fsearch' ? 'MESSAGE' : 'TOPIC';
            entrySearchFields(entry, mode).forEach(field => {
                const score = scoreSearchField(field, query, tokens, Boolean(options.fuzzy));
                if (score > bestScore) {
                    bestScore = score;
                    matchedField = field.name;
                    matchedLabel = field.label;
                }
            });

            const combinedText = normalizeSearchText(entrySearchFields(entry, mode).map(field => field.text).join(' '));
            const allTokensMatched = tokens.every(token => combinedText.includes(token));
            if (allTokensMatched) bestScore += options.fuzzy ? 18 : 10;

            return {
                entry,
                score: Math.round(bestScore),
                matchedField,
                matchedLabel,
                snippet: makeEntrySnippet(entry, term, matchedField)
            };
        })
        .filter(match => match.score > 0)
        .sort((a, b) => b.score - a.score || String(a.entry.title || '').localeCompare(String(b.entry.title || '')))
        .slice(0, Number.isFinite(options.limit) ? options.limit : 18);
}

export function searchDatabase(term) {
    const matches = rankDatabaseEntries(term, visibleDatabaseEntries(), { mode: 'search', fuzzy: false, limit: 12 });
    printSearchResults(term, matches, { mode: 'SEARCH', fuzzy: false });
}

export async function fuzzySearch(term) {
    const matches = rankDatabaseEntries(term, visibleDatabaseEntries(), { mode: 'fsearch', fuzzy: true, limit: 18 });
    printSearchResults(term, matches, { mode: 'FSEARCH', fuzzy: true });
}

function printSearchResults(term, matches, options = {}) {
    const mode = options.mode || 'SEARCH';
    if (!matches.length) {
        AudioEngine.errorBuzz();
        print('');
        print(contentGet('errors.search_no_result', 'SEARCH QUERY RETURNED NO RESULT'), 't-red');
        print(`Query: "${term}"`, 't-dim');
        print(options.fuzzy
            ? 'FSEARCH checks topic, ID/person, date, keywords, and message content.'
            : 'SEARCH checks topic, date, and listed keywords only.', 't-dim');
        if (!options.fuzzy) print('Use /FSEARCH with Management clearance to search message content.', 't-dim');
        print('');
        return;
    }

    AudioEngine.successTone();
    print('');
    print(`${mode}: ${matches.length} MATCH${matches.length === 1 ? '' : 'ES'} FOUND`, options.fuzzy ? 't-amber' : 't-cyan');
    print(`QUERY: "${term}"`, 't-dim');
    print('--- RESULT INDEX ----------------------------------------', 'cli-divider t-dim');
    matches.forEach((match, index) => printEntry(match.entry, {
        index: index + 1,
        total: matches.length,
        match
    }));
}

/* ------------------------------------------------------------------ *
 * Entry / index rendering
 * ------------------------------------------------------------------ */

export function showCategories(options = {}) {
    if (!databaseLoadedFlag) {
        printNoDatabaseLoaded();
        return;
    }

    if (options.clear !== false) clearOutput({ force: true });
    const categories = {};
    visibleDatabaseEntries().forEach(entry => {
        categories[entry.category] = (categories[entry.category] || 0) + 1;
    });

    print('');
    print('DATABASE CATEGORIES', 't-bright');
    print('═══════════════════════════════════', 't-dim');
    Object.keys(categories).forEach(cat => {
        const cls = cat === 'CONFIDENTIAL' ? 't-magenta' : 't-cyan';
        print(`  ${cat} .................. ${categories[cat]} entries`, cls);
    });
    print('═══════════════════════════════════', 't-dim');
    if (options.hint) print('Type /LIST <CATEGORY> to read every entry in a category.', 't-dim');
    print('');
}

/**
 * /LIST command body.
 * - Public reader: the classic title/category index (no message content);
 *   with a category argument, the same index filtered to that category.
 * - Employee and above: LIST alone shows categories with entry counts;
 *   LIST <category> prints every entry in the category WITH content
 *   (entry-level and inline redaction still apply per clearance).
 */
export function listDatabaseEntries(request = '', options = {}) {
    if (!databaseLoadedFlag) {
        printNoDatabaseLoaded();
        return;
    }
    const employeePlus = hasAccess(ACCESS_LEVELS.employee);
    const query = compactText(String(request || '').replace(/^["']|["']$/g, '')).toUpperCase();

    if (!query) {
        if (employeePlus) {
            showCategories({ clear: options.clear, hint: true });
        } else {
            if (options.clear !== false) clearOutput({ force: true });
            listAllEntries();
            print('Public terminal: titles only. Authenticate via /ACCESS to read entry content.', 't-dim');
            print('');
        }
        return;
    }

    const available = [];
    visibleDatabaseEntries().forEach(entry => {
        const cat = String(entry.category || 'GENERAL').toUpperCase();
        if (!available.includes(cat)) available.push(cat);
    });
    const category = available.find(cat => cat === query)
        || available.find(cat => cat.startsWith(query))
        || available.find(cat => cat.includes(query));
    if (!category) {
        AudioEngine.errorBuzz();
        print('');
        print(`CATEGORY NOT FOUND: "${query}"`, 't-red');
        print(`Available: ${available.join(', ') || 'none'}`, 't-dim');
        print('');
        return;
    }

    const entries = visibleDatabaseEntries().filter(entry => String(entry.category || 'GENERAL').toUpperCase() === category);
    if (options.clear !== false) clearOutput({ force: true });
    print('');
    print(`CATEGORY: ${category}`, category === 'CONFIDENTIAL' ? 't-magenta' : 't-bright');
    print(`${entries.length} ENTR${entries.length === 1 ? 'Y' : 'IES'}`, 't-dim');
    print('--- CATEGORY LISTING --------------------------------------', 'cli-divider t-dim');

    if (!employeePlus) {
        entries
            .slice()
            .sort((a, b) => entryTopic(a).localeCompare(entryTopic(b)))
            .forEach((entry, index) => {
                const marker = String(index + 1).padStart(2, '0');
                const access = entryAccessLevel(entry);
                print(`  ${marker}. ${entryTopic(entry)} :: ${entryDate(entry) || 'UNDATED'} :: ${accessLevelLabel(access)}`, accessLevelClass(access));
            });
        print('');
        print('Public terminal: titles only. Authenticate via /ACCESS to read entry content.', 't-dim');
        print('');
        return;
    }

    entries.forEach((entry, index) => printEntry(entry, {
        index: index + 1,
        total: entries.length,
        label: `ENTRY ${String(index + 1).padStart(2, '0')}/${String(entries.length).padStart(2, '0')}`
    }));
}

export function listAllEntries() {
    if (!databaseLoadedFlag) {
        printNoDatabaseLoaded();
        return;
    }

    const categories = {};
    for (const entry of databaseEntries) {
        (categories[entry.category] = categories[entry.category] || []).push(entry);
    }

    print('');
    print('COMPLETE DATABASE INDEX', 't-amber');
    print('--- TITLE / CATEGORY INDEX ------------------------------', 'cli-divider t-dim');
    Object.keys(categories).forEach(cat => {
        const cls = cat === 'CONFIDENTIAL' ? 't-magenta' : 't-cyan';
        print(`[${cat}] ${categories[cat].length} ENTRIES`, cls);
        categories[cat]
            .sort((a, b) => entryTopic(a).localeCompare(entryTopic(b)))
            .forEach((entry, index) => {
                const marker = String(index + 1).padStart(2, '0');
                const keywords = entryKeywords(entry);
                const access = entryAccessLevel(entry);
                const siteTag = entry.hiddenSiteDefault ? `[${entry.connectedSiteId || 'SITE'}] ` : '';
                print(`  ${marker}. ${siteTag}${entryTopic(entry)} :: ${entryDate(entry) || 'UNDATED'} :: ${accessLevelLabel(access)}`, accessLevelClass(access));
                if (keywords) print(`      keywords: ${keywords}`, 't-dim');
            });
        print('');
    });
}

export function printEntry(entry, options = {}) {
    const access = entryAccessLevel(entry);
    const cls = accessLevelClass(access);
    const readable = canReadEntry(entry);
    const label = options.label || (options.index
        ? `RESULT ${String(options.index).padStart(2, '0')}/${String(options.total || options.index).padStart(2, '0')}`
        : 'DATABASE ENTRY');
    const border = '-'.repeat(52);
    print(`+-[ ${label} // ${entry.category || 'GENERAL'} ]${border}`.slice(0, 62), `${cls} entry-divider`);
    print(`| TOPIC     : ${entryTopic(entry)}`, cls);
    if (entryIdOrPerson(entry)) print(`| ID/PERSON : ${entryIdOrPerson(entry)}`, 't-dim');
    print(`| DATE      : ${entryDate(entry) || 'UNDATED'}`, 't-dim');
    print(`| ACCESS    : ${accessLevelLabel(access)}`, cls);
    const keywords = entryKeywords(entry);
    if (keywords) print(`| KEYWORDS  : ${keywords}`, 't-dim');
    if (options.match) {
        print(`| MATCH     : ${options.match.matchedLabel} // SCORE ${options.match.score}`, 't-amber');
        if (options.match.snippet) {
            const redactSnippet = !readable && options.match.matchedField === 'message';
            const snippet = redactSnippet ? redactMessageContent(options.match.snippet) : options.match.snippet;
            print(`| SNIPPET   : ${snippet}`, redactSnippet ? 't-red' : 't-dim');
        }
    }
    print(`+${'-'.repeat(60)}`, 'entry-divider t-dim');
    if (!readable) print(`| MESSAGE   : REDACTED - ${accessLevelLabel(access).toUpperCase()} CLEARANCE REQUIRED`, 't-red');
    // Readable entries still pass through inline redaction: [redact=N] spans
    // above the reader's clearance render as █ blocks. Locked entries stay
    // fully masked as before.
    const message = readable ? entryVisibleMessage(entry) : redactMessageContent(entryMessage(entry));
    // Re-balance multi-line [color=...] regions so each printed line is
    // self-contained for the line-by-line pipeline.
    const messageText = readable
        ? balanceColorTagsAcrossLines(String(message || 'NO MESSAGE TEXT AVAILABLE.'))
        : String(message || 'NO MESSAGE TEXT AVAILABLE.');
    messageText.split('\n').forEach(line => {
        const trimmed = line.trim();
        // Embedded image lines print without the "| " gutter so the terminal
        // renderer can replace them with an <img> element directly.
        if (readable && IMG_LINE_RE.test(trimmed)) {
            print(trimmed, 'entry-image-line');
        } else {
            print(`| ${line}`, readable ? '' : 't-red');
        }
    });
    print(`+${'-'.repeat(60)}`, 'entry-divider t-dim');
    print('');
}

/* ------------------------------------------------------------------ *
 * Slots
 * ------------------------------------------------------------------ */

export function databaseCapacityFull() {
    return databaseSlots.every(slot => slot.loaded);
}

function firstEmptyDatabaseSlotIndex() {
    return databaseSlots.findIndex(slot => !slot.loaded);
}

export function databaseSlotDisplayName(slot) {
    if (!slot || !slot.loaded) return 'NO DATABASE LOADED';
    return slot.source || slot.file || slot.metadata?.title || `DATABASE SLOT ${slot.index + 1}`;
}

function normalizeDatabaseIdentity(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/^databases[\\/]/, '')
        .replace(/\\/g, '/');
}

function databaseItemIdentities(item = {}) {
    return [item.id, item.file, item.filename, item.displayName, item.name]
        .map(normalizeDatabaseIdentity).filter(Boolean);
}

function parsedDatabaseIdentities(parsed = {}, item = {}, path = '') {
    return [
        parsed.metadata?.id, parsed.metadata?.title, parsed.source,
        item.id, item.file, item.filename, item.displayName, item.name, path
    ].map(normalizeDatabaseIdentity).filter(Boolean);
}

function databaseAlreadyMountedByIdentities(identities = []) {
    const lookup = new Set(identities.map(normalizeDatabaseIdentity).filter(Boolean));
    if (!lookup.size) return false;
    return databaseSlots.some(slot => {
        if (!slot.loaded) return false;
        return [slot.metadata?.id, slot.metadata?.title, slot.source, slot.file]
            .map(normalizeDatabaseIdentity)
            .some(identity => identity && lookup.has(identity));
    });
}

export function databaseItemAlreadyMounted(item = {}) {
    return databaseAlreadyMountedByIdentities(databaseItemIdentities(item));
}

async function mountParsedDatabase(parsed, item = {}, path = '') {
    if (databaseAlreadyMountedByIdentities(parsedDatabaseIdentities(parsed, item, path))) {
        AudioEngine.errorBuzz();
        clearOutput({ force: true });
        print('');
        print('DATABASE ALREADY MOUNTED', 't-amber');
        print(`${parsed.metadata.title || item.displayName || parsed.source || item.file || 'Selected package'} is already loaded in a database slot.`, 't-dim');
        print('Eject that database before loading it again.', 't-dim');
        print('');
        return false;
    }

    const slotIndex = firstEmptyDatabaseSlotIndex();
    if (slotIndex < 0) {
        printDatabaseSlotsFull();
        return false;
    }

    const source = parsed.metadata.title || item.displayName || parsed.source || item.file || path || 'MARKDOWN DATABASE';
    const file = item.file || item.filename || path || parsed.source || source;
    const entries = parsed.entries.map(entry => ({
        ...entry,
        databaseSlot: slotIndex + 1,
        databaseSource: source,
        databaseFile: file
    }));

    databaseSlots[slotIndex] = {
        index: slotIndex,
        loaded: true,
        source,
        file,
        metadata: { ...parsed.metadata },
        entries
    };

    rebuildDatabaseIndex();
    await runDatabaseLoadLog(source, entries.length, slotIndex + 1);
    AudioEngine.dataLoaded();
    print('');
    print('DATABASE AUTHENTICATED', 't-cyan');
    print(`Slot ${slotIndex + 1}: ${source}`, 't-amber');
    print(`Entries loaded: ${entries.length}`, 't-cyan');
    print(`Mounted packages: ${databaseSlots.filter(slot => slot.loaded).length}/${DATABASE_SLOT_COUNT}`, 't-dim');
    print('');
    print('Use /SEARCH, /CATEGORIES, or admin /LIST ALL to explore.', 't-dim');
    print('');
    return true;
}

export function rebuildDatabaseIndex() {
    database = {};
    databaseEntries = [];

    const indexEntry = entry => {
        databaseEntries.push(entry);
        const titleKey = String(entryTopic(entry) || '').toLowerCase();
        if (titleKey && !database[titleKey]) database[titleKey] = entry;
        const idKey = String(entry.id || '').toLowerCase();
        if (idKey && !database[idKey]) database[idKey] = entry;
        const personKey = String(entryIdOrPerson(entry) || '').toLowerCase();
        if (personKey && !database[personKey]) database[personKey] = entry;
    };

    databaseSlots.forEach(slot => {
        if (slot.loaded) slot.entries.forEach(indexEntry);
    });
    getConnectedSiteDatabaseEntries().forEach(indexEntry);

    databaseLoadedFlag = databaseEntries.length > 0;
    const manualSources = databaseSlots.filter(slot => slot.loaded).map(slot => databaseSlotDisplayName(slot));
    const siteDatabase = getConnectedSiteDatabase();
    const siteSources = siteDatabase?.source ? [siteDatabase.source] : [];
    databaseSource = [...manualSources, ...siteSources].join(', ') || 'NO DATABASE';
    setAppState({ databaseLoaded: databaseLoadedFlag }, { resetSelection: false });
    updateEntryCount();
    updateDatabaseSlotIndicators();
}

function updateEntryCount() {
    const entries = databaseEntries.length ? databaseEntries : Object.values(database);
    const seen = new Set();
    const count = entries.filter(entry => {
        const title = entryTopic(entry);
        if (!entry || seen.has(title)) return false;
        seen.add(title);
        return true;
    }).length;
    const counter = getById('entryCount');
    if (counter) counter.textContent = count;
}

export function updateDatabaseSlotIndicators() {
    databaseSlots.forEach((slot, index) => {
        const button = document.querySelector(`.database-slot-button[data-slot="${index}"]`);
        if (!button) return;
        button.classList.toggle('loaded', slot.loaded);
        button.classList.toggle('empty', !slot.loaded);
        button.title = slot.loaded
            ? `Slot ${index + 1}: ${databaseSlotDisplayName(slot)}`
            : `Slot ${index + 1}: empty`;
        button.setAttribute('aria-label', slot.loaded
            ? `Database slot ${index + 1} loaded: ${databaseSlotDisplayName(slot)}`
            : `Database slot ${index + 1} empty`);
    });
}

export function ejectDatabaseSlot(slotIndex, options = {}) {
    const safeIndex = Number.parseInt(slotIndex, 10);
    if (!Number.isFinite(safeIndex) || safeIndex < 0 || safeIndex >= DATABASE_SLOT_COUNT) return false;
    const slot = databaseSlots[safeIndex];
    if (!slot.loaded) {
        if (!options.silent) {
            AudioEngine.errorBuzz();
            clearOutput({ force: true });
            print('');
            print(`DATABASE SLOT ${safeIndex + 1} IS EMPTY`, 't-amber');
            print('');
        }
        return false;
    }

    const source = databaseSlotDisplayName(slot);
    databaseSlots[safeIndex] = makeEmptySlot(safeIndex);
    rebuildDatabaseIndex();
    AudioEngine.pageFlip();
    if (!options.silent) {
        clearOutput({ force: true });
        print('');
        print(`DATABASE SLOT ${safeIndex + 1} EJECTED`, 't-amber');
        print(`Database: ${source}`, 't-dim');
        print(`Mounted packages: ${databaseSlots.filter(item => item.loaded).length}/${DATABASE_SLOT_COUNT}`, 't-cyan');
        print('');
    }
    return true;
}

export function ejectAllDatabases() {
    const loadedCount = databaseSlots.filter(slot => slot.loaded).length;
    if (!loadedCount) {
        AudioEngine.errorBuzz();
        clearOutput({ force: true });
        print('');
        print('NO DATABASES LOADED', 't-amber');
        print('');
        return;
    }

    databaseSlots = databaseSlots.map((_, index) => makeEmptySlot(index));
    rebuildDatabaseIndex();
    AudioEngine.pageFlip();
    clearOutput({ force: true });
    print('');
    print('ALL DATABASE SLOTS EJECTED', 't-amber');
    print(`Packages ejected: ${loadedCount}`, 't-dim');
    print('');
}

/** Session restore: replace all slots wholesale and reindex. */
export function restoreDatabaseSlots(slots) {
    const restored = Array.isArray(slots) ? slots : [];
    databaseSlots = Array.from({ length: DATABASE_SLOT_COUNT }, (_, index) => {
        const slot = restored[index] || {};
        return {
            index,
            loaded: Boolean(slot.loaded),
            source: String(slot.source || ''),
            file: String(slot.file || ''),
            metadata: slot.metadata && typeof slot.metadata === 'object' ? { ...slot.metadata } : {},
            entries: Array.isArray(slot.entries) ? slot.entries : []
        };
    });
    rebuildDatabaseIndex();
}

/* ------------------------------------------------------------------ *
 * ZIP / encrypted package transport
 * ------------------------------------------------------------------ */

// Internal ZIP transport key — spoiler-friction obfuscation, not secrecy.
// Hex decodes to "AresAres123". Keep in sync with Zip PW Databases.txt,
// TERMINAL_COMMANDS_PASSWORDS_GUIDE.txt, and ENCRYPTION_KEY in core/utils.js.
const DATABASE_ZIP_KEY_HEX_PARTS = ['41726573', '41726573', '313233'];

function databaseZipPassword() {
    return DATABASE_ZIP_KEY_HEX_PARTS
        .map(part => String(part || '').match(/../g) || [])
        .flat()
        .map(hex => String.fromCharCode(Number.parseInt(hex, 16)))
        .join('');
}

function isZipDatabasePackage(fileName = '') {
    return String(fileName).toLowerCase().endsWith('.zip');
}

function zipEntryName(entry = {}) {
    return String(entry.filename || entry.name || '').replace(/\\/g, '/');
}

function normalizeZipEntryName(name = '') {
    return zipEntryName({ filename: name }).replace(/^\.\//, '').toLowerCase();
}

function selectZipDatabaseEntry(entries = [], preferredName = '') {
    const files = entries.filter(entry => !entry.directory && zipEntryName(entry));
    const preferred = normalizeZipEntryName(preferredName);
    if (preferred) {
        const match = files.find(entry => {
            const name = normalizeZipEntryName(zipEntryName(entry));
            return name === preferred || name.endsWith(`/${preferred}`);
        });
        if (match) return match;
    }
    return files.find(entry => /\.(md|markdown|txt)$/i.test(zipEntryName(entry))) || null;
}

async function ensureZipDatabaseSupport() {
    await loadScriptOnce('zip');
    if (!window.zip?.ZipReader || !window.zip?.BlobReader || !window.zip?.TextWriter) {
        throw new Error('ZIP_SUPPORT_UNAVAILABLE');
    }
    return window.zip;
}

async function fetchBlobFile(path) {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
    return response.blob();
}

export async function fetchTextFile(path) {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
    return response.text();
}

async function readZipDatabasePackage(blob, item = {}, sourceName = 'database.zip') {
    const zipLib = await ensureZipDatabaseSupport();
    const reader = new zipLib.ZipReader(new zipLib.BlobReader(blob), { useWebWorkers: false });
    try {
        const entries = await reader.getEntries();
        const entry = selectZipDatabaseEntry(entries, item.innerFile || item.entry || item.databaseFile);
        if (!entry) throw new Error('ZIP_DATABASE_ENTRY_NOT_FOUND');
        const content = await entry.getData(new zipLib.TextWriter(), {
            password: databaseZipPassword(),
            useWebWorkers: false
        });
        const entryName = zipEntryName(entry);
        return { content, entryName, source: `${sourceName}:${entryName}` };
    } finally {
        await reader.close();
    }
}

/* ------------------------------------------------------------------ *
 * Local file loading
 * ------------------------------------------------------------------ */

export function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) {
        pendingLocalDatabaseItem = null;
        return;
    }

    if (databaseCapacityFull()) {
        pendingLocalDatabaseItem = null;
        printDatabaseSlotsFull();
        e.target.value = '';
        return;
    }

    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.md') || fileName.endsWith('.markdown') || fileName.endsWith('.txt')) {
        loadPlainDatabaseFile(file);
    } else if (isZipDatabasePackage(fileName)) {
        loadZipDatabaseFile(file);
    } else if (fileName.endsWith('.dat') || fileName.endsWith('.db') || fileName.endsWith('.bin')) {
        loadEncryptedFile(file);
    } else {
        AudioEngine.errorBuzz();
        print('');
        print('ERROR: Unsupported file format.', 't-red');
        print('Expected: .md, .txt, .zip, or encrypted database (.dat)', 't-dim');
        print('');
    }
    e.target.value = '';
}

function loadPlainDatabaseFile(file) {
    print('');
    print('LOCAL DATABASE FILE DETECTED', 't-amber');
    print(`Reading: ${file.name}`, 't-dim');

    const reader = new FileReader();
    reader.onload = async event => {
        try {
            const content = String(event.target.result || '');
            const markdownDatabase = parseMarkdownDatabase(content, file.name);
            if (markdownDatabase.entries.length) {
                promptForParsedDatabase(markdownDatabase, pendingLocalDatabaseItem || { file: file.name, displayName: file.name }, file.name);
                pendingLocalDatabaseItem = null;
                return;
            }

            const legacyDatabase = parseLegacyDatabase(content, file.name);
            if (!legacyDatabase.entries.length) throw new Error('No entries found');
            await mountParsedDatabase(legacyDatabase, pendingLocalDatabaseItem || { file: file.name, displayName: file.name }, file.name);
            pendingLocalDatabaseItem = null;
        } catch (_) {
            pendingLocalDatabaseItem = null;
            AudioEngine.errorBuzz();
            print('');
            print('ERROR: DATABASE LOAD FAILED', 't-red');
            print('No readable Markdown or legacy entries were found.', 't-dim');
            print('');
        }
    };
    reader.onerror = () => {
        pendingLocalDatabaseItem = null;
        AudioEngine.errorBuzz();
        print('');
        print('ERROR: Could not read file.', 't-red');
        print('');
    };
    reader.readAsText(file);
}

async function loadZipDatabaseFile(file) {
    print('');
    print('ZIP DATABASE PACKAGE DETECTED', 't-amber');
    print(`Reading: ${file.name}`, 't-dim');
    print('Opening sealed transport package...', 't-dim');
    AudioEngine.decryptSound();

    try {
        const item = pendingLocalDatabaseItem || { file: file.name, displayName: file.name };
        const extracted = await readZipDatabasePackage(file, item, file.name);
        const markdownDatabase = parseMarkdownDatabase(extracted.content, extracted.entryName || file.name);
        if (markdownDatabase.entries.length) {
            promptForParsedDatabase(markdownDatabase, item, extracted.source || file.name);
            return;
        }

        const legacyDatabase = parseLegacyDatabase(extracted.content, extracted.entryName || file.name);
        if (!legacyDatabase.entries.length) throw new Error('No entries found');
        await mountParsedDatabase(legacyDatabase, item, extracted.source || file.name);
    } catch (_) {
        AudioEngine.errorBuzz();
        print('');
        print('ERROR: ZIP DATABASE DECRYPTION FAILED', 't-red');
        print('Package key is invalid, ZIP support is unavailable, or no readable database file was found inside.', 't-dim');
        print('');
    } finally {
        pendingLocalDatabaseItem = null;
    }
}

function loadEncryptedFile(file) {
    print('');
    print('ENCRYPTED DATABASE DETECTED', 't-amber');
    print('Decrypting...', 't-dim');
    AudioEngine.decryptSound();

    const reader = new FileReader();
    reader.onload = async event => {
        try {
            const encoded = event.target.result.trim();
            const decrypted = decodeDatabasePayload(encoded);

            const markdownDatabase = parseMarkdownDatabase(decrypted, file.name);
            if (markdownDatabase.entries.length) {
                promptForParsedDatabase(markdownDatabase, { file: file.name, displayName: file.name }, file.name);
            } else if (decrypted.includes(':') && decrypted.includes('|')) {
                const legacyDatabase = parseLegacyDatabase(decrypted, file.name);
                if (!legacyDatabase.entries.length) throw new Error('No entries found');
                await mountParsedDatabase(legacyDatabase, { file: file.name, displayName: file.name }, file.name);
            } else {
                throw new Error('Invalid format');
            }
        } catch (_) {
            AudioEngine.errorBuzz();
            print('');
            print('ERROR: DECRYPTION FAILED', 't-red');
            print('Database file may be corrupted.', 't-dim');
            print('');
        }
    };
    reader.onerror = () => {
        AudioEngine.errorBuzz();
        print('');
        print('ERROR: Could not read file.', 't-red');
        print('');
    };
    reader.readAsText(file);
}

/* ------------------------------------------------------------------ *
 * Site-gated database visibility
 *   1. manifest `sites` array  2. cached frontmatter `sites:` line
 *   3. filename prefix ("Terminal " → always, "BRE-XX " → that site)
 *   4. default: always available
 * ------------------------------------------------------------------ */

// Per-session cache of {filename → sites[]|null} from .md front matter.
const sitesCache = new Map();

export function inferEntrySites(entry) {
    return inferEntrySitesPure(entry, sitesCache);
}

export function visibleDatabasesForSite(manifest, connectedSiteId) {
    return visibleDatabasesForSitePure(manifest, connectedSiteId, sitesCache);
}

async function prefetchSitesMetadata(manifest) {
    const list = Array.isArray(manifest) ? manifest : [];
    const needsFetch = list.filter(entry => {
        if (Array.isArray(entry?.sites) && entry.sites.length) return false;
        const file = String(entry?.file || '');
        if (!file) return false;
        return !sitesCache.has(file);
    });
    if (!needsFetch.length) return;
    await Promise.all(needsFetch.map(async entry => {
        try {
            const text = await fetchTextFile(`databases/${entry.file}`);
            const sites = parseFrontmatterSites(text);
            sitesCache.set(entry.file, sites && sites.length ? sites : null);
        } catch (_) {
            // leave uncached so a later open retries
        }
    }));
}

/* ------------------------------------------------------------------ *
 * Manifest
 * ------------------------------------------------------------------ */

// Mirrors databases/manifest.json for when the fetch is blocked (file://).
const FALLBACK_DATABASE_MANIFEST = [
    { id: 'ares_01_director_logbook', displayName: 'ARES Director Logbook', description: 'Private director log entries for the Black Desert operation.', file: 'Terminal ares_01_direktor_logbuch.md' },
    { id: 'ares_02_employee_logbook', displayName: 'ARES Employee Logbook', description: 'Personal and duty logs from staff, mercenaries, technicians, and penal workers.', file: 'Terminal ares_02_mitarbeiter_logbuch.md' },
    { id: 'ares_04_weekly_reports', displayName: 'ARES Weekly Reports', description: 'Chronological weekly reports from discovery through collapse.', file: 'Terminal ares_04_woechentliche_rapporte.md' },
    { id: 'ares_database1_metaplanar_access', displayName: 'ARES Metaplanar Access Archive', description: 'Discovery history, portal construction, and early exploitation records.', file: 'BRE-01 ares_database1_metaplanar_access.md', sites: ['BRE-01', 'BRE-03'] },
    { id: 'ares_database2_management_pressure_de', displayName: 'ARES Executive Pressure Chain (DE)', description: 'German-language directives, profitability language, escalation orders, and compliance memos.', file: 'BRE-01 ares_database2_management_pressure_de.md' },
    { id: 'engineer_brandt_personal_log_de', displayName: 'Engineer Brandt Personal Log (DE)', description: 'German-language personal log entries from an ARES engineer at outpost BRE-07.', file: 'BRE-01 ares_engineer_personal_database_de.md' },
    { id: 'research_assets', displayName: 'Research Assets', description: 'Specimen vaults, prototype lockers, and archived lab inventory at Meridian Extraction.', file: 'BRE-02 research_assets.md' },
    { id: 'maintenance_queue', displayName: 'Maintenance Queue', description: 'Power, life-support, access, and generator maintenance backlog at Meridian Extraction.', file: 'BRE-02 maintenance_queue.md' },
    { id: 'ares_03_shadow_spirits_inhabitants', displayName: 'Shadow Spirits and Inhabitants', description: 'Field notes and warning reports on entities and inhabitants observed from Khepri.', file: 'BRE-03 shadow_spirits_inhabitants_de.md' },
    { id: 'ares_database1_metaplanar_access_de', displayName: 'Metaplanar Observations (DE)', description: 'German-language observation logs of metaplanar phenomena tracked from Khepri.', file: 'BRE-03 metaplanar_observations_de.md' },
    { id: 'security_incidents', displayName: 'Security Incidents', description: 'Patrol reports, alarm events, and defense-grid irregularities at Glasshouse.', file: 'BRE-04 security_incidents.md' },
    { id: 'confidential_archive', displayName: 'Confidential Archive', description: 'Restricted executive notes, redacted incidents, and sealed directives at Glasshouse.', file: 'BRE-04 confidential_archive.md' },
    { id: 'ares_05_security_logbook', displayName: 'ARES Security Logbook', description: 'Security events, patrol reports, Firewatch protocols, and automated alarms at Glasshouse.', file: 'BRE-04 security_logbook_de.md' },
    { id: 'outpost_relay_logs', displayName: 'Outpost Relay Logs', description: 'Remote station, drone uplink, and mesh-network records routed through Boreline.', file: 'BRE-05 outpost_relay_logs.md' },
    { id: 'personnel_registry', displayName: 'Personnel Registry', description: 'Employee, contractor, and missing staff notes maintained at Boreline Relay.', file: 'BRE-05 personnel_registry.md' },
    { id: 'ares_06_research_laboratory', displayName: 'ARES Research Laboratory', description: 'Laboratory logs and internal analysis of portals, black sand, and anomalies at Orpheus.', file: 'BRE-06 research_laboratory_de.md' },
    { id: 'ares_07_psychiatric_ai_reports', displayName: 'Psychiatric AI Reports', description: 'Automated psychological care, stress, and risk reports from CARE-9 at Orpheus.', file: 'BRE-06 psychiatric_ai_reports_de.md' }
];

async function loadDatabaseManifest() {
    if (databaseManifest) return databaseManifest;
    try {
        const response = await fetch('databases/manifest.json', { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const manifest = await response.json();
        if (!manifest || !Array.isArray(manifest.databases)) throw new Error('Invalid manifest');
        databaseManifestSource = 'manifest';
        databaseManifest = manifest.databases;
    } catch (_) {
        databaseManifestSource = 'fallback';
        databaseManifest = FALLBACK_DATABASE_MANIFEST.map(item => ({ ...item, fallback: true }));
    }
    return databaseManifest;
}

/* ------------------------------------------------------------------ *
 * LOAD DATABASE modal
 * ------------------------------------------------------------------ */

export function closeDatabaseModal() {
    clearDatabaseDecryptAnimation();
    const modal = getById('databaseModal');
    if (modal) modal.remove();
    activeDatabaseSelection = null;
    pendingLocalDatabaseItem = null;
    setAppState({ activeOverlay: 'none' }, { resetSelection: false });
}

function clearDatabaseDecryptAnimation() {
    if (databaseDecryptFrame) {
        cancelAnimationFrame(databaseDecryptFrame);
        databaseDecryptFrame = null;
    }
}

function createDatabaseModal(titleText) {
    closeDatabaseModal();
    const overlay = el('div', 'database-modal-overlay');
    overlay.id = 'databaseModal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'databaseModalTitle');

    const panel = el('div', 'database-modal-panel glow');
    const header = el('div', 'database-modal-header');
    const title = el('div', 'database-modal-title', titleText);
    title.id = 'databaseModalTitle';
    const close = el('button', 'database-modal-close', '[ CLOSE ]');
    close.type = 'button';
    close.addEventListener('click', closeDatabaseModal);
    header.append(title, close);

    const body = el('div', 'database-modal-body');
    body.id = 'databaseModalBody';

    panel.append(header, body);
    overlay.appendChild(panel);
    overlay.addEventListener('click', event => {
        if (event.target === overlay) closeDatabaseModal();
    });
    document.body.appendChild(overlay);
    setAppState({ activeOverlay: 'database' }, { resetSelection: false });
    close.focus();
    return { overlay, body };
}

function ensureDatabaseModal(titleText = 'LOAD DATABASE') {
    const existingBody = getById('databaseModalBody');
    if (existingBody) return existingBody;
    return createDatabaseModal(titleText).body;
}

function renderDatabaseSelectorList(body, manifest) {
    body.textContent = '';
    body.appendChild(el('p', 'database-modal-copy', 'Select a database package.'));

    if (databaseManifestSource === 'fallback') {
        body.appendChild(el('p', 'database-modal-copy t-amber',
            'Manifest fetch is blocked or unavailable. Showing the default database list. If you opened index.html directly, the next step may ask you to select the matching local database package manually.'));
    }

    const list = el('div', 'database-list');
    manifest.forEach(item => {
        const alreadyMounted = databaseItemAlreadyMounted(item);
        const button = el('button', `database-choice ${alreadyMounted ? 'disabled mounted' : ''}`.trim());
        button.type = 'button';
        button.disabled = alreadyMounted;
        if (alreadyMounted) button.setAttribute('aria-disabled', 'true');
        button.append(
            el('span', 'database-choice-name', item.displayName || item.name || item.file),
            el('span', 'database-choice-description', alreadyMounted
                ? 'DATABASE ALREADY LOADED - eject its slot to load it again.'
                : (item.description || item.file))
        );
        if (!alreadyMounted) button.addEventListener('click', () => prepareManifestDatabase(item));
        list.appendChild(button);
    });
    body.appendChild(list);

    const external = el('button', 'database-choice database-choice-external');
    external.type = 'button';
    external.append(
        el('span', 'database-choice-name', 'ADD EXTERNAL DATABASE FILE'),
        el('span', 'database-choice-description', 'Open local file picker for .md, .txt, .zip, or encrypted .dat database packages.')
    );
    external.addEventListener('click', () => {
        if (databaseCapacityFull()) {
            renderDatabaseSlotsFullPrompt(body);
            return;
        }
        pendingLocalDatabaseItem = { file: 'external database', displayName: 'External Database' };
        getById('fileInput').click();
    });
    body.appendChild(external);
}

export async function showDatabaseSelector() {
    const { body } = createDatabaseModal('LOAD DATABASE');
    if (databaseCapacityFull()) {
        renderDatabaseSlotsFullPrompt(body);
        return;
    }
    body.textContent = 'Reading database manifest...';

    const manifest = await loadDatabaseManifest();
    await prefetchSitesMetadata(manifest);
    const visible = visibleDatabasesForSite(manifest, AppState.connectedSiteId || '');
    renderDatabaseSelectorList(body, visible);
}

async function prepareManifestDatabase(item) {
    const modal = getById('databaseModal');
    const body = getById('databaseModalBody');
    if (!modal || !body) return;
    if (databaseItemAlreadyMounted(item)) {
        renderDatabaseAlreadyMountedPrompt(body, item);
        return;
    }
    if (databaseCapacityFull()) {
        renderDatabaseSlotsFullPrompt(body);
        return;
    }
    body.textContent = 'Fetching database package...';
    try {
        const path = `databases/${item.file || item.filename}`;
        const sourceName = item.displayName || item.name || item.file;
        let content = '';
        let source = path;

        if (item.format === 'zip' || isZipDatabasePackage(item.file || item.filename)) {
            body.textContent = 'Fetching sealed ZIP database package...';
            const blob = await fetchBlobFile(path);
            const extracted = await readZipDatabasePackage(blob, item, path);
            content = extracted.content;
            source = extracted.source;
        } else {
            content = await fetchTextFile(path);
        }

        const parsed = parseMarkdownDatabase(content, sourceName);
        if (!parsed.entries.length) throw new Error('No entries found');
        promptForParsedDatabase(parsed, item, source);
    } catch (_) {
        renderLocalDatabasePrompt(item);
        AudioEngine.errorBuzz();
    }
}

function promptForParsedDatabase(parsed, item = {}, path = '') {
    ensureDatabaseModal('LOAD DATABASE');
    if (databaseAlreadyMountedByIdentities(parsedDatabaseIdentities(parsed, item, path))) {
        renderDatabaseAlreadyMountedPrompt(getById('databaseModalBody'), item, parsed);
        return;
    }
    if (databaseCapacityFull()) {
        renderDatabaseSlotsFullPrompt(getById('databaseModalBody'));
        return;
    }
    activeDatabaseSelection = { item, parsed, path };
    renderDatabasePasswordPrompt(parsed);
}

function renderDatabaseAlreadyMountedPrompt(body, item = {}, parsed = {}) {
    if (!body) return;
    body.textContent = '';
    const name = parsed.metadata?.title || item.displayName || item.name || item.file || 'Selected database';
    const message = el('p', 'database-modal-copy t-amber', `${name} is already mounted. Eject that database slot before loading it again.`);
    const back = el('button', 'database-modal-action secondary', 'BACK TO DATABASE LIST');
    back.type = 'button';
    back.addEventListener('click', showDatabaseSelector);
    body.append(message, back);
    back.focus();
}

function renderDatabaseSlotsFullPrompt(body) {
    if (!body) return;
    body.textContent = '';
    const message = el('p', 'database-modal-copy t-red', 'DATABASE SLOT CAPACITY REACHED. Eject one database package before loading another.');
    const details = el('pre', 'database-slot-details', databaseSlots.map(slot => (
        `SLOT ${slot.index + 1}: ${slot.loaded ? databaseSlotDisplayName(slot) : 'EMPTY'}`
    )).join('\n'));
    const actions = el('div', 'database-modal-actions');
    const abort = el('button', 'database-modal-action secondary', 'ABORT');
    abort.type = 'button';
    abort.addEventListener('click', closeDatabaseModal);
    actions.appendChild(abort);
    databaseSlots.forEach(slot => {
        const eject = el('button', 'database-modal-action', `EJECT SLOT ${slot.index + 1}`);
        eject.type = 'button';
        eject.disabled = !slot.loaded;
        eject.addEventListener('click', () => {
            ejectDatabaseSlot(slot.index);
            closeDatabaseModal();
        });
        actions.appendChild(eject);
    });
    body.append(message, details, actions);
    abort.focus();
}

function renderLocalDatabasePrompt(item = {}) {
    const body = ensureDatabaseModal('LOAD DATABASE');
    body.textContent = '';
    const fileName = item.file || item.filename || 'database.md';
    const message = el('p', 'database-modal-copy t-amber',
        `${contentGet('errors.database_package_fail', 'DATABASE PACKAGE FAILED TO LOAD.')} The browser could not fetch databases/${fileName}. On GitHub Pages, make sure the root .nojekyll file is uploaded so database packages are served as raw files. If you opened the page directly from disk, select that file manually from the databases folder.`);
    const select = el('button', 'database-modal-action', `SELECT ${fileName.toUpperCase()}`);
    select.type = 'button';
    select.addEventListener('click', () => {
        pendingLocalDatabaseItem = item;
        getById('fileInput').click();
    });
    const back = el('button', 'database-modal-action secondary', 'BACK TO DATABASE LIST');
    back.type = 'button';
    back.addEventListener('click', showDatabaseSelector);
    const actions = el('div', 'database-modal-actions');
    actions.append(select, back);
    body.append(message, actions);
}

function renderDatabasePasswordPrompt(parsed, previousError = '') {
    clearDatabaseDecryptAnimation();
    const body = getById('databaseModalBody');
    if (!body) return;
    body.textContent = '';
    const title = el('p', 'database-modal-copy', `Selected: ${parsed.metadata.title || parsed.source}`);
    const description = el('p', 'database-modal-copy t-dim', parsed.metadata.description || 'Enter package clearance password.');
    const input = el('input', 'database-password-input');
    input.type = 'password';
    input.placeholder = 'Database password...';
    input.setAttribute('aria-label', 'Database password');
    const error = el('div', 'database-password-error', previousError);
    const actions = el('div', 'database-modal-actions');
    const submit = el('button', 'database-modal-action', 'AUTHENTICATE');
    submit.type = 'button';
    submit.dataset.authenticateDatabase = 'true';
    const back = el('button', 'database-modal-action secondary', 'BACK');
    back.type = 'button';
    actions.append(submit, back);
    body.append(title, description, input, error, actions);

    let authenticationRunning = false;
    const authenticate = () => {
        if (authenticationRunning) return;
        authenticationRunning = true;
        const submittedPassword = input.value.trim();
        const expected = String(parsed.metadata.password || '').trim();
        runDatabaseDecryptionAnimation(parsed, submittedPassword === expected);
    };
    submit.addEventListener('click', authenticate);
    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            authenticate();
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            closeDatabaseModal();
        }
    });
    back.addEventListener('click', showDatabaseSelector);
    input.focus();
}

function runDatabaseDecryptionAnimation(parsed, passwordMatches) {
    clearDatabaseDecryptAnimation();
    const body = getById('databaseModalBody');
    if (!body) return;

    body.textContent = '';
    const title = el('p', 'database-modal-copy t-amber', `Decrypting: ${parsed.metadata.title || parsed.source}`);
    const box = el('pre', 'database-decrypt-box');
    box.setAttribute('aria-live', 'polite');
    const hint = el('p', 'database-modal-copy t-dim', 'Running package decryption. Stand by...');
    body.append(title, box, hint);

    AudioEngine.decryptSound();
    const startedAt = performance.now();
    const duration = motion.reduced ? 1200 : 5000;
    let lastRender = 0;

    function render(now) {
        const elapsed = now - startedAt;
        const progress = Math.min(100, Math.round((elapsed / duration) * 100));
        const frame = Math.floor(elapsed / 120);

        if (now - lastRender > 90 || progress >= 100) {
            lastRender = now;
            const blockA = asciiSweep(frame, 26);
            const blockB = asciiGraph(frame, 30);
            const keyNoise = Array.from({ length: 22 }, (_, index) => ((frame + index * 7) % 16).toString(16).toUpperCase()).join('');
            box.textContent = [
                '> ARES PACKAGE CRYPTOGRAPHIC HANDSHAKE',
                `  HEADER      : ${parsed.metadata.id || 'UNKNOWN'} / ${parsed.entries.length} ENTRIES`,
                `  KEY STREAM  : ${keyNoise}`,
                `  XOR PASS    : ${blockA}`,
                `  INDEX MAP   : ${blockB}`,
                `  DECRYPTION  : ${asciiBar(progress, 28)}`,
                progress >= 100 ? '  STATUS      : FINALIZING...' : `  STATUS      : RUNNING ${spinner(frame)}`
            ].join('\n');
        }

        if (elapsed < duration) {
            databaseDecryptFrame = requestAnimationFrame(render);
            return;
        }

        databaseDecryptFrame = null;
        if (passwordMatches) {
            void mountParsedDatabase(parsed, activeDatabaseSelection?.item || {}, activeDatabaseSelection?.path || parsed.source || '');
            closeDatabaseModal();
        } else {
            AudioEngine.errorBuzz();
            renderDatabasePasswordPrompt(parsed, contentGet('errors.database_password_fail', 'ACCESS DENIED - INVALID DATABASE PASSWORD'));
        }
    }

    databaseDecryptFrame = requestAnimationFrame(render);
}

/* ------------------------------------------------------------------ *
 * Slot dialog (toolbar slot buttons)
 * ------------------------------------------------------------------ */

export function showDatabaseSlotDialog(slotIndex) {
    const safeIndex = Math.max(0, Math.min(DATABASE_SLOT_COUNT - 1, Number.parseInt(slotIndex, 10) || 0));
    const slot = databaseSlots[safeIndex];
    const { body } = createDatabaseModal(`DATABASE SLOT ${safeIndex + 1}`);
    body.textContent = '';

    const status = el('p', `database-modal-copy ${slot.loaded ? 't-cyan' : 't-red'}`,
        slot.loaded ? 'STATUS: DATABASE LOADED' : 'STATUS: NO DATABASE LOADED');

    const details = el('pre', 'database-slot-details', slot.loaded
        ? [
            `SLOT        : ${safeIndex + 1}`,
            `DATABASE    : ${databaseSlotDisplayName(slot)}`,
            `FILE        : ${slot.file || 'UNKNOWN'}`,
            `ENTRIES     : ${slot.entries.length}`,
            `CLEARANCE   : ${slot.metadata.password ? 'PASSWORD GATED' : 'OPEN'}`
        ].join('\n')
        : [
            `SLOT        : ${safeIndex + 1}`,
            'DATABASE    : NONE',
            'ENTRIES     : 0',
            'STATUS      : EMPTY / READY'
        ].join('\n'));

    const actions = el('div', 'database-modal-actions');
    const abort = el('button', 'database-modal-action secondary', 'ABORT');
    abort.type = 'button';
    abort.addEventListener('click', closeDatabaseModal);
    const eject = el('button', 'database-modal-action', 'EJECT DATABASE');
    eject.type = 'button';
    eject.disabled = !slot.loaded;
    eject.addEventListener('click', () => {
        ejectDatabaseSlot(safeIndex);
        closeDatabaseModal();
    });
    actions.append(abort, eject);
    body.append(status, details, actions);
    abort.focus();
}

/* ------------------------------------------------------------------ *
 * EJECT command
 * ------------------------------------------------------------------ */

export function handleEjectCommand(args) {
    const request = normalizeStatusKey(args).replace(/_/g, ' ');
    if (!request) {
        clearOutput({ force: true });
        print('');
        print('Usage: /EJECT ALL DATABASE or /EJECT DATABASE SLOT 1', 't-amber');
        print('');
        return;
    }

    if (['all database', 'all databases', 'database all', 'databases all'].includes(request)) {
        ejectAllDatabases();
        return;
    }

    const slotMatch = request.match(/(?:database\s+)?slot\s+([123])$/) || request.match(/database\s+([123])$/);
    if (slotMatch) {
        ejectDatabaseSlot(Number.parseInt(slotMatch[1], 10) - 1);
        return;
    }

    clearOutput({ force: true });
    print('');
    print('EJECT COMMAND NOT RECOGNIZED', 't-red');
    print('Use /EJECT ALL DATABASE or /EJECT DATABASE SLOT 1 / 2 / 3.', 't-dim');
    print('');
}
