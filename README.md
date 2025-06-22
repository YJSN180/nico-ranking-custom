# Nico Ranking Custom

A web application that aggregates and displays Niconico video rankings.

## Features

- **Ranking Display**: 23 genres × 2 periods (24h/hourly)
- **Tag Filtering**: Filter by popular tags
- **NG List**: Hide specific videos or authors
- **Real-time Stats**: View count and rating updates
- **Responsive Design**: PC/Mobile compatible
- **Cache Optimization**: Fast page loads

## Tech Stack

- Frontend: Next.js 15, React 18, TypeScript
- Hosting: Vercel
- CDN/API: Cloudflare Workers
- Storage: Cloudflare R2 (rankings), KV (stats)
- CI/CD: GitHub Actions