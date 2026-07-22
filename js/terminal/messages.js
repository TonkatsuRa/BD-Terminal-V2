// js/terminal/messages.js — shared error/notice printers used by multiple
// feature modules (kept separate to avoid circular imports).

import { AudioEngine } from '../core/audio.js';
import { ACCESS_LEVELS, normalizeAccessLevel, accessLevelLabel } from '../core/state.js';
import { print, clearOutput } from './output.js';
import { contentGet } from '../features/status.js';

export function printAccessRequired(action, requiredLevel = ACCESS_LEVELS.admin) {
    const required = normalizeAccessLevel(requiredLevel);
    const label = accessLevelLabel(required).toUpperCase();
    const isAdmin = required === ACCESS_LEVELS.admin;
    AudioEngine.errorBuzz();
    clearOutput({ force: true });
    print('');
    print(`${action}: ${label}+ ACCESS REQUIRED`, isAdmin ? 't-red' : 't-amber');
    print(isAdmin
        ? contentGet('admin.required_hint', 'Use /ACCESS to authenticate before modifying status systems.')
        : `Use /ACCESS with ${accessLevelLabel(required)} (or higher) credentials before running this command.`, 't-dim');
    print('');
}

export function printAdminRequired(action) {
    printAccessRequired(action, ACCESS_LEVELS.admin);
}

export function printNoDatabaseLoaded() {
    AudioEngine.errorBuzz();
    clearOutput({ force: true });
    print('');
    print(contentGet('errors.no_database', 'ERROR: No database loaded.'), 't-red');
    print(contentGet('errors.no_database_hint', 'Use /LOAD DATABASE to select a package first.'), 't-dim');
    print('');
}

export function printDatabaseSlotsFull() {
    AudioEngine.errorBuzz();
    clearOutput({ force: true });
    print('');
    print('DATABASE SLOT CAPACITY REACHED', 't-red');
    print('Three database packages are already mounted.', 't-dim');
    print('Eject a slot before loading another package.', 't-amber');
    print('Commands: EJECT DATABASE SLOT 1 / 2 / 3 or EJECT ALL DATABASE', 't-dim');
    print('');
}

export function printNetworkUnavailable(systemName = 'NETWORK SYSTEM') {
    AudioEngine.errorBuzz();
    print('');
    print(`${systemName.toUpperCase()}: NETWORK OFFLINE`, 't-red');
    print('Network-dependent systems are unavailable until NET ONLINE is restored.', 't-dim');
    print('Use the NET status button or command /NET ON to enable network services.', 't-amber');
    print('');
}

export function printConnectedSiteRequired(systemName = 'REMOTE SYSTEM') {
    AudioEngine.errorBuzz();
    print('');
    print(`${systemName.toUpperCase()}: BRE SITE LINK REQUIRED`, 't-amber');
    print('This panel uses the connected BRE site diagnostic profile and facility data.', 't-dim');
    print('Use /CONNECT BRE-XX <code> after NET ONLINE to mount a remote site.', 't-cyan');
    print('');
}
