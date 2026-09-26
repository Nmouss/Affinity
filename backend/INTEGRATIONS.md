# Affinity live integrations

Affinity separates reasoning from external providers. The graph can run with
local fixtures, while provider adapters supply live products, places, events,
and final checkout or booking links.

## MVP provider set

### Shopify: products and checkout

Use Shopify UCP Global Catalog for product discovery and merchant UCP endpoints
for cart handoff after approval.

Required environment variables:

```dotenv
AFFINITY_PRODUCT_PROVIDER=shopify_ucp
SHOPIFY_UCP_CLIENT_ID=replace-me
SHOPIFY_UCP_CLIENT_SECRET=replace-me
SHOPIFY_UCP_AUTH_MODE=token
```

Credentials belong only on the Python server. The shop node normalizes search
results and applies hard rules in code. Merchant carts are not created until an
approved mandate resumes the graph.

Shopify UCP returns eligible products from its participating catalog and
merchant network; it does not search arbitrary non-participating retailers.

### Google Places API (New): restaurants and local activities

Create a Google Cloud project, enable Places API (New), attach billing, and
create an API key restricted to that API. The backend uses Text Search for
restaurants and place-based activities.

Required environment variables:

```dotenv
AFFINITY_PLACE_PROVIDER=google_places
GOOGLE_PLACES_API_KEY=replace-me
GOOGLE_PLACES_SEARCH_LIMIT=10
GOOGLE_PLACES_REGION_CODE=US
```

The adapter uses Text Search (New) and requests only the fields the interface
needs because requested fields affect billing. Plan slots can enforce place
type, minimum rating, current-open status, and price level. The mission location
can also include latitude, longitude, and radius for a geographic bias.

Places discovers candidates; it does not guarantee a reservable table. For the
hackathon, the approved plan should hand the user to the restaurant's website
or Maps page. A true availability hold requires a separate reservation partner
integration.

### SMTP: approved-plan notifications

SMTP delivery runs only after an approved plan mandate. Runtime profiles need
an `email` field and may opt out with `emailNotifications: false`. Configure
the provider-issued credentials shown in `.env.example`; do not use or commit a
normal personal-account password. Messages are sent separately per recipient,
and delivery results are returned in `state.notifications`.

### Ticketmaster Discovery API: optional dated events

Ticketmaster is useful for concerts, sports, theatre, and other events with a
specific date and venue. Register an application and use its consumer key.

```dotenv
AFFINITY_EVENT_PROVIDER=ticketmaster
TICKETMASTER_API_KEY=replace-me
```

This integration is optional for the first vertical. Google Places can cover
general activities such as museums, bowling, parks, and escape rooms.

## What not to add yet

- Square credentials are unnecessary when Shopify owns catalog and checkout.
- A second restaurant search API duplicates Google Places without adding live
  reservation inventory.
- Web-shopping aggregators should wait until the controlled Shopify flow is
  stable. Results from third-party retailers cannot be placed into one Shopify
  cart unless Affinity is the seller of those products.

## Mandate boundary

Provider searches are read-only and may run before approval. A rejected result
can be replaced with a human prompt or an autonomous targeted search while all
other accepted entries remain locked. Shopping approval calls `get_product` to
refresh variant price and availability; changed prices return to the mandate
for fresh consent, while unavailable products re-enter repair. Any operation
that creates a checkout, holds inventory, books a reservation, or incurs a
charge belongs after that preflight and human mandate. Finalizers should use an
idempotency key derived from the thread and plan version.
