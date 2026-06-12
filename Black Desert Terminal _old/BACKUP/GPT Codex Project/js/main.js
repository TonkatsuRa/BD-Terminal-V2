// ========================================
// INITIALIZATION
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    initializeSafeModeFromUrl();
    EffectsController.load();
    applyMotionPreference();
    bindPreferenceListeners();
    Animator.configure();
    configureLibrarySupport();
    registerTerminalCommands();
    EffectsController.apply();
    AudioEngine.updateSoundStatus();
    menuItems = document.querySelectorAll('.menu-item');
    syncAppStateFromLegacy({ resetSelection: false });
    calculateLinesPerPage();
    loadStoredStatusProfile();
    const restoreRequest = window.TerminalSessionRestore?.parseRestoreRequest?.();
    let restoreSnapshot = null;
    if (window.TerminalSessionRestore?.cleanupExpiredSnapshots) {
        window.TerminalSessionRestore.cleanupExpiredSnapshots();
    }
    try {
        await loadTerminalContent();
        if (restoreRequest?.session && window.TerminalSessionRestore?.consumeSnapshot) {
            restoreSnapshot = await window.TerminalSessionRestore.consumeSnapshot(restoreRequest.session);
        }
    } catch (error) {
        restoreSnapshot = null;
    }
    startBootSequence({
        restoreSnapshot,
        restoredFrom: restoreRequest?.from || ''
    });
    
    document.getElementById('fileInput').addEventListener('change', handleFileSelect);
    document.getElementById('statusFileInput').addEventListener('change', handleStatusFileSelect);
    document.getElementById('accessCancelBtn').addEventListener('click', closeAccessDialog);
    document.getElementById('accessSubmitBtn').addEventListener('click', submitAccessPassword);
    document.getElementById('accessPassword').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitAccessPassword();
        if (e.key === 'Escape') closeAccessDialog();
    });
    document.getElementById('diagnosticClose').addEventListener('click', closeDiagnosticDashboard);
    document.getElementById('diagnosticOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'diagnosticOverlay') closeDiagnosticDashboard();
    });
    document.getElementById('facilityClose').addEventListener('click', closeFacilityStatus);
    document.getElementById('facilityOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'facilityOverlay') closeFacilityStatus();
    });
    
    window.addEventListener('resize', () => {
        if (resizeFrame) cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
            resizeFrame = null;
            calculateLinesPerPage();
            recalculatePages();
            if (!hologramStarted && document.body.classList.contains('terminal-ready')) {
                scheduleHologramStart(200);
            }
            if (facilityActive) {
                renderFacilityStatus(performance.now());
            }
        });
    });

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    document.addEventListener('wheel', e => {
        if (e.cancelable && !e.target.closest('.boot-left, .menu-list, .dialog-box, .diagnostic-panel, .facility-panel, #output, .content-viewport')) e.preventDefault();
    }, { passive: false });
    document.addEventListener('touchmove', e => {
        if (e.cancelable && !e.target.closest('.boot-left, .menu-list, .dialog-box, .diagnostic-panel, .facility-panel, #output, .content-viewport, #gameOverlay, #casinoOverlay, #liebiOverlay')) e.preventDefault();
    }, { passive: false });
    document.addEventListener('pointerdown', () => AudioEngine.resume(), { once: true });
    document.addEventListener('keydown', () => AudioEngine.resume(), { once: true });
});
