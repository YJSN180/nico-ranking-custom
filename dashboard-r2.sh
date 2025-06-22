#!/bin/bash

# R2書き込み統計ダッシュボード

clear
echo "======================================"
echo "   📊 R2 Write Statistics Dashboard   "
echo "======================================"
echo ""

# 最新のワークフロー情報を取得
echo "🔄 Fetching latest workflow data..."
LATEST_RUN=$(gh run list --workflow "Update Nico Ranking Data (Parallel)" --limit 1 --json databaseId,status,conclusion,startedAt,updatedAt | jq -r '.[0]')

if [ -z "$LATEST_RUN" ]; then
    echo "❌ No workflow runs found"
    exit 1
fi

RUN_ID=$(echo $LATEST_RUN | jq -r '.databaseId')
STATUS=$(echo $LATEST_RUN | jq -r '.status')
CONCLUSION=$(echo $LATEST_RUN | jq -r '.conclusion')
STARTED=$(echo $LATEST_RUN | jq -r '.startedAt')
UPDATED=$(echo $LATEST_RUN | jq -r '.updatedAt')

echo ""
echo "📅 Latest Run Information:"
echo "  Status: $STATUS ($CONCLUSION)"
echo "  Started: $STARTED"
echo "  Updated: $UPDATED"
echo ""

if [ "$STATUS" = "completed" ] && [ "$CONCLUSION" = "success" ]; then
    echo "📈 Analyzing write statistics..."
    
    # ログから統計を抽出
    LOGS=$(gh run view $RUN_ID --log 2>/dev/null | grep -E "(Upload summary:|Total files processed:|Files uploaded:|Files skipped|Upload reduction:|Tag metadata summary:)" || echo "")
    
    if [ -n "$LOGS" ]; then
        echo ""
        echo "📊 Upload Statistics:"
        echo "$LOGS" | grep -A 4 "Upload summary:" | sed 's/^/  /'
        
        echo ""
        echo "🏷️ Tag Distribution:"
        echo "$LOGS" | grep -A 10 "Tag metadata summary:" | grep -E "- [a-z]+/[0-9]+h:" | sed 's/^/  /'
    else
        echo "⚠️  No statistics found (using old code version)"
    fi
else
    echo "⚠️  Workflow is still running or failed"
fi

echo ""
echo "💡 Tip: Run this after each workflow execution to track reduction trends"
echo "======================================"