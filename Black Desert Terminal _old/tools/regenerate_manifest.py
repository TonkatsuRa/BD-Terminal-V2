#!/usr/bin/env python3
"""Regenerate databases/manifest.json from database Markdown front matter.

Optional local helper only. The GitHub Pages terminal does not use Python.
Run from the project root with:
  python tools/regenerate_manifest.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATABASE_DIR = ROOT / "databases"
MANIFEST = DATABASE_DIR / "manifest.json"


def front_matter(path: Path) -> dict[str, str]:
    text = path.read_text(encoding="utf-8")
    match = re.match(r"^---\s*\n(.*?)\n---", text, re.S)
    data: dict[str, str] = {}
    if not match:
        return data
    for raw_line in match.group(1).splitlines():
        if ":" not in raw_line:
            continue
        key, value = raw_line.split(":", 1)
        data[key.strip().lower()] = value.strip()
    return data


def main() -> int:
    items = []
    for path in sorted(DATABASE_DIR.glob("*.md")):
        meta = front_matter(path)
        fallback_id = path.stem
        items.append(
            {
                "id": meta.get("id", fallback_id),
                "displayName": meta.get("title", fallback_id.replace("-", " ").title()),
                "description": meta.get("description", "No description provided."),
                "file": path.name,
            }
        )

    MANIFEST.write_text(json.dumps({"databases": items}, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {MANIFEST.relative_to(ROOT)} with {len(items)} database file(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
