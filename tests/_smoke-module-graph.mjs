// Minimal DOM stubs so the module graph can evaluate under Node.
const noop = () => {};
const fakeElement = () => ({
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    dataset: {}, style: {}, setAttribute: noop, removeAttribute: noop, getAttribute: () => null,
    appendChild: noop, append: noop, remove: noop, addEventListener: noop, removeEventListener: noop,
    querySelector: () => null, querySelectorAll: () => [], textContent: '', focus: noop, closest: () => null
});
globalThis.window = globalThis;
globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: fakeElement,
    createTextNode: () => ({ data: '' }),
    addEventListener: noop,
    removeEventListener: noop,
    documentElement: fakeElement(),
    body: fakeElement(),
    hidden: false,
    title: ''
};
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "node", vendor: "" } });
globalThis.matchMedia = () => ({ matches: false, addEventListener: noop, addListener: noop });
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.sessionStorage = { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
globalThis.cancelAnimationFrame = noop;
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.fetch = async () => ({ ok: false, status: 0 });
globalThis.atob = s => Buffer.from(s, 'base64').toString('binary');
globalThis.location = { search: '', protocol: 'https:' };
globalThis.URLSearchParams = URLSearchParams;
globalThis.FileReader = class {};

const mod = await import('../js/bridge.js');
console.log('bridge.js evaluated OK');

// Verify the bridge published the legacy contract.
const required = [
  'getById','clearElement','escapeHtml','xorCrypt','ENCRYPTION_KEY','IMG_LINE_RE','TERMINAL_COLOR_NAMES',
  'print','clearOutput','enqueueOutputLine','appendMutableOutputLine','renderTranscriptInstantFromBuffer',
  'AppState','setAppState','ACCESS_LEVELS','hasAccess','accessLevelLabel','accessLevelClass',
  'AudioEngine','EffectsController','effectsFrameMs','getEffectiveRenderProfile','getRenderWidgetInterval',
  'detectBrowserProfile','safeModeActive','statusGet','statusNumber','statusBool','statusState',
  'statusSectionIds','statusLineGroup','statusInterpolate','statusBlock','sortStatusIds',
  'setStatusProfile','parseStatusProfile','contentGet','contentLines','contentClass',
  'pauseRealtimePanels','resumeRealtimePanels','refreshStatusPanels','Animator',
  'printNetworkUnavailable','printConnectedSiteRequired','printNoDatabaseLoaded',
  'suspendTerminalRuntimeForMap','resumeTerminalRuntimeAfterMap','syncAppStateFromLegacy',
  'snapshotConnectedSite','restoreConnectedSiteFromSnapshot','restoreConnectedSiteForToolScreen',
  'getConnectedSiteDatabaseEntries','updateConnectedSiteUi','getConnectedSiteDebugSnapshot',
  'DATABASE_SLOT_COUNT','rebuildDatabaseIndex','updateDatabaseSlotIndicators','closeDatabaseModal',
  'initTerminal','processCommand','executeCliCommand','updateMenuSelection','setSafeMode','setNetworkOnline',
  'initializeSafeModeFromUrl','applyMotionPreference','bindPreferenceListeners',
  'loadStoredStatusProfile','loadTerminalContent','scheduleHologramStart','forceCloseRuntimeOverlays',
  'asciiBar','asciiSweep','asciiGraph','spinner','heartbeat','typeTextSmooth','typeColoredTextSmooth',
  'parseColorSegments','balanceColorTagsAcrossLines','lineHasColorMarkup','parseMarkdownDatabase',
  'normalizeStatusKey','cleanStatusValue','loadScriptOnce','setLineText','scrollTranscriptToBottom',
  'renderCurrentPageInstant','TYPEWRITER_CONFIG','showHome'
];
const accessors = [
  'prefersReducedMotion','MOTION_SCALE','diagnosticActive','diagnosticFrame','diagnosticAnimFrame',
  'diagnosticLastRender','facilityActive','facilityFrame','facilityAnimFrame','facilityLastRender',
  'hologramStarted','facilityZoneCache','facilityLinkCache','facilityContactCache','outputBuffer',
  'databaseSlots','commandHistory','commandHistoryIndex','selectedMenuIndex','currentPage',
  'statusProfile','connectedSiteStatusProfile','terminalContent','effectsMode','adminMode',
  'accessLevel','databaseLoaded','connectedSite'
];
let missing = [];
for (const k of required) if (typeof globalThis[k] === 'undefined') missing.push(k);
for (const k of accessors) if (!Object.getOwnPropertyDescriptor(globalThis, k)) missing.push(k + ' (accessor)');
if (missing.length) { console.log('MISSING:', missing.join(', ')); process.exit(1); }
console.log('All', required.length + accessors.length, 'bridge symbols present');

// Quick behavior pokes (no DOM): state transitions + accessors.
globalThis.diagnosticActive = true;
if (!globalThis.diagnosticActive) { console.log('accessor write failed'); process.exit(1); }
globalThis.diagnosticActive = false;
globalThis.setAppState({ accessLevel: 'admin' });
if (globalThis.AppState.adminMode !== true) { console.log('setAppState adminMode failed'); process.exit(1); }
globalThis.setAppState({ accessLevel: 'employee' });
if (globalThis.hasAccess('admin')) { console.log('hasAccess failed'); process.exit(1); }
console.log('state transitions OK');

// app.js module graph also evaluates (registers DOMContentLoaded only).
await import('../js/app.js');
console.log('app.js evaluated OK');
