"""Node and routing functions for Affinity's council graph.

The module is ordered in the same sequence as graph execution:

1. ``intake_node`` validates input and loads local data.
2. ``fan_out_opinions`` creates one parallel ``Send`` per invited sprite.
3. ``merge_node`` deterministically combines the returned opinions.
4. ``shop_node`` searches and ranks hard-rule-compliant bundles.
5. ``fan_out_scores`` creates one parallel score task per sprite.
6. ``decide_revision_node`` either loops to shop or advances.
7. ``human_mandate_node`` pauses for the physical approval gesture.

Functions prefixed with ``_`` are deterministic helpers rather than graph
nodes. Keeping the reliability-sensitive work here prevents model output from
bypassing household rules or the budget.
"""

from __future__ import annotations

import asyncio
import itertools
import os
import re
from collections import defaultdict
from email.utils import parseaddr
from typing import Any
from urllib.parse import urlparse

from langchain_core.runnables import RunnableConfig
from langgraph.config import get_stream_writer
from langgraph.types import Send, interrupt

from .catalog import search_catalog
from .commerce import ShopifyUcpClient, ShopifyUcpError
from .data import load_catalog, load_profiles
from .llm import create_search_plan, create_sprite_deliberation, create_sprite_opinion, score_bundle
from .places import GooglePlacesClient, GooglePlacesError
from .models import (
    Bundle,
    CatalogItem,
    CommerceCart,
    Conflict,
    ConstraintSet,
    CouncilState,
    DeliberationTask,
    HouseRule,
    MandateDecision,
    Mission,
    NotificationDelivery,
    Plan,
    PlaceCandidate,
    ProductModel3d,
    ProductModel3dSource,
    ProposalRepair,
    ScoreTask,
    SpriteOpinion,
    SpriteDeliberation,
    SpriteTask,
    WeightedWish,
)
from .notifications import SmtpEmailError, SmtpEmailSender

# A valid MVP bundle must contain products for each of these conceptual slots.
REQUIRED_SLOTS = ("tree", "lights", "ornaments", "topper")


def _recipients(mission: Mission) -> list[str]:
    """Gift targets in slot order; one product is shopped for each id."""
    ids = [str(item) for item in mission.get("recipientIds") or [] if str(item).strip()]
    extra = mission.get("recipientId")
    if extra and extra not in ids:
        ids.insert(0, str(extra))
    return ids


def _wish_weight(mission: Mission, sprite_id: str) -> float:
    return 2.0 if sprite_id in set(_recipients(mission)) else 1.0


def _emit(event_type: str, payload: Any) -> None:
    """Publish a UI event when the graph is running in custom stream mode."""
    try:
        get_stream_writer()({"type": event_type, "payload": payload})
    except (LookupError, RuntimeError):
        # Direct unit calls do not have a LangGraph runtime stream writer.
        pass


def _tokens(value: str) -> set[str]:
    """Return normalized meaningful words used for lightweight matching."""
    return {token for token in re.findall(r"[a-z0-9]+", value.casefold()) if len(token) > 2}


def intake_node(state: CouncilState) -> CouncilState:
    """Validate the mission and hydrate local, private data sources.

    This is currently validation/normalization rather than natural-language
    parsing: FastAPI already receives structured mission fields. A future voice
    parser can run immediately before this node while preserving this contract.

    Returns initial state fields needed by every downstream branch.
    """
    mission = state.get("mission")
    if not mission:
        raise ValueError("A mission is required")
    if not mission.get("occasion", "").strip():
        raise ValueError("Mission occasion is required")
    if float(mission.get("budget", 0)) <= 0:
        raise ValueError("Mission budget must be positive")
    if mission.get("type") not in {"shared", "gift"}:
        raise ValueError("Mission type must be 'shared' or 'gift'")
    kind = mission.get("kind", "shopping")
    if kind not in {"shopping", "plan"}:
        raise ValueError("Mission kind must be 'shopping' or 'plan'")
    if kind == "plan":
        location = mission.get("location", {})
        if not str(location.get("label", "")).strip():
            raise ValueError("Plan missions require location.label")
        if not mission.get("planSlots"):
            raise ValueError("Plan missions require at least one plan slot")

    # Bundled profiles are convenient demo defaults. Per-run profiles overlay
    # them, which makes the actual graph cardinality fully dynamic.
    profiles = {**load_profiles(), **state.get("profiles", {})}
    invited = list(dict.fromkeys(mission.get("invitedSpriteIds", [])))
    unknown = [sprite_id for sprite_id in invited if sprite_id not in profiles]
    if not invited:
        raise ValueError("Invite at least one sprite")
    if unknown:
        raise ValueError(f"Unknown sprite IDs: {', '.join(unknown)}")
    if mission["type"] == "gift" and mission.get("recipientId") not in invited:
        raise ValueError("A gift recipient must be one of the invited sprites")
    unknown_recipients = [sprite_id for sprite_id in _recipients(mission) if sprite_id not in invited]
    if unknown_recipients:
        raise ValueError(f"Unknown gift recipients: {', '.join(unknown_recipients)}")

    normalized_mission: Mission = {
        **mission,
        "occasion": mission["occasion"].strip(),
        "budget": float(mission["budget"]),
        "freeText": mission.get("freeText", "").strip(),
        "invitedSpriteIds": invited,
        "kind": kind,
    }
    result = {
        "mission": normalized_mission,
        "profiles": profiles,
        "catalog": load_catalog(),
        "opinions": [],
        "deliberations": [],
        "scores": [],
        "revisionConstraints": [],
        "revisionCount": 0,
        "repairRequest": None,
        "rejectedCandidateIds": [],
        "preflightChanges": [],
        "carts": [],
        "notifications": [],
    }
    _emit("mission", normalized_mission)
    return result


def fan_out_opinions(state: CouncilState) -> list[Send]:
    """Create one parallel opinion task for every invited sprite.

    Each ``Send`` carries the shared mission and exactly one family profile.
    The branch does not receive other profiles, preserving agent isolation.
    """
    return [
        Send(
            "sprite_opinion",
            SpriteTask(mission=state["mission"], profile=state["profiles"][sprite_id]),
        )
        for sprite_id in state["mission"]["invitedSpriteIds"]
    ]


async def sprite_opinion_node(task: SpriteTask) -> dict[str, list[SpriteOpinion]]:
    """Run one sprite agent and emit a reducer-friendly one-item list."""
    opinion = await create_sprite_opinion(task["profile"], task["mission"])
    _emit("opinion", opinion)
    return {"opinions": [opinion]}


def _strict_hard_rules(opinions: list[SpriteOpinion]) -> list[HouseRule]:
    """Union hard rules, choosing the lowest/strictest maximum height."""
    height_rules = [
        rule
        for opinion in opinions
        for rule in opinion["hardRules"]
        if rule["type"] == "maxHeight" and "inches" in rule
    ]
    result: list[HouseRule] = []
    if height_rules:
        result.append(min(height_rules, key=lambda rule: float(rule["inches"])))

    seen_tags: set[str] = set()
    for opinion in opinions:
        for rule in opinion["hardRules"]:
            if rule["type"] != "excludedTag" or not rule.get("tag"):
                continue
            tag = rule["tag"].casefold()
            if tag not in seen_tags:
                result.append(rule)
                seen_tags.add(tag)
    return result


def _rule_violation(item: CatalogItem, rule: HouseRule) -> bool:
    """Return whether a catalog item breaks one machine-enforceable rule."""
    if rule["type"] == "maxHeight" and "inches" in rule:
        return item.get("heightIn", 0) > float(rule["inches"])
    if rule["type"] == "excludedTag" and rule.get("tag"):
        return rule["tag"].casefold() in {tag.casefold() for tag in item["tags"]}
    return False


def _rule_label(rule: HouseRule) -> str:
    """Create concise copy for the frontend constraint board."""
    if rule["type"] == "maxHeight":
        return f"Maximum height: {rule.get('inches', '?'):g} inches"
    return f"Excluded tag: {rule.get('tag', '?')}"


def _find_conflicts(
    wishes: list[WeightedWish],
    rules: list[HouseRule],
    catalog: list[CatalogItem],
) -> list[Conflict]:
    """Find wishes for which all related products violate a hard rule.

    A broad wish such as ``dinosaurs`` is not a conflict if a compliant
    dinosaur ornament exists. The planted giant T-rex wish is a conflict
    because its matching inflatable is too tall; a themed ornament becomes the
    visible substitution.
    """
    conflicts: list[Conflict] = []
    for weighted_wish in wishes:
        wish = weighted_wish["wish"]
        wish_tokens = _tokens(wish)
        related = [
            item
            for item in catalog
            if wish_tokens & _tokens(" ".join([item["name"], *item["tags"]]))
        ]
        for rule in rules:
            violating = [item for item in related if _rule_violation(item, rule)]
            compliant = [item for item in related if not _rule_violation(item, rule)]
            if not violating or compliant:
                continue
            alternatives = [
                item
                for item in catalog
                if item["slot"] != "decoy"
                and not _rule_violation(item, rule)
                and wish_tokens & _tokens(" ".join([item["name"], *item["tags"]]))
            ]
            if not alternatives and ({"rex", "dinosaur", "dinosaurs"} & wish_tokens):
                alternatives = [
                    item
                    for item in catalog
                    if item["slot"] == "ornaments"
                    and not _rule_violation(item, rule)
                    and {"dinosaur", "dinosaurs"}
                    & _tokens(" ".join([item["name"], *item["tags"]]))
                ]
            resolution = (
                f"Use {alternatives[0]['name']} instead."
                if alternatives
                else "Remove the request from the eligible catalog results."
            )
            conflicts.append({"rule": _rule_label(rule), "wish": wish, "resolution": resolution})
            break
    return conflicts


def merge_node(state: CouncilState) -> dict[str, ConstraintSet]:
    """Fan opinions back in and produce one deterministic constraint board.

    Gift recipients receive weight 2 while shared-purchase wishes receive equal
    weight. Hard-rule resolution and conflict discovery never call an LLM.
    """
    opinions = state["opinions"]
    invited = set(state["mission"]["invitedSpriteIds"])
    if {opinion["spriteId"] for opinion in opinions} != invited:
        raise ValueError("The merge node did not receive every invited sprite opinion")

    rules = _strict_hard_rules(opinions)
    wishes: list[WeightedWish] = []
    for opinion in opinions:
        for wish in opinion["wishes"]:
            weight = _wish_weight(state["mission"], opinion["spriteId"])
            wishes.append({"spriteId": opinion["spriteId"], "wish": wish, "weight": weight})

    constraints: ConstraintSet = {
        "hardRules": rules,
        "wishes": wishes,
        "conflicts": _find_conflicts(wishes, rules, state["catalog"]),
    }
    _emit("constraints", constraints)
    return {"constraints": constraints}


def fan_out_deliberations(state: CouncilState) -> list[Send]:
    """Let every sprite answer the other sprites' public statements in parallel."""
    return [
        Send(
            "sprite_deliberation",
            DeliberationTask(
                mission=state["mission"],
                profile=state["profiles"][sprite_id],
                publicOpinions=state["opinions"],
                constraints=state["constraints"],
            ),
        )
        for sprite_id in state["mission"]["invitedSpriteIds"]
    ]


async def sprite_deliberation_node(
    task: DeliberationTask,
) -> dict[str, list[SpriteDeliberation]]:
    """Produce one privacy-bounded public response to the council."""
    response = await create_sprite_deliberation(
        task["profile"],
        task["mission"],
        task["publicOpinions"],
        task["constraints"],
    )
    _emit("deliberation", response)
    return {"deliberations": [response]}


def reconcile_deliberations_node(state: CouncilState) -> dict[str, ConstraintSet]:
    """Add public compromise suggestions as soft wishes; hard rules stay fixed."""
    invited = set(state["mission"]["invitedSpriteIds"])
    deliberations = state["deliberations"]
    if {item["spriteId"] for item in deliberations} != invited:
        raise ValueError("The council did not receive every sprite's deliberation")
    wishes = list(state["constraints"]["wishes"])
    seen = {(wish["spriteId"], wish["wish"].casefold()) for wish in wishes}
    for response in deliberations:
        weight = _wish_weight(state["mission"], response["spriteId"])
        for wish in response["compromiseWishes"]:
            normalized = wish.strip()
            key = (response["spriteId"], normalized.casefold())
            if normalized and key not in seen:
                wishes.append(
                    {"spriteId": response["spriteId"], "wish": normalized, "weight": weight}
                )
                seen.add(key)
    constraints: ConstraintSet = {**state["constraints"], "wishes": wishes}
    _emit("consensus", constraints)
    return {"constraints": constraints}


def route_after_merge(state: CouncilState) -> str:
    """Choose product shopping or place planning after shared reasoning."""
    return "plan" if state["mission"].get("kind") == "plan" else "shop"


async def search_plan_node(state: CouncilState) -> dict[str, Any]:
    """Generate bounded query variants before calling a live search provider."""
    mission = state["mission"]
    if mission.get("kind") == "plan":
        slots = [dict(slot) for slot in mission.get("planSlots", [])]
    else:
        slots = _shopping_slots(mission)
    plan = await create_search_plan(
        mission=mission,
        constraints=state["constraints"],
        slots=slots,
        repair_request=state.get("repairRequest"),
    )
    _emit("search_plan", plan)
    return {"searchPlan": plan}


def _queries_for_slot(state: CouncilState, slot: dict[str, Any]) -> list[str]:
    """Return planned queries plus unresolved score feedback for one slot."""
    planned = next(
        (
            item["queries"]
            for item in state.get("searchPlan", {}).get("slots", [])
            if item["slotId"] == slot["id"]
        ),
        [slot["query"]],
    )
    revision = " ".join(state.get("revisionConstraints", []))
    return list(
        dict.fromkeys(
            " ".join(part for part in (query, revision) if part).strip()
            for query in planned
            if query.strip()
        )
    )


def _item_relevance(item: CatalogItem, desires: list[str]) -> float:
    """Count how many desires share meaningful words with a catalog item."""
    item_tokens = _tokens(" ".join([item["name"], *item["tags"]]))
    return float(sum(bool(item_tokens & _tokens(desire)) for desire in desires))


def _candidate_bundles(state: CouncilState):
    """Yield complete local bundles for the mission's actual catalog slots.

    The fallback catalog is intentionally data-driven: changing demo categories must not require
    rewriting this node. ``decoy`` remains available for conflict attribution but is never required.
    """
    mission = state["mission"]
    constraints = state["constraints"]
    common = {
        "catalog": state["catalog"],
        "max_price": mission["budget"],
        "hard_rules": constraints["hardRules"],
    }
    supplied = mission.get("shoppingSlots") or []
    slot_ids = [str(slot["id"]) for slot in supplied]
    if not slot_ids:
        slot_ids = list(
            dict.fromkeys(item["slot"] for item in state["catalog"] if item["slot"] != "decoy")
        )
    candidates_by_slot = [search_catalog(slot=slot, **common) for slot in slot_ids]
    if not slot_ids or any(not candidates for candidates in candidates_by_slot):
        missing = [slot for slot, candidates in zip(slot_ids, candidates_by_slot) if not candidates]
        raise ValueError(f"No complete bundle can satisfy the hard rules for: {', '.join(missing)}")

    for selected in itertools.product(*candidates_by_slot):
        quantities = {
            str(slot["id"]): max(1, int(slot.get("quantity", 1))) for slot in supplied
        }
        items = [
            {**item, "quantity": quantities.get(item["slot"], 1)} for item in selected
        ]
        total = round(
            sum(float(item["price"]) * int(item.get("quantity", 1)) for item in items), 2
        )
        if total <= mission["budget"]:
            yield items, total


def _local_repair_candidate_bundles(state: CouncilState):
    """Replace only the rejected local-catalog slot and preserve accepted items."""
    repair = state.get("repairRequest")
    if not repair or not state.get("bundle"):
        yield from _candidate_bundles(state)
        return
    locked = [item for item in state["bundle"]["items"] if item["id"] != repair["itemId"]]
    rejected = set(state.get("rejectedCandidateIds", []))
    replacements = search_catalog(
        state["catalog"],
        slot=repair["slotId"],
        max_price=state["mission"]["budget"],
        hard_rules=state["constraints"]["hardRules"],
    )
    for item in replacements:
        if item["id"] in rejected:
            continue
        items = [*locked, item]
        total = round(
            sum(float(entry["price"]) * int(entry.get("quantity", 1)) for entry in items),
            2,
        )
        if total <= state["mission"]["budget"]:
            yield items, total


def _shopping_slots(mission: Mission) -> list[dict[str, Any]]:
    """Return explicit slots or infer a useful default from the mission."""
    supplied = mission.get("shoppingSlots")
    if supplied:
        slots = [
            {
                "id": str(slot["id"]).strip(),
                "query": str(slot["query"]).strip(),
                "quantity": max(1, int(slot.get("quantity", 1))),
            }
            for slot in supplied
        ]
        if any(not slot["id"] or not slot["query"] for slot in slots):
            raise ValueError("Every shopping slot requires a non-empty id and query")
        if len({slot["id"] for slot in slots}) != len(slots):
            raise ValueError("Shopping slot IDs must be unique")
        return slots

    context = f"{mission['occasion']} {mission.get('freeText', '')}".casefold()
    if any(word in context for word in ("christmas", "holiday tree", "ornament")):
        return [{"id": slot, "query": slot, "quantity": 1} for slot in REQUIRED_SLOTS]
    query = mission.get("freeText", "").strip() or mission["occasion"].strip()
    return [{"id": "item", "query": query, "quantity": 1}]


def _money(value: Any) -> tuple[float | None, str]:
    """Normalize UCP minor-unit money values to dollars."""
    currency = "USD"
    if isinstance(value, dict):
        currency = str(value.get("currency_code") or value.get("currency") or currency)
        value = value.get("amount", value.get("value"))
    if value is None:
        return None, currency
    try:
        # UCP money amounts are integer minor units. A decimal string remains
        # useful for compatibility with merchant implementations.
        text = str(value)
        amount = float(text)
        return (amount if "." in text else amount / 100.0), currency
    except (TypeError, ValueError):
        return None, currency


def _first_url(value: Any) -> str | None:
    """Find the first URL in a media object or list."""
    values = value if isinstance(value, list) else [value]
    for entry in values:
        if isinstance(entry, str) and entry.startswith("http"):
            return entry
        if isinstance(entry, dict):
            candidate = entry.get("url") or entry.get("src")
            if isinstance(candidate, str):
                return candidate
    return None


def _media_type(value: dict[str, Any]) -> str:
    """Normalize the media discriminator used across current UCP shapes."""
    raw = (
        value.get("type")
        or value.get("media_type")
        or value.get("mediaType")
        or value.get("mediaContentType")
        or value.get("content_type")
        or ""
    )
    return re.sub(r"[^a-z0-9]", "", str(raw).casefold())


def _source_format(source: dict[str, Any]) -> str:
    """Return a lowercase 3D file format, deriving it from the URL if needed."""
    declared = str(source.get("format") or "").casefold().lstrip(".")
    if declared:
        return declared
    url = str(source.get("url") or source.get("src") or "")
    path = urlparse(url).path
    return path.rsplit(".", 1)[-1].casefold() if "." in path else ""


def _is_model_source(source: dict[str, Any]) -> bool:
    """Recognize Shopify GLB, glTF, and USDZ sources without trusting extension only."""
    media_type = _media_type(source)
    mime_type = str(source.get("mimeType") or source.get("mime_type") or "").casefold()
    return (
        "model" in media_type
        or _source_format(source) in {"glb", "gltf", "usdz"}
        or mime_type.startswith("model/")
    )


def _normalize_model_source(source: dict[str, Any]) -> ProductModel3dSource | None:
    """Normalize one safe, remotely renderable Shopify model source."""
    url = str(source.get("url") or source.get("src") or "").strip()
    if not url.startswith("https://") or not _is_model_source(source):
        return None
    file_format = _source_format(source)
    mime_type = str(source.get("mimeType") or source.get("mime_type") or "").strip()
    if not mime_type:
        mime_type = {
            "glb": "model/gltf-binary",
            "gltf": "model/gltf+json",
            "usdz": "model/vnd.usdz+zip",
        }.get(file_format, "model/unknown")
    normalized: ProductModel3dSource = {
        "url": url,
        "format": file_format,
        "mimeType": mime_type,
    }
    raw_size = source.get("filesize", source.get("fileSize", source.get("file_size")))
    try:
        if raw_size is not None:
            normalized["filesize"] = int(raw_size)
    except (TypeError, ValueError):
        pass
    return normalized


def _model3d_assets(*media_values: Any) -> list[ProductModel3d]:
    """Extract grouped Shopify 3D models from product and variant media arrays."""
    entries: list[Any] = []
    for value in media_values:
        entries.extend(value if isinstance(value, list) else [value])

    models: list[ProductModel3d] = []
    seen_source_sets: set[tuple[str, ...]] = set()
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        raw_sources = entry.get("sources")
        sources = raw_sources if isinstance(raw_sources, list) else [entry]
        normalized_sources = [
            normalized
            for source in sources
            if isinstance(source, dict)
            and (normalized := _normalize_model_source(source)) is not None
        ]
        entry_is_model = "model" in _media_type(entry) or bool(normalized_sources)
        if not entry_is_model or not normalized_sources:
            continue
        source_key = tuple(sorted(source["url"] for source in normalized_sources))
        if source_key in seen_source_sets:
            continue
        seen_source_sets.add(source_key)
        model: ProductModel3d = {"sources": normalized_sources}
        if entry.get("id") is not None:
            model["id"] = str(entry["id"])
        if entry.get("alt"):
            model["alt"] = str(entry["alt"])
        preview = _first_url(entry.get("previewImage") or entry.get("preview_image"))
        if preview:
            model["previewImageUrl"] = preview
        models.append(model)
    return models


def _first_image_url(*media_values: Any) -> str | None:
    """Find an image URL without accidentally treating a GLB source as an image."""
    for value in media_values:
        entries = value if isinstance(value, list) else [value]
        for entry in entries:
            if isinstance(entry, dict) and (
                "model" in _media_type(entry)
                or any(
                    _is_model_source(source)
                    for source in entry.get("sources", [])
                    if isinstance(source, dict)
                )
            ):
                continue
            image = _first_url(entry)
            if image:
                return image
    return None


def _height_inches(text: str) -> float | None:
    """Extract a conservative product height from common title formats."""
    feet = re.search(r"(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')\b", text, re.I)
    inches = re.search(r"(\d+(?:\.\d+)?)\s*(?:in|inch|inches|\")\b", text, re.I)
    if feet:
        return float(feet.group(1)) * 12 + (float(inches.group(1)) if inches else 0)
    return float(inches.group(1)) if inches else None


def _flatten_strings(value: Any) -> list[str]:
    """Collect strings from UCP metadata for matching and hard-rule filters."""
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        return list(itertools.chain.from_iterable(_flatten_strings(item) for item in value.values()))
    if isinstance(value, list):
        return list(itertools.chain.from_iterable(_flatten_strings(item) for item in value))
    return []


def _normalize_shopify_product(product: dict[str, Any], slot: dict[str, Any]) -> list[CatalogItem]:
    """Turn each purchasable UCP variant into Affinity's product contract."""
    product_text = " ".join(
        [
            str(product.get("title", "")),
            str(product.get("description", "")),
            *_flatten_strings(product.get("metadata", {})),
        ]
    )
    results: list[CatalogItem] = []
    for variant in product.get("variants", []):
        if not isinstance(variant, dict) or variant.get("eligible") is False:
            continue
        price, currency = _money(variant.get("price"))
        if price is None:
            price, currency = _money(product.get("price_range", {}).get("min"))
        if price is None:
            continue
        checkout_url = str(variant.get("checkout_url") or "")
        product_url = str(variant.get("url") or "")
        seller = variant.get("seller") if isinstance(variant.get("seller"), dict) else {}
        seller_url = str(seller.get("url") or "")
        seller_domain = str(seller.get("domain") or "")
        merchant_domain = next(
            (
                urlparse(url if "://" in url else f"https://{url}").hostname
                for url in (seller_domain, checkout_url, seller_url, product_url)
                if url and urlparse(url if "://" in url else f"https://{url}").hostname
            ),
            None,
        )
        if not merchant_domain:
            continue
        variant_text = " ".join(
            [product_text, str(variant.get("title", "")), str(variant.get("description", ""))]
        )
        words = sorted(_tokens(variant_text))
        item: CatalogItem = {
            "id": f"shopify:{variant.get('id')}",
            "slot": slot["id"],
            "name": str(variant.get("title") or product.get("title") or "Shopify product"),
            "price": round(price, 2),
            "tags": words,
            "provider": "shopify_ucp",
            "productId": str(product.get("id", "")),
            "variantId": str(variant.get("id", "")),
            "merchantName": str(seller.get("name") or merchant_domain),
            "merchantDomain": merchant_domain,
            "currency": currency,
            "quantity": int(slot.get("quantity", 1)),
        }
        models3d = _model3d_assets(variant.get("media"), product.get("media"))
        item["has3dModel"] = bool(models3d)
        if models3d:
            item["models3d"] = models3d
        height = _height_inches(variant_text)
        if height is not None:
            item["heightIn"] = height
        if checkout_url:
            item["checkoutUrl"] = checkout_url
        if product_url:
            item["productUrl"] = product_url
        image = _first_image_url(variant.get("media"), product.get("media"))
        if image:
            item["imageUrl"] = image
        results.append(item)
    return results


async def _shopify_candidate_bundles(state: CouncilState):
    """Search every requested slot concurrently and return complete bundles."""
    mission = state["mission"]
    slots = _shopping_slots(mission)
    repair = state.get("repairRequest")
    active_slots = (
        [slot for slot in slots if slot["id"] == repair["slotId"]]
        if repair
        else slots
    )
    if repair and not active_slots:
        raise ValueError(f"Repair slot {repair['slotId']} is not part of this mission")
    locked_items = (
        [item for item in state.get("bundle", {}).get("items", []) if item["id"] != repair["itemId"]]
        if repair
        else []
    )
    height_limits = [
        float(rule["inches"])
        for rule in state["constraints"]["hardRules"]
        if rule["type"] == "maxHeight" and "inches" in rule
    ]
    max_height = min(height_limits, default=None)
    client = ShopifyUcpClient(rich_catalog_media=True)
    rejected_ids = set(state.get("rejectedCandidateIds", []))

    async def search_slot(slot: dict[str, Any]) -> list[CatalogItem]:
        queries = _queries_for_slot(state, slot)
        if max_height is not None and slot["id"] == "tree":
            queries = [f"{query} maximum {max_height:g} inches tall" for query in queries]
        batches = await asyncio.gather(
            *(
                client.search_catalog(
                    query,
                    max_price_cents=int(float(mission["budget"]) * 100),
                    country=os.getenv("AFFINITY_SHIPPING_COUNTRY", "US"),
                    postal_code=os.getenv("AFFINITY_SHIPPING_POSTAL_CODE") or None,
                    currency=os.getenv("AFFINITY_CURRENCY", "USD"),
                    limit=int(os.getenv("SHOPIFY_UCP_SEARCH_LIMIT", "8")),
                    catalog_id=os.getenv("SHOPIFY_UCP_CATALOG_ID") or None,
                )
                for query in queries
            )
        )
        products_by_id = {
            str(product.get("id")): product
            for product in itertools.chain.from_iterable(batches)
            if isinstance(product, dict)
        }
        requested_currency = os.getenv("AFFINITY_CURRENCY", "USD").upper()
        normalized = list(
            itertools.chain.from_iterable(
                _normalize_shopify_product(product, slot) for product in products_by_id.values()
            )
        )
        # A numeric budget is meaningful only within one currency. Shopify can
        # occasionally return international offers despite a requested context.
        normalized = [
            item
            for item in normalized
            if item.get("currency", requested_currency).upper() == requested_currency
            and item["id"] not in rejected_ids
        ]
        filtered = search_catalog(
            normalized,
            slot=slot["id"],
            max_price=float(mission["budget"]),
            hard_rules=state["constraints"]["hardRules"],
        )
        # Unknown height is not safe evidence that a tree satisfies a physical
        # maximum. Other product slots are not treated as vertical fixtures.
        if max_height is not None and slot["id"] == "tree":
            filtered = [item for item in filtered if "heightIn" in item]
        return filtered[:8]

    results = await asyncio.gather(*(search_slot(slot) for slot in active_slots))
    if any(not candidates for candidates in results):
        missing = [slot["id"] for slot, candidates in zip(active_slots, results) if not candidates]
        raise ValueError(f"Shopify found no compliant products for: {', '.join(missing)}")
    candidates = []
    for items in itertools.product(*results):
        combined_items = [*locked_items, *items]
        total = round(
            sum(float(item["price"]) * int(item.get("quantity", 1)) for item in combined_items), 2
        )
        if total <= float(mission["budget"]):
            candidates.append((list(combined_items), total))
    if not candidates:
        raise ValueError("Shopify found products, but no complete combination fits the budget")
    return candidates


async def shop_node(state: CouncilState) -> dict[str, Bundle]:
    """Build a fair bundle from code-filtered catalog results.

    Candidate ranking is lexicographic:

    1. Maximize the least-served sprite (max-min fairness).
    2. Maximize total relevance across the family.
    3. Prefer the fuller tree when still allowed.
    4. Prefer the cheaper bundle when all prior values tie.

    Complaints from revision rounds are appended as additional desires.
    """
    invited = state["mission"]["invitedSpriteIds"]
    desires_by_sprite = {
        sprite_id: [
            wish["wish"]
            for wish in state["constraints"]["wishes"]
            if wish["spriteId"] == sprite_id
        ] + state.get("revisionConstraints", [])
        for sprite_id in invited
    }

    provider = os.getenv("AFFINITY_PRODUCT_PROVIDER", "local").casefold()
    warnings: list[str] = []
    if provider == "shopify_ucp":
        try:
            candidates = await _shopify_candidate_bundles(state)
        except (ShopifyUcpError, ValueError) as error:
            slots = _shopping_slots(state["mission"])
            local_slots = {item["slot"] for item in state["catalog"]}
            if not all(slot["id"] in local_slots for slot in slots):
                raise ValueError(f"Live Shopify search failed: {error}") from error
            candidates = list(_local_repair_candidate_bundles(state))
            provider = "local"
            warnings.append(f"Shopify unavailable; used demo catalog: {error}")
    elif provider == "local":
        candidates = list(_local_repair_candidate_bundles(state))
    else:
        raise ValueError("AFFINITY_PRODUCT_PROVIDER must be 'local' or 'shopify_ucp'")

    best: tuple[tuple[float, float, float, float], list[CatalogItem], float] | None = None
    for items, total in candidates:
        happiness = {
            sprite_id: sum(_item_relevance(item, desires) for item in items)
            for sprite_id, desires in desires_by_sprite.items()
        }
        tree_height = next(
            (item.get("heightIn", 0) for item in items if item["slot"] == "tree"), 0
        )
        # Max-min fairness first, then total satisfaction, fuller allowed tree, and budget headroom.
        rank = (min(happiness.values()), sum(happiness.values()), tree_height, -total)
        if best is None or rank > best[0]:
            best = (rank, items, total)

    if best is None:
        raise ValueError("No in-budget bundle can satisfy every required slot")

    _, selected_items, total = best
    mission = state["mission"]
    recipients = _recipients(mission)
    slot_owner = {
        str(slot["id"]): recipients[index]
        for index, slot in enumerate(_shopping_slots(mission))
        if index < len(recipients)
    }
    if slot_owner:
        serves = {sprite_id: [] for sprite_id in invited}
        for item in selected_items:
            owner = slot_owner.get(str(item["slot"]))
            if owner:
                serves.setdefault(owner, []).append(item["id"])
    else:
        serves = {
            sprite_id: [
                item["id"]
                for item in selected_items
                if _item_relevance(item, desires_by_sprite[sprite_id]) > 0
            ]
            for sprite_id in invited
        }
    items: list[CatalogItem] = []
    for item in selected_items:
        matched = [
            sprite_id
            for sprite_id in invited
            if _item_relevance(item, desires_by_sprite[sprite_id]) > 0
        ]
        reasons = [
            f"Fills the {item['slot']} slot at {item['price']:.2f}.",
            "Fits the mission budget.",
        ]
        if state["constraints"]["hardRules"]:
            reasons.append("Respects every stated non-negotiable.")
        if matched:
            reasons.append(f"Matches public preferences from {', '.join(matched)}.")
        items.append({**item, "selectedBecause": reasons})

    selected_ids = {item["id"] for item in selected_items}
    alternatives: list[dict[str, str]] = []
    seen_alternatives: set[str] = set()
    for candidate_items, _ in candidates:
        for item in candidate_items:
            if item["id"] in selected_ids or item["id"] in seen_alternatives:
                continue
            alternatives.append(
                {
                    "id": item["id"],
                    "slot": item["slot"],
                    "name": item["name"],
                    "reason": "Another option produced a fairer preference match or better total value.",
                }
            )
            seen_alternatives.add(item["id"])
            if len(alternatives) >= 6:
                break
        if len(alternatives) >= 6:
            break
    bundle: Bundle = {
        "items": items,
        "total": total,
        "serves": serves,
        "source": "shopify_ucp" if provider == "shopify_ucp" else "local",
        "rejectedAlternatives": alternatives,
    }
    if warnings:
        bundle["warnings"] = warnings
    _emit("bundle", bundle)
    return {"bundle": bundle, "repairRequest": None}


PRICE_LEVEL_ALIASES = {
    "free": "PRICE_LEVEL_FREE",
    "$": "PRICE_LEVEL_INEXPENSIVE",
    "inexpensive": "PRICE_LEVEL_INEXPENSIVE",
    "$$": "PRICE_LEVEL_MODERATE",
    "moderate": "PRICE_LEVEL_MODERATE",
    "$$$": "PRICE_LEVEL_EXPENSIVE",
    "expensive": "PRICE_LEVEL_EXPENSIVE",
    "$$$$": "PRICE_LEVEL_VERY_EXPENSIVE",
    "very_expensive": "PRICE_LEVEL_VERY_EXPENSIVE",
}


def _price_levels(values: list[str]) -> list[str]:
    """Accept friendly dollar signs or Google's enum names."""
    normalized: list[str] = []
    for value in values:
        text = str(value).strip()
        enum = PRICE_LEVEL_ALIASES.get(text.casefold(), text.upper())
        if not enum.startswith("PRICE_LEVEL_"):
            raise ValueError(f"Unsupported Google Places price level: {value}")
        normalized.append(enum)
    return list(dict.fromkeys(normalized))


def _normalize_place(place: dict[str, Any], slot: dict[str, Any]) -> PlaceCandidate | None:
    """Convert one Google Place response into the public plan contract."""
    if place.get("businessStatus") not in {None, "OPERATIONAL"}:
        return None
    display_name = place.get("displayName", {})
    name = display_name.get("text") if isinstance(display_name, dict) else display_name
    if not place.get("id") or not name:
        return None
    location = place.get("location") if isinstance(place.get("location"), dict) else {}
    types = [str(value) for value in place.get("types", [])]
    candidate: PlaceCandidate = {
        "id": str(place["id"]),
        "slot": str(slot["id"]),
        "name": str(name),
        "address": str(place.get("formattedAddress", "")),
        "tags": sorted(_tokens(" ".join([str(name), *types]))),
        "durationMinutes": max(1, int(slot.get("durationMinutes", 90))),
    }
    optional = {
        "rating": place.get("rating"),
        "userRatingCount": place.get("userRatingCount"),
        "priceLevel": place.get("priceLevel"),
        "googleMapsUri": place.get("googleMapsUri"),
        "websiteUri": place.get("websiteUri"),
        "reservable": place.get("reservable"),
        "latitude": location.get("latitude"),
        "longitude": location.get("longitude"),
    }
    photos = place.get("photos") if isinstance(place.get("photos"), list) else []
    first_photo = next((photo for photo in photos if isinstance(photo, dict) and photo.get("name")), None)
    if first_photo:
        optional["photoName"] = str(first_photo["name"])
        attributions = first_photo.get("authorAttributions")
        if isinstance(attributions, list):
            optional["photoAttributions"] = [
                attribution for attribution in attributions if isinstance(attribution, dict)
            ]
    opening = place.get("currentOpeningHours")
    if isinstance(opening, dict):
        optional["openNow"] = opening.get("openNow")
    candidate.update({key: value for key, value in optional.items() if value is not None})
    return candidate


async def plan_node(state: CouncilState) -> dict[str, Plan]:
    """Build a multi-stop Google Places plan under deterministic filters."""
    if os.getenv("AFFINITY_PLACE_PROVIDER", "local").casefold() != "google_places":
        raise ValueError("Set AFFINITY_PLACE_PROVIDER=google_places for plan missions")
    mission = state["mission"]
    slots = mission.get("planSlots", [])
    repair = state.get("repairRequest")
    active_slots = (
        [slot for slot in slots if slot["id"] == repair["slotId"]]
        if repair
        else slots
    )
    if repair and not active_slots:
        raise ValueError(f"Repair slot {repair['slotId']} is not part of this plan")
    locked_stops = (
        [stop for stop in state.get("plan", {}).get("stops", []) if stop["slot"] != repair["slotId"]]
        if repair
        else []
    )
    location = mission["location"]
    label = str(location["label"]).strip()
    client = GooglePlacesClient()
    excluded = {
        str(rule["tag"]).casefold()
        for rule in state["constraints"]["hardRules"]
        if rule["type"] == "excludedTag" and rule.get("tag")
    }
    rejected_ids = set(state.get("rejectedCandidateIds", []))

    async def search_slot(slot: dict[str, Any]) -> list[PlaceCandidate]:
        price_levels = _price_levels(slot.get("priceLevels", []))
        batches = await asyncio.gather(
            *(
                client.search_text(
                    f"{query} in {label}",
                    included_type=slot.get("includedType"),
                    min_rating=slot.get("minRating"),
                    open_now=slot.get("openNow"),
                    price_levels=price_levels or None,
                    latitude=location.get("latitude"),
                    longitude=location.get("longitude"),
                    radius_meters=float(location.get("radiusMeters", 8000)),
                    page_size=int(os.getenv("GOOGLE_PLACES_SEARCH_LIMIT", "10")),
                    region_code=os.getenv("GOOGLE_PLACES_REGION_CODE", "US"),
                )
                for query in _queries_for_slot(state, slot)
            )
        )
        results = list(
            {
                str(place.get("id")): place
                for place in itertools.chain.from_iterable(batches)
                if isinstance(place, dict)
            }.values()
        )
        candidates = [
            normalized
            for place in results
            if (normalized := _normalize_place(place, slot)) is not None
        ]
        min_rating = float(slot.get("minRating", 0))
        candidates = [
            item
            for item in candidates
            if item["id"] not in rejected_ids
            and float(item.get("rating", 0)) >= min_rating
            and not excluded.intersection(tag.casefold() for tag in item["tags"])
            and (not slot.get("openNow") or item.get("openNow") is True)
            and (not price_levels or item.get("priceLevel") in price_levels)
        ]
        return candidates[:6]

    try:
        results = await asyncio.gather(*(search_slot(slot) for slot in active_slots))
    except GooglePlacesError as error:
        raise ValueError(f"Live Google Places search failed: {error}") from error
    if any(not candidates for candidates in results):
        missing = [slot["id"] for slot, candidates in zip(active_slots, results) if not candidates]
        raise ValueError(f"Google Places found no compliant options for: {', '.join(missing)}")

    invited = mission["invitedSpriteIds"]
    desires_by_sprite = {
        sprite_id: [
            wish["wish"]
            for wish in state["constraints"]["wishes"]
            if wish["spriteId"] == sprite_id
        ] + state.get("revisionConstraints", [])
        for sprite_id in invited
    }
    best: tuple[tuple[float, float, float, int], tuple[PlaceCandidate, ...]] | None = None
    proposal_candidates: list[tuple[PlaceCandidate, ...]] = []
    for searched_stops in itertools.product(*results):
        stops = tuple([*locked_stops, *searched_stops])
        proposal_candidates.append(stops)
        happiness = {
            sprite_id: sum(_item_relevance(stop, desires) for stop in stops)
            for sprite_id, desires in desires_by_sprite.items()
        }
        ratings = [float(stop.get("rating", 0)) for stop in stops]
        rating_count = sum(int(stop.get("userRatingCount", 0)) for stop in stops)
        rank = (
            min(happiness.values()),
            sum(happiness.values()),
            sum(ratings) / len(ratings),
            rating_count,
        )
        if best is None or rank > best[0]:
            best = (rank, stops)
    if best is None:
        raise ValueError("No complete Google Places plan satisfies every required slot")
    selected_stops = list(best[1])
    serves = {
        sprite_id: [
            stop["id"]
            for stop in selected_stops
            if _item_relevance(stop, desires_by_sprite[sprite_id]) > 0
        ]
        for sprite_id in invited
    }
    stops: list[PlaceCandidate] = []
    for stop in selected_stops:
        matched = [
            sprite_id
            for sprite_id in invited
            if _item_relevance(stop, desires_by_sprite[sprite_id]) > 0
        ]
        reasons = [f"Fills the {stop['slot']} slot in {label}."]
        if stop.get("rating") is not None:
            reasons.append(
                f"Rated {float(stop['rating']):g} from {int(stop.get('userRatingCount', 0))} reviews."
            )
        if matched:
            reasons.append(f"Matches public preferences from {', '.join(matched)}.")
        stops.append({**stop, "selectedBecause": reasons})

    selected_ids = {stop["id"] for stop in selected_stops}
    alternatives: list[dict[str, str]] = []
    seen_alternatives: set[str] = set()
    for candidate_stops in proposal_candidates:
        for stop in candidate_stops:
            if stop["id"] in selected_ids or stop["id"] in seen_alternatives:
                continue
            alternatives.append(
                {
                    "id": stop["id"],
                    "slot": stop["slot"],
                    "name": stop["name"],
                    "reason": "Another place produced a fairer preference match or stronger rating evidence.",
                }
            )
            seen_alternatives.add(stop["id"])
            if len(alternatives) >= 6:
                break
        if len(alternatives) >= 6:
            break
    plan: Plan = {
        "stops": stops,
        "location": label,
        "serves": serves,
        "source": "google_places",
        "rejectedAlternatives": alternatives,
        "warnings": [
            "Google Places does not confirm reservation availability or final per-person pricing."
        ],
    }
    if mission.get("when"):
        plan["when"] = mission["when"]
    _emit("plan", plan)
    return {"plan": plan, "repairRequest": None}


def fan_out_scores(state: CouncilState) -> list[Send]:
    """Create one parallel review task per sprite for the same proposal."""
    proposal = state["plan"] if state["mission"].get("kind") == "plan" else state["bundle"]
    return [
        Send(
            "sprite_score",
            ScoreTask(
                mission=state["mission"],
                profile=state["profiles"][sprite_id],
                proposal=proposal,
            ),
        )
        for sprite_id in state["mission"]["invitedSpriteIds"]
    ]


async def sprite_score_node(task: ScoreTask) -> dict[str, list[dict[str, Any]]]:
    """Run one isolated bundle review and emit a reducer-friendly list."""
    score = await score_bundle(task["profile"], task["mission"], task["proposal"])
    _emit("score", score)
    return {"scores": [score]}


def decide_revision_node(state: CouncilState) -> CouncilState:
    """Choose between another shop pass and the human mandate.

    The lowest score controls the decision. A score below 6 adds that sprite's
    complaint and increments the loop count. One completed revision is the
    hard cap: a second identical search is less useful than human review and
    can make a bounded graph look infinite in the UI.
    """
    invited = set(state["mission"]["invitedSpriteIds"])
    scores = [score for score in state["scores"] if score["spriteId"] in invited]
    if {score["spriteId"] for score in scores} != invited:
        raise ValueError("The routing check did not receive every invited sprite score")

    lowest = min(scores, key=lambda score: score["score"])
    if lowest["score"] < 6 and state.get("revisionCount", 0) < 1:
        complaint = lowest.get("complaint") or f"Better serve sprite {lowest['spriteId']}"
        result = {
            "route": "revise",
            "revisionCount": state.get("revisionCount", 0) + 1,
            "revisionConstraints": [complaint],
        }
        _emit("revision", {"spriteId": lowest["spriteId"], "complaint": complaint})
        return result
    _emit("scores_complete", scores)
    return {"route": "mandate"}


def route_after_scores(state: CouncilState) -> str:
    """Expose the decision node's route value to a conditional graph edge."""
    if state["route"] == "mandate":
        return "mandate"
    return "search_plan"


def human_mandate_node(state: CouncilState, config: RunnableConfig) -> CouncilState:
    """Pause for Leap Motion authorization, then create the terminal receipt.

    ``interrupt`` checkpoints the graph and surfaces the cart to the UI. When
    the UI resumes the thread, LangGraph re-enters this node and returns the
    supplied decision from ``interrupt``. Approval requires a signature;
    rejection requires the affected item ID.

    No external payment or other side effect occurs before the interrupt.
    """
    is_plan = state["mission"].get("kind") == "plan"
    proposal_key = "plan" if is_plan else "bundle"
    proposal = state[proposal_key]
    mandate = {
        "type": "plan_mandate" if is_plan else "cart_mandate",
        proposal_key: proposal,
        "requiredGesture": "handshake",
        "holdSeconds": 1.5,
    }
    if is_plan:
        mandate["notificationPreview"] = [
            {"spriteId": profile["id"], "name": profile["name"], "email": profile["email"]}
            for profile in _plan_email_recipients(state)
        ]
    _emit("awaiting_mandate", mandate)
    raw_decision = interrupt(
        mandate,
        response_schema=MandateDecision,
    )
    action = raw_decision.get("action")
    if action is None:
        action = "approve" if raw_decision.get("approve") else "reject"
    if action not in {"approve", "reject", "replace_agent"}:
        raise ValueError("Mandate action must be approve, reject, or replace_agent")
    decision: MandateDecision = {
        **raw_decision,
        "action": action,
        "approve": action == "approve",
    }
    if action == "replace_agent":
        if not decision.get("itemId", "").strip():
            raise ValueError("Agent replacements require an itemId")
        _emit("repair_requested", decision)
        return {"mandateDecision": decision}

    if action == "approve":
        signature = decision.get("signature", "").strip()
        if not signature:
            raise ValueError("Approved mandates require a gesture signature")
        return {"mandateDecision": decision}

    thread_id = str(config.get("configurable", {}).get("thread_id", "unknown"))
    rejected_item = decision.get("itemId", "").strip()
    if not rejected_item:
        raise ValueError("Rejected mandates require an itemId")
    receipt = {
        "status": "rejected",
        "threadId": thread_id,
        "rejectedItemId": rejected_item,
    }
    if not is_plan:
        receipt["total"] = state["bundle"]["total"]
    result = {
        "mandateDecision": decision,
        "receipt": receipt,
    }
    _emit("receipt", receipt)
    return result


def proposal_repair_node(state: CouncilState) -> dict[str, Any]:
    """Turn a rejected proposal entry into a targeted provider-search request."""
    decision = state["mandateDecision"]
    item_id = decision.get("itemId", "").strip()
    entries = (
        state["plan"]["stops"]
        if state["mission"].get("kind") == "plan"
        else state["bundle"]["items"]
    )
    rejected = next((item for item in entries if item["id"] == item_id), None)
    if rejected is None:
        raise ValueError(f"Rejected candidate {item_id} is not in the current proposal")
    supplied_prompt = decision.get("prompt", "").strip()
    prompt = supplied_prompt or (
        f"Find a different {rejected['slot']} option. Do not return {rejected['name']}."
    )
    repair: ProposalRepair = {
        "itemId": item_id,
        "slotId": rejected["slot"],
        "prompt": prompt,
        "autonomous": not bool(supplied_prompt),
    }
    rejected_ids = list(dict.fromkeys([*state.get("rejectedCandidateIds", []), item_id]))
    _emit("repair", repair)
    return {
        "repairRequest": repair,
        "rejectedCandidateIds": rejected_ids,
        "scores": [],
    }


def route_after_mandate(state: CouncilState) -> str:
    """Route approved plans to email and approved shopping to cart creation."""
    action = state["mandateDecision"].get("action")
    if action == "replace_agent":
        return "repair"
    if action != "approve" and not state["mandateDecision"].get("approve"):
        return "end"
    if state["mission"].get("kind") == "plan":
        return "finalize"
    return "preflight"


def finalize_approval_node(state: CouncilState, config: RunnableConfig) -> dict[str, Any]:
    """Create the approved receipt only after every required preflight passes."""
    signature = state["mandateDecision"].get("signature", "").strip()
    if not signature:
        raise ValueError("Final approval requires a gesture signature")
    receipt = {
        "status": "approved",
        "threadId": str(config.get("configurable", {}).get("thread_id", "unknown")),
        "signature": signature,
    }
    if state["mission"].get("kind") != "plan":
        receipt["total"] = state["bundle"]["total"]
    _emit("receipt", receipt)
    return {"receipt": receipt}


def route_after_finalization(state: CouncilState) -> str:
    """Send finalized plans to notification and shopping missions to carts."""
    return "notify_participants" if state["mission"].get("kind") == "plan" else "create_carts"


async def preflight_shopify_node(state: CouncilState) -> dict[str, Any]:
    """Refresh selected Shopify variants before creating merchant carts."""
    items = state["bundle"]["items"]
    shopify_items = [item for item in items if item.get("provider") == "shopify_ucp"]
    if not shopify_items:
        return {"preflightStatus": "ready", "preflightChanges": []}

    client = ShopifyUcpClient(rich_catalog_media=True)
    try:
        products = await asyncio.gather(
            *(client.get_product(item.get("productId", "")) for item in shopify_items)
        )
    except ShopifyUcpError as error:
        raise ValueError(f"Shopify preflight failed: {error}") from error

    fresh_by_id: dict[str, CatalogItem] = {}
    unavailable: CatalogItem | None = None
    changes: list[str] = []
    for current, product in zip(shopify_items, products):
        variants = _normalize_shopify_product(
            product,
            {"id": current["slot"], "quantity": current.get("quantity", 1)},
        )
        fresh = next(
            (item for item in variants if item.get("variantId") == current.get("variantId")),
            None,
        )
        if fresh is None:
            unavailable = current
            break
        fresh_by_id[current["id"]] = {
            **current,
            **fresh,
            "selectedBecause": current.get("selectedBecause", []),
        }
        if float(fresh["price"]) != float(current["price"]):
            changes.append(
                f"{current['name']} changed from {current['price']:.2f} to {fresh['price']:.2f}."
            )

    if unavailable is not None:
        repair: ProposalRepair = {
            "itemId": unavailable["id"],
            "slotId": unavailable["slot"],
            "prompt": f"Find an available replacement for {unavailable['name']}.",
            "autonomous": True,
        }
        rejected_ids = list(
            dict.fromkeys([*state.get("rejectedCandidateIds", []), unavailable["id"]])
        )
        _emit("preflight", {"status": "repair", "changes": ["A selected item is unavailable."]})
        return {
            "preflightStatus": "repair",
            "preflightChanges": ["A selected item is unavailable."],
            "repairRequest": repair,
            "rejectedCandidateIds": rejected_ids,
        }

    refreshed = [fresh_by_id.get(item["id"], item) for item in items]
    total = round(
        sum(float(item["price"]) * int(item.get("quantity", 1)) for item in refreshed),
        2,
    )
    if total > float(state["mission"]["budget"]):
        changed_item = next(
            (item for item in refreshed if item["id"] in fresh_by_id),
            refreshed[0],
        )
        repair = {
            "itemId": changed_item["id"],
            "slotId": changed_item["slot"],
            "prompt": "Find a replacement that keeps the refreshed cart within budget.",
            "autonomous": True,
        }
        return {
            "bundle": {**state["bundle"], "items": refreshed, "total": total},
            "preflightStatus": "repair",
            "preflightChanges": [*changes, "The refreshed total exceeds the mission budget."],
            "repairRequest": repair,
            "rejectedCandidateIds": list(
                dict.fromkeys([*state.get("rejectedCandidateIds", []), changed_item["id"]])
            ),
        }

    status = "changed" if changes else "ready"
    result = {
        "bundle": {**state["bundle"], "items": refreshed, "total": total},
        "preflightStatus": status,
        "preflightChanges": changes,
    }
    _emit("preflight", {"status": status, "changes": changes, "total": total})
    return result


def route_after_preflight(state: CouncilState) -> str:
    """Require fresh consent after price changes or repair unavailable items."""
    if state["preflightStatus"] == "repair":
        return "repair"
    if state["preflightStatus"] == "changed":
        return "mandate"
    return "finalize"


def _plan_email_recipients(state: CouncilState) -> list[dict[str, Any]]:
    """Return invited, opted-in profiles with syntactically valid addresses."""
    recipients: list[dict[str, Any]] = []
    seen: set[str] = set()
    for sprite_id in state["mission"]["invitedSpriteIds"]:
        profile = state["profiles"][sprite_id]
        if profile.get("emailNotifications", True) is False:
            continue
        email = parseaddr(str(profile.get("email", "")))[1].casefold()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email) or email in seen:
            continue
        recipients.append({**profile, "email": email})
        seen.add(email)
    return recipients


async def notify_participants_node(
    state: CouncilState,
    config: RunnableConfig,
) -> dict[str, list[NotificationDelivery]]:
    """Email an approved plan to every invited participant who opted in.

    Each recipient gets a separate message so addresses are never exposed to
    other participants. Delivery failures are returned to the UI without
    undoing the already-approved plan.
    """
    recipients = _plan_email_recipients(state)
    if not recipients:
        return {"notifications": []}
    provider = os.getenv("AFFINITY_EMAIL_PROVIDER", "disabled").casefold()
    if provider not in {"disabled", "console", "smtp"}:
        raise ValueError("AFFINITY_EMAIL_PROVIDER must be disabled, console, or smtp")
    if provider == "disabled":
        return {"notifications": []}
    thread_id = str(config.get("configurable", {}).get("thread_id", "unknown"))
    sender = SmtpEmailSender()

    async def deliver(profile: dict[str, Any]) -> NotificationDelivery:
        safe_thread = re.sub(r"[^a-zA-Z0-9.-]", "-", thread_id)
        safe_sprite = re.sub(r"[^a-zA-Z0-9.-]", "-", profile["id"])
        message_id = f"<affinity-{safe_thread}-{safe_sprite}@notifications.affinity.local>"
        base: NotificationDelivery = {
            "spriteId": profile["id"],
            "name": profile["name"],
            "email": profile["email"],
            "channel": "email",
            "status": "simulated" if provider == "console" else "sent",
            "messageId": message_id,
        }
        if provider == "console":
            return base
        try:
            await sender.send_plan(
                recipient_name=profile["name"],
                recipient_email=profile["email"],
                mission=state["mission"],
                plan=state["plan"],
                message_id=message_id,
            )
            return base
        except SmtpEmailError as error:
            return {**base, "status": "failed", "error": str(error)}

    deliveries = await asyncio.gather(*(deliver(profile) for profile in recipients))
    _emit("notifications", list(deliveries))
    return {"notifications": list(deliveries)}


async def create_carts_node(state: CouncilState) -> dict[str, list[CommerceCart]]:
    """Create merchant carts after approval and return checkout handoff URLs.

    Products from separate merchants become separate carts. This operation is
    intentionally downstream of ``interrupt``: search and family review have
    no merchant-side effect, and the user gets links only after signing.
    """
    shopify_items = [
        item for item in state["bundle"]["items"] if item.get("provider") == "shopify_ucp"
    ]
    if not shopify_items:
        return {"carts": []}

    grouped: dict[str, list[CatalogItem]] = defaultdict(list)
    for item in shopify_items:
        domain = item.get("merchantDomain", "").strip()
        variant = item.get("variantId", "").strip()
        if not domain or not variant:
            raise ValueError(f"Shopify item {item['id']} lacks merchant cart information")
        grouped[domain].append(item)

    # Merchant UCP cart endpoints allow anonymous creation. Agent credentials
    # are used for Global Catalog discovery but are not sent to merchants.
    client = ShopifyUcpClient(auth_mode="anonymous")

    async def create(domain: str, items: list[CatalogItem]) -> CommerceCart:
        cart = await client.create_cart_items(
            merchant_domain=domain,
            line_items=[
                {"variant_id": item["variantId"], "quantity": item.get("quantity", 1)}
                for item in items
            ],
            country=os.getenv("AFFINITY_SHIPPING_COUNTRY", "US"),
            postal_code=os.getenv("AFFINITY_SHIPPING_POSTAL_CODE") or None,
        )
        checkout_url = str(cart.get("checkout_url") or cart.get("continue_url") or "")
        if not checkout_url:
            raise ValueError(f"Shopify cart from {domain} did not include a checkout URL")
        normalized: CommerceCart = {
            "merchantDomain": domain,
            "cartId": str(cart.get("id", "")),
            "checkoutUrl": checkout_url,
        }
        totals = cart.get("totals") if isinstance(cart.get("totals"), dict) else {}
        amount, currency = _money(totals.get("subtotal") or totals.get("total"))
        if amount is not None:
            normalized["total"] = round(amount, 2)
            normalized["currency"] = currency
        return normalized

    try:
        carts = await asyncio.gather(*(create(domain, items) for domain, items in grouped.items()))
    except ShopifyUcpError as error:
        raise ValueError(f"Approved cart creation failed: {error}") from error
    _emit("carts", list(carts))
    return {"carts": list(carts)}
