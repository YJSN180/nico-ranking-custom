#!/bin/bash

# Cloudflare Pages build configuration update

CF_API_TOKEN="ZfpisofOxDnrUx8MhJCOw8QG1TVO_Z236y6q5Jdj"
ACCOUNT_ID="5984977746a3dfcd71415bed5c324eb1"
PROJECT_NAME="nico-ranking-custom"

echo "Updating Cloudflare Pages build configuration..."

curl -X PATCH "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT_NAME}" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "build_config": {
      "build_command": "npm install && npm run build:cloudflare-pages",
      "destination_dir": ".vercel/output/static",
      "root_dir": "",
      "web_analytics_tag": null,
      "web_analytics_token": null
    }
  }'

echo -e "\n\nTriggering new deployment..."

curl -X POST "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT_NAME}/deployments" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{}'