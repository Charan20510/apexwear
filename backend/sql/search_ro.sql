-- Read-only Postgres role for the Phase 2 FastAPI search service.
-- Run after `manage.py migrate` (needs tables to exist for the SELECT grant),
-- and re-run any time you want to double check default privileges are set.
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'search_ro') THEN
        CREATE ROLE search_ro LOGIN PASSWORD 'search_ro';
    END IF;
END
$$;

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
