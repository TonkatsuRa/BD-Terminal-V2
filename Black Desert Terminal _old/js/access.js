// ========================================
// ACCESS CONTROL
// ========================================
function showAccessDialog() {
    if (hasAccess(ACCESS_LEVELS.admin)) {
        print('');
        print('Administrator access already granted.', 't-dim');
        print('');
        return;
    }
    
    const dialog = document.getElementById('accessDialog');
    const input = document.getElementById('accessPassword');
    const error = document.getElementById('accessError');
    
    accessDialogReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.classList.add('active');
    dialog.setAttribute('aria-hidden', 'false');
    setAppState({ activeOverlay: 'access' }, { resetSelection: false });
    error.classList.remove('visible');
    input.value = '';
    Animator.dialogOpen(dialog);
    input.focus();
}

function closeAccessDialog() {
    const dialog = document.getElementById('accessDialog');
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

function submitAccessPassword() {
    const input = document.getElementById('accessPassword');
    const error = document.getElementById('accessError');
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

function grantElevatedAccess() {
    setAccessLevelState(ACCESS_LEVELS.elevated);
    AudioEngine.accessGranted();

    clearOutput();
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
    
    clearOutput();
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

function setAccessLevelState(level, options = {}) {
    setAppState({ accessLevel: level }, options);
}

function setAdminAccessState(enabled, options = {}) {
    setAccessLevelState(enabled ? ACCESS_LEVELS.admin : ACCESS_LEVELS.employee, options);
}

function logout() {
    setAccessLevelState(ACCESS_LEVELS.employee);
    AudioEngine.errorBuzz();
    
    clearOutput();
    print('');
    print(contentGet('admin.logout', 'Administrator session terminated.'), 't-red');
    print('Clearance reset to Employee.', 't-dim');
    print('');
}

function forceCloseRuntimeOverlays() {
    closeLiebiGame();

    const accessDialog = document.getElementById('accessDialog');
    if (accessDialog) {
        accessDialog.classList.remove('active');
        accessDialog.setAttribute('aria-hidden', 'true');
    }
    accessDialogReturnFocus = null;

    const diagnosticOverlay = document.getElementById('diagnosticOverlay');
    diagnosticActive = false;
    if (diagnosticAnimFrame) {
        cancelAnimationFrame(diagnosticAnimFrame);
        diagnosticAnimFrame = null;
    }
    if (diagnosticOverlay) {
        diagnosticOverlay.classList.remove('active');
        diagnosticOverlay.setAttribute('aria-hidden', 'true');
    }

    const facilityOverlay = document.getElementById('facilityOverlay');
    facilityActive = false;
    if (facilityAnimFrame) {
        cancelAnimationFrame(facilityAnimFrame);
        facilityAnimFrame = null;
    }
    window.MapOverlayController?.close({ restoreFocus: false });
    if (facilityOverlay) {
        facilityOverlay.classList.remove('active');
        facilityOverlay.setAttribute('aria-hidden', 'true');
    }
    setAppState({ activeOverlay: 'none' }, { resetSelection: false });
}

function restartTerminalAfterStatusLoad() {
    forceCloseRuntimeOverlays();
    setAdminAccessState(false, { resetSelection: false });
    selectedMenuIndex = 0;
    renderedMenuIndex = -1;
    updateMenuSelection();
    menuFocused = true;

    if (terminalKeyHandlerBound) {
        document.removeEventListener('keydown', handleGlobalKeydown);
        terminalKeyHandlerBound = false;
    }

    clearOutput({ force: true });
    const commandInput = document.getElementById('commandInput');
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

