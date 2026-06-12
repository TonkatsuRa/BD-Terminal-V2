# Black Desert Research Terminal

An interactive retro sci-fi command terminal for the Black Desert / ARES Macrotechnology setting. The project is built as a static web app for GitHub Pages: no build pipeline, no backend, and no framework required.

Live site: [www.blackdesert.duckdns.org](http://www.blackdesert.duckdns.org/)

## Overview

Black Desert Research Terminal presents an in-universe operations console with searchable database packages, animated diagnostics, facility status views, tactical maps, access-gated commands, and editable Markdown-driven terminal content. It is intended to feel like a functioning research facility terminal rather than a conventional website.

## Features

- Retro terminal interface with boot sequence, command input, command history, autocomplete, and animated output.
- In-universe ARES Macrotechnology branding and Black Desert research facility presentation.
- Command-driven navigation for help, diagnostics, facility status, database search, access control, and settings.
- Searchable database system with multiple mountable database slots.
- Support for Markdown, text, binary-like, and password-protected ZIP database packages.
- Access/password flow for higher-clearance terminal commands.
- Animated Diagnostic Screen with telemetry widgets:
  - Gate stability scope
  - Shareholder value projection
  - Tactical radar sweep
  - Entity noise spectrum
  - Bioscan/vitals array
  - Reactor sync and containment
  - Anomaly tomography
  - Live event log
  - Signal strength
  - Uplink processor load
- Facility Status mode with fullscreen tactical map loading.
- Tactical wireframe facility map launched from the Facility Overview rendering.
- Standalone tool-screen pages that can return back to the terminal session.
- Editable terminal copy, diagnostics, and facility labels through Markdown content.
- Local database/status loading via browser file picker.
- Optional audio and visual effects settings.
- Performance modes for lower-power browsers.
- Hidden F1 debug overlay with copyable diagnostic reports for troubleshooting.
- GitHub Pages compatible static hosting.

## Tech Stack

- HTML
- CSS
- Vanilla JavaScript
- Markdown content files
- SVG/canvas/WebGL-style visual systems
- GitHub Pages compatible static assets

There is no npm install, no bundler, no React, no TypeScript, and no server-side runtime required for deployment.

## Main Commands

- `HELP` - Show terminal usage and available commands.
- `DIAGNOSTIC` - Open the animated base diagnostic dashboard.
- `FACILITY STATUS` - Open the fullscreen tactical facility map.
- `WIREFRAME` - Open the tactical wireframe facility map.
- `LOAD DATABASE` - Open the database selector.
- `LOAD FILE` - Load a local database file.
- `SEARCH <query>` - Search mounted database entries.
- `CATEGORIES` - Show mounted database categories.
- `LIST ALL` - Print the mounted database index.
- `ACCESS` - Request elevated clearance.
- `FX AUTO`, `FX FULL`, `FX LOW` - Adjust visual effects.
- `PERFORMANCE ON`, `PERFORMANCE OFF` - Toggle performance mode.
- `SOUND ON`, `SOUND OFF` - Toggle terminal audio.

## Project Structure

```text
index.html                              Main terminal shell
diagnostics-screen.html                 Standalone fullscreen diagnostic screen
facility-map.html                       Fullscreen tactical facility map
Facility Wireframe Tactical Map.html    Full tactical wireframe map
database-editor.html                    Local database editor utility
diagnostics-editor.html                 Local diagnostics/content editor utility

css/                                    App styles and responsive layout
js/                                     Terminal, diagnostics, maps, state, and utilities
content/terminal-content.md             Editable terminal text and labels
databases/                              Database packages and manifest
assets/                                 Images, maps, SVGs, and supporting media
start-server.ps1                        PowerShell fallback static server
```

## Editing Content

Most visible terminal copy is stored in:

```text
content/terminal-content.md
```

This file controls:

- Terminal title and build metadata
- Command labels
- Welcome/help text
- Diagnostic labels and status text
- Facility labels and readouts
- Error and system messages

Database package metadata lives in:

```text
databases/manifest.json
```

Database content files live in:

```text
databases/
```

## Database Packages

Database packages can be plain Markdown/text files or password-protected ZIP files. ZIP packages are useful for hiding spoilers from casual browsing, but this is not strong cryptographic security because the static JavaScript must still know how to open them in the browser.

Example manifest entry:

```json
{
  "id": "sealed-archive",
  "displayName": "Sealed Archive",
  "description": "Encrypted database package.",
  "file": "sealed-archive.zip",
  "format": "zip",
  "innerFile": "sealed-archive.md"
}
```

The ZIP should contain one `.md`, `.markdown`, or `.txt` database file using the same format as the existing database files.

## Debug Mode

Press `F1` in the terminal or tool screens to open the hidden debug overlay.

The debug overlay captures runtime context, console errors, map initialization failures, iframe events, and other diagnostic state. Use `COPY REPORT` when filing or pasting a bug report back into Codex.

## Deployment

This project is designed for GitHub Pages.

Requirements:

- Publish the repository root so `index.html` is at the site root.
- Keep `.nojekyll` in the repository so GitHub Pages serves Markdown/database files normally.
- Keep asset paths relative unless there is a specific reason to use an absolute URL.

The included `CNAME` points to:

```text
www.blackdesert.duckdns.org
```

## Notes

- The app is intentionally static and client-side.
- Some external libraries are loaded from CDNs for browser features.
- A local HTTP server gives the most reliable preview.
- If database loading is blocked while opening files directly, use a local HTTP server or load database files manually through the in-terminal file picker.
