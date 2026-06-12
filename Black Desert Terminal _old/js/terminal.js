// ========================================
// TERMINAL INIT
// ========================================
let terminalShutdownActive = false;
let terminalShutdownTimers = [];
let networkTransitionActive = false;

function scheduleHologramStart(delay = 0) {
    if (hologramStarted || hologramStartTimer) return;
    hologramStartTimer = setTimeout(() => {
        hologramStartTimer = null;
        requestAnimationFrame(() => initHologram());
    }, Math.max(0, delay));
}

function initTerminal(options = {}) {
    terminalShutdownActive = false;
    // Each of the following init steps is wrapped in its own try/catch so a
    // thrown error in one step cannot prevent later steps — most importantly,
    // it cannot stop the button-handler binding block below from running.
    const safeCall = (label, fn) => {
        try { fn(); } catch (err) {
            (window.DebugConsole?.record || (() => {}))('terminal:init-step-error', { label, message: err?.message || String(err) });
            if (typeof console !== 'undefined' && console.warn) console.warn(`[init] ${label} threw`, err);
        }
    };
    safeCall('setSystemStatusVisual', () => setSystemStatusVisual(true));
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
    safeCall('syncAppStateFromLegacy', () => syncAppStateFromLegacy({ resetSelection: false }));
    safeCall('renderSideGlyphTelemetry', () => {
        if (typeof renderSideGlyphTelemetry === 'function') renderSideGlyphTelemetry(0);
    });
    safeCall('startShellTelemetry', () => startShellTelemetry());
    safeCall('startSideTelemetryLoop', () => {
        if (typeof startSideTelemetryLoop === 'function') startSideTelemetryLoop();
    });

    if (!terminalKeyHandlerBound) {
        document.addEventListener('keydown', handleGlobalKeydown);
        terminalKeyHandlerBound = true;
    }

    // Click on menu items
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
                const slotIndex = Number.parseInt(button.dataset.slot || '0', 10);
                showDatabaseSlotDialog(slotIndex);
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
            // Sections / divs with role="button" need explicit keyboard activation;
            // real <button> elements get this for free.
            if (button.tagName !== 'BUTTON' && button.getAttribute('role') === 'button') {
                button.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
                        event.preventDefault();
                        trigger();
                    }
                });
            }
        });
        const executeButton = document.getElementById('commandExecuteBtn');
        if (executeButton) {
            executeButton.addEventListener('click', submitCommandInput);
        }
        const soundToggle = getById('soundToggle');
        if (soundToggle) {
            soundToggle.addEventListener('click', () => {
                toggleSound({ announce: true });
            });
        }
        const networkToggle = getById('networkStatusItem');
        if (networkToggle) {
            networkToggle.addEventListener('click', () => {
                toggleNetwork({ announce: true });
            });
        }
        const systemToggle = getById('systemStatusItem');
        if (systemToggle) {
            systemToggle.addEventListener('click', () => {
                startTerminalShutdown();
            });
        }
        const rebootButton = getById('rebootTerminalBtn');
        if (rebootButton) {
            rebootButton.addEventListener('click', () => {
                rebootTerminalFromOffline();
            });
        }
        const effectsToggle = getById('effectsToggle');
        if (effectsToggle) {
            effectsToggle.addEventListener('click', () => {
                const mode = EffectsController.cycle();
                AudioEngine.menuSelect();
                print('');
                print(`VISUAL EFFECTS MODE: ${EffectsController.effectiveLabel()}`, mode === 'low' ? 't-amber' : 't-cyan');
                print(mode === 'low'
                    ? 'Reduced effects profile active. Decorative graphics are throttled for smoother output.'
                    : 'Decorative graphics profile updated.', 't-dim');
                print('');
            });
        }
        menuHandlersBound = true;
    }
}

function submitCommandInput() {
    const input = document.getElementById('commandInput');
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

function updateShellTelemetry() {
    const now = new Date();
    const time = document.getElementById('shellSystemTime');
    const pad = value => String(value).padStart(2, '0');
    const inWorldYear = 2084;
    if (time) {
        time.textContent = `${inWorldYear}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}  ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    }
}

function startShellTelemetry() {
    if (!document.getElementById('shellSystemTime')) return;
    updateShellTelemetry();
    if (shellTelemetryTimer) return;
    shellTelemetryTimer = setInterval(updateShellTelemetry, 1000);
}

function stopShellTelemetry() {
    if (!shellTelemetryTimer) return;
    clearInterval(shellTelemetryTimer);
    shellTelemetryTimer = null;
}

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
    closeDiagnosticDashboard();
    closeFacilityStatus();
    pauseRealtimePanels();
    stopShellTelemetry();
    if (typeof stopSideTelemetryLoop === 'function') stopSideTelemetryLoop();

    const stepDelay = prefersReducedMotion ? 70 : 300;
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
    if (terminalShutdownActive || document.body.classList.contains('terminal-offline')) {
        return;
    }

    if (document.getElementById('liebiOverlay') || document.getElementById('gameOverlay') || document.getElementById('casinoOverlay')) {
        return;
    }

    const facilityOverlay = document.getElementById('facilityOverlay');
    if (facilityOverlay.classList.contains('active')) {
        if (e.key === 'Escape') {
            e.preventDefault();
            closeFacilityStatus();
        }
        return;
    }

    const diagnosticOverlay = document.getElementById('diagnosticOverlay');
    if (diagnosticOverlay.classList.contains('active')) {
        if (e.key === 'Escape') {
            e.preventDefault();
            closeDiagnosticDashboard();
        }
        return;
    }

    const databaseModal = document.getElementById('databaseModal');
    if (databaseModal) {
        if (e.key === 'Escape') {
            e.preventDefault();
            closeDatabaseModal();
            return;
        }
        if (e.key === 'Enter') {
            const authButton = databaseModal.querySelector('[data-authenticate-database="true"]');
            if (authButton && !authButton.disabled) {
                e.preventDefault();
                authButton.click();
            }
            return;
        }
        return;
    }

    // Check if dialog is open
    if (document.getElementById('accessDialog').classList.contains('active')) {
        return;
    }
    
    const input = document.getElementById('commandInput');
    // If typing in input
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

    const activeMenuItem = document.activeElement && document.activeElement.closest
        ? document.activeElement.closest('.menu-item')
        : null;
    if (activeMenuItem && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        const focusedIndex = Number(activeMenuItem.dataset.index);
        if (Number.isFinite(focusedIndex)) selectedMenuIndex = focusedIndex;
        updateMenuSelection();
        executeSelectedCommand();
        return;
    }

    if (shouldRouteKeyToCommandInput(e) && routeKeyToCommandInput(e, input)) {
        return;
    }
    
    // Menu navigation
    if (e.key === 'ArrowUp') {
        e.preventDefault();
        navigateMenu(-1);
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        navigateMenu(1);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        executeSelectedCommand();
    } else if (e.key === 'ArrowLeft' && totalPages > 1) {
        e.preventDefault();
        prevPage();
    } else if (e.key === 'ArrowRight' && totalPages > 1) {
        e.preventDefault();
        nextPage();
    }
}

function navigateMenu(direction) {
    AudioEngine.menuMove();
    selectedMenuIndex += direction;
    
    // Wrap around
    if (selectedMenuIndex < 0) selectedMenuIndex = menuItems.length - 1;
    if (selectedMenuIndex >= menuItems.length) selectedMenuIndex = 0;
    
    // Skip locked admin items if not admin
    const item = menuItems[selectedMenuIndex];
    if (!adminMode && item.classList.contains('admin-cmd') && item.classList.contains('locked')) {
        navigateMenu(direction);
        return;
    }
    
    updateMenuSelection();
}

function updateMenuSelection() {
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

function executeSelectedCommand() {
    const item = menuItems[selectedMenuIndex];
    const cmd = item.dataset.cmd;
    
    // Check if locked
    if (item.classList.contains('locked')) {
        AudioEngine.errorBuzz();
        Animator.alertShake(item);
        return;
    }
    
    AudioEngine.menuSelect();

    const menuCommands = {
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
    executeCliCommand(menuCommands[cmd] || cmd, { echo: true, history: false });
}

function focusInputWithPrefix(prefix) {
    const input = document.getElementById('commandInput');
    input.value = prefix;
    input.focus();
    menuFocused = false;
}

// ========================================
// OUTPUT & PAGINATION WITH TYPEWRITER
// ========================================
let typewriterQueue = [];
let isTyping = false;
let skipTypewriter = false;
let typewriterRunId = 0;
let outputRenderFrame = null;
let typewriterFrame = null;
let bufferRecalcPending = false;
let bufferRecalcFrame = null;
let terminalRuntimeSuspendedForMap = false;
let outputGroupCounter = 0;
let lastTypewriterClickAt = 0;
const COMMAND_PROMPT = 'ARES>';
const COMMAND_HISTORY_STORAGE_KEY = 'aresCommandHistory.v1';
const COMMAND_HISTORY_LIMIT = 100;
const commandRegistry = [];
const commandMap = new Map();
let commandHistory = loadStoredCommandHistory();
let commandHistoryIndex = commandHistory.length;
let commandsRegistered = false;

function loadStoredCommandHistory() {
    try {
        const raw = localStorage.getItem(COMMAND_HISTORY_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter(item => typeof item === 'string' && item.trim())
            .slice(-COMMAND_HISTORY_LIMIT);
    } catch (error) {
        return [];
    }
}

function persistCommandHistory() {
    try {
        localStorage.setItem(
            COMMAND_HISTORY_STORAGE_KEY,
            JSON.stringify(commandHistory.slice(-COMMAND_HISTORY_LIMIT))
        );
    } catch (error) {
        // Quota or privacy mode — silently drop persistence; in-memory history still works.
    }
}

function setTerminalTypingState(active) {
    isTyping = Boolean(active);
    if (document.body) {
        document.body.classList.toggle('terminal-typing', isTyping && !prefersReducedMotion);
    }
}

function suspendTerminalRuntimeForMap() {
    terminalRuntimeSuspendedForMap = true;
    stopShellTelemetry();
    if (hologramStartTimer) {
        clearTimeout(hologramStartTimer);
        hologramStartTimer = null;
    }
    if (outputRenderFrame) {
        cancelAnimationFrame(outputRenderFrame);
        outputRenderFrame = null;
    }
    if (typewriterFrame) {
        cancelAnimationFrame(typewriterFrame);
        typewriterFrame = null;
    }
    if (bufferRecalcFrame) {
        cancelAnimationFrame(bufferRecalcFrame);
        bufferRecalcFrame = null;
    }
    typewriterRunId++;
    setTerminalTypingState(false);
}

function resumeTerminalRuntimeAfterMap() {
    terminalRuntimeSuspendedForMap = false;
    startShellTelemetry();
    updatePageIndicator();
    if (typewriterQueue.length && !isTyping) {
        typewriterRunId++;
        processTypewriterQueue(typewriterRunId);
    }
    scheduleHologramStart(240);
}

function scrollTranscriptToBottom() {
    const output = getById('output');
    if (!output) return;
    output.scrollTop = output.scrollHeight;
}

function scrollTranscriptBy(direction) {
    const output = getById('output');
    if (!output) return;
    const amount = Math.max(120, Math.floor(output.clientHeight * 0.72));
    output.scrollBy({ top: amount * direction, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    AudioEngine.pageFlip();
}

/* --------------------------------------------------------------------------
   Inline color markup helpers
   --------------------------------------------------------------------------
   Database entries (and any other printed line) may contain BBCode-style
   color tags written by the Database Studio editor, e.g.
       [color=amber]WARNING[/color] containment breach
   These tags must render as <span class="t-amber"> in the terminal output
   while leaving the typewriter animation intact for the visible characters
   only. The parser is lenient: unmatched open/close tags don't break the
   line, they just affect the colored span boundaries.
   -------------------------------------------------------------------------- */

// Color universe is defined in js/utils.js (TERMINAL_COLOR_NAMES) so adding a
// new color is a single-file change. This regex is derived from that list.
const COLOR_TAG_NAME_RE = new RegExp('^(' + TERMINAL_COLOR_NAMES.join('|') + ')$', 'i');

function lineHasColorMarkup(text) {
    return /\[color=[a-z]+\]|\[\/color\]/i.test(String(text || ''));
}

function parseColorSegments(text) {
    const value = String(text || '');
    const segments = [];
    let buf = '';
    let active = null;
    let i = 0;
    while (i < value.length) {
        const rest = value.slice(i);
        const open = rest.match(/^\[color=([a-z]+)\]/i);
        if (open) {
            if (buf) segments.push({ text: buf, className: active ? 't-' + active : null });
            buf = '';
            const name = open[1].toLowerCase();
            active = COLOR_TAG_NAME_RE.test(name) ? name : null;
            i += open[0].length;
            continue;
        }
        const close = rest.match(/^\[\/color\]/i);
        if (close) {
            if (buf) segments.push({ text: buf, className: active ? 't-' + active : null });
            buf = '';
            active = null;
            i += close[0].length;
            continue;
        }
        buf += value[i];
        i++;
    }
    if (buf) segments.push({ text: buf, className: active ? 't-' + active : null });
    return segments;
}

function renderColoredText(element, text) {
    if (!element) return;
    element.textContent = '';
    const segments = parseColorSegments(text);
    segments.forEach(seg => {
        if (!seg.text) return;
        if (seg.className) {
            const span = document.createElement('span');
            span.className = seg.className;
            span.textContent = seg.text;
            element.appendChild(span);
        } else {
            element.appendChild(document.createTextNode(seg.text));
        }
    });
}

function setLineText(element, text) {
    if (lineIsImageMarkdown(text)) renderImageLine(element, text);
    else if (lineHasColorMarkup(text)) renderColoredText(element, text);
    else element.textContent = String(text ?? '');
}

/* --------------------------------------------------------------------------
   Embedded image rendering
   IMG_LINE_RE is defined in js/utils.js so the database renderer and the
   terminal renderer share one source of truth.
   -------------------------------------------------------------------------- */

function lineIsImageMarkdown(text) {
    return IMG_LINE_RE.test(String(text || ''));
}

function renderImageLine(element, text) {
    const m = String(text || '').match(IMG_LINE_RE);
    if (!m) return false;
    element.textContent = '';
    const img = document.createElement('img');
    img.src = m[2];
    img.alt = m[1] || 'image';
    img.className = 'entry-image-embed';
    img.loading = 'lazy';
    img.decoding = 'async';
    element.appendChild(img);
    return true;
}

/* Balance color tags across newlines so each physical line is self-contained
   for the line-by-line print() pipeline. Callers (e.g. database body render)
   can run a body through this before splitting on \n so multi-line colored
   regions still render correctly. */
function balanceColorTagsAcrossLines(text) {
    const value = String(text || '');
    let out = '';
    let active = null;
    let i = 0;
    while (i < value.length) {
        const rest = value.slice(i);
        const open = rest.match(/^\[color=([a-z]+)\]/i);
        if (open) {
            const name = open[1].toLowerCase();
            active = COLOR_TAG_NAME_RE.test(name) ? name : null;
            out += open[0];
            i += open[0].length;
            continue;
        }
        const close = rest.match(/^\[\/color\]/i);
        if (close) {
            active = null;
            out += '[/color]';
            i += close[0].length;
            continue;
        }
        const ch = value[i];
        if (ch === '\n' && active) {
            out += '[/color]\n[color=' + active + ']';
            i++;
            continue;
        }
        out += ch;
        i++;
    }
    return out;
}

function enqueueOutputLine(text, className = '', options = {}) {
    const line = {
        text: String(text ?? ''),
        className: String(className || ''),
        groupId: options.groupId || ''
    };
    outputBuffer.push(line);

    if (options.instant || skipTypewriter || prefersReducedMotion) {
        const output = getById('output');
        if (!output) return;
        const div = document.createElement('div');
        const typewriterClass = line.text.length ? 'terminal-typewriter-line' : '';
        div.className = `output-line ${typewriterClass} ${line.className}`.trim();
        setLineText(div, line.text);
        output.appendChild(div);
        scrollTranscriptToBottom();
        updatePageIndicator();
        return;
    }

    typewriterQueue.push({ text: line.text, className: line.className });
    updatePageIndicator();
    if (!isTyping && !terminalRuntimeSuspendedForMap) {
        typewriterRunId++;
        processTypewriterQueue(typewriterRunId);
    }
}

function renderTranscriptInstantFromBuffer() {
    const output = getById('output');
    if (!output) return;
    if (outputRenderFrame) {
        cancelAnimationFrame(outputRenderFrame);
        outputRenderFrame = null;
    }
    if (typewriterFrame) {
        cancelAnimationFrame(typewriterFrame);
        typewriterFrame = null;
    }
    if (bufferRecalcFrame) {
        cancelAnimationFrame(bufferRecalcFrame);
        bufferRecalcFrame = null;
    }
    typewriterQueue = [];
    typewriterRunId++;
    setTerminalTypingState(false);
    clearElement(output);
    outputBuffer.forEach(line => {
        const div = document.createElement('div');
        const typewriterClass = String(line.text || '').length ? 'terminal-typewriter-line' : '';
        div.className = `output-line ${typewriterClass} ${line.className || ''}`.trim();
        setLineText(div, line.text);
        output.appendChild(div);
    });
    scrollTranscriptToBottom();
    updatePageIndicator();
}

function appendMutableOutputLine(text = '', className = '') {
    const line = {
        text: String(text ?? ''),
        className: String(className || ''),
        groupId: ''
    };
    outputBuffer.push(line);
    const output = getById('output');
    if (!output) {
        updatePageIndicator();
        return {
            update(nextText, nextClassName) {
                line.text = String(nextText ?? '');
                if (nextClassName !== undefined) line.className = String(nextClassName || '');
            }
        };
    }

    const div = document.createElement('div');
    div.className = `output-line terminal-mutable-line ${line.className}`.trim();
    setLineText(div, line.text);
    output.appendChild(div);
    scrollTranscriptToBottom();
    updatePageIndicator();

    return {
        update(nextText, nextClassName) {
            line.text = String(nextText ?? '');
            if (nextClassName !== undefined) line.className = String(nextClassName || '');
            div.className = `output-line terminal-mutable-line ${line.className}`.trim();
            setLineText(div, line.text);
            scrollTranscriptToBottom();
            updatePageIndicator();
        }
    };
}

function appendCommandEcho(commandText) {
    const clean = String(commandText || '').trim();
    if (!clean) return;
    const needsDivider = outputBuffer.some(line => String(line.text || '').trim());
    if (needsDivider) enqueueOutputLine('--- ARES COMMAND CHANNEL --------------------------------', 'cli-divider t-dim', { instant: true });
    enqueueOutputLine(`${COMMAND_PROMPT} ${clean}`, 'cli-command-line t-amber', { instant: true });
}

function addToBuffer(text, className = '') {
    const lines = String(text ?? '').split('\n');
    lines.forEach(line => {
        if (isOutputPageBreak(line)) {
            addPageBreakToBuffer();
            return;
        }
        enqueueOutputLine(line, className);
    });
}

function isOutputPageBreak(text) {
    return ['@pagebreak', '[pagebreak]', '{pagebreak}'].includes(String(text || '').trim().toLowerCase());
}

function addPageBreakToBuffer() {
    enqueueOutputLine('', '');
}

function addOutputGroup(lines) {
    const group = lines.filter(line => line && typeof line.text === 'string');
    if (!group.length) return;
    const groupId = `help-${++outputGroupCounter}`;
    group.forEach(line => {
        enqueueOutputLine(line.text, line.className || '', { groupId });
    });
}

function isHelpHeadingLine(text, className = '') {
    if (!String(text || '').trim()) return false;
    const classes = String(className || '').split(/\s+/);
    return classes.includes('t-cyan') || classes.includes('t-red');
}

function renderHelpLinesGrouped(lines) {
    let group = [];

    function flushGroup() {
        if (!group.length) return;
        addOutputGroup(group);
        group = [];
    }

    lines.forEach(line => {
        if (isOutputPageBreak(line.text)) {
            flushGroup();
            addPageBreakToBuffer();
            return;
        }
        if (isHelpHeadingLine(line.text, line.className) && group.length) {
            flushGroup();
        }
        group.push(line);
    });
    flushGroup();
}

function scheduleBufferRecalculate() {
    updatePageIndicator();
}

function appendLineToPages(pages, line) {
    let current = pages[pages.length - 1];
    if (current.length >= linesPerPage) {
        current = [];
        pages.push(current);
    }
    current.push({ text: line.text, className: line.className || '' });
}

function appendGroupToPages(pages, group) {
    if (!group.length) return;
    let current = pages[pages.length - 1];
    const heading = isHelpHeadingLine(group[0].text, group[0].className) ? group[0] : null;

    if (group.length <= linesPerPage) {
        if (current.length && current.length + group.length > linesPerPage) {
            current = [];
            pages.push(current);
        }
        group.forEach(line => current.push({ text: line.text, className: line.className || '' }));
        return;
    }

    if (!heading) {
        group.forEach(line => appendLineToPages(pages, line));
        return;
    }

    if (current.length && linesPerPage - current.length < 2) {
        current = [];
        pages.push(current);
    }

    current.push({ text: heading.text, className: heading.className || '' });
    const body = group.slice(1);
    while (body.length) {
        current = pages[pages.length - 1];
        if (current.length >= linesPerPage) {
            current = [{ text: heading.text, className: heading.className || '' }];
            pages.push(current);
        }
        const bodyLine = body.shift();
        current.push({ text: bodyLine.text, className: bodyLine.className || '' });
    }
}

function buildOutputPages() {
    const pages = [[]];
    for (let i = 0; i < outputBuffer.length; i++) {
        const line = outputBuffer[i];
        if (line.pageBreak) {
            if (pages[pages.length - 1].length) pages.push([]);
            continue;
        }
        if (line.groupId) {
            const groupId = line.groupId;
            const group = [];
            while (i < outputBuffer.length && outputBuffer[i].groupId === groupId) {
                group.push(outputBuffer[i]);
                i++;
            }
            i--;
            appendGroupToPages(pages, group);
            continue;
        }
        appendLineToPages(pages, line);
    }
    while (pages.length > 1 && pages[pages.length - 1].length === 0) pages.pop();
    return pages;
}

function recalculatePages() {
    outputPages = [outputBuffer];
    totalPages = 1;
    currentPage = 0;
    updatePageIndicator();
}

function scheduleCurrentPageRender() {
    updatePageIndicator();
}

function clearOutput(options = {}) {
    const force = options === true || options.force === true;
    if (!force) return;
    if (outputRenderFrame) {
        cancelAnimationFrame(outputRenderFrame);
        outputRenderFrame = null;
    }
    if (typewriterFrame) {
        cancelAnimationFrame(typewriterFrame);
        typewriterFrame = null;
    }
    if (bufferRecalcFrame) {
        cancelAnimationFrame(bufferRecalcFrame);
        bufferRecalcFrame = null;
    }
    outputBuffer = [];
    outputPages = [[]];
    currentPage = 0;
    totalPages = 1;
    bufferRecalcPending = false;
    outputGroupCounter = 0;
    typewriterQueue = [];
    setTerminalTypingState(false);
    typewriterRunId++;
    updatePageIndicator();
    clearElement(getById('output'));
}

function updatePageIndicator() {
    const indicator = getById('pageIndicator');
    const hint = getById('navHint');
    if (!indicator || !hint) return;
    indicator.textContent = 'CLI';
    hint.classList.remove('visible');
}

function renderCurrentPage() {
    updatePageIndicator();
    scrollTranscriptToBottom();
}

function processTypewriterQueue(runId = typewriterRunId) {
    if (runId !== typewriterRunId) return;
    if (terminalRuntimeSuspendedForMap) {
        setTerminalTypingState(false);
        typewriterFrame = null;
        return;
    }
    if (typewriterQueue.length === 0) {
        setTerminalTypingState(false);
        typewriterFrame = null;
        scheduleHologramStart(260);
        return;
    }
    
    setTerminalTypingState(true);
    const line = typewriterQueue.shift();
    const output = getById('output');
    if (!output) {
        setTerminalTypingState(false);
        return;
    }
    const div = document.createElement('div');
    const typewriterClass = line.text.length ? 'terminal-typewriter-line terminal-typewriter-active' : '';
    div.className = `output-line ${typewriterClass} ${line.className}`.trim();
    output.appendChild(div);
    scrollTranscriptToBottom();
    
    const queueNextLine = (delay = TYPEWRITER_CONFIG.lineDelay) => {
        let startTime = 0;
        const waitForNextFrame = (timestamp = 0) => {
            if (runId !== typewriterRunId) return;
            if (!startTime) startTime = timestamp;
            if (timestamp - startTime >= delay) {
                typewriterFrame = null;
                processTypewriterQueue(runId);
            } else {
                typewriterFrame = requestAnimationFrame(waitForNextFrame);
            }
        };
        typewriterFrame = requestAnimationFrame(waitForNextFrame);
    };

    if (skipTypewriter || line.text.length === 0 || lineIsImageMarkdown(line.text)) {
        setLineText(div, line.text);
        div.classList.remove('terminal-typewriter-active');
        scrollTranscriptToBottom();
        queueNextLine();
        return;
    }

    const typeOpts = {
        charsPerSecond: TYPEWRITER_CONFIG.terminalCharsPerSecond,
        maxCharsPerFrame: TYPEWRITER_CONFIG.terminalMaxCharsPerFrame,
        shouldCancel: () => runId !== typewriterRunId,
        onFrame: frame => {
            typewriterFrame = frame;
        },
        onChar: index => {
            if (index % 12 === 0) scrollTranscriptToBottom();
            const now = performance.now();
            if (now - lastTypewriterClickAt >= TYPEWRITER_CONFIG.terminalKeyClickMs) {
                lastTypewriterClickAt = now;
                AudioEngine.keyClick();
            }
        }
    };

    const typingPromise = lineHasColorMarkup(line.text)
        ? typeColoredTextSmooth(div, parseColorSegments(line.text), typeOpts)
        : typeTextSmooth(div, line.text, typeOpts);

    typingPromise.then(result => {
        if (!result || result.cancelled || runId !== typewriterRunId) return;
        scrollTranscriptToBottom();
        queueNextLine();
    });
}

function print(text, className = '') {
    addToBuffer(text, className);
}

function prevPage() {
    scrollTranscriptBy(-1);
}

function nextPage() {
    scrollTranscriptBy(1);
}

// Instant render for page navigation (no typewriter)
function renderCurrentPageInstant() {
    updatePageIndicator();
    scrollTranscriptToBottom();
    scheduleHologramStart(260);
}

// ========================================
// COMMANDS
// ========================================
function printAccessRequired(action, requiredLevel = ACCESS_LEVELS.admin) {
    const required = normalizeAccessLevel(requiredLevel);
    const label = accessLevelLabel(required).toUpperCase();
    const accessLabel = required === ACCESS_LEVELS.elevated ? 'ELEVATED/ADMIN' : label;
    AudioEngine.errorBuzz();
    clearOutput();
    print('');
    print(`${action}: ${accessLabel} ACCESS REQUIRED`, required === ACCESS_LEVELS.elevated ? 't-amber' : 't-red');
    print(required === ACCESS_LEVELS.elevated
        ? 'Use /ACCESS with Elevated or Admin credentials before running this command.'
        : contentGet('admin.required_hint', 'Use /ACCESS to authenticate before modifying status systems.'), 't-dim');
    print('');
}

function printAdminRequired(action) {
    printAccessRequired(action, ACCESS_LEVELS.admin);
}

function printNoDatabaseLoaded() {
    AudioEngine.errorBuzz();
    clearOutput();
    print('');
    print(contentGet('errors.no_database', 'ERROR: No database loaded.'), 't-red');
    print(contentGet('errors.no_database_hint', 'Use /LOAD DATABASE to select a package first.'), 't-dim');
    print('');
}

function printDatabaseSlotsFull() {
    AudioEngine.errorBuzz();
    clearOutput();
    print('');
    print('DATABASE SLOT CAPACITY REACHED', 't-red');
    print('Three database packages are already mounted.', 't-dim');
    print('Eject a slot before loading another package.', 't-amber');
    print('Commands: EJECT DATABASE SLOT 1 / 2 / 3 or EJECT ALL DATABASE', 't-dim');
    print('');
}

function handleEjectCommand(args) {
    const request = normalizeStatusKey(args).replace(/_/g, ' ');
    if (!request) {
        clearOutput();
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

    clearOutput();
    print('');
    print('EJECT COMMAND NOT RECOGNIZED', 't-red');
    print('Use /EJECT ALL DATABASE or /EJECT DATABASE SLOT 1 / 2 / 3.', 't-dim');
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
    const snapshot = typeof getDiagnosticPerformanceSnapshot === 'function'
        ? getDiagnosticPerformanceSnapshot()
        : null;
    const profile = typeof getEffectiveRenderProfile === 'function'
        ? getEffectiveRenderProfile()
        : null;
    print('');
    print('PERFORMANCE STATUS', 't-bright');
    print(`Browser profile : ${snapshot?.browser || (typeof detectBrowserProfile === 'function' ? detectBrowserProfile() : 'unknown')}`, 't-dim');
    print(`Effects mode    : ${snapshot?.effectiveEffects || EffectsController.effectiveLabel()}`, EffectsController.isLow() ? 't-amber' : 't-cyan');
    print(`Render profile  : ${snapshot?.profile || profile?.name || 'unknown'}`, 't-cyan');
    print(`Reduced motion  : ${prefersReducedMotion ? 'YES' : 'NO'}`, prefersReducedMotion ? 't-amber' : 't-dim');
    print(`Safe mode       : ${typeof safeModeActive === 'function' && safeModeActive() ? 'ON' : 'OFF'}`, typeof safeModeActive === 'function' && safeModeActive() ? 't-amber' : 't-dim');
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

function setSoundEnabled(enabled, options = {}) {
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

function printNetworkUnavailable(systemName = 'NETWORK SYSTEM') {
    AudioEngine.errorBuzz();
    print('');
    print(`${systemName.toUpperCase()}: NETWORK OFFLINE`, 't-red');
    print('Network-dependent systems are unavailable until NET ONLINE is restored.', 't-dim');
    print('Use the NET status button or command /NET ON to enable network services.', 't-amber');
    print('');
}

function printConnectedSiteRequired(systemName = 'REMOTE SYSTEM') {
    AudioEngine.errorBuzz();
    print('');
    print(`${systemName.toUpperCase()}: BRE SITE LINK REQUIRED`, 't-amber');
    print('This panel uses the connected BRE site diagnostic profile and facility data.', 't-dim');
    print('Use /CONNECT BRE-01 ALPHA-7742 after NET ONLINE to mount a remote site.', 't-cyan');
    print('');
}

async function setNetworkOnline(online, options = {}) {
    const nextOnline = Boolean(online);
    if (networkTransitionActive) return AppState.networkOnline;
    if (AppState.networkOnline === nextOnline) {
        syncAppUi({ resetSelection: false });
        return AppState.networkOnline;
    }

    if (!nextOnline && typeof disconnectConnectedSite === 'function') {
        disconnectConnectedSite({ announce: false });
    }

    if (!nextOnline) {
        setAppState({ networkOnline: false }, { resetSelection: false });
        if (typeof renderSideGlyphTelemetry === 'function') renderSideGlyphTelemetry(facilityFrame || diagnosticFrame || 0);
        closeDiagnosticDashboard();
        closeFacilityStatus();
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
    if (options.announce !== false && typeof runNetworkServicesLog === 'function') {
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
    } else if (options.announce !== false) {
        print('');
        print('NET ONLINE', 't-cyan');
        print('Local relay restored. Topography and map pages are available.', 't-dim');
        print('');
    }

    setAppState({ networkOnline: true }, { resetSelection: false });
    if (typeof renderSideGlyphTelemetry === 'function') renderSideGlyphTelemetry(facilityFrame || diagnosticFrame || 0);
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
    if (['toggle', 'switch'].includes(setting) || !setting) {
        if (!setting) {
            print('');
            print(`NETWORK STATUS: ${AppState.networkOnline ? 'NET ONLINE' : 'NET OFFLINE'}`, AppState.networkOnline ? 't-cyan' : 't-red');
            print('Usage: /NET ON | /NET OFF | /NET TOGGLE', 't-dim');
            print('');
            return;
        }
        await toggleNetwork({ announce: true });
        return;
    }
    print('');
    print('Usage: /NET ON | /NET OFF | /NET TOGGLE', 't-amber');
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

function normalizeCommandText(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}

function splitCommandArgs(value) {
    const normalized = normalizeCommandText(value);
    return normalized ? normalized.split(/\s+/) : [];
}

function slashifyUsage(usage) {
    return String(usage || '')
        .split('|')
        .map(segment => {
            const trimmed = segment.trim();
            if (!trimmed) return segment;
            if (trimmed.startsWith('/')) return ` ${trimmed} `;
            return ` /${trimmed} `;
        })
        .join('|')
        .replace(/^\s+|\s+$/g, '');
}

function registerCommand(definition) {
    if (!definition || !definition.name || typeof definition.run !== 'function') return;
    const command = {
        aliases: [],
        usage: definition.name.toUpperCase(),
        description: '',
        adminRequired: false,
        requiredAccess: ACCESS_LEVELS.employee,
        hidden: false,
        ...definition
    };
    command.requiredAccess = normalizeAccessLevel(definition.requiredAccess || (command.adminRequired ? ACCESS_LEVELS.admin : ACCESS_LEVELS.employee));
    command.adminRequired = command.requiredAccess === ACCESS_LEVELS.admin;
    // Hidden cheat-code commands keep bare names only — they should not be advertised
    // via a /-prefixed alias either.
    if (!command.hidden) {
        command.usage = slashifyUsage(command.usage);
    }
    commandRegistry.push(command);
    const baseAliases = [command.name, ...(command.aliases || [])];
    const allAliases = new Set();
    baseAliases.forEach(alias => {
        const key = normalizeCommandText(alias).toLowerCase();
        if (!key) return;
        allAliases.add(key);
        // Also register the slash-prefixed form so users can type /search, /home, etc.
        if (!command.hidden && !key.startsWith('/')) {
            allAliases.add(`/${key}`);
        }
    });
    allAliases.forEach(key => commandMap.set(key, command));
}

function resolveCommandLine(input) {
    const raw = normalizeCommandText(input);
    const lower = raw.toLowerCase();
    if (!lower) return null;

    const aliases = Array.from(commandMap.keys()).sort((a, b) => b.length - a.length);
    for (const alias of aliases) {
        if (lower === alias || lower.startsWith(`${alias} `)) {
            const args = raw.slice(alias.length).trim();
            return {
                command: commandMap.get(alias),
                alias,
                args,
                argv: splitCommandArgs(args)
            };
        }
    }
    return null;
}

function visibleCommandList(includeRestricted = true) {
    return commandRegistry
        .filter(command => !command.hidden && (includeRestricted || hasAccess(command.requiredAccess)))
        .sort((a, b) => a.usage.localeCompare(b.usage));
}

function rememberCommand(input) {
    const value = normalizeCommandText(input);
    if (!value) return;
    if (commandHistory[commandHistory.length - 1] !== value) commandHistory.push(value);
    while (commandHistory.length > COMMAND_HISTORY_LIMIT) commandHistory.shift();
    commandHistoryIndex = commandHistory.length;
    persistCommandHistory();
}

function recallCommandHistory(direction) {
    const input = getById('commandInput');
    if (!input || !commandHistory.length) return;
    commandHistoryIndex = Math.max(0, Math.min(commandHistory.length, commandHistoryIndex + direction));
    input.value = commandHistory[commandHistoryIndex] || '';
    requestAnimationFrame(() => {
        input.setSelectionRange(input.value.length, input.value.length);
    });
}

function autocompleteCommandInput() {
    const input = getById('commandInput');
    if (!input) return;
    const current = normalizeCommandText(input.value).toLowerCase();
    if (!current) return;
    const matches = Array.from(commandMap.keys())
        .filter(alias => !commandMap.get(alias).hidden && alias.startsWith(current))
        .sort((a, b) => a.length - b.length || a.localeCompare(b));
    if (matches.length === 1) {
        input.value = matches[0].toUpperCase();
        input.setSelectionRange(input.value.length, input.value.length);
        AudioEngine.menuSelect();
        return;
    }
    if (matches.length > 1) {
        print('');
        print(`AUTOCOMPLETE: ${matches.map(match => match.toUpperCase()).join(' | ')}`, 't-dim');
        print('');
        AudioEngine.keyClick();
    }
}

function commandUsageKey(command) {
    return String(command?.usage || '').toUpperCase().replace(/^\/+/, '').trim();
}

function commandRequiresNetwork(command) {
    const key = commandUsageKey(command);
    return key === 'DIAGNOSTIC' || key === 'TOPOGRAPHY' || key === 'WIREFRAME MAP';
}

function commandRequiresConnectedSite(command) {
    const key = commandUsageKey(command);
    return key === 'DIAGNOSTIC';
}

async function executeCliCommand(input, options = {}) {
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

function handleSoundCommand(args) {
    const setting = args.toLowerCase();
    if (setting === 'on') {
        setSoundEnabled(true, { announce: true });
    } else if (setting === 'off') {
        setSoundEnabled(false, { announce: true });
    } else if (setting === 'toggle') {
        toggleSound({ announce: true });
    } else {
        print('');
        print('Usage: /SOUND ON | /SOUND OFF | /SOUND TOGGLE', 't-amber');
        print(`Current sound setting: ${AudioEngine.enabled ? 'ON' : 'OFF'}`, 't-dim');
        print('');
    }
}

function handleStatusCommand(args) {
    const setting = args.toLowerCase();
    if (setting === 'load') {
        if (!hasAccess(ACCESS_LEVELS.admin)) {
            printAdminRequired('STATUS LOAD');
            return;
        }
        document.getElementById('statusFileInput').click();
    } else if (setting === 'clear' || setting === 'reset') {
        if (!hasAccess(ACCESS_LEVELS.admin)) {
            printAdminRequired('STATUS CLEAR');
            return;
        }
        clearStatusProfile();
    } else if (setting === 'format' || setting === 'help') {
        showStatusFormatHelp();
    } else if (setting === 'facility') {
        showFacilityStatus();
    } else {
        print('');
        print('Usage: /STATUS LOAD | /STATUS CLEAR | /STATUS FORMAT | /STATUS FACILITY', 't-amber');
        print(`Current profile: ${statusProfile.source}`, 't-dim');
        print('');
    }
}

const SECRET_EDITOR_PAGES = {
    database: {
        label: 'DATABASE EDITOR',
        path: 'database-studio.html'
    },
    diagnostics: {
        label: 'DIAGNOSTICS EDITOR',
        path: 'diagnostics-editor.html'
    }
};

async function openSecretEditorPage(kind) {
    const page = SECRET_EDITOR_PAGES[kind];
    if (!page) return;

    const navigate = () => {
        window.location.href = page.path;
    };

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
    } catch (error) {
        AudioEngine.errorBuzz();
        print('EDITOR MODULE NOT FOUND', 't-red');
        print(`Missing file: ${page.path}`, 't-dim');
        print('Upload the editor HTML file at the GitHub Pages root, or keep it local-only.', 't-dim');
        print('');
    }
}

function registerTerminalCommands() {
    if (commandsRegistered) return;
    commandsRegistered = true;

    registerCommand({
        name: 'home',
        aliases: ['main'],
        usage: 'HOME',
        description: 'Display the corporate terminal home notice.',
        run: () => showHome()
    });
    registerCommand({
        name: 'welcome',
        aliases: ['intranet'],
        usage: 'WELCOME',
        description: 'Display the connected BRE site intranet index.',
        run: () => showWelcome()
    });
    registerCommand({
        name: 'help',
        aliases: ['manual', '?'],
        usage: 'HELP',
        description: 'Display the generated system manual.',
        run: () => showHelp()
    });
    registerCommand({
        name: 'diagnostic',
        aliases: ['diag'],
        usage: 'DIAGNOSTIC',
        description: 'Open current base diagnostic dashboard.',
        run: () => showDiagnosticDashboard()
    });
    registerCommand({
        name: 'topography',
        aliases: ['facility status', 'facility', 'map', 'status facility', 'topo'],
        usage: 'TOPOGRAPHY',
        description: 'Open lazy-loaded Black Desert tactical map.',
        run: () => showFacilityStatus()
    });
    registerCommand({
        name: 'wireframe',
        aliases: ['wireframe map', 'tactical wireframe', 'tactical wireframe map'],
        usage: 'WIREFRAME MAP',
        description: 'Open the full tactical facility wireframe map.',
        run: () => showWireframeMap()
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
            document.getElementById('fileInput').click();
        }
    });
    registerCommand({
        name: 'load status',
        aliases: ['status load'],
        usage: 'LOAD STATUS',
        description: 'Load an external facility status profile.',
        adminRequired: true,
        run: () => document.getElementById('statusFileInput').click()
    });
    registerCommand({
        name: 'search',
        usage: 'SEARCH <term>',
        description: 'Search mounted database topics, dates, and keywords.',
        run: async ctx => {
            if (!databaseLoaded) {
                printNoDatabaseLoaded();
            } else if (ctx.args) {
                await runRemoteDataAccessLog?.('SEARCH');
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
            const logged = await runRemoteDataAccessLog?.('CATEGORIES');
            showCategories({ clear: !logged });
        }
    });
    registerCommand({
        name: 'clear',
        aliases: ['cls'],
        usage: 'CLEAR',
        description: 'Clear the CLI transcript.',
        run: () => clearOutput({ force: true })
    });
    registerCommand({
        name: 'access',
        aliases: ['login', 'admin'],
        usage: 'ACCESS',
        description: 'Request Elevated or Admin clearance.',
        run: () => showAccessDialog()
    });
    registerCommand({
        name: 'logout',
        usage: 'LOGOUT',
        description: 'Terminate elevated clearance session.',
        requiredAccess: ACCESS_LEVELS.elevated,
        run: () => logout()
    });
    registerCommand({
        name: 'list all',
        aliases: ['listall'],
        usage: 'LIST ALL',
        description: 'Print the complete mounted database index.',
        adminRequired: true,
        run: async () => {
            await runRemoteDataAccessLog?.('LIST ALL');
            listAllEntries();
        }
    });
    registerCommand({
        name: 'fsearch',
        aliases: ['fuzzy', 'fuzzy search'],
        usage: 'FSEARCH <term>',
        description: 'Fuzzy search topics, IDs/persons, dates, keywords, and message text.',
        requiredAccess: ACCESS_LEVELS.elevated,
        run: async ctx => {
            if (!databaseLoaded) {
                printNoDatabaseLoaded();
            } else if (ctx.args) {
                await runRemoteDataAccessLog?.('FSEARCH');
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
    registerCommand({
        name: 'status clear',
        aliases: ['status reset'],
        usage: 'STATUS CLEAR',
        description: 'Restore default facility status data.',
        adminRequired: true,
        run: () => clearStatusProfile()
    });
    registerCommand({
        name: 'status format',
        aliases: ['status help'],
        usage: 'STATUS FORMAT',
        description: 'Print the editable status profile format.',
        run: () => showStatusFormatHelp()
    });
    registerCommand({
        name: 'sound',
        usage: 'SOUND ON | SOUND OFF',
        description: 'Toggle optional terminal audio.',
        run: ctx => handleSoundCommand(ctx.args)
    });
    registerCommand({
        name: 'net',
        aliases: ['network'],
        usage: 'NET ON | NET OFF',
        description: 'Toggle local network-dependent terminal systems.',
        run: async ctx => handleNetworkCommand(ctx.args)
    });
    registerCommand({
        name: 'connect',
        aliases: ['/connect'],
        usage: 'CONNECT BRE-XX CODE',
        description: 'Connect to one remote BRE site server.',
        run: ctx => connectBreSite(ctx)
    });
    registerCommand({
        name: 'disconnect',
        aliases: ['/disconnect'],
        usage: 'DISCONNECT',
        description: 'Disconnect the active BRE site server.',
        run: () => disconnectConnectedSite({ announce: true })
    });
    registerCommand({
        name: 'site status',
        aliases: ['bre status', 'connection status'],
        usage: 'SITE STATUS',
        description: 'Show the active BRE site connection state.',
        run: () => showConnectedSiteStatus()
    });
    registerCommand({
        name: 'fx',
        aliases: ['effects'],
        usage: 'FX AUTO | FX FULL | FX LOW',
        description: 'Adjust visual effects intensity.',
        run: ctx => handleEffectsCommand('fx', ctx.args)
    });
    registerCommand({
        name: 'performance',
        aliases: ['perf'],
        usage: 'PERFORMANCE ON | PERFORMANCE OFF | PERFORMANCE STATUS',
        description: 'Toggle reduced decorative effects for smoother browsers.',
        run: ctx => handleEffectsCommand('performance', ctx.args)
    });
    registerCommand({
        name: 'safe mode',
        aliases: ['safe'],
        usage: 'SAFE MODE | SAFE MODE OFF',
        description: 'Force a session-only low-effects stability profile.',
        run: ctx => handleSafeModeCommand(ctx.args)
    });
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
    registerCommand({ name: 'kontol', hidden: true, run: () => startMiniGame() });
    registerCommand({ name: 'derfette', hidden: true, run: () => startCasinoGame() });
    registerCommand({ name: 'liebi', hidden: true, run: () => startLiebiGame() });
}

function processCommand(input) {
    return executeCliCommand(input, { echo: true, history: true });
}

function showHome() {
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
    contentLines('home', fallbackHome).forEach((line, index) => print(line, contentClass('home', index, contentClass('welcome', index, index < 3 || index === fallback.length - 1 ? 't-dim' : ''))));
}

function showWelcome() {
    if (typeof showConnectedSiteWelcome === 'function') {
        showConnectedSiteWelcome();
        return;
    }
    showHome();
}

function showHelp() {
    clearOutput();
    const allCommands = visibleCommandList(true);
    const employeeCommands = allCommands.filter(command => normalizeAccessLevel(command.requiredAccess) === ACCESS_LEVELS.employee);
    const elevatedCommands = allCommands.filter(command => normalizeAccessLevel(command.requiredAccess) === ACCESS_LEVELS.elevated);
    const adminCommands = allCommands.filter(command => normalizeAccessLevel(command.requiredAccess) === ACCESS_LEVELS.admin);
    const lines = [
        { text: '═══════════════════════════════════════════════════════', className: 't-dim' },
        { text: '                    SYSTEM MANUAL', className: 't-bright' },
        { text: '═══════════════════════════════════════════════════════', className: 't-dim' },
        { text: 'Commands append to this transcript. Type a command and press Enter.', className: 't-dim' },
        { text: 'Arrow Up/Down recalls command history. Tab completes commands.', className: 't-dim' },
        { text: '', className: '' }
    ];

    employeeCommands.forEach(command => {
        lines.push({ text: command.usage, className: 't-cyan' });
        lines.push({ text: `  ${command.description}`, className: '' });
        lines.push({ text: '', className: '' });
    });

    lines.push(
        { text: '───────────────────────────────────────────────────────', className: 't-dim' },
        { text: 'ELEVATED COMMANDS (requires ACCESS)', className: 't-amber' },
        { text: '───────────────────────────────────────────────────────', className: 't-dim' },
        { text: '', className: '' }
    );

    elevatedCommands.forEach(command => {
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

    adminCommands.forEach(command => {
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
