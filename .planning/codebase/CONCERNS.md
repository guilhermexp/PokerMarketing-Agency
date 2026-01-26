# Codebase Concerns

**Analysis Date:** 2026-01-26

## Tech Debt

**Monolithic Server Files:**
- Issue: All API routes in single files (~6,900 lines each)
- Files: `server/dev-api.mjs` (6,556 lines), `server/index.mjs` (6,744 lines)
- Why: Rapid development during MVP phase
- Impact: Hard to navigate, test, and maintain; high cognitive load
- Fix approach: See `docs/REFACTORING_PLAN.md` - extract to layers (routes/controllers/services)

**Oversized Frontend Components:**
- Issue: Single components handling too much logic
- Files: `src/components/tabs/clips/ClipCard.tsx` (5,549 lines), `src/App.tsx` (2,507 lines)
- Why: Feature growth without refactoring
- Impact: Difficult to modify, slow editor performance
- Fix approach: Extract sub-components, move logic to hooks

**Duplicate Server Files:**
- Issue: dev-api.mjs and index.mjs are near-identical
- Files: `server/dev-api.mjs`, `server/index.mjs`
- Why: Copy-paste for production deployment
- Impact: Changes require updating both files
- Fix approach: Consolidate into single file with environment-based configuration

**Excessive TypeScript `any` Usage:**
- Issue: 66+ uses of `any` type across codebase
- Files: Multiple across `src/`
- Why: Quick fixes during development
- Impact: Loss of type safety, refactoring difficulty
- Fix approach: Enable `noImplicitAny`, systematically replace with proper types

## Known Bugs

**Missing UI Updates After Generation:**
- Symptoms: Gallery doesn't refresh after image/logo generation
- Trigger: Generate image via AI assistant
- Files: `src/components/assistant/DataStreamHandler.tsx` lines 36, 37, 49, 61, 70
- Workaround: Manual page refresh
- Root cause: TODO comments indicate missing notification and reload logic

## Security Considerations

**CORS Allows All Origins:**
- Risk: Any origin can make requests to API
- Files: `server/dev-api.mjs` line 65: `app.use(cors())`
- Current mitigation: Clerk authentication required for sensitive endpoints
- Recommendations: Configure CORS to accept only trusted origins from `CORS_ORIGIN` env var

**Missing Input Validation:**
- Risk: Invalid data could cause errors or injection
- Files: `server/dev-api.mjs` - various POST endpoints lack Zod schemas
- Current mitigation: Basic existence checks
- Recommendations: Implement Zod validation middleware (Phase 2 in REFACTORING_PLAN)

**Unsafe SQL Pattern:**
- Risk: Potential SQL injection if column names become user-controlled
- Files: `server/dev-api.mjs` lines 1340-1365 uses `sql.unsafe(selectColumns)`
- Current mitigation: Column names currently hardcoded (SAFE)
- Recommendations: Document risk, consider parameterized approach

## Performance Bottlenecks

**In-Memory Rate Limiting:**
- Problem: Rate limiter uses JavaScript Map, not scalable
- Files: `server/dev-api.mjs` lines 136-156
- Measurement: Resets on server restart, single-instance only
- Cause: No Redis integration for rate limiting
- Improvement path: Use `@upstash/ratelimit` with Redis (Phase 5 in REFACTORING_PLAN)

**Single Unified Data Load:**
- Problem: `/api/db/init` fetches all data in one request
- Files: `server/dev-api.mjs` line ~480
- Measurement: Good for latency, but large payload
- Cause: Optimization for cold start
- Improvement path: Already optimized; consider pagination for galleries

## Fragile Areas

**Rate Limiter Memory Leak:**
- Files: `server/dev-api.mjs` lines 136-156
- Why fragile: Map entries never cleaned up
- Common failures: Memory growth over time
- Safe modification: Migrate to Redis-based solution
- Test coverage: None

**Error Handling Consistency:**
- Files: All API routes in `server/dev-api.mjs`
- Why fragile: Different error response formats across endpoints
- Common failures: Frontend parsing errors inconsistently
- Safe modification: Add global error handler middleware
- Test coverage: None

**Promise.all Error Handling:**
- Files: `server/dev-api.mjs` line 481 (init endpoint), similar elsewhere
- Why fragile: If one query fails, entire request fails
- Common failures: Partial data loss
- Safe modification: Use `Promise.allSettled()` for resilience
- Test coverage: None

## Scaling Limits

**In-Memory Rate Limiter:**
- Current capacity: Single server instance only
- Limit: Cannot scale to multiple instances
- Symptoms at limit: Rate limits don't share across instances
- Scaling path: Redis-based rate limiting

**Database Connection:**
- Current capacity: Neon serverless handles scaling
- Limit: HTTP-based, may have cold starts
- Scaling path: Connection caching already enabled

## Dependencies at Risk

**None identified as critical risks**

Dependencies are recent versions with active maintenance:
- React 19, Express 5, Vitest 4 - all actively maintained
- AI SDKs - Google, OpenRouter actively updating
- Clerk - enterprise-grade, well-maintained

## Missing Critical Features

**Structured Logging:**
- Problem: 500+ console.log statements, no structured format
- Files: Throughout `server/dev-api.mjs` and `src/`
- Current workaround: Search logs manually
- Blocks: Production debugging, log aggregation
- Implementation complexity: Medium (Phase 1 in REFACTORING_PLAN)

**API Input Validation:**
- Problem: No Zod schemas on API endpoints
- Files: All POST routes in `server/dev-api.mjs`
- Current workaround: Basic existence checks
- Blocks: Data integrity, clear error messages
- Implementation complexity: Medium (Phase 2 in REFACTORING_PLAN)

**Database Transactions:**
- Problem: Multi-step operations lack atomicity
- Files: Campaign deletion (lines 2880-2901), gallery operations
- Current workaround: None (partial failures possible)
- Blocks: Data consistency guarantees
- Implementation complexity: Low (use `sql.transaction()`)

## Test Coverage Gaps

**API Endpoints:**
- What's not tested: All routes in `server/dev-api.mjs`
- Risk: Regressions in critical business logic
- Priority: High
- Difficulty to test: Need test database, mock external services

**Campaign Generation Flow:**
- What's not tested: AI generation → storage → database flow
- Risk: Integration failures undetected
- Priority: High
- Difficulty to test: Complex mock setup for AI services

**Scheduled Publishing:**
- What's not tested: BullMQ job execution, Instagram API integration
- Risk: Scheduled posts may fail silently
- Priority: Medium
- Difficulty to test: Need mock Redis, mock Instagram API

---

## Existing Documentation

The codebase already has a comprehensive `docs/REFACTORING_PLAN.md` that identifies:
- Phase 0: Documentation ✅
- Phase 1: Logging infrastructure
- Phase 2: Zod validation
- Phase 3: Layered architecture
- Phase 4: Gradual migration
- Phase 5: Redis rate limiting

**Current Progress:** Phase 0 complete (20% total)

---

*Concerns audit: 2026-01-26*
*Update as issues are fixed or new ones discovered*
