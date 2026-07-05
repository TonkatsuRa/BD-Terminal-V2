// js/core/state.js — central application state.
// All cross-module mutable state lives here (or in feature stores that this
// module aggregates). UI synchronization is event-driven: features register
// hooks with onUiSync() instead of being hard-wired.

import { getById } from './dom.js';
import { motion, safeModeActive, setSafeModeFlag } from './effects.js';

// Five clearance tiers (rank order): public 0 · employee 1 · restricted 2 ·
// management 3 · admin 4. The terminal itself starts at Employee; "public"
// exists as an ENTRY marking (readable by anyone who mounted the database).
export const ACCESS_LEVELS = Object.freeze({
    public: 'public',
    employee: 'employee',
    restricted: 'restricted',
    management: 'management',
    admin: 'admin'
});

const ACCESS_RANKS = { public: 0, employee: 1, restricted: 2, management: 3, admin: 4 };

const CLEARANCE_LABELS = {
    public: 'Public',
    employee: 'Employee',
    restricted: 'Restricted',
    management: 'Management',
    admin: 'Administrator'
};

export const ADMIN_PASSWORD = atob('YXBvY2FseXBzZQ==');
// Legacy "elevated" password now grants Management (rank 3).
export const MANAGEMENT_PASSWORD = 'Shareholdervalue';
// Restricted (rank 2) clearance password.
export const RESTRICTED_PASSWORD = 'profitmargin';
// Employee (rank 1) clearance password — the terminal now boots at Public.
export const EMPLOYEE_PASSWORD = 'ares123';

/** The single app-state record. Mutate only through setAppState(). */
export const AppState = {
    accessLevel: ACCESS_LEVELS.public,
    adminMode: false,
    clearanceLevel: CLEARANCE_LABELS.public,
    soundEnabled: true,
    networkOnline: false,
    databaseLoaded: false,
    connectedSiteId: '',
    activeOverlay: 'none',
    safeMode: false
};

/**
 * Shared overlay/animation flags. Exposed on `window` (via bridge.js) as the
 * bare globals the legacy visual modules read and write:
 * diagnosticActive, diagnosticFrame, facilityActive, ...
 */
export const overlays = {
    diagnosticActive: false,
    diagnosticFrame: 0,
    diagnosticAnimFrame: null,
    diagnosticLastRender: 0,
    facilityActive: false,
    facilityFrame: 0,
    facilityAnimFrame: null,
    facilityLastRender: 0
};

const uiSyncHooks = new Set();

/** Register a hook invoked after every state sync (menu lock states, site UI, ...). */
export function onUiSync(fn) {
    if (typeof fn === 'function') uiSyncHooks.add(fn);
}

export function normalizeOverlayName(name) {
    const value = String(name || '').trim().toLowerCase();
    return value || 'none';
}

export function normalizeAccessLevel(level) {
    const value = String(level || '').trim().toLowerCase();
    if (['admin', 'administrator', 'omega-admin', 'omega_admin'].includes(value)) return ACCESS_LEVELS.admin;
    // legacy "elevated" (and its password aliases) map to Management
    if (['management', 'manager', 'elevated', 'shareholder', 'shareholdervalue'].includes(value)) return ACCESS_LEVELS.management;
    if (value === 'restricted') return ACCESS_LEVELS.restricted;
    if (['public', 'everyone', 'open'].includes(value)) return ACCESS_LEVELS.public;
    return ACCESS_LEVELS.employee;
}

export function accessRank(level) {
    return ACCESS_RANKS[normalizeAccessLevel(level)] ?? ACCESS_RANKS.employee;
}

export function hasAccess(requiredLevel = ACCESS_LEVELS.employee) {
    return accessRank(AppState.accessLevel) >= accessRank(requiredLevel);
}

export function accessLevelLabel(level = AppState.accessLevel) {
    return CLEARANCE_LABELS[normalizeAccessLevel(level)] || CLEARANCE_LABELS.employee;
}

export function accessLevelClass(level = AppState.accessLevel) {
    const normalized = normalizeAccessLevel(level);
    if (normalized === ACCESS_LEVELS.admin) return 't-red';
    if (normalized === ACCESS_LEVELS.management) return 't-magenta';
    if (normalized === ACCESS_LEVELS.restricted) return 't-amber';
    if (normalized === ACCESS_LEVELS.public) return 't-green';
    return 't-cyan';
}

// Menu commands that require clearance. Used by syncAppUi to lock buttons.
export const MENU_ACCESS_REQUIREMENTS = {
    loadStatus: ACCESS_LEVELS.admin,
    list: ACCESS_LEVELS.admin,
    fsearch: ACCESS_LEVELS.management,
    logout: ACCESS_LEVELS.restricted
};

export function menuItemRequiredAccess(item) {
    if (!item) return ACCESS_LEVELS.employee;
    return MENU_ACCESS_REQUIREMENTS[item.dataset?.cmd]
        || (item.classList.contains('admin-cmd') ? ACCESS_LEVELS.admin : ACCESS_LEVELS.employee);
}

/**
 * Patch the app state and synchronize the UI.
 * @param {Object} patch
 * @param {Object} [options] - forwarded to UI sync hooks ({resetSelection})
 */
export function setAppState(patch = {}, options = {}) {
    if (!patch || typeof patch !== 'object') return AppState;
    const has = key => Object.prototype.hasOwnProperty.call(patch, key);

    if (has('accessLevel')) AppState.accessLevel = normalizeAccessLevel(patch.accessLevel);
    if (has('adminMode')) AppState.accessLevel = patch.adminMode ? ACCESS_LEVELS.admin : ACCESS_LEVELS.employee;
    if (has('soundEnabled')) AppState.soundEnabled = Boolean(patch.soundEnabled);
    if (has('networkOnline')) AppState.networkOnline = Boolean(patch.networkOnline);
    if (has('databaseLoaded')) AppState.databaseLoaded = Boolean(patch.databaseLoaded);
    if (has('connectedSiteId')) AppState.connectedSiteId = String(patch.connectedSiteId || '').trim().toUpperCase();
    if (has('activeOverlay')) AppState.activeOverlay = normalizeOverlayName(patch.activeOverlay);
    if (has('safeMode')) {
        setSafeModeFlag(patch.safeMode);
        AppState.safeMode = safeModeActive();
    }

    syncAppUi(options);
    return AppState;
}

/** Re-derive computed fields and update every state-driven DOM surface. */
export function syncAppUi(options = {}) {
    AppState.accessLevel = normalizeAccessLevel(AppState.accessLevel);
    AppState.adminMode = AppState.accessLevel === ACCESS_LEVELS.admin;
    AppState.clearanceLevel = accessLevelLabel(AppState.accessLevel);
    AppState.safeMode = safeModeActive();

    const clearance = getById('clearanceLevel');
    if (clearance) {
        clearance.textContent = AppState.clearanceLevel;
        clearance.classList.remove('t-green', 't-cyan', 't-amber', 't-red', 't-magenta');
        clearance.classList.add(accessLevelClass(AppState.accessLevel));
    }

    // Header-bar clearance chip (CLR …) mirrors the same state.
    const chipLevel = getById('clearanceChipLevel');
    const chipDot = getById('clearanceChipDot');
    if (chipLevel) {
        chipLevel.textContent = AppState.clearanceLevel.toUpperCase();
        chipLevel.classList.remove('t-green', 't-cyan', 't-amber', 't-red', 't-magenta');
        chipLevel.classList.add(accessLevelClass(AppState.accessLevel));
    }
    if (chipDot) {
        chipDot.classList.remove('cyan', 'warn', 'magenta', 'err');
        const dotClass = {
            [ACCESS_LEVELS.employee]: 'cyan',
            [ACCESS_LEVELS.restricted]: 'warn',
            [ACCESS_LEVELS.management]: 'magenta',
            [ACCESS_LEVELS.admin]: 'err'
        }[AppState.accessLevel];
        if (dotClass) chipDot.classList.add(dotClass);
    }

    const badge = getById('adminBadge');
    if (badge) badge.classList.toggle('active', AppState.adminMode);

    document.querySelectorAll('.menu-item.admin-cmd').forEach(item => {
        const required = menuItemRequiredAccess(item);
        const locked = !hasAccess(required);
        item.classList.toggle('locked', locked);
        item.classList.toggle('elevated-cmd', required === ACCESS_LEVELS.elevated);
        item.classList.toggle('admin-only-cmd', required === ACCESS_LEVELS.admin);
        item.setAttribute('aria-disabled', locked ? 'true' : 'false');
    });

    const soundLabel = getById('soundStatus');
    const soundDot = getById('soundDot');
    const soundToggle = getById('soundToggle');
    if (soundLabel) soundLabel.textContent = AppState.soundEnabled ? 'ON' : 'OFF';
    if (soundDot) soundDot.classList.toggle('err', !AppState.soundEnabled);
    if (soundToggle) {
        const soundState = AppState.soundEnabled ? 'on' : 'off';
        soundToggle.classList.toggle('offline', !AppState.soundEnabled);
        soundToggle.setAttribute('aria-label', `Sound ${soundState}. Activate to ${AppState.soundEnabled ? 'mute' : 'unmute'} terminal sound.`);
        soundToggle.title = `Sound: ${soundState.toUpperCase()}`;
    }

    const networkLabel = getById('networkStatus');
    const networkDot = getById('networkDot');
    const networkItem = getById('networkStatusItem');
    if (networkLabel) networkLabel.textContent = AppState.networkOnline ? 'ONLINE' : 'OFFLINE';
    if (networkDot) networkDot.classList.toggle('err', !AppState.networkOnline);
    if (networkItem) {
        const networkState = AppState.networkOnline ? 'online' : 'offline';
        networkItem.classList.toggle('offline', !AppState.networkOnline);
        networkItem.setAttribute('aria-label', `Network ${networkState}. Activate to toggle network state.`);
        networkItem.title = `Network: ${networkState.toUpperCase()}`;
    }

    document.querySelectorAll('[data-panel-cmd="diagnostic"], [data-panel-cmd="facility"], [data-panel-cmd="wireframe"]').forEach(button => {
        const command = String(button.dataset.panelCmd || '').toLowerCase();
        const requiresSite = command === 'diagnostic';
        const siteLocked = AppState.networkOnline && requiresSite && !AppState.connectedSiteId;
        button.classList.toggle('network-locked', !AppState.networkOnline);
        button.classList.toggle('site-locked', siteLocked);
        button.removeAttribute('aria-disabled');
        const label = button.dataset.panelLabel || button.textContent.replace(/\s+/g, ' ').trim() || 'Network system';
        button.setAttribute('aria-label', !AppState.networkOnline
            ? `${label}. Network offline; activate for unavailable-system message.`
            : siteLocked
                ? `${label}. Connect a BRE site before opening diagnostics.`
                : `${label}. Open network-dependent system.`);
    });

    if (document.body) {
        document.body.classList.toggle('admin-access-active', AppState.adminMode);
        document.body.classList.toggle('elevated-access-active', AppState.accessLevel === ACCESS_LEVELS.elevated);
        document.body.classList.toggle('network-offline', !AppState.networkOnline);
        document.body.classList.toggle('site-connected', Boolean(AppState.connectedSiteId));
        document.body.classList.toggle('safe-mode', AppState.safeMode);
        document.body.dataset.accessLevel = AppState.accessLevel;
        document.body.dataset.activeOverlay = AppState.activeOverlay;
        document.body.dataset.connectedSite = AppState.connectedSiteId || 'none';
    }

    uiSyncHooks.forEach(fn => {
        try { fn(options); } catch (_) { /* hooks must not break state sync */ }
    });
}

// Read-only structured debug view (DevTools: TerminalState.app, ...).
export function installDebugNamespace(extra = {}) {
    window.TerminalState = Object.freeze({
        get app() { return AppState; },
        get overlays() { return { activeOverlay: AppState.activeOverlay, ...overlays }; },
        get motion() { return { reduced: motion.reduced, safeMode: safeModeActive() }; },
        ...extra
    });
}
