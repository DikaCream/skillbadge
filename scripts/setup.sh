#!/usr/bin/env bash
# One-shot environment setup for this machine's flaky network layer.
#
# What it does:
#   1. Creates a Python venv (.venv) if missing.
#   2. Installs the project pip.conf into .venv/pip.conf (the location pip
#      actually reads for a venv): official PyPI index + no HTTP cache, which
#      sidesteps the corrupted-cache / hash-mismatch failures seen here.
#   3. Installs requirements into the venv.
#
# Optional flags (can be combined):
#   --frontend  Install frontend deps with a project-local npm cache
#               (.npm-cache/) instead of the flaky global npm cache.
#   --warmup    Run genvm-lint once so its first-run node/pyright download
#               happens now, instead of timing out your first lint call.
#
# Usage:
#   ./scripts/setup.sh                 # venv + pip deps
#   ./scripts/setup.sh --frontend
#   ./scripts/setup.sh --warmup
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

PY="${PYTHON:-python3}"
VENV="$ROOT/.venv"
PIP_CONF_SRC="$ROOT/pip.conf"

DO_FRONTEND=0
DO_WARMUP=0
for arg in "$@"; do
    case "$arg" in
        --frontend) DO_FRONTEND=1 ;;
        --warmup) DO_WARMUP=1 ;;
        *)
            echo "unknown option: $arg" >&2
            exit 1
            ;;
    esac
done

echo "==> Python venv ($VENV)"
if [ ! -x "$VENV/bin/python" ]; then
    "$PY" -m venv "$VENV"
fi

echo "==> pip.conf -> $VENV/pip.conf"
cp "$PIP_CONF_SRC" "$VENV/pip.conf"

echo "==> pip install -r requirements.txt"
"$VENV/bin/pip" install -r requirements.txt

if [ "$DO_FRONTEND" -eq 1 ]; then
    echo "==> frontend-skillbadge npm install (project-local cache $ROOT/.npm-cache)"
    (cd "$ROOT/frontend-skillbadge" && npm install --no-fund --no-audit --cache "$ROOT/.npm-cache")
fi

if [ "$DO_WARMUP" -eq 1 ]; then
    echo "==> genvm-lint first-run warmup"
    "$VENV/bin/genvm-lint" check contracts/skill_badge.py >/dev/null 2>&1 || true
fi

echo "==> Done. Activate with: source $VENV/bin/activate"