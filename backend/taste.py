"""Deterministic product-trait classification and taste matching.

The frontend teaches each character its taste through pairwise comparisons and
sends the backend a compact :class:`~backend.models.TasteSummary`. This module
turns products into the same trait vocabulary and measures how well a product
fits a person, so the shop node can rank candidates and explain its choice
with observed evidence.

Everything here is plain Python. No model call is required, so the behaviour
is identical in ``DEMO_MODE`` and when Shopify or OpenAI are unavailable. The
mapping is a product heuristic, not a scientific model: it is intentionally
transparent and easy to tune.

Taste is soft. Hard household rules are enforced before any function in this
module runs (see :mod:`backend.catalog`), and nothing here can veto a product.
"""

from __future__ import annotations

import re
from typing import Any

from .models import CatalogItem, FamilyProfile, Mission

TRAITS: tuple[str, ...] = (
    "minimal",
    "expressive",
    "casual",
    "formal",
    "neutral",
    "colorful",
    "classic",
    "trendy",
    "practical",
    "aesthetic",
    "budgetSensitive",
    "premium",
    "oversized",
    "fitted",
)

TRAIT_LABELS: dict[str, str] = {
    "minimal": "minimal",
    "expressive": "expressive",
    "casual": "casual",
    "formal": "formal",
    "neutral": "neutral tones",
    "colorful": "colorful",
    "classic": "classic",
    "trendy": "trendy",
    "practical": "practical",
    "aesthetic": "design-led",
    "budgetSensitive": "budget-friendly",
    "premium": "premium",
    "oversized": "oversized, relaxed fits",
    "fitted": "fitted, tailored shapes",
}

# Words in a product's name, tags, description, or Shopify metadata that signal
# a trait. Each hit adds ``KEYWORD_STEP``; scores saturate at 1.0.
TRAIT_KEYWORDS: dict[str, tuple[str, ...]] = {
    "minimal": ("minimal", "minimalist", "simple", "clean", "plain", "understated", "sleek", "streamlined"),
    "expressive": ("bold", "statement", "playful", "quirky", "fun", "vibrant", "expressive", "whimsical", "silly", "sparkle", "sparkly"),
    "casual": ("casual", "everyday", "relaxed", "cozy", "comfy", "comfort", "lounge", "weekend", "hoodie", "sweatshirt", "sneaker", "sneakers", "tee"),
    "formal": ("formal", "dress", "tailored", "elegant", "refined", "office", "evening", "tie", "blazer", "suit", "oxford"),
    "neutral": ("neutral", "beige", "cream", "ivory", "taupe", "grey", "gray", "charcoal", "black", "white", "oatmeal", "sand", "earth"),
    "colorful": ("colorful", "colourful", "bright", "rainbow", "multicolor", "multicolour", "pink", "red", "orange", "yellow", "green", "blue", "purple", "color-changing", "pattern", "patterned"),
    "classic": ("classic", "timeless", "heritage", "traditional", "vintage", "iconic", "wool", "leather", "cast", "iron", "gold"),
    "trendy": ("trendy", "trending", "modern", "contemporary", "new", "latest", "smart", "wireless", "tech", "viral", "streetwear"),
    "practical": ("practical", "useful", "durable", "functional", "everyday", "utility", "storage", "kitchen", "tool", "tools", "organizer", "insulated", "waterproof"),
    "aesthetic": ("aesthetic", "design", "designer", "art", "artisan", "handmade", "handcrafted", "decor", "decorative", "sculptural", "print", "ceramic"),
    "budgetSensitive": ("budget", "affordable", "value", "bargain", "cheap", "inexpensive", "basic", "starter"),
    "premium": ("premium", "luxury", "luxe", "cashmere", "silk", "merino", "artisan", "limited", "signature", "deluxe"),
    "oversized": ("oversized", "oversize", "relaxed", "loose", "baggy", "slouchy", "chunky", "giant", "xl", "roomy"),
    "fitted": ("fitted", "slim", "tailored", "form-fitting", "structured", "snug", "compact", "petite"),
}

KEYWORD_STEP = 0.35

# Absolute USD price bands for the budget/premium traits. Gift budgets in the
# demo run 15-120 USD, so these bands describe the demo catalog well; they are
# heuristics, not market research.
BUDGET_PRICE_MAX = 25.0
PREMIUM_PRICE_MIN = 75.0

# Scoring heuristics used by the shop node. One perfectly matched product is
# worth about one matched public wish, so taste can tip a decision without
# overwhelming what people said out loud.
TASTE_WEIGHT = 1.0
GIFT_RECIPIENT_TASTE_WEIGHT = 2.0
# Below this confidence a trait is too uncertain to cite in an explanation.
EXPLAIN_MIN_CONFIDENCE = 0.3
# A trait the person likes at least this much counts as "leaning" toward it.
EXPLAIN_MIN_SCORE = 0.6
# An item fits a person when its affinity clears this bar.
SERVES_MIN_AFFINITY = 0.6

_classification_cache: dict[str, dict[str, float]] = {}


def _tokens(value: str) -> list[str]:
    return re.findall(r"[a-z0-9-]+", value.casefold())


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, round(value, 3)))


def item_identity(item: CatalogItem) -> str:
    """Return the stable identity used to cache one product's classification."""
    return str(item.get("variantId") or item.get("productId") or item["id"])


def classify_item(item: CatalogItem) -> dict[str, float]:
    """Map one product's public text and price onto the shared trait vocabulary.

    Authored ``traits`` (for example in ``data/gifts.json``) are trusted as-is.
    Otherwise the name, tags, and price band are matched against
    :data:`TRAIT_KEYWORDS`. Results are cached by variant/product identity so
    repeated searches and preflight refreshes never re-derive them.
    """
    authored = item.get("traits")
    if isinstance(authored, dict) and authored:
        return {str(key): _clamp(float(value)) for key, value in authored.items() if key in TRAITS}

    key = item_identity(item)
    cached = _classification_cache.get(key)
    if cached is not None:
        return cached

    text = " ".join([str(item.get("name", "")), *(str(tag) for tag in item.get("tags", []))])
    words = set(_tokens(text))
    traits: dict[str, float] = {}
    for trait, keywords in TRAIT_KEYWORDS.items():
        hits = sum(1 for keyword in keywords if keyword in words)
        if hits:
            traits[trait] = _clamp(KEYWORD_STEP * hits)

    price = float(item.get("price", 0) or 0)
    if 0 < price <= BUDGET_PRICE_MAX:
        traits["budgetSensitive"] = _clamp(max(traits.get("budgetSensitive", 0.0), 0.7))
    elif price >= PREMIUM_PRICE_MIN:
        traits["premium"] = _clamp(max(traits.get("premium", 0.0), 0.7))

    _classification_cache[key] = traits
    return traits


def clear_classification_cache() -> None:
    """Forget cached classifications (tests and catalog reloads)."""
    _classification_cache.clear()


def with_traits(item: CatalogItem) -> CatalogItem:
    """Return the item with ``traits`` attached, classifying it if needed."""
    traits = classify_item(item)
    if not traits:
        return item
    return {**item, "traits": traits}


def _profile_traits(profile: FamilyProfile | dict[str, Any]) -> dict[str, dict[str, float]]:
    taste = profile.get("taste")
    if not isinstance(taste, dict):
        return {}
    traits = taste.get("traits")
    if not isinstance(traits, dict):
        return {}
    result: dict[str, dict[str, float]] = {}
    for trait, preference in traits.items():
        if trait not in TRAITS or not isinstance(preference, dict):
            continue
        try:
            result[trait] = {
                "score": _clamp(float(preference.get("score", 0.5))),
                "confidence": _clamp(float(preference.get("confidence", 0.0))),
            }
        except (TypeError, ValueError):
            continue
    return result


def taste_affinity(profile: FamilyProfile | dict[str, Any], item: CatalogItem) -> float:
    """Return 0..1: how well a product's traits fit a person's learned taste.

    Each trait the product exhibits pulls the result toward 1 when the person
    likes it (score above 0.5) and toward 0 when they dislike it, weighted by
    how strongly the product shows the trait and how confident the comparisons
    made us. With no overlapping evidence the answer is a neutral 0.5, which
    keeps people without taste data exactly where they were before.
    """
    preferences = _profile_traits(profile)
    item_traits = classify_item(item)
    if not preferences or not item_traits:
        return 0.5
    numerator = 0.0
    denominator = 0.0
    for trait, presence in item_traits.items():
        preference = preferences.get(trait)
        if preference is None or presence <= 0:
            continue
        weight = presence * preference["confidence"]
        numerator += weight * (2.0 * preference["score"] - 1.0)
        denominator += weight
    if denominator == 0:
        return 0.5
    return _clamp(0.5 + numerator / denominator / 2.0)


def taste_explanation(profile: FamilyProfile | dict[str, Any], item: CatalogItem) -> list[str]:
    """Explain a match using only observed comparison evidence.

    Lines name the traits the person demonstrably leans toward and the number
    of comparisons that evidence came from. Nothing is inferred beyond the
    summary the frontend supplied.
    """
    preferences = _profile_traits(profile)
    item_traits = classify_item(item)
    if not preferences or not item_traits:
        return []
    taste = profile.get("taste", {})
    evidence_count = int(taste.get("evidenceCount", 0) or 0)
    name = str(profile.get("name") or profile.get("id") or "they")
    liked = sorted(
        (
            trait
            for trait, presence in item_traits.items()
            if presence > 0
            and trait in preferences
            and preferences[trait]["confidence"] >= EXPLAIN_MIN_CONFIDENCE
            and preferences[trait]["score"] >= EXPLAIN_MIN_SCORE
        ),
        key=lambda trait: -(preferences[trait]["score"] * preferences[trait]["confidence"]),
    )
    if not liked:
        return []
    labels = [TRAIT_LABELS[trait] for trait in liked[:2]]
    joined = " and ".join(labels)
    basis = (
        f"learned from {evidence_count} taste comparison{'s' if evidence_count != 1 else ''}"
        if evidence_count > 0
        else "from their taste profile"
    )
    return [f"Fits {name}'s lean toward {joined}, {basis}."]


def taste_role_weight(mission: Mission | dict[str, Any], sprite_id: str) -> float:
    """Weight a person's taste: the gift recipient counts double, like their wishes."""
    if mission.get("type") == "gift" and mission.get("recipientId") == sprite_id:
        return GIFT_RECIPIENT_TASTE_WEIGHT
    return 1.0


def taste_term(
    profile: FamilyProfile | dict[str, Any],
    items: list[CatalogItem],
    mission: Mission | dict[str, Any],
) -> float:
    """Return the taste contribution to one sprite's bundle satisfaction.

    Each item contributes ``(affinity - 0.5) * 2`` (range -1..1), scaled by
    :data:`TASTE_WEIGHT` and the person's role weight. Neutral affinity adds 0,
    so profiles without taste are unaffected.
    """
    sprite_id = str(profile.get("id", ""))
    weight = TASTE_WEIGHT * taste_role_weight(mission, sprite_id)
    return round(sum((taste_affinity(profile, item) - 0.5) * 2.0 for item in items) * weight, 4)


def public_taste(profile: FamilyProfile | dict[str, Any]) -> dict[str, Any] | None:
    """Return the shareable part of a taste summary for prompts and demo copy."""
    taste = profile.get("taste")
    if not isinstance(taste, dict):
        return None
    summary = str(taste.get("summary", "")).strip()
    likes = [str(value) for value in taste.get("likes", []) if str(value).strip()]
    dislikes = [str(value) for value in taste.get("dislikes", []) if str(value).strip()]
    if not (summary or likes or dislikes):
        return None
    return {
        "summary": summary,
        "likes": likes,
        "dislikes": dislikes,
        "confidence": _clamp(float(taste.get("confidence", 0.0) or 0.0)),
        "evidenceCount": int(taste.get("evidenceCount", 0) or 0),
    }
