// js/features/status-load.js — loading an operator status profile from a
// local file (admin /LOAD STATUS). Separate from status.js because a
// successful load triggers a full terminal restart (access.js).

import { motion } from '../core/effects.js';
import { AudioEngine } from '../core/audio.js';
import { parseStatusProfile } from '../format/status-format.js';
import { print } from '../terminal/output.js';
import { setStatusProfile, persistStatusProfile, statusProfile } from './status.js';
import { decodeStatusPayload } from './payload.js';
import { forceCloseRuntimeOverlays, restartTerminalAfterStatusLoad } from './access.js';

export function handleStatusFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    if (/\.(txt|md|markdown|dat|db|bin)$/.test(fileName)) {
        loadStatusProfileFile(file);
    } else {
        AudioEngine.errorBuzz();
        print('');
        print('ERROR: Unsupported status profile format.', 't-red');
        print('Expected: .txt, .md, .markdown, or encrypted .dat', 't-dim');
        print('');
    }
    e.target.value = '';
}

function loadStatusProfileFile(file) {
    print('');
    print('STATUS PROFILE DETECTED', 't-amber');
    print(`Reading: ${file.name}`, 't-dim');

    const reader = new FileReader();
    reader.onload = event => {
        try {
            const encrypted = /\.(dat|db|bin)$/i.test(file.name);
            const content = encrypted ? decodeStatusPayload(event.target.result) : event.target.result;
            const profile = parseStatusProfile(content, file.name);
            if (!profile.loaded) throw new Error('No profile keys found');
            setStatusProfile(profile);
            persistStatusProfile(profile, content);
            AudioEngine.dataLoaded();
            forceCloseRuntimeOverlays();
            print('');
            print('STATUS PROFILE LOADED', 't-cyan');
            print(`Source: ${statusProfile.source}`, 't-amber');
            print(`Fields: ${Object.keys(statusProfile.values).length}`, 't-cyan');
            print('Terminal restart required by status profile update.', 't-dim');
            print('Admin session will be revoked.', 't-amber');
            print('');
            setTimeout(restartTerminalAfterStatusLoad, motion.reduced ? 120 : 900);
        } catch (_) {
            AudioEngine.errorBuzz();
            print('');
            print('ERROR: STATUS PROFILE FAILED', 't-red');
            print('No readable key/value fields were found or decryption failed.', 't-dim');
            print('Use /STATUS FORMAT to view the expected layout.', 't-dim');
            print('');
        }
    };
    reader.onerror = () => {
        AudioEngine.errorBuzz();
        print('');
        print('ERROR: Could not read status profile.', 't-red');
        print('');
    };
    reader.readAsText(file);
}
