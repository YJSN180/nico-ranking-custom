# Environment Variables Guide

This document describes the environment variables required for the Nico Ranking Custom application.

## Security Notice

**NEVER commit actual credentials to the repository**. Always use placeholder values in documentation and example files.

## Required Environment Variables

### Cloudflare KV Configuration
- `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare account ID
- `CLOUDFLARE_KV_NAMESPACE_ID`: Your KV namespace ID for ranking data
- `CLOUDFLARE_KV_API_TOKEN`: API token with KV read/write permissions
- `RATE_LIMIT_NAMESPACE_ID`: (Optional) KV namespace ID for rate limiting

### Authentication
- `CRON_SECRET`: Secret key for authenticating cron job requests

### Optional Configuration
- `NICO_COOKIES`: Cookie values for accessing sensitive content (default: `sensitive_material_status=accept`)

## Deprecated Variables (To Be Removed)

### Vercel KV (Being replaced by Cloudflare KV)
- `KV_REST_API_URL`: Vercel KV REST API URL
- `KV_REST_API_TOKEN`: Vercel KV authentication token

### Convex (No longer used)
- `NEXT_PUBLIC_CONVEX_URL`: Convex deployment URL
- `CONVEX_DEPLOY_KEY`: Convex deployment key

### Supabase (To be removed)
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key

## Setting Environment Variables

### For Local Development

1. Copy the example file:
   ```bash
   cp .env.local.example .env.local
   ```

2. Fill in your actual values in `.env.local`

### For Vercel Production

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Navigate to Settings → Environment Variables
4. Add each variable for the appropriate environments:
   - Production
   - Preview
   - Development

### Using Scripts (Recommended)

1. Set environment variables in your shell:
   ```bash
   export CLOUDFLARE_ACCOUNT_ID="your_account_id"
   export CLOUDFLARE_KV_NAMESPACE_ID="your_namespace_id"
   export CLOUDFLARE_KV_API_TOKEN="your_api_token"
   ```

2. Run the setup script:
   ```bash
   ./scripts/set-cloudflare-env.sh
   ```

## Getting Credentials

### Cloudflare KV
1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Go to Workers & Pages → KV
3. Create a namespace or use existing one
4. Get your Account ID from the dashboard URL
5. Create an API token with KV read/write permissions

### Cron Secret
Generate a secure random string:
```bash
openssl rand -base64 32
```

## Troubleshooting

### Missing Environment Variables
The application will fail to start if required variables are missing. Check the console for specific error messages.

### Invalid Credentials
If you get authentication errors, verify:
1. API tokens have correct permissions
2. Namespace IDs match your Cloudflare account
3. No extra spaces or newlines in values

## Migration Notes

We are currently migrating from Vercel KV to Cloudflare KV. During the transition:
1. Both sets of credentials may be required
2. The application will gradually phase out Vercel KV usage
3. Monitor logs for any KV-related errors