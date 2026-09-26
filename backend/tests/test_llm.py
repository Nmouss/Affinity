"""Contract tests for live-model adapter paths without network calls."""

import asyncio

from backend.data import load_profiles
from backend.llm import create_sprite_opinion


def test_live_opinion_adapter_returns_structured_profile_data(monkeypatch) -> None:
    """The non-demo branch must return an opinion rather than a raw model value."""
    class Result:
        say = "I prefer warm lights."
        wishes = ["cozy glow"]
        vetoes = ["flashing lights"]

    class Structured:
        async def ainvoke(self, prompt):
            return Result()

    class Model:
        def with_structured_output(self, schema, method):
            return Structured()

    monkeypatch.setenv("DEMO_MODE", "false")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr("backend.llm._model", lambda name: Model())
    mission = {
        "occasion": "Christmas",
        "budget": 200,
        "freeText": "Tree",
        "type": "shared",
        "invitedSpriteIds": ["wife"],
    }

    opinion = asyncio.run(create_sprite_opinion(load_profiles()["wife"], mission))

    assert opinion["spriteId"] == "wife"
    assert opinion["say"] == "I prefer warm lights."
    assert "white and gold decor" in opinion["wishes"]
    assert "cozy glow" in opinion["wishes"]
