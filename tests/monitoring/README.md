# Monitoring regression tests

Run from the repository root with existing dependencies and Chromium installed:

```sh
node --test tests/monitoring/*.regression.cjs
```

The `.regression.cjs` names keep these Node test-runner files out of Vitest discovery.

These tests use loopback HTTP fixtures and a mocked GitHub client. They do not
contact production or create issues. Browser probes check both healthy content
and failures (HTTP errors, empty pages, and serious accessibility violations).

`playwright.monitoring.config.ts` is separate from the general E2E configuration:
there is no local application server, API mock, fallback-to-error-page assertion,
or ignored HTTP/TLS failure. Its default target is the public site. Set
`PLAYWRIGHT_BASE_URL` explicitly for local fixtures or previews. Non-GET/HEAD
browser requests are blocked to prevent telemetry submission and mutations.

The existing four-hour schedule runs two Chromium smoke checks and a ranking
API check. Optional `performance` and `accessibility` dispatches select the named
monitoring checks. `full` runs all four monitoring checks on Chromium and Firefox;
it does not mean the entire application regression suite. There is no weekly
trigger. The general E2E tests remain under their existing configuration.

The API probe uses `/api/ranking?genre=all&period=24h`, requiring non-empty `items`
with video IDs and titles. HTTP/network errors, invalid JSON, and empty rankings
fail the probe. It does not infer KV/R2 health from a nonexistent `/api/health`.

```sh
HEALTH_CHECK_BASE_URL=http://127.0.0.1:3000 bash scripts/health-check.sh prod
```

For `blue` or `green`, supply the verified Worker URL in `HEALTH_CHECK_BASE_URL`.
For `all`, also supply `HEALTH_CHECK_BLUE_URL` and `HEALTH_CHECK_GREEN_URL`; no
Worker hostnames are guessed. All probes are GET requests with bounded timeouts.

Real GitHub notification permissions and delivery are not tested locally.
Publishing the workflow requires review of the existing issue-notification policy
and token permissions. A CI HTTP 403 must remain a failed check until its cause
is established; do not bypass access controls to make monitoring green.
