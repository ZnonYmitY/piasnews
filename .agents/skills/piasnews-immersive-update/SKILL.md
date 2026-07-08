---
name: piasnews-immersive-update
description: Run and maintain the Piasnews Immersive Translate mapping pipeline. Use when the user asks to update 沉浸式翻译, refresh/upload Immersive mappings, replace online Chinese with Immersive Translate output, trigger the translation workbench, or diagnose the Piasnews Immersive launchd schedule.
---

# Piasnews Immersive Update

Use this skill for the local Chrome -> Immersive Translate -> mapping -> GitHub Pages pipeline in `/Users/bytedance/Documents/piasnews`.

## What This Skill Does

The pipeline captures browser-extension translations that cannot run in GitHub Actions:

1. Sync the repository.
2. Build or use the published workbench at `https://znonymity.github.io/piasnews/immersive/`.
3. Open Chrome with the user's existing Immersive Translate extension.
4. Trigger Immersive Translate with `Option+A`.
5. Scroll every workbench tab so the extension translates all rows.
6. Read translated DOM through Chrome Apple Events.
7. Write `data/immersive_translations.zh.json`.
8. Commit and push only the mapping file.
9. Trigger `update-piasnews.yml` with `apply_only=true`.
10. Watch the workflow and verify live Pages JSON.

The online workflow then runs Argos fallback, applies only `engine=immersive_translate_chrome` mappings, performs deterministic auto-repair, audits badcases, and deploys GitHub Pages. `apply_only=true` skips fresh news/social/calendar fetching so new English text is not introduced while applying a just-captured mapping.

## Preconditions

- Chrome must have `View > Developer > Allow JavaScript from Apple Events` enabled.
- macOS must allow the running shell/Codex process to control Chrome and System Events.
- Immersive Translate's page translation action must be bound to `Option+A`.
- Do not use Codex's browser-control surfaces for this domain if they were previously blocked. Use the repo script and Apple Events path.
- Do not run `git add .`; the publish script stages only `data/immersive_translations.zh.json`.

## Standard Full Update

Run from the repo root:

```bash
git status -sb
git pull --rebase
PIASNEWS_IMMERSIVE_IGNORE_COOLDOWN=1 \
PIASNEWS_IMMERSIVE_PUBLISH=1 \
PIASNEWS_IMMERSIVE_APPLY=0 \
PIASNEWS_IMMERSIVE_PUBLIC_BASE_URL=https://znonymity.github.io/piasnews/immersive \
PIASNEWS_IMMERSIVE_TARGETS=all \
PIASNEWS_IMMERSIVE_TABS=3 \
node scripts/run_immersive_workbench.mjs --trigger-shortcut Option+A --wait-ms 180000 --poll-ms 5000
```

Expected behavior:

- The script opens three online workbench tabs.
- It sends `Option+A`, scrolls each page, and polls `Immersive workbench translated X/Y`.
- It may exit `2` when the only remaining untranslated targets are pure URLs. That is acceptable after verification.
- With `PIASNEWS_IMMERSIVE_PUBLISH=1`, it commits and pushes mapping changes, then dispatches `update-piasnews.yml` with `apply_only=true`.

## Verify

After the script prints a workflow URL or run id:

```bash
gh run list --workflow update-piasnews.yml --limit 5
gh run watch <run-id> --exit-status
git pull --rebase
git status -sb
```

For live-data verification, fetch cache-busted Pages JSON and compare the live workbench targets against the mapping using the same source-text logic as `scripts/apply_immersive_translations.py`. Treat pure `https://t.co/...` targets as allowed missing translations; real title/summary text should be covered.

## Scheduled Job Diagnosis

The launchd template is `scripts/com.znonymity.piasnews.immersive.plist`; the wrapper is `scripts/update_immersive_translations.sh`.

Check the loaded job:

```bash
launchctl print gui/$(id -u)/com.znonymity.piasnews.immersive
tail -80 /tmp/piasnews-immersive.log
tail -80 /tmp/piasnews-immersive.err
```

Healthy signs:

- `run interval = 1800 seconds`
- recent exit code `0`
- logs show either skipped because no targets, or captured mappings and triggered apply-only workflow

Unhealthy signs:

- `last exit code = 128`
- `Pulling is not possible because you have unmerged files`
- repeated `Chrome blocked JavaScript from Apple Events`
- cooldown state in `/private/tmp/piasnews-immersive-state.json` after permissions are fixed

If the scheduler clone under `~/Library/Application Support/piasnews/repo` has conflicts, inspect it first. Fix or reclone it only when the user has approved writing outside the workspace.

## Reporting

In the final response, report:

- captured count and whether any missing targets are only URLs
- mapping commit hash
- workflow run id and success/failure
- live coverage count
- whether `git status -sb` is clean
- if asked, whether the launchd schedule is loaded and healthy
