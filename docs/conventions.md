# Coding Standards & Conventions

## Tech Stack
- **Language**: TypeScript + React (ES modules)
- **State Management**: TanStack Store (`@tanstack/store`)
- **Routing**: TanStack Router (`@tanstack/react-router`)
- **Styling**: Tailwind CSS (`src/styles.css`)

## Naming Conventions
- **React Components**: `PascalCase` (e.g., `Card.tsx`, `ControlPanel.tsx`)
- **Hooks**: `camelCase` (e.g., `useGameState.ts`)
- **Other Files**: `kebab-case` or `camelCase` (consistent with existing patterns)

## Formatting & Linting
- **Formatter**: Prettier
  - Configuration: `semi: false`, `singleQuote: true`, `trailingComma: all`
- **Linter**: ESLint (via `@tanstack/eslint-config`)

## Project Structure
- `src/main.tsx`: App bootstrap & router entry.
- `src/routes/`: Route definitions (TanStack Router).
- `src/components/`: Reusable UI components.
- `src/lib/`: Shared logic, utilities, types, and state.
- `public/`: Static assets.
