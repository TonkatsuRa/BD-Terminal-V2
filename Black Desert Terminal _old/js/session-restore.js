(function () {
    'use strict';

    const DB_NAME = 'ares-terminal-session-v1';
    const DB_VERSION = 1;
    const STORE_NAME = 'snapshots';
    const SESSION_PREFIX = 'ares-terminal-snapshot:';
    const SNAPSHOT_TTL_MS = 2 * 60 * 60 * 1000;

    function now() {
        return Date.now();
    }

    function delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function clonePlain(value, fallback) {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (_) {
            return fallback;
        }
    }

    function createSessionId(tool) {
        const suffix = Math.random().toString(36).slice(2, 10);
        return `${tool || 'tool'}-${now().toString(36)}-${suffix}`;
    }

    function normalizeToolName(tool) {
        const value = String(tool || '').trim().toLowerCase();
        if (value === 'diagnostic' || value === 'diagnostics') return 'diagnostic';
        if (value === 'facility' || value === 'map') return 'facility';
        if (value === 'wireframe' || value === 'tactical' || value === 'wireframe-map') return 'wireframe';
        return value || 'tool';
    }

    function toolLabel(tool) {
        const normalized = normalizeToolName(tool);
        if (normalized === 'diagnostic') return 'BASE DIAGNOSTIC';
        if (normalized === 'facility') return 'TOPOGRAPHY';
        if (normalized === 'wireframe') return 'TACTICAL WIREFRAME MAP';
        return normalized.toUpperCase();
    }

    function openDb() {
        if (!window.indexedDB) {
            return Promise.reject(new Error('IndexedDB unavailable'));
        }

        return new Promise((resolve, reject) => {
            const request = window.indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
        });
    }

    async function withStore(mode, callback) {
        const db = await openDb();
        try {
            return await new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, mode);
                const store = tx.objectStore(STORE_NAME);
                let callbackDone = false;
                let transactionDone = false;
                let callbackValue;
                let settled = false;

                function maybeFinish() {
                    if (!settled && callbackDone && transactionDone) {
                        settled = true;
                        resolve(callbackValue);
                    }
                }

                tx.oncomplete = () => {
                    transactionDone = true;
                    maybeFinish();
                };
                tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
                tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));

                try {
                    const result = callback(store);
                    if (result && typeof result.then === 'function') {
                        result.then(value => {
                            callbackValue = value;
                            callbackDone = true;
                            maybeFinish();
                        }).catch(reject);
                    } else {
                        callbackValue = result;
                        callbackDone = true;
                        maybeFinish();
                    }
                } catch (error) {
                    reject(error);
                }
            });
        } finally {
            db.close();
        }
    }

    function requestToPromise(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
        });
    }

    async function putIndexedDb(record) {
        await withStore('readwrite', (store) => requestToPromise(store.put(record)));
    }

    async function getIndexedDb(id) {
        return withStore('readonly', (store) => requestToPromise(store.get(id)));
    }

    async function deleteIndexedDb(id) {
        return withStore('readwrite', (store) => requestToPromise(store.delete(id)));
    }

    async function cleanupExpiredSnapshots() {
        if (!window.indexedDB) return;
        try {
            const cutoff = now() - SNAPSHOT_TTL_MS;
            await withStore('readwrite', (store) => {
                const request = store.openCursor();
                request.onsuccess = () => {
                    const cursor = request.result;
                    if (!cursor) return;
                    const createdAt = Number(cursor.value && cursor.value.createdAt) || 0;
                    if (createdAt < cutoff) cursor.delete();
                    cursor.continue();
                };
                return undefined;
            });
        } catch (_) {
            // Cleanup is best-effort and must never block the terminal.
        }
    }

    function putSessionStorage(record) {
        const text = JSON.stringify(record);
        sessionStorage.setItem(`${SESSION_PREFIX}${record.id}`, text);
    }

    function getSessionStorage(id) {
        const raw = sessionStorage.getItem(`${SESSION_PREFIX}${id}`);
        if (!raw) return null;
        return JSON.parse(raw);
    }

    function deleteSessionStorage(id) {
        sessionStorage.removeItem(`${SESSION_PREFIX}${id}`);
    }

    function sanitizeMetadata(metadata) {
        const clean = {};
        Object.entries(metadata || {}).forEach(([key, value]) => {
            if (/password|passphrase|secret|zip/i.test(key)) return;
            clean[key] = value;
        });
        return clean;
    }

    function snapshotDatabaseSlot(slot, index) {
        if (!slot) {
            return {
                index,
                loaded: false,
                source: '',
                file: '',
                metadata: {},
                entries: []
            };
        }

        return {
            index,
            loaded: Boolean(slot.loaded),
            source: String(slot.source || ''),
            file: String(slot.file || ''),
            metadata: sanitizeMetadata(slot.metadata),
            entries: clonePlain(Array.isArray(slot.entries) ? slot.entries : [], [])
        };
    }

    function snapshotOutputBuffer() {
        if (!Array.isArray(window.outputBuffer) && typeof outputBuffer === 'undefined') {
            return [];
        }
        const source = typeof outputBuffer !== 'undefined' ? outputBuffer : window.outputBuffer;
        return clonePlain(Array.isArray(source) ? source : [], []);
    }

    function createSnapshot(tool) {
        const normalizedTool = normalizeToolName(tool);
        if (typeof syncAppStateFromLegacy === 'function') {
            syncAppStateFromLegacy({ resetSelection: false });
        }

        const commandInput = document.getElementById('commandInput');
        const slotCount = typeof DATABASE_SLOT_COUNT === 'number' ? DATABASE_SLOT_COUNT : 0;
        const slots = Array.from({ length: slotCount }, (_, index) => {
            const sourceSlot = typeof databaseSlots !== 'undefined' && Array.isArray(databaseSlots)
                ? databaseSlots[index]
                : null;
            return snapshotDatabaseSlot(sourceSlot, index);
        });

        return {
            id: createSessionId(normalizedTool),
            version: 1,
            createdAt: now(),
            expiresAt: now() + SNAPSHOT_TTL_MS,
            tool: normalizedTool,
            appState: {
                accessLevel: AppState.accessLevel,
                adminMode: Boolean(AppState.adminMode),
                networkOnline: AppState.networkOnline !== false,
                soundEnabled: AppState.soundEnabled !== false,
                effectsMode: typeof effectsMode !== 'undefined' ? effectsMode : 'auto',
                safeMode: Boolean(AppState.safeMode),
                connectedSiteId: AppState.connectedSiteId || ''
            },
            selectedMenuIndex: typeof selectedMenuIndex === 'number' ? selectedMenuIndex : 0,
            commandInputValue: commandInput ? commandInput.value : '',
            commandHistory: clonePlain(typeof commandHistory !== 'undefined' ? commandHistory : [], []),
            outputBuffer: snapshotOutputBuffer(),
            databaseSlots: slots,
            connectedSite: typeof snapshotConnectedSite === 'function' ? snapshotConnectedSite() : null,
            statusProfile: clonePlain(typeof statusProfile !== 'undefined' ? statusProfile : null, null)
        };
    }

    async function saveSnapshot(tool) {
        const record = createSnapshot(tool);
        try {
            await putIndexedDb(record);
            return { ok: true, id: record.id, storage: 'indexeddb' };
        } catch (indexedDbError) {
            try {
                putSessionStorage(record);
                return { ok: true, id: record.id, storage: 'sessionStorage' };
            } catch (sessionError) {
                return {
                    ok: false,
                    error: sessionError || indexedDbError || new Error('Snapshot failed')
                };
            }
        }
    }

    async function consumeSnapshot(id) {
        if (!id) return null;
        let record = null;

        try {
            record = await getIndexedDb(id);
            if (record) await deleteIndexedDb(id);
        } catch (_) {
            record = null;
        }

        if (!record) {
            try {
                record = getSessionStorage(id);
                deleteSessionStorage(id);
            } catch (_) {
                record = null;
            }
        }

        if (!record) return null;
        if ((Number(record.expiresAt) || 0) < now()) return null;
        return record;
    }

    function setTransferOverlayVisible(visible) {
        const existing = document.getElementById('terminalToolTransfer');
        if (!visible) {
            if (existing) existing.remove();
            return null;
        }

        if (existing) return existing;

        const overlay = document.createElement('div');
        overlay.id = 'terminalToolTransfer';
        overlay.className = 'tool-transfer-overlay';
        overlay.innerHTML = [
            '<div class="tool-transfer-panel">',
            '<div class="tool-transfer-brand">ARES // SESSION TRANSFER</div>',
            '<div class="tool-transfer-text" id="terminalToolTransferText">TRANSFERRING SESSION BUFFER</div>',
            '<div class="tool-transfer-bar" aria-hidden="true"><span></span></div>',
            '<div class="tool-transfer-subtext">PRESERVING TERMINAL STATE</div>',
            '</div>'
        ].join('');
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('active'));
        return overlay;
    }

    async function playTerminalTransfer(tool) {
        const overlay = setTransferOverlayVisible(true);
        const label = toolLabel(tool);
        const text = overlay ? overlay.querySelector('#terminalToolTransferText') : null;
        if (text) text.textContent = `OPENING ${label}`;
        if (prefersReducedMotion) {
            await delay(80);
            return;
        }
        await delay(120);
        if (text) text.textContent = 'TRANSFERRING SESSION BUFFER';
        await delay(220);
        if (text) text.textContent = 'HANDING OFF ACTIVE TOOL';
        await delay(220);
    }

    function reportSnapshotFailure(error) {
        if (typeof AudioEngine !== 'undefined' && AudioEngine.errorBuzz) {
            AudioEngine.errorBuzz();
        }
        if (typeof print === 'function') {
            print('', '', { instant: true });
            print('SESSION SNAPSHOT FAILED // TOOL LAUNCH ABORTED', 't-red', { instant: true });
            print(String(error && error.message ? error.message : error || 'Unknown snapshot error'), 't-amber', { instant: true });
        }
    }

    async function openTool(tool, path) {
        const normalizedTool = normalizeToolName(tool);
        if (!path) return false;

        const result = await saveSnapshot(normalizedTool);
        if (!result.ok) {
            reportSnapshotFailure(result.error);
            return false;
        }

        try {
            if (typeof pauseRealtimePanels === 'function') pauseRealtimePanels();
            if (typeof suspendTerminalRuntimeForMap === 'function') suspendTerminalRuntimeForMap();
            await playTerminalTransfer(normalizedTool);
            const separator = path.includes('?') ? '&' : '?';
            const params = new URLSearchParams({
                tool: normalizedTool,
                session: result.id,
                return: 'index.html'
            });
            window.location.href = `${path}${separator}${params.toString()}`;
            return true;
        } catch (error) {
            setTransferOverlayVisible(false);
            if (typeof resumeRealtimePanels === 'function') resumeRealtimePanels();
            if (typeof resumeTerminalRuntimeAfterMap === 'function') resumeTerminalRuntimeAfterMap();
            reportSnapshotFailure(error);
            return false;
        }
    }

    function parseRestoreRequest() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('restore') !== '1') return null;
        return {
            session: params.get('session') || '',
            from: normalizeToolName(params.get('from') || params.get('tool') || '')
        };
    }

    function normalizeOutputLine(line) {
        if (!line || typeof line !== 'object') {
            return { text: String(line || ''), className: '', instant: true };
        }
        return {
            text: String(line.text || ''),
            className: String(line.className || ''),
            id: line.id || null,
            groupId: line.groupId || null,
            type: line.type || null,
            instant: true
        };
    }

    function restoreOutputBuffer(lines) {
        if (typeof clearOutput === 'function') {
            clearOutput({ force: true });
        }
        const normalized = Array.isArray(lines) ? lines.map(normalizeOutputLine) : [];
        if (typeof outputBuffer !== 'undefined') {
            outputBuffer = normalized;
        }
        if (typeof currentPage !== 'undefined') currentPage = 0;
        const output = typeof getById === 'function' ? getById('output') : document.getElementById('output');
        if (output) {
            normalized.forEach(line => {
                const div = document.createElement('div');
                div.textContent = line.text;
                const typewriterClass = line.text.length ? 'terminal-typewriter-line' : '';
                div.className = `output-line ${typewriterClass} ${line.className || ''}`.trim();
                output.appendChild(div);
            });
        }
        if (typeof renderCurrentPageInstant === 'function') {
            renderCurrentPageInstant();
        }
    }

    function restoreDatabaseSlots(slots) {
        if (typeof DATABASE_SLOT_COUNT !== 'number' || typeof databaseSlots === 'undefined') return;
        const restored = Array.isArray(slots) ? slots : [];
        databaseSlots = Array.from({ length: DATABASE_SLOT_COUNT }, (_, index) => {
            const slot = restored[index] || {};
            return {
                index,
                loaded: Boolean(slot.loaded),
                source: String(slot.source || ''),
                file: String(slot.file || ''),
                metadata: clonePlain(slot.metadata || {}, {}),
                entries: clonePlain(Array.isArray(slot.entries) ? slot.entries : [], [])
            };
        });

        if (typeof rebuildDatabaseIndex === 'function') rebuildDatabaseIndex();
    }

    function applySnapshot(snapshot, options) {
        if (!snapshot) return false;
        const app = snapshot.appState || {};

        if (typeof setSafeMode === 'function') {
            setSafeMode(Boolean(app.safeMode), { announce: false });
        }
        if (typeof EffectsController !== 'undefined' && EffectsController.setMode) {
            EffectsController.setMode(app.effectsMode || 'auto', { persist: true, announce: false });
        }
        if (typeof AudioEngine !== 'undefined') {
            AudioEngine.enabled = app.soundEnabled !== false;
        }
        if (typeof setAppState === 'function') {
            setAppState({
                accessLevel: app.accessLevel || ACCESS_LEVELS.employee,
                networkOnline: app.networkOnline !== false,
                soundEnabled: app.soundEnabled !== false,
                safeMode: Boolean(app.safeMode),
                activeOverlay: 'none'
            }, { resetSelection: false });
        }

        if (typeof selectedMenuIndex !== 'undefined') {
            selectedMenuIndex = Number.isFinite(snapshot.selectedMenuIndex) ? snapshot.selectedMenuIndex : 0;
        }
        if (typeof commandHistory !== 'undefined') {
            commandHistory = clonePlain(Array.isArray(snapshot.commandHistory) ? snapshot.commandHistory : [], []);
        }
        if (typeof commandHistoryIndex !== 'undefined') {
            commandHistoryIndex = Array.isArray(commandHistory) ? commandHistory.length : 0;
        }

        if (typeof restoreConnectedSiteFromSnapshot === 'function') {
            restoreConnectedSiteFromSnapshot(snapshot.connectedSite, { persist: true });
        }
        restoreDatabaseSlots(snapshot.databaseSlots);
        if (snapshot.statusProfile && typeof setStatusProfile === 'function') {
            setStatusProfile(snapshot.statusProfile);
        }
        restoreOutputBuffer(snapshot.outputBuffer);

        const commandInput = document.getElementById('commandInput');
        if (commandInput) commandInput.value = String(snapshot.commandInputValue || '');

        if (typeof updateAccessUI === 'function') updateAccessUI();
        if (typeof updateSystemStatusVisual === 'function') updateSystemStatusVisual();
        if (typeof updateSoundStatus === 'function') updateSoundStatus();
        if (typeof updateEffectsStatus === 'function') updateEffectsStatus();
        if (typeof updateMenuSelection === 'function') updateMenuSelection();
        if (typeof updateDatabaseSlotIndicators === 'function') updateDatabaseSlotIndicators();
        if (typeof EffectsController !== 'undefined' && EffectsController.apply) EffectsController.apply();
        if (typeof AudioEngine !== 'undefined' && AudioEngine.updateSoundStatus) AudioEngine.updateSoundStatus();

        const from = normalizeToolName((options && options.restoredFrom) || snapshot.tool || '');
        if (typeof enqueueOutputLine === 'function') {
            enqueueOutputLine('', '', { instant: true });
            enqueueOutputLine(`SESSION RESTORED // ${toolLabel(from)} CLOSED`, 't-dim', { instant: true });
        } else if (typeof print === 'function') {
            print('', '', { instant: true });
            print(`SESSION RESTORED // ${toolLabel(from)} CLOSED`, 't-dim', { instant: true });
        }

        return true;
    }

    window.TerminalSessionRestore = {
        cleanupExpiredSnapshots,
        consumeSnapshot,
        openTool,
        parseRestoreRequest,
        applySnapshot,
        toolLabel
    };
})();
