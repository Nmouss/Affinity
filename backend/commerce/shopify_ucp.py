"""Small async client for Shopify's UCP Catalog and Cart MCP servers.

The client deliberately exposes explicit operations instead of handing the MCP
server to an LLM. LangGraph nodes can therefore control which commerce side
effects are allowed before and after the human mandate.
"""

from __future__ import annotations

import asyncio
import os
import time
from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

import httpx


class ShopifyUcpError(RuntimeError):
    """Raised when Shopify returns a transport, protocol, or business error."""


def url_host(url: str) -> str:
    """Return only the non-sensitive host portion of an endpoint for errors."""
    return urlparse(url).netloc or "unknown Shopify host"


class ShopifyUcpClient:
    """Call Shopify UCP tools over their JSON-RPC HTTP binding.

    Client credentials are optional for catalog and cart operations. When both
    are configured, a short-lived bearer token is fetched and cached in memory;
    the token is never written to disk.
    """

    def __init__(
        self,
        *,
        catalog_endpoint: str | None = None,
        profile_url: str | None = None,
        client_id: str | None = None,
        client_secret: str | None = None,
        auth_mode: str | None = None,
        timeout_seconds: float = 45.0,
    ) -> None:
        self.catalog_endpoint = catalog_endpoint or os.getenv(
            "SHOPIFY_UCP_CATALOG_ENDPOINT",
            "https://catalog.shopify.com/api/ucp/mcp",
        )
        self.profile_url = profile_url or os.getenv(
            "SHOPIFY_UCP_AGENT_PROFILE_URL",
            "https://shopify.dev/ucp/agent-profiles/examples/2026-08-25/valid-with-capabilities.json",
        )
        self.client_id = client_id if client_id is not None else os.getenv("SHOPIFY_UCP_CLIENT_ID")
        self.client_secret = (
            client_secret if client_secret is not None else os.getenv("SHOPIFY_UCP_CLIENT_SECRET")
        )
        self.auth_mode = (auth_mode or os.getenv("SHOPIFY_UCP_AUTH_MODE", "anonymous")).casefold()
        if self.auth_mode not in {"anonymous", "token"}:
            raise ValueError("SHOPIFY_UCP_AUTH_MODE must be 'anonymous' or 'token'")
        self.timeout_seconds = timeout_seconds
        self._access_token: str | None = None
        self._token_expires_at = 0.0
        self._token_lock = asyncio.Lock()

    async def _get_access_token(self, client: httpx.AsyncClient) -> str | None:
        """Return a cached token or exchange configured client credentials."""
        if self.auth_mode == "anonymous":
            return None
        if not self.client_id or not self.client_secret:
            raise ShopifyUcpError("Token auth requires both Shopify client ID and client secret")
        if self._access_token and time.time() < self._token_expires_at - 60:
            return self._access_token

        async with self._token_lock:
            if self._access_token and time.time() < self._token_expires_at - 60:
                return self._access_token
            response = await client.post(
                "https://api.shopify.com/auth/access_token",
                json={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "grant_type": "client_credentials",
                },
            )
            if response.is_error:
                raise ShopifyUcpError(
                    f"Shopify authentication failed with HTTP {response.status_code}"
                )
            payload = response.json()
            token = payload.get("access_token")
            if not token:
                raise ShopifyUcpError(
                    "Shopify authentication response did not contain an access token"
                )
            self._access_token = str(token)
            self._token_expires_at = time.time() + float(payload.get("expires_in", 3600))
            return self._access_token

    async def _call(
        self,
        *,
        endpoint: str,
        tool: str,
        arguments: dict[str, Any],
    ) -> dict[str, Any]:
        """Call one UCP MCP tool and return its structured content."""
        timeout = httpx.Timeout(self.timeout_seconds)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                token = await self._get_access_token(client)
                headers = {"Content-Type": "application/json"}
                if token:
                    headers["Authorization"] = f"Bearer {token}"

                response = await client.post(
                    endpoint,
                    headers=headers,
                    json={
                        "jsonrpc": "2.0",
                        "method": "tools/call",
                        "id": str(uuid4()),
                        "params": {
                            "name": tool,
                            "arguments": {
                                "meta": {"ucp-agent": {"profile": self.profile_url}},
                                **arguments,
                            },
                        },
                    },
                )
        except httpx.HTTPError as error:
            raise ShopifyUcpError(
                f"Shopify {tool} transport failed for {url_host(endpoint)}: "
                f"{error.__class__.__name__}"
            ) from error
        if response.is_error:
            try:
                detail = response.json().get("error", response.json())
                message = detail.get("message", str(detail)) if isinstance(detail, dict) else str(detail)
            except (ValueError, AttributeError):
                message = response.text[:300]
            raise ShopifyUcpError(
                f"Shopify {tool} failed with HTTP {response.status_code}: {message}"
            )

        payload = response.json()
        if payload.get("error"):
            error = payload["error"]
            raise ShopifyUcpError(
                f"Shopify {tool} protocol error {error.get('code')}: {error.get('message')}"
            )
        structured = payload.get("result", {}).get("structuredContent")
        if not isinstance(structured, dict):
            raise ShopifyUcpError(f"Shopify {tool} response had no structured content")
        return structured

    async def search_catalog(
        self,
        query: str,
        *,
        max_price_cents: int,
        country: str = "US",
        postal_code: str | None = None,
        currency: str = "USD",
        limit: int = 10,
        catalog_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Search available Global Catalog products within a strict price cap."""
        location = {"country": country}
        context: dict[str, Any] = {"address_country": country, "currency": currency}
        if postal_code:
            location["postal_code"] = postal_code
            context["postal_code"] = postal_code
        catalog: dict[str, Any] = {
            "query": query,
            "filters": {
                "available": True,
                "ships_to": location,
                "price": {"max": int(max_price_cents)},
            },
            "context": context,
            "pagination": {"limit": max(1, min(limit, 50))},
        }
        if catalog_id:
            catalog["catalog_id"] = catalog_id
        result = await self._call(
            endpoint=self.catalog_endpoint,
            tool="search_catalog",
            arguments={"catalog": catalog},
        )
        return list(result.get("products", []))

    async def get_product(
        self,
        product_id: str,
        *,
        country: str = "US",
        postal_code: str | None = None,
        currency: str = "USD",
    ) -> dict[str, Any]:
        """Resolve current variants, sellers, prices, and availability."""
        context: dict[str, Any] = {"address_country": country, "currency": currency}
        ships_to = {"country": country}
        if postal_code:
            context["postal_code"] = postal_code
            ships_to["postal_code"] = postal_code
        result = await self._call(
            endpoint=self.catalog_endpoint,
            tool="get_product",
            arguments={
                "catalog": {
                    "id": product_id,
                    "filters": {"available": True, "ships_to": ships_to},
                    "context": context,
                }
            },
        )
        product = result.get("product")
        if not isinstance(product, dict):
            raise ShopifyUcpError(f"Shopify could not resolve product {product_id}")
        return product

    async def create_cart(
        self,
        *,
        merchant_domain: str,
        variant_id: str,
        quantity: int = 1,
        country: str = "US",
        postal_code: str | None = None,
    ) -> dict[str, Any]:
        """Create a one-item, non-purchasing merchant cart."""
        return await self.create_cart_items(
            merchant_domain=merchant_domain,
            line_items=[{"variant_id": variant_id, "quantity": quantity}],
            country=country,
            postal_code=postal_code,
        )

    async def create_cart_items(
        self,
        *,
        merchant_domain: str,
        line_items: list[dict[str, Any]],
        country: str = "US",
        postal_code: str | None = None,
    ) -> dict[str, Any]:
        """Create one cart containing all selected variants for a merchant."""
        context: dict[str, Any] = {"address_country": country}
        if postal_code:
            context["postal_code"] = postal_code
        endpoint = f"https://{merchant_domain.rstrip('/')}/api/ucp/mcp"
        result = await self._call(
            endpoint=endpoint,
            tool="create_cart",
            arguments={
                "cart": {
                    "line_items": [
                        {
                            "quantity": max(1, int(item.get("quantity", 1))),
                            "item": {"id": str(item["variant_id"])},
                        }
                        for item in line_items
                    ],
                    "context": context,
                    "attribution": {
                        "utm_source": "affinity",
                        "utm_medium": "agentic_commerce",
                    },
                }
            },
        )
        # Current merchant implementations exist in both shapes: some wrap the
        # cart in ``structuredContent.cart`` while others return cart fields
        # directly in ``structuredContent``. Normalize both at this boundary.
        cart = result.get("cart")
        if not isinstance(cart, dict) and result.get("id") and result.get("line_items") is not None:
            cart = result
        if not isinstance(cart, dict):
            raise ShopifyUcpError("Shopify create_cart response did not contain a cart")
        return cart
