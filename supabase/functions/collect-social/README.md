# Piasnews Supabase social collector

This Edge Function moves the fan-source collection scheduler off the local Mac. It can collect X through the official X API and can also merge externally produced compact social JSON, including Instagram exports from another trusted collector.

Required secrets:

- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`: available automatically in Supabase Edge Functions when configured.

Optional secrets:

- `PIASNEWS_X_BEARER_TOKEN`: X API bearer token used by the Edge Function. If unset, X API collection is skipped and the function can still succeed when at least one external import source succeeds.
- `PIASNEWS_SOCIAL_EXTRA_INPUT_JSON`: compact social JSON to merge directly from an environment value.
- `PIASNEWS_INSTAGRAM_INPUT_JSON`: Instagram compact social JSON to merge directly from an environment value.
- `PIASNEWS_SOCIAL_EXTRA_INPUT_URLS`: comma- or newline-separated compact social JSON endpoints to merge.
- `PIASNEWS_INSTAGRAM_INPUT_URL`: one Instagram compact social JSON endpoint to merge.
- `PIASNEWS_SOCIAL_EXTRA_INPUT_AUTH_BEARER`: bearer token used for generic extra input URLs.
- `PIASNEWS_INSTAGRAM_INPUT_AUTH_BEARER`: bearer token used for the Instagram input URL. Falls back to `PIASNEWS_SOCIAL_EXTRA_INPUT_AUTH_BEARER` when unset.
- `GITHUB_TOKEN` or `PIASNEWS_GITHUB_TOKEN`: token with permission to dispatch `update-piasnews.yml`.
- `PIASNEWS_SOCIAL_READ_TOKEN`: bearer token required by the GET endpoint. If set, configure GitHub secret `PIASNEWS_SOCIAL_INPUT_AUTH_BEARER` with the same value.
- `PIASNEWS_SOCIAL_COLLECT_TOKEN`: bearer token required by non-GET collection requests. Set this when exposing the function publicly so third parties cannot burn X API quota or dispatch GitHub workflows.

The function also accepts a compact social JSON POST body for push-style collectors. Supported item fields are `platform`, `handle` or `source_handle`, `url`, `text` or `summary`, `created_at` or `published_at`, and optional `id`, `kind`, `metrics`, and `language`.

GitHub configuration:

- Set repository variable `PIASNEWS_SOCIAL_INPUT_URL` to the deployed function URL, for example `https://<project>.functions.supabase.co/collect-social`.
- If `PIASNEWS_SOCIAL_READ_TOKEN` is set, set repository secret `PIASNEWS_SOCIAL_INPUT_AUTH_BEARER` to the same token.

Schedule the function in Supabase, for example every 30 minutes on race weekends or every 3 hours normally. The function writes the latest compact import snapshot and can dispatch the GitHub workflow so Pages deployment stays in the existing pipeline. To stop local Instagram browser launches, keep the local launchd job on X only and feed Instagram through `PIASNEWS_INSTAGRAM_INPUT_URL`, `PIASNEWS_INSTAGRAM_INPUT_JSON`, or a POST request to this function.
