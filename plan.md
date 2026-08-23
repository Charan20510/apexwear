# APEXWEAR — Build Plan

> This file is the cross-session source of truth for the six-phase spec. `PROGRESS.md`
> tracks what's actually done and the next concrete action — read that first, this second.

**Phase status** (kept in sync with `PROGRESS.md`):

| Phase | Status |
|---|---|
| 1 — Foundation | done |
| 1.5 — Landing page *(not in the original phases, shipped between 1 and 2)* | done |
| 2 — Catalog & Search (FastAPI) | not started |
| 3 — Cart, Checkout, Payments | not started |
| 4 — Growth features | not started |
| 5 — Operations | not started |
| 6 — Production | not started |

---

## Context

APEXWEAR is a hoodie-only ecommerce store, modelled on TheSouledStore. It must be genuinely
end-to-end functional: real catalog with size/colour variants, real cart, real checkout, real
money via Razorpay, real order lifecycle, real admin, real deploy — not a demo with stubbed
buttons.

The project is greenfield (`/Users/charantej/Desktop/apexwear` is empty). It will be built
across many separate Claude sessions, so this plan carries all decisions that a fresh session
cannot re-derive from the code.

---

## Decisions (locked — do not re-litigate)

| Decision | Choice |
|---|---|
| Backend split | Django owns writes, FastAPI reads only |
| Payments | Razorpay, INR, UPI + cards + netbanking + COD |
| Scope | Full: core + growth + ops + production deploy |
| Frontend | React + Vite + TypeScript |
| DB | PostgreSQL (single database, Django owns the schema) |

### Architecture

```
                     React (Vite + TS)
                       │
        ┌──────────────┴──────────────┐
        │                             │
   /api/*                        /search/*
   Django + DRF                  FastAPI
   auth, cart, orders,           catalog search,
   payments, admin, all          filters, facets,
   WRITES                        recos — READ ONLY
        │                             │
        │  (owner role)               │  (readonly role)
        └──────────────┬──────────────┘
                       │
                  PostgreSQL
             (Django owns migrations)
```

**The rules that make this split safe:**

1. **FastAPI never writes.** It connects with a dedicated Postgres role granted `SELECT` only.
   This is enforced by the database, not by discipline.
2. **Django owns every migration.** FastAPI has no Alembic, no `Base.metadata.create_all`.
   Its SQLAlchemy models are hand-written read mappings of Django tables.
3. **One auth.** Django (`djangorestframework-simplejwt`) issues the JWT. FastAPI only
   *verifies* it using the same `SIGNING_KEY` from env. No user table access, no login route.
4. **Nginx routes by prefix.** `/api/*` → Django, `/search/*` → FastAPI. The React app never
   hardcodes two hostnames.
5. **FastAPI is optional at runtime.** If it's down, browsing degrades to a Django fallback
   list endpoint; cart and checkout keep working.

### Repo layout

```
apexwear/
├── plan.md                  ← this document
├── docker-compose.yml       ← postgres, django, fastapi, web
├── .env.example
├── backend/                 ← Django (writes, admin, source of truth)
│   ├── apexwear/            ← settings, urls, wsgi/asgi
│   ├── accounts/            ← User, Address
│   ├── catalog/             ← Category, Product, ProductImage, Variant
│   ├── orders/              ← Cart, Order, Payment
│   ├── marketing/           ← Wishlist, Coupon, Review   (Phase 4)
│   └── manage.py
├── search/                  ← FastAPI (read-only)
│   ├── main.py
│   ├── models.py            ← SQLAlchemy read mappings
│   └── db.py                ← readonly engine
└── web/                     ← React + Vite + TS
    └── src/{pages,components,api,store,lib}
```

### Data model

Set this up correctly in Phase 1. The custom user model in particular **cannot be changed
after the first migration** without dropping the database.

**accounts**
- `User` — `AbstractUser` subclass, `email` is the login field, `phone`. Set
  `AUTH_USER_MODEL` in the very first commit.
- `Address` — user FK, name, phone, line1, line2, city, state, pincode, is_default.

**catalog**
- `Category` — name, slug, parent (nullable, self-FK).
- `Product` — name, slug, description, category FK, base_price, is_active, created_at,
  `search_vector` (`SearchVectorField` + GIN index).
- `ProductImage` — product FK, image, alt, position.
- `Variant` — product FK, size, colour, `sku` unique, `price_override` nullable,
  `stock` int. `unique_together = (product, size, colour)`.

**orders**
- `Cart` — user FK **or** `session_key` (guest carts). `CartItem` — cart FK, variant FK, qty.
- `Order` — user FK, **address snapshot as JSON** (never FK to a mutable address),
  status, subtotal, discount, shipping, total, placed_at.
- `OrderItem` — order FK, variant FK, plus **snapshots**: product_name, size, colour,
  unit_price, qty.
- `Payment` — order FK, razorpay_order_id, `razorpay_payment_id` (**unique**), signature,
  status, amount.

Order status: `CREATED → PAID → PACKED → SHIPPED → DELIVERED`, plus `CANCELLED`,
`RETURN_REQUESTED`, `RETURNED`, `REFUNDED`.

### Non-negotiable correctness rules

These are the things that lose real money if skipped. Never simplify them away.

- **Stock is decremented at order confirmation, inside a transaction, using
  `select_for_update()` on the variant rows** — never at add-to-cart, never without a lock.
  Two people buying the last hoodie must produce one order and one failure.
- **Prices are snapshotted onto `OrderItem`.** Never join an old order to a live price.
- **The server computes the total.** Never trust any amount sent by the client.
- **The Razorpay webhook is the source of truth for payment**, not the browser callback.
  Verify the signature server-side with `hmac.compare_digest`. The browser can lie.
- **Webhook handling is idempotent** — Razorpay retries. The unique `razorpay_payment_id`
  plus `get_or_create` is the guard.
- Money is `Decimal` / integer paise. Never `float`.

---

## Phases

Six phases. Each ends with something you can actually use, and a check you can actually run.

---

### Phase 1 — Foundation

**Goal:** Postgres up, Django up, React up, talking to each other, with the models that
can't be changed later already correct.

- `docker-compose.yml`: postgres 16 + django + web. Create the `search_ro` Postgres role
  now (`GRANT SELECT ON ALL TABLES`) even though FastAPI arrives in Phase 2.
- Django project, **custom `User` model first** (email login), `Address`.
- JWT auth via `simplejwt`: register, login, refresh, me. HttpOnly refresh cookie.
- All `catalog` models + Django admin (inlines for images and variants) + a
  `seed_products` management command with ~20 realistic hoodies.
- React: Vite + TS + Tailwind + React Router + TanStack Query. App shell, header, footer,
  a `lib/api.ts` fetch wrapper that attaches the JWT and refreshes on 401.
- One page that lists products from Django.

**Done when:** you log in through React, add a hoodie in Django admin, and see it appear
on the React homepage.

**Verify:** `docker compose up`; register + login via the UI; `manage.py seed_products`;
homepage shows the seeded hoodies; `psql` as `search_ro` can `SELECT` but `INSERT` fails.

---

### Phase 2 — Catalog & Search (FastAPI enters)

**Goal:** a real, browsable, searchable catalog.

- Django: DRF read endpoints for product detail and categories. Populate `search_vector`
  via a `post_save` signal or a trigger; GIN index in a migration.
- FastAPI service: read-only engine, hand-written SQLAlchemy mappings for
  product/variant/image/category.
  - `GET /search/products` — `q`, category, size, colour, min/max price, sort, page.
  - Full-text via Postgres `tsvector` ranking. **No Elasticsearch** — Postgres FTS is
    correct until you have 100k+ SKUs.
  - `GET /search/facets` — available sizes/colours/price buckets for the current filter set.
  - JWT verify dependency (used later by recos; search itself is public).
- React: product listing page with filter sidebar + sort, product detail page with
  size/colour selector, image gallery, stock state, and a Django fallback if `/search` 5xx's.

**Done when:** you can search "black oversized", filter to size L, and open a product page
that correctly shows which variants are in stock.

**Verify:** hit `/search/products?q=...` directly; confirm out-of-stock variants render
disabled; kill the FastAPI container and confirm the listing page still renders.

---

### Phase 3 — Cart, Checkout, Payments  ← *the phase that makes it a real store*

**Goal:** a customer can pay real money and you can see the order.

- Cart: guest cart keyed by session, user cart keyed by user, **merged on login**.
  Add/update/remove/clear. Server always re-reads prices from the DB.
- Address book UI + default address.
- Checkout: order draft → Razorpay order created server-side → Razorpay Checkout in the
  browser → **webhook** confirms → stock decremented under `select_for_update` in the same
  transaction that flips status to `PAID`.
- COD path: skips Razorpay, goes straight to `PAID`-equivalent (`CONFIRMED`) with the same
  stock lock.
- Failure paths that must actually work: payment failed, payment abandoned, webhook arrives
  before the browser returns, webhook arrives twice, item went out of stock during payment.
- Order confirmation page, order history, order detail with status timeline.
- Django admin: order list, status transitions, stock management.

**Done when:** a Razorpay **test** payment produces a `PAID` order, correct stock decrement,
and a visible order in both the customer's history and the admin.

**Verify:** Razorpay test cards + test UPI. Replay the same webhook twice — the second must
be a no-op. Run two concurrent checkouts for the last unit of a variant — exactly one wins.
Write this concurrency case as a real test; it is the one piece of logic worth a test file.

---

### Phase 4 — Growth features

**Goal:** the things that make it feel like TheSouledStore rather than a checkout demo.

- Wishlist (auth-only), move-to-cart.
- Coupons: percentage / flat / free-shipping, min-order, expiry, per-user usage cap.
  Applied and **re-validated server-side at order confirm**, not just at cart display.
- Reviews & ratings, restricted to verified purchasers. Aggregate rating denormalised
  onto `Product`.
- Transactional email (order confirmed, shipped, delivered, refunded) — Django templates,
  sent from a background task.
- Return / refund request flow with admin approval and Razorpay refund API.

**Done when:** a coupon correctly changes the amount actually charged, and a review can only
be posted by someone who bought that product.

**Verify:** try to apply an expired coupon, a coupon twice, and a coupon below its
min-order — all three must be rejected server-side even if the UI allowed it.

---

### Phase 5 — Operations

**Goal:** you can actually run the business from the app.

- Shipping: Shiprocket (or equivalent) — create shipment, fetch AWB, tracking status sync,
  status pushed onto the order timeline.
- PDF invoices generated on `PAID`, downloadable by the customer, GST fields included.
- Analytics dashboard (staff-only React route): revenue, orders, AOV, top products,
  conversion, low-stock alerts. Aggregate queries served by **FastAPI** — read-only work,
  exactly what it's for.
- Inventory: low-stock threshold + admin alerting.

**Done when:** you can ship an order, the customer sees tracking, and the dashboard numbers
reconcile against the orders table.

**Verify:** cross-check dashboard revenue against a raw SQL `SUM(total)` for the same window.

---

### Phase 6 — Production

**Goal:** live, hardened, and not a 3am page.

- Security pass: `DEBUG=False`, real `ALLOWED_HOSTS`, CORS locked to the real origin, CSRF,
  rate limits on auth + checkout, secrets only in env, HTTPS-only cookies, security headers.
- Performance: `select_related`/`prefetch_related` audit for N+1, Redis cache on catalog
  reads, DB indexes on every filter/sort column, image optimisation + CDN, React code
  splitting.
- SEO: SSR or prerender for product pages, meta tags, sitemap, structured data.
- Docker production build, Nginx reverse proxy + static/media, GitHub Actions CI
  (lint + tests + build), deploy to a VPS or Render/Railway.
- Sentry for errors, health checks, automated Postgres backups.
- Load test the checkout path.

**Done when:** a real customer can buy a hoodie on a real domain over HTTPS, and you get
alerted when something breaks.

**Verify:** full purchase on the live site with a real ₹1 transaction; confirm backup
restores into a scratch database.

---

## Rules for every future session

Read these before writing code. They exist because this project spans many sessions.

1. **Read `plan.md` first.** Update the phase checklist in it when a phase completes.
2. **Django owns the schema.** If FastAPI needs a column, add it in a Django migration.
3. **Never change `AUTH_USER_MODEL`** after Phase 1.
4. **FastAPI never writes.** If you're reaching for a write in `search/`, it belongs in Django.
5. **Never trust the client** for prices, totals, discounts, stock, or payment status.
6. Keep the ladder: stdlib → Postgres feature → existing dependency → new code. Postgres FTS
   before Elasticsearch. `select_for_update` before a queue. Django admin before a custom
   admin UI.
7. Tests only where a bug costs money or data: the stock-lock race, coupon validation,
   webhook idempotency, signature verification. No test-per-function suites.
8. Mark deliberate shortcuts with a `ponytail:` comment naming the ceiling and the upgrade
   path.

---

## Verification (whole system)

The end-to-end check that proves the store works — run it at the end of Phase 3 and again
after every later phase:

1. `docker compose up` — postgres, django, fastapi, web all healthy.
2. Register a new account through the React UI.
3. Search for a hoodie, filter by size, open the product page.
4. Add two variants to the cart, change a quantity, remove one.
5. Add an address, apply a coupon (Phase 4+), pay with a Razorpay test card.
6. Confirm: order appears in history with correct total, stock decremented by exactly the
   ordered quantity, order visible in Django admin, confirmation email sent.
7. Replay the webhook — no duplicate order, no double stock decrement.
8. Log out, log in as guest, add to cart, log in — guest cart merged, not lost.
