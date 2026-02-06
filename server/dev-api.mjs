/**
 * Dev API bootstrap.
 *
 * Keeps the existing `bun run dev:api` and `bun run dev:api:debug` commands
 * while delegating to the unified server implementation in `index.mjs`.
 */

import "./index.mjs";
