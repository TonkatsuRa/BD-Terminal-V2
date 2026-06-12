# AGENTS.md — Project guide for AI coding assistants

This file is written for an AI agent (Claude, Codex, etc.) starting a fresh session on this codebase. Read it first. It captures the architecture, conventions, and gotchas that aren't obvious from the file tree.

If something in this file becomes wrong, update it as part of the change that made it wrong.

---

## What this project is

A static, GitHub-Pages-hostable retro-terminal RPG. The "game" is a CRT-styled web terminal where the player runs commands like `/DB`, `/ACCESS`, `/STATUS`, etc. against an in-world facility called Black Desert Research. Content lives in plain markdown files under `databases/`.

There is **no build step**. No bundler, no transpiler, no `node_modules`, no package.json. Files are loaded directly as `<script src="...">` or `<link rel="stylesheet">`. The only runtime dependency is the browser. (Node is used only for the test scripts in `tests/`.)

The two production HTML pages a player ever sees are `index.html` (the terminal) and a couple of side tools (`facility-map.html`, `diagnostics-screen.html`). The editor pages (`database-studio.html`, `diagnostics-editor.html`) are author tooling — also static HTML, deliberately standalone so they can be double-clicked.

---

## File map

### Entry-point HTML

| File | Role |
|---|---|
| `index.html` | The terminal. The main "game". |
| `facility-map.html` | Tactical map overlay. |
| `diagnostics-screen.html` | Diagnostics readout panel. |
| `database-studio.html` | **Canonical** database editor (clean modern UI, WYSIWYG, light/dark, embedded Base64 images, retro-terminal color tags). Self-contained — no `<script src>`. |
| `diagnostics-editor.html` | Editor for diagnostics screen content. Self-contained. |
| `Facility Wireframe Tactical Map.html` | Standalone map prototype. |

Note: the old `database-editor.html` was removed once `database-studio.html` proved stable. If you ever see references to it, they are stale.

### JS modules (in `index.html` load order)

Order matters because all scripts share the global window scope (no ES modules, no IIFE wrappers). Adding a new file means inserting a `<script src>` in `index.html` after its dependencies.

1. **`js/debug.js`** — debug helpers (loaded eagerly, no defer).
2. **`js/state.js`** — typewriter primitives (`typeTextSmooth`, `typeColoredTextSmooth`), media-preference handling, timing constants (`TYPEWRITER_CONFIG`).
3. **`js/utils.js`** — shared constants and helpers. Single source of truth for `ENCRYPTION_KEY`, `xorCrypt`, `escapeHtml`, `IMG_LINE_RE`, `TERMINAL_COLOR_NAMES`, `getById`, `clearElement`, the status-cache invalidator. **New shared utilities go here.**
4. **`js/audio.js`** — `AudioEngine` (keyClick, menuSelect, pageFlip, etc.).
5. **`js/database.js`** — database loading (file/zip/.dat/manifest), parsing, search, redaction, slot management, and `printEntry()` which renders an entry's fields and body through `print()`.
6. **`js/boot.js`** — boot sequence and the ASCII intro.
7. **`js/terminal.js`** — the runtime. Command dispatch (`executeCommand`), output buffering, the typewriter queue (`processTypewriterQueue`), `print()`, `enqueueOutputLine()`, `appendMutableOutputLine()`, inline-color rendering (`parseColorSegments`, `renderColoredText`, `setLineText`, `balanceColorTagsAcrossLines`), embedded-image rendering (`lineIsImageMarkdown`, `renderImageLine`), and the secret-editor command (`openSecretEditorPage`).
8. `js/session-restore.js`, `js/map-overlay.js`, `js/status-profile.js`, `js/sites.js`, `js/diagnostics.js`, `js/facility-status.js`, `js/access.js`, `js/ui.js` — feature subsystems.
9. **`js/main.js`** — boot hook. Last in load order.

Standalone JS (not loaded by `index.html`): `js/facility-map.js`, `js/facility-heightmap-data.js`, `js/diagnostics-screen.js`, `js/tool-screen-bridge.js` — loaded by their respective HTML pages only.

### CSS

| File | Role |
|---|---|
| `css/base.css` | Reset + base typography. |
| `css/layout.css` | Page-level layout (grid, panels, sidebars). |
| `css/terminal.css` | Terminal-specific classes: `.output-line`, `.t-amber`, `.t-cyan`, `.t-red`, `.t-magenta`, `.t-dim`, `.t-bright`, typewriter cursor, `.entry-image-embed`. |
| `css/animations.css` | Keyframes. |
| `css/responsive.css` | Breakpoints. |
| `css/themes.css` | Theme variables and CRT palette. |
| `css/facility-map.css` | Loaded only by `facility-map.html`. |

A previous monolithic `css/styles.css` was deleted in favor of the split files above.

### Data

| Path | Content |
|---|---|
| `databases/manifest.json` | List of databases shown in the studio sidebar. |
| `databases/*.md` | Database files. Format documented below. |
| `content/` | In-game text snippets. |
| `assets/` | Images, audio, etc. |
| `sites/`, `tools/` | Side-content. |

---

## Database file format

Each `databases/*.md` is a YAML-front-matter markdown file with this shape:

```markdown
---
id: <slug>
title: <display title>
description: <one-line summary>
password: <terminal password to open it>
---

<!-- comments are stripped before display -->

## Category: CATEGORY NAME

### Entry: Entry Title
id: entry-slug
title: Entry Title
category: CATEGORY NAME
tags: alpha; beta; gamma
clearance: 1
related: other-entry-id, another-id
redacted: optional one-line redaction note
body:
The entry body text. Can span multiple lines.

[color=amber]Inline colored passages[/color] use BBCode-style tags
matching one of: green, amber, cyan, red, magenta, dim, bright.

![alt text](data:image/png;base64,...)
```

**Parser leniency.** The parser (in `database-studio.html` and `js/database.js`) preserves any unknown keys in an `extras` map so round-tripping never loses fields. Some legacy files use `Topic:`, `Keywords:`, `Message:`, `ID or Person:` — these are aliased on read and re-emitted alongside the canonical field set on write.

**Inline color tags.** `[color=NAME]text[/color]` — the seven names are defined in `TERMINAL_COLOR_NAMES` (`js/utils.js`). Multi-line color regions across newlines are auto-balanced by `balanceColorTagsAcrossLines()` so each physical print-line is self-contained.

**Site-gating** (which sites surface this database in the LOAD menu) is resolved by `inferEntrySites(entry)` in `js/database.js` with this priority chain:

1. Manifest `sites` field — explicit array in `databases/manifest.json`, e.g. `"sites": ["BRE-01", "BRE-03"]`.
2. Frontmatter `sites:` line — declared in the .md file itself, e.g. `sites: BRE-01, BRE-03` (also accepts `[BRE-01, BRE-03]` bracket syntax). Cached after first load by `prefetchSitesMetadata()`; only files lacking the manifest field are fetched.
3. Filename prefix — `Terminal *.md` → always available; `BRE-XX *.md` → only at that site.
4. Default — always available (back-compat).

Sentinels: `"terminal"` and `"*"` both mean "visible regardless of connected site". An example using the frontmatter override lives in `databases/BRE-01 ares_database1_metaplanar_access.md`, which declares `sites: BRE-01, BRE-03` so the file shows at both Acheron Gate and Khepri Observation.

**Embedded images.** `![alt](data:image/...;base64,...)` on its own line. Detected by `IMG_LINE_RE` (`js/utils.js`). The terminal renderer strips the `| ` gutter prefix and emits an `<img class="entry-image-embed">` element, bypassing the typewriter so it doesn't try to "type" a Base64 string character-by-character.

---

## Data flow: a command's life in the terminal

```
user types in #cmd input
        │
        ▼
executeCommand()       (js/terminal.js)  — parses, dispatches
        │
        ▼
command handler        (e.g. /DB → js/database.js)
        │
        ▼
print(text, className) (js/terminal.js)
        │
        ▼
addToBuffer()  — splits on \n, calls enqueueOutputLine per line
        │
        ▼
enqueueOutputLine()
   │
   ├─ instant path:  setLineText(div, text)  →  output DOM   (skipTypewriter, prefersReducedMotion, image lines)
   │
   └─ animated path: typewriterQueue.push  →  processTypewriterQueue()
                                                 │
                                                 ▼
                                       typeTextSmooth (plain text)
                                              OR
                                       typeColoredTextSmooth (lines with [color=...] tags)
                                                 │
                                                 ▼
                                       characters revealed via RAF + AudioEngine.keyClick
```

`setLineText()` is the routing hub: image lines → `renderImageLine` → `<img>` element; color-tagged lines → `renderColoredText` → text-nodes wrapped in `<span class="t-amber">` etc.; everything else → plain `textContent`.

---

## Conventions

- **No build step.** Don't introduce one. Don't add npm dependencies.
- **No ES modules.** Everything in global window scope, loaded via `<script defer src>`. Order in `index.html` is the dependency graph.
- **Editor HTML files (`database-studio.html`, `diagnostics-editor.html`) are deliberately standalone.** They have inline `<style>` and `<script>` so they remain double-clickable from a file manager. Do **not** convert them to `<script src>` form. The trade-off is that some utilities (`escapeHtml`, `slugify`, `ENCRYPTION_KEY`) are duplicated inside them — keep them in sync with `js/utils.js` and flag the duplication with a comment.
- **CSS class naming.** Terminal text colors use the `.t-*` prefix (`.t-amber`, `.t-cyan`, etc.). Match this when adding a new color.
- **Don't use `innerHTML` for game text.** The terminal uses `textContent` (or pre-built text-node + span DOM) to avoid HTML injection from database content. The two carve-outs are deliberate: `renderColoredText` and `renderImageLine`, both of which construct DOM nodes manually from parsed input.
- **Magic strings.** Move repeated string literals into `js/utils.js` as named constants if they appear in more than one file (precedent: `TERMINAL_COLOR_NAMES`, `IMG_LINE_RE`).
- **Markdown parser is the source of truth for the data format.** Don't write competing parsers. The canonical implementation lives in `database-studio.html`; `js/database.js` has its own runtime version that may eventually be consolidated. Keep them behaviorally equivalent.

---

## How to verify changes

1. **Run the test scripts** for any change that touches a parser, regex, or markup helper:
   ```
   node tests/database-roundtrip.test.mjs
   node tests/color-markup.test.mjs
   node tests/image-markup.test.mjs
   ```
   Each exits 0 on success and 1 on failure. They have no dependencies — just Node.

2. **For UI changes**, open the relevant HTML page in a browser and click around. `index.html` is the terminal; `database-studio.html` is the editor.

3. **For terminal-pipeline changes** (typewriter, color, image rendering), test:
   - A plain text command (e.g. `/STATUS`) — typing cadence and key-click cadence unchanged.
   - A database entry with `[color=amber]inline color[/color]` — color renders, cursor still types.
   - A database entry with an embedded `![alt](data:image/png;base64,...)` line — image appears with no Base64 string typed out.
   - A redacted entry (`access` higher than current clearance) — body shows as `t-red` redaction.

---

## Gotchas

- **Disk-write lag.** In some sandboxed environments, Edit tool changes don't immediately appear via shell `cat`/`grep`. The Read tool always shows the live in-memory state. If shell-based verification shows truncated content, that's a sync artifact, not a real syntax error. The user's browser sees the live state.

- **Script load order.** `js/utils.js` must load before any file that references `escapeHtml`, `IMG_LINE_RE`, `TERMINAL_COLOR_NAMES`, `xorCrypt`, or `ENCRYPTION_KEY`. Currently it loads at position 3 in `index.html` and position 2 in `diagnostics-screen.html`. Verify before reordering.

- **`ENCRYPTION_KEY = 'Ares'` is duplicated.** Once in `js/utils.js`, and the ZIP-package password derivation in `js/database.js` (`DATABASE_ZIP_KEY_HEX_PARTS`) is built from the same word. If you ever rotate the key, grep for `'Ares'` and the hex bytes `41 72 65 73` and update every occurrence. The two documented copies of the ZIP password (`Zip PW Databases.txt`, `TERMINAL_COMMANDS_PASSWORDS_GUIDE.txt`) must change too. After rotation, any previously-exported encrypted `.dat` files will no longer decrypt.

- **The typewriter does NOT type image lines.** `processTypewriterQueue` short-circuits to `setLineText` when `lineIsImageMarkdown(text)` is true. Don't remove that check or the player will see a 100KB Base64 string typed out character-by-character.

- **Color spans use a zero-width sentinel.** When the studio editor inserts an empty color span (cursor placement before any text is typed), it seeds the span with `​` so the caret has somewhere to live. `htmlToMarkdown` strips this on save (`inner.replace(/​/g, '')`). Don't accidentally render the sentinel into saved markdown.

- **Multi-line paragraphs need per-line escape.** In `markdownToHtml`, paragraph lines must be passed through `inlineMd` individually and then joined with literal `<br>`. Joining first and escaping after will turn `<br>` into `&lt;br&gt;` and render visible text. (Fixed; don't reintroduce.)

- **The `| ` gutter prefix.** `printEntry` prefixes most body lines with `| ` to make them line up visually. Image lines are an exception — they're printed without the prefix and rendered as block `<img>` elements. The `IMG_LINE_RE` accepts the prefix anyway (lenient) so any future renderer changes still detect them.

- **`<br>` vs `<p>` for line breaks in contenteditable.** Browsers differ: Chrome makes new `<div>` blocks on Enter, Firefox makes new `<p>` elements, both make `<br>` on Shift+Enter. `htmlToMarkdown` handles all three.

- **The "Clear" color button splits — does not unwrap.** When the user clicks Clear with the caret inside a color span, the code calls `splitColorSpanAtCaret` so previously-typed text keeps its color and only future typing is plain. An earlier version did `unwrap` and silently de-colored already-typed text — don't regress to that.

---

## Recent refactor state (Tier-1 complete)

Done:

- `css/styles.css` deleted (~2700 lines of dead code).
- `escapeHtml` moved from `js/status-profile.js` into `js/utils.js`.
- `IMG_LINE_RE` consolidated in `js/utils.js`; `js/database.js` and `js/terminal.js` both reference it.
- `TERMINAL_COLOR_NAMES` extracted; `COLOR_TAG_NAME_RE` in `js/terminal.js` derived from it.
- `ENCRYPTION_KEY` sync warnings added on both sides.
- Multi-line paragraph `<br>` escape bug fixed in `database-studio.html`.

Not yet done (Tier-2, see prior planning notes if needed):

- Unify `typeTextSmooth` and `typeColoredTextSmooth` into one parameterized function.
- Extract the shared markdown parser into `js/database-format.js` so the studio and `js/database.js` consume one implementation.
- Tiny `el(tag, className, text)` helper in `utils.js` to replace ~40 `createElement` triplets in `js/database.js`.

---

## Quick checklist before finishing a change

- [ ] Tests in `tests/` still pass: `node tests/database-roundtrip.test.mjs && node tests/color-markup.test.mjs && node tests/image-markup.test.mjs`
- [ ] If you added a shared constant or helper, did you put it in `js/utils.js`?
- [ ] If you changed a parser or serializer, did you update both the studio's inline copy and `js/database.js`?
- [ ] If you added a new color name, did you add it to `TERMINAL_COLOR_NAMES`, the studio's `TERMINAL_COLORS` swatch list, and the `.t-NAME` CSS rule?
- [ ] If you touched the typewriter, did you keep `onChar` firing per character so the key-click cadence is preserved?
- [ ] Did the visual design change? It probably shouldn't unless the user asked.
