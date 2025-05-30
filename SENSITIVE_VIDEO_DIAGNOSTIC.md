# Sensitive Video Diagnostic Guide

This document explains how to diagnose and debug issues with sensitive videos not appearing on Vercel.

## Problem Description

Sensitive videos (marked with `requireSensitiveMasking: true`) are visible locally but disappear when deployed to Vercel.

## Diagnostic Tools

### 1. Command Line Diagnostic

Run the diagnostic script to check the entire data pipeline:

```bash
npm run diagnose
```

This will:
- Test V2 implementation directly
- Compare V1 vs V2 implementations
- Check what `scrapeRankingPage` returns
- Verify KV cache contents
- Test direct HTML fetching

### 2. Web-based Diagnostic UI

Visit `/debug/sensitive-test` in your browser to run interactive tests:

- **V2 Direct Test**: Tests the V2 implementation directly
- **Compare Methods**: Compares all scraping methods side by side
- **Save Process**: Tracks data through the save pipeline
- **Full Diagnostic**: Runs comprehensive environment checks
- **Test Cron**: Simulates the cron job update process

### 3. API Endpoints

#### `/api/debug/diagnostic?genre=all`
Comprehensive diagnostic that checks:
- KV cache state
- Direct HTML fetch with cookies
- nvAPI response
- Complete hybrid scrape
- Environment-specific headers

#### `/api/debug/compare-methods?genre=all`
Compares different scraping methods:
- HTML meta tag parsing
- nvAPI only
- Hybrid V1
- Hybrid V2
- Cookie scraper

#### `/api/debug/test-save-process?genre=all&dryRun=true`
Tests the exact save process used by update-ranking:
- Scraping result
- Popular tags fetch
- Data preparation
- KV save simulation

#### `/api/debug/test-v2-direct?genre=all`
Direct test of completeHybridScrapeV2 implementation

#### `/api/debug/test-cron?genre=all&simulate=true`
Simulates or runs the cron update process

## Common Issues and Solutions

### Issue 1: Sensitive videos found in HTML but not in KV

**Symptoms:**
- HTML meta tag contains sensitive videos
- V2 implementation finds sensitive videos
- KV cache has 0 sensitive videos

**Possible Causes:**
1. Data is being filtered during the save process
2. Wrong data structure is being saved
3. `requireSensitiveMasking` field is not preserved

**Debug Steps:**
1. Run `/api/debug/test-save-process` to track data flow
2. Check if `requireSensitiveMasking` field exists in saved items
3. Verify the data structure matches expectations

### Issue 2: Different results on Vercel vs Local

**Symptoms:**
- Works locally but not on Vercel
- Different item counts between environments

**Possible Causes:**
1. Cookie headers not being sent properly
2. Geo-blocking based on server location
3. Different Node.js versions or configurations

**Debug Steps:**
1. Run `/api/debug/diagnostic` on both environments
2. Compare the `headers` test results
3. Check if Googlebot UA is being used correctly

### Issue 3: V2 not detecting sensitive videos

**Symptoms:**
- V2 returns 0 sensitive videos
- HTML contains videos with `requireSensitiveMasking: true`

**Possible Causes:**
1. Field name mismatch
2. Data parsing error
3. Filter being applied incorrectly

**Debug Steps:**
1. Check raw HTML response in `/api/debug/diagnostic`
2. Verify meta tag parsing logic
3. Check if `requireSensitiveMasking` field is preserved through parsing

## Data Flow

```
HTML Fetch (with cookie)
    ↓
Meta Tag Parsing
    ↓
completeHybridScrapeV2
    ↓
scrapeRankingPage (returns { items, popularTags })
    ↓
update-ranking.ts (destructures { items })
    ↓
KV Save ({ items, popularTags, updatedAt })
    ↓
API Route (reads from KV)
    ↓
Frontend Display
```

## Key Fields to Check

1. **requireSensitiveMasking**: Boolean field indicating sensitive content
2. **items**: Array of ranking items
3. **popularTags**: Array of popular tags for the genre

## Testing Checklist

- [ ] Run `npm run diagnose` locally
- [ ] Check `/debug/sensitive-test` page locally
- [ ] Deploy to Vercel preview
- [ ] Run diagnostic endpoints on Vercel
- [ ] Compare results between local and Vercel
- [ ] Verify sensitive video counts match