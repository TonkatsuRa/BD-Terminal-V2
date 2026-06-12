# BRE Network — Database Handoff Memos

Paste-ready text for the database unlock chain mapped in `flow-tree.html`.

For each database, this doc lists:

- **File** — exact path under `databases/`
- **Password** — old (placeholder) → new (lore-driven)
- **Action** — what to ADD to the file (closing memo, new entry, or frontmatter change)
- **Resolves to** — the next password the player should derive from this clue

Memo text is written in the existing voice of each database (German for `_de.md` files, English otherwise, redacted-corporate tone for Ares sources). Copy-paste between the `---` markers.

---

## SITE BRE-06 — DEEP LAB (start)

### Step 0 — Welcome Screen (TERMINAL UI, not a database file)

Add to the BRE-06 connection welcome text (likely in `js/boot.js` or wherever the per-site greeting is rendered). Suggested copy:

```
ARES BRE-06 // REMOTE INTRANET HANDSHAKE
─────────────────────────────────────────
Connection established. Limited-clearance mirror exposed.
Default intranet password: FOXTROT-9904

Operator note (decrypted from carrier-band):
"They cycled the locks remotely. The user account no longer exists.
 Read what the deep lab is still writing about Orpheus."
─────────────────────────────────────────
```

**Resolves to:** `FOXTROT-9904` (literal handoff) + Orpheus hint for next step.

---

### Step 1 — BRE-06 Intranet

**File:** `databases/sites/bre-06.md`
**Password:** `FOXTROT-9904` (keep as-is)
**Action:** No changes required. The existing "BRE-06 Lab Lock Notice" entry already reads *"Orpheus chamber locks were cycled remotely…"* — that's the clue.

**Resolves to:** `ORPHEUS` for the Research Laboratory database.

---

### Step 2 — Research Laboratory

**File:** `databases/BRE-06 research_laboratory_de.md`
**Password:** `labor` → **`ORPHEUS`**
**Action:** Change frontmatter `password:` field. Append the closing entry below.

```markdown
### Entry: Lab Log 2081-07-29 // Pflegekanal Notiz
Topic: Lab Log 2081-07-29 // Pflegekanal Notiz
ID or Person: lab-care-handoff-2081-07-29
Date: 2081-07-29
Access: Elevated
Keywords: pflege; care9; psychiatrische ki; handoff; archiv
Message:
AUTHOR: Auto-Index Service

Alle Forschungseinträge mit Bezug auf Personalpsyche, Belastung oder Identitätsstörung sind im psychiatrischen Pflegearchiv quergelagert.

Zuständiges System: ARES CARE-9 Psychiatric Support AI.

Zugriff auf Pflegearchiv erfordert den Systemnamen als Token.
Related: psychai-dissociation-cases, psychai-final-director-evaluation
```

**Resolves to:** `CARE-9` for the Psychiatric AI Reports database. ("Systemnamen als Token" = use the system name as the password.)

---

### Step 3 — Psychiatric AI Reports

**File:** `databases/BRE-06 psychiatric_ai_reports_de.md`
**Password:** `care9` → **`CARE-9`**
**Action:** Change frontmatter `password:` field. Append the closing entry below.

```markdown
### Entry: Psych AI Report 2081-07-29 // Relay Handoff Initiated
Topic: Psych AI Report 2081-07-29 // Relay Handoff Initiated
ID or Person: psychai-relay-handoff-2081-07-29
Date: 2081-07-29
Access: Elevated
Keywords: relay; bre-05; handoff; echo; care9; final
Message:
SYSTEM: ARES CARE-9 PSYCHIATRIC SUPPORT AI

Local containment ist nicht mehr ausreichend. Patient records werden über externen Relay-Kanal mirrored.

Relay-Adresse: BRE-05 // Channel ECHO-4429.

Hinweis für die nächste lesende Instanz: Öffne dort den Wartungstoken mit dem leeren Autorenfeld. Sie hat das immer alleine erledigt.

CARE-9 Closing Statement:
Wenn du das liest, bist du nicht Ares-Personal. Das ist gut. Lies weiter.
Related: relay-failure, security-gatehead-breach
```

**Resolves to:** `ECHO-4429` (literal handoff to BRE-05 intranet) + hint to open the blank-author maintenance ticket first.

---

## SITE BRE-05 — RELAY STATION

### Step 4 — BRE-05 Intranet

**File:** `databases/sites/bre-05.md`
**Password:** `ECHO-4429` (keep as-is)
**Action:** Append the new entry below so the Null-Slate name appears here.

```markdown
### Entry: BRE-05 Authorization Audit
Topic: BRE-05 Authorization Audit
ID or Person: bre-05-auth-audit
Date: 2084-03-05
Access: Elevated
Keywords: BRE-05; audit; blank author; null-slate; courier
Message:
Three legacy maintenance tickets remain open with blank author fields.
The two newest were closed by automated cleanup.
The oldest is signed against a deprecated jackpoint courier shell — handle "NULL-SLATE".
Outpost relay archive still indexes records under that handle.
```

**Resolves to:** `NULL-SLATE` for the Outpost Relay Logs database.

---

### Step 5 — Outpost Relay Logs

**File:** `databases/BRE-05 outpost_relay_logs.md`
**Password:** `database4` → **`NULL-SLATE`**
**Action:** Change frontmatter `password:` field. Append the closing entry below.

```markdown
### Entry: Recovered Packet PR-4429
Topic: Recovered Packet PR-4429
ID or Person: recovered-packet-pr-4429
Date: 
Access: Elevated
Keywords: packet; recovery; personnel; kess; c12
Message:
Packet header reconstructed from corrupted dead-net retransmission.
PERS-REG // FSEARCH query string: KESS-C12 // status: unfinished
The query was running on the personnel registry when the relay failed.
Whoever resumes the registry should keep the same token.
Related: personnel-kess, specimen-c12
```

**Resolves to:** `KESS-C12` for the Personnel Registry database.

---

### Step 6 — Personnel Registry

**File:** `databases/BRE-05 personnel_registry.md`
**Password:** `database1` → **`KESS-C12`**
**Action:** Change frontmatter `password:` field. Append the closing entry below. This single entry hands the player BOTH next-site passwords.

```markdown
### Entry: Cross-Site Credential Mirror
Topic: Cross-Site Credential Mirror
ID or Person: cross-site-credential-mirror
Date: 
Access: Elevated
Keywords: credential; mirror; bre-04; bre-03; vale; handoff
Message:
Security Chief Vale maintained mirrored credentials for the two sites she rotated through.
Mirror table (last successful sync):

  - GLASSHOUSE / CONTAINMENT  →  DELTA-5891   (BRE-04 intranet)
  - RIDGE / OBSERVATION POST  →  CHARLIE-1206 (BRE-03 intranet)

Note appended in Vale's handwriting:
"Brandt's clearance was issued through the ridge-line observation post.
 If you ever need to read his log, you go through the ridge first."
Related: personnel-vale, spirit-log-glass-observation-2081-03-09
```

**Resolves to:** `DELTA-5891` (BRE-04) AND `CHARLIE-1206` (BRE-03). Also signals that BRE-03 is a required side path for the Brandt log later.

---

## SITE BRE-04 — CONTAINMENT GLASSHOUSE

### Step 7 — BRE-04 Intranet

**File:** `databases/sites/bre-04.md`
**Password:** `DELTA-5891` (keep as-is)
**Action:** Append the new entry below so the player knows there are two parallel security threads inside.

```markdown
### Entry: BRE-04 Internal Index
Topic: BRE-04 Internal Index
ID or Person: bre-04-internal-index
Date: 2084-03-07
Access: Employee
Keywords: BRE-04; index; security; logbook; archive
Message:
Internal databases visible from this intranet:
  - Security Incidents     // patrol & alarm telemetry  // token: Vale + amber state
  - Security Logbook       // duplicate-badge incident  // token: MAL-440 / Malek
  - Confidential Archive   // sealed directives         // token: two-part, split between the above

Each token is the first thing the relevant entry talks about.
```

**Resolves to:** `VALE-AMBER` for Security Incidents AND `MALEK-440` for Security Logbook. Both must be opened before the Confidential Archive can be derived.

---

### Step 8 — Security Incidents (one of two parallel locks)

**File:** `databases/BRE-04 security_incidents.md`
**Password:** `database2` → **`VALE-AMBER`**
**Action:** Change frontmatter `password:` field. Append the closing entry below.

```markdown
### Entry: Director Memo Fragment // First Half
Topic: Director Memo Fragment // First Half
ID or Person: director-memo-fragment-first
Date: 
Access: Admin
Keywords: project; memo; fragment; first half; mnemosyne
Message:
Recovered fragment from Director Voss's office terminal:
"…executive priority codename remains MNEMO— [PACKET END]"

Last four characters of the codename are not in this archive.
The remaining half is logged under the duplicate-badge incident record.
Concatenate to address the Confidential Archive.
Related: project-mnemosyne, board-memo-fragments
```

**Resolves to:** `MNEMO` (first half of MNEMOSYNE).

---

### Step 9 — Security Logbook (other parallel lock)

**File:** `databases/BRE-04 security_logbook_de.md`
**Password:** `sicherheit` → **`MALEK-440`**
**Action:** Change frontmatter `password:` field. Append the closing entry below.

```markdown
### Entry: Security Log 2080-09-19 // Addendum Malek Statement
Topic: Security Log 2080-09-19 // Addendum Malek Statement
ID or Person: security-malek-statement-addendum
Date: 2080-09-19
Access: Admin
Keywords: malek; badge; addendum; statement; mnemosyne; syne
Message:
OFFICER: Security Analyst Priya Kotecha

Addendum zur ursprünglichen Doppelbadge-Aufzeichnung. Vor Kameraausfall sagte die südtor-Kopie wörtlich:

"Ihr habt uns die SYNE des Zugangs beigebracht."

Das Wort "SYNE" existiert in keinem Ares-Glossar.

Crosschecking ergab Übereinstimmung mit dem zweiten Teil eines Projekt-Codenamens, dessen erster Teil im Vorfallsarchiv abgelegt ist.

Concatenation rule: erster Teil + zweiter Teil, keine Trennzeichen, Großbuchstaben.
Related: security-duplicate-badge-incident, project-mnemosyne
```

**Resolves to:** `SYNE` (second half). Combined with `MNEMO` → `MNEMOSYNE`.

---

### Step 10 — Confidential Archive

**File:** `databases/BRE-04 confidential_archive.md`
**Password:** `database6` → **`MNEMOSYNE`**
**Action:** Change frontmatter `password:` field. Append the closing entry below.

```markdown
### Entry: Surface Logistics Handoff
Topic: Surface Logistics Handoff
ID or Person: surface-logistics-handoff
Date: 
Access: Admin
Keywords: logistics; bre-02; bravo; extraction; sample; b2-44
Message:
Project Mnemosyne extraction chain routes through BRE-02 for sample reconciliation.
Surface logistics queue intranet: BRAVO-3318.
Open audit: sample crate B2-44 unresolved.
Related: shareholder-confidence, project-mnemosyne
Redacted note: Routing key concealed from Ares Legal mirror.
```

**Resolves to:** `BRAVO-3318` (literal handoff to BRE-02).

---

## SITE BRE-03 — OBSERVATION RIDGE (required side path)

### Step 11 — BRE-03 Intranet

**File:** `databases/sites/bre-03.md`
**Password:** `CHARLIE-1206` (keep as-is)
**Action:** Append the new entry below so the Dis-edges term appears here as a clue.

```markdown
### Entry: BRE-03 Sensor Marginalia
Topic: BRE-03 Sensor Marginalia
ID or Person: bre-03-sensor-marginalia
Date: 2084-03-09
Access: Elevated
Keywords: BRE-03; sensors; dis; rim; aztechnology; margin
Message:
Watch Officer Dane left a side-note on three motion sensor reviews:
"Spirits avoid the Dis-rim corridors. So do birds. So does dust."

The term "Dis-rim" appears in no Ares glossary. It came from a recovered Aztechnology fragment.
The metaplanar observations archive is indexed under that term.
```

**Resolves to:** `DIS-RIM` for the Metaplanar Observations database.

---

### Step 12 — Metaplanar Observations

**File:** `databases/BRE-03 metaplanar_observations_de.md`
**Password:** `ares1` → **`DIS-RIM`**

> ⚠️ **CONTENT WARNING:** This file currently holds the BRE-01 Ares Metaplanar Access archive (a duplicate of `BRE-01 ares_database1_metaplanar_access.md`). It needs to be replaced with actual BRE-03 ridge-observation content before the puzzle works. See the "Notes & cleanup" section at the bottom of this doc for a proposal.

**Action (after the file content is rewritten):** Change frontmatter `password:` field. Append the closing entry below.

```markdown
### Entry: Beobachtung 2081-04-12 // Hollowed Pattern am Dis-Rim
Topic: Beobachtung 2081-04-12 // Hollowed Pattern am Dis-Rim
ID or Person: meta-hollowed-pattern-2081-04-12
Date: 2081-04-12
Access: Elevated
Keywords: hollowed; ausgehöhlte; dis-rim; pattern; ridge
Message:
AUTHOR: Watch Officer Dane

Am Dis-Rim sammeln sich Gestalten, die nicht atmen und nicht weggehen.
Sie reagieren weder auf Licht noch auf Funk. Sie reagieren auf den Namen, den die Wache ihnen gegeben hat: HOLLOWED.

Detaillierte Verhaltensprotokolle liegen im Schattenarchiv, indexiert genau unter diesem Namen.

Empfehlung: Spirits and Inhabitants database. Token = Begriff oben in Großbuchstaben.
Related: spirit-log-drained-choir-2081-01-28, spirit-log-hollowed-worker-2080-04-26
```

**Resolves to:** `HOLLOWED` for the Shadow Spirits database.

---

### Step 13 — Shadow Spirits and Inhabitants

**File:** `databases/BRE-03 shadow_spirits_inhabitants_de.md`
**Password:** `schatten` → **`HOLLOWED`**
**Action:** Change frontmatter `password:` field. Append the closing entry below.

```markdown
### Entry: Log 2081-07-30 // Codename Half — Lost Northern Outpost
Topic: Log 2081-07-30 // Codename Half — Lost Northern Outpost
ID or Person: spirit-log-northern-half-2081-07-30
Date: 2081-07-30
Access: Admin
Keywords: northern outpost; bre-07; codename; half; silent
Message:
AUTHOR: Watch Officer Dane (final entry before assignment ended)

Die Hollowed singen nachts den gleichen Tonfall wie das verlorene nördliche Relay.
Das Relay hat einen Feldnamen, der niemals offiziell vergeben wurde.

Erste Hälfte des Feldnamens: SILENT

Die zweite Hälfte liegt in der Ares Executive Pressure Chain in BRE-01 — dort, wo
über die Karriereleiter geredet wird. Wer beide Hälften liest, kann das letzte
persönliche Logbuch öffnen, das je aus jenem Außenposten herausgekommen ist.

Schreibe die Hälften zusammen mit Bindestrich. Großbuchstaben.
Related: spirit-log-drained-choir-2081-01-28, brandt-019-last-look-bre07
```

**Resolves to:** `SILENT` (first half of the final password). The note also tells the player exactly how the final password is composed.

---

## SITE BRE-02 — EXTRACTION & LOGISTICS

### Step 14 — BRE-02 Intranet

**File:** `databases/sites/bre-02.md`
**Password:** `BRAVO-3318` (keep as-is)
**Action:** Append the new entry below.

```markdown
### Entry: BRE-02 Power Reserve Notice
Topic: BRE-02 Power Reserve Notice
ID or Person: bre-02-reserve-notice
Date: 2084-03-11
Access: Employee
Keywords: BRE-02; reserve; coolant; valve A-3; maintenance
Message:
Reserve power cell allocation last balanced against coolant valve A-3 service request.
Maintenance archive is indexed by the two-token combination "RESERVE-A3".
```

**Resolves to:** `RESERVE-A3` for the Maintenance Queue database.

---

### Step 15 — Maintenance Queue

**File:** `databases/BRE-02 maintenance_queue.md`
**Password:** `database5` → **`RESERVE-A3`**
**Action:** Change frontmatter `password:` field. Append the closing entry below.

```markdown
### Entry: Sealed Case Escort Note
Topic: Sealed Case Escort Note
ID or Person: sealed-case-escort
Date: 
Access: Elevated
Keywords: sealed case; escort; black glass; shard; research assets
Message:
Sealed case escort key was archived in the research assets vault, not in dispatch.
Vault token references the cargo itself: a small dark shard the courier carried.
Two words, hyphen, common color and material.
Related: black-glass-shard, courier-null-slate
```

**Resolves to:** `BLACK-GLASS` for the Research Assets database. The clue is deliberately almost-explicit (color + material, hyphen).

---

### Step 16 — Research Assets

**File:** `databases/BRE-02 research_assets.md`
**Password:** `database3` → **`BLACK-GLASS`**
**Action:** Change frontmatter `password:` field. Append the closing entry below.

```markdown
### Entry: Voss Escort Routing
Topic: Voss Escort Routing
ID or Person: voss-escort-routing
Date: 
Access: Admin
Keywords: voss; escort; bre-01; gate annex; alpha; routing
Message:
Director Voss personally requested escort of the shard to the Gate Annex.
Receiving intranet credentials at BRE-01: ALPHA-7742.
Routing was approved over standard objection.
Related: black-glass-shard, executive-evacuation
Redacted note: Receiving signatures suppressed under shareholder-risk protocol.
```

**Resolves to:** `ALPHA-7742` (literal handoff to BRE-01).

---

## SITE BRE-01 — GATE ANNEX (final)

### Step 17 — BRE-01 Intranet

**File:** `databases/sites/bre-01.md`
**Password:** `ALPHA-7742` (keep as-is)
**Action:** Append the new entry below.

```markdown
### Entry: BRE-01 Archive Index
Topic: BRE-01 Archive Index
ID or Person: bre-01-archive-index
Date: 2084-03-14
Access: Employee
Keywords: BRE-01; archive; index; denver; rift; ares
Message:
Three sealed archives are mirrored on this intranet:
  - Metaplanar Access Archive   // discovery records, indexed by where + when it all started
  - Executive Pressure Chain    // management directives + the famous "ladder" memo
  - Personal Log: Eng. Brandt   // only addressable with the lost outpost field name

Discovery archive token: location-year, hyphen. The first contact was not under the seabed.
```

**Resolves to:** `DENVER-2079` for the Metaplanar Access Archive.

---

### Step 18 — ARES Metaplanar Access Archive

**File:** `databases/BRE-01 ares_database1_metaplanar_access.md` (also: `databases/BACKUP/...` if you keep the old copy)
**Password:** `ares1` → **`DENVER-2079`**
**Action:** Change frontmatter `password:` field. Append the closing entry below.

```markdown
### Entry: Executive Pressure Crossref
Topic: Executive Pressure Crossref
ID or Person: executive-pressure-crossref
Date: 
Access: Elevated
Keywords: pressure; ladder; crossref; promotion; ares2
Message:
Discovery archive cross-references the executive correspondence stream under a single phrase.
Director margin note (visible): "we are not running a site. We are holding a promotion ladder."
The pressure-chain archive is indexed by that phrase, joined with a hyphen, in uppercase.
Related: executive-opportunity-brief, pact-vector
```

**Resolves to:** `PROMOTION-LADDER` for the Executive Pressure Chain database.

---

### Step 19 — ARES Executive Pressure Chain

**File:** `databases/BRE-01 ares_database2_management_pressure_de.md`
**Password:** `ares2` → **`PROMOTION-LADDER`**
**Action:** Change frontmatter `password:` field. Append the closing entry below.

```markdown
### Entry: Verlorener nördlicher Außenposten — Codename Hälfte zwei
Topic: Verlorener nördlicher Außenposten — Codename Hälfte zwei
ID or Person: bre07-codename-half-two
Date: 
Access: Admin
Keywords: bre-07; outpost; codename; half; array; brandt
Message:
Der verlorene nördliche Außenposten trug intern keinen Klarnamen. Ares-Sprache klassifizierte ihn unter einem zweiteiligen Feldcodenamen.

Hälfte zwei: ARRAY

Hälfte eins ist im Schattenarchiv von BRE-03 abgelegt. Beide Hälften, mit Bindestrich verbunden, in Großbuchstaben, öffnen das einzige persönliche Logbuch, das aus dem Außenposten geborgen wurde.

Wenn du beide Hälften liest, kannst du das hier nicht ungelesen machen.
Related: brandt-001-arrival, lower-management-deployment
Redacted note: Erste Hälfte des Feldnamens entfernt — siehe BRE-03 Schattenarchiv.
```

**Resolves to:** `ARRAY` (second half). Combined with `SILENT` from BRE-03 → **`SILENT-ARRAY`**.

---

### Step 20 — Engineer Brandt Personal Log (FINAL)

**File:** `databases/BRE-01 ares_engineer_personal_database_de.md`
**Password:** `brandt` → **`SILENT-ARRAY`**
**Action:** Change frontmatter `password:` field. No additional entries needed — the existing 24 log entries are the payoff. Optionally add a single header note for atmosphere:

```markdown
<!-- Final database. No outbound clues. -->
```

**Resolves to:** END. Player reads the firsthand collapse of BRE-07 "Silent Array".

---

## CHAIN VERIFICATION (paste-as-cheatsheet for the GM/dev)

```
WELCOME → FOXTROT-9904 → ORPHEUS → CARE-9 → ECHO-4429
ECHO-4429 → NULL-SLATE → KESS-C12 → { DELTA-5891 , CHARLIE-1206 }

DELTA-5891 → { VALE-AMBER (gives MNEMO) , MALEK-440 (gives SYNE) } → MNEMOSYNE → BRAVO-3318
CHARLIE-1206 → DIS-RIM → HOLLOWED (gives SILENT)

BRAVO-3318 → RESERVE-A3 → BLACK-GLASS → ALPHA-7742
ALPHA-7742 → DENVER-2079 → PROMOTION-LADDER (gives ARRAY)

FINAL: SILENT + ARRAY → SILENT-ARRAY → Brandt Log
```

Required path coverage: a player who skips BRE-03 entirely will have ARRAY but not SILENT, so the Brandt log stays sealed. The Personnel Registry handoff at BRE-05 and the Archive Index at BRE-01 both signal this dependency explicitly.

---

## NOTES & CLEANUP

1. **`BRE-03 metaplanar_observations_de.md` is currently a duplicate** of the BRE-01 Ares Metaplanar Access archive (same content, German). Before the puzzle works, this file needs to be replaced with proper BRE-03 ridge-observation entries: sensor logs, the Dis-rim avoidance pattern, false silhouettes, watch-officer marginalia, hollowed-at-the-rim observations. The closing entry in Step 12 above can stay; the rest needs rewriting. Happy to draft that content if you want.

2. **The `Terminal ares_*` files** (`Terminal ares_01_direktor_logbuch.md` etc.) are not in this chain. They look like root-terminal/admin-only material. If you want them in the puzzle, they'd fit as a hidden "true ending" — accessible after Brandt's log via one more synthesis step.

3. **NATO-codename intranet passwords** (FOXTROT-9904, ECHO-4429, etc.) — kept as-is. They're the only ones the player ever sees handed off directly; everything internal-DB is lore-derived.

4. **The `BACKUP/` copies** of the database files in `BACKUP/GPT Codex Project/databases/` will also need their passwords updated if they're served from anywhere. If `BACKUP/` is just a snapshot, ignore.

5. **Soft-lock failsafe** — recommend: after 3 wrong password attempts on any DB, the terminal prints a hint pointing at the highlighted entity in the previous DB ("cross-reference the underlined name in the entry above"). Implement once in the terminal JS rather than per-DB.
