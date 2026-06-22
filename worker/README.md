# Piasnews Worker

This Cloudflare Worker provides two narrowly scoped services:

- authenticated GitHub workflow dispatch for the history review console;
- anonymous page-view collection and authenticated aggregate analytics for the admin dashboard.

Review candidates and decisions remain in GitHub JSON. D1 stores analytics only: timestamp, China Standard Time day, page path, and referrer hostname. It stores no IP address, cookie, visitor ID, or review content. Raw analytics rows are retained for 90 days.

## Secrets

- `ADMIN_API_KEY`: a long random key entered into the admin console for the current browser session.
- `GITHUB_TOKEN`: a fine-grained GitHub token restricted to this repository with Actions write permission.

Keep both values in Worker secrets. Never put them in static admin files, repository variables, or committed configuration.

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
npx wrangler secret put GITHUB_TOKEN
npx wrangler deploy
```

In the GitHub repository, add an Actions variable named `PIASNEWS_WORKER_URL` containing the deployed Worker base URL, without a trailing slash. The Pages workflows write that public URL to `data/runtime-config.json`; it is not a secret. Trigger **Update Piasnews Data** once so the fan page starts reporting views.

Enter the same Worker URL and `ADMIN_API_KEY` in the admin console connection settings. The console stores the URL in `localStorage` and the key in `sessionStorage`.

## Endpoints

- `GET /health`: public health response.
- `POST /analytics/view`: public anonymous page-view ingestion from allowed origins.
- `GET /analytics/summary?days=7|30`: admin-key protected aggregate metrics.
- `POST /review`: admin-key protected history-review workflow dispatch.

For multiple reviewers, replace the shared key with Cloudflare Access or GitHub App/OAuth authentication.
