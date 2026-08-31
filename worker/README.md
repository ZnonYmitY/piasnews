# Piasnews Worker

This Cloudflare Worker provides three narrowly scoped services:

- authenticated GitHub workflow dispatch for the history review console;
- anonymous page-view collection and authenticated aggregate analytics for the admin dashboard.
- role-aware hot-event workbench reads and workflow dispatches.

Review candidates and decisions remain in GitHub JSON. D1 stores analytics only: timestamp, China Standard Time day, page path, and referrer hostname. It stores no IP address, cookie, visitor ID, or review content. Raw analytics rows are retained for 90 days.

## Secrets

- `ADMIN_API_KEY`: legacy single-admin key. It remains supported as the `admin` role.
- `ADMIN_KEYS_JSON`: recommended primary JSON role map stored as a Worker secret, for example
  `{"viewer-key":{"user":"alice","role":"viewer"},"editor-key":{"user":"bob","role":"editor"},"publisher-key":{"user":"carol","role":"publisher"}}`.
- `ADMIN_ADDITIONAL_KEYS_JSON`: optional additive JSON role map. It is merged with the primary map so a new identity can be added without replacing existing administrators. Entries may include `user`, `email`, and `role`.
- `GITHUB_TOKEN`: a fine-grained GitHub token restricted to this repository with Actions write permission.

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
npx wrangler secret put ADMIN_API_KEY
npx wrangler secret put ADMIN_KEYS_JSON
npx wrangler secret put ADMIN_ADDITIONAL_KEYS_JSON
npx wrangler secret put GITHUB_TOKEN
npx wrangler deploy
```

In the GitHub repository, add an Actions variable named `PIASNEWS_WORKER_URL` containing the deployed Worker base URL, without a trailing slash. The Pages workflows write that public URL to `data/runtime-config.json`; it is not a secret. Trigger **Update Piasnews Data** once so the fan page starts reporting views.

Enter the same Worker URL and `ADMIN_API_KEY` in the admin console connection settings. The console stores the URL in `localStorage` and the key in `sessionStorage`.

## Endpoints

- `GET /health`: public health response.
- `GET /session`: returns the authenticated user, role, and permissions.
- `POST /analytics/view`: public anonymous page-view ingestion from allowed origins.
- `GET /analytics/summary?days=7|30|90&end=YYYY-MM-DD`: admin-key protected aggregate metrics. `end` supports paging through complete historical periods inside the 90-day retention window.
- `POST /review`: admin-key protected history-review workflow dispatch.
- `GET /hot-events/config`: authenticated override-layer read; requires `viewer` or above.
- `POST /hot-events/change`: saves a draft with `editor`; activating an override requires `publisher` or `admin`.

Hot-event changes may include a `content_items` snapshot with at most 50 entries. Every entry has a stable `item_id`, source type, source name, title, HTTPS original URL, and optional per-item image, video, and video-poster URLs. Draft snapshots coexist with the active version until a publisher activates them.

The workbench sends the selected event's `updated_at` as `expected_updated_at`. The Worker checks it against the repository before dispatch, and the serialized workflow checks it again before writing. A stale edit receives HTTP 409 and must refresh; edits to different events continue through the same queue without overwriting each other.

Roles are ordered `viewer < editor < publisher < admin`. Keys are never committed or returned by the API. For a larger team, replace keyed sessions with Cloudflare Access or GitHub App/OAuth while keeping the same role checks.
