#!/usr/bin/env bash
#
# APEXWEAR — one-command development bootstrap.
#
#   git clone <repo> && cd apexwear && ./run_dev.sh
#
# Creates whatever is missing (venv, node_modules, .env, database), runs migrations,
# seeds the catalog on first run, then starts Django (:8000), FastAPI search (:8001)
# and Vite (:5173) together. Everything is skipped when already satisfied, so
# re-runs are fast.
#
# FastAPI is optional at runtime (plan.md Phase 2): if it fails to boot, browsing
# falls back to Django and the other two servers keep running.
#
# Supported: macOS and Linux. Requires PostgreSQL, Python >= 3.10 and Node >= 20.19
# to be installed — the script will tell you how to get them if they're missing.
#
# Flags:
#   --force   stop a previous ./run_dev.sh that's still holding the ports, then start
#   --help    show usage
#
# Env overrides:
#   APEXWEAR_DB_NAME   database name (default: apexwear)
#   DJANGO_PORT        default 8000
#   SEARCH_PORT        default 8001
#   VITE_PORT          default 5173

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
ROOT="$PWD"

DB_NAME="${APEXWEAR_DB_NAME:-apexwear}"
DJANGO_PORT="${DJANGO_PORT:-8000}"
SEARCH_PORT="${SEARCH_PORT:-8001}"
VITE_PORT="${VITE_PORT:-5173}"
# vite.config.ts reads these to point its /api, /media and /search proxies.
# search/main.py reads DJANGO_PORT too, to build absolute image URLs.
export DJANGO_PORT
export SEARCH_PORT
MIN_PY_MINOR=10   # Django 5.2 needs Python >= 3.10
PID_FILE="$ROOT/.run_dev.pids"
FORCE=0

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '\033[33mwarning:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
APEXWEAR dev bootstrap — sets up whatever is missing, then runs Django, FastAPI
search and Vite.

  ./run_dev.sh              start (creates venv, node_modules, .env, database as needed)
  ./run_dev.sh --force      stop a previous run still holding the ports, then start
  ./run_dev.sh --help       this message

Environment overrides:
  APEXWEAR_DB_NAME=name     database name           (default: apexwear)
  DJANGO_PORT=8000          Django port             (1024-65535)
  SEARCH_PORT=8001          FastAPI search port     (1024-65535)
  VITE_PORT=5173            Vite port               (1024-65535)

Ctrl-C stops the servers.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --force|-f) FORCE=1 ;;
    --help|-h)  usage; exit 0 ;;
    *) printf 'unknown option: %s\n\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

# Ports below 1024 need root; catch that here rather than as a confusing bind error.
for pv in "DJANGO_PORT:$DJANGO_PORT" "SEARCH_PORT:$SEARCH_PORT" "VITE_PORT:$VITE_PORT"; do
  pname="$(echo "$pv" | cut -d: -f1)"; pval="$(echo "$pv" | cut -d: -f2)"
  case "$pval" in
    ''|*[!0-9]*) die "$pname must be a number, got '$pval'" ;;
  esac
  if [ "$pval" -lt 1024 ] || [ "$pval" -gt 65535 ]; then
    die "$pname must be between 1024 and 65535, got $pval (ports below 1024 need root)"
  fi
done

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

proc_cmd() { ps -p "$1" -o command= 2>/dev/null || true; }

# Does this PID look like part of an APEXWEAR stack we started, rather than some
# unrelated program that happens to sit on the port?
is_our_process() {
  cmd="$(proc_cmd "$1")"
  case "$cmd" in
    *"manage.py runserver"*|*vite*|*run_dev.sh*|*uvicorn*) return 0 ;;
    *) return 1 ;;
  esac
}

# Collect every conflict first, so one message covers both ports instead of making
# you discover them one failed run at a time.
CONFLICT_PIDS=""
CONFLICT_REPORT=""
FOREIGN=0

for port_pair in "$DJANGO_PORT:Django" "$SEARCH_PORT:Search" "$VITE_PORT:Vite"; do
  port="$(echo "$port_pair" | cut -d: -f1)"
  label="$(echo "$port_pair" | cut -d: -f2)"
  pid="$(port_holder "$port")"
  [ -n "$pid" ] || continue
  short="$(proc_cmd "$pid" | cut -c1-70)"
  if is_our_process "$pid"; then
    CONFLICT_REPORT="$CONFLICT_REPORT
    :$port ($label) — PID $pid, a previous APEXWEAR run"
  else
    FOREIGN=1
    CONFLICT_REPORT="$CONFLICT_REPORT
    :$port ($label) — PID $pid, NOT ours: $short"
  fi
  CONFLICT_PIDS="$CONFLICT_PIDS $pid"
done

# Anything we started earlier and recorded, even if it no longer holds a port.
if [ -f "$PID_FILE" ]; then
  while read -r old_pid; do
    [ -n "$old_pid" ] || continue
    [ "$old_pid" = "$$" ] && continue          # never target ourselves
    kill -0 "$old_pid" 2>/dev/null || continue
    case " $CONFLICT_PIDS " in *" $old_pid "*) continue ;; esac
    # The recorded parent goes first: signalling it lets its own trap shut the
    # pair down cleanly instead of us killing the children out from under it.
    is_our_process "$old_pid" && CONFLICT_PIDS="$old_pid $CONFLICT_PIDS"
  done < "$PID_FILE"
fi

if [ -n "$CONFLICT_REPORT" ]; then
  if [ "$FORCE" = "1" ] && [ "$FOREIGN" = "0" ]; then
    info "--force: stopping the previous APEXWEAR run ($(echo $CONFLICT_PIDS | tr -s ' '))"
    for pid in $CONFLICT_PIDS; do
      pkill -TERM -P "$pid" 2>/dev/null || true
      kill -TERM "$pid" 2>/dev/null || true
    done
    sleep 2
    for port_pair in "$DJANGO_PORT:Django" "$SEARCH_PORT:Search" "$VITE_PORT:Vite"; do
      port="$(echo "$port_pair" | cut -d: -f1)"
      leftover="$(port_holder "$port")"
      [ -n "$leftover" ] && kill -KILL "$leftover" 2>/dev/null || true
    done
    sleep 1
    still="$(port_holder "$DJANGO_PORT")$(port_holder "$SEARCH_PORT")$(port_holder "$VITE_PORT")"
    [ -n "$still" ] && die "could not free the ports; stop PID(s)$CONFLICT_PIDS by hand."
  elif [ "$FORCE" = "1" ] && [ "$FOREIGN" = "1" ]; then
    # --force must never kill something that isn't ours.
    die "--force refuses to kill a process it didn't start:
$CONFLICT_REPORT

    Stop it yourself, or pick another port:  DJANGO_PORT=8002 SEARCH_PORT=8003 VITE_PORT=5174 ./run_dev.sh"
  elif [ "$FOREIGN" = "0" ]; then
    die "the ports are held by a previous ./run_dev.sh that's still running:
$CONFLICT_REPORT

    Stop it and start fresh:   ./run_dev.sh --force
    Or run alongside it:       DJANGO_PORT=8002 SEARCH_PORT=8003 VITE_PORT=5174 ./run_dev.sh"
  else
    die "ports already in use:
$CONFLICT_REPORT

    Stop the process(es), or run on different ports:
      DJANGO_PORT=8002 SEARCH_PORT=8003 VITE_PORT=5174 ./run_dev.sh"
  fi
fi

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

# search_ro is the read-only role the FastAPI search service connects as. Creating
# it needs superuser rights, which we may not have — that must not block Django/Vite,
# it just means the search server won't be able to query anything until it's granted.
# Passed through so the role's password isn't hardcoded in the (tracked) SQL file.
SEARCH_RO_PASSWORD="$(sed -n 's/^SEARCH_RO_PASSWORD=//p' "$ROOT/.env" | head -1)"
SEARCH_RO_PASSWORD="${SEARCH_RO_PASSWORD:-search_ro}"
if ! psql_db -q -v ON_ERROR_STOP=1 -v search_ro_password="$SEARCH_RO_PASSWORD" \
     -f "$ROOT/backend/sql/search_ro.sql" >/dev/null 2>&1; then
  warn "could not apply backend/sql/search_ro.sql (needs superuser)."
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
SEARCH_PID=""
VITE_PID=""

# All three servers spawn children (Django's autoreloader, uvicorn's reloader,
# Vite's npm wrapper), so kill the children first, then the parent, then anything
# still holding the ports.
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
  kill_tree "$SEARCH_PID"
  kill_tree "$VITE_PID"
  sleep 1
  for port in "$DJANGO_PORT" "$SEARCH_PORT" "$VITE_PORT"; do
    leftover="$(port_holder "$port")"
    [ -n "$leftover" ] && kill -KILL "$leftover" 2>/dev/null || true
  done
  rm -f "$PID_FILE"
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
(cd "$ROOT" && exec "$PY" -m uvicorn search.main:app --host 127.0.0.1 --port "$SEARCH_PORT") &
SEARCH_PID=$!
(cd "$ROOT/web" && exec npm run dev -- --port "$VITE_PORT" --strictPort) &
VITE_PID=$!

# Recorded so a later run can identify a stack that survived (e.g. the shell was
# SIGKILLed, so no trap ran) instead of guessing from process names. The script's
# own PID comes first so --force can signal the parent and let its trap clean up.
printf '%s\n%s\n%s\n%s\n' "$$" "$DJANGO_PID" "$SEARCH_PID" "$VITE_PID" > "$PID_FILE"

# Wait for Django to answer before declaring victory, so a boot error surfaces here
# rather than as a confusing proxy failure in the browser.
for _ in $(seq 1 30); do
  curl -sf -o /dev/null "http://127.0.0.1:$DJANGO_PORT/api/products/" && break
  kill -0 "$DJANGO_PID" 2>/dev/null || die "Django failed to start (see output above)"
  sleep 1
done

# FastAPI is optional at runtime (plan.md Phase 2) — give it a few seconds, but a
# failure to boot is a warning, not a fatal error. Django + Vite carry on either way.
search_up=0
for _ in $(seq 1 10); do
  curl -sf -o /dev/null "http://127.0.0.1:$SEARCH_PORT/search/health" && { search_up=1; break; }
  kill -0 "$SEARCH_PID" 2>/dev/null || break
  sleep 1
done
if [ "$search_up" = "0" ]; then
  warn "FastAPI search service didn't come up — /shop falls back to the Django catalog API."
  SEARCH_PID=""
fi

echo
bold "APEXWEAR is running"
info "store:   http://localhost:$VITE_PORT"
info "admin:   http://127.0.0.1:$DJANGO_PORT/admin/   (manage.py createsuperuser)"
info "api:     http://127.0.0.1:$DJANGO_PORT/api/products/"
if [ "$search_up" = "1" ]; then
  info "search:  http://127.0.0.1:$SEARCH_PORT/search/products"
fi
echo
info "Ctrl-C stops the servers."
echo

# If Django or Vite dies, take the other down too rather than leaving half a stack
# up. Search isn't in this pair — it's allowed to be down the whole session.
# (`wait -n` would be neater but doesn't exist in bash 3.2, which macOS still ships.)
while kill -0 "$DJANGO_PID" 2>/dev/null && kill -0 "$VITE_PID" 2>/dev/null; do
  sleep 1
done

warn "one of the servers exited — stopping the rest"
exit 1
