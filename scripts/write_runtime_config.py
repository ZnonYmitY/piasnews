#!/usr/bin/env python3
"""Write public, non-secret runtime configuration for the static site."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("public/data/runtime-config.json"))
    args = parser.parse_args()

    worker_url = os.environ.get("PIASNEWS_WORKER_URL", "").strip().rstrip("/")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps({"analytics_url": worker_url}, ensure_ascii=True, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
