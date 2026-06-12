(function () {
    'use strict';

    const DEBUG_SOURCE = 'ARES_DEBUG';
    const DEBUG_ENTRY_TYPE = 'ARES_DEBUG_ENTRY';
    const MAX_ENTRIES = 260;
    const MAX_TEXT = 24000;

    const existing = window.DebugConsole;
    if (existing && existing.__aresDebugInstalled) return;

    const entries = [];
    let sequence = 0;
    let overlay = null;
    let output = null;
    let lastFocus = null;
    let consoleWrapped = false;

    function trimText(value, limit = MAX_TEXT) {
        const text = String(value == null ? '' : value);
        if (text.length <= limit) return text;
        return `${text.slice(0, limit)}\n...[ARES_DEBUG_TRUNCATED ${text.length - limit} CHARS]`;
    }

    function cloneForDebug(value, depth = 0, seen = new WeakSet()) {
        if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
        if (typeof value === 'string') return trimText(value, 8000);
        if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
        if (value instanceof Error) {
            return {
                name: value.name || 'Error',
                message: value.message || '',
                stack: trimText(value.stack || '', 16000)
            };
        }
        if (value instanceof Event) {
            return {
                eventType: value.type,
                target: summarizeElement(value.target),
                currentTarget: summarizeElement(value.currentTarget)
            };
        }
        if (typeof value !== 'object') return String(value);
        if (seen.has(value)) return '[Circular]';
        if (depth >= 5) return '[DepthLimit]';
        seen.add(value);
        if (Array.isArray(value)) return value.slice(0, 80).map(item => cloneForDebug(item, depth + 1, seen));
        const outputObject = {};
        Object.keys(value).slice(0, 120).forEach(key => {
            try {
                outputObject[key] = cloneForDebug(value[key], depth + 1, seen);
            } catch (error) {
                outputObject[key] = `[ReadError ${error && error.message ? error.message : error}]`;
            }
        });
        return outputObject;
    }

    function stringify(value) {
        try {
            return JSON.stringify(cloneForDebug(value), null, 2);
        } catch (error) {
            return JSON.stringify({ stringifyError: String(error), raw: String(value) }, null, 2);
        }
    }

    function summarizeElement(element) {
        if (!element || !element.tagName) return null;
        const tag = element.tagName.toLowerCase();
        const id = element.id ? `#${element.id}` : '';
        const cls = typeof element.className === 'string' && element.className
            ? `.${element.className.trim().replace(/\s+/g, '.')}`
            : '';
        const src = element.currentSrc || element.src || element.href || '';
        return trimText(`${tag}${id}${cls}${src ? ` src=${src}` : ''}`, 1200);
    }

    function mapSnapshot() {
        try {
            if (window.MapOverlayController && typeof window.MapOverlayController.getSnapshot === 'function') {
                return window.MapOverlayController.getSnapshot();
            }
        } catch (error) {
            return { snapshotError: String(error && error.message ? error.message : error) };
        }
        return null;
    }

    function pageContext() {
        const loader = document.getElementById('facilityMapLoaderText');
        const meta = document.getElementById('facilityMeta');
        const ticker = document.getElementById('facilityTicker');
        const iframe = document.getElementById('facilityMapFrame');
        return {
            href: window.location.href,
            pathname: window.location.pathname,
            readyState: document.readyState,
            visibilityState: document.visibilityState,
            isTopWindow: window.parent === window,
            bodyClass: document.body ? document.body.className : '',
            userAgent: navigator.userAgent,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight,
                devicePixelRatio: window.devicePixelRatio || 1
            },
            activeElement: summarizeElement(document.activeElement),
            facilityLoaderText: loader ? loader.textContent : '',
            facilityMeta: meta ? meta.textContent : '',
            facilityTicker: ticker ? ticker.textContent : '',
            facilityIframe: iframe ? {
                src: iframe.getAttribute('src') || '',
                title: iframe.title || '',
                className: iframe.className || ''
            } : null,
            connectedSite: typeof window.getConnectedSiteDebugSnapshot === 'function'
                ? window.getConnectedSiteDebugSnapshot()
                : null,
            mapOverlaySnapshot: mapSnapshot()
        };
    }

    function emitToParent(entry) {
        if (window.parent === window) return;
        try {
            window.parent.postMessage({
                source: DEBUG_SOURCE,
                type: DEBUG_ENTRY_TYPE,
                entry
            }, '*');
        } catch (_) {
            // Debug relay must never break the page.
        }
    }

    function pushEntry(type, payload, options = {}) {
        const entry = {
            id: ++sequence,
            timestamp: new Date().toISOString(),
            performanceMs: Math.round(performance.now()),
            type: String(type || 'debug'),
            page: window.location.pathname || window.location.href,
            payload: cloneForDebug(payload || {}),
            context: options.context === false ? undefined : pageContext()
        };
        entries.push(entry);
        while (entries.length > MAX_ENTRIES) entries.shift();
        if (!options.fromChild) emitToParent(entry);
        render();
        return entry;
    }

    function reportText() {
        const header = {
            report: 'ARES_DEBUG_REPORT_V1_COPY_THIS_WHOLE_BLOCK_TO_CODEX',
            generatedAt: new Date().toISOString(),
            currentContext: pageContext(),
            entriesCount: entries.length
        };
        const lines = [
            'ARES_DEBUG_REPORT_V1_COPY_THIS_WHOLE_BLOCK_TO_CODEX',
            stringify(header),
            ''
        ];
        entries.forEach(entry => {
            lines.push(`ENTRY_${String(entry.id).padStart(4, '0')}_${entry.type}`);
            lines.push(stringify(entry));
            lines.push('');
        });
        if (!entries.length) {
            lines.push('ENTRY_0000_NO_CAPTURED_ERRORS_YET');
            lines.push(stringify({ note: 'Reproduce the failing action, then press F1 again.' }));
        }
        return trimText(lines.join('\n'), 220000);
    }

    function injectStyle() {
        if (document.getElementById('aresDebugStyle')) return;
        const style = document.createElement('style');
        style.id = 'aresDebugStyle';
        style.textContent = `
.ares-debug-overlay {
    position: fixed;
    inset: 0;
    z-index: 2147483000;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 18px;
    background: rgba(0, 0, 0, 0.76);
    color: #9ffcff;
    font-family: "Courier New", Consolas, monospace;
}
.ares-debug-overlay.active { display: flex; }
.ares-debug-panel {
    width: min(1120px, calc(100vw - 24px));
    height: min(760px, calc(100vh - 24px));
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    border: 1px solid rgba(0, 240, 255, 0.62);
    background: rgba(1, 8, 12, 0.96);
    box-shadow: 0 0 38px rgba(0, 240, 255, 0.20), inset 0 0 30px rgba(0, 240, 255, 0.07);
}
.ares-debug-header {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    border-bottom: 1px solid rgba(0, 240, 255, 0.32);
}
.ares-debug-title {
    color: #00f0ff;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    font-size: 12px;
}
.ares-debug-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.ares-debug-actions button {
    border: 1px solid rgba(0, 240, 255, 0.46);
    background: rgba(0, 240, 255, 0.08);
    color: #9ffcff;
    padding: 8px 10px;
    font: 700 11px/1 "Courier New", Consolas, monospace;
    letter-spacing: 0.08em;
    cursor: pointer;
    text-transform: uppercase;
}
.ares-debug-actions button:hover,
.ares-debug-actions button:focus-visible {
    outline: none;
    border-color: #fcee0a;
    color: #fcee0a;
}
.ares-debug-output {
    margin: 0;
    padding: 12px;
    min-height: 0;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    color: #d7feff;
    font-size: 11px;
    line-height: 1.45;
    tab-size: 2;
}`;
        document.head.appendChild(style);
    }

    function createOverlay() {
        if (overlay) return;
        injectStyle();
        overlay = document.createElement('div');
        overlay.id = 'aresDebugOverlay';
        overlay.className = 'ares-debug-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-hidden', 'true');
        overlay.innerHTML = [
            '<div class="ares-debug-panel">',
            '<div class="ares-debug-header">',
            '<div class="ares-debug-title">ARES DEBUG // F1 TO TOGGLE // COPY REPORT TO CODEX</div>',
            '<div class="ares-debug-actions">',
            '<button type="button" data-debug-copy>COPY REPORT</button>',
            '<button type="button" data-debug-clear>CLEAR</button>',
            '<button type="button" data-debug-close>CLOSE</button>',
            '</div>',
            '</div>',
            '<pre class="ares-debug-output" id="aresDebugOutput"></pre>',
            '</div>'
        ].join('');
        document.body.appendChild(overlay);
        output = overlay.querySelector('#aresDebugOutput');
        overlay.querySelector('[data-debug-close]').addEventListener('click', close);
        overlay.querySelector('[data-debug-clear]').addEventListener('click', () => {
            entries.length = 0;
            render();
        });
        overlay.querySelector('[data-debug-copy]').addEventListener('click', async () => {
            const text = reportText();
            try {
                await navigator.clipboard.writeText(text);
                pushEntry('debug-report-copied', { bytes: text.length }, { context: false });
            } catch (error) {
                pushEntry('debug-report-copy-failed', error, { context: false });
            }
        });
    }

    function render() {
        if (!overlay || !overlay.classList.contains('active') || !output) return;
        output.textContent = reportText();
    }

    function open() {
        createOverlay();
        lastFocus = document.activeElement;
        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden', 'false');
        render();
        const copyButton = overlay.querySelector('[data-debug-copy]');
        copyButton?.focus?.({ preventScroll: true });
    }

    function close() {
        if (!overlay) return;
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
        if (lastFocus && typeof lastFocus.focus === 'function') {
            lastFocus.focus({ preventScroll: true });
        }
        lastFocus = null;
    }

    function toggle() {
        if (overlay && overlay.classList.contains('active')) close();
        else open();
    }

    function wrapConsole() {
        if (consoleWrapped || !window.console) return;
        consoleWrapped = true;
        ['error', 'warn'].forEach(level => {
            const original = console[level];
            if (typeof original !== 'function') return;
            console[level] = function (...args) {
                pushEntry(`console.${level}`, { args }, { context: true });
                return original.apply(this, args);
            };
        });
    }

    window.addEventListener('error', event => {
        if (event.target && event.target !== window) {
            pushEntry('resource.error', {
                eventType: event.type,
                target: summarizeElement(event.target)
            });
            return;
        }
        pushEntry('window.error', {
            message: event.message || '',
            filename: event.filename || '',
            lineno: event.lineno || 0,
            colno: event.colno || 0,
            error: event.error || null
        });
    }, true);

    window.addEventListener('unhandledrejection', event => {
        pushEntry('window.unhandledrejection', { reason: event.reason || null });
    });

    window.addEventListener('message', event => {
        const message = event.data || {};
        if (message.source !== DEBUG_SOURCE || message.type !== DEBUG_ENTRY_TYPE || !message.entry) return;
        pushEntry(`child.${message.entry.type || 'debug'}`, {
            childOrigin: event.origin || '',
            childEntry: message.entry
        }, { fromChild: true });
    });

    window.addEventListener('keydown', event => {
        if (event.key === 'F1') {
            event.preventDefault();
            event.stopPropagation();
            toggle();
            return;
        }
        if (event.key === 'Escape' && overlay && overlay.classList.contains('active')) {
            event.preventDefault();
            event.stopPropagation();
            close();
        }
    }, true);

    window.DebugConsole = {
        __aresDebugInstalled: true,
        record: pushEntry,
        open,
        close,
        toggle,
        getEntries: () => entries.map(entry => cloneForDebug(entry)),
        getReportText: reportText
    };

    wrapConsole();
    pushEntry('debug-runtime-ready', { script: 'js/debug.js' }, { context: false });
})();
