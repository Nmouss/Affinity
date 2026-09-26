"""Public package interface for Affinity's Python agent backend.

Import ``graph`` when an application needs the shared compiled graph, or call
``build_graph`` when a test or worker needs an isolated graph/checkpointer.
"""

from .agent import build_graph, graph

__all__ = ["build_graph", "graph"]
