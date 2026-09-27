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
    """Identity and preferences for one of any number of invited sprites."""

    id: str
    name: str
    relationship: str
    look: str
    colors: list[str]
    personality: list[str]
    loves: list[str]
    avoids: list[str]
    houseRules: list[HouseRule]
    email: NotRequired[str]
    emailNotifications: NotRequired[bool]


class ShoppingSlot(TypedDict):
    """One product category that must be filled by the shopping node."""

    id: str
    query: str
    quantity: NotRequired[int]


class SearchSlotPlan(TypedDict):
    """Provider-independent query strategy for one product or place slot."""

    slotId: str
    queries: list[str]
    rationale: str


class SearchPlan(TypedDict):
    """Structured query plan generated before a live provider is called."""

    kind: Literal["shopping", "plan"]
    slots: list[SearchSlotPlan]


class PlanLocation(TypedDict):
    """Human-readable plan area with an optional geographic search bias."""

    label: str
    latitude: NotRequired[float]
    longitude: NotRequired[float]
    radiusMeters: NotRequired[float]


class PlanSlot(TypedDict):
    """One required stop, such as dinner, an activity, or dessert."""

    id: str
    query: str
    includedType: NotRequired[str]
    minRating: NotRequired[float]
    openNow: NotRequired[bool]
    priceLevels: NotRequired[list[str]]
    durationMinutes: NotRequired[int]


class Mission(TypedDict):
    """Normalized shopping intent produced by the intake stage."""

    occasion: str
    budget: float
    freeText: str
    type: Literal["shared", "gift"]
    invitedSpriteIds: list[str]
    recipientId: NotRequired[str]
    shoppingSlots: NotRequired[list[ShoppingSlot]]
    kind: NotRequired[Literal["shopping", "plan"]]
    location: NotRequired[PlanLocation]
    when: NotRequired[str]
    planSlots: NotRequired[list[PlanSlot]]


class SpriteOpinion(TypedDict):
    """Structured output from one parallel sprite-opinion task."""

    spriteId: str
    say: str
    hardRules: list[HouseRule]
    wishes: list[str]
    vetoes: list[str]


class SpriteDeliberation(TypedDict):
    """One sprite's public response to the council's published opinions."""

    spriteId: str
    say: str
    replyToSpriteIds: list[str]
    agreements: list[str]
    concerns: list[str]
    compromiseWishes: list[str]


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


class ProductModel3dSource(TypedDict):
    """One renderable file supplied for a Shopify-hosted 3D model."""

    url: str
    format: str
    mimeType: str
    filesize: NotRequired[int]


class ProductModel3d(TypedDict):
    """A Shopify product model and its web/AR source files."""

    sources: list[ProductModel3dSource]
    id: NotRequired[str]
    alt: NotRequired[str]
    previewImageUrl: NotRequired[str]


class CatalogItem(TypedDict):
    """A normalized product from the local catalog or Shopify UCP."""

    id: str
    slot: str
    name: str
    price: float
    tags: list[str]
    heightIn: NotRequired[float]
    model: NotRequired[str]
    ornamentAnchors: NotRequired[int]
    provider: NotRequired[Literal["local", "shopify_ucp"]]
    productId: NotRequired[str]
    variantId: NotRequired[str]
    merchantName: NotRequired[str]
    merchantDomain: NotRequired[str]
    checkoutUrl: NotRequired[str]
    productUrl: NotRequired[str]
    imageUrl: NotRequired[str]
    has3dModel: NotRequired[bool]
    models3d: NotRequired[list[ProductModel3d]]
    currency: NotRequired[str]
    quantity: NotRequired[int]
    selectedBecause: NotRequired[list[str]]


class RejectedAlternative(TypedDict):
    """Candidate omitted from a proposal and the inspectable reason why."""

    id: str
    slot: str
    name: str
    reason: str


class Bundle(TypedDict):
    """An in-budget set of products plus attribution to family members."""

    items: list[CatalogItem]
    total: float
    serves: dict[str, list[str]]
    source: NotRequired[Literal["local", "shopify_ucp"]]
    warnings: NotRequired[list[str]]
    rejectedAlternatives: NotRequired[list[RejectedAlternative]]


class PlaceCandidate(TypedDict):
    """A Google Places result normalized for planning and UI display."""

    id: str
    slot: str
    name: str
    address: str
    tags: list[str]
    rating: NotRequired[float]
    userRatingCount: NotRequired[int]
    priceLevel: NotRequired[str]
    googleMapsUri: NotRequired[str]
    websiteUri: NotRequired[str]
    latitude: NotRequired[float]
    longitude: NotRequired[float]
    openNow: NotRequired[bool]
    reservable: NotRequired[bool]
    durationMinutes: NotRequired[int]
    selectedBecause: NotRequired[list[str]]
    photoName: NotRequired[str]
    photoAttributions: NotRequired[list[dict[str, str]]]


class Plan(TypedDict):
    """A reviewed itinerary assembled from one place per required slot."""

    stops: list[PlaceCandidate]
    location: str
    serves: dict[str, list[str]]
    source: Literal["google_places"]
    when: NotRequired[str]
    warnings: NotRequired[list[str]]
    rejectedAlternatives: NotRequired[list[RejectedAlternative]]


class CommerceCart(TypedDict):
    """A merchant cart created only after the mandate is approved."""

    merchantDomain: str
    cartId: str
    checkoutUrl: str
    total: NotRequired[float]
    currency: NotRequired[str]


class SpriteScore(TypedDict):
    """One sprite's independent satisfaction response to a bundle."""

    spriteId: str
    score: float
    say: str
    complaint: NotRequired[str]


class MandateDecision(TypedDict):
    """Payload expected when the frontend resumes the mandate interrupt."""

    action: NotRequired[Literal["approve", "reject", "replace_agent"]]
    approve: NotRequired[bool]
    signature: NotRequired[str]
    itemId: NotRequired[str]
    prompt: NotRequired[str]


class ProposalRepair(TypedDict):
    """Human-requested replacement for one rejected proposal candidate."""

    itemId: str
    slotId: str
    prompt: str
    autonomous: bool


class Receipt(TypedDict):
    """Terminal result created after approval or rejection."""

    status: Literal["approved", "rejected"]
    threadId: str
    total: NotRequired[float]
    signature: NotRequired[str]
    rejectedItemId: NotRequired[str]


class NotificationDelivery(TypedDict):
    """Result of one post-approval participant notification."""

    spriteId: str
    name: str
    email: str
    channel: Literal["email"]
    status: Literal["sent", "simulated", "failed"]
    messageId: NotRequired[str]
    error: NotRequired[str]


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
    deliberations: Annotated[list[SpriteDeliberation], merge_by_sprite]
    constraints: ConstraintSet
    searchPlan: SearchPlan
    bundle: Bundle
    plan: Plan
    scores: Annotated[list[SpriteScore], merge_by_sprite]
    revisionConstraints: Annotated[list[str], add]
    revisionCount: int
    route: Literal["revise", "mandate"]
    mandateDecision: MandateDecision
    repairRequest: ProposalRepair | None
    rejectedCandidateIds: list[str]
    preflightChanges: list[str]
    preflightStatus: Literal["ready", "changed", "repair"]
    receipt: Receipt
    carts: list[CommerceCart]
    notifications: list[NotificationDelivery]


class SpriteTask(TypedDict):
    """Private input packet sent to one opinion worker."""

    mission: Mission
    profile: FamilyProfile


class ScoreTask(TypedDict):
    """Private input packet sent to one bundle-scoring worker."""

    mission: Mission
    profile: FamilyProfile
    proposal: Bundle | Plan


class DeliberationTask(TypedDict):
    """Private profile plus public council context for one response turn."""

    mission: Mission
    profile: FamilyProfile
    publicOpinions: list[SpriteOpinion]
    constraints: ConstraintSet
