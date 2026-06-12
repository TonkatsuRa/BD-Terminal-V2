function getById(id) {
    const cached = domByIdCache.get(id);
    if (cached && cached.isConnected) return cached;

    const element = document.getElementById(id);
    if (element) {
        domByIdCache.set(id, element);
    } else {
        domByIdCache.delete(id);
    }
    return element;
}

function clearElement(element) {
    if (element) element.textContent = '';
}

function invalidateStatusCaches() {
    statusProfileKeyCache = null;
    statusSectionIdCache.clear();
    statusLineGroupCache.clear();
    facilityZoneCache = null;
    facilityLinkCache = null;
    facilityContactCache = null;
}

function setStatusProfile(profile) {
    statusProfile = profile;
    invalidateStatusCaches();
}

function setConnectedSiteStatusProfile(profile) {
    connectedSiteStatusProfile = profile && profile.loaded ? profile : {
        source: 'NO CONNECTED SITE',
        loaded: false,
        values: {}
    };
    invalidateStatusCaches();
    if (typeof applyTerminalContentToDom === 'function') applyTerminalContentToDom();
    if (typeof refreshStatusPanels === 'function') refreshStatusPanels();
}

function setTerminalContent(profile) {
    terminalContent = profile && profile.loaded ? profile : {
        source: 'HARDCODED FALLBACK',
        loaded: false,
        values: {}
    };
    invalidateStatusCaches();
    applyTerminalContentToDom();
}


// IMPORTANT: ENCRYPTION_KEY is also hard-coded in database-editor.html (the
// standalone editor has no <script src>). If you rotate it, update both
// places or encrypted .dat files exported by the editor will no longer
// decrypt in the terminal.
const ENCRYPTION_KEY = 'Shelby';
function xorCrypt(text) {
    let result = '';
    for (let i = 0; i < text.length; i++) {
        result += String.fromCharCode(text.charCodeAt(i) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length));
    }
    return result;
}

// Canonical HTML-escaping helper. Centralized here so callers across the
// codebase (status panels, search highlighters, etc.) don't define their own
// drifting copies. Note: standalone HTML files (database-studio.html,
// database-editor.html, diagnostics-editor.html) intentionally keep their own
// inline copies because they must stay double-clickable without script tags.
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Detector for an embedded-image line in markdown bodies. Lenient: tolerates
// an optional leading "| " table-style prefix that the database renderer adds
// to normal text lines. The two capture groups are (alt, dataUrl).
//   ![alt](data:image/png;base64,...)
// Both js/database.js and js/terminal.js use this single source of truth so
// the editor-side detection and renderer-side detection cannot drift.
const IMG_LINE_RE = /^\s*\|?\s*!\[([^\]]*)\]\((data:image\/[^)]+)\)\s*$/i;

// Canonical list of inline-color names supported by the terminal renderer and
// the Database Studio editor. Adding a new color here is the single point of
// change for the runtime regex. The matching CSS classes (.t-green, .t-amber,
// ...) live in css/terminal.css; the editor's preview swatches live in
// database-studio.html (which keeps its own list because it's standalone).
const TERMINAL_COLOR_NAMES = Object.freeze([
    'green', 'amber', 'cyan', 'red', 'magenta', 'dim', 'bright'
]);

