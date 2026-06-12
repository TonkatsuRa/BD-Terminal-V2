# Project Changelog

Rolling log of changes applied to the BRE network database files (and related). Each version is snapshotted into a sibling folder named `Backup YYYY-MM-DD vN/` before changes are applied — restoring is a folder copy back into `databases/` (and elsewhere as relevant).

Format per entry:

- **Version + date** at the top
- **Scope** — one-line summary
- **Files changed** — full list with brief note per file
- **Known gaps / follow-ups** — anything left for a later version

---

## v2 — 2026-05-21

**Scope:** Closes the two known gaps left open in v1. (1) Replaces the duplicate-content BRE-03 metaplanar observations file with proper ridge-observation entries so the BRE-03 side path is actually playable end-to-end. (2) Adds a per-site "operator hint" block at the bottom of the `/WELCOME` command output, seeded for BRE-06 with the Orpheus nudge — this is the seed clue that bootstraps the entire puzzle chain.

Snapshot folder: `BACKUP/Backup 2026-05-21 v2/`

### Files changed

- `databases/BRE-03 metaplanar_observations_de.md` — full rewrite. Previously held a duplicate of the BRE-01 Ares Metaplanar Access archive. Now contains 9 ridge-observation entries across three categories (SENSOR LOGS, DIS-RIM, HORIZONT-ILLUSIONEN) plus the v1 closing memo handing off to HOLLOWED. Password set to `DIS-RIM` (was `ares1`). New entries include false-silhouette telemetry, star-position drift, the Hollowed choir acoustic capture, the Dis-rim blind zone, drone D-7's lost 14 minutes, and the distant illusory city as seen from the ridge — all written in the existing German narrative voice and cross-referenced to existing IDs in other databases.
- `js/sites.js` — added `SITE_OPERATOR_HINTS` map (line ~20) and extended `showConnectedSiteWelcome()` to print the per-site hint block after the default record list. BRE-06's hint reads: *"They cycled the locks remotely. The user account no longer exists. Read what the deep lab is still writing about Orpheus."* — printed in amber with dim divider lines. Map structure is extensible; future sites can be added without further function changes.

### Behavior change

When a player connects to BRE-06 (`/CONNECT BRE-06 FOXTROT-9904`) and runs `/WELCOME`, the bottom of the welcome screen now shows the operator hint pointing at "Orpheus" — bootstrapping the player into the first internal database puzzle. No other site has a hint defined yet (intentional — clues come from the in-database entries themselves once the player is past the entry point).

### Known gaps / follow-ups for next version

1. **Seed-password delivery for BRE-06 itself.** The current intro flow (`runNetworkServicesLog()` at `js/sites.js` ~line 470) tells the player to use `/CONNECT BRE-XX <decryption code>` but never reveals `FOXTROT-9904`. The intent of the puzzle is that this first password comes from outside the terminal (game master, briefing doc, physical handout). If that's not the design, a single line could be added to the network-services log naming FOXTROT-9904 explicitly. Decide and apply in v3 if needed.

2. **Soft-lock failsafe still pending.** After 3 wrong password attempts on a DB, the terminal should ideally print a hint pointing at the relevant entry name. Not yet implemented. Likely a small change near where password rejection is currently handled in the search/access flow.

3. **`Terminal ares_*` files** in `databases/` still unused — possible "true ending" branch material.

---

## v1 — 2026-05-20

**Scope:** First implementation of the database unlock puzzle chain. Replaces placeholder internal-DB passwords with lore-driven ones, appends handoff memos so each database carries a clue to the next, and threads a branching tree from BRE-06 → BRE-05 → (BRE-04 + BRE-03) → BRE-02 → BRE-01. Final lock at Engineer Brandt's personal log requires a synthesized password from BRE-03 + BRE-01.

Design document: `puzzle-design/flow-tree.html`
Memo source-of-truth: `puzzle-design/handoff-memos.md`

### Files changed

**Site intranets (entry appended; password unchanged):**

- `databases/sites/bre-01.md` — added "BRE-01 Archive Index" entry pointing at the three sealed archives + Denver/year clue.
- `databases/sites/bre-02.md` — added "BRE-02 Power Reserve Notice" pointing at maintenance archive (RESERVE-A3).
- `databases/sites/bre-03.md` — added "BRE-03 Sensor Marginalia" introducing the Dis-rim term.
- `databases/sites/bre-04.md` — added "BRE-04 Internal Index" listing the two parallel security DBs + the split-token archive.
- `databases/sites/bre-05.md` — added "BRE-05 Authorization Audit" naming the Null-Slate courier handle.
- `databases/sites/bre-06.md` — no changes (existing Lab Lock Notice already carries the Orpheus clue).

**Internal databases (password updated + closing entry appended):**

- `databases/BRE-06 research_laboratory_de.md` — password `labor` → `ORPHEUS`. Added Pflegekanal Notiz pointing at CARE-9.
- `databases/BRE-06 psychiatric_ai_reports_de.md` — password `care9` → `CARE-9`. Added Relay Handoff Initiated entry handing off ECHO-4429.
- `databases/BRE-05 outpost_relay_logs.md` — password `database4` → `NULL-SLATE`. Added Recovered Packet PR-4429 pointing at KESS-C12.
- `databases/BRE-05 personnel_registry.md` — password `database1` → `KESS-C12`. Added Cross-Site Credential Mirror handing off BOTH `DELTA-5891` (BRE-04) and `CHARLIE-1206` (BRE-03), with explicit warning that BRE-03 is required for Brandt's log.
- `databases/BRE-04 security_incidents.md` — password `database2` → `VALE-AMBER`. Added Director Memo Fragment giving the first half `MNEMO`.
- `databases/BRE-04 security_logbook_de.md` — password `sicherheit` → `MALEK-440`. Added Malek Statement Addendum giving the second half `SYNE` + concatenation rule.
- `databases/BRE-04 confidential_archive.md` — password `database6` → `MNEMOSYNE`. Added Surface Logistics Handoff to BRAVO-3318.
- `databases/BRE-03 shadow_spirits_inhabitants_de.md` — password `schatten` → `HOLLOWED`. Added final-password half "SILENT" with composition rule.
- `databases/BRE-02 maintenance_queue.md` — password `database5` → `RESERVE-A3`. Added Sealed Case Escort Note pointing at BLACK-GLASS.
- `databases/BRE-02 research_assets.md` — password `database3` → `BLACK-GLASS`. Added Voss Escort Routing to ALPHA-7742.
- `databases/BRE-01 ares_database1_metaplanar_access.md` — password `ares1` → `DENVER-2079`. Added Executive Pressure Crossref pointing at PROMOTION-LADDER.
- `databases/BRE-01 ares_database2_management_pressure_de.md` — password `ares2` → `PROMOTION-LADDER`. Added Codename-half-two entry giving "ARRAY" + composition rule.
- `databases/BRE-01 ares_engineer_personal_database_de.md` — password `brandt` → `SILENT-ARRAY`. No appended entries (final database, no outbound clues).

### Full chain (cheatsheet)

```
WELCOME → FOXTROT-9904 → ORPHEUS → CARE-9 → ECHO-4429
ECHO-4429 → NULL-SLATE → KESS-C12 → { DELTA-5891 , CHARLIE-1206 }

DELTA-5891 → { VALE-AMBER (gives MNEMO) , MALEK-440 (gives SYNE) } → MNEMOSYNE → BRAVO-3318
CHARLIE-1206 → DIS-RIM → HOLLOWED (gives SILENT)

BRAVO-3318 → RESERVE-A3 → BLACK-GLASS → ALPHA-7742
ALPHA-7742 → DENVER-2079 → PROMOTION-LADDER (gives ARRAY)

FINAL: SILENT + ARRAY → SILENT-ARRAY → Brandt Log
```

### Known gaps / follow-ups for next version

1. **`databases/BRE-03 metaplanar_observations_de.md`** — NOT touched this version. The file currently contains a duplicate of `databases/BRE-01 ares_database1_metaplanar_access.md` (same content, German edition). For the chain to actually run, this file needs a complete rewrite: ridge-observation content (sensor logs, Dis-rim avoidance, false silhouettes, hollowed-at-the-rim observations). Once rewritten, change its password from `ares1` to `DIS-RIM` and append the closing entry from `puzzle-design/handoff-memos.md` Step 12.

2. **Welcome screen text** — needs to be added to the terminal UI (likely `js/boot.js` or wherever the per-site greeting is rendered). Draft copy is in `puzzle-design/handoff-memos.md` Step 0.

3. **Soft-lock failsafe** — recommend implementing a hint-after-N-failures behavior once in the terminal JS, rather than per-database.

4. **`Terminal ares_*` files** in `databases/` (direktor_logbuch, mitarbeiter_logbuch, woechentliche_rapporte) are not part of this chain and were left untouched. Possible candidates for a hidden "true ending" route after Brandt's log.

5. **`BACKUP/GPT Codex Project/databases/`** folder still holds an earlier snapshot of the database files (passwords like `database1`, `labor`, etc.). Left untouched — if it's served anywhere, those need the same update; if it's just a historical snapshot, ignore.
