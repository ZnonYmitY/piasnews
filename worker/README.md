# Piasnews Worker

This Cloudflare Worker provides five narrowly scoped services:

- authenticated GitHub workflow dispatch for the history review console;
- anonymous page-view collection and authenticated aggregate analytics for the admin dashboard;
- role-aware hot-event workbench reads and workflow dispatches;
- a rate-limited DeepSeek gateway for the public Piastri Companion;
- explicitly consented Companion feedback, with private administrator review and export.

The Companion product and the persona distillation source are separate. Distillation evidence, facts, rumor checks, judgment rules, style cards, boundaries, and evals live in [piastri-persona-distillation](https://github.com/ZnonYmitY/piastri-persona-distillation). This repository stores only a pinned generated snapshot plus a product adapter; `worker/companion-runtime.lock.json` records the upstream tag, package version, source hash, and artifact checksum. DeepSeek generates all conversational answers, including boundaries and evidence gaps; the Worker checks selected IDs and the mode/output contract without replacing replies with canned character wording. Current race context remains a Piasnews product responsibility and is reduced to an allow-listed shape before it reaches the model.

History-review candidates and decisions remain in GitHub JSON. The existing `ANALYTICS_DB` D1 binding now serves two separate tables: anonymous analytics (timestamp, China Standard Time day, page path, referrer hostname) and explicitly submitted Companion feedback. Ordinary Companion chat is not automatically stored. Neither table stores an IP address, cookie, or visitor ID. Analytics and feedback have separate cleanup queries; feedback cleanup never touches analytics or GitHub review data.

Feedback retains the selected question/answer and bounded trace only after explicit consent; up to four earlier messages are optional and require `include_context: true`. Feedback is retained for 90 days, excluded from reads after expiry, and deleted by a daily scheduled cleanup and on feedback access. Do not submit secrets or unnecessary personal information in comments or context. Raw submitted text is never printed in Worker logs, published to GitHub/Pages, or sent to the model. Administrators can access it only through authenticated endpoints.

## Secrets

- `ADMIN_API_KEY`: legacy single-admin key. It remains supported as the `admin` role.
- `ADMIN_KEYS_JSON`: recommended primary JSON role map stored as a Worker secret, for example
  `{"viewer-key":{"user":"alice","role":"viewer"},"editor-key":{"user":"bob","role":"editor"},"publisher-key":{"user":"carol","role":"publisher"}}`.
- `ADMIN_ADDITIONAL_KEYS_JSON`: optional additive JSON role map. It is merged with the primary map so a new identity can be added without replacing existing administrators. Entries may include `user`, `email`, and `role`.
- `GITHUB_TOKEN`: a fine-grained GitHub token restricted to this repository with Actions write permission.
- `DEEPSEEK_API_KEY`: the DeepSeek API key used only by the Worker-side Companion endpoint.

Keep all secret values in Worker secrets. Never put them in static admin files, repository variables, or committed configuration.

## Create D1 and Deploy

```bash
cd worker
cp wrangler.toml.example wrangler.toml
npx wrangler@latest d1 create piasnews-analytics
```

Copy the returned database ID into `wrangler.toml`, keep the binding name as `ANALYTICS_DB`, then initialize the remote database:

```bash
npx wrangler@latest d1 execute piasnews-analytics --remote --file=./migrations/0001_analytics.sql
npx wrangler@latest d1 execute piasnews-analytics --remote --file=./migrations/0002_companion_feedback.sql
npx wrangler secret put ADMIN_API_KEY
npx wrangler secret put ADMIN_KEYS_JSON
npx wrangler secret put ADMIN_ADDITIONAL_KEYS_JSON
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler deploy
```

The default Companion model is `deepseek-v4-flash`; override `DEEPSEEK_MODEL` in `wrangler.toml` if needed. Companion requests use per-client and shared-key Cloudflare rate-limit bindings. These are traffic controls, not a strict account-wide spending cap. DeepSeek usage is billed to the configured API account, so monitor usage and configure an account budget where available.

Companion context is shared by both modes: a server clock and validated IANA `time_zone` (default `Asia/Shanghai`), current event/day/next-session context, and selected source records with bounded factual bodies. Scheduled starts never prove live progress or completion. The browser's event label is only an optional focus resolved against server evidence, never an authority for times or facts. Retrieval keeps at most six historical facts, three rumor candidates and eight public sources, with eight-message continuity and linked fact updates. Style observations retain context and counterexamples; full candidate racing rules are only sent for relevant free-mode race discussion.

Latency remains one normal generation with at most one shared format/content repair. Existing calendar/results/hot feeds are fetched in parallel (four-second per-source limit, 60-second edge cache); news/own-post questions add existing items/social feeds to that same parallel read. There is no new planner, embedding API, database or model-review call. Responses expose aggregate `performance` timing/call counts, not prompts or secrets. `npm test` includes outbound-prompt assertions for actual session times, result positions and article summaries, plus false-insufficiency, correction, timezone and history regressions; contract-only smoke tests do not certify factual quality. Standings and unrestricted live web search remain outside the supplied evidence coverage.

The product gateway supplies all 14 canonical routes to the model. Simple greetings belong to `fan_light`; unknown routes are never silently converted into an unrelated-topic fallback. Public-data requests time out after 8 seconds; each model generation is limited to 35 seconds inside one 45-second request budget. Empty content (including upstream HTTP 200), malformed/truncated JSON, invalid routes, missing response languages, and content-contract violations share **one** repair attempt. The repair preserves the allowed conversation and the same retrieved evidence; a second invalid output fails closed. Upstream refusals/content filtering, HTTP failures and timeouts are not bypassed with a format repair. Returned source IDs are checked against the pinned catalog; this is not independent verification of every generated claim.

Feedback uses dedicated `COMPANION_FEEDBACK_RATE_LIMITER` and `COMPANION_FEEDBACK_GLOBAL_LIMITER` bindings, so submitting an answer review does not consume normal chat quota. Development deployments may fall back to the existing Companion bindings with separate prefixed keys. Cloudflare origin checks and traffic limits are abuse controls, not proof that anonymous client-reported data is genuine. Configure the daily Worker cron (currently `17 3 * * *`, UTC) to delete expired feedback even when the app has no visitors.

In the GitHub repository, add an Actions variable named `PIASNEWS_WORKER_URL` containing the deployed Worker base URL, without a trailing slash. The Pages workflows write that public URL to `data/runtime-config.json`; it is not a secret. Trigger **Update Piasnews Data** once so the fan page starts reporting views.

Enter the same Worker URL and `ADMIN_API_KEY` in the admin console connection settings. The console stores the URL in `localStorage` and the key in `sessionStorage`.

## Endpoints

- `GET /health`: public health response.
- `GET /companion/status`: reports whether a model key is configured, provider/model, Skill package version, source hash, and candidate-mode state; never returns a key. `online: true` is configuration status, not a live upstream health check.
- `POST /companion/chat`: allowed-origin, rate-limited DeepSeek generation through the distilled Skill runtime. Requires `disclosure_shown: true`; accepts up to 500 characters and eight history items.
- `POST /companion/feedback`: allowed-browser-origin, rate-limited, explicitly consented feedback submission; see contract below.
- `GET /companion/feedback`: **admin only**, raw feedback list, default 25/max 50 records; supports `rating`, `status`, `category`, exact `feedback_id`, and opaque `cursor` filters.
- `POST /companion/feedback/review`: **admin only**, manual triage status and note; does not train a model or change prompts/rules.
- `GET /companion/feedback/export`: **admin only**, JSON export with the same filters and pagination, default/max 500 records per request. There is no public static export and no CSV formula execution surface.
- `GET /session`: returns the authenticated user, role, and permissions.
- `POST /analytics/view`: public anonymous page-view ingestion from allowed origins.
- `GET /analytics/summary?days=7|30|90&end=YYYY-MM-DD`: admin-key protected aggregate metrics. `end` supports paging through complete historical periods inside the 90-day retention window.
- `POST /review`: admin-key protected history-review workflow dispatch.
- `GET /hot-events/config`: authenticated override-layer read; requires `viewer` or above.
- `POST /hot-events/change`: saves a draft with `editor`; activating an override requires `publisher` or `admin`.

Companion v0.5 uses the same bounded bilingual knowledge retrieval for both modes: selected historical KF/RM records plus applicable current news/calendar/results. Free mode additionally permits fact-compatible performance; grounded mode does not invent missing facts. Successful replies always have `engine: deepseek`; boundary policies no longer contain fixed text. Network/model/validation failures return a non-2xx service error without a character answer. Restricted originals are withheld locally; only abstract boundary instructions reach the model.

Responses expose `retrieved_knowledge_fact_ids`, `retrieved_rumor_item_ids`, `retrieved_public_source_ids` and `retrieval_status`, separately from IDs actually cited. Style evidence appears in `style_sources`, never as factual proof. `validation_trace` reports a same-generation self-check plus bounded local ID/mode/factual-intent/time/output-shape checks, `repair_count`, and a controlled `recovery_reason` when a repair was needed. No additional independent model review is performed. Retrieval is not a whole-web search and these checks are not independent semantic verification.

### Companion generation errors

Generation responses have a server-generated `request_id`. Errors expose a controlled `error_code`, `retryable` and bounded `diagnostic` fields (stage, reason code, upstream HTTP status, canonical finish reason, repair count and elapsed milliseconds). The frontend displays its own localized text and a short request ID, never the provider's raw error message. Retrying uses the failed request's original mode/history and does not duplicate the user message. A model HTTP 200 is not considered a usable answer until non-empty structured output passes validation.

| Code | Meaning |
| --- | --- |
| `COMPANION_UPSTREAM_FAILED` | Provider HTTP/connection failure or explicit refusal; no provider text is exposed. |
| `COMPANION_TIMEOUT` | Shared deadline or upstream timeout; HTTP 504. |
| `COMPANION_INVALID_RESPONSE` | Output shape remains unusable after the bounded repair. |
| `COMPANION_VALIDATION_FAILED` | Output still violates the selected-record/mode/answer contract. |
| `COMPANION_INTERNAL_ERROR` | Unexpected internal failure. |
| `COMPANION_MODEL_UNAVAILABLE` | No model key is configured. |

Failure logs contain only the request ID and those controlled metadata fields. They do not contain prompts, conversation history, raw model answers/refusals, upstream bodies, keys, authorization headers or IP addresses. Diagnostics are separate from consented user feedback and never automatically become a persona training signal.

Hot-event changes may include a `content_items` snapshot with at most 50 entries. Every entry has a stable `item_id`, source type, source name, title, HTTPS original URL, and optional per-item image, video, and video-poster URLs. Draft snapshots coexist with the active version until a publisher activates them.

An editorial position changes order only while the event still meets the ranking's normal `minimum_heat` threshold. It does not keep a zero-heat event on the public ranking, and it cannot displace the structured post-session result hard rule from rank 1. The override remains visible in the workbench after the public event exits, so an editor can inspect or revise it later.

The workbench sends the selected event's `updated_at` as `expected_updated_at`. The Worker checks it against the repository before dispatch, and the serialized workflow checks it again before writing. A stale edit receives HTTP 409 and must refresh; edits to different events continue through the same queue without overwriting each other.

Roles are ordered `viewer < editor < publisher < admin`. Keys are never committed or returned by the API. For a larger team, replace keyed sessions with Cloudflare Access or GitHub App/OAuth while keeping the same role checks.

## Companion feedback contract

Use `Content-Type: application/json`. Actual request bytes are capped at 48 KiB, even when `Content-Length` is missing or incorrect. Unknown fields are discarded rather than stored.

```json
{
  "feedback_id": "87b6817c-7776-47d5-88b6-14f427fa56cd",
  "message_id": "696c4715-af41-4b05-a29a-d4c461d62c95",
  "rating": "negative",
  "categories": ["unnatural", "over_refusal"],
  "comment": "The greeting felt like a refusal.",
  "expected_reply": "A brief natural hello.",
  "consent": true,
  "include_context": false,
  "snapshot": {
    "prompt": "你好",
    "answer_en": "Not really my field.",
    "answer_zh": "这不是我的领域。",
    "history": [],
    "engine": "deepseek",
    "model": "deepseek-v4-flash",
    "route": "unrelated_general",
    "style_card_id": "SC-05",
    "package_version": "0.4.0",
    "source_hash": "client-reported-hash",
    "facts_only": false,
    "app_version": "ui-release",
    "knowledge_fact_ids": [],
    "rumor_item_ids": [],
    "judgment_rule_ids": [],
    "evidence_ids": [],
    "latency_ms": 2200
  }
}
```

- IDs must be UUIDs. `rating` is `positive` or `negative`. Categories are unique, at most four; negative feedback requires at least one.
- Category IDs: `off_persona`, `unnatural`, `fact_error`, `irrelevant`, `over_refusal`, `boundary_miss`, `invented_private`, `rumor_handling`, `translation`, `too_long`, `context_loss`, `technical`, `other`.
- `comment` and `expected_reply`: at most 1,000 characters each. `prompt`: at most 500 (empty is allowed for a welcome message). Each answer language: at most 900, with at least one nonempty.
- `history`: at most four `user`/`assistant` items of 900 characters each; a nonempty history is rejected unless `include_context` is `true`. Consent and context inclusion must be actual booleans.
- Engine: `deepseek`, `boundary`, `ledger`, `fallback`, or `welcome`. Model/route/source hash: at most 80 characters; style/package: 40; app version: 60. Fact/rumor/judgment/evidence ID limits: 4/1/1/8. Latency is null or a finite number from 0 to 3,600,000 milliseconds.
- Snapshot text and IDs are **client-reported**, not server-verified telemetry. A forged style/source ID cannot update the source package, poison model input, or bypass moderation; feedback is never loaded into generation. Feedback is evidence for human investigation, not a vote that globally changes personality.

A new submission returns HTTP 202 with `{accepted:true, feedback_id, deduplicated:false, retention_days:90}`. Retrying the same normalized payload and ID returns HTTP 200 with `deduplicated:true`; attempting a different payload under that ID returns 409 without overwriting the original or its triage. Retry the same payload after a network failure. Validation returns 400, absent/disallowed browser Origin 403, unsupported content type 415, oversized body 413, rate limits 429, and unavailable storage 503.

Private list/export responses contain `{items, next_cursor, total, retention_days:90, client_reported:true}`. Each item contains the normalized submission plus `created_at`, `status`, `review_note`, `reviewed_at`, `reviewed_by`, and `client_reported:true`. `total` follows the filters but ignores pagination. The cursor orders by creation time and UUID, so results have stable ordering even if timestamps match.

To review, send `{feedback_id, status, review_note}` to `/companion/feedback/review`; `status` is `new`, `triaged`, `resolved`, or `dismissed`, and the note is at most 1,000 characters. The response is `{accepted:true, feedback_id, status}`. Verify saved metadata with `GET /companion/feedback?feedback_id=...&limit=1`. Rendering clients must treat all submitted and review strings as untrusted plain text. Review changes are local annotations only: any later persona/source change requires a separately reviewed, scoped patch and regression tests.

Worker tests use Node.js 24's built-in SQLite driver to verify the real migration, idempotency, filtering, retention, and review queries without touching a remote database. Run `npm test` from `worker/`.
