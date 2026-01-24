# Nico Ranking Custom

A web application that aggregates and displays Niconico video rankings.

## Features

- **Ranking Display**: 23 genres x 2 periods (24h/hourly)
- **Tag Filtering**: Filter by popular tags
- **NG List**: Hide specific videos or authors
- **Real-time Stats**: View count and rating updates
- **Responsive Design**: PC/Mobile compatible
- **Cache Optimization**: Fast page loads

## Quick Start

### Prerequisites

- Node.js 20.x or higher
- npm 10.x or higher
- Wrangler CLI (for Cloudflare Workers development)

### Installation

```bash
# Clone the repository
git clone https://github.com/WebAppAI0410/nico-ranking-new.git
cd nico-ranking-new

# Install dependencies
npm install

# Install Playwright browsers (for E2E tests)
npx playwright install
```

### Environment Setup

Create a `.env.local` file in the project root:

```bash
# Cloudflare Configuration
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token
CLOUDFLARE_ACCOUNT_ID=your_account_id

# KV Namespace ID
KV_RANKING_ID=your_kv_namespace_id

# R2 Configuration
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
```

### Running Locally

```bash
# Start development server
npm run dev

# Open http://localhost:3000
```

## Architecture

```
+------------------+     +----------------------+     +------------------+
|                  |     |                      |     |                  |
|  Next.js (Vercel)|---->| Cloudflare Workers   |---->| Cloudflare R2/KV |
|                  |     | (API Gateway)        |     | (Storage)        |
+------------------+     +----------------------+     +------------------+
```

### Components

| Component | Description |
|-----------|-------------|
| **Frontend** | Next.js 15 (App Router) deployed on Vercel |
| **API Gateway** | Cloudflare Workers with edge caching |
| **Storage** | R2 for ranking data, KV for stats and config |
| **CI/CD** | GitHub Actions for automated testing and deployment |

### Data Flow

1. Scheduled scripts fetch ranking data from Niconico API
2. Data is processed and stored in Cloudflare R2
3. API Gateway serves cached data with dynamic TTL
4. Frontend fetches data via API and renders ranking pages

## Development

### Common Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript type checking |
| `npm test` | Run unit tests (Vitest) |
| `npm run test:e2e` | Run E2E tests (Playwright) |
| `npm run check:all` | Run all checks (typecheck + lint + test + build) |

### Worker Development

| Command | Description |
|---------|-------------|
| `npm run deploy:worker` | Deploy API Gateway Worker |
| `npm run build:worker` | Build Worker TypeScript |

### Data Scripts

| Command | Description |
|---------|-------------|
| `npm run update-ranking` | Fetch and update ranking data |
| `npm run aggregate-ranking` | Aggregate ranking results |
| `npm run update-video-stats` | Update video statistics |

## Tech Stack

- **Frontend**: Next.js 15, React 18, TypeScript
- **Hosting**: Vercel
- **CDN/API**: Cloudflare Workers
- **Storage**: Cloudflare R2 (rankings), KV (stats)
- **CI/CD**: GitHub Actions

## Project Structure

```
nico-ranking-new/
├── app/              # Next.js App Router pages
├── components/       # React components
├── hooks/            # Custom React hooks
├── lib/              # Utility libraries
├── workers/          # Cloudflare Workers source
├── scripts/          # Data processing scripts
├── tests/            # Test files
│   └── e2e/          # Playwright E2E tests
├── __tests__/        # Vitest unit/integration tests
├── docs/             # Documentation
└── public/           # Static assets
```

## Testing

### E2E Tests

This project uses Playwright for end-to-end testing.

#### Running E2E Tests

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install

# Run all E2E tests
npm run test:e2e

# Run tests with UI mode
npm run test:e2e:ui

# Run tests in headed mode (visible browser)
npm run test:e2e:headed

# Debug tests
npm run test:e2e:debug

# Generate test code by recording actions
npm run test:e2e:codegen

# Run tests with development server
npm run test:e2e:with-server

# View test report
npm run test:e2e:report
```

#### Test Coverage

- **Integration Tests**: Basic functionality and user flows
- **API Tests**: Endpoint validation and error handling
- **Performance Tests**: Loading times and optimization checks
- **Accessibility Tests**: WCAG compliance and keyboard navigation
- **SEO Tests**: Meta tags and structured data validation
- **Mobile Tests**: Touch interactions and responsive design

#### CI/CD Integration

E2E tests run automatically on:
- Push to `main` or `develop` branches
- Pull requests
- Manual workflow dispatch

Tests are run in parallel across multiple browsers (Chrome, Firefox) with automatic retry on failure.

### Unit Tests

```bash
# Run unit tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## Deployment

### Standard Deployment Flow

1. Create a feature branch from `main`
2. Make changes and push
3. Create a Pull Request
4. Wait for CI checks to pass
5. Merge to `main` (triggers automatic deployment)
6. Verify production deployment

### Vercel Deployment

Frontend is automatically deployed to Vercel on push to `main`.

### Cloudflare Workers Deployment

```bash
# Authenticate with Cloudflare
wrangler login

# Deploy API Gateway
npm run deploy:worker
```

### Emergency Procedures

```bash
# Emergency rollback
./scripts/emergency-rollback.sh

# Health check
./scripts/health-check.sh
```

## Environment Variables

### Required for Development

| Variable | Description |
|----------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `KV_RANKING_ID` | Cloudflare KV namespace ID |
| `R2_ACCESS_KEY_ID` | R2 access key for storage |
| `R2_SECRET_ACCESS_KEY` | R2 secret key for storage |

### Optional

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_BASE_URL` | Custom API base URL (default: production) |

## Troubleshooting

### Build Errors

```bash
# Clean install dependencies
rm -rf node_modules package-lock.json
npm install

# Check TypeScript errors
npm run typecheck
```

### E2E Test Failures

```bash
# Run specific test with debug mode
npx playwright test tests/e2e/integration.spec.ts --headed --debug

# Reinstall Playwright browsers
npx playwright install
```

### Worker Connection Errors

```bash
# Verify Cloudflare authentication
wrangler whoami

# Check Worker logs
wrangler tail nico-ranking-api-gateway
```

### Local Development Issues

```bash
# Clear Next.js cache
rm -rf .next

# Restart development server
npm run dev
```

## Contributing

### Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Run all checks (`npm run check:all`)
5. Commit with a descriptive message
6. Push to your fork
7. Create a Pull Request

### Coding Guidelines

- Follow TypeScript strict mode
- Use ESLint rules defined in the project
- Write tests for new features
- Keep commits atomic and descriptive

## License

MIT License - see [LICENSE](LICENSE) for details.
