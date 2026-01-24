# Testing Strategy

## Framework
- **Runner**: Vitest
- **Environment**: `jsdom`
- **Utilities**: Testing Library (`@testing-library/react`)

## Guidelines
- **File Naming**: `*.test.ts` or `*.test.tsx` (e.g., `src/lib/store.test.ts`)
- **Focus**: Test behavior and state transitions, not implementation details.
- **Coverage**: No strict threshold; prioritize critical paths.

## Commands
- `pnpm test`: Run tests in CI mode.
