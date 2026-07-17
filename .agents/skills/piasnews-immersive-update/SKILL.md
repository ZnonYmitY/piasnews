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
- Do not open or leave behind Codex Browser, Playwright MCP, OpenCLI Browser, or other temporary Chrome-control windows before this workflow. They can create a visible Chrome UI window while `tell application "Google Chrome"` reports `windows=0`, which prevents the script from targeting the real workbench tabs.
- Do not run `git add .`; the publish script stages only `data/immersive_translations.zh.json`.

## Chrome Control Preflight

Before the standard full update, verify that the Chrome window visible to the user is also visible to Chrome AppleScript. This prevents the known failure where the page and Immersive Translate floating ball are visible, but the repo script sees no controllable Chrome window and therefore sends `Option+A` to no useful target.

Run from the repo root:

```bash
osascript -e 'tell application id "com.google.Chrome" to return "chrome windows=" & (count windows)'
osascript -e 'tell application "System Events"' \
  -e 'tell process "Google Chrome"' \
  -e 'set out to "ui windows=" & (count windows) & linefeed' \
  -e 'repeat with w in windows' \
  -e 'set out to out & (name of w) & linefeed' \
  -e 'end repeat' \
  -e 'return out' \
  -e 'end tell' \
  -e 'end tell'
osascript -e 'tell application id "com.google.Chrome"' \
  -e 'activate' \
  -e 'if (count windows) = 0 then make new window' \
  -e 'set URL of active tab of front window to "https://example.com"' \
  -e 'delay 2' \
  -e 'tell active tab of front window to return execute javascript "document.title"' \
  -e 'end tell'
```

Healthy signs:

- `chrome windows` is at least `1`.
- The System Events window list does not include `OpenCLI Browser`, `Playwright`, `about:blank - belongs to OpenCLI Browser`, or other temporary browser-control windows.
- The JavaScript smoke test returns `Example Domain`.

If System Events shows a visible Chrome window but Chrome AppleScript reports `chrome windows=0`, close temporary automation windows first. Prefer using the owning tool when known, for example closing the Playwright MCP tab. If needed, close the stray UI window directly:

```bash
osascript -e 'tell application "System Events"' \
  -e 'tell process "Google Chrome"' \
  -e 'repeat with w in windows' \
  -e 'if (name of w contains "OpenCLI Browser") then click button 1 of w' \
  -e 'end repeat' \
  -e 'end tell' \
  -e 'end tell'
```

Then rerun the preflight. Do not start the full update until Chrome AppleScript and the visible UI agree on at least one normal Chrome window.

## Standard Full Update

Run from the repo root after the Chrome control preflight passes:

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
- It may exit `2` if the published Pages workbench still contains stale URL-only targets from an older artifact. After the next apply-only deploy, URL-only targets should be filtered out by `scripts/build_immersive_workbench.mjs`.
- With `PIASNEWS_IMMERSIVE_PUBLISH=1`, it commits and pushes mapping changes, then dispatches `update-piasnews.yml` with `apply_only=true`.

If the poll stays at `Immersive workbench translated 0/N`, do not blindly rerun. Diagnose in this order:

1. Check Chrome AppleScript visibility:
   ```bash
   osascript -e 'tell application id "com.google.Chrome" to return "chrome windows=" & (count windows)'
   ```
   If this is `0` while the UI visibly has Chrome windows, close stray `OpenCLI Browser` / Playwright automation windows and rerun the preflight.
2. Check that the workbench tabs are visible to AppleScript:
   ```bash
   osascript -e 'tell application id "com.google.Chrome"' \
     -e 'set out to ""' \
     -e 'repeat with w in windows' \
     -e 'repeat with t in tabs of w' \
     -e 'set out to out & (URL of t) & linefeed' \
     -e 'end repeat' \
     -e 'end repeat' \
     -e 'return out' \
     -e 'end tell'
   ```
   The output must include the three `https://znonymity.github.io/piasnews/immersive/translation-workbench-*.html` URLs.
3. If workbench tabs exist but still show `0/N`, ask the user to confirm whether the Immersive Translate floating ball appears and the page visibly contains Chinese translations. If the page is visibly translated, use the script against the same visible Chrome state; if it is not visibly translated, send `Option+A` again only after selecting the workbench tabs.
4. If Chrome reports `execute javascript` is disabled, the problem is DOM extraction, not `Option+A`. Re-run the JavaScript smoke test from the preflight before continuing.

## Verify

After the script prints a workflow URL or run id:

```bash
gh run list --workflow update-piasnews.yml --limit 5
gh run watch <run-id> --exit-status
git pull --rebase
git status -sb
```

For live-data verification, fetch cache-busted Pages JSON and compare the live workbench targets against the mapping using the same source-text logic as `scripts/apply_immersive_translations.py`. URL-only targets should not appear in a fresh workbench artifact; real title/summary text should be covered.

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
