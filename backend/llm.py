"""Sprite reasoning adapters for live-model and deterministic demo modes.

``DEMO_MODE=true`` (the default) avoids network calls and creates predictable
opinions/scores from the profile. With ``DEMO_MODE=false`` and an
``OPENAI_API_KEY``, each sprite uses structured model output.

This module does not merge constraints, choose products, or authorize money.
Those responsibilities remain deterministic elsewhere in the graph.
"""

from __future__ import annotations

import json
import os
import re
from functools import lru_cache

from pydantic import BaseModel, Field

from .models import (
    Bundle,
    ConstraintSet,
    FamilyProfile,
    Mission,
    Plan,
    ProposalRepair,
    SearchPlan,
    SpriteDeliberation,
    SpriteOpinion,
    SpriteScore,
)


class OpinionOutput(BaseModel):
    """Schema the live model must satisfy for a sprite opinion."""
    say: str
    wishes: list[str] = Field(default_factory=list)
    vetoes: list[str] = Field(default_factory=list)


class ScoreOutput(BaseModel):
    """Schema the live model must satisfy when reviewing a bundle."""
    score: float = Field(ge=0, le=10)
    say: str
    complaint: str | None = None


class DeliberationOutput(BaseModel):
    """Schema for one public inter-sprite response turn."""

    say: str
    replyToSpriteIds: list[str] = Field(default_factory=list)
    agreements: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)
    compromiseWishes: list[str] = Field(default_factory=list, max_length=2)


class SearchSlotOutput(BaseModel):
    """Model-generated query variants for one requested slot."""

    slotId: str
    queries: list[str] = Field(min_length=1, max_length=3)
    rationale: str


class SearchPlanOutput(BaseModel):
    """Structured output for the provider-independent search planner."""

    slots: list[SearchSlotOutput]


def _demo_mode() -> bool:
    """Use local fallbacks when explicitly configured or no key is present."""
    configured = os.getenv("DEMO_MODE", "true").casefold() in {"1", "true", "yes"}
    return configured or not os.getenv("OPENAI_API_KEY")


@lru_cache(maxsize=2)
def _model(model_name: str):
    """Create each configured model once and reuse its HTTP client."""
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(model=model_name, temperature=0)


def _tokens(value: str) -> set[str]:
    """Normalize text for the deliberately simple demo relevance heuristic."""
    return {token for token in re.findall(r"[a-z0-9]+", value.casefold()) if len(token) > 2}


async def create_sprite_opinion(profile: FamilyProfile, mission: Mission) -> SpriteOpinion:
    """Generate one isolated sprite's opinion about the current mission.

    The caller passes one profile only. This prevents a sprite from seeing or
    impersonating another family member's private context.
    """
    if _demo_mode():
        featured_wish = profile["loves"][0]
        return {
            "spriteId": profile["id"],
            "say": f"I would love {featured_wish}, and I want our house rules respected.",
            "hardRules": profile["houseRules"],
            "wishes": profile["loves"],
            "vetoes": profile["avoids"],
        }

    prompt = {
        "instruction": (
            "Represent only this family member. Return one short spoken line plus "
            "wishes and vetoes. The profile's house rules are authoritative and are "
            "attached by deterministic code, so do not restate or invent rules. "
            "Never authorize spending."
        ),
        "profile": profile,
        "mission": mission,
    }
    # Function calling keeps this compatible with optional/default list fields.
    structured = _model(os.getenv("OPENAI_SPRITE_MODEL", "gpt-4.1-mini")).with_structured_output(
        OpinionOutput,
        method="function_calling",
    )
    result = await structured.ainvoke(json.dumps(prompt))
    return {
        "spriteId": profile["id"],
        "say": result.say,
        "hardRules": profile["houseRules"],
        # Profile preferences are user-authored and must not disappear merely
        # because a model paraphrases or omits one during a particular run.
        "wishes": list(dict.fromkeys([*profile["loves"], *result.wishes])),
        "vetoes": list(dict.fromkeys([*profile["avoids"], *result.vetoes])),
    }


async def create_sprite_deliberation(
    profile: FamilyProfile,
    mission: Mission,
    public_opinions: list[SpriteOpinion],
    constraints: ConstraintSet,
) -> SpriteDeliberation:
    """Respond to public council statements without exposing private profiles."""
    other_opinions = [item for item in public_opinions if item["spriteId"] != profile["id"]]
    if _demo_mode():
        conflicts = constraints.get("conflicts", [])
        if conflicts:
            compromise = conflicts[0]["resolution"]
            say = f"I hear the concern. {compromise}"
            compromise_wishes = [compromise]
        elif other_opinions:
            shared_wish = other_opinions[0]["wishes"][0]
            say = f"I can support {shared_wish} if we also include {profile['loves'][0]}."
            compromise_wishes = [shared_wish, profile["loves"][0]]
        else:
            say = f"My priority is still {profile['loves'][0]}."
            compromise_wishes = [profile["loves"][0]]
        return {
            "spriteId": profile["id"],
            "say": say,
            "replyToSpriteIds": [item["spriteId"] for item in other_opinions[:1]],
            "agreements": compromise_wishes[:1],
            "concerns": [item["wish"] for item in conflicts[:1]],
            "compromiseWishes": compromise_wishes,
        }

    prompt = {
        "instruction": (
            "You are one family member in a visible council discussion. Respond to the other "
            "sprites' PUBLIC statements, acknowledge at least one specific point when possible, "
            "and suggest up to two concrete compromise wishes. Never weaken or override a hard "
            "rule. You may see only your own private profile; do not infer private facts about "
            "others. Keep the spoken line brief and natural."
        ),
        "ownProfile": profile,
        "mission": mission,
        "publicOpinions": other_opinions,
        "publicConstraintBoard": constraints,
    }
    structured = _model(os.getenv("OPENAI_SPRITE_MODEL", "gpt-4.1-mini")).with_structured_output(
        DeliberationOutput,
        method="function_calling",
    )
    result = await structured.ainvoke(json.dumps(prompt))
    valid_ids = {item["spriteId"] for item in other_opinions}
    return {
        "spriteId": profile["id"],
        "say": result.say,
        "replyToSpriteIds": [item for item in result.replyToSpriteIds if item in valid_ids],
        "agreements": result.agreements,
        "concerns": result.concerns,
        "compromiseWishes": result.compromiseWishes,
    }


async def create_search_plan(
    *,
    mission: Mission,
    constraints: ConstraintSet,
    slots: list[dict],
    repair_request: ProposalRepair | None = None,
) -> SearchPlan:
    """Create bounded query variants before Shopify or Google Places runs.

    The model may improve retrieval wording, but it cannot remove hard filters;
    those remain separate structured inputs enforced by provider nodes.
    """
    kind = mission.get("kind", "shopping")
    public_wishes = [item["wish"] for item in constraints.get("wishes", [])]
    repair_prompt = repair_request.get("prompt", "") if repair_request else ""

    if _demo_mode():
        planned = []
        for slot in slots:
            base = str(slot["query"]).strip()
            queries = [base]
            if public_wishes:
                queries.append(f"{base} {' '.join(public_wishes[:2])}".strip())
            if repair_request and repair_request["slotId"] == slot["id"]:
                queries.append(f"{base} {repair_prompt}".strip())
            planned.append(
                {
                    "slotId": str(slot["id"]),
                    "queries": list(dict.fromkeys(query for query in queries if query))[:3],
                    "rationale": (
                        "Replace the rejected option using the human's guidance."
                        if repair_request and repair_request["slotId"] == slot["id"]
                        else "Search the requested slot and public council preferences."
                    ),
                }
            )
        return {"kind": kind, "slots": planned}

    prompt = {
        "instruction": (
            "Create one to three concise provider-search queries per slot. Preserve every slot ID. "
            "Use public wishes and the optional repair instruction to improve recall, but never "
            "weaken hard rules, budget, location, rating, price, or availability filters. Do not "
            "invent products, venues, prices, or availability."
        ),
        "mission": mission,
        "slots": slots,
        "publicConstraints": constraints,
        "repairRequest": repair_request,
    }
    structured = _model(os.getenv("OPENAI_SPRITE_MODEL", "gpt-4.1-mini")).with_structured_output(
        SearchPlanOutput,
        method="function_calling",
    )
    result = await structured.ainvoke(json.dumps(prompt))
    by_id = {item.slotId: item for item in result.slots}
    planned = []
    for slot in slots:
        slot_id = str(slot["id"])
        generated = by_id.get(slot_id)
        queries = (
            [query.strip() for query in generated.queries if query.strip()]
            if generated
            else []
        )
        base = str(slot["query"]).strip()
        if base not in queries:
            queries.insert(0, base)
        planned.append(
            {
                "slotId": slot_id,
                "queries": list(dict.fromkeys(queries))[:3],
                "rationale": generated.rationale if generated else "Use the requested query.",
            }
        )
    return {"kind": kind, "slots": planned}


async def score_bundle(
    profile: FamilyProfile,
    mission: Mission,
    proposal: Bundle | Plan,
) -> SpriteScore:
    """Return one sprite's reaction to a product bundle or place plan."""
    if _demo_mode():
        entries = proposal.get("items", proposal.get("stops", []))
        item_text = " ".join(
            part
            for item in entries
            for part in [item["name"], *item.get("tags", [])]
        )
        catalog_tokens = _tokens(item_text)
        matched = [wish for wish in profile["loves"] if _tokens(wish) & catalog_tokens]
        score = min(10.0, 4.0 + 2.0 * len(matched))
        complaint = None if score >= 6 else f"Please include something related to {profile['loves'][0]}."
        return {
            "spriteId": profile["id"],
            "score": score,
            "say": f"I give this proposal {score:g} out of 10.",
            **({"complaint": complaint} if complaint else {}),
        }

    prompt = {
        "instruction": (
            "Score this product bundle or place plan from 0 to 10 for only this family "
            "member. Give one short spoken reaction. If below 6, include one concrete "
            "search complaint. Do not claim that a reservation or purchase is complete. "
            "For place plans, price levels are approximate, so do not claim exact budget fit."
        ),
        "profile": profile,
        "mission": mission,
        "proposal": proposal,
    }
    structured = _model(os.getenv("OPENAI_SPRITE_MODEL", "gpt-4.1-mini")).with_structured_output(
        ScoreOutput,
        method="function_calling",
    )
    result = await structured.ainvoke(json.dumps(prompt))
    return {
        "spriteId": profile["id"],
        "score": result.score,
        "say": result.say,
        **({"complaint": result.complaint} if result.complaint else {}),
    }
