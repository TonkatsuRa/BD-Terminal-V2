// js/terminal/progress.js — animated progress bars and boot-style spinner
// steps printed into the transcript. Shared by the network/site connection
// logs and the database mount sequence.

import { motion } from '../core/effects.js';
import { AudioEngine } from '../core/audio.js';
import { appendMutableOutputLine, renderTranscriptInstantFromBuffer } from './output.js';

const SPINNER = ['/', '-', '\\', '|'];

/**
 * Render an animated `[####----] 042%` progress row.
 * Resolves when the bar completes; returns appendMutableOutputLine so callers
 * can keep appending related lines.
 */
export async function runTerminalProgressBar(options = {}) {
    // Flush any queued typewriter lines first so the bar appends in order.
    renderTranscriptInstantFromBuffer();

    const heading = String(options.heading || '').trim();
    const label = String(options.label || 'TERMINAL BUS').trim().toUpperCase();
    const width = Math.max(8, Number.parseInt(options.width, 10) || (window.innerWidth < 520 ? 18 : 28));
    const duration = Math.max(1, motion.reduced
        ? Math.min(Number(options.duration) || 520, 520)
        : Number(options.duration) || 1600);

    appendMutableOutputLine('', '');
    if (heading) appendMutableOutputLine(heading, options.headingClass || 't-cyan');
    const row = appendMutableOutputLine(`${SPINNER[0]} ${label} [${'-'.repeat(width)}] 000%`, options.className || 't-amber');
    const start = performance.now();
    let lastTick = 0;

    await new Promise(resolve => {
        function frame(now = performance.now()) {
            const elapsed = Math.max(0, Math.min(duration, now - start));
            const progress = elapsed / duration;
            const filled = Math.min(width, Math.floor(progress * width));
            const bar = `${'#'.repeat(filled)}${'-'.repeat(width - filled)}`;
            const percent = String(Math.floor(progress * 100)).padStart(3, '0');
            const glyph = SPINNER[Math.floor(elapsed / 120) % SPINNER.length];
            row.update(`${glyph} ${label} [${bar}] ${percent}%`, progress >= 1
                ? (options.doneClassName || 't-cyan')
                : (options.className || 't-amber'));

            if (now - lastTick > 620) {
                lastTick = now;
                AudioEngine.keyClick();
            }

            if (progress >= 1) {
                row.update(`> ${label} [${'#'.repeat(width)}] OK`, options.doneClassName || 't-cyan');
                if (options.successTone !== false) AudioEngine.successTone();
                resolve();
                return;
            }
            requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    });

    return appendMutableOutputLine;
}

/**
 * Boot-style step: prints the line with a rotating spinner for ~spinMs, then
 * swaps in the final `[ OK ]` tag. Does not clear or re-render the transcript.
 */
export async function bootStyleStep(text, options = {}) {
    const className = options.className || 't-dim';
    const doneClass = options.doneClassName || 't-cyan';
    const tag = options.tag || 'OK';
    const spinMs = motion.reduced ? 80 : (options.spinMs ?? 320);
    const settleMs = motion.reduced ? 0 : (options.settleMs ?? 70);

    const row = appendMutableOutputLine(`${text} [/]`, className);
    const start = performance.now();
    let lastClick = 0;

    await new Promise(resolve => {
        function tick(now = performance.now()) {
            const elapsed = now - start;
            if (elapsed >= spinMs) {
                row.update(`${text} [ ${tag} ]`, doneClass);
                resolve();
                return;
            }
            row.update(`${text} [${SPINNER[Math.floor(elapsed / 95) % SPINNER.length]}]`, className);
            if (now - lastClick > 240) {
                lastClick = now;
                AudioEngine.keyClick();
            }
            requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    });

    if (settleMs > 0) await new Promise(r => setTimeout(r, settleMs));
}

/** Boot-style header line (instant, with a small settle pause). */
export async function bootStyleHeader(text, className = 't-amber') {
    appendMutableOutputLine(text, className);
    if (!motion.reduced) await new Promise(r => setTimeout(r, 90));
}
