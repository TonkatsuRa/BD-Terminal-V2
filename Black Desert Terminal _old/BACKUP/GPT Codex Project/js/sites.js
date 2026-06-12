(function () {
    'use strict';

    const DEFAULT_BRE_SITES = [
        ['BRE-01', 'BRE-01 // Acheron Gate Annex', 'ALPHA-7742', 'databases/sites/bre-01.md', 'content/sites/bre-01-status.md', 'assets/sites/bre-01-floorplan.svg'],
        ['BRE-02', 'BRE-02 // Meridian Extraction Site', 'BRAVO-3318', 'databases/sites/bre-02.md', 'content/sites/bre-02-status.md', 'assets/sites/bre-02-floorplan.svg'],
        ['BRE-03', 'BRE-03 // Khepri Observation Post', 'CHARLIE-1206', 'databases/sites/bre-03.md', 'content/sites/bre-03-status.md', 'assets/sites/bre-03-floorplan.svg'],
        ['BRE-04', 'BRE-04 // Glasshouse Containment', 'DELTA-5891', 'databases/sites/bre-04.md', 'content/sites/bre-04-status.md', 'assets/sites/bre-04-floorplan.svg'],
        ['BRE-05', 'BRE-05 // Boreline Relay Station', 'ECHO-4429', 'databases/sites/bre-05.md', 'content/sites/bre-05-status.md', 'assets/sites/bre-05-floorplan.svg'],
        ['BRE-06', 'BRE-06 // Orpheus Deep Lab', 'FOXTROT-9904', 'databases/sites/bre-06.md', 'content/sites/bre-06-status.md', 'assets/sites/bre-06-floorplan.svg']
    ].map(([id, displayName, code, database, statusProfile, floorplan]) => ({
        id,
        displayName,
        code,
        database,
        statusProfile,
        floorplan
    }));

    function terminalAppendLine() {
        return typeof appendMutableOutputLine === 'function'
            ? appendMutableOutputLine
            : (text, className) => {
                print(text, className);
                return { update: nextText => print(nextText, className) };
            };
    }

    async function runTerminalProgressBar(options = {}) {
        if (typeof renderTranscriptInstantFromBuffer === 'function') {
            renderTranscriptInstantFromBuffer();
        }

        const appendLine = terminalAppendLine();
        const heading = String(options.heading || '').trim();
        const label = String(options.label || 'TERMINAL BUS').trim().toUpperCase();
        const width = Math.max(8, Number.parseInt(options.width, 10) || (window.innerWidth < 520 ? 18 : 28));
        const duration = Math.max(1, prefersReducedMotion
            ? Math.min(Number(options.duration) || 520, 520)
            : Number(options.duration) || 1600);
        const spinner = ['/', '-', '\\', '|'];

        appendLine('', '');
        if (heading) appendLine(heading, options.headingClass || 't-cyan');
        const row = appendLine(`${spinner[0]} ${label} [${'-'.repeat(width)}] 000%`, options.className || 't-amber');
        const start = performance.now();
        let lastTick = 0;

        await new Promise(resolve => {
            function frame(now = performance.now()) {
                const elapsed = Math.max(0, Math.min(duration, now - start));
                const progress = elapsed / duration;
                const filled = Math.min(width, Math.floor(progress * width));
                const bar = `${'#'.repeat(filled)}${'-'.repeat(width - filled)}`;
                const percent = String(Math.floor(progress * 100)).padStart(3, '0');
                const glyph = spinner[Math.floor(elapsed / 120) % spinner.length];
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

        return appendLine;
    }

    function normalizeSiteId(value) {
        const text = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        const match = text.match(/^BRE0?([1-6])$/);
        return match ? `BRE-0${match[1]}` : String(value || '').trim().toUpperCase();
    }

    function normalizeCode(value) {
        return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    function publicSite(site) {
        if (!site) return null;
        return {
            id: site.id,
            displayName: site.displayName || site.id,
            database: site.database || '',
            statusProfile: site.statusProfile || '',
            floorplan: site.floorplan || ''
        };
    }

    function normalizeSiteConfig(site) {
        const id = normalizeSiteId(site.id);
        return {
            id,
            displayName: String(site.displayName || site.name || id),
            code: normalizeCode(site.code || site.decryptionCode || ''),
            database: String(site.database || `databases/sites/${id.toLowerCase()}.md`),
            statusProfile: String(site.statusProfile || site.status || `content/sites/${id.toLowerCase()}-status.md`),
            floorplan: String(site.floorplan || site.map || `assets/sites/${id.toLowerCase()}-floorplan.svg`)
        };
    }

    async function loadConnectedSiteManifest() {
        if (Array.isArray(window.connectedSiteManifest) && window.connectedSiteManifest.length) {
            return window.connectedSiteManifest;
        }
        try {
            const response = await fetch('sites/manifest.json', { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const json = await response.json();
            const sites = Array.isArray(json?.sites) ? json.sites : [];
            if (!sites.length) throw new Error('NO_SITES_IN_MANIFEST');
            window.connectedSiteManifest = sites.map(normalizeSiteConfig);
        } catch (error) {
            window.connectedSiteManifest = DEFAULT_BRE_SITES.map(normalizeSiteConfig);
            window.DebugConsole?.record?.('bre-sites:manifest-fallback', {
                message: error && error.message ? error.message : String(error)
            }, { context: true });
        }
        return window.connectedSiteManifest;
    }

    function fallbackDatabaseContent(site) {
        const id = site.id;
        const slug = id.toLowerCase();
        return [
            '---',
            `id: ${slug}-default`,
            `title: ${id} Site Intranet`,
            `description: Generated fallback records for ${id}.`,
            `password: ${site.code || id.replace('-', '')}`,
            '---',
            '',
            '## Category: BRE SITE',
            '',
            `### Entry: ${id} Connection Brief`,
            `Topic: ${id} Connection Brief`,
            `ID or Person: ${slug}-connection-brief`,
            'Date: 2084-03-14',
            'Access: Employee',
            `Keywords: ${id}; connection; intranet; remote`,
            'Message:',
            `${id} fallback intranet data is active because the browser could not fetch the site database file.`,
            '',
            `### Entry: ${id} Local Systems`,
            `Topic: ${id} Local Systems`,
            `ID or Person: ${slug}-local-systems`,
            'Date: 2084-03-14',
            'Access: Employee',
            `Keywords: ${id}; systems; status; placeholder`,
            'Message:',
            'Replace this scaffold record with final campaign data when available.'
        ].join('\n');
    }

    function fallbackStatusContent(site) {
        const number = Number(site.id.slice(-1)) || 1;
        const main = 62 + number * 3;
        const reserve = 28 + number * 4;
        const known = 5 + number * 2;
        const unknown = number % 3;
        return [
            '## diagnostic',
            `title = ${site.id} DIAGNOSTIC`,
            `ticker = ${site.id} REMOTE PROFILE FALLBACK // EDIT ${site.statusProfile || 'SITE STATUS FILE'} {spinner} {sweep:20}`,
            '',
            '## diagnostic.network',
            number % 2 ? 'state = warn' : 'state = ok',
            `status = ${site.id} LINK`,
            `level = ${Math.min(95, main)}`,
            '',
            '## diagnostic.power',
            number > 4 ? 'state = alert' : 'state = warn',
            `status = ${site.id} GRID`,
            `main = ${main}`,
            `reserve = ${reserve}`,
            '',
            '## diagnostic.life',
            unknown ? 'state = warn' : 'state = ok',
            `status = ${unknown} UNKNOWN`,
            `known = ${known}`,
            'unstable = 0',
            `unknown = ${unknown}`,
            '',
            '## facility',
            `title = ${site.id} TOPOGRAPHY`,
            `ticker = ${site.id} FALLBACK FLOORPLAN ACTIVE {spinner}`,
            '',
            '## facility.grid',
            `id = ${site.id}`,
            `structure = ${82 - number}`,
            `power = ${main}`,
            `reserve = ${reserve}`,
            `repair = 0${number} OPEN`,
            '',
            '## facility.contacts',
            `known = ${known}`,
            `unknown = ${unknown}`,
            `camera = 0${number}/12 MIXED`,
            `faults = ${site.id.replace('-', '')}-PLACEHOLDER`,
            'routes = core->relay, relay->service'
        ].join('\n');
    }

    async function readText(path, fallback) {
        try {
            const response = await fetch(path, { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.text();
        } catch (error) {
            window.DebugConsole?.record?.('bre-sites:text-fallback', {
                path,
                message: error && error.message ? error.message : String(error)
            }, { context: true });
            return fallback;
        }
    }

    function makeConnectedSiteDatabase(site, parsed) {
        const source = `${site.id} DEFAULT SITE DATABASE`;
        return {
            source,
            file: site.database,
            metadata: {
                ...(parsed.metadata || {}),
                id: parsed.metadata?.id || `${site.id.toLowerCase()}-default`,
                title: parsed.metadata?.title || source
            },
            entries: parsed.entries.map(entry => ({
                ...entry,
                databaseSlot: 'SITE',
                databaseSource: source,
                databaseFile: site.database,
                connectedSiteId: site.id,
                hiddenSiteDefault: true
            }))
        };
    }

    function persistConnectedSiteSession() {
        try {
            if (!connectedSite) {
                sessionStorage.removeItem(CONNECTED_SITE_SESSION_KEY);
                return;
            }
            sessionStorage.setItem(CONNECTED_SITE_SESSION_KEY, JSON.stringify(snapshotConnectedSite()));
        } catch (_) {}
    }

    function setConnectedSiteRuntime(site, siteDatabase, siteProfile, options = {}) {
        connectedSite = site ? publicSite(site) : null;
        connectedSiteDatabase = siteDatabase || null;
        setConnectedSiteStatusProfile(siteProfile || null);
        setAppState({ connectedSiteId: connectedSite?.id || '' }, { resetSelection: false });
        if (typeof rebuildDatabaseIndex === 'function') rebuildDatabaseIndex();
        updateConnectedSiteUi();
        if (!connectedSite && typeof closeDiagnosticDashboard === 'function') closeDiagnosticDashboard();
        if (options.persist !== false) persistConnectedSiteSession();
    }

    function siteHashTag(site, salt = 0) {
        const seed = `${site.id}${salt}`;
        let hash = 0;
        for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
        return hash.toString(16).toUpperCase().padStart(8, '0').slice(0, 8);
    }

    // Boot-style step: appends the line with a rotating spinner, animates the
    // spinner for ~spinMs, then swaps it for the final tag (default [ OK ]).
    // Mirrors the per-check animation used by the boot sequence (see boot.js
    // renderBootStatusSpinner). Does NOT clear or re-render the output, so it
    // doesn't race with the rest of the terminal.
    async function bootStyleStep(text, options = {}) {
        const appendLine = terminalAppendLine();
        const className = options.className || 't-dim';
        const doneClass = options.doneClassName || 't-cyan';
        const tag = options.tag || 'OK';
        const spinMs = prefersReducedMotion ? 80 : (options.spinMs ?? 320);
        const settleMs = prefersReducedMotion ? 0 : (options.settleMs ?? 70);
        const spinner = ['/', '-', '\\', '|'];

        const row = appendLine(`${text} [/]`, className);
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
                const glyph = spinner[Math.floor(elapsed / 95) % spinner.length];
                row.update(`${text} [${glyph}]`, className);
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

    async function bootStyleHeader(text, className = 't-amber') {
        const appendLine = terminalAppendLine();
        appendLine(text, className);
        if (!prefersReducedMotion) await new Promise(r => setTimeout(r, 90));
    }

    async function playConnectLog(site) {
        await bootStyleHeader('', '');
        await bootStyleHeader(`>> REMOTE BRE HANDSHAKE: ${site.id}`, 't-amber');
        await bootStyleHeader(`>> TARGET ${site.displayName}`, 't-dim');

        await bootStyleStep(`[NET] ARP probe ${site.id} :: gateway 10.${site.id.slice(-1)}.0.1`);
        await bootStyleStep(`[NET] TCP 443/SYN -> ${site.id}.ares.intranet :: ACK ${siteHashTag(site, 1)}`);
        await bootStyleStep('[SEC] requesting decryption code envelope ...');
        await bootStyleStep(`[SEC] decryption code accepted :: hash ${siteHashTag(site, 7)}`, { tag: 'OK' });
        await bootStyleStep('[TLS] negotiating cipher AES-256-GCM / X25519');
        await bootStyleStep('[AUTH] presenting personnel asset token :: clearance EMPLOYEE');
        await bootStyleStep(`[AUTH] remote registrar accepted :: session ${siteHashTag(site, 3)}-${siteHashTag(site, 5).slice(0, 4)}`);

        await runTerminalProgressBar({
            heading: '[INTRANET] mounting default record store ...',
            headingClass: 't-dim',
            label: `${site.id} SERVER LINK`,
            duration: prefersReducedMotion ? 400 : 1200
        });

        await bootStyleStep(`[INTRANET] default record set: bre-${site.id.slice(-2).toLowerCase()}.idx mounted`);
        await bootStyleStep(`[TELEMETRY] diagnostic profile bound :: ${site.statusProfile || 'fallback'}`);
        await bootStyleStep(`[MAP] floorplan asset linked :: ${site.floorplan || 'fallback'}`);
        await bootStyleHeader(`>> REMOTE LINK ESTABLISHED :: ${site.id}`, 't-cyan');
        await bootStyleHeader('', '');
    }

    async function connectBreSite(ctx = {}) {
        if (!AppState.networkOnline) {
            printNetworkUnavailable('BRE CONNECT');
            return;
        }
        const siteId = normalizeSiteId(ctx.argv?.[0] || '');
        const code = normalizeCode((ctx.argv || []).slice(1).join(' '));
        if (!siteId || !code) {
            print('');
            print('Usage: /CONNECT BRE-01 ALPHA-7742', 't-amber');
            print('Enable NET first, then provide a BRE site and decryption code.', 't-dim');
            print('');
            return;
        }

        const manifest = await loadConnectedSiteManifest();
        const site = manifest.find(item => item.id === siteId);
        if (!site) {
            AudioEngine.errorBuzz();
            print('');
            print(`BRE SITE NOT FOUND: ${siteId}`, 't-red');
            print('Known sites: BRE-01, BRE-02, BRE-03, BRE-04, BRE-05, BRE-06', 't-dim');
            print('');
            return;
        }
        if (normalizeCode(site.code) !== code) {
            AudioEngine.errorBuzz();
            print('');
            print(`${site.id}: DECRYPTION CODE REJECTED`, 't-red');
            print('Remote intranet handshake refused by site server.', 't-dim');
            print('');
            return;
        }

        await playConnectLog(site);

        const databaseText = await readText(site.database, fallbackDatabaseContent(site));
        const statusText = await readText(site.statusProfile, fallbackStatusContent(site));
        const parsedDatabase = parseMarkdownDatabase(databaseText, site.database);
        const parsedStatus = parseStatusProfile(statusText, site.statusProfile);
        const siteDatabase = makeConnectedSiteDatabase(site, parsedDatabase);

        setConnectedSiteRuntime(site, siteDatabase, parsedStatus);
        AudioEngine.successTone();
        print(`${site.id}: CONNECTED`, 't-cyan');
        print(site.displayName, 't-amber');
        print(`Default records mounted: ${siteDatabase.entries.length} hidden entries`, 't-dim');
        print('Previous BRE site connection has been replaced.', 't-dim');
        print('Use /WELCOME, /SEARCH, /CATEGORIES, /SITE STATUS, or /DISCONNECT.', 't-dim');
        print('');
        window.DebugConsole?.record?.('bre-sites:connected', getConnectedSiteDebugSnapshot(), { context: true });
    }

    function disconnectConnectedSite(options = {}) {
        if (!connectedSite) {
            if (options.announce !== false) {
                print('');
                print('NO BRE SITE CONNECTION ACTIVE', 't-amber');
                print('');
            }
            return false;
        }
        const previous = connectedSite;
        setConnectedSiteRuntime(null, null, null);
        try { sessionStorage.removeItem(CONNECTED_SITE_SESSION_KEY); } catch (_) {}
        if (options.announce !== false) {
            print('');
            print(`${previous.id}: DISCONNECTED`, 't-amber');
            print('Hidden site records and remote diagnostic profile cleared.', 't-dim');
            print('');
        }
        window.DebugConsole?.record?.('bre-sites:disconnected', { previous }, { context: true });
        return true;
    }

    function showConnectedSiteStatus() {
        clearOutput({ force: true });
        print('');
        print('BRE SITE CONNECTION STATUS', 't-bright');
        print('═══════════════════════════════════════════════════════', 't-dim');
        if (!connectedSite) {
            print('ACTIVE SITE : NONE', 't-amber');
            print(`NET         : ${AppState.networkOnline ? 'ENABLED, NO REMOTE SITE SESSION' : 'OFFLINE'}`, 't-dim');
            print('Command     : /CONNECT BRE-01 ALPHA-7742', 't-dim');
            print('');
            return;
        }
        print(`ACTIVE SITE : ${connectedSite.id}`, 't-cyan');
        print(`NAME        : ${connectedSite.displayName}`, 't-amber');
        print(`DATABASE    : ${connectedSite.database}`, 't-dim');
        print(`STATUS      : ${connectedSite.statusProfile}`, 't-dim');
        print(`FLOORPLAN   : ${connectedSite.floorplan}`, 't-dim');
        print(`ENTRIES     : ${connectedSiteDatabase?.entries?.length || 0}`, 't-cyan');
        print('');
    }

    function showConnectedSiteWelcome() {
        clearOutput({ force: true });
        print('');
        print('BRE SITE INTRANET', 't-bright');
        print('═══════════════════════════════════════════════════════', 't-dim');
        if (!connectedSite) {
            print('NO BRE SITE CONNECTED', 't-amber');
            print('Enable NET, then connect with /CONNECT BRE-01 ALPHA-7742.', 't-dim');
            print('');
            return;
        }
        print(`${connectedSite.displayName}`, 't-cyan');
        print('Default intranet entries are indexed by name only on this page.', 't-dim');
        print('Use /SEARCH with the exact title or keyword to open matching records.', 't-dim');
        print('--- DEFAULT SITE RECORDS ------------------------------', 'cli-divider t-dim');
        (connectedSiteDatabase?.entries || []).forEach((entry, index) => {
            const marker = String(index + 1).padStart(2, '0');
            const topic = typeof entryTopic === 'function' ? entryTopic(entry) : (entry.topic || entry.title || 'Untitled Entry');
            print(`${marker}. ${topic}`, 't-amber');
        });
        print('');
    }

    async function runNetworkServicesLog() {
        await bootStyleHeader('', '');
        await bootStyleHeader('>> NET INTERFACE ETH0 :: COLD BOOT', 't-amber');

        await bootStyleStep('[KMOD] loading ares-net-stack');
        await bootStyleStep('[KMOD] loading bre-tunnel.ko');
        await bootStyleStep('[NET] eth0 link state UP @ 1.0 Gbit/s full-duplex');
        await bootStyleStep('[NET] DHCP lease 10.99.0.42 / 255.255.255.0 :: gw 10.99.0.1');
        await bootStyleStep('[DNS] querying intranet.ares :: resolver 10.99.0.2');
        await bootStyleStep('[VPN] establishing ARES MACROTECH outbound tunnel ...');
        await bootStyleStep('[VPN] cert chain validated :: PEER', { tag: 'OK' });

        await runTerminalProgressBar({
            heading: '[BRE-NET] initializing remote access subsystem ...',
            headingClass: 't-dim',
            label: 'BRE REMOTE ACCESS',
            duration: prefersReducedMotion ? 500 : 1400
        });

        await bootStyleStep('[BRE-NET] discovery probe :: 6 BRE sites reachable');
        await bootStyleStep('[BRE-NET] handshake daemon online :: awaiting /CONNECT');
        await bootStyleHeader('>> NETWORK SERVICES ENABLED', 't-cyan');
        await bootStyleHeader('', '');
        await bootStyleHeader('Network Services enabled. Please connect to a BRE-Site with the /CONNECT BRE-XX <decryption code> command, to access the facility remotely', 't-amber');
        await bootStyleHeader('', '');
    }

    async function runRemoteDataAccessLog(operation = 'DATA') {
        const label = String(operation || 'DATA').trim().toUpperCase();
        const localSearchOperation = label === 'SEARCH' || label === 'FSEARCH';
        if (!connectedSite && !localSearchOperation) return false;
        if (!databaseLoaded && !connectedSiteDatabase) return false;
        const appendLine = await runTerminalProgressBar({
            heading: connectedSite ? `${connectedSite.id}: ${label} REMOTE ACCESS` : `${label} DATABASE INDEX`,
            headingClass: 't-dim',
            label: connectedSite ? `${connectedSite.id} ${label}` : `DATABASE ${label}`,
            className: 't-dim',
            doneClassName: 't-cyan',
            duration: 1400,
            width: window.innerWidth < 520 ? 16 : 22,
            successTone: false
        });
        appendLine('', '');
        return true;
    }

    async function runDatabaseLoadLog(source = 'DATABASE', entries = 0, slotNumber = 0) {
        const slot = Number.parseInt(slotNumber, 10) || 0;
        const appendLine = await runTerminalProgressBar({
            heading: 'DATABASE MOUNT SEQUENCE',
            headingClass: 't-amber',
            label: slot ? `DATABASE SLOT ${slot} MOUNT` : 'DATABASE MOUNT',
            duration: 1900,
            width: window.innerWidth < 520 ? 16 : 24,
            successTone: false
        });
        appendLine(`${String(source || 'DATABASE')} indexed // ${Number(entries) || 0} records`, 't-dim');
        appendLine('', '');
        return true;
    }

    function getConnectedSiteDatabaseEntries() {
        return connectedSiteDatabase && Array.isArray(connectedSiteDatabase.entries)
            ? connectedSiteDatabase.entries.slice()
            : [];
    }

    function updateConnectedSiteUi() {
        document.querySelectorAll('[data-bre-site]').forEach(indicator => {
            const siteId = normalizeSiteId(indicator.dataset.breSite || '');
            const active = Boolean(AppState.connectedSiteId) && siteId === AppState.connectedSiteId;
            indicator.classList.toggle('online', active);
            indicator.classList.toggle('offline', !active);
            indicator.setAttribute('aria-label', `${siteId} ${active ? 'connected' : 'not connected'}`);
        });

        const image = document.getElementById('siteFloorplanImage');
        const frame = document.querySelector('.facility-overview-card .projection-frame');
        if (!image || !frame) return;
        const hasSite = Boolean(connectedSite?.id || AppState.connectedSiteId);
        frame.classList.toggle('site-locked', AppState.networkOnline && !hasSite);
        frame.setAttribute('aria-label', !AppState.networkOnline
            ? 'Open tactical wireframe map. Network offline.'
            : hasSite
                ? 'Open tactical wireframe map for connected BRE site.'
                : 'Open tactical wireframe map. Connect a BRE site to show the facility overview preview.');
        frame.title = !AppState.networkOnline
            ? 'Network offline'
            : hasSite
                ? 'Open tactical wireframe map'
                : 'Connect a BRE site to show facility preview';
        if (connectedSite?.floorplan) {
            if (image.getAttribute('src') !== connectedSite.floorplan) image.src = connectedSite.floorplan;
            image.alt = `${connectedSite.id} floorplan preview`;
            image.hidden = false;
            frame.classList.add('site-floorplan-active');
        } else {
            image.removeAttribute('src');
            image.alt = '';
            image.hidden = true;
            frame.classList.remove('site-floorplan-active');
        }
    }

    function snapshotConnectedSite() {
        return {
            site: publicSite(connectedSite),
            database: connectedSiteDatabase ? {
                source: connectedSiteDatabase.source,
                file: connectedSiteDatabase.file,
                metadata: connectedSiteDatabase.metadata || {},
                entries: connectedSiteDatabase.entries || []
            } : null,
            statusProfile: connectedSiteStatusProfile && connectedSiteStatusProfile.loaded ? connectedSiteStatusProfile : null
        };
    }

    function restoreConnectedSiteFromSnapshot(snapshot, options = {}) {
        const site = snapshot?.site || null;
        const database = snapshot?.database || null;
        const profile = snapshot?.statusProfile || null;
        setConnectedSiteRuntime(site, database, profile, { persist: options.persist !== false });
        return Boolean(site);
    }

    function restoreConnectedSiteForToolScreen() {
        try {
            const params = new URLSearchParams(window.location.search);
            if (!params.get('session')) return false;
            const raw = sessionStorage.getItem(CONNECTED_SITE_SESSION_KEY);
            if (!raw) return false;
            return restoreConnectedSiteFromSnapshot(JSON.parse(raw), { persist: false });
        } catch (_) {
            return false;
        }
    }

    function getConnectedSiteDebugSnapshot() {
        return {
            connectedSiteId: AppState.connectedSiteId || '',
            connectedSite,
            databaseSource: connectedSiteDatabase?.source || '',
            databaseEntries: connectedSiteDatabase?.entries?.length || 0,
            statusProfileSource: connectedSiteStatusProfile?.source || '',
            statusKeys: Object.keys(connectedSiteStatusProfile?.values || {}).length,
            sessionStored: (() => {
                try { return Boolean(sessionStorage.getItem(CONNECTED_SITE_SESSION_KEY)); } catch (_) { return false; }
            })()
        };
    }

    window.connectBreSite = connectBreSite;
    window.disconnectConnectedSite = disconnectConnectedSite;
    window.showConnectedSiteStatus = showConnectedSiteStatus;
    window.showConnectedSiteWelcome = showConnectedSiteWelcome;
    window.runNetworkServicesLog = runNetworkServicesLog;
    window.runRemoteDataAccessLog = runRemoteDataAccessLog;
    window.runDatabaseLoadLog = runDatabaseLoadLog;
    window.getConnectedSiteDatabaseEntries = getConnectedSiteDatabaseEntries;
    window.updateConnectedSiteUi = updateConnectedSiteUi;
    window.snapshotConnectedSite = snapshotConnectedSite;
    window.restoreConnectedSiteFromSnapshot = restoreConnectedSiteFromSnapshot;
    window.restoreConnectedSiteForToolScreen = restoreConnectedSiteForToolScreen;
    window.getConnectedSiteDebugSnapshot = getConnectedSiteDebugSnapshot;
})();
