// js/app.js — main terminal entry point (ES module).
// Evaluates before the classic legacy scripts (js/legacy/*.js) because module
// scripts and deferred scripts execute in document order; ./bridge.js is
// imported first and publishes the core API on window for them.

import './bridge.js';

import { getById } from './core/dom.js';
import {
    initializeSafeModeFromUrl, initMotionPreference, bindPreferenceListeners,
    EffectsController, onEffectsChange
} from './core/effects.js';
import { AudioEngine } from './core/audio.js';
import { configureLibrarySupport } from './core/loader.js';
import { setAppState, syncAppUi, overlays, installDebugNamespace, AppState } from './core/state.js';
import { setQueueIdleHook } from './terminal/output.js';
import { getCommandHistory } from './terminal/commands.js';
import {
    loadStoredStatusProfile, loadTerminalContent, handleVisibilityChange,
    refreshStatusPanels, statusProfile, connectedSiteStatusProfile, terminalContent
} from './features/status.js';
import { handleFileSelect, getDatabaseSlots, getDatabaseEntries, isDatabaseLoaded, getDatabaseSource, getDatabaseManifestInfo } from './features/database.js';
import { handleStatusFileSelect } from './features/status-load.js';
import { closeAccessDialog, submitAccessPassword } from './features/access.js';
import { Animator, startBootSequence } from './features/boot.js';
import {
    registerTerminalCommands, setMenuItems, scheduleHologramStart, hologram
} from './features/terminal.js';
import { getConnectedSiteDebugSnapshot } from './features/sites.js';

document.addEventListener('DOMContentLoaded', async () => {
    initializeSafeModeFromUrl();
    EffectsController.load();
    initMotionPreference();
    bindPreferenceListeners();
    Animator.configure();
    configureLibrarySupport();
    registerTerminalCommands();
    EffectsController.apply();

    // Audio state feeds the SND indicator through the central store.
    AudioEngine.onChange = () => setAppState({ soundEnabled: AudioEngine.enabled }, { resetSelection: false });
    AudioEngine.onChange(AudioEngine.enabled);

    // When the typewriter queue drains, give the hologram a chance to start.
    setQueueIdleHook(() => scheduleHologramStart(260));

    // Refresh overlay panels when the effects profile flips.
    onEffectsChange(() => {
        if (overlays.facilityActive) {
            if (window.MapOverlayController?.isActive()) window.MapOverlayController.refreshProfile();
            else window.renderFacilityStatus?.(performance.now());
        }
    });

    installDebugNamespace({
        get database() {
            return {
                loaded: isDatabaseLoaded(),
                source: getDatabaseSource(),
                entryCount: getDatabaseEntries().length,
                slots: getDatabaseSlots(),
                connectedSite: getConnectedSiteDebugSnapshot(),
                manifestSource: getDatabaseManifestInfo().source
            };
        },
        get status() {
            return { profile: statusProfile, connectedSiteProfile: connectedSiteStatusProfile, content: terminalContent };
        },
        get commands() {
            return { history: getCommandHistory() };
        }
    });

    setMenuItems();
    syncAppUi({ resetSelection: false });
    loadStoredStatusProfile();

    // Session restore (returning from a tool screen such as the tactical map).
    const restoreRequest = window.TerminalSessionRestore?.parseRestoreRequest?.();
    let restoreSnapshot = null;
    window.TerminalSessionRestore?.cleanupExpiredSnapshots?.();
    try {
        await loadTerminalContent();
        if (restoreRequest?.session && window.TerminalSessionRestore?.consumeSnapshot) {
            restoreSnapshot = await window.TerminalSessionRestore.consumeSnapshot(restoreRequest.session);
        }
    } catch (_) {
        restoreSnapshot = null;
    }

    startBootSequence({
        restoreSnapshot,
        restoredFrom: restoreRequest?.from || ''
    });

    getById('fileInput').addEventListener('change', handleFileSelect);
    getById('statusFileInput').addEventListener('change', handleStatusFileSelect);
    getById('accessCancelBtn').addEventListener('click', closeAccessDialog);
    getById('accessSubmitBtn').addEventListener('click', submitAccessPassword);
    getById('accessPassword').addEventListener('keydown', e => {
        if (e.key === 'Enter') submitAccessPassword();
        if (e.key === 'Escape') closeAccessDialog();
    });
    getById('diagnosticClose').addEventListener('click', () => window.closeDiagnosticDashboard?.());
    getById('diagnosticOverlay').addEventListener('click', e => {
        if (e.target.id === 'diagnosticOverlay') window.closeDiagnosticDashboard?.();
    });
    getById('facilityClose').addEventListener('click', () => window.closeFacilityStatus?.());
    getById('facilityOverlay').addEventListener('click', e => {
        if (e.target.id === 'facilityOverlay') window.closeFacilityStatus?.();
    });

    let resizeFrame = null;
    window.addEventListener('resize', () => {
        if (resizeFrame) cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
            resizeFrame = null;
            if (!hologram.started && document.body.classList.contains('terminal-ready')) {
                scheduleHologramStart(200);
            }
            if (overlays.facilityActive) window.renderFacilityStatus?.(performance.now());
        });
    });

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Prevent page scrolling outside scrollable panels (CRT shell is fixed).
    document.addEventListener('wheel', e => {
        if (e.cancelable && !e.target.closest('.boot-left, .menu-list, .dialog-box, .diagnostic-panel, .facility-panel, #output, .content-viewport')) e.preventDefault();
    }, { passive: false });
    document.addEventListener('touchmove', e => {
        if (e.cancelable && !e.target.closest('.boot-left, .menu-list, .dialog-box, .diagnostic-panel, .facility-panel, #output, .content-viewport, #gameOverlay, #casinoOverlay, #liebiOverlay')) e.preventDefault();
    }, { passive: false });

    // Browsers require a user gesture before audio can start.
    document.addEventListener('pointerdown', () => AudioEngine.resume(), { once: true });
    document.addEventListener('keydown', () => AudioEngine.resume(), { once: true });
});
