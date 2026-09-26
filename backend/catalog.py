"""Deterministic product filtering used by the shop node.

Hard rules are enforced here in ordinary Python instead of being entrusted to
an LLM prompt. Any item returned by ``search_catalog`` therefore satisfies the
budget, height, excluded-tag, slot, and optional desired-tag filters.
"""

from __future__ import annotations

from .models import CatalogItem, HouseRule


def search_catalog(
    catalog: list[CatalogItem],
    *,
    slot: str,
    max_price: float,
    hard_rules: list[HouseRule],
    tags: list[str] | None = None,
) -> list[CatalogItem]:
    """Return catalog items that satisfy every enforceable hard rule.

    ``maxHeight`` uses the minimum of every supplied height rule, which makes
    the strictest household restriction win. ``excludedTag`` rules are applied
    case-insensitively.
    """
    height_limits = [
        float(rule["inches"])
        for rule in hard_rules
        if rule["type"] == "maxHeight" and "inches" in rule
    ]
    max_height = min(height_limits, default=float("inf"))
    excluded_tags = {
        rule["tag"].casefold()
        for rule in hard_rules
        if rule["type"] == "excludedTag" and rule.get("tag")
    }
    desired_tags = {tag.casefold() for tag in tags or []}

    matches: list[CatalogItem] = []
    for item in catalog:
        item_tags = {tag.casefold() for tag in item["tags"]}
        if item["slot"] != slot or item["price"] > max_price:
            continue
        if item.get("heightIn", 0) > max_height:
            continue
        if item_tags & excluded_tags:
            continue
        if desired_tags and not item_tags & desired_tags:
            continue
        matches.append(item)
    return matches
