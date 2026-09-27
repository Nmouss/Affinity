"""The People Maker interview: extraction endpoint and phrase normalization."""

import asyncio

from fastapi.testclient import TestClient

from backend.api import app
from backend.llm import ExtractionUnavailable, _normalize_phrases, extract_preferences

ANSWERS = [
    {"questionId": "weekend", "question": "What did you get up to last weekend?", "answer": "Went hiking then cooked."},
    {"questionId": "never", "question": "What's one thing you'd never spend money on?", "answer": "Designer handbags."},
]


def test_normalize_phrases_lowercases_dedupes_and_caps() -> None:
    items = ["Hiking", " hiking. ", "'Video Games'", "a very long noun phrase here", "", "Cooking with friends 🍳", "Books"]
    assert _normalize_phrases(items, cap=3) == ["hiking", "video games", "cooking with friends"]
    assert _normalize_phrases(["Outdoorsy", "very curious"], cap=3, max_words=1) == ["outdoorsy"]


def test_demo_mode_raises_so_the_route_answers_503(monkeypatch) -> None:
    monkeypatch.setenv("DEMO_MODE", "true")
    try:
        asyncio.run(extract_preferences("Ava", ANSWERS))
    except ExtractionUnavailable:
        pass
    else:
        raise AssertionError("demo mode must not call a model")

    client = TestClient(app)
    response = client.post("/interview/extract", json={"name": "Ava", "answers": ANSWERS})
    assert response.status_code == 503
    assert response.json()["detail"] == "Live extraction is off"


def test_live_extraction_returns_normalized_preferences(monkeypatch) -> None:
    class Result:
        loves = ["Hiking", "hiking", "Cooking ✨", "Board Games", "reading", "travel", "coffee", "music"]
        avoids = ["Designer Handbags.", "designer handbags"]
        personality = ["Outdoorsy", "very social", "Curious", "thrifty"]
        summary = "Ava is into hiking and cooking 🎉, and steers clear of designer handbags."

    class Structured:
        def __init__(self) -> None:
            self.prompt = None

        async def ainvoke(self, prompt):
            self.prompt = prompt
            return Result()

    structured = Structured()

    class Model:
        def with_structured_output(self, schema, method):
            assert schema.__name__ == "PreferencesOutput"
            assert method == "function_calling"
            return structured

    monkeypatch.setenv("DEMO_MODE", "false")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr("backend.llm._model", lambda name: Model())

    result = asyncio.run(extract_preferences("Ava", ANSWERS))

    assert result["loves"] == ["hiking", "cooking", "board games", "reading", "travel", "coffee"]
    assert result["avoids"] == ["designer handbags"]
    assert result["personality"] == ["outdoorsy", "curious", "thrifty"]
    assert result["summary"] == "Ava is into hiking and cooking , and steers clear of designer handbags."
    assert "🎉" not in result["summary"]
    assert result["source"] == "llm"
    assert "Ava" in structured.prompt and "hiking" in structured.prompt


def test_route_returns_live_result_and_rejects_bad_bodies(monkeypatch) -> None:
    async def fake_extract(name, answers):
        return {"loves": ["hiking"], "avoids": [], "personality": ["outdoorsy"], "summary": f"{name} hikes.", "source": "llm"}

    monkeypatch.setattr("backend.api.extract_preferences", fake_extract)
    client = TestClient(app)

    ok = client.post("/interview/extract", json={"name": "Ava", "answers": ANSWERS})
    assert ok.status_code == 200
    assert ok.json()["loves"] == ["hiking"]

    missing_name = client.post("/interview/extract", json={"answers": ANSWERS})
    assert missing_name.status_code == 422

    too_many = client.post("/interview/extract", json={"name": "Ava", "answers": ANSWERS * 4})
    assert too_many.status_code == 422


def test_route_hides_provider_failures(monkeypatch) -> None:
    async def broken(name, answers):
        raise RuntimeError("sk-secret leaked in a traceback")

    monkeypatch.setattr("backend.api.extract_preferences", broken)
    response = TestClient(app).post("/interview/extract", json={"name": "Ava", "answers": ANSWERS})
    assert response.status_code == 502
    assert response.json() == {"detail": "Extraction failed"}
