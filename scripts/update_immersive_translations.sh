#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

git -c rebase.autoStash=true pull --rebase

export PIASNEWS_IMMERSIVE_PUBLISH="${PIASNEWS_IMMERSIVE_PUBLISH:-1}"
export PIASNEWS_IMMERSIVE_APPLY="${PIASNEWS_IMMERSIVE_APPLY:-0}"
export PIASNEWS_IMMERSIVE_PUBLIC_BASE_URL="${PIASNEWS_IMMERSIVE_PUBLIC_BASE_URL:-https://znonymity.github.io/piasnews/immersive}"
export PIASNEWS_IMMERSIVE_TARGETS="${PIASNEWS_IMMERSIVE_TARGETS:-non-immersive}"
export PIASNEWS_IMMERSIVE_TABS="${PIASNEWS_IMMERSIVE_TABS:-3}"
export PIASNEWS_IMMERSIVE_TRIGGER_SHORTCUT="${PIASNEWS_IMMERSIVE_TRIGGER_SHORTCUT:-Option+A}"
export PIASNEWS_IMMERSIVE_WAIT_MS="${PIASNEWS_IMMERSIVE_WAIT_MS:-180000}"
export PIASNEWS_IMMERSIVE_POLL_MS="${PIASNEWS_IMMERSIVE_POLL_MS:-5000}"

node scripts/run_immersive_workbench.mjs
