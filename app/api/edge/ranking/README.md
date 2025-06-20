# Edge Runtime API Route

This API route uses Vercel Edge Functions which provide:
- 1,000,000 free invocations per month (vs 100,000 for Node.js)
- Lower latency due to edge deployment
- Automatic fallback when Node.js functions are rate limited

## Usage

The client automatically falls back to this Edge endpoint when:
1. The main `/api/ranking` endpoint returns 429 (rate limited)
2. The main endpoint is unavailable

## Limitations

Edge Functions have some restrictions:
- No native Node.js modules
- Limited to Web API compatible libraries
- 1MB response size limit

The implementation uses fetch() and Web Streams API for Cloudflare KV access.