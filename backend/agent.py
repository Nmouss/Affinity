"""Construct the Affinity LangGraph state machine.

This module is deliberately small: node behavior lives in :mod:`backend.nodes`,
state contracts live in :mod:`backend.models`, and this file only describes how
execution moves between nodes.

Graph shape::

    START -> intake -> sprite_opinion × N -> merge -> shop
          -> sprite_score × N -> decide_revision
          -> shop (revise) OR human_mandate -> END

The two ``× N`` stages are dynamic parallel fan-outs created with ``Send`` in
``nodes.py``. The mandate node pauses through ``interrupt()``, so compilation
requires a checkpointer.
"""

from __future__ import annotations

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph

from .models import CouncilState
from .nodes import (
    decide_revision_node,
    fan_out_opinions,
    fan_out_scores,
    human_mandate_node,
    intake_node,
    merge_node,
    route_after_scores,
    shop_node,
    sprite_opinion_node,
    sprite_score_node,
)


def build_graph(*, checkpointer=None):
    """Compile and return Affinity's fan-out/fan-in council graph.

    Args:
        checkpointer: Optional LangGraph checkpointer. Tests normally allow the
            default in-memory saver; production should inject durable storage.

    Returns:
        A compiled graph supporting ``invoke``/``ainvoke`` and resumable
        ``interrupt`` calls.
    """
    builder = StateGraph(CouncilState)
    builder.add_node("intake", intake_node)
    builder.add_node("sprite_opinion", sprite_opinion_node)
    builder.add_node("merge", merge_node)
    builder.add_node("shop", shop_node)
    builder.add_node("sprite_score", sprite_score_node)
    builder.add_node("decide_revision", decide_revision_node)
    builder.add_node("human_mandate", human_mandate_node)

    # Phase 1: validate the mission, then create one opinion task per sprite.
    builder.add_edge(START, "intake")
    builder.add_conditional_edges("intake", fan_out_opinions, ["sprite_opinion"])
    # LangGraph treats the Send tasks as one parallel superstep. Their reducer
    # writes are combined before the single downstream merge runs.
    builder.add_edge("sprite_opinion", "merge")
    builder.add_edge("merge", "shop")
    # Phase 2: score the same proposed bundle independently in parallel.
    builder.add_conditional_edges("shop", fan_out_scores, ["sprite_score"])
    builder.add_edge("sprite_score", "decide_revision")
    # Low satisfaction revisits shop at most twice; all other cases need the
    # physical human authorization checkpoint.
    builder.add_conditional_edges(
        "decide_revision",
        route_after_scores,
        {"revise": "shop", "mandate": "human_mandate"},
    )
    builder.add_edge("human_mandate", END)
    return builder.compile(checkpointer=checkpointer or InMemorySaver())


# Shared application instance used by FastAPI. Its InMemorySaver associates
# interrupted runs with the ``thread_id`` passed by the client.
graph = build_graph()
