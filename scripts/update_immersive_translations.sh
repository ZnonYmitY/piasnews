#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/bytedance/Documents/piasnews"
cd "$ROOT"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

git -c rebase.autoStash=true pull --rebase

node scripts/run_immersive_workbench.mjs

