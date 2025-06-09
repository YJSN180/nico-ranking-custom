#!/bin/bash

curl -s -X GET 'https://api.cloudflare.com/client/v4/accounts/5984977746a3dfcd71415bed5c324eb1/pages/projects/nico-ranking-custom' \
  -H 'Authorization: Bearer ZfpisofOxDnrUx8MhJCOw8QG1TVO_Z236y6q5Jdj' \
  -H 'Content-Type: application/json' | python3 -c "
import json
import sys
data = json.load(sys.stdin)
if data.get('success'):
    deployment = data['result']['latest_deployment']
    print(f\"Latest deployment ID: {deployment['id']}\")
    print(f\"Status: {deployment['latest_stage']['status']}\")
    print(f\"Build command: {deployment['build_config']['build_command']}\")
"