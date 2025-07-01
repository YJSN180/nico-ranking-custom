# Cloudflare Resource Monitoring Scripts

## Overview

This directory contains scripts for monitoring Cloudflare resource usage with improved accuracy.

## monitor-resources.cjs

### Recent Improvements (2025-01-01)

**Problem**: The original script used only 3 hours of data and extrapolated to monthly usage using a scale factor of 240, resulting in highly inaccurate projections.

**Solution**: Complete rewrite to use proper time windows and actual data:

- ✅ **Configurable Time Ranges**: Support for 1h, 3h, 24h, 7d, 30d periods
- ✅ **Actual Data Usage**: No more inaccurate extrapolations 
- ✅ **Real Monthly Usage**: Uses 30-day actual data for R2
- ✅ **Real Daily Averages**: Uses period averages for KV operations
- ✅ **Accurate Reporting**: Clear distinction between actual usage and projections

### Usage

```bash
# Get 30-day actual usage (default)
node monitor-resources.cjs

# Get 7-day actual usage
node monitor-resources.cjs 7d

# Get 24-hour actual usage
node monitor-resources.cjs 24h
```

### Output Format

```json
{
  "timeRange": "30d",
  "actualUsage": {
    "r2": {
      "actualClassA": 1250,      // Actual operations in period
      "actualClassB": 45000,     // Actual operations in period
      "storageGB": "0.45",
      "objectCount": 1234
    },
    "kv": {
      "dailyAvgReads": 850,      // Average per day in period
      "dailyAvgWrites": 12,      // Average per day in period
      "storageGB": "0.001",
      "keyCount": 89
    }
  },
  "usage": {
    "r2": {
      "storage": 4,    // 4% of 10GB free tier
      "classA": 0,     // 0% of 1M free tier
      "classB": 0      // 0% of 10M free tier
    }
  }
}
```

### GitHub Actions Integration

The script outputs variables for GitHub Actions workflows:

- `time_range`: Selected time range
- `r2_classA_actual`: Actual Class A operations 
- `r2_classB_actual`: Actual Class B operations
- `kv_reads_daily_avg`: Daily average read operations
- `kv_writes_daily_avg`: Daily average write operations

## Environment Variables

Required:
- `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare account ID
- `CLOUDFLARE_API_TOKEN`: API token with Analytics:Read permissions

Optional:
- `GITHUB_OUTPUT`: For GitHub Actions output variables

## Deleted Scripts

The following Slack notification scripts have been removed as requested:
- `notify-slack.js` - E2E test Slack notifications
- `notify-resource-usage.cjs` - Resource usage Slack notifications

All Slack notification functionality has been removed from E2E test workflows.