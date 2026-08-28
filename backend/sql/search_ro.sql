-- Read-only Postgres role for the FastAPI search service. Run after `manage.py migrate`.
\if :{?search_ro_password}
\else
\set search_ro_password 'search_ro'
\endif

-- psql can't interpolate :variables inside $$-quoted blocks, so this is split in two.
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'search_ro') THEN
        CREATE ROLE search_ro LOGIN;
    END IF;
END
$$;

ALTER ROLE search_ro WITH PASSWORD :'search_ro_password';

DO $$
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO search_ro', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO search_ro;

-- Scoped to the catalog tables only — never ALL TABLES or ALTER DEFAULT PRIVILEGES,
-- so orders/payments/address PII stays invisible without an explicit grant here.
GRANT SELECT ON catalog_category, catalog_product, catalog_productimage, catalog_variant
    TO search_ro;
