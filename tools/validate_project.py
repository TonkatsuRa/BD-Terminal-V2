#!/usr/bin/env python3
"""Static helper checks for the ARES terminal content files.

This script is optional. It is meant for local editing before uploading to
GitHub Pages; the browser app does not need Python and never runs this file.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATABASE_DIR = ROOT / "databases"
MANIFEST = DATABASE_DIR / "manifest.json"
CONTENT = ROOT / "content" / "terminal-content.md"
SITES_MANIFEST = ROOT / "sites" / "manifest.json"


def warn(messages: list[str], message: str) -> None:
    messages.append(f"WARN  {message}")


def fail(messages: list[str], message: str) -> None:
    messages.append(f"ERROR {message}")


def read_text(path: Path, messages: list[str]) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        fail(messages, f"Missing file: {path.relative_to(ROOT)}")
    except UnicodeDecodeError:
        fail(messages, f"File is not UTF-8 text: {path.relative_to(ROOT)}")
    return ""


def parse_database_entries(text: str) -> list[dict[str, str]]:
    entries: list[dict[str, str]] = []
    current: dict[str, str] | None = None
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if re.match(r"^###\s+", line):
            if current:
                entries.append(current)
            current = {"title": re.sub(r"^###\s+", "", line).strip()}
            continue
        if current and ":" in line:
            key, value = line.split(":", 1)
            normalized_key = re.sub(r"[^a-z0-9]+", "_", key.strip().lower()).strip("_")
            current[normalized_key] = value.strip()
    if current:
        entries.append(current)
    return entries


def check_manifest(messages: list[str]) -> set[str]:
    text = read_text(MANIFEST, messages)
    if not text:
        return set()
    try:
        manifest = json.loads(text)
    except json.JSONDecodeError as exc:
        fail(messages, f"Invalid JSON in databases/manifest.json: {exc}")
        return set()

    items = manifest.get("databases", manifest if isinstance(manifest, list) else [])
    if not isinstance(items, list):
        fail(messages, "databases/manifest.json must contain a list or a 'databases' list.")
        return set()

    listed: set[str] = set()
    for index, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            fail(messages, f"Manifest item {index} is not an object.")
            continue
        filename = str(item.get("file", "")).strip()
        if not filename:
            fail(messages, f"Manifest item {index} has no 'file'.")
            continue
        listed.add(filename)
        if not (DATABASE_DIR / filename).exists():
            fail(messages, f"Manifest references missing database file: databases/{filename}")
        for key in ("id", "displayName", "description"):
            if not str(item.get(key, "")).strip():
                warn(messages, f"Manifest item {filename} is missing '{key}'.")
    return listed


def check_databases(messages: list[str], listed: set[str]) -> None:
    for path in sorted(DATABASE_DIR.glob("*.md")):
        ids: set[str] = set()
        if path.name not in listed:
            warn(messages, f"Database file is not listed in manifest: databases/{path.name}")
        text = read_text(path, messages)
        if not text:
            continue
        if "password" not in text.lower():
            warn(messages, f"Database has no visible password metadata: databases/{path.name}")
        for entry in parse_database_entries(text):
            entry_id = entry.get("id_or_person", entry.get("id", "")).strip()
            if not entry_id:
                warn(messages, f"Entry without ID or Person in databases/{path.name}: {entry.get('title', 'untitled')}")
                continue
            if entry_id in ids:
                fail(messages, f"Duplicate database entry ID or Person '{entry_id}' in {path.name}")
            ids.add(entry_id)


def check_terminal_content(messages: list[str]) -> None:
    text = read_text(CONTENT, messages)
    if not text:
        return
    required_sections = ["## commands", "## welcome", "## errors", "## diagnostic", "## facility"]
    lower = text.lower()
    for section in required_sections:
        if section not in lower:
            warn(messages, f"terminal-content.md is missing expected section: {section}")


def check_sites(messages: list[str]) -> None:
    if not SITES_MANIFEST.exists():
        return
    text = read_text(SITES_MANIFEST, messages)
    if not text:
        return
    try:
        manifest = json.loads(text)
    except json.JSONDecodeError as exc:
        fail(messages, f"Invalid JSON in sites/manifest.json: {exc}")
        return

    sites = manifest.get("sites", [])
    if not isinstance(sites, list):
        fail(messages, "sites/manifest.json must contain a 'sites' list.")
        return

    seen: set[str] = set()
    for index, site in enumerate(sites, start=1):
        if not isinstance(site, dict):
            fail(messages, f"Site manifest item {index} is not an object.")
            continue
        site_id = str(site.get("id", "")).strip()
        if not re.fullmatch(r"BRE-0[1-6]", site_id):
            fail(messages, f"Site manifest item {index} has invalid id: {site_id or '<missing>'}")
            continue
        if site_id in seen:
            fail(messages, f"Duplicate BRE site id in sites/manifest.json: {site_id}")
        seen.add(site_id)
        if not str(site.get("code", "")).strip():
            warn(messages, f"{site_id} has no editable connection code.")
        for key in ("database", "statusProfile", "floorplan"):
            value = str(site.get(key, "")).strip()
            if not value:
                fail(messages, f"{site_id} missing '{key}'.")
                continue
            if not (ROOT / value).exists():
                fail(messages, f"{site_id} references missing {key}: {value}")


def main() -> int:
    messages: list[str] = []
    listed = check_manifest(messages)
    check_databases(messages, listed)
    check_terminal_content(messages)
    check_sites(messages)

    for message in messages:
        print(message)
    if any(message.startswith("ERROR") for message in messages):
        return 1
    print("OK    Content validation completed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
