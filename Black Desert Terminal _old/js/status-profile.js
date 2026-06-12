// ========================================
// STATUS PROFILE LOADER
// ========================================
function normalizeStatusKey(key) {
    return String(key || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9._-]/g, '');
}

function cleanStatusValue(value) {
    let cleaned = String(value || '').trim();
    if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
        cleaned = cleaned.slice(1, -1);
    }
    return cleaned.replace(/\\n/g, '\n');
}

function parseTerminalBlockLine(rawLine) {
    const styles = {
        dim: 't-dim',
        bright: 't-bright',
        cyan: 't-cyan',
        amber: 't-amber',
        red: 't-red',
        magenta: 't-magenta'
    };
    const match = String(rawLine ?? '').match(/^@([a-z]+)\s?(.*)$/i);
    if (!match) return { text: String(rawLine ?? ''), className: '' };
    const className = styles[match[1].toLowerCase()];
    return className
        ? { text: match[2], className }
        : { text: String(rawLine ?? ''), className: '' };
}

function parseStatusProfile(content, source) {
    const values = {};
    let section = '';
    let blockSection = '';
    let blockLine = 1;
    let inTextBlock = false;

    String(content || '').replace(/\r/g, '').split('\n').forEach(rawLine => {
        let line = rawLine.trim();

        if (line.startsWith('```')) {
            inTextBlock = !inTextBlock;
            if (inTextBlock) {
                blockSection = section;
                blockLine = 1;
            }
            return;
        }

        if (inTextBlock) {
            if (!blockSection) return;
            const parsed = parseTerminalBlockLine(rawLine);
            values[`${blockSection}.line${blockLine}`] = parsed.text;
            if (parsed.className) values[`${blockSection}.class${blockLine}`] = parsed.className;
            blockLine++;
            return;
        }

        if (!line || line === '---') return;

        const iniSection = line.match(/^\[([a-z0-9_.\-\s]+)\]$/i);
        if (iniSection) {
            section = normalizeStatusKey(iniSection[1]);
            return;
        }

        const markdownSection = line.match(/^#{2,6}\s+([a-z0-9_.-]+)\s*$/i);
        if (markdownSection) {
            section = normalizeStatusKey(markdownSection[1]);
            return;
        }

        if (line.startsWith('#') || line.startsWith('//') || line.startsWith('<!--')) return;
        line = line.replace(/^[-*]\s+/, '');

        const pair = line.match(/^([a-z0-9_.-]+)\s*(?:=|:)\s*(.*)$/i);
        if (!pair) return;

        let key = normalizeStatusKey(pair[1]);
        if (!key) return;
        if (section && !key.includes('.')) key = `${section}.${key}`;
        values[key] = cleanStatusValue(pair[2]);
    });

    return {
        source: source || 'STATUS PROFILE',
        loaded: Object.keys(values).length > 0,
        values
    };
}

function loadStoredStatusProfile() {
    try {
        const stored = JSON.parse(localStorage.getItem(STATUS_PROFILE_STORAGE_KEY) || 'null');
        if (!stored || !stored.content) return;
        const profile = parseStatusProfile(stored.content, stored.source || 'STORED STATUS PROFILE');
        if (profile.loaded) setStatusProfile(profile);
    } catch (error) {
        try { localStorage.removeItem(STATUS_PROFILE_STORAGE_KEY); } catch (storageError) {}
    }
}

function persistStatusProfile(profile, content) {
    try {
        localStorage.setItem(STATUS_PROFILE_STORAGE_KEY, JSON.stringify({
            source: profile.source,
            content
        }));
    } catch (error) {}
}

function clearStoredStatusProfile() {
    try { localStorage.removeItem(STATUS_PROFILE_STORAGE_KEY); } catch (error) {}
}

function statusGet(key, fallback = '') {
    const normalized = normalizeStatusKey(key);
    const siteValue = connectedSiteStatusProfile?.values?.[normalized];
    if (siteValue !== undefined && siteValue !== '') return siteValue;
    const value = statusProfile.values[normalized];
    if (value !== undefined && value !== '') return value;
    const contentValue = terminalContent.values[normalized];
    return contentValue === undefined || contentValue === '' ? fallback : contentValue;
}

function statusNumber(key, fallback = 0, min = -Infinity, max = Infinity) {
    const value = Number.parseFloat(statusGet(key, fallback));
    if (!Number.isFinite(value)) return fallback;
    return Math.max(min, Math.min(max, value));
}

function statusBool(key, fallback = true) {
    const rawValue = statusGet(key, fallback ? 'true' : 'false');
    const value = normalizeStatusKey(rawValue);
    if (['false', '0', 'no', 'off', 'disabled', 'hidden'].includes(value)) return false;
    if (['true', '1', 'yes', 'on', 'enabled', 'visible'].includes(value)) return true;
    return fallback;
}

function statusState(key, fallback = 'ok') {
    const value = normalizeStatusKey(statusGet(key, fallback));
    if (['alert', 'critical', 'danger', 'red', 'fail', 'failed', 'breach', 'unknown', 'offline', 'malfunction', 'disconnected'].includes(value)) return 'alert';
    if (['warn', 'warning', 'amber', 'degraded', 'maintenance', 'service', 'partial', 'low', 'weak', 'intermittent', 'armed'].includes(value)) return 'warn';
    return 'ok';
}

function statusSectionIds(prefix) {
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

function sortStatusIds(a, b) {
    const an = Number.parseInt(a, 10);
    const bn = Number.parseInt(b, 10);
    if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
    return a.localeCompare(b);
}

async function loadTerminalContent() {
    try {
        const response = await fetch('content/terminal-content.md', { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const content = await response.text();
        const profile = parseStatusProfile(content, 'content/terminal-content.md');
        setTerminalContent(profile);
    } catch (error) {
        setTerminalContent({ loaded: false, values: {} });
    }
}

function contentGet(key, fallback = '') {
    const normalized = normalizeStatusKey(key);
    const value = terminalContent.values[normalized];
    return value === undefined || value === '' ? fallback : value;
}

function contentLines(prefix, fallbackLines = []) {
    const lines = [];
    for (let i = 1; i <= 120; i++) {
        const key = normalizeStatusKey(`${prefix}.line${i}`);
        if (Object.prototype.hasOwnProperty.call(terminalContent.values, key)) {
            lines.push(terminalContent.values[key]);
        }
    }
    if (lines.length) return lines;

    const packed = contentGet(`${prefix}.lines`, '');
    if (packed) {
        return packed.split('|').map(line => line.trim()).filter(Boolean);
    }
    return fallbackLines.slice();
}

function contentClass(prefix, index, fallback = '') {
    return contentGet(`${prefix}.class${index + 1}`, fallback);
}

// escapeHtml is provided by js/utils.js (loaded before this file in index.html).

function getBootLogoMarkup(fallbackMarkup) {
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

function applyTerminalContentToDom() {
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

function getBootSequence() {
    const stepIds = statusSectionIds('boot.step').sort(sortStatusIds);
    if (!stepIds.length) return DEFAULT_BOOT_SEQUENCE.map(step => ({ ...step }));

    const sequence = stepIds.map(id => {
        const prefix = `boot.step.${id}`;
        if (!statusBool(`${prefix}.enabled`, true)) return null;
        const type = normalizeStatusKey(statusGet(`${prefix}.type`, 'line'));
        if (type === 'pause') {
            return {
                type: 'pause',
                duration: Math.max(0, Math.round(statusNumber(`${prefix}.duration`, 160, 0, 20000)))
            };
        }
        if (type === 'blank') return { type: 'blank' };
        if (type === 'section') {
            return {
                type: 'section',
                text: statusGet(`${prefix}.text`, '')
            };
        }
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

function statusLineGroup(prefix) {
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
            packed.split('|')
                .map(line => line.trim())
                .filter(Boolean)
                .forEach(line => lines.push(line));
        }
    }

    statusLineGroupCache.set(cacheKey, lines);
    return lines.slice();
}

function statusInterpolate(text, frame) {
    return String(text)
        .replace(/\{spinner\}/gi, spinner(frame))
        .replace(/\{sweep(?::(\d+))?\}/gi, (_, width) => asciiSweep(frame, Number(width) || 20))
        .replace(/\{graph(?::(\d+))?\}/gi, (_, width) => asciiGraph(frame, Number(width) || 22))
        .replace(/\{heartbeat(?::(\d+))?\}/gi, (_, width) => heartbeat(frame, Number(width) || 38))
        .replace(/\{bar:([a-z0-9_.-]+)(?::(\d+))?\}/gi, (_, key, width) => asciiBar(statusNumber(key, 0, 0, 100), Number(width) || 18))
        .replace(/\{value:([a-z0-9_.-]+)\}/gi, (_, key) => statusGet(key, ''));
}

function statusBlock(prefix, fallbackLines, frame) {
    const customLines = statusLineGroup(prefix);
    return (customLines.length ? customLines : fallbackLines)
        .map(line => statusInterpolate(line, frame))
        .join('\n');
}

function refreshStatusPanels() {
    if (diagnosticActive) {
        diagnosticFrame = Math.max(diagnosticFrame, 48);
        resetDiagnosticWidgetRegistry();
        renderDiagnosticDashboard(performance.now(), { force: true });
    }
    if (facilityActive) {
        facilityFrame = Math.max(facilityFrame, prefersReducedMotion ? 24 : 10);
        if (window.MapOverlayController?.isActive()) {
            window.MapOverlayController.refreshProfile();
        } else {
            renderFacilityStatus(performance.now());
        }
    }
}

function pauseRealtimePanels() {
    stopSideTelemetryLoop();
    if (window.MapOverlayController?.isActive()) {
        window.MapOverlayController.pause();
    }
    if (diagnosticAnimFrame) {
        cancelAnimationFrame(diagnosticAnimFrame);
        diagnosticAnimFrame = null;
    }
    if (facilityAnimFrame) {
        cancelAnimationFrame(facilityAnimFrame);
        facilityAnimFrame = null;
    }
}

function resumeRealtimePanels() {
    if (prefersReducedMotion || !AppState.networkOnline) return;
    const mapActive = window.MapOverlayController?.isActive();
    if (!mapActive) startSideTelemetryLoop();
    if (diagnosticActive && !diagnosticAnimFrame) {
        diagnosticLastRender = 0;
        diagnosticAnimFrame = requestAnimationFrame(runDiagnosticLoop);
    }
    if (facilityActive && mapActive) {
        window.MapOverlayController.resume();
    } else if (facilityActive && !facilityAnimFrame && !(typeof safeModeActive === 'function' && safeModeActive())) {
        facilityLastRender = 0;
        facilityAnimFrame = requestAnimationFrame(runFacilityLoop);
    }
}

function handleVisibilityChange() {
    if (document.hidden) {
        pauseRealtimePanels();
    } else {
        resumeRealtimePanels();
    }
}

function clearStatusProfile() {
    setStatusProfile({
        source: 'INTERNAL DEFAULT',
        loaded: false,
        values: {}
    });
    clearStoredStatusProfile();
    AudioEngine.pageFlip();
    refreshStatusPanels();
    print('');
    print('STATUS PROFILE CLEARED', 't-amber');
    print('Diagnostic and facility panels returned to internal defaults.', 't-dim');
    print('Stored boot/status override removed for the next page load.', 't-dim');
    print('');
}

function showStatusFormatHelp() {
    clearOutput();
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

