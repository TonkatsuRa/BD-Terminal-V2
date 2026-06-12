function showCategories(options = {}) {
    if (!databaseLoaded) {
        printNoDatabaseLoaded();
        return;
    }

    if (options.clear !== false) clearOutput();
    const categories = {};
    visibleDatabaseEntries().forEach(entry => {
        if (!categories[entry.category]) categories[entry.category] = 0;
        categories[entry.category]++;
    });

    print('');
    print('DATABASE CATEGORIES', 't-bright');
    print('═══════════════════════════════════', 't-dim');
    for (let cat in categories) {
        const cls = cat === 'CONFIDENTIAL' ? 't-magenta' : 't-cyan';
        print(`  ${cat} .................. ${categories[cat]} entries`, cls);
    }
    print('═══════════════════════════════════', 't-dim');
    print('');
}

function normalizeSearchText(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function compactEntryText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function splitEntryKeywords(value) {
    return String(value || '')
        .split(/[;,|\n]+/)
        .map(keyword => keyword.trim())
        .filter(Boolean);
}

function entryTopic(entry) {
    return compactEntryText(entry.topic || entry.title || entry.entry || 'Untitled Entry');
}

function entryIdOrPerson(entry) {
    return compactEntryText(entry.idOrPerson || entry.person || entry.subject || entry.id || '');
}

function entryDate(entry) {
    return compactEntryText(entry.date || '');
}

function entryKeywords(entry) {
    return splitEntryKeywords(entry.keywords || entry.tags || '').join('; ');
}

function entryMessage(entry) {
    return String(entry.message ?? entry.content ?? '').trim();
}

function normalizeEntryAccess(value, entry = {}) {
    const raw = String(value || '').trim().toLowerCase();
    const clearance = Number.parseInt(entry.clearance || value || '0', 10);
    const category = String(entry.category || '').trim().toLowerCase();

    if (raw === ACCESS_LEVELS.admin || raw.includes('admin') || raw.includes('full')) {
        return ACCESS_LEVELS.admin;
    }
    if (raw === ACCESS_LEVELS.elevated || raw.includes('elevated') || raw.includes('shareholder')) {
        return ACCESS_LEVELS.elevated;
    }
    if (raw === ACCESS_LEVELS.employee || raw.includes('employee') || raw.includes('cleared') || raw.includes('public')) {
        return ACCESS_LEVELS.employee;
    }
    if (raw.includes('confidential') || category === 'confidential' || clearance >= 4) return ACCESS_LEVELS.admin;
    if (raw.includes('restricted') || clearance >= 3) {
        return ACCESS_LEVELS.elevated;
    }
    return ACCESS_LEVELS.employee;
}

function entryAccessLevel(entry) {
    return normalizeEntryAccess(entry.access || entry.clearance, entry);
}

function canReadEntry(entry) {
    return hasAccess(entryAccessLevel(entry));
}

function redactMessageContent(text) {
    return String(text || '').replace(/[^\s]/g, '█');
}

function accessDisplayClass(level) {
    return accessLevelClass(level);
}

function entrySourceLabel(entry) {
    return compactEntryText(entry.databaseSource || entry.source || entry.databaseFile || databaseSource || 'MOUNTED DATABASE');
}

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
            { name: 'message', label: 'MESSAGE', text: entryMessage(entry), weight: 34 }
        );
    }

    return fields.filter(field => compactEntryText(field.text));
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
    const sourceText = compactEntryText(
        matchedField === 'topic' ? entryTopic(entry) :
        matchedField === 'keywords' ? entryKeywords(entry) :
        matchedField === 'date' ? entryDate(entry) :
        matchedField === 'idOrPerson' ? entryIdOrPerson(entry) :
        entryMessage(entry)
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

function rankDatabaseEntries(term, entries, options = {}) {
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

function searchDatabase(term) {
    const matches = rankDatabaseEntries(term, visibleDatabaseEntries(), { mode: 'search', fuzzy: false, limit: 12 });
    printSearchResults(term, matches, { mode: 'SEARCH', fuzzy: false });
}

async function fuzzySearch(term) {
    const entries = visibleDatabaseEntries();
    const matches = fuzzySearchEntries(term, entries);
    printSearchResults(term, matches, { mode: 'FSEARCH', fuzzy: true });
}

function databaseFuseSignature(entries) {
    return entries
        .map(entry => [
            entry.databaseSlot || '',
            entry.id || '',
            entry.title || '',
            entry.category || '',
            entry.tags || '',
            entry.date || '',
            entry.access || ''
        ].join(':'))
        .join('|');
}

function getDatabaseFuse(entries, includeConfidential) {
    if (typeof window.Fuse !== 'function') return null;
    const signature = databaseFuseSignature(entries);
    if (
        databaseFuseCache.fuse &&
        databaseFuseCache.signature === signature &&
        databaseFuseCache.includeConfidential === includeConfidential
    ) {
        return databaseFuseCache.fuse;
    }

    try {
        databaseFuseCache = {
            signature,
            includeConfidential,
            fuse: new window.Fuse(entries, {
                includeScore: true,
                ignoreLocation: true,
                threshold: 0.36,
                minMatchCharLength: 2,
                keys: [
                    { name: 'title', weight: 0.42 },
                    { name: 'id', weight: 0.22 },
                    { name: 'tags', weight: 0.2 },
                    { name: 'category', weight: 0.08 },
                    { name: 'content', weight: 0.08 }
                ]
            })
        };
    } catch (error) {
        databaseFuseCache = { signature: '', includeConfidential: false, fuse: null };
        return null;
    }
    return databaseFuseCache.fuse;
}

function fuzzySearchEntries(term, entries, includeConfidential = adminMode) {
    lastFuzzySearchUsedFuse = false;
    return rankDatabaseEntries(term, entries, { mode: 'fsearch', fuzzy: true, limit: 18 });
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
        if (!options.fuzzy) print('Use /FSEARCH with Elevated clearance to search message content.', 't-dim');
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

function listAllEntries() {
    if (!databaseLoaded) {
        printNoDatabaseLoaded();
        return;
    }

    const categories = {};
    for (const entry of databaseEntries) {
        if (!categories[entry.category]) categories[entry.category] = [];
        categories[entry.category].push(entry);
    }

    print('');
    print('COMPLETE DATABASE INDEX', 't-amber');
    print('--- TITLE / CATEGORY INDEX ------------------------------', 'cli-divider t-dim');
    for (let cat in categories) {
        const cls = cat === 'CONFIDENTIAL' ? 't-magenta' : 't-cyan';
        print(`[${cat}] ${categories[cat].length} ENTRIES`, cls);
        categories[cat]
            .sort((a, b) => entryTopic(a).localeCompare(entryTopic(b)))
            .forEach((entry, index) => {
                const marker = String(index + 1).padStart(2, '0');
                const keywords = entryKeywords(entry);
                const access = entryAccessLevel(entry);
                const siteTag = entry.hiddenSiteDefault ? `[${entry.connectedSiteId || 'SITE'}] ` : '';
                print(`  ${marker}. ${siteTag}${entryTopic(entry)} :: ${entryDate(entry) || 'UNDATED'} :: ${accessLevelLabel(access)}`, accessDisplayClass(access));
                if (keywords) print(`      keywords: ${keywords}`, 't-dim');
            });
        print('');
    }
}

function visibleDatabaseEntries(includeConfidential = adminMode) {
    return databaseEntries.slice();
}

function entryRequiresAdmin(entry) {
    return entryAccessLevel(entry) === ACCESS_LEVELS.admin;
}

function printEntry(entry, options = {}) {
    const access = entryAccessLevel(entry);
    const cls = accessDisplayClass(access);
    const readable = canReadEntry(entry);
    const label = options.index
        ? `RESULT ${String(options.index).padStart(2, '0')}/${String(options.total || options.index).padStart(2, '0')}`
        : 'DATABASE ENTRY';
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
            const snippet = !readable && options.match.matchedField === 'message'
                ? redactMessageContent(options.match.snippet)
                : options.match.snippet;
            print(`| SNIPPET   : ${snippet}`, !readable && options.match.matchedField === 'message' ? 't-red' : 't-dim');
        }
    }
    print(`+${'-'.repeat(60)}`, 'entry-divider t-dim');
    if (!readable) print(`| MESSAGE   : REDACTED - ${accessLevelLabel(access).toUpperCase()} CLEARANCE REQUIRED`, 't-red');
    const message = readable ? entryMessage(entry) : redactMessageContent(entryMessage(entry));
    // Re-balance any [color=...] tags that span multiple lines so each
    // physical line is self-contained for the line-by-line print() pipeline.
    const messageText = readable && typeof balanceColorTagsAcrossLines === 'function'
        ? balanceColorTagsAcrossLines(String(message || 'NO MESSAGE TEXT AVAILABLE.'))
        : String(message || 'NO MESSAGE TEXT AVAILABLE.');
    messageText.split('\n').forEach(line => {
        const trimmed = line.trim();
        // Embedded image lines get printed without the "| " prefix so the
        // terminal renderer can replace them with the <img> element directly.
        // IMG_LINE_RE is defined in js/utils.js — shared with terminal.js so
        // editor-side detection and renderer-side detection cannot drift.
        if (readable && IMG_LINE_RE.test(trimmed)) {
            print(trimmed, 'entry-image-line');
        } else {
            print(`| ${line}`, readable ? '' : 't-red');
        }
    });
    print(`+${'-'.repeat(60)}`, 'entry-divider t-dim');
    print('');
}

function databaseCapacityFull() {
    return databaseSlots.every(slot => slot.loaded);
}

function firstEmptyDatabaseSlotIndex() {
    return databaseSlots.findIndex(slot => !slot.loaded);
}

function databaseSlotDisplayName(slot) {
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
    return [
        item.id,
        item.file,
        item.filename,
        item.displayName,
        item.name
    ].map(normalizeDatabaseIdentity).filter(Boolean);
}

function parsedDatabaseIdentities(parsed = {}, item = {}, path = '') {
    return [
        parsed.metadata?.id,
        parsed.metadata?.title,
        parsed.source,
        item.id,
        item.file,
        item.filename,
        item.displayName,
        item.name,
        path
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

function databaseItemAlreadyMounted(item = {}) {
    return databaseAlreadyMountedByIdentities(databaseItemIdentities(item));
}

async function mountParsedDatabase(parsed, item = {}, path = '') {
    if (databaseAlreadyMountedByIdentities(parsedDatabaseIdentities(parsed, item, path))) {
        AudioEngine.errorBuzz();
        clearOutput();
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
    if (typeof runDatabaseLoadLog === 'function') {
        await runDatabaseLoadLog(source, entries.length, slotIndex + 1);
    } else {
        print('');
    }
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

function rebuildDatabaseIndex() {
    database = {};
    databaseEntries = [];
    databaseFuseCache = {
        signature: '',
        includeConfidential: false,
        fuse: null
    };
    databaseSlots.forEach(slot => {
        if (!slot.loaded) return;
        slot.entries.forEach(entry => {
            databaseEntries.push(entry);
            const titleKey = String(entryTopic(entry) || '').toLowerCase();
            if (titleKey && !database[titleKey]) database[titleKey] = entry;
            const idKey = String(entry.id || '').toLowerCase();
            if (idKey && !database[idKey]) database[idKey] = entry;
            const personKey = String(entryIdOrPerson(entry) || '').toLowerCase();
            if (personKey && !database[personKey]) database[personKey] = entry;
        });
    });
    const siteEntries = typeof getConnectedSiteDatabaseEntries === 'function'
        ? getConnectedSiteDatabaseEntries()
        : [];
    siteEntries.forEach(entry => {
        databaseEntries.push(entry);
        const titleKey = String(entryTopic(entry) || '').toLowerCase();
        if (titleKey && !database[titleKey]) database[titleKey] = entry;
        const idKey = String(entry.id || '').toLowerCase();
        if (idKey && !database[idKey]) database[idKey] = entry;
        const personKey = String(entryIdOrPerson(entry) || '').toLowerCase();
        if (personKey && !database[personKey]) database[personKey] = entry;
    });

    databaseLoaded = databaseEntries.length > 0;
    const manualSources = databaseSlots
        .filter(slot => slot.loaded)
        .map(slot => databaseSlotDisplayName(slot));
    const siteSources = connectedSiteDatabase?.source ? [connectedSiteDatabase.source] : [];
    databaseSource = [...manualSources, ...siteSources].join(', ') || 'NO DATABASE';
    setAppState({ databaseLoaded }, { resetSelection: false });
    updateEntryCount();
    updateDatabaseSlotIndicators();
}

function updateDatabaseSlotIndicators() {
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

function showDatabaseSlotDialog(slotIndex) {
    const safeIndex = Math.max(0, Math.min(DATABASE_SLOT_COUNT - 1, Number.parseInt(slotIndex, 10) || 0));
    const slot = databaseSlots[safeIndex];
    const { body } = createDatabaseModal(`DATABASE SLOT ${safeIndex + 1}`);
    body.textContent = '';

    const status = document.createElement('p');
    status.className = `database-modal-copy ${slot.loaded ? 't-cyan' : 't-red'}`;
    status.textContent = slot.loaded ? 'STATUS: DATABASE LOADED' : 'STATUS: NO DATABASE LOADED';

    const details = document.createElement('pre');
    details.className = 'database-slot-details';
    details.textContent = slot.loaded
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
        ].join('\n');

    const actions = document.createElement('div');
    actions.className = 'database-modal-actions';
    const abort = document.createElement('button');
    abort.className = 'database-modal-action secondary';
    abort.type = 'button';
    abort.textContent = 'ABORT';
    abort.addEventListener('click', closeDatabaseModal);
    const eject = document.createElement('button');
    eject.className = 'database-modal-action';
    eject.type = 'button';
    eject.textContent = 'EJECT DATABASE';
    eject.disabled = !slot.loaded;
    eject.addEventListener('click', () => {
        ejectDatabaseSlot(safeIndex);
        closeDatabaseModal();
    });
    actions.append(abort, eject);
    body.append(status, details, actions);
    abort.focus();
}

function ejectDatabaseSlot(slotIndex, options = {}) {
    const safeIndex = Number.parseInt(slotIndex, 10);
    if (!Number.isFinite(safeIndex) || safeIndex < 0 || safeIndex >= DATABASE_SLOT_COUNT) return false;
    const slot = databaseSlots[safeIndex];
    if (!slot.loaded) {
        if (!options.silent) {
            AudioEngine.errorBuzz();
            clearOutput();
            print('');
            print(`DATABASE SLOT ${safeIndex + 1} IS EMPTY`, 't-amber');
            print('');
        }
        return false;
    }

    const source = databaseSlotDisplayName(slot);
    databaseSlots[safeIndex] = {
        index: safeIndex,
        loaded: false,
        source: '',
        file: '',
        metadata: {},
        entries: []
    };
    rebuildDatabaseIndex();
    AudioEngine.pageFlip();
    if (!options.silent) {
        clearOutput();
        print('');
        print(`DATABASE SLOT ${safeIndex + 1} EJECTED`, 't-amber');
        print(`Database: ${source}`, 't-dim');
        print(`Mounted packages: ${databaseSlots.filter(item => item.loaded).length}/${DATABASE_SLOT_COUNT}`, 't-cyan');
        print('');
    }
    return true;
}

function ejectAllDatabases() {
    const loadedCount = databaseSlots.filter(slot => slot.loaded).length;
    if (!loadedCount) {
        AudioEngine.errorBuzz();
        clearOutput();
        print('');
        print('NO DATABASES LOADED', 't-amber');
        print('');
        return;
    }

    databaseSlots = databaseSlots.map((slot, index) => ({
        index,
        loaded: false,
        source: '',
        file: '',
        metadata: {},
        entries: []
    }));
    rebuildDatabaseIndex();
    AudioEngine.pageFlip();
    clearOutput();
    print('');
    print('ALL DATABASE SLOTS EJECTED', 't-amber');
    print(`Packages ejected: ${loadedCount}`, 't-dim');
    print('');
}


// ========================================
// FILE HANDLING
// ========================================
// Internal ZIP transport key. This is spoiler-friction obfuscation for a static site,
// not real secrecy against a player who inspects the JavaScript source.
const DATABASE_ZIP_KEY_HEX_PARTS = ['5368656c', '62795368', '656c6279', '313233'];

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
    return zipEntryName({ filename: name })
        .replace(/^\.\//, '')
        .toLowerCase();
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
        return {
            content,
            entryName,
            source: `${sourceName}:${entryName}`
        };
    } finally {
        await reader.close();
    }
}

function handleFileSelect(e) {
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
    reader.onload = async function(event) {
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
        } catch (error) {
            pendingLocalDatabaseItem = null;
            AudioEngine.errorBuzz();
            print('');
            print('ERROR: DATABASE LOAD FAILED', 't-red');
            print('No readable Markdown or legacy entries were found.', 't-dim');
            print('');
        }
    };
    reader.onerror = function() {
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
    } catch (error) {
        AudioEngine.errorBuzz();
        print('');
        print('ERROR: ZIP DATABASE DECRYPTION FAILED', 't-red');
        print('Package key is invalid, ZIP support is unavailable, or no readable database file was found inside.', 't-dim');
        print('');
    } finally {
        pendingLocalDatabaseItem = null;
    }
}

function decodeEncryptedPayload(encoded) {
    const raw = atob(String(encoded || '').trim());
    const legacyPlaintext = xorCrypt(raw);
    let utf8Plaintext = '';

    try {
        const utf8Encrypted = decodeURIComponent(escape(raw));
        utf8Plaintext = xorCrypt(utf8Encrypted);
    } catch (error) {}

    return {
        legacyPlaintext,
        utf8Plaintext,
        preferred: utf8Plaintext || legacyPlaintext
    };
}

function decodeDatabasePayload(encoded) {
    const decoded = decodeEncryptedPayload(encoded);
    if (decoded.legacyPlaintext.includes(':') && decoded.legacyPlaintext.includes('|')) return decoded.legacyPlaintext;
    if (decoded.utf8Plaintext.includes(':') && decoded.utf8Plaintext.includes('|')) return decoded.utf8Plaintext;
    if (parseMarkdownDatabase(decoded.utf8Plaintext).entries.length) return decoded.utf8Plaintext;
    if (parseMarkdownDatabase(decoded.legacyPlaintext).entries.length) return decoded.legacyPlaintext;
    return decoded.preferred;
}

function decodeStatusPayload(encoded) {
    const decoded = decodeEncryptedPayload(encoded);
    const candidates = [decoded.utf8Plaintext, decoded.legacyPlaintext].filter(Boolean);
    return candidates.find(content => parseStatusProfile(content).loaded) || decoded.preferred;
}

function handleStatusFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.txt') || fileName.endsWith('.md') || fileName.endsWith('.markdown') || fileName.endsWith('.dat') || fileName.endsWith('.db') || fileName.endsWith('.bin')) {
        loadStatusProfileFile(file);
    } else {
        AudioEngine.errorBuzz();
        print('');
        print('ERROR: Unsupported status profile format.', 't-red');
        print('Expected: .txt, .md, .markdown, or encrypted .dat', 't-dim');
        print('');
    }
    e.target.value = '';
}

async function fetchTextFile(path) {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
    return response.text();
}

async function loadDatabaseManifest() {
    if (databaseManifest) return databaseManifest;
    try {
        const response = await fetch('databases/manifest.json', { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const manifest = await response.json();
        if (!manifest || !Array.isArray(manifest.databases)) throw new Error('Invalid manifest');
        databaseManifestSource = 'manifest';
        databaseManifest = manifest.databases;
    } catch (error) {
        databaseManifestSource = 'fallback';
        databaseManifest = FALLBACK_DATABASE_MANIFEST.map(item => ({ ...item, fallback: true }));
    }
    return databaseManifest;
}

function closeDatabaseModal() {
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
    const overlay = document.createElement('div');
    overlay.className = 'database-modal-overlay';
    overlay.id = 'databaseModal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'databaseModalTitle');

    const panel = document.createElement('div');
    panel.className = 'database-modal-panel glow';

    const header = document.createElement('div');
    header.className = 'database-modal-header';
    const title = document.createElement('div');
    title.className = 'database-modal-title';
    title.id = 'databaseModalTitle';
    title.textContent = titleText;
    const close = document.createElement('button');
    close.className = 'database-modal-close';
    close.type = 'button';
    close.textContent = '[ CLOSE ]';
    close.addEventListener('click', closeDatabaseModal);
    header.append(title, close);

    const body = document.createElement('div');
    body.className = 'database-modal-body';
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
    const intro = document.createElement('p');
    intro.className = 'database-modal-copy';
    intro.textContent = 'Select a database package.';
    body.appendChild(intro);

    if (databaseManifestSource === 'fallback') {
        const warning = document.createElement('p');
        warning.className = 'database-modal-copy t-amber';
        warning.textContent = 'Manifest fetch is blocked or unavailable. Showing the default database list. If you opened index.html directly, the next step may ask you to select the matching local database package manually.';
        body.appendChild(warning);
    }

    const list = document.createElement('div');
    list.className = 'database-list';
    manifest.forEach(item => {
        const alreadyMounted = databaseItemAlreadyMounted(item);
        const button = document.createElement('button');
        button.className = `database-choice ${alreadyMounted ? 'disabled mounted' : ''}`.trim();
        button.type = 'button';
        button.disabled = alreadyMounted;
        if (alreadyMounted) button.setAttribute('aria-disabled', 'true');
        const name = document.createElement('span');
        name.className = 'database-choice-name';
        name.textContent = item.displayName || item.name || item.file;
        const description = document.createElement('span');
        description.className = 'database-choice-description';
        description.textContent = alreadyMounted
            ? 'DATABASE ALREADY LOADED - eject its slot to load it again.'
            : (item.description || item.file);
        button.append(name, description);
        if (!alreadyMounted) button.addEventListener('click', () => prepareManifestDatabase(item));
        list.appendChild(button);
    });
    body.appendChild(list);

    const external = document.createElement('button');
    external.className = 'database-choice database-choice-external';
    external.type = 'button';
    const externalName = document.createElement('span');
    externalName.className = 'database-choice-name';
    externalName.textContent = 'ADD EXTERNAL DATABASE FILE';
    const externalDescription = document.createElement('span');
    externalDescription.className = 'database-choice-description';
    externalDescription.textContent = 'Open local file picker for .md, .txt, .zip, or encrypted .dat database packages.';
    external.append(externalName, externalDescription);
    external.addEventListener('click', () => {
        if (databaseCapacityFull()) {
            renderDatabaseSlotsFullPrompt(body);
            return;
        }
        pendingLocalDatabaseItem = { file: 'external database', displayName: 'External Database' };
        document.getElementById('fileInput').click();
    });
    body.appendChild(external);
}

async function showDatabaseSelector() {
    const { body } = createDatabaseModal('LOAD DATABASE');
    if (databaseCapacityFull()) {
        renderDatabaseSlotsFullPrompt(body);
        return;
    }
    body.textContent = 'Reading database manifest...';

    const manifest = await loadDatabaseManifest();
    renderDatabaseSelectorList(body, manifest);
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
    } catch (error) {
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
    const message = document.createElement('p');
    message.className = 'database-modal-copy t-amber';
    message.textContent = `${name} is already mounted. Eject that database slot before loading it again.`;
    const back = document.createElement('button');
    back.className = 'database-modal-action secondary';
    back.type = 'button';
    back.textContent = 'BACK TO DATABASE LIST';
    back.addEventListener('click', showDatabaseSelector);
    body.append(message, back);
    back.focus();
}

function renderDatabaseSlotsFullPrompt(body) {
    if (!body) return;
    body.textContent = '';
    const message = document.createElement('p');
    message.className = 'database-modal-copy t-red';
    message.textContent = 'DATABASE SLOT CAPACITY REACHED. Eject one database package before loading another.';
    const details = document.createElement('pre');
    details.className = 'database-slot-details';
    details.textContent = databaseSlots.map(slot => (
        `SLOT ${slot.index + 1}: ${slot.loaded ? databaseSlotDisplayName(slot) : 'EMPTY'}`
    )).join('\n');
    const actions = document.createElement('div');
    actions.className = 'database-modal-actions';
    const abort = document.createElement('button');
    abort.className = 'database-modal-action secondary';
    abort.type = 'button';
    abort.textContent = 'ABORT';
    abort.addEventListener('click', closeDatabaseModal);
    actions.appendChild(abort);
    databaseSlots.forEach(slot => {
        const eject = document.createElement('button');
        eject.className = 'database-modal-action';
        eject.type = 'button';
        eject.textContent = `EJECT SLOT ${slot.index + 1}`;
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
    const message = document.createElement('p');
    message.className = 'database-modal-copy t-amber';
    message.textContent = `${contentGet('errors.database_package_fail', 'DATABASE PACKAGE FAILED TO LOAD.')} The browser could not fetch databases/${fileName}. On GitHub Pages, make sure the root .nojekyll file is uploaded so database packages are served as raw files. If you opened the page directly from disk, select that file manually from the databases folder.`;
    const select = document.createElement('button');
    select.className = 'database-modal-action';
    select.type = 'button';
    select.textContent = `SELECT ${fileName.toUpperCase()}`;
    select.addEventListener('click', () => {
        pendingLocalDatabaseItem = item;
        document.getElementById('fileInput').click();
    });
    const back = document.createElement('button');
    back.className = 'database-modal-action secondary';
    back.type = 'button';
    back.textContent = 'BACK TO DATABASE LIST';
    back.addEventListener('click', showDatabaseSelector);
    const actions = document.createElement('div');
    actions.className = 'database-modal-actions';
    actions.append(select, back);
    body.append(message, actions);
}

function renderDatabasePasswordPrompt(parsed, previousError = '') {
    clearDatabaseDecryptAnimation();
    const body = getById('databaseModalBody');
    if (!body) return;
    body.textContent = '';
    const title = document.createElement('p');
    title.className = 'database-modal-copy';
    title.textContent = `Selected: ${parsed.metadata.title || parsed.source}`;
    const description = document.createElement('p');
    description.className = 'database-modal-copy t-dim';
    description.textContent = parsed.metadata.description || 'Enter package clearance password.';
    const input = document.createElement('input');
    input.className = 'database-password-input';
    input.type = 'password';
    input.placeholder = 'Database password...';
    input.setAttribute('aria-label', 'Database password');
    const error = document.createElement('div');
    error.className = 'database-password-error';
    error.textContent = previousError;
    const actions = document.createElement('div');
    actions.className = 'database-modal-actions';
    const submit = document.createElement('button');
    submit.className = 'database-modal-action';
    submit.type = 'button';
    submit.textContent = 'AUTHENTICATE';
    submit.dataset.authenticateDatabase = 'true';
    const back = document.createElement('button');
    back.className = 'database-modal-action secondary';
    back.type = 'button';
    back.textContent = 'BACK';
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
    const title = document.createElement('p');
    title.className = 'database-modal-copy t-amber';
    title.textContent = `Decrypting: ${parsed.metadata.title || parsed.source}`;
    const box = document.createElement('pre');
    box.className = 'database-decrypt-box';
    box.setAttribute('aria-live', 'polite');
    const hint = document.createElement('p');
    hint.className = 'database-modal-copy t-dim';
    hint.textContent = 'Running package decryption. Stand by...';
    body.append(title, box, hint);

    AudioEngine.decryptSound();
    const startedAt = performance.now();
    const duration = 5000;
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
            void loadParsedDatabase(parsed);
            closeDatabaseModal();
        } else {
            AudioEngine.errorBuzz();
            renderDatabasePasswordPrompt(parsed, contentGet('errors.database_password_fail', 'ACCESS DENIED - INVALID DATABASE PASSWORD'));
        }
    }

    databaseDecryptFrame = requestAnimationFrame(render);
}

function parseSimpleMetadata(lines) {
    const values = {};
    lines.forEach(line => {
        const pair = line.match(/^([a-z0-9_.-]+)\s*:\s*(.*)$/i);
        if (pair) values[normalizeStatusKey(pair[1])] = cleanStatusValue(pair[2]);
    });
    return values;
}

function extractDateFromText(value) {
    const match = String(value || '').match(/\b(20\d{2}|207\d|208\d)[-./]\d{2}[-./]\d{2}\b/);
    return match ? match[0].replace(/[./]/g, '-') : '';
}

function parseMarkdownDatabase(content, source = 'Markdown database') {
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
        current.confidential = current.access === ACCESS_LEVELS.admin;
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
            }
            else if (key === 'id_or_person' || key === 'person' || key === 'subject') {
                current.idOrPerson = value;
            }
            else if (key === 'id') {
                current.id = value;
                if (!current.idOrPerson) current.idOrPerson = value;
            }
            else if (key === 'date') current.date = value;
            else if (key === 'access') current.access = normalizeEntryAccess(value, current);
            else if (key === 'keywords') {
                current.keywords = value;
                current.tags = value;
            } else if (key === 'tags') {
                current.tags = value;
                current.keywords = value;
            } else if (key === 'clearance_level' || key === 'clearance') {
                current.clearance = value;
                current.access = normalizeEntryAccess(value, current);
            } else if (key === 'category') {
                current.category = value;
            } else {
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
        entry.confidential = entry.access === ACCESS_LEVELS.admin;
    });

    return { source, metadata, entries };
}

async function loadParsedDatabase(parsed) {
    return mountParsedDatabase(parsed, activeDatabaseSelection?.item || {}, activeDatabaseSelection?.path || parsed.source || '');
}

function loadStatusProfileFile(file) {
    print('');
    print('STATUS PROFILE DETECTED', 't-amber');
    print(`Reading: ${file.name}`, 't-dim');

    const reader = new FileReader();
    reader.onload = async function(event) {
        try {
            const encrypted = /\.(dat|db|bin)$/i.test(file.name);
            const content = encrypted ? decodeStatusPayload(event.target.result) : event.target.result;
            const profile = parseStatusProfile(content, file.name);
            if (!profile.loaded) throw new Error('No profile keys found');
            setStatusProfile(profile);
            persistStatusProfile(profile, content);
            AudioEngine.dataLoaded();
            forceCloseRuntimeOverlays();
            print('');
            print('STATUS PROFILE LOADED', 't-cyan');
            print(`Source: ${statusProfile.source}`, 't-amber');
            print(`Fields: ${Object.keys(statusProfile.values).length}`, 't-cyan');
            print('Terminal restart required by status profile update.', 't-dim');
            print('Admin session will be revoked.', 't-amber');
            print('');
            setTimeout(restartTerminalAfterStatusLoad, prefersReducedMotion ? 120 : 900);
        } catch (error) {
            AudioEngine.errorBuzz();
            print('');
            print('ERROR: STATUS PROFILE FAILED', 't-red');
            print('No readable key/value fields were found or decryption failed.', 't-dim');
            print('Use /STATUS FORMAT to view the expected layout.', 't-dim');
            print('');
        }
    };
    reader.onerror = function() {
        AudioEngine.errorBuzz();
        print('');
        print('ERROR: Could not read status profile.', 't-red');
        print('');
    };
    reader.readAsText(file);
}

function loadEncryptedFile(file) {
    print('');
    print('ENCRYPTED DATABASE DETECTED', 't-amber');
    print('Decrypting...', 't-dim');

    AudioEngine.decryptSound();

    const reader = new FileReader();
    reader.onload = async function(event) {
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
        } catch (error) {
            AudioEngine.errorBuzz();
            print('');
            print('ERROR: DECRYPTION FAILED', 't-red');
            print('Database file may be corrupted.', 't-dim');
            print('');
        }
    };
    reader.onerror = function() {
        AudioEngine.errorBuzz();
        print('');
        print('ERROR: Could not read file.', 't-red');
        print('');
    };
    reader.readAsText(file);
}

function parseLegacyDatabase(content, source = 'Legacy database') {
    const entriesOut = [];
    const entries = content.split('\n\n');
    entries.forEach(entry => {
        entry = entry.trim();
        if (!entry) return;
        const colonIdx = entry.indexOf(':');
        if (colonIdx > -1) {
            const category = entry.substring(0, colonIdx).trim();
            const rest = entry.substring(colonIdx + 1);
            const pipeIdx = rest.indexOf('|');
            if (pipeIdx > -1) {
                const title = rest.substring(0, pipeIdx).trim();
                const entryContent = rest.substring(pipeIdx + 1).trim();
                const parsedEntry = {
                    id: title.toLowerCase().replace(/\s+/g, '-'),
                    idOrPerson: title,
                    topic: title,
                    title,
                    date: extractDateFromText(title),
                    category,
                    access: category === 'CONFIDENTIAL' ? ACCESS_LEVELS.admin : ACCESS_LEVELS.employee,
                    keywords: category,
                    tags: category,
                    message: entryContent,
                    content: entryContent
                };
                parsedEntry.confidential = parsedEntry.access === ACCESS_LEVELS.admin;
                entriesOut.push(parsedEntry);
            }
        }
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

function updateEntryCount() {
    const entries = databaseEntries.length ? databaseEntries : Object.values(database);
    const seen = new Set();
    const count = entries.filter(entry => {
        const title = entryTopic(entry);
        if (!entry || seen.has(title)) return false;
        seen.add(title);
        return true;
    }).length;
    const counter = document.getElementById('entryCount');
    if (counter) counter.textContent = count;
}
