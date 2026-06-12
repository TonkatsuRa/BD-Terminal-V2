// js/features/status.js — the status/content profile store.
// Three layered profiles feed every dynamic panel:
//   1. connectedSiteStatusProfile — diagnostic/facility data of the BRE site
//   2. statusProfile              — operator-loaded override (STATUS LOAD)
//   3. terminalContent            — content/terminal-content.md (copy deck)
// statusGet() resolves in that order.

import { getById } from '../core/dom.js';
import { normalizeStatusKey, escapeHtml } from '../core/utils.js';
import { motion, safeModeActive } from '../core/effects.js';
import { AudioEngine } from '../core/audio.js';
import { asciiBar, asciiSweep, asciiGraph, spinner, heartbeat } from '../core/ascii.js';
import { AppState, overlays } from '../core/state.js';
import { parseStatusProfile, sortStatusIds } from '../format/status-format.js';
import { print, clearOutput } from '../terminal/output.js';

export const STATUS_PROFILE_STORAGE_KEY = 'aresStatusProfile.v1';
export const CONNECTED_SITE_SESSION_KEY = 'aresConnectedSiteSession.v1';

export let statusProfile = {
    source: 'INTERNAL DEFAULT',
    loaded: false,
    values: {}
};

export let connectedSiteStatusProfile = {
    source: 'NO CONNECTED SITE',
    loaded: false,
    values: {}
};

export let terminalContent = {
    source: 'HARDCODED FALLBACK',
    loaded: false,
    values: {}
};

// Caches over the merged profile keys. The facility-status legacy module also
// keeps zone/link/contact caches that hang off these — exposed via bridge.
let statusProfileKeyCache = null;
const statusSectionIdCache = new Map();
const statusLineGroupCache = new Map();

/** Cache slots read/written by js/legacy/facility-status.js via the bridge. */
export const facilityCaches = {
    zones: null,
    links: null,
    contacts: null
};

export function invalidateStatusCaches() {
    statusProfileKeyCache = null;
    statusSectionIdCache.clear();
    statusLineGroupCache.clear();
    facilityCaches.zones = null;
    facilityCaches.links = null;
    facilityCaches.contacts = null;
}

export function setStatusProfile(profile) {
    statusProfile = profile;
    invalidateStatusCaches();
}

export function setConnectedSiteStatusProfile(profile) {
    connectedSiteStatusProfile = profile && profile.loaded ? profile : {
        source: 'NO CONNECTED SITE',
        loaded: false,
        values: {}
    };
    invalidateStatusCaches();
    applyTerminalContentToDom();
    refreshStatusPanels();
}

export function setTerminalContent(profile) {
    terminalContent = profile && profile.loaded ? profile : {
        source: 'HARDCODED FALLBACK',
        loaded: false,
        values: {}
    };
    invalidateStatusCaches();
    applyTerminalContentToDom();
}

/* ------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------ */

export function loadStoredStatusProfile() {
    try {
        const stored = JSON.parse(localStorage.getItem(STATUS_PROFILE_STORAGE_KEY) || 'null');
        if (!stored || !stored.content) return;
        const profile = parseStatusProfile(stored.content, stored.source || 'STORED STATUS PROFILE');
        if (profile.loaded) setStatusProfile(profile);
    } catch (_) {
        try { localStorage.removeItem(STATUS_PROFILE_STORAGE_KEY); } catch (_) {}
    }
}

export function persistStatusProfile(profile, content) {
    try {
        localStorage.setItem(STATUS_PROFILE_STORAGE_KEY, JSON.stringify({ source: profile.source, content }));
    } catch (_) {}
}

export function clearStoredStatusProfile() {
    try { localStorage.removeItem(STATUS_PROFILE_STORAGE_KEY); } catch (_) {}
}

/* ------------------------------------------------------------------ *
 * Getters (merged across the three profiles)
 * ------------------------------------------------------------------ */

export function statusGet(key, fallback = '') {
    const normalized = normalizeStatusKey(key);
    const siteValue = connectedSiteStatusProfile?.values?.[normalized];
    if (siteValue !== undefined && siteValue !== '') return siteValue;
    const value = statusProfile.values[normalized];
    if (value !== undefined && value !== '') return value;
    const contentValue = terminalContent.values[normalized];
    return contentValue === undefined || contentValue === '' ? fallback : contentValue;
}

export function statusNumber(key, fallback = 0, min = -Infinity, max = Infinity) {
    const value = Number.parseFloat(statusGet(key, fallback));
    if (!Number.isFinite(value)) return fallback;
    return Math.max(min, Math.min(max, value));
}

export function statusBool(key, fallback = true) {
    const rawValue = statusGet(key, fallback ? 'true' : 'false');
    const value = normalizeStatusKey(rawValue);
    if (['false', '0', 'no', 'off', 'disabled', 'hidden'].includes(value)) return false;
    if (['true', '1', 'yes', 'on', 'enabled', 'visible'].includes(value)) return true;
    return fallback;
}

export function statusState(key, fallback = 'ok') {
    const value = normalizeStatusKey(statusGet(key, fallback));
    if (['alert', 'critical', 'danger', 'red', 'fail', 'failed', 'breach', 'unknown', 'offline', 'malfunction', 'disconnected'].includes(value)) return 'alert';
    if (['warn', 'warning', 'amber', 'degraded', 'maintenance', 'service', 'partial', 'low', 'weak', 'intermittent', 'armed'].includes(value)) return 'warn';
    return 'ok';
}

export function statusSectionIds(prefix) {
    const prefixKey = `${normalizeStatusKey(prefix)}.`;
    const cached = statusSectionIdCache.get(prefixKey);
    if (cached) return cached.slice();

    const ids = new Set();
    if (!statusProfileKeyCache) {
        statusProfileKeyCache = Array.from(new Set([
            ...Object.keys(terminalContent.values),
            ...Object.keys(connectedSiteStatusProfile?.values || {}),
            ...Object.keys(statusProfile.values)
        ]));
    }
    statusProfileKeyCache.forEach(key => {
        if (!key.startsWith(prefixKey)) return;
        const id = key.slice(prefixKey.length).split('.')[0];
        if (id) ids.add(id);
    });
    const result = Array.from(ids);
    statusSectionIdCache.set(prefixKey, result);
    return result.slice();
}

export function statusLineGroup(prefix) {
    const cacheKey = normalizeStatusKey(prefix);
    const cached = statusLineGroupCache.get(cacheKey);
    if (cached) return cached.slice();

    const lines = [];
    for (let i = 1; i <= 12; i++) {
        const value = statusGet(`${prefix}.line${i}`, null);
        if (value !== null) lines.push(value);
    }
    if (!lines.length) {
        const packed = statusGet(`${prefix}.lines`, '');
        if (packed) {
            packed.split('|').map(line => line.trim()).filter(Boolean).forEach(line => lines.push(line));
        }
    }
    statusLineGroupCache.set(cacheKey, lines);
    return lines.slice();
}

/** Expand {spinner}/{sweep}/{graph}/{heartbeat}/{bar:key}/{value:key} tokens. */
export function statusInterpolate(text, frame) {
    return String(text)
        .replace(/\{spinner\}/gi, spinner(frame))
        .replace(/\{sweep(?::(\d+))?\}/gi, (_, width) => asciiSweep(frame, Number(width) || 20))
        .replace(/\{graph(?::(\d+))?\}/gi, (_, width) => asciiGraph(frame, Number(width) || 22))
        .replace(/\{heartbeat(?::(\d+))?\}/gi, (_, width) => heartbeat(frame, Number(width) || 38))
        .replace(/\{bar:([a-z0-9_.-]+)(?::(\d+))?\}/gi, (_, key, width) => asciiBar(statusNumber(key, 0, 0, 100), Number(width) || 18))
        .replace(/\{value:([a-z0-9_.-]+)\}/gi, (_, key) => statusGet(key, ''));
}

export function statusBlock(prefix, fallbackLines, frame) {
    const customLines = statusLineGroup(prefix);
    return (customLines.length ? customLines : fallbackLines)
        .map(line => statusInterpolate(line, frame))
        .join('\n');
}

/* ------------------------------------------------------------------ *
 * Terminal content (content/terminal-content.md)
 * ------------------------------------------------------------------ */

export async function loadTerminalContent() {
    try {
        const response = await fetch('content/terminal-content.md', { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const content = await response.text();
        setTerminalContent(parseStatusProfile(content, 'content/terminal-content.md'));
    } catch (_) {
        setTerminalContent({ loaded: false, values: {} });
    }
}

export function contentGet(key, fallback = '') {
    const normalized = normalizeStatusKey(key);
    const value = terminalContent.values[normalized];
    return value === undefined || value === '' ? fallback : value;
}

export function contentLines(prefix, fallbackLines = []) {
    const lines = [];
    for (let i = 1; i <= 120; i++) {
        const key = normalizeStatusKey(`${prefix}.line${i}`);
        if (Object.prototype.hasOwnProperty.call(terminalContent.values, key)) {
            lines.push(terminalContent.values[key]);
        }
    }
    if (lines.length) return lines;

    const packed = contentGet(`${prefix}.lines`, '');
    if (packed) return packed.split('|').map(line => line.trim()).filter(Boolean);
    return fallbackLines.slice();
}

export function contentClass(prefix, index, fallback = '') {
    return contentGet(`${prefix}.class${index + 1}`, fallback);
}

/** Build the boot logo markup from content overrides (sanitized spans). */
export function getBootLogoMarkup(fallbackMarkup) {
    const lines = contentLines('boot.logo', []);
    if (!lines.length) return fallbackMarkup;
    return lines
        .map((line, index) => {
            const className = contentClass('boot.logo', index, '')
                .split(/\s+/)
                .filter(name => /^t-[a-z]+$/i.test(name))
                .join(' ');
            const classAttr = className ? ` class="${escapeHtml(className)}"` : '';
            return `<span${classAttr}>${escapeHtml(line)}</span>`;
        })
        .join('\n');
}

export function applyTerminalContentToDom() {
    const title = contentGet('terminal.title', '');
    if (title) {
        document.title = title;
        document.querySelectorAll('.system-title').forEach(element => { element.textContent = title; });
    }

    const build = contentGet('terminal.build', '');
    if (build) {
        document.querySelectorAll('.header-info .hl').forEach((element, index) => {
            if (index === 0) element.textContent = build;
        });
    }

    const diagnosticTitle = statusGet('diagnostic.title', contentGet('diagnostic.title', ''));
    if (diagnosticTitle) {
        const element = getById('diagnosticTitle');
        if (element) element.textContent = diagnosticTitle;
    }
    const facilityTitle = statusGet('facility.title', contentGet('facility.title', ''));
    if (facilityTitle) {
        const element = getById('facilityTitle');
        if (element) element.textContent = facilityTitle;
    }
    const accessError = contentGet('admin.access_denied', '');
    if (accessError) {
        const element = getById('accessError');
        if (element) element.textContent = accessError;
    }

    document.querySelectorAll('.menu-item[data-cmd]').forEach(item => {
        const label = contentGet(`commands.${item.dataset.cmd}`, '');
        const labelElement = item.querySelector('span:not(.icon)');
        if (label && labelElement) labelElement.textContent = label.toUpperCase();
    });

    const diagnosticLabels = {
        diagNetworkCard: 'diagnostic.label.network',
        diagSecurityCard: 'diagnostic.label.security',
        diagOutpostCard: 'diagnostic.label.outposts',
        diagGeneratorCard: 'diagnostic.label.generator',
        diagPowerCard: 'diagnostic.label.power',
        diagAlarmCard: 'diagnostic.label.alarm',
        diagLifeCard: 'diagnostic.label.life',
        diagEventsCard: 'diagnostic.label.events',
        diagIntegrityCard: 'diagnostic.label.integrity',
        diagUplinkCard: 'diagnostic.label.uplink'
    };
    Object.entries(diagnosticLabels).forEach(([cardId, key]) => {
        const card = getById(cardId);
        const label = statusGet(key, contentGet(key, ''));
        const span = card ? card.querySelector('.diagnostic-label span:first-child') : null;
        if (label && span) span.textContent = label.toUpperCase();
    });

    const facilityLabels = {
        facilityOverview: 'facility.label.overview',
        facilityZones: 'facility.label.zones',
        facilityContacts: 'facility.label.contacts'
    };
    Object.entries(facilityLabels).forEach(([readoutId, key]) => {
        const readout = getById(readoutId);
        const label = statusGet(key, contentGet(key, ''));
        const titleElement = readout ? readout.closest('.facility-card')?.querySelector('.facility-card-title') : null;
        if (label && titleElement) titleElement.textContent = label.toUpperCase();
    });
}

/* ------------------------------------------------------------------ *
 * Boot sequence data
 * ------------------------------------------------------------------ */

export const DEFAULT_BOOT_SEQUENCE = [
    { type: 'line', text: '╔════════════════════════════════════════════╗', className: 't-dim' },
    { type: 'line', text: '║    ARES MACROTECHNOLOGY SYSTEMS v4.7.2     ║', className: 't-dim' },
    { type: 'line', text: '║       INITIALIZING BOOT SEQUENCE...        ║', className: 't-dim' },
    { type: 'line', text: '╚════════════════════════════════════════════╝', className: 't-dim' },
    { type: 'pause', duration: 160 },
    { type: 'blank' },
    { type: 'section', text: 'POWER AND FIRMWARE BUS' },
    { type: 'check', label: 'BIOS INIT', result: 'OK', status: 'loaded' },
    { type: 'check', label: 'MEMORY 640K BASE', result: 'OK', status: 'ok' },
    { type: 'check', label: 'EXT MEMORY 262144K', result: 'OK', status: 'ok' },
    { type: 'check', label: 'MEMORY INTEGRITY', result: 'OK', status: 'ok' },
    { type: 'check', label: 'CPU CORES', result: 'OK', status: 'operational' },
    { type: 'check', label: 'GPU ENGINE', result: 'OK', status: 'rendering' },
    { type: 'blank' },
    { type: 'section', text: 'KERNEL AND DEVICE CONTROL' },
    { type: 'check', label: 'KERNEL LOAD', result: 'OK', status: 'loaded' },
    { type: 'check', label: 'DEVICE DRIVERS', result: 'OK', status: 'loaded' },
    { type: 'check', label: 'FILESYSTEM MOUNT', result: 'OK', status: 'loaded' },
    { type: 'check', label: 'VIRTUAL MEMORY', result: 'OK', status: 'operational' },
    { type: 'blank' },
    { type: 'section', text: 'NETWORK CONNECTIONS' },
    { type: 'check', label: 'NET INTERFACE eth0', result: 'DISCONNECTED', status: 'malfunction' },
    { type: 'check', label: 'NET INTERFACE eth1', result: 'OFFLINE', status: 'unknown' },
    { type: 'check', label: 'EXTERNAL RELAY', result: 'FAILED', status: 'unknown' },
    { type: 'check', label: 'DRONE UPLINK', result: 'DEGRADED 77%', status: 'warn' },
    { type: 'check', label: 'MESH NETWORK', result: 'WEAK SIGNAL', status: 'operational' },
    { type: 'blank' },
    { type: 'section', text: 'DATABASE SYSTEMS' },
    { type: 'check', label: 'DATABASE MODULE', result: 'OK', status: 'operational' },
    { type: 'check', label: 'INDEX PARSER', result: 'OK', status: 'operational' },
    { type: 'check', label: 'INTEGRITY CHECK', result: 'OK', status: 'secure' },
    { type: 'check', label: 'QUERY ENGINE', result: 'OK', status: 'operational' },
    { type: 'blank' },
    { type: 'section', text: 'SECURITY PROTOCOLS' },
    { type: 'check', label: 'SECURITY PROTOCOL', result: 'ENGAGED', status: 'active' },
    { type: 'check', label: 'CLEARANCE LEVEL', result: 'RESTRICTED', status: 'warn' },
    { type: 'check', label: 'ENCRYPTION MODULE', result: 'ACTIVE', status: 'operational' },
    { type: 'check', label: 'CONFIDENTIAL FILES', result: 'LOCKED', status: 'warn' },
    { type: 'check', label: 'INTRUSION DETECTION', result: 'ARMED', status: 'operational' },
    { type: 'check', label: 'AUTONOMOUS DEFENSE SYSTEMS', result: 'ARMED', status: 'operational' },
    { type: 'check', label: 'DIS DETECTION SENSORS', result: 'DEGRADED', status: 'malfunction' },
    { type: 'blank' },
    { type: 'section', text: 'DISPLAY HANDOFF' },
    { type: 'check', label: 'PHOSPHOR GRID ALIGNMENT', result: 'SYNC', status: 'ok' },
    { type: 'check', label: 'TERMINAL READY', result: 'DONE', status: 'ok', final: true }
];

export function getBootSequence() {
    const stepIds = statusSectionIds('boot.step').sort(sortStatusIds);
    if (!stepIds.length) return DEFAULT_BOOT_SEQUENCE.map(step => ({ ...step }));

    const sequence = stepIds.map(id => {
        const prefix = `boot.step.${id}`;
        if (!statusBool(`${prefix}.enabled`, true)) return null;
        const type = normalizeStatusKey(statusGet(`${prefix}.type`, 'line'));
        if (type === 'pause') {
            return { type: 'pause', duration: Math.max(0, Math.round(statusNumber(`${prefix}.duration`, 160, 0, 20000))) };
        }
        if (type === 'blank') return { type: 'blank' };
        if (type === 'section') return { type: 'section', text: statusGet(`${prefix}.text`, '') };
        if (type === 'check') {
            return {
                type: 'check',
                label: statusGet(`${prefix}.label`, 'SYSTEM CHECK'),
                result: statusGet(`${prefix}.result`, 'OK'),
                status: normalizeStatusKey(statusGet(`${prefix}.status`, 'ok')),
                final: statusBool(`${prefix}.final`, false)
            };
        }
        return {
            type: 'line',
            text: statusGet(`${prefix}.text`, ''),
            className: statusGet(`${prefix}.class`, statusGet(`${prefix}.className`, ''))
        };
    }).filter(Boolean);

    return sequence.length ? sequence : DEFAULT_BOOT_SEQUENCE.map(step => ({ ...step }));
}

/* ------------------------------------------------------------------ *
 * Realtime panel lifecycle (delegates to legacy visual modules via window)
 * ------------------------------------------------------------------ */

export function refreshStatusPanels() {
    if (overlays.diagnosticActive) {
        overlays.diagnosticFrame = Math.max(overlays.diagnosticFrame, 48);
        window.resetDiagnosticWidgetRegistry?.();
        window.renderDiagnosticDashboard?.(performance.now(), { force: true });
    }
    if (overlays.facilityActive) {
        overlays.facilityFrame = Math.max(overlays.facilityFrame, motion.reduced ? 24 : 10);
        if (window.MapOverlayController?.isActive()) {
            window.MapOverlayController.refreshProfile();
        } else {
            window.renderFacilityStatus?.(performance.now());
        }
    }
}

export function pauseRealtimePanels() {
    window.stopSideTelemetryLoop?.();
    if (window.MapOverlayController?.isActive()) window.MapOverlayController.pause();
    if (overlays.diagnosticAnimFrame) {
        cancelAnimationFrame(overlays.diagnosticAnimFrame);
        overlays.diagnosticAnimFrame = null;
    }
    if (overlays.facilityAnimFrame) {
        cancelAnimationFrame(overlays.facilityAnimFrame);
        overlays.facilityAnimFrame = null;
    }
}

export function resumeRealtimePanels() {
    if (motion.reduced || !AppState.networkOnline) return;
    const mapActive = window.MapOverlayController?.isActive();
    if (!mapActive) window.startSideTelemetryLoop?.();
    if (overlays.diagnosticActive && !overlays.diagnosticAnimFrame && window.runDiagnosticLoop) {
        overlays.diagnosticLastRender = 0;
        overlays.diagnosticAnimFrame = requestAnimationFrame(window.runDiagnosticLoop);
    }
    if (overlays.facilityActive && mapActive) {
        window.MapOverlayController.resume();
    } else if (overlays.facilityActive && !overlays.facilityAnimFrame && !safeModeActive() && window.runFacilityLoop) {
        overlays.facilityLastRender = 0;
        overlays.facilityAnimFrame = requestAnimationFrame(window.runFacilityLoop);
    }
}

export function handleVisibilityChange() {
    if (document.hidden) pauseRealtimePanels();
    else resumeRealtimePanels();
}

/* ------------------------------------------------------------------ *
 * Commands
 * ------------------------------------------------------------------ */

export function clearStatusProfile() {
    setStatusProfile({ source: 'INTERNAL DEFAULT', loaded: false, values: {} });
    clearStoredStatusProfile();
    AudioEngine.pageFlip();
    refreshStatusPanels();
    print('');
    print('STATUS PROFILE CLEARED', 't-amber');
    print('Diagnostic and facility panels returned to internal defaults.', 't-dim');
    print('Stored boot/status override removed for the next page load.', 't-dim');
    print('');
}

export function showStatusFormatHelp() {
    clearOutput({ force: true });
    print('═══════════════════════════════════════════════════════', 't-dim');
    print('                STATUS PROFILE FORMAT', 't-bright');
    print('═══════════════════════════════════════════════════════', 't-dim');
    print('');
    print('Use a .txt, .md, or encrypted .dat file with [section] headers and key = value lines.', 't-cyan');
    print('You can also use Markdown headings like ## diagnostic.network.', 't-dim');
    print('Boot overrides are applied on the next page load after STATUS LOAD.', 't-dim');
    print('');
    print('[boot.step.001]', 't-amber');
    print('type = check');
    print('label = EXTERNAL RELAY');
    print('result = FAILED');
    print('status = unknown');
    print('');
    print('[facility.grid]', 't-amber');
    print('id = BDR-01');
    print('structure = 77');
    print('power = 61');
    print('reserve = 34');
    print('repair = 06 OPEN');
    print('');
    print('[facility.zone.lab]', 't-amber');
    print('state = alert');
    print('status = BIO TRACE');
    print('load = 42');
    print('');
    print('[diagnostic.network]', 't-amber');
    print('state = alert');
    print('status = DISCONNECTED');
    print('level = 62');
    print('line1 = FACILITY BUS : LOCAL ONLY {spinner}');
    print('line2 = LOCAL MESH   : {bar:diagnostic.network.level:18}');
    print('line3 = EXT RELAY    : FAILED / NO CARRIER');
    print('');
    print('Tokens: {spinner}, {sweep:20}, {graph:22}, {heartbeat:38},', 't-dim');
    print('        {bar:path.to.number:18}, {value:path.to.key}', 't-dim');
    print('');
    print('Commands: STATUS LOAD, STATUS CLEAR, STATUS FORMAT', 't-cyan');
    print('═══════════════════════════════════════════════════════', 't-dim');
}
