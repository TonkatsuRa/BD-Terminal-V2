// js/format/status-format.js — status/content profile parser.
// Pure module (no DOM). Parses [section] / "## section" headers with
// key = value lines, plus ``` fenced terminal text blocks with @color tags.

import { normalizeStatusKey, cleanStatusValue } from '../core/utils.js';

const BLOCK_STYLES = {
    dim: 't-dim',
    bright: 't-bright',
    cyan: 't-cyan',
    amber: 't-amber',
    red: 't-red',
    magenta: 't-magenta'
};

/** Parse a single fenced-block line: "@amber TEXT" → {text, className}. */
export function parseTerminalBlockLine(rawLine) {
    const match = String(rawLine ?? '').match(/^@([a-z]+)\s?(.*)$/i);
    if (!match) return { text: String(rawLine ?? ''), className: '' };
    const className = BLOCK_STYLES[match[1].toLowerCase()];
    return className
        ? { text: match[2], className }
        : { text: String(rawLine ?? ''), className: '' };
}

/**
 * Parse a status/content profile document.
 * @param {string} content
 * @param {string} [source]
 * @returns {{source: string, loaded: boolean, values: Object<string,string>}}
 */
export function parseStatusProfile(content, source) {
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

/** Sort status section ids numerically when possible, lexically otherwise. */
export function sortStatusIds(a, b) {
    const an = Number.parseInt(a, 10);
    const bn = Number.parseInt(b, 10);
    if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
    return a.localeCompare(b);
}
