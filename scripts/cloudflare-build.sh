#!/bin/bash
# Cloudflare Pages build script
# This script avoids the recursive build issue by directly building Next.js

echo "Building Next.js application..."
npm run build:next

echo "Preparing for Cloudflare Pages..."
npx @cloudflare/next-on-pages --experimental-minify

echo "Build completed successfully!"