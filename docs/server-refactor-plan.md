# Server Refactor Plan (Zero-Break Strategy)

## Objective
Reduce complexity of `server/index.mjs` without changing runtime behavior in production.

## Guardrails
- No endpoint contract changes unless explicitly approved.
- Refactor by domain, one slice at a time.
- Validate each slice with:
  - `node --check`
  - `npm run typecheck`
  - `npm run build`
  - targeted runtime check for critical routes

## Phase 1 (Completed)
- Extracted Image Playground routes to dedicated module:
  - `server/routes/image-playground.mjs`
- Wired module in `server/index.mjs` using dependency injection.
- Kept same route paths and business logic.

## Phase 2 (Next)
- Extract auth/context logic to dedicated middleware module:
  - `getRequestAuthContext`
  - `requireAuthenticatedRequest`
  - `enforceAuthenticatedIdentity`
- Keep existing protected prefix list and behavior intact.

## Phase 3 (Next)
- Extract Instagram/Rube proxy routes into:
  - `server/routes/instagram.mjs`
  - `server/routes/rube-proxy.mjs`
- Keep current token validation, org/user resolution, and logging semantics.

## Phase 4 (Next)
- Extract AI generation routes (`/api/ai/*`) into domain modules:
  - image
  - video
  - copy/text helpers
- Centralize provider clients and retry/error mapping.

## Phase 5 (Next)
- Introduce route-level schemas and standardized error mapping.
- Add lightweight endpoint contract checks for critical APIs.

## Rollout Model
1. Extract one domain.
2. Run validations.
3. Deploy.
4. Monitor logs/errors.
5. Continue to next domain.
