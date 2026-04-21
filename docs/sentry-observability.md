# Sentry Observability v1

## Scope
- 2 projects:
  - `web`: Next.js browser / server / edge
  - `workers`: Cloudflare Workers and `video-stats-updater`
- v1 は `Errors + Targeted Tracing` のみです。
- `Session Replay` と `Sentry Logs` は入れません。

## Environment Variables
- Web runtime:
  - `NEXT_PUBLIC_SENTRY_DSN`
- Workers runtime:
  - `SENTRY_WORKER_DSN`
- Build / sourcemap upload:
  - `SENTRY_AUTH_TOKEN`
  - `SENTRY_ORG`
  - `SENTRY_PROJECT_WEB`
  - `SENTRY_PROJECT_WORKERS`

## Runtime Mapping
- Next.js environment:
  - `VERCEL_ENV ?? NODE_ENV`
- Workers environment:
  - `env.ENVIRONMENT ?? 'production'`
- release は必須にしていません。Debug IDs ベースで sourcemap を解決します。
- Worker runtime secrets (`WORKER_AUTH_KEY`, `SENTRY_WORKER_DSN`) は tracked `wrangler*.toml` に置かず、Cloudflare Secrets に設定します。

## Privacy Policy
- `sendDefaultPii: false`
- 送らないもの:
  - cookies
  - Authorization
  - request / response body
  - raw query string
  - raw URL search/hash
  - admin credential values
  - mylist memo / title
  - custom ranking title
  - tag search text
- 許可するもの:
  - route family
  - status code
  - enum / boolean / count
  - environment
  - worker name / version

## Sampling
- errors: 100%
- browser pageload / navigation:
  - production 5%
  - preview 100%
- Next server route handlers:
  - production 10%
  - preview 100%
- Workers:
  - `/api/ranking`, `/api/tags/autocomplete`, `/api/metadata`, `scheduled` は 10%
  - static passthrough / thumbnail / debug routes は 0%

## Notes
- Browser transport は direct ingest です。`connect-src` に `https://*.ingest.sentry.io` を許可します。
- Next.js と Workers の sourcemap upload は build / deploy で有効化します。
- `/api/debug-log` の `info` は Sentry に送っていません。
- trace 名は raw URL ではなく route family に寄せています。

## Smoke Checklist
- browser intentional error が `web` project に届く
- Next route error が `web` project に届く
- active Worker error が `workers` project に届く
- `video-stats-updater` check-in が Crons に届く
- stack trace が 3 runtime で readable
- event payload に cookie / Authorization / raw query / memo / title / tag text がない
