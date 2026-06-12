// js/bridge.js — publishes the ES-module core on `window` for the classic
// legacy scripts in js/legacy/ (diagnostics, facility-status, ui/games,
// map-overlay, session-restore, debug). This file is the complete contract
// between the modern core and the ported visual layer: if a legacy script
// needs a new core symbol, expose it here — never reach into module files.

import { getById, clearElement, el } from './core/dom.js';
import {
    ENCRYPTION_KEY, xorCrypt, escapeHtml, IMG_LINE_RE, TERMINAL_COLOR_NAMES,
    normalizeStatusKey, cleanStatusValue
} from './core/utils.js';
import {
    motion, TYPEWRITER_CONFIG, EffectsController, effectsFrameMs,
    getEffectiveRenderProfile, getRenderWidgetInterval, detectBrowserProfile,
    safeModeActive, effectsLowActive, initializeSafeModeFromUrl,
    initMotionPreference, bindPreferenceListeners
} from './core/effects.js';
import { AudioEngine } from './core/audio.js';
import { typeSegments, typeTextSmooth, typeColoredTextSmooth } from './core/typewriter.js';
import { loadScriptOnce } from './core/loader.js';
import { asciiBar, asciiSweep, asciiGraph, spinner, heartbeat } from './core/ascii.js';
import {
    AppState, setAppState, syncAppUi, overlays,
    ACCESS_LEVELS, normalizeAccessLevel, hasAccess, accessLevelLabel, accessLevelClass
} from './core/state.js';
import { parseColorSegments, balanceColorTagsAcrossLines, lineHasColorMarkup } from './format/colors.js';
import { parseMarkdownDatabase, parseLegacyDatabase } from './format/database-format.js';
import { parseStatusProfile, sortStatusIds } from './format/status-format.js';
import {
    print, clearOutput, enqueueOutputLine, appendMutableOutputLine,
    renderTranscriptInstantFromBuffer, setLineText, scrollTranscriptToBottom,
    getOutputBuffer, setOutputBuffer
} from './terminal/output.js';
import { setCommandHistory, getCommandHistory } from './terminal/commands.js';
import {
    printAccessRequired, printAdminRequired, printNoDatabaseLoaded,
    printDatabaseSlotsFull, printNetworkUnavailable, printConnectedSiteRequired
} from './terminal/messages.js';
import {
    statusGet, statusNumber, statusBool, statusState, statusSectionIds,
    statusLineGroup, statusInterpolate, statusBlock,
    statusProfile, connectedSiteStatusProfile, terminalContent,
    setStatusProfile, setConnectedSiteStatusProfile, invalidateStatusCaches,
    contentGet, contentLines, contentClass,
    pauseRealtimePanels, resumeRealtimePanels, refreshStatusPanels, facilityCaches,
    loadStoredStatusProfile, loadTerminalContent
} from './features/status.js';
import {
    DATABASE_SLOT_COUNT, getDatabaseSlots, restoreDatabaseSlots, rebuildDatabaseIndex,
    updateDatabaseSlotIndicators, closeDatabaseModal, isDatabaseLoaded
} from './features/database.js';
import {
    snapshotConnectedSite, restoreConnectedSiteFromSnapshot, restoreConnectedSiteForToolScreen,
    getConnectedSiteDebugSnapshot, getConnectedSiteDatabaseEntries, updateConnectedSiteUi,
    getConnectedSite
} from './features/sites.js';
import { forceCloseRuntimeOverlays } from './features/access.js';
import { Animator } from './features/boot.js';
import {
    initTerminal, processCommand, executeCliCommand, updateMenuSelection,
    suspendTerminalRuntimeForMap, resumeTerminalRuntimeAfterMap,
    scheduleHologramStart, hologram, setSafeMode, setNetworkOnline,
    getSelectedMenuIndex, setSelectedMenuIndex, showHome
} from './features/terminal.js';

/* Plain function/object exposure. Legacy function declarations with the same
   name (e.g. the ascii helpers re-declared in diagnostics.js) harmlessly
   override these with identical implementations. */
Object.assign(window, {
    // dom / utils
    getById, clearElement, el,
    ENCRYPTION_KEY, xorCrypt, escapeHtml, IMG_LINE_RE, TERMINAL_COLOR_NAMES,
    normalizeStatusKey, cleanStatusValue,
    // effects
    EffectsController, effectsFrameMs, getEffectiveRenderProfile,
    getRenderWidgetInterval, detectBrowserProfile, safeModeActive, effectsLowActive,
    TYPEWRITER_CONFIG, initializeSafeModeFromUrl, bindPreferenceListeners,
    applyMotionPreference: initMotionPreference,
    loadStoredStatusProfile, loadTerminalContent,
    // audio / typewriter / loader / ascii
    AudioEngine, typeSegments, typeTextSmooth, typeColoredTextSmooth, loadScriptOnce,
    asciiBar, asciiSweep, asciiGraph, spinner, heartbeat,
    // state
    AppState, setAppState, ACCESS_LEVELS, normalizeAccessLevel, hasAccess,
    accessLevelLabel, accessLevelClass,
    syncAppStateFromLegacy: options => { syncAppUi(options || { resetSelection: false }); return AppState; },
    // formats
    parseColorSegments, balanceColorTagsAcrossLines, lineHasColorMarkup,
    parseMarkdownDatabase, parseLegacyDatabase, parseStatusProfile, sortStatusIds,
    // output
    print, clearOutput, enqueueOutputLine, appendMutableOutputLine,
    renderTranscriptInstantFromBuffer, setLineText, scrollTranscriptToBottom,
    renderCurrentPageInstant: () => scrollTranscriptToBottom(),
    // messages
    printAccessRequired, printAdminRequired, printNoDatabaseLoaded,
    printDatabaseSlotsFull, printNetworkUnavailable, printConnectedSiteRequired,
    // status store
    statusGet, statusNumber, statusBool, statusState, statusSectionIds,
    statusLineGroup, statusInterpolate, statusBlock,
    setStatusProfile, setConnectedSiteStatusProfile, invalidateStatusCaches,
    contentGet, contentLines, contentClass,
    pauseRealtimePanels, resumeRealtimePanels, refreshStatusPanels,
    // database
    DATABASE_SLOT_COUNT, rebuildDatabaseIndex, updateDatabaseSlotIndicators, closeDatabaseModal,
    // sites
    snapshotConnectedSite, restoreConnectedSiteFromSnapshot, restoreConnectedSiteForToolScreen,
    getConnectedSiteDebugSnapshot, getConnectedSiteDatabaseEntries, updateConnectedSiteUi,
    // access / boot / terminal
    forceCloseRuntimeOverlays, Animator,
    initTerminal, processCommand, executeCliCommand, updateMenuSelection,
    suspendTerminalRuntimeForMap, resumeTerminalRuntimeAfterMap,
    scheduleHologramStart, setSafeMode, setNetworkOnline, showHome
});

/* Accessor-backed globals: legacy scripts read/write these as bare variables
   (e.g. `diagnosticActive = true`). All configurable so a later function/var
   declaration cannot throw. */
function defineLiveGlobal(name, get, set) {
    Object.defineProperty(window, name, { configurable: true, get, set: set || (() => {}) });
}

// Motion preference (live — flips with the media query).
defineLiveGlobal('prefersReducedMotion', () => motion.reduced);
defineLiveGlobal('MOTION_SCALE', () => motion.scale);

// Overlay/animation flags shared between core and legacy renderers.
[
    'diagnosticActive', 'diagnosticFrame', 'diagnosticAnimFrame', 'diagnosticLastRender',
    'facilityActive', 'facilityFrame', 'facilityAnimFrame', 'facilityLastRender'
].forEach(key => {
    defineLiveGlobal(key, () => overlays[key], value => { overlays[key] = value; });
});

// Hologram preview state (js/legacy/ui.js).
defineLiveGlobal('hologramStarted', () => hologram.started, value => { hologram.started = Boolean(value); });

// Facility data caches (js/legacy/facility-status.js).
defineLiveGlobal('facilityZoneCache', () => facilityCaches.zones, value => { facilityCaches.zones = value; });
defineLiveGlobal('facilityLinkCache', () => facilityCaches.links, value => { facilityCaches.links = value; });
defineLiveGlobal('facilityContactCache', () => facilityCaches.contacts, value => { facilityCaches.contacts = value; });

// Session-restore integration points.
defineLiveGlobal('outputBuffer', () => getOutputBuffer(), value => setOutputBuffer(value));
defineLiveGlobal('databaseSlots', () => getDatabaseSlots(), value => restoreDatabaseSlots(value));
defineLiveGlobal('commandHistory', () => getCommandHistory(), value => setCommandHistory(value));
defineLiveGlobal('commandHistoryIndex', () => getCommandHistory().length); // managed internally
defineLiveGlobal('selectedMenuIndex', () => getSelectedMenuIndex(), value => setSelectedMenuIndex(value));
defineLiveGlobal('currentPage', () => 0); // pagination removed; kept for old snapshots
defineLiveGlobal('statusProfile', () => statusProfile, value => setStatusProfile(value));
defineLiveGlobal('connectedSiteStatusProfile', () => connectedSiteStatusProfile);
defineLiveGlobal('terminalContent', () => terminalContent);
defineLiveGlobal('effectsMode', () => EffectsController.mode());
defineLiveGlobal('adminMode', () => AppState.adminMode);
defineLiveGlobal('accessLevel', () => AppState.accessLevel);
defineLiveGlobal('databaseLoaded', () => isDatabaseLoaded());
defineLiveGlobal('connectedSite', () => getConnectedSite());
