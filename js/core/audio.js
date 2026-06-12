// js/core/audio.js — WebAudio synth engine for terminal sounds.
// No app-state dependency: when `enabled` changes, AudioEngine.onChange is
// invoked (wired in app.js) so the state layer stays decoupled.

export const AudioEngine = {
    ctx: null,
    enabled: true,
    initialized: false,
    masterVolume: 1,
    outputBoost: 2,
    lastToneAt: {},
    pendingStartupJingle: false,
    startupJinglePlayed: false,
    /** Called when `enabled` changes — assigned by app wiring. */
    onChange: null,

    init() {
        if (this.initialized) return;
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) throw new Error('AudioContext unavailable');
            this.ctx = new AudioContextClass();
            this.initialized = true;
        } catch (_) {
            this.enabled = false;
            this.notifyChange();
        }
    },

    notifyChange() {
        if (typeof this.onChange === 'function') this.onChange(this.enabled);
    },

    /** Back-compat alias used by legacy tool screens. */
    updateSoundStatus() {
        this.notifyChange();
    },

    setEnabled(value) {
        this.enabled = Boolean(value);
        if (this.enabled) {
            this.init();
            this.resume();
            this.flushPendingAudio();
        }
        this.notifyChange();
    },

    setMasterVolume(value) {
        this.masterVolume = Math.max(0, Math.min(1, Number(value) || 0));
    },

    resume() {
        if (!this.initialized) this.init();
        const ctx = this.ctx;
        if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
            const result = ctx.resume();
            if (result && typeof result.then === 'function') {
                result.then(() => this.flushPendingAudio()).catch(() => {});
            }
        } else {
            this.flushPendingAudio();
        }
    },

    flushPendingAudio() {
        if (this.pendingStartupJingle && this.canPlay()) this.startupJingle();
    },

    cancelStartupJingle() {
        this.pendingStartupJingle = false;
    },

    canPlay() {
        return this.enabled && this.ctx && this.ctx.state !== 'suspended';
    },

    isThrottled(key, minInterval) {
        if (!key || !this.ctx) return false;
        const now = this.ctx.currentTime;
        if (now - (this.lastToneAt[key] || 0) < minInterval) return true;
        this.lastToneAt[key] = now;
        return false;
    },

    tone(options = {}) {
        if (!this.canPlay()) return;
        try {
            const ctx = this.ctx;
            const destination = ctx.destination;
            if (!destination) return;
            if (this.isThrottled(options.throttleKey, options.minInterval || 0.03)) return;

            const duration = options.duration || 0.1;
            const start = ctx.currentTime + (options.startOffset || 0);
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            let filter = null;

            osc.type = options.type || 'sine';
            osc.frequency.setValueAtTime(Math.max(1, options.frequency || 180), start);
            if (options.endFrequency) {
                const endFrequency = Math.max(1, options.endFrequency);
                if (options.frequencyRamp === 'linear') {
                    osc.frequency.linearRampToValueAtTime(endFrequency, start + duration);
                } else {
                    osc.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
                }
            }

            if (options.filterFrequency) {
                filter = ctx.createBiquadFilter();
                filter.type = options.filterType || 'lowpass';
                filter.frequency.setValueAtTime(options.filterFrequency, start);
                if (options.filterEndFrequency) {
                    filter.frequency.exponentialRampToValueAtTime(Math.max(1, options.filterEndFrequency), start + duration);
                }
                osc.connect(filter);
                filter.connect(gain);
            } else {
                osc.connect(gain);
            }

            gain.connect(destination);
            const attack = options.attack || 0.006;
            const outputGain = Math.max(0.0001, Math.min(0.18, (options.gain || 0.04) * this.outputBoost * this.masterVolume));
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(outputGain, start + attack);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

            osc.start(start);
            osc.stop(start + duration + 0.03);
            osc.onended = () => {
                try {
                    osc.disconnect();
                    gain.disconnect();
                    if (filter) filter.disconnect();
                } catch (_) {}
            };
        } catch (_) {}
    },

    sequence(steps) {
        if (!this.canPlay()) return;
        steps.forEach(step => this.tone(step));
    },

    keyClick() {
        if (this.isThrottled('key', 0.04)) return;
        const base = 48 + Math.random() * 18;
        this.tone({ type: 'square', frequency: base, endFrequency: 32, duration: 0.028, gain: 0.052, filterFrequency: 190, attack: 0.002 });
        this.tone({ type: 'triangle', frequency: base * 0.5, duration: 0.045, gain: 0.018, filterFrequency: 95, attack: 0.002, startOffset: 0.003 });
    },

    bootBeep() {
        this.sequence([
            { type: 'triangle', frequency: 72, endFrequency: 104, frequencyRamp: 'linear', duration: 0.11, gain: 0.064, filterFrequency: 180, attack: 0.004 },
            { type: 'sine', frequency: 36, duration: 0.16, gain: 0.026, filterFrequency: 120, startOffset: 0.01 }
        ]);
    },

    errorBuzz() {
        this.sequence([
            { type: 'sawtooth', frequency: 46, endFrequency: 29, duration: 0.24, gain: 0.082, filterFrequency: 170, filterEndFrequency: 95, attack: 0.005 },
            { type: 'square', frequency: 31, duration: 0.18, gain: 0.034, filterFrequency: 110, startOffset: 0.045 }
        ]);
    },

    menuMove() {
        this.tone({ type: 'triangle', frequency: 68, duration: 0.045, gain: 0.05, filterFrequency: 150, throttleKey: 'menuMove', minInterval: 0.035, attack: 0.002 });
    },

    menuSelect() {
        this.sequence([
            { type: 'triangle', frequency: 64, endFrequency: 92, frequencyRamp: 'linear', duration: 0.075, gain: 0.07, filterFrequency: 190, attack: 0.003 },
            { type: 'sine', frequency: 38, duration: 0.13, gain: 0.03, filterFrequency: 100, startOffset: 0.025 }
        ]);
    },

    pageFlip() {
        this.sequence([
            { type: 'sawtooth', frequency: 78, endFrequency: 43, frequencyRamp: 'linear', duration: 0.11, gain: 0.066, filterFrequency: 210, attack: 0.003 },
            { type: 'triangle', frequency: 39, duration: 0.1, gain: 0.025, filterFrequency: 120, startOffset: 0.04 }
        ]);
    },

    successTone() {
        this.sequence([
            { type: 'triangle', frequency: 70, duration: 0.09, gain: 0.056, filterFrequency: 180, attack: 0.004 },
            { type: 'triangle', frequency: 96, duration: 0.11, gain: 0.052, filterFrequency: 210, startOffset: 0.095 },
            { type: 'sine', frequency: 35, duration: 0.22, gain: 0.02, filterFrequency: 90, startOffset: 0.02 }
        ]);
    },

    startupSequence() {
        this.sequence([
            { type: 'sawtooth', frequency: 24, endFrequency: 54, duration: 0.62, gain: 0.075, filterFrequency: 80, filterEndFrequency: 170, attack: 0.018 },
            { type: 'triangle', frequency: 56, duration: 0.07, gain: 0.05, filterFrequency: 150, startOffset: 0.45 },
            { type: 'triangle', frequency: 74, duration: 0.07, gain: 0.052, filterFrequency: 170, startOffset: 0.55 },
            { type: 'triangle', frequency: 56, duration: 0.07, gain: 0.046, filterFrequency: 150, startOffset: 0.65 },
            { type: 'sine', frequency: 92, duration: 0.1, gain: 0.052, filterFrequency: 190, startOffset: 0.76 }
        ]);
    },

    midiNote(frequency, startOffset, duration, gain = 0.025) {
        this.tone({ type: 'triangle', frequency, endFrequency: frequency * 0.997, duration, gain, filterFrequency: 720, filterEndFrequency: 420, attack: 0.022, startOffset });
        this.tone({ type: 'sine', frequency: frequency * 2, duration: duration * 0.72, gain: gain * 0.28, filterFrequency: 920, filterEndFrequency: 520, attack: 0.018, startOffset: startOffset + 0.006 });
        this.tone({ type: 'triangle', frequency: frequency * 1.006, duration: duration * 0.92, gain: gain * 0.36, filterFrequency: 560, attack: 0.026, startOffset: startOffset + 0.012 });
    },

    midiChord(frequencies, startOffset, duration, gain = 0.02) {
        frequencies.forEach((frequency, index) => {
            this.midiNote(frequency, startOffset + index * 0.012, duration, gain);
        });
    },

    startupJingle() {
        if (this.startupJinglePlayed) return;
        if (!this.canPlay()) {
            this.pendingStartupJingle = true;
            this.init();
            return;
        }
        this.pendingStartupJingle = false;
        this.startupJinglePlayed = true;

        this.tone({ type: 'sine', frequency: 34, endFrequency: 48, frequencyRamp: 'linear', duration: 1.9, gain: 0.026, filterFrequency: 100, filterEndFrequency: 145, attack: 0.08 });
        this.midiChord([130.81, 196.0, 261.63], 0.02, 0.72, 0.018);
        this.midiChord([164.81, 246.94, 329.63], 0.34, 0.72, 0.018);
        this.midiChord([196.0, 293.66, 392.0], 0.72, 0.82, 0.017);
        this.midiChord([174.61, 261.63, 349.23], 1.08, 0.72, 0.015);
        this.midiChord([130.81, 196.0, 261.63, 392.0], 1.42, 1.35, 0.016);
        this.tone({ type: 'triangle', frequency: 65.41, duration: 1.35, gain: 0.02, filterFrequency: 170, attack: 0.045, startOffset: 1.42 });
    },

    accessGranted() {
        this.sequence([52, 68, 86, 108].map((frequency, index) => ({
            type: 'triangle', frequency, duration: 0.115, gain: 0.058, filterFrequency: 180, startOffset: index * 0.09
        })));
    },

    dataLoaded() {
        const steps = [];
        for (let i = 0; i < 6; i++) {
            steps.push({ type: 'square', frequency: 52 + i * 9, duration: 0.04, gain: 0.05, filterFrequency: 170, startOffset: i * 0.045 });
        }
        steps.push({ type: 'triangle', frequency: 92, duration: 0.11, gain: 0.06, filterFrequency: 200, startOffset: 0.29 });
        steps.push({ type: 'sine', frequency: 42, duration: 0.22, gain: 0.026, filterFrequency: 100, startOffset: 0.34 });
        this.sequence(steps);
    },

    decryptSound() {
        const steps = [];
        for (let i = 0; i < 10; i++) {
            steps.push({ type: 'square', frequency: 42 + Math.random() * 68, duration: 0.035, gain: 0.04, filterFrequency: 160, startOffset: i * 0.045 });
        }
        this.sequence(steps);
    }
};
