"""Shopify integration tests use protocol-shaped fakes and never call the network."""

import asyncio

from backend.nodes import create_carts_node, preflight_shopify_node, route_after_preflight, shop_node


def _state():
    return {
        "mission": {
            "occasion": "Pickup basketball",
            "budget": 20,
            "freeText": "A durable basketball",
            "type": "shared",
            "invitedSpriteIds": ["player"],
            "shoppingSlots": [{"id": "ball", "query": "basketball under $20"}],
        },
        "constraints": {
            "hardRules": [{"type": "excludedTag", "tag": "mini", "why": "Full size only"}],
            "wishes": [{"spriteId": "player", "wish": "durable basketball", "weight": 1}],
            "conflicts": [],
        },
        "catalog": [],
        "revisionConstraints": [],
    }


def test_shopify_search_builds_a_code_filtered_bundle(monkeypatch) -> None:
    """Live results are normalized, filtered, and kept under the mission budget."""
    async def fake_search(self, query, **kwargs):
        assert kwargs["max_price_cents"] == 2000
        return [
            {
                "id": "product-1",
                "title": "Durable Basketball",
                "description": "Full-size indoor outdoor ball",
                "metadata": {},
                "media": [{"url": "https://cdn.example/ball.jpg"}],
                "variants": [
                    {
                        "id": "variant-1",
                        "title": "Official Basketball",
                        "price": {"amount": 1899, "currency_code": "USD"},
                        "eligible": True,
                        "seller": {"name": "Sports Shop", "domain": "sports.example"},
                        "url": "https://sports.example/products/ball",
                    }
                ],
            }
        ]

    monkeypatch.setenv("AFFINITY_PRODUCT_PROVIDER", "shopify_ucp")
    monkeypatch.setattr("backend.nodes.ShopifyUcpClient.search_catalog", fake_search)

    result = asyncio.run(shop_node(_state()))

    assert result["bundle"]["source"] == "shopify_ucp"
    assert result["bundle"]["total"] == 18.99
    assert result["bundle"]["items"][0]["merchantDomain"] == "sports.example"


def test_approved_shopify_bundle_creates_a_merchant_cart(monkeypatch) -> None:
    """The post-mandate node creates checkout handoff data without purchasing."""
    calls = []

    async def fake_create(self, **kwargs):
        calls.append(kwargs)
        return {
            "id": "cart-1",
            "checkout_url": "https://sports.example/cart/cart-1",
            "line_items": [{}],
            "totals": {"subtotal": {"amount": 1899, "currency_code": "USD"}},
        }

    monkeypatch.setattr("backend.nodes.ShopifyUcpClient.create_cart_items", fake_create)
    state = {
        "bundle": {
            "items": [
                {
                    "id": "shopify:variant-1",
                    "slot": "ball",
                    "name": "Official Basketball",
                    "price": 18.99,
                    "tags": ["basketball"],
                    "provider": "shopify_ucp",
                    "variantId": "variant-1",
                    "merchantDomain": "sports.example",
                    "quantity": 1,
                }
            ],
            "total": 18.99,
            "serves": {},
        }
    }

    result = asyncio.run(create_carts_node(state))

    assert len(calls) == 1
    assert result["carts"][0]["checkoutUrl"].endswith("cart-1")
    assert result["carts"][0]["total"] == 18.99


def test_preflight_refreshes_price_and_requires_fresh_approval(monkeypatch) -> None:
    """A changed live price updates the bundle and returns to the mandate."""
    async def fake_get_product(self, product_id, **kwargs):
        assert product_id == "product-1"
        return {
            "id": "product-1",
            "title": "Durable Basketball",
            "description": "Full-size indoor outdoor ball",
            "metadata": {},
            "variants": [
                {
                    "id": "variant-1",
                    "title": "Official Basketball",
                    "price": {"amount": 1999, "currency_code": "USD"},
                    "eligible": True,
                    "seller": {"name": "Sports Shop", "domain": "sports.example"},
                }
            ],
        }

    monkeypatch.setattr("backend.nodes.ShopifyUcpClient.get_product", fake_get_product)
    state = {
        "mission": {"budget": 25},
        "bundle": {
            "items": [
                {
                    "id": "shopify:variant-1",
                    "slot": "ball",
                    "name": "Official Basketball",
                    "price": 18.99,
                    "tags": ["basketball"],
                    "provider": "shopify_ucp",
                    "productId": "product-1",
                    "variantId": "variant-1",
                    "merchantDomain": "sports.example",
                    "quantity": 1,
                }
            ],
            "total": 18.99,
            "serves": {},
        },
    }

    result = asyncio.run(preflight_shopify_node(state))

    assert result["preflightStatus"] == "changed"
    assert result["bundle"]["total"] == 19.99
    assert route_after_preflight(result) == "mandate"
