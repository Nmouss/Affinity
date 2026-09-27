"""Taste classification, affinity, ranking, and the local gift fallback.

Everything here runs offline: DEMO_MODE reasoning, the local catalog, and a
faked Shopify failure. Hard rules must keep winning over soft taste.
"""

import asyncio

import pytest

from backend import taste
from backend.agent import build_graph
from backend.commerce import ShopifyUcpError
from backend.data import load_catalog
from backend.llm import create_sprite_opinion, score_bundle
from backend.nodes import _shopping_slots, shop_node


def _preference(**scores: float) -> dict:
    return {
        "summary": ", ".join(scores),
        "likes": list(scores),
        "dislikes": [],
        "confidence": 0.8,
        "traits": {trait: {"score": score, "confidence": 0.8} for trait, score in scores.items()},
        "evidenceCount": 9,
    }


def _profile(sprite_id: str, name: str, **fields) -> dict:
    return {
        "id": sprite_id,
        "name": name,
        "relationship": "family member",
        "look": "custom",
        "colors": ["#ffd180"],
        "personality": [],
        "loves": [],
        "avoids": [],
        "houseRules": [],
        **fields,
    }


def _gift_item(item_id: str, name: str, price: float, tags: list[str], **traits: float) -> dict:
    return {
        "id": item_id,
        "slot": "gift",
        "name": name,
        "price": price,
        "tags": tags,
        "traits": traits,
        "provider": "local",
        "has3dModel": False,
    }


def _gift_state(profiles: dict, catalog: list[dict], recipient: str, hard_rules: list | None = None) -> dict:
    return {
        "mission": {
            "occasion": "Christmas",
            "budget": 100,
            "freeText": "A gift",
            "type": "gift",
            "recipientId": recipient,
            "invitedSpriteIds": list(profiles),
            "shoppingSlots": [{"id": "gift", "query": "christmas gift", "quantity": 1}],
        },
        "profiles": profiles,
        "constraints": {"hardRules": hard_rules or [], "wishes": [], "conflicts": []},
        "catalog": catalog,
        "revisionConstraints": [],
        "rejectedCandidateIds": [],
    }


@pytest.fixture(autouse=True)
def _offline(monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "true")
    monkeypatch.setenv("AFFINITY_PRODUCT_PROVIDER", "local")
    taste.clear_classification_cache()


def test_classification_is_deterministic_and_cached() -> None:
    item = {
        "id": "shopify:v1",
        "variantId": "v1",
        "slot": "gift",
        "name": "Bold patterned oversized hoodie",
        "price": 20,
        "tags": ["cozy", "streetwear"],
    }
    first = taste.classify_item(item)
    second = taste.classify_item({**item, "name": "renamed but same variant"})

    assert first["expressive"] > 0 and first["colorful"] > 0 and first["oversized"] > 0
    assert first["casual"] > 0 and first["trendy"] > 0
    assert first["budgetSensitive"] >= 0.7  # price band
    assert second is first  # cache hit keyed by variant identity
    assert taste.classify_item(dict(item)) == first


def test_authored_traits_are_trusted_and_affinity_is_neutral_without_data() -> None:
    item = _gift_item("g", "Thing", 30, ["thing"], colorful=0.9)
    assert taste.classify_item(item) == {"colorful": 0.9}

    plain = _profile("p", "Plain")
    assert taste.taste_affinity(plain, item) == 0.5
    assert taste.taste_affinity(_profile("q", "Q", taste=_preference(colorful=0.9)), {"id": "x", "slot": "gift", "name": "x", "price": 30, "tags": []}) == 0.5
    assert taste.taste_explanation(plain, item) == []


def test_affinity_rewards_liked_traits_and_penalizes_disliked_ones() -> None:
    lover = _profile("a", "A", taste=_preference(colorful=0.95))
    hater = _profile("b", "B", taste=_preference(colorful=0.05))
    item = _gift_item("g", "Bright thing", 30, [], colorful=0.9)

    assert taste.taste_affinity(lover, item) > 0.9
    assert taste.taste_affinity(hater, item) < 0.1
    lines = taste.taste_explanation(lover, item)
    assert lines == ["Fits A's lean toward colorful, learned from 9 taste comparisons."]


def test_hard_rule_beats_perfect_taste() -> None:
    recipient = _profile("kid", "Kid", taste=_preference(colorful=1.0, expressive=1.0))
    catalog = [
        _gift_item("glass-globe", "Glass snow globe", 30, ["glass", "bright"], colorful=1.0, expressive=1.0),
        _gift_item("wool-hat", "Wool hat", 30, ["wool"], neutral=0.8, classic=0.7),
    ]
    state = _gift_state(
        {"kid": recipient},
        catalog,
        "kid",
        hard_rules=[{"type": "excludedTag", "tag": "glass", "why": "No breakables"}],
    )

    result = asyncio.run(shop_node(state))

    assert [item["id"] for item in result["bundle"]["items"]] == ["wool-hat"]


def test_recipient_taste_outweighs_advisor_taste_in_a_gift_mission() -> None:
    recipient = _profile("kid", "Kid", taste=_preference(colorful=0.95, minimal=0.05))
    advisor = _profile("aunt", "Aunt", taste=_preference(minimal=0.95, colorful=0.05))
    catalog = [
        _gift_item("bright", "Bright patterned throw", 40, [], colorful=0.9),
        _gift_item("plain", "Plain linen throw", 40, [], minimal=0.9),
    ]

    for_kid = asyncio.run(shop_node(_gift_state({"kid": recipient, "aunt": advisor}, catalog, "kid")))
    for_aunt = asyncio.run(shop_node(_gift_state({"kid": recipient, "aunt": advisor}, catalog, "aunt")))

    assert for_kid["bundle"]["items"][0]["id"] == "bright"
    assert for_aunt["bundle"]["items"][0]["id"] == "plain"
    assert for_kid["bundle"]["serves"]["kid"] == ["bright"]
    assert any("Kid's lean toward colorful" in line for line in for_kid["bundle"]["items"][0]["selectedBecause"])


def test_profiles_without_taste_rank_exactly_as_before() -> None:
    graph = build_graph()
    mission = {
        "occasion": "Christmas",
        "budget": 200,
        "freeText": "A family tree",
        "type": "shared",
        "invitedSpriteIds": ["wife", "daughter", "son"],
    }
    baseline = asyncio.run(graph.ainvoke({"mission": mission}, {"configurable": {"thread_id": "no-taste-a"}}))
    stripped = asyncio.run(
        graph.ainvoke(
            {"mission": mission},
            {"configurable": {"thread_id": "no-taste-b"}},
        )
    )

    ids = lambda result: [item["id"] for item in result["bundle"]["items"]]
    assert ids(baseline) == ids(stripped)
    # The historic tree demo still picks the compliant tree set and stays in budget.
    assert {item["slot"] for item in baseline["bundle"]["items"]} == {"tree", "lights", "ornaments", "topper"}
    assert baseline["bundle"]["total"] <= 200
    assert baseline["bundle"]["source"] == "local"


def test_gift_missions_default_to_a_gift_slot_not_the_tree() -> None:
    slots = _shopping_slots(
        {"occasion": "Christmas", "budget": 60, "freeText": "A present for Ava", "type": "gift"}
    )
    assert slots == [{"id": "gift", "query": "A present for Ava", "quantity": 1}]


def test_local_gift_mission_reaches_the_mandate_with_a_real_gift() -> None:
    graph = build_graph()
    recipient = _profile(
        "ava",
        "Ava",
        loves=["something playful"],
        taste=_preference(colorful=0.9, expressive=0.8, casual=0.7),
    )
    advisor = _profile("maya", "Maya", loves=["good value"])
    mission = {
        "occasion": "Christmas",
        "budget": 60,
        "freeText": "A Christmas present for Ava",
        "type": "gift",
        "recipientId": "ava",
        "invitedSpriteIds": ["ava", "maya"],
        "shoppingSlots": [{"id": "gift", "query": "christmas gift for a kid", "quantity": 1}],
    }

    result = asyncio.run(
        graph.ainvoke(
            {"mission": mission, "profiles": {"ava": recipient, "maya": advisor}},
            {"configurable": {"thread_id": "local-gift"}},
        )
    )

    assert result["__interrupt__"][0].value["type"] == "cart_mandate"
    bundle = result["bundle"]
    assert bundle["source"] == "local"
    assert len(bundle["items"]) == 1
    gift = bundle["items"][0]
    assert gift["id"] in {item["id"] for item in load_catalog() if item["slot"] == "gift"}
    assert gift["slot"] == "gift"
    assert gift["imageUrl"].startswith("/products/")
    assert gift["has3dModel"] is False
    assert gift["traits"]
    assert bundle["total"] <= 60
    assert result["carts"] == []


def test_shopify_failure_on_a_gift_slot_falls_back_to_the_local_catalog(monkeypatch) -> None:
    monkeypatch.setenv("AFFINITY_PRODUCT_PROVIDER", "shopify_ucp")

    async def broken(state):
        raise ShopifyUcpError("network down")

    monkeypatch.setattr("backend.nodes._shopify_candidate_bundles", broken)
    recipient = _profile("ava", "Ava", taste=_preference(colorful=0.9))
    state = _gift_state({"ava": recipient}, load_catalog(), "ava")
    state["mission"]["shoppingSlots"] = [{"id": "present", "query": "christmas gift", "quantity": 1}]

    result = asyncio.run(shop_node(state))

    assert result["bundle"]["source"] == "local"
    assert result["bundle"]["items"][0]["slot"] == "present"
    assert any("Shopify unavailable" in warning for warning in result["bundle"]["warnings"])


def test_demo_reasoning_mentions_taste_and_moves_scores() -> None:
    mission = {
        "occasion": "Christmas",
        "budget": 60,
        "freeText": "A gift",
        "type": "gift",
        "recipientId": "ava",
        "invitedSpriteIds": ["ava"],
    }
    tasteful = _profile("ava", "Ava", loves=["puzzles"], taste=_preference(colorful=0.95))
    tasteless = _profile("ava", "Ava", loves=["puzzles"])
    opinion = asyncio.run(create_sprite_opinion(tasteful, mission))
    assert "My taste runs colorful." in opinion["say"]
    assert "colorful" in opinion["wishes"]

    bundle = {
        "items": [_gift_item("bright", "Bright thing", 30, ["bright"], colorful=0.9)],
        "total": 30,
        "serves": {},
    }
    with_taste = asyncio.run(score_bundle(tasteful, mission, bundle))
    without = asyncio.run(score_bundle(tasteless, mission, bundle))

    assert with_taste["score"] > without["score"]
    assert "fits my taste" in with_taste["say"]
