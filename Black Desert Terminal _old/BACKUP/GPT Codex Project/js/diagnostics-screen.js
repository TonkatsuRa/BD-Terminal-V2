(function () {
    'use strict';

    function stopDiagnosticScreenLoop() {
        diagnosticActive = false;
        if (diagnosticAnimFrame) {
            cancelAnimationFrame(diagnosticAnimFrame);
            diagnosticAnimFrame = null;
        }
        resetDiagnosticWidgetRegistry();
        setAppState({ activeOverlay: 'none' }, { resetSelection: false });
    }

    async function closeDiagnosticScreen() {
        stopDiagnosticScreenLoop();
        await window.ToolScreenBridge?.returnToTerminal?.('diagnostic');
    }

    async function startDiagnosticScreen() {
        initializeSafeModeFromUrl();
        EffectsController.load();
        applyMotionPreference();
        bindPreferenceListeners();
        EffectsController.apply();
        AudioEngine.updateSoundStatus();

        loadStoredStatusProfile();
        if (typeof restoreConnectedSiteForToolScreen === 'function') {
            restoreConnectedSiteForToolScreen();
        }
        try {
            await loadTerminalContent();
        } catch (_) {}

        await window.ToolScreenBridge?.playLoading?.([
            'READING SENSOR BUS',
            'CALIBRATING TELEMETRY',
            'OPENING BASE DIAGNOSTIC'
        ]);

        setAppState({ networkOnline: true, activeOverlay: 'diagnostic' }, { resetSelection: false });
        diagnosticActive = true;
        diagnosticFrame = prefersReducedMotion ? 48 : 0;
        diagnosticLastRender = 0;
        resetDiagnosticWidgetRegistry();
        renderDiagnosticDashboard(performance.now(), { force: true });
        if (!prefersReducedMotion) {
            diagnosticAnimFrame = requestAnimationFrame(runDiagnosticLoop);
        }

        window.ToolScreenBridge?.installToolPage?.({
            tool: 'diagnostic',
            beforeReturn: stopDiagnosticScreenLoop
        });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                if (diagnosticAnimFrame) {
                    cancelAnimationFrame(diagnosticAnimFrame);
                    diagnosticAnimFrame = null;
                }
                return;
            }
            if (diagnosticActive && !diagnosticAnimFrame && !prefersReducedMotion) {
                diagnosticLastRender = 0;
                diagnosticAnimFrame = requestAnimationFrame(runDiagnosticLoop);
            }
        });
    }

    document.addEventListener('DOMContentLoaded', startDiagnosticScreen);
    window.closeDiagnosticScreen = closeDiagnosticScreen;
})();
