# Testing Patterns

**Analysis Date:** 2026-01-26

## Test Framework

**Runner:**
- Vitest 4.0.17
- Config: `vitest.config.ts` in project root

**Assertion Library:**
- Vitest built-in expect
- `@testing-library/jest-dom` for DOM matchers

**Run Commands:**
```bash
bun run test                    # Run all tests
bun run test:watch              # Watch mode
bun run test:coverage           # Coverage report
bun run test:ui                 # Interactive test UI
```

## Test File Organization

**Location:**
- Co-located `__tests__/` directories alongside source
- Pattern: `src/{feature}/__tests__/{file}.test.ts`

**Naming:**
- Unit tests: `moduleName.test.ts`
- Component tests: `ComponentName.test.tsx`
- No separate naming for integration tests

**Structure:**
```
src/
├── hooks/
│   ├── __tests__/
│   │   ├── useAiApi.test.ts
│   │   └── useSuperAdmin.test.tsx
│   └── useAiApi.ts
├── services/
│   ├── __tests__/
│   │   ├── authService.test.ts
│   │   └── blobService.test.ts
│   └── authService.ts
├── stores/
│   ├── __tests__/
│   │   ├── uiStore.test.ts
│   │   └── jobsStore.test.ts
│   └── uiStore.ts
└── utils/
    ├── __tests__/
    │   └── imageHelpers.test.ts
    └── imageHelpers.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('ModuleName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('functionName', () => {
    it('should handle valid input', () => {
      // arrange
      const input = createTestInput();

      // act
      const result = functionName(input);

      // assert
      expect(result).toEqual(expectedOutput);
    });

    it('should throw on invalid input', () => {
      expect(() => functionName(null)).toThrow('Invalid input');
    });
  });
});
```

**Patterns:**
- Use beforeEach for per-test setup
- Use afterEach to restore mocks: `vi.restoreAllMocks()`
- Arrange/Act/Assert pattern for clarity
- One assertion focus per test

## Mocking

**Framework:**
- Vitest built-in mocking (`vi`)
- Module mocking via `vi.mock()` at top of file

**Patterns:**
```typescript
import { vi } from 'vitest';
import { externalFunction } from './external';

// Mock module
vi.mock('./external', () => ({
  externalFunction: vi.fn()
}));

describe('test suite', () => {
  it('uses mocked function', () => {
    const mockFn = vi.mocked(externalFunction);
    mockFn.mockReturnValue('mocked result');

    // test code

    expect(mockFn).toHaveBeenCalledWith('expected arg');
  });
});
```

**Mock Clerk Authentication:**
```typescript
vi.mock('@clerk/clerk-react', () => ({
  useAuth: vi.fn(() => ({
    getToken: vi.fn().mockResolvedValue('mock-token'),
  })),
}));
```

**What to Mock:**
- External APIs (Clerk, Gemini, etc.)
- File system operations
- Browser APIs (fetch, localStorage)
- Time/dates with `vi.useFakeTimers()`

**What NOT to Mock:**
- Internal pure functions
- Simple utilities
- Type-only imports

## Fixtures and Factories

**Test Data:**
```typescript
// Factory function
function createTestConfig(overrides?: Partial<Config>): Config {
  return {
    targetDir: '/tmp/test',
    global: false,
    ...overrides
  };
}

// Usage
const config = createTestConfig({ global: true });
```

**Location:**
- Factory functions: inline in test file when simple
- Shared fixtures: `test/fixtures/` (if needed)
- Test setup: `test/setup.ts`

## Coverage

**Requirements:**
- Target: 70% for all metrics
- Not enforced in CI (awareness only)

**Configuration:**
- Provider: v8
- Reporters: text, json, html
- Output: `./coverage`

**View Coverage:**
```bash
bun run test:coverage
open coverage/index.html
```

**Excluded:**
- `node_modules/`
- `test/`
- `**/*.d.ts`
- `**/*.config.{js,ts}`
- `**/types.ts`
- `server/`

## Test Types

**Unit Tests:**
- Scope: Single function/class in isolation
- Mocking: Mock all external dependencies
- Speed: <100ms per test
- Examples: `authService.test.ts`, `uiStore.test.ts`

**Integration Tests:**
- Scope: Multiple modules together
- Mocking: Mock external boundaries only
- Examples: Hook tests with mocked API client

**E2E Tests:**
- Not currently implemented
- No Cypress/Playwright configuration

## Common Patterns

**Async Testing:**
```typescript
it('should handle async operation', async () => {
  const result = await asyncFunction();
  expect(result).toBe('expected');
});
```

**Error Testing:**
```typescript
it('should throw on invalid input', () => {
  expect(() => functionCall()).toThrow('error message');
});

// Async error
it('should reject on failure', async () => {
  await expect(asyncCall()).rejects.toThrow('error message');
});
```

**React Hook Testing:**
```typescript
import { renderHook, act } from '@testing-library/react';

it('should update state', () => {
  const { result } = renderHook(() => useCustomHook());

  act(() => {
    result.current.someAction();
  });

  expect(result.current.state).toBe(expected);
});
```

**Zustand Store Testing:**
```typescript
it('should update store state', () => {
  const { openModal } = useUiStore.getState();

  openModal('imagePreview', { imageId: '123' });

  const state = useUiStore.getState();
  expect(state.activeModal).toBe('imagePreview');
});
```

## Global Test Setup

**File:** `test/setup.ts`

**Mocked Browser APIs:**
- `localStorage` - vi.fn() implementation
- `window.matchMedia` - mock implementation
- `ResizeObserver` - mock implementation
- `IntersectionObserver` - mock implementation
- `fetch` - global mock

**Auto-cleanup:**
```typescript
import { cleanup } from '@testing-library/react';
afterEach(() => cleanup());
```

**Environment Variables:**
- Stubbed via `import.meta.env`

---

*Testing analysis: 2026-01-26*
*Update when test patterns change*
