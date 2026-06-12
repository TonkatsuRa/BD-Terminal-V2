# tests/

Plain Node test scripts. No dependencies, no test framework — each file is a self-contained `.mjs` that exits 0 on success or 1 on first failure, with human-readable output along the way.

## Run them

From the repo root:

```bash
node tests/database-roundtrip.test.mjs
node tests/color-markup.test.mjs
node tests/image-markup.test.mjs
```

Or all three:

```bash
for t in tests/*.test.mjs; do node "$t" || exit 1; done
```

## What each one covers

- **`database-roundtrip.test.mjs`** — Parses every `databases/*.md` file with the canonical parser from `database-studio.html`, serializes it back, then re-parses the serialized form. Asserts that entry counts, titles, categories, and bodies all survive the round-trip. Run this after any change to the markdown parser/serializer.

- **`color-markup.test.mjs`** — Exercises the `[color=NAME]...[/color]` pipeline: detection (`lineHasColorMarkup`), segmentation (`parseColorSegments`), and newline-balancing (`balanceColorTagsAcrossLines`). Verifies the regex source matches the canonical color list in `js/utils.js`. Run this after touching `terminal.js`'s color helpers or `TERMINAL_COLOR_NAMES`.

- **`image-markup.test.mjs`** — Exercises `IMG_LINE_RE` (from `js/utils.js`): valid PNG/JPEG/SVG data URLs are detected, prefix-tolerant detection works (`| ![alt](...)`), inline images are NOT detected as block images, non-image data URLs are rejected. Run this after touching `IMG_LINE_RE` or either of its consumers.

## Tests/ helpers

`tests/_extract.mjs` is a small helper that pulls named function bodies out of `database-studio.html` and `js/utils.js`. Tests load whatever they need via this helper so we don't have to maintain a parallel copy of every function inside the test files.

## Adding a new test

1. Create `tests/<name>.test.mjs`.
2. If you need to exercise a function from `database-studio.html`, use `loadFromStudio('functionName')` from `_extract.mjs`. For functions in `js/utils.js`, use `loadFromUtils(['constName', 'functionName'])`.
3. `process.exit(1)` on failure; otherwise let the script end cleanly (exit 0).
4. Update this README to describe what the new test covers.
