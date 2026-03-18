# Fase 5 Wave 4 Backlog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar BACK-01 a BACK-10 no branch `producao` com zero erros em `tsc --noEmit` e zero falhas em `npx vitest run`.

**Architecture:** Backend primeiro para endurecimento de segurança e consolidação de utilitários compartilhados. Frontend depois, respeitando a arquitetura atual do app e preservando mudanças locais já presentes no worktree.

**Tech Stack:** Express, Better Auth, Helmet, Sharp, SWR, React 19, Vitest, Testing Library, Lucide React.

---

### Task 1: Baseline e testes backend de segurança

**Files:**
- Modify: `server/app.ts`
- Modify: `server/routes/admin.ts`
- Modify: `server/routes/upload.ts`
- Modify: `server/routes/health.ts`
- Modify: `server/routes/init.ts`
- Modify: `server/lib/auth.ts`
- Test: `server/__tests__/security-routes.test.ts`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement minimal backend fixes**
- [ ] **Step 4: Run targeted tests to verify they pass**
- [ ] **Step 5: Commit**

### Task 2: Proxy video, upload compression e gallery query

**Files:**
- Modify: `server/services/upload-service.ts`
- Modify: `server/services/gallery-service.ts`
- Modify: `server/routes/ai-image.ts`
- Modify: `server/routes/upload.ts`
- Test: `server/services/__tests__/upload-service.test.ts`
- Test: `server/services/__tests__/gallery-service.test.ts`

- [ ] **Step 1: Write failing service tests**
- [ ] **Step 2: Run tests to verify failures**
- [ ] **Step 3: Implement minimal service changes**
- [ ] **Step 4: Run targeted tests to verify they pass**
- [ ] **Step 5: Commit**

### Task 3: SWR, lazy loading e acessibilidade

**Files:**
- Modify: `src/hooks/useAppData.tsx`
- Modify: `src/main-app-controller.tsx` or the actual route/view loading entrypoint in current architecture
- Modify: `src/Router.tsx` if that is the active loading boundary
- Modify: dialog/modal components and image/icon button hotspots discovered during implementation
- Test: `src/**/__tests__/*` targeted to changed behavior

- [ ] **Step 1: Write failing frontend tests for cache/lazy/a11y hotspots**
- [ ] **Step 2: Run tests to verify failures**
- [ ] **Step 3: Implement minimal frontend changes**
- [ ] **Step 4: Run targeted tests to verify they pass**
- [ ] **Step 5: Commit**

### Task 4: Icon compatibility migration

**Files:**
- Modify: `src/components/common/Icon.tsx`
- Modify: callers only when explicit a11y or compatibility gaps require it
- Test: `src/components/common/__tests__/Icon.test.tsx`

- [ ] **Step 1: Write failing icon compatibility tests**
- [ ] **Step 2: Run tests to verify failures**
- [ ] **Step 3: Replace inline SVG implementation with `lucide-react` compatibility layer**
- [ ] **Step 4: Run targeted tests to verify they pass**
- [ ] **Step 5: Commit**

### Task 5: Final verification

**Files:**
- Verify only

- [ ] **Step 1: Run `npx tsc --noEmit`**
- [ ] **Step 2: Fix remaining type errors**
- [ ] **Step 3: Run `npx vitest run`**
- [ ] **Step 4: Fix remaining test failures**
- [ ] **Step 5: Summarize commits and verification**

## Execution Choice

Usuário já pediu execução imediata no mesmo fluxo, então este plano seguirá em execução inline nesta sessão.
