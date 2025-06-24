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
