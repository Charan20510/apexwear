-- Read-only Postgres role for the Phase 2 FastAPI search service.
-- Run after `manage.py migrate` (needs tables to exist for the SELECT grant),
-- and re-run any time you want to double check default privileges are set.
-- The password comes from the caller so it isn't a literal in a tracked file:
-- run_dev.sh passes -v search_ro_password="$SEARCH_RO_PASSWORD" from .env. Running
-- this script by hand without that variable falls back to the dev default, which is
-- fine locally but must be overridden anywhere real.
\if :{?search_ro_password}
\else
\set search_ro_password 'search_ro'
\endif

-- Split in two because psql does not interpolate :variables inside $$-quoted blocks,
-- so the password has to be set by a statement outside the DO block.
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'search_ro') THEN
        CREATE ROLE search_ro LOGIN;
    END IF;
END
$$;

ALTER ROLE search_ro WITH PASSWORD :'search_ro_password';

-- Granted against whichever database this is run in, so the script works for a
-- scratch/test database too rather than only one hardcoded name.
DO $$
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO search_ro', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO search_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO search_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO search_ro;
