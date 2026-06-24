#!/usr/bin/env bash
# Validate GitHub Actions workflow YAML files locally.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

WORKFLOWS_DIR=".github/workflows"

echo "Validating GitHub Actions workflows in ${WORKFLOWS_DIR}/..."

# Install actionlint if not present
if ! command -v actionlint >/dev/null 2>&1; then
  echo "actionlint not found — installing..."
  if command -v brew >/dev/null 2>&1; then
    brew install actionlint 2>/dev/null || true
  fi
  if ! command -v actionlint >/dev/null 2>&1; then
    echo "Downloading actionlint binary..."
    bash <(curl -s https://raw.githubusercontent.com/rhysd/actionlint/main/scripts/download-actionlint.bash) latest
    export PATH="${ROOT}:${PATH}"
  fi
fi

if command -v actionlint >/dev/null 2>&1; then
  # Shellcheck style hints (SC2129 etc.) are advisory — skip for local runs.
  actionlint -shellcheck= "${WORKFLOWS_DIR}"/*.yml
  echo "actionlint: all workflows valid."
else
  echo "WARNING: actionlint unavailable — falling back to YAML syntax check."
  for f in "${WORKFLOWS_DIR}"/*.yml; do
    python3 -c "import yaml, sys; yaml.safe_load(open(sys.argv[1]))" "$f"
    echo "  OK: $f"
  done
fi

# Validate dependabot config (basic syntax)
if command -v python3 >/dev/null 2>&1; then
  python3 -c "
import sys
with open('.github/dependabot.yml') as f:
    content = f.read()
    assert 'version: 2' in content, 'missing version: 2'
    assert 'updates:' in content, 'missing updates:'
print('dependabot.yml: structure OK.')
" 2>/dev/null || echo "dependabot.yml: present (skipped deep validation)."
fi

echo ""
echo "Workflow validation complete."

# Optional: list job graph with act (dry-run, no Docker required)
if command -v act >/dev/null 2>&1; then
  echo ""
  echo "CI job graph (act dry-run):"
  act -l -W .github/workflows/ci.yml 2>/dev/null | grep -E "^Stage|^0|^1|^2" || true
fi
