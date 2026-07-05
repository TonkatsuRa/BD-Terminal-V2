# AGENTS.md — Project guide for AI coding assistants

Read this first when starting a fresh session on this codebase. It captures the architecture, conventions, and gotchas that aren't obvious from the file tree.

If something in this file becomes wrong, update it as part of the change that made it wrong.

---

## What this project is

A static, GitHub-Pages-hostable retro-terminal RPG. The "game" is a CRT-styled web terminal where the player runs commands like `/DB`, `/ACCESS`, `/CONNECT BRE-01 ALPHA-7742` against an in-world facility called Black Desert Research. Content lives in plain markdown files under `databases/` and `content/`.

This is the **V2 rebuild**. The original (global-scope script chain) is preserved in `Black Desert Terminal _old/` — never edit it; it exists for reference and diffing.

There is **no build step and no bundler**. The core is native ES modules loaded directly by the browser; the only consequence is that `index.html` must be served over http(s) (`python -m http.server`), not opened via `file://`. The editor pages remain standalone double-clickable HTML.

---

## Architecture: two layers, one bridge

```
┌──────────────────────────────────────────────────────────┐
│ ES-module core (rewritten)                               │
│   js/core/      dom, utils, state, effects, audio,       │
│                 typewriter, loader, ascii                │
│   js/format/    PURE parsers: database-format, colors,   │
│                 status-format   (also imported by tests) │
│   js/terminal/  output (print/typewriter queue),         │
│                 commands (registry), progress, messages  │
│   js/features/  terminal, database, sites, access,       │
│                 status, status-load, boot, payload       │
│   js/app.js     entry point (DOMContentLoaded init)      │
└──────────────┬───────────────────────────────────────────┘
               │  js/bridge.js — THE contract: publishes the
               │  core on window (functions + accessor-backed
               │  globals like diagnosticActive, outputBuffer)
┌──────────────▼───────────────────────────────────────────┐
│ Legacy visual layer (classic scripts, ported verbatim)   │
│   js/legacy/  debug, session-restore, map-overlay,       │
│               diagnostics (SVG widgets), facility-status, │
│               ui (hologram + mini-games),                 │
│               tool-screen-bridge, diagnostics-screen,     │
│               facility-heightmap-data                     │
└──────────────────────────────────────────────────────────┘
```

Load order in `index.html`: `js/legacy/debug.js` (eager) → GSAP CDN (defer) → `js/app.js` (module) → legacy scripts (defer). Module scripts and deferred scripts execute in document order, so the bridge globals exist before any legacy script runs.

**Rules of the bridge:**
- Legacy scripts may only touch core symbols that `js/bridge.js` explicitly exposes. If a legacy file needs something new, add it to the bridge — never import a module from a classic script.
- Mutable shared flags (`diagnosticActive`, `facilityActive`, `outputBuffer`, `hologramStarted`, …) are `Object.defineProperty` accessors on `window` that route into core stores. Legacy bare reads/writes keep working. **Never declare `let`/`const` with these names at the top level of a legacy script** — that would shadow the accessor (a CI-style check: `tests/_smoke-module-graph.mjs` verifies the contract exists; grep for declarations if you add a legacy file).
- Core modules call legacy functions only via defensive `window.fnName?.()` (they may not be loaded yet, e.g. on tool pages).
- The goal is for legacy files to shrink over time: when you need to materially change one, migrate the changed part into a module and extend the bridge accordingly.

### Cross-module conventions in the core

- Cross-feature wiring is event-driven: `onUiSync(fn)` (state changes), `onEffectsChange(fn)`, `setQueueIdleHook(fn)`, `AudioEngine.onChange`. Don't add hard imports for notification paths.
- The few runtime-only circular imports (`database ↔ sites`, `boot ↔ terminal ↔ access`) are deliberate and safe because nothing is called during module evaluation. Don't add new top-level cross-calls.
- `js/format/*` must stay pure (no DOM, no `window`) — the Node tests import them directly.

---

## Entry-point HTML

| File | Role |
|---|---|
| `index.html` | The terminal. The main "game". |
| `facility-map.html` | Three.js tactical map (opened as a tool page or inside the facility overlay iframe). Map code is **inline** in this file. |
| `diagnostics-screen.html` | Standalone diagnostics tool page (loads `js/bridge.js` + legacy scripts). |
| `database-studio.html` | **Canonical** database editor. Self-contained on purpose (inline CSS/JS, double-clickable). Do not convert to external scripts. |
| `diagnostics-editor.html` | Editor for diagnostics content. Also self-contained on purpose. |
| `Facility Wireframe Tactical Map.html` | Standalone map prototype. |

The standalone editors duplicate a few utilities (`escapeHtml`, `slugify`, `ENCRYPTION_KEY`) — keep them in sync with `js/core/utils.js`.

---

## Database file format

Each `databases/*.md` is a YAML-front-matter markdown file:

```markdown
---
id: <slug>
title: <display title>
description: <one-line summary>
password: <terminal password to open it>
---

## Category: CATEGORY NAME

### Entry: Entry Title
id: entry-slug
tags: alpha; beta; gamma
clearance: 1
body:
The entry body. [color=amber]Inline color[/color] uses BBCode-style tags
(green, amber, cyan, red, magenta, dim, bright).
[redact=2]Sealed until Restricted, with [redact=3]deeper keywords[/redact]
inside[/redact] — nested levels, higher wins.

![alt text](data:image/png;base64,...)
```

- **Canonical parser:** `js/format/database-format.js` (`parseMarkdownDatabase`). The studio editor inlines a verbatim copy in its `<script id="studio-canonical-parser">` block (plus the canonical serializer). `tests/editor-conformance.test.mjs` asserts byte-identical parses and lossless serialize→parse round-trips on every shipped file, `tests/database-roundtrip.test.mjs` keeps the fast structural checks, and `tests/validate-databases.test.mjs` lints content + the manifest chain — run all three after touching the parser, the studio, or any database file. `tests/editor-smoke.mjs` (jsdom) drives the studio UI end to end.
- Unknown entry keys are preserved (`extras` round-tripping).
- **Site gating** (which databases the LOAD menu shows): manifest `sites` array > frontmatter `sites:` line > filename prefix (`Terminal *` → always, `BRE-XX *` → that site) > default always. Pure logic in `database-format.js` (`inferEntrySites`, `visibleDatabasesForSite`), fetch cache in `features/database.js`.
- **Clearance (5 tiers, rank 0-4):** public / employee / restricted / management / admin — `ENTRY_ACCESS` + `normalizeEntryAccess` in `database-format.js`, terminal-side ranks in `core/state.js`. Entries declare `Access:` (labels or 0-4; legacy "Elevated" → management). Whole entries above the reader's rank render fully redacted.
- **Inline redaction:** `[redact=N]…[/redact]` spans in message bodies (`js/format/redaction.js`, copied verbatim into the studio block). Nested spans: max open level wins. Spans above the reader's rank become █ (word shape kept); FSEARCH and snippets only see the reader-visible text. `tests/redaction.test.mjs` covers the engine.
- **Inline colors:** `TERMINAL_COLOR_NAMES` in `js/core/utils.js` is the single source. Adding a color: add it there, add the `.t-NAME` rule in `css/terminal.css`, and add it to the studio's swatch list.
- **Embedded images:** `IMG_LINE_RE` in `js/core/utils.js`. The typewriter never types image lines (a 100KB Base64 string would otherwise be typed character-by-character — keep the short-circuit in `terminal/output.js`).

## Status/content profiles

`content/terminal-content.md`, `content/sites/bre-0X-status.md`, and operator-loaded STATUS files all use the `[section]` / `## section` + `key = value` format parsed by `js/format/status-format.js`. Lookup precedence in `statusGet()`: connected-site profile → operator status profile → terminal content. Tokens like `{spinner}`, `{bar:key:18}` are expanded by `statusInterpolate` in `features/status.js`.

---

## A command's life

```
#commandInput Enter → processCommand (features/terminal.js)
  → executeCliCommand: echo, history, resolveCommandLine (terminal/commands.js)
  → access/network/site gates → command.run(ctx)
  → print(text, class, {instant?}) (terminal/output.js)
      instant path → setLineText → DOM
      animated path → typewriterQueue → typeSegments (core/typewriter.js)
          (image lines bypass; color tags become spans; key clicks throttled)
```

`setLineText` is the routing hub and never uses `innerHTML` — database content is untrusted. The two deliberate DOM-constructing carve-outs are colored spans and `<img>` embeds, both built from parsed input.

---

## Keys & passwords (in-world, not security)

- `ENCRYPTION_KEY = 'Ares'` (`js/core/utils.js`) — XOR key for `.dat` exports. Duplicated in the standalone editors; ZIP password `AresAres123` is derived from the same word (`DATABASE_ZIP_KEY_HEX_PARTS` in `features/database.js`). Grep for `'Ares'` and hex `41 72 65 73` before rotating; update `Zip PW Databases.txt` and `TERMINAL_COMMANDS_PASSWORDS_GUIDE.txt` in lockstep.
- Access passwords in `core/state.js`: admin (`ADMIN_PASSWORD`, base64-wrapped, case-sensitive), management (`MANAGEMENT_PASSWORD`, ex-elevated), restricted (`RESTRICTED_PASSWORD`), employee (`EMPLOYEE_PASSWORD`) — all but admin case-insensitive. The terminal boots at Public (rank 0); commands default to `requiredAccess: public`. BRE site connect codes in `features/sites.js` / `sites/manifest.json`.

---

## How to verify changes

1. **Static tests** (no dependencies):
   ```
   node tests/database-roundtrip.test.mjs && node tests/color-markup.test.mjs && \
   node tests/image-markup.test.mjs && node tests/site-gating.test.mjs && \
   node tests/format-parsers.test.mjs && node tests/_smoke-module-graph.mjs
   ```
   `_smoke-module-graph.mjs` evaluates the whole module graph with DOM stubs and asserts every bridge symbol exists — run it after touching `js/bridge.js` or any import.

2. **Integration tests** (need `npm i jsdom`): `node tests/integration-terminal.mjs` boots the real `index.html`, runs `/HELP`, `NET ON`, `/CONNECT`, access dialog, `LIST ALL`, diagnostics overlay. `node tests/integration-typewriter-db.mjs` exercises the live typewriter and the full database modal → password → decrypt → mount → search flow.

3. **In a browser:** serve over http, then check a plain command (`/HELP`), a color-tagged database entry, an embedded-image entry, and a redacted entry (red blocks) — same checklist as V1.

---

## Gotchas

- **`file://` no longer works for index.html** (ES modules). Editors still work from disk.
- **Don't reintroduce pagination.** The transcript is a scrolling buffer; `currentPage` exists only as a no-op bridge accessor for old session snapshots.
- **GSAP is optional.** Everything must degrade when the CDN is blocked (Animator checks `getGsap()` everywhere).
- **Reduced motion** flips `motion.reduced` live; the typewriter, boot, progress bars, and decrypt animation all read it. Test with the OS setting or DevTools emulation.
- **jsdom quirk** (integration tests): never assign `globalThis.performance = window.performance` — jsdom's Performance delegates to the global and infinitely recurses.
- **Legacy ascii helpers** (`asciiBar`, `spinner`, …) exist twice on purpose: exported from `js/core/ascii.js` *and* declared in `js/legacy/diagnostics.js` (which harmlessly overrides the window copies with identical code). Keep them in sync.
