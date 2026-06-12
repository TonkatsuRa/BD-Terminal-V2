(function () {
    'use strict';

    const DEFAULT_RETURN = 'index.html';
    let returning = false;
    let loadingOverlay = null;
    let exitOverlay = null;
    let backButton = null;

    function params() {
        return new URLSearchParams(window.location.search);
    }

    function getToolName(fallback = 'tool') {
        return String(params().get('tool') || fallback || 'tool').toLowerCase();
    }

    function getReturnPath() {
        return params().get('return') || DEFAULT_RETURN;
    }

    function reducedMotion() {
        return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    function delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, reducedMotion() ? Math.min(ms, 60) : ms));
    }

    function toolLabel(tool) {
        const value = String(tool || getToolName()).toLowerCase();
        if (value === 'facility') return 'TOPOGRAPHY';
        if (value === 'diagnostic' || value === 'diagnostics') return 'BASE DIAGNOSTIC';
        if (value === 'wireframe' || value === 'tactical' || value === 'wireframe-map') return 'TACTICAL WIREFRAME MAP';
        return value.toUpperCase();
    }

    function injectStyle() {
        if (document.getElementById('aresToolBridgeStyle')) return;
        const style = document.createElement('style');
        style.id = 'aresToolBridgeStyle';
        style.textContent = `
.tool-screen-back-button {
    position: fixed;
    top: 18px;
    right: 18px;
    z-index: 10020;
    border: 1px solid rgba(255, 176, 0, 0.72);
    background: rgba(0, 0, 0, 0.82);
    color: #ffb000;
    font: 700 12px/1.2 "Courier New", monospace;
    letter-spacing: 0.12em;
    padding: 10px 14px;
    cursor: pointer;
    text-transform: uppercase;
    box-shadow: 0 0 18px rgba(255, 176, 0, 0.16), inset 0 0 16px rgba(255, 176, 0, 0.08);
}
.tool-screen-back-button:hover,
.tool-screen-back-button:focus-visible {
    color: #fff2c0;
    border-color: rgba(255, 220, 128, 0.9);
    outline: none;
}
.tool-screen-bridge-overlay {
    position: fixed;
    inset: 0;
    z-index: 10010;
    display: grid;
    place-items: center;
    background: #000;
    color: #ffb000;
    font-family: "Courier New", monospace;
    letter-spacing: 0.08em;
    opacity: 1;
    transition: opacity 220ms ease;
}
.tool-screen-bridge-overlay.is-hidden {
    opacity: 0;
    pointer-events: none;
}
.tool-screen-bridge-panel {
    width: min(520px, calc(100vw - 38px));
    border: 1px solid rgba(255, 176, 0, 0.5);
    padding: 26px;
    background: rgba(8, 7, 2, 0.88);
    box-shadow: 0 0 28px rgba(255, 176, 0, 0.15), inset 0 0 22px rgba(255, 176, 0, 0.06);
}
.tool-screen-bridge-title {
    color: #00f5ff;
    font-size: 13px;
    margin-bottom: 16px;
}
.tool-screen-bridge-text {
    color: #ffb000;
    font-size: 14px;
    min-height: 1.4em;
}
.tool-screen-bridge-bar {
    height: 9px;
    margin: 18px 0 12px;
    border: 1px solid rgba(57, 255, 20, 0.4);
    background: rgba(57, 255, 20, 0.08);
    overflow: hidden;
}
.tool-screen-bridge-bar span {
    display: block;
    width: 0;
    height: 100%;
    background: linear-gradient(90deg, #20c20e, #00f5ff, #ffb000);
    transition: width 240ms ease;
}
.tool-screen-bridge-subtext {
    color: rgba(180, 255, 180, 0.72);
    font-size: 11px;
}
@media (prefers-reduced-motion: reduce) {
    .tool-screen-bridge-overlay,
    .tool-screen-bridge-bar span {
        transition: none;
    }
}`;
        document.head.appendChild(style);
    }

    function createOverlay(id, title, text) {
        injectStyle();
        const existing = document.getElementById(id);
        if (existing) return existing;
        const overlay = document.createElement('div');
        overlay.id = id;
        overlay.className = 'tool-screen-bridge-overlay';
        overlay.innerHTML = [
            '<div class="tool-screen-bridge-panel">',
            `<div class="tool-screen-bridge-title">${title}</div>`,
            `<div class="tool-screen-bridge-text" data-tool-bridge-text>${text}</div>`,
            '<div class="tool-screen-bridge-bar" aria-hidden="true"><span data-tool-bridge-fill></span></div>',
            '<div class="tool-screen-bridge-subtext">ARES SESSION LINK ACTIVE</div>',
            '</div>'
        ].join('');
        document.body.appendChild(overlay);
        return overlay;
    }

    async function playLoading(lines = []) {
        loadingOverlay = createOverlay(
            'toolScreenLoadingOverlay',
            'ARES // TOOL SCREEN LOAD',
            lines[0] || 'LOADING TOOL SCREEN'
        );
        const text = loadingOverlay.querySelector('[data-tool-bridge-text]');
        const fill = loadingOverlay.querySelector('[data-tool-bridge-fill]');
        const steps = lines.length ? lines : ['LOADING TOOL SCREEN', 'CALIBRATING DISPLAY', 'READY'];
        for (let i = 0; i < steps.length; i++) {
            if (text) text.textContent = steps[i];
            if (fill) fill.style.width = `${Math.round(((i + 1) / steps.length) * 100)}%`;
            await delay(120);
        }
        loadingOverlay.classList.add('is-hidden');
        await delay(140);
        loadingOverlay.remove();
        loadingOverlay = null;
    }

    async function playExit(tool) {
        exitOverlay = createOverlay(
            'toolScreenExitOverlay',
            `ARES // CLOSING ${toolLabel(tool)}`,
            `CLOSING ${toolLabel(tool)}`
        );
        const text = exitOverlay.querySelector('[data-tool-bridge-text]');
        const fill = exitOverlay.querySelector('[data-tool-bridge-fill]');
        if (fill) fill.style.width = '45%';
        await delay(180);
        if (text) text.textContent = 'RESTORING TERMINAL SESSION';
        if (fill) fill.style.width = '100%';
        await delay(260);
    }

    function buildReturnUrl(tool) {
        const query = params();
        const session = query.get('session') || '';
        const returnPath = getReturnPath();
        if (!session) return returnPath;
        const separator = returnPath.includes('?') ? '&' : '?';
        const returnParams = new URLSearchParams({
            restore: '1',
            session,
            from: tool || getToolName()
        });
        return `${returnPath}${separator}${returnParams.toString()}`;
    }

    async function returnToTerminal(tool, options = {}) {
        if (returning) return;
        returning = true;
        const resolvedTool = tool || getToolName();
        if (typeof options.beforeReturn === 'function') {
            try {
                await options.beforeReturn();
            } catch (_) {
                // Return should still happen if disposal fails.
            }
        }
        await playExit(resolvedTool);
        window.location.href = buildReturnUrl(resolvedTool);
    }

    function installBackButton(options = {}) {
        injectStyle();
        const tool = options.tool || getToolName();
        if (backButton && backButton.isConnected) return backButton;
        backButton = document.createElement('button');
        backButton.type = 'button';
        backButton.id = options.id || 'toolBackToTerminal';
        backButton.className = 'tool-screen-back-button';
        backButton.textContent = options.label || '[ BACK TO TERMINAL ]';
        backButton.addEventListener('click', () => returnToTerminal(tool, options));
        document.body.appendChild(backButton);
        return backButton;
    }

    function installToolPage(options = {}) {
        const tool = options.tool || getToolName();
        installBackButton({ ...options, tool });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                returnToTerminal(tool, options);
            }
        });
    }

    window.ToolScreenBridge = {
        getParams: params,
        getToolName,
        installToolPage,
        installBackButton,
        playLoading,
        returnToTerminal
    };
})();
