// api-gateway-r2.ts
var securityHeaders = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' https://*.vercel-scripts.com; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; media-src 'self' https:; object-src 'none'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "X-DNS-Prefetch-Control": "on"
};
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};
var api_gateway_r2_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }
    if (url.pathname === "/api/metadata" && env.R2_BUCKET) {
      try {
        const metadataObject = await env.R2_BUCKET.get("rankings/metadata.json");
        if (metadataObject) {
          const metadata = await metadataObject.text();
          return new Response(metadata, {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=300",
              ...corsHeaders,
              ...securityHeaders
            }
          });
        }
      } catch (error) {
        console.error("Metadata read error:", error);
      }
      return new Response("{}", {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
          ...securityHeaders
        }
      });
    }
    if (url.pathname === "/api/ranking" && env.R2_BUCKET) {
      try {
        const genre = url.searchParams.get("genre") || "all";
        const period = url.searchParams.get("period") || "24h";
        const tag = url.searchParams.get("tag");
        let r2Key;
        let cacheKeySuffix;
        if (tag) {
          const encodedTag = encodeURIComponent(tag);
          r2Key = `rankings/${genre}/${period}/tags/${encodedTag}.json`;
          cacheKeySuffix = `${genre}/${period}/tags/${encodedTag}`;
        } else {
          r2Key = `rankings/${genre}/${period}/all.json`;
          cacheKeySuffix = `${genre}/${period}/all`;
        }
        const cacheKey = new Request(`https://r2-cache.nico-rank.com/ranking/${cacheKeySuffix}`, request);
        const cache = caches.default;
        let response = await cache.match(cacheKey);
        if (response) {
          response = new Response(response.body, response);
          response.headers.set("X-Cache-Status", "HIT");
          return response;
        }
        console.log(`[Worker] Attempting to read from R2: ${r2Key}`);
        const r2Object = await env.R2_BUCKET.get(r2Key);
        if (!r2Object) {
          if (tag) {
            console.log(`[Worker] Tag data not found for ${r2Key}, returning empty result`);
            const emptyResponse = {
              items: [],
              popularTags: [],
              metadata: {
                version: 1,
                updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
                genre,
                period,
                tag
              }
            };
            return new Response(JSON.stringify(emptyResponse), {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                "X-Data-Source": "r2-tag-not-found",
                ...corsHeaders,
                ...securityHeaders
              }
            });
          } else {
            console.log(`R2 miss for ${r2Key}, falling back to Vercel`);
            return proxyToVercel(request, env);
          }
        }
        const data = await r2Object.text();
        console.log(`[Worker] R2 data found for ${r2Key}, size: ${data.length} bytes`);
        response = new Response(data, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=1800, s-maxage=3600",
            "X-Data-Source": "r2-direct",
            "X-Cache-Status": "MISS",
            ...corsHeaders,
            ...securityHeaders
          }
        });
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
        return response;
      } catch (error) {
        console.error("R2 read error:", error);
        return proxyToVercel(request, env);
      }
    }
    return proxyToVercel(request, env);
  }
};
async function proxyToVercel(request, env) {
  const url = new URL(request.url);
  const targetUrl = env.VERCEL_DEPLOYMENT_URL || "https://nico-ranking-custom-yjsns-projects.vercel.app";
  const targetHost = new URL(targetUrl).hostname;
  const proxyUrl = new URL(url.pathname + url.search, targetUrl);
  const headers = new Headers(request.headers);
  headers.set("Host", targetHost);
  headers.set("X-Forwarded-Host", url.hostname);
  headers.set("X-Forwarded-Proto", "https");
  headers.set("X-Real-IP", request.headers.get("CF-Connecting-IP") || "");
  if (env.WORKER_AUTH_KEY) {
    headers.set("X-Worker-Auth", env.WORKER_AUTH_KEY);
  }
  const proxyRequest = new Request(proxyUrl.toString(), {
    method: request.method,
    headers,
    body: request.body,
    redirect: "manual"
  });
  try {
    const response = await fetch(proxyRequest);
    const responseHeaders = new Headers(response.headers);
    Object.entries(securityHeaders).forEach(([key, value]) => {
      responseHeaders.set(key, value);
    });
    Object.entries(corsHeaders).forEach(([key, value]) => {
      responseHeaders.set(key, value);
    });
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
  } catch (error) {
    console.error("Proxy error:", error);
    return new Response("Gateway Error", {
      status: 502,
      headers: {
        "Content-Type": "text/plain",
        ...corsHeaders
      }
    });
  }
}
export {
  api_gateway_r2_default as default
};
