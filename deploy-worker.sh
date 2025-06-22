#\!/bin/bash
ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID"
API_TOKEN="$CLOUDFLARE_KV_API_TOKEN"
WORKER_NAME="nico-ranking-api-gateway"

# Read the bundled JS file
WORKER_CODE=$(cat workers/api-gateway-r2.js)

# Create the metadata part
METADATA='{
  "main_module": "api-gateway-r2.js",
  "bindings": [
    {
      "type": "kv_namespace",
      "name": "RANKING_DATA",
      "namespace_id": "80f4535c379b4e8cb89ce6dbdb7d2dc9"
    },
    {
      "type": "r2_bucket",
      "name": "R2_BUCKET",
      "bucket_name": "nico-ranking"
    }
  ],
  "vars": {
    "VERCEL_DEPLOYMENT_URL": "https://nico-ranking-custom-yjsns-projects.vercel.app"
  }
}'

# Upload the worker
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -F "metadata=${METADATA};type=application/json" \
  -F "api-gateway-r2.js=@workers/api-gateway-r2.js;type=application/javascript+module"
