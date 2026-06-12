# Black Desert Research Terminal (V2)

An interactive retro sci-fi command terminal for the Black Desert / ARES Macrotechnology setting. Static web app: no build pipeline, no bundler, no backend. This is the **V2 rebuild** — same design and UI as the original, with the JavaScript rewritten as clean ES modules.

The previous codebase is preserved in `Black Desert Terminal _old/` for reference.

## Running it

ES modules don't load over `file://`, so serve the folder over HTTP:

```
python -m http.server 8080
# then open http://localhost:8080/
```

GitHub Pages works out of the box (`.nojekyll` included). The two editor pages (`database-studio.html`, `diagnostics-editor.html`) remain fully standalone and can still be double-clicked from a file manager.

## What changed in the rebuild

- **ES-module core.** The old 20-file global-scope script chain (where `<script>` order was the dependency graph) is now an explicit module graph under `js/core`, `js/format`, `js/terminal`, and `js/features`. Entry point: `js/app.js`.
- **One typewriter.** `typeTextSmooth` and `typeColoredTextSmooth` were near-duplicate implementations; they are now a single parameterized engine (`js/core/typewriter.js`).
- **One database parser.** The runtime markdown parser now lives in `js/format/database-format.js` — a pure module imported by both the browser and the Node tests, so the parser under test is the parser that ships. (The studio editor keeps its deliberate inline copy; a round-trip test cross-checks the two.)
- **Central state store.** `AppState`, access levels, and overlay flags live in `js/core/state.js` with event-driven UI sync instead of scattered globals mutated from everywhere.
- **Dead code removed.** The vestigial pagination machinery (`outputPages`, `buildOutputPages`, `recalculatePages`, `linesPerPage`) and the unused `js/facility-map.js` (1,965 lines — the real map code is inline in `facility-map.html`) are gone.
- **Bug fixes.** `print(text, class, {instant})` now honors its options argument (session restore was already passing it and being ignored); connected-site status profiles survive tool-screen handoffs; the decrypt animation respects reduced-motion.
- **Legacy visual layer, quarantined.** The big visual modules (diagnostics widgets, facility renderer, hologram + mini-games, map iframe bridge, session restore) are ported nearly verbatim as classic scripts in `js/legacy/`, fed through one explicit contract: `js/bridge.js`. They were stable, purely visual, and rewriting 8k lines of SVG animation would have risked the visuals the rebuild is supposed to preserve. Migrate them piecemeal whenever a real change is needed.
- **Bigger test suite.** 303 static assertions (was 180) plus two jsdom integration suites that boot the real `index.html`, run commands, mount a database through the modal, and open the diagnostics overlay.

## Features

Identical to V1: boot sequence, command-driven navigation (`/HELP`, `/SEARCH`, `/ACCESS`, `/CONNECT BRE-XX <code>`, …), three database slots with password-gated markdown/ZIP/.dat packages, site-gated database visibility, animated diagnostics dashboard, tactical facility map (Three.js iframe), facility status mode, access levels (Employee / Elevated / Admin), editable terminal copy via `content/terminal-content.md`, status profile overrides, audio/visual effect settings, performance modes, hidden mini-games, and the F1 debug overlay.

## Tests

```
node tests/database-roundtrip.test.mjs
node tests/color-markup.test.mjs
node tests/image-markup.test.mjs
node tests/site-gating.test.mjs
node tests/format-parsers.test.mjs
node tests/_smoke-module-graph.mjs      # module graph + bridge contract
```

Dependency-free (plain Node). The optional integration suites need jsdom (`npm i jsdom`):

```
node tests/integration-terminal.mjs
node tests/integration-typewriter-db.mjs
```

## Documentation

`AGENTS.md` documents the architecture, the bridge contract, the database file format, and the conventions. Passwords and player-facing codes are in `TERMINAL_COMMANDS_PASSWORDS_GUIDE.txt`.
