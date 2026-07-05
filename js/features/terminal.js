// js/features/terminal.js — terminal session runtime: init, global keyboard
// routing, sidebar menu, shutdown/reboot, sound/network/effects/safe-mode
// handlers, and the command definitions.

import { getById, clearElement } from '../core/dom.js';
import { motion, EffectsController, setSafeModeFlag, safeModeActive, getEffectiveRenderProfile, detectBrowserProfile } from '../core/effects.js';
import { AudioEngine } from '../core/audio.js';
import {
    AppState, setAppState, syncAppUi, onUiSync,
    ACCESS_LEVELS, normalizeAccessLevel, hasAccess
} from '../core/state.js';
import {
    print, clearOutput, appendCommandEcho, scrollTranscriptBy, scrollTranscriptToBottom,
    suspendTerminalRuntimeForMap as suspendOutputForMap,
    resumeTerminalRuntimeAfterMap as resumeOutputAfterMap,
    renderHelpLinesGrouped
} from '../terminal/output.js';
import {
    registerCommand, resolveCommandLine, visibleCommandList, commandUsageKey,
    normalizeCommandText, rememberCommand, recallCommandHistory, autocompleteCommandInput
} from '../terminal/commands.js';
import {
    printAccessRequired, printAdminRequired, printNetworkUnavailable,
    printConnectedSiteRequired, printDatabaseSlotsFull, printNoDatabaseLoaded
} from '../terminal/messages.js';
import {
    contentGet, contentLines, contentClass, statusProfile,
    pauseRealtimePanels, resumeRealtimePanels, clearStatusProfile, showStatusFormatHelp
} from './status.js';
import {
    isDatabaseLoaded, databaseCapacityFull, showDatabaseSelector, showDatabaseSlotDialog,
    searchDatabase, fuzzySearch, showCategories, listAllEntries, listDatabaseEntries, handleEjectCommand,
    updateDatabaseSlotIndicators
} from './database.js';
import {
    connectBreSite, disconnectConnectedSite, showConnectedSiteStatus, showConnectedSiteWelcome,
    runNetworkServicesLog, runRemoteDataAccessLog
} from './sites.js';
import { showAccessDialog, logout } from './access.js';
import { Animator } from './boot.js';
import { startBootSequence } from './boot.js';

/* ------------------------------------------------------------------ *
 * Module state
 * ------------------------------------------------------------------ */

let terminalShutdownActive = false;
let terminalShutdownTimers = [];
let networkTransitionActive = false;
let terminalKeyHandlerBound = false;
let menuHandlersBound = false;
let shellTelemetryTimer = null;
let commandsRegistered = false;

let menuItems = [];
let selectedMenuIndex = 0;
let renderedMenuIndex = -1;
let menuFocused = true;

/** Hologram preview state (read/written by js/legacy/ui.js via the bridge). */
export const hologram = { started: false, timer: null };

export function getSelectedMenuIndex() {
    return selectedMenuIndex;
}

export function setSelectedMenuIndex(index) {
    selectedMenuIndex = Number.isFinite(index) ? index : 0;
}

export function setMenuItems() {
    menuItems = Array.from(document.querySelectorAll('.menu-item'));
}

/**
 * Shrink individual menu labels until they actually fit their column.
 * The DOS bitmap font has unusual glyph metrics, so fixed CSS sizes can't
 * guarantee a fit across every window size / zoom — this measures the real
 * rendered width instead and only steps down labels that overflow.
 */
export function fitMenuLabels() {
    document.querySelectorAll('.menu-item span:not(.icon)').forEach(label => {
        label.style.fontSize = '';
        if (!label.clientWidth) return; // hidden or not laid out yet
        let size = Number.parseFloat(getComputedStyle(label).fontSize) || 13.5;
        let guard = 14;
        while (guard-- > 0 && label.scrollWidth > label.clientWidth && size > 8.5) {
            size -= 0.5;
            label.style.fontSize = `${size}px`;
        }
    });
}

export function resetMenuState() {
    selectedMenuIndex = 0;
    renderedMenuIndex = -1;
    updateMenuSelection();
    menuFocused = true;
}

export function unbindGlobalKeyHandler() {
    if (terminalKeyHandlerBound) {
        document.removeEventListener('keydown', handleGlobalKeydown);
        terminalKeyHandlerBound = false;
    }
}

// Reset menu selection to top when clearance drops and current item locks.
onUiSync(options => {
    if (!AppState.adminMode && options.resetSelection !== false && menuItems[selectedMenuIndex]?.classList.contains('locked')) {
        selectedMenuIndex = 0;
        updateMenuSelection();
    }
});

/* ------------------------------------------------------------------ *
 * Hologram & shell telemetry
 * ------------------------------------------------------------------ */

export function scheduleHologramStart(delay = 0) {
    if (hologram.started || hologram.timer) return;
    hologram.timer = setTimeout(() => {
        hologram.timer = null;
        requestAnimationFrame(() => window.initHologram?.());
    }, Math.max(0, delay));
}

function updateShellTelemetry() {
    const time = getById('shellSystemTime');
    if (!time) return;
    const now = new Date();
    const pad = value => String(value).padStart(2, '0');
    const inWorldYear = 2084;
    time.textContent = `${inWorldYear}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}  ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function startShellTelemetry() {
    if (!getById('shellSystemTime')) return;
    updateShellTelemetry();
    if (shellTelemetryTimer) return;
    shellTelemetryTimer = setInterval(updateShellTelemetry, 1000);
}

function stopShellTelemetry() {
    if (!shellTelemetryTimer) return;
    clearInterval(shellTelemetryTimer);
    shellTelemetryTimer = null;
}

/** Composite suspend used by the tactical map iframe handoff. */
export function suspendTerminalRuntimeForMap() {
    stopShellTelemetry();
    if (hologram.timer) {
        clearTimeout(hologram.timer);
        hologram.timer = null;
    }
    suspendOutputForMap();
}

export function resumeTerminalRuntimeAfterMap() {
    startShellTelemetry();
    resumeOutputAfterMap();
    scheduleHologramStart(240);
}

/* ------------------------------------------------------------------ *
 * Shutdown / reboot
 * ------------------------------------------------------------------ */

function clearShutdownTimers() {
    terminalShutdownTimers.forEach(timerId => clearTimeout(timerId));
    terminalShutdownTimers = [];
}

function scheduleShutdownStep(callback, delay = 0) {
    const timerId = setTimeout(() => {
        terminalShutdownTimers = terminalShutdownTimers.filter(id => id !== timerId);
        callback();
    }, Math.max(0, delay));
    terminalShutdownTimers.push(timerId);
}

function setSystemStatusVisual(online) {
    const systemToggle = getById('systemStatusItem');
    const systemText = getById('systemStatus');
    const systemDot = getById('systemDot');
    if (systemText) systemText.textContent = online ? 'ONLINE' : 'OFFLINE';
    if (systemDot) systemDot.classList.toggle('err', !online);
    if (systemToggle) {
        systemToggle.classList.toggle('offline', !online);
        systemToggle.disabled = !online;
        systemToggle.setAttribute('aria-label', online
            ? 'System online. Activate to shut down terminal.'
            : 'System offline.');
    }
}

function appendShutdownLog(text, className = '') {
    const log = getById('shutdownLog');
    if (!log) return;
    const line = document.createElement('div');
    line.className = `shutdown-log-line ${className}`.trim();
    line.textContent = text;
    log.appendChild(line);
}

function completeTerminalShutdown() {
    const screen = getById('shutdownScreen');
    if (screen) {
        screen.classList.add('offline');
        screen.setAttribute('aria-hidden', 'false');
    }
    document.body.classList.remove('terminal-shutting-down', 'terminal-ready');
    document.body.classList.add('terminal-offline');
    setSystemStatusVisual(false);
    AudioEngine.errorBuzz();
}

function startTerminalShutdown() {
    if (terminalShutdownActive) return;
    const screen = getById('shutdownScreen');
    const log = getById('shutdownLog');
    if (!screen) return;

    terminalShutdownActive = true;
    clearShutdownTimers();
    if (log) clearElement(log);
    screen.classList.remove('hidden', 'offline');
    screen.setAttribute('aria-hidden', 'false');
    document.body.classList.add('terminal-shutting-down');

    AudioEngine.resume();
    AudioEngine.menuSelect();
    window.closeDiagnosticDashboard?.();
    window.closeFacilityStatus?.();
    pauseRealtimePanels();
    stopShellTelemetry();
    window.stopSideTelemetryLoop?.();

    const stepDelay = motion.reduced ? 70 : 300;
    const sequence = [
        ['> SYS CONTROL ACCEPTED // OPERATOR SHUTDOWN', 'warn'],
        ['> ARES MACROTECHNOLOGY IDENT BUFFER LOCKED', ''],
        ['> TERMINATING DIAGNOSTIC BUS', ''],
        ['> HALTING FACILITY TELEMETRY STREAM', ''],
        ['> PURGING LOCAL COMMAND CACHE', 'warn'],
        ['> PHOSPHOR DISPLAY ENTERING DARK STATE', 'alert'],
        ['> CORE SESSION SEALED // TERMINAL OFFLINE', 'alert']
    ];

    sequence.forEach(([text, className], index) => {
        scheduleShutdownStep(() => {
            appendShutdownLog(text, className);
            if (index % 2 === 0) AudioEngine.keyClick();
        }, stepDelay * (index + 1));
    });
    scheduleShutdownStep(completeTerminalShutdown, stepDelay * (sequence.length + 1));
}

function rebootTerminalFromOffline() {
    clearShutdownTimers();
    terminalShutdownActive = false;
    const screen = getById('shutdownScreen');
    const log = getById('shutdownLog');
    if (screen) {
        screen.classList.add('hidden');
        screen.classList.remove('offline');
        screen.setAttribute('aria-hidden', 'true');
    }
    if (log) clearElement(log);
    document.body.classList.remove('terminal-shutting-down', 'terminal-offline', 'terminal-ready');
    setSystemStatusVisual(true);
    AudioEngine.resume();
    AudioEngine.bootBeep();
    startBootSequence();
}

/* ------------------------------------------------------------------ *
 * Keyboard routing
 * ------------------------------------------------------------------ */

function isEditableKeyTarget(target) {
    if (!(target instanceof Element)) return false;
    const tagName = target.tagName.toLowerCase();
    return tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        target.isContentEditable ||
        Boolean(target.closest('[contenteditable="true"]'));
}

function shouldRouteKeyToCommandInput(event) {
    if (!event || event.defaultPrevented || event.isComposing) return false;
    if (event.key === ' ' || event.key === 'Dead' || event.key.length !== 1) return false;
    if (event.metaKey) return false;
    const usesAltGraph = typeof event.getModifierState === 'function' && event.getModifierState('AltGraph');
    if ((event.ctrlKey || event.altKey) && !usesAltGraph) return false;
    return !isEditableKeyTarget(event.target);
}

function routeKeyToCommandInput(event, input) {
    if (!input || input.disabled || input.readOnly) return false;
    event.preventDefault();
    input.focus();
    input.value = `${input.value || ''}${event.key}`;
    input.setSelectionRange(input.value.length, input.value.length);
    menuFocused = false;
    return true;
}

function handleGlobalKeydown(e) {
    if (terminalShutdownActive || document.body.classList.contains('terminal-offline')) return;

    // Mini-games own the keyboard while open.
    if (getById('liebiOverlay') || getById('gameOverlay') || getById('casinoOverlay')) return;

    const facilityOverlay = getById('facilityOverlay');
    if (facilityOverlay?.classList.contains('active')) {
        if (e.key === 'Escape') {
            e.preventDefault();
            window.closeFacilityStatus?.();
        }
        return;
    }

    const diagnosticOverlay = getById('diagnosticOverlay');
    if (diagnosticOverlay?.classList.contains('active')) {
        if (e.key === 'Escape') {
            e.preventDefault();
            window.closeDiagnosticDashboard?.();
        }
        return;
    }

    const databaseModal = getById('databaseModal');
    if (databaseModal) {
        if (e.key === 'Escape') {
            e.preventDefault();
            window.closeDatabaseModal?.();
            return;
        }
        if (e.key === 'Enter') {
            const authButton = databaseModal.querySelector('[data-authenticate-database="true"]');
            if (authButton && !authButton.disabled) {
                e.preventDefault();
                authButton.click();
            }
        }
        return;
    }

    if (getById('accessDialog')?.classList.contains('active')) return;

    const input = getById('commandInput');
    if (document.activeElement === input) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const value = input.value.trim();
            if (value) {
                processCommand(value);
                input.value = '';
            }
            menuFocused = false;
        } else if (e.key === 'Escape') {
            menuFocused = true;
            input.value = '';
            input.blur();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            recallCommandHistory(-1);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            recallCommandHistory(1);
        } else if (e.key === 'Tab') {
            e.preventDefault();
            autocompleteCommandInput();
        }
        return;
    }

    const activeMenuItem = document.activeElement?.closest ? document.activeElement.closest('.menu-item') : null;
    if (activeMenuItem && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        const focusedIndex = Number(activeMenuItem.dataset.index);
        if (Number.isFinite(focusedIndex)) selectedMenuIndex = focusedIndex;
        updateMenuSelection();
        executeSelectedCommand();
        return;
    }

    if (shouldRouteKeyToCommandInput(e) && routeKeyToCommandInput(e, input)) return;

    if (e.key === 'ArrowUp') {
        e.preventDefault();
        navigateMenu(-1);
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        navigateMenu(1);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        executeSelectedCommand();
    } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        scrollTranscriptBy(-1);
    } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        scrollTranscriptBy(1);
    }
}

/* ------------------------------------------------------------------ *
 * Menu
 * ------------------------------------------------------------------ */

function navigateMenu(direction) {
    AudioEngine.menuMove();
    selectedMenuIndex += direction;

    if (selectedMenuIndex < 0) selectedMenuIndex = menuItems.length - 1;
    if (selectedMenuIndex >= menuItems.length) selectedMenuIndex = 0;

    // Skip locked items.
    const item = menuItems[selectedMenuIndex];
    if (!AppState.adminMode && item.classList.contains('admin-cmd') && item.classList.contains('locked')) {
        navigateMenu(direction);
        return;
    }
    updateMenuSelection();
}

export function updateMenuSelection() {
    if (renderedMenuIndex === selectedMenuIndex) return;

    if (renderedMenuIndex < 0) {
        menuItems.forEach((item, index) => {
            const selected = index === selectedMenuIndex;
            item.classList.toggle('selected', selected);
            item.setAttribute('aria-current', selected ? 'true' : 'false');
        });
    } else {
        const previous = menuItems[renderedMenuIndex];
        const next = menuItems[selectedMenuIndex];
        if (previous) {
            previous.classList.remove('selected');
            previous.setAttribute('aria-current', 'false');
        }
        if (next) {
            next.classList.add('selected');
            next.setAttribute('aria-current', 'true');
        }
    }
    renderedMenuIndex = selectedMenuIndex;
}

const MENU_COMMANDS = {
    home: 'home',
    welcome: 'welcome',
    help: 'help',
    load: 'load database',
    loadStatus: 'load status',
    search: 'search',
    categories: 'categories',
    diagnostic: 'diagnostic',
    facility: 'topography',
    clear: 'clear',
    access: 'access',
    list: 'list all',
    fsearch: 'fsearch',
    logout: 'logout'
};

function executeSelectedCommand() {
    const item = menuItems[selectedMenuIndex];
    if (!item) return;
    if (item.classList.contains('locked')) {
        AudioEngine.errorBuzz();
        Animator.alertShake(item);
        return;
    }
    AudioEngine.menuSelect();
    const cmd = item.dataset.cmd;
    executeCliCommand(MENU_COMMANDS[cmd] || cmd, { echo: true, history: false });
}

function focusInputWithPrefix(prefix) {
    const input = getById('commandInput');
    input.value = prefix;
    input.focus();
    menuFocused = false;
}

function submitCommandInput() {
    const input = getById('commandInput');
    if (!input) return;
    const value = input.value.trim();
    if (!value) {
        input.focus();
        return;
    }
    processCommand(value);
    input.value = '';
    menuFocused = false;
    input.focus();
}

/* ------------------------------------------------------------------ *
 * Command execution
 * ------------------------------------------------------------------ */

function commandRequiresNetwork(command) {
    const key = commandUsageKey(command);
    return key === 'DIAGNOSTIC' || key === 'TOPOGRAPHY' || key === 'WIREFRAME MAP';
}

function commandRequiresConnectedSite(command) {
    return commandUsageKey(command) === 'DIAGNOSTIC';
}

export async function executeCliCommand(input, options = {}) {
    const raw = normalizeCommandText(input);
    if (!raw) return;
    if (options.echo !== false) appendCommandEcho(raw);
    if (options.history) rememberCommand(raw);

    const resolved = resolveCommandLine(raw);
    if (!resolved) {
        AudioEngine.errorBuzz();
        print('');
        print(`UNKNOWN COMMAND: ${raw.split(/\s+/)[0].toUpperCase()}`, 't-red');
        print(contentGet('errors.unknown_command_hint', 'Use /HELP to list available commands.'), 't-dim');
        print('');
        return;
    }

    const command = resolved.command;
    if (!hasAccess(command.requiredAccess)) {
        printAccessRequired(command.usage, command.requiredAccess);
        return;
    }
    if (commandRequiresNetwork(command) && !AppState.networkOnline) {
        printNetworkUnavailable(command.usage);
        return;
    }
    if (commandRequiresConnectedSite(command) && !AppState.connectedSiteId) {
        printConnectedSiteRequired(command.usage);
        return;
    }

    try {
        await command.run({
            input: raw,
            alias: resolved.alias,
            args: resolved.args,
            argv: resolved.argv,
            command
        });
    } catch (error) {
        AudioEngine.errorBuzz();
        print('');
        print(`COMMAND FAILURE: ${command.usage}`, 't-red');
        print(error && error.message ? error.message : 'Unhandled command exception.', 't-dim');
        print('');
    }
}

export function processCommand(input) {
    return executeCliCommand(input, { echo: true, history: true });
}

/* ------------------------------------------------------------------ *
 * Sound / network / effects / safe mode
 * ------------------------------------------------------------------ */

export function setSoundEnabled(enabled, options = {}) {
    AudioEngine.setEnabled(Boolean(enabled));
    if (AudioEngine.enabled) AudioEngine.menuSelect();
    if (options.announce === false) return;
    print('');
    print(AudioEngine.enabled ? 'SOUND ENABLED' : 'SOUND DISABLED', AudioEngine.enabled ? 't-cyan' : 't-amber');
    print(`Audio bus: ${AudioEngine.enabled ? 'SND ON' : 'SND OFF'}`, 't-dim');
    print('');
}

function toggleSound(options = {}) {
    setSoundEnabled(!AudioEngine.enabled, options);
}

function handleSoundCommand(args) {
    const setting = args.toLowerCase();
    if (setting === 'on') setSoundEnabled(true, { announce: true });
    else if (setting === 'off') setSoundEnabled(false, { announce: true });
    else if (setting === 'toggle') toggleSound({ announce: true });
    else {
        print('');
        print('Usage: /SOUND ON | /SOUND OFF | /SOUND TOGGLE', 't-amber');
        print(`Current sound setting: ${AudioEngine.enabled ? 'ON' : 'OFF'}`, 't-dim');
        print('');
    }
}

export async function setNetworkOnline(online, options = {}) {
    const nextOnline = Boolean(online);
    if (networkTransitionActive) return AppState.networkOnline;
    if (AppState.networkOnline === nextOnline) {
        syncAppUi({ resetSelection: false });
        return AppState.networkOnline;
    }

    if (!nextOnline) {
        disconnectConnectedSite({ announce: false });
        setAppState({ networkOnline: false }, { resetSelection: false });
        window.renderSideGlyphTelemetry?.(0);
        window.closeDiagnosticDashboard?.();
        window.closeFacilityStatus?.();
        pauseRealtimePanels();
        AudioEngine.errorBuzz();
        if (options.announce !== false) {
            print('');
            print('NET OFFLINE', 't-red');
            print('Right-panel animation bus paused. Diagnostics and Topography are locked out.', 't-dim');
            print('');
        }
        return AppState.networkOnline;
    }

    AudioEngine.menuSelect();
    if (options.announce !== false) {
        const networkItem = getById('networkStatusItem');
        networkTransitionActive = true;
        if (networkItem) {
            networkItem.disabled = true;
            networkItem.classList.add('network-transitioning');
            networkItem.setAttribute('aria-label', 'Network services starting. Please wait for the boot bar to complete.');
        }
        try {
            await runNetworkServicesLog();
        } finally {
            networkTransitionActive = false;
            if (networkItem) {
                networkItem.disabled = false;
                networkItem.classList.remove('network-transitioning');
            }
        }
    }

    setAppState({ networkOnline: true }, { resetSelection: false });
    window.renderSideGlyphTelemetry?.(0);
    resumeRealtimePanels();
    scheduleHologramStart(180);
    return AppState.networkOnline;
}

async function toggleNetwork(options = {}) {
    return setNetworkOnline(!AppState.networkOnline, options);
}

async function handleNetworkCommand(args) {
    const setting = args.toLowerCase();
    if (['on', 'online', 'restore', 'up'].includes(setting)) {
        await setNetworkOnline(true, { announce: true });
        return;
    }
    if (['off', 'offline', 'down', 'cut'].includes(setting)) {
        await setNetworkOnline(false, { announce: true });
        return;
    }
    if (!setting) {
        print('');
        print(`NETWORK STATUS: ${AppState.networkOnline ? 'NET ONLINE' : 'NET OFFLINE'}`, AppState.networkOnline ? 't-cyan' : 't-red');
        print('Usage: /NET ON | /NET OFF | /NET TOGGLE', 't-dim');
        print('');
        return;
    }
    if (['toggle', 'switch'].includes(setting)) {
        await toggleNetwork({ announce: true });
        return;
    }
    print('');
    print('Usage: /NET ON | /NET OFF | /NET TOGGLE', 't-amber');
    print('');
}

function printEffectsMode() {
    print('');
    print(`VISUAL EFFECTS MODE: ${EffectsController.effectiveLabel()}`, EffectsController.isLow() ? 't-amber' : 't-cyan');
    print('FX AUTO / FX FULL / FX LOW adjusts decorative terminal effects.', 't-dim');
    print('PERFORMANCE ON selects LOW. PERFORMANCE OFF returns to AUTO.', 't-dim');
    print('PERFORMANCE STATUS prints the active render profile and SVG node counts.', 't-dim');
    print('');
}

function printPerformanceStatus() {
    const snapshot = window.getDiagnosticPerformanceSnapshot?.() || null;
    const profile = getEffectiveRenderProfile();
    print('');
    print('PERFORMANCE STATUS', 't-bright');
    print(`Browser profile : ${snapshot?.browser || detectBrowserProfile()}`, 't-dim');
    print(`Effects mode    : ${snapshot?.effectiveEffects || EffectsController.effectiveLabel()}`, EffectsController.isLow() ? 't-amber' : 't-cyan');
    print(`Render profile  : ${snapshot?.profile || profile?.name || 'unknown'}`, 't-cyan');
    print(`Reduced motion  : ${motion.reduced ? 'YES' : 'NO'}`, motion.reduced ? 't-amber' : 't-dim');
    print(`Safe mode       : ${safeModeActive() ? 'ON' : 'OFF'}`, safeModeActive() ? 't-amber' : 't-dim');
    print(`Active overlay  : ${AppState.activeOverlay.toUpperCase()}`, 't-dim');
    print(`Document hidden : ${document.hidden ? 'YES' : 'NO'}`, document.hidden ? 't-amber' : 't-dim');
    if (snapshot) {
        print(`Loops           : DIAG ${snapshot.diagnosticLoop ? 'RUN' : 'STOP'} // FAC ${snapshot.facilityLoop ? 'RUN' : 'STOP'} // SIDE ${snapshot.sideLoop ? 'RUN' : 'STOP'}`, 't-dim');
        print(`Intervals       : MAIN ${snapshot.schedulerMs}ms // RADAR ${snapshot.radarMs}ms // FAC ${snapshot.facilityMs}ms // SIDE ${snapshot.sideTelemetryMs}ms`, 't-dim');
        print('SVG NODE COUNTS :', 't-amber');
        snapshot.widgets.forEach(widget => {
            print(`  ${widget.key.padEnd(9, ' ')} ${String(widget.nodes).padStart(4, ' ')} nodes // ${String(widget.targetMs).padStart(4, ' ')}ms // renders ${widget.renders}`, widget.nodes > 900 ? 't-amber' : 't-dim');
        });
    }
    print('');
}

function handleEffectsCommand(command, args) {
    const setting = args.toLowerCase();
    if (!setting) {
        printEffectsMode();
        return;
    }
    if (['status', 'debug', 'profile'].includes(setting)) {
        printPerformanceStatus();
        return;
    }
    if (command === 'performance') {
        if (['on', 'low', 'true', '1'].includes(setting)) {
            EffectsController.setMode('low');
            printEffectsMode();
            return;
        }
        if (['off', 'auto', 'false', '0'].includes(setting)) {
            EffectsController.setMode('auto');
            printEffectsMode();
            return;
        }
    }
    if (['auto', 'full', 'low'].includes(setting)) {
        EffectsController.setMode(setting);
        printEffectsMode();
        return;
    }
    print('');
    print('Usage: /FX AUTO | /FX FULL | /FX LOW', 't-amber');
    print('       PERFORMANCE ON | PERFORMANCE OFF', 't-dim');
    print('');
}

export function setSafeMode(enabled, options = {}) {
    setSafeModeFlag(enabled);
    setAppState({ safeMode: safeModeActive() }, { resetSelection: false });
    window.resetDiagnosticWidgetRegistry?.();
    if (window.renderDiagnosticDashboard && document.getElementById('diagnosticOverlay')?.classList.contains('active')) {
        window.renderDiagnosticDashboard(performance.now(), { force: true });
    }
    window.renderSideGlyphTelemetry?.(0);
    if (options.announce !== false) {
        print('');
        print(safeModeActive() ? 'SAFE MODE ENABLED' : 'SAFE MODE DISABLED', safeModeActive() ? 't-amber' : 't-cyan');
        print(safeModeActive()
            ? 'Heavy telemetry effects reduced for stability. Core terminal systems remain online.'
            : 'Saved visual effects preference restored.', 't-dim');
        print('');
    }
    return safeModeActive();
}

function handleSafeModeCommand(args) {
    const setting = args.toLowerCase();
    if (!setting || setting === 'mode' || ['on', 'enable', 'enabled', '1', 'true'].includes(setting)) {
        setSafeMode(true, { announce: true });
        return;
    }
    if (['off', 'disable', 'disabled', '0', 'false'].includes(setting)) {
        setSafeMode(false, { announce: true });
        return;
    }
    if (['status', 'state'].includes(setting)) {
        print('');
        print(`SAFE MODE: ${safeModeActive() ? 'ON' : 'OFF'}`, safeModeActive() ? 't-amber' : 't-cyan');
        print('Usage: /SAFE MODE | /SAFE MODE OFF | /SAFE STATUS', 't-dim');
        print('');
        return;
    }
    print('');
    print('Usage: /SAFE MODE | /SAFE MODE OFF | /SAFE STATUS', 't-amber');
    print('');
}

function handleStatusCommand(args) {
    const setting = args.toLowerCase();
    if (setting === 'load') {
        if (!hasAccess(ACCESS_LEVELS.admin)) {
            printAdminRequired('STATUS LOAD');
            return;
        }
        getById('statusFileInput').click();
    } else if (setting === 'clear' || setting === 'reset') {
        if (!hasAccess(ACCESS_LEVELS.admin)) {
            printAdminRequired('STATUS CLEAR');
            return;
        }
        clearStatusProfile();
    } else if (setting === 'format' || setting === 'help') {
        showStatusFormatHelp();
    } else if (setting === 'facility') {
        window.showFacilityStatus?.();
    } else {
        print('');
        print('Usage: /STATUS LOAD | /STATUS CLEAR | /STATUS FORMAT | /STATUS FACILITY', 't-amber');
        print(`Current profile: ${statusProfile.source}`, 't-dim');
        print('');
    }
}

/* ------------------------------------------------------------------ *
 * Hidden editor pages
 * ------------------------------------------------------------------ */

const SECRET_EDITOR_PAGES = {
    database: { label: 'DATABASE EDITOR', path: 'database-studio.html' },
    diagnostics: { label: 'DIAGNOSTICS EDITOR', path: 'diagnostics-editor.html' }
};

async function openSecretEditorPage(kind) {
    const page = SECRET_EDITOR_PAGES[kind];
    if (!page) return;

    const navigate = () => { window.location.href = page.path; };

    AudioEngine.menuSelect();
    print('');
    print(`EDITOR ACCESS GRANTED: ${page.label}`, 't-amber');
    print(`Resolving module: ${page.path}`, 't-dim');

    if (window.location.protocol === 'file:') {
        print('Local file mode detected. Opening editor directly...', 't-dim');
        print('');
        setTimeout(navigate, 250);
        return;
    }

    try {
        const response = await fetch(page.path, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        print('Editor module found. Opening...', 't-cyan');
        print('');
        setTimeout(navigate, 250);
    } catch (_) {
        AudioEngine.errorBuzz();
        print('EDITOR MODULE NOT FOUND', 't-red');
        print(`Missing file: ${page.path}`, 't-dim');
        print('Upload the editor HTML file at the GitHub Pages root, or keep it local-only.', 't-dim');
        print('');
    }
}

/* ------------------------------------------------------------------ *
 * Screens
 * ------------------------------------------------------------------ */

export function showHome() {
    clearOutput({ force: true });
    const fallback = [
        '═══════════════════════════════════════════════════════',
        '              ARES MACROTECHNOLOGY',
        '═══════════════════════════════════════════════════════',
        '',
        'WELCOME, AUTHORIZED PERSONNEL ASSET.',
        '',
        'This terminal provides controlled access to Black Desert',
        'Research Facility database, diagnostic, and status systems.',
        '',
        'All employees are reminded that compliance is productivity.',
        'Productivity is margin. Margin is shareholder confidence.',
        '',
        'Obey issued directives, fulfill assigned duties, and report',
        'facility anomalies before they become expensive.',
        '',
        'Ares values dedication, discretion, and replaceable efficiency.',
        'Use /HELP for command guidance.',
        '═══════════════════════════════════════════════════════'
    ];
    const fallbackHome = contentLines('welcome', fallback);
    contentLines('home', fallbackHome).forEach((line, index) => print(
        line,
        contentClass('home', index, contentClass('welcome', index, index < 3 || index === fallback.length - 1 ? 't-dim' : ''))
    ));
}

function showHelp() {
    clearOutput({ force: true });
    const allCommands = visibleCommandList(true);
    const byLevel = level => allCommands.filter(command => normalizeAccessLevel(command.requiredAccess) === level);
    const lines = [
        { text: '═══════════════════════════════════════════════════════', className: 't-dim' },
        { text: '                    SYSTEM MANUAL', className: 't-bright' },
        { text: '═══════════════════════════════════════════════════════', className: 't-dim' },
        { text: 'Commands append to this transcript. Type a command and press Enter.', className: 't-dim' },
        { text: 'Arrow Up/Down recalls command history. Tab completes commands.', className: 't-dim' },
        { text: '', className: '' }
    ];

    [...byLevel(ACCESS_LEVELS.public), ...byLevel(ACCESS_LEVELS.employee)].forEach(command => {
        lines.push({ text: command.usage, className: 't-cyan' });
        lines.push({ text: `  ${command.description}`, className: '' });
        lines.push({ text: '', className: '' });
    });

    lines.push(
        { text: '───────────────────────────────────────────────────────', className: 't-dim' },
        { text: 'CLEARED COMMANDS (requires ACCESS: Restricted+)', className: 't-amber' },
        { text: '───────────────────────────────────────────────────────', className: 't-dim' },
        { text: '', className: '' }
    );
    [...byLevel(ACCESS_LEVELS.restricted), ...byLevel(ACCESS_LEVELS.management)].forEach(command => {
        lines.push({ text: command.usage, className: 't-amber' });
        lines.push({ text: `  ${command.description}`, className: '' });
        lines.push({ text: '', className: '' });
    });

    lines.push(
        { text: '───────────────────────────────────────────────────────', className: 't-dim' },
        { text: 'ADMIN COMMANDS (requires /ACCESS)', className: 't-red' },
        { text: '───────────────────────────────────────────────────────', className: 't-dim' },
        { text: '', className: '' }
    );
    byLevel(ACCESS_LEVELS.admin).forEach(command => {
        lines.push({ text: command.usage, className: 't-red' });
        lines.push({ text: `  ${command.description}`, className: '' });
        lines.push({ text: '', className: '' });
    });

    lines.push(
        { text: 'Navigation: ↑↓ Menu | Enter Select | Esc Back', className: 't-dim' },
        { text: '═══════════════════════════════════════════════════════', className: 't-dim' }
    );

    renderHelpLinesGrouped(lines);
}

function showWelcome() {
    showConnectedSiteWelcome();
}

/* ------------------------------------------------------------------ *
 * Command registration
 * ------------------------------------------------------------------ */

export function registerTerminalCommands() {
    if (commandsRegistered) return;
    commandsRegistered = true;

    registerCommand({ name: 'home', aliases: ['main'], usage: 'HOME', description: 'Display the corporate terminal home notice.', run: () => showHome() });
    registerCommand({ name: 'welcome', aliases: ['intranet'], usage: 'WELCOME', description: 'Display the connected BRE site intranet index.', run: () => showWelcome() });
    registerCommand({ name: 'help', aliases: ['manual', '?'], usage: 'HELP', description: 'Display the generated system manual.', run: () => showHelp() });
    registerCommand({ name: 'diagnostic', aliases: ['diag'], usage: 'DIAGNOSTIC', description: 'Open current base diagnostic dashboard.', run: () => window.showDiagnosticDashboard?.() });
    registerCommand({
        name: 'topography',
        aliases: ['facility status', 'facility', 'map', 'status facility', 'topo'],
        usage: 'TOPOGRAPHY',
        description: 'Open lazy-loaded Black Desert tactical map.',
        run: () => window.showFacilityStatus?.()
    });
    registerCommand({
        name: 'wireframe',
        aliases: ['wireframe map', 'tactical wireframe', 'tactical wireframe map'],
        usage: 'WIREFRAME MAP',
        description: 'Open the full tactical facility wireframe map.',
        run: () => window.showWireframeMap?.()
    });
    registerCommand({
        name: 'load database',
        aliases: ['load', 'load db', 'database load'],
        usage: 'LOAD DATABASE',
        description: 'Open the database selector.',
        run: ctx => {
            if (ctx.args && ctx.args.toLowerCase() !== 'database' && ctx.alias === 'load') {
                print('');
                print('Usage: /LOAD DATABASE | /LOAD FILE | /LOAD STATUS', 't-amber');
                print('');
                return;
            }
            showDatabaseSelector();
        }
    });
    registerCommand({
        name: 'load file',
        usage: 'LOAD FILE',
        description: 'Open a local .md, .txt, or .dat database file.',
        run: () => {
            if (databaseCapacityFull()) {
                printDatabaseSlotsFull();
                return;
            }
            getById('fileInput').click();
        }
    });
    registerCommand({
        name: 'load status',
        aliases: ['status load'],
        usage: 'LOAD STATUS',
        description: 'Load an external facility status profile.',
        adminRequired: true,
        run: () => getById('statusFileInput').click()
    });
    registerCommand({
        name: 'search',
        usage: 'SEARCH <term>',
        description: 'Search mounted database topics, dates, and keywords.',
        run: async ctx => {
            if (!isDatabaseLoaded()) {
                printNoDatabaseLoaded();
            } else if (ctx.args) {
                await runRemoteDataAccessLog('SEARCH');
                searchDatabase(ctx.args);
            } else {
                focusInputWithPrefix('SEARCH ');
                print('');
                print('Usage: /SEARCH <topic, date, or keyword>', 't-amber');
                print('');
            }
        }
    });
    registerCommand({
        name: 'categories',
        aliases: ['cats'],
        usage: 'CATEGORIES',
        description: 'Show categories and visible entry counts.',
        run: async () => {
            const logged = await runRemoteDataAccessLog('CATEGORIES');
            showCategories({ clear: !logged });
        }
    });
    registerCommand({ name: 'clear', aliases: ['cls'], usage: 'CLEAR', description: 'Clear the CLI transcript.', run: () => clearOutput({ force: true }) });
    registerCommand({ name: 'access', aliases: ['login', 'admin'], usage: 'ACCESS', description: 'Raise clearance: Employee, Restricted, Management, or Administrator.', run: () => showAccessDialog() });
    registerCommand({ name: 'logout', usage: 'LOGOUT', description: 'Terminate elevated clearance session.', requiredAccess: ACCESS_LEVELS.employee, run: () => logout() });
    registerCommand({
        name: 'list',
        usage: 'LIST [CATEGORY]',
        description: 'List categories; LIST <category> prints its entries (content at Employee+).',
        run: async ctx => {
            const logged = await runRemoteDataAccessLog('LIST');
            listDatabaseEntries(ctx.args, { clear: !logged });
        }
    });
    registerCommand({
        name: 'list all',
        aliases: ['listall'],
        usage: 'LIST ALL',
        description: 'Print the complete mounted database index.',
        adminRequired: true,
        run: async () => {
            await runRemoteDataAccessLog('LIST ALL');
            listAllEntries();
        }
    });
    registerCommand({
        name: 'fsearch',
        aliases: ['fuzzy', 'fuzzy search'],
        usage: 'FSEARCH <term>',
        description: 'Fuzzy search topics, IDs/persons, dates, keywords, and message text.',
        requiredAccess: ACCESS_LEVELS.management,
        run: async ctx => {
            if (!isDatabaseLoaded()) {
                printNoDatabaseLoaded();
            } else if (ctx.args) {
                await runRemoteDataAccessLog('FSEARCH');
                await fuzzySearch(ctx.args);
            } else {
                focusInputWithPrefix('FSEARCH ');
                print('');
                print('Usage: /FSEARCH <term>', 't-amber');
                print('');
            }
        }
    });
    registerCommand({
        name: 'eject',
        aliases: ['eject database', 'eject db'],
        usage: 'EJECT DATABASE SLOT <1-3> | EJECT ALL DATABASE',
        description: 'Unmount one database slot or every mounted database.',
        run: ctx => handleEjectCommand(ctx.args)
    });
    registerCommand({
        name: 'status',
        usage: 'STATUS LOAD | STATUS CLEAR | STATUS FORMAT',
        description: 'Manage or inspect the facility status profile.',
        run: ctx => handleStatusCommand(ctx.args)
    });
    registerCommand({ name: 'status clear', aliases: ['status reset'], usage: 'STATUS CLEAR', description: 'Restore default facility status data.', adminRequired: true, run: () => clearStatusProfile() });
    registerCommand({ name: 'status format', aliases: ['status help'], usage: 'STATUS FORMAT', description: 'Print the editable status profile format.', run: () => showStatusFormatHelp() });
    registerCommand({ name: 'sound', usage: 'SOUND ON | SOUND OFF', description: 'Toggle optional terminal audio.', run: ctx => handleSoundCommand(ctx.args) });
    registerCommand({ name: 'net', aliases: ['network'], usage: 'NET ON | NET OFF', description: 'Toggle local network-dependent terminal systems.', run: ctx => handleNetworkCommand(ctx.args) });
    registerCommand({ name: 'connect', usage: 'CONNECT BRE-XX CODE', description: 'Connect to one remote BRE site server.', run: ctx => connectBreSite(ctx) });
    registerCommand({ name: 'disconnect', usage: 'DISCONNECT', description: 'Disconnect the active BRE site server.', run: () => disconnectConnectedSite({ announce: true }) });
    registerCommand({ name: 'site status', aliases: ['bre status', 'connection status'], usage: 'SITE STATUS', description: 'Show the active BRE site connection state.', run: () => showConnectedSiteStatus() });
    registerCommand({ name: 'fx', aliases: ['effects'], usage: 'FX AUTO | FX FULL | FX LOW', description: 'Adjust visual effects intensity.', run: ctx => handleEffectsCommand('fx', ctx.args) });
    registerCommand({ name: 'performance', aliases: ['perf'], usage: 'PERFORMANCE ON | PERFORMANCE OFF | PERFORMANCE STATUS', description: 'Toggle reduced decorative effects for smoother browsers.', run: ctx => handleEffectsCommand('performance', ctx.args) });
    registerCommand({ name: 'safe mode', aliases: ['safe'], usage: 'SAFE MODE | SAFE MODE OFF', description: 'Force a session-only low-effects stability profile.', run: ctx => handleSafeModeCommand(ctx.args) });
    registerCommand({
        name: 'database editor',
        aliases: ['db editor', 'editor database', 'open database editor', 'ares database editor'],
        usage: 'DATABASE EDITOR',
        description: 'Open the local database editor page.',
        adminRequired: true,
        hidden: true,
        run: () => openSecretEditorPage('database')
    });
    registerCommand({
        name: 'diagnostics editor',
        aliases: ['diagnostic editor', 'diag editor', 'editor diagnostics', 'open diagnostics editor', 'ares diagnostics editor'],
        usage: 'DIAGNOSTICS EDITOR',
        description: 'Open the local diagnostics editor page.',
        adminRequired: true,
        hidden: true,
        run: () => openSecretEditorPage('diagnostics')
    });
    // Hidden mini-game cheat codes (implemented in js/legacy/ui.js).
    registerCommand({ name: 'kontol', hidden: true, run: () => window.startMiniGame?.() });
    registerCommand({ name: 'derfette', hidden: true, run: () => window.startCasinoGame?.() });
    registerCommand({ name: 'liebi', hidden: true, run: () => window.startLiebiGame?.() });
}

/* ------------------------------------------------------------------ *
 * Init
 * ------------------------------------------------------------------ */

export function initTerminal(options = {}) {
    terminalShutdownActive = false;
    // Each init step is isolated so one thrown error cannot prevent later
    // steps (most importantly the button-handler binding below).
    const safeCall = (label, fn) => {
        try { fn(); } catch (err) {
            window.DebugConsole?.record?.('terminal:init-step-error', { label, message: err?.message || String(err) });
            console.warn(`[init] ${label} threw`, err);
        }
    };

    safeCall('setSystemStatusVisual', () => setSystemStatusVisual(true));
    safeCall('fitMenuLabels', () => fitMenuLabels());
    safeCall('clearOutput', () => clearOutput({ force: true }));
    let restored = false;
    safeCall('restoreSnapshot', () => {
        restored = Boolean(options.restoreSnapshot && window.TerminalSessionRestore?.applySnapshot?.(options.restoreSnapshot, {
            restoredFrom: options.restoredFrom || ''
        }));
    });
    if (!restored) safeCall('showHome', () => showHome());
    safeCall('scheduleHologramStart', () => scheduleHologramStart(180));
    safeCall('updateMenuSelection', () => updateMenuSelection());
    safeCall('updateDatabaseSlotIndicators', () => updateDatabaseSlotIndicators());
    safeCall('syncAppUi', () => syncAppUi({ resetSelection: false }));
    safeCall('renderSideGlyphTelemetry', () => window.renderSideGlyphTelemetry?.(0));
    safeCall('startShellTelemetry', () => startShellTelemetry());
    safeCall('startSideTelemetryLoop', () => window.startSideTelemetryLoop?.());

    if (!terminalKeyHandlerBound) {
        document.addEventListener('keydown', handleGlobalKeydown);
        terminalKeyHandlerBound = true;
    }

    if (!menuHandlersBound) {
        menuItems.forEach((item, index) => {
            item.addEventListener('click', () => {
                selectedMenuIndex = index;
                updateMenuSelection();
                executeSelectedCommand();
            });
        });
        document.querySelectorAll('.database-slot-button[data-slot]').forEach(button => {
            button.addEventListener('click', () => {
                showDatabaseSlotDialog(Number.parseInt(button.dataset.slot || '0', 10));
            });
        });
        document.querySelectorAll('[data-panel-cmd]').forEach(button => {
            const trigger = () => {
                AudioEngine.menuSelect();
                const command = button.dataset.panelCmd || '';
                if (command === 'wireframe' && button.classList.contains('site-locked') && !AppState.connectedSiteId) {
                    printConnectedSiteRequired('FACILITY OVERVIEW MAP');
                    return;
                }
                const resolved = command === 'facility' ? 'topography' : command;
                executeCliCommand(resolved, { echo: true, history: false });
            };
            button.addEventListener('click', trigger);
            if (button.tagName !== 'BUTTON' && button.getAttribute('role') === 'button') {
                button.addEventListener('keydown', event => {
                    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
                        event.preventDefault();
                        trigger();
                    }
                });
            }
        });
        getById('commandExecuteBtn')?.addEventListener('click', submitCommandInput);
        getById('soundToggle')?.addEventListener('click', () => toggleSound({ announce: true }));
        getById('networkStatusItem')?.addEventListener('click', () => toggleNetwork({ announce: true }));
        getById('systemStatusItem')?.addEventListener('click', () => startTerminalShutdown());
        getById('rebootTerminalBtn')?.addEventListener('click', () => rebootTerminalFromOffline());
        getById('effectsToggle')?.addEventListener('click', () => {
            const mode = EffectsController.cycle();
            AudioEngine.menuSelect();
            print('');
            print(`VISUAL EFFECTS MODE: ${EffectsController.effectiveLabel()}`, mode === 'low' ? 't-amber' : 't-cyan');
            print(mode === 'low'
                ? 'Reduced effects profile active. Decorative graphics are throttled for smoother output.'
                : 'Decorative graphics profile updated.', 't-dim');
            print('');
        });
        menuHandlersBound = true;
    }
}
