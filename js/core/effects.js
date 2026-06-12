// js/core/effects.js — motion preference, render profiles, and the visual
// effects controller. Pure presentation tuning: nothing here owns game state.

import { getById } from './dom.js';

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const lowPowerQuery = window.matchMedia('(update: slow), (pointer: coarse)');

/** Live motion state. Read `motion.reduced` / `motion.scale` (do not copy). */
export const motion = {
    reduced: reducedMotionQuery.matches,
    scale: reducedMotionQuery.matches ? 0.25 : 1
};

/** Typewriter timing constants. Mutated in place when motion preference flips. */
export const TYPEWRITER_CONFIG = {
    charInterval: 9,
    bootCharInterval: 11,
    terminalCharsPerSecond: 180,
    terminalMaxCharsPerFrame: 3,
    terminalKeyClickMs: 70,
    lineDelay: 0
};

const EFFECTS_STORAGE_KEY = 'aresEffectsMode.v1';
const EFFECTS_MODES = new Set(['auto', 'full', 'low']);

let effectsMode = 'auto';
let safeModeSession = false;
let mediaPreferenceHandlersBound = false;

// Subscribers notified whenever the effective effects profile may have changed
// (mode change, media query flip, safe mode toggle). Used by app wiring to
// refresh overlays without circular imports.
const effectsListeners = new Set();
export function onEffectsChange(fn) {
    if (typeof fn === 'function') effectsListeners.add(fn);
}
function notifyEffectsChange() {
    effectsListeners.forEach(fn => {
        try { fn(); } catch (_) { /* listeners must not break the controller */ }
    });
}

function normalizeEffectsMode(mode) {
    const value = String(mode || '').trim().toLowerCase();
    return EFFECTS_MODES.has(value) ? value : 'auto';
}

export function effectsLowActive() {
    return safeModeSession || motion.reduced || effectsMode === 'low' || (effectsMode === 'auto' && lowPowerQuery.matches);
}

// Render profiles keep expensive telemetry effects predictable per browser.
// Non-coders can tune intervals/counts here without editing widget code.
export const RENDER_PROFILES = {
    chromium: {
        name: 'chromium',
        schedulerMs: 50,
        sideTelemetryMs: 120,
        facilityMs: 150,
        widgetMs: { network: 160, security: 120, outpost: 66, generator: 80, power: 120, alarm: 60000, life: 80, events: 160, integrity: 140, uplink: 120 },
        radar: { frameMs: 66, sweepTrail: 8, clutterCount: 14, contactLabels: true, glow: true, pulse: true },
        facility: { backgroundRefreshFrames: 90, packetCount: 6, contactCount: 2, readoutEvery: 5, motion: true, pulse: false }
    },
    firefox: {
        name: 'firefox',
        schedulerMs: 80,
        sideTelemetryMs: 220,
        facilityMs: 220,
        widgetMs: { network: 240, security: 200, outpost: 100, generator: 120, power: 160, alarm: 60000, life: 120, events: 240, integrity: 180, uplink: 180 },
        radar: { frameMs: 110, sweepTrail: 4, clutterCount: 6, contactLabels: true, glow: false, pulse: false },
        facility: { backgroundRefreshFrames: 180, packetCount: 3, contactCount: 1, readoutEvery: 8, motion: false, pulse: false }
    },
    safari: {
        name: 'safari',
        schedulerMs: 80,
        sideTelemetryMs: 220,
        facilityMs: 220,
        widgetMs: { network: 240, security: 180, outpost: 100, generator: 120, power: 160, alarm: 60000, life: 120, events: 240, integrity: 180, uplink: 180 },
        radar: { frameMs: 110, sweepTrail: 4, clutterCount: 6, contactLabels: true, glow: false, pulse: false },
        facility: { backgroundRefreshFrames: 180, packetCount: 3, contactCount: 1, readoutEvery: 8, motion: false, pulse: false }
    },
    low: {
        name: 'effects-low',
        schedulerMs: 140,
        sideTelemetryMs: 320,
        facilityMs: 360,
        widgetMs: { network: 260, security: 240, outpost: 180, generator: 220, power: 220, alarm: 60000, life: 220, events: 260, integrity: 240, uplink: 240 },
        radar: { frameMs: 220, sweepTrail: 2, clutterCount: 3, contactLabels: false, glow: false, pulse: false },
        facility: { backgroundRefreshFrames: 240, packetCount: 2, contactCount: 1, readoutEvery: 10, motion: false, pulse: false }
    },
    reduced: {
        name: 'reduced-motion',
        schedulerMs: 60000,
        sideTelemetryMs: 60000,
        facilityMs: 60000,
        widgetMs: { network: 60000, security: 60000, outpost: 60000, generator: 60000, power: 60000, alarm: 60000, life: 60000, events: 60000, integrity: 60000, uplink: 60000 },
        radar: { frameMs: 60000, sweepTrail: 1, clutterCount: 0, contactLabels: true, glow: false, pulse: false },
        facility: { backgroundRefreshFrames: 60000, packetCount: 0, contactCount: 0, readoutEvery: 60000, motion: false, pulse: false }
    }
};

export function detectBrowserProfile() {
    const ua = navigator.userAgent || '';
    const vendor = navigator.vendor || '';
    if (/Firefox\//i.test(ua)) return 'firefox';
    if (/Safari\//i.test(ua) && /Apple/i.test(vendor) && !/Chrome|Chromium|CriOS|Edg\//i.test(ua)) return 'safari';
    return 'chromium';
}

export function getEffectiveRenderProfile() {
    if (motion.reduced) return RENDER_PROFILES.reduced;
    if (safeModeSession || effectsLowActive()) return RENDER_PROFILES.low;
    return RENDER_PROFILES[detectBrowserProfile()] || RENDER_PROFILES.chromium;
}

export function getRenderWidgetInterval(widgetId, fallbackMs = 140) {
    const profile = getEffectiveRenderProfile();
    return profile.widgetMs?.[widgetId] ?? fallbackMs;
}

export function effectsFrameMs(fullMs = 33, lowMs = 80) {
    const profile = getEffectiveRenderProfile();
    if (motion.reduced) return profile.schedulerMs || 60000;
    if (document.hidden) return 600;
    if (safeModeSession || effectsLowActive()) return Math.max(lowMs, profile.schedulerMs || lowMs);
    return Math.max(fullMs, profile.schedulerMs || fullMs);
}

function applyRenderProfileClasses(target) {
    if (!target) return;
    const browser = detectBrowserProfile();
    const profile = getEffectiveRenderProfile();
    target.classList.toggle('browser-firefox', browser === 'firefox');
    target.classList.toggle('browser-safari', browser === 'safari');
    target.classList.toggle('browser-chromium', browser === 'chromium');
    target.classList.toggle('render-low', profile.name === 'effects-low');
    target.classList.toggle('render-reduced', profile.name === 'reduced-motion');
    target.classList.toggle('safe-mode', safeModeSession);
    target.dataset.renderProfile = profile.name;
    target.dataset.browserProfile = browser;
}

function updateSafeModeIndicator() {
    const statusBar = document.querySelector('.status-bar');
    if (!statusBar) return;
    let indicator = getById('safeModeIndicator');
    if (!safeModeSession) {
        if (indicator) indicator.remove();
        return;
    }
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'safeModeIndicator';
        indicator.className = 'status-item safe-mode-indicator';
        const dot = document.createElement('div');
        dot.className = 'status-dot warn';
        const label = document.createElement('span');
        label.textContent = 'MODE';
        indicator.append(dot, document.createTextNode(' SAFE '), label);
        statusBar.appendChild(indicator);
    }
}

function updateEffectsStatus() {
    const label = getById('effectsStatus');
    const dot = getById('effectsDot');
    const toggle = getById('effectsToggle');
    const display = EffectsController.effectiveLabel();
    if (label) label.textContent = display;
    if (dot) {
        dot.classList.toggle('warn', safeModeSession || (effectsMode === 'auto' && EffectsController.isLow()));
        dot.classList.toggle('err', EffectsController.isLow() && effectsMode !== 'auto' && !safeModeSession);
    }
    if (toggle) {
        toggle.setAttribute('aria-label', `Visual effects mode ${display}. Activate to cycle mode.`);
        toggle.title = `Effects mode: ${display}`;
    }
    updateSafeModeIndicator();
}

export const EffectsController = {
    load() {
        try {
            effectsMode = normalizeEffectsMode(localStorage.getItem(EFFECTS_STORAGE_KEY) || 'auto');
        } catch (_) {
            effectsMode = 'auto';
        }
        this.apply();
    },

    setMode(mode) {
        effectsMode = normalizeEffectsMode(mode);
        try { localStorage.setItem(EFFECTS_STORAGE_KEY, effectsMode); } catch (_) {}
        this.apply();
        return effectsMode;
    },

    cycle() {
        return this.setMode(effectsMode === 'auto' ? 'full' : effectsMode === 'full' ? 'low' : 'auto');
    },

    mode() {
        return effectsMode;
    },

    effectiveLabel() {
        if (safeModeSession) return 'SAFE';
        if (motion.reduced) return 'REDUCED';
        if (effectsMode === 'auto') return effectsLowActive() ? 'AUTO-LOW' : 'AUTO';
        return effectsMode.toUpperCase();
    },

    isLow() {
        return effectsLowActive();
    },

    apply() {
        [document.documentElement, document.body].forEach(target => {
            if (!target) return;
            target.classList.toggle('effects-auto', effectsMode === 'auto');
            target.classList.toggle('effects-full', effectsMode === 'full' && !motion.reduced);
            target.classList.toggle('effects-low', this.isLow());
            applyRenderProfileClasses(target);
        });
        if (document.body) document.body.classList.toggle('low-power', effectsLowActive());
        updateEffectsStatus();
        notifyEffectsChange();
    }
};

export function safeModeActive() {
    return safeModeSession;
}

/**
 * Set safe mode (session-only stability profile). The announce side effect is
 * handled by the caller (terminal command), keeping this module print-free.
 */
export function setSafeModeFlag(enabled) {
    safeModeSession = Boolean(enabled);
    EffectsController.apply();
    return safeModeSession;
}

export function initializeSafeModeFromUrl() {
    let requested = false;
    try {
        requested = new URLSearchParams(window.location.search).get('safe') === '1';
    } catch (_) {}
    if (requested) setSafeModeFlag(true);
    return safeModeSession;
}

function applyMotionPreference(matches = reducedMotionQuery.matches) {
    motion.reduced = Boolean(matches);
    motion.scale = motion.reduced ? 0.25 : 1;
    TYPEWRITER_CONFIG.charInterval = motion.reduced ? 0 : 9;
    TYPEWRITER_CONFIG.bootCharInterval = motion.reduced ? 0 : 11;
    TYPEWRITER_CONFIG.terminalCharsPerSecond = motion.reduced ? 0 : 180;
    TYPEWRITER_CONFIG.terminalMaxCharsPerFrame = motion.reduced ? 1 : 3;
    TYPEWRITER_CONFIG.lineDelay = 0;
    EffectsController.apply();
}

function bindMediaQueryChange(query, handler) {
    if (typeof query.addEventListener === 'function') query.addEventListener('change', handler);
    else if (typeof query.addListener === 'function') query.addListener(handler);
}

export function bindPreferenceListeners() {
    if (mediaPreferenceHandlersBound) return;
    bindMediaQueryChange(reducedMotionQuery, event => applyMotionPreference(event.matches));
    bindMediaQueryChange(lowPowerQuery, () => EffectsController.apply());
    mediaPreferenceHandlersBound = true;
}

export function initMotionPreference() {
    applyMotionPreference();
}
