# Static asset routing

This optional operational change removes the Router invocation for HTTPS requests to `nico-rank.com/_next/static/*`. Cloudflare's proxy and CDN remain in front of Vercel. HTML, APIs, admin routes, image optimization, HTTP traffic, and other public files retain their existing routing.

Merging these scripts does **not** activate the change. There is no deploy hook or application code change. Do not add these exclusions to a Wrangler script's routes: an exclusion has no associated Worker. Manage them separately using the journal below, and verify they survive subsequent Router deployments.

## Why this approach

Worker execution happens before the cache lookup, so a cached response can still incur a Worker request charge. A more specific route with no Worker bypasses less specific Worker routes. The final `*` includes deployment query strings. See [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [route precedence](https://developers.cloudflare.com/workers/configuration/routing/routes/).

Keeping Cloudflare caching matters: moving all static traffic directly to Vercel may transfer costs to Vercel CDN requests and data transfer. [Vercel recommends avoiding reverse proxies in general](https://vercel.com/kb/guide/cloudflare-with-vercel); this procedure is a bounded change to the existing architecture, not a claim that a proxy is universally preferable. [Vercel usage documentation](https://vercel.com/docs/manage-cdn-usage) describes the additional meters to compare.

## Prerequisites — complete before adding exclusions

1. Record the current production commit, immutable deployment, aliases and protection settings, Worker deployment/version, DNS record and all routes. Coordinate a maintenance window with no concurrent configuration or Vercel deployments. Retain an executable recovery path and the necessary permissions.
2. Inspect the production domain in Vercel. Resolve domain validation and certificate issues first. The public hostname must establish a certificate-verified TLS connection **directly to Vercel**, preserving both Host and SNI. A successful connection to a `vercel.app` hostname does not establish this.
3. Prepare the apex CNAME to the DNS target recommended by Vercel, retaining Cloudflare proxy=true and the existing catch-all Router. DNS preparation is a separate production operation with its own saved record and recovery; this tool never changes DNS. Do not disable the proxy, TLS verification, or Deployment Protection to force the preflight through.
4. Confirm ordinary Cloudflare origin resolution, Host/SNI and cache settings are appropriate; custom Origin Rules, Workers Custom Domains, or header/cache transformations require a separate review. The script records DNS, routes, SSL mode and Router deployment, not every zone setting. Restore/retain the existing catch-all before DNS recovery; DNS changes alone cannot undo a no-Worker route.
5. Use the established secret store/CLI credential route to populate `CLOUDFLARE_API_TOKEN` in the process environment. Never paste tokens in command arguments, output, or journal files. Read permissions are required for zone, DNS, SSL settings, routes and Worker deployments. Activation/recovery additionally require **Workers Routes Write** on this zone. Confirm both POST and DELETE authority before activation; this script cannot prove DELETE authority without a mutation.

## Domain and certificate preparation

Use Vercel's [certificate pre-generation](https://vercel.com/docs/domains/pre-generating-ssl-certs) before changing a live origin. Request only the required non-wildcard hostnames, add the temporary DNS-01 TXT records through the approved Cloudflare credential route, finalize issuance and verify TLS with the public Host/SNI against the recommended Vercel target. Remove only the temporary TXT records created by that operation after issuance. Confirm `autoRenew` and the expiration in Vercel; do not store private keys or API credentials in the journal.

Keep the catch-all Router while preparing the proxied apex CNAME. Maintain two separately journaled no-Worker routes for Vercel's own validation endpoints:

- `nico-rank.com/.well-known/acme-challenge/*` (HTTP and HTTPS)
- `nico-rank.com/.well-known/vercel/*` (HTTP and HTTPS)

Exclude these paths from Cloudflare caching with a narrowly scoped Cache Rule. They must reach Vercel using the original hostname. The static routing CLI tolerates these exact no-Worker routes and preserves them; it neither creates nor rolls them back. Do not introduce broad WAF exceptions or disable HTTPS site-wide. Confirm plain HTTP ACME requests are not redirected and Vercel domain config reports `misconfigured: false` and `acceptedChallenges: ["http-01"]`. A fake token returning 404 alone is not proof of successful renewal. See [Vercel proxy requirements](https://vercel.com/kb/guide/how-to-setup-verified-proxy).

For an existing `www` production alias, prepare its certificate and canonical redirect before updating its proxied DNS origin. Verify the redirect preserves path/query and the destination still rejects unauthenticated admin requests. Allow bounded DNS propagation time: an immediate read can still hit the old origin. Vercel may continue showing **Proxy Detected** with valid HTTP verification; this is distinct from **Invalid Configuration**.

Recovery order is important: remove the static exclusion with its journal first; restore/remove separately owned validation routes before restoring a workers.dev DNS origin. Never roll DNS back while a no-Worker route still requires Vercel as origin. Keep unrelated DNS, Workers, WAF, cache rules and deployment protection unchanged. Record validation route/cache rule IDs and original CNAME/redirect fields privately before writes. Do not guess ownership after an interrupted create operation.

## Preflight (read-only)

Node 20+ is required; the CLI uses only Node built-ins. Replace the DNS target with the current value from Vercel. Use new output filenames for every attempt, under ignored `tmp/`.

```sh
mkdir -p tmp
node scripts/static-asset-routing.mjs plan <vercel-dns-target> tmp/static-plan.json
```

Exit 1 / `ready: false` means no activation. The plan records blockers, configuration, deployment ID and asset hashes; it contains no credentials or response cookies. Output files are created with mode 0600 and never silently overwritten.

Preflight checks top and game rankings, a nonempty ranking API response and an unauthenticated admin HEAD rejection. It extracts static references from current production HTML, then compares public and direct-origin responses: certificate-verified TLS, HTTP 200, JS/CSS/WOFF2 MIME, nonempty identical bytes, `nosniff`, and cacheable headers. Redirects, unexpected content or unreviewed route patterns fail closed. The static prefix must have representative assets. Public `/fonts/*` is deliberately excluded: current font responses require revalidation (`max-age=0`). This checks HTML references, not every lazy-loaded chunk or older deployment asset; the browser and retained-asset checks below are also required.

## Activation and rollback

Run activation only as part of an authorized production rollout. A plan expires after 15 minutes. The command repeats the origin probe and configuration comparison immediately before mutation.

```sh
node scripts/static-asset-routing.mjs apply tmp/static-plan.json tmp/static-journal.json
```

The only write is one no-Worker route:

- `https://nico-rank.com/_next/static/*`

[Cloudflare's create route API](https://developers.cloudflare.com/api/resources/workers/subresources/routes/methods/create/) permits omitting `script`. Intent and returned IDs are saved before proceeding. Postflight verifies ranking/auth behavior, asset hashes/MIME, absence of Router headers, and a repeated CDN HIT for each prefix. It does not purge the cache. CDN propagation or a cold-cache MISS can cause a conservative rollback; inspect the evidence before attempting again.

On a failure, the command removes only the recorded routes it created, provided their ownership and the catch-all still match. Manual recovery uses the same journal:

```sh
node scripts/static-asset-routing.mjs rollback tmp/static-journal.json
```

A timeout may mean Cloudflare accepted a POST without returning its ID. The journal retains `pending`; an unrecorded matching route makes recovery report **incomplete**. Inspect routes and audit events, establish ownership, then remove that specific exclusion or restore its Router association through the approved production recovery path. Never delete every matching route or overwrite another operator's changes. An interrupted process cannot automatically recover; keep the saved journal available. Do not change DNS while a bypass remains. A complete CLI rollback leaves DNS alone and verifies public rankings/auth; verify the browser too.

## Acceptance after activation

- In an unauthenticated browser, verify top/game video cards, genre navigation, page 2, fonts, and lazy-loaded JS. Check console/network errors. HTTP 200 with an empty ranking is a failure.
- Verify management APIs still reject unauthenticated requests and current/old immutable Vercel deployment URLs retain their configured protection.
- Fetch retained JS/CSS/font URLs from the previous deployment with their original `dpl` query. Repeat after the next Vercel deployment; never infer old-asset availability solely from current HTML.
- Confirm the catch-all and both API-specific routes remain unchanged. Confirm no-Worker routes remain after the next normal Router deployment. Wrangler version upgrades require reviewing route reconciliation again.
- Compare equal-duration traffic-normalized Worker invocations, CPU, Cloudflare static cache HIT ratio, Vercel CDN requests and data transfer before/after. Allow for an initial cache fill. Roll back if recurring Vercel costs offset the Worker saving, cache behavior deteriorates, or any functional check fails. Keep watching through a full billing cycle before claiming monthly savings.

## Local verification

```sh
npx vitest run __tests__/unit/scripts/static-asset-routing.test.mjs
```

These tests cover scope, freshness/configuration drift, failed probes, partial writes and ownership-preserving rollback. They do not substitute for production activation, propagation, billing or browser checks.
