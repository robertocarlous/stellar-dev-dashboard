#!/usr/bin/env bash
# Run CI pipeline steps locally — mirrors .github/workflows/ci.yml stages.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

NODE_VERSION="${NODE_VERSION:-20}"
export CI=true

echo "═══════════════════════════════════════════════════════════════"
echo "  Stellar Dev Dashboard — Local CI Pipeline"
echo "  Node: $(node --version 2>/dev/null || echo 'not installed')"
echo "═══════════════════════════════════════════════════════════════"

step() {
  echo ""
  echo "── $1 ──"
}

# Stage 1 — Quality Gate
step "Stage 1: Lint & Format"
npm run lint
npm run format:check

step "Stage 1: Type Check"
npm run type-check

# Stage 2 — Test Gate
step "Stage 2: Unit & Integration Tests"
npm run test:coverage

# Stage 3 — Build Gate
step "Stage 3: Production Build"
npm run build

step "Stage 3: Bundle Size Check"
MAIN_CHUNK=$(ls dist/assets/index-*.js dist/assets/main-*.js 2>/dev/null | head -n 1)
if [ -z "$MAIN_CHUNK" ]; then
  echo "ERROR: Could not locate main entry chunk in dist/assets/"
  exit 1
fi
GZIP_BYTES=$(gzip -c "$MAIN_CHUNK" | wc -c | tr -d ' ')
GZIP_KB=$(( GZIP_BYTES / 1024 ))
BUDGET_KB=500
echo "Main chunk: $MAIN_CHUNK"
echo "Gzipped size: ${GZIP_KB} KB (budget: ${BUDGET_KB} KB)"
if [ "$GZIP_KB" -gt "$BUDGET_KB" ]; then
  echo "ERROR: Bundle exceeds ${BUDGET_KB} KB budget by $(( GZIP_KB - BUDGET_KB )) KB"
  exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Local CI pipeline passed."
echo "═══════════════════════════════════════════════════════════════"
