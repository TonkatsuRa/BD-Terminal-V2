// tests/redaction.test.mjs — the inline [redact=N] markup engine and the
// 5-level clearance model.

import { TestRunner } from './_helpers.mjs';
import {
    applyRedactionMarkup, stripRedactionTags, validateRedactionMarkup, messageHasRedactionMarkup
} from '../js/format/redaction.js';
import { normalizeEntryAccess, ENTRY_ACCESS, ENTRY_ACCESS_RANKS } from '../js/format/database-format.js';

const t = new TestRunner('Redaction & clearance levels');

// ---- clearance normalization (5 tiers, legacy labels) ----
t.assertEqual(ENTRY_ACCESS_RANKS.public, 0, 'rank: public 0');
t.assertEqual(ENTRY_ACCESS_RANKS.admin, 4, 'rank: admin 4');
t.assertEqual(normalizeEntryAccess('Elevated'), ENTRY_ACCESS.management, 'legacy Elevated → management');
t.assertEqual(normalizeEntryAccess('Restricted'), ENTRY_ACCESS.restricted, 'Restricted is its own tier');
t.assertEqual(normalizeEntryAccess('Public'), ENTRY_ACCESS.public, 'Public tier');
t.assertEqual(normalizeEntryAccess('2'), ENTRY_ACCESS.restricted, 'numeric 2 → restricted');
t.assertEqual(normalizeEntryAccess('', { clearance: '3' }), ENTRY_ACCESS.management, 'Clearance: 3 → management');

// ---- the user's canonical example: L2 block containing an L3 keyword ----
const msg = 'Report: [redact=2]the portal at [redact=3]KHEPRI[/redact] failed[/redact] today.';
t.assertEqual(applyRedactionMarkup(msg, 1), 'Report: ███ ██████ ██ ██████ ██████ today.', 'rank 1: whole block masked, word shape kept');
t.assertEqual(applyRedactionMarkup(msg, 2), 'Report: the portal at ██████ failed today.', 'rank 2: block visible, L3 keyword still masked');
t.assertEqual(applyRedactionMarkup(msg, 3), 'Report: the portal at KHEPRI failed today.', 'rank 3: everything visible');
t.assertEqual(applyRedactionMarkup(msg, 4), applyRedactionMarkup(msg, 3), 'rank 4 same as rank 3 here');
t.assertEqual(stripRedactionTags(msg), 'Report: the portal at KHEPRI failed today.', 'stripRedactionTags = rank-4 view');

// ---- plain text passes through untouched ----
t.assertEqual(applyRedactionMarkup('no tags here', 0), 'no tags here', 'no markup → unchanged');
t.assert(!messageHasRedactionMarkup('plain'), 'messageHasRedactionMarkup false on plain text');
t.assert(messageHasRedactionMarkup('[redact=2]x[/redact]'), 'messageHasRedactionMarkup true');

// ---- newlines and spaces survive inside masked spans ----
t.assertEqual(applyRedactionMarkup('[redact=4]ab cd\nef[/redact]', 1), '██ ██\n██', 'spaces/newlines preserved in mask');

// ---- color tags inside hidden spans are dropped, not masked ----
t.assertEqual(
    applyRedactionMarkup('x [redact=3][color=red]SECRET[/color][/redact] y', 2),
    'x ██████ y',
    'color tags inside hidden span neither leak nor render as blocks'
);
t.assertEqual(
    applyRedactionMarkup('x [redact=3][color=red]SECRET[/color][/redact] y', 3),
    'x [color=red]SECRET[/color] y',
    'color tags kept when span is readable'
);

// ---- leniency ----
t.assertEqual(applyRedactionMarkup('[redact=2]abc', 1), '███', 'unclosed span redacts to end');
t.assertEqual(applyRedactionMarkup('abc[/redact]', 1), 'abc', 'stray close ignored');
t.assertEqual(applyRedactionMarkup('[redact=9]abc[/redact]', 1), '[redact=9]abc', 'invalid level tag stays literal text, stray close dropped');

// ---- validation ----
t.assertEqual(validateRedactionMarkup('[redact=2]a[redact=3]b[/redact]c[/redact]').length, 0, 'valid nesting → no issues');
t.assert(validateRedactionMarkup('[redact=3]a[redact=2]b[/redact][/redact]').some(i => i.severity === 'warn'), 'inner level ≤ outer → warning');
t.assert(validateRedactionMarkup('[redact=2]abc').some(i => i.severity === 'error'), 'unclosed → error');
t.assert(validateRedactionMarkup('a[/redact]').some(i => i.severity === 'error'), 'stray close → error');
t.assert(validateRedactionMarkup('[redact=7]x[/redact]').some(i => i.severity === 'error'), 'invalid level → error');

t.exit();
