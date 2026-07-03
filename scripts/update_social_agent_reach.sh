#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export PATH="/Users/bytedance/.agent-reach-venv/bin:/opt/homebrew/bin:$PATH"

DAYS="${PIASNEWS_DAYS:-3}"
PER_SOURCE="${PIASNEWS_PER_SOURCE:-30}"
IMPORT_JSON="${PIASNEWS_SOCIAL_IMPORT:-/tmp/piasnews-agent-reach-social.json}"
INSTAGRAM_JSON="${PIASNEWS_INSTAGRAM_IMPORT:-/tmp/piasnews-instagram-social.json}"
COMBINED_IMPORT_JSON="${PIASNEWS_SOCIAL_COMBINED_IMPORT:-/tmp/piasnews-social-combined.json}"
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
)
if [[ ${#GROUP_ARGS[@]} -gt 0 ]]; then
  COLLECT_CMD+=("${GROUP_ARGS[@]}")
fi
"${COLLECT_CMD[@]}"

if [[ "${PIASNEWS_COLLECT_INSTAGRAM:-1}" != "0" ]]; then
  if ! node scripts/collect_instagram_chrome.mjs \
    --output "$INSTAGRAM_JSON" \
    --days "$DAYS"; then
    echo "Instagram Chrome collection failed or produced no recent items; continuing with X import." >&2
  fi
fi

python3 - "$IMPORT_JSON" "$INSTAGRAM_JSON" "$COMBINED_IMPORT_JSON" "$DAYS" <<'PY'
import json
import sys
from pathlib import Path

items = []
statuses = []
sources = []
for raw_path in sys.argv[1:3]:
    path = Path(raw_path)
    if not path.exists():
        continue
    payload = json.loads(path.read_text())
    sources.append(payload.get("source") or str(path))
    items.extend(payload.get("items") or [])
    statuses.extend(payload.get("source_status") or [])
output = {
    "source": "+".join(sources) or "piasnews-local-social",
    "window_days": int(sys.argv[4]),
    "items": items,
    "source_status": statuses,
}
Path(sys.argv[3]).write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n")
if not any(status.get("ok") for status in statuses):
    print("No social source collected successfully; skipped social publish.", file=sys.stderr)
    sys.exit(2)
PY

python3 scripts/fetch_social_sources.py \
  --input-json "$COMBINED_IMPORT_JSON" \
  --days "$DAYS" \
  --output "$SOCIAL_OUTPUT"

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
