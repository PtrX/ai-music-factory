# Suno model selection

As of 2026-09-25 the official [generation documentation](https://docs.sunoapi.org/suno-api/generate-music)
lists V6 as the standard model; V5_5 is deprecated. The endpoint remains
`POST https://api.sunoapi.org/api/v1/generate`.

Before every new generation AMF fetches the official OpenAPI schema from
`https://docs.sunoapi.org/suno-api/suno-api.json` and selects the highest numeric
standard version from the generation endpoint's model enum (currently V6).
MINI, WILD and other named variants are not standard version upgrades.
The legacy `SUNOAPI_ORG_MODEL` setting is no longer used, preventing stale pins.
Lyrics are sent using the documented `lyrics` field.

Schema lookup has a 15-second timeout. Unavailable or changed schemas fail the
job before the paid generation request; there is no fallback to an old model.
This depends on the provider keeping its published schema current and using
numeric version names. A new incompatible schema or naming format needs review.
The selected model is logged by the worker. Existing provider task IDs continue
to be polled on retries, rather than generating and charging again.

Validation: `npm run typecheck`, `node_modules/.bin/tsx tests/suno-model.test.ts`,
and `node_modules/.bin/tsx tests/sunoapi-metadata.test.ts`. No paid test songs.
