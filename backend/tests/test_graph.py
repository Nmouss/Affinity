"""End-to-end tests for routing, reducers, and human-in-the-loop behavior."""

import asyncio

from langgraph.types import Command

from backend.agent import build_graph
from backend.nodes import decide_revision_node


MISSION = {
    "occasion": "Christmas",
    "budget": 200,
    "freeText": "A family tree",
    "type": "shared",
    "invitedSpriteIds": ["wife", "daughter", "son"],
}


def test_graph_fans_out_merges_and_interrupts_for_mandate() -> None:
    """A full mission reaches the mandate with every parallel result merged."""
    graph = build_graph()
    config = {"configurable": {"thread_id": "test-run"}}

    result = asyncio.run(graph.ainvoke({"mission": MISSION}, config))

    assert len(result["opinions"]) == 3
    assert len(result["scores"]) == 3
    assert result["bundle"]["total"] <= MISSION["budget"]
    tree = next(item for item in result["bundle"]["items"] if item["slot"] == "tree")
    assert tree["heightIn"] <= 48
    assert result["__interrupt__"][0].value["requiredGesture"] == "handshake"

    finished = asyncio.run(
        graph.ainvoke(Command(resume={"approve": True, "signature": "test-signature"}), config)
    )
    assert finished["receipt"]["status"] == "approved"


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


def test_revision_loop_is_capped_at_two() -> None:
    """Low scores may revise twice but can never create an infinite loop."""
    base_state = {
        "mission": MISSION,
        "scores": [
            {"spriteId": "wife", "score": 8, "say": "Good"},
            {"spriteId": "daughter", "score": 5, "say": "Not yet", "complaint": "More dolls"},
            {"spriteId": "son", "score": 7, "say": "Good"},
        ],
    }

    first = decide_revision_node({**base_state, "revisionCount": 0})
    final = decide_revision_node({**base_state, "revisionCount": 2})

    assert first["route"] == "revise"
    assert first["revisionCount"] == 1
    assert first["revisionConstraints"] == ["More dolls"]
    assert final["route"] == "mandate"
