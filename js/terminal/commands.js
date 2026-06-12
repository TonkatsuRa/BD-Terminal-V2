// js/terminal/commands.js — command registry, resolution, history, autocomplete.

import { getById } from '../core/dom.js';
import { AudioEngine } from '../core/audio.js';
import { ACCESS_LEVELS, normalizeAccessLevel, hasAccess } from '../core/state.js';
import { print } from './output.js';

const COMMAND_HISTORY_STORAGE_KEY = 'aresCommandHistory.v1';
const COMMAND_HISTORY_LIMIT = 100;

const commandRegistry = [];
const commandMap = new Map();

let commandHistory = loadStoredCommandHistory();
let commandHistoryIndex = commandHistory.length;

export function normalizeCommandText(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}

export function splitCommandArgs(value) {
    const normalized = normalizeCommandText(value);
    return normalized ? normalized.split(/\s+/) : [];
}

function slashifyUsage(usage) {
    return String(usage || '')
        .split('|')
        .map(segment => {
            const trimmed = segment.trim();
            if (!trimmed) return segment;
            if (trimmed.startsWith('/')) return ` ${trimmed} `;
            return ` /${trimmed} `;
        })
        .join('|')
        .replace(/^\s+|\s+$/g, '');
}

/**
 * Register a terminal command.
 * @param {Object} definition
 * @param {string} definition.name - canonical (bare) name
 * @param {(ctx: Object) => any} definition.run
 * @param {string[]} [definition.aliases]
 * @param {string} [definition.usage]
 * @param {string} [definition.description]
 * @param {string} [definition.requiredAccess] - 'employee' | 'elevated' | 'admin'
 * @param {boolean} [definition.adminRequired] - shorthand for requiredAccess: admin
 * @param {boolean} [definition.hidden] - cheat codes: bare name only, no /alias, no help listing
 */
export function registerCommand(definition) {
    if (!definition || !definition.name || typeof definition.run !== 'function') return;
    const command = {
        aliases: [],
        usage: definition.name.toUpperCase(),
        description: '',
        adminRequired: false,
        requiredAccess: ACCESS_LEVELS.employee,
        hidden: false,
        ...definition
    };
    command.requiredAccess = normalizeAccessLevel(
        definition.requiredAccess || (command.adminRequired ? ACCESS_LEVELS.admin : ACCESS_LEVELS.employee)
    );
    command.adminRequired = command.requiredAccess === ACCESS_LEVELS.admin;
    if (!command.hidden) command.usage = slashifyUsage(command.usage);

    commandRegistry.push(command);
    const allAliases = new Set();
    [command.name, ...(command.aliases || [])].forEach(alias => {
        const key = normalizeCommandText(alias).toLowerCase();
        if (!key) return;
        allAliases.add(key);
        // Register the slash-prefixed form too (e.g. /search) — but never
        // advertise hidden cheat-code commands that way.
        if (!command.hidden && !key.startsWith('/')) allAliases.add(`/${key}`);
    });
    allAliases.forEach(key => commandMap.set(key, command));
}

/**
 * Resolve an input line to {command, alias, args, argv} or null.
 * Longest alias wins so "load status" beats "load".
 */
export function resolveCommandLine(input) {
    const raw = normalizeCommandText(input);
    const lower = raw.toLowerCase();
    if (!lower) return null;

    const aliases = Array.from(commandMap.keys()).sort((a, b) => b.length - a.length);
    for (const alias of aliases) {
        if (lower === alias || lower.startsWith(`${alias} `)) {
            const args = raw.slice(alias.length).trim();
            return {
                command: commandMap.get(alias),
                alias,
                args,
                argv: splitCommandArgs(args)
            };
        }
    }
    return null;
}

export function visibleCommandList(includeRestricted = true) {
    return commandRegistry
        .filter(command => !command.hidden && (includeRestricted || hasAccess(command.requiredAccess)))
        .sort((a, b) => a.usage.localeCompare(b.usage));
}

export function commandUsageKey(command) {
    return String(command?.usage || '').toUpperCase().replace(/^\/+/, '').trim();
}

/* ------------------------------------------------------------------ *
 * Command history
 * ------------------------------------------------------------------ */

function loadStoredCommandHistory() {
    try {
        const raw = localStorage.getItem(COMMAND_HISTORY_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(item => typeof item === 'string' && item.trim()).slice(-COMMAND_HISTORY_LIMIT);
    } catch (_) {
        return [];
    }
}

function persistCommandHistory() {
    try {
        localStorage.setItem(COMMAND_HISTORY_STORAGE_KEY, JSON.stringify(commandHistory.slice(-COMMAND_HISTORY_LIMIT)));
    } catch (_) {
        // Quota or privacy mode — in-memory history still works.
    }
}

export function rememberCommand(input) {
    const value = normalizeCommandText(input);
    if (!value) return;
    if (commandHistory[commandHistory.length - 1] !== value) commandHistory.push(value);
    while (commandHistory.length > COMMAND_HISTORY_LIMIT) commandHistory.shift();
    commandHistoryIndex = commandHistory.length;
    persistCommandHistory();
}

export function recallCommandHistory(direction) {
    const input = getById('commandInput');
    if (!input || !commandHistory.length) return;
    commandHistoryIndex = Math.max(0, Math.min(commandHistory.length, commandHistoryIndex + direction));
    input.value = commandHistory[commandHistoryIndex] || '';
    requestAnimationFrame(() => {
        input.setSelectionRange(input.value.length, input.value.length);
    });
}

/** Session restore: replace the history wholesale. */
export function setCommandHistory(history) {
    commandHistory = Array.isArray(history)
        ? history.filter(item => typeof item === 'string' && item.trim()).slice(-COMMAND_HISTORY_LIMIT)
        : [];
    commandHistoryIndex = commandHistory.length;
    persistCommandHistory();
}

export function getCommandHistory() {
    return commandHistory.slice();
}

/* ------------------------------------------------------------------ *
 * Autocomplete
 * ------------------------------------------------------------------ */

export function autocompleteCommandInput() {
    const input = getById('commandInput');
    if (!input) return;
    const current = normalizeCommandText(input.value).toLowerCase();
    if (!current) return;
    const matches = Array.from(commandMap.keys())
        .filter(alias => !commandMap.get(alias).hidden && alias.startsWith(current))
        .sort((a, b) => a.length - b.length || a.localeCompare(b));
    if (matches.length === 1) {
        input.value = matches[0].toUpperCase();
        input.setSelectionRange(input.value.length, input.value.length);
        AudioEngine.menuSelect();
        return;
    }
    if (matches.length > 1) {
        print('');
        print(`AUTOCOMPLETE: ${matches.map(match => match.toUpperCase()).join(' | ')}`, 't-dim');
        print('');
        AudioEngine.keyClick();
    }
}
