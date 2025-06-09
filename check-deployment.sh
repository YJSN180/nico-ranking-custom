#!/bin/bash

DEPLOYMENT_ID="b53c3eaf-def1-4d44-8fd5-ad6fed4a7c14"
CF_API_TOKEN="ZfpisofOxDnrUx8MhJCOw8QG1TVO_Z236y6q5Jdj"
ACCOUNT_ID="5984977746a3dfcd71415bed5c324eb1"
PROJECT_NAME="nico-ranking-custom"

echo "Checking deployment $DEPLOYMENT_ID..."

curl -X GET "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT_NAME}/deployments/${DEPLOYMENT_ID}" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" | python3 -m json.tool | grep -A 50 '"logs"'