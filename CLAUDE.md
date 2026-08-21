# APEXWEAR

## Startup protocol (do this first, every session)

1. Read `PROGRESS.md` — it names the current phase and the exact next action.
2. Read the relevant phase section of `plan.md` for detail on that next action.
3. Do the work.
4. Update `PROGRESS.md` before the session ends (checklist, decision log, session log).

Never ask the user "what should I work on" or "where did we leave off" — `PROGRESS.md`
answers that. Only ask when genuinely blocked (missing keys, a decision the user must make).

## Project

APEXWEAR — a hoodie-only ecommerce store, modelled on TheSouledStore. India market, INR.
Must be genuinely end-to-end functional: real catalog, real cart, real checkout, real money
via Razorpay, real order lifecycle, real admin, real deploy. Full spec: `plan.md`.

## Stack

- **Django + DRF** — all writes: auth, cart, orders, payments, admin. Source of truth.
- **FastAPI** — read-only: catalog search, filters, facets, recos.
- **React + Vite + TypeScript** — frontend.
- **PostgreSQL** — single database, Django owns the schema/migrations.
- **Razorpay** — payments (UPI, cards, netbanking, COD).

## Locked decisions — do not re-litigate

| Decision | Choice |
|---|---|
| Backend split | Django owns writes, FastAPI reads only |
| Payments | Razorpay, INR, UPI + cards + netbanking + COD |
| Scope | Full: core + growth + ops + production deploy |
| Frontend | React + Vite + TypeScript |
| DB | PostgreSQL (single database, Django owns the schema) |

If one of these looks wrong mid-build, say so and wait for the user — don't silently change it.

## Architecture rules (keep the two-backend split safe)

1. **FastAPI never writes.** It connects via a dedicated Postgres role granted `SELECT`
   only — enforced by the database, not discipline.
2. **Django owns every migration.** FastAPI has no Alembic; its SQLAlchemy models are
   hand-written read mappings of Django tables.
3. **One auth.** Django issues the JWT (`simplejwt`). FastAPI only verifies it with the
   same `SIGNING_KEY`. No second login system.
4. **Nginx routes by prefix.** `/api/*` → Django, `/search/*` → FastAPI.
5. **FastAPI is optional at runtime.** If it's down, browsing falls back to a Django
   endpoint; cart and checkout keep working.

## Non-negotiable correctness rules

These lose real money if skipped — never simplify them away.

- Stock decremented at order confirmation, inside a transaction, using `select_for_update()`
  on the variant rows. Never at add-to-cart, never unlocked.
- Prices snapshotted onto `OrderItem`. Never join an order to a live price.
- The server computes totals. Never trust a client-sent amount.
- The Razorpay **webhook** is the source of truth for payment, not the browser callback.
  Verify signature server-side with `hmac.compare_digest`.
- Webhook handling is idempotent (Razorpay retries) — unique `razorpay_payment_id` +
  `get_or_create`.
- Money is `Decimal` / integer paise. Never `float`.

## Commands

No Docker on this machine — Phase 1 runs natively (Postgres via Homebrew, Django in a venv,
Vite on the host). `docker-compose.yml` arrives in Phase 6 for the production build.

```
brew services start postgresql@16                  # start Postgres (one-time: createdb apexwear)

source .venv/bin/activate                           # or prefix commands with .venv/bin/
cd backend
python manage.py migrate
psql -d apexwear -f sql/search_ro.sql                # (re)grant the read-only role, after migrate
python manage.py seed_products                       # idempotent — safe to re-run
python manage.py createsuperuser
python manage.py runserver                            # :8000

cd web
npm run dev                                            # :5173, proxies /api and /media -> :8000
```

## Working style

- Reuse before writing; check for an existing pattern before adding new code.
- Postgres full-text search before Elasticsearch. `select_for_update` before a queue.
  Django admin before a custom admin UI.
- Tests only where a bug costs money or data: stock-lock race, coupon validation, webhook
  idempotency, signature verification. No test-per-function suites.
- Mark deliberate shortcuts with a `ponytail:` comment naming the ceiling and upgrade path.

## Repo map

```
apexwear/
├── CLAUDE.md      ← this file, auto-loaded every session
├── PROGRESS.md     ← current phase + next action, update every session
├── plan.md         ← full six-phase spec, detail lives here
├── docker-compose.yml
├── backend/        ← Django (writes, admin, source of truth)
├── search/         ← FastAPI (read-only)
└── web/            ← React + Vite + TS
```
