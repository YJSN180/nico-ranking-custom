#!/bin/bash

RUN_ID=15689346027

echo "Monitoring workflow run $RUN_ID..."
echo "Started at: $(date)"
echo

while true; do
  STATUS=$(gh run view $RUN_ID --json status,conclusion | python3 -c "import json,sys; d=json.load(sys.stdin); print(f\"{d['status']} - {d.get('conclusion', 'running')}\")")
  
  echo -ne "\r[$(date +%H:%M:%S)] Status: $STATUS"
  
  if [[ ! "$STATUS" =~ "in_progress" ]] && [[ ! "$STATUS" =~ "queued" ]]; then
    echo
    echo
    echo "Workflow completed!"
    
    # Check for 429 errors
    echo
    echo "Checking for 429 errors..."
    gh run view $RUN_ID --log | grep -E "(429|rate limit)" | tail -10
    
    # Check aggregate step
    echo
    echo "Checking aggregate step result..."
    gh run view $RUN_ID --log | grep -A 5 "Aggregation and KV write" | tail -10
    
    break
  fi
  
  sleep 10
done