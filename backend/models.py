"""Shared state and payload contracts for the Affinity graph.

LangGraph passes one ``CouncilState`` dictionary between nodes. ``TypedDict``
classes document that dictionary without converting values at runtime. Fields
wrapped in ``Annotated`` also tell LangGraph how concurrent writes are reduced.

Naming follows the frontend JSON contract (for example ``spriteId`` and
``hardRules``), which avoids translation logic at the API boundary.
"""

from __future__ import annotations

from operator import add
from typing import Annotated, Literal, NotRequired, TypedDict


class HouseRule(TypedDict):
    """A non-negotiable constraint that catalog code must enforce."""

    type: Literal["maxHeight", "excludedTag"]
    why: str
    inches: NotRequired[float]
    tag: NotRequired[str]


class FamilyProfile(TypedDict):
    """Locally stored identity and preferences for exactly one sprite."""

    id: str
    name: str
    relationship: str
    look: str
    colors: list[str]
    personality: list[str]
    loves: list[str]
    avoids: list[str]
    houseRules: list[HouseRule]


class Mission(TypedDict):
    """Normalized shopping intent produced by the intake stage."""

    occasion: str
    budget: float
    freeText: str
    type: Literal["shared", "gift"]
    invitedSpriteIds: list[str]
    recipientId: NotRequired[str]


class SpriteOpinion(TypedDict):
    """Structured output from one parallel sprite-opinion task."""

    spriteId: str
    say: str
    hardRules: list[HouseRule]
    wishes: list[str]
    vetoes: list[str]


class WeightedWish(TypedDict):
    """A soft preference plus the sprite and mission-specific voting weight."""

    spriteId: str
    wish: str
    weight: float


class Conflict(TypedDict):
    """A wish that violates a hard rule and its visible resolution."""

    rule: str
    wish: str
    resolution: str


class ConstraintSet(TypedDict):
    """Deterministic merge result displayed by the constraint board."""

    hardRules: list[HouseRule]
    wishes: list[WeightedWish]
    conflicts: list[Conflict]


class CatalogItem(TypedDict):
    """One curated product or intentional decoy in the local catalog."""

    id: str
    slot: Literal["tree", "lights", "ornaments", "topper", "decoy"]
    name: str
    price: float
    tags: list[str]
    heightIn: NotRequired[float]
    model: NotRequired[str]
    ornamentAnchors: NotRequired[int]


class Bundle(TypedDict):
    """An in-budget set of products plus attribution to family members."""

    items: list[CatalogItem]
    total: float
    serves: dict[str, list[str]]


class SpriteScore(TypedDict):
    """One sprite's independent satisfaction response to a bundle."""

    spriteId: str
    score: float
    say: str
    complaint: NotRequired[str]


class MandateDecision(TypedDict):
    """Payload expected when the frontend resumes the mandate interrupt."""

    approve: bool
    signature: NotRequired[str]
    itemId: NotRequired[str]


class Receipt(TypedDict):
    """Terminal result created after approval or rejection."""

    status: Literal["approved", "rejected"]
    threadId: str
    total: float
    signature: NotRequired[str]
    rejectedItemId: NotRequired[str]


def merge_by_sprite(
    current: list[dict] | None,
    updates: list[dict] | None,
) -> list[dict]:
    """Combine parallel writes while retaining one newest result per sprite.

    LangGraph can receive three opinion or score updates in the same superstep.
    A normal list assignment would conflict, while ``operator.add`` would keep
    stale scores after a revision. Keying by ``spriteId`` solves both problems.
    """
    merged = {item["spriteId"]: item for item in current or []}
    merged.update({item["spriteId"]: item for item in updates or []})
    return list(merged.values())


class CouncilState(TypedDict, total=False):
    """Complete working memory carried through one graph execution.

    ``opinions`` and ``scores`` use ``merge_by_sprite`` because parallel Send
    tasks write them. ``revisionConstraints`` uses list addition so complaints
    accumulate across the bounded revise loop. All other fields use normal
    last-write semantics.

    This is short-term graph state, not durable family memory. The configured
    checkpointer preserves it for interrupt/resume within a thread.
    """

    mission: Mission
    profiles: dict[str, FamilyProfile]
    catalog: list[CatalogItem]
    opinions: Annotated[list[SpriteOpinion], merge_by_sprite]
    constraints: ConstraintSet
    bundle: Bundle
    scores: Annotated[list[SpriteScore], merge_by_sprite]
    revisionConstraints: Annotated[list[str], add]
    revisionCount: int
    route: Literal["revise", "mandate"]
    mandateDecision: MandateDecision
    receipt: Receipt


class SpriteTask(TypedDict):
    """Private input packet sent to one opinion worker."""

    mission: Mission
    profile: FamilyProfile


class ScoreTask(TypedDict):
    """Private input packet sent to one bundle-scoring worker."""

    mission: Mission
    profile: FamilyProfile
    bundle: Bundle
