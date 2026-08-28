#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTO_SYNC_REPO=0
if [[ -n "${PIASNEWS_REPO_DIR:-}" ]]; then
  ROOT_DIR="$PIASNEWS_REPO_DIR"
elif [[ -f "$SCRIPT_DIR/../scripts/collect_agent_reach_social.py" ]]; then
  ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
elif [[ -f "$HOME/Library/Application Support/piasnews/repo/scripts/collect_agent_reach_social.py" ]]; then
  ROOT_DIR="$HOME/Library/Application Support/piasnews/repo"
  AUTO_SYNC_REPO=1
else
  ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
fi
cd "$ROOT_DIR"

export PATH="/Users/bytedance/.agent-reach-venv/bin:/opt/homebrew/bin:$PATH"

DAYS="${PIASNEWS_DAYS:-3}"
RETENTION_DAYS="${PIASNEWS_RETENTION_DAYS:-7}"
PER_SOURCE="${PIASNEWS_PER_SOURCE:-30}"
IMPORT_JSON="${PIASNEWS_SOCIAL_IMPORT:-/tmp/piasnews-agent-reach-social.json}"
INSTAGRAM_JSON="${PIASNEWS_INSTAGRAM_IMPORT:-/tmp/piasnews-instagram-social.json}"
COMBINED_IMPORT_JSON="${PIASNEWS_SOCIAL_COMBINED_IMPORT:-/tmp/piasnews-social-combined.json}"
COMPACT_JSON="${PIASNEWS_SOCIAL_COMPACT:-/tmp/piasnews-social-input-compact.json}"
COMPACT_CACHE="${PIASNEWS_SOCIAL_COMPACT_CACHE:-/tmp/piasnews-social-input-compact.last.json}"
SUCCESS_MARKER="${PIASNEWS_SOCIAL_SUCCESS_MARKER:-/tmp/piasnews-social.last_success}"
MIN_INTERVAL_SECONDS="${PIASNEWS_SOCIAL_MIN_INTERVAL_SECONDS:-0}"
if [[ "$AUTO_SYNC_REPO" == "1" ]]; then
  DEFAULT_SOCIAL_OUTPUT="/tmp/piasnews-social-normalized.json"
else
  DEFAULT_SOCIAL_OUTPUT="data/social.json"
fi
SOCIAL_OUTPUT="${PIASNEWS_SOCIAL_OUTPUT:-$DEFAULT_SOCIAL_OUTPUT}"
PREVIOUS_SOCIAL_SNAPSHOT="${PIASNEWS_PREVIOUS_SOCIAL_SNAPSHOT:-/tmp/piasnews-social-before-refresh.json}"
REF="${PIASNEWS_WORKFLOW_REF:-main}"

file_mtime_epoch() {
  local path="$1"
  [[ -f "$path" ]] || return 1
  stat -f %m "$path" 2>/dev/null || stat -c %Y "$path" 2>/dev/null
}

if [[ "$MIN_INTERVAL_SECONDS" =~ ^[0-9]+$ ]] && (( MIN_INTERVAL_SECONDS > 0 )) && [[ "${PIASNEWS_FORCE_SOCIAL_PUBLISH:-0}" != "1" ]]; then
  LAST_SUCCESS_EPOCH="$(file_mtime_epoch "$SUCCESS_MARKER" || file_mtime_epoch "$COMPACT_CACHE" || true)"
  if [[ "$LAST_SUCCESS_EPOCH" =~ ^[0-9]+$ ]]; then
    NOW_EPOCH="$(date +%s)"
    AGE_SECONDS=$((NOW_EPOCH - LAST_SUCCESS_EPOCH))
    if (( AGE_SECONDS < MIN_INTERVAL_SECONDS )); then
      REMAINING_SECONDS=$((MIN_INTERVAL_SECONDS - AGE_SECONDS))
      echo "Last successful social collection was ${AGE_SECONDS}s ago; next due in ${REMAINING_SECONDS}s."
      exit 0
    fi
    echo "Last successful social collection was ${AGE_SECONDS}s ago; running catch-up collection."
  else
    echo "No previous successful social collection marker found; running collection."
  fi
fi

if [[ "${PIASNEWS_SYNC_REPO:-$AUTO_SYNC_REPO}" == "1" ]]; then
  if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
    echo "Runtime repository is dirty or conflicted; stopped before social collection and publish." >&2
    exit 3
  fi
  if ! git pull --ff-only origin "$REF"; then
    echo "Runtime repository could not fast-forward; stopped before social collection and publish." >&2
    exit 3
  fi
fi

if [[ "$SOCIAL_OUTPUT" != "data/social.json" ]] && [[ -f data/social.json ]]; then
  cp data/social.json "$SOCIAL_OUTPUT"
fi

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

if [[ -f "$SOCIAL_OUTPUT" ]]; then
  cp "$SOCIAL_OUTPUT" "$PREVIOUS_SOCIAL_SNAPSHOT"
fi

python3 scripts/fetch_social_sources.py \
  --input-json "$COMBINED_IMPORT_JSON" \
  --days "$DAYS" \
  --retention-days "$RETENTION_DAYS" \
  --output "$SOCIAL_OUTPUT"

if [[ -f "$PREVIOUS_SOCIAL_SNAPSHOT" ]]; then
  python3 scripts/validate_social_media.py \
    --before "$PREVIOUS_SOCIAL_SNAPSHOT" \
    --after "$SOCIAL_OUTPUT"
fi

python3 scripts/compact_social_input.py \
  --input "$SOCIAL_OUTPUT" \
  --days "$DAYS" \
  --output "$COMPACT_JSON"

if [[ "${PIASNEWS_SKIP_GITHUB:-0}" == "1" ]]; then
  echo "PIASNEWS_SKIP_GITHUB=1; skipped GitHub variable update and workflow dispatch."
  exit 0
fi

if [[ "${PIASNEWS_FORCE_SOCIAL_PUBLISH:-0}" != "1" ]] && [[ -f "$COMPACT_CACHE" ]] && python3 - "$COMPACT_JSON" "$COMPACT_CACHE" <<'PY'
import json
import sys
from pathlib import Path

def semantic_payload(path: str) -> dict:
    payload = json.loads(Path(path).read_text())
    payload.pop("generated_at", None)
    return payload

raise SystemExit(0 if semantic_payload(sys.argv[1]) == semantic_payload(sys.argv[2]) else 1)
PY
then
  touch "$SUCCESS_MARKER"
  echo "Social compact input unchanged; skipped GitHub variable update and workflow dispatch."
  exit 0
fi

gh variable set PIASNEWS_SOCIAL_INPUT_JSON < "$COMPACT_JSON"
gh workflow run update-piasnews.yml --ref "$REF"
cp "$COMPACT_JSON" "$COMPACT_CACHE"
touch "$SUCCESS_MARKER"
