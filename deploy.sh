#!/usr/bin/env bash
set -euo pipefail

# ============================================
# Typesense Dashboard — deployment script
# ============================================
#
# Runs ON the server as the ubuntu user, from the repo checkout.
#
#   ./deploy.sh            pull main + build + swap into WEB_ROOT + verify
#   ./deploy.sh rollback   swap the previous build back (no rebuild)
#
# The dashboard is a static SPA. nginx serves WEB_ROOT at /typesense-dashboard/, so a
# deploy is a directory swap: no restart and no nginx reload.
#
# Set these once for this server (or pass them as environment variables):
#   WEB_ROOT     directory nginx serves at /typesense-dashboard/ (nginx `root`/`alias` target)
#   VERIFY_URL   public URL used for the post-deploy check

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
say()  { echo -e "${BLUE}▸${NC} $1"; }
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }
die()  { echo -e "${RED}✗${NC} $1"; exit 1; }

WEB_ROOT="${WEB_ROOT:-}"
VERIFY_URL="${VERIFY_URL:-https://typesense.printo.in/typesense-dashboard/}"
EXPECTED_BRANCH="${EXPECTED_BRANCH:-main}"
PUBLIC_PATH="${PUBLIC_PATH:-/typesense-dashboard}"

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
LAST_DEPLOY_FILE="$REPO_DIR/.last-deploy-commit"
MODE="${1:-deploy}"

[ -n "$WEB_ROOT" ] || die "WEB_ROOT is not set. Find nginx's root for /typesense-dashboard/ and run: WEB_ROOT=/path ./deploy.sh"
[ -d "$WEB_ROOT" ] || die "WEB_ROOT '$WEB_ROOT' does not exist."
PREV_ROOT="${WEB_ROOT}.prev"
NEW_ROOT="${WEB_ROOT}.new"

# nvm only loads in interactive shells; pin the node the build needs so the script
# also works over plain `ssh host ./deploy.sh`. Quasar app-vite needs Node 18+.
PINNED_NODE="/home/ubuntu/.nvm/versions/node/v22.22.0/bin"
[ -d "$PINNED_NODE" ] && export PATH="$PINNED_NODE:$PATH"
command -v node >/dev/null 2>&1 || die "node not on PATH (expected $PINNED_NODE)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "Node $(node -v) is too old; need 20 or newer."

# --- one deploy at a time -----------------------------------------------------
LOCK_FILE="/tmp/typesense-dashboard-deploy.lock"
if command -v flock >/dev/null 2>&1; then
  exec 9>>"$LOCK_FILE"
  flock -n 9 || die "Another deploy is running."
else
  warn "flock not found — no concurrent-deploy lock."
fi

# Failed checks accumulate and force a non-zero exit at the end, so a broken deploy
# never looks like a good one.
FAILURES=0; FAILURE_LIST=()
fail() { FAILURES=$((FAILURES + 1)); FAILURE_LIST+=("$1"); echo -e "${RED}✗${NC} $1"; }

finish() {
  echo ""
  if [ "$FAILURES" -gt 0 ]; then
    echo -e "${RED}Finished with ${FAILURES} failed check(s):${NC}"
    for f in "${FAILURE_LIST[@]}"; do echo -e "  ${RED}✗${NC} $f"; done
    exit 1
  fi
  echo -e "${GREEN}Deploy verified.${NC}"
}

# The page must reference the entry script of the build we just put in place. Pass the
# expected entry file name so an old build still being served is caught.
verify() {
  local entry="$1" body="" i
  for i in 1 2 3 4 5; do
    body="$(curl -fsS --max-time 10 "$VERIFY_URL" 2>/dev/null || true)"
    if [ -n "$body" ] && { [ -z "$entry" ] || grep -q "$entry" <<<"$body"; }; then
      ok "$VERIFY_URL serves ${entry:-the page}"
      return
    fi
    sleep 2
  done
  fail "$VERIFY_URL did not serve ${entry:-the page} (old build cached, or nginx root is not WEB_ROOT?)"
}

# --- rollback -----------------------------------------------------------------
if [ "$MODE" = "rollback" ]; then
  [ -d "$PREV_ROOT" ] || die "No $PREV_ROOT — nothing to roll back to."
  say "Swapping $PREV_ROOT back in"
  rm -rf "$NEW_ROOT"
  mv "$WEB_ROOT" "$NEW_ROOT"
  mv "$PREV_ROOT" "$WEB_ROOT"
  mv "$NEW_ROOT" "$PREV_ROOT"
  ok "Rolled back (the replaced build is now in $PREV_ROOT)"
  verify "$(grep -o 'assets/index-[^"]*\.js' "$WEB_ROOT/index.html" | head -1 || true)"
  finish
  exit 0
fi

[ "$MODE" = "deploy" ] || { echo "Usage: $0 [deploy|rollback]"; exit 1; }

# --- deploy -------------------------------------------------------------------
CURRENT_BRANCH="$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD)"
[ "$CURRENT_BRANCH" = "$EXPECTED_BRANCH" ] \
  || die "Checkout is on '$CURRENT_BRANCH' but this deploys '$EXPECTED_BRANCH'. Refusing."

if [ -n "$(git -C "$REPO_DIR" status --porcelain --untracked-files=no)" ]; then
  die "Working tree has local modifications — resolve them first."
fi

PREVIOUS="$(git -C "$REPO_DIR" rev-parse HEAD)"
say "Pulling origin/$EXPECTED_BRANCH (was: $(git -C "$REPO_DIR" log --oneline -1))"
git -C "$REPO_DIR" pull --ff-only origin "$EXPECTED_BRANCH" || die "git pull failed — nothing changed."
printf '%s\n' "$PREVIOUS" > "$LAST_DEPLOY_FILE"

# Dependencies: only when the lockfile changed or node_modules is missing. `npm ci` is
# strict about the lockfile matching package.json; if it does not, fall back to
# `npm install` and put the lockfile back so the next deploy's clean-tree check passes.
cd "$REPO_DIR"
if [ ! -d node_modules ] || git diff --name-only "$PREVIOUS"..HEAD | grep -qE '^package(-lock)?\.json$'; then
  say "Installing dependencies"
  if ! npm ci --no-audit --no-fund; then
    warn "npm ci failed (lockfile out of sync) — falling back to npm install"
    npm install --no-audit --no-fund
    git checkout -- package-lock.json 2>/dev/null || true
  fi
else
  say "No dependency changes — skipping install"
fi

say "Building (PUBLIC_PATH=$PUBLIC_PATH) — the live site keeps serving meanwhile"
rm -rf dist/spa
PUBLIC_PATH="$PUBLIC_PATH" npm run build || die "Build FAILED — aborting before the swap. Old build still serving."
[ -f dist/spa/index.html ] || die "Build produced no dist/spa/index.html — aborting."
ENTRY="$(grep -o 'assets/index-[^"]*\.js' dist/spa/index.html | head -1 || true)"
ok "Build complete (${ENTRY:-no entry found})"

# Stage the new site next to the live one. Carry the old hashed assets forward so tabs
# already open on the old build can still lazy-load their chunks; the new build's files
# go on top, and anything older than a week is pruned.
rm -rf "$NEW_ROOT"
mkdir -p "$NEW_ROOT"
if [ -d "$WEB_ROOT/assets" ]; then
  cp -Rp "$WEB_ROOT/assets" "$NEW_ROOT/assets"
fi
cp -R dist/spa/. "$NEW_ROOT/"
find "$NEW_ROOT/assets" -type f -mtime +7 -delete 2>/dev/null || true
find "$NEW_ROOT/assets" -mindepth 1 -type d -empty -delete 2>/dev/null || true

# Swap. The gap between the two renames is microseconds. The old site stays in
# $PREV_ROOT for `./deploy.sh rollback`.
rm -rf "$PREV_ROOT"
mv "$WEB_ROOT" "$PREV_ROOT"
mv "$NEW_ROOT" "$WEB_ROOT"
ok "Swapped into $WEB_ROOT (previous kept in $PREV_ROOT)"

verify "$ENTRY"
ok "Deployed commit: $(git -C "$REPO_DIR" log --oneline -1)"
finish
