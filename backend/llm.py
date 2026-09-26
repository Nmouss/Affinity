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

from .models import Bundle, FamilyProfile, Mission, SpriteOpinion, SpriteScore


class OpinionOutput(BaseModel):
    """Schema the live model must satisfy for a sprite opinion."""
    say: str
    hardRules: list[dict] = Field(default_factory=list)
    wishes: list[str] = Field(default_factory=list)
    vetoes: list[str] = Field(default_factory=list)


class ScoreOutput(BaseModel):
    """Schema the live model must satisfy when reviewing a bundle."""
    score: float = Field(ge=0, le=10)
    say: str
    complaint: str | None = None


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
            "structured hard rules, wishes, and vetoes. Never authorize spending."
        ),
        "profile": profile,
        "mission": mission,
    }
    structured = _model(os.getenv("OPENAI_SPRITE_MODEL", "gpt-4.1-mini")).with_structured_output(
        OpinionOutput
    )
    result = await structured.ainvoke(json.dumps(prompt))
    return {
        "spriteId": profile["id"],
        "say": result.say,
        "hardRules": result.hardRules or profile["houseRules"],
        "wishes": result.wishes,
        "vetoes": result.vetoes,
    }


async def score_bundle(profile: FamilyProfile, mission: Mission, bundle: Bundle) -> SpriteScore:
    """Return one sprite's 0–10 reaction and an optional revision complaint."""
    if _demo_mode():
        item_text = " ".join(
            part
            for item in bundle["items"]
            for part in [item["name"], *item["tags"]]
        )
        catalog_tokens = _tokens(item_text)
        matched = [wish for wish in profile["loves"] if _tokens(wish) & catalog_tokens]
        score = min(10.0, 4.0 + 2.0 * len(matched))
        complaint = None if score >= 6 else f"Please include something related to {profile['loves'][0]}."
        return {
            "spriteId": profile["id"],
            "score": score,
            "say": f"I give this bundle {score:g} out of 10.",
            **({"complaint": complaint} if complaint else {}),
        }

    prompt = {
        "instruction": (
            "Score this bundle from 0 to 10 for only this family member. Give one short "
            "spoken reaction. If below 6, include one concrete catalog-search complaint."
        ),
        "profile": profile,
        "mission": mission,
        "bundle": bundle,
    }
    structured = _model(os.getenv("OPENAI_SPRITE_MODEL", "gpt-4.1-mini")).with_structured_output(
        ScoreOutput
    )
    result = await structured.ainvoke(json.dumps(prompt))
    return {
        "spriteId": profile["id"],
        "score": result.score,
        "say": result.say,
        **({"complaint": result.complaint} if result.complaint else {}),
    }
