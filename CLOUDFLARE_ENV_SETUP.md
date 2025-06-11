# Cloudflare Environment Variables Setup

This document contains the Cloudflare environment variables that need to be configured in Vercel for the nico-ranking-custom project.

## Required Environment Variables

The following environment variables must be set in Vercel for all environments (Production, Preview, and Development):

### 1. CLOUDFLARE_ACCOUNT_ID
```
5984977746a3dfcd71415bed5c324eb1
```

### 2. CLOUDFLARE_KV_NAMESPACE_ID
```
80f4535c379b4e8cb89ce6dbdb7d2dc9
```

### 3. CLOUDFLARE_KV_API_TOKEN
```
ZfpisofOxDnrUx8MhJCOw8QG1TVO_Z236y6q5Jdj
```

### 4. RATE_LIMIT_NAMESPACE_ID
```
c49751cf8c27464aac68cf030b9e0713
```

## Manual Setup Instructions

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Navigate to your project: `nico-ranking-custom`
3. Go to Settings → Environment Variables
4. For each variable above:
   - Click "Add Variable"
   - Enter the variable name (e.g., `CLOUDFLARE_ACCOUNT_ID`)
   - Paste the corresponding value
   - Select all environments: Production ✓, Preview ✓, Development ✓
   - Click "Save"

## Using Vercel CLI

If you have Vercel CLI installed and authenticated, you can run the provided script:

```bash
# First, ensure you're logged in
vercel login

# Then run the setup script
./scripts/set-cloudflare-env.sh
```

## Triggering a New Deployment

After setting all environment variables, trigger a new deployment:

### Option 1: Via Vercel Dashboard
1. Go to your project's deployments page
2. Click on the latest deployment
3. Click the "..." menu and select "Redeploy"

### Option 2: Via Git
```bash
# Create an empty commit and push
git commit --allow-empty -m "Trigger deployment with new Cloudflare env vars"
git push
```

### Option 3: Via Vercel CLI
```bash
vercel --prod
```

## Verification

After deployment, verify the environment variables are working:
1. Check the deployment logs for any errors
2. Test the API endpoints that use Cloudflare KV
3. Monitor the Functions tab in Vercel for any runtime errors