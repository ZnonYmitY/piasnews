#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/bytedance/Documents/piasnews"
cd "$ROOT"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

git -c rebase.autoStash=true pull --rebase

export PIASNEWS_IMMERSIVE_PUBLISH="${PIASNEWS_IMMERSIVE_PUBLISH:-1}"
export PIASNEWS_IMMERSIVE_APPLY="${PIASNEWS_IMMERSIVE_APPLY:-0}"

node scripts/run_immersive_workbench.mjs
