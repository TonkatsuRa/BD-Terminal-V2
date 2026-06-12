/* Facility tactical map iframe bridge.
   This keeps the heavy Three.js map isolated so closing Facility Status unloads WebGL. */
(function () {
    'use strict';

    const MAP_SRC = 'facility-map.html';
    const MAP_STILL_LOADING_MS = 24000;
    const PARENT_SOURCE = 'ARES_TERMINAL_V3';
    const CHILD_SOURCE = 'ARES_MAP';

    let iframe = null;
    let loadTimer = null;
    let lastTrigger = null;
    let active = false;
    let ready = false;
    let paused = false;
    let lastProgress = 0;
    let loadRevealTimer = null;

    function debugRecord(type, payload = {}) {
        try {
            window.DebugConsole?.record?.(`map-overlay:${type}`, {
                payload,
                snapshot: snapshot()
            });
        } catch (_) {
            // Debug reporting must not affect map loading.
        }
    }

    function byId(id) {
        return document.getElementById(id);
    }

    function elements() {
        return {
            overlay: byId('facilityOverlay'),
            frameWrap: byId('facilityMapFrameWrap'),
            loader: byId('facilityMapLoader'),
            loaderFill: byId('facilityMapLoaderFill'),
            loaderText: byId('facilityMapLoaderText'),
            meta: byId('facilityMeta'),
            ticker: byId('facilityTicker')
        };
    }

    function mapProfilePayload() {
        const profile = typeof getEffectiveRenderProfile === 'function'
            ? getEffectiveRenderProfile()
            : { name: 'chromium' };
        const browser = typeof detectBrowserProfile === 'function' ? detectBrowserProfile() : 'chromium';
        const reduced = Boolean(typeof prefersReducedMotion !== 'undefined' && prefersReducedMotion);
        const safe = typeof safeModeActive === 'function' && safeModeActive();
        const low = safe || reduced || profile.name === 'effects-low' || browser === 'firefox' || browser === 'safari';

        const mapProfileName = safe ? 'safe' : reduced ? 'reduced' : low ? 'low' : 'full';

        return {
            name: mapProfileName,
            browser,
            pixelRatioCap: low ? 1 : 1.25,
            frameMs: reduced ? 60000 : (low ? 1000 / 24 : 1000 / 45),
            autoRotate: true,
            scan: true,
            markerPulse: !low,
            routeAnimation: !reduced && !safe,
            staticRender: reduced || safe
        };
    }

    function setLoading(progress, text, tone = '') {
        const { loader, loaderFill, loaderText, meta, ticker } = elements();
        lastProgress = Math.max(lastProgress, Number(progress) || 0);
        const clamped = Math.max(0, Math.min(100, lastProgress));
        if (loader) {
            loader.hidden = false;
            loader.dataset.tone = tone;
        }
        if (loaderFill) loaderFill.style.width = `${clamped}%`;
        if (loaderText) loaderText.textContent = text;
        if (meta) meta.textContent = text;
        if (ticker) ticker.textContent = `FACILITY MAP BUS // ${text}`;
    }

    function showFrame() {
        const { frameWrap, loader, meta, ticker } = elements();
        if (frameWrap) frameWrap.hidden = false;
        if (loader) loader.hidden = true;
        ready = true;
        if (meta) meta.textContent = 'TACTICAL MAP: LIVE';
        if (ticker) ticker.textContent = 'BLACK DESERT TACTICAL MAP ONLINE // ESC CLOSE';
        document.body.classList.add('facility-map-ready');
    }

    function postToMap(type, payload = {}) {
        if (!iframe || !iframe.contentWindow) return;
        iframe.contentWindow.postMessage({ source: PARENT_SOURCE, type, payload }, '*');
    }

    function removeIframe() {
        if (iframe) {
            iframe.remove();
            iframe = null;
        }
        const { frameWrap } = elements();
        if (frameWrap) frameWrap.hidden = true;
    }

    function cleanup() {
        clearTimeout(loadTimer);
        clearTimeout(loadRevealTimer);
        loadTimer = null;
        loadRevealTimer = null;
        ready = false;
        paused = false;
        lastProgress = 0;
        active = false;
        window.removeEventListener('message', handleMessage);
        document.body.classList.remove('terminal-map-active', 'facility-map-ready');
    }

    function handleMessage(event) {
        if (!iframe || event.source !== iframe.contentWindow) return;
        const message = event.data || {};
        if (message.source !== CHILD_SOURCE) return;

        if (message.type === 'ARES_MAP_PROGRESS') {
            const payload = message.payload || {};
            debugRecord('child-progress', payload);
            setLoading(payload.progress || 0, payload.stage || 'LOADING TACTICAL MAP');
            return;
        }

        if (message.type === 'ARES_MAP_READY') {
            debugRecord('child-ready', message.payload || {});
            clearTimeout(loadTimer);
            clearTimeout(loadRevealTimer);
            loadTimer = null;
            loadRevealTimer = null;
            ready = true;
            setLoading(100, 'TACTICAL MAP READY');
            showFrame();
            postToMap('ARES_MAP_SET_PROFILE', { profile: mapProfilePayload() });
            return;
        }

        if (message.type === 'ARES_MAP_ERROR') {
            debugRecord('child-error', message.payload || {});
            clearTimeout(loadTimer);
            clearTimeout(loadRevealTimer);
            loadTimer = null;
            loadRevealTimer = null;
            setLoading(82, `MAP RUNTIME REPORT: ${message.payload?.message || 'WAITING FOR MAP'}`, 'warn');
            return;
        }

        if (message.type === 'ARES_MAP_CLOSE_REQUEST') {
            if (typeof closeFacilityStatus === 'function') closeFacilityStatus();
            else close();
        }
    }

    function open(options = {}) {
        const { frameWrap } = elements();
        if (!frameWrap) {
            debugRecord('open-abort-missing-frame-wrap', { frameWrapId: 'facilityMapFrameWrap' });
            return false;
        }
        if (active) {
            debugRecord('open-reused-active-map', {});
            return true;
        }

        if (typeof pauseRealtimePanels === 'function') pauseRealtimePanels();
        else if (typeof stopSideTelemetryLoop === 'function') stopSideTelemetryLoop();
        if (typeof suspendTerminalRuntimeForMap === 'function') suspendTerminalRuntimeForMap();

        active = true;
        ready = false;
        paused = false;
        lastProgress = 0;
        lastTrigger = options.trigger || document.activeElement;
        document.body.classList.add('terminal-map-active');
        document.body.classList.remove('facility-map-ready');

        removeIframe();
        debugRecord('open-start', {
            mapSrc: MAP_SRC,
            trigger: options.trigger?.id || options.trigger?.className || document.activeElement?.id || ''
        });
        setLoading(4, 'ALLOCATING ARES MAP RUNTIME');
        iframe = document.createElement('iframe');
        iframe.id = 'facilityMapFrame';
        iframe.className = 'facility-map-frame';
        iframe.title = 'Black Desert Tactical Map';
        iframe.loading = 'eager';
        iframe.referrerPolicy = 'no-referrer';
        iframe.setAttribute('allow', 'fullscreen');
        iframe.addEventListener('error', () => {
            debugRecord('iframe-error-event', { mapSrc: MAP_SRC });
        }, { once: true });
        iframe.addEventListener('load', () => {
            debugRecord('iframe-load', { mapSrc: iframe?.getAttribute('src') || MAP_SRC });
            setLoading(84, 'TACTICAL MAP DOCUMENT LOADED');
            postToMap('ARES_MAP_INIT', { profile: mapProfilePayload() });
            clearTimeout(loadTimer);
            loadTimer = null;
            loadRevealTimer = setTimeout(() => {
                setLoading(100, 'TACTICAL MAP READY');
                showFrame();
            }, 420);
        }, { once: true });

        frameWrap.hidden = false;
        frameWrap.appendChild(iframe);
        window.addEventListener('message', handleMessage);
        loadTimer = setTimeout(() => {
            loadTimer = null;
            if (!ready) {
                debugRecord('still-loading-timeout', {
                    timeoutMs: MAP_STILL_LOADING_MS,
                    mapSrc: iframe?.getAttribute('src') || MAP_SRC
                });
                setLoading(72, 'TACTICAL MAP STILL LOADING // WAITING FOR THREE.JS');
            }
        }, MAP_STILL_LOADING_MS);

        requestAnimationFrame(() => {
            setLoading(18, 'FETCHING BLACK DESERT TACTICAL MAP');
            iframe.src = MAP_SRC;
            debugRecord('iframe-src-set', { mapSrc: MAP_SRC });
        });
        return true;
    }

    function close(options = {}) {
        if (!active && !iframe) return;
        debugRecord('close', { restoreFocus: options.restoreFocus !== false });
        postToMap('ARES_MAP_DISPOSE', {});
        removeIframe();
        cleanup();
        setLoading(0, 'WIREFRAME BUS: STANDBY');
        if (typeof resumeTerminalRuntimeAfterMap === 'function') {
            resumeTerminalRuntimeAfterMap();
        }
        if (typeof resumeRealtimePanels === 'function'
            && (typeof AppState === 'undefined' || AppState.networkOnline)
            && !document.hidden) {
            resumeRealtimePanels();
        }
        if (options.restoreFocus !== false) {
            const target = lastTrigger && typeof lastTrigger.focus === 'function'
                ? lastTrigger
                : byId('commandInput');
            target?.focus?.({ preventScroll: true });
        }
        lastTrigger = null;
    }

    function pause() {
        paused = true;
        postToMap('ARES_MAP_PAUSE', {});
    }

    function resume() {
        if (!active || !ready) return;
        paused = false;
        postToMap('ARES_MAP_SET_PROFILE', { profile: mapProfilePayload() });
        postToMap('ARES_MAP_RESUME', {});
    }

    function refreshProfile() {
        if (!active) return;
        postToMap('ARES_MAP_SET_PROFILE', { profile: mapProfilePayload() });
    }

    function snapshot() {
        return {
            active,
            ready,
            paused,
            src: iframe?.getAttribute('src') || '',
            progress: lastProgress,
            profile: mapProfilePayload()
        };
    }

    window.MapOverlayController = {
        open,
        close,
        pause,
        resume,
        refreshProfile,
        isActive: () => active,
        isReady: () => ready,
        getSnapshot: snapshot
    };
})();
