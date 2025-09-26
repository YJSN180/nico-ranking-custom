#!/bin/bash

echo "Checking API Routes Runtime Configuration:"
echo "==========================================="
echo ""

for route in ranking admin/ng-list admin/ng-list/derived admin/ng-list/derived/\[videoId\] admin/video-info popular-tags tags tags/\[tag\] thumbnail-proxy hd-thumbnail hd-thumbnail/\[videoId\] edge/video-stats cron/fetch debug-log; do
    file_path="/home/hdyk/workspace/nico-ranking-new/app/api/${route}/route.ts"
    if [ -f "$file_path" ]; then
        echo "📁 ${route}/route.ts:"
        if grep -q "export const runtime" "$file_path"; then
            grep "export const runtime" "$file_path" | sed 's/^/  /'
        else
            echo "  ❌ No runtime export (uses Node.js by default)"
        fi
        echo ""
    fi
done

echo "Summary:"
echo "--------"
echo "Total API routes: $(find /home/hdyk/workspace/nico-ranking-new/app/api -name 'route.ts' | wc -l)"
echo "Using Edge Runtime: $(grep -r "export const runtime.*=.*'edge'" /home/hdyk/workspace/nico-ranking-new/app/api --include="route.ts" | wc -l)"
echo "Using Node.js (default): $(($(find /home/hdyk/workspace/nico-ranking-new/app/api -name 'route.ts' | wc -l) - $(grep -r "export const runtime.*=.*'edge'" /home/hdyk/workspace/nico-ranking-new/app/api --include="route.ts" | wc -l)))"