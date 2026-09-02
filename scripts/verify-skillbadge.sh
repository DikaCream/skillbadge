#!/usr/bin/env bash
# SkillBadge verification loop — contract + frontend + integration.
#
# Usage:
#   ./scripts/verify-skillbadge.sh                # lint + direct tests
#   ./scripts/verify-skillbadge.sh --frontend     # + frontend typecheck & build
#   ./scripts/verify-skillbadge.sh --integration  # + StudioNet integration tests
#
# Flags can be combined. Requires scripts/setup.sh to have been run once.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
VENV="$ROOT/.venv"

if [ ! -x "$VENV/bin/pytest" ]; then
    echo "venv missing — run ./scripts/setup.sh first" >&2
    exit 1
fi

DO_FRONTEND=0
DO_INTEGRATION=0
for arg in "$@"; do
    case "$arg" in
        --frontend) DO_FRONTEND=1 ;;
        --integration) DO_INTEGRATION=1 ;;
        *)
            echo "unknown option: $arg" >&2
            exit 1
            ;;
    esac
done

echo "==> genvm-lint contracts/skill_badge.py"
"$VENV/bin/genvm-lint" check contracts/skill_badge.py

echo "==> direct tests (tests/direct/test_skill_badge.py)"
"$VENV/bin/pytest" tests/direct/test_skill_badge.py -q

if [ "$DO_FRONTEND" -eq 1 ]; then
    echo "==> frontend-skillbadge typecheck"
    (cd frontend-skillbadge && npm run typecheck)
    echo "==> frontend-skillbadge build"
    (cd frontend-skillbadge && npm run build)
fi

if [ "$DO_INTEGRATION" -eq 1 ]; then
    echo "==> StudioNet integration tests (needs network; ~4 min)"
    "$VENV/bin/gltest" --network studionet tests/integration/test_skill_badge.py -v -s
fi

echo "==> All SkillBadge checks passed."