# Piasnews Supabase social collector

This Edge Function moves the fan-source collection scheduler off the local Mac when an official X API bearer token is available.

Required secrets:

- `PIASNEWS_X_BEARER_TOKEN`: X API bearer token used by the Edge Function.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`: available automatically in Supabase Edge Functions when configured.

Optional secrets:

- `GITHUB_TOKEN` or `PIASNEWS_GITHUB_TOKEN`: token with permission to dispatch `update-piasnews.yml`.
- `PIASNEWS_SOCIAL_READ_TOKEN`: bearer token required by the GET endpoint. If set, configure GitHub secret `PIASNEWS_SOCIAL_INPUT_AUTH_BEARER` with the same value.
- `PIASNEWS_SOCIAL_COLLECT_TOKEN`: bearer token required by non-GET collection requests. Set this when exposing the function publicly so third parties cannot burn X API quota or dispatch GitHub workflows.

GitHub configuration:

- Set repository variable `PIASNEWS_SOCIAL_INPUT_URL` to the deployed function URL, for example `https://<project>.functions.supabase.co/collect-social`.
- If `PIASNEWS_SOCIAL_READ_TOKEN` is set, set repository secret `PIASNEWS_SOCIAL_INPUT_AUTH_BEARER` to the same token.

Schedule the function in Supabase, for example every 30 minutes on race weekends or every 3 hours normally. The function writes the latest compact import snapshot and can dispatch the GitHub workflow so Pages deployment stays in the existing pipeline.
