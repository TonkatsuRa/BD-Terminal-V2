// js/core/ascii.js — small ASCII animation primitives (bars, sweeps, graphs)
// used by the status interpolator and the database decrypt animation.
// NOTE: js/legacy/diagnostics.js declares identical copies for its own
// rendering (it is a classic script); keep behavior in sync.

export function asciiBar(value, width = 18) {
    const safeValue = Math.max(0, Math.min(100, Math.round(value)));
    const filled = Math.round((safeValue / 100) * width);
    return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}] ${String(safeValue).padStart(3, '0')}%`;
}

export function asciiSweep(frame, width = 24) {
    const pos = Math.abs((frame % (width * 2 - 2)) - (width - 1));
    let output = '';
    for (let i = 0; i < width; i++) output += i === pos ? 'X' : '.';
    return `[${output}]`;
}

export function asciiGraph(frame, width = 28) {
    const chars = '._-~=+#';
    let output = '';
    for (let i = 0; i < width; i++) {
        const level = Math.abs(Math.sin((frame + i) * 0.42) + Math.sin((frame * 0.55 + i) * 0.19));
        output += chars[Math.min(chars.length - 1, Math.floor(level * 3.2))];
    }
    return output;
}

export function spinner(frame) {
    return ['|', '/', '-', '\\'][frame % 4];
}

export function heartbeat(frame, width = 44) {
    const pattern = '__/\\/\\____/\\___';
    let output = '';
    for (let i = 0; i < width; i++) output += pattern[(frame + i) % pattern.length];
    return output;
}
