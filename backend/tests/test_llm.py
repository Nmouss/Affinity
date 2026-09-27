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
    assert "gym" in opinion["wishes"]
    assert "cozy glow" in opinion["wishes"]


def _uninterviewed_profile() -> dict:
    """A freshly made People Maker character: no preferences yet."""
    return {
        "id": "newbie",
        "name": "Sam",
        "relationship": "friend",
        "look": "custom",
        "colors": ["#e0312b", "#f7d63a"],
        "personality": [],
        "loves": [],
        "avoids": [],
        "houseRules": [],
    }


def test_demo_branches_survive_a_person_with_no_preferences(monkeypatch) -> None:
    """New characters used to raise IndexError on loves[0] in every demo branch."""
    from backend.llm import create_sprite_deliberation, score_bundle

    monkeypatch.setenv("DEMO_MODE", "true")
    profile = _uninterviewed_profile()
    mission = {"occasion": "Christmas", "budget": 60, "freeText": "gift", "type": "gift", "invitedSpriteIds": ["newbie"], "recipientId": "newbie"}

    opinion = asyncio.run(create_sprite_opinion(profile, mission))
    assert opinion["spriteId"] == "newbie"
    assert opinion["wishes"] == []
    assert "something we would all enjoy" in opinion["say"]

    alone = asyncio.run(create_sprite_deliberation(profile, mission, [opinion], {"hardRules": [], "wishes": [], "conflicts": []}))
    assert alone["spriteId"] == "newbie"
    assert alone["compromiseWishes"] or alone["say"]

    other = {"spriteId": "wife", "say": "Warm.", "hardRules": [], "wishes": [], "vetoes": []}
    with_other = asyncio.run(create_sprite_deliberation(profile, mission, [opinion, other], {"hardRules": [], "wishes": [], "conflicts": []}))
    assert with_other["replyToSpriteIds"] == ["wife"]

    bundle = {"items": [{"id": "x", "slot": "gift", "name": "Scarf", "price": 20, "tags": ["warm"]}], "total": 20, "serves": {}}
    score = asyncio.run(score_bundle(profile, mission, bundle))
    assert score["score"] == 4.0
    assert "something we would all enjoy" in score["complaint"]
