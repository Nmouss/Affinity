"""Plan-node tests use Google-shaped fixtures without consuming API quota."""

import asyncio

from langgraph.types import Command

from backend.agent import build_graph
from backend.data import load_profiles


async def _fake_search(self, query, **kwargs):
    if "dinner" in query:
        return [
            {
                "id": "dinner-1",
                "displayName": {"text": "Garden Table"},
                "formattedAddress": "1 Peachtree St, Atlanta, GA",
                "rating": 4.6,
                "userRatingCount": 450,
                "priceLevel": "PRICE_LEVEL_MODERATE",
                "types": ["restaurant", "vegetarian_restaurant"],
                "businessStatus": "OPERATIONAL",
                "googleMapsUri": "https://maps.google.com/?cid=dinner-1",
                "websiteUri": "https://garden.example",
                "reservable": True,
                "photos": [
                    {
                        "name": "places/dinner-1/photos/photo-1",
                        "authorAttributions": [{"displayName": "Demo Photographer", "uri": "https://example.com/credit"}],
                    }
                ],
            }
        ]
    return [
        {
            "id": "activity-1",
            "displayName": {"text": "Neon Bowling"},
            "formattedAddress": "2 Techwood Dr, Atlanta, GA",
            "rating": 4.4,
            "userRatingCount": 800,
            "priceLevel": "PRICE_LEVEL_INEXPENSIVE",
            "types": ["bowling_alley", "sports_activity_location"],
            "businessStatus": "OPERATIONAL",
            "googleMapsUri": "https://maps.google.com/?cid=activity-1",
            "websiteUri": "https://bowling.example",
        }
    ]


def test_plan_graph_searches_scores_and_interrupts(monkeypatch) -> None:
    """A multi-stop plan uses the same council and mandate lifecycle."""
    monkeypatch.setenv("AFFINITY_PLACE_PROVIDER", "google_places")
    monkeypatch.setenv("AFFINITY_EMAIL_PROVIDER", "smtp")
    monkeypatch.setenv("DEMO_MODE", "true")
    monkeypatch.setattr("backend.nodes.GooglePlacesClient.search_text", _fake_search)
    sent = []

    async def fake_send(self, **kwargs):
        sent.append(kwargs)
        return kwargs["message_id"]

    monkeypatch.setattr("backend.nodes.SmtpEmailSender.send_plan", fake_send)
    graph = build_graph()
    config = {"configurable": {"thread_id": "place-plan"}}
    mission = {
        "kind": "plan",
        "occasion": "Family night",
        "budget": 150,
        "freeText": "Dinner and an activity",
        "type": "shared",
        "invitedSpriteIds": ["wife"],
        "location": {"label": "Midtown Atlanta"},
        "when": "Saturday at 6 PM",
        "planSlots": [
            {
                "id": "dinner",
                "query": "vegetarian dinner",
                "includedType": "restaurant",
                "minRating": 4,
                "priceLevels": ["$$"],
            },
            {"id": "activity", "query": "family activity", "minRating": 4},
        ],
    }

    wife = {**load_profiles()["wife"], "email": "maya@example.com"}
    paused = asyncio.run(graph.ainvoke({"mission": mission, "profiles": {"wife": wife}}, config))

    assert [stop["slot"] for stop in paused["plan"]["stops"]] == ["dinner", "activity"]
    assert paused["plan"]["source"] == "google_places"
    assert paused["plan"]["stops"][0]["photoName"] == "places/dinner-1/photos/photo-1"
    assert paused["plan"]["stops"][0]["photoAttributions"][0]["displayName"] == "Demo Photographer"
    assert paused["__interrupt__"][0].value["type"] == "plan_mandate"
    assert "bundle" not in paused["__interrupt__"][0].value
    assert paused["__interrupt__"][0].value["notificationPreview"] == [
        {"spriteId": "wife", "name": "Nabil", "email": "maya@example.com"}
    ]
    assert sent == []

    finished = asyncio.run(
        graph.ainvoke(Command(resume={"approve": True, "signature": "plan-signature"}), config)
    )
    assert finished["receipt"]["status"] == "approved"
    assert finished["carts"] == []
    assert len(sent) == 1
    assert finished["notifications"][0]["status"] == "sent"
    assert finished["notifications"][0]["email"] == "maya@example.com"
