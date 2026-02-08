# Coding Conventions

**Analysis Date:** 2026-01-26

## Naming Patterns

**Files:**
- PascalCase for React components: `Button.tsx`, `ClipCard.tsx`, `AdminHeader.tsx`
- camelCase for services: `authService.ts`, `blobService.ts`, `geminiService.ts`
- camelCase with Store suffix for stores: `uiStore.ts`, `clipsStore.ts`, `jobsStore.ts`
- camelCase for utilities: `imageHelpers.ts`, `permissions.ts`, `env.ts`
- `.test.ts` or `.spec.ts` for tests: `authService.test.ts`, `uiStore.test.ts`

**Functions:**
- camelCase for all functions: `getAuthToken()`, `generateAiImage()`, `openModal()`
- Async functions use async/await (no special prefix)
- Event handlers use `handle` prefix: `handleClick`, `handleSubmit`
- Hooks use `use` prefix: `useAiApi()`, `useToast()`, `useImageCrop()`

**Variables:**
- camelCase for variables: `activeModal`, `isLoading`, `brandProfile`
- UPPER_SNAKE_CASE for module-level constants: `PUBLISHABLE_KEY`, `API_BASE_URL`
- No underscore prefix for private members

**Types:**
- PascalCase for interfaces: `BrandProfile`, `MarketingCampaign`, `UiState`
- PascalCase for type aliases: `ModalType`, `ToneOfVoice`
- No `I` prefix for interfaces

## Code Style

**Formatting:**
- 2-space indentation
- Semicolons used consistently
- Double quotes for strings (inferred from codebase)
- No Prettier config (manual/ESLint-driven)

**Linting:**
- ESLint with flat config (`eslint.config.mjs`)
- TypeScript-ESLint for type-aware rules
- React and React Hooks plugins
- Run: `bun run lint` or `bun run lint:fix`

**Key Rules:**
- `@typescript-eslint/no-explicit-any`: warn
- `@typescript-eslint/no-unused-vars`: warn (ignore `_` prefix)
- `react-hooks/rules-of-hooks`: error
- `react-hooks/exhaustive-deps`: warn
- `no-console`: warn (allow warn, error, info, debug)

## Import Organization

**Order:**
1. React and React-related imports
2. External libraries (express, zod, etc.)
3. Internal modules with `@/` alias
4. Relative imports (., ..)
5. Type imports

**Grouping:**
- Blank line between groups
- Type imports can be inline or separate

**Path Aliases:**
- `@/` maps to `src/`
- Example: `import { Button } from '@/components/ui/Button'`

## Error Handling

**Patterns:**
- Try-catch at route handler level (backend)
- Return `{ error: message }` JSON for API errors
- Display toasts via Zustand UI store (frontend)

**Error Types:**
- Throw on invalid input, missing dependencies
- Return null for expected failures (e.g., no auth token)
- Log errors with context before throwing

**Current Gaps:**
- Inconsistent error response formats
- Missing global error handler
- Many console.log instead of structured logging

## Logging

**Framework:**
- Currently: console.log/error/warn
- Planned: Pino structured logging

**Patterns:**
- Log at service boundaries
- Log state transitions, external API calls
- Include context (userId, organizationId) when available

**Current Issues:**
- 500+ console statements in server
- No structured format
- No log levels in practice

## Comments

**When to Comment:**
- Explain "why" not "what"
- Document business rules and edge cases
- Add context for non-obvious decisions

**JSDoc/TSDoc:**
- Used for service functions with types
- Format: `@param`, `@returns`, `@throws`

**Section Dividers:**
```typescript
// =============================================================================
// Section Name
// =============================================================================
```

**TODO Format:**
- `// TODO: description`
- Link to issue if exists

## Function Design

**Size:**
- Keep functions focused (single responsibility)
- Extract helpers for complex logic

**Parameters:**
- Max 3 parameters preferred
- Use options object for more: `function create(options: CreateOptions)`
- Destructure in parameter list when appropriate

**Return Values:**
- Explicit return statements
- Return early for guard clauses
- Use typed return values

## Module Design

**Exports:**
- Named exports for utilities and services
- Default exports for React components
- Barrel exports (`index.ts`) for module grouping

**Barrel Files:**
- `index.ts` re-exports public API
- Used in `src/stores/`, `src/services/api/`, `src/services/ffmpeg/`

**Dependencies:**
- Frontend imports from `@/` aliases
- Backend uses relative imports
- Avoid circular dependencies

## React-Specific Patterns

**Component Structure:**
```typescript
// Imports
import React from 'react';
import { useStore } from '@/stores/uiStore';

// Types (inline or imported)
interface Props { ... }

// Component
export function ComponentName({ prop }: Props) {
  // Hooks
  const state = useStore();

  // Handlers
  const handleClick = () => { ... };

  // Render
  return <div>...</div>;
}
```

**Hooks:**
- Custom hooks in `src/hooks/`
- Return typed objects or arrays
- Clean up effects properly

**State:**
- Local state: useState
- Global UI state: Zustand stores
- Server state: SWR hooks

## CSS Patterns

**Approach:** Utility-first with TailwindCSS

**Class Merging:**
```typescript
import { cn } from '@/lib/utils';
cn('base-classes', isActive && 'active-classes', className)
```

**Theme:**
- Dark theme with opacity system: `white/10`, `white/20`, `bg-black/40`
- Glassmorphism: `bg-black/40 backdrop-blur-2xl`
- See `docs/STYLE_GUIDE.md` for detailed patterns

---

*Convention analysis: 2026-01-26*
*Update when patterns change*
