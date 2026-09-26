"""Run a safe live Affinity demo: search, review, interrupt, then optional cart.

Usage:
    python -m backend.demo_shopify
    python -m backend.demo_shopify --approve

The approved path creates a non-purchasing Shopify cart and prints its handoff
URL. It never submits checkout or payment.
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
        "avoids": ["mini novelty balls"],
        "houseRules": [],
    }


async def run(*, approve: bool) -> None:
    """Execute a four-profile basketball mission through the real graph."""
    graph = build_graph()
    thread_id = f"shopify-demo-{uuid4()}"
    profiles = {
        profile["id"]: profile
        for profile in [
            _profile("player", "Player", ["durable full-size basketball", "good grip"]),
            _profile("coach", "Coach", ["official size 7 basketball", "indoor outdoor use"]),
            _profile("parent", "Parent", ["basketball under twenty dollars", "good value"]),
            _profile("judge", "Guest Judge", ["recognizable basketball brand", "clean design"]),
        ]
    }
    mission = {
        "occasion": "Pickup basketball",
        "budget": 20,
        "freeText": "Agree on one full-size basketball for the group",
        "type": "shared",
        "invitedSpriteIds": list(profiles),
        "shoppingSlots": [
            {"id": "ball", "query": "full size basketball under 20 dollars", "quantity": 1}
        ],
    }
    config = {"configurable": {"thread_id": thread_id}}
    paused = await graph.ainvoke({"mission": mission, "profiles": profiles}, config)
    summary = {
        "threadId": thread_id,
        "stage": "awaiting_mandate",
        "profileCount": len(profiles),
        "opinionCount": len(paused["opinions"]),
        "scoreCount": len(paused["scores"]),
        "revisionCount": paused["revisionCount"],
        "bundle": {
            "source": paused["bundle"].get("source"),
            "total": paused["bundle"]["total"],
            "items": [
                {
                    "name": item["name"],
                    "price": item["price"],
                    "currency": item.get("currency", "USD"),
                    "merchant": item.get("merchantName"),
                }
                for item in paused["bundle"]["items"]
            ],
        },
        "scores": paused["scores"],
        "merchantCartsBeforeApproval": paused.get("carts", []),
    }
    print(json.dumps(summary, indent=2))

    if not approve:
        return
    finished = await graph.ainvoke(
        Command(resume={"action": "approve", "signature": "demo-handshake-1"}), config
    )
    approval_round = 1
    while finished.get("__interrupt__") and approval_round < 3:
        approval_round += 1
        print(
            json.dumps(
                {
                    "stage": "updated_proposal_requires_fresh_consent",
                    "approvalRound": approval_round,
                    "preflightChanges": finished.get("preflightChanges", []),
                    "bundle": finished.get("bundle"),
                },
                indent=2,
            )
        )
        finished = await graph.ainvoke(
            Command(
                resume={
                    "action": "approve",
                    "signature": f"demo-handshake-{approval_round}",
                }
            ),
            config,
        )
    if "receipt" not in finished:
        raise RuntimeError("Smoke test did not finalize after three approval rounds")
    print(
        json.dumps(
            {
                "stage": "approved",
                "receipt": finished["receipt"],
                "carts": finished.get("carts", []),
                "approvalRounds": approval_round,
                "note": "Cart created; checkout and payment were not submitted.",
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--approve", action="store_true", help="Create a cart after the interrupt")
    asyncio.run(run(approve=parser.parse_args().approve))
