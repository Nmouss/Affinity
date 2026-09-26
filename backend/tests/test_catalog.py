"""Focused tests for deterministic catalog rule enforcement.

These tests intentionally avoid an LLM. A hard rule must remain reliable even
when model output is unavailable or incorrect.
"""

from backend.catalog import search_catalog
from backend.data import load_catalog


def test_search_catalog_enforces_strict_height_limit() -> None:
    """Products taller than the strict household limit never reach the shop."""
    trees = search_catalog(
        load_catalog(),
        slot="tree",
        max_price=200,
        hard_rules=[{"type": "maxHeight", "inches": 48, "why": "Small room"}],
    )

    assert trees
    assert all(tree.get("heightIn", 0) <= 48 for tree in trees)
    assert "tree-6ft" not in {tree["id"] for tree in trees}
