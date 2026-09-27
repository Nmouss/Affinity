"""End-to-end tests for routing, reducers, and human-in-the-loop behavior."""

import asyncio

from langgraph.types import Command

from backend.agent import build_graph
from backend.nodes import decide_revision_node, proposal_repair_node


MISSION = {
    "occasion": "Birthday",
    "budget": 200,
    "freeText": "A thoughtful shared gift",
    "type": "shared",
    "invitedSpriteIds": ["wife", "daughter", "son"],
    "shoppingSlots": [
        {"id": "centerpiece", "query": "main gift"},
        {"id": "wrapping", "query": "gift wrapping"},
        {"id": "card", "query": "birthday card"},
        {"id": "extra", "query": "small extra gift"},
    ],
}


def test_graph_fans_out_merges_and_interrupts_for_mandate() -> None:
    """A full mission reaches the mandate with every parallel result merged."""
    graph = build_graph()
    config = {"configurable": {"thread_id": "test-run"}}

    result = asyncio.run(graph.ainvoke({"mission": MISSION}, config))

    assert len(result["opinions"]) == 3
    assert len(result["deliberations"]) == 3
    assert len(result["scores"]) == 3
    assert result["bundle"]["total"] <= MISSION["budget"]
    centerpiece = next(item for item in result["bundle"]["items"] if item["slot"] == "centerpiece")
    assert centerpiece["heightIn"] <= 24
    assert result["__interrupt__"][0].value["requiredGesture"] == "handshake"
    assert result["carts"] == []

    finished = asyncio.run(
        graph.ainvoke(Command(resume={"approve": True, "signature": "test-signature"}), config)
    )
    assert finished["receipt"]["status"] == "approved"
    assert finished["carts"] == []


def test_graph_accepts_an_arbitrary_number_of_supplied_profiles() -> None:
    """A fourth runtime profile gets its own opinion and scoring branches."""
    graph = build_graph()
    config = {"configurable": {"thread_id": "four-profile-run"}}
    guest = {
        "id": "judge",
        "name": "Guest Judge",
        "relationship": "guest",
        "look": "Gold jacket",
        "colors": ["gold"],
        "personality": ["thoughtful"],
        "loves": ["warm lights"],
        "avoids": ["clutter"],
        "houseRules": [],
    }
    mission = {**MISSION, "invitedSpriteIds": [*MISSION["invitedSpriteIds"], "judge"]}

    result = asyncio.run(
        graph.ainvoke({"mission": mission, "profiles": {"judge": guest}}, config)
    )

    assert {item["spriteId"] for item in result["opinions"]} == set(
        mission["invitedSpriteIds"]
    )
    assert {item["spriteId"] for item in result["scores"]} == set(mission["invitedSpriteIds"])


def test_graph_streams_visible_council_conversation(monkeypatch) -> None:
    """Opinions and replies arrive as events before the final mandate."""
    monkeypatch.setenv("DEMO_MODE", "true")
    monkeypatch.setenv("AFFINITY_PRODUCT_PROVIDER", "local")
    graph = build_graph()
    config = {"configurable": {"thread_id": "streamed-council"}}

    async def collect():
        return [
            event
            async for event in graph.astream(
                {"mission": MISSION}, config, stream_mode="custom"
            )
        ]

    events = asyncio.run(collect())
    types = [event["type"] for event in events]

    assert types.count("opinion") == 3
    assert types.count("deliberation") == 3
    # One bounded retry produces at most a second score round, never an
    # open-ended series that looks infinite in the UI.
    assert types.count("score") == 6
    assert types.index("constraints") < types.index("deliberation")
    assert types[-1] == "awaiting_mandate"


def test_reject_requires_an_item_id() -> None:
    """A rejection identifies what the shopper would need to replace."""
    graph = build_graph()
    config = {"configurable": {"thread_id": "reject-run"}}
    asyncio.run(graph.ainvoke({"mission": MISSION}, config))

    try:
        asyncio.run(graph.ainvoke(Command(resume={"approve": False}), config))
    except ValueError as error:
        assert "itemId" in str(error)
    else:
        raise AssertionError("A rejection without an itemId should fail")


def test_rejected_item_can_be_replaced_with_a_human_prompt() -> None:
    """A human prompt guides targeted search while the same run remains active."""
    graph = build_graph()
    config = {"configurable": {"thread_id": "repair-run"}}
    paused = asyncio.run(graph.ainvoke({"mission": MISSION}, config))
    rejected = next(item for item in paused["bundle"]["items"] if item["slot"] == "wrapping")

    repaired = asyncio.run(
        graph.ainvoke(
            Command(
                resume={
                    "action": "replace_agent",
                    "itemId": rejected["id"],
                    "prompt": "Choose a calmer alternative with a soft glow",
                }
            ),
            config,
        )
    )

    assert repaired["__interrupt__"]
    assert rejected["id"] not in {item["id"] for item in repaired["bundle"]["items"]}
    assert rejected["id"] in repaired["rejectedCandidateIds"]
    assert any(
        "calmer alternative" in query
        for slot in repaired["searchPlan"]["slots"]
        if slot["slotId"] == "wrapping"
        for query in slot["queries"]
    )
    assert all(item.get("selectedBecause") for item in repaired["bundle"]["items"])


def test_replacement_without_prompt_generates_autonomous_guidance() -> None:
    """The repair node can formulate its own replacement request."""
    result = proposal_repair_node(
        {
            "mission": MISSION,
            "bundle": {
                "items": [
                    {
                        "id": "wrap-simple",
                        "slot": "wrapping",
                        "name": "Kraft paper and twine",
                        "price": 18,
                        "tags": ["warm"],
                    }
                ],
                "total": 18,
                "serves": {},
            },
            "mandateDecision": {
                "action": "replace_agent",
                "itemId": "wrap-simple",
            },
            "rejectedCandidateIds": [],
        }
    )

    assert result["repairRequest"]["autonomous"] is True
    assert "different wrapping option" in result["repairRequest"]["prompt"]


def test_revision_loop_is_capped_at_one() -> None:
    """Low scores may revise once but can never create an infinite loop."""
    base_state = {
        "mission": MISSION,
        "scores": [
            {"spriteId": "wife", "score": 8, "say": "Good"},
            {"spriteId": "daughter", "score": 5, "say": "Not yet", "complaint": "More dolls"},
            {"spriteId": "son", "score": 7, "say": "Good"},
        ],
    }

    first = decide_revision_node({**base_state, "revisionCount": 0})
    final = decide_revision_node({**base_state, "revisionCount": 1})

    assert first["route"] == "revise"
    assert first["revisionCount"] == 1
    assert first["revisionConstraints"] == ["More dolls"]
    assert final["route"] == "mandate"
