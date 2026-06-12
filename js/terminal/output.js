// js/terminal/output.js — the CLI transcript: buffering, typewriter queue,
// line rendering (plain / colored / embedded image), command echo.
//
// Rewrite notes vs the old codebase:
// - The dead pagination machinery (outputPages, buildOutputPages,
//   recalculatePages, linesPerPage) is gone. The transcript has been a
//   scrolling buffer for a while; this module is honest about it.
// - print() now accepts an options argument ({instant}) — the old signature
//   silently dropped it (session-restore was already passing it).

import { getById, clearElement } from '../core/dom.js';
import { IMG_LINE_RE } from '../core/utils.js';
import { motion, TYPEWRITER_CONFIG } from '../core/effects.js';
import { AudioEngine } from '../core/audio.js';
import { typeSegments } from '../core/typewriter.js';
import { lineHasColorMarkup, parseColorSegments } from '../format/colors.js';

const COMMAND_PROMPT = 'ARES>';

let outputBuffer = [];
let typewriterQueue = [];
let isTyping = false;
let skipTypewriter = false;
let typewriterRunId = 0;
let typewriterFrame = null;
let runtimeSuspendedForMap = false;
let outputGroupCounter = 0;
let lastTypewriterClickAt = 0;

// Called when the typewriter queue drains — wired by app.js (hologram start).
let onQueueIdle = null;
export function setQueueIdleHook(fn) {
    onQueueIdle = typeof fn === 'function' ? fn : null;
}

/** Live buffer access (session snapshots). */
export function getOutputBuffer() {
    return outputBuffer;
}

/** Replace the buffer wholesale (session restore). Does not touch the DOM. */
export function setOutputBuffer(lines) {
    outputBuffer = Array.isArray(lines) ? lines : [];
}

export function isTerminalTyping() {
    return isTyping;
}

function setTerminalTypingState(active) {
    isTyping = Boolean(active);
    if (document.body) {
        document.body.classList.toggle('terminal-typing', isTyping && !motion.reduced);
    }
}

export function scrollTranscriptToBottom() {
    const output = getById('output');
    if (output) output.scrollTop = output.scrollHeight;
}

export function scrollTranscriptBy(direction) {
    const output = getById('output');
    if (!output) return;
    const amount = Math.max(120, Math.floor(output.clientHeight * 0.72));
    output.scrollBy({ top: amount * direction, behavior: motion.reduced ? 'auto' : 'smooth' });
    AudioEngine.pageFlip();
}

/* ------------------------------------------------------------------ *
 * Line rendering
 * ------------------------------------------------------------------ */

export function lineIsImageMarkdown(text) {
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

function renderColoredText(element, text) {
    if (!element) return;
    element.textContent = '';
    parseColorSegments(text).forEach(seg => {
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

/**
 * Routing hub: image lines → <img>; color-tagged lines → spans; otherwise
 * plain textContent. Never uses innerHTML — database content is untrusted.
 */
export function setLineText(element, text) {
    if (lineIsImageMarkdown(text)) renderImageLine(element, text);
    else if (lineHasColorMarkup(text)) renderColoredText(element, text);
    else element.textContent = String(text ?? '');
}

function appendRenderedLine(line) {
    const output = getById('output');
    if (!output) return null;
    const div = document.createElement('div');
    const typewriterClass = String(line.text || '').length ? 'terminal-typewriter-line' : '';
    div.className = `output-line ${typewriterClass} ${line.className || ''}`.trim();
    setLineText(div, line.text);
    output.appendChild(div);
    return div;
}

/* ------------------------------------------------------------------ *
 * Buffering & typewriter queue
 * ------------------------------------------------------------------ */

export function enqueueOutputLine(text, className = '', options = {}) {
    const line = {
        text: String(text ?? ''),
        className: String(className || ''),
        groupId: options.groupId || ''
    };
    outputBuffer.push(line);

    if (options.instant || skipTypewriter || motion.reduced) {
        appendRenderedLine(line);
        scrollTranscriptToBottom();
        return;
    }

    typewriterQueue.push({ text: line.text, className: line.className });
    if (!isTyping && !runtimeSuspendedForMap) {
        typewriterRunId++;
        processTypewriterQueue(typewriterRunId);
    }
}

/** Re-render the whole transcript instantly from the buffer (no typewriter). */
export function renderTranscriptInstantFromBuffer() {
    const output = getById('output');
    if (!output) return;
    cancelTypewriter();
    clearElement(output);
    outputBuffer.forEach(line => appendRenderedLine(line));
    scrollTranscriptToBottom();
}

/**
 * Append a line whose text can be updated in place (progress bars, spinners).
 * @returns {{update: (text: string, className?: string) => void}}
 */
export function appendMutableOutputLine(text = '', className = '') {
    const line = { text: String(text ?? ''), className: String(className || ''), groupId: '' };
    outputBuffer.push(line);
    const output = getById('output');
    if (!output) {
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

    return {
        update(nextText, nextClassName) {
            line.text = String(nextText ?? '');
            if (nextClassName !== undefined) line.className = String(nextClassName || '');
            div.className = `output-line terminal-mutable-line ${line.className}`.trim();
            setLineText(div, line.text);
            scrollTranscriptToBottom();
        }
    };
}

export function appendCommandEcho(commandText) {
    const clean = String(commandText || '').trim();
    if (!clean) return;
    const needsDivider = outputBuffer.some(line => String(line.text || '').trim());
    if (needsDivider) enqueueOutputLine('--- ARES COMMAND CHANNEL --------------------------------', 'cli-divider t-dim', { instant: true });
    enqueueOutputLine(`${COMMAND_PROMPT} ${clean}`, 'cli-command-line t-amber', { instant: true });
}

function isOutputPageBreak(text) {
    return ['@pagebreak', '[pagebreak]', '{pagebreak}'].includes(String(text || '').trim().toLowerCase());
}

/**
 * Main print entry point. Splits on newlines; legacy @pagebreak markers in
 * content files render as blank lines.
 * @param {string} text
 * @param {string} [className]
 * @param {{instant?: boolean}} [options]
 */
export function print(text, className = '', options = {}) {
    String(text ?? '').split('\n').forEach(line => {
        if (isOutputPageBreak(line)) {
            enqueueOutputLine('', '', options);
            return;
        }
        enqueueOutputLine(line, className, options);
    });
}

/** Print a group of lines sharing a groupId (kept for buffer semantics). */
export function addOutputGroup(lines) {
    const group = lines.filter(line => line && typeof line.text === 'string');
    if (!group.length) return;
    const groupId = `group-${++outputGroupCounter}`;
    group.forEach(line => enqueueOutputLine(line.text, line.className || '', { groupId }));
}

function isHelpHeadingLine(text, className = '') {
    if (!String(text || '').trim()) return false;
    const classes = String(className || '').split(/\s+/);
    return classes.includes('t-cyan') || classes.includes('t-red');
}

/** Print help-style line lists grouped under their headings. */
export function renderHelpLinesGrouped(lines) {
    let group = [];
    const flushGroup = () => {
        if (group.length) {
            addOutputGroup(group);
            group = [];
        }
    };
    lines.forEach(line => {
        if (isOutputPageBreak(line.text)) {
            flushGroup();
            enqueueOutputLine('', '');
            return;
        }
        if (isHelpHeadingLine(line.text, line.className) && group.length) flushGroup();
        group.push(line);
    });
    flushGroup();
}

function cancelTypewriter() {
    if (typewriterFrame) {
        cancelAnimationFrame(typewriterFrame);
        typewriterFrame = null;
    }
    typewriterQueue = [];
    typewriterRunId++;
    setTerminalTypingState(false);
}

/**
 * Clear the transcript. Requires {force: true} — guards against accidental
 * clears from stale code paths (mirrors the old API).
 */
export function clearOutput(options = {}) {
    const force = options === true || options.force === true;
    if (!force) return;
    cancelTypewriter();
    outputBuffer = [];
    outputGroupCounter = 0;
    clearElement(getById('output'));
}

function processTypewriterQueue(runId = typewriterRunId) {
    if (runId !== typewriterRunId) return;
    if (runtimeSuspendedForMap) {
        setTerminalTypingState(false);
        typewriterFrame = null;
        return;
    }
    if (typewriterQueue.length === 0) {
        setTerminalTypingState(false);
        typewriterFrame = null;
        if (onQueueIdle) onQueueIdle();
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

    // Never type image lines character-by-character (100KB Base64 strings).
    if (skipTypewriter || line.text.length === 0 || lineIsImageMarkdown(line.text)) {
        setLineText(div, line.text);
        div.classList.remove('terminal-typewriter-active');
        scrollTranscriptToBottom();
        queueNextLine();
        return;
    }

    const segments = lineHasColorMarkup(line.text)
        ? parseColorSegments(line.text)
        : [{ text: line.text, className: null }];

    typeSegments(div, segments, {
        charsPerSecond: TYPEWRITER_CONFIG.terminalCharsPerSecond,
        maxCharsPerFrame: TYPEWRITER_CONFIG.terminalMaxCharsPerFrame,
        shouldCancel: () => runId !== typewriterRunId,
        onFrame: frame => { typewriterFrame = frame; },
        onChar: index => {
            if (index % 12 === 0) scrollTranscriptToBottom();
            const now = performance.now();
            if (now - lastTypewriterClickAt >= TYPEWRITER_CONFIG.terminalKeyClickMs) {
                lastTypewriterClickAt = now;
                AudioEngine.keyClick();
            }
        }
    }).then(result => {
        if (!result || result.cancelled || runId !== typewriterRunId) return;
        scrollTranscriptToBottom();
        queueNextLine();
    });
}

/* ------------------------------------------------------------------ *
 * Map handoff (iframe overlay) — pause and resume the output runtime.
 * ------------------------------------------------------------------ */

export function suspendTerminalRuntimeForMap() {
    runtimeSuspendedForMap = true;
    if (typewriterFrame) {
        cancelAnimationFrame(typewriterFrame);
        typewriterFrame = null;
    }
    typewriterRunId++;
    setTerminalTypingState(false);
}

export function resumeTerminalRuntimeAfterMap() {
    runtimeSuspendedForMap = false;
    if (typewriterQueue.length && !isTyping) {
        typewriterRunId++;
        processTypewriterQueue(typewriterRunId);
    }
}

export function isRuntimeSuspendedForMap() {
    return runtimeSuspendedForMap;
}
