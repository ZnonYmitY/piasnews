# Piasnews Review Worker

This stateless Cloudflare Worker protects the GitHub workflow-dispatch call used by the V1 review console. It stores no candidate or review data.

## Secrets

- `ADMIN_API_KEY`: a long random key entered into the review console for the current browser session.
- `GITHUB_TOKEN`: a fine-grained GitHub token restricted to this repository with Actions write permission.

Keep both values in Worker secrets. Never put them in the static admin files, repository variables, or committed configuration.

## Deploy

```bash
cd worker
cp wrangler.toml.example wrangler.toml
npx wrangler secret put ADMIN_API_KEY
npx wrangler secret put GITHUB_TOKEN
npx wrangler deploy
```

Set the deployed Worker URL in the review console. The console stores the URL locally and keeps the admin key in `sessionStorage`, so the key disappears when the browser session ends.

For a multi-reviewer version, replace the shared admin key with Cloudflare Access or GitHub App/OAuth authentication. The GitHub JSON files remain the business-data store, so this upgrade still does not require a database.
