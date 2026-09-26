"""Load Affinity's local profile and catalog data.

The MVP has no database. Profiles live in ``data/family.json`` and the curated
product catalog lives in ``data/catalog.json``. This module owns filesystem path
resolution so graph nodes do not depend on the process's current directory.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import TypeVar, cast

from .models import CatalogItem, FamilyProfile

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
T = TypeVar("T")


def _read_json(path: Path, expected_type: type[T]) -> T:
    """Read JSON and perform a lightweight top-level shape check."""
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, expected_type):
        raise ValueError(f"Expected {path} to contain a {expected_type.__name__}")
    return cast(T, value)


def load_profiles() -> dict[str, FamilyProfile]:
    """Return family profiles indexed by sprite ID for safe scoped access."""
    profiles = _read_json(DATA_DIR / "family.json", list)
    return {profile["id"]: cast(FamilyProfile, profile) for profile in profiles}


def load_catalog() -> list[CatalogItem]:
    """Return every curated catalog item in display order."""
    return cast(list[CatalogItem], _read_json(DATA_DIR / "catalog.json", list))
