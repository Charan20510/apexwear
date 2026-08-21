# APEXWEAR — Progress

## NEXT ACTION

Start **Phase 2 — Catalog & Search**: FastAPI service (read-only SQLAlchemy mappings,
`search_ro` role already exists), populate `Product.search_vector` via a signal + GIN index
(already in the schema), `/search/products` and `/search/facets`, and the React product
listing/detail pages with filters. Full detail: `plan.md` → Phase 2.

## Current phase

`Phase 1 — Foundation` — **done**.

## Phase checklist

- [x] **Phase 1 — Foundation**
  - [x] ~~`docker-compose.yml`~~ — deferred to Phase 6 (no Docker on this machine; see decision log)
  - [x] Create `search_ro` Postgres role (`GRANT SELECT` only) — `backend/sql/search_ro.sql`
  - [x] Django project scaffold (`backend/`, native venv at `.venv/`)
  - [x] Custom `User` model (email login) — `AUTH_USER_MODEL` set before the first migration
  - [x] `Address` model
  - [x] JWT auth (`simplejwt`): register, login, refresh, me; HttpOnly refresh cookie
        (`accounts/views.py`, cookie scoped to `/api/auth`)
  - [x] Google Sign-In (`POST /api/auth/google`) — beyond the Phase 1 spec, added on request;
        needs `GOOGLE_OAUTH_CLIENT_ID` before it can be used in a browser
  - [x] Test suite — 31 tests across `accounts/tests.py` and `catalog/tests.py`
  - [x] `catalog` models: Category, Product, ProductImage, Variant (`search_vector` +
        GIN index already in the schema, populated in Phase 2)
  - [x] Django admin with inlines (images, variants) — `catalog/admin.py`
  - [x] `seed_products` management command — 20 hoodies, 130 variants, generated Pillow
        placeholder images, idempotent, deterministic stock incl. a 0-stock and a 1-stock
        variant reserved for the Phase 3 concurrency test
  - [x] React: Vite + TS + Tailwind v4 + React Router + TanStack Query, app shell
        (`Header`/`Footer`/`Layout`), `lib/api.ts` (in-memory access token, single-flight
        401 refresh), `lib/auth.tsx`
  - [x] Product listing page (`pages/Home.tsx`) reading from Django
  - [x] Verified: register/login/refresh through the Vite proxy; new product created via
        the ORM (admin's write path) appears on the homepage; `search_ro` can `SELECT`,
        `INSERT` correctly denied
- [ ] **Phase 2 — Catalog & Search** (FastAPI enters)
- [ ] **Phase 3 — Cart, Checkout, Payments**
- [ ] **Phase 4 — Growth features**
- [ ] **Phase 5 — Operations**
- [ ] **Phase 6 — Production**

(Sub-tasks for Phases 2–6 are detailed in `plan.md`; break them out here once Phase 1 is done.)

## Decision log

_Choices made during build that aren't in `plan.md` — library picks, schema deviations,
workarounds. Add an entry whenever one comes up so it's never re-decided._

- 2026-08-21 — Plan approved as written; no deviations yet.
- 2026-08-21 — **No Docker on this machine.** Phase 1 runs natively: Postgres 16 via
  Homebrew, Django in a `.venv`, Vite on the host, talking over `localhost`.
  `docker-compose.yml` is deferred to Phase 6, where it's written against the real
  production build and can actually be run/tested. Nothing in Phases 1–5 depends on
  containers.
- 2026-08-21 — **Django 5.2.17 LTS**, not 6.x — `djangorestframework-simplejwt` 5.5.1 only
  supports Django ≤5.2.
- 2026-08-21 — **No `django-cors-headers`.** Dev (`Vite` proxy) and prod (Phase 6 Nginx)
  both make the frontend same-origin with the API, so CORS never applies. Revisit only if
  a separate frontend origin is ever needed.
- 2026-08-21 — **Seed images are generated, not real photos.** `seed_products` uses Pillow
  to draw solid brand-colour PNGs with the product name overlaid — offline, deterministic,
  no licensing questions. `ponytail:` swap for real product photography before launch.
- 2026-08-21 — **`.gitignore` was excluding `CLAUDE.md`/`plan.md`/`PROGRESS.md`/`.claude`**
  (added after the first commit) — the opposite of what `CLAUDE.md` itself specifies
  (these are the checked-in cross-session source of truth). Fixed to only ignore
  `.claude/settings.local.json` (machine-local settings).
- 2026-08-21 — **Google Sign-In added** (`POST /api/auth/google`). The React app uses Google
  Identity Services to get an ID token; Django verifies it with `google-auth`
  (`verify_oauth2_token` — checks signature, `aud`, `iss`, expiry against Google's rotating
  keys) and then issues **our own** JWT + refresh cookie. Google replaces the password check
  only; the session that follows is identical to every other login path. Not
  `django-allauth` — that's session/template-based and this is a JWT SPA.
- 2026-08-21 — **Google accounts link by verified email.** If someone registered with a
  password and later signs in with Google using the same address, they land in the *same*
  account — but only when Google asserts `email_verified: true`. Without that check an
  attacker could claim any email. Google-created users get `set_unusable_password()`.
  `ponytail:` no `google_sub` column; add one only if surviving a Google email change matters.
- 2026-08-21 — **Email-only login confirmed, not changed.** `User` already extends
  `AbstractBaseUser` + `PermissionsMixin` (no `username` column exists anywhere), so this
  needed no code change. Locked in with regression tests so a later session can't
  reintroduce a username field.
- 2026-08-21 — **Local commits only.** `origin` (github.com/Charan20510/apexwear) is
  configured, but nothing is pushed unless the user explicitly asks in that session. Commit
  messages stay to a single short subject line — the detail lives here, not in git.
- 2026-08-21 — Auth cookie name `apexwear_refresh`, scoped to path `/api/auth`,
  `HttpOnly` + `SameSite=Lax` + `Secure` when not `DEBUG`. Logout only clears the cookie
  (`ponytail:` doesn't blacklist the token — add `simplejwt`'s `token_blacklist` app when
  real session revocation is needed).

## Blockers / open questions

- **Google OAuth Client ID** — `GOOGLE_OAUTH_CLIENT_ID` (root `.env`) and
  `VITE_GOOGLE_CLIENT_ID` (`web/.env.local`) are both blank. The code is finished and tested
  against a patched verifier, but the real browser sign-in can't be exercised until a Web
  application OAuth client is created at console.cloud.google.com with
  `http://localhost:5173` as an authorised JavaScript origin. Until then the endpoint
  returns 503 and the button is hidden.
- Razorpay API keys (test mode) — needed by Phase 3, not blocking Phase 2.
- Production domain / hosting target — needed by Phase 6.
- Docker Desktop is not installed on this machine — not currently blocking (native dev
  works through Phase 5), but install it before Phase 6 so `docker-compose.yml` can be
  written and tested for real.

## Session log

- 2026-08-21 — Wrote `plan.md` (six-phase spec, locked decisions). Wrote `CLAUDE.md`,
  `PROGRESS.md`, `.gitignore`. Repo not yet started (`git init` pending). No code written yet.
- 2026-08-21 — Phase 1 built end-to-end natively (no Docker on this machine): Postgres 16
  running via Homebrew with `apexwear` db + `search_ro` role; Django backend
  (`accounts` + `catalog` apps, custom email-login `User`, JWT auth with HttpOnly refresh
  cookie, DRF product/category read endpoints, admin with inlines); `seed_products` gives
  20 hoodies / 130 variants with generated placeholder images; React frontend (Vite + TS +
  Tailwind v4 + React Router + TanStack Query) with a working register/login/logout flow
  and a homepage product grid. Verified role isolation (`search_ro` SELECT-only) and the
  full admin-write → homepage-read loop. Fixed a `.gitignore` bug that was excluding the
  project's own planning docs from commits. Phase 1 checklist complete; next session starts
  Phase 2.
- 2026-08-21 — Phase 1 committed locally on `main` (**not pushed** — deliberate, see decision
  log). Wrote the first cross-session memory files (git workflow preferences).
- 2026-08-21 — Added Google Sign-In end to end (`GoogleLoginView`, `GoogleButton.tsx`,
  `loginWithGoogle`) and wrote the first real test suite: **31 tests, all passing** —
  email-only invariants, the full password-auth lifecycle, Google OAuth (new user, account
  linking, unverified email, forged token, unconfigured server), and catalog model/API
  behaviour. Also verified live: 3 dummy users through register → me → logout → login →
  refresh over the Vite proxy (then deleted), no migration drift, seed still idempotent,
  `search_ro` still SELECT-only, `npm run build` clean. **`GOOGLE_OAUTH_CLIENT_ID` is still
  blank** — the flow is complete but real browser sign-in is untested until that key exists.
