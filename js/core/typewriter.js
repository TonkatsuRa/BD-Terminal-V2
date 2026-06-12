// js/core/typewriter.js — the single typewriter implementation.
// The old codebase had two near-identical functions (typeTextSmooth and
// typeColoredTextSmooth). They are now one parameterized engine that types a
// list of segments; the plain-text case is a one-segment list.

import { motion, TYPEWRITER_CONFIG } from './effects.js';

/**
 * @typedef {{text: string, className: (string|null)}} TypeSegment
 */

/**
 * Reveal segments inside `element` character by character with RAF pacing.
 * Plain segments become text nodes, colored segments <span class="t-X"> nodes.
 * Honors prefers-reduced-motion (instant render).
 *
 * @param {HTMLElement} element - target; existing children are cleared
 * @param {TypeSegment[]} segments
 * @param {Object} [options]
 * @param {string} [options.activeClass='terminal-typewriter-active']
 * @param {number} [options.interval] - ms between chars (used when no charsPerSecond)
 * @param {number} [options.charsPerSecond] - takes precedence over interval
 * @param {number} [options.maxCharsPerFrame=1]
 * @param {() => boolean} [options.shouldCancel] - polled each frame
 * @param {(frame: number|null) => void} [options.onFrame] - receives RAF ids
 * @param {(index: number, char: string) => void} [options.onChar]
 * @returns {Promise<{completed: boolean, cancelled: boolean}>}
 */
export function typeSegments(element, segments, options = {}) {
    const activeClass = options.activeClass || 'terminal-typewriter-active';
    const interval = Math.max(1, Number(options.interval ?? TYPEWRITER_CONFIG.charInterval));
    const charsPerSecond = Math.max(0, Number(options.charsPerSecond || 0));
    const maxCharsPerFrame = Math.max(1, Number(options.maxCharsPerFrame || 1));
    const shouldCancel = typeof options.shouldCancel === 'function' ? options.shouldCancel : () => false;
    const onFrame = typeof options.onFrame === 'function' ? options.onFrame : null;
    const onChar = typeof options.onChar === 'function' ? options.onChar : null;

    if (!element) return Promise.resolve({ completed: false, cancelled: true });
    element.textContent = '';

    const safeSegments = Array.isArray(segments) ? segments.filter(s => s && s.text != null) : [];
    const targets = safeSegments.map(seg => {
        let textNode;
        if (seg.className) {
            const span = document.createElement('span');
            span.className = seg.className;
            textNode = document.createTextNode('');
            span.appendChild(textNode);
            element.appendChild(span);
        } else {
            textNode = document.createTextNode('');
            element.appendChild(textNode);
        }
        return { node: textNode, full: String(seg.text) };
    });

    const total = targets.reduce((n, t) => n + t.full.length, 0);

    if (motion.reduced || !total) {
        targets.forEach(t => { t.node.data = t.full; });
        element.classList.remove(activeClass);
        return Promise.resolve({ completed: true, cancelled: false });
    }

    element.classList.add(activeClass);
    let index = 0;
    let lastStepTime = 0;
    let charBudget = 0;
    let revealed = ''; // concatenated text for onChar callbacks
    targets.forEach(t => { revealed += t.full; });

    function applyIndex(newIndex) {
        let remaining = newIndex;
        for (let i = 0; i < targets.length; i++) {
            const t = targets[i];
            if (remaining >= t.full.length) {
                t.node.data = t.full;
                remaining -= t.full.length;
            } else {
                t.node.data = t.full.slice(0, remaining);
                for (let j = i + 1; j < targets.length; j++) targets[j].node.data = '';
                return;
            }
        }
    }

    return new Promise(resolve => {
        const finish = (cancelled = false) => {
            element.classList.remove(activeClass);
            if (onFrame) onFrame(null);
            resolve({ completed: !cancelled, cancelled });
        };

        const tick = (timestamp = 0) => {
            if (shouldCancel()) { finish(true); return; }
            if (!lastStepTime) lastStepTime = timestamp;
            const elapsed = Math.min(50, Math.max(0, timestamp - lastStepTime));
            let charsThisFrame = 0;

            if (charsPerSecond > 0) {
                charBudget += (elapsed * charsPerSecond) / 1000;
                charsThisFrame = Math.min(maxCharsPerFrame, total - index, Math.floor(charBudget));
                if (charsThisFrame > 0) charBudget -= charsThisFrame;
                lastStepTime = timestamp;
            } else if (timestamp - lastStepTime >= interval) {
                charsThisFrame = 1;
                lastStepTime = timestamp;
            }

            if (charsThisFrame > 0) {
                const startIndex = index;
                index = Math.min(total, index + charsThisFrame);
                applyIndex(index);
                if (onChar) {
                    for (let i = startIndex; i < index; i++) onChar(i + 1, revealed.charAt(i));
                }
            }

            if (index < total) {
                const frame = requestAnimationFrame(tick);
                if (onFrame) onFrame(frame);
            } else {
                finish(false);
            }
        };

        const frame = requestAnimationFrame(tick);
        if (onFrame) onFrame(frame);
    });
}

/** Back-compat wrapper: type a plain string. */
export function typeTextSmooth(element, text, options = {}) {
    return typeSegments(element, [{ text: String(text ?? ''), className: null }], options);
}

/** Back-compat wrapper: type pre-parsed color segments. */
export function typeColoredTextSmooth(element, segments, options = {}) {
    return typeSegments(element, segments, options);
}
