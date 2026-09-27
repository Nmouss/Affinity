"""Focused tests for deterministic catalog rule enforcement.

These tests intentionally avoid an LLM. A hard rule must remain reliable even
when model output is unavailable or incorrect.
"""

from backend.catalog import search_catalog
from backend.data import load_catalog


def test_search_catalog_enforces_strict_height_limit() -> None:
    """Products taller than the strict household limit never reach the shop."""
    products = search_catalog(
        load_catalog(),
        slot="centerpiece",
        max_price=200,
        hard_rules=[{"type": "maxHeight", "inches": 18, "why": "Small shelf"}],
    )

    assert products
    assert all(product.get("heightIn", 0) <= 18 for product in products)
    assert "gift-lamp" not in {product["id"] for product in products}
