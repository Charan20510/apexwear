#!/usr/bin/env bash
#
# APEXWEAR — one-command development bootstrap.
#
#   git clone <repo> && cd apexwear && ./run_dev.sh
#
# Creates whatever is missing (venv, node_modules, .env, database), runs migrations,
# seeds the catalog on first run, then starts Django (:8000) and Vite (:5173) together.
# Everything is skipped when already satisfied, so re-runs are fast.
#
# Supported: macOS and Linux. Requires PostgreSQL, Python >= 3.10 and Node >= 20.19
# to be installed — the script will tell you how to get them if they're missing.
#
# Env overrides:
#   APEXWEAR_DB_NAME   database name (default: apexwear)
#   DJANGO_PORT        default 8000
#   VITE_PORT          default 5173

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
ROOT="$PWD"

DB_NAME="${APEXWEAR_DB_NAME:-apexwear}"
DJANGO_PORT="${DJANGO_PORT:-8000}"
VITE_PORT="${VITE_PORT:-5173}"
# vite.config.ts reads this to point its /api and /media proxy at Django.
export DJANGO_PORT
MIN_PY_MINOR=10   # Django 5.2 needs Python >= 3.10

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '\033[33mwarning:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- 1. preflight

OS="$(uname -s)"
case "$OS" in
  Darwin|Linux) ;;
  *) die "unsupported platform '$OS'. This script targets macOS and Linux (on Windows, use WSL)." ;;
esac

if [ "$OS" = "Darwin" ]; then
  PG_INSTALL_HINT="brew install postgresql@16 && brew services start postgresql@16"
  NODE_INSTALL_HINT="brew install node"
  PY_INSTALL_HINT="brew install python@3.13"
else
  PG_INSTALL_HINT="sudo apt install postgresql   # or your distro's equivalent"
  NODE_INSTALL_HINT="sudo apt install nodejs npm  # or use nvm"
  PY_INSTALL_HINT="sudo apt install python3 python3-venv"
fi

# Pick a Python >= 3.10. Newest first, so we don't land on an ancient system python3.
PYTHON=""
for candidate in python3.14 python3.13 python3.12 python3.11 python3.10 python3; do
  if command -v "$candidate" >/dev/null 2>&1; then
    if "$candidate" -c "import sys; sys.exit(0 if sys.version_info[:2] >= (3, $MIN_PY_MINOR) else 1)" 2>/dev/null; then
      PYTHON="$candidate"
      break
    fi
  fi
done
[ -n "$PYTHON" ] || die "no Python >= 3.$MIN_PY_MINOR found. Install one:
    $PY_INSTALL_HINT"

command -v node >/dev/null 2>&1 || die "node not found. Install Node >= 20.19:
    $NODE_INSTALL_HINT"
command -v npm  >/dev/null 2>&1 || die "npm not found. Install Node >= 20.19:
    $NODE_INSTALL_HINT"

# Vite 8 requires Node 20.19+ (or 22.12+). Refuse early rather than failing mid-build.
node -e 'const [maj,min]=process.versions.node.split(".").map(Number);
         process.exit((maj>22||(maj===22&&min>=12)||(maj===20&&min>=19)||(maj===21))?0:1)' \
  || die "Node $(node -v) is too old — Vite needs >= 20.19. Upgrade:
    $NODE_INSTALL_HINT"

# Note: written for bash 3.2, which is what macOS still ships — no `wait -n`,
# no `${var^^}`, no associative arrays.
# Must always exit 0: under `set -e` + `pipefail`, a no-match from lsof would
# otherwise abort the whole script at the assignment that calls this.
port_holder() {
  command -v lsof >/dev/null 2>&1 || return 0
  lsof -ti :"$1" 2>/dev/null | head -1 || true
}

for port_pair in "$DJANGO_PORT:Django:DJANGO" "$VITE_PORT:Vite:VITE"; do
  port="$(echo "$port_pair" | cut -d: -f1)"
  label="$(echo "$port_pair" | cut -d: -f2)"
  var="$(echo "$port_pair" | cut -d: -f3)"
  pid="$(port_holder "$port")"
  if [ -n "$pid" ]; then
    die "port $port ($label) is already in use by PID $pid ($(ps -p "$pid" -o comm= 2>/dev/null || echo unknown)).
    Stop it, or re-run with a different port:  ${var}_PORT=xxxx ./run_dev.sh"
  fi
done

bold "APEXWEAR dev bootstrap"
info "python: $($PYTHON --version 2>&1)   node: $(node -v)   os: $OS"

# ---------------------------------------------------------------- 2. postgres

command -v psql >/dev/null 2>&1 || die "PostgreSQL not found.

    $PG_INSTALL_HINT

Then re-run ./run_dev.sh"

pg_up() { pg_isready -q >/dev/null 2>&1; }

if ! pg_up; then
  info "postgres is not accepting connections — starting it"
  if [ "$OS" = "Darwin" ]; then
    # Start whichever postgresql formula is installed.
    formula="$(brew list --formula 2>/dev/null | grep -m1 '^postgresql' || true)"
    [ -n "$formula" ] && brew services start "$formula" >/dev/null 2>&1 || true
  else
    sudo systemctl start postgresql >/dev/null 2>&1 || true
  fi

  for _ in $(seq 1 30); do
    pg_up && break
    sleep 1
  done
  pg_up || die "could not start PostgreSQL. Start it yourself, then re-run:
    $PG_INSTALL_HINT"
fi
info "postgres: up"

# ------------------------------------------------------- 3. database and role
#
# macOS/Homebrew: the installing user is a superuser, so plain psql works.
# Linux/apt: the cluster is owned by the 'postgres' system user and $USER often has
# no role at all, so fall back to `sudo -u postgres` to create one.

DB_USER="$USER"

# PSQL_PREFIX is empty on macOS (we are the superuser) or "sudo -u postgres" on a
# stock Linux install. psql_admin/psql_db run against the postgres db / our db.
PSQL_PREFIX=""

psql_admin() { $PSQL_PREFIX psql -d postgres "$@"; }
psql_db()    { $PSQL_PREFIX psql -d "$DB_NAME" "$@"; }

if psql -d postgres -tAc 'SELECT 1' >/dev/null 2>&1; then
  :
elif sudo -u postgres psql -d postgres -tAc 'SELECT 1' >/dev/null 2>&1; then
  info "connecting as the 'postgres' superuser (sudo)"
  PSQL_PREFIX="sudo -u postgres"
  if ! psql_admin -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
    info "creating postgres role '$DB_USER'"
    sudo -u postgres createuser --createdb "$DB_USER"
  fi
else
  die "cannot connect to PostgreSQL as '$USER' or via 'sudo -u postgres'.
    Create a role for yourself, e.g.:  sudo -u postgres createuser --createdb $USER"
fi

if ! psql_admin -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
  info "creating database '$DB_NAME'"
  psql_admin -q -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\""
else
  info "database '$DB_NAME': exists"
fi

# ---------------------------------------------------------------- 4. .env
#
# Never overwrite an existing .env — it may hold a real GOOGLE_OAUTH_CLIENT_ID.

if [ ! -f "$ROOT/.env" ]; then
  info "generating .env (secret key + database url for this machine)"
  SECRET="$($PYTHON -c 'import secrets; print(secrets.token_urlsafe(50))')"
  {
    echo "DJANGO_SECRET_KEY=$SECRET"
    echo "DEBUG=True"
    echo "DATABASE_URL=postgres://${DB_USER}@localhost:5432/${DB_NAME}"
    echo "SEARCH_RO_PASSWORD=search_ro"
    echo ""
    echo "# Paste an OAuth 2.0 Web-application Client ID to enable Google sign-in."
    echo "# Without it /api/auth/google returns 503 and the button stays hidden."
    echo "GOOGLE_OAUTH_CLIENT_ID="
  } > "$ROOT/.env"
else
  info ".env: exists (left untouched)"
fi

# ---------------------------------------------------------- 5. dependencies

VENV="$ROOT/.venv"
REQ="$ROOT/backend/requirements.txt"
STAMP="$VENV/.requirements-sha"
req_sha="$($PYTHON -c "
import hashlib,sys
print(hashlib.sha256(open(sys.argv[1],'rb').read()).hexdigest())" "$REQ")"

if [ ! -x "$VENV/bin/python" ]; then
  info "creating virtualenv (.venv)"
  "$PYTHON" -m venv "$VENV"
fi

if [ ! -f "$STAMP" ] || [ "$(cat "$STAMP")" != "$req_sha" ]; then
  info "installing python dependencies"
  "$VENV/bin/pip" install -q --upgrade pip
  "$VENV/bin/pip" install -q -r "$REQ"
  echo "$req_sha" > "$STAMP"
else
  info "python dependencies: up to date"
fi

if [ ! -d "$ROOT/web/node_modules" ] || [ "$ROOT/web/package-lock.json" -nt "$ROOT/web/node_modules" ]; then
  info "installing node dependencies (npm ci)"
  (cd "$ROOT/web" && npm ci --silent)
  touch "$ROOT/web/node_modules"
else
  info "node dependencies: up to date"
fi

# ------------------------------------------------------ 6. schema and data

PY="$VENV/bin/python"

info "applying migrations"
(cd "$ROOT/backend" && "$PY" manage.py migrate --noinput >/dev/null)

# search_ro is the read-only role the Phase 2 FastAPI service will use. Creating it
# needs superuser rights, which we may not have — that must not block the dev servers.
if ! psql_db -q -v ON_ERROR_STOP=1 -f "$ROOT/backend/sql/search_ro.sql" >/dev/null 2>&1; then
  warn "could not apply backend/sql/search_ro.sql (needs superuser). Not needed until Phase 2."
fi

product_count="$(cd "$ROOT/backend" && "$PY" -c "
import django, os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'apexwear.settings')
django.setup()
from catalog.models import Product
print(Product.objects.count())
" 2>/dev/null || echo 0)"

if [ "$product_count" = "0" ]; then
  info "seeding catalog (first run)"
  (cd "$ROOT/backend" && "$PY" manage.py seed_products >/dev/null)
else
  info "catalog: $product_count products already seeded"
fi

# ------------------------------------------------------------- 7. run both

DJANGO_PID=""
VITE_PID=""

# Both servers spawn children (Django's autoreloader, Vite's npm wrapper), so kill
# the children first, then the parent, then anything still holding the ports.
kill_tree() {
  pid="$1"
  [ -n "$pid" ] || return 0
  pkill -TERM -P "$pid" 2>/dev/null || true
  kill -TERM "$pid" 2>/dev/null || true
}

cleanup() {
  trap - INT TERM EXIT
  printf '\n'
  bold "shutting down"
  kill_tree "$DJANGO_PID"
  kill_tree "$VITE_PID"
  sleep 1
  for port in "$DJANGO_PORT" "$VITE_PORT"; do
    leftover="$(port_holder "$port")"
    [ -n "$leftover" ] && kill -KILL "$leftover" 2>/dev/null || true
  done
}

# Ctrl-C is the normal way to stop, so it exits 0 — only an unexpected server death
# below is an error.
on_signal() { cleanup; exit 0; }
trap on_signal INT TERM
trap cleanup EXIT

echo
bold "starting servers"
(cd "$ROOT/backend" && exec "$PY" manage.py runserver "127.0.0.1:$DJANGO_PORT") &
DJANGO_PID=$!
(cd "$ROOT/web" && exec npm run dev -- --port "$VITE_PORT" --strictPort) &
VITE_PID=$!

# Wait for Django to answer before declaring victory, so a boot error surfaces here
# rather than as a confusing proxy failure in the browser.
for _ in $(seq 1 30); do
  curl -sf -o /dev/null "http://127.0.0.1:$DJANGO_PORT/api/products/" && break
  kill -0 "$DJANGO_PID" 2>/dev/null || die "Django failed to start (see output above)"
  sleep 1
done

echo
bold "APEXWEAR is running"
info "store:  http://localhost:$VITE_PORT"
info "admin:  http://127.0.0.1:$DJANGO_PORT/admin/   (manage.py createsuperuser)"
info "api:    http://127.0.0.1:$DJANGO_PORT/api/products/"
echo
info "Ctrl-C stops both servers."
echo

# If either server dies, take the other down too rather than leaving half a stack up.
# (`wait -n` would be neater but doesn't exist in bash 3.2, which macOS still ships.)
while kill -0 "$DJANGO_PID" 2>/dev/null && kill -0 "$VITE_PID" 2>/dev/null; do
  sleep 1
done

warn "one of the servers exited — stopping the other"
exit 1
