#!/usr/bin/env bash
# Validate GitHub Actions workflow YAML files locally.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

WORKFLOWS_DIR=".github/workflows"

echo "Validating GitHub Actions workflows in ${WORKFLOWS_DIR}/..."

if ! command -v actionlint >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    brew install actionlint 2>/dev/null || true
  fi
fi

if command -v actionlint >/dev/null 2>&1; then
  actionlint -shellcheck= "${WORKFLOWS_DIR}"/*.yml
  echo "actionlint: all workflows valid."
else
  echo "WARNING: actionlint unavailable — skipping YAML lint."
  for f in "${WORKFLOWS_DIR}"/*.yml; do
    echo "  Found: $f"
  done
fi

if [ -f .github/dependabot.yml ]; then
  echo "dependabot.yml: present."
fi

echo ""
echo "Workflow validation complete."

if command -v act >/dev/null 2>&1; then
  echo ""
  echo "Security workflow jobs (act dry-run):"
  act -l -W .github/workflows/security.yml 2>/dev/null | head -15 || true
fi
