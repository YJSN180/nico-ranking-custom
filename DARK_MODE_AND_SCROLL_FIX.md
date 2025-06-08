# Dark Mode and Scroll Lock Fix

## Issues Fixed

### 1. Dark Mode Not Applying to Main Content Area
**Problem**: The header was dark but ranking content area remained white when dark mode was enabled.

**Root Cause**: Components were using hardcoded colors instead of CSS variables.

**Fixes Applied**:
- **RankingSelector** (`components/ranking-selector.tsx`):
  - Changed `background: 'white'` to `background: 'var(--surface-color)'`
  - Changed hardcoded colors in period/genre buttons to use CSS variables
  - Changed `boxShadow` to use `var(--shadow-md)`

- **TagSelector** (`components/tag-selector.tsx`):
  - Changed `background: 'white'` to `background: 'var(--surface-color)'`
  - Changed `boxShadow` to use `var(--shadow-md)`

- **RankingItem** (`components/ranking-item.tsx`):
  - Changed all hardcoded colors to CSS variables:
    - `#666` → `var(--text-secondary)`
    - `#333` → `var(--text-primary)`
    - `#0066cc` → `var(--link-color)`
    - `#e5e5e5` → `var(--border-color)`
    - `#f5f5f5` → `var(--surface-secondary)`
    - `#e74c3c` → `var(--error-color)`
    - `white` → `var(--surface-color)`

### 2. Scroll Lock Issue After Navigation
**Problem**: After navigating back from a video page, scrolling became completely disabled.

**Root Cause**: The `popstate` event handler was executing synchronous code that could block the main thread, preventing scroll events.

**Fixes Applied**:
- **Client Page** (`app/client-page.tsx`):
  - Wrapped `popstate` handler logic in `requestAnimationFrame` to avoid blocking
  - Added proper error handling with `.catch()` on async operations
  - Added retry limit (20 attempts) to scroll restoration to prevent infinite loops
  - Ensured `setIsRestoring(false)` is called in error cases

## Test Results
All related tests are passing:
- ✓ Dark theme background fixed test
- ✓ External site return restoration test
- ✓ Browser back scroll restore test
- ✓ Theme instant apply test

## CSS Variables Used
The fix ensures all components use the following CSS variables defined in `globals.css`:
- `--surface-color`: Main background color
- `--surface-secondary`: Secondary background color
- `--text-primary`: Primary text color
- `--text-secondary`: Secondary text color
- `--text-muted`: Muted text color
- `--border-color`: Border color
- `--link-color`: Link color
- `--error-color`: Error/warning color
- `--shadow-md`: Medium shadow
- `--primary-color`: Primary accent color

These variables automatically adjust based on the selected theme (light/dark/darkblue).