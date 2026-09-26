"""Run a live four-person Google Places planning demo.

Usage:
    python -m backend.demo_places
    python -m backend.demo_places --approve

Approval records the human mandate and exposes handoff links. It does not make
a reservation, hold inventory, or charge the user.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from uuid import uuid4

from dotenv import load_dotenv

load_dotenv()

from langgraph.types import Command  # noqa: E402

from .agent import build_graph  # noqa: E402


def _profile(sprite_id: str, name: str, loves: list[str]) -> dict:
    return {
        "id": sprite_id,
        "name": name,
        "relationship": "demo participant",
        "look": "A colorful Affinity sprite",
        "colors": ["orange", "blue"],
        "personality": ["collaborative"],
        "loves": loves,
        "avoids": ["very expensive places"],
        "houseRules": [],
    }


async def run(*, approve: bool) -> None:
    """Plan dinner and an activity near Georgia Tech with four sprites."""
    graph = build_graph()
    thread_id = f"places-demo-{uuid4()}"
    profiles = {
        profile["id"]: profile
        for profile in [
            _profile("foodie", "Foodie", ["vegetarian-friendly casual dinner", "dessert"]),
            _profile("player", "Player", ["interactive group games", "bowling"]),
            _profile("planner", "Planner", ["inexpensive options", "near Georgia Tech"]),
            _profile("judge", "Guest Judge", ["high-rated local places", "memorable night"]),
        ]
    }
    mission = {
        "kind": "plan",
        "occasion": "Hackathon team night",
        "budget": 160,
        "freeText": "Dinner followed by a fun group activity",
        "type": "shared",
        "invitedSpriteIds": list(profiles),
        "location": {
            "label": "Georgia Tech, Atlanta, GA",
            "latitude": 33.7756,
            "longitude": -84.3963,
            "radiusMeters": 8000,
        },
        "when": "Saturday evening",
        "planSlots": [
            {
                "id": "dinner",
                "query": "casual dinner with vegetarian options",
                "includedType": "restaurant",
                "minRating": 4.0,
                "priceLevels": ["$", "$$"],
                "durationMinutes": 90,
            },
            {
                "id": "activity",
                "query": "fun interactive group activity",
                "minRating": 4.0,
                "priceLevels": ["$", "$$"],
                "durationMinutes": 120,
            },
        ],
    }
    config = {"configurable": {"thread_id": thread_id}}
    paused = await graph.ainvoke({"mission": mission, "profiles": profiles}, config)
    print(
        json.dumps(
            {
                "threadId": thread_id,
                "stage": "awaiting_mandate",
                "profileCount": len(profiles),
                "opinionCount": len(paused["opinions"]),
                "scoreCount": len(paused["scores"]),
                "revisionCount": paused["revisionCount"],
                "plan": paused["plan"],
                "scores": paused["scores"],
                "merchantCarts": paused.get("carts", []),
            },
            indent=2,
        )
    )
    if not approve:
        return
    finished = await graph.ainvoke(
        Command(resume={"action": "approve", "signature": "demo-handshake"}), config
    )
    print(
        json.dumps(
            {
                "stage": "approved",
                "receipt": finished["receipt"],
                "note": "Plan approved; no reservation or payment was submitted.",
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--approve", action="store_true", help="Approve after the interrupt")
    asyncio.run(run(approve=parser.parse_args().approve))
