#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export PATH="/Users/bytedance/.agent-reach-venv/bin:$PATH"

DAYS="${PIASNEWS_DAYS:-3}"
PER_SOURCE="${PIASNEWS_PER_SOURCE:-20}"
IMPORT_JSON="${PIASNEWS_SOCIAL_IMPORT:-/tmp/piasnews-agent-reach-social.json}"
COMPACT_JSON="${PIASNEWS_SOCIAL_COMPACT:-/tmp/piasnews-social-input-compact.json}"
COMPACT_CACHE="${PIASNEWS_SOCIAL_COMPACT_CACHE:-/tmp/piasnews-social-input-compact.last.json}"
SOCIAL_OUTPUT="${PIASNEWS_SOCIAL_OUTPUT:-data/social.json}"
REF="${PIASNEWS_WORKFLOW_REF:-main}"

GROUP_ARGS=()
if [[ -n "${PIASNEWS_SOCIAL_GROUPS:-}" ]]; then
  for group in ${PIASNEWS_SOCIAL_GROUPS}; do
    GROUP_ARGS+=(--group "$group")
  done
fi

COLLECT_CMD=(
  python3 scripts/collect_agent_reach_social.py
  --days "$DAYS"
  --per-source "$PER_SOURCE"
  --output "$IMPORT_JSON"
  --update-social
  --social-output "$SOCIAL_OUTPUT"
)
if [[ ${#GROUP_ARGS[@]} -gt 0 ]]; then
  COLLECT_CMD+=("${GROUP_ARGS[@]}")
fi
"${COLLECT_CMD[@]}"

python3 scripts/compact_social_input.py \
  --input "$SOCIAL_OUTPUT" \
  --output "$COMPACT_JSON"

if [[ "${PIASNEWS_SKIP_GITHUB:-0}" == "1" ]]; then
  echo "PIASNEWS_SKIP_GITHUB=1; skipped GitHub variable update and workflow dispatch."
  exit 0
fi

if [[ "${PIASNEWS_FORCE_SOCIAL_PUBLISH:-0}" != "1" ]] && [[ -f "$COMPACT_CACHE" ]] && cmp -s "$COMPACT_JSON" "$COMPACT_CACHE"; then
  echo "Social compact input unchanged; skipped GitHub variable update and workflow dispatch."
  exit 0
fi

gh variable set PIASNEWS_SOCIAL_INPUT_JSON < "$COMPACT_JSON"
gh workflow run update-piasnews.yml --ref "$REF"
cp "$COMPACT_JSON" "$COMPACT_CACHE"
