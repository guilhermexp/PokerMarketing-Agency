# CHANGELOG

## Conventional Commit History

### feat
- `feat(api): add response envelope middleware with Zod contracts and OpenAPI docs`
- `feat(stores): expand uiStore with theme and error`
- `feat(stores): add tournament-store for schedules/flyers`
- `feat(stores): add chat-store for assistant state`
- `feat(auth): add Redis secondaryStorage for Better Auth sessions`
- `feat(api): standardize response envelopes`
- `feat(server): validate critical routes with zod`
- `feat: validate server env on startup`
- `feat: Enable job queue in production`
- `feat: add generation update endpoint and async video generation handling`
- `feat: add video playground routes and refactor video studio component`

### fix
- `fix: cleanup lint warnings — remove unused imports, props, and console.log`
- `fix: remove unused imports, fix hook deps, downgrade debug logs`
- `fix: enforce no explicit any types`
- `fix: enable strict mode in tsconfig`
- `fix: increase Gemini SDK timeout to 120s and retries to 3`
- `fix: force fresh npm install to get latest dependencies`
- `fix: use bun runtime in railway.toml to match Dockerfile`
- `fix: address CodeRabbit review findings for video-playground`

### refactor
- `refactor(controller): extract handlers to 8 custom hooks`
- `refactor(server): migrate batch 10 (routes & entrypoints) to TypeScript`
- `refactor(server): migrate batch 9 (helpers & agent) to TypeScript`
- `refactor(server): migrate batch 8 (AI modules) to TypeScript`
- `refactor(server): migrate batch 7 (services) to TypeScript`
- `refactor(server): migrate batch 6 (schemas) to TypeScript`
- `refactor(server): migrate batch 5 (auth & access control) to TypeScript`
- `refactor(server): migrate batch 4 (middleware) to TypeScript`
- `refactor(server): migrate batch 3 (database layer) to TypeScript`
- `refactor(server): migrate batch 2 to TypeScript`
- `refactor(server): setup TypeScript + migrate batch 1 to TypeScript`
- `refactor(controller): cleanup unused imports`
- `refactor(controller): use campaigns-store isGenerating`
- `refactor(app): split dashboard views into lazy routes`
- `refactor(app): move app domains into zustand stores`
- `refactor(server): extract route domain logic into services`
- `refactor: remove stores barrel export`
- `refactor: make conditional rendering explicit`
- `refactor: replace default exports with named exports`

### test
- `test(upload): enable security integration suite`
- `test(server): cover critical route handlers`
- `test: update store import after barrel removal`

### docs
- `docs: document lucide-react bundle analysis (PERF-01)`
- `docs: add current project state document`
- `docs: add project overview document`

### chore
- `chore: cleanup stale config files and fix minor type issues`
- `chore: configure conventional commits`
- `chore: bump version to 1.0.0 to force Docker cache invalidation`

### ci
- `ci: add continuous integration workflow`

## Notes

- O agrupamento acima considera os commits com padrão conventional commit presentes no histórico atual da branch `producao`.
- Commits legados sem prefixo padronizado ficaram fora deste changelog resumido.
