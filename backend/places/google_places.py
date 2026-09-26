"""Async adapter for Google Places API (New) Text Search.

The adapter requests only fields used by Affinity. Search is read-only: it can
surface websites and Google Maps links, but it never claims or books a table.
"""

from __future__ import annotations

import os
from typing import Any

import httpx


TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
TEXT_SEARCH_FIELD_MASK = ",".join(
    (
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.location",
        "places.rating",
        "places.userRatingCount",
        "places.priceLevel",
        "places.types",
        "places.primaryType",
        "places.googleMapsUri",
        "places.websiteUri",
        "places.currentOpeningHours.openNow",
        "places.businessStatus",
        "places.reservable",
    )
)


class GooglePlacesError(RuntimeError):
    """Raised for safe, key-free Google Places transport and API errors."""


class GooglePlacesClient:
    """Search real restaurants and activities with Places API (New)."""

    def __init__(self, *, api_key: str | None = None, timeout_seconds: float = 30.0) -> None:
        self.api_key = api_key if api_key is not None else os.getenv("GOOGLE_PLACES_API_KEY")
        self.timeout_seconds = timeout_seconds

    async def search_text(
        self,
        query: str,
        *,
        included_type: str | None = None,
        min_rating: float | None = None,
        open_now: bool | None = None,
        price_levels: list[str] | None = None,
        latitude: float | None = None,
        longitude: float | None = None,
        radius_meters: float = 8000,
        page_size: int = 10,
        language_code: str = "en",
        region_code: str = "US",
    ) -> list[dict[str, Any]]:
        """Return a page of Text Search results matching explicit filters."""
        if not self.api_key:
            raise GooglePlacesError("GOOGLE_PLACES_API_KEY is not configured")
        body: dict[str, Any] = {
            "textQuery": query,
            "pageSize": max(1, min(int(page_size), 20)),
            "languageCode": language_code,
            "regionCode": region_code,
        }
        if included_type:
            body["includedType"] = included_type
        if min_rating is not None:
            body["minRating"] = max(0.0, min(float(min_rating), 5.0))
        if open_now is not None:
            body["openNow"] = bool(open_now)
        if price_levels:
            body["priceLevels"] = price_levels
        if latitude is not None and longitude is not None:
            body["locationBias"] = {
                "circle": {
                    "center": {"latitude": float(latitude), "longitude": float(longitude)},
                    "radius": max(1.0, min(float(radius_meters), 50000.0)),
                }
            }

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(self.timeout_seconds)) as client:
                response = await client.post(
                    TEXT_SEARCH_URL,
                    headers={
                        "Content-Type": "application/json",
                        "X-Goog-Api-Key": self.api_key,
                        "X-Goog-FieldMask": TEXT_SEARCH_FIELD_MASK,
                    },
                    json=body,
                )
        except httpx.HTTPError as error:
            raise GooglePlacesError(
                f"Google Places search transport failed: {error.__class__.__name__}"
            ) from error
        if response.is_error:
            try:
                payload = response.json()
                message = payload.get("error", {}).get("message", "request failed")
            except (ValueError, AttributeError):
                message = "request failed"
            raise GooglePlacesError(
                f"Google Places search failed with HTTP {response.status_code}: {message}"
            )
        payload = response.json()
        return [place for place in payload.get("places", []) if isinstance(place, dict)]
