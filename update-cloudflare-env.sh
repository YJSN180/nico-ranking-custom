#!/bin/bash

# Update Cloudflare Pages environment variables

CF_API_TOKEN="ZfpisofOxDnrUx8MhJCOw8QG1TVO_Z236y6q5Jdj"
ACCOUNT_ID="5984977746a3dfcd71415bed5c324eb1"
PROJECT_NAME="nico-ranking-custom"

echo "Updating Cloudflare Pages environment variables..."

curl -X PATCH "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT_NAME}" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "deployment_configs": {
      "preview": {
        "env_vars": {
          "CF_ACC": {
            "type": "plain_text",
            "value": "5984977746a3dfcd71415bed5c324eb1"
          },
          "CF_NS": {
            "type": "plain_text",
            "value": "80f4535c379b4e8cb89ce6dbdb7d2dc9"
          },
          "CF_KV_TOKEN_READ": {
            "type": "secret_text",
            "value": "ZfpisofOxDnrUx8MhJCOw8QG1TVO_Z236y6q5Jdj"
          },
          "CF_KV_TOKEN_WRITE": {
            "type": "secret_text",
            "value": "ZfpisofOxDnrUx8MhJCOw8QG1TVO_Z236y6q5Jdj"
          },
          "NEXT_PUBLIC_CONVEX_URL": {
            "type": "plain_text",
            "value": "https://judicious-lemming-629.convex.cloud"
          },
          "NODE_VERSION": {
            "type": "plain_text",
            "value": "20"
          }
        }
      },
      "production": {
        "env_vars": {
          "CF_ACC": {
            "type": "plain_text",
            "value": "5984977746a3dfcd71415bed5c324eb1"
          },
          "CF_NS": {
            "type": "plain_text",
            "value": "80f4535c379b4e8cb89ce6dbdb7d2dc9"
          },
          "CF_KV_TOKEN_READ": {
            "type": "secret_text",
            "value": "ZfpisofOxDnrUx8MhJCOw8QG1TVO_Z236y6q5Jdj"
          },
          "CF_KV_TOKEN_WRITE": {
            "type": "secret_text",
            "value": "ZfpisofOxDnrUx8MhJCOw8QG1TVO_Z236y6q5Jdj"
          },
          "NEXT_PUBLIC_CONVEX_URL": {
            "type": "plain_text",
            "value": "https://judicious-lemming-629.convex.cloud"
          },
          "NODE_VERSION": {
            "type": "plain_text",
            "value": "20"
          }
        }
      }
    }
  }'