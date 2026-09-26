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

import itertools
import re
from typing import Any

from langchain_core.runnables import RunnableConfig
from langgraph.types import Send, interrupt

from .catalog import search_catalog
from .data import load_catalog, load_profiles
from .llm import create_sprite_opinion, score_bundle
from .models import (
    Bundle,
    CatalogItem,
    Conflict,
    ConstraintSet,
    CouncilState,
    HouseRule,
    MandateDecision,
    Mission,
    ScoreTask,
    SpriteOpinion,
    SpriteTask,
    WeightedWish,
)

# A valid MVP bundle must contain products for each of these conceptual slots.
REQUIRED_SLOTS = ("tree", "lights", "ornaments", "topper")


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

    profiles = load_profiles()
    invited = list(dict.fromkeys(mission.get("invitedSpriteIds", [])))
    unknown = [sprite_id for sprite_id in invited if sprite_id not in profiles]
    if not invited:
        raise ValueError("Invite at least one sprite")
    if unknown:
        raise ValueError(f"Unknown sprite IDs: {', '.join(unknown)}")
    if mission["type"] == "gift" and mission.get("recipientId") not in invited:
        raise ValueError("A gift recipient must be one of the invited sprites")

    normalized_mission: Mission = {
        **mission,
        "occasion": mission["occasion"].strip(),
        "budget": float(mission["budget"]),
        "freeText": mission.get("freeText", "").strip(),
        "invitedSpriteIds": invited,
    }
    return {
        "mission": normalized_mission,
        "profiles": profiles,
        "catalog": load_catalog(),
        "opinions": [],
        "scores": [],
        "revisionConstraints": [],
        "revisionCount": 0,
    }


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
            weight = 2.0 if (
                state["mission"]["type"] == "gift"
                and state["mission"].get("recipientId") == opinion["spriteId"]
            ) else 1.0
            wishes.append({"spriteId": opinion["spriteId"], "wish": wish, "weight": weight})

    constraints: ConstraintSet = {
        "hardRules": rules,
        "wishes": wishes,
        "conflicts": _find_conflicts(wishes, rules, state["catalog"]),
    }
    return {"constraints": constraints}


def _item_relevance(item: CatalogItem, desires: list[str]) -> float:
    """Count how many desires share meaningful words with a catalog item."""
    item_tokens = _tokens(" ".join([item["name"], *item["tags"]]))
    return float(sum(bool(item_tokens & _tokens(desire)) for desire in desires))


def _candidate_bundles(state: CouncilState):
    """Yield every complete, hard-rule-compliant bundle within the budget.

    Tree, lights, and topper contribute one item each. One to three ornament
    sets are permitted so multiple family wishes can be represented.
    """
    mission = state["mission"]
    constraints = state["constraints"]
    common = {
        "catalog": state["catalog"],
        "max_price": mission["budget"],
        "hard_rules": constraints["hardRules"],
    }
    trees = search_catalog(slot="tree", **common)
    lights = search_catalog(slot="lights", **common)
    ornaments = search_catalog(slot="ornaments", **common)
    toppers = search_catalog(slot="topper", **common)
    if not all((trees, lights, ornaments, toppers)):
        raise ValueError("No complete bundle can satisfy the hard rules")

    ornament_sets = itertools.chain.from_iterable(
        itertools.combinations(ornaments, count)
        for count in range(1, min(3, len(ornaments)) + 1)
    )
    for tree, light, ornament_group, topper in itertools.product(
        trees, lights, list(ornament_sets), toppers
    ):
        items = [tree, light, *ornament_group, topper]
        total = round(sum(float(item["price"]) for item in items), 2)
        if total <= mission["budget"]:
            yield items, total


def shop_node(state: CouncilState) -> dict[str, Bundle]:
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

    best: tuple[tuple[float, float, float, float], list[CatalogItem], float] | None = None
    for items, total in _candidate_bundles(state):
        happiness = {
            sprite_id: sum(_item_relevance(item, desires) for item in items)
            for sprite_id, desires in desires_by_sprite.items()
        }
        tree_height = next(item.get("heightIn", 0) for item in items if item["slot"] == "tree")
        # Max-min fairness first, then total satisfaction, fuller allowed tree, and budget headroom.
        rank = (min(happiness.values()), sum(happiness.values()), tree_height, -total)
        if best is None or rank > best[0]:
            best = (rank, items, total)

    if best is None:
        raise ValueError("No in-budget bundle can satisfy every required slot")

    _, items, total = best
    serves = {
        sprite_id: [
            item["id"]
            for item in items
            if _item_relevance(item, desires_by_sprite[sprite_id]) > 0
        ]
        for sprite_id in invited
    }
    return {"bundle": {"items": items, "total": total, "serves": serves}}


def fan_out_scores(state: CouncilState) -> list[Send]:
    """Create one parallel review task per invited sprite for the same bundle."""
    return [
        Send(
            "sprite_score",
            ScoreTask(
                mission=state["mission"],
                profile=state["profiles"][sprite_id],
                bundle=state["bundle"],
            ),
        )
        for sprite_id in state["mission"]["invitedSpriteIds"]
    ]


async def sprite_score_node(task: ScoreTask) -> dict[str, list[dict[str, Any]]]:
    """Run one isolated bundle review and emit a reducer-friendly list."""
    score = await score_bundle(task["profile"], task["mission"], task["bundle"])
    return {"scores": [score]}


def decide_revision_node(state: CouncilState) -> CouncilState:
    """Choose between another shop pass and the human mandate.

    The lowest score controls the decision. A score below 6 adds that sprite's
    complaint and increments the loop count. Two completed revisions is the
    hard cap, preventing an agentic infinite loop during the demo.
    """
    invited = set(state["mission"]["invitedSpriteIds"])
    scores = [score for score in state["scores"] if score["spriteId"] in invited]
    if {score["spriteId"] for score in scores} != invited:
        raise ValueError("The routing check did not receive every invited sprite score")

    lowest = min(scores, key=lambda score: score["score"])
    if lowest["score"] < 6 and state.get("revisionCount", 0) < 2:
        complaint = lowest.get("complaint") or f"Better serve sprite {lowest['spriteId']}"
        return {
            "route": "revise",
            "revisionCount": state.get("revisionCount", 0) + 1,
            "revisionConstraints": [complaint],
        }
    return {"route": "mandate"}


def route_after_scores(state: CouncilState) -> str:
    """Expose the decision node's route value to a conditional graph edge."""
    return state["route"]


def human_mandate_node(state: CouncilState, config: RunnableConfig) -> CouncilState:
    """Pause for Leap Motion authorization, then create the terminal receipt.

    ``interrupt`` checkpoints the graph and surfaces the cart to the UI. When
    the UI resumes the thread, LangGraph re-enters this node and returns the
    supplied decision from ``interrupt``. Approval requires a signature;
    rejection requires the affected item ID.

    No external payment or other side effect occurs before the interrupt.
    """
    decision = interrupt(
        {
            "type": "cart_mandate",
            "bundle": state["bundle"],
            "requiredGesture": "handshake",
            "holdSeconds": 1.5,
        },
        response_schema=MandateDecision,
    )
    thread_id = str(config.get("configurable", {}).get("thread_id", "unknown"))
    if decision["approve"]:
        signature = decision.get("signature", "").strip()
        if not signature:
            raise ValueError("Approved mandates require a gesture signature")
        return {
            "mandateDecision": decision,
            "receipt": {
                "status": "approved",
                "threadId": thread_id,
                "total": state["bundle"]["total"],
                "signature": signature,
            },
        }

    rejected_item = decision.get("itemId", "").strip()
    if not rejected_item:
        raise ValueError("Rejected mandates require an itemId")
    return {
        "mandateDecision": decision,
        "receipt": {
            "status": "rejected",
            "threadId": thread_id,
            "total": state["bundle"]["total"],
            "rejectedItemId": rejected_item,
        },
    }
