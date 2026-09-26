"""Construct the Affinity LangGraph state machine.

This module is deliberately small: node behavior lives in :mod:`backend.nodes`,
state contracts live in :mod:`backend.models`, and this file only describes how
execution moves between nodes.

Graph shape::

    START -> intake -> sprite_opinion × N -> merge
          -> sprite_deliberation × N -> reconcile -> search_plan -> shop OR plan
          -> sprite_score × N -> decide_revision
          -> shop/plan (revise) OR human_mandate
          -> repair/search again, preflight/create_carts, notify, OR END

The two ``× N`` stages are dynamic parallel fan-outs created with ``Send`` in
``nodes.py``. The mandate node pauses through ``interrupt()``, so compilation
requires a checkpointer.
"""

from __future__ import annotations

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph

from .models import CouncilState
from .nodes import (
    create_carts_node,
    decide_revision_node,
    fan_out_opinions,
    fan_out_deliberations,
    fan_out_scores,
    finalize_approval_node,
    human_mandate_node,
    intake_node,
    merge_node,
    notify_participants_node,
    plan_node,
    preflight_shopify_node,
    proposal_repair_node,
    route_after_finalization,
    route_after_preflight,
    route_after_merge,
    reconcile_deliberations_node,
    route_after_scores,
    route_after_mandate,
    search_plan_node,
    shop_node,
    sprite_opinion_node,
    sprite_deliberation_node,
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
    builder.add_node("sprite_deliberation", sprite_deliberation_node)
    builder.add_node("reconcile_deliberations", reconcile_deliberations_node)
    builder.add_node("search_plan", search_plan_node)
    builder.add_node("shop", shop_node)
    builder.add_node("plan", plan_node)
    builder.add_node("sprite_score", sprite_score_node)
    builder.add_node("decide_revision", decide_revision_node)
    builder.add_node("human_mandate", human_mandate_node)
    builder.add_node("proposal_repair", proposal_repair_node)
    builder.add_node("preflight_shopify", preflight_shopify_node)
    builder.add_node("finalize_approval", finalize_approval_node)
    builder.add_node("create_carts", create_carts_node)
    builder.add_node("notify_participants", notify_participants_node)

    # Phase 1: validate the mission, then create one opinion task per sprite.
    builder.add_edge(START, "intake")
    builder.add_conditional_edges("intake", fan_out_opinions, ["sprite_opinion"])
    # LangGraph treats the Send tasks as one parallel superstep. Their reducer
    # writes are combined before the single downstream merge runs.
    builder.add_edge("sprite_opinion", "merge")
    builder.add_conditional_edges("merge", fan_out_deliberations, ["sprite_deliberation"])
    builder.add_edge("sprite_deliberation", "reconcile_deliberations")
    builder.add_edge("reconcile_deliberations", "search_plan")
    builder.add_conditional_edges(
        "search_plan",
        route_after_merge,
        {"shop": "shop", "plan": "plan"},
    )
    # Phase 2: score the same proposed bundle independently in parallel.
    builder.add_conditional_edges("shop", fan_out_scores, ["sprite_score"])
    builder.add_conditional_edges("plan", fan_out_scores, ["sprite_score"])
    builder.add_edge("sprite_score", "decide_revision")
    # Low satisfaction revisits shop at most twice; all other cases need the
    # physical human authorization checkpoint.
    builder.add_conditional_edges(
        "decide_revision",
        route_after_scores,
        {"search_plan": "search_plan", "mandate": "human_mandate"},
    )
    builder.add_conditional_edges(
        "human_mandate",
        route_after_mandate,
        {
            "repair": "proposal_repair",
            "preflight": "preflight_shopify",
            "finalize": "finalize_approval",
            "end": END,
        },
    )
    builder.add_edge("proposal_repair", "search_plan")
    builder.add_conditional_edges(
        "preflight_shopify",
        route_after_preflight,
        {
            "repair": "search_plan",
            "mandate": "human_mandate",
            "finalize": "finalize_approval",
        },
    )
    builder.add_conditional_edges(
        "finalize_approval",
        route_after_finalization,
        {
            "create_carts": "create_carts",
            "notify_participants": "notify_participants",
        },
    )
    builder.add_edge("create_carts", END)
    builder.add_edge("notify_participants", END)
    return builder.compile(checkpointer=checkpointer or InMemorySaver())


# Shared application instance used by FastAPI. Its InMemorySaver associates
# interrupted runs with the ``thread_id`` passed by the client.
graph = build_graph()
