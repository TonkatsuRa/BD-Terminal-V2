// ========================================
// FACILITY STATUS WIREFRAME
// ========================================
const FACILITY_ZONES = [
    { id: 'core', label: 'CMD CORE', status: 'NOMINAL', state: 'ok', x: 0.42, y: 0.34, w: 0.17, h: 0.15, load: 78, pulse: 0 },
    { id: 'lab', label: 'LAB ARC', status: 'SEAL DRIFT', state: 'warn', x: 0.18, y: 0.22, w: 0.18, h: 0.14, load: 64, pulse: 1.1 },
    { id: 'med', label: 'MED BAY', status: 'STANDBY', state: 'ok', x: 0.65, y: 0.20, w: 0.16, h: 0.13, load: 71, pulse: 2.2 },
    { id: 'hab', label: 'HAB RING', status: 'LOW HEAT', state: 'warn', x: 0.68, y: 0.48, w: 0.18, h: 0.15, load: 67, pulse: 3.3 },
    { id: 'gen', label: 'GEN PLANT', status: 'SERVICE', state: 'warn', x: 0.19, y: 0.52, w: 0.19, h: 0.15, load: 61, pulse: 4.4 },
    { id: 'contain', label: 'CNTM CELL', status: 'WATCH', state: 'alert', x: 0.44, y: 0.66, w: 0.17, h: 0.15, load: 58, pulse: 5.5 },
    { id: 'storage', label: 'STORAGE', status: 'DARK SECT', state: 'warn', x: 0.09, y: 0.72, w: 0.16, h: 0.13, load: 49, pulse: 6.6 },
    { id: 'uplink', label: 'UPLINK', status: 'WEAK BUS', state: 'warn', x: 0.79, y: 0.73, w: 0.15, h: 0.12, load: 53, pulse: 7.7 },
    { id: 'service', label: 'SVC BUS', status: 'UNK TRACE', state: 'alert', x: 0.43, y: 0.08, w: 0.16, h: 0.11, load: 47, pulse: 8.8 }
];

const FACILITY_LINKS = [
    { from: 'core', to: 'lab', state: 'ok', phase: 0.05 },
    { from: 'core', to: 'med', state: 'ok', phase: 0.16 },
    { from: 'core', to: 'hab', state: 'warn', phase: 0.27 },
    { from: 'core', to: 'gen', state: 'warn', phase: 0.38 },
    { from: 'core', to: 'contain', state: 'alert', phase: 0.49 },
    { from: 'lab', to: 'service', state: 'warn', phase: 0.6 },
    { from: 'med', to: 'service', state: 'ok', phase: 0.71 },
    { from: 'gen', to: 'storage', state: 'warn', phase: 0.82 },
    { from: 'contain', to: 'uplink', state: 'alert', phase: 0.93 },
    { from: 'hab', to: 'uplink', state: 'warn', phase: 0.35 },
    { from: 'storage', to: 'contain', state: 'warn', phase: 0.58 }
];

const FACILITY_CONTACTS = [
    { from: 'service', to: 'contain', phase: 0.12 },
    { from: 'lab', to: 'core', phase: 0.47 },
    { from: 'storage', to: 'gen', phase: 0.78 }
];

function getFacilityZones() {
    if (facilityZoneCache) return facilityZoneCache;

    const defaultIds = new Set(FACILITY_ZONES.map(zone => zone.id));
    const zones = FACILITY_ZONES
        .filter(zone => statusBool(`facility.zone.${zone.id}.enabled`, true))
        .map(zone => ({
        ...zone,
        label: statusGet(`facility.zone.${zone.id}.label`, zone.label).toUpperCase().slice(0, 12),
        status: statusGet(`facility.zone.${zone.id}.status`, zone.status).toUpperCase().slice(0, 12),
        state: statusState(`facility.zone.${zone.id}.state`, zone.state),
        load: statusNumber(`facility.zone.${zone.id}.load`, zone.load, 0, 100),
        x: statusNumber(`facility.zone.${zone.id}.x`, zone.x, 0.02, 0.92),
        y: statusNumber(`facility.zone.${zone.id}.y`, zone.y, 0.04, 0.86),
        w: statusNumber(`facility.zone.${zone.id}.w`, zone.w, 0.08, 0.28),
        h: statusNumber(`facility.zone.${zone.id}.h`, zone.h, 0.08, 0.24)
    }));

    statusSectionIds('facility.zone')
        .filter(id => !defaultIds.has(id) && statusBool(`facility.zone.${id}.enabled`, true))
        .sort(sortStatusIds)
        .forEach((id, index) => {
            const prefix = `facility.zone.${id}`;
            const fallbackX = 0.16 + (index % 3) * 0.24;
            const fallbackY = 0.18 + Math.floor(index / 3) * 0.18;
            zones.push({
                id,
                label: statusGet(`${prefix}.label`, id.replace(/_/g, ' ')).toUpperCase().slice(0, 12),
                status: statusGet(`${prefix}.status`, 'WATCH').toUpperCase().slice(0, 12),
                state: statusState(`${prefix}.state`, 'warn'),
                load: statusNumber(`${prefix}.load`, 50, 0, 100),
                x: statusNumber(`${prefix}.x`, Math.min(0.84, fallbackX), 0.02, 0.92),
                y: statusNumber(`${prefix}.y`, Math.min(0.78, fallbackY), 0.04, 0.86),
                w: statusNumber(`${prefix}.w`, 0.14, 0.08, 0.28),
                h: statusNumber(`${prefix}.h`, 0.12, 0.08, 0.24),
                pulse: statusNumber(`${prefix}.pulse`, index * 0.43, 0, 10)
            });
        });

    facilityZoneCache = zones;
    return facilityZoneCache;
}

function getFacilityLinks() {
    if (facilityLinkCache) return facilityLinkCache;

    const defaultIds = new Set(FACILITY_LINKS.map(link => `${link.from}_${link.to}`));
    const links = FACILITY_LINKS
        .filter(link => statusBool(`facility.link.${link.from}_${link.to}.enabled`, true))
        .map(link => {
            const id = `${link.from}_${link.to}`;
            return {
                ...link,
                from: normalizeStatusKey(statusGet(`facility.link.${id}.from`, link.from)),
                to: normalizeStatusKey(statusGet(`facility.link.${id}.to`, link.to)),
                state: statusState(`facility.link.${id}.state`, link.state)
            };
        });

    statusSectionIds('facility.link')
        .filter(id => !defaultIds.has(id) && statusBool(`facility.link.${id}.enabled`, true))
        .sort(sortStatusIds)
        .forEach((id, index) => {
            const prefix = `facility.link.${id}`;
            const from = normalizeStatusKey(statusGet(`${prefix}.from`, ''));
            const to = normalizeStatusKey(statusGet(`${prefix}.to`, ''));
            if (!from || !to) return;
            links.push({
                from,
                to,
                state: statusState(`${prefix}.state`, 'warn'),
                phase: statusNumber(`${prefix}.phase`, (index * 0.21 + 0.14) % 1, 0, 1)
            });
        });

    facilityLinkCache = links;
    return facilityLinkCache;
}

function getFacilityContacts() {
    if (facilityContactCache) return facilityContactCache;

    const routeText = statusGet('facility.contacts.routes', '');
    const parsedRoutes = routeText
        ? routeText.split(',').map((route, index) => {
            const parts = route.trim().split(/\s*(?:->|>)\s*/);
            if (parts.length !== 2) return null;
            return {
                from: normalizeStatusKey(parts[0]),
                to: normalizeStatusKey(parts[1]),
                phase: (index * 0.27 + 0.12) % 1
            };
        }).filter(Boolean)
        : [];
    const routes = parsedRoutes.length ? parsedRoutes : FACILITY_CONTACTS;
    const count = Math.round(statusNumber('facility.contacts.unknown', routes.length, 0, 8));
    if (count <= 0) {
        facilityContactCache = [];
        return facilityContactCache;
    }

    const contacts = [];
    for (let i = 0; i < count; i++) {
        const route = routes[i % routes.length] || FACILITY_CONTACTS[i % FACILITY_CONTACTS.length];
        contacts.push({
            ...route,
            phase: (route.phase + i * 0.19) % 1
        });
    }
    facilityContactCache = contacts;
    return facilityContactCache;
}

function facilityZoneReadoutLine(zone) {
    const label = zone.label.padEnd(10, ' ').slice(0, 10);
    const status = zone.status.padEnd(9, ' ').slice(0, 9);
    return `${label} ${status} ${String(Math.round(zone.load)).padStart(2, '0')}%`;
}

function facilityReadoutBar(value, width = 10) {
    return glyphProgressBar(Math.max(0, Math.min(100, value)), width);
}

function facilityGridNode(zone, widget, frame) {
    const drift = prefersReducedMotion ? 0 : Math.sin(frame * 0.042 + zone.pulse) * 0.35;
    return {
        col: Math.max(6, Math.min(widget.cols - 7, Math.round(zone.x * (widget.cols - 12) + 6 + drift))),
        row: Math.max(3, Math.min(widget.rows - 4, Math.round(zone.y * (widget.rows - 7) + 3 - drift * 0.45)))
    };
}

function facilityStateClass(state) {
    if (state === 'alert') return 'telemetry-red';
    if (state === 'warn') return 'telemetry-amber';
    if (state === 'ok') return 'telemetry-green';
    return 'telemetry-cyan';
}

function facilityCommandRect(zone, widget) {
    const usableCols = widget.cols - 16;
    const usableRows = widget.rows - 10;
    const col = Math.max(4, Math.min(widget.cols - 13, 5 + zone.x * usableCols));
    const row = Math.max(4, Math.min(widget.rows - 9, 4 + zone.y * usableRows));
    const cols = Math.max(7, Math.min(18, zone.w * usableCols));
    const rows = Math.max(3.2, Math.min(7.5, zone.h * usableRows));
    return { col, row, cols, rows, centerCol: col + cols / 2, centerRow: row + rows / 2 };
}

function drawFacilityZoneShape(widget, zone, rect) {
    const cls = facilityStateClass(zone.state);
    widget.guideLayer.appendChild(svgElement('rect', {
        x: rect.col * widget.cellWidth,
        y: rect.row * widget.cellHeight,
        width: rect.cols * widget.cellWidth,
        height: rect.rows * widget.cellHeight,
        rx: 3,
        class: `facility-zone-shape ${cls}`.trim(),
        opacity: zone.state === 'alert' ? 0.34 : zone.state === 'warn' ? 0.25 : 0.18
    }));
    drawSvgGuideRect(widget, rect.col, rect.row, rect.cols, rect.rows, { className: cls, opacity: 0.44 });
    svgLabel(widget.labelLayer, zone.label, rect.col + 0.8, rect.row + 1.1, { className: cls, fontSize: 8.5 });
    svgLabel(widget.labelLayer, zone.status, rect.col + 0.8, rect.row + 2.2, { className: 'telemetry-dim', fontSize: 7.2 });
}

function renderFacilityAtmosphere(frame, zones) {
    const canvas = getById('facilityAtmosphereCanvas');
    if (!canvas) return;
    const facilityProfile = diagnosticFacilityProfile();
    const refreshEvery = Math.max(30, Number(facilityProfile.backgroundRefreshFrames || 180));

    // The atmospheric layer is static. Avoid forcing a layout read every
    // facility frame; refresh occasionally to catch resize/profile changes.
    if (canvas.dataset.facilityAtmosphereKey && frame % refreshEvery !== 0 && !prefersReducedMotion) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const ctx = canvas.getContext('2d');
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    const targetWidth = Math.max(1, Math.round(rect.width * pixelRatio));
    const targetHeight = Math.max(1, Math.round(rect.height * pixelRatio));
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
    }
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const width = rect.width;
    const height = rect.height;
    const low = effectsLowActive() || prefersReducedMotion || (typeof safeModeActive === 'function' && safeModeActive());
    const atmosphereKey = JSON.stringify({
        width: targetWidth,
        height: targetHeight,
        low,
        zones: zones.map(zone => [zone.id, zone.state, zone.x, zone.y])
    });
    if (canvas.dataset.facilityAtmosphereKey === atmosphereKey) return;
    canvas.dataset.facilityAtmosphereKey = atmosphereKey;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(0, 8, 4, 0.48)';
    ctx.fillRect(0, 0, width, height);

    const gridStep = low ? 32 : 24;
    ctx.strokeStyle = 'rgba(49, 245, 181, 0.055)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < width; x += gridStep) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
    }
    for (let y = 0; y < height; y += gridStep) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
    }
    ctx.stroke();

    zones.filter(zone => zone.state !== 'ok').forEach(zone => {
        const x = (0.08 + zone.x * 0.84) * width;
        const y = (0.08 + zone.y * 0.78) * height;
        const radius = (zone.state === 'alert' ? 72 : 54) * (low ? 0.72 : 1);
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, zone.state === 'alert' ? 'rgba(255, 48, 48, 0.18)' : 'rgba(255, 173, 0, 0.14)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    });

    const noiseCount = low ? 18 : 46;
    ctx.fillStyle = 'rgba(57, 255, 20, 0.16)';
    for (let i = 0; i < noiseCount; i++) {
        const x = (i * 47) % width;
        const y = (i * 29) % height;
        ctx.fillRect(x, y, 1, 1);
    }
}

function renderFacilityOfflineState(host) {
    const widget = createSvgWidget(host, { cols: 96, rows: 42, cellWidth: 8, cellHeight: 10, kind: 'facility-command-center-offline' });
    if (!widget) return;
    renderWidgetFrame(widget, { className: 'telemetry-red' });
    svgLabel(widget.labelLayer, 'NET OFFLINE // FACILITY BUS LOCKED', 25, 18, { className: 'telemetry-red', fontSize: 16 });
    svgLabel(widget.labelLayer, 'RESTORE NET ONLINE TO RE-ACQUIRE MAP TELEMETRY', 22, 22, { className: 'telemetry-amber' });
}

function renderFacilityCommandCenterWidget(host, frame, zones, links, contacts) {
    const widget = createSvgWidget(host, { cols: 96, rows: 42, cellWidth: 8, cellHeight: 10, kind: 'facility-command-center' });
    if (!widget) return;
    const facilityProfile = diagnosticFacilityProfile();
    const motionActive = facilityMotionActive(facilityProfile);
    const staticKey = JSON.stringify({
        zones: zones.map(zone => [zone.id, zone.label, zone.status, zone.state, zone.x, zone.y, zone.w, zone.h]),
        links: links.map(link => [link.from, link.to, link.state])
    });
    const rects = {};
    zones.forEach(zone => {
        rects[zone.id] = facilityCommandRect(zone, widget);
    });

    if (widget.svg.dataset.facilityStaticKey !== staticKey) {
        widget.svg.dataset.facilityStaticKey = staticKey;
        clearSvgLayer(widget.guideLayer);
        clearSvgLayer(widget.labelLayer);
        drawSvgGuideRect(widget, 0, 0, widget.cols, widget.rows, { opacity: 0.22, className: 'telemetry-cyan' });
        for (let col = 6; col < widget.cols; col += 6) drawSvgGuideLine(widget, col, 2, col, widget.rows - 3, { opacity: 0.045, className: 'telemetry-green' });
        for (let row = 4; row < widget.rows; row += 4) drawSvgGuideLine(widget, 2, row, widget.cols - 3, row, { opacity: 0.045, className: 'telemetry-green' });
        drawSvgGuideCircle(widget, 48, 21, 9, { opacity: 0.06, className: 'telemetry-cyan' });
        drawSvgGuideCircle(widget, 48, 21, 18, { opacity: 0.04, className: 'telemetry-cyan' });
        svgLabel(widget.labelLayer, `${statusGet('facility.grid.id', 'BDR-01')} // TACTICAL FACILITY COMMAND CENTER`, 2, 2, { className: 'telemetry-amber' });

        links.forEach(link => {
            const start = rects[link.from];
            const end = rects[link.to];
            if (!start || !end) return;
            const cls = facilityStateClass(link.state);
            drawSvgGuideLine(widget, start.centerCol, start.centerRow, end.centerCol, end.centerRow, { className: cls, opacity: link.state === 'alert' ? 0.34 : 0.2 });
            const midCol = (start.centerCol + end.centerCol) / 2;
            const midRow = (start.centerRow + end.centerRow) / 2;
            svgTextGlyph(widget.labelLayer, link.state === 'alert' ? '▥' : '◇', midCol, midRow, { className: cls, opacity: 0.54 });
        });

        zones.forEach(zone => drawFacilityZoneShape(widget, zone, rects[zone.id]));

        svgLabel(widget.labelLayer, '□ NOMINAL   ◇ WARN   △ ALERT   ◆ UNKNOWN CONTACT', 3, 39, { className: 'telemetry-dim' });
        svgLabel(widget.labelLayer, 'STATIC GRID: CANVAS // MAP LAYER: SVG // STATUS RAIL: HTML', 43, 39, { className: 'telemetry-dim' });
    }

    clearSvgLayer(widget.glyphLayer);
    const loading = !prefersReducedMotion && frame < 14;
    const drawCount = loading ? Math.max(2, Math.round((frame / 14) * zones.length)) : zones.length;
    zones.slice(0, drawCount).forEach(zone => {
        const rect = rects[zone.id];
        if (!rect) return;
        const cls = facilityStateClass(zone.state);
        const loadCells = Math.max(1, Math.min(10, Math.round(zone.load / 10)));
        renderGlyphRow(widget.glyphLayer, rect.row + rect.rows - 0.9, `${'█'.repeat(loadCells)}${'░'.repeat(10 - loadCells)}`, {
            col: rect.col + 0.8,
            className: cls,
            opacity: 0.54 + (zone.load / 100) * 0.38
        });
        svgTextGlyph(widget.glyphLayer, zone.state === 'alert' ? '△' : zone.state === 'warn' ? '◇' : '□', rect.col + rect.cols - 1.2, rect.row + 1.1, {
            className: cls,
            opacity: zone.state === 'alert' && motionActive && facilityProfile.pulse ? 0.74 + Math.sin(frame * 0.16) * 0.18 : 0.88
        });
    });

    const packetLimit = Math.max(0, Math.min(links.length, Number(facilityProfile.packetCount ?? 3)));
    links.slice(0, packetLimit).forEach((link, index) => {
        const start = rects[link.from];
        const end = rects[link.to];
        if (!start || !end) return;
        const cls = facilityStateClass(link.state);
        const t = motionActive ? (frame * (0.006 + index * 0.0005) + link.phase) % 1 : link.phase;
        const col = start.centerCol + (end.centerCol - start.centerCol) * t;
        const row = start.centerRow + (end.centerRow - start.centerRow) * t;
        svgTextGlyph(widget.glyphLayer, link.state === 'alert' ? '◆' : '●', col, row, { className: cls, opacity: link.state === 'alert' ? 0.82 : 0.64 });
    });

    const contactLimit = Math.max(0, Math.min(contacts.length, Number(facilityProfile.contactCount ?? 1)));
    contacts.slice(0, contactLimit).forEach((contact, index) => {
        const start = rects[contact.from];
        const end = rects[contact.to];
        if (!start || !end) return;
        const t = motionActive ? (contact.phase + frame * (0.004 + index * 0.0008)) % 1 : contact.phase;
        const wobble = motionActive ? Math.sin(frame * 0.06 + index) * 0.45 : 0;
        const col = start.centerCol + (end.centerCol - start.centerCol) * t;
        const row = start.centerRow + (end.centerRow - start.centerRow) * t + wobble;
        svgTextGlyph(widget.glyphLayer, '◆', col, row, { className: 'telemetry-red', opacity: motionActive ? 0.82 : 0.68 });
    });

}

function updateFacilityReadouts(frame) {
    const loading = !prefersReducedMotion && frame < 10;
    const phase = prefersReducedMotion ? 24 : frame;
    const zones = getFacilityZones();
    const structure = statusNumber('facility.grid.structure', 77 + Math.round(Math.sin(phase * 0.08) * 2), 0, 100);
    const power = statusNumber('facility.grid.power', 61 + Math.round(Math.sin(phase * 0.1) * 3), 0, 100);
    const reserve = statusNumber('facility.grid.reserve', 34 + Math.round(Math.cos(phase * 0.09) * 4), 0, 100);
    const known = Math.round(statusNumber('facility.contacts.known', 14, 0, 99));
    const unknown = Math.round(statusNumber('facility.contacts.unknown', 3 + (phase % 29 === 0 ? 1 : 0), 0, 99));
    const alerts = zones.filter(zone => zone.state === 'alert').length;
    const warnings = zones.filter(zone => zone.state === 'warn').length;
    const containmentZone = zones.find(zone => zone.id === 'contain') || zones.find(zone => zone.state === 'alert') || zones[0];
    const lifeSupport = statusNumber('facility.life.support', 92 + Math.sin(phase * 0.06) * 2, 0, 100);
    const oxygen = statusNumber('facility.life.oxygen', 97 + Math.sin(phase * 0.05) * 1.2, 0, 100);
    const securityLock = statusNumber('facility.security.lock', 84 - alerts * 7 + Math.sin(phase * 0.07) * 2, 0, 100);
    const containment = statusNumber('facility.containment.integrity', containmentZone?.load || 58, 0, 100);
    const uplink = statusNumber('facility.uplink.sync', 63 + Math.sin(phase * 0.04) * 5, 0, 100);

    if (loading) {
        const progress = Math.min(99, 14 + frame * 9);
        diagText('facilityMeta', `COMMAND CENTER: INDEXING FACILITY GRID ${facilityReadoutBar(progress, 10)}`);
        diagText('facilityScanStatus', `INDEX ${spinner(frame)} ${facilityReadoutBar(progress, 10)}`);
        diagText('facilityOverview', statusBlock('facility.overview', [
            `GRID      ${facilityReadoutBar(progress, 10)}`,
            `POWER     ${facilityReadoutBar(20 + frame * 7, 10)}`,
            'STATE     PRECHARGE'
        ], phase));
        diagText('facilityLifeSupport', statusBlock('facility.life', [
            `O2 BUS    ${facilityReadoutBar(progress, 10)}`,
            `THERMAL   ${facilityReadoutBar(30 + frame * 5, 10)}`,
            'BIO GRID  ACQUIRING'
        ], phase));
        diagText('facilityZones', statusBlock('facility.zones', [
            `LOCKS     ${facilityReadoutBar(progress, 10)}`,
            'DOORS     INDEX',
            'PERIMETER CAL'
        ], phase));
        diagText('facilityContainment', statusBlock('facility.containment', [
            `SEALS     ${facilityReadoutBar(progress - 12, 10)}`,
            'PRESSURE  CAL',
            'RITUAL    WAIT'
        ], phase));
        diagText('facilityUplink', statusBlock('facility.uplink', [
            `DEAD-NET  ${facilityReadoutBar(progress - 24, 10)}`,
            'PACKETS   HOLD',
            'SYNC      CAL'
        ], phase));
        diagText('facilityContacts', statusBlock('facility.contact_readout', [
            'BIO GRID  SYNC',
            'FAULT BUS SYNC',
            'UNKNOWN   HOLD'
        ], phase));
        diagText('facilityTelemetryStrip', `STRUCTURE ${facilityReadoutBar(progress, 8)}  POWER ${facilityReadoutBar(progress - 4, 8)}  RESERVE ${facilityReadoutBar(progress - 16, 8)}  FAULTS --  BIO --`);
        diagText('facilityTicker', `COMMAND CENTER BOOT ${spinner(frame)} DRAWING ZONES // LINKING SENSOR ROUTES`);
        return;
    }

    diagText('facilityMeta', `COMMAND CENTER: LIVE // FRAME ${String(frame).padStart(4, '0')} // ${alerts} ALERT ${warnings} WARN`);
    diagText('facilityScanStatus', `MAP LOCK ${facilityReadoutBar(structure, 8)} ${Math.round(structure)}%`);
    diagText('facilityOverview', statusBlock('facility.overview', [
        `STRUCTURE ${facilityReadoutBar(structure, 10)} ${Math.round(structure)}%`,
        `POWER     ${facilityReadoutBar(power, 10)} ${Math.round(power)}%`,
        `RESERVE   ${facilityReadoutBar(reserve, 10)} ${Math.round(reserve)}%`,
        `REPAIR    ${statusGet('facility.grid.repair', '06 OPEN')}`
    ], phase));
    diagText('facilityLifeSupport', statusBlock('facility.life', [
        `O2 SAT    ${facilityReadoutBar(oxygen, 10)} ${Math.round(oxygen)}%`,
        `THERMAL   ${facilityReadoutBar(lifeSupport - 6, 10)} OK`,
        `BIO GRID  ${String(known).padStart(2, '0')} KNOWN`
    ], phase));
    diagText('facilityZones', statusBlock('facility.zones', [
        `LOCKS     ${facilityReadoutBar(securityLock, 10)} ${Math.round(securityLock)}%`,
        `WARNINGS  ${String(warnings).padStart(2, '0')}`,
        `ALERTS    ${String(alerts).padStart(2, '0')}`
    ], phase));
    diagText('facilityContainment', statusBlock('facility.containment', [
        `INTEGRITY ${facilityReadoutBar(containment, 10)} ${Math.round(containment)}%`,
        `ZONE      ${containmentZone?.label || 'CNTM'}`,
        `STATUS    ${(containmentZone?.status || 'WATCH').slice(0, 10)}`
    ], phase));
    diagText('facilityUplink', statusBlock('facility.uplink', [
        `SYNC      ${facilityReadoutBar(uplink, 10)} ${Math.round(uplink)}%`,
        `CARRIER   ${statusGet('facility.uplink.carrier', 'DEGRADED')}`,
        `PACKET    ${statusGet('facility.uplink.packet_decay', '14% DECAY')}`
    ], phase));
    diagText('facilityContacts', statusBlock('facility.contact_readout', [
        `KNOWN     ${String(known).padStart(2, '0')}`,
        `UNKNOWN   ${String(unknown).padStart(2, '0')} MOVING`,
        `CAMERA    ${statusGet('facility.contacts.camera', '05/12 DIRTY')}`,
        `FAULTS    ${statusGet('facility.contacts.faults', 'PUMP2 DOOR-C RLY04')}`
    ], phase));
    diagText('facilityTelemetryStrip', `STRUCTURE ${facilityReadoutBar(structure, 8)}  POWER ${facilityReadoutBar(power, 8)}  RESERVE ${facilityReadoutBar(reserve, 8)}  FAULTS ${String(alerts + warnings).padStart(2, '0')}  BIO ${String(known).padStart(2, '0')}/${String(unknown).padStart(2, '0')}`);
    const defaultTicker = `MAINTENANCE REQUIRED // ABSTRACT GRID ONLY // UNKNOWN LIFE SIGNS DETECTED ${spinner(phase)}`;
    diagText('facilityTicker', statusInterpolate(statusGet('facility.ticker', defaultTicker), phase));
}

function renderFacilityStatus(timestamp = 0) {
    const host = getById('facilityCanvas');
    if (!host) return;
    const frame = Number.isFinite(facilityFrame) ? facilityFrame : Math.round(timestamp / 33);
    const facilityProfile = diagnosticFacilityProfile();
    const zones = getFacilityZones();
    const links = getFacilityLinks();
    const contacts = getFacilityContacts();
    renderFacilityAtmosphere(frame, zones);
    if (!AppState.networkOnline) {
        renderFacilityOfflineState(host);
    } else {
        renderFacilityCommandCenterWidget(host, frame, zones, links, contacts);
    }

    const readoutEvery = Math.max(1, Number(facilityProfile.readoutEvery || 8));
    const safeMode = typeof safeModeActive === 'function' && safeModeActive();
    if (frame < 3 || frame % readoutEvery === 0 || prefersReducedMotion || safeMode) {
        updateFacilityReadouts(frame);
    }
}

function runFacilityLoop(timestamp = 0) {
    if (!facilityActive || !AppState.networkOnline) return;
    if (document.hidden || (typeof safeModeActive === 'function' && safeModeActive())) {
        facilityAnimFrame = null;
        return;
    }
    const profile = diagnosticRenderProfile();
    const interval = Math.max(profile.facilityMs || effectsFrameMs(34, 80, 140), 120);
    if (!facilityLastRender || timestamp - facilityLastRender >= interval) {
        facilityLastRender = timestamp;
        facilityFrame++;
        renderFacilityStatus(timestamp);
        if (facilityFrame < 12 && facilityFrame % 3 === 0) AudioEngine.keyClick();
    }
    facilityAnimFrame = requestAnimationFrame(runFacilityLoop);
}

function showFacilityStatus() {
    if (!AppState.networkOnline) {
        printNetworkUnavailable('TOPOGRAPHY');
        return;
    }
    if (window.TerminalSessionRestore?.openTool) {
        window.TerminalSessionRestore.openTool('facility', 'facility-map.html');
        return;
    }
    const overlay = document.getElementById('facilityOverlay');
    if (!overlay || overlay.classList.contains('active')) return;
    facilityActive = true;
    setAppState({ activeOverlay: 'facility' }, { resetSelection: false });
    facilityFrame = prefersReducedMotion ? 24 : 0;
    facilityLastRender = 0;
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    AudioEngine.bootBeep();
    if (window.MapOverlayController) {
        // The tactical map is a WebGL iframe. Keep its parent untransformed;
        // GSAP dialog transforms on iframe ancestors can make the map stutter.
        const panel = overlay.querySelector('.facility-panel');
        if (panel) {
            panel.style.opacity = '';
            panel.style.transform = 'none';
            panel.style.willChange = 'auto';
        }
        window.MapOverlayController.open({ trigger: document.activeElement });
    } else {
        Animator.dialogOpen(overlay);
        renderFacilityStatus(performance.now());
        if (!prefersReducedMotion && !(typeof safeModeActive === 'function' && safeModeActive())) {
            facilityAnimFrame = requestAnimationFrame(runFacilityLoop);
        }
    }
}

function showWireframeMap() {
    if (!AppState.networkOnline) {
        printNetworkUnavailable('TACTICAL WIREFRAME MAP');
        return;
    }
    if (window.TerminalSessionRestore?.openTool) {
        window.TerminalSessionRestore.openTool('wireframe', 'Facility Wireframe Tactical Map.html');
        return;
    }
    AudioEngine.bootBeep();
    // Fallback for older runtimes without the session bridge: open in same tab.
    window.location.href = 'Facility Wireframe Tactical Map.html';
}

function closeFacilityStatus() {
    const overlay = document.getElementById('facilityOverlay');
    if (!overlay || !overlay.classList.contains('active')) return;
    facilityActive = false;
    setAppState({ activeOverlay: 'none' }, { resetSelection: false });
    if (facilityAnimFrame) {
        cancelAnimationFrame(facilityAnimFrame);
        facilityAnimFrame = null;
    }
    window.MapOverlayController?.close({ restoreFocus: false });
    AudioEngine.pageFlip();
    Animator.dialogClose(overlay, () => {
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
    });
}

function getDiagnosticPerformanceSnapshot() {
    const profile = diagnosticRenderProfile();
    const widgetIds = [
        ['network', 'diagNetwork'],
        ['security', 'diagSecurity'],
        ['outpost', 'diagOutpost'],
        ['generator', 'diagGenerator'],
        ['power', 'diagPower'],
        ['alarm', 'diagAlarm'],
        ['life', 'diagLife'],
        ['events', 'diagEvents'],
        ['integrity', 'diagIntegrity'],
        ['uplink', 'diagUplink']
    ];
    return {
        browser: typeof detectBrowserProfile === 'function' ? detectBrowserProfile() : 'unknown',
        profile: profile.name || 'unknown',
        effectsMode,
        effectiveEffects: EffectsController.effectiveLabel(),
        reducedMotion: prefersReducedMotion,
        safeMode: typeof safeModeActive === 'function' ? safeModeActive() : false,
        activeOverlay: AppState.activeOverlay,
        documentHidden: document.hidden,
        diagnosticLoop: Boolean(diagnosticAnimFrame),
        facilityLoop: Boolean(facilityAnimFrame),
        facilityMap: window.MapOverlayController?.getSnapshot?.() || null,
        sideLoop: Boolean(sideTelemetryAnimFrame),
        schedulerMs: profile.schedulerMs,
        facilityMs: profile.facilityMs,
        facilityProfile: profile.facility || null,
        sideTelemetryMs: profile.sideTelemetryMs,
        radarMs: profile.radar?.frameMs,
        widgets: widgetIds.map(([key, id]) => {
            const host = getById(id);
            const runtime = DIAGNOSTIC_WIDGET_REGISTRY.get(key);
            return {
                key,
                id,
                nodes: host ? host.querySelectorAll('svg *').length : 0,
                targetMs: diagnosticWidgetInterval(key, 160),
                renders: runtime?.renders || 0
            };
        })
    };
}

