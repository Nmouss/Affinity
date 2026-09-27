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

import json
import os
import re
from typing import Any, Literal
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.responses import Response
import httpx
from langgraph.types import Command
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# Local development reads server-only credentials before constructing graph
# dependencies. Deployed environments can inject the same variables normally.
load_dotenv()

from .agent import graph
from .models import FamilyProfile, Mission

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
    # Callers can provide any number of profiles. These overlay the bundled
    # demo fixtures by ID, so the graph is not limited to a fixed family size.
    profiles: list[FamilyProfile] = Field(default_factory=list)
    # The client may supply a stable ID; otherwise the API creates one.
    threadId: str = Field(default_factory=lambda: str(uuid4()))


class ResumeRunRequest(BaseModel):
    """Gesture result used to resume a paused mandate node."""

    threadId: str
    action: Literal["approve", "reject", "replace_agent"] | None = None
    approve: bool | None = None
    signature: str | None = None
    itemId: str | None = None
    prompt: str | None = None


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
        "deliberations",
        "constraints",
        "searchPlan",
        "bundle",
        "plan",
        "scores",
        "revisionCount",
        "mandateDecision",
        "repairRequest",
        "rejectedCandidateIds",
        "preflightChanges",
        "preflightStatus",
        "receipt",
        "carts",
        "notifications",
    )
    return {
        "threadId": thread_id,
        "status": "interrupted" if interrupts else "complete",
        "interrupts": interrupts,
        "state": {key: result[key] for key in public_keys if key in result},
    }


def _sse(event: str, payload: Any) -> str:
    """Encode one JSON payload as a Server-Sent Event frame."""
    return f"event: {event}\ndata: {json.dumps(payload, separators=(',', ':'), default=str)}\n\n"


async def _stream_execution(input_value: Any, thread_id: str):
    """Stream custom node events, followed by the checkpointed public state."""
    config = _config(thread_id)
    try:
        async for item in graph.astream(input_value, config, stream_mode="custom"):
            if isinstance(item, dict) and item.get("type"):
                yield _sse(str(item["type"]), item.get("payload"))
        snapshot = await graph.aget_state(config)
        result = dict(snapshot.values)
        if snapshot.interrupts:
            result["__interrupt__"] = snapshot.interrupts
        yield _sse("run_state", _response(thread_id, result))
    except ValueError as error:
        yield _sse("error", {"detail": str(error), "status": 422})
    except Exception:
        # Provider exceptions should be useful to the UI without leaking API
        # keys, SMTP credentials, or internal tracebacks into the event stream.
        yield _sse("error", {"detail": "Council execution failed", "status": 500})


@app.get("/health")
async def health() -> dict[str, str]:
    """Return a dependency-free liveness response."""
    return {"status": "ok"}


@app.get("/places/photo")
async def place_photo(name: str, max_width: int = 640) -> Response:
    """Proxy one short-lived Google Place photo without exposing the server API key."""
    if not re.fullmatch(r"places/[^/]+/photos/[^/]+", name):
        raise HTTPException(status_code=400, detail="Invalid Google Place photo name")
    api_key = os.getenv("GOOGLE_PLACES_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Google Places is not configured")
    width = max(1, min(max_width, 1600))
    url = f"https://places.googleapis.com/v1/{name}/media"
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            upstream = await client.get(url, params={"key": api_key, "maxWidthPx": width})
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail="Place photo unavailable") from error
    if upstream.is_error:
        raise HTTPException(status_code=upstream.status_code, detail="Place photo unavailable")
    return Response(
        content=upstream.content,
        media_type=upstream.headers.get("content-type", "image/jpeg"),
        headers={"Cache-Control": "private, no-store"},
    )


@app.post("/runs")
async def start_run(request: StartRunRequest) -> dict[str, Any]:
    """Execute a mission until completion or the mandate interrupt."""
    try:
        supplied_profiles = {profile["id"]: profile for profile in request.profiles}
        result = await graph.ainvoke(
            {"mission": request.mission, "profiles": supplied_profiles},
            _config(request.threadId),
        )
        return _response(request.threadId, result)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/runs/stream")
async def stream_run(request: StartRunRequest) -> StreamingResponse:
    """Start a mission and emit each council step as an SSE event."""
    supplied_profiles = {profile["id"]: profile for profile in request.profiles}
    return StreamingResponse(
        _stream_execution(
            {"mission": request.mission, "profiles": supplied_profiles},
            request.threadId,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )


@app.post("/runs/resume")
async def resume_run(request: ResumeRunRequest) -> dict[str, Any]:
    """Resume the checkpoint belonging to ``threadId`` with a hand decision."""
    action = request.action or (
        "approve" if request.approve is True else "reject" if request.approve is False else None
    )
    if action is None:
        raise HTTPException(status_code=422, detail="Provide action or approve")
    decision = {
        "action": action,
        "approve": action == "approve",
        **({"signature": request.signature} if request.signature is not None else {}),
        **({"itemId": request.itemId} if request.itemId is not None else {}),
        **({"prompt": request.prompt} if request.prompt is not None else {}),
    }
    try:
        result = await graph.ainvoke(Command(resume=decision), _config(request.threadId))
        return _response(request.threadId, result)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/runs/resume/stream")
async def stream_resume(request: ResumeRunRequest) -> StreamingResponse:
    """Resume a mandate and stream receipt plus post-approval side effects."""
    action = request.action or (
        "approve" if request.approve is True else "reject" if request.approve is False else None
    )
    if action is None:
        raise HTTPException(status_code=422, detail="Provide action or approve")
    decision = {
        "action": action,
        "approve": action == "approve",
        **({"signature": request.signature} if request.signature is not None else {}),
        **({"itemId": request.itemId} if request.itemId is not None else {}),
        **({"prompt": request.prompt} if request.prompt is not None else {}),
    }
    return StreamingResponse(
        _stream_execution(Command(resume=decision), request.threadId),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )
