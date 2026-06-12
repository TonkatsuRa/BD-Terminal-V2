// ========================================
// DIAGNOSTIC DASHBOARD
// ========================================
function diagText(id, value) {
    const element = getById(id);
    if (element && element.textContent !== value) element.textContent = value;
}

function diagCardState(id, state = 'ok') {
    const card = getById(id);
    if (!card) return;
    card.classList.toggle('warn', state === 'warn');
    card.classList.toggle('alert', state === 'alert');
}

function asciiBar(value, width = 18) {
    const safeValue = Math.max(0, Math.min(100, Math.round(value)));
    const filled = Math.round((safeValue / 100) * width);
    return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}] ${String(safeValue).padStart(3, '0')}%`;
}

function asciiSweep(frame, width = 24) {
    const pos = Math.abs((frame % (width * 2 - 2)) - (width - 1));
    let output = '';
    for (let i = 0; i < width; i++) output += i === pos ? 'X' : '.';
    return `[${output}]`;
}

function asciiGraph(frame, width = 28) {
    const chars = '._-~=+#';
    let output = '';
    for (let i = 0; i < width; i++) {
        const level = Math.abs(Math.sin((frame + i) * 0.42) + Math.sin((frame * 0.55 + i) * 0.19));
        output += chars[Math.min(chars.length - 1, Math.floor(level * 3.2))];
    }
    return output;
}

function spinner(frame) {
    return ['|', '/', '-', '\\'][frame % 4];
}

function diagnosticLoading(label, frame) {
    const progress = Math.min(99, 16 + frame * 7);
    return [
        `> LOADING ${label}`,
        `  BUS ${asciiBar(progress, 20)}`,
        `  SEEK ${asciiSweep(frame, 22)}`,
        '  WAITING FOR SENSOR ACK...',
        `  DATA ${asciiGraph(frame, 26)}`,
        '  STATUS      : HOLDING'
    ].join('\n');
}

function lifeSignMap(frame) {
    const dots = ['.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.'];
    const liveA = frame % dots.length;
    const liveB = (frame * 2 + 5) % dots.length;
    const unstable = (frame * 3 + 9) % dots.length;
    dots[liveA] = 'o';
    dots[liveB] = 'o';
    dots[unstable] = '!';
    return [
        '+--A-DECK-------------+  +--B-DECK-------------+',
        `| ${dots[0]}  LAB-1   ${dots[1]}  ${dots[2]} |  | ${dots[3]} MED     ${dots[4]}   |`,
        '|    [CORE]     .    |  |    HAB BLOCK       |',
        `| ${dots[5]}  ACCESS  ${dots[6]}  ${dots[7]} |  | ${dots[8]} CRYO    ${dots[9]}  ${dots[10]} |`,
        '+---------------------+  +---------------------+',
        `LOWER SERVICE TUNNEL TRACE: ${dots[11]}`
    ].join('\n');
}

function heartbeat(frame, width = 44) {
    const pattern = '__/\\/\\____/\\___';
    let output = '';
    for (let i = 0; i < width; i++) output += pattern[(frame + i) % pattern.length];
    return output;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const GLYPH_CELL_WIDTH = 8;
const GLYPH_CELL_HEIGHT = 12;
const BLOCK_GLYPHS = '▁▂▃▄▅▆▇█';
const DENSITY_GLYPHS = '░▒▓█';

function svgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => {
        if (value !== undefined && value !== null) element.setAttribute(key, String(value));
    });
    return element;
}

function ensureSvgDefs(svg) {
    if (!svg) return null;
    let defs = svg.querySelector('defs');
    if (!defs) {
        defs = svgElement('defs');
        svg.prepend(defs);
    }
    return defs;
}

const TELEMETRY_FILTER_COLORS = {
    cyan: [0.0, 1.0, 0.84],
    green: [0.22, 1.0, 0.08],
    amber: [1.0, 0.68, 0.0],
    red: [1.0, 0.2, 0.2]
};

function ensureTelemetryColorFilter(widget, colorName = 'cyan') {
    const color = TELEMETRY_FILTER_COLORS[colorName] || TELEMETRY_FILTER_COLORS.cyan;
    const id = `telemetry-color-${colorName}`;
    const defs = ensureSvgDefs(widget.svg);
    if (!defs || defs.querySelector(`#${id}`)) return id;
    const filter = svgElement('filter', {
        id,
        x: '-10%',
        y: '-10%',
        width: '120%',
        height: '120%',
        'color-interpolation-filters': 'sRGB'
    });
    filter.appendChild(svgElement('feColorMatrix', {
        type: 'matrix',
        values: `0 0 0 0 ${color[0]} 0 0 0 0 ${color[1]} 0 0 0 0 ${color[2]} 0 0 0 1 0`
    }));
    defs.appendChild(filter);
    return id;
}

const DIAGNOSTIC_VITAL_SUBJECTS = [
    { id: 'BD-01', name: 'KRAUSS', state: 'healthy', status: 'STABLE', theme: 'green', hr: 72, resp: 14, o2: 98, bp: '118/76', neural: '4.8 mV', coher: 91, stress: 18, cort: 22, temp: '36.8C', motion: 1.0 },
    { id: 'BD-02', name: 'MORI', state: 'sleeping', status: 'SLEEP', theme: 'cyan', hr: 51, resp: 9, o2: 97, bp: '102/64', neural: '2.1 mV', coher: 76, stress: 8, cort: 13, temp: '36.1C', motion: 0.48 },
    { id: 'BD-03', name: 'HALE', state: 'sick', status: 'FEBRILE', theme: 'amber', hr: 104, resp: 21, o2: 92, bp: '134/82', neural: '3.6 mV', coher: 58, stress: 64, cort: 71, temp: '39.2C', motion: 1.18 },
    { id: 'BD-04', name: 'ITO', state: 'critical', status: 'CRITICAL', theme: 'red', hr: 138, resp: 29, o2: 82, bp: '88/52', neural: '1.2 mV', coher: 31, stress: 91, cort: 94, temp: '40.1C', motion: 1.45 },
    { id: 'BD-05', name: 'VANCE', state: 'dead', status: 'NO VITALS', theme: 'red', hr: 0, resp: 0, o2: 0, bp: '0/0', neural: '0.0 mV', coher: 0, stress: 0, cort: 0, temp: '31.4C', motion: 0.03 },
    { id: 'BD-06', name: 'SATO', state: 'sedated', status: 'SEDATED', theme: 'cyan', hr: 46, resp: 7, o2: 95, bp: '96/58', neural: '1.8 mV', coher: 68, stress: 11, cort: 9, temp: '35.9C', motion: 0.38 },
    { id: 'BD-07', name: 'OKAFOR', state: 'healthy', status: 'STABLE', theme: 'green', hr: 81, resp: 16, o2: 99, bp: '124/79', neural: '5.1 mV', coher: 88, stress: 27, cort: 30, temp: '37.0C', motion: 1.05 },
    { id: 'BD-08', name: 'REYES', state: 'injured', status: 'TRAUMA', theme: 'amber', hr: 118, resp: 24, o2: 89, bp: '142/86', neural: '3.0 mV', coher: 49, stress: 83, cort: 87, temp: '37.8C', motion: 1.28 },
    { id: 'BD-09', name: 'DAHL', state: 'unknown', status: 'ARTIFACT', theme: 'amber', hr: 64, resp: 13, o2: 91, bp: '--/--', neural: 'ERR', coher: 22, stress: 70, cort: 58, temp: '??.?C', motion: 0.82 },
    { id: 'BD-10', name: 'KIM', state: 'sleeping', status: 'REM', theme: 'cyan', hr: 58, resp: 11, o2: 96, bp: '108/69', neural: '6.4 mV', coher: 73, stress: 21, cort: 17, temp: '36.4C', motion: 0.58 },
    { id: 'BD-11', name: 'MERTZ', state: 'sick', status: 'HYPOXIA', theme: 'amber', hr: 96, resp: 26, o2: 84, bp: '128/80', neural: '2.7 mV', coher: 46, stress: 67, cort: 73, temp: '38.6C', motion: 1.08 },
    { id: 'BD-12', name: 'VASQUEZ', state: 'critical', status: 'SHOCK', theme: 'red', hr: 152, resp: 32, o2: 76, bp: '74/41', neural: '0.9 mV', coher: 18, stress: 96, cort: 99, temp: '35.2C', motion: 1.55 },
    { id: 'BD-13', name: 'ELIAS', state: 'dead', status: 'FLATLINE', theme: 'red', hr: 0, resp: 0, o2: 0, bp: '0/0', neural: '0.0 mV', coher: 0, stress: 0, cort: 0, temp: '29.9C', motion: 0.02 },
    { id: 'BD-14', name: 'PARK', state: 'healthy', status: 'STABLE', theme: 'green', hr: 68, resp: 15, o2: 98, bp: '116/72', neural: '4.2 mV', coher: 86, stress: 24, cort: 25, temp: '36.7C', motion: 0.96 },
    { id: 'BD-15', name: 'NADIR', state: 'anomalous', status: 'ANOMALOUS', theme: 'red', hr: 41, resp: 5, o2: 88, bp: '160/40', neural: '9.9 mV', coher: 7, stress: 100, cort: 100, temp: '34.0C', motion: 1.72 },
    { id: 'BD-16', name: 'CHEN', state: 'recovering', status: 'WATCH', theme: 'amber', hr: 89, resp: 18, o2: 94, bp: '122/78', neural: '3.9 mV', coher: 63, stress: 45, cort: 39, temp: '37.4C', motion: 0.9 }
];

let diagnosticVitalsSubjectIndex = 0;

function selectedDiagnosticVitalSubject() {
    return DIAGNOSTIC_VITAL_SUBJECTS[diagnosticVitalsSubjectIndex] || DIAGNOSTIC_VITAL_SUBJECTS[0];
}

function setDiagnosticVitalsSubject(delta) {
    const count = DIAGNOSTIC_VITAL_SUBJECTS.length;
    diagnosticVitalsSubjectIndex = (diagnosticVitalsSubjectIndex + delta + count) % count;
    resetDiagnosticWidgetRegistry();
    renderDiagnosticDashboard(performance.now(), { force: true });
}

function bindDiagnosticVitalsControls() {
    if (document.documentElement.dataset.diagnosticVitalsBound === 'true') return;
    document.documentElement.dataset.diagnosticVitalsBound = 'true';
    document.addEventListener('click', event => {
        const button = event.target.closest?.('#diagVitalsPrev, #diagVitalsNext');
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        setDiagnosticVitalsSubject(button.id === 'diagVitalsPrev' ? -1 : 1);
    });
}

function bodyCardioImageBox(widget) {
    const container = {
        x: 2.05 * widget.cellWidth,
        y: 3.25 * widget.cellHeight,
        width: 14.1 * widget.cellWidth,
        height: 15.95 * widget.cellHeight
    };
    const assetAspect = 90 / 180;
    const containerAspect = container.width / container.height;
    let width = container.width;
    let height = container.height;
    let x = container.x;
    let y = container.y;
    if (containerAspect > assetAspect) {
        width = height * assetAspect;
        x += (container.width - width) / 2;
    } else {
        height = width / assetAspect;
        y += (container.height - height) / 2;
    }
    return { ...container, renderX: x, renderY: y, renderWidth: width, renderHeight: height };
}

const BODY_CARDIO_REGION_SHAPES = {
    head: { type: 'ellipse', cx: 45, cy: 13.4, rx: 8.6, ry: 11.8 },
    torso: {
        type: 'path',
        d: 'M32 30 C38 27 52 27 58 30 C63 43 65 57 63 71 C60 87 54 102 50 112 C48 116 42 116 40 112 C35 101 30 87 27 71 C25 57 27 43 32 30 Z'
    },
    leftArm: {
        type: 'path',
        d: 'M29 31 C20 36 18 48 20 63 C19 73 15 84 10 91 C8 95 12 100 17 96 C23 87 27 76 29 65 C33 51 34 39 29 31 Z'
    },
    rightArm: {
        type: 'path',
        d: 'M61 31 C70 36 72 48 70 63 C71 73 75 84 80 91 C82 95 78 100 73 96 C67 87 63 76 61 65 C57 51 56 39 61 31 Z'
    },
    leftLeg: {
        type: 'path',
        d: 'M34 88 C38 104 39 128 35 153 C34 164 30 174 27 178 C32 181 37 177 39 168 C43 145 46 115 45 94 Z'
    },
    rightLeg: {
        type: 'path',
        d: 'M56 88 C52 104 51 128 55 153 C56 164 60 174 63 178 C58 181 53 177 51 168 C47 145 44 115 45 94 Z'
    }
};

function appendBodyRegionShape(layer, shape, status) {
    const colors = bodyRegionColor(status);
    const common = {
        fill: colors.fill,
        stroke: colors.stroke,
        'stroke-width': status === 'missing' ? 1.4 : 1.05,
        opacity: status === 'healthy' ? 0.78 : 0.88,
        'vector-effect': 'non-scaling-stroke',
        'shape-rendering': 'geometricPrecision'
    };
    if (status === 'missing') common['stroke-dasharray'] = '4 3';
    if (shape.type === 'ellipse') {
        layer.appendChild(svgElement('ellipse', { ...common, cx: shape.cx, cy: shape.cy, rx: shape.rx, ry: shape.ry }));
    } else {
        layer.appendChild(svgElement('path', { ...common, d: shape.d }));
    }
}

function renderBodyCardioAsset(widget, subject, frame) {
    const regions = subjectBodyRegions(subject);
    const colorName = subject.theme || 'cyan';
    const pulse = subject.state === 'dead' || prefersReducedMotion ? 0 : Math.sin(frame * 0.18) * 0.06;
    const box = bodyCardioImageBox(widget);
    const regionGroup = svgElement('g', {
        transform: `translate(${box.renderX.toFixed(2)} ${box.renderY.toFixed(2)}) scale(${(box.renderWidth / 90).toFixed(4)} ${(box.renderHeight / 180).toFixed(4)})`,
        opacity: subject.state === 'dead' ? 0.72 : 1
    });
    Object.entries(BODY_CARDIO_REGION_SHAPES).forEach(([key, shape]) => {
        appendBodyRegionShape(regionGroup, shape, regions[key] || 'healthy');
    });
    widget.glyphLayer.appendChild(regionGroup);

    const bodyImage = svgElement('image', {
        href: 'assets/body-cardio.svg',
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        preserveAspectRatio: 'xMidYMid meet',
        opacity: (subject.state === 'dead' ? 0.54 : 0.88) + pulse
    });
    widget.glyphLayer.appendChild(bodyImage);

    const heartPulse = subject.hr > 0 && !prefersReducedMotion ? 0.58 + Math.sin(frame * 0.32 * Math.max(0.25, subject.motion || 1)) * 0.24 : 0.34;
    widget.glyphLayer.appendChild(svgElement(subject.hr > 0 ? 'circle' : 'rect', subject.hr > 0 ? {
        cx: box.renderX + box.renderWidth * 0.54,
        cy: box.renderY + box.renderHeight * 0.245,
        r: 2.6 + heartPulse * 1.6,
        fill: subject.state === 'dead' ? 'rgba(255,51,51,0.28)' : 'rgba(255,51,51,0.58)',
        stroke: 'rgba(255,51,51,0.86)',
        'stroke-width': 0.9,
        opacity: heartPulse
    } : {
        x: box.renderX + box.renderWidth * 0.48,
        y: box.renderY + box.renderHeight * 0.225,
        width: 7,
        height: 7,
        fill: 'rgba(255,51,51,0.22)',
        stroke: 'rgba(255,51,51,0.62)',
        'stroke-width': 0.8,
        opacity: 0.5
    }));

    const regionLegend = [
        ['HD', 'head', 2.2, 20.15],
        ['TR', 'torso', 6.9, 20.15],
        ['LA', 'leftArm', 11.4, 20.15],
        ['RA', 'rightArm', 2.2, 21.55],
        ['LL', 'leftLeg', 6.9, 21.55],
        ['RL', 'rightLeg', 11.4, 21.55]
    ];
    regionLegend.forEach(([label, key, col, row]) => {
        const status = regions[key] || 'healthy';
        svgLabel(widget.labelLayer, `${label}:${bodyRegionShortStatus(status)}`, col, row, {
            className: bodyRegionClass(status),
            fontSize: 5.4
        });
    });
    svgLabel(widget.labelLayer, `${subject.id} // ${subject.name}`, 2.05, 2.05, { className: `telemetry-${colorName}`, fontSize: 6.8 });
}

function vitalWaveValue(t, type, subject) {
    if (subject.hr === 0 || subject.state === 'dead') return Math.sin(t * Math.PI * 2) * 0.015;
    const local = ((t % 1) + 1) % 1;
    if (type === 'pulse') {
        if (local < 0.08) return local / 0.08 * 0.18;
        if (local < 0.14) return 0.18 - ((local - 0.08) / 0.06) * 0.28;
        if (local < 0.18) return -0.1 + ((local - 0.14) / 0.04) * 1.35;
        if (local < 0.22) return 1.25 - ((local - 0.18) / 0.04) * 1.75;
        if (local < 0.31) return -0.5 + ((local - 0.22) / 0.09) * 0.5;
        if (local < 0.48) return Math.sin((local - 0.31) / 0.17 * Math.PI) * 0.28;
        return Math.sin(local * Math.PI * 2) * 0.035;
    }
    if (type === 'resp') return Math.sin(t * Math.PI * 2) * 0.66 + Math.sin(t * Math.PI * 4) * 0.08;
    if (type === 'neural') return Math.sin(t * Math.PI * 5.4) * 0.26 + Math.sin(t * Math.PI * 13.7) * 0.18;
    if (type === 'stress') return Math.sin(t * Math.PI * 3.2) * 0.34 + Math.sin(t * Math.PI * 11.1) * 0.24;
    if (type === 'bp') return local < 0.18 ? 0.62 : local < 0.28 ? -0.38 : Math.sin(t * Math.PI * 2) * 0.08;
    return Math.sin(t * Math.PI * 2.2) * 0.22;
}

function drawVitalMonitorTrace(widget, lane, frame, subject, phase) {
    const points = [];
    const samples = Math.max(140, Math.round((lane.endCol - lane.startCol) * 9));
    const speed = lane.speed * Math.max(0.08, subject.motion);
    const scroll = prefersReducedMotion ? 0 : frame * speed;
    for (let sample = 0; sample <= samples; sample++) {
        const t = sample / samples;
        const col = mixDiagnostic(lane.startCol, lane.endCol, t);
        const drift = Math.sin((t * Math.PI * 2) + frame * 0.018 + lane.row) * lane.drift;
        const jitter = subject.state === 'anomalous'
            ? Math.sin(t * 91 + frame * 0.19) * 0.16
            : Math.sin(t * 37 + frame * 0.04) * lane.noise;
        const value = vitalWaveValue(t * lane.cycles - scroll, lane.type, subject) * lane.amp + drift + jitter;
        points.push(widgetGridPixel(widget, col, lane.row - value));
    }
    svgPolyline(widget.glyphLayer, points, { className: `${lane.cls} telemetry-ekg-trace`, opacity: 0.54 + phase.detail * 0.34, strokeWidth: lane.strokeWidth || 1.35 });

    const sweep = prefersReducedMotion ? 0.66 : (frame * lane.sweepSpeed + lane.row * 0.021) % 1;
    const sweepCol = mixDiagnostic(lane.startCol, lane.endCol, sweep);
    drawSvgGuideLine(widget, sweepCol, lane.row - 0.76, sweepCol, lane.row + 0.76, { className: lane.cls, opacity: 0.18 });
}

function subjectVitalReadings(subject, frame) {
    const motion = subject.motion || 1;
    const heartRate = Math.max(0, Math.round(subject.hr + Math.sin(frame * 0.045) * 2 * motion));
    const resp = Math.max(0, Math.round(subject.resp + Math.sin(frame * 0.033) * 1.5 * motion));
    const systolic = Number(String(subject.bp).split('/')[0]) || 0;
    const diastolic = Number(String(subject.bp).split('/')[1]) || 0;
    const strokeVolume = subject.hr === 0 ? 0 : clampDiagnostic((subject.o2 - 70) / 30, 0, 1) * (11.2 + (100 - subject.stress) / 40);
    return {
        heartRate,
        resp,
        bp: subject.bp,
        systolic,
        diastolic,
        strokeVolume: Number(strokeVolume.toFixed(1)),
        o2: subject.o2,
        temp: subject.temp,
        coher: Math.max(0, Math.round(subject.coher + Math.sin(frame * 0.035) * 3 * motion)),
        stress: Math.max(0, Math.round(subject.stress + Math.sin(frame * 0.04) * 3 * motion))
    };
}

function subjectSeverity(subject) {
    if (subject.state === 'dead') return 'dead';
    if (subject.state === 'critical' || subject.status === 'SHOCK') return 'critical';
    if (subject.state === 'sick' || subject.state === 'injured' || subject.status === 'HYPOXIA') return 'warning';
    if (subject.state === 'sleeping' || subject.state === 'sedated') return 'quiet';
    if (subject.state === 'anomalous') return 'critical';
    return 'normal';
}

function subjectBodyRegions(subject) {
    const healthy = {
        head: 'healthy',
        torso: 'healthy',
        leftArm: 'healthy',
        rightArm: 'healthy',
        leftLeg: 'healthy',
        rightLeg: 'healthy'
    };
    const bySubject = {
        'BD-03': { head: 'damaged', torso: 'damaged' },
        'BD-04': { head: 'critical', torso: 'critical', leftArm: 'damaged', rightArm: 'damaged', leftLeg: 'damaged', rightLeg: 'damaged' },
        'BD-05': { head: 'critical', torso: 'critical', leftArm: 'critical', rightArm: 'critical', leftLeg: 'critical', rightLeg: 'critical' },
        'BD-08': { torso: 'damaged', leftArm: 'critical', leftLeg: 'damaged' },
        'BD-09': { head: 'damaged', torso: 'damaged', rightArm: 'missing' },
        'BD-11': { head: 'damaged', torso: 'critical', leftLeg: 'damaged', rightLeg: 'damaged' },
        'BD-12': { head: 'critical', torso: 'critical', leftArm: 'critical', rightArm: 'critical', leftLeg: 'critical', rightLeg: 'critical' },
        'BD-13': { head: 'critical', torso: 'critical', leftArm: 'critical', rightArm: 'critical', leftLeg: 'critical', rightLeg: 'critical' },
        'BD-15': { head: 'critical', torso: 'critical', leftArm: 'damaged', rightArm: 'missing', leftLeg: 'damaged', rightLeg: 'critical' },
        'BD-16': { torso: 'damaged', leftLeg: 'damaged' }
    };
    return { ...healthy, ...(bySubject[subject.id] || {}) };
}

function bodyRegionColor(status) {
    if (status === 'critical') return { fill: 'rgba(255,51,51,0.48)', stroke: 'rgba(255,51,51,0.78)' };
    if (status === 'damaged') return { fill: 'rgba(255,173,0,0.42)', stroke: 'rgba(255,173,0,0.72)' };
    if (status === 'missing') return { fill: 'rgba(110,125,120,0.24)', stroke: 'rgba(160,176,170,0.44)' };
    return { fill: 'rgba(3,74,22,0.46)', stroke: 'rgba(32,194,14,0.56)' };
}

function bodyRegionShortStatus(status) {
    if (status === 'critical') return 'CRIT';
    if (status === 'damaged') return 'DMG';
    if (status === 'missing') return 'MISS';
    return 'OK';
}

function bodyRegionClass(status) {
    if (status === 'critical') return 'telemetry-red';
    if (status === 'damaged') return 'telemetry-amber';
    if (status === 'missing') return 'telemetry-dim';
    return 'telemetry-green';
}

function subjectBodySummary(regions) {
    const values = Object.values(regions);
    const missing = values.filter(value => value === 'missing').length;
    const critical = values.filter(value => value === 'critical').length;
    const damaged = values.filter(value => value === 'damaged').length;
    if (missing) return `BODY MISS ${missing} // CRIT ${critical} // DMG ${damaged}`;
    if (critical) return `BODY CRIT ${critical} // DMG ${damaged}`;
    if (damaged) return `BODY DMG ${damaged} // OBSERVE`;
    return 'BODY NOMINAL // ALL REGIONS GREEN';
}

function subjectEndTidalCo2(subject, readings) {
    if (subject.state === 'dead') return 0;
    if (subject.status === 'SHOCK' || readings.systolic < 85) return 24;
    if (subject.status === 'HYPOXIA' || readings.o2 < 88) return 31;
    if (readings.resp > 26) return 32;
    if (readings.resp < 8 || subject.state === 'sedated') return 49;
    if (subject.state === 'sleeping') return 42;
    if (subject.state === 'sick') return 41;
    return 38;
}

function subjectSignalProfile(subject, readings) {
    if (subject.state === 'dead') {
        return {
            perfusion: 0,
            ecgAmp: 0.018,
            respAmp: 0.012,
            plethAmp: 0.014,
            co2Amp: 0.014,
            artAmp: 0.014,
            cvpAmp: 0.012,
            artifact: 0,
            irregular: 0,
            baseline: 0
        };
    }
    const systolic = readings.systolic || 0;
    const pulsePressure = Math.max(0, systolic - (readings.diastolic || 0));
    const perfusion = clampDiagnostic((systolic / 118) * ((readings.o2 || 0) / 98), 0.05, 1.18);
    const respiratoryLoad = subject.status === 'HYPOXIA' || readings.o2 < 90
        ? 1.36
        : readings.resp < 8 || subject.state === 'sedated'
            ? 0.56
            : readings.resp > 24
                ? 1.18
                : subject.state === 'sleeping'
                    ? 0.72
                    : 1;
    const shock = subject.status === 'SHOCK' || systolic < 85;
    const critical = subject.state === 'critical' || subject.state === 'anomalous';
    return {
        perfusion,
        ecgAmp: subject.state === 'sleeping' || subject.state === 'sedated' ? 0.72 : critical ? 1.08 : 0.9,
        respAmp: clampDiagnostic(0.78 * respiratoryLoad, 0.34, 1.24),
        plethAmp: clampDiagnostic(0.98 * perfusion, 0.08, 1.04),
        co2Amp: clampDiagnostic(subjectEndTidalCo2(subject, readings) / 42, 0.18, 1.18),
        artAmp: clampDiagnostic((pulsePressure / 44) * (shock ? 0.55 : 0.85), 0.08, 1.16),
        cvpAmp: shock ? 0.16 : critical ? 0.34 : 0.24,
        artifact: subject.state === 'anomalous' ? 0.15 : subject.state === 'unknown' ? 0.09 : critical ? 0.045 : 0.012,
        irregular: subject.state === 'anomalous' ? 0.9 : subject.status === 'SHOCK' ? 0.48 : critical ? 0.32 : subject.state === 'unknown' ? 0.36 : 0.06,
        baseline: subject.status === 'HYPOXIA' || shock ? 0.08 : 0.025
    };
}

function icuNumericClass(kind, value, subject) {
    if (subject.state === 'dead') return 'telemetry-red';
    if (kind === 'hr') return value < 45 || value > 130 ? 'telemetry-red' : value < 55 || value > 100 ? 'telemetry-amber' : 'telemetry-green';
    if (kind === 'resp') return value < 8 || value > 28 ? 'telemetry-red' : value < 10 || value > 22 ? 'telemetry-yellow' : 'telemetry-yellow';
    if (kind === 'spo2') return value < 88 ? 'telemetry-red' : value < 94 ? 'telemetry-amber' : 'telemetry-cyan';
    if (kind === 'co2') return value < 25 || value > 55 ? 'telemetry-red' : value < 32 || value > 45 ? 'telemetry-amber' : 'telemetry-magenta';
    if (kind === 'bp') {
        const systolic = Number(String(value).split('/')[0]) || 0;
        return systolic < 85 || systolic > 160 ? 'telemetry-red' : systolic < 95 || systolic > 145 ? 'telemetry-amber' : 'telemetry-white';
    }
    return 'telemetry-cyan';
}

function icuWaveValue(type, t, subject, lane = {}) {
    if (subject.state === 'dead') {
        if (type === 'ecg') return Math.sin(t * Math.PI * 2) * 0.01;
        return Math.sin(t * Math.PI * 2) * 0.006;
    }
    const local = ((t % 1) + 1) % 1;
    if (type === 'ecg') {
        if (local < 0.04) return 0.08;
        if (local < 0.07) return -0.25;
        if (local < 0.09) return 1.2;
        if (local < 0.12) return -0.45;
        if (local < 0.18) return 0.05;
        if (local < 0.28) return Math.sin((local - 0.18) / 0.1 * Math.PI) * 0.26;
        if (local < 0.58) return 0.02;
        if (local < 0.72) return Math.sin((local - 0.58) / 0.14 * Math.PI) * 0.34;
        return 0.02;
    }
    if (type === 'resp') {
        const distress = subject.status === 'HYPOXIA' || subject.o2 < 88 || subject.status === 'SHOCK';
        const base = Math.sin(t * Math.PI * 2) * 0.72;
        return distress ? base + Math.sin(t * Math.PI * 4.2) * 0.12 : base;
    }
    if (type === 'pleth') {
        const notch = lane.lowPerfusion ? 0.08 : 0.2;
        if (local < 0.18) return Math.sin(local / 0.18 * Math.PI) * 0.98;
        if (local < 0.44) return 0.48 + Math.sin((local - 0.18) / 0.26 * Math.PI) * notch;
        return -0.18 + Math.cos((local - 0.44) / 0.56 * Math.PI) * 0.16;
    }
    if (type === 'co2') {
        if (local < 0.16) return -0.34;
        if (local < 0.32) return -0.34 + ((local - 0.16) / 0.16) * 0.78;
        if (local < 0.72) return 0.44 + Math.sin((local - 0.32) / 0.4 * Math.PI) * 0.08;
        if (local < 0.86) return 0.44 - ((local - 0.72) / 0.14) * 0.78;
        return -0.34;
    }
    if (type === 'ibp') {
        const systolicSnap = local < 0.12 ? Math.sin(local / 0.12 * Math.PI) * 0.32 : 0;
        return icuWaveValue('pleth', t, subject, lane) * 0.58 + systolicSnap + Math.sin(t * Math.PI * 6) * 0.04;
    }
    if (type === 'cvp') return Math.sin(t * Math.PI * 5) * 0.11 + Math.sin(t * Math.PI * 11) * 0.06;
    return Math.sin(t * Math.PI * 2) * 0.2;
}

function drawIcuWaveform(widget, lane, frame, subject) {
    const samples = 240;
    const points = [];
    const scroll = prefersReducedMotion ? 0 : frame * lane.speed;
    for (let sample = 0; sample <= samples; sample++) {
        const t = sample / samples;
        const col = mixDiagnostic(lane.startCol, lane.endCol, t);
        let waveT = t * lane.cycles - scroll;
        if (lane.irregular && lane.type === 'ecg') {
            const beatIndex = Math.floor(waveT);
            waveT += Math.sin(beatIndex * 12.9898 + subject.hr * 0.071) * 0.055 * lane.irregular;
        }
        const artifact = (lane.artifact || 0) * (
            Math.sin(t * 117 + frame * 0.19) * 0.58 +
            Math.sin(t * 43 + frame * 0.071) * 0.42
        );
        const baseline = (lane.baseline || 0) * Math.sin(t * Math.PI * 2 + frame * 0.018 + lane.row);
        const value = icuWaveValue(lane.type, waveT, subject, lane) * lane.amp + artifact + baseline;
        const y = lane.row - value;
        points.push(widgetContinuousPoint(widget, col, y));
    }
    svgPathFromPoints(widget.glyphLayer, points, {
        className: `${lane.cls} telemetry-monitor-trace`,
        opacity: lane.opacity ?? 0.94,
        strokeWidth: lane.strokeWidth || 1.15,
        smooth: lane.smooth ?? true
    });
    const labelCol = lane.labelCol ?? lane.startCol;
    svgLabel(widget.labelLayer, lane.label, labelCol, lane.row - lane.labelOffset, { className: lane.cls, fontSize: 7.2 });
    if (lane.subLabel) svgLabel(widget.labelLayer, lane.subLabel, lane.subLabelCol ?? labelCol + 5, lane.row - lane.labelOffset, { className: lane.cls, fontSize: 6.4 });
}

function renderIcuReadoutCell(widget, label, value, unit, x, y, cls, options = {}) {
    const preciseLabel = (text, col, row, fontSize) => {
        const point = widgetContinuousPoint(widget, col, row);
        const element = svgElement('text', {
            x: point.x,
            y: point.y,
            class: `telemetry-label ${cls}`.trim()
        });
        if (fontSize) element.setAttribute('font-size', Number(fontSize) * (Number(widget.fontScale) || 1));
        element.textContent = String(text);
        widget.labelLayer.appendChild(element);
        return element;
    };
    preciseLabel(label, x, y, options.labelSize || 7.5);
    if (unit) preciseLabel(unit, x + (options.unitOffset || 17), y, 6.4);
    preciseLabel(value, x + (options.valueOffset || 3), y + (options.valueRowOffset || 2.0), options.valueSize || 24);
}

function renderLargeBioscanSubjectWidget(widget, frame, stats, phase, subject) {
    const themeClass = `telemetry-${subject.theme || 'cyan'}`;
    diagText('diagVitalsSubject', `${subject.id} ${String(diagnosticVitalsSubjectIndex + 1).padStart(2, '0')}/${DIAGNOSTIC_VITAL_SUBJECTS.length}`);
    const readings = subjectVitalReadings(subject, frame);
    const regions = subjectBodyRegions(subject);
    const profile = subjectSignalProfile(subject, readings);

    drawDashboardGrid(widget, { className: 'telemetry-green', colStep: 4, rowStep: 2 });
    drawSvgGuideRect(widget, 1.1, 1.55, 16.6, 21.25, { className: 'telemetry-green', opacity: 0.18 });
    drawSvgGuideRect(widget, 18.25, 1.55, 50.4, 21.25, { className: 'telemetry-cyan', opacity: 0.14 });
    drawSvgGuideRect(widget, 70.05, 1.55, 24.75, 21.25, { className: 'telemetry-cyan', opacity: 0.18 });
    const readoutX = 70.2;
    drawSvgGuideLine(widget, 17.8, 1.65, 17.8, 22.65, { className: 'telemetry-green', opacity: 0.24 });
    drawSvgGuideLine(widget, readoutX - 0.9, 1.65, readoutX - 0.9, 22.65, { className: 'telemetry-cyan', opacity: 0.34 });
    [4.95, 8.15, 11.45, 14.75, 18.05, 21.35].forEach(row => drawSvgGuideLine(widget, readoutX - 0.9, row, 94.8, row, { className: 'telemetry-cyan', opacity: 0.2 }));

    svgLabel(widget.labelLayer, 'SUBJECT MATRIX', 2.05, 1.25, { className: 'telemetry-amber', fontSize: 6.6 });
    svgLabel(widget.labelLayer, 'LIVE VITAL MONITOR', 18.65, 1.25, { className: 'telemetry-amber', fontSize: 6.6 });
    svgLabel(widget.labelLayer, 'READOUT', 70.3, 1.25, { className: 'telemetry-amber', fontSize: 6.6 });
    renderBodyCardioAsset(widget, subject, frame);

    const severity = subjectSeverity(subject);
    svgLabel(widget.labelLayer, `ICU BUS // ${severity.toUpperCase()} // PERF ${Math.round(Math.min(1, profile.perfusion) * 100)}%`, 35.6, 2.35, { className: themeClass, fontSize: 6.4 });

    const waveStart = 27.1;
    const waveEnd = 68.1;
    const labelCol = 18.65;
    const lowPerfusion = profile.perfusion < 0.56;
    const plethClass = readings.o2 < 88 || profile.perfusion < 0.42
        ? 'telemetry-red'
        : readings.o2 < 94 || profile.perfusion < 0.7
            ? 'telemetry-amber'
            : 'telemetry-cyan';
    const artClass = readings.systolic < 85 || readings.systolic > 160
        ? 'telemetry-red'
        : readings.systolic < 95 || readings.systolic > 145
            ? 'telemetry-amber'
            : 'telemetry-orange';
    const lanes = [
        { label: 'ECG', subLabel: 'II X1', row: 4.65, cls: icuNumericClass('hr', readings.heartRate, subject), type: 'ecg', amp: profile.ecgAmp, cycles: readings.heartRate > 0 ? Math.max(2.2, readings.heartRate / 17.5) : 1, speed: 0.0095, startCol: waveStart, endCol: waveEnd, labelCol, labelOffset: 1.35, strokeWidth: 1.2, irregular: profile.irregular, artifact: profile.artifact * 0.5, baseline: profile.baseline * 0.3 },
        { label: 'RESP', row: 8.0, cls: icuNumericClass('resp', readings.resp, subject), type: 'resp', amp: profile.respAmp, cycles: Math.max(0.8, readings.resp / 4.2), speed: 0.0045, startCol: waveStart, endCol: waveEnd, labelCol, labelOffset: 1.22, strokeWidth: 1.1, artifact: profile.artifact * 0.25, baseline: profile.baseline },
        { label: 'Pleth', row: 11.25, cls: plethClass, type: 'pleth', amp: profile.plethAmp, cycles: readings.heartRate > 0 ? Math.max(2.4, readings.heartRate / 16.2) : 1, speed: 0.008, startCol: waveStart, endCol: waveEnd, labelCol, labelOffset: 1.22, strokeWidth: 1.15, artifact: profile.artifact * 0.32, baseline: profile.baseline * 0.55, lowPerfusion },
        { label: 'CO2', row: 14.45, cls: icuNumericClass('co2', subjectEndTidalCo2(subject, readings), subject), type: 'co2', amp: profile.co2Amp * 0.72, cycles: Math.max(0.75, readings.resp / 5.5), speed: 0.0042, startCol: waveStart, endCol: waveEnd, labelCol, labelOffset: 1.12, strokeWidth: 1.05, artifact: profile.artifact * 0.18, baseline: profile.baseline * 0.2 },
        { label: 'CH1:Art', row: 17.2, cls: artClass, type: 'ibp', amp: profile.artAmp, cycles: readings.heartRate > 0 ? Math.max(2.2, readings.heartRate / 15.4) : 1, speed: 0.0085, startCol: waveStart, endCol: waveEnd, labelCol, labelOffset: 1.08, strokeWidth: 1.05, artifact: profile.artifact * 0.25, baseline: profile.baseline * 0.42, lowPerfusion },
        { label: 'CH2:Cvp', row: 20.55, cls: subject.state === 'dead' ? 'telemetry-red' : 'telemetry-orange', type: 'cvp', amp: profile.cvpAmp, cycles: subject.state === 'dead' ? 1 : 8, speed: 0.007, startCol: waveStart, endCol: waveEnd, labelCol, labelOffset: 1.2, strokeWidth: 1.0, opacity: subject.state === 'dead' ? 0.38 : 0.78, artifact: profile.artifact * 0.22, baseline: profile.baseline * 0.24 }
    ];
    lanes.forEach(lane => {
        drawSvgGuideLine(widget, lane.startCol, lane.row, lane.endCol, lane.row, { className: 'telemetry-dim', opacity: 0.1 });
        drawIcuWaveform(widget, lane, frame, subject);
    });

    const co2 = subjectEndTidalCo2(subject, readings);
    renderIcuReadoutCell(widget, 'ECG', `${readings.heartRate}`, 'bpm', readoutX, 1.9, icuNumericClass('hr', readings.heartRate, subject), { valueSize: 24, valueOffset: 6, valueRowOffset: 1.55, unitOffset: 5 });
    renderIcuReadoutCell(widget, 'RESP', `${readings.resp}`, '', readoutX, 5.2, icuNumericClass('resp', readings.resp, subject), { valueSize: 16, valueOffset: 2.5, valueRowOffset: 1.7 });
    renderIcuReadoutCell(widget, 'TEMP', subject.temp, '', 82.7, 5.2, 'telemetry-amber', { valueSize: 9.5, valueOffset: 0, valueRowOffset: 1.55 });
    renderIcuReadoutCell(widget, 'SpO2', `${readings.o2}`, '%', readoutX, 8.45, icuNumericClass('spo2', readings.o2, subject), { valueSize: 18, valueOffset: 2.5, valueRowOffset: 1.65, unitOffset: 20 });
    renderIcuReadoutCell(widget, 'CO2', `${co2}`, 'mmHg', readoutX, 11.75, icuNumericClass('co2', co2, subject), { valueSize: 17, valueOffset: 2.5, valueRowOffset: 1.6, unitOffset: 16 });
    renderIcuReadoutCell(widget, 'IBP (1,2)', subject.bp, 'mmHg', readoutX, 15.05, artClass, { valueSize: 12.5, valueOffset: 0.5, valueRowOffset: 1.55, unitOffset: 18 });
    renderIcuReadoutCell(widget, 'NIBP', subject.bp, 'mmHg', readoutX, 18.35, icuNumericClass('bp', subject.bp, subject), { valueSize: 12.5, valueOffset: 0.5, valueRowOffset: 1.55, unitOffset: 18 });
    svgLabel(widget.labelLayer, `STATUS ${subject.status}`, readoutX, 22.25, { className: themeClass, fontSize: 6.1 });
    svgLabel(widget.labelLayer, `${subject.state.toUpperCase()} // CNS ${readings.coher}% // STR ${readings.stress}%`, 18.65, 22.25, { className: themeClass, fontSize: 6.1 });
    svgLabel(widget.labelLayer, `${subjectBodySummary(regions)} // BIO ${String(stats.lifeCount).padStart(2, '0')}`, 2.05, 22.75, { className: themeClass, fontSize: 5.7 });
}

function clearSvgLayer(layer) {
    if (layer) layer.replaceChildren();
}

function gridPoint(col, row, cellWidth = GLYPH_CELL_WIDTH, cellHeight = GLYPH_CELL_HEIGHT) {
    return {
        x: Math.round(col) * cellWidth + cellWidth / 2,
        y: Math.round(row) * cellHeight + cellHeight / 2
    };
}

function createSvgWidget(containerOrId, options = {}) {
    const container = typeof containerOrId === 'string' ? getById(containerOrId) : containerOrId;
    if (!container) return null;

    const cols = Math.max(1, Math.round(options.cols || 32));
    const rows = Math.max(1, Math.round(options.rows || 10));
    const cellWidth = Math.max(1, Number(options.cellWidth || GLYPH_CELL_WIDTH));
    const cellHeight = Math.max(1, Number(options.cellHeight || GLYPH_CELL_HEIGHT));
    const preserveAspectRatio = options.preserveAspectRatio || 'none';
    const fontScale = Math.max(0.1, Number(options.fontScale || 1));
    const width = cols * cellWidth;
    const height = rows * cellHeight;
    const widgetKey = `${cols}x${rows}:${cellWidth}x${cellHeight}:${preserveAspectRatio}:${fontScale}:${options.kind || 'glyph'}`;

    let svg = container.firstElementChild?.classList?.contains('telemetry-svg')
        ? container.firstElementChild
        : null;
    if (!svg || svg.dataset.widgetKey !== widgetKey) {
        container.textContent = '';
        svg = svgElement('svg', {
            class: `telemetry-svg ${options.className || ''}`.trim(),
            viewBox: `0 0 ${width} ${height}`,
            preserveAspectRatio,
            'aria-hidden': 'true',
            focusable: 'false',
            'data-widget-key': widgetKey
        });
        const guide = svgElement('g', { 'data-layer': 'guide' });
        const glyph = svgElement('g', { 'data-layer': 'glyph' });
        const label = svgElement('g', { 'data-layer': 'label' });
        [guide, glyph, label].forEach(layer => {
            layer.dataset.cellWidth = String(cellWidth);
            layer.dataset.cellHeight = String(cellHeight);
            layer.dataset.fontScale = String(fontScale);
        });
        svg.append(guide, glyph, label);
        container.appendChild(svg);
    } else {
        svg.setAttribute('class', `telemetry-svg ${options.className || ''}`.trim());
        svg.setAttribute('preserveAspectRatio', preserveAspectRatio);
        svg.querySelectorAll('[data-layer]').forEach(layer => {
            layer.dataset.cellWidth = String(cellWidth);
            layer.dataset.cellHeight = String(cellHeight);
            layer.dataset.fontScale = String(fontScale);
        });
    }

    const guideLayer = svg.querySelector('[data-layer="guide"]');
    const glyphLayer = svg.querySelector('[data-layer="glyph"]');
    const labelLayer = svg.querySelector('[data-layer="label"]');
    return { container, svg, guideLayer, glyphLayer, labelLayer, cols, rows, cellWidth, cellHeight, width, height, fontScale };
}

function svgTextGlyph(layer, glyph, col, row, options = {}) {
    if (!layer || glyph === undefined || glyph === null) return null;
    const cellWidth = Number(options.cellWidth || layer.dataset.cellWidth || GLYPH_CELL_WIDTH);
    const cellHeight = Number(options.cellHeight || layer.dataset.cellHeight || GLYPH_CELL_HEIGHT);
    const point = gridPoint(col, row, cellWidth, cellHeight);
    const text = svgElement('text', {
        x: point.x,
        y: point.y,
        class: `telemetry-glyph ${options.className || 'telemetry-green'}`.trim(),
        opacity: options.opacity ?? 1
    });
    if (options.fontSize) {
        const fontScale = Number(options.fontScale || layer.dataset.fontScale || 1);
        text.setAttribute('font-size', Number(options.fontSize) * fontScale);
    }
    text.textContent = String(glyph);
    layer.appendChild(text);
    return text;
}

function svgLabel(layer, text, col, row, options = {}) {
    if (!layer || text === undefined || text === null) return null;
    const cellWidth = Number(options.cellWidth || layer.dataset.cellWidth || GLYPH_CELL_WIDTH);
    const cellHeight = Number(options.cellHeight || layer.dataset.cellHeight || GLYPH_CELL_HEIGHT);
    const point = gridPoint(col, row, cellWidth, cellHeight);
    const label = svgElement('text', {
        x: point.x,
        y: point.y,
        class: `telemetry-label ${options.className || 'telemetry-dim'}`.trim(),
        opacity: options.opacity ?? 1
    });
    if (options.anchor) label.setAttribute('text-anchor', options.anchor);
    if (options.fontSize) {
        const fontScale = Number(options.fontScale || layer.dataset.fontScale || 1);
        label.setAttribute('font-size', Number(options.fontSize) * fontScale);
    }
    label.textContent = String(text);
    layer.appendChild(label);
    return label;
}

function renderGlyphRow(layer, row, glyphs, options = {}) {
    String(glyphs || '').split('').forEach((glyph, index) => {
        svgTextGlyph(layer, glyph, (options.col || 0) + index, row, options);
    });
}

function renderGlyphMatrix(layer, matrix, options = {}) {
    (matrix || []).forEach((rowGlyphs, rowIndex) => {
        renderGlyphRow(layer, (options.row || 0) + rowIndex, rowGlyphs, options);
    });
}

function drawSvgGuideLine(widget, col1, row1, col2, row2, options = {}) {
    const start = gridPoint(col1, row1, widget.cellWidth, widget.cellHeight);
    const end = gridPoint(col2, row2, widget.cellWidth, widget.cellHeight);
    widget.guideLayer.appendChild(svgElement('line', {
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        class: `telemetry-guide ${options.className || 'telemetry-dim'}`.trim(),
        opacity: options.opacity ?? 0.16
    }));
}

function drawSvgGuideRect(widget, col, row, cols, rows, options = {}) {
    widget.guideLayer.appendChild(svgElement('rect', {
        x: col * widget.cellWidth,
        y: row * widget.cellHeight,
        width: cols * widget.cellWidth,
        height: rows * widget.cellHeight,
        class: `telemetry-guide ${options.className || 'telemetry-dim'}`.trim(),
        opacity: options.opacity ?? 0.16
    }));
}

function drawSvgGuideCircle(widget, col, row, radiusCols, options = {}) {
    const point = gridPoint(col, row, widget.cellWidth, widget.cellHeight);
    widget.guideLayer.appendChild(svgElement('circle', {
        cx: point.x,
        cy: point.y,
        r: radiusCols * widget.cellWidth,
        class: `telemetry-guide ${options.className || 'telemetry-dim'}`.trim(),
        opacity: options.opacity ?? 0.16
    }));
}

function svgPolyline(layer, points, options = {}) {
    if (!layer || !points?.length) return null;
    const polyline = svgElement('polyline', {
        points: points.map(point => `${Number(point.x).toFixed(1)},${Number(point.y).toFixed(1)}`).join(' '),
        class: `telemetry-trace ${options.className || 'telemetry-green'}`.trim(),
        opacity: options.opacity ?? 0.86
    });
    if (options.strokeWidth) polyline.setAttribute('stroke-width', options.strokeWidth);
    layer.appendChild(polyline);
    return polyline;
}

function svgPath(layer, d, options = {}) {
    if (!layer || !d) return null;
    const path = svgElement('path', {
        d,
        class: `telemetry-trace ${options.className || 'telemetry-green'}`.trim(),
        opacity: options.opacity ?? 0.86
    });
    if (options.strokeWidth) path.setAttribute('stroke-width', options.strokeWidth);
    layer.appendChild(path);
    return path;
}

function svgLayerLine(layer, x1, y1, x2, y2, options = {}) {
    if (!layer) return null;
    const line = svgElement('line', {
        x1,
        y1,
        x2,
        y2,
        class: `telemetry-trace ${options.className || 'telemetry-green'}`.trim(),
        opacity: options.opacity ?? 0.74
    });
    if (options.strokeWidth) line.setAttribute('stroke-width', options.strokeWidth);
    layer.appendChild(line);
    return line;
}

function svgLayerRect(layer, x, y, width, height, options = {}) {
    if (!layer) return null;
    const rect = svgElement('rect', {
        x,
        y,
        width,
        height,
        class: options.className || 'telemetry-fill telemetry-green',
        opacity: options.opacity ?? 0.12
    });
    layer.appendChild(rect);
    return rect;
}

function blockGlyph(value) {
    const index = Math.max(0, Math.min(BLOCK_GLYPHS.length - 1, Math.round(value * (BLOCK_GLYPHS.length - 1))));
    return BLOCK_GLYPHS[index];
}

function densityGlyph(value) {
    const index = Math.max(0, Math.min(DENSITY_GLYPHS.length - 1, Math.floor(value * DENSITY_GLYPHS.length)));
    return DENSITY_GLYPHS[index];
}

function shortTelemetryLine(value, width) {
    return String(value || '').replace(/\s+/g, ' ').slice(0, width).padEnd(width, ' ');
}

function fixedTelemetryLine(value, width) {
    return String(value || '').replace(/\t/g, ' ').slice(0, width).padEnd(width, ' ');
}

function glyphProgressBar(value, width = 10) {
    const safeValue = Math.max(0, Math.min(100, Math.round(value)));
    const filled = Math.round((safeValue / 100) * width);
    return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
}

function shiftedGlyphPattern(pattern, frame, width, step = 1) {
    const glyphs = Array.from(pattern || '');
    if (!glyphs.length) return ''.padEnd(width, ' ');
    let output = '';
    for (let i = 0; i < width; i++) output += glyphs[(frame * step + i) % glyphs.length];
    return output;
}

function renderFixedGlyphLine(layer, row, text, options = {}) {
    renderGlyphRow(layer, row, fixedTelemetryLine(text, options.width || 40), {
        col: options.col || 1,
        className: options.className || 'telemetry-green',
        opacity: options.opacity ?? 0.84,
        fontSize: options.fontSize
    });
}

function renderWidgetFrame(widget, options = {}) {
    clearSvgLayer(widget.guideLayer);
    clearSvgLayer(widget.glyphLayer);
    clearSvgLayer(widget.labelLayer);
    drawSvgGuideRect(widget, 0, 0, widget.cols, widget.rows, { opacity: 0.2, className: options.className || 'telemetry-green' });
}

// Unified hexdump-style boot loader used by every diagnostic widget.
// Per-widget pacing comes from the sequence stagger in diagnosticWidgetBootStage,
// so each panel reaches "ready" at a slightly different time and they come online
// one after another rather than all at once.
function measureHexdumpBootLayout(id, isFeature) {
    const container = getById(id);
    const rect = container?.getBoundingClientRect?.();
    const width = Math.max(180, rect?.width || container?.clientWidth || (isFeature ? 640 : 360));
    const height = Math.max(92, rect?.height || container?.clientHeight || (isFeature ? 300 : 130));
    const area = width * height;
    const scale = Math.sqrt(area / (isFeature ? 190000 : 64000));
    const fontSize = Number(clampDiagnostic(scale * 8.9, width < 300 ? 7.4 : 8.2, isFeature ? 11.4 : 10.2).toFixed(2));
    const cellWidth = Number((fontSize * 0.72).toFixed(2));
    const cellHeight = Number((fontSize * 1.34).toFixed(2));
    const cols = Math.round(clampDiagnostic(Math.floor(width / cellWidth), isFeature ? 58 : 34, isFeature ? 108 : 66));
    const rows = Math.round(clampDiagnostic(Math.floor(height / cellHeight), 7, isFeature ? 24 : 13));
    const offsetWidth = cols >= 64 ? 6 : 4;
    const maxBytesForLine = Math.floor((cols - 2 - offsetWidth - 3) / 4);
    const bytesPerRow = Math.max(4, Math.min(isFeature ? 18 : 13, maxBytesForLine));

    return {
        cols,
        rows,
        bytesPerRow,
        offsetWidth,
        fontSize,
        cellWidth,
        cellHeight
    };
}

function renderHexdumpBootWidget(id, label, frame, progress) {
    const isFeature = id === 'diagAlarm';
    const layout = measureHexdumpBootLayout(id, isFeature);
    const { cols, rows, bytesPerRow, offsetWidth, fontSize, cellWidth, cellHeight } = layout;
    const dataRows = rows - 3; // 1 header row + 2 footer rows (blank + progress bar)
    const widget = createSvgWidget(id, {
        cols,
        rows,
        cellWidth,
        cellHeight,
        kind: 'diag-boot-hexdump',
        preserveAspectRatio: 'xMidYMid meet'
    });
    if (!widget) return;
    renderWidgetFrame(widget, { className: 'telemetry-amber' });

    const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));
    const labelText = String(label || 'SENSOR BUS').toUpperCase();

    // Header row: "LOADING <LABEL>" left, percentage right.
    const headerLabel = `LOADING ${labelText}`.slice(0, cols - 6);
    svgLabel(widget.labelLayer, headerLabel, 1, 1, { className: 'telemetry-amber', fontSize });
    svgLabel(widget.labelLayer, `${String(safeProgress).padStart(2, '0')}%`, cols - 2, 1, {
        className: 'telemetry-cyan',
        fontSize,
        anchor: 'end'
    });

    // Derive the byte stream from the widget label so each panel dumps recognizable
    // ASCII text. Pad with a deterministic per-widget filler so reveals look organic.
    const filler = ` // ARES SENSOR BUS HANDSHAKE / TELEMETRY ACQUIRE / GRID LOCK / `;
    const source = `${labelText}${filler}`;
    const totalBytes = bytesPerRow * dataRows;
    const bytes = new Array(totalBytes);
    for (let i = 0; i < totalBytes; i++) {
        bytes[i] = source.charCodeAt(i % source.length) & 0xFF;
    }

    // Animate the fill cursor — bytes before it show real hex/ASCII, after it stay as ░.
    // Tiny per-frame drift makes the just-revealed row feel alive without obscuring text.
    const fillCursor = Math.max(0, Math.min(totalBytes, Math.round((safeProgress / 100) * totalBytes)));
    const cursorRow = Math.floor(fillCursor / bytesPerRow);

    for (let row = 0; row < dataRows; row++) {
        const rowStart = row * bytesPerRow;
        const offset = rowStart.toString(16).toUpperCase().padStart(offsetWidth, '0');
        const hexParts = [];
        const asciiParts = [];
        for (let i = 0; i < bytesPerRow; i++) {
            const byteIndex = rowStart + i;
            if (byteIndex < fillCursor) {
                const drift = byteIndex === fillCursor - 1 ? (frame & 0x0F) : 0;
                const b = (bytes[byteIndex] + drift) & 0xFF;
                hexParts.push(b.toString(16).toUpperCase().padStart(2, '0'));
                asciiParts.push(b >= 0x20 && b <= 0x7E ? String.fromCharCode(b) : '.');
            } else {
                hexParts.push('░░');
                asciiParts.push('░');
            }
        }
        const line = `${offset}  ${hexParts.join(' ')}  ${asciiParts.join('')}`;
        let cls;
        if (row < cursorRow) cls = 'telemetry-green';
        else if (row === cursorRow) cls = 'telemetry-cyan';
        else cls = 'telemetry-dim';
        renderFixedGlyphLine(widget.glyphLayer, row + 2, line, {
            col: 1,
            width: cols - 2,
            className: cls,
            opacity: row > cursorRow ? 0.45 : 0.92,
            fontSize
        });
    }

    // Footer progress bar — wide and obvious, identical style across every widget.
    const barWidth = Math.max(12, cols - 14);
    renderFixedGlyphLine(widget.glyphLayer, rows - 1, `LOAD ${glyphProgressBar(safeProgress, barWidth)} ${String(safeProgress).padStart(2, '0')}%`, {
        col: 1,
        width: cols - 2,
        className: 'telemetry-amber',
        fontSize
    });
}

function renderDiagnosticBootWidget(id, label, frame, progressOverride) {
    const progress = Number.isFinite(progressOverride)
        ? Math.max(8, Math.min(99, Math.round(progressOverride)))
        : Math.max(8, Math.min(99, Math.round(12 + frame * 7.4)));
    renderHexdumpBootWidget(id, label, frame, progress);
}

function renderOscilloscopeWidget(id, frame, generatorValue) {
    const widget = createSvgWidget(id, { cols: 42, rows: 10, kind: 'oscilloscope' });
    if (!widget) return;
    renderWidgetFrame(widget, { className: 'telemetry-amber' });
    for (let col = 4; col < widget.cols; col += 4) drawSvgGuideLine(widget, col, 1, col, 8, { opacity: 0.09, className: 'telemetry-green' });
    for (let row = 2; row < 9; row += 2) drawSvgGuideLine(widget, 1, row, 40, row, { opacity: 0.1, className: 'telemetry-green' });
    drawSvgGuideLine(widget, 1, 5, 40, 5, { opacity: 0.2, className: 'telemetry-amber' });
    svgLabel(widget.labelLayer, 'TRACE A', 1, 1, { className: 'telemetry-green' });
    svgLabel(widget.labelLayer, 'TRACE B', 12, 1, { className: 'telemetry-cyan' });
    svgLabel(widget.labelLayer, `SYNC ${statusGet('diagnostic.generator.core', 'LOCKED').toUpperCase().slice(0, 10)}`, 24, 1, { className: 'telemetry-amber' });
    svgLabel(widget.labelLayer, `RATE ${statusGet('diagnostic.generator.sample_rate', '44.1K')}`, 31, 9, { className: 'telemetry-dim' });

    const load = Math.max(0, Math.min(1, generatorValue / 100));
    for (let col = 2; col < 40; col++) {
        const t = frame * 0.23 + col * 0.34;
        const a = 0.5 + Math.sin(t) * 0.28 + Math.sin(t * 0.43) * 0.1;
        const b = 0.5 + Math.cos(t * 0.74 + load * 2) * 0.22 + Math.sin(t * 0.18) * 0.12;
        const rowA = Math.max(2, Math.min(8, Math.round(8 - a * 6)));
        const rowB = Math.max(2, Math.min(8, Math.round(8 - b * 6)));
        svgTextGlyph(widget.glyphLayer, blockGlyph(a), col, rowA, { className: 'telemetry-green' });
        svgTextGlyph(widget.glyphLayer, rowA === rowB ? '█' : blockGlyph(b), col, rowB, { className: rowA === rowB ? 'telemetry-amber' : 'telemetry-cyan', opacity: rowA === rowB ? 0.95 : 0.86 });
    }
}

function renderRadarWidget(id, frame) {
    const widget = createSvgWidget(id, { cols: 34, rows: 11, kind: 'radar' });
    if (!widget) return;
    renderWidgetFrame(widget, { className: 'telemetry-cyan' });
    const centerCol = 17;
    const centerRow = 5;
    [2, 4, 6, 8].forEach(radius => drawSvgGuideCircle(widget, centerCol, centerRow, radius, { opacity: 0.12, className: 'telemetry-cyan' }));
    drawSvgGuideLine(widget, centerCol, 0, centerCol, 10, { opacity: 0.14, className: 'telemetry-cyan' });
    drawSvgGuideLine(widget, 4, centerRow, 30, centerRow, { opacity: 0.14, className: 'telemetry-cyan' });
    svgLabel(widget.labelLayer, '000', 16, 0, { className: 'telemetry-dim' });
    svgLabel(widget.labelLayer, '180', 16, 10, { className: 'telemetry-dim' });
    svgLabel(widget.labelLayer, 'RELAYS', 1, 1, { className: 'telemetry-amber' });

    const angle = prefersReducedMotion ? -0.6 : frame * 0.16;
    const sweepGlyphs = '·:+*#';
    for (let step = 1; step <= 9; step++) {
        const col = centerCol + Math.round(Math.cos(angle) * step * 1.25);
        const row = centerRow + Math.round(Math.sin(angle) * step * 0.55);
        if (col > 1 && col < widget.cols - 1 && row > 0 && row < widget.rows) {
            svgTextGlyph(widget.glyphLayer, sweepGlyphs[Math.min(sweepGlyphs.length - 1, Math.floor(step / 2))], col, row, { className: 'telemetry-green', opacity: 0.45 + step * 0.05 });
        }
    }

    [
        { glyph: '△', angle: -0.8, radius: 7.5, cls: 'telemetry-amber' },
        { glyph: '□', angle: 0.45, radius: 5.6, cls: 'telemetry-green' },
        { glyph: '◇', angle: 1.9, radius: 6.9, cls: 'telemetry-red' },
        { glyph: '○', angle: 2.9, radius: 4.8, cls: 'telemetry-cyan' }
    ].forEach((contact, index) => {
        const pulse = prefersReducedMotion ? 0 : Math.sin(frame * 0.12 + index) * 0.6;
        const col = centerCol + Math.round(Math.cos(contact.angle + pulse * 0.03) * contact.radius * 1.2);
        const row = centerRow + Math.round(Math.sin(contact.angle + pulse * 0.03) * contact.radius * 0.55);
        svgTextGlyph(widget.glyphLayer, contact.glyph, col, row, { className: contact.cls, opacity: contact.cls === 'telemetry-red' && frame % 8 < 4 ? 0.55 : 1 });
    });
}

function renderHeatmapWidget(id, frame, mainPower, reservePower) {
    const widget = createSvgWidget(id, { cols: 34, rows: 10, kind: 'heatmap' });
    if (!widget) return;
    renderWidgetFrame(widget, { className: 'telemetry-green' });
    svgLabel(widget.labelLayer, 'MAIN BUS', 1, 1, { className: 'telemetry-amber' });
    svgLabel(widget.labelLayer, 'RESERVE', 1, 8, { className: 'telemetry-cyan' });
    for (let row = 2; row <= 7; row++) {
        for (let col = 2; col <= 31; col++) {
            const centerBias = 1 - Math.min(1, Math.abs(col - 17) / 16);
            const powerBias = row < 5 ? mainPower / 100 : reservePower / 100;
            const noise = (Math.sin(frame * 0.17 + col * 0.48 + row * 0.91) + 1) * 0.18;
            const value = Math.max(0, Math.min(1, powerBias * 0.64 + centerBias * 0.24 + noise));
            const cls = value > 0.82 ? 'telemetry-red' : value > 0.62 ? 'telemetry-amber' : 'telemetry-green';
            svgTextGlyph(widget.glyphLayer, densityGlyph(value), col, row, { className: cls, opacity: 0.62 + value * 0.38 });
        }
    }
}

function renderWaterfallWidget(id, frame, networkValue) {
    const widget = createSvgWidget(id, { cols: 40, rows: 10, kind: 'waterfall' });
    if (!widget) return;
    renderWidgetFrame(widget, { className: 'telemetry-cyan' });
    svgLabel(widget.labelLayer, 'SPECTRUM WATERFALL', 1, 1, { className: 'telemetry-amber' });
    for (let row = 2; row < 9; row++) {
        for (let col = 1; col < 39; col++) {
            const band = Math.sin((col + frame * 0.8 - row * 2.4) * 0.34);
            const carrier = Math.sin((col - 20) * 0.18) * 0.24;
            const level = Math.max(0, Math.min(1, networkValue / 120 + band * 0.26 + carrier + Math.sin(row + frame * 0.12) * 0.08));
            const cls = level > 0.82 ? 'telemetry-red' : level > 0.64 ? 'telemetry-amber' : level > 0.42 ? 'telemetry-green' : 'telemetry-dim';
            svgTextGlyph(widget.glyphLayer, densityGlyph(level), col, row, { className: cls, opacity: 0.5 + level * 0.46 });
        }
    }
}

function renderStatusLinesWidget(id, lines, frame, options = {}) {
    const widget = createSvgWidget(id, { cols: options.cols || 40, rows: options.rows || 10, kind: options.kind || 'status-lines' });
    if (!widget) return;
    renderWidgetFrame(widget, { className: options.className || 'telemetry-green' });
    (lines || []).slice(0, widget.rows - 3).forEach((line, index) => {
        renderGlyphRow(widget.glyphLayer, index + 1, shortTelemetryLine(line, widget.cols - 2), {
            col: 1,
            className: index === 0 ? (options.headerClass || 'telemetry-amber') : (options.className || 'telemetry-green'),
            opacity: index === 0 ? 0.96 : 0.78
        });
    });
    const trace = asciiGraph(frame, widget.cols - 6).replace(/[._\-=+#~]/g, char => {
        if (char === '.' || char === '_') return '·';
        if (char === '-' || char === '=') return ':';
        if (char === '~' || char === '+') return '*';
        return '#';
    });
    renderGlyphRow(widget.glyphLayer, widget.rows - 1, trace, { col: 3, className: options.traceClass || 'telemetry-cyan', opacity: 0.82 });
}

function renderBioscanWidget(id, frame, stats = {}) {
    const widget = createSvgWidget(id, { cols: 82, rows: 10, kind: 'bioscan' });
    if (!widget) return;
    renderWidgetFrame(widget, { className: 'telemetry-red' });
    const lifeCount = stats.lifeCount || 0;
    const unstableLife = stats.unstableLife || 0;
    const unknownLife = stats.unknownLife || 0;
    renderGlyphRow(widget.glyphLayer, 1, shortTelemetryLine(`BIO COUNT ${String(lifeCount).padStart(2, '0')} // UNSTABLE ${String(unstableLife).padStart(2, '0')} // UNKNOWN ${String(unknownLife).padStart(2, '0')}`, 34), { col: 1, className: 'telemetry-amber' });
    renderGlyphRow(widget.glyphLayer, 3, shortTelemetryLine(`O2 SAT ${statusGet('diagnostic.life.o2', '91%')}  RESP ${statusGet('diagnostic.life.resp', 'ERRATIC')}`, 34), { col: 1, className: 'telemetry-green' });
    renderGlyphRow(widget.glyphLayer, 5, shortTelemetryLine(`NEURAL ${statusGet('diagnostic.life.neural', 'COHERENCE LOW')}`, 34), { col: 1, className: 'telemetry-cyan' });
    drawSvgGuideLine(widget, 37, 5, 78, 5, { opacity: 0.18, className: 'telemetry-red' });
    for (let col = 38; col < 78; col++) {
        const index = (frame + col) % 17;
        const pattern = index < 3 ? '─' : index < 5 ? '╱' : index < 7 ? '╲' : index < 12 ? '─' : index < 14 ? '╱' : '╲';
        const row = 5 + (pattern === '╱' ? -1 : pattern === '╲' ? 1 : 0);
        svgTextGlyph(widget.glyphLayer, pattern, col, row, { className: row === 5 ? 'telemetry-green' : 'telemetry-red' });
    }
    ['○', '│', '│', '△'].forEach((glyph, index) => svgTextGlyph(widget.glyphLayer, glyph, 72, 2 + index, { className: 'telemetry-cyan', opacity: 0.8 }));
}

function clampDiagnostic(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, value));
}

function smoothDiagnostic(value) {
    const t = clampDiagnostic(value);
    return t * t * (3 - 2 * t);
}

function mixDiagnostic(from, to, amount) {
    return from + (to - from) * clampDiagnostic(amount);
}

function getDiagnosticPhase(frame) {
    const bootFrames = 30;
    const transitionFrames = 56;
    const liveFrame = bootFrames + transitionFrames;
    const effectiveFrame = prefersReducedMotion ? liveFrame : Math.max(0, frame);
    const bootProgress = smoothDiagnostic(effectiveFrame / bootFrames);
    const transitionProgress = smoothDiagnostic((effectiveFrame - bootFrames) / transitionFrames);
    const detail = prefersReducedMotion ? 1 : smoothDiagnostic((effectiveFrame - 4) / (liveFrame - 4));
    const mode = prefersReducedMotion || effectiveFrame >= liveFrame
        ? 'live'
        : effectiveFrame < bootFrames ? 'boot' : 'transition';
    const sensorProgress = Math.round(mode === 'boot'
        ? mixDiagnostic(8, 66, bootProgress)
        : mixDiagnostic(66, 100, transitionProgress));
    return { mode, bootProgress, transitionProgress, detail, sensorProgress };
}

function diagnosticStatusText(liveText, phase, bootText = 'BOOT', transitionText = 'SYNC') {
    if (phase.mode === 'boot') return bootText;
    if (phase.mode === 'transition') return transitionText;
    return liveText;
}

function diagnosticWidgetBootStage(phase, sequenceIndex, sequenceTotal) {
    if (prefersReducedMotion || phase.mode === 'live') {
        return { state: 'live', progress: 100, reveal: 1 };
    }

    const total = Math.max(1, sequenceTotal - 1);
    // Per-widget stagger: each widget has its own boot duration so panels finish
    // their hexdump load and come online sequentially rather than all at once.
    // bootOffset shifts the starting progress; revealStart shifts the come-online window.
    const bootOffset = Math.min(28, sequenceIndex * 3);
    if (phase.mode === 'boot') {
        const progress = mixDiagnostic(2 + bootOffset, 52 + bootOffset * 0.55, phase.bootProgress);
        return {
            state: 'boot',
            progress: Math.round(clampDiagnostic(progress, 2, 82)),
            reveal: 0
        };
    }

    // Sequential come-online during transition: spread starts across 90% of the
    // transition, with each reveal window narrow (0.14) so widgets light up
    // visibly one at a time.
    const start = (sequenceIndex / total) * 0.90;
    const reveal = smoothDiagnostic((phase.transitionProgress - start) / 0.14);
    if (reveal >= 0.98) {
        return { state: 'live', progress: 100, reveal: 1 };
    }

    const progress = mixDiagnostic(62 + sequenceIndex * 2.4, 98, reveal);
    return {
        state: reveal > 0.08 ? 'arming' : 'boot',
        progress: Math.round(clampDiagnostic(progress, 8, 99)),
        reveal
    };
}

function setDiagnosticCardBootStage(cardId, stage) {
    const card = getById(cardId);
    if (!card) return;
    card.classList.toggle('booting', stage === 'boot');
    card.classList.toggle('arming', stage === 'arming');
    card.classList.toggle('online', stage === 'live');
}

function renderSequencedDiagnosticWidget(config) {
    const stage = diagnosticWidgetBootStage(config.phaseInfo, config.sequenceIndex, config.sequenceTotal);
    const isLive = stage.state === 'live';
    setDiagnosticCardBootStage(config.cardId, stage.state);

    if (!isLive) {
        diagCardState(config.cardId, 'ok');
        diagText(config.statusId, stage.state === 'arming' ? (config.armingStatus || 'ONLN') : (config.bootStatus || 'BOOT'));
        renderDiagnosticWidget(
            config.registryKey,
            config.timestamp,
            () => renderDiagnosticBootWidget(
                config.widgetId,
                config.bootLabel || config.registryKey.toUpperCase(),
                config.frame + config.sequenceIndex * 3,
                stage.progress
            ),
            { force: config.forceWidgets, interval: config.bootInterval || 45 }
        );
        return false;
    }

    diagCardState(config.cardId, config.liveCardState || 'ok');
    diagText(config.statusId, config.liveStatus || '');
    renderDiagnosticWidget(config.registryKey, config.timestamp, config.liveRender, {
        force: config.forceWidgets,
        interval: config.liveInterval
    });
    return true;
}

function diagnosticLiveValue(liveValue, bootValue, phase) {
    return mixDiagnostic(bootValue, liveValue, phase.detail);
}

function drawDashboardGrid(widget, options = {}) {
    renderWidgetFrame(widget, { className: options.className || 'telemetry-green' });
    const colStep = options.colStep || 6;
    const rowStep = options.rowStep || 3;
    for (let col = colStep; col < widget.cols; col += colStep) {
        drawSvgGuideLine(widget, col, 1, col, widget.rows - 2, { className: options.className || 'telemetry-green', opacity: 0.06 });
    }
    for (let row = rowStep; row < widget.rows; row += rowStep) {
        drawSvgGuideLine(widget, 1, row, widget.cols - 2, row, { className: options.className || 'telemetry-green', opacity: 0.06 });
    }
}

function drawDiagnosticPhaseScan(widget, phase, label) {
    if (phase.detail >= 0.98) return;
    const scanCol = Math.round(mixDiagnostic(1, widget.cols - 2, phase.sensorProgress / 100));
    drawSvgGuideLine(widget, scanCol, 1, scanCol, widget.rows - 2, {
        className: 'telemetry-amber',
        opacity: 0.28 - phase.detail * 0.12
    });
    renderFixedGlyphLine(widget.glyphLayer, widget.rows - 1, `READING ${label} ${glyphProgressBar(phase.sensorProgress, 10)} ${String(phase.sensorProgress).padStart(3, '0')}%`, {
        col: 1,
        width: widget.cols - 2,
        className: 'telemetry-amber',
        opacity: 0.9 - phase.detail * 0.18
    });
}

const DIAGNOSTIC_WIDGET_REGISTRY = new Map();

function diagnosticRenderProfile() {
    return typeof getEffectiveRenderProfile === 'function'
        ? getEffectiveRenderProfile()
        : {
            name: 'fallback',
            schedulerMs: 120,
            sideTelemetryMs: 180,
            facilityMs: 220,
            radar: { frameMs: 120, sweepTrail: 5, clutterCount: 8, contactLabels: true, glow: false, pulse: true },
            facility: { backgroundRefreshFrames: 180, packetCount: 3, contactCount: 1, readoutEvery: 8, motion: false, pulse: false }
        };
}

function diagnosticFacilityProfile() {
    const profile = diagnosticRenderProfile();
    return {
        backgroundRefreshFrames: 180,
        packetCount: 3,
        contactCount: 1,
        readoutEvery: 8,
        motion: false,
        pulse: false,
        ...(profile.facility || {})
    };
}

function facilityMotionActive(facilityProfile = diagnosticFacilityProfile()) {
    return Boolean(facilityProfile.motion)
        && !prefersReducedMotion
        && !document.hidden
        && AppState.networkOnline
        && !effectsLowActive()
        && !(typeof safeModeActive === 'function' && safeModeActive());
}

function diagnosticWidgetInterval(widgetId, fallbackMs = 160) {
    return typeof getRenderWidgetInterval === 'function'
        ? getRenderWidgetInterval(widgetId, fallbackMs)
        : fallbackMs;
}

function resetDiagnosticWidgetRegistry() {
    DIAGNOSTIC_WIDGET_REGISTRY.clear();
}

function renderDiagnosticWidget(widgetId, timestamp, renderCallback, options = {}) {
    const now = Number.isFinite(timestamp) ? timestamp : performance.now();
    const record = DIAGNOSTIC_WIDGET_REGISTRY.get(widgetId) || { lastRenderAt: 0, renders: 0 };
    const interval = options.interval ?? diagnosticWidgetInterval(widgetId, 160);
    const force = options.force || record.renders === 0 || prefersReducedMotion;
    if (!force && now - record.lastRenderAt < interval) return false;

    renderCallback();
    record.lastRenderAt = now;
    record.renders++;
    DIAGNOSTIC_WIDGET_REGISTRY.set(widgetId, record);
    return true;
}

function setSvgTextElement(text, glyph, col, row, options = {}) {
    if (!text) return;
    const cellWidth = Number(options.cellWidth || text.parentNode?.dataset?.cellWidth || GLYPH_CELL_WIDTH);
    const cellHeight = Number(options.cellHeight || text.parentNode?.dataset?.cellHeight || GLYPH_CELL_HEIGHT);
    const point = gridPoint(col, row, cellWidth, cellHeight);
    text.setAttribute('x', point.x);
    text.setAttribute('y', point.y);
    text.textContent = String(glyph ?? '');
    if (options.className) text.setAttribute('class', `telemetry-glyph ${options.className}`.trim());
    if (options.opacity !== undefined) text.setAttribute('opacity', String(options.opacity));
}

function setSvgLabelElement(label, text, options = {}) {
    if (!label) return;
    label.textContent = String(text ?? '');
    if (options.className) label.setAttribute('class', `telemetry-label ${options.className}`.trim());
    if (options.opacity !== undefined) label.setAttribute('opacity', String(options.opacity));
}

function widgetGridPixel(widget, col, row) {
    return gridPoint(col, row, widget.cellWidth, widget.cellHeight);
}

function widgetContinuousPoint(widget, col, row) {
    return {
        x: col * widget.cellWidth + widget.cellWidth / 2,
        y: row * widget.cellHeight + widget.cellHeight / 2
    };
}

function svgPathFromPoints(layer, points, options = {}) {
    if (!points?.length) return null;
    const fmt = value => Number(value).toFixed(2);
    const smooth = options.smooth !== false && points.length > 2;
    let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
    if (smooth) {
        for (let index = 1; index < points.length - 1; index++) {
            const current = points[index];
            const next = points[index + 1];
            const midX = (current.x + next.x) / 2;
            const midY = (current.y + next.y) / 2;
            d += ` Q ${fmt(current.x)} ${fmt(current.y)} ${fmt(midX)} ${fmt(midY)}`;
        }
        const last = points[points.length - 1];
        d += ` T ${fmt(last.x)} ${fmt(last.y)}`;
    } else {
        for (let index = 1; index < points.length; index++) {
            d += ` L ${fmt(points[index].x)} ${fmt(points[index].y)}`;
        }
    }
    return svgPath(layer, d, options);
}

function ekgWaveValue(position, intensity = 1) {
    const p = ((position % 1) + 1) % 1;
    const gaussian = (center, width, height) => height * Math.exp(-((p - center) ** 2) / (2 * width * width));
    return intensity * (
        gaussian(0.18, 0.035, 0.18) -
        gaussian(0.36, 0.012, 0.36) +
        gaussian(0.395, 0.009, 1.6) -
        gaussian(0.43, 0.014, 0.7) +
        gaussian(0.68, 0.07, 0.34)
    );
}

function ekgLanePoints(widget, row, startCol, endCol, options = {}) {
    const points = [];
    const cols = Math.max(1, endCol - startCol);
    const cycles = options.cycles || 2.4;
    const intensity = options.intensity || 1;
    const drift = options.drift || 0;
    const samples = cols * (options.samplesPerCol || 4);
    for (let i = 0; i <= samples; i++) {
        const progress = i / samples;
        const col = startCol + progress * cols;
        const wavePosition = progress * cycles + drift;
        const baselineNoise = Math.sin(progress * Math.PI * 8 + (options.noisePhase || 0)) * (options.noise || 0.035);
        points.push(widgetGridPixel(widget, col, row - ekgWaveValue(wavePosition, intensity) + baselineNoise));
    }
    return points;
}

function sliceEkgPoints(points, startRatio, endRatio) {
    const start = Math.max(0, Math.floor(points.length * clampDiagnostic(startRatio)));
    const end = Math.max(start + 2, Math.ceil(points.length * clampDiagnostic(endRatio)));
    return points.slice(start, Math.min(points.length, end));
}

function renderEkgRevealSegment(layer, points, startRatio, endRatio, options = {}) {
    if (!points?.length) return;
    const drawSlice = (from, to) => {
        const segment = sliceEkgPoints(points, from, to);
        if (segment.length > 1) svgPolyline(layer, segment, options);
    };
    if (startRatio < 0) {
        drawSlice(1 + startRatio, 1);
        drawSlice(0, endRatio);
        return;
    }
    drawSlice(startRatio, endRatio);
}

function spectrometerLevel(col, row, frame, base = 0.58) {
    const drift = prefersReducedMotion ? 0 : frame * 0.18;
    const band = Math.sin((col * 0.31) + row * 0.72 - drift) * 0.18;
    const lowBand = Math.cos(col * 0.13 - row * 0.44 + drift * 0.37) * 0.14;
    const carrierA = Math.exp(-((col - 16) ** 2) / 8) * (0.38 + Math.sin(frame * 0.06) * 0.16);
    const carrierB = Math.exp(-((col - 31) ** 2) / 12) * (0.28 + Math.cos(frame * 0.045) * 0.15);
    const carrierC = Math.exp(-((col - 45) ** 2) / 6) * (0.36 + Math.sin(frame * 0.08 + row) * 0.14);
    const grain = ((col * 17 + row * 31 + Math.floor(frame / 3) * 13) % 23) / 90;
    return clampDiagnostic(base + band + lowBand + carrierA + carrierB + carrierC + grain - row * 0.018);
}

function renderGateScopeDashboardWidget(id, frame, generatorValue, phase) {
    const widget = createSvgWidget(id, { cols: 58, rows: 14, cellHeight: 10, kind: 'diag-gate-scope' });
    if (!widget) return;
    drawDashboardGrid(widget, { className: 'telemetry-green', colStep: 6, rowStep: 3 });
    svgLabel(widget.labelLayer, 'AMPLITUDE', 1, 2, { className: 'telemetry-dim' });
    svgLabel(widget.labelLayer, 'TRACE A', 48, 4, { className: 'telemetry-green' });
    svgLabel(widget.labelLayer, `${(diagnosticLiveValue(73, 18, phase) + Math.sin(frame * 0.18) * 2).toFixed(1)}mV`, 48, 5, { className: 'telemetry-green' });
    svgLabel(widget.labelLayer, 'TRACE B', 48, 8, { className: 'telemetry-cyan' });
    svgLabel(widget.labelLayer, `${(-11.8 + Math.sin(frame * 0.12) * 1.1).toFixed(1)}mV`, 48, 9, { className: 'telemetry-cyan' });
    svgLabel(widget.labelLayer, `SYNC ${statusGet('diagnostic.generator.core', 'LOCKED').toUpperCase().slice(0, 8)}`, 18, 12, { className: 'telemetry-amber' });
    svgLabel(widget.labelLayer, `RATE ${statusGet('diagnostic.generator.sample_rate', '10.0 kS/s')}`, 37, 12, { className: 'telemetry-dim' });

    const visible = Math.round(mixDiagnostic(10, 42, phase.detail));
    const load = Math.max(0, Math.min(1, generatorValue / 100));
    const traceA = [];
    const traceB = [];
    for (let i = 0; i < visible; i++) {
        const col = 5 + i;
        const t = frame * 0.105 + i * 0.42;
        const valueA = Math.sin(t) * 0.65 + Math.sin(t * 2.4 + load) * 0.22;
        const valueB = Math.cos(t * 0.78 + load * 2) * 0.52 + Math.sin(t * 1.8) * 0.16;
        traceA.push(widgetGridPixel(widget, col, 5.3 - valueA * 2.1));
        traceB.push(widgetGridPixel(widget, col, 9.1 - valueB * 1.7));
        if (phase.detail > 0.72 && i % 5 === 0) {
            svgTextGlyph(widget.glyphLayer, blockGlyph((valueA + 1) / 2), col, Math.round(5.3 - valueA * 2.1), { className: 'telemetry-green', opacity: 0.72 });
        }
    }
    svgPolyline(widget.glyphLayer, traceA, { className: 'telemetry-green telemetry-trace-bold', opacity: 0.62 + phase.detail * 0.3 });
    svgPolyline(widget.glyphLayer, traceB, { className: 'telemetry-cyan', opacity: 0.48 + phase.detail * 0.3 });
    const cursorCol = 5 + (frame % Math.max(1, visible));
    drawSvgGuideLine(widget, cursorCol, 2, cursorCol, 11, { className: 'telemetry-cyan', opacity: 0.12 + phase.detail * 0.12 });
    svgLabel(widget.labelLayer, 'SAMPLE CURSOR', Math.max(2, cursorCol - 5), 13, { className: 'telemetry-dim', opacity: 0.48 + phase.detail * 0.2 });
    drawDiagnosticPhaseScan(widget, phase, 'GATE');
}

function measureLargeBioscanLayout(id) {
    const container = getById(id);
    const rect = container?.getBoundingClientRect?.();
    const width = Math.max(320, rect?.width || container?.clientWidth || 900);
    const height = Math.max(180, rect?.height || container?.clientHeight || 340);
    const cols = 96;
    const rows = 26;
    const cellWidth = GLYPH_CELL_WIDTH;
    const targetRatio = clampDiagnostic(width / height, 2.35, 3.2);
    const cellHeight = Number(clampDiagnostic((cols * cellWidth) / (targetRatio * rows), 9.2, 12.8).toFixed(2));
    const fontScale = Number(clampDiagnostic(height / 330, 1.08, 1.2).toFixed(2));

    return {
        cols,
        rows,
        cellWidth,
        cellHeight,
        fontScale
    };
}

function renderBioscanArrayDashboardWidget(id, frame, stats, phase) {
    const large = id === 'diagAlarm';
    const subject = large ? selectedDiagnosticVitalSubject() : null;
    const largeLayout = large ? measureLargeBioscanLayout(id) : null;
    const widget = createSvgWidget(id, {
        cols: large ? largeLayout.cols : 62,
        rows: large ? largeLayout.rows : 14,
        cellWidth: large ? largeLayout.cellWidth : GLYPH_CELL_WIDTH,
        cellHeight: large ? largeLayout.cellHeight : 10,
        preserveAspectRatio: large ? 'xMidYMid meet' : 'none',
        fontScale: large ? largeLayout.fontScale : 1,
        kind: large ? 'diag-bioscan-expanded-vitals' : 'diag-bioscan-ekg-array'
    });
    if (!widget) return;
    bindDiagnosticVitalsControls();
    clearSvgLayer(widget.guideLayer);
    clearSvgLayer(widget.glyphLayer);
    clearSvgLayer(widget.labelLayer);
    if (large) {
        renderLargeBioscanSubjectWidget(widget, performance.now() / 16.667, stats, phase, subject);
        return;
    }
    drawDashboardGrid(widget, { className: 'telemetry-green', colStep: large ? 6 : 5, rowStep: large ? 3 : 3 });
    const motion = large ? subject.motion : 1;
    const heartRate = large
        ? Math.max(0, Math.round(diagnosticLiveValue(subject.hr + Math.sin(frame * 0.12) * 3 * motion, Math.max(18, subject.hr * 0.38), phase)))
        : Math.round(diagnosticLiveValue(132 + Math.sin(frame * 0.12) * 3, 48, phase));
    const startCol = large ? 24 : 15;
    const endCol = large ? 70 : 50;
    const lanes = large ? [
        { label: 'PULSE', value: `${heartRate} bpm`, row: 4, cls: subject.hr === 0 ? 'telemetry-red' : subject.hr > 120 ? 'telemetry-red' : subject.hr > 95 ? 'telemetry-amber' : 'telemetry-green', speed: 0.031 * motion, cycles: 3.15, amp: subject.hr === 0 ? 0.03 : 1.08 * motion, drift: 0.04, noise: subject.hr === 0 ? 0.001 : 0.018 },
        { label: 'BP SYS/DIA', value: `${subject.bp}`, row: 6, cls: subject.bp === '0/0' ? 'telemetry-red' : subject.bp === '--/--' ? 'telemetry-amber' : 'telemetry-cyan', speed: 0.023 * motion, cycles: 2.25, amp: subject.hr === 0 ? 0.02 : 0.78 * motion, drift: 0.18, noise: 0.018 },
        { label: 'RESP', value: `${Math.max(0, Math.round(subject.resp + Math.sin(frame * 0.055) * 2 * motion))} rpm`, row: 8, cls: subject.resp === 0 ? 'telemetry-red' : subject.resp > 24 || subject.resp < 8 ? 'telemetry-amber' : 'telemetry-cyan', speed: 0.018 * Math.max(0.2, motion), cycles: 1.72, amp: subject.resp === 0 ? 0.02 : 0.72 * motion, drift: 0.22, noise: 0.012 },
        { label: 'O2 SAT', value: `${subject.o2}%`, row: 10, cls: subject.o2 < 85 ? 'telemetry-red' : subject.o2 < 94 ? 'telemetry-amber' : 'telemetry-green', speed: 0.019 * motion, cycles: 2.6, amp: subject.o2 === 0 ? 0.02 : 0.48 * motion, drift: 0.34, noise: 0.016 },
        { label: 'NEURAL', value: `${subject.neural}`, row: 12, cls: subject.coher < 25 ? 'telemetry-red' : subject.coher < 65 ? 'telemetry-amber' : 'telemetry-cyan', speed: 0.024 * motion, cycles: 3.4, amp: subject.coher === 0 ? 0.02 : 0.54 * motion, drift: 0.43, noise: subject.state === 'anomalous' ? 0.09 : 0.032 },
        { label: 'COHER', value: `${Math.round(subject.coher + Math.sin(frame * 0.08) * 4 * motion)}%`, row: 14, cls: subject.coher < 25 ? 'telemetry-red' : subject.coher < 60 ? 'telemetry-amber' : 'telemetry-green', speed: 0.027 * motion, cycles: 2.9, amp: subject.coher === 0 ? 0.01 : 0.62 * motion, drift: 0.61, noise: 0.038 },
        { label: 'STRESS', value: `${Math.round(subject.stress + Math.sin(frame * 0.07) * 4 * motion)}%`, row: 16, cls: subject.stress > 85 ? 'telemetry-red' : subject.stress > 55 ? 'telemetry-amber' : 'telemetry-green', speed: 0.021 * motion, cycles: 2.1, amp: subject.stress === 0 ? 0.02 : 0.68 * motion, drift: 0.61, noise: 0.022 },
        { label: 'CORT/TEMP', value: `${subject.cort} // ${subject.temp}`, row: 18, cls: subject.theme === 'red' ? 'telemetry-red' : subject.theme === 'amber' ? 'telemetry-amber' : 'telemetry-cyan', speed: 0.026 * motion, cycles: 2.4, amp: subject.cort === 0 ? 0.02 : 0.58 * motion, drift: 0.54, noise: 0.026 }
    ] : [
        { label: 'UNIT-01 PULSE', value: `${heartRate} bpm`, row: 3, cls: 'telemetry-green', speed: 0.031, cycles: 2.45, amp: 1.14, drift: 0.04, noise: 0.018 },
        { label: 'UNIT-02 RESP', value: `${Math.round(16 + Math.sin(frame * 0.055) * 2)} rpm`, row: 6, cls: 'telemetry-cyan', speed: 0.018, cycles: 1.72, amp: 0.78, drift: 0.22, noise: 0.012 },
        { label: 'UNIT-03 NEURAL', value: `${statusGet('diagnostic.life.neural_mv', '2.8 mV')}`, row: 9, cls: 'telemetry-amber', speed: 0.024, cycles: 2.9, amp: 0.54, drift: 0.43, noise: 0.032 },
        { label: 'UNIT-04 STRESS', value: `${Math.round(diagnosticLiveValue(74 + Math.sin(frame * 0.07) * 4, 16, phase))}%`, row: 12, cls: 'telemetry-red', speed: 0.021, cycles: 2.1, amp: 0.68, drift: 0.61, noise: 0.022 }
    ];
    if (large) {
        diagText('diagVitalsSubject', `${subject.id} ${String(diagnosticVitalsSubjectIndex + 1).padStart(2, '0')}/${DIAGNOSTIC_VITAL_SUBJECTS.length}`);
        svgLabel(widget.labelLayer, 'SUBJECT MATRIX', 2, 2, { className: 'telemetry-amber' });
        renderBodyCardioAsset(widget, subject, frame);
        const pulseGlyph = ['·', '•', '●', '◆'][Math.floor((frame % 16) / 4)];
        svgTextGlyph(widget.glyphLayer, subject.hr === 0 ? '×' : pulseGlyph, 10, 8.2, { className: subject.hr === 0 ? 'telemetry-red' : 'telemetry-red', opacity: subject.hr === 0 ? 0.72 : 0.66 + Math.sin(frame * 0.28 * motion) * 0.18, fontSize: 12 });
        ['CNS', 'CARD', 'RESP', 'ENDO', 'TRAUMA'].forEach((label, index) => {
            const row = 5 + index * 3;
            const values = [subject.coher, subject.hr === 0 ? 0 : 100 - Math.abs(subject.hr - 72), subject.o2, 100 - subject.cort, subject.stress];
            const level = clampDiagnostic((values[index] || 0) / 100 + Math.sin(frame * 0.045 + index * 1.4) * 0.06 * motion, 0.02, 0.98);
            const meterClass = level < 0.28 || index === 4 && level > 0.72 ? 'telemetry-red' : level < 0.55 ? 'telemetry-amber' : 'telemetry-green';
            svgLabel(widget.labelLayer, label, 76, row, { className: meterClass });
            for (let col = 84; col < 94; col++) {
                const active = (col - 84) / 10 < level;
                svgTextGlyph(widget.glyphLayer, active ? '█' : '░', col, row, {
                    className: active ? meterClass : 'telemetry-dim',
                    opacity: active ? 0.76 : 0.26
                });
            }
        });
    }
    lanes.forEach((lane, laneIndex) => {
        const labelCol = large ? 23 : 2;
        const valueCol = large ? 72 : 52;
        svgLabel(widget.labelLayer, lane.label, labelCol, lane.row - 0.85, { className: lane.cls, fontSize: large ? 7.4 : undefined });
        svgLabel(widget.labelLayer, lane.value, valueCol, lane.row - 0.85, { className: lane.cls, fontSize: large ? 7.4 : undefined });
        drawSvgGuideRect(widget, startCol - 1, lane.row - 0.72, endCol - startCol + 2, 1.42, { className: lane.cls, opacity: 0.045 });
        drawSvgGuideLine(widget, startCol, lane.row, endCol, lane.row, { className: lane.cls, opacity: 0.1 });
        const points = ekgLanePoints(widget, lane.row, startCol, endCol, {
            cycles: lane.cycles,
            intensity: lane.amp,
            drift: lane.drift,
            noise: lane.noise,
            noisePhase: laneIndex * 1.7,
            samplesPerCol: 5
        });
        svgPolyline(widget.glyphLayer, points, { className: `${lane.cls} telemetry-trace-thin telemetry-ekg-trace`, opacity: 0.12 + phase.detail * 0.12 });
        const reveal = prefersReducedMotion ? 0.86 : (frame * lane.speed + laneIndex * 0.18) % 1;
        const tail = mixDiagnostic(0.08, 0.18, phase.detail);
        const active = mixDiagnostic(0.035, 0.065, phase.detail);
        renderEkgRevealSegment(widget.glyphLayer, points, reveal - tail, reveal, {
            className: `${lane.cls} telemetry-ekg-trace`,
            opacity: 0.28 + phase.detail * 0.24
        });
        renderEkgRevealSegment(widget.glyphLayer, points, reveal - active, reveal, {
            className: `${lane.cls} telemetry-trace-bold telemetry-ekg-trace`,
            opacity: 0.7 + phase.detail * 0.24
        });
        const cursorCol = startCol + reveal * (endCol - startCol);
        drawSvgGuideLine(widget, cursorCol, lane.row - 0.82, cursorCol, lane.row + 0.82, { className: lane.cls, opacity: 0.18 + phase.detail * 0.12 });
        svgTextGlyph(widget.glyphLayer, '▌', Math.round(cursorCol), lane.row, { className: lane.cls, opacity: 0.52 + phase.detail * 0.28 });
    });
    const footerRow = large ? 22.5 : 13;
    svgLabel(widget.labelLayer, `BIO ${String(stats.lifeCount).padStart(2, '0')} // UNSTABLE ${String(stats.unstableLife).padStart(2, '0')} // UNKNOWN ${String(stats.unknownLife).padStart(2, '0')}`, 2, footerRow, { className: 'telemetry-amber' });
    if (large) {
        svgLabel(widget.labelLayer, `NEURAL ${statusGet('diagnostic.life.neural', 'COHERENCE LOW')}`, 42, 22.5, { className: 'telemetry-cyan' });
        svgLabel(widget.labelLayer, `TRIAGE ${stats.unknownLife > 0 ? 'OPEN' : 'CLEAR'}`, 78, 22.5, { className: stats.unknownLife > 0 ? 'telemetry-red' : 'telemetry-green' });
    }
    if (phase.detail < 0.98) {
        const scanCol = Math.round(mixDiagnostic(startCol, endCol, phase.sensorProgress / 100));
        drawSvgGuideLine(widget, scanCol, 1.4, scanCol, large ? 21.5 : 12.5, { className: 'telemetry-amber', opacity: 0.2 });
        svgLabel(widget.labelLayer, `ACQ ${String(phase.sensorProgress).padStart(3, '0')}%`, large ? 84 : 52, footerRow, { className: 'telemetry-amber' });
    }
}

function renderShareholderValueDashboardWidget(id, frame, phase) {
    const widget = createSvgWidget(id, { cols: 63, rows: 15, cellHeight: 10, kind: 'diag-shareholder-value-chart' });
    if (!widget) return;
    clearSvgLayer(widget.guideLayer);
    clearSvgLayer(widget.glyphLayer);
    clearSvgLayer(widget.labelLayer);
    drawDashboardGrid(widget, { className: 'telemetry-cyan', colStep: 5, rowStep: 2 });
    svgLabel(widget.labelLayer, 'SHAREHOLDER VALUE // PROJECTION TAPE', 2, 1.7, { className: 'telemetry-amber' });

    const chartLeft = 3;
    const chartRight = 43;
    const readoutX = 45.5;
    drawSvgGuideLine(widget, readoutX - 1, 2, readoutX - 1, 12.8, { className: 'telemetry-cyan', opacity: 0.24 });
    [4.6, 7.2, 9.8, 12.4].forEach(row => drawSvgGuideLine(widget, readoutX - 1, row, 60.5, row, { className: 'telemetry-cyan', opacity: 0.18 }));

    const schedulerMs = diagnosticRenderProfile().schedulerMs || 120;
    const loopFrames = Math.max(1, Math.round(30000 / schedulerMs));
    const loop = prefersReducedMotion ? 0.62 : (frame % loopFrames) / loopFrames;
    const angle = loop * Math.PI * 2;

    const toPoint = (col, row) => widgetContinuousPoint(widget, col, row);
    const candleRect = (cls, x, y, width, height, opacity) => {
        widget.glyphLayer.appendChild(svgElement('rect', {
            x,
            y,
            width,
            height,
            fill: 'currentColor',
            stroke: 'currentColor',
            'stroke-width': 0.7,
            class: cls,
            opacity
        }));
    };
    const drawCandles = (label, topRow, bottomRow, trend, labelClass, upClass, downClass) => {
        const count = 26;
        svgLabel(widget.labelLayer, label, chartLeft, topRow - 0.25, { className: labelClass, fontSize: 6.8 });
        drawSvgGuideLine(widget, chartLeft, bottomRow, chartRight, bottomRow, { className: 'telemetry-dim', opacity: 0.12 });
        drawSvgGuideLine(widget, chartLeft, topRow, chartRight, topRow, { className: 'telemetry-dim', opacity: 0.08 });
        for (let index = 0; index < count; index++) {
            const t = index / (count - 1);
            const noiseA = Math.sin(angle + index * 1.731) * 0.026 + Math.sin(angle * 0.37 + index * 0.59) * 0.018;
            const noiseB = Math.cos(angle * 0.83 + index * 1.17) * 0.024;
            const base = trend === 'up' ? 0.18 + t * 0.68 : 0.82 - t * 0.64;
            const open = clampDiagnostic(base + noiseA, 0.04, 0.96);
            const closeBias = trend === 'up' ? 0.032 + t * 0.022 : -0.038 - t * 0.018;
            const close = clampDiagnostic(base + closeBias + noiseB, 0.04, 0.96);
            const high = clampDiagnostic(Math.max(open, close) + 0.07 + Math.sin(angle + index) * 0.012, 0.06, 0.99);
            const low = clampDiagnostic(Math.min(open, close) - 0.07 + Math.cos(angle * 0.7 + index) * 0.012, 0.01, 0.94);
            const col = mixDiagnostic(chartLeft + 1.2, chartRight - 1.2, t);
            const x = toPoint(col, 0).x;
            const highY = toPoint(0, mixDiagnostic(bottomRow, topRow, high)).y;
            const lowY = toPoint(0, mixDiagnostic(bottomRow, topRow, low)).y;
            const openY = toPoint(0, mixDiagnostic(bottomRow, topRow, open)).y;
            const closeY = toPoint(0, mixDiagnostic(bottomRow, topRow, close)).y;
            const cls = close >= open ? upClass : downClass;
            const opacity = 0.55 + Math.sin(angle + index * 0.43) * 0.05;
            svgLayerLine(widget.glyphLayer, x, highY, x, lowY, { className: `${cls} telemetry-monitor-trace`, opacity: opacity + 0.12, strokeWidth: 0.85 });
            candleRect(cls, x - widget.cellWidth * 0.24, Math.min(openY, closeY), widget.cellWidth * 0.48, Math.max(2, Math.abs(closeY - openY)), opacity);
        }
    };

    drawCandles('OPEX / CAPEX', 3.05, 6.6, 'up', 'telemetry-red', 'telemetry-red', 'telemetry-amber');
    drawCandles('PROFIT / VALUE', 7.65, 12.15, 'down', 'telemetry-green', 'telemetry-green', 'telemetry-red');

    const cursorCol = mixDiagnostic(chartLeft, chartRight, loop);
    drawSvgGuideLine(widget, cursorCol, 2.2, cursorCol, 12.4, { className: 'telemetry-cyan', opacity: 0.16 });
    svgLabel(widget.labelLayer, `T+${String(Math.floor(loop * 30)).padStart(2, '0')}s`, Math.max(chartLeft, cursorCol - 2), 13, { className: 'telemetry-dim', fontSize: 6.2 });

    const opex = Math.round(122 + Math.sin(angle) * 2);
    const profit = Math.round(18 + Math.cos(angle * 0.75) * 2);
    const value = (70.4 + Math.sin(angle + 0.7) * 1.4).toFixed(1);
    renderIcuReadoutCell(widget, 'OPEX', `+${opex}%`, 'RUN', 45.8, 2.2, 'telemetry-red', { valueSize: 14, valueOffset: 1, valueRowOffset: 1.55, unitOffset: 11 });
    renderIcuReadoutCell(widget, 'PROFIT', `-${profit}%`, 'NET', 45.8, 4.9, 'telemetry-red', { valueSize: 16, valueOffset: 1, valueRowOffset: 1.65, unitOffset: 13 });
    renderIcuReadoutCell(widget, 'VALUE', value, 'IDX', 45.8, 7.6, 'telemetry-amber', { valueSize: 16, valueOffset: 1, valueRowOffset: 1.65, unitOffset: 12 });
    renderIcuReadoutCell(widget, 'RUNWAY', `${Math.round(4 + Math.sin(angle * 0.8))}Q`, 'RESV', 45.8, 10.3, 'telemetry-amber', { valueSize: 13, valueOffset: 1, valueRowOffset: 1.55, unitOffset: 13 });
    svgLabel(widget.labelLayer, '30s PERFECT LOOP // CANDLE NORMALIZED', 16, 13, { className: 'telemetry-dim', fontSize: 6.4 });
    drawDiagnosticPhaseScan(widget, phase, 'ROI');
}

function renderTacticalRadarDashboardWidget(id, frame, phase) {
    const widget = createSvgWidget(id, { cols: 60, rows: 20, cellHeight: 9, kind: 'diag-tactical-radar-safe' });
    if (!widget) return;
    const profile = diagnosticRenderProfile();
    const radarProfile = profile.radar || {};
    const centerCol = 25;
    const centerRow = 8;
    const staticKey = [
        'radar-v2',
        radarProfile.sweepTrail ?? 5,
        radarProfile.clutterCount ?? 8,
        radarProfile.contactLabels ? 'labels' : 'nolabels',
        radarProfile.glow ? 'glow' : 'noglow'
    ].join(':');
    if (widget.svg.dataset.radarStaticKey !== staticKey) {
        widget.svg.dataset.radarStaticKey = staticKey;
        clearSvgLayer(widget.guideLayer);
        clearSvgLayer(widget.glyphLayer);
        clearSvgLayer(widget.labelLayer);
        drawSvgGuideRect(widget, 0, 0, widget.cols, widget.rows, { opacity: 0.2, className: 'telemetry-cyan' });
        for (let col = 8; col < widget.cols; col += 8) {
            drawSvgGuideLine(widget, col, 1, col, widget.rows - 2, { className: 'telemetry-cyan', opacity: 0.045 });
        }
        for (let row = 4; row < widget.rows; row += 4) {
            drawSvgGuideLine(widget, 1, row, widget.cols - 2, row, { className: 'telemetry-cyan', opacity: 0.045 });
        }
        [2, 3.5, 5, 6.5].forEach(radius => drawSvgGuideCircle(widget, centerCol, centerRow, radius, { opacity: 0.08 + phase.detail * 0.04, className: 'telemetry-green' }));
        drawSvgGuideLine(widget, centerCol, 2, centerCol, 14, { opacity: 0.13, className: 'telemetry-green' });
        drawSvgGuideLine(widget, 8, centerRow, 43, centerRow, { opacity: 0.13, className: 'telemetry-green' });
        svgLabel(widget.labelLayer, '0', centerCol, 2, { className: 'telemetry-dim', anchor: 'middle' });
        svgLabel(widget.labelLayer, '90', 44, centerRow, { className: 'telemetry-dim' });
        svgLabel(widget.labelLayer, '180', centerCol, 14, { className: 'telemetry-dim', anchor: 'middle' });
        svgLabel(widget.labelLayer, '270', 6, centerRow, { className: 'telemetry-dim' });
        svgLabel(widget.labelLayer, 'CONTACTS', 48, 2, { className: 'telemetry-amber' });
        svgLabel(widget.labelLayer, '', 48, 12, { className: 'telemetry-green' })?.setAttribute('data-radar-clutter-label', 'true');

        const sweepGroup = svgElement('g', { 'data-radar-sweep': 'true' });
        sweepGroup.dataset.cellWidth = String(widget.cellWidth);
        sweepGroup.dataset.cellHeight = String(widget.cellHeight);
        widget.glyphLayer.appendChild(sweepGroup);
        const trailGlyphs = '·:+*#';
        const sweepTrailCount = Math.max(1, Math.min(8, Number(radarProfile.sweepTrail || 5)));
        for (let step = 1; step <= sweepTrailCount; step++) {
            svgTextGlyph(sweepGroup, trailGlyphs[Math.min(trailGlyphs.length - 1, Math.floor(step / 3))], centerCol + Math.round(step * 1.55), centerRow, {
                className: `telemetry-green ${radarProfile.glow === false ? 'telemetry-no-glow' : ''}`.trim(),
                opacity: 0.28 + step * 0.04
            })?.setAttribute('data-radar-sweep-glyph', String(step));
        }

        const clutterGroup = svgElement('g', { 'data-radar-clutter': 'true' });
        clutterGroup.dataset.cellWidth = String(widget.cellWidth);
        clutterGroup.dataset.cellHeight = String(widget.cellHeight);
        widget.glyphLayer.appendChild(clutterGroup);
        const clutterCount = Math.max(0, Math.min(20, Number(radarProfile.clutterCount || 0)));
        for (let index = 0; index < clutterCount; index++) {
            svgTextGlyph(clutterGroup, '·', centerCol, centerRow, { className: 'telemetry-dim', opacity: 0.22 })?.setAttribute('data-radar-clutter-dot', String(index));
        }

        const contactGroup = svgElement('g', { 'data-radar-contacts': 'true' });
        contactGroup.dataset.cellWidth = String(widget.cellWidth);
        contactGroup.dataset.cellHeight = String(widget.cellHeight);
        widget.glyphLayer.appendChild(contactGroup);
        for (let index = 0; index < 6; index++) {
            svgTextGlyph(contactGroup, '·', centerCol, centerRow, { className: 'telemetry-dim', opacity: 0 })?.setAttribute('data-radar-contact', String(index));
            svgLabel(widget.labelLayer, '', 48, 3 + index, { className: 'telemetry-dim' })?.setAttribute('data-radar-contact-label', String(index));
        }
    }

    const angle = prefersReducedMotion ? 1.35 : frame * 0.065;
    const sweepGroup = widget.svg.querySelector('[data-radar-sweep="true"]');
    if (sweepGroup) {
        const centerPoint = widgetGridPixel(widget, centerCol, centerRow);
        sweepGroup.setAttribute('transform', `rotate(${(angle * 180 / Math.PI).toFixed(2)} ${centerPoint.x} ${centerPoint.y})`);
        sweepGroup.setAttribute('opacity', String(0.58 + phase.detail * 0.34));
    }

    const contacts = [
        { glyph: '△', angle: -0.98, radius: 5.6, cls: 'telemetry-green', range: '1.2km' },
        { glyph: '□', angle: -2.45, radius: 4.8, cls: 'telemetry-cyan', range: '2.8km' },
        { glyph: '◇', angle: 0.34, radius: 5.8, cls: 'telemetry-red', range: '4.1km' },
        { glyph: '△', angle: 1.92, radius: 4.2, cls: 'telemetry-green', range: '1.7km' },
        { glyph: '□', angle: 2.72, radius: 6.1, cls: 'telemetry-green', range: '3.3km' },
        { glyph: '△', angle: 0.9, radius: 6.4, cls: 'telemetry-red', range: '5.8km' }
    ];
    const visibleContacts = Math.max(2, Math.round(mixDiagnostic(2, contacts.length, phase.detail)));
    const contactNodes = Array.from(widget.svg.querySelectorAll('[data-radar-contact]'));
    const labelNodes = Array.from(widget.svg.querySelectorAll('[data-radar-contact-label]'));
    contactNodes.forEach((node, index) => {
        const contact = contacts[index];
        if (!contact || index >= visibleContacts) {
            node.setAttribute('opacity', '0');
            if (labelNodes[index]) setSvgLabelElement(labelNodes[index], '');
            return;
        }
        const wobble = prefersReducedMotion ? 0 : Math.sin(frame * 0.045 + index) * 0.045;
        const col = centerCol + Math.round(Math.cos(contact.angle + wobble) * contact.radius * 1.55);
        const row = centerRow + Math.round(Math.sin(contact.angle + wobble) * contact.radius * 0.72);
        const contactPulse = contact.cls === 'telemetry-red' ? 0.68 + Math.sin(frame * 0.18 + index) * 0.18 : 0.82 + Math.sin(frame * 0.055 + index) * 0.1;
        setSvgTextElement(node, contact.glyph, col, row, { className: contact.cls, opacity: clampDiagnostic(contactPulse, 0.48, 1), cellWidth: widget.cellWidth, cellHeight: widget.cellHeight });
        if (labelNodes[index]) {
            setSvgLabelElement(labelNodes[index], radarProfile.contactLabels === false ? `${String(index + 1).padStart(2, '0')} ${contact.glyph}` : `${String(index + 1).padStart(2, '0')} ${contact.glyph} ${contact.range}`, {
                className: contact.cls,
                opacity: 0.92
            });
        }
    });
    const clutterNodes = Array.from(widget.svg.querySelectorAll('[data-radar-clutter-dot]'));
    if (!widget.svg.dataset.radarClutterFrame || Math.abs(frame - Number(widget.svg.dataset.radarClutterFrame)) >= 6 || phase.detail < 0.98) {
        widget.svg.dataset.radarClutterFrame = String(frame);
        clutterNodes.forEach((node, index) => {
            const seed = index * 7 + frame;
            const localAngle = ((seed * 37) % 360) * Math.PI / 180;
            const localRadius = 1.4 + ((seed * 19) % 54) / 10;
            const col = centerCol + Math.round(Math.cos(localAngle) * localRadius * 1.55);
            const row = centerRow + Math.round(Math.sin(localAngle) * localRadius * 0.72);
            setSvgTextElement(node, '·', col, row, {
                className: 'telemetry-dim',
                opacity: col > 6 && col < 44 && row > 2 && row < 14 ? 0.14 + ((index % 4) * 0.05) : 0,
                cellWidth: widget.cellWidth,
                cellHeight: widget.cellHeight
            });
        });
    }
    setSvgLabelElement(widget.svg.querySelector('[data-radar-clutter-label="true"]'), `CLUTTER ${Math.round(diagnosticLiveValue(28, 4, phase))}%`, { className: 'telemetry-green' });
    let scanLayer = widget.svg.querySelector('[data-radar-scan="true"]');
    if (!scanLayer) {
        scanLayer = svgElement('g', { 'data-radar-scan': 'true' });
        scanLayer.dataset.cellWidth = String(widget.cellWidth);
        scanLayer.dataset.cellHeight = String(widget.cellHeight);
        widget.glyphLayer.appendChild(scanLayer);
    }
    clearSvgLayer(scanLayer);
    drawDiagnosticPhaseScan({ ...widget, guideLayer: scanLayer, glyphLayer: scanLayer }, phase, 'RADAR');
}

function renderSpectrumDashboardWidget(id, frame, networkValue, phase) {
    const widget = createSvgWidget(id, { cols: 58, rows: 14, cellHeight: 10, kind: 'diag-spectrum-waterfall' });
    if (!widget) return;
    drawDashboardGrid(widget, { className: 'telemetry-cyan', colStep: 6, rowStep: 3 });
    svgLabel(widget.labelLayer, 'FREQ', 2, 2, { className: 'telemetry-dim' });
    ['10k', '1k', '100', '10', '1'].forEach((label, index) => svgLabel(widget.labelLayer, label, 2, 4 + index * 2, { className: 'telemetry-green' }));
    const visibleRows = Math.round(mixDiagnostic(2, 9, phase.detail));
    for (let row = 3; row < 12; row++) {
        if (row - 2 > visibleRows) continue;
        for (let col = 6; col < 46; col++) {
            const carrier = Math.sin((col - 23) * 0.18) * 0.24;
            const pulse = Math.sin((col + frame * 0.28 - row * 2.1) * 0.4);
            const isCarrier = [15, 28, 39].includes(col) && (frame + row * 3) % 34 < 17;
            const spike = isCarrier ? 0.58 : ((col + row + Math.floor(frame / 8)) % 29 === 0 ? 0.34 : 0);
            const level = clampDiagnostic(networkValue / 130 + carrier + pulse * 0.22 + spike, 0, 1);
            const cls = level > 0.84 ? 'telemetry-red' : level > 0.66 ? 'telemetry-amber' : level > 0.42 ? 'telemetry-cyan' : 'telemetry-dim';
            svgTextGlyph(widget.glyphLayer, densityGlyph(level), col, row, { className: cls, opacity: 0.38 + level * 0.52 });
        }
    }
    svgLabel(widget.labelLayer, 'PEAK HOLD', 48, 3, { className: 'telemetry-amber' });
    ['-20', '-40', '-60', '-80', '-100'].forEach((label, index) => {
        const cls = index === 0 ? 'telemetry-red' : index === 1 ? 'telemetry-amber' : index === 2 ? 'telemetry-green' : 'telemetry-cyan';
        svgTextGlyph(widget.glyphLayer, '█', 48, 5 + index, { className: cls, opacity: 0.8 });
        svgLabel(widget.labelLayer, label, 50, 5 + index, { className: cls });
    });
    svgLabel(widget.labelLayer, 'CENTER 1.000 kHz', 18, 13, { className: 'telemetry-green' });
    drawDiagnosticPhaseScan(widget, phase, 'SPECTRUM');
}

function renderReactorSyncDashboardWidget(id, frame, values, phase) {
    const widget = createSvgWidget(id, { cols: 60, rows: 14, cellHeight: 10, kind: 'diag-reactor-control' });
    if (!widget) return;
    drawDashboardGrid(widget, { className: 'telemetry-amber', colStep: 5, rowStep: 2 });
    drawSvgGuideRect(widget, 1, 1, 16, 7, { className: 'telemetry-green', opacity: 0.16 });
    drawSvgGuideRect(widget, 18, 1, 25, 7, { className: 'telemetry-amber', opacity: 0.16 });
    drawSvgGuideRect(widget, 45, 1, 13, 7, { className: 'telemetry-cyan', opacity: 0.16 });
    drawSvgGuideRect(widget, 1, 9, 57, 4, { className: 'telemetry-amber', opacity: 0.12 });

    const output = diagnosticLiveValue(values.output, 18, phase);
    const pressure = diagnosticLiveValue(2.37 + Math.sin(frame * 0.05) * 0.04, 0.38, phase);
    const sync = diagnosticLiveValue(values.sync, 21, phase);

    svgLabel(widget.labelLayer, 'REACTOR OUTPUT', 2, 2, { className: 'telemetry-green' });
    svgLabel(widget.labelLayer, `${output.toFixed(1)}%`, 2, 4, { className: 'telemetry-green', fontSize: 20 });
    svgLabel(widget.labelLayer, `${statusGet('diagnostic.reactor.unit', 'MW-EQUIV')} ${glyphProgressBar(output, 8)}`, 2, 7, { className: 'telemetry-dim' });

    svgLabel(widget.labelLayer, 'CONTAINMENT PRESSURE', 19, 2, { className: 'telemetry-amber' });
    svgLabel(widget.labelLayer, `${pressure.toFixed(2)} ATM`, 33, 2, { className: 'telemetry-amber' });
    const pressureTrace = [];
    for (let i = 0; i <= 22; i++) {
        const col = 19 + i;
        const harmonic = Math.sin(frame * 0.07 + i * 0.62) * 0.9 + Math.sin(frame * 0.025 + i * 0.18) * 0.42;
        pressureTrace.push(widgetGridPixel(widget, col, 5.3 - harmonic));
    }
    drawSvgGuideLine(widget, 19, 5.3, 42, 5.3, { className: 'telemetry-amber', opacity: 0.12 });
    svgPolyline(widget.glyphLayer, pressureTrace, { className: 'telemetry-amber telemetry-trace-bold', opacity: 0.68 + phase.detail * 0.18 });
    svgLabel(widget.labelLayer, `NOMINAL ${statusGet('diagnostic.power.nominal_pressure', '3.20 ATM')}`, 22, 7, { className: 'telemetry-dim' });

    svgLabel(widget.labelLayer, 'SYNC STACK', 46, 2, { className: 'telemetry-cyan' });
    [
        ['PLL', sync],
        ['MAG', sync - 6 + Math.sin(frame * 0.06) * 2],
        ['RIT', values.mainPower + 20],
        ['BUS', values.reservePower + 36]
    ].forEach(([label, value], index) => {
        const safeValue = clampDiagnostic(value / 100, 0.05, 1) * 100;
        renderFixedGlyphLine(widget.glyphLayer, 4 + index, `${label} ${glyphProgressBar(safeValue, 7)}`, {
            col: 46,
            width: 12,
            className: safeValue < 62 ? 'telemetry-amber' : 'telemetry-green',
            opacity: 0.82 + phase.detail * 0.12
        });
    });

    const tempValue = diagnosticLiveValue(values.mainPower, 8, phase);
    renderFixedGlyphLine(widget.glyphLayer, 10, `CORE TEMP ${String(statusGet('diagnostic.power.temp', '612C')).padEnd(7, ' ')} 0`, {
        col: 2,
        width: 16,
        className: 'telemetry-amber',
        opacity: 0.88
    });
    for (let col = 19; col <= 45; col++) {
        const segment = (col - 19) / 26;
        const active = segment <= tempValue / 100;
        const cls = segment > 0.82 ? 'telemetry-red' : segment > 0.58 ? 'telemetry-amber' : 'telemetry-green';
        svgTextGlyph(widget.glyphLayer, active ? '█' : '░', col, 10, { className: active ? cls : 'telemetry-dim', opacity: active ? 0.86 : 0.28 });
    }
    svgLabel(widget.labelLayer, '1000', 47, 10, { className: 'telemetry-dim' });
    renderFixedGlyphLine(widget.glyphLayer, 12, `NEUTRON FLUX ${statusGet('diagnostic.power.flux', '6.21e13 n/cm/s')}  DELTA ${(Math.sin(frame * 0.05) * 0.8 + 0.6).toFixed(1)}%`, {
        col: 2,
        width: 54,
        className: 'telemetry-cyan',
        opacity: 0.82
    });
    for (let col = 3; col < 15; col++) {
        const level = clampDiagnostic((values.output / 100) * 0.55 + Math.sin(frame * 0.13 + col) * 0.2 + (col - 3) / 22);
        svgTextGlyph(widget.glyphLayer, blockGlyph(level), col, 8 - Math.round(level * 2), { className: level > 0.8 ? 'telemetry-amber' : 'telemetry-green', opacity: 0.66 });
    }
    drawDiagnosticPhaseScan(widget, phase, 'REACTOR');
}

function tomographyHeight(xNorm, yNorm, frame, phase) {
    const dx = xNorm - 0.52;
    const dy = yNorm - 0.52;
    const radius = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const outward = Math.sin(radius * 31 - frame * 0.09) * (1 - Math.min(1, radius * 1.8));
    const angular = Math.sin(angle * 4 + frame * 0.035) * 0.28;
    const peak = Math.exp(-(radius * radius) / 0.035) * 3.1;
    const ridge = Math.exp(-(((xNorm - 0.28) ** 2) / 0.08 + ((yNorm - 0.68) ** 2) / 0.06)) * 0.95;
    return (peak + ridge + outward * 0.9 + angular) * phase.detail;
}

function tomographyClass(yNorm) {
    const centerDistance = Math.abs(yNorm - 0.52);
    if (centerDistance < 0.09) return 'telemetry-red';
    if (centerDistance < 0.2) return 'telemetry-amber';
    if (centerDistance < 0.34) return 'telemetry-green';
    return 'telemetry-cyan';
}

function renderTomographyDashboardWidget(id, frame, phase) {
    const compact = id === 'diagSecurity';
    const widget = createSvgWidget(id, {
        cols: compact ? 72 : 96,
        rows: compact ? 14 : 24,
        cellHeight: compact ? 10 : 8.5,
        kind: compact ? 'diag-anomaly-tomography-compact' : 'diag-anomaly-tomography-fluid'
    });
    if (!widget) return;
    drawDashboardGrid(widget, { className: 'telemetry-cyan', colStep: 6, rowStep: 3 });
    const sliceDepth = Math.round(312 + Math.sin(frame * 0.035) * 18);
    svgLabel(widget.labelLayer, compact ? `FIELD MESH // SLICE ${sliceDepth}m` : `FIELD INTENSITY MESH // DEPTH SLICE ${sliceDepth}m`, 2, 2, { className: 'telemetry-amber' });
    svgLabel(widget.labelLayer, compact ? 'INT' : 'INTENSITY', compact ? 62 : 84, 3, { className: 'telemetry-amber' });
    svgLabel(widget.labelLayer, 'MAX', compact ? 65 : 87, compact ? 4.5 : 5, { className: 'telemetry-red' });
    svgLabel(widget.labelLayer, 'MIN', compact ? 65 : 87, compact ? 12 : 20, { className: 'telemetry-cyan' });

    const startCol = compact ? 5 : 7;
    const startRow = compact ? 4 : 6;
    const widthCols = compact ? 52 : 70;
    const heightRows = compact ? 8 : 14;
    const horizontalLines = Math.max(compact ? 6 : 8, Math.round(mixDiagnostic(compact ? 6 : 8, compact ? 15 : 28, phase.detail)));
    const verticalLines = Math.max(compact ? 6 : 8, Math.round(mixDiagnostic(compact ? 6 : 8, compact ? 16 : 30, phase.detail)));
    const horizontalSteps = compact ? 64 : 96;
    const verticalSteps = compact ? 48 : 72;

    for (let rowIndex = 0; rowIndex < horizontalLines; rowIndex++) {
        const yNorm = rowIndex / Math.max(1, horizontalLines - 1);
        const points = [];
        for (let step = 0; step <= horizontalSteps; step++) {
            const xNorm = step / horizontalSteps;
            const height = tomographyHeight(xNorm, yNorm, frame, phase);
            const fluidOffset = Math.sin((xNorm - 0.5) * 8 + frame * 0.045 + yNorm * 5) * 0.55 * phase.detail;
            const col = startCol + xNorm * widthCols + (yNorm - 0.5) * 5 + fluidOffset;
            const row = startRow + yNorm * heightRows - height;
            points.push(widgetGridPixel(widget, col, row));
        }
        svgPolyline(widget.glyphLayer, points, {
            className: `${tomographyClass(yNorm)} telemetry-trace-thin`,
            opacity: 0.18 + phase.detail * 0.34
        });
    }

    for (let colIndex = 0; colIndex < verticalLines; colIndex++) {
        const xNorm = colIndex / Math.max(1, verticalLines - 1);
        const points = [];
        for (let step = 0; step <= verticalSteps; step++) {
            const yNorm = step / verticalSteps;
            const height = tomographyHeight(xNorm, yNorm, frame, phase);
            const fluidOffset = Math.cos((yNorm - 0.5) * 7 + frame * 0.04 + xNorm * 6) * 0.45 * phase.detail;
            const col = startCol + xNorm * widthCols + (yNorm - 0.5) * 5 + fluidOffset;
            const row = startRow + yNorm * heightRows - height;
            points.push(widgetGridPixel(widget, col, row));
        }
        const centerDistance = Math.abs(xNorm - 0.52);
        svgPolyline(widget.glyphLayer, points, {
            className: `${centerDistance < 0.16 ? 'telemetry-amber' : 'telemetry-cyan'} telemetry-trace-thin`,
            opacity: 0.12 + phase.detail * 0.2
        });
    }

    const hotPath = [];
    for (let i = 0; i <= 72; i++) {
        const angle = (Math.PI * 2 * i) / 72;
        const pulse = 1 + Math.sin(frame * 0.06 + angle * 3) * 0.12;
        const col = startCol + widthCols * 0.52 + Math.cos(angle) * 8.8 * pulse;
        const row = startRow + heightRows * 0.52 + Math.sin(angle) * 2.3 * pulse - Math.sin(frame * 0.06) * 0.5;
        hotPath.push(widgetGridPixel(widget, col, row));
    }
    svgPolyline(widget.glyphLayer, hotPath, { className: 'telemetry-red telemetry-trace-bold', opacity: 0.2 + phase.detail * 0.24 });
    const sliceCol = 8 + Math.round(((Math.sin(frame * 0.035) + 1) / 2) * 64);
    drawSvgGuideLine(widget, sliceCol, 5, sliceCol + 5, compact ? 12.4 : 18, { className: 'telemetry-amber', opacity: 0.16 + phase.detail * 0.06 });

    [
        ['█', 'telemetry-red'],
        ['█', 'telemetry-amber'],
        ['▓', 'telemetry-amber'],
        ['▓', 'telemetry-green'],
        ['▒', 'telemetry-green'],
        ['▒', 'telemetry-cyan'],
        ['░', 'telemetry-cyan'],
        ['·', 'telemetry-dim']
    ].forEach(([glyph, cls], index) => {
        const legendRow = compact ? 5 + index : 6 + index * 2;
        svgTextGlyph(widget.glyphLayer, glyph, compact ? 63 : 86, legendRow, { className: cls, opacity: 0.92 });
        svgTextGlyph(widget.glyphLayer, glyph, compact ? 64 : 87, legendRow, { className: cls, opacity: 0.78 });
    });
    svgLabel(widget.labelLayer, `GRID ${Math.round(diagnosticLiveValue(128, 24, phase))}x${Math.round(diagnosticLiveValue(128, 24, phase))}`, compact ? 45 : 65, compact ? 12 : 20, { className: 'telemetry-green' });
    svgLabel(widget.labelLayer, `DRIFT +${(diagnosticLiveValue(2.1, 0.2, phase)).toFixed(1)}`, 2, compact ? 12 : 20, { className: 'telemetry-amber' });
    drawDiagnosticPhaseScan(widget, phase, 'TOMOGRAPHY');
}

function renderDataFabricDashboardWidget(id, frame, securityValue, phase) {
    const widget = createSvgWidget(id, { cols: 64, rows: 14, cellHeight: 10, kind: 'diag-entity-noise-spectrometer' });
    if (!widget) return;
    drawDashboardGrid(widget, { className: 'telemetry-cyan', colStep: 6, rowStep: 3 });
    svgLabel(widget.labelLayer, 'FREQ', 2, 2, { className: 'telemetry-dim' });
    svgLabel(widget.labelLayer, 'PEAK HOLD', 52, 2, { className: 'telemetry-amber' });
    ['10k', '2k', '500', '100', '25', '5'].forEach((label, index) => svgLabel(widget.labelLayer, label, 2, 3 + index * 1.55, { className: 'telemetry-green' }));

    const visibleRows = Math.round(mixDiagnostic(3, 10, phase.detail));
    const peakPoints = [];
    for (let row = 3; row <= 12; row++) {
        if (row - 2 > visibleRows) continue;
        for (let col = 7; col <= 49; col++) {
            const level = spectrometerLevel(col, row, frame, diagnosticLiveValue(securityValue / 125, 0.12, phase));
            const cls = level > 0.88 ? 'telemetry-red' : level > 0.7 ? 'telemetry-amber' : level > 0.48 ? 'telemetry-green' : level > 0.28 ? 'telemetry-cyan' : 'telemetry-dim';
            svgTextGlyph(widget.glyphLayer, densityGlyph(level), col, row, { className: cls, opacity: 0.34 + level * 0.55 });
            if (row === 4 && col % 2 === 0) {
                const peakRow = 11.5 - level * 7.5;
                peakPoints.push(widgetGridPixel(widget, col, peakRow));
            }
        }
    }
    svgPolyline(widget.glyphLayer, peakPoints, { className: 'telemetry-amber telemetry-trace-thin', opacity: 0.48 + phase.detail * 0.25 });

    [16, 31, 45].forEach((col, index) => {
        const pulse = 0.65 + Math.sin(frame * (0.07 + index * 0.012)) * 0.25;
        drawSvgGuideLine(widget, col, 3, col, 12, { className: index === 2 ? 'telemetry-red' : 'telemetry-cyan', opacity: 0.16 + pulse * 0.12 });
        svgTextGlyph(widget.glyphLayer, index === 2 ? '◆' : '●', col, 3, { className: index === 2 ? 'telemetry-red' : 'telemetry-cyan', opacity: pulse });
    });

    [
        ['-20', 'telemetry-red'],
        ['-40', 'telemetry-amber'],
        ['-60', 'telemetry-green'],
        ['-80', 'telemetry-cyan'],
        ['-100', 'telemetry-dim']
    ].forEach(([label, cls], index) => {
        svgTextGlyph(widget.glyphLayer, '█', 53, 4 + index, { className: cls, opacity: 0.86 });
        svgLabel(widget.labelLayer, label, 55, 4 + index, { className: cls });
    });
    svgLabel(widget.labelLayer, `CLUTTER ${Math.round(diagnosticLiveValue(28, 5, phase))}%`, 52, 11, { className: 'telemetry-green' });
    svgLabel(widget.labelLayer, `REF ${statusGet('diagnostic.security.reference', '-20 dBm')}`, 52, 12, { className: 'telemetry-cyan' });
    svgLabel(widget.labelLayer, 'CENTER 1.000 kHz', 18, 13, { className: 'telemetry-green' });
    drawDiagnosticPhaseScan(widget, phase, 'NOISE');
}

function blackDesertGridPoint(widget, col, row) {
    return widgetGridPixel(widget, col, row);
}

const BLACK_DESERT_ISO = {
    centerCol: 48,
    centerRow: 12.7,
    scaleX: 22.5,
    scaleY: 5.15,
    heightScale: 2.15
};

function blackDesertTerrainHeight(x, y, frame, detail = 1) {
    const drift = prefersReducedMotion ? 0 : frame * 0.012;
    const duneA = Math.sin((x * 2.8 + y * 1.15 + drift) * Math.PI) * 0.42;
    const duneB = Math.sin((x * 0.9 - y * 3.1 - drift * 0.7) * Math.PI) * 0.28;
    const ripple = Math.sin((x + y) * 9 + drift * 7) * 0.07;
    const westernRidge = Math.exp(-(((x + 0.52) ** 2) / 0.28 + ((y - 0.28) ** 2) / 0.08)) * 0.74;
    const easternSpines = Math.exp(-(((x - 0.65) ** 2) / 0.1 + ((y + 0.52) ** 2) / 0.05)) * 1.82;
    const vortexLift = Math.exp(-(((x - 0.2) ** 2) / 0.12 + ((y + 0.06) ** 2) / 0.08)) * 0.38;
    const vortexBasin = Math.exp(-(((x - 0.18) ** 2) / 0.06 + ((y + 0.04) ** 2) / 0.06)) * -0.34;
    return Math.max(-0.35, (0.46 + duneA + duneB + ripple + westernRidge + easternSpines + vortexLift + vortexBasin) * detail);
}

function blackDesertSurfacePoint(widget, x, y, frame, detail = 1, lift = 0) {
    const z = blackDesertTerrainHeight(x, y, frame, detail) + lift;
    const col = BLACK_DESERT_ISO.centerCol + (x - y) * BLACK_DESERT_ISO.scaleX;
    const row = BLACK_DESERT_ISO.centerRow + (x + y) * BLACK_DESERT_ISO.scaleY - z * BLACK_DESERT_ISO.heightScale;
    return {
        col,
        row,
        point: blackDesertGridPoint(widget, col, row)
    };
}

function renderBlackDesertMapLabel(widget, lines, col, row, options = {}) {
    const labelLines = Array.isArray(lines) ? lines : [lines];
    labelLines.forEach((line, index) => {
        svgLabel(widget.labelLayer, line, col, row + index * 0.82, {
            className: `${index === 0 ? (options.className || 'telemetry-amber') : (options.subClassName || 'telemetry-dim')} telemetry-map-label-strong`,
            opacity: index === 0 ? 0.98 : 0.9,
            fontSize: index === 0 ? 8.6 : 7.4
        });
    });
}

function renderBlackDesertZoneOverlay(widget, zone, frame, detail) {
    const points = zone.points.map(([x, y]) => blackDesertSurfacePoint(widget, x, y, frame, detail, 0.08).point);
    widget.guideLayer.appendChild(svgElement('polygon', {
        points: points.map(point => `${Number(point.x).toFixed(1)},${Number(point.y).toFixed(1)}`).join(' '),
        class: `telemetry-map-zone ${zone.className}`,
        opacity: zone.opacity ?? 0.28
    }));
    svgPolyline(widget.guideLayer, points.concat(points[0]), {
        className: `${zone.className} telemetry-trace-thin`,
        opacity: 0.16 + detail * 0.1
    });
    renderBlackDesertMapLabel(widget, [zone.label, zone.subLabel], zone.labelCol, zone.labelRow, {
        className: zone.className,
        width: zone.width || 16,
        opacity: 0.72
    });
}

function sampleBlackDesertRoute(route, samplesPerSegment = 9) {
    const samples = [];
    for (let index = 0; index < route.length - 1; index++) {
        const [startX, startY] = route[index];
        const [endX, endY] = route[index + 1];
        for (let step = 0; step < samplesPerSegment; step++) {
            const t = step / samplesPerSegment;
            samples.push([
                mixDiagnostic(startX, endX, t),
                mixDiagnostic(startY, endY, t)
            ]);
        }
    }
    samples.push(route[route.length - 1]);
    return samples;
}

function renderBlackDesertRoute(widget, route, frame, options = {}) {
    const samples = sampleBlackDesertRoute(route, options.samplesPerSegment || 8);
    const points = samples.map(([x, y]) => blackDesertSurfacePoint(widget, x, y, frame, options.detail || 1, options.lift || 0.16).point);
    svgPolyline(widget.glyphLayer, points, {
        className: `${options.className || 'telemetry-amber'} telemetry-trace-thin`,
        opacity: options.opacity ?? 0.36
    });
    if (options.showMarkers === false) return;

    samples.forEach(([x, y], index) => {
        if (index % (options.markerEvery || 4) !== 0) return;
        const active = !options.static && !prefersReducedMotion && (index + Math.floor(frame / 2)) % 18 < 3;
        const projected = blackDesertSurfacePoint(widget, x, y, frame, options.detail || 1, (options.lift || 0.16) + 0.08);
        svgTextGlyph(widget.glyphLayer, active ? (options.activeGlyph || '◆') : (options.routeGlyph || '·'), projected.col, projected.row, {
            className: active ? 'telemetry-red' : options.className || 'telemetry-amber',
            opacity: active ? 0.9 : 0.46
        });
    });
}

function renderBlackDesertSite(widget, site, frame, detail) {
    const projected = blackDesertSurfacePoint(widget, site.x, site.y, frame, detail, site.lift || 0.34);
    const pulse = 0;
    drawSvgGuideCircle(widget, projected.col, projected.row, site.ring || 0.75, {
        className: site.className || 'telemetry-red',
        opacity: 0.09 + detail * 0.08
    });
    svgTextGlyph(widget.glyphLayer, site.glyph || '◆', projected.col, projected.row, {
        className: site.className || 'telemetry-red',
        opacity: 0.66 + detail * 0.24 + pulse * 0.12,
        fontSize: site.fontSize || 10
    });
    drawSvgGuideLine(widget, projected.col, projected.row, site.labelCol - 0.5, site.labelRow, {
        className: site.className || 'telemetry-red',
        opacity: 0.18 + detail * 0.09
    });
    renderBlackDesertMapLabel(widget, [site.id, site.name], site.labelCol, site.labelRow, {
        className: site.className || 'telemetry-red',
        width: site.labelWidth || 12,
        opacity: 0.8
    });
}

function renderBlackDesertTerrainMesh(widget, frame, detail) {
    const meshRows = Math.round(mixDiagnostic(7, 18, detail));
    const meshCols = Math.round(mixDiagnostic(7, 15, detail));
    const sampleCount = Math.round(mixDiagnostic(24, 44, detail));
    for (let rowIndex = 0; rowIndex < meshRows; rowIndex++) {
        const y = mixDiagnostic(-0.96, 0.96, rowIndex / Math.max(1, meshRows - 1));
        const points = [];
        for (let step = 0; step <= sampleCount; step++) {
            const x = mixDiagnostic(-0.96, 0.96, step / sampleCount);
            points.push(blackDesertSurfacePoint(widget, x, y, frame, detail).point);
        }
        const cls = y > 0.42 ? 'telemetry-amber' : y > -0.08 ? 'telemetry-green' : 'telemetry-cyan';
        svgPolyline(widget.guideLayer, points, {
            className: `${cls} telemetry-trace-thin`,
            opacity: 0.08 + detail * 0.16
        });
    }

    for (let colIndex = 0; colIndex < meshCols; colIndex++) {
        const x = mixDiagnostic(-0.96, 0.96, colIndex / Math.max(1, meshCols - 1));
        const points = [];
        for (let step = 0; step <= 34; step++) {
            const y = mixDiagnostic(-0.96, 0.96, step / 34);
            points.push(blackDesertSurfacePoint(widget, x, y, frame, detail).point);
        }
        svgPolyline(widget.guideLayer, points, {
            className: `${x > 0.45 ? 'telemetry-amber' : 'telemetry-cyan'} telemetry-trace-thin`,
            opacity: 0.04 + detail * 0.075
        });
    }

    for (let crest = 0; crest < 7; crest++) {
        const points = [];
        const baseY = -0.76 + crest * 0.26;
        for (let step = 0; step <= 46; step++) {
            const x = mixDiagnostic(-0.88, 0.86, step / 46);
            const y = baseY + Math.sin(x * 5.4 + crest * 1.1 + frame * 0.014) * 0.035;
            points.push(blackDesertSurfacePoint(widget, x, y, frame, detail, 0.13).point);
        }
        svgPolyline(widget.glyphLayer, points, {
            className: `${crest > 4 ? 'telemetry-amber' : 'telemetry-green'} telemetry-trace-thin`,
            opacity: 0.05 + detail * 0.12
        });
    }
}

function renderBlackDesertMapDashboardWidget(id, frame, phase) {
    const widget = createSvgWidget(id, { cols: 96, rows: 24, cellHeight: 7, kind: 'diag-black-desert-iso-terrain-map' });
    if (!widget) return;
    const staticKey = 'black-desert-mesh-map-static-v4';
    if (widget.svg.dataset.blackDesertStaticKey === staticKey) return;
    widget.svg.dataset.blackDesertStaticKey = staticKey;

    const staticFrame = 0;
    const detail = 1;
    drawDashboardGrid(widget, { className: 'telemetry-amber', colStep: 8, rowStep: 3 });
    drawSvgGuideRect(widget, 1, 1, 94, 22, { className: 'telemetry-amber', opacity: 0.12 });

    [
        {
            label: 'ZONE A',
            subLabel: 'CORRIDOR',
            className: 'telemetry-amber',
            labelCol: 31,
            labelRow: 2.3,
            width: 13,
            opacity: 0.19,
            points: [[-0.86, -0.86], [-0.56, -0.96], [0.86, -0.24], [0.92, -0.02], [0.04, 0.12], [-0.72, -0.26]]
        },
        {
            label: 'ZONE B',
            subLabel: 'THE CLAIM',
            className: 'telemetry-green',
            labelCol: 22,
            labelRow: 10.5,
            width: 13,
            opacity: 0.16,
            points: [[-0.92, -0.18], [-0.42, -0.2], [0.34, 0.26], [0.08, 0.8], [-0.72, 0.74], [-0.96, 0.38]]
        },
        {
            label: 'ZONE C',
            subLabel: 'THE BLIND',
            className: 'telemetry-red',
            labelCol: 72,
            labelRow: 5.1,
            width: 13,
            opacity: 0.14,
            points: [[0.24, -0.44], [0.96, -0.26], [0.98, 0.86], [0.3, 0.96], [0.06, 0.18]]
        }
    ].forEach(zone => renderBlackDesertZoneOverlay(widget, zone, staticFrame, detail));

    renderBlackDesertTerrainMesh(widget, staticFrame, detail);

    const routeA = [[-0.72, -0.68], [-0.36, -0.58], [-0.04, -0.3], [0.2, 0.18], [0.38, 0.52], [0.62, 0.86]];
    const routeB = [[-0.72, -0.68], [-0.86, -0.2], [-0.76, 0.12], [-0.52, 0.46], [-0.5, 0.72], [-0.04, 0.78], [0.35, 0.84]];
    const routeC = [[-0.78, 0.12], [-0.38, 0.08], [-0.16, 0.14], [0.22, 0.48], [0.35, 0.84]];
    renderBlackDesertRoute(widget, routeA, staticFrame, { className: 'telemetry-red', opacity: 0.28 + detail * 0.12, detail, samplesPerSegment: 10, static: true, showMarkers: false });
    renderBlackDesertRoute(widget, routeB, staticFrame, { className: 'telemetry-amber', opacity: 0.24 + detail * 0.1, detail, samplesPerSegment: 10, static: true, showMarkers: false });
    renderBlackDesertRoute(widget, routeC, staticFrame, { className: 'telemetry-cyan', opacity: 0.18 + detail * 0.08, detail, samplesPerSegment: 8, markerEvery: 5, static: true, showMarkers: false });

    [
        { id: 'BRE-01', name: 'GATEHEAD', x: -0.72, y: -0.68, labelCol: 4, labelRow: 3.1, labelWidth: 13, className: 'telemetry-cyan', glyph: '◉', col: 0 },
        { id: 'BRE-02', name: 'RED HARVEST', x: -0.78, y: 0.12, labelCol: 5, labelRow: 13.1, labelWidth: 15, className: 'telemetry-red', glyph: '◆', col: 2 },
        { id: 'BRE-03', name: 'FIREWATCH', x: -0.16, y: 0.14, labelCol: 37, labelRow: 4.9, labelWidth: 14, className: 'telemetry-amber', glyph: '◇', col: 3 },
        { id: 'BRE-04', name: 'BLACKWATER', x: 0.22, y: 0.48, labelCol: 62, labelRow: 13.7, labelWidth: 15, className: 'telemetry-red', glyph: '▣', col: 4 },
        { id: 'BRE-05', name: 'REFINERY', x: -0.5, y: 0.72, labelCol: 11, labelRow: 20.2, labelWidth: 13, className: 'telemetry-green', glyph: '□', col: 5 },
        { id: 'BRE-06', name: 'STOCKADE', x: 0.35, y: 0.84, labelCol: 48, labelRow: 21, labelWidth: 13, className: 'telemetry-amber', glyph: '▤', col: 6 },
        { id: 'VORTEX', name: 'MANA SINK', x: 0.2, y: -0.06, labelCol: 58, labelRow: 7.8, labelWidth: 12, className: 'telemetry-cyan', glyph: '◎', ring: 1.1, col: 7 },
        { id: 'SPIRES', name: 'LOST SPIRES', x: 0.73, y: 0.56, labelCol: 72, labelRow: 17.4, labelWidth: 14, className: 'telemetry-amber', glyph: '△', col: 8 },
        { id: 'AZTECH', name: 'ACTIVITY', x: 0.72, y: 0.86, labelCol: 73, labelRow: 21, labelWidth: 12, className: 'telemetry-red', glyph: '☠', ring: 1, col: 9 }
    ].forEach(site => renderBlackDesertSite(widget, site, staticFrame, detail));

    [
        { x: -0.68, y: 0.02, glyph: '△', className: 'telemetry-amber' },
        { x: -0.05, y: 0.42, glyph: '△', className: 'telemetry-amber' },
        { x: 0.5, y: 0.66, glyph: '△', className: 'telemetry-red' },
        { x: 0.84, y: 0.36, glyph: '△', className: 'telemetry-red' }
    ].forEach((hazard, index) => {
        const point = blackDesertSurfacePoint(widget, hazard.x, hazard.y, staticFrame, detail, 0.28);
        svgTextGlyph(widget.glyphLayer, hazard.glyph, point.col, point.row, {
            className: hazard.className,
            opacity: 0.64 + detail * 0.22
        });
    });

    renderFixedGlyphLine(widget.glyphLayer, 22.7, '◉/◆ SITE  △ HAZARD  · ROUTE  ◎ MANA SINK  SHADED ZONES = ACCESS REGIONS', {
        col: 3,
        width: 79,
        className: 'telemetry-dim',
        opacity: 0.72
    });

}

function renderLiveEventDashboardWidget(id, frame, values, phase) {
    const widget = createSvgWidget(id, { cols: 58, rows: 15, cellHeight: 10, kind: 'diag-event-log' });
    if (!widget) return;
    drawDashboardGrid(widget, { className: 'telemetry-green', colStep: 7, rowStep: 3 });
    drawSvgGuideRect(widget, 1, 1, 49, 9, { className: 'telemetry-green', opacity: 0.12 });
    drawSvgGuideRect(widget, 51, 1, 6, 11, { className: 'telemetry-amber', opacity: 0.12 });
    const bootLines = [
        ['SYS', 'Sensor bus precharge accepted.', 'OK'],
        ['NET', 'Dead-net relay handshake pending...', 'LOCK'],
        ['SEC', 'Perimeter lattice warming.', 'WARN'],
        ['BIO', 'Crew vital channels acquiring.', 'INFO'],
        ['REAC', 'Flux chamber lining up.', 'OK'],
        ['ANOM', 'Tomography solver idle.', 'INFO']
    ];
    const liveLines = [
        ['SYS', 'Gate stabilization field nominal.', 'OK'],
        ['NET', 'Dead-net carrier packet reroute.', 'LOCK'],
        ['SEC', 'Perimeter breach attempt Sector 04.', 'WARN'],
        ['BIO', `Unknown ${String(values.unknownLife).padStart(2, '0')} // unstable ${String(values.unstableLife).padStart(2, '0')}.`, 'INFO'],
        ['REAC', 'Neutron flux variance within limits.', 'OK'],
        ['ANOM', 'Anomaly spike at depth slice 312m.', 'ALERT'],
        ['PSY', 'Psych-AI resonance drift +0.7%.', 'WARN'],
        ['SEC', 'Countermeasures deployed.', 'OK'],
        ['GATE', 'Containment ritual drift corrected.', 'OK'],
        ['NET', 'Packet decay rising on dead-net leg.', 'WARN'],
        ['CORE', 'Archive bus transaction verified.', 'OK']
    ];
    const lines = phase.detail < 0.7 ? bootLines : liveLines;
    const offset = prefersReducedMotion ? 0 : Math.floor(frame / 16) % lines.length;
    const activeRow = prefersReducedMotion ? -1 : Math.floor((frame % 16) / 2);
    for (let index = 0; index < 8; index++) {
        const entry = lines[(offset + index) % lines.length];
        const seconds = String((10 + offset * 3 + index * 2) % 60).padStart(2, '0');
        const cls = entry[2] === 'ALERT' ? 'telemetry-red' : entry[2] === 'WARN' ? 'telemetry-amber' : entry[2] === 'LOCK' ? 'telemetry-cyan' : 'telemetry-green';
        if (index === activeRow) {
            drawSvgGuideRect(widget, 1, 2 + index - 0.45, 49, 1, { className: cls, opacity: 0.08 + phase.detail * 0.08 });
        }
        svgTextGlyph(widget.glyphLayer, entry[2] === 'ALERT' ? '◆' : entry[2] === 'WARN' ? '◇' : '●', 2, 2 + index, {
            className: cls,
            opacity: index === activeRow ? 1 : 0.72
        });
        renderFixedGlyphLine(widget.glyphLayer, 2 + index, `03:17:${seconds} [${entry[0]}] ${entry[1]}`, {
            col: 4,
            width: 45,
            className: cls,
            opacity: index === activeRow ? 0.98 : 0.48 + phase.detail * 0.34
        });
        svgLabel(widget.labelLayer, `[${entry[2]}]`, 51, 2 + index, { className: cls });
    }

    svgLabel(widget.labelLayer, 'PKT', 2, 11, { className: 'telemetry-cyan' });
    svgLabel(widget.labelLayer, 'ERR', 2, 12, { className: 'telemetry-red' });
    for (let col = 7; col < 48; col++) {
        const packet = (col + frame) % 9 === 0;
        const error = (col * 3 + Math.floor(frame / 2)) % 37 === 0;
        svgTextGlyph(widget.glyphLayer, packet ? '●' : '·', col, 11, { className: packet ? 'telemetry-cyan' : 'telemetry-dim', opacity: packet ? 0.9 : 0.24 });
        svgTextGlyph(widget.glyphLayer, error ? '◆' : '·', col, 12, { className: error ? 'telemetry-red' : 'telemetry-dim', opacity: error ? 0.92 : 0.16 });
    }
    for (let row = 2; row <= 10; row++) {
        const level = clampDiagnostic(0.48 + Math.sin(frame * 0.14 + row * 0.8) * 0.38);
        const active = level > (10 - row) / 8;
        svgTextGlyph(widget.glyphLayer, active ? '█' : '░', 55, row, { className: active ? (row < 4 ? 'telemetry-red' : row < 6 ? 'telemetry-amber' : 'telemetry-green') : 'telemetry-dim', opacity: active ? 0.78 : 0.26 });
    }
    svgLabel(widget.labelLayer, `AUTO-SCROLL ${phase.mode === 'live' ? 'ON' : 'CAL'}`, 1, 13, { className: 'telemetry-amber' });
    drawDiagnosticPhaseScan(widget, phase, 'EVENTS');
}

function renderSignalIntegrityDashboardWidget(id, frame, integrityValue, phase) {
    const widget = createSvgWidget(id, { cols: 42, rows: 13, cellHeight: 10, kind: 'diag-signal-strength-bars' });
    if (!widget) return;
    drawDashboardGrid(widget, { className: 'telemetry-green', colStep: 6, rowStep: 3 });
    const value = clampDiagnostic(diagnosticLiveValue(integrityValue + Math.sin(frame * 0.08) * 0.7, 18, phase), 0, 100);
    const dbValue = -96 + value * 0.72;
    const snr = diagnosticLiveValue(31 + Math.sin(frame * 0.06) * 2.4, 4, phase);
    const jitter = diagnosticLiveValue(0.8 + Math.sin(frame * 0.09) * 0.2, 6.4, phase);

    svgLabel(widget.labelLayer, 'CARRIER LOCK', 2, 2, { className: 'telemetry-amber' });
    svgLabel(widget.labelLayer, `${dbValue.toFixed(1)} dBm`, 31, 2, { className: value < 72 ? 'telemetry-amber' : 'telemetry-green' });
    renderFixedGlyphLine(widget.glyphLayer, 4, `PWR ${glyphProgressBar(value, 24)}`, { col: 2, width: 34, className: value < 72 ? 'telemetry-amber' : 'telemetry-green', opacity: 0.9 });
    const markerCol = 7 + Math.round((value / 100) * 23);
    svgTextGlyph(widget.glyphLayer, '▲', markerCol, 5, { className: value < 72 ? 'telemetry-amber' : 'telemetry-cyan', opacity: 0.9 });

    renderFixedGlyphLine(widget.glyphLayer, 7, `SNR ${glyphProgressBar(snr * 2.2, 16)} ${snr.toFixed(1)}dB`, { col: 2, width: 31, className: 'telemetry-cyan', opacity: 0.86 });
    renderFixedGlyphLine(widget.glyphLayer, 9, `JIT ${glyphProgressBar(Math.max(0, 100 - jitter * 10), 16)} ${jitter.toFixed(1)}ms`, { col: 2, width: 31, className: jitter > 3 ? 'telemetry-amber' : 'telemetry-green', opacity: 0.86 });

    for (let col = 3; col <= 36; col++) {
        const pulse = (col + frame) % 11 === 0;
        const drop = (col * 5 + Math.floor(frame / 2)) % 41 === 0;
        svgTextGlyph(widget.glyphLayer, drop ? '◆' : pulse ? '●' : '·', col, 11, {
            className: drop ? 'telemetry-red' : pulse ? 'telemetry-cyan' : 'telemetry-dim',
            opacity: drop ? 0.92 : pulse ? 0.86 : 0.22
        });
    }
    svgLabel(widget.labelLayer, 'RX PULSE RAIL', 2, 10, { className: 'telemetry-dim' });
    if (phase.detail < 0.98) {
        const scanCol = Math.round(mixDiagnostic(2, widget.cols - 3, phase.sensorProgress / 100));
        drawSvgGuideLine(widget, scanCol, 2, scanCol, 10, { className: 'telemetry-amber', opacity: 0.22 });
        svgLabel(widget.labelLayer, `ACQ ${String(phase.sensorProgress).padStart(3, '0')}%`, 29, 10, { className: 'telemetry-amber' });
    }
}

function renderUplinkDashboardWidget(id, frame, values, phase) {
    const widget = createSvgWidget(id, { cols: 48, rows: 14, cellHeight: 10, kind: 'diag-uplink-processor' });
    if (!widget) return;
    drawDashboardGrid(widget, { className: 'telemetry-cyan', colStep: 6, rowStep: 4 });
    drawSvgGuideRect(widget, 1, 1, 46, 5, { className: 'telemetry-cyan', opacity: 0.12 });
    drawSvgGuideRect(widget, 1, 7, 46, 2, { className: 'telemetry-green', opacity: 0.12 });
    drawSvgGuideRect(widget, 1, 10, 28, 3, { className: 'telemetry-cyan', opacity: 0.12 });
    drawSvgGuideRect(widget, 32, 10, 15, 3, { className: 'telemetry-green', opacity: 0.12 });
    svgLabel(widget.labelLayer, 'WAVEFORM STRIP', 2, 2, { className: 'telemetry-cyan' });
    const waveform = [];
    for (let i = 0; i < Math.round(mixDiagnostic(8, 38, phase.detail)); i++) {
        const col = 4 + i;
        const noise = Math.sin(frame * 0.28 + i * 1.7) * 0.7 + Math.sin(frame * 0.1 + i * 0.34) * 0.45;
        waveform.push(widgetGridPixel(widget, col, 4.4 + noise));
    }
    svgPolyline(widget.glyphLayer, waveform, { className: 'telemetry-cyan telemetry-trace-bold', opacity: 0.58 + phase.detail * 0.28 });
    renderFixedGlyphLine(widget.glyphLayer, 8, `PHASE LOCK ${glyphProgressBar(diagnosticLiveValue(values.sync, 12, phase), 18)} ${values.sync > 85 ? 'LOCKED' : 'DRIFT'}`, {
        col: 2,
        width: 42,
        className: values.sync > 85 ? 'telemetry-green' : 'telemetry-amber',
        opacity: 0.9
    });
    const processorLoad = diagnosticLiveValue(43 + Math.sin(frame * 0.12) * 4, 9, phase);
    svgLabel(widget.labelLayer, 'PROCESSOR LOAD', 2, 11, { className: 'telemetry-cyan' });
    svgLabel(widget.labelLayer, `${Math.round(processorLoad)}%`, 23, 11, { className: 'telemetry-cyan', fontSize: 18 });
    const spinCenterCol = 39;
    const spinCenterRow = 11;
    for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2 + (prefersReducedMotion ? 0 : frame * 0.09);
        const col = spinCenterCol + Math.round(Math.cos(angle) * 4);
        const row = spinCenterRow + Math.round(Math.sin(angle) * 1);
        svgTextGlyph(widget.glyphLayer, '·', col, row, { className: 'telemetry-green', opacity: 0.22 + (i / 12) * 0.62 });
    }
    svgLabel(widget.labelLayer, 'SCAN', 35, 12.4, { className: 'telemetry-green' });
    drawDiagnosticPhaseScan(widget, phase, 'UPLINK');
}

let sideTelemetryFrame = 0;
let sideTelemetryAnimFrame = null;
let sideTelemetryLastRender = 0;

function sideRoutePoint(route, progress) {
    const clamped = clampDiagnostic(progress, 0, 0.999);
    const scaled = clamped * (route.length - 1);
    const index = Math.floor(scaled);
    const local = scaled - index;
    const start = route[index];
    const end = route[Math.min(route.length - 1, index + 1)];
    return {
        col: mixDiagnostic(start[0], end[0], local),
        row: mixDiagnostic(start[1], end[1], local)
    };
}

function renderSidePacket(widget, route, frame, offset, options = {}) {
    const progress = ((frame * (options.speed || 0.035) + offset) % 1 + 1) % 1;
    const point = sideRoutePoint(route, progress);
    svgTextGlyph(widget.glyphLayer, options.glyph || '●', Math.round(point.col), Math.round(point.row), {
        className: options.className || 'telemetry-green',
        opacity: options.opacity ?? 0.88
    });
}

function startSideTelemetryLoop() {
    if (sideTelemetryAnimFrame || prefersReducedMotion || !AppState.networkOnline) {
        renderSideGlyphTelemetry(sideTelemetryFrame);
        return;
    }
    sideTelemetryLastRender = 0;
    sideTelemetryAnimFrame = requestAnimationFrame(runSideTelemetryLoop);
}

function stopSideTelemetryLoop() {
    if (!sideTelemetryAnimFrame) return;
    cancelAnimationFrame(sideTelemetryAnimFrame);
    sideTelemetryAnimFrame = null;
}

function runSideTelemetryLoop(timestamp = 0) {
    if (!AppState.networkOnline || prefersReducedMotion || document.hidden) {
        sideTelemetryAnimFrame = null;
        renderSideGlyphTelemetry(sideTelemetryFrame);
        return;
    }

    const interval = diagnosticRenderProfile().sideTelemetryMs || effectsFrameMs(80, 140, 180);
    if (!sideTelemetryLastRender || timestamp - sideTelemetryLastRender >= interval) {
        sideTelemetryLastRender = timestamp;
        sideTelemetryFrame++;
        renderSideGlyphTelemetry(sideTelemetryFrame);
    }
    sideTelemetryAnimFrame = requestAnimationFrame(runSideTelemetryLoop);
}

function renderSideSignalSpectrum(frame = 0) {
    const widget = createSvgWidget('sideSignalSpectrum', { cols: 40, rows: 10, cellHeight: 9, kind: 'side-signal-spectrum-analyzer' });
    if (!widget) return;
    drawDashboardGrid(widget, {
        className: AppState.networkOnline ? 'telemetry-cyan' : 'telemetry-red',
        colStep: 5,
        rowStep: 2
    });
    svgLabel(widget.labelLayer, 'SPECTRUM ANALYZER', 2, 1, { className: AppState.networkOnline ? 'telemetry-amber' : 'telemetry-red' });

    if (!AppState.networkOnline) {
        renderFixedGlyphLine(widget.glyphLayer, 5, 'NO CARRIER // SIGNAL BUS OFFLINE', {
            col: 3,
            width: 34,
            className: 'telemetry-red',
            opacity: 0.88
        });
        drawSvgGuideLine(widget, 4, 7, 36, 7, { className: 'telemetry-red', opacity: 0.28 });
        return;
    }

    const reduced = prefersReducedMotion || (typeof safeModeActive === 'function' && safeModeActive());
    const activeFrame = reduced ? 12 : frame;
    const peakPoints = [];
    for (let col = 4; col <= 35; col++) {
        const normalized = (col - 4) / 31;
        const carrierA = Math.exp(-((normalized - 0.28) ** 2) / 0.004) * 0.82;
        const carrierB = Math.exp(-((normalized - 0.62) ** 2) / 0.007) * 0.7;
        const carrierC = Math.exp(-((normalized - 0.84) ** 2) / 0.003) * 0.88;
        const drift = Math.sin(activeFrame * 0.12 + col * 0.63) * 0.15;
        const floor = Math.sin(col * 1.7 + activeFrame * 0.04) * 0.08;
        const level = clampDiagnostic(0.18 + carrierA + carrierB + carrierC + drift + floor, 0.06, 1);
        const height = Math.max(1, Math.round(level * 6));
        const cls = level > 0.82 ? 'telemetry-red' : level > 0.64 ? 'telemetry-amber' : level > 0.42 ? 'telemetry-green' : 'telemetry-cyan';
        for (let rowOffset = 0; rowOffset < height; rowOffset++) {
            const row = 8 - rowOffset;
            const glyph = rowOffset === height - 1 ? blockGlyph(level) : '█';
            svgTextGlyph(widget.glyphLayer, glyph, col, row, {
                className: cls,
                opacity: 0.36 + level * 0.5 - rowOffset * 0.025
            });
        }
        peakPoints.push(widgetGridPixel(widget, col, 7.6 - level * 5.8));
    }

    svgPolyline(widget.glyphLayer, peakPoints, { className: 'telemetry-amber telemetry-trace-thin', opacity: 0.52 });
    [12, 24, 33].forEach((col, index) => {
        const pulse = reduced ? 0.68 : 0.56 + Math.sin(activeFrame * (0.11 + index * 0.02)) * 0.22;
        drawSvgGuideLine(widget, col, 2.2, col, 8.5, {
            className: index === 2 ? 'telemetry-red' : 'telemetry-cyan',
            opacity: 0.14 + pulse * 0.16
        });
        svgTextGlyph(widget.glyphLayer, index === 2 ? '◆' : '●', col, 2, {
            className: index === 2 ? 'telemetry-red' : 'telemetry-cyan',
            opacity: pulse
        });
    });
    svgLabel(widget.labelLayer, '10Hz', 3, 9, { className: 'telemetry-dim' });
    svgLabel(widget.labelLayer, '1k', 18, 9, { className: 'telemetry-dim' });
    svgLabel(widget.labelLayer, '10k', 33, 9, { className: 'telemetry-dim' });
    svgLabel(widget.labelLayer, `${Math.round(84 + Math.sin(activeFrame * 0.09) * 4)}%`, 33, 1, { className: 'telemetry-green' });
}

function renderSideDiagnosticPreview(frame = 0) {
    const widget = createSvgWidget('sideDiagnosticTelemetry', { cols: 36, rows: 9, cellHeight: 10, kind: 'side-diagnostic-live-svg' });
    if (!widget) return;
    const siteConnected = Boolean(AppState.connectedSiteId);
    drawDashboardGrid(widget, {
        className: AppState.networkOnline && siteConnected ? 'telemetry-green' : AppState.networkOnline ? 'telemetry-amber' : 'telemetry-red',
        colStep: 4,
        rowStep: 2
    });
    svgLabel(widget.labelLayer, 'DIAGNOSTIC BUS', 2, 1, { className: AppState.networkOnline && siteConnected ? 'telemetry-amber' : AppState.networkOnline ? 'telemetry-amber' : 'telemetry-red' });

    if (!AppState.networkOnline) {
        renderFixedGlyphLine(widget.glyphLayer, 4, 'NO CARRIER // SENSOR BUS PAUSED', {
            col: 3,
            width: 31,
            className: 'telemetry-red',
            opacity: 0.86
        });
        drawSvgGuideLine(widget, 3, 6, 33, 6, { className: 'telemetry-red', opacity: 0.28 });
        return;
    }

    if (!siteConnected) {
        renderFixedGlyphLine(widget.glyphLayer, 3, 'BRE SITE LINK REQUIRED', {
            col: 3,
            width: 31,
            className: 'telemetry-amber',
            opacity: 0.9
        });
        renderFixedGlyphLine(widget.glyphLayer, 5, 'CONNECT SITE FOR DIAGNOSTICS', {
            col: 3,
            width: 31,
            className: 'telemetry-cyan',
            opacity: 0.76
        });
        drawSvgGuideLine(widget, 3, 7, 33, 7, { className: 'telemetry-amber', opacity: 0.24 });
        return;
    }

    const traceA = [];
    const traceB = [];
    for (let index = 0; index <= 29; index++) {
        const col = 3 + index;
        const phase = frame * 0.1 + index * 0.34;
        const a = Math.sin(phase) * 0.74 + Math.sin(phase * 2.1 + 0.8) * 0.22 + Math.sin(index * 1.7 + frame * 0.045) * 0.09;
        const b = Math.cos(phase * 0.83 + 1.4) * 0.58 + Math.sin(phase * 2.7) * 0.18;
        traceA.push(widgetGridPixel(widget, col, 3.05 - a));
        traceB.push(widgetGridPixel(widget, col, 5.55 - b));
    }
    svgPolyline(widget.glyphLayer, traceA, { className: 'telemetry-green telemetry-trace-thin', opacity: 0.92 });
    svgPolyline(widget.glyphLayer, traceB, { className: 'telemetry-cyan telemetry-trace-thin', opacity: 0.86 });
    drawSvgGuideLine(widget, 3, 4.35, 33, 4.35, { className: 'telemetry-amber', opacity: 0.12 });

    const cursorCol = 3 + (frame % 30);
    drawSvgGuideLine(widget, cursorCol, 2, cursorCol, 6.8, { className: 'telemetry-amber', opacity: 0.18 });
    svgTextGlyph(widget.glyphLayer, '◆', cursorCol, 2, { className: 'telemetry-amber', opacity: 0.9 });
    svgLabel(widget.labelLayer, 'A', 33, 3, { className: 'telemetry-green' });
    svgLabel(widget.labelLayer, 'B', 33, 5.6, { className: 'telemetry-cyan' });

    for (let col = 3; col <= 33; col++) {
        const level = clampDiagnostic((Math.sin(frame * 0.08 + col * 0.55) + Math.sin(col * 1.3) + 2) / 4);
        const cls = level > 0.82 ? 'telemetry-red' : level > 0.62 ? 'telemetry-amber' : level > 0.42 ? 'telemetry-green' : 'telemetry-cyan';
        svgTextGlyph(widget.glyphLayer, densityGlyph(level), col, 8, { className: cls, opacity: 0.42 + level * 0.44 });
    }
    svgLabel(widget.labelLayer, `${Math.round(68 + Math.sin(frame * 0.07) * 6)}%`, 29, 1, { className: 'telemetry-green' });
}

function renderSideFacilityPreview(frame = 0) {
    const widget = createSvgWidget('sideFacilityTelemetry', { cols: 36, rows: 9, cellHeight: 10, kind: 'side-facility-live-svg' });
    if (!widget) return;
    drawDashboardGrid(widget, {
        className: AppState.networkOnline ? 'telemetry-amber' : 'telemetry-red',
        colStep: 6,
        rowStep: 2
    });
    svgLabel(widget.labelLayer, 'FACILITY MESH', 2, 1, { className: AppState.networkOnline ? 'telemetry-amber' : 'telemetry-red' });

    const nodes = [
        { id: 'CORE', col: 18, row: 4.4, glyph: '◇', className: 'telemetry-green' },
        { id: 'LAB', col: 8, row: 2.4, glyph: '□', className: 'telemetry-cyan' },
        { id: 'SEC', col: 28, row: 2.6, glyph: '△', className: 'telemetry-amber' },
        { id: 'GEN', col: 7, row: 6.4, glyph: '○', className: 'telemetry-amber' },
        { id: 'GATE', col: 29, row: 6.1, glyph: '◇', className: 'telemetry-red' },
        { id: 'HAB', col: 18, row: 7.1, glyph: '□', className: 'telemetry-green' }
    ];
    const byId = Object.fromEntries(nodes.map(node => [node.id, node]));
    const links = [
        ['CORE', 'LAB', 'telemetry-cyan'],
        ['CORE', 'SEC', 'telemetry-amber'],
        ['CORE', 'GEN', 'telemetry-amber'],
        ['CORE', 'GATE', 'telemetry-red'],
        ['CORE', 'HAB', 'telemetry-green'],
        ['LAB', 'SEC', 'telemetry-cyan'],
        ['GEN', 'HAB', 'telemetry-green']
    ];

    links.forEach(([from, to, cls]) => {
        const start = byId[from];
        const end = byId[to];
        drawSvgGuideLine(widget, start.col, start.row, end.col, end.row, {
            className: AppState.networkOnline ? cls : 'telemetry-red',
            opacity: cls === 'telemetry-red' ? 0.28 : 0.18
        });
    });
    drawSvgGuideCircle(widget, byId.CORE.col, byId.CORE.row, 4.6, { className: AppState.networkOnline ? 'telemetry-green' : 'telemetry-red', opacity: 0.08 });

    nodes.forEach(node => {
        const pulse = AppState.networkOnline && !prefersReducedMotion ? (Math.sin(frame * 0.12 + node.col) + 1) * 0.14 : 0;
        svgTextGlyph(widget.glyphLayer, node.glyph, node.col, node.row, {
            className: AppState.networkOnline ? node.className : 'telemetry-red',
            opacity: AppState.networkOnline ? 0.74 + pulse : 0.44
        });
        svgLabel(widget.labelLayer, node.id, node.col + 1, node.row - 0.35, {
            className: AppState.networkOnline ? node.className : 'telemetry-red',
            opacity: AppState.networkOnline ? 0.78 : 0.48
        });
    });

    if (!AppState.networkOnline) {
        renderFixedGlyphLine(widget.glyphLayer, 8, 'NET OFFLINE // MAP HOLD', {
            col: 4,
            width: 28,
            className: 'telemetry-red',
            opacity: 0.88
        });
        return;
    }

    renderSidePacket(widget, [[8, 2.4], [18, 4.4], [28, 2.6]], frame, 0.0, { glyph: '●', className: 'telemetry-cyan', speed: 0.028 });
    renderSidePacket(widget, [[7, 6.4], [18, 4.4], [29, 6.1]], frame, 0.37, { glyph: '◆', className: 'telemetry-red', speed: 0.022, opacity: 0.72 });
    renderSidePacket(widget, [[18, 7.1], [18, 4.4], [8, 2.4]], frame, 0.68, { glyph: '●', className: 'telemetry-green', speed: 0.033 });

    for (let col = 4; col <= 32; col++) {
        const active = ((col + Math.floor(frame / 2)) % 9) < 5;
        const cls = col > 25 ? 'telemetry-red' : col > 18 ? 'telemetry-amber' : 'telemetry-green';
        svgTextGlyph(widget.glyphLayer, active ? '█' : '░', col, 8, {
            className: active ? cls : 'telemetry-dim',
            opacity: active ? 0.72 : 0.24
        });
    }
}

function renderSideGlyphTelemetry(frame = 0) {
    renderSideSignalSpectrum(frame);
    renderSideDiagnosticPreview(frame);
    renderSideFacilityPreview(frame);
}

function renderDiagnosticDashboard(timestamp = performance.now(), options = {}) {
    const frame = diagnosticFrame;
    const phaseInfo = getDiagnosticPhase(frame);
    const phase = prefersReducedMotion ? 48 : frame;
    const forceWidgets = Boolean(options.force);
    const meta = phaseInfo.mode === 'boot'
        ? `SCAN BUS: READING SENSORS ${asciiBar(phaseInfo.sensorProgress, 12)}`
        : phaseInfo.mode === 'transition'
            ? `SCAN BUS: BRINGING PANELS ONLINE ${asciiBar(phaseInfo.sensorProgress, 12)}`
            : `SCAN BUS: LIVE DASHBOARD // FRAME ${String(frame).padStart(4, '0')}`;
    diagText('diagnosticMeta', meta);

    const network = statusNumber('diagnostic.network.level', 69 + Math.round(Math.sin(phase * 0.31) * 5), 0, 100);
    const generator = statusNumber('diagnostic.generator.level', 62 + Math.round(Math.sin(phase * 0.22) * 6), 0, 100);
    const mainPower = statusNumber('diagnostic.power.main', 61 + Math.round(Math.sin(phase * 0.16) * 4), 0, 100);
    const reservePower = statusNumber('diagnostic.power.reserve', 34 + Math.round(Math.cos(phase * 0.12) * 5), 0, 100);
    const lifeCount = Math.round(statusNumber('diagnostic.life.known', 14 + (phase % 9 === 0 ? 1 : 0), 0, 99));
    const unstableLife = Math.round(statusNumber('diagnostic.life.unstable', 2, 0, 99));
    const unknownLife = Math.round(statusNumber('diagnostic.life.unknown', 3 + (phase % 11 === 0 ? 1 : 0), 0, 99));
    const reactorOutput = statusNumber('diagnostic.reactor.output', 87.6 + Math.sin(phase * 0.12) * 1.8, 0, 100);
    const syncIntegrity = statusNumber('diagnostic.sync.integrity', 94.3 + Math.sin(phase * 0.09) * 1.1, 0, 100);
    const signalIntegrity = statusNumber('diagnostic.signal.integrity', 91.2 + Math.sin(phase * 0.08) * 1.4, 0, 100);

    const networkStatus = statusGet('diagnostic.network.status', 'DISCONNECTED').toUpperCase();
    const diagnosticWidgetCount = 10;
    let diagnosticSequenceIndex = 0;
    renderSequencedDiagnosticWidget({
        registryKey: 'network',
        widgetId: 'diagNetwork',
        cardId: 'diagNetworkCard',
        statusId: 'diagNetworkStatus',
        bootLabel: 'NET BUS',
        bootStatus: 'SCAN',
        armingStatus: 'SYNC',
        liveStatus: networkStatus === 'DISCONNECTED' ? 'NOISE' : networkStatus,
        liveCardState: statusState('diagnostic.network.state', 'warn'),
        liveRender: () => renderSpectrumDashboardWidget('diagNetwork', phase, network, phaseInfo),
        timestamp,
        frame,
        phaseInfo,
        sequenceIndex: diagnosticSequenceIndex++,
        sequenceTotal: diagnosticWidgetCount,
        forceWidgets
    });

    const securityStatus = statusGet('diagnostic.alarm.status', 'DIS DEGRADED').toUpperCase();
    renderSequencedDiagnosticWidget({
        registryKey: 'security',
        widgetId: 'diagSecurity',
        cardId: 'diagSecurityCard',
        statusId: 'diagSecurityStatus',
        bootLabel: 'SEC FABRIC',
        bootStatus: 'SOLVE',
        armingStatus: 'MESH',
        liveStatus: securityStatus === 'DIS DEGRADED' ? 'ELEVATED' : securityStatus,
        liveCardState: statusState('diagnostic.alarm.state', 'warn'),
        liveRender: () => renderTomographyDashboardWidget('diagSecurity', phase, phaseInfo),
        timestamp,
        frame,
        phaseInfo,
        sequenceIndex: diagnosticSequenceIndex++,
        sequenceTotal: diagnosticWidgetCount,
        forceWidgets
    });

    const outpostStatus = statusGet('diagnostic.outposts.status', 'LINK DEGRADED').toUpperCase();
    renderSequencedDiagnosticWidget({
        registryKey: 'outpost',
        widgetId: 'diagOutpost',
        cardId: 'diagOutpostCard',
        statusId: 'diagOutpostStatus',
        bootLabel: 'OUTPOSTS',
        bootStatus: 'PING',
        armingStatus: 'SWEEP',
        liveStatus: outpostStatus,
        liveCardState: statusState('diagnostic.outposts.state', 'warn'),
        liveRender: () => renderTacticalRadarDashboardWidget('diagOutpost', phase, phaseInfo),
        liveInterval: diagnosticRenderProfile().radar?.frameMs,
        timestamp,
        frame,
        phaseInfo,
        sequenceIndex: diagnosticSequenceIndex++,
        sequenceTotal: diagnosticWidgetCount,
        forceWidgets
    });

    const generatorStatus = statusGet('diagnostic.generator.status', 'SERVICE DUE').toUpperCase();
    renderSequencedDiagnosticWidget({
        registryKey: 'generator',
        widgetId: 'diagGenerator',
        cardId: 'diagGeneratorCard',
        statusId: 'diagGeneratorStatus',
        bootLabel: 'GATE SCOPE',
        bootStatus: 'CAL',
        armingStatus: 'LOCK',
        liveStatus: generatorStatus,
        liveCardState: statusState('diagnostic.generator.state', 'warn'),
        liveRender: () => renderGateScopeDashboardWidget('diagGenerator', phase, generator, phaseInfo),
        timestamp,
        frame,
        phaseInfo,
        sequenceIndex: diagnosticSequenceIndex++,
        sequenceTotal: diagnosticWidgetCount,
        forceWidgets
    });

    const powerStatus = statusGet('diagnostic.power.status', 'LOW RESERVE').toUpperCase();
    renderSequencedDiagnosticWidget({
        registryKey: 'power',
        widgetId: 'diagPower',
        cardId: 'diagPowerCard',
        statusId: 'diagPowerStatus',
        bootLabel: 'REACTOR',
        bootStatus: 'BUS',
        armingStatus: 'LOAD',
        liveStatus: powerStatus,
        liveCardState: statusState('diagnostic.power.state', 'warn'),
        liveRender: () => renderReactorSyncDashboardWidget('diagPower', phase, { output: reactorOutput, sync: syncIntegrity, mainPower, reservePower }, phaseInfo),
        timestamp,
        frame,
        phaseInfo,
        sequenceIndex: diagnosticSequenceIndex++,
        sequenceTotal: diagnosticWidgetCount,
        forceWidgets
    });

    const selectedVitalsSubject = selectedDiagnosticVitalSubject();
    const subjectCardState = selectedVitalsSubject.theme === 'red' ? 'alert' : selectedVitalsSubject.theme === 'amber' ? 'warn' : 'ok';
    renderSequencedDiagnosticWidget({
        registryKey: 'alarm',
        widgetId: 'diagAlarm',
        cardId: 'diagAlarmCard',
        statusId: 'diagAlarmStatus',
        bootLabel: 'BIOSCAN',
        bootStatus: 'BIO',
        armingStatus: 'VITAL',
        liveStatus: '',
        liveCardState: subjectCardState,
        liveRender: () => renderBioscanArrayDashboardWidget('diagAlarm', phase, { lifeCount, unstableLife, unknownLife }, phaseInfo),
        liveInterval: 30,
        timestamp,
        frame,
        phaseInfo,
        sequenceIndex: diagnosticSequenceIndex++,
        sequenceTotal: diagnosticWidgetCount,
        forceWidgets
    });

    renderSequencedDiagnosticWidget({
        registryKey: 'life',
        widgetId: 'diagLife',
        cardId: 'diagLifeCard',
        statusId: 'diagLifeStatus',
        bootLabel: 'VALUE',
        bootStatus: 'ROI',
        armingStatus: 'BURN',
        liveStatus: 'VALUE',
        liveCardState: 'warn',
        liveRender: () => renderShareholderValueDashboardWidget('diagLife', phase, phaseInfo),
        timestamp,
        frame,
        phaseInfo,
        sequenceIndex: diagnosticSequenceIndex++,
        sequenceTotal: diagnosticWidgetCount,
        forceWidgets
    });

    renderSequencedDiagnosticWidget({
        registryKey: 'events',
        widgetId: 'diagEvents',
        cardId: 'diagEventsCard',
        statusId: 'diagEventsStatus',
        bootLabel: 'EVENTS',
        bootStatus: 'BOOT',
        armingStatus: 'TAIL',
        liveStatus: 'FEED',
        liveCardState: statusState('diagnostic.alarm.state', 'warn'),
        liveRender: () => renderLiveEventDashboardWidget('diagEvents', phase, { lifeCount, unstableLife, unknownLife }, phaseInfo),
        timestamp,
        frame,
        phaseInfo,
        sequenceIndex: diagnosticSequenceIndex++,
        sequenceTotal: diagnosticWidgetCount,
        forceWidgets
    });

    renderSequencedDiagnosticWidget({
        registryKey: 'integrity',
        widgetId: 'diagIntegrity',
        cardId: 'diagIntegrityCard',
        statusId: 'diagIntegrityStatus',
        bootLabel: 'INTEGRITY',
        bootStatus: 'LOCK',
        armingStatus: 'CAL',
        liveStatus: `${signalIntegrity.toFixed(1)}%`,
        liveCardState: signalIntegrity < 72 ? 'alert' : signalIntegrity < 86 ? 'warn' : 'ok',
        liveRender: () => renderSignalIntegrityDashboardWidget('diagIntegrity', phase, signalIntegrity, phaseInfo),
        timestamp,
        frame,
        phaseInfo,
        sequenceIndex: diagnosticSequenceIndex++,
        sequenceTotal: diagnosticWidgetCount,
        forceWidgets
    });

    renderSequencedDiagnosticWidget({
        registryKey: 'uplink',
        widgetId: 'diagUplink',
        cardId: 'diagUplinkCard',
        statusId: 'diagUplinkStatus',
        bootLabel: 'UPLINK',
        bootStatus: 'PROC',
        armingStatus: 'SYNC',
        liveStatus: syncIntegrity > 88 ? 'LOCKED' : 'DRIFT',
        liveCardState: statusState('diagnostic.network.state', 'warn'),
        liveRender: () => renderUplinkDashboardWidget('diagUplink', phase, { sync: syncIntegrity }, phaseInfo),
        timestamp,
        frame,
        phaseInfo,
        sequenceIndex: diagnosticSequenceIndex++,
        sequenceTotal: diagnosticWidgetCount,
        forceWidgets
    });

    const defaultTicker = `FACILITY PASS: EXTERNAL COMMS DOWN // DEFENSE ARMED // DIS SENSORS DEGRADED // UNKNOWN LIFE SIGNS ${spinner(phase)} ${asciiSweep(phase, 20)}`;
    const phaseTicker = phaseInfo.mode === 'boot'
        ? `BASE STATUS BOOT ${['◢', '◐', '◒', '◣'][frame % 4]} READING SENSOR ARRAYS // WIREFRAME SOLVER PRECHARGE`
        : phaseInfo.mode === 'transition'
            ? `SENSOR BOOT COMPLETE // BLENDING CALIBRATION GRAPHS INTO LIVE TELEMETRY ${asciiSweep(phase, 18)}`
            : statusInterpolate(statusGet('diagnostic.ticker', defaultTicker), phase);
    diagText('diagnosticTicker', phaseTicker);
    if (!sideTelemetryAnimFrame) renderSideGlyphTelemetry(phase);
}

function runDiagnosticLoop(timestamp = 0) {
    if (!diagnosticActive || !AppState.networkOnline) return;
    if (document.hidden) {
        diagnosticAnimFrame = null;
        return;
    }
    const interval = Math.min(diagnosticRenderProfile().schedulerMs || effectsFrameMs(80, 140, 180), 33);
    if (!diagnosticLastRender || timestamp - diagnosticLastRender >= interval) {
        diagnosticLastRender = timestamp;
        diagnosticFrame++;
        renderDiagnosticDashboard(timestamp);
        if (diagnosticFrame < 32 && diagnosticFrame % 5 === 0) AudioEngine.keyClick();
    }
    diagnosticAnimFrame = requestAnimationFrame(runDiagnosticLoop);
}

function showDiagnosticDashboard() {
    if (!AppState.networkOnline) {
        printNetworkUnavailable('DIAGNOSTIC');
        return;
    }
    if (!AppState.connectedSiteId) {
        if (typeof printConnectedSiteRequired === 'function') printConnectedSiteRequired('DIAGNOSTIC');
        return;
    }
    if (window.TerminalSessionRestore?.openTool) {
        window.TerminalSessionRestore.openTool('diagnostic', 'diagnostics-screen.html');
        return;
    }
    const overlay = document.getElementById('diagnosticOverlay');
    if (!overlay || overlay.classList.contains('active')) return;
    diagnosticActive = true;
    setAppState({ activeOverlay: 'diagnostic' }, { resetSelection: false });
    diagnosticFrame = prefersReducedMotion ? 48 : 0;
    diagnosticLastRender = 0;
    resetDiagnosticWidgetRegistry();
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    renderDiagnosticDashboard(performance.now(), { force: true });
    AudioEngine.bootBeep();
    Animator.dialogOpen(overlay);
    if (!prefersReducedMotion) {
        diagnosticAnimFrame = requestAnimationFrame(runDiagnosticLoop);
    }
}

function closeDiagnosticDashboard() {
    const overlay = document.getElementById('diagnosticOverlay');
    if (!overlay || !overlay.classList.contains('active')) return;
    diagnosticActive = false;
    setAppState({ activeOverlay: 'none' }, { resetSelection: false });
    if (diagnosticAnimFrame) {
        cancelAnimationFrame(diagnosticAnimFrame);
        diagnosticAnimFrame = null;
    }
    resetDiagnosticWidgetRegistry();
    AudioEngine.pageFlip();
    Animator.dialogClose(overlay, () => {
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
    });
}
