// js/features/access.js — clearance dialog, grants, logout, overlay teardown,
// and the post-STATUS-LOAD terminal restart.

import { getById } from '../core/dom.js';
import { AudioEngine } from '../core/audio.js';
import {
    ACCESS_LEVELS, ADMIN_PASSWORD, ELEVATED_PASSWORD,
    hasAccess, setAppState, overlays
} from '../core/state.js';
import { print, clearOutput } from '../terminal/output.js';
import { contentGet } from './status.js';
// Runtime-only circular imports (boot/terminal call into access and back).
import { Animator, startBootSequence } from './boot.js';
import { resetMenuState, unbindGlobalKeyHandler } from './terminal.js';

let accessDialogReturnFocus = null;

export function showAccessDialog() {
    if (hasAccess(ACCESS_LEVELS.admin)) {
        print('');
        print('Administrator access already granted.', 't-dim');
        print('');
        return;
    }

    const dialog = getById('accessDialog');
    const input = getById('accessPassword');
    const error = getById('accessError');

    accessDialogReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.classList.add('active');
    dialog.setAttribute('aria-hidden', 'false');
    setAppState({ activeOverlay: 'access' }, { resetSelection: false });
    error.classList.remove('visible');
    input.value = '';
    Animator.dialogOpen(dialog);
    input.focus();
}

export function closeAccessDialog() {
    const dialog = getById('accessDialog');
    if (!dialog.classList.contains('active')) return;
    setAppState({ activeOverlay: 'none' }, { resetSelection: false });
    Animator.dialogClose(dialog, () => {
        dialog.classList.remove('active');
        dialog.setAttribute('aria-hidden', 'true');
        if (accessDialogReturnFocus && accessDialogReturnFocus.isConnected) {
            accessDialogReturnFocus.focus();
        }
        accessDialogReturnFocus = null;
    });
}

export function submitAccessPassword() {
    const input = getById('accessPassword');
    const error = getById('accessError');
    const password = input.value;

    if (password === ADMIN_PASSWORD) {
        closeAccessDialog();
        grantAdminAccess();
    } else if (password.trim().toLowerCase() === ELEVATED_PASSWORD.toLowerCase()) {
        closeAccessDialog();
        grantElevatedAccess();
    } else {
        AudioEngine.errorBuzz();
        error.classList.add('visible');
        Animator.alertShake(document.querySelector('#accessDialog .dialog-box'));
        input.value = '';
        input.focus();
    }
}

export function setAccessLevelState(level, options = {}) {
    setAppState({ accessLevel: level }, options);
}

function grantElevatedAccess() {
    setAccessLevelState(ACCESS_LEVELS.elevated);
    AudioEngine.accessGranted();

    clearOutput({ force: true });
    print('');
    print('ELEVATED CLEARANCE GRANTED', 't-amber');
    print('FSEARCH and Elevated database files are now accessible.', 't-dim');
    print('Admin-only status controls remain locked.', 't-dim');
    print('');
}

function grantAdminAccess() {
    setAccessLevelState(ACCESS_LEVELS.admin);
    AudioEngine.accessGranted();
    Animator.adminAccess();

    clearOutput({ force: true });
    print('');
    print('▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓', 't-red');
    const grantedText = contentGet('admin.access_granted', 'ADMINISTRATOR ACCESS GRANTED').toUpperCase();
    print(`▓     ${grantedText.padEnd(35, ' ').slice(0, 35)}▓`, 't-red');
    print('▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓', 't-red');
    print('');
    print('Additional commands unlocked:', 't-amber');
    print('  • LOAD STATUS - Import facility status profile');
    print('  • LIST ALL - View complete database');
    print('  • FUZZY SEARCH - Partial match search');
    print('  • LOGOUT - End admin session');
    print('');
    print('All database entries are now accessible.', 't-magenta');
    print('');
}

export function logout() {
    setAccessLevelState(ACCESS_LEVELS.employee);
    AudioEngine.errorBuzz();

    clearOutput({ force: true });
    print('');
    print(contentGet('admin.logout', 'Administrator session terminated.'), 't-red');
    print('Clearance reset to Employee.', 't-dim');
    print('');
}

/** Hard-close every overlay (used before status reloads and shutdowns). */
export function forceCloseRuntimeOverlays() {
    window.closeLiebiGame?.();

    const accessDialog = getById('accessDialog');
    if (accessDialog) {
        accessDialog.classList.remove('active');
        accessDialog.setAttribute('aria-hidden', 'true');
    }
    accessDialogReturnFocus = null;

    const diagnosticOverlay = getById('diagnosticOverlay');
    overlays.diagnosticActive = false;
    if (overlays.diagnosticAnimFrame) {
        cancelAnimationFrame(overlays.diagnosticAnimFrame);
        overlays.diagnosticAnimFrame = null;
    }
    if (diagnosticOverlay) {
        diagnosticOverlay.classList.remove('active');
        diagnosticOverlay.setAttribute('aria-hidden', 'true');
    }

    const facilityOverlay = getById('facilityOverlay');
    overlays.facilityActive = false;
    if (overlays.facilityAnimFrame) {
        cancelAnimationFrame(overlays.facilityAnimFrame);
        overlays.facilityAnimFrame = null;
    }
    window.MapOverlayController?.close({ restoreFocus: false });
    if (facilityOverlay) {
        facilityOverlay.classList.remove('active');
        facilityOverlay.setAttribute('aria-hidden', 'true');
    }
    setAppState({ activeOverlay: 'none' }, { resetSelection: false });
}

/** Full reboot path used after an admin loads a new status profile. */
export function restartTerminalAfterStatusLoad() {
    forceCloseRuntimeOverlays();
    setAppState({ adminMode: false }, { resetSelection: false });
    resetMenuState();
    unbindGlobalKeyHandler();

    clearOutput({ force: true });
    const commandInput = getById('commandInput');
    if (commandInput) {
        commandInput.value = '';
        commandInput.blur();
    }
    const terminal = document.querySelector('.screen-content');
    if (terminal) {
        terminal.style.opacity = '0';
        terminal.style.transform = 'scale(0.995)';
    }

    const gsap = Animator.getGsap();
    if (gsap) gsap.killTweensOf(['#bootScreen', '.screen-content', '.boot-left', '#bootOutput', '.boot-skip']);
    document.body.classList.remove('terminal-ready');
    startBootSequence();
}
