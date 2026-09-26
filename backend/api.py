"""HTTP boundary for starting and resuming council graph runs.

The API has two lifecycle operations:

``POST /runs``
    Starts a new mission. A successful run normally returns ``interrupted``
    because it has reached the human mandate.

``POST /runs/resume``
    Resumes the exact checkpoint identified by ``threadId`` with the Leap
    Motion approval/rejection payload.

Private profile and catalog data remain inside graph state and are intentionally
removed from API responses by :func:`_response`.
"""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from langgraph.types import Command
from pydantic import BaseModel, Field

from .agent import graph
from .models import Mission

app = FastAPI(title="Affinity Agent API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class StartRunRequest(BaseModel):
    """Request body for a new council run."""

    mission: Mission
    # The client may supply a stable ID; otherwise the API creates one.
    threadId: str = Field(default_factory=lambda: str(uuid4()))


class ResumeRunRequest(BaseModel):
    """Gesture result used to resume a paused mandate node."""

    threadId: str
    approve: bool
    signature: str | None = None
    itemId: str | None = None


def _config(thread_id: str) -> dict[str, dict[str, str]]:
    """Build the LangGraph config that selects one checkpointed thread."""
    return {"configurable": {"thread_id": thread_id}}


def _response(thread_id: str, result: dict[str, Any]) -> dict[str, Any]:
    """Convert raw graph state into the smaller frontend response contract."""
    interrupts = [
        {"id": item.id, "value": item.value, "responseSchema": item.response_schema}
        for item in result.get("__interrupt__", ())
    ]
    public_keys = (
        "mission",
        "opinions",
        "constraints",
        "bundle",
        "scores",
        "revisionCount",
        "mandateDecision",
        "receipt",
    )
    return {
        "threadId": thread_id,
        "status": "interrupted" if interrupts else "complete",
        "interrupts": interrupts,
        "state": {key: result[key] for key in public_keys if key in result},
    }


@app.get("/health")
async def health() -> dict[str, str]:
    """Return a dependency-free liveness response."""
    return {"status": "ok"}


@app.post("/runs")
async def start_run(request: StartRunRequest) -> dict[str, Any]:
    """Execute a mission until completion or the mandate interrupt."""
    try:
        result = await graph.ainvoke({"mission": request.mission}, _config(request.threadId))
        return _response(request.threadId, result)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/runs/resume")
async def resume_run(request: ResumeRunRequest) -> dict[str, Any]:
    """Resume the checkpoint belonging to ``threadId`` with a hand decision."""
    decision = {
        "approve": request.approve,
        **({"signature": request.signature} if request.signature is not None else {}),
        **({"itemId": request.itemId} if request.itemId is not None else {}),
    }
    try:
        result = await graph.ainvoke(Command(resume=decision), _config(request.threadId))
        return _response(request.threadId, result)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
