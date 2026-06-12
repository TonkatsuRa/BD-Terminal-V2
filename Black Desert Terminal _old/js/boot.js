const Animator = {
    getGsap() {
        return window.gsap && typeof window.gsap.to === 'function' ? window.gsap : null;
    },

    canAnimate() {
        return !prefersReducedMotion && !!this.getGsap();
    },

    configure() {
        const gsap = this.getGsap();
        if (!gsap) return;
        document.documentElement.classList.add('has-gsap');
        if (typeof gsap.defaults === 'function') gsap.defaults({ overwrite: 'auto' });
        if (gsap.ticker && typeof gsap.ticker.lagSmoothing === 'function') {
            gsap.ticker.lagSmoothing(500, 33);
        }
    },

    promote(targets, property = 'transform, opacity') {
        const gsap = this.getGsap();
        if (!gsap) return;
        gsap.set(targets, { willChange: property });
    },

    release(targets) {
        const gsap = this.getGsap();
        if (!gsap) return;
        gsap.set(targets, { clearProps: 'willChange' });
    },

    bootIntro() {
        if (!this.canAnimate()) return;
        const gsap = this.getGsap();
        gsap.set('#bootScreen', { opacity: 1, scale: 1 });
        this.promote('.boot-left');
        gsap.from('.boot-left', { opacity: 0, y: 8, duration: 0.34, ease: 'power2.out', onComplete: () => this.release('.boot-left') });
    },

    bootLogo(logo) {
        if (!logo) return;
        logo.classList.add('visible');
        if (!this.canAnimate()) return;
        this.promote(logo);
        const gsap = this.getGsap();
        const tl = gsap.timeline({ onComplete: () => this.release(logo) });
        tl.fromTo(logo,
            { opacity: 0, y: 12, scaleY: 0.08 },
            { opacity: 1, y: 0, scaleY: 1, duration: 0.32, ease: 'power3.out' }
        );
        tl.to(logo, { x: -2, duration: 0.035, repeat: 3, yoyo: true, ease: 'steps(1)' }, '-=0.06');
        tl.to(logo, { x: 0, duration: 0.04, ease: 'power1.out' });
    },

    bootExit(bootScreen, onComplete) {
        if (!bootScreen) {
            if (onComplete) onComplete();
            return;
        }

        const duration = Number(bootScreen.dataset.exitDuration || 0.24);
        const terminal = document.querySelector('.screen-content');

        if (this.getGsap()) {
            this.promote([bootScreen, terminal]);
            const tl = this.getGsap().timeline({
                onComplete: () => {
                    this.release([bootScreen, terminal]);
                    if (terminal) {
                        terminal.style.opacity = '';
                        terminal.style.transform = '';
                    }
                    if (onComplete) onComplete();
                }
            });
            tl.to(bootScreen, {
                opacity: 0,
                scale: prefersReducedMotion ? 1 : 1.006,
                duration: prefersReducedMotion ? 0.01 : duration,
                ease: 'power2.inOut'
            }, 0);
            if (terminal) {
                tl.to(terminal, {
                    opacity: 1,
                    scale: 1,
                    duration: prefersReducedMotion ? 0.01 : duration,
                    ease: 'power2.out'
                }, 0);
            }
            return;
        }

        bootScreen.classList.add('boot-fading');
        if (terminal) terminal.style.opacity = '1';
        setTimeout(() => {
            if (terminal) terminal.style.transform = '';
            if (onComplete) onComplete();
        }, prefersReducedMotion ? 0 : duration * 1000);
    },

    terminalStartup() {
        if (!this.canAnimate()) return;
        const gsap = this.getGsap();
        const tl = gsap.timeline();
        const targets = ['.screen-content', '.header-panel', '.hologram-panel', '.menu-panel', '.content-panel', '.system-sidebar', '.command-bar'];
        this.promote(targets);
        tl.from('.screen-content', { opacity: 0, scale: 0.988, duration: 0.35, ease: 'power2.out' });
        tl.from(['.header-panel', '.hologram-panel'], { opacity: 0, y: -8, duration: 0.26, stagger: 0.05, ease: 'power2.out' }, '-=0.18');
        tl.from(['.menu-panel', '.content-panel'], { opacity: 0, y: 10, duration: 0.28, stagger: 0.05, ease: 'power2.out' }, '-=0.12');
        tl.call(() => this.release(targets));
    },

    pageTransition(direction) {
        if (!this.canAnimate()) return;
        this.promote('#contentArea');
        this.getGsap().fromTo('#contentArea',
            { opacity: 0.55, x: direction < 0 ? -8 : 8 },
            { opacity: 1, x: 0, duration: 0.18, ease: 'power2.out', onComplete: () => this.release('#contentArea') }
        );
    },

    alertShake(target) {
        const element = typeof target === 'string' ? document.querySelector(target) : target;
        if (!element || !this.canAnimate()) return;
        this.promote(element);
        this.getGsap().fromTo(element, { x: -3 }, { x: 0, duration: 0.22, ease: 'elastic.out(1, 0.35)', onComplete: () => this.release(element) });
    },

    dialogOpen(dialog) {
        if (!dialog || !this.canAnimate()) return;
        const box = dialog.querySelector('.dialog-box, .diagnostic-panel, .facility-panel');
        this.promote(box);
        this.getGsap().fromTo(box,
            { opacity: 0, y: 10, scale: 0.985 },
            { opacity: 1, y: 0, scale: 1, duration: 0.22, ease: 'power2.out', onComplete: () => this.release(box) }
        );
    },

    dialogClose(dialog, onComplete) {
        if (!dialog) {
            if (onComplete) onComplete();
            return;
        }

        if (!this.canAnimate()) {
            if (onComplete) onComplete();
            return;
        }

        const box = dialog.querySelector('.dialog-box, .diagnostic-panel, .facility-panel');
        this.promote(box);
        this.getGsap().to(box, {
            opacity: 0,
            y: 8,
            duration: 0.14,
            ease: 'power1.in',
            onComplete: () => {
                this.release(box);
                if (onComplete) onComplete();
            }
        });
    },

    adminAccess() {
        if (!this.canAnimate()) return;
        const gsap = this.getGsap();
        const targets = ['#adminBadge', '.menu-item.admin-cmd'];
        this.promote(targets);
        gsap.fromTo('#adminBadge', { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.22, ease: 'power2.out' });
        gsap.from('.menu-item.admin-cmd', { opacity: 0.35, x: -6, duration: 0.25, stagger: 0.04, ease: 'power2.out', onComplete: () => this.release(targets) });
    }
};


function calculateLinesPerPage() {
    const viewport = getById('contentViewport');
    if (viewport) {
        const content = getById('contentArea');
        if (!content) return;
        const fontSize = parseFloat(getComputedStyle(content).fontSize);
        const lineHeight = fontSize * 1.22;
        const padding = 20; // top + bottom padding
        const availableHeight = viewport.clientHeight - padding;
        linesPerPage = Math.floor(availableHeight / lineHeight);
        linesPerPage = Math.max(10, linesPerPage);
    }
}

// ========================================
// BOOT SEQUENCE
// ========================================
function startBootSequence(options = {}) {
    const restoreSnapshot = options.restoreSnapshot || null;
    const restoredFrom = options.restoredFrom || '';
    const bootOutput = document.getElementById('bootOutput');
    const bootLogo = document.getElementById('bootLogo');
    const bootScreen = document.getElementById('bootScreen');
    const bootSkip = document.getElementById('bootSkip');
    const bootScroll = bootOutput.closest('.boot-left');
    const bootTimers = [];
    const bootSpeed = prefersReducedMotion ? MOTION_SCALE : 0.36;
    let bootComplete = false;
    let stepIndex = 0;
    let bootScrollFrame = null;
    let bootScrollTarget = 0;
    let terminalStarted = false;

    function schedule(callback, delay = 0) {
        const scaledDelay = Math.max(prefersReducedMotion ? 0 : 10, Math.round(delay * bootSpeed));
        const timerId = setTimeout(() => {
            const index = bootTimers.indexOf(timerId);
            if (index > -1) bootTimers.splice(index, 1);
            if (!bootComplete) callback();
        }, scaledDelay);
        bootTimers.push(timerId);
        return timerId;
    }

    function cleanupBootListeners() {
        bootTimers.forEach(timerId => clearTimeout(timerId));
        bootTimers.length = 0;
        if (bootScrollFrame) {
            cancelAnimationFrame(bootScrollFrame);
            bootScrollFrame = null;
        }
        if (bootSkip) {
            bootSkip.removeEventListener('pointerdown', handleBootSkip);
            bootSkip.removeEventListener('click', handleBootSkip);
        }
        document.removeEventListener('keydown', handleBootKeydown);
    }

    function finishBoot(skipped = false, options = {}) {
        if (bootComplete) return;
        bootComplete = true;
        cleanupBootListeners();
        let shouldInitTerminal = false;

        if (skipped && bootOutput) {
            const skipLine = document.createElement('div');
            skipLine.className = 'glow t-amber';
            skipLine.textContent = '[BOOT SEQUENCE SKIPPED BY OPERATOR]';
            bootOutput.appendChild(skipLine);
            scrollBoot(true);
        }

        AudioEngine.successTone();
        bootScreen.dataset.exitDuration = String(options.exitDuration || (skipped ? 0.24 : 1));
        if (!terminalStarted) {
            terminalStarted = true;
            const terminal = document.querySelector('.screen-content');
            if (terminal) {
                terminal.style.opacity = '0';
                terminal.style.transform = 'scale(0.995)';
            }
            document.body.classList.add('terminal-ready');
            shouldInitTerminal = true;
        }
        Animator.bootExit(bootScreen, () => {
            bootScreen.classList.add('hidden');
            if (shouldInitTerminal) initTerminal();
        });
    }

    function finishRestoreBoot() {
        if (bootComplete) return;
        bootComplete = true;
        cleanupBootListeners();
        terminalStarted = true;
        const terminal = document.querySelector('.screen-content');
        if (terminal) {
            terminal.style.opacity = '';
            terminal.style.transform = '';
        }
        document.body.classList.add('terminal-ready');
        bootScreen.classList.add('hidden');
        bootScreen.classList.remove('boot-fading', 'boot-blackout', 'boot-log-mode');
        initTerminal({ restoreSnapshot, restoredFrom });
    }

    function handleBootSkip(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        AudioEngine.cancelStartupJingle();
        AudioEngine.resume();
        finishBoot(true);
    }

    function handleBootKeydown(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            handleBootSkip(e);
        }
    }
    
    // Right side ASCII art (shows after initial diagnostics)
    const fallbackRightSideLogo = `
<span style="color:#ffb000">     █████╗ ██████╗ ███████╗███████╗</span>
<span style="color:#ffb000">    ██╔══██╗██╔══██╗██╔════╝██╔════╝</span>
<span style="color:#ffb000">    ███████║██████╔╝█████╗  ███████╗</span>
<span style="color:#ffb000">    ██╔══██║██╔══██╗██╔══╝  ╚════██║</span>
<span style="color:#ffb000">    ██║  ██║██║  ██║███████╗███████║</span>
<span style="color:#ffb000">    ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝</span>
<span style="color:#888">     M A C R O T E C H N O L O G Y</span>

<span style="color:#20c20e">════════════════════════════════════</span>

<span style="color:#00d4aa">  ██████╗ ██╗      █████╗  ██████╗██╗  ██╗</span>
<span style="color:#00d4aa">  ██╔══██╗██║     ██╔══██╗██╔════╝██║ ██╔╝</span>
<span style="color:#00d4aa">  ██████╔╝██║     ███████║██║     █████╔╝</span>
<span style="color:#00d4aa">  ██╔══██╗██║     ██╔══██║██║     ██╔═██╗</span>
<span style="color:#00d4aa">  ██████╔╝███████╗██║  ██║╚██████╗██║  ██╗</span>
<span style="color:#00d4aa">  ╚═════╝ ╚══════╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝</span>

<span style="color:#00d4aa">  ██████╗ ███████╗███████╗███████╗██████╗ ████████╗</span>
<span style="color:#00d4aa">  ██╔══██╗██╔════╝██╔════╝██╔════╝██╔══██╗╚══██╔══╝</span>
<span style="color:#00d4aa">  ██║  ██║█████╗  ███████╗█████╗  ██████╔╝   ██║</span>
<span style="color:#00d4aa">  ██║  ██║██╔══╝  ╚════██║██╔══╝  ██╔══██╗   ██║</span>
<span style="color:#00d4aa">  ██████╔╝███████╗███████║███████╗██║  ██║   ██║</span>
<span style="color:#00d4aa">  ╚═════╝ ╚══════╝╚══════╝╚══════╝╚═╝  ╚═╝   ╚═╝</span>

<span style="color:#39ff14;text-shadow:0 0 10px #20c20e">    R E S E A R C H   T E R M I N A L</span>

<span style="color:#20c20e">════════════════════════════════════</span>

<span style="color:#ff3333">  ╔═══════════════════════════════════════╗</span>
<span style="color:#ff3333">  ║  W A R N I N G :  AUTHORIZED ONLY    ║</span>
<span style="color:#ff3333">  ║  All activity monitored and logged.  ║</span>
<span style="color:#ff3333">  ╚═══════════════════════════════════════╝</span>
`;
    const rightSideLogo = getBootLogoMarkup(fallbackRightSideLogo);
    
    const bootSequence = getBootSequence();

    function sleep(delay = 0, scaled = true) {
        if (scaled) return new Promise(resolve => schedule(resolve, delay));
        return new Promise(resolve => {
            const timerId = setTimeout(() => {
                const index = bootTimers.indexOf(timerId);
                if (index > -1) bootTimers.splice(index, 1);
                if (!bootComplete) resolve();
            }, prefersReducedMotion ? Math.min(delay, 250) : delay);
            bootTimers.push(timerId);
        });
    }

    function scrollBoot(instant = false) {
        if (!bootScroll) return;
        bootScrollTarget = Math.max(0, bootScroll.scrollHeight - bootScroll.clientHeight);
        if (instant || prefersReducedMotion) {
            bootScroll.scrollTop = bootScrollTarget;
            return;
        }
        if (bootScrollFrame) return;
        bootScrollFrame = requestAnimationFrame(function glide() {
            bootScrollFrame = null;
            const delta = bootScrollTarget - bootScroll.scrollTop;
            if (Math.abs(delta) < 1) {
                bootScroll.scrollTop = bootScrollTarget;
                return;
            }
            bootScroll.scrollTop += delta * 0.32;
            bootScrollFrame = requestAnimationFrame(glide);
        });
    }

    function addBootLine(className = '') {
        const div = document.createElement('div');
        div.className = `boot-line glow ${className}`.trim();
        bootOutput.appendChild(div);
        scrollBoot();
        return div;
    }

function bootStatusClass(status) {
        if (['alert', 'critical', 'danger', 'red', 'fail', 'failed', 'malfunction', 'disconnected', 'offline'].includes(status)) return 't-red';
        if (['warn', 'warning', 'unknown', 'degraded', 'maintenance', 'service', 'partial', 'low', 'weak', 'intermittent'].includes(status)) return 't-amber';
        return 't-cyan';
    }

    function bootStatusSeverity(status) {
        if (['alert', 'critical', 'danger', 'red', 'fail', 'failed', 'malfunction', 'disconnected', 'offline'].includes(status)) return 'fail';
        if (['warn', 'warning', 'unknown', 'degraded', 'maintenance', 'service', 'partial', 'low', 'weak', 'intermittent'].includes(status)) return 'warn';
        return 'ok';
    }

    function displayBootResult(result) {
        if (window.innerWidth > 700) return result;
        const compact = {
            'DEGRADED 47%': 'DEG 47%',
            'DEGRADED 77%': 'DEG 77%',
            'DISCONNECTED': 'DISC',
            'WEAK SIGNAL': 'WEAK',
            'RESTRICTED': 'RESTRICT'
        };
        return compact[result] || result;
    }

    function formatCheckLabel(label) {
        const compactLabels = {
            'MEMORY 640K BASE': 'MEM 640K BASE',
            'EXT MEMORY 262144K': 'EXT MEM 262144K',
            'NET INTERFACE ETH0': 'NET eth0',
            'NET INTERFACE ETH1': 'NET eth1',
            'SATELLITE UPLINK': 'SAT UPLINK',
            'EXTERNAL RELAY': 'EXT RELAY',
            'DRONE UPLINK': 'DRONE LINK',
            'DATABASE MODULE': 'DB MODULE',
            'INTEGRITY CHECK': 'INTEGRITY',
            'SECURITY PROTOCOL': 'SECURITY',
            'CLEARANCE LEVEL': 'CLEARANCE',
            'ENCRYPTION MODULE': 'ENCRYPTION',
            'CONFIDENTIAL FILES': 'CONF FILES',
            'INTRUSION DETECTION': 'INTRUSION',
            'AUTONOMOUS DEFENSE SYSTEMS': 'AUTO DEFENSE',
            'DIS DETECTION SENSORS': 'DIS SENSORS',
            'PHOSPHOR GRID ALIGNMENT': 'PHOSPHOR GRID'
        };
        const source = label.toUpperCase();
        const clean = window.innerWidth < 520 ? (compactLabels[source] || source) : source;
        const width = window.innerWidth < 520 ? 18 : 30;
        const dotCount = Math.max(4, width - clean.length);
        return `${clean} ${'.'.repeat(dotCount)}`;
    }

    function typeBootText(element, text, options = {}) {
        element.classList.add('terminal-typewriter-line');
        return typeTextSmooth(element, text, {
            interval: options.interval || TYPEWRITER_CONFIG.bootCharInterval,
            shouldCancel: () => bootComplete,
            onChar: index => {
                if (index % 12 === 0) AudioEngine.keyClick();
                scrollBoot();
            }
        });
    }

    async function renderBootLine(text, className = '') {
        const line = addBootLine(className);
        const label = document.createElement('span');
        label.className = 'boot-label';
        line.appendChild(label);
        await typeBootText(label, text);
    }

    async function renderBootCheck(step) {
        const line = addBootLine('boot-check');
        const label = document.createElement('span');
        const status = document.createElement('span');
        label.className = 'boot-label';
        status.className = 'boot-status t-dim';
        line.appendChild(label);
        line.appendChild(status);

        await typeBootText(label, formatCheckLabel(step.label));
        if (bootComplete) return;

        const severity = bootStatusSeverity(step.status);
        if (severity !== 'ok') {
            await renderBootStatusSpinner(status, severity === 'fail' ? 900 : 600);
        } else {
            await sleep(45);
        }
        if (bootComplete) return;

        status.className = `boot-status ${bootStatusClass(step.status)}`;
        status.textContent = `[${displayBootResult(step.result)}]`;
        requestAnimationFrame(() => {
            if (!bootComplete) status.classList.add('visible');
        });
        if (severity === 'fail') {
            AudioEngine.errorBuzz();
        } else if (severity === 'warn') {
            AudioEngine.menuMove();
        } else {
            AudioEngine.bootBeep();
        }
        await sleep(step.final ? 240 : 50);
    }

    function renderBootStatusSpinner(status, duration = 1400) {
        const spinner = ['/', '-', '\\', '|'];
        const start = performance.now();
        status.className = 'boot-status visible t-amber';
        AudioEngine.keyClick();

        return new Promise(resolve => {
            function tick(now = performance.now()) {
                if (bootComplete) {
                    resolve();
                    return;
                }

                const elapsed = now - start;
                status.textContent = `[${spinner[Math.floor(elapsed / 95) % spinner.length]}]`;
                if (elapsed >= duration) {
                    status.classList.remove('visible');
                    requestAnimationFrame(resolve);
                    return;
                }
                requestAnimationFrame(tick);
            }

            requestAnimationFrame(tick);
        });
    }

    async function renderBootLoadingBar(duration = 10000) {
        const line = addBootLine('boot-loader');
        const label = document.createElement('span');
        label.className = 'boot-label';
        line.appendChild(label);

        const spinner = ['|', '/', '-', '\\'];
        const barWidth = window.innerWidth < 520 ? 18 : 32;
        const start = performance.now();
        let lastBeep = 0;

        return new Promise(resolve => {
            function tick(now = performance.now()) {
                if (bootComplete) {
                    resolve();
                    return;
                }

                const elapsed = Math.min(duration, now - start);
                const progress = elapsed / duration;
                const filled = Math.min(barWidth, Math.floor(progress * barWidth));
                const bar = '#'.repeat(filled) + '-'.repeat(barWidth - filled);
                const percent = String(Math.floor(progress * 100)).padStart(3, '0');
                label.textContent = `${spinner[Math.floor(elapsed / 120) % spinner.length]} FINAL BUFFER LOAD [${bar}] ${percent}%`;
                scrollBoot();

                if (now - lastBeep > 620) {
                    lastBeep = now;
                    AudioEngine.keyClick();
                }

                if (elapsed >= duration) {
                    label.textContent = `> FINAL BUFFER LOAD [${'#'.repeat(barWidth)}] 100% COMPLETE`;
                    AudioEngine.successTone();
                    resolve();
                } else {
                    requestAnimationFrame(tick);
                }
            }

            requestAnimationFrame(tick);
        });
    }

    async function clearBootLog() {
        if (window.gsap && !prefersReducedMotion) {
            await new Promise(resolve => {
                gsap.to(bootOutput, {
                    opacity: 0,
                    y: -10,
                    duration: 0.17,
                    ease: 'power2.in',
                    onComplete: resolve
                });
            });
        } else {
            bootOutput.classList.add('fading');
            await sleep(170, false);
        }

        clearElement(bootOutput);
        bootOutput.classList.remove('fading');
        bootOutput.style.opacity = '';
        bootOutput.style.transform = '';
        if (bootScroll) bootScroll.scrollTop = 0;
    }

    async function showBootLogo() {
        bootScreen.classList.remove('boot-log-mode');
        const logo = document.createElement('div');
        logo.className = 'boot-logo boot-logo-inline glow';
        logo.innerHTML = rightSideLogo;
        bootOutput.appendChild(logo);
        if (bootScroll) bootScroll.scrollTop = 0;
        Animator.bootLogo(logo);
    }

    async function enterBootBlackout() {
        if (window.gsap && !prefersReducedMotion) {
            await new Promise(resolve => {
                gsap.to([bootOutput, '.boot-skip'], {
                    opacity: 0,
                    duration: 0.17,
                    ease: 'power2.in',
                    onComplete: resolve
                });
            });
        }
        bootScreen.classList.add('boot-blackout');
        await sleep(210, false);
    }
    
    // Set logo content (hidden initially)
    bootScreen.classList.remove('hidden', 'boot-fading', 'boot-blackout');
    bootScreen.classList.add('boot-log-mode');
    bootScreen.dataset.exitDuration = '0.24';
    clearElement(bootOutput);
    bootOutput.classList.remove('fading');
    bootOutput.style.opacity = '';
    bootOutput.style.transform = '';
    clearElement(bootLogo);
    bootLogo.classList.remove('visible');
    const bootLeft = document.querySelector('.boot-left');
    if (bootLeft) {
        bootLeft.style.opacity = '';
        bootLeft.style.transform = '';
    }

    if (restoreSnapshot) {
        finishRestoreBoot();
        return;
    }

    if (bootSkip) {
        bootSkip.addEventListener('pointerdown', handleBootSkip);
        bootSkip.addEventListener('click', handleBootSkip);
    }
    document.addEventListener('keydown', handleBootKeydown);

    AudioEngine.startupSequence();
    Animator.bootIntro();

    async function runBootSequence() {
        await sleep(280);

        while (!bootComplete && stepIndex < bootSequence.length) {
            const step = bootSequence[stepIndex++];

            if (step.type === 'pause') {
                await sleep(step.duration);
            } else if (step.type === 'blank') {
                addBootLine();
                await sleep(35);
            } else if (step.type === 'section') {
                await renderBootLine(`> ${step.text}`, 'boot-section');
                await sleep(55);
            } else if (step.type === 'check') {
                await renderBootCheck(step);
            } else {
                await renderBootLine(step.text, step.className || '');
                await sleep(28);
            }
        }

        if (bootComplete) return;

        await sleep(140);
        await renderBootLine('> DISPLAY BUFFER LOCKED // CORPORATE IDENT READY', 'boot-section');
        await renderBootLoadingBar(prefersReducedMotion ? 400 : 5000);
        if (bootComplete) return;

        await sleep(130, false);
        await clearBootLog();
        if (bootComplete) return;

        await showBootLogo();
        if (bootComplete) return;
        AudioEngine.startupJingle();
        await sleep(prefersReducedMotion ? 450 : 2500, false);
        if (bootComplete) return;

        await enterBootBlackout();
        finishBoot(false, { exitDuration: prefersReducedMotion ? 0.01 : 0.5 });
    }

    runBootSequence();
}

